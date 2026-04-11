/**
 * Document Links Handler
 *
 * Provides clickable file paths in Pike code.
 */

import { Connection, DocumentLink } from 'vscode-languageserver/node.js';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { TextDocuments } from 'vscode-languageserver/node.js';
import type { Services } from '../../services/index.js';
import type { DocumentCache } from '../../services/document-cache.js';
import { Logger } from '@pike-lsp/core';
import * as path from 'path';
import * as fsSync from 'fs';
import type { InheritanceInfo } from '@pike-lsp/pike-bridge';
import { uriToFsPath } from '../../utils/uri-path.js';

/**
 * Register document links handler.
 */
export function registerDocumentLinksHandler(
  connection: Connection,
  services: Services,
  documents: TextDocuments<TextDocument>
): void {
  const { documentCache } = services;
  const log = new Logger('Advanced');

  /**
   * Document Links handler - find clickable file paths
   */
  connection.onDocumentLinks(async (params): Promise<DocumentLink[]> => {
    log.debug('Document links request', { uri: params.textDocument.uri });
    try {
      const document = documents.get(params.textDocument.uri);
      if (!document) {
        return [];
      }

      const links: DocumentLink[] = [];
      const text = document.getText();
      const lines = text.split('\n');
      const documentDir = getDocumentDirectory(params.textDocument.uri);

      // Autodoc regex: kept as known exception — autodoc parsing is a separate concern
      // (tracked separately from Parser.Pike-backed include/inherit handling).
      const docLinkRegex = /\/\/[!?]\s*@(?:file|see|link):\s*(\S+)/g;

      // Use bridge.extractImports for #include directives (handles all edge cases)
      // Falls back to cached symbols when bridge is unavailable
      const cached = documentCache.get(params.textDocument.uri);
      if (services.bridge?.bridge) {
        try {
          const imports = await services.bridge.bridge.extractImports(
            text,
            uriToFsPath(params.textDocument.uri)
          );
          for (const imp of imports.imports) {
            if (imp.type !== 'include' || !imp.path) continue;

            const link = resolveIncludePath(imp.path, documentDir, services.includePaths);
            if (!link) continue;

            // Find the character range for the include path on the source line
            const lineNum = Math.max(0, imp.line - 1);
            const line = lines[lineNum] ?? '';
            const pathStart = line.indexOf(imp.path);
            if (pathStart === -1) continue;

            links.push({
              range: {
                start: { line: lineNum, character: pathStart },
                end: { line: lineNum, character: pathStart + imp.path.length },
              },
              target: link.target,
              tooltip: link.tooltip,
            });
          }
        } catch (err) {
          log.debug('Document links: extractImports failed', {
            error: err instanceof Error ? err.message : String(err),
          });
        }
      } else if (cached?.symbols) {
        // Fallback: use cached include symbols (already parsed by Parser.Pike)
        for (const symbol of cached.symbols) {
          if (symbol.kind !== 'include' || !symbol.position) continue;
          const includePath = symbol.classname || symbol.name;
          if (!includePath) continue;

          const link = resolveIncludePath(includePath, documentDir, services.includePaths);
          if (!link) continue;

          const lineNum = Math.max(0, (symbol.position.line ?? 1) - 1);
          const line = lines[lineNum] ?? '';
          const pathStart = line.indexOf(includePath);
          if (pathStart === -1) continue;

          links.push({
            range: {
              start: { line: lineNum, character: pathStart },
              end: { line: lineNum, character: pathStart + includePath.length },
            },
            target: link.target,
            tooltip: link.tooltip,
          });
        }
      }

      // Generate inherit links from cached introspection data (not regex).
      // The cache's inherits field comes from Parser.Pike introspection and handles
      // string-path inherits, lowercase module paths, and all edge cases.
      if (cached?.inherits && cached.inherits.length > 0) {
        for (const inheritInfo of cached.inherits) {
          const link = buildInheritLink(inheritInfo, lines, documentDir, documentCache);
          if (link) {
            links.push(link);
          }
        }
      }

      // Autodoc @file/@see/@link link generation (regex-based — known exception).
      for (let lineNum = 0; lineNum < lines.length; lineNum++) {
        const line = lines[lineNum] ?? '';

        let docMatch: RegExpExecArray | null = docLinkRegex.exec(line);
        while (docMatch !== null) {
          const index = docMatch.index;
          const filePath = docMatch[1];
          if (index !== undefined && filePath) {
            if (filePath.includes('/') || filePath.includes('.')) {
              const link = resolveIncludePath(filePath, documentDir, services.includePaths);
              if (link) {
                links.push({
                  range: {
                    start: { line: lineNum, character: index },
                    end: { line: lineNum, character: index + filePath.length },
                  },
                  target: link.target,
                  tooltip: link.tooltip,
                });
              }
            }
          }

          docMatch = docLinkRegex.exec(line);
        }
        docLinkRegex.lastIndex = 0;
      }

      connection.console.log(`[DOC_LINKS] Found ${links.length} links`);
      return links;
    } catch (err) {
      log.error(
        `Document links failed for ${params.textDocument.uri}: ${err instanceof Error ? err.message : String(err)}`
      );
      return [];
    }
  });

  connection.onDocumentLinkResolve((link): DocumentLink => {
    // Links are resolved eagerly in onDocumentLinks, so resolve is identity.
    return link;
  });
}

