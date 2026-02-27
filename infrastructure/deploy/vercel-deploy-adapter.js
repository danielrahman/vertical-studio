const { DeployError } = require('./errors');

class VercelDeployAdapter {
  constructor(options = {}) {
    this.token = options.token || process.env.VERCEL_TOKEN;
    this.projectId = options.projectId || process.env.VERCEL_PROJECT_ID;
    this.teamId = options.teamId || process.env.VERCEL_TEAM_ID;
  }

  deploy({ job, domain }) {
    if (!this.token || !this.projectId) {
      throw new DeployError(
        'Vercel deployment is not configured. Set VERCEL_TOKEN and VERCEL_PROJECT_ID.',
        422,
        'vercel_not_configured'
      );
    }

    const subdomain = `${this.projectId}-${job.jobId.slice(0, 8)}`.toLowerCase();
    const previewUrl = `https://${subdomain}.vercel.app`;

    return {
      status: 'submitted',
      previewUrl,
      productionUrl: domain ? `https://${domain}` : null,
      message: 'Vercel deployment request accepted (skeleton adapter mode).',
      metadata: {
        provider: 'vercel',
        mode: 'skeleton',
        teamId: this.teamId || null,
        projectId: this.projectId
      }
    };
  }
}

module.exports = {
  VercelDeployAdapter
};
