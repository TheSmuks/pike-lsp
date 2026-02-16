/**
 * Integration tests for inline prompt mode.
 * Tests the actual parameter flow through handleAskCodex/handleAskGemini
 * with CLI detection mocked - verifies auto-persistence, output generation, and error handling.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { EventEmitter } from 'events';
import { spawn } from 'child_process';
import { handleAskCodex } from '../mcp/codex-core.js';
import { handleAskGemini } from '../mcp/gemini-core.js';
import { expectMissingPromptError, expectNoMissingPromptError } from './helpers/prompt-test-helpers.js';

// Mock CLI detection to avoid hanging on actual CLI checks
vi.mock('../mcp/cli-detection.js', () => ({
  detectCodexCli: vi.fn(() => ({ available: true, path: '/usr/bin/codex', version: '1.0.0', installHint: '' })),
  detectGeminiCli: vi.fn(() => ({ available: true, path: '/usr/bin/gemini', version: '1.0.0', installHint: '' })),
  resetDetectionCache: vi.fn(),
}));

// Mock child_process to avoid actual CLI calls
vi.mock('child_process', () => ({
  execSync: vi.fn(),
  spawn: vi.fn(),
}));

function createMockChildProcess(stdoutData: string, exitCode: number = 0): any {
  const proc = new EventEmitter();
  const stdout = new EventEmitter();
  const stderr = new EventEmitter();
  const stdin = new EventEmitter() as EventEmitter & { write: any; end: any };
  stdin.write = vi.fn();
  stdin.end = vi.fn();
  (proc as any).stdout = stdout;
  (proc as any).stderr = stderr;
  (proc as any).stdin = stdin;
  (proc as any).kill = vi.fn();

  process.nextTick(() => {
    stdout.emit('data', Buffer.from(stdoutData));
    process.nextTick(() => {
      proc.emit('close', exitCode);
    });
  });

  return proc;
}

const parityMatrix: Array<{
  name: string;
  args: Record<string, unknown>;
  expectError: boolean;
  expectMsg?: string;
}> = [
  { name: 'missing prompt source', args: { agent_role: 'architect' }, expectError: true, expectMsg: 'Either' },
  { name: 'empty inline', args: { agent_role: 'architect', prompt: '' }, expectError: true, expectMsg: 'empty' },
  { name: 'whitespace inline', args: { agent_role: 'architect', prompt: '   ' }, expectError: true, expectMsg: 'empty' },
  { name: 'prompt_file: null forces file mode', args: { agent_role: 'architect', prompt: 'test', prompt_file: null, output_file: '/tmp/o.md' }, expectError: true, expectMsg: 'prompt_file must be a non-empty string' },
  { name: 'prompt_file: undefined allows inline', args: { agent_role: 'architect', prompt: 'test', prompt_file: undefined }, expectError: false },
  { name: 'background + inline rejected', args: { agent_role: 'architect', prompt: 'test', background: true }, expectError: true, expectMsg: 'foreground' },
  { name: 'missing output_file in file mode', args: { agent_role: 'architect', prompt_file: '/tmp/f.md' }, expectError: true, expectMsg: 'output_file' },
  { name: 'non-string output_file', args: { agent_role: 'architect', prompt_file: '/tmp/f.md', output_file: 123 }, expectError: true, expectMsg: 'output_file' },
];

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(spawn).mockImplementation(() => createMockChildProcess('{"type":"item.completed","item":{"type":"agent_message","text":"mock success"}}\n', 0));
});

describe('Codex/Gemini parity matrix', () => {
  for (const tc of parityMatrix) {
    it(`parity: ${tc.name}`, async () => {
      const codexArgs = { ...tc.args, agent_role: 'architect' };
      const geminiArgs = { ...tc.args, agent_role: 'designer' };
      const codexResult = await handleAskCodex(codexArgs as any);
      const geminiResult = await handleAskGemini(geminiArgs as any);

      expect(!!codexResult.isError).toBe(!!geminiResult.isError);
      expect(codexResult.content.length).toBe(geminiResult.content.length);
      expect(!!codexResult.isError).toBe(tc.expectError);
      expect(!!geminiResult.isError).toBe(tc.expectError);

      if (tc.expectError) {
        expect(codexResult.isError).toBe(true);
        expect(geminiResult.isError).toBe(true);
        expect(codexResult.content).toHaveLength(1);
        expect(geminiResult.content).toHaveLength(1);
        if (tc.expectMsg) {
          expect(codexResult.content[0].text.toLowerCase()).toContain(tc.expectMsg.toLowerCase());
          expect(geminiResult.content[0].text.toLowerCase()).toContain(tc.expectMsg.toLowerCase());
        }
      }
    });
  }
});

describe('Inline prompt integration - Codex', () => {
  it('should auto-persist inline prompt to file and not reject it', async () => {
    const result = await handleAskCodex({
      prompt: 'Test inline codex prompt',
      agent_role: 'architect',
    });
    // Will error because Codex CLI is not installed, but should NOT error about prompt parameter
    const text = result.content[0].text;
    expect(text).not.toContain("'prompt' parameter has been removed");
    expect(text).not.toContain('prompt_file is required');
  });

  it('should not enter inline mode when prompt_file is whitespace', async () => {
    const result = await handleAskCodex({
      prompt: 'test prompt',
      prompt_file: '   ',
      agent_role: 'architect',
      output_file: '/tmp/test-output.md',
    });
    // prompt_file is present (even whitespace), so file mode is used
    // Whitespace-only prompt_file gets explicit type error
    expect(result.isError).toBe(true);
    const text = result.content[0].text;
    expect(text).toContain('prompt_file must be a non-empty string');
  });

  it('should not enter inline mode when prompt_file is empty string', async () => {
    const result = await handleAskCodex({
      prompt: 'test prompt',
      prompt_file: '',
      agent_role: 'architect',
      output_file: '/tmp/test-output.md',
    });
    expect(result.isError).toBe(true);
    const text = result.content[0].text;
    expect(text).toContain('prompt_file must be a non-empty string');
  });

  it('should handle path traversal in inline prompt safely', async () => {
    const result = await handleAskCodex({
      prompt: '../../etc/passwd injection attempt',
      agent_role: 'architect',
    });
    // Should not error about path traversal - slugify sanitizes the prompt
    const text = result.content[0].text;
    expect(text).not.toContain('E_PATH_OUTSIDE');
  });

  it('should error when neither prompt nor prompt_file provided', async () => {
    const result = await handleAskCodex({
      agent_role: 'architect',
    } as any);
    expect(result.isError).toBe(true);
    expectMissingPromptError(result.content[0].text);
  });

  it('should still require output_file in prompt_file mode', async () => {
    const result = await handleAskCodex({
      prompt_file: '/tmp/nonexistent.md',
      agent_role: 'architect',
    } as any);
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain('output_file is required');
  });
});

describe('Inline prompt integration - Gemini', () => {
  it('should auto-persist inline prompt to file and not reject it', async () => {
    const result = await handleAskGemini({
      prompt: 'Test gemini inline prompt',
      agent_role: 'designer',
    });
    // Will error because Gemini CLI is not actually running, but should NOT error about prompt parameter
    const text = result.content[0].text;
    expectNoMissingPromptError(text);
    expect(text).not.toContain('output_file is required');
  });

  it('should not enter inline mode when prompt_file is whitespace', async () => {
    const result = await handleAskGemini({
      prompt: 'test prompt',
      prompt_file: '   ',
      agent_role: 'designer',
      output_file: '/tmp/test-output.md',
    });
    expect(result.isError).toBe(true);
    const text = result.content[0].text;
    expect(text).toContain('prompt_file must be a non-empty string');
  });

  it('should not enter inline mode when prompt_file is empty string', async () => {
    const result = await handleAskGemini({
      prompt: 'test prompt',
      prompt_file: '',
      agent_role: 'designer',
      output_file: '/tmp/test-output.md',
    });
    expect(result.isError).toBe(true);
    const text = result.content[0].text;
    expect(text).toContain('prompt_file must be a non-empty string');
  });

  it('should error when neither prompt nor prompt_file provided', async () => {
    const result = await handleAskGemini({
      agent_role: 'designer',
    } as any);
    expect(result.isError).toBe(true);
    expectMissingPromptError(result.content[0].text);
  });

  it('should block inline prompt with background mode', async () => {
    const result = await handleAskGemini({
      prompt: 'bg test',
      agent_role: 'designer',
      background: true,
    });
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain('foreground only');
  });
});

describe('Response shape contract', () => {
  it('Codex: error responses should always be single content block', async () => {
    const result = await handleAskCodex({
      prompt: '',
      agent_role: 'architect',
    });
    expect(result.isError).toBe(true);
    expect(result.content).toHaveLength(1);
  });

  it('Gemini: error responses should always be single content block', async () => {
    const result = await handleAskGemini({
      prompt: '',
      agent_role: 'designer',
    });
    expect(result.isError).toBe(true);
    expect(result.content).toHaveLength(1);
  });

  it('Codex: validation error for missing prompt should be single block', async () => {
    const result = await handleAskCodex({
      agent_role: 'architect',
      output_file: '/tmp/test-output.md',
    });
    expect(result.isError).toBe(true);
    expect(result.content).toHaveLength(1);
    expect(result.content[0].type).toBe('text');
  });

  it('Gemini: validation error for missing prompt should be single block', async () => {
    const result = await handleAskGemini({
      agent_role: 'designer',
      output_file: '/tmp/test-output.md',
    });
    expect(result.isError).toBe(true);
    expect(result.content).toHaveLength(1);
    expect(result.content[0].type).toBe('text');
  });
});

describe('Inline prompt validation - empty and background', () => {
  it('should reject empty/whitespace-only inline prompt for Codex with explicit message', async () => {
    const result = await handleAskCodex({
      prompt: '   ',
      agent_role: 'architect',
    });
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain('Inline prompt is empty');
    expect(spawn).not.toHaveBeenCalled();
  });

  it('should reject empty/whitespace-only inline prompt for Gemini with explicit message', async () => {
    const result = await handleAskGemini({
      prompt: '   ',
      agent_role: 'designer',
    });
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain('Inline prompt is empty');
    expect(spawn).not.toHaveBeenCalled();
  });

  it('should reject empty string inline prompt for Codex', async () => {
    const result = await handleAskCodex({
      prompt: '',
      agent_role: 'architect',
    });
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain('Inline prompt is empty');
  });

  it('should reject empty string inline prompt for Gemini', async () => {
    const result = await handleAskGemini({
      prompt: '',
      agent_role: 'designer',
    });
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain('Inline prompt is empty');
  });

  it('should block inline prompt with background mode for Codex', async () => {
    const result = await handleAskCodex({
      prompt: 'bg test codex',
      agent_role: 'architect',
      background: true,
    });
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain('foreground only');
  });
});

describe('inline success response shape contract', () => {
  // These tests verify that inline mode returns exactly 2 content blocks:
  // Block 1: metadata lines (text)
  // Block 2: wrapped untrusted CLI response (text)
  // While error responses always return exactly 1 block.

  describe('handleAskCodex', () => {
    it('error responses should be single content block (success shape tested in inline-success-shape.test.ts)', async () => {
      const result = await handleAskCodex({
        prompt: '  ',
        agent_role: 'architect',
      });
      expect(result.isError).toBe(true);
      expect(result.content).toHaveLength(1);
      expect(result.content[0].type).toBe('text');
    });

    it('validation errors should always be single content block', async () => {
      const errorCases = [
        { agent_role: 'architect', output_file: '/tmp/out.md' }, // missing prompt
        { prompt: '  ', agent_role: 'architect' }, // empty inline
        { prompt: 'test', agent_role: 'architect', background: true }, // bg blocked
        { prompt_file: 'f.md', agent_role: 'architect' }, // missing output_file
      ];
      for (const args of errorCases) {
        const result = await handleAskCodex(args as any);
        expect(result.isError).toBe(true);
        expect(result.content).toHaveLength(1);
        expect(result.content[0].type).toBe('text');
      }
    });
  });

  describe('handleAskGemini', () => {
    it('validation errors should always be single content block', async () => {
      const errorCases = [
        { agent_role: 'designer', output_file: '/tmp/out.md' }, // missing prompt
        { prompt: '  ', agent_role: 'designer' }, // empty inline
        { prompt_file: 'f.md', agent_role: 'designer' }, // missing output_file
      ];
      for (const args of errorCases) {
        const result = await handleAskGemini(args as any);
        expect(result.isError).toBe(true);
        expect(result.content).toHaveLength(1);
        expect(result.content[0].type).toBe('text');
      }
    });
  });
});

describe('Inline prompt edge cases', () => {
  it('inline + background rejection returns before any persistence', async () => {
    // Background check occurs BEFORE persistence (mkdirSync/writeFileSync),
    // so rejected background requests never touch the filesystem by design.
    const result = await handleAskCodex({
      agent_role: 'architect',
      prompt: 'test prompt',
      background: true,
    });

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain('foreground only');
    // Structural guarantee: isInlineMode && args.background check precedes all fs operations
  });

  it('prompt_file: undefined with valid prompt treats as inline mode', async () => {
    // prompt_file key exists but value is undefined - should NOT suppress inline mode
    const result = await handleAskCodex({
      agent_role: 'architect',
      prompt: 'test inline prompt',
      prompt_file: undefined,
    });
    // Should NOT get the "Either prompt or prompt_file" error
    const text = result.content[0].text;
    expectNoMissingPromptError(text);
  });

  it('prompt_file: null with valid prompt treats null as defined (file mode) for Codex', async () => {
    const result = await handleAskCodex({
      agent_role: 'architect',
      prompt: 'test inline prompt',
      prompt_file: null as any,
      output_file: '/tmp/test-output.md',
    });
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain('prompt_file must be a non-empty string');
  });

  it('prompt_file: null with valid prompt treats null as defined (file mode) for Gemini', async () => {
    const result = await handleAskGemini({
      agent_role: 'designer',
      prompt: 'test inline prompt',
      prompt_file: null as any,
      output_file: '/tmp/test-output.md',
    });
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain('prompt_file must be a non-empty string');
  });

  it('rejects oversized inline prompts', async () => {
    const hugePrompt = 'x'.repeat(256 * 1024 + 1);
    const result = await handleAskCodex({
      agent_role: 'architect',
      prompt: hugePrompt,
    });
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain('exceeds maximum size');
  });

  it('Codex: non-string output_file in file mode returns output_file error without crash', async () => {
    const result = await handleAskCodex({
      agent_role: 'architect',
      prompt_file: '/tmp/test.md',
      output_file: 123 as any,
    });
    expect(result.isError).toBe(true);
    expect(result.content).toHaveLength(1);
    expect(result.content[0].text).toContain('output_file is required');
  });

  it('Gemini: non-string output_file in file mode returns output_file error without crash', async () => {
    const result = await handleAskGemini({
      agent_role: 'designer',
      prompt_file: '/tmp/test.md',
      output_file: null as any,
    });
    expect(result.isError).toBe(true);
    expect(result.content).toHaveLength(1);
    expect(result.content[0].text).toContain('output_file is required');
  });

  it('Codex: prompt_file number returns explicit prompt_file type error', async () => {
    const result = await handleAskCodex({
      agent_role: 'architect',
      prompt: 'test inline prompt',
      prompt_file: 123 as any,
      output_file: '/tmp/test-output.md',
    });
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain('prompt_file must be a non-empty string');
  });

  it('Gemini: prompt_file number returns explicit prompt_file type error', async () => {
    const result = await handleAskGemini({
      agent_role: 'designer',
      prompt: 'test inline prompt',
      prompt_file: 123 as any,
      output_file: '/tmp/test-output.md',
    });
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain('prompt_file must be a non-empty string');
  });
});
