/**
 * Pike Bridge Types
 * 
 * TypeScript type definitions matching Pike's output from Tools.AutoDoc.PikeParser
 * and Tools.AutoDoc.PikeObjects.
 */

/**
 * Source position in Pike code
 */
export interface PikePosition {
    /** File path or identifier */
    file: string;
    /** Line number (1-indexed) */
    line: number;
    /** Column number (1-indexed), if available */
    column?: number;
}

/**
 * Pike version information from get_version RPC
 */
export interface PikeVersionInfo {
    /** Major version number (e.g., 8) */
    major: number;
    /** Minor version number (e.g., 0) */
    minor: number;
    /** Build number (e.g., 1116) */
    build: number;
    /** Full version string (e.g., "8.0.1116") */
    version: string;
    /** Display version as float (e.g., 8.01116) */
    display: number;
}

/**
 * Pike type representation
 * Matches Tools.AutoDoc.PikeObjects Type classes
 */
export type PikeType =
    | PikeIntType
    | PikeFloatType
    | PikeStringType
    | PikeArrayType
    | PikeMappingType
    | PikeMultisetType
    | PikeFunctionType
    | PikeObjectType
    | PikeProgramType
    | PikeMixedType
    | PikeVoidType
    | PikeZeroType
    | PikeOrType;

export interface PikeIntType {
    kind: 'int';
    min?: string;
    max?: string;
}

export interface PikeFloatType {
    kind: 'float';
}

export interface PikeStringType {
    kind: 'string';
    min?: string;
    max?: string;
}

export interface PikeArrayType {
    kind: 'array';
    valueType?: PikeType;
}

export interface PikeMappingType {
    kind: 'mapping';
    indexType?: PikeType;
    valueType?: PikeType;
}

export interface PikeMultisetType {
    kind: 'multiset';
    indexType?: PikeType;
}

/**
 * Function type with argument information for snippets
 * Matches the structure returned by Pike's _typeof() introspection
 */
export interface PikeFunctionArgument {
    /** Argument name */
    name: string;
    /** Argument type */
    type: string;
}

export interface PikeFunctionType {
    kind: 'function';
    argTypes?: PikeType[];
    returnType?: PikeType;
    /** Arguments with names and types (for snippet generation) */
    arguments?: PikeFunctionArgument[];
    /** Function signature string */
    signature?: string;
}

export interface PikeObjectType {
    kind: 'object';
    className?: string;
}

export interface PikeProgramType {
    kind: 'program';
    className?: string;
}

export interface PikeMixedType {
    kind: 'mixed';
}

export interface PikeVoidType {
    kind: 'void';
}

export interface PikeZeroType {
    kind: 'zero';
}

export interface PikeOrType {
    kind: 'or';
    types: PikeType[];
}

/**
 * Base Pike symbol
 * Matches Tools.AutoDoc.PikeObjects.PikeObject
 */
export interface PikeSymbol {
    /** Symbol name */
    name: string;
    /** Symbol kind */
    kind: PikeSymbolKind;
    /** Modifiers (public, private, static, etc.) */
    modifiers: string[];
    /** Position in source */
    position?: PikePosition;
    /** Type information (from introspection) */
    type?: PikeType;
    /** Child symbols (for classes, modules, etc.) */
    children?: PikeSymbol[];
    /** Whether the symbol is inherited */
    inherited?: boolean;
    /** Name of the class/module it is inherited from */
    inheritedFrom?: string;
    /** Class/module path for import and inherit statements */
    classname?: string;
    /** AutoDoc documentation (from parse) */
    documentation?: AutodocDocumentation;
    /** Whether symbol is deprecated (convenience flag) */
    deprecated?: boolean;
    /** Preprocessor conditional flag (true if inside #if/#elif/#else block) */
    conditional?: true | 1;
    /** Preprocessor condition expression (e.g., "DEBUG", "CONSTANT") */
    condition?: string;
    /** Preprocessor branch index (0 for #if, 1+ for #elif/#else) */
    branch?: number;
    /** Full symbol range (for LSP DocumentSymbol compatibility) */
    range?: {
        start: { line: number; character: number };
        end: { line: number; character: number };
    };
    /** Symbol identifier range (for LSP DocumentSymbol compatibility) */
    selectionRange?: {
        start: { line: number; character: number };
        end: { line: number; character: number };
    };
}

