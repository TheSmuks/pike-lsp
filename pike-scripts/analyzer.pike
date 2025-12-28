#!/usr/bin/env pike
#pike __REAL_VERSION__

//! Pike LSP Analyzer Script
//!
//! This script provides parsing and symbol extraction using Pike's
//! native utilities: Parser.Pike and Tools.AutoDoc.PikeParser.
//!
//! Protocol: JSON-RPC over stdin/stdout
//!
//! Available methods:
//! - parse: Parse Pike source and extract declarations
//! - tokenize: Tokenize Pike source
//! - compile: Compile and get diagnostics
//! - resolve: Resolve module path
//! - introspect: Compile code and extract type information via introspection
//! - resolve_stdlib: Resolve stdlib module and extract symbols
//! - get_inherited: Get inherited members from a class
//! - find_occurrences: Find all identifier occurrences using tokenization (PERF-001)
//! - batch_parse: Parse multiple files in a single request (PERF-002)
//! - set_debug: Enable or disable debug logging (PERF-005)
//! - analyze_uninitialized: Detect potentially uninitialized variable usage
//! - get_completion_context: Get accurate completion context using tokenization

// MAINT-004: Configuration constants
constant MAX_TOP_LEVEL_ITERATIONS = 10000;
constant MAX_BLOCK_ITERATIONS = 500;

// Introspection caches
mapping(string:program) program_cache = ([]);
mapping(string:int) cache_access_time = ([]);
mapping(string:mapping) stdlib_cache = ([]);
int max_cached_programs = 30;
int max_stdlib_modules = 50;

// PERF-005: Debug mode (disabled by default for performance)
int debug_mode = 0;

// Conditional debug logging - only outputs when debug_mode is enabled
void debug(string fmt, mixed... args) {
  if (debug_mode) {
    werror(fmt, @args);
  }
}

protected mapping(string:mixed) handle_request(mapping(string:mixed) request) {
  string method = request->method;
  mapping params = request->params || ([]);

  switch (method) {
    case "parse":
      return handle_parse(params);
    case "tokenize":
      return handle_tokenize(params);
    case "compile":
      return handle_compile(params);
    case "resolve":
      return handle_resolve(params);
    case "introspect":
      return handle_introspect(params);
    case "resolve_stdlib":
      return handle_resolve_stdlib(params);
    case "get_inherited":
      return handle_get_inherited(params);
    case "set_debug":
      return handle_set_debug(params);
    case "find_occurrences":
      return handle_find_occurrences(params);
    case "batch_parse":
      return handle_batch_parse(params);
    case "analyze_uninitialized":
      return handle_analyze_uninitialized(params);
    case "get_completion_context":
      return handle_get_completion_context(params);
    default:
      return ([
        "error": ([
          "code": -32601,
          "message": "Method not found: " + method
        ])
      ]);
  }
}

protected mapping handle_parse(mapping params) {
  string code = params->code || "";
  string filename = params->filename || "input.pike";
  int line = params->line || 1;
  
  array symbols = ({});
  array diagnostics = ({});
  
  // Extract autodoc comments from original code before preprocessing
  // Maps line number -> documentation string
  mapping(int:string) autodoc_by_line = extract_autodoc_comments(code);

  // Preprocess code: remove preprocessor directives that confuse PikeParser
  // We need to track nesting to properly handle conditional blocks
  string preprocessed = "";
  int preprocessed_line = 0;
  int if_depth = 0;

  foreach(code / "\n", string src_line) {
    preprocessed_line++;
    string trimmed = String.trim(src_line);

    // Handle conditional compilation - we can't evaluate these, so skip entire blocks
    if (has_prefix(trimmed, "#if")) {
      if_depth++;
      preprocessed += "\n";  // Keep line number but skip directive
    } else if (has_prefix(trimmed, "#else") || has_prefix(trimmed, "#elif")) {
      preprocessed += "\n";  // Keep line number but skip directive
    } else if (has_prefix(trimmed, "#endif")) {
      if_depth--;
      preprocessed += "\n";  // Keep line number but skip directive
    } else if (if_depth > 0) {
      // We're inside an #if block that we're skipping - skip this line too
      preprocessed += "\n";
    } else if (has_prefix(trimmed, "#pike") ||
               has_prefix(trimmed, "#pragma") ||
               has_prefix(trimmed, "#include") ||
               has_prefix(trimmed, "#define") ||
               has_prefix(trimmed, "#charset")) {
      // Other directives - replace with blank line
      preprocessed += "\n";
    } else {
      preprocessed += src_line + "\n";
    }
  }
  
  mixed err = catch {
    // Create parser instance with preprocessed code
    object parser = Tools.AutoDoc.PikeParser(preprocessed, filename, line);

    // Parse declarations until EOF
    int iter = 0;

    // Buffer for collecting autodoc comments during parsing
    array(string) autodoc_buffer = ({});
    
    while (parser->peekToken() != "" && iter++ < MAX_TOP_LEVEL_ITERATIONS) {
      string current_token = parser->peekToken();
      
      // Collect documentation comments into buffer
      if (has_prefix(current_token, "//!")) {
        // Extract the comment text (remove //! prefix)
        // Preserve indentation for continuation lines - only remove single trailing space after //!
        string doc_text = current_token;
        if (sizeof(doc_text) > 3) {
          doc_text = doc_text[3..]; // Remove "//!"
          // Remove exactly one leading space if present (Pike convention)
          if (sizeof(doc_text) > 0 && doc_text[0] == ' ') {
            doc_text = doc_text[1..];
          }
        } else {
          doc_text = "";
        }
        autodoc_buffer += ({ doc_text });
        parser->readToken();
        continue;
      }
      
      // Try to parse a declaration
      mixed decl;
      mixed parse_err = catch {
        decl = parser->parseDecl();
      };
      
      if (parse_err) {
        // Skip this token and continue
        autodoc_buffer = ({}); // Clear buffer on parse error
        parser->readToken();
        continue;
      }
      
      if (decl) {
        // For non-class/enum declarations, add directly to symbols
        if (arrayp(decl)) {
          // Get the collected documentation and clear buffer
          string documentation = sizeof(autodoc_buffer) > 0 ?
            autodoc_buffer * "\n" : "";
          autodoc_buffer = ({}); // Clear buffer after use

          foreach(decl, mixed d) {
            if (objectp(d)) {
              mixed convert_err = catch {
                symbols += ({ symbol_to_json(d, documentation) });
              };
            }
          }
        } else if (objectp(decl)) {
          // Check if this is a class or enum - if so, we'll handle it below with its members
          string decl_kind = get_symbol_kind(decl);

          if (decl_kind != "class" && decl_kind != "enum") {
            // Not a class/enum - get documentation, add to symbols, and clear buffer
            string documentation = sizeof(autodoc_buffer) > 0 ?
              autodoc_buffer * "\n" : "";
            autodoc_buffer = ({}); // Clear buffer after use

            mixed convert_err = catch {
              symbols += ({ symbol_to_json(decl, documentation) });
            };
          }
          // For classes/enums, we'll add them later after parsing their members
          // Don't clear autodoc_buffer yet - we need it for the class symbol
        }
      } else {
        // No declaration parsed, clear buffer
        autodoc_buffer = ({});
      }

      // Handle block contents (class/enum bodies)
      // Skip to next declaration
      parser->skipUntil((<";", "{", "">));
      if (parser->peekToken() == "{") {
        // Check if we just parsed a class or enum - if so, parse body contents
        string decl_kind = "";
        if (objectp(decl)) {
          decl_kind = get_symbol_kind(decl);
        }

        if (decl_kind == "class" || decl_kind == "enum") {
          // Get the class documentation now (before parsing members)
          string class_documentation = sizeof(autodoc_buffer) > 0 ?
            autodoc_buffer * "\n" : "";
          autodoc_buffer = ({}); // Clear buffer after using it

          // Enter the block to parse members
          parser->readToken(); // consume '{'

          // Store the class declaration for later
          mixed class_decl = decl;
          string class_name = "";
          if (objectp(decl)) {
            // Try to get class name for later use
            catch { class_name = decl->name; };
          }

          // Parse declarations inside the block and collect as children
          int block_iter = 0;
          array(string) member_autodoc_buffer = ({});
          array(mapping) class_children = ({});

          while (parser->peekToken() != "}" && parser->peekToken() != "" && block_iter++ < 500) {
            string member_token = parser->peekToken();

            // Collect documentation comments for members
            if (has_prefix(member_token, "//!")) {
              string doc_text = member_token;
              if (sizeof(doc_text) > 3) {
                doc_text = doc_text[3..];
                // Remove exactly one leading space if present
                if (sizeof(doc_text) > 0 && doc_text[0] == ' ') {
                  doc_text = doc_text[1..];
                }
              } else {
                doc_text = "";
              }
              member_autodoc_buffer += ({ doc_text });
              parser->readToken();
              continue;
            }

            // Try to parse a declaration
            mixed member_decl;
            mixed member_err = catch {
              member_decl = parser->parseDecl();
            };

            if (member_err) {
              member_autodoc_buffer = ({});
              parser->readToken();
              continue;
            }

            if (member_decl) {
              string member_doc = sizeof(member_autodoc_buffer) > 0 ?
                member_autodoc_buffer * "\n" : "";
              member_autodoc_buffer = ({});

              if (arrayp(member_decl)) {
                foreach(member_decl, mixed m) {
                  if (objectp(m)) {
                    mixed conv_err = catch {
                      class_children += ({ symbol_to_json(m, member_doc) });
                    };
                  }
                }
              } else if (objectp(member_decl)) {
                mixed conv_err = catch {
                  class_children += ({ symbol_to_json(member_decl, member_doc) });
                };
              }
            } else {
              member_autodoc_buffer = ({});
            }

            // Skip to next member declaration
            parser->skipUntil((<";", "{", "}", "">));
            if (parser->peekToken() == "{") {
              // Skip nested blocks (method bodies, nested classes for now)
              parser->skipBlock();
            }
            if (parser->peekToken() == ";") {
              parser->readToken();
            }
          }
          // Consume the closing '}'
          if (parser->peekToken() == "}") {
            parser->readToken();
          }

          // Now add the class with its children
          if (objectp(class_decl)) {
            mixed conv_err = catch {
              mapping class_json = symbol_to_json(class_decl, class_documentation);
              // Add children to the class symbol
              class_json["children"] = class_children;
              symbols += ({ class_json });
            };
          }
        } else if (decl_kind == "method" || decl_kind == "function") {
          // Enter function/method body to extract local variables
          parser->readToken(); // consume '{'

          int body_iter = 0;
          int brace_depth = 1;

          while (brace_depth > 0 && parser->peekToken() != "" && body_iter++ < MAX_BLOCK_ITERATIONS) {
            string token = parser->peekToken();

            if (token == "}") {
              brace_depth--;
              parser->readToken();
              continue;
            }

            if (token == "{") {
              brace_depth++;
              parser->readToken();
              continue;
            }

            // Try to parse a declaration
            mixed local_decl;
            mixed parse_err = catch {
              local_decl = parser->parseDecl();
            };

            if (!parse_err && local_decl) {
              // Successfully parsed - extract variables
              if (arrayp(local_decl)) {
                foreach(local_decl, mixed d) {
                  if (objectp(d)) {
                    string dkind = get_symbol_kind(d);
                    if (dkind == "variable" || dkind == "constant" || dkind == "typedef") {
                      symbols += ({ symbol_to_json(d, "") });
                    }
                  }
                }
              } else if (objectp(local_decl)) {
                string dkind = get_symbol_kind(local_decl);
                if (dkind == "variable" || dkind == "constant" || dkind == "typedef") {
                  symbols += ({ symbol_to_json(local_decl, "") });
                }
              }
              // parseDecl consumed the declaration, continue to next token
              continue;
            } else {
              // Not a declaration - skip to next statement
              parser->skipUntil((<";", "{", "}", "">));
              if (parser->peekToken() == ";") {
                parser->readToken();
              }
            }
          }
        } else {
          // Unknown block type - skip it
          parser->skipBlock();
        }
      }
      if (parser->peekToken() == ";") {
        parser->readToken();
      }
    }
  };
  
  if (err) {
    // Only add diagnostic for truly fatal errors
    string error_msg = describe_error(err);
    // Don't report "expected identifier" errors as they're often false positives
    if (!has_value(error_msg, "expected identifier")) {
      diagnostics += ({
        ([
          "message": error_msg,
          "severity": "error",
          "position": ([
            "file": filename,
            "line": 1
          ])
        ])
      });
    }
  }
  
  return ([
    "result": ([
      "symbols": symbols,
      "diagnostics": diagnostics
    ])
  ]);
}

