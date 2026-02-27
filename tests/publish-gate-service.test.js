const test = require('node:test');
const assert = require('node:assert/strict');
const { PublishGateService } = require('../services/publish-gate-service');

test('blocks publish when quality findings include P0', () => {
  const service = new PublishGateService();
  const result = service.evaluate({
    qualityFindings: [{ severity: 'P0', ruleId: 'COPY-P0-001' }],
    securityFindings: []
  });

  assert.equal(result.blocked, true);
  assert.equal(result.code, 'publish_blocked_quality');
  assert.deepEqual(result.reasons, ['quality_p0_failed']);
  assert.deepEqual(result.securityReasonCodes, ['security_pass_non_blocking_only']);
});

test('blocks publish when unresolved security finding is high/critical', () => {
  const service = new PublishGateService();
  const result = service.evaluate({
    qualityFindings: [],
    securityFindings: [{ severity: 'high', status: 'open' }]
  });

  assert.equal(result.blocked, true);
  assert.equal(result.code, 'publish_blocked_security');
  assert.deepEqual(result.reasons, ['security_high_found']);
  assert.deepEqual(result.securityReasonCodes, ['security_blocked_high']);
});

test('returns both blocking reasons when quality and security blockers coexist', () => {
  const service = new PublishGateService();
  const result = service.evaluate({
    qualityFindings: [{ ruleId: 'SEO-P0-001' }],
    securityFindings: [{ severity: 'critical', resolved: false }]
  });

  assert.equal(result.blocked, true);
  assert.deepEqual(result.reasons, ['quality_p0_failed', 'security_high_found']);
  assert.deepEqual(result.securityReasonCodes, ['security_blocked_critical']);
});

test('returns both security blocker reason codes when critical and high findings coexist', () => {
  const service = new PublishGateService();
  const result = service.evaluate({
    qualityFindings: [],
    securityFindings: [
      { severity: 'critical', status: 'open' },
      { severity: 'high', status: 'open' }
    ]
  });

  assert.equal(result.blocked, true);
  assert.equal(result.code, 'publish_blocked_security');
  assert.deepEqual(result.reasons, ['security_high_found']);
  assert.deepEqual(result.securityReasonCodes, ['security_blocked_critical', 'security_blocked_high']);
});

test('allows publish when only non-blocking findings exist', () => {
  const service = new PublishGateService();
  const result = service.evaluate({
    qualityFindings: [{ severity: 'P1', ruleId: 'COPY-P1-001' }],
    securityFindings: [{ severity: 'medium', status: 'open' }]
  });

  assert.equal(result.blocked, false);
  assert.deepEqual(result.reasons, []);
  assert.deepEqual(result.securityReasonCodes, ['security_pass_non_blocking_only']);
});
