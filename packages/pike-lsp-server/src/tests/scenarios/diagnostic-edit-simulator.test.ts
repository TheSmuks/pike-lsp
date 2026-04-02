import { describe, it } from 'bun:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { PikeBridge, type AnalyzeResponse } from '@pike-lsp/pike-bridge';

const SOURCE_PATH = '/usr/local/pike/8.0.1116/lib/modules/ADT.pmod/History.pike';
const ANALYZE_INCLUDE = ['parse', 'introspect', 'diagnostics'] as const;

function removeSemicolon(lines: string[], lineIdx: number): string[] {
  const next = [...lines];
  next[lineIdx] = next[lineIdx].replace(/;\s*$/, '');
  return next;
}

function restoreLine(lines: string[], originalLines: string[], lineIdx: number): string[] {
  const next = [...lines];
  next[lineIdx] = originalLines[lineIdx] ?? '';
  return next;
}

function breakExpression(lines: string[], lineIdx: number): string[] {
  const next = [...lines];
  next[lineIdx] = next[lineIdx].replace(/=\s*[^;]+;/, '= ;');
  return next;
}

function addNewLine(lines: string[], afterLineIdx: number): string[] {
  const next = [...lines];
  next.splice(afterLineIdx + 1, 0, '');
  return next;
}

function removeLine(lines: string[], lineIdx: number): string[] {
  const next = [...lines];
  next.splice(lineIdx, 1);
  return next;
}

function swapLines(lines: string[], idx1: number, idx2: number): string[] {
  const next = [...lines];
  [next[idx1], next[idx2]] = [next[idx2], next[idx1]];
  return next;
}

interface IndexedDiagnostic {
  line: number;
  character: number;
  severity: string;
  message: string;
}

type LightweightDiagnostic = {
  message: string;
  severity: string;
  position: { line: number; character?: number; column?: number };
};

function diagnosticsFromAnalyze(response: AnalyzeResponse): IndexedDiagnostic[] {
  const parse = response.result?.parse?.diagnostics ?? [];
  const introspect = response.result?.introspect?.diagnostics ?? [];
  const dataflow = response.result?.diagnostics?.diagnostics ?? [];
  const all = [...parse, ...introspect, ...dataflow] as LightweightDiagnostic[];

  return all.map(d => ({
    line: d.position?.line ?? -1,
    character: d.position?.column ?? d.position?.character ?? 0,
    severity: d.severity,
    message: d.message,
  }));
}

function diagnosticSignature(diag: IndexedDiagnostic): string {
  return `${diag.severity}|${diag.line}|${diag.character}|${diag.message}`;
}

function toSignatureSet(diags: IndexedDiagnostic[]): Set<string> {
  return new Set(diags.map(diagnosticSignature));
}

function formatDiagnostics(diags: IndexedDiagnostic[]): string {
  if (diags.length === 0) return '(none)';
  return diags.map(d => `L${d.line}:C${d.character} [${d.severity}] ${d.message}`).join('\n');
}

function findLineIndex(
  lines: string[],
  predicate: (line: string, idx: number) => boolean,
  label: string
): number {
  const idx = lines.findIndex(predicate);
  assert.notEqual(idx, -1, `Could not find deterministic line for ${label} in ${SOURCE_PATH}`);
  return idx;
}

function expandWithAdjacent(lines: number[], maxLine: number): Set<number> {
  const allowed = new Set<number>();
  for (const line of lines) {
    if (line >= 1 && line <= maxLine) allowed.add(line);
    if (line - 1 >= 1) allowed.add(line - 1);
    if (line + 1 <= maxLine) allowed.add(line + 1);
  }
  return allowed;
}

