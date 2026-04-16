/**
 * Bridge Analysis API Methods
 *
 * Core analysis operations: parsing, tokenization, compilation, module resolution,
 * introspection, navigation, and code analysis. Each method is a standalone function
 * that delegates JSON-RPC calls through a RequestSender interface.
 */

import type {
  PikeParseResult,
  PikeToken,
  PikeSymbol,
  PikeDiagnostic,
  AnalysisOperation,
  PreprocessorBlock,
  AnalyzeResponse,
} from './types.js';
import type { ResponseValidator } from './response-validator.js';
import {
  assertString,
  assertNumber,
  assertBoolean,
  assertStringArray,
} from './response-validator.js';

/**
 * Minimal interface for delegating JSON-RPC requests.
 * Decouples analysis methods from the full PikeBridge class.
 */
export interface RequestSender {
  sendRequest<T>(
    method: string,
    params: Record<string, unknown>,
    validate?: ResponseValidator<T>
  ): Promise<T>;
}

/**
 * Interface for code preprocessing (conditional defines).
 */
export interface CodePreprocessor {
  applyConditionalDefinesToCode(code: string): string;
}

/** Combined context for analysis methods that need both request sending and code preprocessing. */
export type AnalysisContext = RequestSender & CodePreprocessor;

// --- Core parsing and compilation ---

export async function parse(
  ctx: AnalysisContext,
  code: string,
  filename?: string
): Promise<PikeParseResult> {
  const effectiveCode = ctx.applyConditionalDefinesToCode(code);
  const result = await ctx.sendRequest<{
    symbols: PikeSymbol[];
    diagnostics: PikeDiagnostic[];
  }>('parse', {
    code: effectiveCode,
    filename: filename ?? 'input.pike',
    line: 1,
  });

  return {
    symbols: result.symbols,
    diagnostics: result.diagnostics,
  };
}

export async function tokenize(ctx: AnalysisContext, code: string): Promise<PikeToken[]> {
  const effectiveCode = ctx.applyConditionalDefinesToCode(code);
  const result = await ctx.sendRequest<{ tokens: PikeToken[] }>('tokenize', {
    code: effectiveCode,
  });

  return result.tokens;
}

export async function compile(
  ctx: AnalysisContext,
  code: string,
  filename?: string
): Promise<PikeParseResult> {
  const effectiveCode = ctx.applyConditionalDefinesToCode(code);
  const result = await ctx.sendRequest<{
    symbols: PikeSymbol[];
    diagnostics: PikeDiagnostic[];
  }>('compile', {
    code: effectiveCode,
    filename: filename ?? 'input.pike',
  });

  return {
    symbols: result.symbols,
    diagnostics: result.diagnostics,
  };
}

// --- Module resolution ---

export async function resolveModule(
  sender: RequestSender,
  modulePath: string,
  currentFile?: string,
  moduleResolveCache?: Map<string, string | null>
): Promise<string | null> {
  const cacheKey = `${modulePath}@@${currentFile ?? ''}`;
  if (moduleResolveCache?.has(cacheKey)) {
    const cached = moduleResolveCache.get(cacheKey);
    return cached ?? null;
  }

  const result = await sender.sendRequest<{
    path: string | null;
    exists: boolean;
  }>('resolve', {
    module: modulePath,
    currentFile: currentFile || undefined,
  });

  const resolvedPath = result.exists ? result.path : null;
  moduleResolveCache?.set(cacheKey, resolvedPath);
  return resolvedPath;
}

export async function resolveInclude(
  sender: RequestSender,
  includePath: string,
  currentFile?: string
): Promise<import('./types.js').IncludeResolveResult> {
  return sender.sendRequest<import('./types.js').IncludeResolveResult>(
    'resolve_include',
    {
      includePath,
      currentFile: currentFile || undefined,
    },
    (raw, method) => {
      const r = raw as Record<string, unknown>;
      assertString(r['path'], 'path', method);
      assertBoolean(r['exists'], 'exists', method);
      assertString(r['originalPath'], 'originalPath', method);
      return r as unknown as import('./types.js').IncludeResolveResult;
    }
  );
}

// --- Unified analysis ---

export async function analyze(
  ctx: AnalysisContext,
  code: string,
  include: AnalysisOperation[],
  filename?: string,
  documentVersion?: number
): Promise<AnalyzeResponse> {
  const effectiveCode = ctx.applyConditionalDefinesToCode(code);
  return ctx.sendRequest<AnalyzeResponse>('analyze', {
    code: effectiveCode,
    filename: filename ?? 'input.pike',
    include,
    version: documentVersion,
  });
}

// --- Stdlib and paths ---

export async function resolveStdlib(
  sender: RequestSender,
  modulePath: string,
  stdlibResolveCache?: Map<string, import('./types.js').StdlibResolveResult>
): Promise<import('./types.js').StdlibResolveResult> {
  const cached = stdlibResolveCache?.get(modulePath);
  if (cached) {
    return cached;
  }

  const result = await sender.sendRequest<import('./types.js').StdlibResolveResult>(
    'resolve_stdlib',
    {
      module: modulePath,
    }
  );

  stdlibResolveCache?.set(modulePath, result);
  return result;
}

