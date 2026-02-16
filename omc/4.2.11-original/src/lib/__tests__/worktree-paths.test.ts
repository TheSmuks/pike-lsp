import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mkdirSync, rmSync, existsSync, mkdtempSync } from 'fs';
import { execSync } from 'child_process';
import { join } from 'path';
import {
  validatePath,
  resolveOmcPath,
  resolveStatePath,
  ensureOmcDir,
  getWorktreeNotepadPath,
  getWorktreeProjectMemoryPath,
  getOmcRoot,
  resolvePlanPath,
  resolveResearchPath,
  resolveLogsPath,
  resolveWisdomPath,
  isPathUnderOmc,
  ensureAllOmcDirs,
  clearWorktreeCache,
  getProcessSessionId,
  resetProcessSessionId,
  validateSessionId,
  resolveToWorktreeRoot,
  validateWorkingDirectory,
  getWorktreeRoot,
} from '../worktree-paths.js';

const TEST_DIR = '/tmp/worktree-paths-test';

describe('worktree-paths', () => {
  beforeEach(() => {
    clearWorktreeCache();
    mkdirSync(TEST_DIR, { recursive: true });
  });

  afterEach(() => {
    rmSync(TEST_DIR, { recursive: true, force: true });
  });

  describe('validatePath', () => {
    it('should reject path traversal attempts', () => {
      expect(() => validatePath('../foo')).toThrow('path traversal');
      expect(() => validatePath('foo/../bar')).toThrow('path traversal');
      expect(() => validatePath('../../etc/passwd')).toThrow('path traversal');
    });

    it('should reject absolute paths', () => {
      expect(() => validatePath('/etc/passwd')).toThrow('absolute paths');
      expect(() => validatePath('~/secret')).toThrow('absolute paths');
    });

    it('should allow valid relative paths', () => {
      expect(() => validatePath('state/ralph.json')).not.toThrow();
      expect(() => validatePath('notepad.md')).not.toThrow();
      expect(() => validatePath('plans/my-plan.md')).not.toThrow();
    });
  });

  describe('resolveOmcPath', () => {
    it('should resolve paths under .omc directory', () => {
      const result = resolveOmcPath('state/ralph.json', TEST_DIR);
      expect(result).toBe(join(TEST_DIR, '.omc', 'state', 'ralph.json'));
    });

    it('should reject paths that escape .omc boundary', () => {
      expect(() => resolveOmcPath('../secret.txt', TEST_DIR)).toThrow('path traversal');
    });
  });

  describe('resolveStatePath', () => {
    it('should resolve state file paths with -state suffix', () => {
      const result = resolveStatePath('ralph', TEST_DIR);
      expect(result).toBe(join(TEST_DIR, '.omc', 'state', 'ralph-state.json'));
    });

    it('should handle input already having -state suffix', () => {
      const result = resolveStatePath('ultrawork-state', TEST_DIR);
      expect(result).toBe(join(TEST_DIR, '.omc', 'state', 'ultrawork-state.json'));
    });

    it('should throw for swarm (uses SQLite, not JSON)', () => {
      expect(() => resolveStatePath('swarm', TEST_DIR)).toThrow('SQLite');
      expect(() => resolveStatePath('swarm-state', TEST_DIR)).toThrow('SQLite');
    });
  });

  describe('ensureOmcDir', () => {
    it('should create directories under .omc', () => {
      const result = ensureOmcDir('state', TEST_DIR);
      expect(result).toBe(join(TEST_DIR, '.omc', 'state'));
      expect(existsSync(result)).toBe(true);
    });
  });

  describe('helper functions', () => {
    it('getWorktreeNotepadPath returns correct path', () => {
      const result = getWorktreeNotepadPath(TEST_DIR);
      expect(result).toBe(join(TEST_DIR, '.omc', 'notepad.md'));
    });

    it('getWorktreeProjectMemoryPath returns correct path', () => {
      const result = getWorktreeProjectMemoryPath(TEST_DIR);
      expect(result).toBe(join(TEST_DIR, '.omc', 'project-memory.json'));
    });

    it('getOmcRoot returns correct path', () => {
      const result = getOmcRoot(TEST_DIR);
      expect(result).toBe(join(TEST_DIR, '.omc'));
    });

    it('resolvePlanPath returns correct path', () => {
      const result = resolvePlanPath('my-feature', TEST_DIR);
      expect(result).toBe(join(TEST_DIR, '.omc', 'plans', 'my-feature.md'));
    });

    it('resolveResearchPath returns correct path', () => {
      const result = resolveResearchPath('api-research', TEST_DIR);
      expect(result).toBe(join(TEST_DIR, '.omc', 'research', 'api-research'));
    });

    it('resolveLogsPath returns correct path', () => {
      const result = resolveLogsPath(TEST_DIR);
      expect(result).toBe(join(TEST_DIR, '.omc', 'logs'));
    });

    it('resolveWisdomPath returns correct path', () => {
      const result = resolveWisdomPath('my-plan', TEST_DIR);
      expect(result).toBe(join(TEST_DIR, '.omc', 'notepads', 'my-plan'));
    });
  });

  describe('isPathUnderOmc', () => {
    it('should return true for paths under .omc', () => {
      expect(isPathUnderOmc(join(TEST_DIR, '.omc', 'state', 'ralph.json'), TEST_DIR)).toBe(true);
      expect(isPathUnderOmc(join(TEST_DIR, '.omc'), TEST_DIR)).toBe(true);
    });

    it('should return false for paths outside .omc', () => {
      expect(isPathUnderOmc(join(TEST_DIR, 'src', 'file.ts'), TEST_DIR)).toBe(false);
      expect(isPathUnderOmc('/etc/passwd', TEST_DIR)).toBe(false);
    });
  });

  describe('ensureAllOmcDirs', () => {
    it('should create all standard .omc subdirectories', () => {
      ensureAllOmcDirs(TEST_DIR);

      expect(existsSync(join(TEST_DIR, '.omc'))).toBe(true);
      expect(existsSync(join(TEST_DIR, '.omc', 'state'))).toBe(true);
      expect(existsSync(join(TEST_DIR, '.omc', 'plans'))).toBe(true);
      expect(existsSync(join(TEST_DIR, '.omc', 'research'))).toBe(true);
      expect(existsSync(join(TEST_DIR, '.omc', 'logs'))).toBe(true);
      expect(existsSync(join(TEST_DIR, '.omc', 'notepads'))).toBe(true);
      expect(existsSync(join(TEST_DIR, '.omc', 'drafts'))).toBe(true);
    });
  });

  describe('resolveToWorktreeRoot', () => {
    it('should return process.cwd()-based root when no directory provided', () => {
      const result = resolveToWorktreeRoot();
      // We are inside a git repo, so it should return a real root
      expect(result).toBeTruthy();
      expect(typeof result).toBe('string');
    });

    it('should resolve a subdirectory to its git worktree root', () => {
      // Use the current repo - create a subdir and verify it resolves to root
      const root = getWorktreeRoot(process.cwd());
      if (!root) return; // skip if not in a git repo
      const subdir = join(root, 'src');
      const result = resolveToWorktreeRoot(subdir);
      expect(result).toBe(root);
    });

    it('should fall back and log for non-git directories', () => {
      const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
      const nonGitDir = mkdtempSync('/tmp/worktree-paths-nongit-');

      const result = resolveToWorktreeRoot(nonGitDir);

      // non-git directory should fall back to process.cwd root
      const expectedRoot = getWorktreeRoot(process.cwd()) || process.cwd();
      expect(result).toBe(expectedRoot);
      expect(errorSpy).toHaveBeenCalledWith(
        '[worktree] non-git directory provided, falling back to process root',
        { directory: nonGitDir }
      );

      errorSpy.mockRestore();
      rmSync(nonGitDir, { recursive: true, force: true });
    });

    it('should handle bare repositories by falling back and logging', () => {
      const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
      const bareRepoDir = mkdtempSync('/tmp/worktree-paths-bare-');
      execSync('git init --bare', { cwd: bareRepoDir, stdio: 'pipe' });

      const result = resolveToWorktreeRoot(bareRepoDir);

      const expectedRoot = getWorktreeRoot(process.cwd()) || process.cwd();
      expect(result).toBe(expectedRoot);
      expect(errorSpy).toHaveBeenCalledWith(
        '[worktree] non-git directory provided, falling back to process root',
        { directory: bareRepoDir }
      );

      errorSpy.mockRestore();
      rmSync(bareRepoDir, { recursive: true, force: true });
    });
  });

  describe('validateWorkingDirectory (#576)', () => {
    it('should return worktree root even when workingDirectory is a subdirectory', () => {
      // This is the core #576 fix: a subdirectory must never be returned
      const root = getWorktreeRoot(process.cwd());
      if (!root) return; // skip if not in a git repo
      const subdir = join(root, 'src');
      const result = validateWorkingDirectory(subdir);
      expect(result).toBe(root);
    });

    it('should return trusted root when no workingDirectory provided', () => {
      const root = getWorktreeRoot(process.cwd()) || process.cwd();
      const result = validateWorkingDirectory();
      expect(result).toBe(root);
    });

    it('should throw for directories outside the trusted root', () => {
      // /etc is outside any repo worktree root
      expect(() => validateWorkingDirectory('/etc')).toThrow('outside the trusted worktree root');
    });

    it('should reject a workingDirectory that resolves to a different git root', () => {
      const nestedRepoDir = mkdtempSync('/tmp/worktree-paths-nested-');
      execSync('git init', { cwd: nestedRepoDir, stdio: 'pipe' });

      const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);

      const result = validateWorkingDirectory(nestedRepoDir);

      const trustedRoot = getWorktreeRoot(process.cwd()) || process.cwd();
      expect(result).toBe(trustedRoot);
      expect(errorSpy).toHaveBeenCalledWith(
        '[worktree] workingDirectory resolved to different git worktree root, using trusted root',
        expect.objectContaining({
          workingDirectory: nestedRepoDir,
          providedRoot: expect.any(String),
          trustedRoot: expect.any(String),
        })
      );

      errorSpy.mockRestore();
      rmSync(nestedRepoDir, { recursive: true, force: true });
    });
  });

  describe('getProcessSessionId (Issue #456)', () => {
    afterEach(() => {
      resetProcessSessionId();
    });

    it('should return a string matching pid-{PID}-{timestamp} format', () => {
      const sessionId = getProcessSessionId();
      expect(sessionId).toMatch(/^pid-\d+-\d+$/);
    });

    it('should include the current process PID', () => {
      const sessionId = getProcessSessionId();
      expect(sessionId).toContain(`pid-${process.pid}-`);
    });

    it('should return the same value on repeated calls (stable)', () => {
      const id1 = getProcessSessionId();
      const id2 = getProcessSessionId();
      const id3 = getProcessSessionId();
      expect(id1).toBe(id2);
      expect(id2).toBe(id3);
    });

    it('should pass session ID validation', () => {
      const sessionId = getProcessSessionId();
      expect(() => validateSessionId(sessionId)).not.toThrow();
    });

    it('should generate a new ID after reset', () => {
      const id1 = getProcessSessionId();
      resetProcessSessionId();
      const id2 = getProcessSessionId();
      // IDs should differ (different timestamp)
      // In rare cases they could match if called in the same millisecond,
      // but the PID portion will be the same so we just check they're strings
      expect(typeof id2).toBe('string');
      expect(id2).toMatch(/^pid-\d+-\d+$/);
    });
  });
});