export type PikeSymbolKind =
    | 'class'
    | 'method'
    | 'variable'
    | 'constant'
    | 'typedef'
    | 'enum'
    | 'enum_constant'
    | 'inherit'
    | 'import'
    | 'include'
    | 'module';

/**
 * Pike method/function
 * Matches Tools.AutoDoc.PikeObjects.Method
 */
export interface PikeMethod extends PikeSymbol {
    kind: 'method';
    /** Argument names */
    argNames: (string | null)[];
    /** Argument types */
    argTypes: (PikeType | null)[];
    /** Return type */
    returnType?: PikeType;
}

/**
 * Pike class
 * Matches Tools.AutoDoc.PikeObjects.Class
 */
export interface PikeClass extends PikeSymbol {
    kind: 'class';
    /** Child symbols */
    children: PikeSymbol[];
    /** Inherited classes */
    inherits: string[];
}

/**
 * Pike variable
 * Matches Tools.AutoDoc.PikeObjects.Variable
 */
export interface PikeVariable extends PikeSymbol {
    kind: 'variable';
    /** Variable type */
    type?: PikeType;
}

/**
 * Pike constant
 * Matches Tools.AutoDoc.PikeObjects.Constant
 */
export interface PikeConstant extends PikeSymbol {
    kind: 'constant';
    /** Constant type */
    type?: PikeType;
}

/**
 * Pike typedef
 * Matches Tools.AutoDoc.PikeObjects.Typedef
 */
export interface PikeTypedef extends PikeSymbol {
    kind: 'typedef';
    /** Type being defined */
    type?: PikeType;
}

/**
 * Pike token from Parser.Pike
 * PERF-004: Includes character position for efficient symbol position indexing
 */
export interface PikeToken {
    /** Token text */
    text: string;
    /** Line number (1-indexed) */
    line: number;
    /** Character position (0-indexed), -1 if not available */
    character: number;
    /** File identifier */
    file: number | string;
}

/**
 * PERF-001: Token occurrence (identifier position)
 * Returned by find_occurrences for symbol position indexing
 */
export interface TokenOccurrence {
    /** Identifier text */
    text: string;
    /** Line number (1-indexed) */
    line: number;
    /** Character position (0-indexed) */
    character: number;
}

/**
 * PERF-001: Result of find_occurrences request
 */
export interface FindOccurrencesResult {
    /** All identifier occurrences found */
    occurrences: TokenOccurrence[];
}

/**
 * PERF-002: Input for batch parse request
 */
export interface BatchParseInput {
    /** Source code to parse */
    code: string;
    /** Filename for this file */
    filename: string;
}

/**
 * PERF-002: Result for a single file in batch parse
 */
export interface BatchParseFileResult {
    /** Filename of the parsed file */
    filename: string;
    /** Symbols extracted from the file */
    symbols: PikeSymbol[];
    /** Diagnostics (errors/warnings) from parsing */
    diagnostics: PikeDiagnostic[];
}

/**
 * PERF-002: Result of batch parse operation
 */
export interface BatchParseResult {
    /** Results for each file */
    results: BatchParseFileResult[];
    /** Number of files processed */
    count: number;
}

/**
 * Pike diagnostic (error/warning)
 */
export interface PikeDiagnostic {
    /** Diagnostic message */
    message: string;
    /** Severity: error, warning, info */
    severity: 'error' | 'warning' | 'info';
    /** Position in source */
    position: PikePosition;
    /** End position (if range) */
    endPosition?: PikePosition;
}

/**
 * Result of parsing a Pike file
 */
export interface PikeParseResult {
    /** Extracted symbols */
    symbols: PikeSymbol[];
    /** Diagnostics (errors/warnings) */
    diagnostics: PikeDiagnostic[];
    /** Tokens (if requested) */
    tokens?: PikeToken[];
}

/**
 * Autodoc documentation for a symbol
 */
export interface AutodocDocumentation {
    /** Main description text */
    text?: string;
    /** Parameter documentation */
    params?: Record<string, string>;
    /** Return value description */
    returns?: string;
    /** Throws description */
    throws?: string;
    /** Notes */
    notes?: string[];
    /** Bugs */
    bugs?: string[];
    /** Deprecation message */
    deprecated?: string;
    /** Examples */
    examples?: string[];
    /** See also references */
    seealso?: string[];
    /** Member documentation (for mappings) */
    members?: Record<string, string>;
    /** Items (for list/dl documentation) */
    items?: Array<{ label: string; text: string }>;
}

