# TypeScript Source File Inventory

**Generated:** 2026-02-01

## Summary

| Package | Production Files |
|---------|------------------|
| packages/core | 3 |
| packages/pike-bridge | 6 |
| packages/pike-lsp-server | 56 |
| packages/vscode-pike | 4 |
| **Total** | **69** |

---

## Packages/core/src (3 files)

```
/home/smuks/OpenCode/pike-lsp/packages/core/src/errors.ts
/home/smuks/OpenCode/pike-lsp/packages/core/src/index.ts
/home/smuks/OpenCode/pike-lsp/packages/core/src/logging.ts
```

---

## Packages/pike-bridge/src (6 files)

```
/home/smuks/OpenCode/pike-lsp/packages/pike-bridge/src/bridge.ts
/home/smuks/OpenCode/pike-lsp/packages/pike-bridge/src/constants.ts
/home/smuks/OpenCode/pike-lsp/packages/pike-bridge/src/index.ts
/home/smuks/OpenCode/pike-lsp/packages/pike-bridge/src/process.ts
/home/smuks/OpenCode/pike-lsp/packages/pike-bridge/src/test.ts
/home/smuks/OpenCode/pike-lsp/packages/pike-bridge/src/types.ts
```

---

## Packages/pike-lsp-server/src (56 files)

### Root (5 files)
```
/home/smuks/OpenCode/pike-lsp/packages/pike-lsp-server/src/server.ts
/home/smuks/OpenCode/pike-lsp/packages/pike-lsp-server/src/test-server.ts
/home/smuks/OpenCode/pike-lsp/packages/pike-lsp-server/src/stdlib-index.ts
/home/smuks/OpenCode/pike-lsp/packages/pike-lsp-server/src/type-database.ts
/home/smuks/OpenCode/pike-lsp/packages/pike-lsp-server/src/workspace-index.ts
```

### benchmarks/ (1 file)
```
/home/smuks/OpenCode/pike-lsp/packages/pike-lsp-server/benchmarks/runner.ts
```

### constants/ (1 file)
```
/home/smuks/OpenCode/pike-lsp/packages/pike-lsp-server/src/constants/index.ts
```

### core/ (2 files)
```
/home/smuks/OpenCode/pike-lsp/packages/pike-lsp-server/src/core/index.ts
/home/smuks/OpenCode/pike-lsp/packages/pike-lsp-server/src/core/types.ts
```

### features/ (4 files)
```
/home/smuks/OpenCode/pike-lsp/packages/pike-lsp-server/src/features/index.ts
/home/smuks/OpenCode/pike-lsp/packages/pike-lsp-server/src/features/diagnostics.ts
/home/smuks/OpenCode/pike-lsp/packages/pike-lsp-server/src/features/symbols.ts
/home/smuks/OpenCode/pike-lsp/packages/pike-lsp-server/src/features/hierarchy.ts
```

### features/advanced/ (10 files)
```
/home/smuks/OpenCode/pike-lsp/packages/pike-lsp-server/src/features/advanced/index.ts
/home/smuks/OpenCode/pike-lsp/packages/pike-lsp-server/src/features/advanced/code-actions.ts
/home/smuks/OpenCode/pike-lsp/packages/pike-lsp-server/src/features/advanced/code-lens.ts
/home/smuks/OpenCode/pike-lsp/packages/pike-lsp-server/src/features/advanced/document-links.ts
/home/smuks/OpenCode/pike-lsp/packages/pike-lsp-server/src/features/advanced/folding.ts
/home/smuks/OpenCode/pike-lsp/packages/pike-lsp-server/src/features/advanced/formatting.ts
/home/smuks/OpenCode/pike-lsp/packages/pike-lsp-server/src/features/advanced/getters-setters.ts
/home/smuks/OpenCode/pike-lsp/packages/pike-lsp-server/src/features/advanced/inlay-hints.ts
/home/smuks/OpenCode/pike-lsp/packages/pike-lsp-server/src/features/advanced/selection-ranges.ts
/home/smuks/OpenCode/pike-lsp/packages/pike-lsp-server/src/features/advanced/semantic-tokens.ts
```

### features/editing/ (6 files)
```
/home/smuks/OpenCode/pike-lsp/packages/pike-lsp-server/src/features/editing/index.ts
/home/smuks/OpenCode/pike-lsp/packages/pike-lsp-server/src/features/editing/autodoc.ts
/home/smuks/OpenCode/pike-lsp/packages/pike-lsp-server/src/features/editing/completion.ts
/home/smuks/OpenCode/pike-lsp/packages/pike-lsp-server/src/features/editing/completion-helpers.ts
/home/smuks/OpenCode/pike-lsp/packages/pike-lsp-server/src/features/editing/rename.ts
/home/smuks/OpenCode/pike-lsp/packages/pike-lsp-server/src/features/editing/signature-help.ts
```

