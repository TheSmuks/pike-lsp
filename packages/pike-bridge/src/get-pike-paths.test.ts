import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
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
});
