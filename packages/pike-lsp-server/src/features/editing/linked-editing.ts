import type { Services } from '../../services/index.js';
import type {
    LinkedEditingRangeParams,
    LinkedEditingRanges,
    Range,
    TextDocuments,
} from 'vscode-languageserver/node.js';
import type { TextDocument } from 'vscode-languageserver-textdocument';

export function registerLinkedEditingHandler(
     
    connection: any,
    services: Services,
    documents: TextDocuments<TextDocument>
): void {
    // Check if the connection supports linked editing ranges
    if (typeof connection.onLinkedEditingRange !== 'function') {
        services.logger.warn('Linked editing ranges not supported by this LSP connection version');
        return;
    }

    connection.onLinkedEditingRange((params: LinkedEditingRangeParams): LinkedEditingRanges | null => {
        const uri = params.textDocument.uri;
        const cached = services.documentCache.get(uri);
        const document = documents.get(uri);

        if (!cached || !document) return null;

        // Find symbol at position by matching text content
        const text = document.getText();
        const offset = document.offsetAt(params.position);

        // Find word boundaries at cursor position
        let start = offset;
        let end = offset;
        while (start > 0 && /\w/.test(text[start - 1] ?? '')) {
            start--;
        }
        while (end < text.length && /\w/.test(text[end] ?? '')) {
            end++;
        }

        const wordAtCursor = text.slice(start, end);
        if (!wordAtCursor) return null;

        // Find all occurrences of this word that are symbols
        const ranges: Range[] = [];

        for (const sym of cached.symbols) {
            if (sym.name === wordAtCursor && sym.position) {
                const pos = {
                    line: sym.position.line - 1, // Convert to 0-indexed
                    character: (sym.position.column ?? 1) - 1 // Convert to 0-indexed
                };
                const endPos = {
                    line: sym.position.line - 1,
                    character: (sym.position.column ?? 1) - 1 + sym.name.length
                };
                ranges.push({
                    start: pos,
                    end: endPos
                });
            }
        }

        return ranges.length > 0 ? { ranges } : null;
    });
}