### features/navigation/ (5 files)
```
/home/smuks/OpenCode/pike-lsp/packages/pike-lsp-server/src/features/navigation/index.ts
/home/smuks/OpenCode/pike-lsp/packages/pike-lsp-server/src/features/navigation/definition.ts
/home/smuks/OpenCode/pike-lsp/packages/pike-lsp-server/src/features/navigation/hover.ts
/home/smuks/OpenCode/pike-lsp/packages/pike-lsp-server/src/features/navigation/references.ts
/home/smuks/OpenCode/pike-lsp/packages/pike-lsp-server/src/features/navigation/expression-utils.ts
```

### features/utils/ (3 files)
```
/home/smuks/OpenCode/pike-lsp/packages/pike-lsp-server/src/features/utils/index.ts
/home/smuks/OpenCode/pike-lsp/packages/pike-lsp-server/src/features/utils/hover-builder.ts
/home/smuks/OpenCode/pike-lsp/packages/pike-lsp-server/src/features/utils/pike-type-formatter.ts
```

### services/ (5 files)
```
/home/smuks/OpenCode/pike-lsp/packages/pike-lsp-server/src/services/index.ts
/home/smuks/OpenCode/pike-lsp/packages/pike-lsp-server/src/services/bridge-manager.ts
/home/smuks/OpenCode/pike-lsp/packages/pike-lsp-server/src/services/document-cache.ts
/home/smuks/OpenCode/pike-lsp/packages/pike-lsp-server/src/services/include-resolver.ts
/home/smuks/OpenCode/pike-lsp/packages/pike-lsp-server/src/services/workspace-scanner.ts
```

### tests/ (11 files)
```
/home/smuks/OpenCode/pike-lsp/packages/pike-lsp-server/src/tests/integration-tests.ts
/home/smuks/OpenCode/pike-lsp/packages/pike-lsp-server/src/tests/lsp-navigation-tests.ts
/home/smuks/OpenCode/pike-lsp/packages/pike-lsp-server/src/tests/lsp-new-features-tests.ts
/home/smuks/OpenCode/pike-lsp/packages/pike-lsp-server/src/tests/lsp-protocol-tests.ts
/home/smuks/OpenCode/pike-lsp/packages/pike-lsp-server/src/tests/lsp-tests.ts
/home/smuks/OpenCode/pike-lsp/packages/pike-lsp-server/src/tests/performance-tests.ts
/home/smuks/OpenCode/pike-lsp/packages/pike-lsp-server/src/tests/phase7-behavioral-tests.ts
/home/smuks/OpenCode/pike-lsp/packages/pike-lsp-server/src/tests/phase-behavioral-tests.ts
/home/smuks/OpenCode/pike-lsp/packages/pike-lsp-server/src/tests/pike-source-tests.ts
/home/smuks/OpenCode/pike-lsp/packages/pike-lsp-server/src/tests/stdlib-hover-tests.ts
/home/smuks/OpenCode/pike-lsp/packages/pike-lsp-server/src/tests/stdlib-tests.ts
```

### utils/ (3 files)
```
/home/smuks/OpenCode/pike-lsp/packages/pike-lsp-server/src/utils/code-lens.ts
/home/smuks/OpenCode/pike-lsp/packages/pike-lsp-server/src/utils/regex-patterns.ts
/home/smuks/OpenCode/pike-lsp/packages/pike-lsp-server/src/utils/validation.ts
```

---

## Packages/vscode-pike/src (4 files)

```
/home/smuks/OpenCode/pike-lsp/packages/vscode-pike/src/constants.ts
/home/smuks/OpenCode/pike-lsp/packages/vscode-pike/src/extension.ts
/home/smuks/OpenCode/pike-lsp/packages/vscode-pike/src/pike-detector.ts
/home/smuks/OpenCode/pike-lsp/packages/vscode-pike/src/test/mockOutputChannel.ts
```

---

## Exclusions

This inventory excludes:
- Test files: `*.test.ts`, `*.spec.ts`
- Declaration files: `*.d.ts`
- Build artifacts: `dist/`
- Dependencies: `node_modules/`
- Test infrastructure: `.vscode-test/`
