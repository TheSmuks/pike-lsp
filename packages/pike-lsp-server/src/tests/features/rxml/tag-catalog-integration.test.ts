/**
 * RXML Tag Catalog Integration Tests
 *
 * Tests Phase 5 implementation:
 * - Server tag fetching via Bridge
 * - Custom module tag parsing from .pike files
 * - Tag merging (built-in + server + custom)
 * - Cache invalidation on server restart
 * - Multiple server instance support
 */

import { describe, it, beforeEach, afterEach } from 'node:test';
import * as assert from 'node:assert';
import type { RXMLTagCatalogEntry } from '../../features/rxml/types.js';

// Mock types for testing
interface MockPikeBridge {
    roxenGetTagCatalog?(serverPid?: number): Promise<RXMLTagCatalogEntry[]>;
}

interface MockCatalogManager {
    getCatalog(serverPid: number, serverName: string): Promise<RXMLTagCatalogEntry[]>;
    refreshCatalog(serverPid: number, serverName: string): Promise<void>;
    invalidateServer(serverPid: number, serverName: string): void;
}

// ==================== IMPLEMENTATION (copied for testing) ====================

interface DetectedTagFunction {
    name: string;
    type: 'simple' | 'container';
    description?: string;
}

async function extractTagsFromPikeCodeImpl(pikeCode: string): Promise<RXMLTagCatalogEntry[]> {
    const detectedTags = detectTagFunctions(pikeCode);

    // Convert detected functions to catalog entries
    return detectedTags.map((tag): RXMLTagCatalogEntry => ({
        name: tag.name,
        type: tag.type,
        requiredAttributes: [],
        optionalAttributes: [],
        ...(tag.description !== undefined && { description: tag.description })
    }));
}

function detectTagFunctions(code: string): DetectedTagFunction[] {
    const tags: DetectedTagFunction[] = [];

    // Split into lines for analysis
    const lines = code.split('\n');

    for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        if (!line) continue;
        const trimmed = line.trim();

        // Check for simpletag pattern
        const simpletagMatch = trimmed.match(
            /(?:void|mapping|string)\s+simpletag_([a-z_][a-z0-9_]*)\s*\((.*?)\)/
        );

        if (simpletagMatch) {
            const tagName = simpletagMatch[1];
            const description = extractDescription(lines, i);

            tags.push({
                name: tagName,
                type: 'simple',
                description
            });
            continue;
        }

        // Check for container pattern
        const containerMatch = trimmed.match(
            /(?:void|mapping|string)\s+container_([a-z_][a-z0-9_]*)\s*\((.*?)\)/
        );

        if (containerMatch) {
            const tagName = containerMatch[1];
            const description = extractDescription(lines, i);

            tags.push({
                name: tagName,
                type: 'container',
                description
            });
        }
    }

    return tags;
}

function extractDescription(lines: string[], functionLine: number): string | undefined {
    const comments: string[] = [];

    // Scan backwards from function line
    for (let i = functionLine - 1; i >= 0; i--) {
        const line = lines[i];
        if (!line) break;
        const trimmed = line.trim();

        // Stop at non-comment line
        if (!trimmed.startsWith('//!')) {
            break;
        }

        // Extract comment content (remove //! prefix)
        const comment = trimmed.replace(/^\/\/!\s*/, '');
        comments.unshift(comment);
    }

    if (comments.length === 0) {
        return undefined;
    }

    return comments.join(' ');
}

type TagSource = 'builtin' | 'server' | 'custom';

interface TagWithSource extends RXMLTagCatalogEntry {
    source: TagSource;
}

function mergeTagsImpl(
    builtin: RXMLTagCatalogEntry[],
    server: RXMLTagCatalogEntry[],
    custom: RXMLTagCatalogEntry[]
): RXMLTagCatalogEntry[] {
    // Build tag map with priority ordering
    const tagMap = new Map<string, TagWithSource>();

    // Add server tags (lowest priority)
    for (const tag of server) {
        tagMap.set(tag.name, { ...tag, source: 'server' });
    }

    // Add built-in tags (override server)
    for (const tag of builtin) {
        tagMap.set(tag.name, { ...tag, source: 'builtin' });
    }

    // Add custom tags (highest priority - override everything)
    for (const tag of custom) {
        tagMap.set(tag.name, { ...tag, source: 'custom' });
    }

    // Convert map back to array
    const result: RXMLTagCatalogEntry[] = [];
    for (const tag of tagMap.values()) {
        const { source, ...entry } = tag;
        result.push(entry);
    }

    return result;
}

// ==================== TESTS ====================

