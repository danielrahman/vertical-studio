const { LocalStorageAdapter } = require('./local-storage-adapter');
const { S3CloudflareStorageAdapter } = require('./s3-cloudflare-storage-adapter');

function createStorageAdapters(options = {}) {
  return {
    local: options.local || new LocalStorageAdapter(options),
    's3-cloudflare': options.s3Cloudflare || new S3CloudflareStorageAdapter(options)
  };
}

module.exports = {
  createStorageAdapters
};
