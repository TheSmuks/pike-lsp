# Scope Resolution Best Practices

This document outlines common pitfalls and best practices for implementing scope resolution in a Pike LSP.

---

## Common Pitfalls

### 1. Shadowing & Name Collisions
Pike allows local variables to shadow outer scope variables (class-level, inherited, or module-level). A naive LSP will resolve a symbol to the wrong declaration — e.g., jumping to the class field instead of a local variable that shadows it, or vice versa.

**Solution:** Build a hierarchical scope tree and always resolve to the innermost matching scope.

### 2. Inherit Chains & Multiple Inheritance
Pike supports multiple inheritance via `inherit`. Resolving a method or variable means walking a potentially complex inherit tree where the same symbol can exist in multiple ancestors. The pitfalls here are: resolving to the wrong ancestor, not respecting Pike's left-to-right inherit priority, and failing to account for `::` qualified access (e.g., `ParentClass::method()`).

**Solution:** Pre-compute method resolution order (MRO) for each class, respecting Pike's left-to-right, depth-first inherit semantics.

### 3. Mixup Between Compile-Time and Runtime Scopes
Pike has constructs like `lambda`, `class {}` expressions, and `foreach` that introduce new scopes. A common mistake is treating a lambda's closure scope the same as a nested block scope — lambdas capture variables by reference from the enclosing scope, which matters for "go to definition" and "find references."

**Solution:** Track lambda scopes separately and preserve closure chain when resolving.

### 4. Module Resolution (`import` and `.` notation)
Pike uses a hierarchical module system (e.g., `Standards.JSON`). The LSP needs to resolve dotted identifiers against the module search path. Pitfalls include not honoring the correct search order, failing to resolve `import` directives that pull symbols into the current namespace, and not handling circular imports.

**Solution:** Implement hierarchical module resolution with caching.

### 5. `this_program` / `this` / `this_object` Semantics
These refer to different things and their scope is contextual. Misresolving `this` inside an anonymous class vs. the enclosing class is a frequent bug.

**Solution:** Track class context and return appropriate types for each keyword.

### 6. Preprocessor Influence (`#define`, `#if`)
Pike's C-like preprocessor can redefine symbols or conditionally exclude code. If the LSP doesn't preprocess (or at least partially evaluate) the source, scope resolution will operate on code that doesn't match what the compiler actually sees.

**Solution:** Run a lightweight preprocessor pass before parsing.

### 7. Lazy/Incremental Parsing Stale Data
When a user edits code, the scope tree becomes stale. If the LSP doesn't invalidate and rebuild affected scopes promptly, completions and diagnostics will reference symbols that no longer exist or miss newly introduced ones.

**Solution:** Use incremental scope invalidation with dirty flags.

---

## Best Practices

### 1. Build a Hierarchical Scope Tree (Symbol Table)
Model scopes as a tree: global → module → class → function → block → sub-block. Each node holds its own symbol map and a pointer to its parent. Resolution walks up the tree until a match is found. This naturally handles shadowing — the innermost match wins.

### 2. Separate "Declaration" from "Reference" Passes
Do a first pass to collect all declarations into the scope tree, then a second pass to resolve references. This avoids forward-reference problems (Pike allows referencing class members declared later in the file).

### 3. Explicit Inherit Linearization
Pre-compute a method resolution order (MRO) for each class, respecting Pike's left-to-right, depth-first inherit semantics. Cache this so you don't re-walk the tree on every completion request.

### 4. Scope-Aware Completion Filtering
When generating completions, walk up from the cursor's scope node collecting visible symbols. Tag each symbol with its origin (local, class member, inherited, imported module) so you can rank them — locals first, then class members, then inherited, then module-level.

### 5. Incremental Scope Invalidation
On edits, only rebuild the scope subtree affected by the change (e.g., the function body that was modified), not the entire file. Most LSPs use a dirty-flag or version-stamp per scope node for this.

### 6. Qualified Access Handling
When resolving `A.B.C` or `ParentClass::method`, switch from the normal "walk up" strategy to a targeted "walk into" strategy — resolve `A`, then look inside `A` for `B`, then inside `B` for `C`. Keep these two resolution modes cleanly separated in your resolver.

### 7. Graceful Degradation on Partial/Invalid Code
Users type incomplete code constantly. The LSP should use error-recovery parsing so that a missing semicolon in one function doesn't destroy scope information for the rest of the file. Best practice is to close open scopes at the nearest recovery point and mark them as "partial."

### 8. Cache Module-Level Resolutions
Module lookups (resolving `import` or dotted paths against the filesystem) are expensive. Cache resolved module paths and invalidate only when the workspace file structure changes.

### 9. Handle Preprocessor Directives Early
Run a lightweight preprocessor pass before parsing, or at minimum track `#define` symbol replacements and `#if` branches. Without this, your scope tree will be built on code the compiler would never see.

### 10. Test Against Shadowing & Inherit Edge Cases
Specifically write tests for: a local shadowing an inherited member, two inherits providing the same symbol, `this` inside a nested anonymous class, and lambda captures referring to a variable also shadowed in an inner block. These are the cases most likely to regress.

---

## Related Issues

- #603: Multi-level inheritance scope resolution (implemented)
- #605: `::` qualified access resolution (TODO)
- #606: `this`/`this_program`/`this_object` resolution (TODO)
- #607: Lambda closure scope capture resolution (TODO)
