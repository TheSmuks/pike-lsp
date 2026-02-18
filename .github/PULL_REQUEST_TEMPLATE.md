## Summary
<!-- Required: What does this PR do? 1-3 sentences. Not a list — write prose.
     Bad: "fixes stuff"
     Good: "Fixes hover type resolution for inherited Pike methods by correcting
            the symbol table lookup order in packages/pike-lsp-server/src/hover.ts" -->

## Linked Issue
<!-- Required: must be Closes #N, Fixes #N, or Resolves #N -->
Closes #

## Root Cause
<!-- Required: What was the underlying cause of the problem?
     Agents: do not skip this. It proves you understood the issue, not just patched it. -->

## Changes
<!-- Required: One bullet per file changed. Explain WHY not just WHAT.
     Bad: "- hover.ts: fixed bug"
     Good: "- packages/pike-lsp-server/src/hover.ts: corrected symbol lookup to
              check inherited scope chain before returning null" -->

## Verification
<!-- Required: What did you run locally and what was the result?
     List the actual commands and their outcomes.
     CI will verify independently — this is for human reviewers to understand
     what you checked and how. -->

## Notes for Reviewer
<!-- Optional: Anything unusual, tradeoffs made, follow-up issues created, etc. -->