/**
 * Introspected symbol from compiled program
 */
export interface IntrospectedSymbol {
    /** Symbol name */
    name: string;
    /** Symbol type */
    type: PikeType;
    /** Symbol kind */
    kind: 'function' | 'variable' | 'constant' | 'class';
    /** Modifiers (public, private, static, etc.) */
    modifiers: string[];
    /** Parsed autodoc documentation (if available) */
    documentation?: AutodocDocumentation;
    /** Whether the symbol is inherited */
    inherited?: boolean;
    /** Name of the class/module it is inherited from */
    inheritedFrom?: string;
    /** Whether the symbol is deprecated (from @deprecated AutoDoc) */
    deprecated?: boolean | number;
}

/**
 * Inheritance information
 */
export interface InheritanceInfo {
    /** Path to parent class/module */
    path: string;
    /** Program ID for reference */
    program_id?: string;
    /** Original class name from source */
    source_name?: string;
    /** Label/name given to the inherit (e.g. "inherit Foo : Label") */
    label?: string;
}

/**
 * Result of introspecting a compiled Pike program
 */
export interface IntrospectionResult {
    /** Success flag */
    success: number;
    /** All symbols found */
    symbols: IntrospectedSymbol[];
    /** Functions only */
    functions: IntrospectedSymbol[];
    /** Variables only */
    variables: IntrospectedSymbol[];
    /** Classes only */
    classes: IntrospectedSymbol[];
    /** Inheritance information */
    inherits: InheritanceInfo[];
    /** Diagnostics from compilation */
    diagnostics: PikeDiagnostic[];
}

/**
 * Result of resolving a stdlib module
 */
export interface StdlibResolveResult {
    /** Whether module was found */
    found: number;
    /** Path to module source */
    path?: string;
    /** Module path that was resolved */
    module?: string;
    /** Symbols in the module */
    symbols?: IntrospectedSymbol[];
    /** Functions in the module */
    functions?: IntrospectedSymbol[];
    /** Variables in the module */
    variables?: IntrospectedSymbol[];
    /** Classes in the module */
    classes?: IntrospectedSymbol[];
    /** Inheritance information */
    inherits?: InheritanceInfo[];
    /** Error message if not found */
    error?: string;
}

/**
 * Result of resolving an #include path
 */
export interface IncludeResolveResult {
    /** Resolved absolute path */
    path: string;
    /** Whether the file exists */
    exists: boolean;
    /** Original include path from source */
    originalPath: string;
}

/**
 * Result of querying Pike's runtime paths
 */
export interface PikePathsResult {
    /** Pike's include paths from master()->pike_include_path */
    include_paths: string[];
    /** Pike's module paths from master()->pike_module_path */
    module_paths: string[];
}

/**
 * Result of getting inherited members
 */
export interface InheritedMembersResult {
    /** Whether class was found */
    found: number;
    /** Inherited members */
    members: IntrospectedSymbol[];
    /** Number of parent classes */
    inherit_count?: number;
}

/**
 * Diagnostic for an uninitialized variable
 */
export interface UninitializedVariableDiagnostic {
    /** Warning message */
    message: string;
    /** Severity (always 'warning' for uninitialized vars) */
    severity: 'warning';
    /** Position where the variable is used */
    position: {
        line: number;
        character: number;
    };
    /** Name of the variable */
    variable: string;
    /** Type of the variable */
    type?: string;
    /** State of initialization */
    state?: 'uninitialized' | 'maybe_init';
}

/**
 * Result of analyzing uninitialized variables
 */
export interface AnalyzeUninitializedResult {
    /** Diagnostics for uninitialized variable usage */
    diagnostics: UninitializedVariableDiagnostic[];
}

/**
 * Completion context result from get_completion_context
 * Uses Pike's tokenizer for accurate context detection
 */
export interface CompletionContext {
    /** Context type */
    context: 'none' | 'global' | 'member_access' | 'scope_access' | 'identifier';
    /** Object/module name for member access (e.g., "Stdio" from "Stdio.") */
    objectName: string;
    /** Partial prefix being typed */
    prefix: string;
    /** Access operator (if member access) */
    operator: '->' | '.' | '::' | '';
}

/**
 * Expression information extracted at cursor position.
 * Used for go-to-definition and hover on module paths and member access.
 */
