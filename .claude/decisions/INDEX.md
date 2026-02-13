# Decision Index

Agents MUST consult this before starting work. Challenge any decision if context has changed.

| ID | Area | Decision | Status | File |
|----|------|----------|--------|------|
| 001 | parsing | Use Parser.Pike over regex for all code analysis | active | 001-parser-pike-over-regex.md |
| 002 | compat | Target Pike 8.0.1116 - no newer APIs | active | 002-pike-version-target.md |
| 003 | ipc | JSON-RPC over stdin/stdout for Pike bridge | active | 003-jsonrpc-stdio-bridge.md |
| 004 | monorepo | 5 package.json files must stay version-synced | active | 004-version-sync-protocol.md |
| 005 | workflow | Feature branch + PR required for all changes | active | 005-feature-branch-workflow.md |
| 006 | testing | TDD mandatory - red/green/refactor, no exceptions | active | 006-tdd-mandatory.md |
| 007 | release | Release via skill only - hooks block direct push/tag | active | 007-release-via-skill.md |
| 008 | testing | Test integrity enforced by hooks - no cheating | active | 008-test-integrity-enforcement.md |
| 009 | testing | Agent-oriented testing (Carlini protocol) | active | 009-agent-oriented-testing.md |
| 010 | workflow | Project-specific agent roles (5 specializations) | active | 010-project-agent-roles.md |
| 011 | workflow | Carlini quality standards mandatory for all new code | active | 011-carlini-quality-standards.md |
| 012 | ipc | Runtime response validation at bridge boundary | proposed | 012-bridge-response-validation.md |
| 013 | workflow | Strict type safety - no `any`, no ignored TS errors | active | 013-strict-type-safety.md |

## Challenge Protocol

To challenge a decision: read the full ADR, state what changed, propose alternative, update status to `challenged`.
