import { describe, it, expect } from 'bun:test';
import { PikeIntrospectionService } from '../services/pike-introspection.js';
import { createMockServices } from './helpers/mock-services.js';
import { createMockStdlibIndex, makeModuleInfo } from './helpers/prewarm-test-helpers.js';
import type { StdlibModuleInfo } from '../stdlib-index.js';

function createService(modules: Map<string, StdlibModuleInfo>) {
  const index = createMockStdlibIndex(modules);
  const services = createMockServices({ stdlibIndex: index });
  return new PikeIntrospectionService(services, undefined, index);
}

describe('Performance: Prewarm vs Lazy Loading', () => {
  it('should find symbols via prewarmed index that lazy loading would miss on first query', async () => {
    const modules = new Map<string, StdlibModuleInfo>([
      ['Stdio', makeModuleInfo('Stdio', ['Stdio', 'write', 'read'])],
      ['Parser', makeModuleInfo('Parser', ['Parser', 'parse', 'feed'])],
    ]);

    // Prewarmed service populates index eagerly
    const prewarmed = createService(modules);
    await prewarmed.prewarmStdlibIndex();

    const results = await prewarmed.searchImportableSymbols('Stdio');
    const stdlibResults = results.filter(r => r.source === 'stdlib-index');
    expect(stdlibResults.length).toBeGreaterThan(0);
    expect(stdlibResults.some(c => c.symbol === 'Stdio' && c.modulePath === 'Stdio')).toBe(true);
  });

  it('should prewarm all top 10 modules and report metrics', async () => {
    const modules = new Map<string, StdlibModuleInfo>(
      [
        'Stdio',
        'Parser',
        'String',
        'Array',
        'Mapping',
        'Multiset',
        'ADT',
        'Protocols',
        'MIME',
        'System',
      ].map(name => [name, makeModuleInfo(name, [`fn_${name}_1`, `fn_${name}_2`])])
    );

    const service = createService(modules);
    const result = await service.prewarmStdlibIndex();

    // All 10 modules should be loaded
    expect(result.modulesLoaded.length).toBe(10);
    expect(result.modulesFailed).toEqual([]);
    expect(result.totalSymbols).toBe(20); // 2 symbols per module
    expect(result.durationMs).toBeGreaterThanOrEqual(0);
  });

  it('should report failures for modules that return null or throw', async () => {
    const modules = new Map<string, StdlibModuleInfo>([
      ['Stdio', makeModuleInfo('Stdio', ['write'])],
    ]);

    // Index returns null for everything except Stdio
    const service = createService(modules);
    const result = await service.prewarmStdlibIndex();

    expect(result.modulesLoaded).toEqual(['Stdio']);
    expect(result.modulesFailed.length).toBe(9); // All other modules
    expect(result.totalSymbols).toBe(1);
  });
});