/**
 * Resolve a module path from inherit statement to a file URI
 * @export For testing purposes
 */
export function resolveModulePath(
  modulePath: string,
  _documentDir: string,
  documentCache: DocumentCache
): { target: string; tooltip: string } | null {
  // Iterate through document cache entries
  // Case-insensitive comparison: Pike module names like 'OtherModule' may
  // correspond to files like 'other.pike' or 'OtherModule.pike'.
  const entries = Array.from(documentCache.keys());
  const lowerModulePath = modulePath.toLowerCase();
  for (const uri of entries) {
    const lowerUri = uri.toLowerCase();
    if (
      lowerUri.includes(lowerModulePath) ||
      lowerUri.endsWith(lowerModulePath + '.pike') ||
      lowerUri.endsWith(lowerModulePath + '.pmod')
    ) {
      return {
        target: uri,
        tooltip: `Navigate to ${modulePath}`,
      };
    }
  }
  return null;
}

/**
 * Build a DocumentLink from a cached InheritanceInfo entry.
 * Uses source_name to locate the inherit in the source text for range.
 * Falls back to searching for the path string if source_name is absent.
 * @export For testing purposes
 */
export function buildInheritLink(
  inheritInfo: InheritanceInfo,
  lines: string[],
  documentDir: string,
  documentCache: DocumentCache
): DocumentLink | null {
  const modulePath = inheritInfo.path;
  if (!modulePath) return null;

  const resolved = resolveModulePath(modulePath, documentDir, documentCache);
  if (!resolved) return null;

  // Use source_name (the raw text after 'inherit') to find the range in source.
  const searchText = inheritInfo.source_name || modulePath;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i] ?? '';
    const charIndex = line.indexOf(searchText);
    if (charIndex !== -1) {
      return {
        range: {
          start: { line: i, character: charIndex },
          end: { line: i, character: charIndex + searchText.length },
        },
        target: resolved.target,
        tooltip: resolved.tooltip,
      };
    }
  }

  return null;
}

/**
 * Resolve an include path to a file URI
 */
function resolveIncludePath(
  filePath: string,
  documentDir: string,
  includePaths: string[]
): { target: string; tooltip: string } | null {
  // Handle absolute paths
  if (filePath.startsWith('/')) {
    if (fsSync.existsSync(filePath)) {
      return {
        target: `file://${filePath}`,
        tooltip: filePath,
      };
    }
    return null;
  }

  // Try document directory first, then include paths
  const candidates = [
    path.resolve(documentDir, filePath),
    ...includePaths.map(includePath => path.resolve(includePath, filePath)),
  ];

  for (const candidate of candidates) {
    if (fsSync.existsSync(candidate)) {
      return {
        target: `file://${candidate}`,
        tooltip: `${filePath} → ${candidate}`,
      };
    }
  }

  // File not found - don't return a broken link
  return null;
}

/**
 * Get the directory path from a file URI
 */
function getDocumentDirectory(uri: string): string {
  const filePath = uriToFsPath(uri);
  const lastSlash = filePath.lastIndexOf('/');
  return lastSlash >= 0 ? filePath.substring(0, lastSlash) : filePath;
}
