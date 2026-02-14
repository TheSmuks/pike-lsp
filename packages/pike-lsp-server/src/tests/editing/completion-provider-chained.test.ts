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
    onCompletionResolve: (handler: (item: CompletionItem) => CompletionItem) => void;
    completionHandler: CompletionHandler;
    completionResolveHandler: (item: CompletionItem) => CompletionItem;
};

function createMockConnection(): MockConnection {
    let h: CompletionHandler | null = null;
    let r: ((item: CompletionItem) => CompletionItem) | null = null;
    return {
        onCompletion: (cb: CompletionHandler) => { h = cb; },
        onCompletionResolve: (cb: (item: CompletionItem) => CompletionItem) => { r = cb; },
        get completionHandler(): CompletionHandler {
            if (!h) throw new Error("No handler");
            return h;
        },
        get completionResolveHandler(): (item: CompletionItem) => CompletionItem {
            if (!r) throw new Error("No resolve handler");
            return r;
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
            // If mod is a Map, use it; if it's a plain object with own properties, treat as symbols directly
            const symbols = mod instanceof Map ? mod : (Object.hasOwn(mod, 'symbols') ? mod.symbols : mod);
            return { modulePath: path, symbols: symbols ?? null, lastAccessed: Date.now(), accessCount: 1, sizeBytes: 100 };
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
                symbols: [
                    { name: "getFile", type: { kind: "function", returnType: { kind: "object", className: "Stdio.File" } }, kind: "function", modifiers: [] },
                ],
                bridgeContext: { context: "member_access", objectName: "getFile", prefix: "", operator: "->" },
                stdlibModules: {
                    "Stdio.File": fileMembers,
                    "Stdio.Stat": new Map([
                        ["getFile", { name: "getFile", type: { kind: "function", returnType: { kind: "object", className: "Stdio.File" } }, kind: "function", modifiers: [] }],
                    ]),
                },
            });

            const result = await complete(0, 16);
            const names = labels(result);
            expect(names).toContain("read");
            expect(names).toContain("write");
        });
    });
});
