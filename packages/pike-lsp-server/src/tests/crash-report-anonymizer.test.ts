import { describe, it } from 'bun:test';
import assert from 'node:assert';
import {
  PathSanitizer,
  StackTraceSanitizer,
  IdentifierHasher,
  JsonRpcRedactor,
  EnvironmentScrubber,
  CatchAllScanner,
  AnonymizerPipeline,
} from '../../../core/src/crash-report-anonymizer.js';

describe('PathSanitizer', () => {
  it('replaces absolute workspace prefix with placeholder', () => {
    const input = '/home/john/secret-project/src/parser.ts';
    const root = '/home/john/secret-project';
    assert.strictEqual(PathSanitizer.sanitizePath(input, root), '<workspace>/src/parser.ts');
  });

  it('preserves relative paths unchanged', () => {
    assert.strictEqual(
      PathSanitizer.sanitizePath('src/parser.ts', '/home/john/secret-project'),
      'src/parser.ts'
    );
  });

  it('handles nested workspace paths', () => {
    const input = '/home/john/secret-project/node_modules/.cache/tsserver/file.js';
    const root = '/home/john/secret-project';
    assert.strictEqual(
      PathSanitizer.sanitizePath(input, root),
      '<workspace>/node_modules/.cache/tsserver/file.js'
    );
  });

  it('handles URI-encoded paths', () => {
    const input = 'file:///home/john/secret-project/src/parser.ts';
    const root = '/home/john/secret-project';
    assert.strictEqual(
      PathSanitizer.sanitizePath(input, root),
      'file:///<workspace>/src/parser.ts'
    );
  });

  it('handles Windows-style paths', () => {
    const input = 'C:\\Users\\john\\project\\src\\main.rs';
    const root = 'C:\\Users\\john\\project';
    assert.strictEqual(PathSanitizer.sanitizePath(input, root), '<workspace>\\src\\main.rs');
  });

  it('paths outside workspace are fully hashed with filename preserved', () => {
    const input = '/usr/local/lib/node_modules/typescript/lib/tsserver.js';
    const root = '/home/john/secret-project';
    const output = PathSanitizer.sanitizePath(input, root);
    assert.match(output, /^<external:[0-9a-f]{8}>\/tsserver\.js$/);
  });
});

describe('StackTraceSanitizer', () => {
  it('rewrites file paths in stack frames and keeps line/col', () => {
    const input = 'at Parser.parse (/home/john/secret-project/src/parser.ts:42:13)';
    const output = StackTraceSanitizer.sanitizeStackTrace(input, '/home/john/secret-project');
    assert.strictEqual(output, 'at Parser.parse (<workspace>/src/parser.ts:42:13)');
  });

  it('preserves function names and anonymous markers', () => {
    const input = 'at <anonymous> (/home/john/secret-project/src/index.ts:1:1)';
    const output = StackTraceSanitizer.sanitizeStackTrace(input, '/home/john/secret-project');
    assert.strictEqual(output, 'at <anonymous> (<workspace>/src/index.ts:1:1)');
  });

  it('strips embedded source snippets from frame payloads', () => {
    const input = { frame: 'parser.ts:42', source: "const apiKey = 'sk-abc123'" };
    assert.deepStrictEqual(StackTraceSanitizer.stripFrameSource(input), {
      frame: 'parser.ts:42',
      source: null,
    });
  });

  it('handles multi-line stack traces end to end', () => {
    const input = [
      'Error: Unexpected token',
      '    at Parser.parse (/home/john/project/src/parser.ts:42:13)',
      '    at Object.handle (/home/john/project/src/server.ts:10:5)',
      '    at node:internal/modules/cjs/loader:1234:14',
    ].join('\n');
    const output = StackTraceSanitizer.sanitizeStackTrace(input, '/home/john/project');
    const expected = [
      'Error: Unexpected token',
      '    at Parser.parse (<workspace>/src/parser.ts:42:13)',
      '    at Object.handle (<workspace>/src/server.ts:10:5)',
      '    at node:internal/modules/cjs/loader:1234:14',
    ].join('\n');
    assert.strictEqual(output, expected);
  });
});

