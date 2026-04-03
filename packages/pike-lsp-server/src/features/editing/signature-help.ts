/**
 * Signature Help Handler
 *
 * Provides function parameter hints for Pike code.
 */

import {
  Connection,
  ParameterInformation,
  SignatureHelp,
  SignatureInformation,
  TextDocuments,
} from 'vscode-languageserver/node.js';
import { TextDocument } from 'vscode-languageserver-textdocument';
import type {
  IntrospectedSymbol,
  PikeFunctionType,
  PikeMethod,
  PikeSymbol,
} from '@pike-lsp/pike-bridge';
import type { Services } from '../../services/index.js';
import { formatPikeType } from '../utils/pike-type-formatter.js';
import { uriToFsPath } from '../../utils/uri-path.js';
import { resolveCallContextAtOffset } from '../navigation/call-context-resolver.js';

/**
 * Register signature help handler.
 */
export function registerSignatureHelpHandler(
  connection: Connection,
  services: Services,
  documents: TextDocuments<TextDocument>
): void {
  const { logger, documentCache, stdlibIndex } = services;

  /**
   * Signature help handler - show function parameters
   */
  connection.onSignatureHelp(async (params): Promise<SignatureHelp | null> => {
    const bridge = services.bridge;
    const uri = params.textDocument.uri;
    const document = documents.get(uri);
    const cached = documentCache.get(uri);

    if (!document || !cached) {
      return null;
    }

    const text = document.getText();
    const offset = document.offsetAt(params.position);

    const callContext = resolveCallContextAtOffset(text, offset);
    if (!callContext) {
      return null;
    }

    const funcName = callContext.target.name;
    const paramIndex = callContext.activeParameter;
    let funcSymbol: PikeSymbol | null = null;

    // Check if this is a qualified stdlib symbol
    if (
      callContext.target.memberOperator === '.' &&
      callContext.target.expression.includes('.') &&
      !callContext.target.expression.includes('->') &&
      stdlibIndex
    ) {
      const expression = callContext.target.expression;
      const lastDotIndex = expression.lastIndexOf('.');
      const modulePath = expression.substring(0, lastDotIndex);
      const symbolName = expression.substring(lastDotIndex + 1);

      logger.debug('Signature help for qualified symbol', { modulePath, symbolName });

      try {
        const currentFile = uriToFsPath(uri);
        const module = await stdlibIndex.getModule(modulePath);

        if (module?.symbols && module.symbols.has(symbolName)) {
          funcSymbol = findMethodFromModuleSymbols(module.symbols, symbolName);

          const targetPath = module.resolvedPath
            ? module.resolvedPath
            : bridge
              ? await bridge.resolveModule(modulePath, currentFile)
              : null;

          if (targetPath) {
            const cleanPath = targetPath.split(':')[0] ?? targetPath;
            const targetUri = `file://${cleanPath}`;

            const targetCached = documentCache.get(targetUri);
            if (targetCached) {
              funcSymbol = findSymbolByName(targetCached.symbols, symbolName) ?? null;
            }
          }
        }
      } catch (err) {
        logger.debug('Error resolving stdlib symbol', {
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }

    // Fallback: search in current document
    if (!funcSymbol) {
      const methodMatches = cached.symbols.filter(s => s.name === funcName && s.kind === 'method');
      funcSymbol =
        methodMatches.find(s => !(s as { inherited?: boolean }).inherited) ??
        methodMatches[0] ??
        null;
    }

    if (!funcSymbol) {
      return null;
    }

    // Build signature
    const params_list: ParameterInformation[] = [];
    const methodSymbol = funcSymbol as {
      argNames?: string[];
      argTypes?: unknown[];
      returnType?: unknown;
    };
    const argNames: string[] = methodSymbol.argNames ?? [];
    const argTypes: unknown[] = methodSymbol.argTypes ?? [];

    const returnType = formatPikeType(methodSymbol.returnType);
    let signatureLabel = `${returnType} ${funcName}(`;

    for (let i = 0; i < argNames.length; i++) {
      const paramStr = formatSignatureParameter(argNames, argTypes, i);

      const startOffset = signatureLabel.length;
      signatureLabel += paramStr;
      const endOffset = signatureLabel.length;

      params_list.push({
        label: [startOffset, endOffset],
      });

      if (i < argNames.length - 1) {
        signatureLabel += ', ';
      }
    }
    signatureLabel += ')';

    const signature: SignatureInformation = {
      label: signatureLabel,
      parameters: params_list,
    };

    logger.debug('Signature help', { func: funcName, paramIndex, paramsCount: params_list.length });

    return {
      signatures: [signature],
      activeSignature: 0,
      activeParameter: params_list.length > 0 ? Math.min(paramIndex, params_list.length - 1) : 0,
    };
  });
}

function isVarargsType(typeObj: unknown): boolean {
  if (!typeObj) {
    return false;
  }
  if (typeof typeObj === 'string') {
    return typeObj.includes('...');
  }
  if (typeof typeObj !== 'object') {
    return false;
  }
  const record = typeObj as Record<string, unknown>;
  const name = (record['name'] ?? record['kind']) as string | undefined;
  return name === 'varargs';
}

function isOptionalType(typeObj: unknown): boolean {
  if (!typeObj) {
    return false;
  }
  if (typeof typeObj === 'string') {
    return /\bvoid\b/.test(typeObj) && typeObj.includes('|');
  }
  if (typeof typeObj !== 'object') {
    return false;
  }
  const record = typeObj as Record<string, unknown>;
  const name = (record['name'] ?? record['kind']) as string | undefined;
  if (name !== 'or') {
    return false;
  }
  const types = record['types'];
  if (!Array.isArray(types)) {
    return false;
  }
  return types.some(type => {
    if (!type || typeof type !== 'object') {
      return false;
    }
    const part = type as Record<string, unknown>;
    const partName = (part['name'] ?? part['kind']) as string | undefined;
    return partName === 'void';
  });
}

function formatSignatureParameter(argNames: string[], argTypes: unknown[], index: number): string {
  const rawName = argNames[index] ?? `arg${index + 1}`;
  const rawType = argTypes[index];
  const optional = isOptionalType(rawType);
  const varargs = isVarargsType(rawType);

  const typeName = formatPikeType(rawType)
    .replace(/\s*\|\s*void/g, '')
    .replace(/void\s*\|\s*/g, '')
    .trim();
  const normalizedType = varargs ? typeName.replace(/\.{3}\s*$/, '').trim() : typeName;

  const cleanName = rawName.replace(/^\.{3}/, '');
  const displayName = `${varargs ? '...' : ''}${cleanName}${optional ? '?' : ''}`;
  return `${normalizedType || 'mixed'} ${displayName}`;
}

/**
 * Find symbol by name in an array of symbols
 */
function findSymbolByName(symbols: PikeSymbol[], name: string): PikeSymbol | null {
  for (const symbol of symbols) {
    if (symbol.name === name) {
      return symbol;
    }
  }
  return null;
}

function findMethodFromModuleSymbols(
  symbols: Map<string, IntrospectedSymbol> | undefined,
  name: string
): PikeMethod | null {
  if (!symbols) {
    return null;
  }

  const introspected = symbols.get(name);
  if (!introspected || introspected.kind !== 'function') {
    return null;
  }

  const functionType = introspected.type as PikeFunctionType;
  if (!functionType || functionType.kind !== 'function') {
    return null;
  }

  const args = functionType.arguments ?? [];
  const argNames =
    args.length > 0 ? args.map(arg => arg.name) : (functionType.argTypes?.map(() => null) ?? []);
  const argTypes = functionType.argTypes ?? args.map(() => ({ kind: 'mixed' as const }));

  return {
    name: introspected.name,
    kind: 'method',
    modifiers: introspected.modifiers,
    argNames,
    argTypes,
    returnType: functionType.returnType,
    type: introspected.type,
    inherited: introspected.inherited,
    inheritedFrom: introspected.inheritedFrom,
    deprecated: introspected.deprecated === true || introspected.deprecated === 1,
    documentation: introspected.documentation,
  } as PikeMethod;
}
