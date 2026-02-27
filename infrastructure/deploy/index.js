const { LocalDeployAdapter } = require('./local-deploy-adapter');
const { VercelDeployAdapter } = require('./vercel-deploy-adapter');
const { S3CloudflareDeployAdapter } = require('./s3-cloudflare-deploy-adapter');

function createDeployAdapters(options = {}) {
  return {
    local: options.local || new LocalDeployAdapter(options),
    vercel: options.vercel || new VercelDeployAdapter(options),
    's3-cloudflare': options.s3Cloudflare || new S3CloudflareDeployAdapter(options)
  };
}

module.exports = {
  createDeployAdapters
};