describe('IdentifierHasher', () => {
  it('hashes symbol names deterministically', () => {
    assert.match(
      IdentifierHasher.hashIdentifier('MySecretClass.proprietary_method'),
      /^sym_[0-9a-f]{12}$/
    );
  });

  it('same input always produces same hash', () => {
    assert.strictEqual(
      IdentifierHasher.hashIdentifier('MySecretClass'),
      IdentifierHasher.hashIdentifier('MySecretClass')
    );
  });

  it('different inputs produce different hashes', () => {
    assert.notStrictEqual(
      IdentifierHasher.hashIdentifier('MySecretClass'),
      IdentifierHasher.hashIdentifier('MyOtherClass')
    );
  });

  it('preserves allowlisted names', () => {
    const output = IdentifierHasher.hashSensitiveSegments('String.prototype.split', [
      'String',
      'Array',
      'Object',
      'Promise',
    ]);
    assert.strictEqual(output, 'String.prototype.split');
  });

  it('hashes only confidential segments', () => {
    const output = IdentifierHasher.hashSensitiveSegments('Array.from(SecretFactory.create)', [
      'Array',
    ]);
    assert.match(output, /^Array\.from\(sym_[0-9a-f]{12}\.sym_[0-9a-f]{12}\)$/);
  });
});

describe('JsonRpcRedactor', () => {
  it('redacts uri fields in LSP messages', () => {
    const input = {
      method: 'textDocument/didOpen',
      params: {
        textDocument: {
          uri: 'file:///home/john/project/src/main.rs',
        },
      },
    };
    const output = JsonRpcRedactor.redactMessage(input, '/home/john/project');
    assert.strictEqual(output.params.textDocument.uri, 'file:///<workspace>/src/main.rs');
  });

  it('strips text/document content fields', () => {
    const input = {
      params: { textDocument: { uri: 'file:///tmp/x', text: 'fn secret_algo() { ... }' } },
    };
    const output = JsonRpcRedactor.redactMessage(input, '/tmp');
    assert.strictEqual(output.params.textDocument.text, '<redacted:24 chars>');
  });

  it('preserves diagnostic structure but redacts message content', () => {
    const input = {
      diagnostics: [
        {
          range: { start: { line: 5, character: 0 } },
          message: "Variable 'secretKey' is unused",
          severity: 2,
        },
      ],
    };
    const output = JsonRpcRedactor.redactMessage(input, '/home/john/project');
    assert.match(output.diagnostics[0].message, /^Variable 'sym_[0-9a-f]{12}' is unused$/);
    assert.strictEqual(output.diagnostics[0].severity, 2);
    assert.deepStrictEqual(output.diagnostics[0].range.start, { line: 5, character: 0 });
  });

  it('preserves method names and error codes while sanitizing message paths', () => {
    const input = {
      method: 'textDocument/completion',
      error: { code: -32600, message: 'some detail about /home/john/file' },
    };
    const output = JsonRpcRedactor.redactMessage(input, '/home/john');
    assert.strictEqual(output.method, 'textDocument/completion');
    assert.strictEqual(output.error.code, -32600);
    assert.strictEqual(output.error.message, 'some detail about <workspace>/file');
  });

  it('recursively redacts rootUri, rootPath, workspaceFolders', () => {
    const input = {
      params: {
        rootUri: 'file:///home/john/project',
        rootPath: '/home/john/project',
        workspaceFolders: [{ uri: 'file:///home/john/project', name: 'project' }],
      },
    };
    const output = JsonRpcRedactor.redactMessage(input, '/home/john/project');
    assert.strictEqual(output.params.rootUri, 'file:///<workspace>');
    assert.strictEqual(output.params.rootPath, '<workspace>');
    assert.deepStrictEqual(output.params.workspaceFolders, [
      { uri: 'file:///<workspace>', name: '<workspace>' },
    ]);
  });
});

describe('EnvironmentScrubber', () => {
  it('strips known sensitive env vars', () => {
    const input = { HOME: '/home/john', API_KEY: 'sk-123', LANG: 'en_US.UTF-8' };
    assert.deepStrictEqual(EnvironmentScrubber.scrubEnv(input), {
      HOME: '<redacted>',
      API_KEY: '<redacted>',
      LANG: 'en_US.UTF-8',
    });
  });

  it('allowlists safe env vars only', () => {
    const input = { PATH: '/usr/bin:...', SECRET_TOKEN: 'abc', SHELL: '/bin/zsh' };
    const output = EnvironmentScrubber.scrubEnv(input, [
      'LANG',
      'TERM',
      'SHELL',
      'NODE_VERSION',
      'PATH',
    ]);
    assert.deepStrictEqual(output, {
      PATH: '/usr/bin:...',
      SECRET_TOKEN: '<redacted>',
      SHELL: '/bin/zsh',
    });
  });

  it('redacts command-line args containing paths or secret flags', () => {
    const input = ['node', '/home/john/project/server.js', '--key=abc123', '--stdio'];
    const output = EnvironmentScrubber.scrubArgs(input, '/home/john/project');
    assert.deepStrictEqual(output, [
      'node',
      '<workspace>/server.js',
      '--key=<redacted>',
      '--stdio',
    ]);
  });
});

