/**
 * Minimal mock VSCode module for testing
 * This provides stub implementations of the VSCode API used by integration tests
 */

const { EventEmitter } = require('events');

const mockEventEmitter = new EventEmitter();

// Create a mock Uri class
class MockUri {
    constructor(uriString) {
        this.uriString = uriString;
        this.scheme = 'file';
        this.authority = '';
        this.path = uriString;
        this.query = '';
        this.fragment = '';
        this.fsPath = uriString;
    }

    static joinPath(baseUri, ...paths) {
        const path = [baseUri.path, ...paths].join('/');
        return new MockUri(path);
    }

    static parse(uriString) {
        return new MockUri(uriString);
    }

    toString() {
        return this.uriString;
    }

    with(change) {
        const newUri = new MockUri(this.uriString);
        Object.assign(newUri, change);
        return newUri;
    }
}

// Create mock Position class
class MockPosition {
    constructor(line, character) {
        this.line = line;
        this.character = character;
    }

    isBefore(other) {
        return this.line < other.line ||
            (this.line === other.line && this.character < other.character);
    }

    isBeforeOrEqual(other) {
        return this.isBefore(other) || this.equals(other);
    }

    isAfter(other) {
        return !this.isBeforeOrEqual(other);
    }

    isAfterOrEqual(other) {
        return this.isAfter(other) || this.equals(other);
    }

    isEqual(other) {
        return this.line === other.line && this.character === other.character;
    }

    translate(change) {
        const lineDelta = change?.lineDelta || 0;
        const characterDelta = change?.characterDelta || 0;
        return new MockPosition(this.line + lineDelta, this.character + characterDelta);
    }

    with(change) {
        return new MockPosition(
            change?.line ?? this.line,
            change?.character ?? this.character
        );
    }
}

// Create mock Range class
class MockRange {
    constructor(startLineOrStart, startCharacterOrEnd, endLine, endCharacter) {
        if (endLine === undefined) {
            // Called with (start, end) where start/end are positions
            this.start = startLineOrStart;
            this.end = startCharacterOrEnd;
        } else {
            this.start = new MockPosition(startLineOrStart, startCharacterOrEnd);
            this.end = new MockPosition(endLine, endCharacter);
        }
    }

    isEqual(other) {
        return this.start.isEqual(other.start) && this.end.isEqual(other.end);
    }

    contains(position) {
        if (position.isEqual) {
            // It's a Position
            return (position.line > this.start.line || (position.line === this.start.line && position.character >= this.start.character)) &&
                (position.line < this.end.line || (position.line === this.end.line && position.character <= this.end.character));
        }
        return this.contains(position.start) && this.contains(position.end);
    }

    intersection(range) {
        const start = this.start.line > range.start.line ? this.start :
            (this.start.line === range.start.line ? new MockPosition(this.start.line, Math.max(this.start.character, range.start.character)) : range.start);
        const end = this.end.line < range.end.line ? this.end :
            (this.end.line === range.end.line ? new MockPosition(this.end.line, Math.min(this.end.character, range.end.character)) : range.end);

        if (start.line > end.line || (start.line === end.line && start.character > end.character)) {
            return undefined;
        }
        return new MockRange(start, end);
    }

    union(other) {
        const start = this.start.line < other.start.line ? this.start :
            (this.start.line === other.start.line && this.start.character < other.start.character) ? this.start : other.start;
        const end = this.end.line > other.end.line ? this.end :
            (this.end.line === other.end.line && this.end.character > other.end.character) ? this.end : other.end;
        return new MockRange(start, end);
    }

    with(change) {
        return new MockRange(
            change?.start ?? this.start,
            change?.end ?? this.end
        );
    }
}

// Create mock Selection class (extends Range)
class MockSelection extends MockRange {
    constructor(anchorLine, anchorCharacter, activeLine, activeCharacter) {
        super(anchorLine, anchorCharacter, activeLine, activeCharacter);
        this.anchor = new MockPosition(anchorLine, anchorCharacter);
        this.active = new MockPosition(activeLine, activeCharacter);
        this.isReversed = activeLine < anchorLine || (activeLine === anchorLine && activeCharacter < anchorCharacter);
    }
}

