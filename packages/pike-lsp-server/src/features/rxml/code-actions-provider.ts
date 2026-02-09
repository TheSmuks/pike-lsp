/**
 * RXML Code Actions Provider
 *
 * Provides code actions and quick fixes for RXML/Roxen development:
 * - "Add missing query_location()" for MODULE_LOCATION modules
 * - "Add missing start()/stop()" for lifecycle modules
 * - "Extract to custom tag" refactoring
 * - "Wrap in <set> tag" action
 * - "Create tag function stub" quick action
 *
 * Phase 6 of ROXEN_SUPPORT_ROADMAP.md
 */

import {
  CodeAction,
  CodeActionKind,
  Diagnostic,
  Range,
  OptionalVersionedTextDocumentIdentifier,
  WorkspaceEdit
} from 'vscode-languageserver';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { Position } from 'vscode-languageserver';

/**
 * Extended module information for code actions
 */
export interface ExtendedModuleInfo {
  /** Module name */
  name: string;
  /** Module type constant */
  moduleType: string;
  /** Has query_location() */
  hasQueryLocation: boolean;
  /** Has start() method */
  hasStart: boolean;
  /** Has stop() method */
  hasStop: boolean;
  /** File path */
  filePath: string;
}

/**
 * Provide code actions for RXML document
 *
 * @param document - Text document
 * @param range - Selection range
 * @param context - Code action context (diagnostics, etc.)
 * @param workspaceFolders - Workspace folders
 * @returns Array of code actions
 */
export async function provideRXMLCodeActions(
  document: TextDocument,
  range: Range,
  _context: { diagnostics: Diagnostic[] },
  _workspaceFolders: string[]
): Promise<CodeAction[]> {
  const actions: CodeAction[] = [];
  const content = document.getText();

  // Action 1: Wrap selection in <set> tag
  if (!isRangeEmpty(range)) {
    actions.push(createWrapInSetAction(document, range));
  }

  // Action 2: Extract to custom tag
  if (!isRangeEmpty(range)) {
    actions.push(createExtractToTagAction(document, range));
  }

  // Action 3: Add missing Roxen module lifecycle methods
  if (document.uri.endsWith('.pike')) {
    const moduleInfo = analyzePikeModule(content, document.uri);

    if (moduleInfo.moduleType === 'MODULE_LOCATION' && !moduleInfo.hasQueryLocation) {
      actions.push(createAddQueryLocationAction(document, moduleInfo));
    }

    if (moduleInfo.moduleType === 'MODULE_TAG' || moduleInfo.moduleType === 'MODULE_LOCATION') {
      if (!moduleInfo.hasStart || !moduleInfo.hasStop) {
        actions.push(createAddLifecycleMethodsAction(document, moduleInfo));
      }
    }
  }

  // Action 4: Create tag function stub
  if (document.uri.endsWith('.pike')) {
    actions.push(createCreateTagStubAction(document));
  }

  return actions;
}

/**
 * Create "Wrap in <set> tag" action
 */
function createWrapInSetAction(document: TextDocument, range: Range): CodeAction {
  const selectedText = document.getText(range);

  const edit: WorkspaceEdit = {
    documentChanges: [
      {
        textDocument: OptionalVersionedTextDocumentIdentifier.create(document.uri, null),
        edits: [
          {
            range,
            newText: `<set variable="name">${selectedText}</set>`
          }
        ]
      }
    ]
  };

  const action = CodeAction.create(
    'Wrap in <set> tag',
    edit,
    CodeActionKind.Refactor
  );

  return action;
}

/**
 * Create "Extract to custom tag" action
 */
function createExtractToTagAction(document: TextDocument, range: Range): CodeAction {
  const selectedText = document.getText(range);

  // This is a simplified version - real implementation would:
  // 1. Prompt user for tag name
  // 2. Create the tag function in a .pike file
  // 3. Replace selection with tag call

  const edit: WorkspaceEdit = {
    documentChanges: [
      {
        textDocument: OptionalVersionedTextDocumentIdentifier.create(document.uri, null),
        edits: [
          {
            range,
            newText: `<custom_tag>${selectedText}</custom_tag>`
          }
        ]
      }
    ]
  };

  const action = CodeAction.create(
    'Extract to custom tag',
    edit,
    CodeActionKind.RefactorExtract
  );

  return action;
}

/**
 * Create "Add missing query_location()" action
 */
