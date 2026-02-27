const { createRuntime } = require('../runtime/create-runtime');
const { JobProcessor } = require('./job-processor');

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function recoverStartupState({ jobStore, queue, logger }) {
  const inflightRecovered = queue.recoverInflight();
  const processingRecovered = jobStore.recoverProcessingJobs();

  for (const jobId of processingRecovered) {
    const job = jobStore.get(jobId);
    queue.enqueue({ jobId, jobType: (job && job.jobType) || 'generation' }, { dedupe: true });
  }

  logger.info('Worker startup recovery complete', {
    inflightRecovered: inflightRecovered.length,
    processingRecovered: processingRecovered.length
  });

  return {
    inflightRecovered,
    processingRecovered
  };
}

async function runWorker(options = {}) {
  const runtime = createRuntime({
    ...options,
    context: 'worker'
  });
  const { paths, logger, jobStore, queue, repositories, secretStore } = runtime;
  const processor =
    options.processor ||
    new JobProcessor({
      jobStore,
      queue,
      logger,
      paths,
      repositories,
      secretStore
    });
  const workerId = options.workerId || `worker-${process.pid}`;
  const pollMs = Number(process.env.VERTICAL_WORKER_POLL_MS || options.pollMs || 500);

  recoverStartupState({ jobStore, queue, logger });

  const state = { stopping: false };

  const stop = () => {
    state.stopping = true;
  };

  process.on('SIGINT', stop);
  process.on('SIGTERM', stop);

  logger.info('Worker started', { workerId, pollMs });

  while (!state.stopping) {
    const processed = await processor.processNext(workerId);
    if (!processed) {
      await sleep(pollMs);
    }
  }

  logger.info('Worker stopped', { workerId });
}

if (require.main === module) {
  runWorker().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}

module.exports = {
  runWorker,
  recoverStartupState
};