// Create mock Location class
class MockLocation {
    constructor(uriOrRange, range) {
        if (range) {
            this.uri = uriOrRange;
            this.range = range;
        } else {
            this.uri = new MockUri('file:///test');
            this.range = uriOrRange;
        }
    }
}

// Create mock Diagnostic class
class MockDiagnostic {
    constructor(range, message, severity = 1) {
        this.range = range;
        this.message = message;
        this.severity = severity;
        this.source = '';
        this.code = undefined;
        this.tags = [];
        this.relatedInformation = [];
    }
}

// Create mock TextEdit class
class MockTextEdit {
    constructor(range, newText) {
        this.range = range;
        this.newText = newText;
    }

    static insert(position, newText) {
        return new MockTextEdit(new MockRange(position, position), newText);
    }

    static delete(range) {
        return new MockTextEdit(range, '');
    }

    static replace(range, newText) {
        return new MockTextEdit(range, newText);
    }
}

// Create mock WorkspaceEdit class
class MockWorkspaceEdit {
    constructor() {
        this._edits = new Map();
    }

    insert(uri, position, newText) {
        if (!this._edits.has(uri.toString())) {
            this._edits.set(uri.toString(), []);
        }
        this._edits.get(uri.toString()).push(MockTextEdit.insert(position, newText));
    }

    delete(uri, range) {
        if (!this._edits.has(uri.toString())) {
            this._edits.set(uri.toString(), []);
        }
        this._edits.get(uri.toString()).push(MockTextEdit.delete(range));
    }

    replace(uri, range, newText) {
        if (!this._edits.has(uri.toString())) {
            this._edits.set(uri.toString(), []);
        }
        this._edits.get(uri.toString()).push(MockTextEdit.replace(range, newText));
    }

    get(uriString) {
        return this._edits.get(uriString) || [];
    }

    entries() {
        return Array.from(this._edits.entries());
    }

    has(uriString) {
        return this._edits.has(uriString);
    }
}

// Create mock TextDocument class
class MockTextDocument {
    constructor(uri, content = '', languageId = 'pike') {
        this.uri = uri;
        this.content = content;
        this._languageId = languageId;
        this._isDirty = false;
        this._isClosed = false;
        this._version = 1;
    }

    get languageId() { return this._languageId; }
    get uri() { return this._uri; }
    set uri(value) { this._uri = value; }
    get fileName() { return this._uri.path; }
    get isDirty() { return this._isDirty; }
    get isClosed() { return this._isClosed; }
    get version() { return this._version; }

    getText(range) {
        if (!range) {
            return this.content;
        }
        const lines = this.content.split('\n');
        if (range.start.line >= lines.length) return '';
        const startLine = lines[range.start.line] || '';
        const endLine = lines[range.end.line] || '';
        if (range.start.line === range.end.line) {
            return startLine.substring(range.start.character, range.end.character);
        }
        return startLine.substring(range.start.character) + '\n' +
            lines.slice(range.start.line + 1, range.end.line).join('\n') + '\n' +
            endLine.substring(0, range.end.character);
    }

    lineAt(lineOrPosition) {
        const line = typeof lineOrPosition === 'number' ? lineOrPosition : lineOrPosition.line;
        const lines = this.content.split('\n');
        return {
            lineNumber: line,
            text: lines[line] || '',
            range: new MockRange(new MockPosition(line, 0), new MockPosition(line, (lines[line] || '').length)),
            rangeIncludingLineBreak: new MockRange(new MockPosition(line, 0), new MockPosition(line + 1, 0))
        };
    }

    offsetAt(position) {
        const lines = this.content.split('\n');
        let offset = 0;
        for (let i = 0; i < position.line && i < lines.length; i++) {
            offset += lines[i].length + 1;
        }
        offset += position.character;
        return offset;
    }

    positionAt(offset) {
        const lines = this.content.split('\n');
        let remaining = offset;
        for (let i = 0; i < lines.length; i++) {
            if (remaining <= lines[i].length) {
                return new MockPosition(i, remaining);
            }
            remaining -= lines[i].length + 1;
        }
        return new MockPosition(lines.length - 1, lines[lines.length - 1].length);
    }

    save() {
        return Promise.resolve(true);
    }
}

