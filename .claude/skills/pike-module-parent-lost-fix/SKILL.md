---
name: pike-module-parent-lost-fix
description: |
  Fix for "Parent lost, cannot clone program" error in Pike when resolving classes within .pmod modules. Use when: (1) `master()->resolv()` fails on valid paths, (2) Error "Parent lost" occurs during program instantiation, (3) Using nested class wrappers inside .pike files within module directories.
author: Claude Code
version: 1.0.0
date: 2026-01-21
---

# Pike Module Resolution "Parent lost" Fix

## Problem
When organizing Pike code into modules using directories (e.g., `LSP.pmod/Intelligence.pmod/Resolution.pike`), wrapping the code inside `Resolution.pike` with an explicit `class Resolution { ... }` block causes the Pike resolver to fail when instantiating the class via `master()->resolv()`.

The error manifests as:
```
Parent lost, cannot clone program
```

## Context / Trigger Conditions
- Structure: A `.pike` file inside a `.pmod` directory (e.g., `pike-scripts/LSP.pmod/Intelligence.pmod/Resolution.pike`).
- Code: The `.pike` file contains an outer class wrapper matching the filename.
- Access: Attempting to resolve and clone the class using `master()->resolv("LSP.Intelligence.Resolution")()`.
- Error: "Parent lost" indicates the inner class has lost its connection to the parent module context during resolution.

## Solution
**Remove the outer class wrapper.** In Pike, a `.pike` file inside a module directory *is* the class definition itself. You do not need (and should not have) an explicit class wrapper around the content.

### Before (Incorrect)
File: `pike-scripts/LSP.pmod/Intelligence.pmod/Resolution.pike`
```pike
// This causes "Parent lost" when resolved dynamically
class Resolution {
  void create() { ... }
  // methods...
}
```

### After (Correct)
File: `pike-scripts/LSP.pmod/Intelligence.pmod/Resolution.pike`
```pike
// The file itself defines the class
void create() { ... }
// methods...
```

## Verification
1. Run a script that uses `master()->resolv()` to load the module.
2. Attempt to clone it: `program p = master()->resolv("LSP.Intelligence.Resolution"); object o = p();`
3. If it succeeds without "Parent lost", the fix is verified.

## Notes
- This behavior is specific to how Pike handles the "program" object returned by `resolv()`.
- When you wrap code in a class, `resolv()` returns the program for the file, but to get an instance of the inner class, you'd need to clone the file program first, then access the inner program, which is awkward and breaks standard module resolution patterns.

## References
- Pike Module System Documentation (general concept of files as classes)
