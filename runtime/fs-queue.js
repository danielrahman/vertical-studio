const fs = require('fs');
const path = require('path');

class FSQueue {
  constructor(paths, logger) {
    this.paths = paths;
    this.logger = logger;
  }

  enqueue(message, options = {}) {
    const dedupe = options.dedupe !== false;

    if (!message || !message.jobId) {
      throw new Error('Queue message must include jobId');
    }

    if (dedupe && this.hasJob(message.jobId)) {
      return { enqueued: false, deduped: true };
    }

    const fileName = `${Date.now()}-${message.jobId}.json`;
    const pendingPath = path.join(this.paths.queuePendingDir, fileName);
    fs.writeFileSync(pendingPath, JSON.stringify({ ...message, enqueuedAt: new Date().toISOString() }, null, 2));

    return { enqueued: true, fileName };
  }

  dequeue(workerId = 'worker') {
    const files = fs
      .readdirSync(this.paths.queuePendingDir)
      .filter((file) => file.endsWith('.json'))
      .sort((a, b) => a.localeCompare(b));

    for (const file of files) {
      const pendingPath = path.join(this.paths.queuePendingDir, file);
      const inflightFile = `${file}.lock-${workerId}`;
      const inflightPath = path.join(this.paths.queueInflightDir, inflightFile);

      try {
        fs.renameSync(pendingPath, inflightPath);
        const raw = JSON.parse(fs.readFileSync(inflightPath, 'utf8'));
        return {
          message: raw,
          receipt: {
            inflightPath,
            inflightFile
          }
        };
      } catch (error) {
        if (error.code === 'ENOENT') {
          continue;
        }

        this.logger &&
          this.logger.warn('Failed to dequeue queue item', {
            file,
            error: error.message
          });
      }
    }

    return null;
  }

  ack(receipt) {
    if (!receipt || !receipt.inflightPath) {
      return;
    }

    if (fs.existsSync(receipt.inflightPath)) {
      fs.unlinkSync(receipt.inflightPath);
    }
  }

  hasJob(jobId) {
    const matcher = `-${jobId}.json`;
    const inPending = fs
      .readdirSync(this.paths.queuePendingDir)
      .some((file) => file.includes(matcher));

    if (inPending) {
      return true;
    }

    return fs
      .readdirSync(this.paths.queueInflightDir)
      .some((file) => file.includes(matcher));
  }

  recoverInflight() {
    const inflightFiles = fs
      .readdirSync(this.paths.queueInflightDir)
      .filter((file) => file.endsWith('.json') || file.includes('.json.lock-'));

    const recoveredJobIds = [];

    for (const file of inflightFiles) {
      const inflightPath = path.join(this.paths.queueInflightDir, file);
      try {
        const message = JSON.parse(fs.readFileSync(inflightPath, 'utf8'));
        const enqueued = this.enqueue(
          {
            jobId: message.jobId,
            jobType: message.jobType || 'generation'
          },
          { dedupe: true }
        );
        if (enqueued.enqueued || enqueued.deduped) {
          recoveredJobIds.push(message.jobId);
        }
      } catch (error) {
        this.logger &&
          this.logger.warn('Failed to recover inflight queue item', {
            file,
            error: error.message
          });
      } finally {
        if (fs.existsSync(inflightPath)) {
          fs.unlinkSync(inflightPath);
        }
      }
    }

    return recoveredJobIds;
  }

  stats() {
    const pending = fs.readdirSync(this.paths.queuePendingDir).filter((file) => file.endsWith('.json')).length;
    const inflight = fs.readdirSync(this.paths.queueInflightDir).length;

    return {
      pending,
      inflight
    };
  }
}

module.exports = {
  FSQueue
};
