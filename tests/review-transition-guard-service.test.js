const test = require('node:test');
const assert = require('node:assert/strict');
const { ReviewTransitionGuardService } = require('../services/review-transition-guard-service');

test('accepts allowed transition with matching event', () => {
  const guard = new ReviewTransitionGuardService();
  const result = guard.evaluate({
    currentState: 'draft',
    fromState: 'draft',
    toState: 'proposal_generated',
    event: 'PROPOSALS_READY'
  });

  assert.equal(result.ok, true);
});

test('rejects disallowed transition with transition_not_allowed', () => {
  const guard = new ReviewTransitionGuardService();
  const result = guard.evaluate({
    currentState: 'draft',
    fromState: 'draft',
    toState: 'published',
    event: 'SECURITY_PASSED'
  });

  assert.equal(result.ok, false);
  assert.equal(result.reasonCode, 'transition_not_allowed');
});

test('rejects when event does not match allowed transition', () => {
  const guard = new ReviewTransitionGuardService();
  const result = guard.evaluate({
    currentState: 'draft',
    fromState: 'draft',
    toState: 'proposal_generated',
    event: 'REVIEW_STARTED'
  });

  assert.equal(result.ok, false);
  assert.equal(result.reasonCode, 'event_mismatch');
});

test('rejects missing reason for blocking transitions', () => {
  const guard = new ReviewTransitionGuardService();
  const result = guard.evaluate({
    currentState: 'quality_checking',
    fromState: 'quality_checking',
    toState: 'publish_blocked',
    event: 'QUALITY_FAILED'
  });

  assert.equal(result.ok, false);
  assert.equal(result.reasonCode, 'reason_required');
});

test('rejects stale from-state against current draft state', () => {
  const guard = new ReviewTransitionGuardService();
  const result = guard.evaluate({
    currentState: 'proposal_generated',
    fromState: 'draft',
    toState: 'proposal_generated',
    event: 'PROPOSALS_READY'
  });

  assert.equal(result.ok, false);
  assert.equal(result.reasonCode, 'state_mismatch');
});
