## Summary
<!-- What does this PR do? -->

## Linked Issue
Closes #

## Changes
<!-- List key changes made -->

## Acceptance Criteria
- [ ] `bun run lint` passes
- [ ] `bun run typecheck` passes
- [ ] `bun run build` passes
- [ ] `cd packages/pike-bridge && bun test` passes
- [ ] `cd packages/pike-lsp-server && bun test` passes
- [ ] Smoke tests pass
- [ ] Integration tests pass
- [ ] Pike cross-version tests pass
- [ ] VSCode e2e passes (`xvfb-run --auto-servernum bun run test:e2e`)
- [ ] New Pike files include `#pragma strict_types`
- [ ] No regex used for Pike parsing — Parser.Pike used instead
- [ ] Linked issue will be closed on merge
