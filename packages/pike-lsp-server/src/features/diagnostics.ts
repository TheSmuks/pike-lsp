export {
  registerDiagnosticsHandlers,
  convertDiagnostic,
  isDeprecatedSymbolDiagnostic,
  extractDeprecatedFromSymbols,
  buildSymbolNameIndex,
  buildSymbolPositionIndex,
  buildSymbolPositionIndexRegex,
  flattenSymbols,
  classifyChange,
  stripLineComments,
  analyzeSemantics,
  deduplicateDiagnostics,
  isSemanticAnalysisEnabled,
} from './diagnostics/index.js';

export type {
  ChangeClassification,
  SemanticAnalysisResult,
  SemanticAnalyzerOptions,
} from './diagnostics/index.js';
