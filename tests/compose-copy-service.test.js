const test = require('node:test');
const assert = require('node:assert/strict');
const { ComposeCopyService, HIGH_IMPACT_SLOTS, SINGLE_PASS_SLOTS } = require('../services/compose-copy-service');

test('compose proposals are deterministic for identical inputs', () => {
  const service = new ComposeCopyService();
  const payload = {
    siteId: 'site-1',
    draftId: 'draft-1',
    rulesVersion: '1.0.0',
    catalogVersion: '1.0.0',
    verticalStandardVersion: '2026.02'
  };

  const first = service.proposeVariants(payload);
  const second = service.proposeVariants(payload);

  assert.deepEqual(first, second);
  assert.deepEqual(
    first.variants.map((variant) => variant.variantKey),
    ['A', 'B', 'C']
  );
});

test('copy generation emits A/B/C for high-impact and SINGLE for others', () => {
  const service = new ComposeCopyService();
  const result = service.generateCopy({
    draftId: 'draft-1',
    locales: ['cs-CZ', 'en-US']
  });

  assert.equal(result.summary.highImpactSlots, HIGH_IMPACT_SLOTS.length);
  assert.equal(result.summary.slotsGenerated, HIGH_IMPACT_SLOTS.length + SINGLE_PASS_SLOTS.length);

  const expectedHighImpactPerLocale = HIGH_IMPACT_SLOTS.length;
  assert.equal(result.summary.candidateCounts.A, expectedHighImpactPerLocale * 2);
  assert.equal(result.summary.candidateCounts.B, expectedHighImpactPerLocale * 2);
  assert.equal(result.summary.candidateCounts.C, expectedHighImpactPerLocale * 2);
  assert.equal(result.summary.candidateCounts.SINGLE, SINGLE_PASS_SLOTS.length * 2);
});

test('copy generation marks candidates within limits', () => {
  const service = new ComposeCopyService();
  const result = service.generateCopy({
    draftId: 'draft-2',
    locales: ['cs-CZ', 'en-US']
  });

  assert.equal(result.candidates.some((candidate) => candidate.withinLimits === false), false);
  assert.equal(
    result.candidates.filter((candidate) => candidate.recommended && candidate.variantKey === 'B').length > 0,
    true
  );
});
