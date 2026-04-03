/**
 * Format Handlers - Format on save, change, and type
 */

import { workspace, languages, WorkspaceEdit } from 'vscode';
import { computeFormattingWindow, isIndentationSensitiveChange } from './format-on-change';
import type { ExtensionRuntime } from './runtime';

export function registerFormatHandlers(runtime: ExtensionRuntime): void {
  const formatOnSaveDisposable = workspace.onWillSaveTextDocument(async event => {
    if (runtime.isDisposed()) return;
    const doc = event.document;
    if (!runtime.isTrackedLanguage(doc.languageId)) return;

    const config = workspace.getConfiguration('pike');
    const formatOnSave = config.get<boolean>('formatOnSave', true);
    if (!formatOnSave) return;

    const formatEdits = await runtime.getClient()?.sendRequest('textDocument/formatting', {
      textDocument: { uri: doc.uri.toString() },
      options: {
        tabSize: config.get<number>('tabSize', 2),
        insertSpaces: config.get<boolean>('insertSpaces', true),
      },
    });

    if (formatEdits && Array.isArray(formatEdits) && formatEdits.length > 0) {
      const workspaceEdit = new WorkspaceEdit();
      workspaceEdit.set(doc.uri, formatEdits);
      await workspace.applyEdit(workspaceEdit);
    }
  });
  runtime.track(formatOnSaveDisposable);

  const formatOnTypeDisposable = languages.registerOnTypeFormattingEditProvider(
    [{ language: 'pike' }, { language: 'pmod' }],
    {
      async provideOnTypeFormattingEdits(document, position, ch, options) {
        const config = workspace.getConfiguration('pike');
        const formatOnType = config.get<boolean>('formatOnType', true);
        if (!formatOnType) return [];

        return (
          runtime.getClient()?.sendRequest('textDocument/onTypeFormatting', {
            textDocument: { uri: document.uri.toString() },
            position,
            ch,
            options,
          }) ?? []
        );
      },
    },
    '\n',
    '}'
  );
  runtime.track(formatOnTypeDisposable);

  const pendingFormatTimers = new Map<string, ReturnType<typeof setTimeout>>();
  const formattingDocuments = new Set<string>();

  const autoFormatOnChangeDisposable = workspace.onDidChangeTextDocument(async event => {
    const config = workspace.getConfiguration('pike');
    const formatOnChange = config.get<boolean>('formatOnChange', true);
    if (!formatOnChange) return;

    if (runtime.isDisposed()) return;
    if (!runtime.isTrackedLanguage(event.document.languageId)) return;

    if (!isIndentationSensitiveChange(event)) return;

    const doc = event.document;
    const uriKey = doc.uri.toString();

    const existingTimer = pendingFormatTimers.get(uriKey);
    if (existingTimer) {
      clearTimeout(existingTimer);
    }

    if (formattingDocuments.has(uriKey)) {
      return;
    }

    const window = computeFormattingWindow(event);
    if (!window) return;

    const timer = setTimeout(
      async () => {
        if (runtime.isDisposed()) return;
        if (formattingDocuments.has(uriKey)) return;
        formattingDocuments.add(uriKey);

        try {
          const tabSize = config.get<number>('tabSize', 2);
          const insertSpaces = config.get<boolean>('insertSpaces', true);

          const edits = await runtime.getClient()?.sendRequest('textDocument/rangeFormatting', {
            textDocument: { uri: doc.uri.toString() },
            range: {
              start: { line: window.startLine, character: 0 },
              end: { line: window.endLine, character: Number.MAX_SAFE_INTEGER },
            },
            options: { tabSize, insertSpaces },
          });

          if (!edits || !Array.isArray(edits) || edits.length === 0) return;

          const workspaceEdit = new WorkspaceEdit();
          workspaceEdit.set(event.document.uri, edits);
          await workspace.applyEdit(workspaceEdit);
        } finally {
          formattingDocuments.delete(uriKey);
        }
      },
      config.get<number>('formatOnChangeDelay', 40)
    );

    pendingFormatTimers.set(uriKey, timer);
  });

  runtime.track(autoFormatOnChangeDisposable);

  runtime.track({
    dispose: () => {
      for (const timer of pendingFormatTimers.values()) {
        clearTimeout(timer);
      }
      pendingFormatTimers.clear();
      formattingDocuments.clear();
    },
  });
}
