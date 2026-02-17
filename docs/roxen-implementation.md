# Roxen Framework LSP Integration

**Status:** Production Ready | **Version:** 1.0.0 | **Date:** 2026-02-10

## Overview

This document describes the Pike LSP server's integration with the Roxen 6.1 web application framework. The implementation provides comprehensive language support for Roxen module development including symbol detection, completion, diagnostics, and documentation.

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                    VSCode Extension (vscode-pike)                │
└─────────────────────────────────────────────────────────────────┘
                               │
                               ▼
┌─────────────────────────────────────────────────────────────────┐
│                  LSP Server (pike-lsp-server)                    │
│  ┌────────────────────────────────────────────────────────────┐ │
│  │ Roxen Integration Layer                                   │ │
│  │  • detector.ts - Module detection                         │ │
│  │  • completion.ts - MODULE_/TYPE_/VAR_ completions        │ │
│  │  • diagnostics.ts - Roxen validation                       │ │
│  │  • symbols.ts - Enhanced symbol grouping                 │ │
│  │  • constants.ts - Bit-verified constant definitions      │ │
│  └────────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────────┘
                               │
                               ▼
┌─────────────────────────────────────────────────────────────────┐
│                    Pike Bridge (pike-bridge)                     │
│         JSON-RPC over stdin/stdout → Pike subprocess            │
└─────────────────────────────────────────────────────────────────┘
                               │
                               ▼
┌─────────────────────────────────────────────────────────────────┐
│              Roxen Analysis Modules (pike-scripts/)              │
│  ┌────────────────────────────────────────────────────────────┐ │
│  │ LSP.Roxen.pmod/ - Detection & Analysis                     │ │
│  │   • Roxen.pike - Main analyzer (detect, parse, validate)  │ │
│  │   • MixedContent.pike - RXML string extraction             │ │
│  │   • tests/ - Roxen-specific test suites                    │ │
│  └────────────────────────────────────────────────────────────┘ │
│  ┌────────────────────────────────────────────────────────────┐ │
│  │ LSP.RoxenStubs.pmod/ - Framework Stubs                    │ │
│  │   • Roxen.pike - RequestID, MODULE_*, TYPE_*, VAR_*      │ │
│  │   • RXML.pike - Tag, TagSet, PXml classes                 │ │
│  │   • module.pike - Module index                            │ │
│  └────────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────────┘
```

## Stub Coverage

### RequestID Class (25+ members)

**Properties:**
- Core: `variables`, `config`, `remoteaddr`, `query_string`, `method`, `protocol`, `raw_url`
- Path: `not_query`, `virtfile`, `rest_of_query`
- Timing: `time`, `hrtime`, `since`
- Connection: `host`, `realfile`, `prot`, `clientprot`, `rawauth`
- Data: `data`, `leftovers`, `misc`, `connection_misc`, `real_cookies`
- Flags: `extra_extension`, `do_not_disconnect`

**Methods:**
- `get_variables()` - Returns variables mapping
- `get_query()` - Returns query string
- `get_method()` - Returns HTTP method
- `get_protocol()` - Returns protocol version
- `set_max_cache(int)` - Sets cache timeout
- `get_max_cache()` - Gets current cache timeout
- `lower_max_cache(int)` - Decrements cache timeout
- `raise_max_cache(int)` - Increments cache timeout
- `url_base()` - Returns base URL
- `client_scheme()` - Returns URL scheme (http/https)

### Module Type Constants (22 constants)

All values bit-shifted to match Roxen 6.1 `module.h`:

| Constant | Bit | Value | Description |
|----------|-----|-------|-------------|
| `MODULE_ZERO` | - | 0 | No module type |
| `MODULE_EXTENSION` | 1<<0 | 1 | File extension module |
| `MODULE_LOCATION` | 1<<1 | 2 | Location module |
| `MODULE_URL` | 1<<2 | 4 | URL module |
| `MODULE_FILE_EXTENSION` | 1<<3 | 8 | File extension handler |
| `MODULE_TAG` | 1<<4 | 16 | RXML tag module |
| `MODULE_PARSER` | 1<<4 | 16 | Alias for MODULE_TAG |
| `MODULE_LAST` | 1<<5 | 32 | Last module |
| `MODULE_FIRST` | 1<<6 | 64 | First module |
| `MODULE_AUTH` | 1<<7 | 128 | Authentication module |
| `MODULE_MAIN_PARSER` | 1<<8 | 256 | Main parser |
| `MODULE_TYPES` | 1<<9 | 512 | Types module |
| `MODULE_DIRECTORIES` | 1<<10 | 1024 | Directories module |
| `MODULE_PROXY` | 1<<11 | 2048 | Proxy module |
| `MODULE_LOGGER` | 1<<12 | 4096 | Logger module |
| `MODULE_FILTER` | 1<<13 | 8192 | Filter module |
| `MODULE_PROVIDER` | 1<<15 | 32768 | Provider module |
| `MODULE_USERDB` | 1<<16 | 65536 | User database module |
| `MODULE_*` | 1<<27-31 | - | Deprecated, Protocol, Config, Security, Experimental |

### Type Constants (22 constants)

| Constant | Value | Description |
|----------|-------|-------------|
| `TYPE_STRING` | 1 | String variable |
| `TYPE_FILE` | 2 | File path |
| `TYPE_INT` | 3 | Integer |
| `TYPE_DIR` | 4 | Directory path |
| `TYPE_STRING_LIST` | 5 | String array |
| `TYPE_MULTIPLE_STRING` | 5 | Alias |
| `TYPE_INT_LIST` | 6 | Integer array |
| `TYPE_MULTIPLE_INT` | 6 | Alias |
| `TYPE_FLAG` | 7 | Boolean |
| `TYPE_TOGGLE` | 7 | Alias |
| `TYPE_DIR_LIST` | 9 | Directory array |
| `TYPE_FILE_LIST` | 10 | File array |
| `TYPE_LOCATION` | 11 | Location specifier |
| `TYPE_TEXT_FIELD` | 13 | Multiline text |
| `TYPE_TEXT` | 13 | Alias |
| `TYPE_PASSWORD` | 14 | Password field |
| `TYPE_FLOAT` | 15 | Floating point |
| `TYPE_MODULE` | 17 | Module reference |
| `TYPE_FONT` | 19 | Font selector |
| `TYPE_CUSTOM` | 20 | Custom type |
| `TYPE_URL` | 21 | URL variable |
| `TYPE_URL_LIST` | 22 | URL array |

### Variable Flags (8 flags)

| Flag | Bit | Value | Description |
|------|-----|-------|-------------|
| `VAR_EXPERT` | 1<<8 | 256 | Expert-only |
| `VAR_MORE` | 1<<9 | 512 | "More" section |
| `VAR_DEVELOPER` | 1<<10 | 1024 | Developer-only |
| `VAR_INITIAL` | 1<<11 | 2048 | Initial config |
| `VAR_NOT_CFIF` | 1<<12 | 4096 | Not in CFIF |
| `VAR_INVISIBLE` | 1<<13 | 8192 | Invisible |
| `VAR_PUBLIC` | 1<<14 | 16384 | Public |
| `VAR_NO_DEFAULT` | 1<<15 | 32768 | No default |

### RXML Classes

**Tag:**
- Properties: `name`, `args`, `flags`
- Flags: `FLAG_EMPTY_ELEMENT`, `FLAG_STREAM_CONTENT`, `FLAG_DONT_REPORT_RESULT`

**TagSet:**
- Methods: `add_tag()`, `get_tag()`, `remove_tag()`, `register_tag()`

**PXml:**
- Methods: `get_xml()` - returns parsed XML content

## Usage Examples

### Basic Roxen Module

```pike
inherit "module";