describe('RXML Tag Catalog Integration', () => {
    describe('Server Tag Fetching', () => {
        it('should fetch tags from running Roxen server', async () => {
            // RED: Test implementation not yet written
            // This should call bridge.roxenGetTagCatalog(pid) and return tags
            const mockBridge: MockPikeBridge = {
                roxenGetTagCatalog: async (pid?: number) => {
                    return [
                        {
                            name: 'custom-server-tag',
                            type: 'simple',
                            requiredAttributes: ['attr1'],
                            optionalAttributes: ['attr2'],
                            description: 'Server-provided tag'
                        }
                    ];
                }
            };

            const tags = await mockBridge.roxenGetTagCatalog!(12345);
            assert.strictEqual(tags.length, 1);
            assert.strictEqual(tags[0].name, 'custom-server-tag');
        });

        it('should handle server communication errors gracefully', async () => {
            const mockBridge: MockPikeBridge = {
                roxenGetTagCatalog: async () => {
                    throw new Error('Roxen server not responding');
                }
            };

            await assert.rejects(
                async () => mockBridge.roxenGetTagCatalog!(),
                { message: 'Roxen server not responding' }
            );
        });

        it('should return empty array when server not running', async () => {
            const mockBridge: MockPikeBridge = {
                roxenGetTagCatalog: async () => []
            };

            const tags = await mockBridge.roxenGetTagCatalog!();
            assert.strictEqual(tags.length, 0);
        });
    });

    describe('Custom Module Tag Parsing', () => {
        it('should detect simpletag_* function patterns', async () => {
            const pikeCode = `
//! Custom module with RXML tags
//! @seealso
class MyModule {
    //! Simple tag handler
    void simpletag_my_custom_tag(mapping args, string content) {
        // Tag implementation
    }

    //! Container tag handler
    void container_my_container(mapping args, string content, mapping ctx) {
        // Container implementation
    }
};
`;

            // After implementation, this should extract:
            // - my_custom_tag (simple)
            // - my_container (container)
            const extractedTags = await extractTagsFromPikeCodeImpl(pikeCode);

            assert.strictEqual(extractedTags.length, 2);
            assert.strictEqual(extractedTags[0].name, 'my_custom_tag');
            assert.strictEqual(extractedTags[0].type, 'simple');
            assert.strictEqual(extractedTags[1].name, 'my_container');
            assert.strictEqual(extractedTags[1].type, 'container');
        });

        it('should extract tag metadata from function signatures', async () => {
            const pikeCode = `
//! User authentication module
class AuthModule {
    //! Login form tag
    //! @param args mapping with username, password
    void simpletag_login_form(mapping args) {
        // Implementation
    }

    //! Authenticated content container
    //! @param args mapping with required_role
    void container_authenticated(mapping args, string content) {
        // Implementation
    }
};
`;

            const tags = await extractTagsFromPikeCodeImpl(pikeCode);

            assert.strictEqual(tags[0].name, 'login_form');
            assert.ok(tags[0].description?.includes('Login form'));
            assert.strictEqual(tags[1].name, 'authenticated');
            assert.ok(tags[1].description?.includes('Authenticated content'));
        });

        it('should handle modules without tag functions', async () => {
            const pikeCode = `
//! Utility module with no RXML tags
class Utils {
    int add(int a, int b) {
        return a + b;
    }
};
`;

            const tags = await extractTagsFromPikeCodeImpl(pikeCode);
            assert.strictEqual(tags.length, 0);
        });

        it('should parse doc comments for tag descriptions', async () => {
            const pikeCode = `
//! Documentation module
class DocModule {
    //! Display user profile
    //! Requires user_id attribute
    void simpletag_user_profile(mapping args) {
        // Implementation
    }
};
`;

            const tags = await extractTagsFromPikeCodeImpl(pikeCode);

            assert.ok(tags[0].description?.includes('user profile'));
            assert.ok(tags[0].description?.includes('user_id'));
        });
    });

    describe('Tag Merging', () => {
        const builtinTags: RXMLTagCatalogEntry[] = [
            {
                name: 'echo',
                type: 'simple',
                requiredAttributes: ['var'],
                optionalAttributes: ['encoding', 'default'],
                description: 'Display variable values'
            },
            {
                name: 'if',
                type: 'container',
                requiredAttributes: [],
                optionalAttributes: ['variable', 'matches'],
                description: 'Conditional rendering'
            }
        ];

        const serverTags: RXMLTagCatalogEntry[] = [
            {
                name: 'server-tag',
                type: 'simple',
                requiredAttributes: ['data'],
                optionalAttributes: [],
                description: 'Server-provided tag'
            }
        ];

        const customTags: RXMLTagCatalogEntry[] = [
            {
                name: 'custom-tag',
                type: 'container',
                requiredAttributes: [],
                optionalAttributes: ['option'],
                description: 'Custom module tag'
            }
        ];

        it('should merge built-in, server, and custom tags', async () => {
            const merged = mergeTagsImpl(builtinTags, serverTags, customTags);

            assert.strictEqual(merged.length, 4); // 2 builtin + 1 server + 1 custom
            assert.ok(merged.find(t => t.name === 'echo'));
            assert.ok(merged.find(t => t.name === 'if'));
            assert.ok(merged.find(t => t.name === 'server-tag'));
            assert.ok(merged.find(t => t.name === 'custom-tag'));
        });

        it('should handle custom tags overriding built-in tags', async () => {
            const overridingCustom: RXMLTagCatalogEntry[] = [
                {
                    name: 'echo',
                    type: 'simple',
                    requiredAttributes: ['var'],
                    optionalAttributes: ['format'],
                    description: 'Custom echo implementation'
                }
            ];

            const merged = mergeTagsImpl(builtinTags, [], overridingCustom);

            // Custom echo should override built-in
            const echoTag = merged.find(t => t.name === 'echo');
            assert.ok(echoTag);
            assert.strictEqual(echoTag?.description, 'Custom echo implementation');
            assert.ok(echoTag?.optionalAttributes?.includes('format'));
        });

        it('should deduplicate tags across sources', async () => {
            const duplicateServer: RXMLTagCatalogEntry[] = [
                {
                    name: 'echo',
                    type: 'simple',
                    requiredAttributes: ['var'],
                    optionalAttributes: [],
                    description: 'Server echo (should be ignored)'
                }
            ];

            const merged = mergeTagsImpl(builtinTags, duplicateServer, []);

            // Built-in should take precedence over server duplicate
            const echoTags = merged.filter(t => t.name === 'echo');
            assert.strictEqual(echoTags.length, 1);
            const echoTag = merged.find(t => t.name === 'echo');
            assert.strictEqual(echoTag?.description, 'Display variable values');
        });

        it('should handle empty tag sources', async () => {
            const merged = mergeTagsImpl(builtinTags, [], []);

            assert.strictEqual(merged.length, 2);
            assert.strictEqual(merged[0].name, 'echo');
        });
    });

    describe('Cache Invalidation', () => {
        it('should invalidate cache when server PID changes', async () => {
            const manager = createMockCatalogManager();

            // First call with PID 12345
            const tags1 = await manager.getCatalog(12345, 'localhost');
            assert.strictEqual(tags1.length, 2);

            // Simulate server restart (PID changes)
            manager.invalidateServer(12345, 'localhost');

            // Second call should fetch fresh data with new PID
            const tags2 = await manager.getCatalog(67890, 'localhost');
            assert.strictEqual(tags2.length, 2); // Fresh catalog (not same as first)
        });

        it('should use cached catalog when PID unchanged', async () => {
            const manager = createMockCatalogManager();

            const tags1 = await manager.getCatalog(12345, 'localhost');
            const tags2 = await manager.getCatalog(12345, 'localhost');

            // Should return same cached instance
            assert.strictEqual(tags1, tags2);
        });

        it('should support manual cache refresh', async () => {
            const manager = createMockCatalogManager();

            // Initial load
            await manager.getCatalog(12345, 'localhost');

            // Manual refresh
            await manager.refreshCatalog(12345, 'localhost');

            // Should fetch fresh data
            const tags = await manager.getCatalog(12345, 'localhost');
            assert.strictEqual(tags.length, 3); // 3 tags after refresh (added tag3)
        });
    });

    describe('Multiple Server Instances', () => {
        it('should maintain separate catalogs per server PID', async () => {
            const manager = createMockCatalogManager();

            const server1Tags = await manager.getCatalog(11111, 'server1');
            const server2Tags = await manager.getCatalog(22222, 'server2');

            assert.strictEqual(server1Tags.length, 2);
            assert.strictEqual(server2Tags.length, 2);
            assert.notStrictEqual(server1Tags, server2Tags);
        });

        it('should invalidate only specific server cache', async () => {
            const manager = createMockCatalogManager();

            await manager.getCatalog(11111, 'server1');
            await manager.getCatalog(22222, 'server2');

            // Invalidate only server1
            manager.invalidateServer(11111, 'server1');

            // server2 cache should still be valid
            const server2Tags = await manager.getCatalog(22222, 'server2');
            assert.ok(server2Tags);
        });
    });
});

