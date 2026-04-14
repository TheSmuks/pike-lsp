/**
 * Hierarchy Feature Handlers
 *
 * Groups "what is related to this" handlers:
 * - Call Hierarchy: who calls this / what does this call
 * - Type Hierarchy: supertypes / subtypes
 *
 * Each handler includes try/catch with logging fallback (SRV-12).
 */

import { Connection } from 'vscode-languageserver/node.js';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { TextDocuments } from 'vscode-languageserver/node.js';

import type { Services } from '../services/index.js';

import { registerCallHierarchyHandlers } from './call-hierarchy.js';
import { registerTypeHierarchyHandlers } from './type-hierarchy.js';

/**
 * Register all hierarchy handlers with the LSP connection.
 *
 * @param connection - LSP connection
 * @param services - Bundle of server services
 * @param documents - TextDocuments manager for LSP document synchronization
 */
export function registerHierarchyHandlers(
  connection: Connection,
  services: Services,
  documents: TextDocuments<TextDocument>
): void {
  registerCallHierarchyHandlers(connection, services, documents);
  registerTypeHierarchyHandlers(connection, services, documents);
}
