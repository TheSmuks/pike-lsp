import { describe, it, expect } from "bun:test";
import { TextDocument } from "vscode-languageserver-textdocument";
import { CompletionItem, CompletionList } from "vscode-languageserver/node.js";
import type { PikeSymbol, CompletionContext as PikeCompletionContext } from "@pike-lsp/pike-bridge";
import type { DocumentCacheEntry } from "../../core/types.js";
import { registerCompletionHandlers } from "../../features/editing/completion.js";

type CompletionHandler = (params: {
    textDocument: { uri: string };
    position: { line: number; character: number };
}) => Promise<CompletionItem[]>;

interface MockConnection {
    onCompletion: (handler: CompletionHandler) => void;
    completionHandler: CompletionHandler;
    onCompletionResolve: (handler: (item: CompletionItem) => CompletionItem) => void;
    completionResolveHandler: (item: CompletionItem) => CompletionItem;
};

function createMockConnection(): MockConnection {
    let h: CompletionHandler | null = null;
    let rh: ((item: CompletionItem) => CompletionItem) | null = null;
    return {
        onCompletion: (cb: CompletionHandler) => { h = cb; },
        get completionHandler(): CompletionHandler {
            if (!h) throw new Error("No handler");
            return h;
        },
        onCompletionResolve: (cb: (item: CompletionItem) => CompletionItem) => { rh = cb; },
        get completionResolveHandler(): (item: CompletionItem) => CompletionItem {
            if (!rh) throw new Error("No resolve handler");
            return rh;
        },
    };
}

const silentLogger = { debug: () => {} };

function makeCacheEntry(overrides): DocumentCacheEntry {
    return { version: 1, diagnostics: [], symbolPositions: new Map(), ...overrides };
}

function sym(name: string, kind: PikeSymbol["kind"]): PikeSymbol {
    return { name, kind, modifiers: [] };
}

function method(name: string, args: { name: string; type?: string }[], returnType?: string): PikeSymbol {
    const typeInfo = returnType ? { kind: returnType } : undefined;
    return {
        name,
        kind: "method",
        modifiers: [],
        argNames: args.map(a => a.name),
        argTypes: args.map(a => ({ kind: a.type ?? "mixed" })),
        returnType: typeInfo,
        type: { kind: "function", returnType: typeInfo },
    };
}

function createMockStdlibIndex(modules: any) {
    return {
        getModule: async (path: string) => {
            const mod = modules[path];
            if (!mod) return null;
            return { modulePath: path, symbols: mod?.symbols || null, lastAccessed: Date.now(), accessCount: 1, sizeBytes: 100 };
        },
    };
}

function createMockBridge(contextOverride?: Partial<PikeCompletionContext>) {
    return {
        getCompletionContext: async () => ({
            context: "identifier",
            objectName: "",
            prefix: "",
            operator: "",
            ...contextOverride,
        }),
    };
}

interface SetupOptions {
    code: string;
    uri?: string;
    symbols?: PikeSymbol[];
    cacheExtra?: Partial<DocumentCacheEntry>;
    bridgeContext?: Partial<PikeCompletionContext>;
    stdlibModules?: any;
}

function setup(opts: SetupOptions) {
    const uri = opts.uri ?? "file:///test.pike";
    const doc = TextDocument.create(uri, "pike", 1, opts.code);
    const cacheMap = new Map();
    if (!opts.noCache) {
        cacheMap.set(uri, makeCacheEntry({ symbols: opts.symbols ?? [], ...opts.cacheExtra }));
    }
    const documentCache = { get: (u: string) => cacheMap.get(u), entries: () => Array.from(cacheMap.values()) };
    const services = {
        bridge: opts.noBridge ? null : createMockBridge(opts.bridgeContext),
        logger: silentLogger,
        documentCache,
        stdlibIndex: opts.stdlibModules ? createMockStdlibIndex(opts.stdlibModules) : null,
    };
    const documents = { get: (u: string) => (u === uri ? doc : undefined) };
    const conn = createMockConnection();
    registerCompletionHandlers(conn as any, services as any, documents as any);
    return {
        complete: (line: number, character: number) => conn.completionHandler({ textDocument: { uri }, position: { line, character } }),
        resolve: (item: CompletionItem) => conn.completionResolveHandler(item),
        uri,
    };
}

function labels(result: CompletionList | CompletionItem[]): string[] {
    const items = "items" in result ? result.items : result;
    return items.map(i => i.label);
}

describe("Completion Provider - Chained Access", () => {
    describe("D. Type-Based Member Completion - Chained Access", () => {
        it("D.3: type from function return value (chained access)", async () => {
            const fileMembers = new Map();
            fileMembers.set("read", { name: "read", type: { kind: "function" }, kind: "function", modifiers: [] });
            fileMembers.set("write", { name: "write", type: { kind: "function" }, kind: "function", modifiers: [] });

            const { complete } = setup({
                code: "obj->getFile()->",
                symbols: [],
                bridgeContext: { context: "member_access", objectName: "getFile", prefix: "", operator: "->" },
                stdlibModules: {
                    "Stdio.File": fileMembers,
                    "Stdio.Stat": {
                        symbols: new Map([["getFile", { name: "getFile", type: { kind: "function", returnType: { kind: "object", className: "Stdio.File" } }, kind: "function", modifiers: [] }]]),
                    },
                },
            });

            const result = await complete(0, 16);
            const names = labels(result);
            expect(names).toContain("read");
            expect(names).toContain("write");
        });

        it("D.4: property chaining (obj->prop->subprop)", async () => {
            const objMembers = new Map<string, import('@pike-lsp/pike-bridge').IntrospectedSymbol>();
            objMembers.set("path", { name: "path", type: { kind: "property" } });

            const { complete } = setup({
                code: "obj->path->",
                symbols: [],
                bridgeContext: { context: "member_access", objectName: "obj", prefix: "path", operator: "->" },
                stdlibModules: {
                    "Stdio.File": objMembers,
                },
            });

            const result = await complete(0, 11);
            const names = labels(result);
            expect(names).toContain("path");
            expect(names).toContain("basename");
            expect(names).toContain("dirname");
            expect(names).toContain("explode_path");
            expect(names).toContain("stat");
        });

        it("D.5: mixed access (obj->prop.method()->field)", async () => {
            const fileMembers = new Map<string, import('@pike-lsp/pike-bridge').IntrospectedSymbol>();
            const fileMethods = new Map<string, import('@pike-lsp/pike-bridge').IntrospectedSymbol>();
            fileMembers.set("read", { name: "read", type: { kind: "method" } });
            fileMethods.set("read", { name: "read", type: { kind: "method" } });
            fileMethods.set("close", { name: "close", type: { kind: "method" } });
            fileMethods.set("open", { name: "open", type: { kind: "method" } });

            const { complete } = setup({
                code: "obj->file->close()->",
                symbols: [],
                bridgeContext: { context: "member_access", objectName: "file", prefix: "", operator: "->" },
                stdlibModules: {
                    "Stdio.File": fileMembers,
                    "Stdio.File": fileMethods,
                },
            });

            const result = await complete(0, 16);
            const names = labels(result);
            expect(names).toContain("read");
            expect(names).toContain("close");
            expect(names).toContain("open");
        });
    });
});
