/**
 * Conditional Defines Processing
 *
 * Handles preprocessor conditional compilation directives (#ifdef, #ifndef,
 * #if, #elif, #else, #endif) by evaluating conditions against the configured
 * define set and stripping inactive branches from source code.
 */

/**
 * Evaluate a preprocessor conditional expression against the active define set.
 */
export function evaluateConditionalExpression(
  defineNames: Set<string>,
  expression: string
): boolean {
  const trimmed = expression.trim();
  if (!trimmed) {
    return false;
  }

  if (trimmed === '1' || trimmed === 'true') {
    return true;
  }

  if (trimmed === '0' || trimmed === 'false') {
    return false;
  }

  const normalized = trimmed.replaceAll(' ', '');
  if (normalized.startsWith('!constant(') && normalized.endsWith(')')) {
    const name = normalized.slice('!constant('.length, -1).trim();
    return !defineNames.has(name);
  }

  if (normalized.startsWith('constant(') && normalized.endsWith(')')) {
    const name = normalized.slice('constant('.length, -1).trim();
    return defineNames.has(name);
  }

  if (trimmed.startsWith('!')) {
    return !defineNames.has(trimmed.slice(1).trim());
  }

  return defineNames.has(trimmed);
}

/**
 * Apply conditional define filtering to Pike source code.
 *
 * Processes preprocessor directives and strips code from inactive branches.
 * Lines inside inactive branches are replaced with empty lines to preserve
 * line numbering for diagnostics and error reporting.
 */
export function applyConditionalDefinesToCode(defineNames: Set<string>, code: string): string {
  if (defineNames.size === 0) {
    return code;
  }

  type ConditionalFrame = {
    parentActive: boolean;
    hasMatched: boolean;
    active: boolean;
  };

  const lines = code.split('\n');
  const output: string[] = [];
  const stack: ConditionalFrame[] = [];

  for (const line of lines) {
    const trimmed = line.trim();
    const isDirective = trimmed.startsWith('#');

    if (!isDirective) {
      const active = stack.length === 0 ? true : stack[stack.length - 1]!.active;
      output.push(active ? line : '');
      continue;
    }

    const startsWith = (token: string): boolean => {
      if (!trimmed.startsWith(token)) {
        return false;
      }
      const next = trimmed.charAt(token.length);
      return next === '' || next === ' ' || next === '\t';
    };

    const currentParent = stack.length === 0 ? true : stack[stack.length - 1]!.active;

    if (startsWith('#ifdef')) {
      const expr = trimmed.slice('#ifdef'.length).trim();
      const cond = defineNames.has(expr);
      stack.push({
        parentActive: currentParent,
        hasMatched: cond && currentParent,
        active: cond && currentParent,
      });
      output.push('');
      continue;
    }

    if (startsWith('#ifndef')) {
      const expr = trimmed.slice('#ifndef'.length).trim();
      const cond = !defineNames.has(expr);
      stack.push({
        parentActive: currentParent,
        hasMatched: cond && currentParent,
        active: cond && currentParent,
      });
      output.push('');
      continue;
    }

    if (startsWith('#if')) {
      const expr = trimmed.slice('#if'.length).trim();
      const cond = evaluateConditionalExpression(defineNames, expr);
      stack.push({
        parentActive: currentParent,
        hasMatched: cond && currentParent,
        active: cond && currentParent,
      });
      output.push('');
      continue;
    }

    if (startsWith('#elif')) {
      const frame = stack[stack.length - 1];
      if (frame) {
        if (!frame.parentActive || frame.hasMatched) {
          frame.active = false;
        } else {
          const expr = trimmed.slice('#elif'.length).trim();
          const cond = evaluateConditionalExpression(defineNames, expr);
          frame.active = cond;
          if (cond) {
            frame.hasMatched = true;
          }
        }
      }
      output.push('');
      continue;
    }

    if (startsWith('#else')) {
      const frame = stack[stack.length - 1];
      if (frame) {
        const active = frame.parentActive && !frame.hasMatched;
        frame.active = active;
        frame.hasMatched = true;
      }
      output.push('');
      continue;
    }

    if (startsWith('#endif')) {
      if (stack.length > 0) {
        stack.pop();
      }
      output.push('');
      continue;
    }

    const active = stack.length === 0 ? true : stack[stack.length - 1]!.active;
    output.push(active ? line : '');
  }

  return output.join('\n');
}
