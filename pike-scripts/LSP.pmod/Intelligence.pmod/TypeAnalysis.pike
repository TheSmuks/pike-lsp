//! TypeAnalysis.pike - Type inheritance and AutoDoc parsing handlers
//!
//! This file provides handlers for type inheritance traversal and AutoDoc
//! documentation parsing using Pike's native Tools.AutoDoc.DocParser.
//!
//! Design pattern:
//! - create(object ctx) constructor for context injection
//! - Handlers wrap errors in catch blocks with LSPError responses
//! - Uses LSP.Compat.trim_whites() for string operations
//! - Uses helper functions from module.pmod (process_inline_markup) for markdown conversion

private object context;

//! Create a new TypeAnalysis instance
//! @param ctx Optional context object (reserved for future use)
void create(object ctx) {
    context = ctx;
}

//! Get inherited members from a class
//!
//! Retrieves inherited members from parent classes using Program.inherit_list().
//!
//! @param params Mapping with "class" key (fully qualified class name)
//! @returns Mapping with "result" containing inherited members
//!
//! Per CONTEXT.md decision:
//! - Errors in class resolution return empty result (not crash)
//! - Handles both object and program resolutions
//!
//! Note: Basic inheritance traversal (no cycle detection yet)
//! - Current implementation handles typical shallow inheritance chains
//! - Cycle detection can be added in future enhancement
mapping handle_get_inherited(mapping params) {
    mixed err = catch {
        string class_name = params->class || "";

        if (sizeof(class_name) == 0) {
            return ([ "result": ([ "found": 0, "members": ({}) ]) ]);
        }

        // Resolve class using master()->resolv()
        mixed resolved;
        mixed resolve_err = catch {
            resolved = master()->resolv(class_name);
        };

        if (resolve_err || !resolved) {
            // Per CONTEXT.md: resolution failure returns empty result, not error
            return ([ "result": ([ "found": 0, "members": ({}) ]) ]);
        }

        // Handle both object and program
        program prog;
        if (objectp(resolved)) {
            prog = object_program(resolved);
        } else if (programp(resolved)) {
            prog = resolved;
        } else {
            return ([ "result": ([ "found": 0, "members": ({}) ]) ]);
        }

        if (!prog) {
            return ([ "result": ([ "found": 0, "members": ({}) ]) ]);
        }

        // Get inheritance list using Program.inherit_list()
        array inherits = ({});
        catch { inherits = Program.inherit_list(prog) || ({}); };

        array all_members = ({});

        // Introspect each parent program - call sibling Introspection class
        foreach (inherits, program parent_prog) {
            mapping parent_info = ([]);

            // Try to use Introspection class
            mixed intro_err = catch {
                program IntroClass = master()->resolv("LSP.Intelligence.Introspection");
                if (IntroClass) {
                    object intro_instance = IntroClass(context);
                    parent_info = intro_instance->introspect_program(parent_prog);
                }
            };

            if (intro_err || sizeof(parent_info) == 0) {
                // Fallback: basic introspection
                parent_info = ([
                    "symbols": ({}),
                    "functions": ({}),
                    "variables": ({}),
                    "classes": ({}),
                    "inherits": ({})
                ]);
            }

            all_members += parent_info->symbols || ({});
        }

        return ([
            "result": ([
                "found": 1,
                "members": all_members,
                "inherit_count": sizeof(inherits)
            ])
        ]);
    };

    if (err) {
        return LSP.module.LSPError(-32000, describe_error(err))->to_response();
    }
}

//! Parse autodoc documentation string into structured format
//!
//! Uses Pike's native Tools.AutoDoc.DocParser.splitDocBlock for tokenization.
//! Processes AutoDoc markup tags (@param, @returns, @throws, etc.) into
//! structured documentation.
//!
//! @param doc The raw autodoc documentation string
//! @returns Mapping with structured documentation fields
//!
//! Token type constants (Pitfall 3 from RESEARCH.md):
//! 1 = METAKEYWORD, 3 = DELIMITERKEYWORD, 4 = BEGINGROUP,
//! 6 = ENDGROUP, 7 = ENDCONTAINER, 8 = TEXTTOKEN, 9 = EOF
mapping parse_autodoc(string doc) {
    mixed err = catch {
        return parse_autodoc_impl(doc);
    };

    // Fallback: return basic text on error
    if (err) {
        return ([ "text": doc ]);
    }
}

