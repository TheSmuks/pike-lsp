import type {
  CoreDiagnostic,
  CoreDiagnosticRelatedInformation,
  CorePosition,
  CoreRange,
} from '../core/types.js';
import type {
  Diagnostic,
  DiagnosticRelatedInformation,
  Position,
  Range,
} from 'vscode-languageserver/node.js';

function toProtocolPosition(position: CorePosition): Position {
  return { line: position.line, character: position.character };
}

function toProtocolRange(range: CoreRange): Range {
  return { start: toProtocolPosition(range.start), end: toProtocolPosition(range.end) };
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

function toProtocolDiagnostic(diagnostic: CoreDiagnostic): Diagnostic {
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

export function toProtocolDiagnostics(diagnostics: readonly CoreDiagnostic[]): Diagnostic[] {
  return diagnostics.map(toProtocolDiagnostic);
}
