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
} from './diagnostics/index.js';

export type { ChangeClassification } from './diagnostics/index.js';