//! Internal implementation of parse_autodoc
protected mapping parse_autodoc_impl(string doc) {
    // Get helper function from module.pmod
    program module_program = master()->resolv("LSP.Intelligence.module");
    function process_inline_markup = 0;
    if (module_program) {
        process_inline_markup = module_program->process_inline_markup;
    }

    mapping result = ([
        "text": "",
        "params": ([]),
        "returns": "",
        "throws": "",
        "notes": ({}),
        "bugs": ({}),
        "deprecated": "",
        "obsolete": "",
        "examples": ({}),
        "seealso": ({}),
        "copyright": ({}),
        "thanks": ({}),
        "fixme": ({}),
        "members": ([]),
        "constants": ([]),
        "items": ({}),
        "indexes": ({}),
        "arrays": ({}),
        "multisets": ({}),
        "mappings": ({}),
        "types": ({})
    ]);

    // Try to use Pike's native DocParser
    object src_pos = Tools.AutoDoc.SourcePosition("inline", 1);
    mixed parsed = Tools.AutoDoc.DocParser.splitDocBlock(doc, src_pos);

    if (arrayp(parsed) && sizeof(parsed) > 0) {
        array tokens = parsed[0];

        // Context tracking for proper text accumulation
        string current_section = "text";  // Which section are we in
        string current_param = "";         // Which parameter name (for @param)
        string current_group = "";         // Current block group
        array(string) text_buffer = ({});  // Buffer for accumulating text
        array(mapping) group_stack = ({}); // Stack for nested groups
        array(mapping) group_items = ({});  // Items being collected in current group
        string group_owner = "";           // Which param/section owns the current group
        array(string) param_order = ({});  // Track parameter order for signature display
        int ignoring = 0;                  // Track @ignore/@endignore state

        // Process all tokens
        foreach (tokens, object tok) {
            int tok_type = tok->type;
            string keyword = tok->keyword || "";
            string arg = tok->arg || "";
            string text = tok->text || "";

            // Skip processing while ignoring (except for @endignore which stops ignoring)
            if (ignoring && !(tok_type == 6 && keyword == "endignore")) {
                continue;
            }

            if (tok_type == 8) {
                // TEXTTOKEN - Regular text content
                string normalized = replace(text, "\n", " ");
                // Collapse multiple spaces into single space
                while (has_value(normalized, "  ")) {
                    normalized = replace(normalized, "  ", " ");
                }
                string processed = process_inline_markup ?
                    process_inline_markup(LSP.Compat.trim_whites(normalized)) :
                    LSP.Compat.trim_whites(normalized);
                if (sizeof(processed) > 0) {
                    // If we're in elem/item mode within a group, save to last group item
                    if ((current_section == "elem" || current_section == "item" || current_section == "value")
                        && sizeof(current_group) > 0 && sizeof(group_items) > 0) {
                        mapping last_item = group_items[-1];
                        if (last_item->text && sizeof(last_item->text) > 0) {
                            last_item->text += " " + processed;
                        } else {
                            last_item->text = processed;
                        }
                    } else {
                        text_buffer += ({ processed });
                    }
                }

            } else if (tok_type == 3) {
                // DELIMITERKEYWORD - Section delimiter (@param, @returns, etc.)
                save_text_buffer(result, current_section, current_param, text_buffer);
                text_buffer = ({});

                string trimmed_arg = LSP.Compat.trim_whites(arg);

                switch (keyword) {
                    case "param":
                        // @param can have format: "paramname" or "paramname description"
                        int space_pos = search(trimmed_arg, " ");
                        if (space_pos >= 0) {
                            current_param = trimmed_arg[..space_pos-1];
                            string param_desc = LSP.Compat.trim_whites(trimmed_arg[space_pos+1..]);
                            if (sizeof(param_desc) > 0) {
                                string processed = process_inline_markup ?
                                    process_inline_markup(param_desc) : param_desc;
                                text_buffer = ({ processed });
                            }
                        } else {
                            current_param = trimmed_arg;
                        }
                        current_section = "param";
                        if (!result->params[current_param]) {
                            result->params[current_param] = "";
                            // Track parameter order for proper signature display
                            param_order += ({ current_param });
                        }
                        break;

                    case "returns":
                    case "return":
                        current_section = "returns";
                        current_param = "";
                        if (sizeof(trimmed_arg) > 0) {
                            string processed = process_inline_markup ?
                                process_inline_markup(trimmed_arg) : trimmed_arg;
                            text_buffer = ({ processed });
                        }
                        break;

                    case "throws":
                        current_section = "throws";
                        current_param = "";
                        if (sizeof(trimmed_arg) > 0) {
                            string processed = process_inline_markup ?
                                process_inline_markup(trimmed_arg) : trimmed_arg;
                            text_buffer = ({ processed });
                        }
                        break;

                    case "note":
                        current_section = "note";
                        current_param = "";
                        if (sizeof(trimmed_arg) > 0) {
                            string processed = process_inline_markup ?
                                process_inline_markup(trimmed_arg) : trimmed_arg;
                            result->notes += ({ processed });
                        } else {
                            result->notes += ({ "" });
                        }
                        break;

                    case "bugs":
                        current_section = "bugs";
                        current_param = "";
                        if (sizeof(trimmed_arg) > 0) {
                            string processed = process_inline_markup ?
                                process_inline_markup(trimmed_arg) : trimmed_arg;
                            result->bugs += ({ processed });
                        } else {
                            result->bugs += ({ "" });
                        }
                        break;

                    case "deprecated":
                        current_section = "deprecated";
                        current_param = "";
                        if (sizeof(trimmed_arg) > 0) {
                            string processed = process_inline_markup ?
                                process_inline_markup(trimmed_arg) : trimmed_arg;
                            text_buffer = ({ processed });
                        }
                        break;

                    case "example":
                        current_section = "example";
                        current_param = "";
                        if (sizeof(trimmed_arg) > 0) {
                            result->examples += ({ trimmed_arg });
                        } else {
                            result->examples += ({ "" });
                        }
                        break;

                    case "seealso":
                        current_section = "seealso";
                        current_param = "";
                        if (sizeof(trimmed_arg) > 0) {
                            string processed = process_inline_markup ?
                                process_inline_markup(trimmed_arg) : trimmed_arg;
                            result->seealso += ({ processed });
                        }
                        break;

                    case "member":
                        current_section = "member";
                        // Use Pike's native parser for robust type parsing
                        // Get position from current token if available
                        object parser_pos = tok->position || Tools.AutoDoc.SourcePosition("autodoc", 1);

                        mixed err = catch {
                            object member_parser = Tools.AutoDoc.PikeParser(trimmed_arg, parser_pos);
                            object mtype_obj = member_parser->parseOrType();

                            if (mtype_obj) {
                                // Get the member name - could be literal ("key") or identifier (key)
                                string mname = member_parser->parseLiteral() || member_parser->parseIdents();

                                if (mname) {
                                    mname = LSP.Compat.trim_whites(replace(mname, "\"", ""));
                                    current_param = mname;

                                    // Store type as XML string (from Pike's type system)
                                    string type_xml = mtype_obj->xml();
                                    string processed = process_inline_markup ?
                                        process_inline_markup(type_xml) : type_xml;

                                    if (sizeof(current_group) > 0) {
                                        // Inside a @mapping block
                                        string label = "\"" + mname + "\" (" + processed + ")";
                                        group_items += ({ ([ "label": label, "text": "" ]) });
                                    } else if (!result->members[mname]) {
                                        // Store as string->string (not structured object)
                                        result->members[mname] = processed;
                                    }
                                }

                                // Ensure we consumed all input
                                member_parser->eat(Tools.AutoDoc.PikeParser.EOF);
                            }
                        };

                        // Fallback to simple parsing on error
                        if (err) {
                            string mtype = "", mname = "";
                            if (sscanf(trimmed_arg, "%s %s", mtype, mname) == 2) {
                                mname = LSP.Compat.trim_whites(replace(mname, "\"", ""));
                                if (sizeof(mname) > 0) {
                                    current_param = mname;
                                    string processed = process_inline_markup ?
                                        process_inline_markup(mtype) : mtype;
                                    if (sizeof(current_group) > 0) {
                                        string label = "\"" + mname + "\" (" + processed + ")";
                                        group_items += ({ ([ "label": label, "text": "" ]) });
                                    } else if (!result->members[mname]) {
                                        result->members[mname] = processed;
                                    }
                                }
                            }
                        }
                        break;

                    case "elem":
                        current_section = "elem";
                        if (sizeof(trimmed_arg) > 0) {
                            // Get position from current token if available
                            object parser_pos = tok->position || Tools.AutoDoc.SourcePosition("autodoc", 1);

                            mixed err = catch {
                                object elem_parser = Tools.AutoDoc.PikeParser(trimmed_arg, parser_pos);

                                // Parse the type (may be a union type)
                                object etype_obj = elem_parser->parseOrType();
                                if (!etype_obj) {
                                    // If no type found, treat entire arg as index
                                    elem_parser = Tools.AutoDoc.PikeParser(trimmed_arg, parser_pos);
                                    string eindex = elem_parser->parseLiteral() || elem_parser->parseIdents();
                                    if (eindex) {
                                        current_param = eindex;
                                        if (sizeof(current_group) > 0) {
                                            group_items += ({ ([ "label": eindex, "text": "" ]) });
                                        } else {
                                            result->items += ({ ([ "label": eindex, "text": "" ]) });
                                        }
                                    }
                                    elem_parser->eat(Tools.AutoDoc.PikeParser.EOF);
                                    break;
                                }

                                // Check for varargs (...)
                                if (elem_parser->peekToken() == "...") {
                                    // PikeParser doesn't have a built-in VarargsType, so we track it manually
                                    etype_obj = etype_obj;  // Will be marked as varargs in label
                                    elem_parser->eat("...");
                                }

                                // Parse the index - could be literal or identifier
                                string eindex = elem_parser->parseLiteral() || elem_parser->parseIdents();
                                string emax = "";

                                // Check for range (..)
                                if (elem_parser->peekToken() == "..") {
                                    elem_parser->eat("..");
                                    emax = elem_parser->parseLiteral() || elem_parser->parseIdents();
                                }

                                elem_parser->eat(Tools.AutoDoc.PikeParser.EOF);

                                // Format the label
                                string type_str = etype_obj->xml();
                                string elem_label = "";
                                string processed_type = process_inline_markup ?
                                    process_inline_markup(type_str) : type_str;

                                if (emax) {
                                    // Range: "0 .. 10 (int)"
                                    elem_label = eindex + " .. " + emax + " (" + processed_type + ")";
                                } else if (eindex) {
                                    // Simple: "0 (int)"
                                    elem_label = eindex + " (" + processed_type + ")";
                                } else {
                                    // Type only
                                    elem_label = processed_type;
                                }

                                current_param = elem_label;
                                if (sizeof(current_group) > 0) {
                                    group_items += ({ ([ "label": elem_label, "text": "" ]) });
                                } else {
                                    result->items += ({ ([ "label": elem_label, "text": "" ]) });
                                }
                            };

                            // Fallback to simple parsing on error
                            if (err) {
                                array(string) parts = trimmed_arg / " ";
                                string elem_type = "", elem_index = "";
                                if (sizeof(parts) >= 2) {
                                    elem_index = parts[-1];
                                    elem_type = parts[..<1] * " ";
                                } else {
                                    elem_index = trimmed_arg;
                                }
                                string elem_label = elem_index;
                                if (sizeof(elem_type) > 0) {
                                    string processed = process_inline_markup ?
                                        process_inline_markup(elem_type) : elem_type;
                                    elem_label = elem_index + " (" + processed + ")";
                                }
                                current_param = elem_label;
                                if (sizeof(current_group) > 0) {
                                    group_items += ({ ([ "label": elem_label, "text": "" ]) });
                                } else {
                                    result->items += ({ ([ "label": elem_label, "text": "" ]) });
                                }
                            }
                        }
                        break;

                    case "value":
                        // @value val - just use the value as-is
                        current_section = "elem";
                        if (sizeof(trimmed_arg) > 0) {
                            current_param = trimmed_arg;
                            if (sizeof(current_group) > 0) {
                                group_items += ({ ([ "label": current_param, "text": "" ]) });
                            } else {
                                result->items += ({ ([ "label": current_param, "text": "" ]) });
                            }
                        }
                        break;

                    case "item":
                        current_section = "item";
                        if (sizeof(trimmed_arg) > 0) {
                            current_param = trimmed_arg;
                            if (sizeof(current_group) > 0) {
                                group_items += ({ ([ "label": current_param, "text": "" ]) });
                            } else {
                                result->items += ({ ([ "label": current_param, "text": "" ]) });
                            }
                        }
                        break;

                    case "section":
                        current_section = "note";
                        current_param = "";
                        if (sizeof(trimmed_arg) > 0) {
                            string processed = process_inline_markup ?
                                process_inline_markup(trimmed_arg) : trimmed_arg;
                            result->notes += ({ processed });
                        }
                        break;

                    case "obsolete":
                        current_section = "obsolete";
                        current_param = "";
                        if (sizeof(trimmed_arg) > 0) {
                            string processed = process_inline_markup ?
                                process_inline_markup(trimmed_arg) : trimmed_arg;
                            text_buffer = ({ processed });
                        }
                        break;

                    case "copyright":
                        current_section = "copyright";
                        current_param = "";
                        if (sizeof(trimmed_arg) > 0) {
                            string processed = process_inline_markup ?
                                process_inline_markup(trimmed_arg) : trimmed_arg;
                            result->copyright += ({ processed });
                        } else {
                            result->copyright += ({ "" });
                        }
                        break;

                    case "thanks":
                        current_section = "thanks";
                        current_param = "";
                        if (sizeof(trimmed_arg) > 0) {
                            string processed = process_inline_markup ?
                                process_inline_markup(trimmed_arg) : trimmed_arg;
                            result->thanks += ({ processed });
                        } else {
                            result->thanks += ({ "" });
                        }
                        break;

                    case "fixme":
                        current_section = "fixme";
                        current_param = "";
                        if (sizeof(trimmed_arg) > 0) {
                            string processed = process_inline_markup ?
                                process_inline_markup(trimmed_arg) : trimmed_arg;
                            result->fixme += ({ processed });
                        } else {
                            result->fixme += ({ "" });
                        }
                        break;

                    case "constant":
                        current_section = "constant";
                        // Parse "type name" format
                        string ctype = "", cname = "";
                        if (sscanf(trimmed_arg, "%s %s", ctype, cname) == 2) {
                            cname = LSP.Compat.trim_whites(cname);
                            if (sizeof(cname) > 0) {
                                current_param = cname;
                                string processed = process_inline_markup ?
                                    process_inline_markup(ctype) : ctype;
                                result->constants[cname] = processed;
                            }
                        }
                        break;

                    case "index":
                        current_section = "index";
                        if (sizeof(trimmed_arg) > 0) {
                            current_param = trimmed_arg;
                            if (sizeof(current_group) > 0) {
                                group_items += ({ ([ "label": trimmed_arg, "text": "" ]) });
                            } else {
                                result->indexes += ({ ([ "label": trimmed_arg, "text": "" ]) });
                            }
                        }
                        break;

                    case "type":
                        current_section = "type";
                        if (sizeof(trimmed_arg) > 0) {
                            string processed = process_inline_markup ?
                                process_inline_markup(trimmed_arg) : trimmed_arg;
                            result->types += ({ processed });
                        }
                        break;

                    default:
                        current_section = "text";
                        current_param = "";
                        break;
                }

            } else if (tok_type == 7) {
                // ENDCONTAINER - @ignore directive
                if (keyword == "ignore") {
                    ignoring = 1;
                }
                // Other ENDCONTAINER types (like @return) are handled above

            } else if (tok_type == 6) {
                // ENDGROUP - End of block OR @endignore directive
                if (keyword == "endignore") {
                    ignoring = 0;
                } else if (!ignoring) {
                    // Only process group end if we're not ignoring
                    save_text_buffer(result, current_section, current_param, text_buffer);
                    text_buffer = ({});

                    // Store the collected group in the appropriate location
                    if (sizeof(group_items) > 0) {
                        string group_text = format_group_as_text(current_group, group_items);

                        if (has_prefix(group_owner, "param:")) {
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
                            if (sizeof(result->returns) > 0) {
                                result->returns += "\n\n" + group_text;
                            } else {
                                result->returns = group_text;
                            }
                        } else if (group_owner == "throws") {
                            if (sizeof(result->throws) > 0) {
                                result->throws += "\n\n" + group_text;
                            } else {
                                result->throws = group_text;
                            }
                        } else if (group_owner == "note") {
                            result->notes += ({ group_text });
                        }
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

                // Track which section/param owns this group
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
                group_items = ({});
            }
        }

        // Save any remaining text in buffer
        save_text_buffer(result, current_section, current_param, text_buffer);

        // Add paramOrder if we have parameters
        if (sizeof(param_order) > 0) {
            result->paramOrder = param_order;
        }
    }

    // Clean up empty fields
    if (sizeof(result->text) == 0) m_delete(result, "text");
    if (sizeof(result->params) == 0) m_delete(result, "params");
    if (sizeof(result->returns) == 0) m_delete(result, "returns");
    if (sizeof(result->throws) == 0) m_delete(result, "throws");
    if (sizeof(result->notes) == 0) m_delete(result, "notes");
    if (sizeof(result->bugs) == 0) m_delete(result, "bugs");
    if (sizeof(result->deprecated) == 0) m_delete(result, "deprecated");
    if (sizeof(result->obsolete) == 0) m_delete(result, "obsolete");
    if (sizeof(result->examples) == 0) m_delete(result, "examples");
    if (sizeof(result->seealso) == 0) m_delete(result, "seealso");
    if (sizeof(result->copyright) == 0) m_delete(result, "copyright");
    if (sizeof(result->thanks) == 0) m_delete(result, "thanks");
    if (sizeof(result->fixme) == 0) m_delete(result, "fixme");
    if (sizeof(result->members) == 0) m_delete(result, "members");
    if (sizeof(result->constants) == 0) m_delete(result, "constants");
    if (sizeof(result->items) == 0) m_delete(result, "items");
    if (sizeof(result->indexes) == 0) m_delete(result, "indexes");
    if (sizeof(result->arrays) == 0) m_delete(result, "arrays");
    if (sizeof(result->multisets) == 0) m_delete(result, "multisets");
    if (sizeof(result->mappings) == 0) m_delete(result, "mappings");
    if (sizeof(result->types) == 0) m_delete(result, "types");

    return result;
}

//! Save accumulated text buffer to the appropriate result section
protected void save_text_buffer(mapping result, string section, string param, array(string) buffer) {
    if (sizeof(buffer) == 0) return;

    string text = buffer * " ";  // Join with spaces
    text = LSP.Compat.trim_whites(text);
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
            if (sizeof(result->notes) > 0) {
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
        foreach (items, mapping item) {
            string label = item->label || "";
            string desc = item->text || "";
            lines += ({ "- **" + label + "**" });
            if (sizeof(desc) > 0) {
                lines += ({ "  " + desc });
            }
        }
    } else if (group_type == "int") {
        lines += ({ "**Integer ranges:**" });
        foreach (items, mapping item) {
            string label = item->label || "";
            string desc = item->text || "";
            if (sizeof(desc) > 0) {
                lines += ({ "  - `" + label + "` - " + desc });
            } else {
                lines += ({ "  - `" + label + "`" });
            }
        }
    } else if (group_type == "string") {
        lines += ({ "**String values:**" });
        foreach (items, mapping item) {
            string label = item->label || "";
            string desc = item->text || "";
            if (sizeof(desc) > 0) {
                lines += ({ "  - `" + label + "` - " + desc });
            } else {
                lines += ({ "  - `" + label + "`" });
            }
        }
    } else if (group_type == "mixed") {
        lines += ({ "**Mixed types:**" });
        foreach (items, mapping item) {
            string label = item->label || "";
            string desc = item->text || "";
            if (sizeof(desc) > 0) {
                lines += ({ "  - " + label + " - " + desc });
            } else {
                lines += ({ "  - " + label });
            }
        }
    } else if (group_type == "section") {
        // @section - first item is the section title
        if (sizeof(items) > 0) {
            string title = items[0]->label || "";
            lines += ({ "### " + title });
            // Add remaining items as content
            for (int i = 1; i < sizeof(items); i++) {
                string label = items[i]->label || "";
                string desc = items[i]->text || "";
                if (sizeof(desc) > 0) {
                    lines += ({ label + " " + desc });
                } else if (sizeof(label) > 0) {
                    lines += ({ label });
                }
            }
        }
    } else if (group_type == "ul") {
        // @ul - unordered list
        foreach (items, mapping item) {
            string label = item->label || "";
            string desc = item->text || "";
            if (sizeof(desc) > 0) {
                lines += ({ "- " + label + " " + desc });
            } else {
                lines += ({ "- " + label });
            }
        }
    } else if (group_type == "ol") {
        // @ol - ordered list
        int counter = 1;
        foreach (items, mapping item) {
            string label = item->label || "";
            string desc = item->text || "";
            if (sizeof(desc) > 0) {
                lines += ({ counter + ". " + label + " " + desc });
            } else {
                lines += ({ counter + ". " + label });
            }
            counter++;
        }
    } else if (group_type == "code") {
        // @code - code block
        lines += ({ "```" });
        foreach (items, mapping item) {
            string label = item->label || "";
            string desc = item->text || "";
            if (sizeof(desc) > 0) {
                lines += ({ label + " " + desc });
            } else {
                lines += ({ label });
            }
        }
        lines += ({ "```" });
    } else {
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
