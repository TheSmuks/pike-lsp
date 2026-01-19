//! Analysis.pike - Stateless analysis class for Pike LSP
//!
//! Design per CONTEXT.md:
//! - Analysis is stateless: all handlers are pure functions
//! - Analysis uses LSP.Compat.trim_whites() for string operations
//! - Analysis uses Parser.Pike for tokenization
//! - Handlers wrap errors in LSP.LSPError responses
//!
//! Use: import LSP.Analysis; object a = Analysis(); a->handle_find_occurrences(...);

//! Analysis class - Stateless analysis handlers for Pike LSP
//! Use: import LSP.Analysis; object a = Analysis(); a->handle_find_occurrences(...);
class Analysis {
    //! Create a new Analysis instance
    void create() {
        // No state to initialize (stateless pattern)
    }
}
