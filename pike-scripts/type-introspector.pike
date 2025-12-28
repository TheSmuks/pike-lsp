#!/usr/bin/env pike
#pike __REAL_VERSION__

//! Pike Type Introspector
//!
//! This script provides type information extraction through compilation
//! and runtime introspection using Pike's native capabilities.
//!
//! Protocol: JSON-RPC over stdin/stdout
//!
//! Available methods:
//! - introspect: Compile code and extract full type information
//! - resolve_stdlib: Resolve stdlib module and introspect symbols
//! - get_inherited: Get inherited members from parent classes

// Program cache for performance (LRU)
mapping(string:program) program_cache = ([]);
mapping(string:int) cache_access_time = ([]);
mapping(string:int) cache_access_count = ([]);
int max_cached_programs = 30;

// Stdlib cache (lazy loading)
mapping(string:mapping) stdlib_cache = ([]);
int max_stdlib_modules = 50;
int stdlib_hits = 0;
int stdlib_misses = 0;

protected mapping(string:mixed) handle_request(mapping(string:mixed) request) {
  string method = request->method;
  mapping params = request->params || ([]);

  switch (method) {
    case "introspect":
      return handle_introspect(params);
    case "resolve_stdlib":
      return handle_resolve_stdlib(params);
    case "get_inherited":
      return handle_get_inherited(params);
    default:
      return ([
        "error": ([
          "code": -32601,
          "message": "Method not found: " + method
        ])
      ]);
  }
}

//! Compile Pike code and extract full type information via introspection
protected mapping handle_introspect(mapping params) {
  string code = params->code || "";
  string filename = params->filename || "input.pike";

  array diagnostics = ({});
  program compiled_prog;

  // Set up error capture for compilation
  void compile_error_handler(string file, int line, string msg) {
    diagnostics += ({
      ([
        "message": msg,
        "severity": "error",
        "position": ([
          "file": file,
          "line": line
        ])
      ])
    });
  };

  // Save old handlers
  mixed old_error_handler = master()->get_inhibit_compile_errors();

  // Install our handler
  master()->set_inhibit_compile_errors(compile_error_handler);

  // Attempt compilation
  mixed compile_err = catch {
    compiled_prog = compile_string(code, filename);
  };

  // Restore old handler
  master()->set_inhibit_compile_errors(old_error_handler);

  // If compilation failed, return diagnostics with no introspection
  if (compile_err || !compiled_prog) {
    return ([
      "result": ([
        "success": 0,
        "diagnostics": diagnostics,
        "symbols": ({}),
        "functions": ({}),
        "variables": ({}),
        "classes": ({}),
        "inherits": ({})
      ])
    ]);
  }

  // Cache the compiled program
  program_cache[filename] = compiled_prog;
  cache_access_time[filename] = time();
  cache_access_count[filename] = (cache_access_count[filename] || 0) + 1;

  // Enforce cache size limit (LRU eviction)
  evict_lru_programs();

  // Extract type information via describe_program
  mapping result = introspect_program(compiled_prog, filename);
  result->success = 1;
  result->diagnostics = diagnostics;

  return ([ "result": result ]);
}

//! Resolve stdlib module and extract symbols
protected mapping handle_resolve_stdlib(mapping params) {
  string module_path = params->module || "";

  if (sizeof(module_path) == 0) {
    return ([
      "result": ([
        "found": 0,
        "error": "No module path provided"
      ])
    ]);
  }

  // Check cache first
  if (stdlib_cache[module_path]) {
    stdlib_hits++;
    cache_access_time[module_path] = time();
    return ([ "result": stdlib_cache[module_path] ]);
  }

  stdlib_misses++;

  // Resolve using master()->resolv()
  mixed resolved;
  mixed resolve_err = catch {
    resolved = master()->resolv(module_path);
  };

  if (resolve_err || !resolved) {
    return ([
      "result": ([
        "found": 0,
        "error": resolve_err ? describe_error(resolve_err) : "Module not found"
      ])
    ]);
  }

  // Get program from resolved object/module
  program prog;
  mixed prog_err = catch {
    if (objectp(resolved)) {
      prog = object_program(resolved);
    } else if (programp(resolved)) {
      prog = resolved;
    } else {
      return ([
        "result": ([
          "found": 0,
          "error": "Resolved value is not a program or object"
        ])
      ]);
    }
  };

  if (prog_err || !prog) {
    return ([
      "result": ([
        "found": 0,
        "error": prog_err ? describe_error(prog_err) : "Could not get program"
      ])
    ]);
  }

  // Get source file location
  string source_path = "";
  catch {
    source_path = Program.defined(prog) || "";
  };

  // Introspect the stdlib module
  mapping introspection = introspect_program(prog, module_path);

  mapping result = ([
    "found": 1,
    "path": source_path,
    "module": module_path,
  ]) + introspection;

  // Cache it if under limit
  if (sizeof(stdlib_cache) < max_stdlib_modules) {
    stdlib_cache[module_path] = result;
    cache_access_time[module_path] = time();
  } else {
    // Evict LRU stdlib module
    evict_lru_stdlib();
    stdlib_cache[module_path] = result;
    cache_access_time[module_path] = time();
  }

  return ([ "result": result ]);
}

