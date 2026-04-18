import { describe, it, expect, beforeAll } from 'bun:test';
import { PikeIntrospectionService } from '../services/pike-introspection.js';
import { createMockServices } from '../tests/helpers/mock-services.js';
import { createMockStdlibIndex, makeModuleInfo } from '../tests/helpers/prewarm-test-helpers.js';
import type { StdlibModuleInfo } from '../stdlib-index.js';


describe('Scenario: Auto-import after prewarming', () => {
  let service: PikeIntrospectionService;

  beforeAll(async () => {
    const modules = new Map<string, StdlibModuleInfo>([
      ['Stdio', makeModuleInfo('Stdio', ['Stdio', 'write', 'read', 'readline', 'stderr'])],
      ['Parser', makeModuleInfo('Parser', ['Parser', 'parse', 'feed', 'finish'])],
      ['String', makeModuleInfo('String', ['String', 'trim', 'split', 'strtoupper', 'lower_case'])],
      ['Array', makeModuleInfo('Array', ['Array', 'sort', 'filter', 'map', 'reduce'])],
    ]);
    const index = createMockStdlibIndex(modules);
    const services = createMockServices({ stdlibIndex: index });
    service = new PikeIntrospectionService(services, undefined, index);
    await service.prewarmStdlibIndex();
  });

  it('should return Stdio symbols immediately without bridge calls', async () => {
    const results = await service.searchImportableSymbols('Stdio');
    const stdlibResults = results.filter(r => r.source === 'stdlib-index');
    expect(stdlibResults.length).toBeGreaterThan(0);
    expect(stdlibResults.some(c => c.symbol === 'Stdio')).toBe(true);
  });

  it('should return Parser symbols immediately without bridge calls', async () => {
    const results = await service.searchImportableSymbols('Parser');
    const stdlibResults = results.filter(r => r.source === 'stdlib-index');
    expect(stdlibResults.length).toBeGreaterThan(0);
    expect(stdlibResults.some(c => c.symbol === 'Parser')).toBe(true);
  });

  it('should return String module symbols without bridge calls', async () => {
    const results = await service.searchImportableSymbols('String');
    const stdlibResults = results.filter(r => r.source === 'stdlib-index');
    expect(stdlibResults.some(c => c.symbol === 'String')).toBe(true);
  });

  it('should find write() method from prewarmed Stdio module', async () => {
    const results = await service.searchImportableSymbols('write');
    const stdlibResults = results.filter(r => r.source === 'stdlib-index');
    expect(stdlibResults.some(c => c.symbol === 'write' && c.modulePath === 'Stdio')).toBe(true);
  });

  it('should find split() method from prewarmed String module', async () => {
    const results = await service.searchImportableSymbols('split');
    const stdlibResults = results.filter(r => r.source === 'stdlib-index');
    expect(stdlibResults.some(c => c.symbol === 'split' && c.modulePath === 'String')).toBe(true);
  });
});
