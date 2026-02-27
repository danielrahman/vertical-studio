function createLogger(context = 'app') {
  function log(level, message, meta = {}) {
    const payload = {
      timestamp: new Date().toISOString(),
      level,
      context,
      message,
      ...meta
    };

    const serialized = JSON.stringify(payload);
    if (level === 'error') {
      console.error(serialized);
      return;
    }

    console.log(serialized);
  }

  return {
    info: (message, meta) => log('info', message, meta),
    warn: (message, meta) => log('warn', message, meta),
    error: (message, meta) => log('error', message, meta)
  };
}

module.exports = {
  createLogger
};
