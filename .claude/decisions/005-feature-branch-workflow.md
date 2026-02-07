# ADR-005: Feature Branch + PR Workflow

**Status:** active
**Area:** workflow
**Date:** 2026-02-07

## Context

Multiple agents and developers work on the codebase. Direct commits to main create conflicts and skip review.

## Decision

All changes go through feature branches with PRs. Enforced by git hooks:
- Branch naming: `type/description` (feat/, fix/, docs/, refactor/, test/, chore/, release/)
- No commits on main (blocked by hook)
- No direct push to main (blocked by hook)
- PRs required to merge to main (branch protection enabled)

### Complete Agent Workflow

```
1. git checkout -b type/description       # Create feature branch
2. <implement, test, commit>              # Work on the branch
3. git push -u origin type/description    # Push branch (pre-push runs full validation)
4. gh pr create --base main               # Create PR
5. gh pr merge <number> --squash          # Merge after checks pass
6. git checkout main && git pull          # Switch back and sync
7. git branch -d type/description         # Clean up local branch
```

Step 5 requires GitHub branch protection checks to pass first. Agents MUST NOT use `--admin` to bypass protection rules.

## Alternatives Rejected

- **Trunk-based development** - Works for small teams with CI, but agents can't self-review reliably
- **No enforcement** - Agents frequently skip protocols without hooks

## Consequences

- All work is traceable through PRs
- Parallel agents can work without conflicts (via worktrees)
- Releases go through the release skill which handles main
- Slightly more ceremony for small fixes

## Challenge Conditions

Revisit if:
- Single-developer workflow makes PRs feel like overhead
- CI is fast enough to trust trunk-based development
