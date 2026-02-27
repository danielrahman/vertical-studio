const TRANSITION_RULES = new Map([
  ['draft->proposal_generated', { expectedEvent: 'PROPOSALS_READY' }],
  ['proposal_generated->review_in_progress', { expectedEvent: 'REVIEW_STARTED' }],
  ['review_in_progress->proposal_selected', { expectedEvent: 'PROPOSAL_SELECTED' }],
  ['proposal_selected->quality_checking', { expectedEvent: 'QUALITY_STARTED' }],
  ['quality_checking->security_checking', { expectedEvent: 'QUALITY_PASSED' }],
  ['quality_checking->publish_blocked', { expectedEvent: 'QUALITY_FAILED', requiresReason: true }],
  ['security_checking->published', { expectedEvent: 'SECURITY_PASSED' }],
  ['security_checking->publish_blocked', { expectedEvent: 'SECURITY_FAILED', requiresReason: true }],
  ['published->rollback_pending', { expectedEvent: 'ROLLBACK_REQUESTED', requiresReason: true }],
  ['rollback_pending->rolled_back', { expectedEvent: 'ROLLBACK_COMPLETED' }]
]);

class ReviewTransitionGuardService {
  evaluate({ currentState, fromState, toState, event, reason }) {
    if (typeof currentState === 'string' && currentState !== fromState) {
      return {
        ok: false,
        reasonCode: 'state_mismatch',
        message: `Draft is currently in ${currentState}, not ${fromState}`
      };
    }

    const transitionKey = `${fromState}->${toState}`;
    const rule = TRANSITION_RULES.get(transitionKey);
    if (!rule) {
      return {
        ok: false,
        reasonCode: 'transition_not_allowed',
        message: 'Requested state transition is not allowed'
      };
    }

    if (event !== rule.expectedEvent) {
      return {
        ok: false,
        reasonCode: 'event_mismatch',
        message: `Transition ${transitionKey} requires event ${rule.expectedEvent}`
      };
    }

    if (rule.requiresReason && (typeof reason !== 'string' || !reason.trim())) {
      return {
        ok: false,
        reasonCode: 'reason_required',
        message: `Transition ${transitionKey} requires a non-empty reason`
      };
    }

    return {
      ok: true
    };
  }
}

module.exports = {
  ReviewTransitionGuardService,
  TRANSITION_RULES
};