describe('Scenario: diagnostic edit simulator on real Pike file', { timeout: 60000 }, () => {
  it('detects phantom diagnostics during realistic edit/fix cycles', async () => {
    const bridge = new PikeBridge({ pikePath: '/usr/local/bin/pike' });
    await bridge.start();

    try {
      const originalText = await readFile(SOURCE_PATH, 'utf8');
      const originalLines = originalText.split('\n');
      let lines = [...originalLines];
      let version = 1;

      const semicolonLineIdx = findLineIndex(
        originalLines,
        line =>
          /;\s*$/.test(line.trim()) && !line.trim().startsWith('//') && !line.includes('return '),
        'removeSemicolon'
      );
      const expressionLineIdx = findLineIndex(
        originalLines,
        line => /=\s*[^;]+;/.test(line) && !line.trim().startsWith('//'),
        'breakExpression'
      );
      const blankLineIdx = findLineIndex(originalLines, line => line.trim() === '', 'removeLine');
      const swappableIdx1 = findLineIndex(
        originalLines,
        line => line.trim().startsWith('// The stack where the values are stored.'),
        'swapLines idx1'
      );
      const swappableIdx2 = findLineIndex(
        originalLines,
        line => line.trim().startsWith('// A pointer to the top of the stack.'),
        'swapLines idx2'
      );

      const analyzeCurrent = async (): Promise<IndexedDiagnostic[]> => {
        const code = lines.join('\n');
        const response = await bridge.analyze(code, [...ANALYZE_INCLUDE], SOURCE_PATH, version++);
        return diagnosticsFromAnalyze(response);
      };

      const baselineDiagnostics = await analyzeCurrent();
      const baselineSignatures = toSignatureSet(baselineDiagnostics);

      const CASCADE_PATTERNS = [
        /Must return a value/i,
        /^Expected:/i,
        /^Got\s+:/i,
        /unexpected TOK_/i,
      ];

      const isCascadeError = (
        d: IndexedDiagnostic,
        syntaxErrorLines: Set<number>,
        allowedLines: Set<number>
      ): boolean => {
        if (syntaxErrorLines.size === 0) return false;
        if (allowedLines.has(d.line)) return false;
        if (CASCADE_PATTERNS.some(p => p.test(d.message))) return true;
        if (
          d.message.includes('syntax error') &&
          !allowedLines.has(d.line) &&
          syntaxErrorLines.size > 0
        )
          return true;
        return false;
      };

      function messageOnlySignature(d: IndexedDiagnostic): string {
        return `${d.severity}|${d.message}`;
      }

      const assertNoPhantoms = (
        stepName: string,
        current: IndexedDiagnostic[],
        touched1Based: number[]
      ) => {
        const allowedLines = expandWithAdjacent(touched1Based, lines.length);
        const added = current.filter(d => !baselineSignatures.has(diagnosticSignature(d)));
        const baselineMessages = new Set(baselineDiagnostics.map(messageOnlySignature));

        const syntaxErrorLines = new Set(
          added
            .filter(
              d =>
                d.severity === 'error' &&
                (d.message.includes('syntax error') || /unexpected/.test(d.message))
            )
            .map(d => d.line)
        );

        const phantom = added.filter(d => {
          if (d.line < 1) return false;
          if (allowedLines.has(d.line)) return false;
          if (isCascadeError(d, syntaxErrorLines, allowedLines)) return false;
          if (baselineMessages.has(messageOnlySignature(d))) return false;
          return true;
        });

        if (phantom.length > 0) {
          assert.fail(
            [
              `Phantom diagnostics detected after step: ${stepName}`,
              `Touched lines (1-based): ${JSON.stringify(touched1Based)}`,
              `Allowed lines (incl. adjacent): ${JSON.stringify([...allowedLines].sort((a, b) => a - b))}`,
              'Unexpected diagnostics on untouched lines:',
              formatDiagnostics(phantom),
              'All diagnostics for this step:',
              formatDiagnostics(current),
            ].join('\n')
          );
        }
      };

      const assertBackToBaseline = (stepName: string, current: IndexedDiagnostic[]) => {
        const currentSignatures = toSignatureSet(current);
        const extra = current.filter(d => !baselineSignatures.has(diagnosticSignature(d)));
        const missing = baselineDiagnostics.filter(
          d => !currentSignatures.has(diagnosticSignature(d))
        );

        assert.equal(
          extra.length,
          0,
          `${stepName}: restore should not add diagnostics. Extra:\n${formatDiagnostics(extra)}`
        );
        assert.equal(
          missing.length,
          0,
          `${stepName}: restore should match baseline diagnostics. Missing baseline:\n${formatDiagnostics(missing)}`
        );
      };

      lines = removeSemicolon(lines, semicolonLineIdx);
      const afterRemoveSemicolon = await analyzeCurrent();
      assertNoPhantoms('removeSemicolon', afterRemoveSemicolon, [semicolonLineIdx + 1]);

      lines = restoreLine(lines, originalLines, semicolonLineIdx);
      const afterRestoreSemicolon = await analyzeCurrent();
      assertBackToBaseline('restoreLine(after removeSemicolon)', afterRestoreSemicolon);

      lines = breakExpression(lines, expressionLineIdx);
      const afterBreakExpression = await analyzeCurrent();
      assertNoPhantoms('breakExpression', afterBreakExpression, [expressionLineIdx + 1]);

      lines = restoreLine(lines, originalLines, expressionLineIdx);
      const afterRestoreExpression = await analyzeCurrent();
      assertBackToBaseline('restoreLine(after breakExpression)', afterRestoreExpression);

      lines = addNewLine(lines, expressionLineIdx);
      const afterAddLine = await analyzeCurrent();
      assertNoPhantoms('addNewLine', afterAddLine, [expressionLineIdx + 1, expressionLineIdx + 2]);

      lines = removeLine(lines, expressionLineIdx + 1);
      const afterRemoveAddedLine = await analyzeCurrent();
      assertBackToBaseline('removeLine(after addNewLine)', afterRemoveAddedLine);

      lines = removeLine(lines, blankLineIdx);
      const afterRemoveLine = await analyzeCurrent();
      assertNoPhantoms('removeLine', afterRemoveLine, [blankLineIdx + 1]);

      lines = addNewLine(lines, blankLineIdx - 1);
      const afterRestoreRemovedLine = await analyzeCurrent();
      assertBackToBaseline('addNewLine(after removeLine)', afterRestoreRemovedLine);

      lines = swapLines(lines, swappableIdx1, swappableIdx2);
      const afterSwap = await analyzeCurrent();
      assertNoPhantoms('swapLines', afterSwap, [swappableIdx1 + 1, swappableIdx2 + 1]);

      lines = swapLines(lines, swappableIdx1, swappableIdx2);
      const afterSwapBack = await analyzeCurrent();
      assertBackToBaseline('swapLines(restore)', afterSwapBack);
    } finally {
      await bridge.stop();
    }
  });
});
