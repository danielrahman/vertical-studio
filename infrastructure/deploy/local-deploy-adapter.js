const fs = require('fs');
const path = require('path');

class LocalDeployAdapter {
  constructor(options = {}) {
    this.paths = options.paths;
    this.storage = options.storage;
  }

  deploy({ job, deploymentId, requestBaseUrl }) {
    const sourceDir = job.outputDir;
    const deployRoot = path.join(this.paths.deploymentsDir, 'local', deploymentId);
    fs.mkdirSync(deployRoot, { recursive: true });

    const artifacts = this.storage.listArtifacts(sourceDir);
    for (const artifact of artifacts) {
      const targetPath = path.join(deployRoot, artifact.name);
      fs.mkdirSync(path.dirname(targetPath), { recursive: true });
      fs.copyFileSync(artifact.path, targetPath);
    }

    const previewBase = (
      process.env.VERTICAL_UI_BASE_URL ||
      process.env.NEXT_PUBLIC_UI_BASE_URL ||
      (requestBaseUrl && requestBaseUrl.includes(':3001') ? requestBaseUrl : null) ||
      'http://localhost:3001'
    ).replace(/\/+$/, '');

    return {
      status: 'completed',
      previewUrl: `${previewBase}/preview/${job.jobId}`,
      productionUrl: null,
      message: 'Local deployment prepared successfully.',
      metadata: {
        mode: 'local',
        deployedDir: deployRoot,
        artifacts: artifacts.map((item) => item.name)
      }
    };
  }
}

module.exports = {
  LocalDeployAdapter
};
