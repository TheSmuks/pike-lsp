import type {
  CoreDiagnostic,
  CoreDiagnosticRelatedInformation,
  CoreDiagnosticTag,
  CorePosition,
  CoreRange,
  CoreSymbol,
  CoreTextDocumentIdentifier,
  CoreTextDocumentItem,
  CoreVersionedTextDocumentIdentifier,
} from '../core/types.js';
import type {
  Diagnostic,
  DiagnosticRelatedInformation,
  Position,
  Range,
  TextDocumentIdentifier,
  TextDocumentItem,
  VersionedTextDocumentIdentifier,
} from 'vscode-languageserver/node.js';
import type { PikeSymbol } from '@pike-lsp/pike-bridge';

export function toCorePosition(position: Position): CorePosition {
  return { line: position.line, character: position.character };
}

export function toProtocolPosition(position: CorePosition): Position {
  return { line: position.line, character: position.character };
}

export function toCoreRange(range: Range): CoreRange {
  return { start: toCorePosition(range.start), end: toCorePosition(range.end) };
}

export function toProtocolRange(range: CoreRange): Range {
  return { start: toProtocolPosition(range.start), end: toProtocolPosition(range.end) };
}

function toCoreRelatedInformation(
  info: DiagnosticRelatedInformation
): CoreDiagnosticRelatedInformation {
  return {
    location: {
      uri: info.location.uri,
      range: toCoreRange(info.location.range),
    },
    message: info.message,
  };
}

function toProtocolRelatedInformation(
  info: CoreDiagnosticRelatedInformation
): DiagnosticRelatedInformation {
  return {
    location: {
      uri: info.location.uri,
      range: toProtocolRange(info.location.range),
    },
    message: info.message,
  };
}

export function toCoreDiagnostic(diagnostic: Diagnostic): CoreDiagnostic {
  const coreDiagnostic: CoreDiagnostic = {
    range: toCoreRange(diagnostic.range),
    message: diagnostic.message,
  };

  if (diagnostic.severity !== undefined) {
    coreDiagnostic.severity = diagnostic.severity;
  }
  if (typeof diagnostic.code === 'string' || typeof diagnostic.code === 'number') {
    coreDiagnostic.code = diagnostic.code;
  }
  if (diagnostic.source !== undefined) {
    coreDiagnostic.source = diagnostic.source;
  }
  if ('data' in diagnostic) {
    coreDiagnostic.data = diagnostic.data;
  }
  if (diagnostic.tags) {
    coreDiagnostic.tags = diagnostic.tags as CoreDiagnosticTag[];
  }
  if (diagnostic.relatedInformation) {
    coreDiagnostic.relatedInformation = diagnostic.relatedInformation.map(toCoreRelatedInformation);
  }

  return coreDiagnostic;
}

export function toProtocolDiagnostic(diagnostic: CoreDiagnostic): Diagnostic {
  const protocolDiagnostic: Diagnostic = {
    range: toProtocolRange(diagnostic.range),
    message: diagnostic.message,
  };

  if (diagnostic.severity !== undefined) {
    protocolDiagnostic.severity = diagnostic.severity;
  }
  if (diagnostic.code !== undefined) {
    protocolDiagnostic.code = diagnostic.code;
  }
  if (diagnostic.source !== undefined) {
    protocolDiagnostic.source = diagnostic.source;
  }
  if (diagnostic.data !== undefined) {
    protocolDiagnostic.data = diagnostic.data;
  }
  if (diagnostic.tags) {
    protocolDiagnostic.tags = diagnostic.tags as Exclude<Diagnostic['tags'], undefined>;
  }
  if (diagnostic.relatedInformation) {
    protocolDiagnostic.relatedInformation = diagnostic.relatedInformation.map(
      toProtocolRelatedInformation
    );
  }

  return protocolDiagnostic;
}

export function toCoreDiagnostics(diagnostics: readonly Diagnostic[]): CoreDiagnostic[] {
  return diagnostics.map(toCoreDiagnostic);
}

export function toProtocolDiagnostics(diagnostics: readonly CoreDiagnostic[]): Diagnostic[] {
  return diagnostics.map(toProtocolDiagnostic);
}

export function toCoreTextDocumentIdentifier(
  identifier: TextDocumentIdentifier
): CoreTextDocumentIdentifier {
  return { uri: identifier.uri };
}

export function toProtocolTextDocumentIdentifier(
  identifier: CoreTextDocumentIdentifier
): TextDocumentIdentifier {
  return { uri: identifier.uri };
}

export function toCoreVersionedTextDocumentIdentifier(
  identifier: VersionedTextDocumentIdentifier
): CoreVersionedTextDocumentIdentifier {
  return { uri: identifier.uri, version: identifier.version };
}

export function toProtocolVersionedTextDocumentIdentifier(
  identifier: CoreVersionedTextDocumentIdentifier
): VersionedTextDocumentIdentifier {
  return { uri: identifier.uri, version: identifier.version };
}

export function toCoreTextDocumentItem(item: TextDocumentItem): CoreTextDocumentItem {
  return {
    uri: item.uri,
    languageId: item.languageId,
    version: item.version,
    text: item.text,
  };
}

export function toProtocolTextDocumentItem(item: CoreTextDocumentItem): TextDocumentItem {
  return {
    uri: item.uri,
    languageId: item.languageId,
    version: item.version,
    text: item.text,
  };
}

export function toCoreSymbol(symbol: PikeSymbol): CoreSymbol {
  return symbol;
}

export function toProtocolSymbol(symbol: CoreSymbol): PikeSymbol {
  return symbol;
}