// Create mock TextEditor class
class MockTextEditor {
    constructor(document) {
        this.document = document;
        this._selections = [];
        this._options = {
            tabSize: 4,
            insertSpaces: true,
            cursorStyle: 'line',
            cursorBlinking: 'blink',
            lineNumbers: 'on',
            wordWrap: 'off'
        };
    }

    get selection() {
        return this._selections[0] || new MockSelection(0, 0, 0, 0);
    }

    set selection(value) {
        this._selections = [value];
    }

    get selections() {
        return this._selections;
    }

    get options() {
        return this._options;
    }

    set options(value) {
        Object.assign(this._options, value);
    }

    edit(callback) {
        const builder = {
            insert: (position, text) => {
                const lines = text.split('\n');
                let content = this.document.content;
                const lines2 = content.split('\n');
                const pos = this.document.offsetAt(position);
                content = content.slice(0, pos) + text + content.slice(pos);
                this.document.content = content;
                this.document._version++;
            },
            replace: (range, text) => {
                let content = this.document.content;
                const start = this.document.offsetAt(range.start);
                const end = this.document.offsetAt(range.end);
                content = content.slice(0, start) + text + content.slice(end);
                this.document.content = content;
                this.document._version++;
            },
            delete: (range) => {
                let content = this.document.content;
                const start = this.document.offsetAt(range.start);
                const end = this.document.offsetAt(range.end);
                content = content.slice(0, start) + content.slice(end);
                this.document.content = content;
                this.document._version++;
            }
        };
        callback(builder);
        return Promise.resolve(true);
    }
}

// Create mock WindowState
const mockWindowState = {
    focused: true,
    active: true
};

// Create mock extensions
const mockExtensions = {
    getExtension: (extensionId) => {
        return {
            id: extensionId,
            extensionPath: '/mock/path',
            packageJSON: { name: 'vscode-pike', version: '0.1.0' },
            extensionKind: 'workspace',
            isActive: false,
            activate: () => Promise.resolve()
        };
    },
    all: []
};

// Create mock workspace folder
const mockWorkspaceFolder = {
    uri: new MockUri('file:///home/smuks/OpenCode/pike-lsp/packages/vscode-pike/test-workspace'),
    name: 'test-workspace',
    index: 0
};

// Create mock workspace
const mockWorkspace = {
    workspaceFolders: [mockWorkspaceFolder],
    name: 'test-workspace',
    uri: new MockUri('file:///home/smuks/OpenCode/pike-lsp/packages/vscode-pike/test-workspace'),
    textDocuments: [],
    onDidChangeWorkspaceFolders: mockEventEmitter.event,
    onDidOpenTextDocument: mockEventEmitter.event,
    onDidCloseTextDocument: mockEventEmitter.event,
    onDidChangeTextDocument: mockEventEmitter.event,
    onWillSaveTextDocument: mockEventEmitter.event,
    onDidSaveTextDocument: mockEventEmitter.event,

    getWorkspaceFolder: (uri) => mockWorkspaceFolder,
    findFiles: (include, exclude) => Promise.resolve([]),
    openTextDocument: (uriOrPath) => {
        const uri = typeof uriOrPath === 'string' ? MockUri.parse(uriOrPath) : uriOrPath;
        return Promise.resolve(new MockTextDocument(uri));
    },
    registerTextDocumentContentProvider: (scheme, provider) => ({ dispose: () => {} }),
    fs: {
        readFile: (uri) => Promise.resolve(Buffer.from('')),
        writeFile: (uri, content) => Promise.resolve(),
        stat: (uri) => Promise.resolve({ isDirectory: () => false, isFile: () => true, size: 0, mtime: new Date() }),
        createDirectory: (uri) => Promise.resolve(),
        delete: (uri) => Promise.resolve(),
        copy: (source, destination) => Promise.resolve(),
        move: (source, destination) => Promise.resolve()
    },
    asRelativePath: (uriOrPath) => {
        const path = typeof uriOrPath === 'string' ? uriOrPath : uriOrPath.path;
        return path.replace(/^.*[\/\\]/, '');
    },
    getConfiguration: (section) => {
        const defaults = {
            'pike.pikePath': 'pike',
            'pike.pikeModulePath': [],
            'pike.pikeIncludePath': [],
            'pike.pikeProgramPath': [],
            'pike.trace.server': 'off',
            'pike.diagnosticDelay': 250
        };
        return {
            get: (key, defaultValue) => defaults[key] ?? defaultValue,
            has: (key) => key in defaults,
            update: (key, value) => Promise.resolve(),
            inspect: (key) => ({ key, defaultValue: defaults[key], globalValue: defaults[key], workspaceValue: undefined })
        };
    }
};

