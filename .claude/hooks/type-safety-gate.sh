#!/usr/bin/env bash
# type-safety-gate.sh - PreToolUse hook for Edit and Write
#
# Prevents agents from using `any` type or suppressing TypeScript errors.
# Enforces strict type safety in all TypeScript source files.
#
# BLOCKED (hard stop):
#   1. Explicit `any` type annotations (: any, as any, <any>)
#   2. @ts-ignore directives (always blocked)
#   3. @ts-nocheck directives (always blocked)
#
# ALLOWED (with description):
#   @ts-expect-error with a description of 10+ chars (for genuine edge cases)

set -uo pipefail

INPUT=$(cat)

# Extract tool name and file path
TOOL=$(echo "$INPUT" | jq -r '.tool_name // empty' 2>/dev/null)
FILE_PATH=$(echo "$INPUT" | jq -r '.tool_input.file_path // empty' 2>/dev/null)

# Only check TypeScript files
if [ -z "$FILE_PATH" ]; then
  exit 0
fi

is_ts_file=false
case "$FILE_PATH" in
  *.ts|*.tsx) is_ts_file=true ;;
esac

if [ "$is_ts_file" = false ]; then
  exit 0
fi

# Skip declaration files (.d.ts) - they legitimately use `any`
case "$FILE_PATH" in
  *.d.ts) exit 0 ;;
esac

# Get the content to check based on tool type
CONTENT=""
if [ "$TOOL" = "Edit" ]; then
  CONTENT=$(echo "$INPUT" | jq -r '.tool_input.new_string // empty' 2>/dev/null)
elif [ "$TOOL" = "Write" ]; then
  CONTENT=$(echo "$INPUT" | jq -r '.tool_input.content // empty' 2>/dev/null)
fi

if [ -z "$CONTENT" ]; then
  exit 0
fi

# === Check 1: Explicit `any` type usage ===
# Patterns: `: any`, `as any`, `<any>`, `<any,`, `<any>`
# Exclude: words containing "any" (e.g., "anyString", "company", "many")
if echo "$CONTENT" | grep -qP ':\s*any\b(?!\w)|(?<!\w)as\s+any\b|<any[>,\s\)]'; then
  echo "[TYPE SAFETY] BLOCKED: Explicit \`any\` type detected."
  echo ""
  echo "The \`any\` type is banned in this project (ADR-013)."
  echo "Use a proper type instead:"
  echo ""
  echo "  - \`unknown\` - when the type is truly unknown (requires narrowing)"
  echo "  - \`Record<string, unknown>\` - for arbitrary objects"
  echo "  - \`never\` - for impossible states"
  echo "  - A specific interface or type alias"
  echo ""
  echo "If you absolutely need flexibility, use \`unknown\` and narrow with type guards."
  exit 2
fi

# === Check 2: @ts-ignore (always blocked) ===
if echo "$CONTENT" | grep -qP '@ts-ignore'; then
  echo "[TYPE SAFETY] BLOCKED: @ts-ignore is banned."
  echo ""
  echo "Do NOT suppress TypeScript errors. Fix the underlying type issue."
  echo "If the error is in a third-party type, use @ts-expect-error with a description."
  exit 2
fi

# === Check 3: @ts-nocheck (always blocked) ===
if echo "$CONTENT" | grep -qP '@ts-nocheck'; then
  echo "[TYPE SAFETY] BLOCKED: @ts-nocheck is banned."
  echo ""
  echo "Do NOT disable type checking for entire files. Fix the type errors."
  exit 2
fi

# === Check 4: @ts-expect-error without description (warned) ===
# Allowed with description >=10 chars, blocked without
if echo "$CONTENT" | grep -qP '@ts-expect-error\s*$|@ts-expect-error\s+\S{0,9}\s*$'; then
  echo "[TYPE SAFETY] WARNING: @ts-expect-error should have a descriptive comment (10+ chars)."
  echo ""
  echo "Example: // @ts-expect-error - vscode API types mismatch in test harness"
  # Warning only
  exit 0
fi

exit 0
