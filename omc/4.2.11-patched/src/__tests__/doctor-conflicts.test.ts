/**
 * Tests for doctor-conflicts command (issue #606)
 *
 * Verifies that OMC-managed hooks are correctly classified as OMC-owned,
 * not falsely flagged as "Other".
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { existsSync, mkdirSync, writeFileSync, rmSync } from 'fs';
import { join } from 'path';
import { homedir } from 'os';

const TEST_CLAUDE_DIR = join(homedir(), '.claude-test-doctor-conflicts');

// Mock getClaudeConfigDir before importing the module under test
vi.mock('../utils/paths.js', () => ({
  getClaudeConfigDir: () => TEST_CLAUDE_DIR,
}));

// Import after mock setup
import { checkHookConflicts, runConflictCheck, type ConflictReport } from '../cli/commands/doctor-conflicts.js';

describe('doctor-conflicts: hook ownership classification', () => {
  beforeEach(() => {
    if (existsSync(TEST_CLAUDE_DIR)) {
      rmSync(TEST_CLAUDE_DIR, { recursive: true, force: true });
    }
    mkdirSync(TEST_CLAUDE_DIR, { recursive: true });
  });

  afterEach(() => {
    if (existsSync(TEST_CLAUDE_DIR)) {
      rmSync(TEST_CLAUDE_DIR, { recursive: true, force: true });
    }
  });

  it('classifies real OMC hook commands as OMC-owned (issue #606)', () => {
    // These are the actual commands OMC installs into settings.json
    const settings = {
      hooks: {
        UserPromptSubmit: [{
          hooks: [{
            type: 'command',
            command: 'node "$HOME/.claude/hooks/keyword-detector.mjs"',
          }],
        }],
        SessionStart: [{
          hooks: [{
            type: 'command',
            command: 'node "$HOME/.claude/hooks/session-start.mjs"',
          }],
        }],
        PreToolUse: [{
          hooks: [{
            type: 'command',
            command: 'node "$HOME/.claude/hooks/pre-tool-use.mjs"',
          }],
        }],
        PostToolUse: [{
          hooks: [{
            type: 'command',
            command: 'node "$HOME/.claude/hooks/post-tool-use.mjs"',
          }],
        }],
        Stop: [{
          hooks: [{
            type: 'command',
            command: 'node "$HOME/.claude/hooks/persistent-mode.mjs"',
          }],
        }],
      },
    };

    writeFileSync(join(TEST_CLAUDE_DIR, 'settings.json'), JSON.stringify(settings));
    const conflicts = checkHookConflicts();

    // All hooks should be classified as OMC-owned
    expect(conflicts.length).toBeGreaterThan(0);
    for (const hook of conflicts) {
      expect(hook.isOmc).toBe(true);
    }
  });

  it('classifies Windows-style OMC hook commands as OMC-owned', () => {
    const settings = {
      hooks: {
        PreToolUse: [{
          hooks: [{
            type: 'command',
            command: 'node "%USERPROFILE%\\.claude\\hooks\\pre-tool-use.mjs"',
          }],
        }],
      },
    };

    writeFileSync(join(TEST_CLAUDE_DIR, 'settings.json'), JSON.stringify(settings));
    const conflicts = checkHookConflicts();

    expect(conflicts).toHaveLength(1);
    expect(conflicts[0].isOmc).toBe(true);
  });

  it('classifies non-OMC hooks as not OMC-owned', () => {
    const settings = {
      hooks: {
        PreToolUse: [{
          hooks: [{
            type: 'command',
            command: 'node ~/other-plugin/hooks/pre-tool.mjs',
          }],
        }],
      },
    };

    writeFileSync(join(TEST_CLAUDE_DIR, 'settings.json'), JSON.stringify(settings));
    const conflicts = checkHookConflicts();

    expect(conflicts).toHaveLength(1);
    expect(conflicts[0].isOmc).toBe(false);
  });

  it('correctly distinguishes OMC and non-OMC hooks in mixed config', () => {
    const settings = {
      hooks: {
        PreToolUse: [{
          hooks: [{
            type: 'command',
            command: 'node "$HOME/.claude/hooks/pre-tool-use.mjs"',
          }],
        }],
        PostToolUse: [{
          hooks: [{
            type: 'command',
            command: 'python ~/other-plugin/post-tool.py',
          }],
        }],
      },
    };

    writeFileSync(join(TEST_CLAUDE_DIR, 'settings.json'), JSON.stringify(settings));
    const conflicts = checkHookConflicts();

    expect(conflicts).toHaveLength(2);

    const preTool = conflicts.find(c => c.event === 'PreToolUse');
    const postTool = conflicts.find(c => c.event === 'PostToolUse');

    expect(preTool?.isOmc).toBe(true);
    expect(postTool?.isOmc).toBe(false);
  });

  it('reports hasConflicts only when non-OMC hooks exist', () => {
    // All-OMC config: no conflicts
    const omcOnlySettings = {
      hooks: {
        PreToolUse: [{
          hooks: [{
            type: 'command',
            command: 'node "$HOME/.claude/hooks/pre-tool-use.mjs"',
          }],
        }],
      },
    };

    writeFileSync(join(TEST_CLAUDE_DIR, 'settings.json'), JSON.stringify(omcOnlySettings));
    const omcReport = runConflictCheck();
    // hasConflicts should be false when all hooks are OMC-owned
    expect(omcReport.hookConflicts.every(h => h.isOmc)).toBe(true);
    expect(omcReport.hookConflicts.some(h => !h.isOmc)).toBe(false);
  });
});
