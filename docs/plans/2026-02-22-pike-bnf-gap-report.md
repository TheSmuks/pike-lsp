# Pike BNF Grammar Gap Report - UNCOVERED GAPS

**Date:** 2026-02-22
**PIKE_SRC:** /home/smuks/Pike-v8.0.1116
**Reference:** Pike BNF (`src/language.yacc`)

---

## Summary

This report identifies gaps in the Pike LSP parser that are **NOT** covered by existing issues #612-623.

Existing issues cover: union types, intersection types, built-in types, type attributes, range types, object constraints, typedef, switch/case, do-while, range operator, typeof/gauge/sscanf, and varargs.

---

## Uncovered Gaps

### 1. Ternary/Conditional Operator (`? :`)

**Location:** `src/language.yacc` line ~3308

**BNF:**
```
expr1 '?' expr01 ':' expr01 { $$=mknode('?',$1,mknode(':',$3,$5)); }
```

**Example:**
```pike
int x = condition ? 1 : 0;
string s = a > b ? "greater" : "less";
```

**Priority:** HIGH - Very common operator in Pike

---

### 2. Splat/Spread Operator (`@`)

**Location:** `src/language.yacc` line ~3276

**BNF:**
```
'@' expr0 { $$=mknode(F_PUSH_ARRAY,$2,0); }
```

**Example:**
```pike
void foo(int a, int b, int c) {}
array(int) args = ({1, 2, 3});
foo(@args);  // splat unpacking
```

**Priority:** HIGH - Common in functional Pike code

---

### 3. Safe Navigation Operators (`?->`, `?[]`)

**Tokens:** `TOK_SAFE_INDEX`, `TOK_SAFE_START_INDEX`

**Location:** `src/language.yacc` lines 99-100, `src/lexer.h` lines 1070-1072

**Example:**
```pike
object o = some_object();
// Safe navigation - returns null instead of error
mixed result = o?->method();
array arr = o?->array_prop?->items;
```

**Priority:** MEDIUM - Null-safe access patterns

---

### 4. Backtick Operator Overloading (``` ` ```)

**Location:** `src/lexer.h` lines 1166-1230

**BNF:** Various operator overloads like ``` `+ ```, ``` `- ```, ``` `== ```, ``` `< ```, etc.

**Example:**
```pike
class Vector {
    float `+(mixed x) { ... }
    int `>(mixed x) { ... }
}
```

**Priority:** LOW - Advanced Pike feature, rarely used

---

### 5. Labeled Statements (break/continue with labels)

**Location:** `src/language.yacc` lines 2030, 2047

**BNF:**
```
labeled_statement: TOK_IDENTIFIER ':' statement
optional_label: TOK_IDENTIFIER
```

**Example:**
```pike
outer: for (int i = 0; i < 10; i++) {
    for (int j = 0; j < 10; j++) {
        if (j == 5) break outer;  // breaks outer loop
    }
}
```

**Priority:** LOW - Uncommon but valid Pike

---

### 6. Modifier Coverage Verification

These modifiers exist in the lexer but may need verification:

| Modifier | Token | Status |
|----------|-------|--------|
| `inline` | `TOK_INLINE` | Verify supported |
| `final` | `TOK_FINAL_ID` | Verify supported |
| `variant` | `TOK_VARIANT` | Verify supported |
| `optional` | `TOK_OPTIONAL` | Already in #623? |
| `nomask` | `TOK_NO_MASK` | Verify supported |
| `deprecated` | `TOK_DEPRECATED_ID` | Already in #615? |

---

### 7. Predefined Identifiers

| Identifier | Token | Status |
|------------|-------|--------|
| `__func__` | `TOK_FUNCTION_NAME` | Verify supported |
| `__attribute__` | `TOK_ATTRIBUTE_ID` | Already in #615 |
| `__deprecated__` | `TOK_DEPRECATED_ID` | Already in #615? |

---

## Priority Ranking

| Priority | Gap | Issue Candidate? |
|----------|-----|-----------------|
| HIGH | Ternary operator (`? :`) | Yes |
| HIGH | Splat operator (`@`) | Yes |
| MEDIUM | Safe navigation (`?->`, `?[]`) | Yes |
| LOW | Backtick operators (`` `+ ``, etc.) | Maybe |
| LOW | Labeled statements | Maybe |

---

## Recommendations

1. **Create new issues** for:
   - Ternary operator support
   - Splat/spread operator support
   - Safe navigation operators

2. **Verify existing support** for:
   - Modifier keywords (inline, final, variant, nomask)
   - Predefined identifiers (__func__, etc.)

3. **Lower priority** - may not need issues:
   - Backtick operator overloading (rarely used)
   - Labeled statements (uncommon)

---

## BNF Reference (Full)

```
expression2          ::=   ( lvalue ( "=" | "+=" | "*=" | "/=" | "&=" | "|=" | "^=" | "<<=" | ">>=" | "%=" ) )* expression3
expression3          ::=   expression4 '?' expression3 ":" expression3
expression4          ::=   ( expression5 ( "||" | "&&" | "|" | "^" | "&" | "==" | "!=" | ">" | "<" | ">=" | "<=" | "<<" |
                            ">>" | "+" | "*" | "/" | "%" ) )* expression5
expression5          ::=   expression6 | "(" type ")" expression5 | "--" expression6 | "++" expression6 | expression6 "--" |
                            expression6 "++" | "~" expression5 | "-" expression5
expression6          ::=   string | int | float | catch | gauge | typeof | sscanf | lambda | class | constant_identifier | call |
                            index | mapping | multiset | array | parenthesis | arrow
splice_expression    ::=   "@"? expression2
arrow                ::=   expression6 "->" identifier
```