constant module_type = MODULE_TAG;
constant module_name = "My Tag Module";

string simpletag_mytag(mapping args, RequestID id) {
    return "Hello from my tag!";
}
```

### Module with Variables

```pike
inherit "module";
constant module_type = MODULE_LOCATION;

defvar("mountpoint", "/", TYPE_LOCATION, "Mount point", 0);
defvar("debug", 0, TYPE_FLAG, "Debug mode", VAR_EXPERT);
defvar("templates", ({}), TYPE_STRING_LIST, "Template files");
```

### Using RequestID

```pike
string handle_request(string path, RequestID id) {
    string user = id->variables["user"];
    string host = id->host;
    int cache_time = id->get_max_cache();
    id->set_max_cache(3600);
    return sprintf("User %s on %s", user, host);
}
```

### RXML Tag Definition

```pike
inherit "module";
constant module_type = MODULE_TAG;

class MyTag {
    inherit RXML.Tag;
    void create(string name, mapping args) {
        ::create(name, args);
    }
}

string simpletag_custom(mapping args, RequestID id) {
    return "Custom content";
}
```

## Completion Support

The LSP provides intelligent completions for Roxen code:

### MODULE_* Constants
Trigger: Type `MODULE_` → Shows all 22 module type constants with descriptions

### TYPE_* Constants
Trigger: Type `TYPE_` → Shows all 22 type constants with descriptions

### VAR_* Flags
Trigger: Type `VAR_` → Shows all 8 variable flags with descriptions

### defvar Snippet
Trigger: Type `defvar(` → Inserts defvar snippet with tab stops

## Diagnostic Support

Roxen-specific validation detects:

1. **Missing lifecycle callbacks** - Warns if required callbacks are missing
2. **Invalid defvar types** - Validates TYPE_* constants
3. **Module type constants** - Ensures bit-shifted values are correct
4. **Tag function signatures** - Validates simpletag_/container_ patterns

## Test Coverage

| Test Suite | Tests | Status |
|------------|-------|--------|
| Server Roxen tests | 70 | ✓ All passing |
| Roxen stubs compilation | 1 | ✓ Passing |
| Edge case tests | 15+ | ✓ All passing |
| Full test suite | 1720 | ✓ 0 failures |

## Known Limitations

1. **Stubs are not functional** - The stubs only prevent compilation errors. They don't provide runtime functionality.
2. **Position tracking** - Stub symbols appear at line 1 (not accurate positions)
3. **Real Roxen server** - Tag catalog queries require running Roxen server
4. **Custom tag types** - Only standard RXML.Tag patterns are detected

## File Structure

```
pike-scripts/LSP.pmod/
├── Roxen.pmod/                 # Roxen analyzer module
│   ├── Roxen.pike              # Main detection/parsing logic
│   ├── MixedContent.pike       # RXML string extraction
│   └── tests/                  # Roxen-specific tests
└── RoxenStubs.pmod/            # Framework stubs
    ├── Roxen.pike              # RequestID, constants
    ├── RXML.pike               # Tag, TagSet, PXml
    └── module.pike             # Module index

packages/pike-lsp-server/src/features/roxen/
├── detector.ts                 # Module detection
├── completion.ts               # Completions
├── diagnostics.ts              # Validation diagnostics
├── symbols.ts                  # Enhanced symbols
├── constants.ts                # Constant definitions
├── types.ts                    # TypeScript types
└── tests/                      # Test suites
```

## Version History

- **v1.0.0** (2026-02-10) - Production release with 5 iterations of refinement
  - Complete MODULE_*, TYPE_*, VAR_* constants
  - Expanded RequestID with 25+ members
  - RXML.Tag and TagSet with full API
  - 1720 tests passing
  - Edge case coverage
