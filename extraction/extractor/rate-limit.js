function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function randomJitter(max) {
  if (!max || max <= 0) {
    return 0;
  }
  return Math.floor(Math.random() * (max + 1));
}

class HostRateLimiter {
  constructor(options = {}) {
    this.minDelayMs = Math.max(0, Number(options.minDelayMs || 150));
    this.jitterMs = Math.max(0, Number(options.jitterMs || 40));
    this.cooldownCapMs = Math.max(0, Number(options.cooldownCapMs || 2000));
    this.lastByHost = new Map();
    this.cooldownByHost = new Map();
  }

  getHost(urlStr) {
    return new URL(urlStr).host;
  }

  async wait(urlStr, extraDelayMs = 0) {
    let host;
    try {
      host = this.getHost(urlStr);
    } catch (_error) {
      return;
    }

    const now = Date.now();
    const last = this.lastByHost.get(host) || 0;
    const elapsed = now - last;
    const cooldown = this.cooldownByHost.get(host) || 0;
    const targetDelay = Math.max(this.minDelayMs, Number(extraDelayMs || 0), cooldown) + randomJitter(this.jitterMs);
    const waitMs = Math.max(0, targetDelay - elapsed);

    if (waitMs > 0) {
      await sleep(waitMs);
    }

    this.lastByHost.set(host, Date.now());
  }

  registerStatus(urlStr, status) {
    let host;
    try {
      host = this.getHost(urlStr);
    } catch (_error) {
      return;
    }

    const numericStatus = Number(status || 0);
    if (numericStatus === 429 || numericStatus === 503) {
      const previous = this.cooldownByHost.get(host) || 0;
      const next = previous ? Math.min(this.cooldownCapMs, previous * 2) : 250;
      this.cooldownByHost.set(host, next);
      return;
    }

    if (numericStatus > 0 && numericStatus < 500) {
      this.cooldownByHost.set(host, 0);
    }
  }
}

module.exports = {
  HostRateLimiter
};