// Create mock window
const mockWindow = {
    activeTextEditor: undefined,
    visibleTextEditors: [],
    onDidChangeActiveTextEditor: mockEventEmitter.event,
    onDidChangeVisibleTextEditors: mockEventEmitter.event,
    onDidChangeWindowState: mockEventEmitter.event,
    showInformationMessage: (message) => Promise.resolve(undefined),
    showWarningMessage: (message) => Promise.resolve(undefined),
    showErrorMessage: (message) => Promise.resolve(undefined),
    showInputBox: (options) => Promise.resolve(undefined),
    showOpenDialog: (options) => Promise.resolve([]),
    showSaveDialog: (options) => Promise.resolve(undefined),
    showTextDocument: (document, column) => Promise.resolve(new MockTextEditor(document)),
    createWebviewPanel: (viewType, title, showColumn, options) => ({
        webview: { html: '', options: {}, onDidChangeMessage: mockEventEmitter.event, postMessage: () => Promise.resolve(true) },
        onDidChangeViewState: mockEventEmitter.event,
        onDidDispose: mockEventEmitter.event,
        reveal: () => {},
        dispose: () => {}
    }),
    createTerminal: (options) => ({
        name: options?.name || 'terminal',
        processId: Promise.resolve(1),
        exitStatus: Promise.resolve({ code: 0, reason: 'Process completed' }),
        sendText: () => {},
        show: () => {},
        hide: () => {},
        dispose: () => {}
    }),
    createOutputChannel: (name) => ({
        name,
        append: (value) => {},
        appendLine: (value) => {},
        clear: () => {},
        show: () => {},
        hide: () => {},
        dispose: () => {}
    })
};

// Create mock languages
const mockLanguages = {
    getLanguages: () => Promise.resolve(['pike', 'rxml', 'rjs']),
    getDiagnostics: (uri) => [],
    setTextDocumentLanguage: (document, languageId) => Promise.resolve(document),
    registerCompletionItemProvider: (selector, provider, ...triggerCharacters) => ({ dispose: () => {} }),
    registerDefinitionProvider: (selector, provider) => ({ dispose: () => {} }),
    registerDeclarationProvider: (selector, provider) => ({ dispose: () => {} }),
    registerTypeDefinitionProvider: (selector, provider) => ({ dispose: () => {} }),
    registerImplementationProvider: (selector, provider) => ({ dispose: () => {} }),
    registerHoverProvider: (selector, provider) => ({ dispose: () => {} }),
    registerDocumentSymbolProvider: (selector, provider) => ({ dispose: () => {} }),
    registerWorkspaceSymbolProvider: (provider) => ({ dispose: () => {} }),
    registerReferenceProvider: (selector, provider) => ({ dispose: () => {} }),
    registerRenameProvider: (selector, provider) => ({ dispose: () => {} }),
    registerDocumentFormattingEditProvider: (selector, provider) => ({ dispose: () => {} }),
    registerDocumentRangeFormattingEditProvider: (selector, provider) => ({ dispose: () => {} }),
    registerDocumentHighlightProvider: (selector, provider) => ({ dispose: () => {} }),
    registerCodeActionProvider: (selector, provider) => ({ dispose: () => {} }),
    registerCodeLensProvider: (selector, provider) => ({ dispose: () => {} }),
    registerDocumentLinkProvider: (selector, provider) => ({ dispose: () => {} }),
    registerInlayHintsProvider: (selector, provider) => ({ dispose: () => {} }),
    registerCallHierarchyProvider: (selector, provider) => ({ dispose: () => {} }),
    registerSelectionRangeProvider: (selector, provider) => ({ dispose: () => {} })
};

// Create mock commands
const mockCommands = {
    executeCommand: (command, ...args) => {
        return Promise.resolve(undefined);
    },
    registerCommand: (command, handler) => ({ dispose: () => {} }),
    registerTextEditorCommand: (command, handler) => ({ dispose: () => {} })
};

