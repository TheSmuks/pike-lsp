---
id: pike-LSP-pmod-RoxenStubs-pmod-RXML
title: LSP-pmod-RoxenStubs-pmod-RXML
description: API documentation for LSP.pmod/RoxenStubs.pmod/RXML.pike
---

# LSP.pmod/RoxenStubs.pmod/RXML.pike

## Overview

RXML.pike - Stub module for RXML (Roxen XML) framework LSP support

Provides minimal stub implementations of RXML classes to allow

Pike code using RXML APIs to compile during LSP analysis.

RXML.Tag flag constants (Roxen 6.1)

RXML.Tag stub - base class for RXML tags

In real Roxen, this is used to create custom RXML tags

RXML.TagSet stub - collection of RXML tags

In real Roxen, this manages tag namespaces and containers

RXML.PXml stub - XML parser utility

In real Roxen, this parses XML/RXML content

RXML.Roxen stub - main RXML namespace

## Symbols

| Symbol | Type | Line |
|--------|------|------|
| `Tag` | class | 13 |
| `TagSet` | class | 26 |
| `PXml` | class | 58 |
| `Roxen` | class | 71 |
| `FLAG_EMPTY_ELEMENT` | constant | 7 |
| `FLAG_STREAM_CONTENT` | constant | 8 |
| `FLAG_DONT_REPORT_RESULT` | constant | 9 |
| `create` | function | 16 |
| `create` | function | 28 |
| `add_tag` | function | 33 |
| `remove_tag` | function | 44 |
| `register_tag` | function | 48 |
| `create` | function | 60 |
| `get_xml` | function | 65 |