describe('CatchAllScanner', () => {
  it('catches email addresses', () => {
    const output = CatchAllScanner.scan('Error reported by john.doe@company.com at 10:42');
    assert.match(output, /^Error reported by <email:[0-9a-f]{8}> at 10:42$/);
  });

  it('catches hostnames and IPs', () => {
    const output = CatchAllScanner.scan('Connection refused: internal-api.company.com:8080');
    assert.match(output, /^Connection refused: <host:[0-9a-f]{8}>:8080$/);
  });

  it('catches residual absolute paths missed by first pass', () => {
    const output = CatchAllScanner.scan('See also /var/log/john/debug.log for details');
    assert.match(output, /^See also <path:[0-9a-f]{8}>\/debug\.log for details$/);
  });

  it('does not false-positive on safe patterns', () => {
    const input = 'Error code: -32600 at line 42';
    assert.strictEqual(CatchAllScanner.scan(input), input);
  });
});

describe('AnonymizerPipeline', () => {
  it('full pipeline applies all stages in order and keeps preserved fields', () => {
    const raw = {
      method: 'textDocument/completion',
      server: { name: 'pike-lsp', version: '0.1.0' },
      languageId: 'pike',
      document: { uri: 'file:///home/john/project/src/main.rs', text: 'fn secret() {}', size: 14 },
      diagnostics: [
        {
          range: { start: { line: 5, character: 0 } },
          message: "Variable 'secretKey' is unused",
          severity: 2,
        },
      ],
      error: {
        code: -32600,
        message: 'failed at /home/john/project/src/main.rs',
        stack: 'at Parser.parse (/home/john/project/src/parser.ts:42:13)',
      },
      env: { HOME: '/home/john', LANG: 'en_US.UTF-8', API_KEY: 'sk-abc' },
      args: ['node', '/home/john/project/server.js', '--key=abc123', '--stdio'],
    };

    const result = AnonymizerPipeline.anonymize(raw, {
      workspaceRoot: '/home/john/project',
      identifierAllowList: ['String', 'Array', 'Object', 'Promise'],
      envAllowList: ['LANG', 'PATH', 'TERM', 'SHELL', 'NODE_VERSION'],
      createLocalMap: true,
    });

    const output = result.payload;
    assert.strictEqual(output.method, 'textDocument/completion');
    assert.strictEqual(output.error.code, -32600);
    assert.strictEqual(output.server.name, 'pike-lsp');
    assert.strictEqual(output.server.version, '0.1.0');
    assert.strictEqual(output.languageId, 'pike');
    assert.strictEqual(output.document.size, 14);
    assert.strictEqual(output.diagnostics[0].severity, 2);
    assert.deepStrictEqual(output.diagnostics[0].range.start, { line: 5, character: 0 });

    assert.strictEqual(output.document.text, '<redacted:14 chars>');
    assert.strictEqual(output.document.uri, 'file:///<workspace>/src/main.rs');
    assert.strictEqual(output.error.message, 'failed at <workspace>/src/main.rs');
    assert.strictEqual(output.args[1], '<workspace>/server.js');
    assert.strictEqual(output.args[2], '--key=<redacted>');
    assert.strictEqual(output.env.HOME, '<redacted>');
    assert.strictEqual(output.env.API_KEY, '<redacted>');
    assert.strictEqual(output.env.LANG, 'en_US.UTF-8');

    assert.ok(result.localMap);
    assert.strictEqual(result.localMap?.['<workspace>'], '/home/john/project');
  });

  it('is idempotent when anonymized twice', () => {
    const payload = {
      method: 'textDocument/didOpen',
      params: {
        textDocument: { uri: 'file:///home/john/project/src/main.rs', text: 'let secret = 1;' },
      },
      error: { code: -32600, message: 'john.doe@company.com /var/log/a.log' },
    };

    const once = AnonymizerPipeline.anonymize(payload, {
      workspaceRoot: '/home/john/project',
    }).payload;
    const twice = AnonymizerPipeline.anonymize(once, {
      workspaceRoot: '/home/john/project',
    }).payload;
    assert.deepStrictEqual(twice, once);
  });
});
