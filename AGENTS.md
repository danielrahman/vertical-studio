# Repository Working Rules (Persistent Context)

This file defines the default handoff flow for new Codex sessions in this repo.

## 1) Mandatory First Read
Before proposing or implementing any change, read in order:
1. `docs/status/PROJECT_STATE.md`
2. `docs/status/BACKLOG.md`
3. `docs/status/SESSION_LOG.md`
4. `docs/spec/project-spec.md`
5. `docs/plan/README.md`
6. `docs/quality/00_START_HERE.md`
7. `docs/security/README.md`

If a project has additional PRD/plan files, load them before implementation using this priority:
1. `docs/spec/*prd*.md` then `docs/spec/*plan*.md`
2. `docs/plan/*.md` (numeric order)
3. Any root-level `*PRD*.md` or `*PLAN*.md`

## 2) Source of Truth
Use `docs/status/PROJECT_STATE.md` as the canonical current-state snapshot.
If code and docs diverge, update state docs during the same task.

## 3) Task Lifecycle
For each user task:
1. Mark item in `BACKLOG.md` as `in_progress` before implementation.
2. Implement and verify.
3. Commit changes with a clear message and push current branch (unless user explicitly says not to).
4. Update `PROJECT_STATE.md` (`Done`, `In Progress`, `Next`).
5. Append one line to `SESSION_LOG.md` with date, task, result, and changed files.
6. Mark backlog item as `done` or `blocked`.

## 4) Status Vocabulary
Allowed status values:
1. `todo`
2. `in_progress`
3. `blocked`
4. `done`

## 5) Keep It Current
Do not leave a session without updating `docs/status/*` when work changed project state.

## 6) Completion Self-Review Gate (Mandatory)
Before sending a final response:
1. Re-read relevant PRD/plan/spec/quality docs for the task scope.
2. Review change set (`git diff` when available; otherwise use the touched-file list from this session) and run relevant verification (tests/lint/checks).
3. Produce an internal `SELF_REVIEW` with:
   - Completed vs requested
   - Remaining gaps vs PRD/plan acceptance
   - Risks/regressions
   - Smallest next step
4. If gaps remain and there is no blocker, continue implementation immediately.
5. Repeat review-then-continue loop up to 5 cycles maximum.
6. If acceptance is met, commit and push before final response (unless user explicitly says not to).
7. Finish only when acceptance is met, or clearly report blocker + exact required input.
