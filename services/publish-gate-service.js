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

function isUnresolvedCritical(finding) {
  if (!finding || typeof finding !== 'object') {
    return false;
  }

  const severity = typeof finding.severity === 'string' ? finding.severity.toLowerCase() : '';
  const unresolved = finding.resolved !== true && finding.status !== 'resolved';
  return unresolved && severity === 'critical';
}

function isUnresolvedHigh(finding) {
  if (!finding || typeof finding !== 'object') {
    return false;
  }

  const severity = typeof finding.severity === 'string' ? finding.severity.toLowerCase() : '';
  const unresolved = finding.resolved !== true && finding.status !== 'resolved';
  return unresolved && severity === 'high';
}

class PublishGateService {
  evaluate({ qualityFindings = [], securityFindings = [] }) {
    const hasQualityBlocker = qualityFindings.some((finding) => isQualityP0Finding(finding));
    const hasSecurityCriticalBlocker = securityFindings.some((finding) => isUnresolvedCritical(finding));
    const hasSecurityHighBlocker = securityFindings.some((finding) => isUnresolvedHigh(finding));
    const hasSecurityBlocker = securityFindings.some((finding) => isUnresolvedCriticalOrHigh(finding));

    const securityReasonCodes = [];
    if (hasSecurityCriticalBlocker) {
      securityReasonCodes.push('security_blocked_critical');
    }
    if (hasSecurityHighBlocker) {
      securityReasonCodes.push('security_blocked_high');
    }
    if (!securityReasonCodes.length) {
      securityReasonCodes.push('security_pass_non_blocking_only');
    }

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
        reasons: [],
        securityReasonCodes
      };
    }

    let code = 'publish_blocked_quality';
    if (!hasQualityBlocker && hasSecurityBlocker) {
      code = 'publish_blocked_security';
    }

    return {
      blocked: true,
      code,
      reasons,
      securityReasonCodes
    };
  }
}

module.exports = {
  PublishGateService,
  isQualityP0Finding,
  isUnresolvedCriticalOrHigh,
  isUnresolvedCritical,
  isUnresolvedHigh
};
