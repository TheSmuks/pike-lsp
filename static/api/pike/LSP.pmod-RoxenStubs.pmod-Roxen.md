---
id: pike-LSP-pmod-RoxenStubs-pmod-Roxen
title: LSP-pmod-RoxenStubs-pmod-Roxen
description: API documentation for LSP.pmod/RoxenStubs.pmod/Roxen.pike
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

Common Roxen type constants (matching Roxen 6.1 module.h)

Additional types for compatibility with older code

Common Roxen variable flags

These match the bit-shifted values from Roxen 6.1 module.h

## Symbols

| Symbol | Type | Line |
|--------|------|------|
| `RequestID` | class | 12 |
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
| `TYPE_STRING` | constant | 84 |
| `TYPE_FILE` | constant | 85 |
| `TYPE_INT` | constant | 86 |
| `TYPE_DIR` | constant | 87 |
| `TYPE_STRING_LIST` | constant | 88 |
| `TYPE_MULTIPLE_STRING` | constant | 89 |
| `TYPE_INT_LIST` | constant | 90 |
| `TYPE_MULTIPLE_INT` | constant | 91 |
| `TYPE_FLAG` | constant | 92 |
| `TYPE_TOGGLE` | constant | 93 |
| `TYPE_DIR_LIST` | constant | 94 |
| `TYPE_FILE_LIST` | constant | 95 |
| `TYPE_LOCATION` | constant | 96 |
| `TYPE_TEXT_FIELD` | constant | 97 |
| `TYPE_TEXT` | constant | 98 |
| `TYPE_PASSWORD` | constant | 99 |
| `TYPE_FLOAT` | constant | 100 |
| `TYPE_MODULE` | constant | 101 |
| `TYPE_FONT` | constant | 102 |
| `TYPE_CUSTOM` | constant | 103 |
| `TYPE_URL` | constant | 104 |
| `TYPE_URL_LIST` | constant | 105 |
| `TYPE_ERROR` | constant | 108 |
| `TYPE_VAR` | constant | 109 |
| `TYPE_LIST` | constant | 110 |
| `TYPE_COLOR` | constant | 111 |
| `TYPE_MODULE_OLD` | constant | 112 |
| `VAR_EXPERT` | constant | 116 |
| `VAR_MORE` | constant | 117 |
| `VAR_DEVELOPER` | constant | 118 |
| `VAR_INITIAL` | constant | 119 |
| `VAR_NOT_CFIF` | constant | 120 |
| `VAR_INVISIBLE` | constant | 121 |
| `VAR_PUBLIC` | constant | 122 |
| `VAR_NO_DEFAULT` | constant | 123 |
| `get_query` | function | 44 |
| `get_method` | function | 45 |
| `get_protocol` | function | 46 |
| `set_max_cache` | function | 47 |
| `get_max_cache` | function | 48 |
| `lower_max_cache` | function | 49 |
| `raise_max_cache` | function | 50 |
| `url_base` | function | 51 |
| `client_scheme` | function | 52 |

