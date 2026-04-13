import type { Services } from '../../services/index.js';
import type {
  Connection,
  LinkedEditingRangeParams,
  LinkedEditingRanges,
  Range,
  TextDocuments,
} from 'vscode-languageserver/node.js';
import type { TextDocument } from 'vscode-languageserver-textdocument';
import { getWordAtOffsetGeneric } from '../utils/pike-identifier.js';

type LinkedEditingCapableConnection = Connection & {
  onLinkedEditingRange?: (
    handler: (params: LinkedEditingRangeParams) => LinkedEditingRanges | null
  ) => void;
};

export function registerLinkedEditingHandler(
  connection: Connection,
  services: Services,
  documents: TextDocuments<TextDocument>
): void {
  const linkedEditingConnection = connection as LinkedEditingCapableConnection;

  // Check if the connection supports linked editing ranges
  if (typeof linkedEditingConnection.onLinkedEditingRange !== 'function') {
    services.logger.warn('Linked editing ranges not supported by this LSP connection version');
    return;
  }

  linkedEditingConnection.onLinkedEditingRange(
    (params: LinkedEditingRangeParams): LinkedEditingRanges | null => {
      const uri = params.textDocument.uri;
      const cached = services.documentCache.get(uri);
      const document = documents.get(uri);

      if (!cached || !document) return null;

      // Extract word at cursor using shared utility
      const text = document.getText();
      const offset = document.offsetAt(params.position);

      const wordAtCursor = getWordAtOffsetGeneric(text, offset)?.word;
      if (!wordAtCursor) return null;

      // Find all occurrences of this word that are symbols
      const ranges: Range[] = [];

      for (const sym of cached.symbols) {
        if (sym.name === wordAtCursor && sym.position) {
          const pos = {
            line: sym.position.line - 1, // Convert to 0-indexed
            character: (sym.position.column ?? 1) - 1, // Convert to 0-indexed
          };
          const endPos = {
            line: sym.position.line - 1,
            character: (sym.position.column ?? 1) - 1 + sym.name.length,
          };
          ranges.push({
            start: pos,
            end: endPos,
          });
        }
      }

      return ranges.length > 0 ? { ranges } : null;
    }
  );
}
