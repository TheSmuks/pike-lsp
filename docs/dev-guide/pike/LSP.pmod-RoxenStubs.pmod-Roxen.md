---
id: pike-LSP.pmod-RoxenStubs.pmod-Roxen
title: LSP.pmod/RoxenStubs.pmod/Roxen.pike
description: Development guide for LSP.pmod/RoxenStubs.pmod/Roxen.pike
---

# LSP.pmod/RoxenStubs.pmod/Roxen.pike

## Overview

Roxen.pike - Stub module for Roxen framework LSP support

This provides minimal stub implementations of Roxen framework classes

to allow Pike code using Roxen APIs to compile during LSP analysis.

These stubs are NOT functional at runtime - they only exist to prevent

compilation errors during LSP analysis. The real Roxen framework provides

the actual implementations at runtime in the Roxen environment.

RequestID stub - represents a Roxen HTTP request object

In the real Roxen framework, this provides access to request data

Stub properties - commonly used RequestID members

Additional commonly used RequestID properties

Stub methods - RequestID commonly used methods

Common Roxen module type constants

These match the bit-shifted values from Roxen 6.1 module.h

module - Base class for Roxen modules

Roxen modules inherit from this to register with the Roxen framework

Stub implementation - actual Roxen modules inherit this

Module configuration variables

Called when the module is loaded

Register a configuration variable (simplified stub)

Common Roxen type constants (matching Roxen 6.1 module.h)

Additional types for compatibility with older code

Common Roxen variable flags

These match the bit-shifted values from Roxen 6.1 module.h

## Symbols

| Symbol | Type | Line |
|--------|------|------|
| `RequestID` | class | 12 |
| `module` | class | 85 |
| `MODULE_ZERO` | constant | 58 |
| `MODULE_EXTENSION` | constant | 59 |
| `MODULE_LOCATION` | constant | 60 |
| `MODULE_URL` | constant | 61 |
| `MODULE_FILE_EXTENSION` | constant | 62 |
| `MODULE_TAG` | constant | 63 |
| `MODULE_PARSER` | constant | 64 |
| `MODULE_LAST` | constant | 65 |
| `MODULE_FIRST` | constant | 66 |
| `MODULE_AUTH` | constant | 67 |
| `MODULE_MAIN_PARSER` | constant | 68 |
| `MODULE_TYPES` | constant | 69 |
| `MODULE_DIRECTORIES` | constant | 70 |
| `MODULE_PROXY` | constant | 71 |
| `MODULE_LOGGER` | constant | 72 |
| `MODULE_FILTER` | constant | 73 |
| `MODULE_PROVIDER` | constant | 74 |
| `MODULE_USERDB` | constant | 75 |
| `MODULE_DEPRECATED` | constant | 76 |
| `MODULE_PROTOCOL` | constant | 77 |
| `MODULE_CONFIG` | constant | 78 |
| `MODULE_SECURITY` | constant | 79 |
| `MODULE_EXPERIMENTAL` | constant | 80 |
| `MODULE_TYPE_MASK` | constant | 81 |
| `TYPE_STRING` | constant | 102 |
| `TYPE_FILE` | constant | 103 |
| `TYPE_INT` | constant | 104 |
| `TYPE_DIR` | constant | 105 |
| `TYPE_STRING_LIST` | constant | 106 |
| `TYPE_MULTIPLE_STRING` | constant | 107 |
| `TYPE_ARRAY` | constant | 108 |
| `TYPE_INT_LIST` | constant | 109 |
| `TYPE_MULTIPLE_INT` | constant | 110 |
| `TYPE_FLAG` | constant | 111 |
| `TYPE_TOGGLE` | constant | 112 |
| `TYPE_DIR_LIST` | constant | 113 |
| `TYPE_FILE_LIST` | constant | 114 |
| `TYPE_LOCATION` | constant | 115 |
| `TYPE_TEXT_FIELD` | constant | 116 |
| `TYPE_TEXT` | constant | 117 |
| `TYPE_PASSWORD` | constant | 118 |
| `TYPE_FLOAT` | constant | 119 |
| `TYPE_MODULE` | constant | 120 |
| `TYPE_FONT` | constant | 121 |
| `TYPE_CUSTOM` | constant | 122 |
| `TYPE_URL` | constant | 123 |
| `TYPE_URL_LIST` | constant | 124 |
| `TYPE_ERROR` | constant | 127 |
| `TYPE_VAR` | constant | 128 |
| `TYPE_LIST` | constant | 129 |
| `TYPE_COLOR` | constant | 130 |
| `TYPE_MODULE_OLD` | constant | 131 |
| `VAR_EXPERT` | constant | 135 |
| `VAR_MORE` | constant | 136 |
| `VAR_DEVELOPER` | constant | 137 |
| `VAR_INITIAL` | constant | 138 |
| `VAR_NOT_CFIF` | constant | 139 |
| `VAR_INVISIBLE` | constant | 140 |
| `VAR_PUBLIC` | constant | 141 |
| `VAR_NO_DEFAULT` | constant | 142 |
| `get_query` | function | 44 |
| `get_method` | function | 45 |
| `get_protocol` | function | 46 |
| `set_max_cache` | function | 47 |
| `get_max_cache` | function | 48 |
| `lower_max_cache` | function | 49 |
| `raise_max_cache` | function | 50 |
| `url_base` | function | 51 |
| `client_scheme` | function | 52 |
| `create` | function | 94 |
| `defvar` | function | 97 |
| `variable` | function | 108 |

