function isQualityP0Finding(finding) {
  if (!finding || typeof finding !== 'object') {
    return false;
  }

  if (finding.blocking === true) {
    return true;
  }

  if (typeof finding.severity === 'string' && finding.severity.toUpperCase() === 'P0') {
    return true;
  }

  if (typeof finding.ruleId === 'string' && finding.ruleId.includes('-P0-')) {
    return true;
  }

  return false;
}

function isUnresolvedCriticalOrHigh(finding) {
  if (!finding || typeof finding !== 'object') {
    return false;
  }

  const severity = typeof finding.severity === 'string' ? finding.severity.toLowerCase() : '';
  const unresolved = finding.resolved !== true && finding.status !== 'resolved';
  return unresolved && (severity === 'critical' || severity === 'high');
}

class PublishGateService {
  evaluate({ qualityFindings = [], securityFindings = [] }) {
    const hasQualityBlocker = qualityFindings.some((finding) => isQualityP0Finding(finding));
    const hasSecurityBlocker = securityFindings.some((finding) => isUnresolvedCriticalOrHigh(finding));

    const reasons = [];
    if (hasQualityBlocker) {
      reasons.push('quality_p0_failed');
    }
    if (hasSecurityBlocker) {
      reasons.push('security_high_found');
    }

    if (!reasons.length) {
      return {
        blocked: false,
        reasons: []
      };
    }

    let code = 'publish_blocked_quality';
    if (!hasQualityBlocker && hasSecurityBlocker) {
      code = 'publish_blocked_security';
    }

    return {
      blocked: true,
      code,
      reasons
    };
  }
}

module.exports = {
  PublishGateService,
  isQualityP0Finding,
  isUnresolvedCriticalOrHigh
};