export interface ExpressionInfo {
    /** Full expression text */
    fullPath: string;
    /** Base part (module path or variable name) */
    base: string;
    /** Member being accessed (after -> or final .) */
    member: string | null;
    /** Last operator used ("." or "->") */
    operator: '.' | '->' | null;
    /** True if base is a module path (dots only) */
    isModulePath: boolean;
    /** Character range in document (0-indexed offsets) */
    range: { start: number; end: number };
}

/**
 * Import directive types
 */
export type ImportType = 'include' | 'import' | 'inherit' | 'require';

/**
 * Resolution type for #require directives
 */
export type RequireResolutionType =
    | 'string_literal'      // #require "module.pike";
    | 'constant_identifier' // #require constant(ModuleName);
    | 'complex_require';    // Complex expression - skip resolution

/**
 * Extracted import directive from source code
 */
export interface ExtractedImport {
    /** Import type */
    type: ImportType;
    /** Original path from source */
    path: string;
    /** Resolved absolute path (if available) */
    resolved_path?: string;
    /** Line number in source */
    line: number;
    /** Whether the file exists (0 = no, 1 = yes) */
    exists?: 0 | 1;
    /** Part of circular dependency (0 = no, 1 = yes) */
    is_circular?: 0 | 1;
    /** Provenance depth (0 = direct, >0 = transitive) */
    depth?: number;
    /** For #require: resolution type */
    resolution_type?: RequireResolutionType;
    /** For #require with constant(): the identifier name */
    identifier?: string;
    /** Whether to skip resolution (complex requires) (0 = no, 1 = yes) */
    skip?: 0 | 1;
}

/**
 * Result of extract_imports request
 */
export interface ExtractImportsResult {
    /** All imports found in source */
    imports: ExtractedImport[];
    /** Dependencies (transitive imports, if computed) */
    dependencies?: string[];
}

/**
 * Result of resolve_import request
 */
export interface ResolveImportResult {
    /** Original path from source */
    original_path?: string;
    /** Resolved absolute path */
    path: string;
    /** Whether the file/module exists (0 = no, 1 = yes) */
    exists: 0 | 1;
    /** Import type */
    type: ImportType;
    /** File modification time (for cache invalidation) */
    mtime: number;
    /** Error message if resolution failed */
    error?: string;
}

/**
 * Symbol with provenance tracking
 */
export interface SymbolWithProvenance extends PikeSymbol {
    /** Depth at which this symbol was found (-1 = current file, 0 = direct import, >0 = transitive) */
    provenance_depth?: number;
    /** File that defined this symbol */
    provenance_file?: string;
}

/**
 * Result of get_waterfall_symbols request
 */
export interface WaterfallSymbolsResult {
    /** All merged symbols (with precedence applied) */
    symbols: SymbolWithProvenance[];
    /** Direct imports */
    imports: ExtractedImport[];
    /** Transitive imports (waterfall) */
    transitive: ExtractedImport[];
    /** Provenance information for each symbol */
    provenance: Record<string, { depth: number; file: string }>;
}

/**
 * Circular dependency check result
 */
export interface CircularCheckResult {
    /** Whether a circular dependency exists (0 = no, 1 = yes) */
    has_circular: 0 | 1;
    /** The cycle path (if circular) */
    cycle: string[];
    /** All dependencies found */
    dependencies: string[];
}

/**
 * Startup phase timing information
 */
export interface StartupMetrics {
    /** Time to set up module path (ms) */
    path_setup?: number;
    /** Time to log version info (ms) */
    version?: number;
    /** Time to initialize handlers (ms) */
    handlers?: number;
    /** Time until server ready (ms) */
    ready?: number;
    /** Total startup time (ms) */
    total?: number;
    /** Whether Context has been created */
    context_created?: number;
    /** Time to create Context on first request (ms) */
    context_lazy?: number;
    /** First LSP.Compat load time (ms) */
    first_compat_load?: number;
}

/**
 * Compilation cache statistics
 */
export interface CacheStats {
    /** Number of cache hits */
    hits: number;
    /** Number of cache misses */
    misses: number;
    /** Number of cache evictions */
    evictions: number;
    /** Current cache size */
    size: number;
    /** Maximum cache size */
    max_files: number;
}

/**
 * RXML tag definition
 */
export interface RXMLTag {
    /** Tag name (without simpletag_/container_ prefix) */
    name: string;
    /** Tag type - 'simple' for simpletag_*, 'container' for container_* */
    type: 'simple' | 'container';
    /** Position in source code */
    position: PikePosition;
    /** Function arguments */
    args: PikeFunctionArgument[];
}

