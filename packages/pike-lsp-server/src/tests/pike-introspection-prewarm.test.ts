import { describe, it, expect } from 'bun:test';
import { PikeIntrospectionService } from '../services/pike-introspection.js';
import { createMockServices } from './helpers/mock-services.js';
import { createMockStdlibIndex, makeModuleInfo } from './helpers/prewarm-test-helpers.js';
import type { StdlibModuleInfo } from '../stdlib-index.js';


describe('PikeIntrospectionService - prewarmStdlibIndex', () => {
  it('should return empty result when no stdlibIndex is set', async () => {
    const services = createMockServices();
    const svc = new PikeIntrospectionService(services);
    const result = await svc.prewarmStdlibIndex();
    expect(result.durationMs).toBe(0);
    expect(result.modulesLoaded).toEqual([]);
    expect(result.modulesFailed).toEqual([]);
    expect(result.totalSymbols).toBe(0);
  });

  it('should load modules from stdlibIndex and populate index', async () => {
    const modules = new Map<string, StdlibModuleInfo>([
      makeModuleInfoPair('Stdio', ['write', 'read', 'Stdio']),
      makeModuleInfoPair('Parser', ['parse', 'feed', 'finish']),
    ]);
    const index = createMockStdlibIndex(modules);
    const services = createMockServices({ stdlibIndex: index });
    const svc = new PikeIntrospectionService(services, undefined, index);

    const result = await svc.prewarmStdlibIndex();

    // Only Stdio and Parser exist in mock, rest fail (return null)
    expect(result.modulesLoaded).toContain('Stdio');
    expect(result.modulesLoaded).toContain('Parser');
    expect(result.modulesFailed.length).toBeGreaterThan(0);
    expect(result.totalSymbols).toBe(6); // 3 + 3
    expect(result.durationMs).toBeGreaterThanOrEqual(0);
  });

  it('should handle individual module load failures gracefully', async () => {
    const modules = new Map<string, StdlibModuleInfo>([
      makeModuleInfoPair('String', ['trim', 'split']),
    ]);
    const failModules = new Set(['Parser']);
    const index = createMockStdlibIndex(modules, failModules);
    const services = createMockServices({ stdlibIndex: index });
    const svc = new PikeIntrospectionService(services, undefined, index);

    const result = await svc.prewarmStdlibIndex();

    expect(result.modulesLoaded).toContain('String');
    expect(result.modulesFailed).toContain('Parser');
  });

  it('should populate symbol index so subsequent searches find symbols', async () => {
    const modules = new Map<string, StdlibModuleInfo>([
      makeModuleInfoPair('Stdio', ['Stdio', 'write', 'read']),
    ]);
    const index = createMockStdlibIndex(modules);
    const services = createMockServices({ stdlibIndex: index });
    const svc = new PikeIntrospectionService(services, undefined, index);

    // Prewarm
    await svc.prewarmStdlibIndex();

    // After prewarm: searching for 'Stdio' returns Stdio module
    const results = await svc.searchImportableSymbols('Stdio');
    const stdlibResults = results.filter(r => r.source === 'stdlib-index');
    expect(stdlibResults.length).toBeGreaterThan(0);
    expect(stdlibResults.some(c => c.symbol === 'Stdio' && c.modulePath === 'Stdio')).toBe(true);

    // Searching for 'write' finds Stdio.write via fuzzy matching
    const writeResults = await svc.searchImportableSymbols('write');
    const writeStdlib = writeResults.filter(r => r.source === 'stdlib-index');
    expect(writeStdlib.some(c => c.symbol === 'write' && c.modulePath === 'Stdio')).toBe(true);
  });
});

function makeModuleInfoPair(modulePath: string, symbolNames: string[]): [string, StdlibModuleInfo] {
  return [modulePath, makeModuleInfo(modulePath, symbolNames)];
}
