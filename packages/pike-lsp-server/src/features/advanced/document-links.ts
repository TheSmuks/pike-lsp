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
import type { InheritanceInfo, PikeToken } from '@pike-lsp/pike-bridge';
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

      // Use bridge.extractImports for #include directives (handles all edge cases)
      // Falls back to cached dependencies when bridge is unavailable
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
      } else if (cached?.dependencies?.includes && cached.dependencies.includes.length > 0) {
        // Fallback: use cached dependency includes (resolved by Parser.Pike via include-resolver).
        // This replaces the old regex-based #include scanning that missed angle-bracket
        // includes and trigraph edge cases.
        for (const inc of cached.dependencies.includes) {
          if (!inc.resolvedPath) continue;

          const includePath = inc.originalPath;
          const lineNum = findLineContaining(lines, includePath);
          if (lineNum === -1) continue;

          const line = lines[lineNum] ?? '';
          const pathStart = line.indexOf(includePath);
          if (pathStart === -1) continue;

          links.push({
            range: {
              start: { line: lineNum, character: pathStart },
              end: { line: lineNum, character: pathStart + includePath.length },
            },
            target: `file://${inc.resolvedPath}`,
            tooltip: `${includePath} → ${inc.resolvedPath}`,
          });
        }
      } else if (cached?.symbols) {
        // Second fallback: resolve includes from cached symbol entries via filesystem.
        // Used when bridge and cached dependencies are both unavailable.
        for (const sym of cached.symbols) {
          if (sym.kind !== 'include' || !sym.name) continue;

          const link = resolveIncludePath(sym.name, documentDir, services.includePaths);
          if (!link) continue;

          const lineNum = findLineContaining(lines, sym.name);
          if (lineNum === -1) continue;

          const line = lines[lineNum] ?? '';
          const pathStart = line.indexOf(sym.name);
          if (pathStart === -1) continue;

          links.push({
            range: {
              start: { line: lineNum, character: pathStart },
              end: { line: lineNum, character: pathStart + sym.name.length },
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

      // Autodoc @file/@see/@link link generation via bridge tokenization.
      if (services.bridge?.bridge) {
        try {
          const tokens: PikeToken[] = await services.bridge.bridge.tokenize(text);
          for (const token of tokens) {
            const isAutodoc = token.text.startsWith('//!') || token.text.startsWith('/*!');
            if (!isAutodoc) continue;

            const annotations = extractDocAnnotations(token.text);
            const lineNum = token.line - 1; // convert to 0-indexed
            const line = lines[lineNum] ?? '';

            for (const ann of annotations) {
              if (!ann.value.includes('/') && !ann.value.includes('.')) continue;

              const link = resolveIncludePath(ann.value, documentDir, services.includePaths);
              if (!link) continue;

              // Locate the annotation value in the source line for an accurate range.
              const valueStart = line.indexOf(ann.value, ann.charOffset);
              if (valueStart === -1) continue;

              links.push({
                range: {
                  start: { line: lineNum, character: valueStart },
                  end: { line: lineNum, character: valueStart + ann.value.length },
                },
                target: link.target,
                tooltip: link.tooltip,
              });
            }
          }
        } catch (err) {
          log.debug('Document links: tokenize failed for autodoc', {
            error: err instanceof Error ? err.message : String(err),
          });
        }
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
 * Find the first line containing the given text.
 * @returns 0-based line number, or -1 if not found.
 */
function findLineContaining(lines: string[], searchText: string): number {
  for (let i = 0; i < lines.length; i++) {
    if ((lines[i] ?? '').includes(searchText)) {
      return i;
    }
  }
  return -1;
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
 * Extract autodoc annotation values (@file, @see, @link) from a comment token.
 * Uses string scanning — no regex.
 */
function extractDocAnnotations(
  commentText: string
): Array<{ tag: string; value: string; charOffset: number }> {
  const results: Array<{ tag: string; value: string; charOffset: number }> = [];
  const tags = ['@file:', '@see:', '@link:'] as const;

  for (const tag of tags) {
    let searchFrom = 0;
    while (searchFrom < commentText.length) {
      const idx = commentText.indexOf(tag, searchFrom);
      if (idx === -1) break;

      const valueStart = idx + tag.length;
      // Scan forward to find the end of the value (whitespace or end of line).
      let valueEnd = valueStart;
      while (
        valueEnd < commentText.length &&
        commentText[valueEnd] !== ' ' &&
        commentText[valueEnd] !== '\t' &&
        commentText[valueEnd] !== '\n'
      ) {
        valueEnd++;
      }

      const value = commentText.substring(valueStart, valueEnd);
      if (value.length > 0) {
        results.push({ tag: tag.slice(0, -1), value, charOffset: valueStart });
      }

      searchFrom = valueEnd;
    }
  }

  return results;
}

/**
 * Get the directory path from a file URI
 */
function getDocumentDirectory(uri: string): string {
  const filePath = uriToFsPath(uri);
  const lastSlash = filePath.lastIndexOf('/');
  return lastSlash >= 0 ? filePath.substring(0, lastSlash) : filePath;
}