//! Extract autodoc comments from source code
//! Returns mapping of declaration line -> documentation text
protected mapping(int:string) extract_autodoc_comments(string code) {
  mapping(int:string) result = ([]);
  array(string) lines = code / "\n";
  
  array(string) current_doc = ({});
  int doc_start_line = 0;
  
  for (int i = 0; i < sizeof(lines); i++) {
    string line = String.trim(lines[i]);
    
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

protected mapping handle_tokenize(mapping params) {
  string code = params->code || "";
  
  array tokens = ({});
  
  mixed err = catch {
    array(string) split_tokens = Parser.Pike.split(code);
    array pike_tokens = Parser.Pike.tokenize(split_tokens);
    
    foreach (pike_tokens, mixed t) {
      tokens += ({
        ([
          "text": t->text,
          "line": t->line,
          "file": t->file
        ])
      });
    }
  };
  
  if (err) {
    return ([
      "error": ([
        "code": -32000,
        "message": describe_error(err)
      ])
    ]);
  }
  
  return ([
    "result": ([
      "tokens": tokens
    ])
  ]);
}

protected mapping handle_compile(mapping params) {
  string code = params->code || "";
  string filename = params->filename || "input.pike";
  
  array diagnostics = ({});
  
  // Capture compilation errors using set_inhibit_compile_errors
  void capture_error(string file, int line, string msg) {
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
  
  // Capture warnings too
  void capture_warning(string file, int line, string msg) {
    diagnostics += ({
      ([
        "message": msg,
        "severity": "warning",
        "position": ([
          "file": file,
          "line": line
        ])
      ])
    });
  };
  
  // Save old handlers
  mixed old_error = master()->get_inhibit_compile_errors();
  
  // Set our capture handlers
  master()->set_inhibit_compile_errors(capture_error);
  
  mixed err = catch {
    // Try to compile
    compile_string(code, filename);
  };
  
  // Restore old handler
  master()->set_inhibit_compile_errors(old_error);
  
  return ([
    "result": ([
      "symbols": ({}),
      "diagnostics": diagnostics
    ])
  ]);
}

//! Get the source file path for a resolved module
//! Uses Pike's native module resolution instead of heuristics
//! Handles dirnodes (directory modules), joinnodes (merged modules),
//! and regular programs/objects.
protected string get_module_path(mixed resolved) {
  if (!resolved) return "";
  
  // Handle objects (most modules resolve to objects)
  if (objectp(resolved)) {
    program obj_prog = object_program(resolved);
    
    // Handle joinnodes first (merged module paths from multiple sources)
    // These wrap dirnodes, so check first
    if (obj_prog->is_resolv_joinnode) {
      // Return first valid path from joined modules
      array joined = ({});
      catch { joined = resolved->joined_modules || ({}); };
      foreach(joined, mixed m) {
        string path = get_module_path(m);
        if (sizeof(path)) return path;
      }
    }
    
    // Handle dirnodes (like Crypto.pmod/)
    // Pike creates these for .pmod directories
    if (obj_prog->is_resolv_dirnode) {
      // Get the dirname from the dirnode
      string dirname = "";
      catch { dirname = resolved->dirname || ""; };
      
      // Fall back to module.pmod in the directory
      if (sizeof(dirname)) {
        string module_file = combine_path(dirname, "module.pmod");
        if (file_stat(module_file)) return module_file;
        return dirname;
      }
    }
    
    // Regular object - get its program's definition
    catch {
      string path = Program.defined(obj_prog);
      if (path && sizeof(path)) return path;
    };
  }
  
  // Handle programs directly
  if (programp(resolved)) {
    catch {
      string path = Program.defined(resolved);
      if (path && sizeof(path)) return path;
    };
  }
  
  return "";
}

protected mapping handle_resolve(mapping params) {
  string module_path = params->module || "";
  string current_file = params->currentFile || "";

  if (sizeof(module_path) == 0) {
    return ([ "result": ([ "path": 0, "exists": 0 ]) ]);
  }

  // Handle local modules (starting with .)
  if (has_prefix(module_path, ".")) {
    string local_name = module_path[1..]; // Remove leading dot

    if (sizeof(current_file) > 0 && sizeof(local_name) > 0) {
      // Get directory of current file
      // If current file is /path/Crypto.pmod/RSA.pmod, dirname gives /path/Crypto.pmod
      string current_dir = dirname(current_file);

      debug("LOCAL MODULE RESOLVE: .%s\n", local_name);
      debug("  Current file: %s\n", current_file);
      debug("  Current dir:  %s\n", current_dir);

      // Try .pike file first
      string pike_file = combine_path(current_dir, local_name + ".pike");
      debug("  Trying: %s -> %s\n", pike_file, file_stat(pike_file) ? "EXISTS" : "NOT FOUND");
      if (file_stat(pike_file)) {
        return ([
          "result": ([
            "path": pike_file,
            "exists": 1
          ])
        ]);
      }

      // Try .pmod file (same directory)
      string pmod_file = combine_path(current_dir, local_name + ".pmod");
      debug("  Trying: %s -> %s\n", pmod_file, file_stat(pmod_file) ? "EXISTS" : "NOT FOUND");
      if (file_stat(pmod_file) && !file_stat(pmod_file)->isdir) {
        debug("  FOUND .pmod file: %s\n", pmod_file);
        return ([
          "result": ([
            "path": pmod_file,
            "exists": 1
          ])
        ]);
      }

      // Try .pmod directory with module.pmod
      string pmod_dir = combine_path(current_dir, local_name + ".pmod");
      if (file_stat(pmod_dir) && file_stat(pmod_dir)->isdir) {
        debug("  Found .pmod directory: %s\n", pmod_dir);
        string module_file = combine_path(pmod_dir, "module.pmod");
        if (file_stat(module_file)) {
          debug("  FOUND module.pmod: %s\n", module_file);
          return ([
            "result": ([
              "path": module_file,
              "exists": 1
            ])
          ]);
        }
        // Return directory if module.pmod doesn't exist
        debug("  FOUND directory (no module.pmod): %s\n", pmod_dir);
        return ([
          "result": ([
            "path": pmod_dir,
            "exists": 1
          ])
        ]);
      }

      debug("  NOT FOUND\n");
    } else {
      debug("LOCAL MODULE RESOLVE FAILED: current_file=%s, local_name=%s\n",
             current_file, local_name);
    }

    // Local module not found
    return ([
      "result": ([
        "path": 0,
        "exists": 0
      ])
    ]);
  }

  // For non-local modules, use Pike's native resolution
  mixed err = catch {
    mixed resolved = master()->resolv(module_path);
    if (resolved) {
      // Use native module path resolution
      string source_path = get_module_path(resolved);

      return ([
        "result": ([
          "path": sizeof(source_path) ? source_path : 0,
          "exists": sizeof(source_path) ? 1 : 0
        ])
      ]);
    }
  };

  return ([
    "result": ([
      "path": 0,
      "exists": 0
    ])
  ]);
}




protected mapping symbol_to_json(object symbol, string|void documentation) {
  string kind = get_symbol_kind(symbol);
  
  mapping result = ([
    "name": symbol->name,
    "kind": kind,
    "modifiers": symbol->modifiers || ({}),
  ]);
  
  // Add documentation if provided
  if (documentation && sizeof(documentation) > 0) {
    result->documentation = parse_autodoc(documentation);
  }
  
  // Get position
  catch {
    if (symbol->position) {
      result->position = ([
        "file": symbol->position->filename || "",
        "line": symbol->position->firstline || 1
      ]);
    }
  };
  
  // Add type-specific fields based on symbol kind
  if (kind == "method") {
    catch { 
      if (symbol->returntype) {
        // Check if the return type is an AttributeType with deprecated attribute
        // This happens when __deprecated__ keyword is used
        string class_path = "";
        catch { class_path = Program.defined(object_program(symbol->returntype)) || ""; };
        string attr_name = "";
        catch { if (symbol->returntype->attribute) attr_name = symbol->returntype->attribute; };
        string type_name = "";
        catch { if (symbol->returntype->name) type_name = symbol->returntype->name; };
        
        // Check for deprecated attribute (attribute may be quoted like "deprecated" or plain deprecated)
        if (has_value(class_path, "AttributeType") || has_value(attr_name, "deprecated") || type_name == "__attribute__") {
          if (has_value(attr_name, "deprecated")) {
            // Mark as deprecated in documentation
            if (!result->documentation) result->documentation = ([]);
            result->documentation->deprecated = "This function is deprecated.";
          }
        }
        result->returnType = type_to_json(symbol->returntype); 
      }
    };
    catch { 
      if (symbol->argnames) 
        result->argNames = symbol->argnames; 
    };
    catch { 
      if (symbol->argtypes) 
        result->argTypes = map(symbol->argtypes, type_to_json); 
    };
  } else if (kind == "variable" || kind == "constant" || kind == "typedef") {
    catch { 
      if (symbol->type) 
        result->type = type_to_json(symbol->type); 
    };
  } else if (kind == "class") {
    // Could add inherits, children later
  } else if (kind == "inherit" || kind == "import") {
    catch {
      if (symbol->classname)
        result->classname = symbol->classname;
    };
  }
  
  return result;
}

//! Parse autodoc documentation string into structured format
//! Complete rewrite to handle all autodoc tags from Pike autodoc spec
//! Uses Pike's native Tools.AutoDoc.DocParser.splitDocBlock for tokenization
protected mapping parse_autodoc(string doc) {
  mapping result = ([
    "text": "",
    "params": ([]),
    "returns": "",
    "throws": "",
    "notes": ({}),
    "bugs": ({}),
    "deprecated": "",
    "examples": ({}),
    "seealso": ({}),
    "members": ([]),
    "items": ({}),
    "arrays": ({}),
    "multisets": ({}),
    "mappings": ({})
  ]);

  // Try to use Pike's native DocParser
  mixed err = catch {
    object src_pos = Tools.AutoDoc.SourcePosition("inline", 1);
    mixed parsed = Tools.AutoDoc.DocParser.splitDocBlock(doc, src_pos);

    if (arrayp(parsed) && sizeof(parsed) > 0) {
      array tokens = parsed[0];

      // Context tracking for proper text accumulation
      string current_section = "text";  // Which section are we in (text, param, returns, etc.)
      string current_param = "";         // Which parameter name (for @param)
      string current_group = "";         // Current block group (mapping, array, dl, etc.)
      array(string) text_buffer = ({});  // Buffer for accumulating text
      array(mapping) group_stack = ({}); // Stack for nested groups
      array(mapping) group_items = ({});  // Items being collected in current group
      string group_owner = "";           // Which param/section owns the current group

      // Process all tokens
      foreach (tokens, object tok) {
        int tok_type = tok->type;
        string keyword = tok->keyword || "";
        string arg = tok->arg || "";
        string text = tok->text || "";

        // Token type constants (from Pike docs):
        // 1 = METAKEYWORD, 3 = DELIMITERKEYWORD, 4 = BEGINGROUP,
        // 6 = ENDGROUP, 7 = ENDCONTAINER, 8 = TEXTTOKEN, 9 = EOF

        if (tok_type == 8) {
          // TEXTTOKEN - Regular text content
          // Normalize whitespace: replace newlines with spaces, collapse multiple spaces
          string normalized = replace(text, "\n", " ");
          // Collapse multiple spaces into single space
          while (has_value(normalized, "  ")) {
            normalized = replace(normalized, "  ", " ");
          }
          string processed = process_inline_markup(String.trim(normalized));
          if (sizeof(processed) > 0) {

            // If we're in elem/item mode within a group, save to last group item
            if ((current_section == "elem" || current_section == "item" || current_section == "value")
                && sizeof(current_group) > 0 && sizeof(group_items) > 0) {
              // Append to the last item in the group
              mapping last_item = group_items[-1];
              if (last_item->text && sizeof(last_item->text) > 0) {
                last_item->text += " " + processed;
              } else {
                last_item->text = processed;
              }
            } else {
              // Otherwise accumulate in text buffer as normal
              text_buffer += ({ processed });
            }
          }

        } else if (tok_type == 3) {
          // DELIMITERKEYWORD - Section delimiter (@param, @returns, etc.)
          // Save previous section's accumulated text first
          save_text_buffer(result, current_section, current_param, text_buffer);
          text_buffer = ({});

          // Parse the new section
          string trimmed_arg = String.trim(arg);

          switch (keyword) {
            case "param":
              // @param can have format: "paramname" or "paramname description"
              int space_pos = search(trimmed_arg, " ");
              if (space_pos >= 0) {
                current_param = trimmed_arg[..space_pos-1];
                string param_desc = String.trim(trimmed_arg[space_pos+1..]);
                if (sizeof(param_desc) > 0) {
                  text_buffer = ({ process_inline_markup(param_desc) });
                }
              } else {
                current_param = trimmed_arg;
              }
              current_section = "param";
              if (!result->params[current_param]) {
                result->params[current_param] = "";
              }
              break;

            case "returns":
            case "return":
              current_section = "returns";
              current_param = "";
              if (sizeof(trimmed_arg) > 0) {
                text_buffer = ({ process_inline_markup(trimmed_arg) });
              }
              break;

            case "throws":
              current_section = "throws";
              current_param = "";
              if (sizeof(trimmed_arg) > 0) {
                text_buffer = ({ process_inline_markup(trimmed_arg) });
              }
              break;

            case "note":
              // Each @note starts a new note entry
              current_section = "note";
              current_param = "";
              // Always create a new note entry
              if (sizeof(trimmed_arg) > 0) {
                result->notes += ({ process_inline_markup(trimmed_arg) });
              } else {
                result->notes += ({ "" });  // Empty placeholder, text will be appended
              }
              break;

            case "bugs":
              // Each @bugs starts a new bug entry
              current_section = "bugs";
              current_param = "";
              if (sizeof(trimmed_arg) > 0) {
                result->bugs += ({ process_inline_markup(trimmed_arg) });
              } else {
                result->bugs += ({ "" });  // Empty placeholder
              }
              break;

            case "deprecated":
              current_section = "deprecated";
              current_param = "";
              if (sizeof(trimmed_arg) > 0) {
                text_buffer = ({ process_inline_markup(trimmed_arg) });
              }
              break;

            case "example":
              // Each @example starts a new example entry
              current_section = "example";
              current_param = "";
              // Examples preserve raw code, don't process markup
              if (sizeof(trimmed_arg) > 0) {
                result->examples += ({ trimmed_arg });
              } else {
                result->examples += ({ "" });  // Empty placeholder
              }
              break;

            case "seealso":
              current_section = "seealso";
              current_param = "";
              if (sizeof(trimmed_arg) > 0) {
                result->seealso += ({ process_inline_markup(trimmed_arg) });
              }
              break;

            case "member":
              // @member TYPE NAME or @member TYPE "name"
              current_section = "member";
              string mtype = "", mname = "";
              if (sscanf(trimmed_arg, "%s %s", mtype, mname) == 2) {
                mname = String.trim(replace(mname, "\"", ""));
                if (sizeof(mname) > 0) {
                  current_param = mname;
                  if (!result->members[mname]) {
                    result->members[mname] = process_inline_markup(mtype);
                  }
                }
              }
              break;

            case "elem":
            case "value":
              // @elem or @value (for arrays/multisets)
              current_section = "elem";
              if (sizeof(trimmed_arg) > 0) {
                current_param = trimmed_arg;
                // Add to group_items if we're in a group, otherwise to global items
                if (sizeof(current_group) > 0) {
                  group_items += ({ ([ "label": current_param, "text": "" ]) });
                } else {
                  result->items += ({ ([ "label": current_param, "text": "" ]) });
                }
              }
              break;

            case "item":
              // @item (for lists)
              current_section = "item";
              if (sizeof(trimmed_arg) > 0) {
                current_param = trimmed_arg;
                // Add to group_items if we're in a group, otherwise to global items
                if (sizeof(current_group) > 0) {
                  group_items += ({ ([ "label": current_param, "text": "" ]) });
                } else {
                  result->items += ({ ([ "label": current_param, "text": "" ]) });
                }
              }
              break;

            case "section":
              // @section - not commonly used, treat as note
              current_section = "note";
              current_param = "";
              if (sizeof(trimmed_arg) > 0) {
                result->notes += ({ process_inline_markup(trimmed_arg) });
              }
              break;

            default:
              // Unknown delimiter keyword - skip
              current_section = "text";
              current_param = "";
              break;
          }

        } else if (tok_type == 4) {
          // BEGINGROUP - Start of block (@mapping, @array, @dl, etc.)
          save_text_buffer(result, current_section, current_param, text_buffer);
          text_buffer = ({});

          // Push current context onto stack
          group_stack += ({ ([
            "section": current_section,
            "param": current_param,
            "group": current_group,
            "owner": group_owner,
            "items": group_items
          ]) });

          // Track which section/param owns this group using prefixed format
          if (current_section == "param" && sizeof(current_param) > 0) {
            group_owner = "param:" + current_param;
          } else if (current_section == "returns") {
            group_owner = "returns";
          } else if (current_section == "throws") {
            group_owner = "throws";
          } else if (current_section == "note") {
            group_owner = "note";
          } else {
            group_owner = "";
          }

          current_group = keyword;
          current_section = keyword;
          group_items = ({});  // Start collecting items for this group

        } else if (tok_type == 6) {
          // ENDGROUP - End of block (@endmapping, @endarray, @enddl, etc.)
          save_text_buffer(result, current_section, current_param, text_buffer);
          text_buffer = ({});

          // Store the collected group in the appropriate location
          if (sizeof(group_items) > 0) {
            // Create a structured representation of the array/mapping
            string group_text = format_group_as_text(current_group, group_items);
            
            if (has_prefix(group_owner, "param:")) {
              // This group belongs to a parameter
              string param_name = group_owner[sizeof("param:")..];
              if (!result->params[param_name]) {
                result->params[param_name] = "";
              }
              if (sizeof(result->params[param_name]) > 0) {
                result->params[param_name] += "\n\n" + group_text;
              } else {
                result->params[param_name] = group_text;
              }
            } else if (group_owner == "returns") {
              // This group belongs to the returns section
              if (sizeof(result->returns) > 0) {
                result->returns += "\n\n" + group_text;
              } else {
                result->returns = group_text;
              }
            } else if (group_owner == "throws") {
              // This group belongs to the throws section
              if (sizeof(result->throws) > 0) {
                result->throws += "\n\n" + group_text;
              } else {
                result->throws = group_text;
              }
            } else if (group_owner == "note") {
              // This group belongs to a note
              result->notes += ({ group_text });
            }
            // If no owner, the group content is lost (edge case for top-level groups)
          }

          // Pop context from stack
          if (sizeof(group_stack) > 0) {
            mapping context = group_stack[-1];
            group_stack = group_stack[..sizeof(group_stack)-2];
            current_section = context->section;
            current_param = context->param;
            current_group = context->group;
            group_owner = context->owner;
            group_items = context->items;
          } else {
            current_section = "text";
            current_param = "";
            current_group = "";
            group_owner = "";
            group_items = ({});
          }
        }

      }

      // Save any remaining text in buffer
      save_text_buffer(result, current_section, current_param, text_buffer);
    }
  };

  // Fallback if DocParser fails
  if (err) {
    debug("DocParser.splitDocBlock failed: %s\n", describe_error(err));
    array(string) lines = doc / "\n";
    array(string) text_lines = ({});
    foreach (lines, string line) {
      string trimmed = String.trim(line);
      if (!has_prefix(trimmed, "@"))
        text_lines += ({ process_inline_markup(trimmed) });
    }
    result->text = text_lines * "\n";
  }

  // Clean up empty fields
  if (sizeof(result->text) == 0) m_delete(result, "text");
  if (sizeof(result->params) == 0) m_delete(result, "params");
  if (sizeof(result->returns) == 0) m_delete(result, "returns");
  if (sizeof(result->throws) == 0) m_delete(result, "throws");
  if (sizeof(result->notes) == 0) m_delete(result, "notes");
  if (sizeof(result->bugs) == 0) m_delete(result, "bugs");
  if (sizeof(result->deprecated) == 0) m_delete(result, "deprecated");
  if (sizeof(result->examples) == 0) m_delete(result, "examples");
  if (sizeof(result->seealso) == 0) m_delete(result, "seealso");
  if (sizeof(result->members) == 0) m_delete(result, "members");
  if (sizeof(result->items) == 0) m_delete(result, "items");
  if (sizeof(result->arrays) == 0) m_delete(result, "arrays");
  if (sizeof(result->multisets) == 0) m_delete(result, "multisets");
  if (sizeof(result->mappings) == 0) m_delete(result, "mappings");

  return result;
}

//! Save accumulated text buffer to the appropriate result section
protected void save_text_buffer(mapping result, string section, string param, array(string) buffer) {
  if (sizeof(buffer) == 0) return;

  string text = buffer * " ";  // Join with spaces
  text = String.trim(text);
  if (sizeof(text) == 0) return;

  switch (section) {
    case "text":
      if (sizeof(result->text) > 0) {
        result->text += "\n\n" + text;
      } else {
        result->text = text;
      }
      break;

    case "param":
      if (param && sizeof(param) > 0) {
        if (result->params[param] && sizeof(result->params[param]) > 0) {
          result->params[param] += " " + text;
        } else {
          result->params[param] = text;
        }
      }
      break;

    case "returns":
      if (sizeof(result->returns) > 0) {
        result->returns += " " + text;
      } else {
        result->returns = text;
      }
      break;

    case "throws":
      if (sizeof(result->throws) > 0) {
        result->throws += " " + text;
      } else {
        result->throws = text;
      }
      break;

    case "deprecated":
      if (sizeof(result->deprecated) > 0) {
        result->deprecated += " " + text;
      } else {
        result->deprecated = text;
      }
      break;

    case "note":
      // Append to last note if exists, otherwise create new
      if (sizeof(result->notes) > 0) {
        // Only add space if the note already has content
        if (sizeof(result->notes[-1]) > 0) {
          result->notes[-1] += " " + text;
        } else {
          result->notes[-1] = text;
        }
      } else {
        result->notes += ({ text });
      }
      break;

    case "bugs":
      if (sizeof(result->bugs) > 0) {
        if (sizeof(result->bugs[-1]) > 0) {
          result->bugs[-1] += " " + text;
        } else {
          result->bugs[-1] = text;
        }
      } else {
        result->bugs += ({ text });
      }
      break;


    case "example":
      // Examples already added, append to last
      if (sizeof(result->examples) > 0) {
        if (sizeof(result->examples[-1]) > 0) {
          result->examples[-1] += "\n" + text;
        } else {
          result->examples[-1] = text;
        }
      } else {
        result->examples += ({ text });
      }
      break;


    case "seealso":
      if (sizeof(result->seealso) > 0) {
        result->seealso[-1] += " " + text;
      } else {
        result->seealso += ({ text });
      }
      break;

    case "member":
      if (param && sizeof(param) > 0) {
        if (result->members[param] && sizeof(result->members[param]) > 0) {
          result->members[param] += " " + text;
        } else {
          result->members[param] = text;
        }
      }
      break;

    case "elem":
    case "item":
    case "value":
      // Find and update last item in global items list
      if (sizeof(result->items) > 0) {
        mapping last_item = result->items[-1];
        if (last_item->text && sizeof(last_item->text) > 0) {
          last_item->text += " " + text;
        } else {
          last_item->text = text;
        }
      }
      break;
  }
}

//! Format a group (array/mapping/multiset) as markdown-formatted text
//! This is called when we exit a group to format its items for display
//! Returns markdown with proper nested bullet lists
protected string format_group_as_text(string group_type, array(mapping) items) {
  if (sizeof(items) == 0) return "";

  array(string) lines = ({});

  if (group_type == "array") {
    lines += ({ "**Array elements:**" });
    foreach (items, mapping item) {
      string label = item->label || "";
      string desc = item->text || "";
      if (sizeof(desc) > 0) {
        lines += ({ "  - `" + label + "` - " + desc });
      } else {
        lines += ({ "  - `" + label + "`" });
      }
    }
  } else if (group_type == "mapping") {
    lines += ({ "**Mapping members:**" });
    foreach (items, mapping item) {
      string label = item->label || "";
      string desc = item->text || "";
      if (sizeof(desc) > 0) {
        lines += ({ "  - `" + label + "` - " + desc });
      } else {
        lines += ({ "  - `" + label + "`" });
      }
    }
  } else if (group_type == "multiset") {
    lines += ({ "**Multiset values:**" });
    foreach (items, mapping item) {
      string label = item->label || "";
      string desc = item->text || "";
      if (sizeof(desc) > 0) {
        lines += ({ "  - `" + label + "` - " + desc });
      } else {
        lines += ({ "  - `" + label + "`" });
      }
    }
  } else if (group_type == "dl") {
    // Definition list
    foreach (items, mapping item) {
      string label = item->label || "";
      string desc = item->text || "";
      lines += ({ "- **" + label + "**" });
      if (sizeof(desc) > 0) {
        lines += ({ "  " + desc });
      }
    }
  } else {
    // Generic group - just list items
    foreach (items, mapping item) {
      string label = item->label || "";
      string desc = item->text || "";
      if (sizeof(desc) > 0) {
        lines += ({ "- " + label + ": " + desc });
      } else {
        lines += ({ "- " + label });
      }
    }
  }

  return lines * "\n";
}

//! Process inline markup tags in text
//! Converts Pike autodoc inline markup to markdown:
//! @i{text@} -> *text* (italic)
//! @b{text@} -> **text** (bold)
//! @tt{text@} -> `text` (code)
//! @ref{name@} -> `name` (code reference)
//! @[name] -> `name` (short ref syntax)
//! @expr{code@} -> `code` (expression)
//! @code{...@} -> ```...``` (code block)
protected string process_inline_markup(string text) {
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
      break; // Avoid infinite loop
    }
  }
  
  // @@ -> @ (escaped at-sign)
  result = replace(result, "@@", "@");
  
  return result;
}

//! Helper to replace markup tags
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

protected string get_symbol_kind(object symbol) {
  // Use sprintf %O to get a string representation that includes class name
  // Format: Tools.AutoDoc.PikeParser()->ClassName(...)
  string repr = sprintf("%O", symbol);
  
  // Extract class name from representation
  // Look for patterns like "->Class(", "->Method(", etc.
  if (has_value(repr, "->Class("))
    return "class";
  if (has_value(repr, "->Method("))
    return "method";
  if (has_value(repr, "->Variable("))
    return "variable";
  if (has_value(repr, "->Constant("))
    return "constant";
  if (has_value(repr, "->Typedef("))
    return "typedef";
  if (has_value(repr, "->Enum(") && !has_value(repr, "->EnumConstant("))
    return "enum";
  if (has_value(repr, "->EnumConstant("))
    return "enum_constant";
  if (has_value(repr, "->Inherit("))
    return "inherit";
  if (has_value(repr, "->Import("))
    return "import";
  if (has_value(repr, "->Modifier("))
    return "modifier";
  if (has_value(repr, "->Module("))
    return "module";
  if (has_value(repr, "->NameSpace("))
    return "namespace";
  
  // Fallback: check if it has method-like properties
  if (catch { return symbol->returntype ? "method" : 0; } == 0)
    return "method";
  if (catch { return symbol->type ? "variable" : 0; } == 0)
    return "variable";
    
  return "unknown";
}

protected mapping|int type_to_json(object|void type) {
  if (!type) return 0;
  
  mapping result = ([]);
  
  // Get type name (int, string, array, etc.)
  catch { 
    if (type->name) 
      result->name = type->name; 
  };
  
  // If no name, try to infer from class
  if (!result->name) {
    string class_path = "";
    catch { class_path = Program.defined(object_program(type)) || ""; };
    if (has_value(class_path, "IntType")) result->name = "int";
    else if (has_value(class_path, "StringType")) result->name = "string";
    else if (has_value(class_path, "FloatType")) result->name = "float";
    else if (has_value(class_path, "ArrayType")) result->name = "array";
    else if (has_value(class_path, "MappingType")) result->name = "mapping";
    else if (has_value(class_path, "MultisetType")) result->name = "multiset";
    else if (has_value(class_path, "FunctionType")) result->name = "function";
    else if (has_value(class_path, "ObjectType")) result->name = "object";
    else if (has_value(class_path, "ProgramType")) result->name = "program";
    else if (has_value(class_path, "MixedType")) result->name = "mixed";
    else if (has_value(class_path, "VoidType")) result->name = "void";
    else if (has_value(class_path, "ZeroType")) result->name = "zero";
    else if (has_value(class_path, "OrType")) result->name = "or";
    else if (has_value(class_path, "VarargsType")) result->name = "varargs";
    else if (has_value(class_path, "AttributeType")) {
      // AttributeType wraps another type with an attribute like __deprecated__
      // Try to extract the underlying type
      result->name = "__attribute__";
      catch {
        if (type->attribute) result->attribute = type->attribute;
      };
      catch {
        // Look for subtype in various possible field names
        if (type->subtype) return type_to_json(type->subtype);
        if (type->type) return type_to_json(type->type);
        if (type->valuetype) return type_to_json(type->valuetype);
      };
    }
    else result->name = "unknown";
  }
  
  // Special handling: if name is __attribute__, try to unwrap to get actual type
  if (result->name == "__attribute__") {
    // Try various ways to get the underlying type
    catch {
      if (type->subtype) return type_to_json(type->subtype);
    };
    catch {
      if (type->type) return type_to_json(type->type);
    };
    catch {
      if (type->valuetype) return type_to_json(type->valuetype);
    };
    // If we still can't unwrap, preserve the attribute info
    catch {
      if (type->attribute) result->attribute = type->attribute;
    };
  }
  
  // Add type-specific fields
  catch { if (type->valuetype) result->valueType = type_to_json(type->valuetype); };
  catch { if (type->indextype) result->indexType = type_to_json(type->indextype); };
  catch { if (type->argtypes) result->argTypes = map(type->argtypes, type_to_json); };
  catch { if (type->returntype) result->returnType = type_to_json(type->returntype); };
  catch { if (type->classname) result->className = type->classname; };
  catch { if (type->min) result->min = type->min; };
  catch { if (type->max) result->max = type->max; };
  catch { if (type->types) result->types = map(type->types, type_to_json); };
  
  return result;
}

//! Compile Pike code and extract type information via introspection
protected mapping handle_introspect(mapping params) {
  string code = params->code || "";
  string filename = params->filename || "input.pike";

  array diagnostics = ({});
  program compiled_prog;

  // Capture compilation errors
  void compile_error_handler(string file, int line, string msg) {
    diagnostics += ({
      ([
        "message": msg,
        "severity": "error",
        "position": ([ "file": file, "line": line ])
      ])
    });
  };

  mixed old_error_handler = master()->get_inhibit_compile_errors();
  master()->set_inhibit_compile_errors(compile_error_handler);

  // Attempt compilation
  mixed compile_err = catch {
    compiled_prog = compile_string(code, filename);
  };

  master()->set_inhibit_compile_errors(old_error_handler);

  // If compilation failed, return diagnostics
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
  evict_lru_programs();

  // Extract type information
  mapping result = introspect_program(compiled_prog);
  result->success = 1;
  result->diagnostics = diagnostics;

  return ([ "result": result ]);
}

//! Resolve stdlib module and extract symbols with documentation
protected mapping handle_resolve_stdlib(mapping params) {
  string module_path = params->module || "";

  if (sizeof(module_path) == 0) {
    return ([ "result": ([ "found": 0, "error": "No module path" ]) ]);
  }

  // Check cache
  if (stdlib_cache[module_path]) {
    cache_access_time[module_path] = time();
    return ([ "result": stdlib_cache[module_path] ]);
  }

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

  // Get program for introspection
  program prog;
  if (objectp(resolved)) {
    prog = object_program(resolved);
  } else if (programp(resolved)) {
    prog = resolved;
  } else {
    return ([ "result": ([ "found": 0, "error": "Not a program" ]) ]);
  }

  // Use native module path resolution (reuses shared helper)
  string source_path = get_module_path(resolved);

  // Introspect
  mapping introspection = introspect_program(prog);

  // Parse source file to get all exported symbols (not just introspected ones)
  if (sizeof(source_path) > 0) {
    // Read and parse the source file
    string code;
    mixed read_err = catch {
      // Clean up path - remove line number suffix if present
      string clean_path = source_path;
      if (has_value(clean_path, ":")) {
        array parts = clean_path / ":";
        // Check if last part is a number (line number)
        if (sizeof(parts) > 1 && sizeof(parts[-1]) > 0) {
          int is_line_num = 1;
          foreach(parts[-1] / "", string c) {
            if (c < "0" || c > "9") { is_line_num = 0; break; }
          }
          if (is_line_num) {
            clean_path = parts[..sizeof(parts)-2] * ":";
          }
        }
      }
      code = Stdio.read_file(clean_path);
    };

    if (code && sizeof(code) > 0) {
      // Parse the file to get all symbols using the existing parser
      mapping parse_params = ([ "code": code, "filename": source_path ]);
      mapping parse_response = handle_parse(parse_params);

      // handle_parse returns { "result": { "symbols": [...], "diagnostics": [...] } }
      if (parse_response && parse_response->result && parse_response->result->symbols && sizeof(parse_response->result->symbols) > 0) {
        array parsed_symbols = parse_response->result->symbols;

        // Merge parsed symbols into introspection
        // Add any new symbols that weren't in introspection
        if (!introspection->symbols) {
          introspection->symbols = ({});
        }

        // Create a set of introspected symbol names for quick lookup
        multiset(string) introspected_names = (multiset)(map(introspection->symbols, lambda(mapping s) { return s->name; }));

        // Add parsed symbols that weren't in introspection
        foreach(parsed_symbols, mapping sym) {
          string name = sym->name;
          if (name && !introspected_names[name]) {
            introspection->symbols += ({ sym });
            introspected_names[name] = 1;
          }
        }
      }

      // Parse documentation and merge it
      mapping docs = parse_stdlib_documentation(source_path);
      if (docs && sizeof(docs) > 0) {
        // Merge documentation into introspected symbols
        introspection = merge_documentation(introspection, docs);
      }
    }
  }

  mapping result = ([ "found": 1, "path": source_path, "module": module_path ]) + introspection;

  // Cache with LRU
  if (sizeof(stdlib_cache) >= max_stdlib_modules) {
    evict_lru_stdlib();
  }
  stdlib_cache[module_path] = result;
  cache_access_time[module_path] = time();

  return ([ "result": result ]);
}

//! Parse stdlib source file for autodoc documentation
//! Returns mapping of symbol name -> documentation mapping
protected mapping parse_stdlib_documentation(string source_path) {
  mapping docs = ([]);

  // Clean up path - remove line number suffix if present
  string clean_path = source_path;
  if (has_value(clean_path, ":")) {
    array parts = clean_path / ":";
    // Check if last part is a number (line number)
    if (sizeof(parts) > 1 && sizeof(parts[-1]) > 0) {
      int is_line_num = 1;
      foreach(parts[-1] / "", string c) {
        if (c < "0" || c > "9") { is_line_num = 0; break; }
      }
      if (is_line_num) {
        clean_path = parts[..sizeof(parts)-2] * ":";
      }
    }
  }

  // Try to read the source file
  string code;
  mixed read_err = catch {
    code = Stdio.read_file(clean_path);
  };

  if (read_err || !code || sizeof(code) == 0) {
    return docs;
  }

  // Parse using Tools.AutoDoc.PikeParser
  mixed parse_err = catch {
    // Extract autodoc comments
    mapping(int:string) autodoc_by_line = extract_autodoc_comments(code);

    // Use simple regex-based extraction for function/method documentation
    // Look for patterns like: //! @decl type name(args)
    // or autodoc blocks followed by function definitions

    array(string) lines = code / "\n";
    string current_doc = "";

    for (int i = 0; i < sizeof(lines); i++) {
      string line = lines[i];
      string trimmed = String.trim(line);

      // Collect autodoc comments
      if (has_prefix(trimmed, "//!")) {
        if (sizeof(current_doc) > 0) {
          current_doc += "\n" + trimmed[3..];
        } else {
          current_doc = trimmed[3..];
        }
        continue;
      }

      // If we have accumulated docs and hit a non-doc line, try to associate
      if (sizeof(current_doc) > 0) {
        // Look for function/method definition
        // Pattern: type name( or PIKEFUN type name(
        string name = extract_symbol_name(trimmed);
        if (sizeof(name) > 0) {
          docs[name] = parse_autodoc(current_doc);
        }
        current_doc = "";
      }
    }
  };

  return docs;
}

//! Extract symbol name from a line that might be a function definition
protected string extract_symbol_name(string line) {
  // Skip preprocessor and empty lines
  if (sizeof(line) == 0 || line[0] == '#') return "";

  // PIKEFUN type name( pattern (for C files)
  if (has_value(line, "PIKEFUN")) {
    // PIKEFUN return_type name(
    sscanf(line, "%*sPIKEFUN%*[ \t]%s%*[ \t]%s(%*s", string ret_type, string name);
    if (name) return name;
  }

  // Look for patterns like: type name( or modifiers type name(
  // Match: optional_modifiers type name(
  array(string) tokens = ({});
  string current = "";
  int paren_depth = 0;

  foreach(line / "", string c) {
    if (c == "(") {
      if (sizeof(current) > 0) tokens += ({ String.trim(current) });
      break;
    } else if (c == " " || c == "\t") {
      if (sizeof(current) > 0) {
        tokens += ({ String.trim(current) });
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
    if (sizeof(tok) > 0 && tok[0] >= 'a' && tok[0] <= 'z' || tok[0] >= 'A' && tok[0] <= 'Z' || tok[0] == '_') {
      return tok;
    }
  }

  return "";
}

//! Merge documentation into introspected symbols
protected mapping merge_documentation(mapping introspection, mapping docs) {
  if (!introspection || !docs) return introspection;

  // Merge into symbols array
  if (introspection->symbols) {
    foreach(introspection->symbols; int idx; mapping sym) {
      string name = sym->name;
      if (name && docs[name]) {
        introspection->symbols[idx] = sym + ([ "documentation": docs[name] ]);
      }
    }
  }

  // Merge into functions array
  if (introspection->functions) {
    foreach(introspection->functions; int idx; mapping sym) {
      string name = sym->name;
      if (name && docs[name]) {
        introspection->functions[idx] = sym + ([ "documentation": docs[name] ]);
      }
    }
  }

  // Merge into variables array
  if (introspection->variables) {
    foreach(introspection->variables; int idx; mapping sym) {
      string name = sym->name;
      if (name && docs[name]) {
        introspection->variables[idx] = sym + ([ "documentation": docs[name] ]);
      }
    }
  }

  return introspection;
}


//! Get inherited members from a class
protected mapping handle_get_inherited(mapping params) {
  string class_name = params->class || "";

  if (sizeof(class_name) == 0) {
    return ([ "result": ([ "found": 0, "members": ({}) ]) ]);
  }

  // Resolve class
  mixed resolved;
  catch { resolved = master()->resolv(class_name); };

  if (!resolved) {
    return ([ "result": ([ "found": 0, "members": ({}) ]) ]);
  }

  program prog = objectp(resolved) ? object_program(resolved) : resolved;
  if (!prog) {
    return ([ "result": ([ "found": 0, "members": ({}) ]) ]);
  }

  // Get inheritance list
  array inherits = ({});
  catch { inherits = Program.inherit_list(prog) || ({}); };

  array all_members = ({});

  // Introspect each parent
  foreach (inherits, program parent_prog) {
    mapping parent_info = introspect_program(parent_prog);
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

// PERF-005: Handle set_debug request
protected mapping handle_set_debug(mapping params) {
  int enable = params->enabled || 0;
  debug_mode = enable;

  return ([
    "result": ([
      "debug_mode": debug_mode,
      "message": debug_mode ? "Debug mode enabled" : "Debug mode disabled"
    ])
  ]);
}

// PERF-001: Find all occurrences of identifiers using tokenization
// This is much more accurate and faster than regex-based searching
protected mapping handle_find_occurrences(mapping params) {
  string code = params->code || "";

  array occurrences = ({});
  array(string) keywords = ({
    "if","else","elif","for","while","do","switch","case","break",
    "continue","return","goto","catch","inherit","import",
    "typeof","sscanf","gauge","spawn","foreach","lambda",
    "class","enum","typedef","constant","final","inline",
    "local","extern","static","nomask","private","protected",
    "public","variant","optional","void","zero","mixed",
    "int","float","string","array","mapping","multiset",
    "object","function","program"
  });

  mixed err = catch {
    array(string) split_tokens = Parser.Pike.split(code);
    array pike_tokens = Parser.Pike.tokenize(split_tokens);

    // Filter for identifier tokens and build position map
    foreach (pike_tokens, mixed t) {
      // Skip non-identifier tokens
      // t is a Parser.Pike.Token object with: text, line, file
      string text = t->text;
      int line = t->line;

      // Only include identifiers (not keywords, operators, literals)
      // Identifiers start with letter or underscore, contain alphanumerics
      if (sizeof(text) > 0 &&
          (text[0] >= 'a' && text[0] <= 'z' ||
           text[0] >= 'A' && text[0] <= 'Z' ||
           text[0] == '_')) {
        // Skip common Pike keywords
        int is_keyword = 0;
        if (has_value(keywords, text)) {
          is_keyword = 1;
        }
        if (!is_keyword) {
          /* Calculate character position by looking at the line */
          occurrences += ({
            ([
              "text": text,
              "line": line,
              "character": get_char_position(code, line, text)
            ])
          });
        }
      }
    }
  };

  if (err) {
    return ([
      "error": ([
        "code": -32000,
        "message": describe_error(err)
      ])
    ]);
  }

  return ([
    "result": ([
      "occurrences": occurrences
    ])
  ]);
}

// Helper to get character position of a token on a line
int get_char_position(string code, int line_no, string token_text) {
  array lines = code / "\n";
  if (line_no > 0 && line_no <= sizeof(lines)) {
    string line = lines[line_no - 1];
    int pos = search(line, token_text);
    if (pos >= 0) return pos;
  }
  return 0;
}

// PERF-002: Batch parse multiple files in a single request
// Reduces IPC overhead during workspace indexing
protected mapping handle_batch_parse(mapping params) {
  array files = params->files || ({});
  array results = ({});

  foreach (files, mapping file_info) {
    string code = file_info->code || "";
    string filename = file_info->filename || "unknown.pike";

    // Try to parse each file, continuing even if one fails
    mixed parse_err;
    mapping parse_result;

    parse_err = catch {
      parse_result = handle_parse(([
        "code": code,
        "filename": filename,
        "line": 1
      ]));
    };

    if (parse_err) {
      // On error, return result with error diagnostic
      results += ({
        ([
          "filename": filename,
          "symbols": ({}),
          "diagnostics": ({
            ([
              "severity": "error",
              "message": "Parse error: " + describe_error(parse_err),
              "position": ([
                "file": filename,
                "line": 1
              ])
            ])
          })
        ])
      });
    } else {
      // Extract results from parse response
      mapping parse_data = parse_result->result || ([]);
      results += ({
        ([
          "filename": filename,
          "symbols": parse_data->symbols || ({}),
          "diagnostics": parse_data->diagnostics || ({})
        ])
      });
    }
  }

  return ([
    "result": ([
      "results": results,
      "count": sizeof(results)
    ])
  ]);
}

//! Introspect a compiled program to extract symbols
protected mapping introspect_program(program prog) {
  mapping result = ([
    "symbols": ({}),
    "functions": ({}),
    "variables": ({}),
    "classes": ({}),
    "inherits": ({})
  ]);

  // Try to instantiate
  object instance;
  catch { instance = prog(); };

  if (!instance) {
    // Can't instantiate - just get inheritance
    array inherit_list = ({});
    catch { inherit_list = Program.inherit_list(prog) || ({}); };

    foreach (inherit_list, program parent_prog) {
      string parent_path = "";
      catch { parent_path = Program.defined(parent_prog) || ""; };
      result->inherits += ({ ([ "path": parent_path ]) });
    }

    return result;
  }

  // Get symbols
  array(string) symbol_names = ({});
  array symbol_values = ({});
  catch { symbol_names = indices(instance); };
  catch { symbol_values = values(instance); };

  // Extract each symbol
  for (int i = 0; i < sizeof(symbol_names); i++) {
    string name = symbol_names[i];
    mixed value = i < sizeof(symbol_values) ? symbol_values[i] : 0;

    string kind = "variable";
    mapping type_info = ([ "kind": "mixed" ]);

    if (functionp(value)) {
      kind = "function";
      type_info = ([ "kind": "function" ]);
      
      // Try to extract function signature from _typeof()
      mixed type_val;
      catch { type_val = _typeof(value); };
      if (type_val) {
        string type_str = sprintf("%O", type_val);
        // Parse: function(type1, type2, ... : returnType)
        int paren_start = search(type_str, "(");
        int colon_pos = search(type_str, " : ");
        if (paren_start >= 0 && colon_pos > paren_start) {
          string args_str = type_str[paren_start+1..colon_pos-1];
          string ret_str = type_str[colon_pos+3..<1];
          
          // Parse arguments (split by comma, but respect nested parens)
          array(string) arg_types = ({});
          string current = "";
          int depth = 0;
          foreach (args_str / "", string c) {
            if (c == "(" || c == "<") depth++;
            else if (c == ")" || c == ">") depth--;
            else if (c == "," && depth == 0) {
              arg_types += ({ String.trim(current) });
              current = "";
              continue;
            }
            current += c;
          }
          if (sizeof(String.trim(current)) > 0) {
            arg_types += ({ String.trim(current) });
          }
          
          // Build arguments array with placeholder names
          array(mapping) arguments = ({});
          for (int j = 0; j < sizeof(arg_types); j++) {
            string arg_type = arg_types[j];
            // Skip "void" only arguments (optional params start with "void |")
            if (arg_type == "void") continue;
            arguments += ({
              ([ "name": "arg" + (j + 1), "type": arg_type ])
            });
          }
          
          type_info->arguments = arguments;
          type_info->returnType = ret_str;
          type_info->signature = type_str;
        }
      }
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

    if (kind == "function") {
      result->functions += ({ symbol });
    } else if (kind == "variable") {
      result->variables += ({ symbol });
    } else if (kind == "class") {
      result->classes += ({ symbol });
    }
  }

  // Get inheritance
  array inherit_list = ({});
  catch { inherit_list = Program.inherit_list(prog) || ({}); };

  foreach (inherit_list, program parent_prog) {
    string parent_path = "";
    catch { parent_path = Program.defined(parent_prog) || ""; };
    result->inherits += ({ ([ "path": parent_path ]) });
  }

  return result;
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
    } else {
      break;
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

//! ============================================================================
//! UNINITIALIZED VARIABLE DETECTION
//! ============================================================================
//!
//! Detects potentially uninitialized variable usage with semantic mode:
//! - Only warns for types that would cause runtime errors when UNDEFINED
//! - int/float auto-initialize to 0, so no warning
//! - string/array/mapping/multiset/object/function/program need initialization
//!
//! Supports:
//! - Basic uninitialized use detection
//! - Branch-aware analysis (if/else, switch)
//! - Loop-aware analysis (for, while, foreach)

// Variable initialization states
constant STATE_UNINITIALIZED = 0;  // Never assigned
constant STATE_MAYBE_INIT = 1;     // Assigned in some branches only
constant STATE_INITIALIZED = 2;    // Definitely assigned
constant STATE_UNKNOWN = 3;        // Can't determine (e.g., passed by reference)

// Types that need explicit initialization (UNDEFINED would cause runtime errors)
multiset(string) NEEDS_INIT_TYPES = (<
  "string", "array", "mapping", "multiset",
  "object", "function", "program", "mixed"
>);

//! Analyze code for potentially uninitialized variable usage
//! @param params Mapping with 'code' and 'filename' keys
//! @returns Mapping with 'diagnostics' array
protected mapping handle_analyze_uninitialized(mapping params) {
  string code = params->code || "";
  string filename = params->filename || "input.pike";

  array(mapping) diagnostics = ({});

  mixed err = catch {
    diagnostics = analyze_uninitialized_impl(code, filename);
  };

  if (err) {
    debug("analyze_uninitialized error: %s\n", describe_error(err));
    // Return empty diagnostics on error rather than failing
    diagnostics = ({});
  }

  return ([
    "result": ([
      "diagnostics": diagnostics
    ])
  ]);
}

//! Implementation of uninitialized variable analysis
protected array(mapping) analyze_uninitialized_impl(string code, string filename) {
  array(mapping) diagnostics = ({});

  // Tokenize the code
  array tokens = ({});
  mixed tok_err = catch {
    array(string) split_tokens = Parser.Pike.split(code);
    tokens = Parser.Pike.tokenize(split_tokens);
  };

  if (tok_err || sizeof(tokens) == 0) {
    return diagnostics;
  }

  // Build line -> character offset mapping for accurate positions
  array(string) lines = code / "\n";

  // Analyze at function/method level
  // We'll track variables within each scope
  diagnostics = analyze_scope(tokens, lines, filename, 0, sizeof(tokens));

  return diagnostics;
}

//! Analyze a scope (global, function, or block) for uninitialized variables
//! @param tokens Array of Parser.Pike tokens
//! @param lines Source code lines for position lookup
//! @param filename Source filename
//! @param start_idx Starting token index
//! @param end_idx Ending token index (exclusive)
//! @returns Array of diagnostic mappings
protected array(mapping) analyze_scope(array tokens, array(string) lines,
                                        string filename, int start_idx, int end_idx) {
  array(mapping) diagnostics = ({});

  // Variable tracking: name -> variable info
  // Each variable has: type, state, decl_line, decl_char, needs_init, scope_depth
  mapping(string:mapping) variables = ([]);

  // Current scope depth (for nested blocks)
  int scope_depth = 0;

  // Track if we're inside a function body
  int in_function_body = 0;

  // Token index
  int i = start_idx;

  while (i < end_idx && i < sizeof(tokens)) {
    object tok = tokens[i];
    string text = tok->text;
    int line = tok->line;

    // Skip whitespace and comments
    if (sizeof(String.trim(text)) == 0 || has_prefix(text, "//") || has_prefix(text, "/*")) {
      i++;
      continue;
    }

    // Track scope depth
    if (text == "{") {
      scope_depth++;
      i++;
      continue;
    }

    if (text == "}") {
      // Remove variables that go out of scope
      remove_out_of_scope_vars(variables, scope_depth);
      scope_depth--;
      i++;
      continue;
    }

    // Detect function/method definitions
    if (is_function_definition(tokens, i, end_idx)) {
      // Skip to function body and analyze it
      int body_start = find_next_token(tokens, i, end_idx, "{");
      if (body_start >= 0) {
        int body_end = find_matching_brace(tokens, body_start, end_idx);
        if (body_end > body_start) {
          // Add function parameters as initialized variables
          mapping(string:mapping) param_vars = extract_function_params(tokens, i, body_start);

          // Analyze function body with parameters pre-initialized
          array(mapping) func_diags = analyze_function_body(
            tokens, lines, filename, body_start + 1, body_end, param_vars
          );
          diagnostics += func_diags;

          i = body_end + 1;
          continue;
        }
      }
    }

    // Detect class definitions - recurse into them
    if (text == "class") {
      int body_start = find_next_token(tokens, i, end_idx, "{");
      if (body_start >= 0) {
        int body_end = find_matching_brace(tokens, body_start, end_idx);
        if (body_end > body_start) {
          // Analyze class body (will find methods inside)
          array(mapping) class_diags = analyze_scope(
            tokens, lines, filename, body_start + 1, body_end
          );
          diagnostics += class_diags;

          i = body_end + 1;
          continue;
        }
      }
    }

    i++;
  }

  return diagnostics;
}

//! Analyze a function body for uninitialized variable usage
protected array(mapping) analyze_function_body(array tokens, array(string) lines,
                                                string filename, int start_idx, int end_idx,
                                                mapping(string:mapping) initial_vars) {
  array(mapping) diagnostics = ({});

  // Copy initial variables (function parameters)
  mapping(string:mapping) variables = copy_value(initial_vars);

  // Scope depth within this function
  int scope_depth = 1;  // We're already inside the function body

  // Stack for tracking branch states (for if/else, loops)
  array(mapping) branch_stack = ({});

  int i = start_idx;

  while (i < end_idx && i < sizeof(tokens)) {
    object tok = tokens[i];
    string text = tok->text;
    int line = tok->line;

    // Skip whitespace and comments
    if (sizeof(String.trim(text)) == 0 || has_prefix(text, "//") || has_prefix(text, "/*")) {
      i++;
      continue;
    }

    // Track scope depth
    if (text == "{") {
      scope_depth++;
      i++;
      continue;
    }

    if (text == "}") {
      remove_out_of_scope_vars(variables, scope_depth);
      scope_depth--;
      if (scope_depth <= 0) break;  // End of function body
      i++;
      continue;
    }

    // Detect variable declarations
    if (is_type_keyword(text)) {
      // Try to parse variable declaration
      mapping decl_info = try_parse_declaration(tokens, i, end_idx);
      if (decl_info && decl_info->is_declaration) {
        string var_name = decl_info->name;
        string var_type = decl_info->type;
        int has_initializer = decl_info->has_initializer;

        // Determine if this type needs initialization
        int needs_init = NEEDS_INIT_TYPES[var_type] ? 1 : 0;

        // Also check for complex types like array(int), mapping(string:int)
        if (!needs_init) {
          foreach (indices(NEEDS_INIT_TYPES), string need_type) {
            if (has_prefix(var_type, need_type + "(") ||
                has_prefix(var_type, need_type + " ")) {
              needs_init = 1;
              break;
            }
          }
        }

        // Track the variable
        variables[var_name] = ([
          "type": var_type,
          "state": has_initializer ? STATE_INITIALIZED : STATE_UNINITIALIZED,
          "decl_line": line,
          "decl_char": get_char_pos_in_line(lines, line, var_name),
          "scope_depth": scope_depth,
          "needs_init": needs_init
        ]);

        i = decl_info->end_idx;
        continue;
      }
    }

    // Detect assignments to existing variables
    if (is_identifier(text) && variables[text]) {
      // Check if this is an assignment (next non-whitespace token is =, +=, etc.)
      int next_idx = find_next_meaningful_token(tokens, i + 1, end_idx);
      if (next_idx >= 0 && next_idx < sizeof(tokens)) {
        string next_text = tokens[next_idx]->text;
        if (is_assignment_operator(next_text)) {
          // This is an assignment - mark variable as initialized
          variables[text]->state = STATE_INITIALIZED;
          i = next_idx + 1;
          continue;
        }
      }
    }

    // Detect variable usage (reading)
    if (is_identifier(text) && variables[text]) {
      mapping var_info = variables[text];

      // Check if this is a read (not an assignment target)
      int next_idx = find_next_meaningful_token(tokens, i + 1, end_idx);
      int is_read = 1;
      if (next_idx >= 0 && next_idx < sizeof(tokens)) {
        string next_text = tokens[next_idx]->text;
        if (is_assignment_operator(next_text)) {
          is_read = 0;  // This is an assignment target, not a read
        }
      }

      // Check previous token to see if we're a target of assignment
      int prev_idx = find_prev_meaningful_token(tokens, i - 1, start_idx);
      if (prev_idx >= 0) {
        // If previous token is a type, this might be a declaration
        string prev_text = tokens[prev_idx]->text;
        if (is_type_keyword(prev_text)) {
          is_read = 0;  // This is a declaration
        }
      }

      if (is_read && var_info->needs_init && var_info->state != STATE_INITIALIZED) {
        // Generate diagnostic
        string severity = var_info->state == STATE_MAYBE_INIT ? "warning" : "warning";
        string message = var_info->state == STATE_MAYBE_INIT
          ? sprintf("Variable '%s' may be uninitialized", text)
          : sprintf("Variable '%s' is used before being initialized", text);

        diagnostics += ({
          ([
            "message": message,
            "severity": severity,
            "position": ([
              "file": filename,
              "line": line,
              "character": get_char_pos_in_line(lines, line, text)
            ]),
            "variable": text,
            "source": "uninitialized-variable"
          ])
        });

        // Mark as warned to avoid duplicate diagnostics
        var_info->state = STATE_UNKNOWN;
      }
    }

    // Handle control flow: if/else
    if (text == "if") {
      // Save current variable states for branch analysis
      mapping saved_states = save_variable_states(variables);
      branch_stack += ({ ([
        "type": "if",
        "saved_states": saved_states,
        "branch_states": ({})
      ]) });
    }

    // Handle else
    if (text == "else" && sizeof(branch_stack) > 0) {
      mapping branch = branch_stack[-1];
      if (branch->type == "if") {
        // Save current branch's final states
        branch->branch_states += ({ save_variable_states(variables) });
        // Restore to pre-if states for else branch
        restore_variable_states(variables, branch->saved_states);
      }
    }

    // Handle foreach - loop variable is always initialized
    if (text == "foreach") {
      // Find the loop variable(s) in: foreach (expr, type var) or foreach (expr; type var; ...)
      int paren_start = find_next_token(tokens, i, end_idx, "(");
      if (paren_start >= 0) {
        int comma_or_semi = -1;
        int paren_close = -1;
        int paren_depth = 1;
        for (int j = paren_start + 1; j < end_idx && j < sizeof(tokens); j++) {
          string t = tokens[j]->text;
          if (t == "(") paren_depth++;
          else if (t == ")") {
            paren_depth--;
            if (paren_depth == 0) {
              paren_close = j;
              break;
            }
          }
          else if (paren_depth == 1 && (t == "," || t == ";") && comma_or_semi < 0) {
            comma_or_semi = j;
          }
        }

        if (comma_or_semi >= 0) {
          // Skip whitespace tokens after comma/semicolon
          int var_start = comma_or_semi + 1;
          while (var_start < end_idx && var_start < sizeof(tokens)) {
            string t = tokens[var_start]->text;
            if (sizeof(String.trim(t)) > 0) break;
            var_start++;
          }

          // Look for variable after comma/semicolon
          mapping loop_var = try_parse_declaration(tokens, var_start, end_idx);
          if (loop_var && loop_var->is_declaration) {
            variables[loop_var->name] = ([
              "type": loop_var->type,
              "state": STATE_INITIALIZED,  // Loop variable is always initialized
              "decl_line": tokens[var_start]->line,
              "decl_char": 0,
              "scope_depth": scope_depth + 1,
              "needs_init": 0  // Don't warn for loop variables
            ]);
          }
        }

        // Skip past the foreach parentheses to avoid re-parsing the loop variable as a declaration
        if (paren_close >= 0) {
          i = paren_close;
        }
      }
    }

    // Handle catch blocks - variables assigned in try may be uninitialized
    if (text == "catch") {
      // Find the preceding block and mark variables assigned there as MAYBE_INIT
      // This is a simplified approach - full implementation would track try/catch blocks
    }

    i++;
  }

  return diagnostics;
}

//! Check if token text is a Pike type keyword
protected int is_type_keyword(string text) {
  multiset(string) types = (<
    "int", "float", "string", "array", "mapping", "multiset",
    "object", "function", "program", "mixed", "void", "auto"
  >);
  return types[text] ? 1 : 0;
}

//! Check if token text is an identifier
protected int is_identifier(string text) {
  if (sizeof(text) == 0) return 0;
  int c = text[0];
  if (!((c >= 'a' && c <= 'z') || (c >= 'A' && c <= 'Z') || c == '_')) return 0;
  return 1;
}

//! Check if token is an assignment operator
protected int is_assignment_operator(string text) {
  multiset(string) ops = (<
    "=", "+=", "-=", "*=", "/=", "%=", "&=", "|=", "^=",
    "<<=", ">>=", "||=", "&&="
  >);
  return ops[text] ? 1 : 0;
}

//! Try to parse a variable declaration starting at token index
//! Returns mapping with: is_declaration, name, type, has_initializer, end_idx
protected mapping try_parse_declaration(array tokens, int start_idx, int end_idx) {
  if (start_idx >= end_idx || start_idx >= sizeof(tokens)) {
    return ([ "is_declaration": 0 ]);
  }

  int i = start_idx;
  string type_name = "";

  // Collect type (may be complex like "array(int)" or "mapping(string:int)")
  if (is_type_keyword(tokens[i]->text)) {
    type_name = tokens[i]->text;
    i++;

    // Check for complex type: type(...)
    if (i < end_idx && i < sizeof(tokens) && tokens[i]->text == "(") {
      int paren_depth = 1;
      type_name += "(";
      i++;
      while (i < end_idx && i < sizeof(tokens) && paren_depth > 0) {
        string t = tokens[i]->text;
        if (t == "(") paren_depth++;
        else if (t == ")") paren_depth--;
        type_name += t;
        i++;
      }
    }

    // Skip whitespace
    while (i < end_idx && i < sizeof(tokens) &&
           sizeof(String.trim(tokens[i]->text)) == 0) {
      i++;
    }

    // Next should be identifier (variable name)
    if (i < end_idx && i < sizeof(tokens) && is_identifier(tokens[i]->text)) {
      string var_name = tokens[i]->text;

      // Skip keywords that look like identifiers
      if (is_type_keyword(var_name)) {
        return ([ "is_declaration": 0 ]);
      }

      i++;

      // Check for initializer
      int has_init = 0;
      int next_meaningful = find_next_meaningful_token(tokens, i, end_idx);
      if (next_meaningful >= 0 && next_meaningful < sizeof(tokens)) {
        string next_text = tokens[next_meaningful]->text;
        if (next_text == "=") {
          has_init = 1;
          // Skip to end of statement
          i = find_next_token(tokens, next_meaningful, end_idx, ";");
          if (i < 0) i = end_idx;
        } else if (next_text == ";") {
          i = next_meaningful + 1;
        } else if (next_text == ",") {
          // Multiple declarations - just handle first one for now
          i = next_meaningful;
        }
      }

      return ([
        "is_declaration": 1,
        "name": var_name,
        "type": type_name,
        "has_initializer": has_init,
        "end_idx": i
      ]);
    }
  }

  return ([ "is_declaration": 0 ]);
}

//! Check if tokens at index represent a function definition
protected int is_function_definition(array tokens, int start_idx, int end_idx) {
  // Look for pattern: [modifiers] type name ( ... ) {
  int i = start_idx;

  // Skip modifiers
  while (i < end_idx && i < sizeof(tokens)) {
    string text = tokens[i]->text;
    if ((<"public", "private", "protected", "static", "final", "inline", "local", "optional", "variant">)[text]) {
      i++;
    } else {
      break;
    }
  }

  // Need a type
  if (i >= end_idx || i >= sizeof(tokens)) return 0;
  if (!is_type_keyword(tokens[i]->text)) return 0;
  i++;

  // Skip complex type params
  if (i < end_idx && i < sizeof(tokens) && tokens[i]->text == "(") {
    int depth = 1;
    i++;
    while (i < end_idx && i < sizeof(tokens) && depth > 0) {
      if (tokens[i]->text == "(") depth++;
      else if (tokens[i]->text == ")") depth--;
      i++;
    }
  }

  // Need an identifier (function name)
  while (i < end_idx && i < sizeof(tokens) && sizeof(String.trim(tokens[i]->text)) == 0) i++;
  if (i >= end_idx || i >= sizeof(tokens)) return 0;
  if (!is_identifier(tokens[i]->text)) return 0;
  if (is_type_keyword(tokens[i]->text)) return 0;  // Not a valid function name
  i++;

  // Need opening paren for parameter list
  while (i < end_idx && i < sizeof(tokens) && sizeof(String.trim(tokens[i]->text)) == 0) i++;
  if (i >= end_idx || i >= sizeof(tokens)) return 0;
  if (tokens[i]->text != "(") return 0;

  // Find matching close paren
  int paren_depth = 1;
  i++;
  while (i < end_idx && i < sizeof(tokens) && paren_depth > 0) {
    if (tokens[i]->text == "(") paren_depth++;
    else if (tokens[i]->text == ")") paren_depth--;
    i++;
  }

  // Next should be { for function body (or ; for declaration-only)
  while (i < end_idx && i < sizeof(tokens) && sizeof(String.trim(tokens[i]->text)) == 0) i++;
  if (i >= end_idx || i >= sizeof(tokens)) return 0;

  return tokens[i]->text == "{";
}

//! Extract function parameters as pre-initialized variables
protected mapping(string:mapping) extract_function_params(array tokens, int start_idx, int body_start) {
  mapping(string:mapping) params = ([]);

  // Find opening paren
  int paren_start = find_next_token(tokens, start_idx, body_start, "(");
  if (paren_start < 0) return params;

  // Find closing paren
  int paren_end = find_matching_paren(tokens, paren_start, body_start);
  if (paren_end < 0) return params;

  // Parse parameters between parens
  int i = paren_start + 1;
  while (i < paren_end) {
    // Skip whitespace
    while (i < paren_end && sizeof(String.trim(tokens[i]->text)) == 0) i++;
    if (i >= paren_end) break;

    // Look for: type name or type name = default
    mapping decl = try_parse_declaration(tokens, i, paren_end);
    if (decl->is_declaration) {
      params[decl->name] = ([
        "type": decl->type,
        "state": STATE_INITIALIZED,  // Parameters are always initialized
        "decl_line": tokens[i]->line,
        "decl_char": 0,
        "scope_depth": 1,
        "needs_init": 0  // Don't warn for parameters
      ]);
      i = decl->end_idx;
    } else {
      i++;
    }

    // Skip comma
    if (i < paren_end && tokens[i]->text == ",") i++;
  }

  return params;
}

//! Find the next token with given text
protected int find_next_token(array tokens, int start_idx, int end_idx, string target) {
  for (int i = start_idx; i < end_idx && i < sizeof(tokens); i++) {
    if (tokens[i]->text == target) return i;
  }
  return -1;
}

//! Find next non-whitespace token
protected int find_next_meaningful_token(array tokens, int start_idx, int end_idx) {
  for (int i = start_idx; i < end_idx && i < sizeof(tokens); i++) {
    string text = tokens[i]->text;
    if (sizeof(String.trim(text)) > 0 && !has_prefix(text, "//") && !has_prefix(text, "/*")) {
      return i;
    }
  }
  return -1;
}

//! Find previous non-whitespace token
protected int find_prev_meaningful_token(array tokens, int start_idx, int min_idx) {
  for (int i = start_idx; i >= min_idx && i >= 0; i--) {
    string text = tokens[i]->text;
    if (sizeof(String.trim(text)) > 0 && !has_prefix(text, "//") && !has_prefix(text, "/*")) {
      return i;
    }
  }
  return -1;
}

//! Find matching closing brace
protected int find_matching_brace(array tokens, int start_idx, int end_idx) {
  if (start_idx >= sizeof(tokens) || tokens[start_idx]->text != "{") return -1;

  int depth = 1;
  for (int i = start_idx + 1; i < end_idx && i < sizeof(tokens); i++) {
    string text = tokens[i]->text;
    if (text == "{") depth++;
    else if (text == "}") {
      depth--;
      if (depth == 0) return i;
    }
  }
  return -1;
}

//! Find matching closing paren
protected int find_matching_paren(array tokens, int start_idx, int end_idx) {
  if (start_idx >= sizeof(tokens) || tokens[start_idx]->text != "(") return -1;

  int depth = 1;
  for (int i = start_idx + 1; i < end_idx && i < sizeof(tokens); i++) {
    string text = tokens[i]->text;
    if (text == "(") depth++;
    else if (text == ")") {
      depth--;
      if (depth == 0) return i;
    }
  }
  return -1;
}

//! Get character position of a token in a line
protected int get_char_pos_in_line(array(string) lines, int line_no, string token_text) {
  if (line_no > 0 && line_no <= sizeof(lines)) {
    string line = lines[line_no - 1];
    int pos = search(line, token_text);
    if (pos >= 0) return pos;
  }
  return 0;
}

//! Remove variables that are going out of scope
protected void remove_out_of_scope_vars(mapping(string:mapping) variables, int scope_depth) {
  array(string) to_remove = ({});
  foreach (variables; string name; mapping info) {
    if (info->scope_depth >= scope_depth) {
      to_remove += ({ name });
    }
  }
  foreach (to_remove, string name) {
    m_delete(variables, name);
  }
}

//! Save current variable initialization states
protected mapping save_variable_states(mapping(string:mapping) variables) {
  mapping saved = ([]);
  foreach (variables; string name; mapping info) {
    saved[name] = info->state;
  }
  return saved;
}

//! Restore variable states from saved snapshot
protected void restore_variable_states(mapping(string:mapping) variables, mapping saved) {
  foreach (saved; string name; int state) {
    if (variables[name]) {
      variables[name]->state = state;
    }
  }
}

//! Get completion context at a specific position using tokenization
//! This replaces regex-based heuristics with Pike's accurate tokenizer
//! @param params mapping with: code, line (1-based), character (0-based)
//! @return mapping with: context, objectName (if member access), prefix
protected mapping handle_get_completion_context(mapping params) {
  string code = params->code || "";
  int target_line = params->line || 1;
  int target_char = params->character || 0;

  mapping result = ([
    "context": "none",
    "objectName": "",
    "prefix": "",
    "operator": ""
  ]);

  mixed err = catch {
    array(string) split_tokens = Parser.Pike.split(code);
    array pike_tokens = Parser.Pike.tokenize(split_tokens);

    // Find tokens around the cursor position
    // We need to find the token at or just before the cursor
    int token_idx = -1;
    for (int i = 0; i < sizeof(pike_tokens); i++) {
      object tok = pike_tokens[i];
      int tok_line = tok->line;
      int tok_char = get_char_position(code, tok_line, tok->text);

      // Check if this token is at or before our cursor
      if (tok_line < target_line ||
          (tok_line == target_line && tok_char <= target_char)) {
        token_idx = i;
      } else {
        break;
      }
    }

    if (token_idx == -1) {
      // Cursor is before all tokens
      result->context = "global";
      return result;
    }

    // Look at surrounding tokens to determine context
    // Scan backwards from cursor to find access operators (->, ., ::)

    // Get the current token at/before cursor
    object current_tok = pike_tokens[token_idx];
    string current_text = current_tok->text;
    int current_line = current_tok->line;
    int current_char = get_char_position(code, current_line, current_text);

    // Scan backwards to find the most recent access operator
    string found_operator = "";
    int operator_idx = -1;

    for (int i = token_idx; i >= 0; i--) {
      object tok = pike_tokens[i];
      string text = String.trim(tok->text);

      // Check if this is an access operator
      if (text == "->" || text == "." || text == "::") {
        found_operator = text;
        operator_idx = i;
        break;
      }

      // Stop at statement boundaries
      if (text == ";" || text == "{" || text == "}") {
        break;
      }
    }

    if (found_operator != "") {
      // Found an access operator - this is member/scope access
      result->operator = found_operator;

      // Find the object/module name by looking backwards from the operator
      string object_parts = "";
      for (int i = operator_idx - 1; i >= 0; i--) {
        object obj_tok = pike_tokens[i];
        string obj_text = String.trim(obj_tok->text);

        // Stop at statement boundaries or other operators
        if (sizeof(obj_text) == 0 ||
            obj_text == ";" || obj_text == "{" || obj_text == "}" ||
            obj_text == "(" || obj_text == ")" || obj_text == "," ||
            obj_text == "=" || obj_text == "==" || obj_text == "+" ||
            obj_text == "-" || obj_text == "*" || obj_text == "/" ||
            obj_text == "->" || obj_text == "::") {
          break;
        }

        // Build the object name (handling dots in qualified names)
        if (sizeof(object_parts) > 0) {
          object_parts = obj_text + object_parts;
        } else {
          object_parts = obj_text;
        }
      }

      result->objectName = object_parts;
      result->prefix = current_text;

      if (found_operator == "::") {
        result->context = "scope_access";
      } else {
        result->context = "member_access";
      }
    } else {
      // No access operator found - regular identifier completion
      result->prefix = current_text;
      result->context = "identifier";
    }
  };

  if (err) {
    debug("get_completion_context error: %s\n", describe_error(err));
  }

  return ([
    "result": result
  ]);
}

//! Reverse a string
protected string reverse(string s) {
  return Array.map(s / "", lambda(string c) { return c; }) * "";
}

int main(int argc, array(string) argv) {
  // For testing, support single-request mode
  if (argc > 1 && argv[1] == "--test") {
    // Test mode: parse various declarations
    mapping result = handle_parse(([
      "code": "int x = 5;\nstring name = \"test\";\nvoid foo(int a, string b) {}\nclass MyClass {\n  int value;\n}\narray(int) numbers;\nmapping(string:int) lookup;\n",
      "filename": "test.pike",
      "line": 1
    ]));
    write("%s\n", Standards.JSON.encode(result, Standards.JSON.HUMAN_READABLE));
    return 0;
  }
  
  if (argc > 1 && argv[1] == "--tokenize-test") {
    // Test tokenization
    mapping result = handle_tokenize(([
      "code": "int x = 5;"
    ]));
    write("%s\n", Standards.JSON.encode(result, Standards.JSON.HUMAN_READABLE));
    return 0;
  }
  
  if (argc > 1 && argv[1] == "--compile-test") {
    // Test compilation with error
    mapping result = handle_compile(([
      "code": "int x = ;",
      "filename": "test.pike"
    ]));
    write("%s\n", Standards.JSON.encode(result, Standards.JSON.HUMAN_READABLE));
    return 0;
  }
  
  // Interactive JSON-RPC mode: read requests from stdin, write responses to stdout
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