// Create mock tasks
const mockTasks = {
    executeTask: (task) => Promise.resolve(),
    registerTaskProvider: (type, provider) => ({ dispose: () => {} }),
    onDidEndTask: mockEventEmitter.event,
    onDidStartTask: mockEventEmitter.event
};

// Create mock debug
const mockDebug = {
    startDebugging: (folder, name, config) => Promise.resolve(false),
    stopDebugging: (session) => Promise.resolve(),
    activeDebugSession: undefined,
    activeDebugConsole: undefined,
    breakpoints: [],
    onDidChangeBreakpoints: mockEventEmitter.event,
    onDidStartDebugSession: mockEventEmitter.event,
    onDidStopDebugSession: mockEventEmitter.event,
    onDidReceiveDebugSessionCustomEvent: mockEventEmitter.event,
    registerDebugConfigurationProvider: (type, provider) => ({ dispose: () => {} }),
    registerDebugAdapterDescriptorFactory: (type, factory) => ({ dispose: () => {} }),
    registerDebugAdapterTrackerFactory: (type, factory) => ({ dispose: () => {} })
};

// Create mock scm
const mockScm = {
    onDidChangeScmProviders: mockEventEmitter.event,
    createSourceControl: (id, label, rootUri) => ({
        id,
        label,
        rootUri,
        inputBox: { value: '' },
        repositories: [],
        provideOriginalResource: () => Promise.resolve(),
        dispose: () => {}
    })
};

// Create mock env
const mockEnv = {
    language: 'en',
    uriScheme: 'file',
    appName: 'VSCode Mock',
    appRoot: '/mock/root',
    clipboard: {
        readText: () => Promise.resolve(''),
        writeText: (text) => Promise.resolve()
    },
    openExternal: (uri) => Promise.resolve(true),
    asExternalUri: (uri) => Promise.resolve(uri),
    getVariable: (name) => undefined,
    registerEnvironmentVariableProvider: (provider) => ({ dispose: () => {} })
};

// Create mock extensions
const mockExtensionContext = {
    subscriptions: [],
    workspaceState: {
        get: (key, defaultValue) => defaultValue,
        update: (key, value) => Promise.resolve()
    },
    globalState: {
        get: (key, defaultValue) => defaultValue,
        update: (key, value) => Promise.resolve()
    },
    secrets: {
        get: (key) => Promise.resolve(undefined),
        store: (key, value) => Promise.resolve(),
        delete: (key) => Promise.resolve()
    },
    extensionPath: '/mock/path',
    extensionUri: new MockUri('file:///mock/path'),
    extension: mockExtensions.getExtension('pike-lsp.vscode-pike'),
    environmentVariableCollection: {
        get: () => undefined,
        replace: () => Promise.resolve(),
        append: () => Promise.resolve(),
        prepend: () => Promise.resolve(),
        clear: () => Promise.resolve(),
        forEach: () => {},
        persistent: true
    }
};

// Severity values
const Severity = {
    0: 'Error',
    1: 'Warning',
    2: 'Information',
    3: 'Hint',
    Error: 0,
    Warning: 1,
    Information: 2,
    Hint: 3
};

// ViewColumn values
const ViewColumn = {
    Active: 1,
    Beside: 2,
    One: 1,
    Two: 2,
    Three: 3,
    Four: 4,
    Five: 5,
    Six: 6,
    Seven: 7,
    Eight: 8,
    Nine: 9
};

// SymbolKind values
const SymbolKind = {
    File: 1,
    Module: 2,
    Namespace: 3,
    Package: 4,
    Class: 5,
    Method: 6,
    Property: 7,
    Field: 8,
    Constructor: 9,
    Enum: 10,
    Constant: 11,
    String: 12,
    Number: 13,
    Boolean: 14,
    Array: 15,
    Object: 16,
    Key: 17,
    Null: 18,
    Struct: 19,
    TypeParameter: 20,
    Function: 21,
    Variable: 22,
    Interface: 23,
    EnumMember: 24,
    Operator: 25,
    Parameter: 26
};

