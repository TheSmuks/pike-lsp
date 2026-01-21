//! Intelligence.pmod/module.pmod - Shared helper functions for AutoDoc parsing
//!
//! This module provides shared helper functions used across the Intelligence.pmod
//! classes. These functions are callable directly from any class within the
//! Intelligence.pmod namespace.
//!
//! Functions provided:
//! - extract_autodoc_comments(): Extract //! comments from source code
//! - extract_symbol_name(): Extract function name from definition line
//! - process_inline_markup(): Convert AutoDoc inline tags to markdown
//! - replace_markup(): Helper for replacing markup tags
//!
//! Classes exported:
//! - Intelligence: Backward-compatible delegating class (for analyzer.pike compatibility)
//! - Introspection: Symbol extraction and introspection handlers
//! - Resolution: Module name resolution and stdlib introspection
//! - TypeAnalysis: Type inheritance traversal and AutoDoc parsing
//!
//! Per 05-RESEARCH.md Q1 decision: The Intelligence class provides backward
//! compatibility by delegating to specialized classes in this .pmod directory.
//!
//! Note: In Pike, when we have Intelligence.pmod/Introspection.pike with a class Introspection,
// the path to access the class is LSP.Intelligence.Introspection.Introspection
// (module.submodule.class).
//
// The constant export approach creates a circular dependency at compile time.
// Users should access the class via master()->resolv("LSP.Intelligence.Introspection.Introspection")
// or via the submodule directly.

//! Extract autodoc comments from source code
//! Returns mapping of declaration line -> documentation text
//!
//! @param code Source code to extract comments from
//! @returns Mapping of line number to documentation text
//!
//! @example
//! mapping docs = extract_autodoc_comments(source_code);
//! foreach (docs; int line; string doc) {
//!     werror("Line %d: %s\n", line, doc);
//! }
mapping(int:string) extract_autodoc_comments(string code) {
    mapping(int:string) result = ([]);
    array(string) lines = code / "\n";

    array(string) current_doc = ({});
    int doc_start_line = 0;

    for (int i = 0; i < sizeof(lines); i++) {
        string line = LSP.Compat.trim_whites(lines[i]);

        if (has_prefix(line, "//!")) {
            // Autodoc comment line
            if (sizeof(current_doc) == 0) {
                doc_start_line = i + 1;
            }
            // Extract text after //!
            string doc_text = "";
            if (sizeof(line) > 3) {
                doc_text = line[3..];
                if (sizeof(doc_text) > 0 && doc_text[0] == ' ') {
                    doc_text = doc_text[1..]; // Remove leading space
                }
            }
            current_doc += ({ doc_text });
        } else if (sizeof(current_doc) > 0) {
            // Non-comment line after doc block - this is the declaration
            // Store doc for this line (the declaration line)
            result[i + 1] = current_doc * "\n";
            current_doc = ({});
        }
    }

    return result;
}

//! Extract symbol name from a line that might be a function definition
//!
//! @param line Line of code that may contain a function definition
//! @returns The extracted symbol name, or empty string if not found
//!
//! Handles both Pike function definitions (type name()) and
//! PIKEFUN patterns from C modules (PIKEFUN type name()).
//!
//! @example
//! string name = extract_symbol_name("int calculate(int x, int y)");
//! // Returns: "calculate"
string extract_symbol_name(string line) {
    // Skip preprocessor and empty lines
    if (sizeof(line) == 0 || line[0] == '#') return "";

    // PIKEFUN type name( pattern (for C files)
    if (has_value(line, "PIKEFUN")) {
        // PIKEFUN return_type name(
        string ret_type, name;
        if (sscanf(line, "%*sPIKEFUN%*[ \t]%s%*[ \t]%s(%*s", ret_type, name) == 2) {
            if (name) return name;
        }
    }

    // Look for patterns like: type name( or modifiers type name(
    // Match: optional_modifiers type name(
    array(string) tokens = ({});
    string current = "";

    foreach(line / "", string c) {
        if (c == "(") {
            if (sizeof(current) > 0) tokens += ({ LSP.Compat.trim_whites(current) });
            break;
        } else if (c == " " || c == "\t") {
            if (sizeof(current) > 0) {
                tokens += ({ LSP.Compat.trim_whites(current) });
                current = "";
            }
        } else {
            current += c;
        }
    }

    // The function name is typically the last token before (
    // Filter out modifiers and type keywords
    multiset(string) skip = (<
        "static", "public", "private", "protected", "final", "inline",
        "local", "optional", "variant", "nomask", "extern",
        "int", "float", "string", "array", "mapping", "multiset",
        "object", "function", "program", "mixed", "void", "zero", "auto"
    >);

    for (int i = sizeof(tokens) - 1; i >= 0; i--) {
        string tok = tokens[i];
        // Skip type annotations like array(int)
        if (has_value(tok, "(") || has_value(tok, ")")) continue;
        if (has_value(tok, "<") || has_value(tok, ">")) continue;
        if (has_value(tok, "|")) continue;
        if (skip[tok]) continue;
        if (sizeof(tok) > 0 && (tok[0] >= 'a' && tok[0] <= 'z' ||
                              tok[0] >= 'A' && tok[0] <= 'Z' ||
                              tok[0] == '_')) {
            return tok;
        }
    }

    return "";
}