export async function getPikePaths(
  sender: RequestSender
): Promise<import('./types.js').PikePathsResult> {
  return sender.sendRequest<import('./types.js').PikePathsResult>(
    'get_pike_paths',
    {},
    (raw, method) => {
      const r = raw as Record<string, unknown>;
      assertStringArray(r['include_paths'], 'include_paths', method);
      assertStringArray(r['module_paths'], 'module_paths', method);
      return r as unknown as import('./types.js').PikePathsResult;
    }
  );
}

export async function getInherited(
  sender: RequestSender,
  className: string
): Promise<import('./types.js').InheritedMembersResult> {
  return sender.sendRequest<import('./types.js').InheritedMembersResult>('get_inherited', {
    class: className,
  });
}

// --- Import extraction and resolution ---

export async function extractImports(
  sender: RequestSender,
  code: string,
  filename?: string
): Promise<import('./types.js').ExtractImportsResult> {
  const params: Record<string, unknown> = { code };
  if (filename) params['filename'] = filename;
  return sender.sendRequest<import('./types.js').ExtractImportsResult>('extract_imports', params);
}

export async function resolveImport(
  sender: RequestSender,
  importType: import('./types.js').ImportType,
  target: string,
  currentFile?: string
): Promise<import('./types.js').ResolveImportResult> {
  const params: Record<string, unknown> = { import_type: importType, target };
  if (currentFile) params['current_file'] = currentFile;
  return sender.sendRequest<import('./types.js').ResolveImportResult>(
    'resolve_import',
    params,
    (raw, method) => {
      const r = raw as Record<string, unknown>;
      assertString(r['path'], 'path', method);
      assertNumber(r['exists'], 'exists', method);
      return r as unknown as import('./types.js').ResolveImportResult;
    }
  );
}

// --- Dependency analysis ---

export async function checkCircular(
  sender: RequestSender,
  code: string,
  filename?: string
): Promise<import('./types.js').CircularCheckResult> {
  const params: Record<string, unknown> = { code };
  if (filename) params['filename'] = filename;
  return sender.sendRequest<import('./types.js').CircularCheckResult>('check_circular', params);
}

export async function getWaterfallSymbols(
  sender: RequestSender,
  code: string,
  filename?: string,
  maxDepth?: number
): Promise<import('./types.js').WaterfallSymbolsResult> {
  const params: Record<string, unknown> = { code };
  if (filename) params['filename'] = filename;
  if (maxDepth !== undefined) params['max_depth'] = maxDepth;
  return sender.sendRequest<import('./types.js').WaterfallSymbolsResult>(
    'get_waterfall_symbols',
    params
  );
}

// --- Debug and utility ---

export async function setDebug(
  sender: RequestSender,
  enabled: boolean
): Promise<{ debug_mode: number; message: string }> {
  return sender.sendRequest('set_debug', { enabled: enabled ? 1 : 0 }) as Promise<{
    debug_mode: number;
    message: string;
  }>;
}

// --- Navigation and refactoring ---

export async function findOccurrences(
  sender: RequestSender,
  code: string
): Promise<import('./types.js').FindOccurrencesResult> {
  return sender.sendRequest<import('./types.js').FindOccurrencesResult>('find_occurrences', {
    code,
  });
}

export async function findRenamePositions(
  sender: RequestSender,
  code: string,
  symbolName: string,
  line: number,
  character?: number,
  filename?: string
): Promise<import('./types.js').FindRenamePositionsResult> {
  return sender.sendRequest<import('./types.js').FindRenamePositionsResult>(
    'find_rename_positions',
    {
      code,
      symbolName,
      line,
      character,
      filename,
    }
  );
}

export async function prepareRename(
  sender: RequestSender,
  code: string,
  line: number,
  character: number,
  filename?: string
): Promise<import('./types.js').PrepareRenameResult | null> {
  return sender.sendRequest<import('./types.js').PrepareRenameResult | null>('prepare_rename', {
    code,
    line,
    character,
    filename,
  });
}

// --- Analysis utilities ---

export async function analyzeUninitialized(
  ctx: AnalysisContext,
  code: string,
  filename?: string
): Promise<import('./types.js').AnalyzeUninitializedResult> {
  const effectiveCode = ctx.applyConditionalDefinesToCode(code);
  return ctx.sendRequest<import('./types.js').AnalyzeUninitializedResult>('analyze_uninitialized', {
    code: effectiveCode,
    filename: filename ?? 'input.pike',
  });
}

export async function evaluateConstant(
  sender: RequestSender,
  expression: string,
  filename?: string
): Promise<{ success: number; value?: unknown; type?: string; error?: string }> {
  return sender.sendRequest<{ success: number; value?: unknown; type?: string; error?: string }>(
    'evaluate_constant',
    {
      expression,
      filename: filename ?? 'inline.pike',
    }
  );
}

export async function parsePreprocessorBlocks(
  sender: RequestSender,
  code: string
): Promise<{ blocks: PreprocessorBlock[] }> {
  return sender.sendRequest<{ blocks: PreprocessorBlock[] }>('parse_preprocessor_blocks', { code });
}