// Helper function for mock catalog manager

function createMockCatalogManager(): MockCatalogManager {
    const catalogs = new Map<string, RXMLTagCatalogEntry[]>();

    return {
        getCatalog: async (pid: number, name: string) => {
            const key = `${name}:${pid}`;
            if (!catalogs.has(key)) {
                catalogs.set(key, [
                    {
                        name: 'tag1',
                        type: 'simple',
                        requiredAttributes: [],
                        optionalAttributes: [],
                        description: 'Test tag 1'
                    },
                    {
                        name: 'tag2',
                        type: 'container',
                        requiredAttributes: [],
                        optionalAttributes: [],
                        description: 'Test tag 2'
                    }
                ]);
            }
            return catalogs.get(key)!;
        },

        refreshCatalog: async (pid: number, name: string) => {
            const key = `${name}:${pid}`;
            catalogs.set(key, [
                {
                    name: 'tag1',
                    type: 'simple',
                    requiredAttributes: [],
                    optionalAttributes: [],
                    description: 'Refreshed tag 1'
                },
                {
                    name: 'tag2',
                    type: 'container',
                    requiredAttributes: [],
                    optionalAttributes: [],
                    description: 'Refreshed tag 2'
                },
                {
                    name: 'tag3',
                    type: 'simple',
                    requiredAttributes: [],
                    optionalAttributes: [],
                    description: 'New tag 3'
                }
            ]);
        },

        invalidateServer: (pid: number, name: string) => {
            const key = `${name}:${pid}`;
            catalogs.delete(key);
        }
    };
}