//! Get inherited members from a class
protected mapping handle_get_inherited(mapping params) {
  string class_name = params->class || "";

  if (sizeof(class_name) == 0) {
    return ([
      "result": ([
        "found": 0,
        "members": ({})
      ])
    ]);
  }

  // Try to resolve the class
  mixed resolved;
  mixed err = catch {
    resolved = master()->resolv(class_name);
  };

  if (err || !resolved) {
    return ([
      "result": ([
        "found": 0,
        "members": ({})
      ])
    ]);
  }

  program prog = objectp(resolved) ? object_program(resolved) : resolved;
  if (!prog) {
    return ([
      "result": ([
        "found": 0,
        "members": ({})
      ])
    ]);
  }

  // Get inheritance list
  array inherits = ({});
  catch {
    inherits = Program.inherit_list(prog) || ({});
  };

  array all_members = ({});

  // Introspect each inherited program
  foreach (inherits, program parent_prog) {
    mapping parent_info = introspect_program(parent_prog, "inherited");
    all_members += parent_info->symbols || ({});
  }

  return ([
    "result": ([
      "found": 1,
      "members": all_members,
      "inherit_count": sizeof(inherits)
    ])
  ]);
}

//! Introspect a compiled program to extract symbols, functions, variables
protected mapping introspect_program(program prog, string context) {
  mapping result = ([
    "symbols": ({}),
    "functions": ({}),
    "variables": ({}),
    "classes": ({}),
    "inherits": ({})
  ]);

  // Try to instantiate the program to introspect symbols
  object instance;
  mixed inst_err = catch {
    instance = prog();
  };

  if (inst_err || !instance) {
    // Could not instantiate - just get inheritance info
    array inherit_list = ({});
    catch {
      inherit_list = Program.inherit_list(prog) || ({});
    };

    foreach (inherit_list, program parent_prog) {
      string parent_path = "";
      catch {
        parent_path = Program.defined(parent_prog) || "";
      };

      result->inherits += ({
        ([
          "path": parent_path,
          "program_id": sprintf("%O", parent_prog)
        ])
      });
    }

    return result;
  }

  // Get all identifiers from the instance
  array(string) symbol_names = ({});
  catch {
    symbol_names = indices(instance);
  };

  array symbol_values = ({});
  catch {
    symbol_values = values(instance);
  };

  // Extract symbol information
  for (int i = 0; i < sizeof(symbol_names); i++) {
    string name = symbol_names[i];
    mixed value = i < sizeof(symbol_values) ? symbol_values[i] : 0;

    // Determine kind and type
    string kind = "variable";
    mapping type_info = ([ "kind": "mixed" ]);

    if (functionp(value)) {
      kind = "function";
      type_info = ([ "kind": "function" ]);
    } else if (intp(value)) {
      type_info = ([ "kind": "int" ]);
    } else if (stringp(value)) {
      type_info = ([ "kind": "string" ]);
    } else if (floatp(value)) {
      type_info = ([ "kind": "float" ]);
    } else if (arrayp(value)) {
      type_info = ([ "kind": "array" ]);
    } else if (mappingp(value)) {
      type_info = ([ "kind": "mapping" ]);
    } else if (multisetp(value)) {
      type_info = ([ "kind": "multiset" ]);
    } else if (objectp(value)) {
      type_info = ([ "kind": "object" ]);
    } else if (programp(value)) {
      kind = "class";
      type_info = ([ "kind": "program" ]);
    }

    mapping symbol = ([
      "name": name,
      "type": type_info,
      "kind": kind,
      "modifiers": ({})
    ]);

    result->symbols += ({ symbol });

    // Categorize
    if (kind == "function") {
      result->functions += ({ symbol });
    } else if (kind == "variable") {
      result->variables += ({ symbol });
    } else if (kind == "class") {
      result->classes += ({ symbol });
    }
  }

  // Get inheritance information
  array inherit_list = ({});
  catch {
    inherit_list = Program.inherit_list(prog) || ({});
  };

  foreach (inherit_list, program parent_prog) {
    string parent_path = "";
    catch {
      parent_path = Program.defined(parent_prog) || "";
    };

    result->inherits += ({
      ([
        "path": parent_path,
        "program_id": sprintf("%O", parent_prog)
      ])
    });
  }

  return result;
}