//! Process inline markup tags in text
//! Converts Pike autodoc inline markup to markdown:
//! @i{text@} -> *text* (italic)
//! @b{text@} -> **text** (bold)
//! @tt{text@} -> `text` (code)
//! @ref{name@} -> `name` (code reference)
//! @[name] -> `name` (short ref syntax)
//! @expr{code@} -> `code` (expression)
//!
//! @param text Text containing AutoDoc markup tags
//! @returns Text with markdown-formatted markup
//!
//! @example
//! string doc = process_inline_markup("This is @b{bold@} text with @tt{code@}.");
//! // Returns: "This is **bold** text with `code`."
string process_inline_markup(string text) {
    string result = text;

    // @i{text@} -> *text* (italic)
    result = replace_markup(result, "@i{", "@}", "*", "*");

    // @b{text@} -> **text** (bold)
    result = replace_markup(result, "@b{", "@}", "**", "**");

    // @tt{text@} -> `text` (code/teletype)
    result = replace_markup(result, "@tt{", "@}", "`", "`");

    // @ref{name@} -> `name` (reference)
    result = replace_markup(result, "@ref{", "@}", "`", "`");

    // @expr{code@} -> `code` (expression)
    result = replace_markup(result, "@expr{", "@}", "`", "`");

    // @code{code@} -> `code` (inline code)
    result = replace_markup(result, "@code{", "@}", "`", "`");

    // @pre{text@} -> keep as-is (preformatted)
    result = replace_markup(result, "@pre{", "@}", "", "");

    // @[name] -> `name` (short reference syntax - very common in Pike docs)
    while (has_value(result, "@[")) {
        int start = search(result, "@[");
        int end = search(result, "]", start);
        if (start >= 0 && end > start) {
            string ref_name = result[start+2..end-1];
            result = result[..start-1] + "`" + ref_name + "`" + result[end+1..];
        } else {
            break;
        }
    }

    // @@ -> @ (escaped at-sign)
    result = replace(result, "@@", "@");

    return result;
}

//! Helper to replace markup tags
//!
//! @param text Text containing markup tags
//! @param open_tag Opening tag (e.g., "@b{")
//! @param close_tag Closing tag (e.g., "@}")
//! @param md_open Markdown opening tag (e.g., "**")
//! @param md_close Markdown closing tag (e.g., "**")
//! @returns Text with markup replaced
//!
//! Iteratively replaces all occurrences of the markup tag pair
//! with the specified markdown equivalents.
protected string replace_markup(string text, string open_tag, string close_tag,
                                 string md_open, string md_close) {
    string result = text;
    int safety = 100; // Prevent infinite loops

    while (has_value(result, open_tag) && safety-- > 0) {
        int start = search(result, open_tag);
        int end = search(result, close_tag, start + sizeof(open_tag));
        if (start >= 0 && end > start) {
            string content = result[start + sizeof(open_tag)..end-1];
            result = result[..start-1] + md_open + content + md_close + result[end + sizeof(close_tag)..];
        } else {
            break;
        }
    }

    return result;
}

