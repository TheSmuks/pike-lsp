# Pike LSP API Reference

This document provides detailed API documentation for the Pike LSP server implementation.

## Table of Contents

- [Feature Modules](#feature-modules)
- [LSP Providers](#lsp-providers)
- [Services](#services)
- [Type Definitions](#type-definitions)

---

## Feature Modules

The Pike LSP server is organized into feature modules located in `packages/pike-lsp-server/src/features/`:

### Navigation Module (`navigation/`)

Provides "what is this symbol?" handlers including hover, definition, and references.

```typescript
import { registerNavigationHandlers } from '@pike-lsp/pike-lsp-server';
```

**Exports:**
- `registerHoverHandler` - Hover provider for type info and documentation
- `registerDefinitionHandlers` - Go-to-definition support
- `registerReferencesHandlers` - Find all symbol references
- `registerImplementationHandler` - Find implementations/usages

### Editing Module (`editing/`)

Provides code editing capabilities including completion, rename, and signature help.

```typescript
import { registerEditingHandlers } from '@pike-lsp/pike-lsp-server';
```

**Exports:**
- `registerCompletionHandlers` - Code completion with snippets
- `registerRenameHandler` - Safe symbol renaming
- `registerSignatureHelpHandler` - Parameter hints
- `registerLinkedEditingHandler` - Multi-cursor editing

### Advanced Module (`advanced/`)

Provides advanced editor features like formatting, code actions, and diagnostics.

```typescript
import { registerAdvancedHandlers } from '@pike-lsp/pike-lsp-server';
```

**Exports:**
- `registerFormattingHandlers` - Document and range formatting
- `registerFoldingHandlers` - Code folding regions
- `registerSemanticTokensHandler` - Semantic syntax highlighting
- `registerDocumentLinksHandler` - Clickable links in comments
- `registerCodeLensHandler` - Reference counts above functions
- `registerInlayHintsHandler` - Parameter name hints
- `registerSelectionRangesHandler` - Smart selection ranges
- `registerInlineValuesHandler` - Debug inline values
- `registerCodeActionsHandler` - Quick fixes and refactorings

### Symbols Module (`symbols.ts`)

Provides document and workspace symbol indexing.

```typescript
import { registerSymbolsHandlers } from '@pike-lsp/pike-lsp-server';
```

### Diagnostics Module (`diagnostics/`)

Provides real-time error detection and validation.

```typescript
import { registerDiagnosticsHandlers } from '@pike-lsp/pike-lsp-server';
```

### Hierarchy Module (`hierarchy.ts`)

Provides call and type hierarchy exploration.

```typescript
import { registerHierarchyHandlers } from '@pike-lsp/pike-lsp-server';
```

### Roxen Module (`roxen/`)

Provides Roxen framework-specific support.

```typescript
import { registerRoxenHandlers, detectRoxenModule } from '@pike-lsp/pike-lsp-server';
```

### RXML Module (`rxml/`)

Provides RXML template support.

```typescript
import { registerRXMLHandlers } from '@pike-lsp/pike-lsp-server';
```

---

## LSP Providers

### Hover Provider

Provides type information and documentation on cursor hover.

**Location:** `features/navigation/hover.ts`

**Handler:** `connection.onHover`

**Returns:** `Hover` with Markdown or PlainText content

### Completion Provider

Provides code completion suggestions with context awareness.

**Location:** `features/editing/completion.ts`

**Handler:** `connection.onCompletion`

**Returns:** `CompletionList` with items

**Features:**
- Keyword completion
- Symbol completion (variables, functions, classes)
- Snippet completion
- Path completion
- AutoDoc completion
- Roxen-specific completions (defvars, constants, RequestID members)
- RXML tag/attribute completions

**Trigger Characters:** `.`, `:`, `->`, `<`, ` `

### Definition Provider

Navigates to symbol definitions.

**Location:** `features/navigation/definition.ts`

**Handler:** `connection.onDefinition`

**Returns:** `Location | Location[]`

### References Provider

Finds all usages of a symbol.

**Location:** `features/navigation/references.ts`

**Handler:** `connection.onReferences`

**Returns:** `Location[]`

### Implementation Provider

Finds implementations of interfaces or abstract methods.

**Location:** `features/navigation/implementation.ts`

**Handler:** `connection.onImplementation`

**Returns:** `Location[]`

### Rename Provider

Safely renames symbols across the workspace.

**Location:** `features/editing/rename.ts`

**Handler:** `connection.onRenameRequest`

**Returns:** `WorkspaceEdit`

### Signature Help Provider

Provides parameter hints while typing function calls.

**Location:** `features/editing/signature-help.ts`

**Handler:** `connection.onSignatureHelp`

**Returns:** `SignatureHelp`

**Trigger Characters:** `(`, `,`

### Code Actions Provider

Provides quick fixes and refactorings.

**Location:** `features/advanced/code-actions.ts`

**Handler:** `connection.onCodeAction`

**Returns:** `CodeAction[]`

### Formatting Provider

Formats documents and code ranges.

**Location:** `features/advanced/formatting.ts`

**Handlers:**
- `connection.onDocumentFormatting`
- `connection.onDocumentRangeFormatting`

**Returns:** `TextEdit[]`

### Folding Ranges Provider

Provides code folding regions.

**Location:** `features/advanced/folding.ts`

**Handler:** `connection.onFoldingRanges`

**Returns:** `FoldingRange[]`

### Semantic Tokens Provider

Provides syntax highlighting based on semantic analysis.

**Location:** `features/advanced/semantic-tokens.ts`

**Handler:** `connection.onSemanticTokens`

**Returns:** `SemanticTokens`

### Document Links Provider

Provides clickable links in comments and strings.

**Location:** `features/advanced/document-links.ts`

**Handler:** `connection.onDocumentLinks`

**Returns:** `DocumentLink[]`

### Code Lens Provider

Provides reference counts above functions.

**Location:** `features/advanced/code-lens.ts`

**Handler:** `connection.onCodeLens`

**Returns:** `CodeLens[]`

### Inlay Hints Provider

Provides parameter name hints inline.

**Location:** `features/advanced/inlay-hints.ts`

**Handler:** `connection.onInlayHints`

**Returns:** `InlayHint[]`

### Selection Ranges Provider

Provides smart selection ranges.

**Location:** `features/advanced/selection-ranges.ts`

**Handler:** `connection.onSelectionRanges`

**Returns:** `SelectionRange[]`

### Inline Values Provider

Provides inline values for debugging.

**Location:** `features/advanced/inline-values.ts`

**Handler:** `connection.onInlineValues`

**Returns:** `InlineValue[]`

---

## Services

The LSP server uses a services container for dependency injection:

```typescript
interface Services {
  bridge: PikeBridge;
  documentCache: DocumentCache;
  stdlibIndex?: StdlibIndex;
  moduleContext: ModuleContext;
  logger: Logger;
  config: ServerConfig;
}
```

### Document Cache

Manages parsed document data:

```typescript
interface CachedDocument {
  uri: string;
  symbols: PikeSymbol[];
  tokens: PikeToken[];
  diagnostics: Diagnostic[];
  content: string;
}
```

### Pike Bridge

Communication layer with Pike analyzer:

```typescript
interface PikeBridge {
  start(): Promise<void>;
  stop(): Promise<void>;
  analyze(code: string, phases: string[], path: string): Promise<AnalyzeResult>;
  resolve(module: string): Promise<ResolvResult>;
}
```

---

## Type Definitions

### PikeSymbol

```typescript
interface PikeSymbol {
  name: string;
  kind: 'class' | 'function' | 'variable' | 'constant' | 'module' | 'method' | 'type';
  type?: string;
  documentation?: string;
  range: Range;
  selectionRange: Range;
  modifiers?: string[];
  children?: PikeSymbol[];
}
```

### AnalyzeResult

```typescript
interface AnalyzeResult {
  parse?: {
    symbols: PikeSymbol[];
    diagnostics: Diagnostic[];
  };
  tokenize?: {
    tokens: PikeToken[];
  };
}
```

---

## Usage Example

```typescript
import { createConnection, TextDocuments } from 'vscode-languageserver/node';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { registerNavigationHandlers } from '@pike-lsp/pike-lsp-server';
import { registerEditingHandlers } from '@pike-lsp/pike-lsp-server';
import { registerAdvancedHandlers } from '@pike-lsp/pike-lsp-server';

const connection = createConnection();
const documents = new TextDocuments(TextDocument);

const services = {
  bridge: new PikeBridge(),
  documentCache: new Map(),
  logger: new Logger(),
  config: new ServerConfig()
};

registerNavigationHandlers(connection, services, documents);
registerEditingHandlers(connection, services, documents);
registerAdvancedHandlers(connection, services, documents);

documents.listen(connection);
connection.listen();
```

---

## Error Handling

All providers include try/catch blocks with logging fallback:

```typescript
connection.onHover(async (params): Promise<Hover | null> => {
  try {
    // Handler logic
    return result;
  } catch (err) {
    logger.error('Hover failed', { error: err instanceof Error ? err.message : String(err) });
    return null;
  }
});
```