//! Convert Pike type to JSON representation
protected mapping type_to_json(mixed pike_type) {
  if (!pike_type) {
    return ([ "kind": "mixed" ]);
  }

  // Check basic types using predicates
  if (catch { return intp(pike_type) ? ([ "kind": "int" ]) : 0; } == 0) {
    return ([ "kind": "int" ]);
  }

  if (catch { return stringp(pike_type) ? ([ "kind": "string" ]) : 0; } == 0) {
    return ([ "kind": "string" ]);
  }

  if (catch { return floatp(pike_type) ? ([ "kind": "float" ]) : 0; } == 0) {
    return ([ "kind": "float" ]);
  }

  // For complex types, try to extract information from type objects
  // Pike's type system is complex, this is a simplified approach
  string type_repr = sprintf("%O", pike_type);

  if (has_value(type_repr, "array")) {
    return ([ "kind": "array" ]);
  }

  if (has_value(type_repr, "mapping")) {
    return ([ "kind": "mapping" ]);
  }

  if (has_value(type_repr, "multiset")) {
    return ([ "kind": "multiset" ]);
  }

  if (has_value(type_repr, "function") || has_value(type_repr, "Function")) {
    return ([ "kind": "function" ]);
  }

  if (has_value(type_repr, "object") || has_value(type_repr, "Object")) {
    return ([ "kind": "object" ]);
  }

  if (has_value(type_repr, "program") || has_value(type_repr, "Program")) {
    return ([ "kind": "program" ]);
  }

  if (has_value(type_repr, "void")) {
    return ([ "kind": "void" ]);
  }

  // Default to mixed for unknown types
  return ([ "kind": "mixed", "raw": type_repr ]);
}

//! Infer symbol kind from type information
protected string infer_symbol_kind(mixed type_info) {
  if (!type_info) return "variable";

  string type_repr = sprintf("%O", type_info);

  if (has_value(type_repr, "function") || has_value(type_repr, "Function")) {
    return "function";
  }

  if (has_value(type_repr, "class") || has_value(type_repr, "Class")) {
    return "class";
  }

  if (has_value(type_repr, "constant") || has_value(type_repr, "Constant")) {
    return "constant";
  }

  return "variable";
}

//! LRU eviction for program cache
protected void evict_lru_programs() {
  while (sizeof(program_cache) > max_cached_programs) {
    string oldest_key = "";
    int oldest_time = time() + 1;

    foreach (program_cache; string key; program prog) {
      int access_time = cache_access_time[key] || 0;
      if (access_time < oldest_time) {
        oldest_time = access_time;
        oldest_key = key;
      }
    }

    if (sizeof(oldest_key) > 0) {
      m_delete(program_cache, oldest_key);
      m_delete(cache_access_time, oldest_key);
      m_delete(cache_access_count, oldest_key);
    } else {
      break; // Safety: avoid infinite loop
    }
  }
}

//! LRU eviction for stdlib cache
protected void evict_lru_stdlib() {
  string oldest_key = "";
  int oldest_time = time() + 1;

  foreach (stdlib_cache; string key; mapping info) {
    int access_time = cache_access_time[key] || 0;
    if (access_time < oldest_time) {
      oldest_time = access_time;
      oldest_key = key;
    }
  }

  if (sizeof(oldest_key) > 0) {
    m_delete(stdlib_cache, oldest_key);
    m_delete(cache_access_time, oldest_key);
  }
}

//! Format error for JSON response
protected string describe_error(mixed err) {
  if (arrayp(err)) {
    return err[0] || "Unknown error";
  }
  return sprintf("%O", err);
}

int main(int argc, array(string) argv) {
  // Test mode for development
  if (argc > 1 && argv[1] == "--test-introspect") {
    string test_code = "int add(int a, int b) {\n"
                       "  return a + b;\n"
                       "}\n"
                       "\n"
                       "class MyClass {\n"
                       "  string name;\n"
                       "  void greet() {\n"
                       "    write(\"Hello\\n\");\n"
                       "  }\n"
                       "}\n";

    mapping result = handle_introspect(([ "code": test_code, "filename": "test.pike" ]));
    write("%s\n", Standards.JSON.encode(result, Standards.JSON.HUMAN_READABLE));
    return 0;
  }

  if (argc > 1 && argv[1] == "--test-stdlib") {
    mapping result = handle_resolve_stdlib(([ "module": "Stdio" ]));
    write("%s\n", Standards.JSON.encode(result, Standards.JSON.HUMAN_READABLE));
    return 0;
  }

  // Interactive JSON-RPC mode
  string line;
  while ((line = Stdio.stdin.gets())) {
    if (sizeof(String.trim(line)) == 0) continue;

    mixed err = catch {
      mapping request = Standards.JSON.decode(line);
      mapping response = handle_request(request);
      response->id = request->id;
      write("%s\n", Standards.JSON.encode(response));
    };

    if (err) {
      write("%s\n", Standards.JSON.encode(([
        "error": ([
          "code": -32700,
          "message": "Parse error: " + describe_error(err)
        ])
      ])));
    }
  }

  return 0;
}
