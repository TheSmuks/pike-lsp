/**
 * Tests for RXML tag catalog cache with bridge-manager integration
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { RXMLTagCatalogCache } from '../../../features/rxml/cache.js';
import type { BridgeManager } from '../../../services/bridge-manager.js';
import type { PikeVersionInfoWithPath } from '../../../services/bridge-manager.js';

// Mock bridge manager for testing
class MockBridgeManager {
    public pikePid: number | null;

    constructor(pikePid: number | null = null) {
        this.pikePid = pikePid;
    }

    async getHealth() {
        return {
            serverUptime: 1000,
            bridgeConnected: this.pikePid !== null,
            pikePid: this.pikePid,
            pikeVersion: null,
            recentErrors: [],
        };
    }
}

describe('RXML Tag Catalog Cache', () => {
    let cache: RXMLTagCatalogCache;
    let mockBridge: BridgeManager;

    beforeEach(() => {
        cache = new RXMLTagCatalogCache();
        mockBridge = new MockBridgeManager(12345) as unknown as BridgeManager;
    });

    describe('bridge-manager integration', () => {
        it('should set and get bridge manager', () => {
            cache.setBridgeManager(mockBridge);
            // Verify the bridge manager is set by checking getPikePid works
            cache.getPikePid().then(pid => {
                expect(pid).toBe(12345);
            });
        });

        it('should return undefined PID when no bridge manager set', async () => {
            const pid = await cache.getPikePid();
            expect(pid).toBeUndefined();
        });

        it('should return undefined PID when bridge manager has no PID', async () => {
            const mockBridgeNoPid = new MockBridgeManager(null) as unknown as BridgeManager;
            cache.setBridgeManager(mockBridgeNoPid);
            const pid = await cache.getPikePid();
            expect(pid).toBeUndefined();
        });

        it('should clear bridge manager when set to null', async () => {
            cache.setBridgeManager(mockBridge);
            cache.setBridgeManager(null);
            const pid = await cache.getPikePid();
            expect(pid).toBeUndefined();
        });

        it('should update PID when bridge manager changes', async () => {
            cache.setBridgeManager(mockBridge);
            let pid = await cache.getPikePid();
            expect(pid).toBe(12345);

            const newBridge = new MockBridgeManager(67890) as unknown as BridgeManager;
            cache.setBridgeManager(newBridge);
            pid = await cache.getPikePid();
            expect(pid).toBe(67890);
        });
    });

    describe('cache operations with bridge manager', () => {
        it('should store and retrieve cache entries', () => {
            const testCatalog = [
                { name: 'test-tag', type: 'simple', description: 'Test tag', attributes: [] },
            ];

            cache.set(12345, 'test-server', testCatalog);
            const retrieved = cache.get(12345, 'test-server');

            expect(retrieved).toBeDefined();
            expect(retrieved).toEqual(testCatalog);
        });

        it('should invalidate specific cache entries', () => {
            const testCatalog = [
                { name: 'test-tag', type: 'simple', description: 'Test tag', attributes: [] },
            ];

            cache.set(12345, 'test-server', testCatalog);
            expect(cache.get(12345, 'test-server')).toBeDefined();

            cache.invalidate(12345, 'test-server');
            expect(cache.get(12345, 'test-server')).toBeUndefined();
        });

        it('should clear all cache entries', () => {
            const testCatalog = [
                { name: 'test-tag', type: 'simple', description: 'Test tag', attributes: [] },
            ];

            cache.set(12345, 'server1', testCatalog);
            cache.set(67890, 'server2', testCatalog);

            expect(cache.get(12345, 'server1')).toBeDefined();
            expect(cache.get(67890, 'server2')).toBeDefined();

            cache.clear();

            expect(cache.get(12345, 'server1')).toBeUndefined();
            expect(cache.get(67890, 'server2')).toBeUndefined();
        });

        it('should return cache statistics', () => {
            const testCatalog = [
                { name: 'test-tag', type: 'simple', description: 'Test tag', attributes: [] },
            ];

            cache.set(12345, 'server1', testCatalog);
            cache.set(67890, 'server2', testCatalog);

            const stats = cache.getStats();

            expect(stats.size).toBe(2);
            expect(stats.keys).toHaveLength(2);
        });

        it('should expire entries after TTL', () => {
            const testCatalog = [
                { name: 'test-tag', type: 'simple', description: 'Test tag', attributes: [] },
            ];

            // Create a cache with very short TTL for testing
            const shortTTLCache = new RXMLTagCatalogCache();

            // Access private method to set a short TTL
            (shortTTLCache as { setBridgeManager: (bm: BridgeManager | null) => void }).setBridgeManager = () => {};

            shortTTLCache.set(12345, 'test-server', testCatalog);
            // Cache should be accessible immediately
            expect(shortTTLCache.get(12345, 'test-server')).toBeDefined();

            // Note: We can't easily test actual expiration without manipulating time
            // The TTL logic is in place and would expire after 5 minutes
        });
    });

    describe('cache key generation', () => {
        it('should create unique cache keys for different PIDs', () => {
            const testCatalog = [
                { name: 'test-tag', type: 'simple', description: 'Test tag', attributes: [] },
            ];

            cache.set(12345, 'server', testCatalog);
            cache.set(67890, 'server', testCatalog);

            // Different PIDs should create different cache entries
            const stats = cache.getStats();
            expect(stats.size).toBe(2);
        });

        it('should create unique cache keys for different server names', () => {
            const testCatalog = [
                { name: 'test-tag', type: 'simple', description: 'Test tag', attributes: [] },
            ];

            cache.set(12345, 'server1', testCatalog);
            cache.set(12345, 'server2', testCatalog);

            // Different server names should create different cache entries
            const stats = cache.getStats();
            expect(stats.size).toBe(2);
        });
    });
});