// CompletionItemKind values
const CompletionItemKind = {
    Text: 1,
    Method: 2,
    Function: 3,
    Constructor: 4,
    Field: 5,
    Variable: 6,
    Class: 7,
    Interface: 8,
    Module: 9,
    Property: 10,
    Unit: 11,
    Value: 12,
    Enum: 13,
    Keyword: 14,
    Snippet: 15,
    Color: 16,
    Reference: 17,
    File: 18,
    Folder: 19,
    EnumMember: 20,
    Constant: 21,
    Struct: 22,
    Event: 23,
    Operator: 24,
    TypeParameter: 25
};

// DocumentHighlightKind values
const DocumentHighlightKind = {
    Text: 1,
    Read: 2,
    Write: 3
};

// TokenType values
const TokenType = {
    Comment: 1,
    Keyword: 2,
    String: 3,
    Number: 4,
    Regexp: 5,
    Type: 6,
    ClassName: 7,
    Function: 8,
    Variable: 9,
    Constant: 10,
    Parameter: 11,
    Property: 12,
    Label: 13,
    Namespace: 14,
    Macro: 15,
    Enum: 16,
    EnumMember: 17,
    TypeParameter: 18,
    Operator: 19,
    OperatorOverload: 20,
    Invalid: 21
};

// TokenModifier values
const TokenModifier = {
    Declaration: 1,
    Definition: 2,
    Readonly: 3,
    Static: 4,
    Deprecated: 5,
    Abstract: 6,
    Async: 7,
    Modification: 8,
    Documentation: 9,
    DefaultLibrary: 10
};

// Create the main vscode module export
const vscode = {
    // Basic types
    Uri: MockUri,
    Position: MockPosition,
    Range: MockRange,
    Selection: MockSelection,
    Location: MockLocation,
    Diagnostic: MockDiagnostic,
    TextEdit: MockTextEdit,
    WorkspaceEdit: MockWorkspaceEdit,
    TextDocument: MockTextDocument,
    TextEditor: MockTextEditor,

    // Namespaces
    workspace: mockWorkspace,
    window: mockWindow,
    languages: mockLanguages,
    commands: mockCommands,
    extensions: mockExtensions,
    tasks: mockTasks,
    debug: mockDebug,
    scm: mockScm,
    env: mockEnv,

    // Enums
    Severity,
    ViewColumn,
    SymbolKind,
    CompletionItemKind,
    DocumentHighlightKind,
    TokenType,
    TokenModifier,

    // Events
    EventEmitter: require('events').EventEmitter,

    // QuickPick
    QuickPickItemKind: {
        Separator: -1,
        Default: 0
    },

    // TreeItem
    TreeItemCollapsibleState: {
        None: 0,
        Collapsed: 1,
        Expanded: 2
    },

    // Configuration
    ConfigurationTarget: {
        Global: 1,
        Workspace: 2,
        WorkspaceFolder: 3
    },

    // EndOfLine
    EndOfLine: {
        LF: 1,
        CRLF: 2
    },

    // Decoration
    DecorationRenderOptions: {},
    ThemableDecorationRenderOptions: {},

    // Progress
    ProgressLocation: {
        SourceControl: 1,
        Notification: 2,
        Window: 3
    },

    // StatusBar
    StatusBarAlignment: {
        Left: 1,
        Right: 2
    },

    // TextEditorCursorStyle
    TextEditorCursorStyle: {
        Line: 1,
        Block: 2,
        Underline: 3,
        LineThin: 4,
        BlockOutline: 5,
        UnderlineThin: 6
    },

    // TextEditorLineNumbersStyle
    TextEditorLineNumbersStyle: {
        Off: 0,
        On: 1,
        Relative: 2
    },

    // TextEditorRevealType
    TextEditorRevealType: {
        Default: 0,
        InCenter: 1,
        InCenterIfOutsideViewport: 2,
        AtTop: 3
    },

    // TextEditorSelectionStyle
    TextEditorSelectionStyle: {
        Light: 1,
        Hollow: 2,
        Line: 3
    },

    // TextEditorWordWrap
    TextEditorWordWrap: {
        Off: 0,
        On: 1,
        WordWrapColumn: 2,
        bounded: 3
    },

    // CommentThreadState
    CommentThreadState: {
        Draft: 1,
        Working: 2,
        Resolved: 3,
        Completed: 4
    },

    // InlayHintKind
    InlayHintKind: {
        Type: 1,
        Parameter: 2
    }
};

module.exports = vscode;
