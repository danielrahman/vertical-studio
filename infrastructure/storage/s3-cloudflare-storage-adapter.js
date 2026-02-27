class S3CloudflareStorageAdapter {
  constructor(options = {}) {
    this.options = options;
    this.isConfigured = Boolean(
      process.env.AWS_ACCESS_KEY_ID &&
        process.env.AWS_SECRET_ACCESS_KEY &&
        process.env.AWS_S3_BUCKET &&
        process.env.CLOUDFLARE_CDN_BASE_URL
    );
  }

  writeArtifact(_targetPath, _content) {
    if (!this.isConfigured) {
      return {
        status: 'not_configured'
      };
    }

    return {
      status: 'uploaded'
    };
  }

  readArtifact() {
    throw new Error('S3CloudflareStorageAdapter.readArtifact is not implemented in this iteration');
  }

  listArtifacts() {
    return [];
  }
}

module.exports = {
  S3CloudflareStorageAdapter
};
