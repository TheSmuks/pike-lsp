import { Connection, ErrorCodes, ResponseError, TextEdit } from 'vscode-languageserver/node.js';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { TextDocuments } from 'vscode-languageserver/node.js';
import { Logger } from '@pike-lsp/core';
import { FormattingService, formatPikeCode } from '../../services/formatting-service.js';
import type { Services } from '../../services/index.js';

export function registerFormattingHandlers(
  connection: Connection,
  services: Services,
  documents: TextDocuments<TextDocument>
): void {
  const log = new Logger('Advanced');
  const formatter = services.formattingService ?? new FormattingService();

  connection.onDocumentFormatting((params): TextEdit[] => {
    log.debug('Document formatting request', { uri: params.textDocument.uri });

    const uri = params.textDocument.uri;
    const document = documents.get(uri);

    if (!document) {
      throw new ResponseError(ErrorCodes.InvalidRequest, `Document not found: ${uri}`);
    }

    try {
      return formatter.formatDocument(document.getText(), params.options);
    } catch (err) {
      if (err instanceof ResponseError) {
        throw err;
      }
      log.error(
        `Document formatting failed for ${uri}: ${err instanceof Error ? err.message : String(err)}`
      );
      throw new ResponseError(
        ErrorCodes.InternalError,
        `Document formatting failed: ${err instanceof Error ? err.message : String(err)}`
      );
    }
  });

  connection.onDocumentRangeFormatting((params): TextEdit[] => {
    log.debug('Range formatting request', { uri: params.textDocument.uri });

    const uri = params.textDocument.uri;
    const document = documents.get(uri);

    if (!document) {
      throw new ResponseError(ErrorCodes.InvalidRequest, `Document not found: ${uri}`);
    }

    try {
      return formatter.formatRange(
        document.getText(),
        params.range.start.line,
        params.range.end.line,
        params.options
      );
    } catch (err) {
      if (err instanceof ResponseError) {
        throw err;
      }
      log.error(
        `Range formatting failed for ${uri} (lines ${params.range.start.line + 1}-${params.range.end.line + 1}): ${err instanceof Error ? err.message : String(err)}`
      );
      throw new ResponseError(
        ErrorCodes.InternalError,
        `Range formatting failed: ${err instanceof Error ? err.message : String(err)}`
      );
    }
  });
}

export { formatPikeCode };
