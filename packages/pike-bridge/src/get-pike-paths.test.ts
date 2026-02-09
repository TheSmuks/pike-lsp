import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { PikeBridge } from './bridge.js';

describe('getPikePaths', () => {
    let bridge: PikeBridge;

    before(async () => {
        bridge = new PikeBridge();
        await bridge.start();
        await new Promise(resolve => setTimeout(resolve, 200));
    });

    after(async () => {
        if (bridge) {
            await bridge.stop();
        }
    });

    it('should return include_paths and module_paths arrays', async () => {
        const result = await bridge.getPikePaths();

        assert.ok(result, 'Result should be defined');
        assert.ok(Array.isArray(result.include_paths), 'include_paths should be array');
        assert.ok(Array.isArray(result.module_paths), 'module_paths should be array');

        // Verify all paths are non-empty strings
        result.include_paths.forEach((path: string) => {
            assert.strictEqual(typeof path, 'string');
            assert.ok(path.length > 0, 'Path should not be empty');
        });

        result.module_paths.forEach((path: string) => {
            assert.strictEqual(typeof path, 'string');
            assert.ok(path.length > 0, 'Path should not be empty');
        });
    });

    it('should return paths from Pike runtime, not hardcoded fallbacks', async () => {
        const result = await bridge.getPikePaths();

        // Verify at least one include path ends with /include
        const hasIncludeDir = result.include_paths.some((path: string) =>
            path.endsWith('/include')
        );
        assert.ok(hasIncludeDir, 'At least one include_path should end with /include');

        // Verify at least one module path ends with /modules
        const hasModulesDir = result.module_paths.some((path: string) =>
            path.endsWith('/modules')
        );
        assert.ok(hasModulesDir, 'At least one module_path should end with /modules');

        // Verify all paths are absolute
        result.include_paths.forEach((path: string) => {
            assert.ok(path.startsWith('/'), `Include path should be absolute: ${path}`);
        });

        result.module_paths.forEach((path: string) => {
            assert.ok(path.startsWith('/'), `Module path should be absolute: ${path}`);
        });
    });

    it('should return paths that exist on the filesystem', async () => {
        const result = await bridge.getPikePaths();

        // Verify all include paths exist
        result.include_paths.forEach((path: string) => {
            assert.ok(
                fs.existsSync(path),
                `Include path should exist on filesystem: ${path}`
            );
        });

        // Verify all module paths exist
        result.module_paths.forEach((path: string) => {
            assert.ok(
                fs.existsSync(path),
                `Module path should exist on filesystem: ${path}`
            );
        });
    });

    it('should return at least one include path and one module path', async () => {
        const result = await bridge.getPikePaths();

        assert.ok(
            result.include_paths.length > 0,
            'Should return at least one include path'
        );

        assert.ok(
            result.module_paths.length > 0,
            'Should return at least one module path'
        );
    });
});
