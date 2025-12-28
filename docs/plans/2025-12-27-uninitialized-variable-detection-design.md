# Uninitialized Variable Detection - Design Document

## Overview

Add static analysis to detect usage of potentially uninitialized variables in Pike code. This feature will warn users when they access variables that may not have been assigned a value, particularly for types where this would cause runtime errors.

## Requirements

### Scope
- **Comprehensive**: Local variables, class members, and global/module-level declarations

### Detection Patterns
1. **Basic uninitialized use**: Variable declared but used before any assignment
2. **Conditional initialization**: Variable only initialized in some branches
3. **Container access patterns**: Reading from empty/uninitialized containers

### Type Semantics (Semantic Mode)
Only warn when accessing UNDEFINED would cause runtime errors:
- `int x;` → Auto-initializes to 0, **no warning**
- `float f;` → Auto-initializes to 0.0, **no warning**
- `string s;` → UNDEFINED, **warn on access**
- `mapping m;` → UNDEFINED, **warn on access**
- `array a;` → UNDEFINED, **warn on access**
- `object o;` → UNDEFINED, **warn on access**
- `multiset ms;` → UNDEFINED, **warn on access**
- `function f;` → UNDEFINED, **warn on access**
- `program p;` → UNDEFINED, **warn on access**

### Control Flow
- **Loop-aware**: Full control flow analysis including if/else, switch, while, for, foreach

### Output
- Standard LSP diagnostics with severity "Warning"

## Architecture

```
┌─────────────────┐     ┌──────────────────┐     ┌─────────────────┐
│  Document Edit  │────▶│  analyzer.pike   │────▶│   server.ts     │
│                 │     │                  │     │                 │
│                 │     │ 1. parse()       │     │ Convert to LSP  │
│                 │     │ 2. analyze_      │     │ Diagnostics     │
│                 │     │    uninitialized │     │                 │
└─────────────────┘     └──────────────────┘     └─────────────────┘
```

### New Pike Method
`handle_analyze_uninitialized(mapping params)`
- Input: `code`, `filename`
- Output: Array of diagnostic objects

### Integration
Called during `validateTextDocument()` in server.ts after existing `parse()` call.

## Data Structures

### Variable State Enum
```pike
constant STATE_UNINITIALIZED = 0;  // Declared but never assigned
constant STATE_MAYBE_INIT = 1;     // Assigned in some branches only
constant STATE_INITIALIZED = 2;    // Definitely assigned
constant STATE_UNKNOWN = 3;        // Can't determine
```

### Variable Tracking
```pike
mapping(string:mapping) variables = ([
  "varname": ([
    "type": "mapping",        // Pike type
    "state": 0,               // Current state
    "decl_line": 5,           // Declaration position
    "decl_char": 4,
    "scope_depth": 1,         // Nesting level
    "needs_init": 1           // 1 for types that need initialization
  ])
]);
```

### Types Requiring Initialization
```pike
multiset(string) NEEDS_INIT_TYPES = (<
  "string", "array", "mapping", "multiset",
  "object", "function", "program", "mixed"
>);
```

## Algorithm

### Phase 1: Parse and Build Scope Tree
1. Tokenize code using `Parser.Pike.tokenize()`
2. Build a tree of scopes (global, class, function, block)
3. Track variable declarations with their types and positions

### Phase 2: Control Flow Analysis
1. Build control flow graph (CFG) for each function/method
2. Nodes: statements, declarations, expressions
3. Edges: sequential flow, branches (if/else), loops (back edges)

### Phase 3: Dataflow Analysis
1. Initialize all declared variables to UNINITIALIZED
2. Forward propagation through CFG:
   - Assignment → INITIALIZED
   - Branch merge → if all paths INITIALIZED then INITIALIZED, else MAYBE_INIT
   - Loop entry → conservative (variables may not be initialized on first iteration)
3. At each variable use, check state

### Phase 4: Generate Diagnostics
For each use where state is UNINITIALIZED or MAYBE_INIT:
```pike
diagnostics += ([
  "message": sprintf("Variable '%s' may be uninitialized", varname),
  "severity": "warning",
  "position": ([ "line": use_line, "character": use_char ]),
  "variable": varname
]);
```

## Special Cases

### Container Access
```pike
mapping m = ([]);
m["key"];  // OK - m is initialized (even if empty)

mapping m;
m["key"];  // Warning - m is UNDEFINED
```

### Function Parameters
Parameters are always considered initialized.

### Foreach Variables
Loop variables in foreach are initialized by the loop:
```pike
foreach (items, mixed item) {
  // 'item' is initialized here
}
```

### Catch Blocks
Variables assigned in try blocks may be uninitialized in catch:
```pike
string s;
catch {
  s = read_file(path);
};
write(s);  // Warning - s may be uninitialized if catch triggered
```

### Class Members
Track initialization in `create()` constructor. Members not initialized in any constructor path generate warnings at declaration.

## Implementation Steps

1. Add `handle_analyze_uninitialized` to analyzer.pike
2. Implement scope/variable tracking
3. Implement CFG builder
4. Implement dataflow analysis
5. Add `analyzeUninitialized` to bridge.ts
6. Integrate into server.ts validation
7. Add tests

## Future Enhancements

- Quick fixes: "Initialize variable", "Add null check"
- Inlay hints showing initialization state
- Cross-file analysis for module-level variables
- Configuration options for strictness level