/**
 * RXML tag catalog entry (from server or catalog)
 */
export interface RXMLTagCatalogEntry {
    /** Tag name */
    name: string;
    /** Tag type - simple or container */
    type: 'simple' | 'container';
    /** Required attributes */
    requiredAttributes: string[];
    /** Optional attributes */
    optionalAttributes: string[];
    /** Tag description */
    description?: string;
}

/**
 * RXML marker detected in string content
 */
export interface RXMLMarker {
    /** Marker type */
    type: 'tag' | 'entity' | 'directive';
    /** Marker name (e.g., "set", "emit", "roxen") */
    name: string;
    /** Position within the RXML content (1-indexed) */
    line: number;
    /** Character position within the line (1-indexed) */
    column: number;
}

/**
 * Result from extracting RXML strings from Pike code
 */
export interface RXMLStringResult {
    /** The RXML content (excluding quotes) */
    content: string;
    /** 1-indexed position of content start */
    start: { line: number; column: number };
    /** 1-indexed position of content end */
    end: { line: number; column: number };
    /** 1-indexed position including quote start */
    quote_start: { line: number; column: number };
    /** 1-indexed position including quote end */
    quote_end: { line: number; column: number };
    /** Confidence score (0-1) of RXML likelihood */
    confidence: number;
    /** Detected RXML markers */
    markers: RXMLMarker[];
}

/**
 * Module variable from defvar declaration
 */
export interface ModuleVariable {
    /** Variable name */
    name: string;
    /** Variable type - TYPE_* constant */
    type: string;
    /** Display name string */
    name_string: string;
    /** Documentation string */
    doc_str: string;
    /** Position in source code */
    position: PikePosition;
}

/**
 * Lifecycle callback information
 */
export interface LifecycleInfo {
    /** Names of lifecycle callbacks found */
    callbacks: string[];
    /** Whether create() callback exists */
    has_create: number;
    /** Whether start() callback exists */
    has_start: number;
    /** Whether stop() callback exists */
    has_stop: number;
    /** Whether status() callback exists */
    has_status: number;
    /** Missing required callbacks (by module type) */
    missing_required: string[];
}

/**
 * Cache invalidation result
 */
export interface InvalidateCacheResult {
    status: string;
    path: string;
}

/**
 * Request to Pike subprocess
 */
export interface PikeRequest {
    /** Request ID for matching responses */
    id: number;
    /** Method to call */
    method: 'parse' | 'tokenize' | 'resolve' | 'compile' | 'introspect' | 'resolve_stdlib' | 'resolve_include' | 'get_inherited' | 'find_occurrences' | 'batch_parse' | 'set_debug' | 'analyze_uninitialized' | 'get_completion_context' | 'get_completion_context_cached' | 'analyze' | 'extract_imports' | 'resolve_import' | 'check_circular' | 'get_waterfall_symbols' | 'get_startup_metrics' | 'get_cache_stats' | 'invalidate_cache' | 'get_pike_paths' | 'roxen_detect' | 'roxen_parse_tags' | 'roxen_parse_vars' | 'roxen_get_callbacks' | 'roxen_validate';
    /** Request parameters */
    params: Record<string, unknown>;
}

/**
 * Analysis operation types for unified analyze request.
 */
export type AnalysisOperation = 'parse' | 'introspect' | 'diagnostics' | 'tokenize';

/**
 * Unified analyze request - consolidates multiple Pike operations.
 *
 * Performs compilation and tokenization once, then distributes results
 * to all requested operation types. Supports partial success - each
 * operation type appears in either result or failures, never both.
 */
export interface AnalyzeRequest extends Record<string, unknown> {
    /** Pike source code to analyze */
    code: string;
    /** Optional filename for error messages */
    filename?: string;
    /** Which operations to perform - at least one required */
    include: AnalysisOperation[];
}

/**
 * Failure information for a single analyze operation.
 */
export interface AnalyzeFailure {
    /** Error message describing the failure */
    message: string;
    /** Failure kind - error type category */
    kind: string;
}

/**
 * Successful results for each analyze operation type.
 */
export interface AnalyzeResults {
    /** Parse result - symbols and diagnostics from parsing */
    parse?: PikeParseResult;
    /** Introspect result - type information from compilation */
    introspect?: IntrospectionResult;
    /** Diagnostics result - uninitialized variable analysis */
    diagnostics?: AnalyzeUninitializedResult;
    /** Tokenize result - lexical tokens from code */
    tokenize?: { tokens: PikeToken[] };
}

