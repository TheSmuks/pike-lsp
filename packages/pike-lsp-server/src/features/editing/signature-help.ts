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

    // Find the function call context
    let parenDepth = 0;
    let funcStart = offset;
    let paramIndex = 0;

    for (let i = offset - 1; i >= 0; i--) {
      const char = text[i];
      if (char === ')') {
        parenDepth++;
      } else if (char === '(') {
        if (parenDepth === 0) {
          funcStart = i;
          break;
        }
        parenDepth--;
      } else if (char === ',' && parenDepth === 0) {
        paramIndex++;
      } else if (char === ';' || char === '{' || char === '}') {
        return null;
      }
    }

    // Get the function name before the paren
    const textBefore = text.slice(0, funcStart);
    const qualifiedMatch = textBefore.match(/([\w.]+)\s*$/);
    if (!qualifiedMatch) {
      return null;
    }

    const funcName = qualifiedMatch[1]!;
    let funcSymbol: PikeSymbol | null = null;

      // Check if this is a qualified stdlib symbol
      if (funcName.includes('.') && stdlibIndex) {
      const lastDotIndex = funcName.lastIndexOf('.');
      const modulePath = funcName.substring(0, lastDotIndex);
      const symbolName = funcName.substring(lastDotIndex + 1);

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
      funcSymbol = cached.symbols.find(s => s.name === funcName && s.kind === 'method') ?? null;
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
      const typeName = formatPikeType(argTypes[i]);
      const paramStr = `${typeName} ${argNames[i]}`;

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
      activeParameter: Math.min(paramIndex, params_list.length - 1),
    };
  });
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
    args.length > 0 ? args.map(arg => arg.name) : functionType.argTypes?.map(() => null) ?? [];
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