//! ============================================================================
//! INTELLIGENCE DELEGATING CLASS
//! ============================================================================
//! Backward-compatible delegating class for analyzer.pike compatibility.
//!
//! The original monolithic Intelligence class (1660 lines) has been split into:
//! - Introspection.pike: Symbol extraction (414 lines)
//! - Resolution.pike: Module resolution and stdlib introspection (564 lines)
//! - TypeAnalysis.pike: Type inheritance and AutoDoc parsing (666 lines)
//!
//! This class forwards all handler calls to the appropriate specialized class.

//! Bootstrap modules used internally by the resolver.
constant BOOTSTRAP_MODULES = (<
    "Stdio",     // Used for file I/O during source parsing
    "String",    // May be used for string operations
    "Array",     // Core type used throughout
    "Mapping",   // Core type used throughout
>);

//! Track modules currently being resolved to prevent circular dependency.
private mapping(string:int) resolving_modules = ([]);

//! Track circular references detected during resolution
private mapping(string:int) circular_refs = ([]);

//! Intelligence class - Backward-compatible delegating class
//!
//! Usage in analyzer.pike (unchanged):
//!   program IntelligenceClass = master()->resolv("LSP.Intelligence");
//!   intelligence = IntelligenceClass();
//!
//! The class is exported via module.pmod, so it's accessible as:
//!   master()->resolv("LSP.Intelligence.Intelligence")
class Intelligence {
    //! Private handler instances (created on first use)
    private object introspection_handler;
    private object resolution_handler;
    private object type_analysis_handler;

    //! Create a new Intelligence instance
    void create() {
        // Handlers are created lazily when first needed
    }

    //! Get or create the introspection handler
    protected object get_introspection_handler() {
        if (!introspection_handler) {
            mixed intro_class = master()->resolv("LSP.Intelligence.Introspection");
            if (intro_class && programp(intro_class)) {
                introspection_handler = intro_class(0);
            }
        }
        return introspection_handler;
    }

    //! Get or create the resolution handler
    protected object get_resolution_handler() {
        if (!resolution_handler) {
            mixed res_class = master()->resolv("LSP.Intelligence.Resolution");
            if (res_class && programp(res_class)) {
                resolution_handler = res_class(0);
            }
        }
        return resolution_handler;
    }

    //! Get or create the type analysis handler
    protected object get_type_analysis_handler() {
        if (!type_analysis_handler) {
            mixed type_class = master()->resolv("LSP.Intelligence.TypeAnalysis");
            if (type_class && programp(type_class)) {
                type_analysis_handler = type_class(0);
            }
        }
        return type_analysis_handler;
    }

    //! Introspect Pike code by compiling it and extracting symbol information
    //! Delegates to Introspection class in Intelligence.pmod/
    mapping handle_introspect(mapping params) {
        object handler = get_introspection_handler();
        if (handler) {
            return handler->handle_introspect(params);
        }
        return LSP.module.LSPError(-32000, "Introspection handler not available")->to_response();
    }

    //! Resolve module path to file system location
    //! Delegates to Resolution class in Intelligence.pmod/
    mapping handle_resolve(mapping params) {
        object handler = get_resolution_handler();
        if (handler) {
            return handler->handle_resolve(params);
        }
        return LSP.module.LSPError(-32000, "Resolution handler not available")->to_response();
    }

    //! Resolve stdlib module and extract symbols with documentation
    //! Delegates to Resolution class in Intelligence.pmod/
    mapping handle_resolve_stdlib(mapping params) {
        object handler = get_resolution_handler();
        if (handler) {
            return handler->handle_resolve_stdlib(params);
        }
        return LSP.module.LSPError(-32000, "Resolution handler not available")->to_response();
    }

    //! Get inherited members from a class
    //! Delegates to TypeAnalysis class in Intelligence.pmod/
    mapping handle_get_inherited(mapping params) {
        object handler = get_type_analysis_handler();
        if (handler) {
            return handler->handle_get_inherited(params);
        }
        return LSP.module.LSPError(-32000, "TypeAnalysis handler not available")->to_response();
    }
}