/**
 * Failure information for each analyze operation type.
 *
 * Uses O(1) lookup pattern - check failures.parse directly,
 * no iteration required.
 */
export interface AnalyzeFailures {
    /** Parse failure information */
    parse?: AnalyzeFailure;
    /** Introspect failure information */
    introspect?: AnalyzeFailure;
    /** Diagnostics failure information */
    diagnostics?: AnalyzeFailure;
    /** Tokenize failure information */
    tokenize?: AnalyzeFailure;
}

/**
 * Performance timing metadata for analyze operation.
 */
export interface AnalyzePerformance {
    /** Total Pike processing time in milliseconds */
    pike_total_ms: number;
    /** Time spent compiling code (if introspection requested) */
    compilation_ms?: number;
    /** Time spent tokenizing code (if tokenization requested) */
    tokenization_ms?: number;
    /** Cache key used for this request */
    cache_key?: string;
    /** Whether the compilation cache was hit */
    cache_hit?: boolean;
}

/**
 * Unified analyze response - partial success structure.
 *
 * Each requested operation appears in either result or failures,
 * never both. Use failures?.[operation] for O(1) lookup.
 */
export interface AnalyzeResponse {
    /** Successful results for each operation type */
    result?: AnalyzeResults;
    /** Failure information for operations that failed */
    failures?: AnalyzeFailures;
    /** Performance timing metadata */
    _perf?: AnalyzePerformance;
}

/**
 * Response from Pike subprocess
 */
export interface PikeResponse {
    /** Request ID this responds to */
    id: number;
    /** Result on success */
    result?: any;
    /** Error on failure */
    error?: {
        code: number;
        message: string;
    };
    /** Performance metadata (internal timing) */
    _perf?: {
        pike_total_ms: number;
    };
}

/**
 * Expression information extracted at cursor position.
 * Used for go-to-definition and hover on module paths and member access.
 */
export interface ExpressionInfo {
    /** Full expression text */
    fullPath: string;
    /** Base part (module path or variable name) */
    base: string;
    /** Member being accessed (after -> or final .) */
    member: string | null;
    /** Last operator used ("." or "->") */
    operator: '.' | '->' | null;
    /** True if base is a module path (dots only) */
    isModulePath: boolean;
    /** Character range in document (0-indexed offsets) */
    range: { start: number; end: number };
}

/**
 * Roxen module diagnostic from validator.
 */
export interface RoxenDiagnostic {
    /** 1-based line number (converted to 0-based by TS layer) */
    line: number;
    /** 1-based column number (converted to 0-based by TS layer) */
    column: number;
    severity: 'error' | 'warning' | 'info';
    message: string;
}

/**
 * Roxen module information from Pike bridge
 */
export interface RoxenModuleInfo {
    /** Whether this is a Roxen module (0 = no, 1 = yes) */
    is_roxen_module: 0 | 1;
    /** Module type(s): MODULE_FILE, MODULE_TAG, MODULE_LOCATION, etc. */
    module_type: string[];
    /** Module name from register_module() */
    module_name: string;
    /** Inherit targets found in the module */
    inherits: string[];
    /** defvar declarations */
    variables: ModuleVariable[];
    /** RXML tags defined by this module */
    tags: RXMLTag[];
    /** Lifecycle callback information */
    lifecycle: LifecycleInfo;
}

/**
 * Result of Roxen module validation.
 */
export interface RoxenValidationResult {
    diagnostics?: RoxenDiagnostic[];
    error?: {
        code: number;
        message: string;
    };
}

/**
 * Preprocessor branch (if/elif/else) line range.
 */
export interface PreprocessorBranch {
    /** Branch index (0 for #if, 1+ for #elif/#else) */
    branch: number;
    /** Start line (1-indexed) */
    startLine: number;
    /** End line (1-indexed) */
    endLine: number;
}

/**
 * Preprocessor conditional block (#if/#else/#endif).
 */
export interface PreprocessorBlock {
    /** Condition expression (e.g., "DEBUG", "CONSTANT") */
    condition: string;
    /** Branches within this block */
    branches: PreprocessorBranch[];
    /** Nesting depth (0 for top-level) */
    depth: number;
    /** Start line of #if directive (1-indexed) */
    startLine: number;
    /** End line of #endif directive (1-indexed) */
    endLine: number;
}