function createAddQueryLocationAction(document: TextDocument, _moduleInfo: ExtendedModuleInfo): CodeAction {
  const content = document.getText();
  const insertPosition = findInsertPosition(content);

  const codeToInsert = `
/**
 * Get file location for this module
 */
string query_location() {
  return __FILE__;
}
`;

  const edit: WorkspaceEdit = {
    documentChanges: [
      {
        textDocument: OptionalVersionedTextDocumentIdentifier.create(document.uri, null),
        edits: [
          {
            range: {
              start: insertPosition,
              end: insertPosition
            },
            newText: codeToInsert
          }
        ]
      }
    ]
  };

  const action = CodeAction.create(
    'Add missing query_location()',
    edit,
    CodeActionKind.QuickFix
  );

  return action;
}

/**
 * Create "Add missing start()/stop()" action
 */
function createAddLifecycleMethodsAction(document: TextDocument, moduleInfo: ExtendedModuleInfo): CodeAction {
  const content = document.getText();
  const insertPosition = findInsertPosition(content);

  let codeToInsert = '';

  if (!moduleInfo.hasStart) {
    codeToInsert += `
/**
 * Module start callback
 */
void start() {
  // Initialize module
}
`;
  }

  if (!moduleInfo.hasStop) {
    codeToInsert += `
/**
 * Module stop callback
 */
void stop() {
  // Cleanup module
}
`;
  }

  const edit: WorkspaceEdit = {
    documentChanges: [
      {
        textDocument: OptionalVersionedTextDocumentIdentifier.create(document.uri, null),
        edits: [
          {
            range: {
              start: insertPosition,
              end: insertPosition
            },
            newText: codeToInsert
          }
        ]
      }
    ]
  };

  const action = CodeAction.create(
    'Add missing start()/stop()',
    edit,
    CodeActionKind.QuickFix
  );

  return action;
}

/**
 * Create "Create tag function stub" action
 */
function createCreateTagStubAction(document: TextDocument): CodeAction {
  const content = document.getText();
  const insertPosition = findInsertPosition(content);

  const stubCode = `
/**
 * Custom RXML tag
 *
 * @param tag_name - Name of the tag
 * @param args - Tag attributes
 * @param contents - Content between opening and closing tags
 * @param id - Request ID
 * @returns Tag output
 */
string simpletag_my_tag(string tag_name, mapping args, string contents, RequestID id) {
  // Tag implementation
  return contents;
}
`;

  const edit: WorkspaceEdit = {
    documentChanges: [
      {
        textDocument: OptionalVersionedTextDocumentIdentifier.create(document.uri, null),
        edits: [
          {
            range: {
              start: insertPosition,
              end: insertPosition
            },
            newText: stubCode
          }
        ]
      }
    ]
  };

  const action = CodeAction.create(
    'Create tag function stub',
    edit,
    CodeActionKind.Refactor
  );

  return action;
}

/**
 * Analyze Pike module for code action context
 */
function analyzePikeModule(content: string, uri: string): ExtendedModuleInfo {
  const moduleInfo: ExtendedModuleInfo = {
    name: 'unknown',
    moduleType: 'unknown',
    hasQueryLocation: content.includes('query_location()'),
    hasStart: content.includes('void start('),
    hasStop: content.includes('void stop('),
    filePath: uri
  };

  // Detect module type
  if (content.includes('constant module_type = MODULE_TAG')) {
    moduleInfo.moduleType = 'MODULE_TAG';
  } else if (content.includes('constant module_type = MODULE_LOCATION')) {
    moduleInfo.moduleType = 'MODULE_LOCATION';
  } else if (content.includes('constant module_type = MODULE_PARSER')) {
    moduleInfo.moduleType = 'MODULE_PARSER';
  } else if (content.includes('constant module_type = MODULE_AUTH')) {
    moduleInfo.moduleType = 'MODULE_AUTH';
  }

  return moduleInfo;
}

/**
 * Find best position to insert code (after inherit statements, before functions)
 */
function findInsertPosition(_content: string): Position {
  // Simplified implementation - insert at beginning
  // In production, would parse to find last inherit/constant
  return {
    line: 0,
    character: 0
  };
}

/**
 * Check if range is empty (cursor position)
 */
function isRangeEmpty(range: Range): boolean {
  return range.start.line === range.end.line &&
         range.start.character === range.end.character;
}

/**
 * Provide quick fixes for RXML diagnostics
 *
 * @param document - Text document
 * @param diagnostic - Diagnostic to fix
 * @returns Code action or null
 */
export async function provideRXMLQuickFix(
  _document: TextDocument,
  diagnostic: Diagnostic
): Promise<CodeAction | null> {

  // Fix unknown tag by suggesting similar tag
  if (diagnostic.message.includes('Unknown RXML tag')) {
    // Could suggest similar built-in tags
    return null;
  }

  // Fix missing required attribute
  if (diagnostic.message.includes('Missing required attribute')) {
    // Could insert required attribute with placeholder value
    return null;
  }

  return null;
}
