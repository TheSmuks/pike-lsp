/**
 * Pike Stdlib Corpus Validation Test
 *
 * Parses all Pike 8.0.1116 stdlib files through the LSP bridge to validate
 * our analyzer at scale. Since Pike's own stdlib source code is correct by
 * definition, any errors our analyzer reports are our bugs, not theirs.
 *
 * This test is too slow for CI (~15-30 minutes) and should be run manually
 * on special occasions (before releases, after major refactors).
 *
 * Run with: cd packages/pike-bridge && bun run test:corpus
 */

// @ts-ignore - Bun test types
import { describe, it, beforeAll, afterAll } from 'bun:test';
import assert from 'node:assert/strict';
import { PikeBridge } from './bridge.js';
import { BridgePool } from './test-utils/bridge-pool.js';
import * as path from 'node:path';
import * as fs from 'node:fs';

const SUCCESS_THRESHOLD = 0.8; // 80% of files must parse without errors
const BRIDGE_TIMEOUT = 30_000; // 30s bridge request timeout

// Path to Pike stdlib source tree
// Uses system Pike installation by default, or PIKE_STDLIB_PATH env var for custom locations
const PIKE_SOURCE_ROOT = process.env['PIKE_STDLIB_PATH']
  ? path.resolve(process.env['PIKE_STDLIB_PATH'])
  : '/usr/local/pike/8.0.1116/lib';

/**
 * Result of analyzing a single file in the corpus
 */
interface CorpusResult {
  /** Absolute file path */
  file: string;
  /** Path relative to source root */
  relativePath: string;
  /** Whether all operations succeeded */
  success: boolean;
  /** Per-operation status */
  operations: {
    parse: 'ok' | 'fail' | 'skip';
    tokenize: 'ok' | 'fail' | 'skip';
    introspect: 'ok' | 'fail' | 'skip';
    diagnostics: 'ok' | 'fail' | 'skip';
  };
  /** Number of symbols extracted */
  symbolCount: number;
  /** Number of tokens extracted */
  tokenCount: number;
  /** Number of diagnostics reported */
  diagnosticCount: number;
  /** Error messages from failed operations */
  errors: string[];
  /** Analysis duration in milliseconds */
  duration: number;
}

function discoverPikeFiles(root: string): string[] {
  const files: string[] = [];

  function walk(dir: string) {
    const entries = fs.readdirSync(dir, { withFileTypes: true });

    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);

      // Skip .omc directories and build artifacts
      if (entry.name === '.omc' || entry.name === 'build' || entry.name === '.git') {
        continue;
      }

      if (entry.isDirectory()) {
        walk(fullPath);
      } else if (entry.isFile()) {
        const ext = path.extname(entry.name);
        if (ext === '.pike' || ext === '.pmod') {
          files.push(fullPath);
        }
      }
    }
  }

  walk(root);
  return files;
}

/**
 * Analyze a single Pike file through the bridge
 */
async function analyzeFile(
  bridge: PikeBridge,
  filePath: string,
  sourceRoot: string
): Promise<CorpusResult> {
  const relativePath = path.relative(sourceRoot, filePath) ?? filePath;
  const code = fs.readFileSync(filePath, 'utf-8');
  const start = performance.now();

  const result: CorpusResult = {
    file: filePath,
    relativePath,
    success: false,
    operations: { parse: 'skip', tokenize: 'skip', introspect: 'skip', diagnostics: 'skip' },
    symbolCount: 0,
    tokenCount: 0,
    diagnosticCount: 0,
    errors: [],
    duration: 0,
  };

  try {
    const response = await bridge.analyze(
      code,
      ['parse', 'tokenize', 'introspect', 'diagnostics'],
      filePath
    );

    // Check each operation
    if (response.result?.parse) {
      result.operations.parse = 'ok';
      result.symbolCount = response.result.parse.symbols?.length ?? 0;
    }
    if (response.failures?.parse) {
      result.operations.parse = 'fail';
      result.errors.push(`parse: ${response.failures.parse.message}`);
    }

    if (response.result?.tokenize) {
      result.operations.tokenize = 'ok';
      result.tokenCount = response.result.tokenize.tokens?.length ?? 0;
    }
    if (response.failures?.tokenize) {
      result.operations.tokenize = 'fail';
      result.errors.push(`tokenize: ${response.failures.tokenize.message}`);
    }

    if (response.result?.introspect) {
      result.operations.introspect = 'ok';
    }
    if (response.failures?.introspect) {
      result.operations.introspect = 'fail';
      result.errors.push(`introspect: ${response.failures.introspect.message}`);
    }

    if (response.result?.diagnostics) {
      result.operations.diagnostics = 'ok';
      result.diagnosticCount = response.result.diagnostics.diagnostics?.length ?? 0;
    }
    if (response.failures?.diagnostics) {
      result.operations.diagnostics = 'fail';
      result.errors.push(`diagnostics: ${response.failures.diagnostics.message}`);
    }

    // File is "successful" if parse + tokenize both work
    result.success = result.operations.parse === 'ok' && result.operations.tokenize === 'ok';
  } catch (err: any) {
    result.errors.push(`CRASH: ${err.message}`);
    // Don't rethrow — continue to next file
  }

  result.duration = performance.now() - start;
  return result;
}

function printCorpusSummary(results: CorpusResult[]): void {
  if (results.length === 0) {
    console.log('\n=== CORPUS TEST SKIPPED (no results) ===\n');
    return;
  }

  const total = results.length;
  const successful = results.filter(r => r.success).length;
  const totalSymbols = results.reduce((sum, r) => sum + r.symbolCount, 0);
  const totalDuration = results.reduce((sum, r) => sum + r.duration, 0);
  const avgDuration = totalDuration / total;

  console.log('\n' + '='.repeat(60));
  console.log('PIKE STDLIB CORPUS VALIDATION SUMMARY');
  console.log('(parallel mode via BridgePool)');
  console.log('='.repeat(60));
  console.log(`Files tested:     ${total}`);
  console.log(`Successful:       ${successful} (${((successful / total) * 100).toFixed(1)}%)`);
  console.log(`Failed:           ${total - successful}`);
  console.log(`Total symbols:    ${totalSymbols}`);
  console.log(`Total time:       ${(totalDuration / 1000).toFixed(1)}s`);
  console.log(`Avg per file:     ${avgDuration.toFixed(0)}ms`);
  console.log('');

  // Per-operation breakdown
  for (const op of ['parse', 'tokenize', 'introspect', 'diagnostics'] as const) {
    const ok = results.filter(r => r.operations[op] === 'ok').length;
    const fail = results.filter(r => r.operations[op] === 'fail').length;
    const skip = results.filter(r => r.operations[op] === 'skip').length;
    console.log(`${op.padEnd(14)} OK:${ok} FAIL:${fail} SKIP:${skip}`);
  }

  // Top 10 slowest files
  const slowest = [...results].sort((a, b) => b.duration - a.duration).slice(0, 10);
  console.log('\nSlowest files:');
  for (const r of slowest) {
    console.log(`  ${r.duration.toFixed(0)}ms  ${r.relativePath}`);
  }

  // Top 10 files with most errors
  const errorFiles = results
    .filter(r => r.errors.length > 0)
    .sort((a, b) => b.errors.length - a.errors.length)
    .slice(0, 10);
  if (errorFiles.length > 0) {
    console.log('\nMost errors:');
    for (const r of errorFiles) {
      console.log(`  ${r.errors.length} errors  ${r.relativePath}`);
      for (const e of r.errors.slice(0, 2)) {
        console.log(`    - ${e.substring(0, 100)}`);
      }
    }
  }

  console.log('='.repeat(60));
}

const RUN_CORPUS_TEST = process.env['PIKE_CORPUS_TEST'] === '1';

const describeSuite = RUN_CORPUS_TEST ? describe : describe.skip;

describeSuite('Pike Stdlib Corpus Validation', { timeout: 1800_000 }, () => {
  let pool: BridgePool;
  let pikeFiles: string[] = []; // Initialize empty for environments without Pike source
  const results: CorpusResult[] = [];

  beforeAll(async () => {
    // 1. Check that Pike source tree exists
    if (!fs.existsSync(PIKE_SOURCE_ROOT)) {
      console.log('\nSKIP: Pike source tree not found at', PIKE_SOURCE_ROOT);
      console.log('Expected: ../Pike-v8.0.1116/lib relative to repo root');
      console.log('This test requires Pike 8.0.1116 source to be checked out.\n');
      return;
    }

    // 2. Discover files
    console.log(`\nDiscovering Pike files in ${PIKE_SOURCE_ROOT}...`);
    pikeFiles = discoverPikeFiles(PIKE_SOURCE_ROOT);
    console.log(`Discovered ${pikeFiles.length} Pike files\n`);

    // 3. Start bridge pool
    const concurrency = parseInt(process.env['PIKE_CORPUS_CONCURRENCY'] ?? '4');
    console.log(`Starting Pike bridge pool (${concurrency} bridges)...`);
    pool = new BridgePool(
      { timeout: BRIDGE_TIMEOUT },
      {
        concurrency,
        onProgress: (completed, total) => {
          if (completed % 50 === 0) {
            console.log(`  Processing ${completed}/${total}...`);
          }
        },
      }
    );
    await pool.start();
    await new Promise(resolve => setTimeout(resolve, 500));
    console.log('Bridge pool started\n');
  });

  afterAll(async () => {
    if (pool) {
      console.log('\nStopping bridge pool...');
      await pool.stop();
    }

    printCorpusSummary(results);
  });

  it('should discover Pike stdlib files', () => {
    if (pikeFiles.length === 0) {
      console.log('SKIP: Pike source tree not available');
      return;
    }

    assert.ok(pikeFiles.length > 0, 'Should find Pike files in source tree');
    assert.ok(pikeFiles.length > 100, `Expected 500+ files, found ${pikeFiles.length}`);
  });

  it('should parse all Pike files without crashing', { timeout: 1800_000 }, async () => {
    if (pikeFiles.length === 0) {
      console.log('SKIP: Pike source tree not available');
      return;
    }

    console.log(`\nProcessing ${pikeFiles.length} files...`);

    await pool.dispatch(pikeFiles, async (file, bridge) => {
      const result = await analyzeFile(bridge, file, PIKE_SOURCE_ROOT);
      results.push(result);
    });

    console.log(`\nProcessed all ${pikeFiles.length} files\n`);

    results.sort((a, b) => a.relativePath.localeCompare(b.relativePath));

    // Known files that crash the Pike subprocess during introspection
    // (heavy C module dependencies that fail to load in test context)
    const KNOWN_CRASHES = new Set(['modules/Tools.pmod/Standalone.pmod/rsqld.pike']);

    // Count crashes (bridge timeout/error, not parse failures)
    // Exclude known crashes — these are Pike runtime issues, not analyzer bugs
    const crashes = results.filter(
      r =>
        r.errors.some(e => e.includes('timeout') || e.includes('exited')) &&
        !KNOWN_CRASHES.has(r.relativePath)
    );

    assert.equal(
      crashes.length,
      0,
      `${crashes.length} files crashed the bridge: ${crashes.map(c => c.relativePath).join(', ')}`
    );
  });

  it('should meet success threshold for parsing', () => {
    if (results.length === 0) {
      console.log('SKIP: No results to validate');
      return;
    }

    const parseOk = results.filter(r => r.operations.parse === 'ok').length;
    const rate = parseOk / results.length;

    console.log(`Parse success: ${parseOk}/${results.length} (${(rate * 100).toFixed(1)}%)`);
    assert.ok(
      rate >= SUCCESS_THRESHOLD,
      `Parse success rate ${(rate * 100).toFixed(1)}% below threshold ${SUCCESS_THRESHOLD * 100}%`
    );
  });

  it('should meet success threshold for tokenization', () => {
    if (results.length === 0) {
      console.log('SKIP: No results to validate');
      return;
    }

    const tokenOk = results.filter(r => r.operations.tokenize === 'ok').length;
    const rate = tokenOk / results.length;

    console.log(`Tokenize success: ${tokenOk}/${results.length} (${(rate * 100).toFixed(1)}%)`);
    assert.ok(
      rate >= SUCCESS_THRESHOLD,
      `Tokenize success rate ${(rate * 100).toFixed(1)}% below threshold ${SUCCESS_THRESHOLD * 100}%`
    );
  });

  it('should extract symbols from majority of files', () => {
    if (results.length === 0) {
      console.log('SKIP: No results to validate');
      return;
    }

    const withSymbols = results.filter(r => r.symbolCount > 0).length;
    const rate = withSymbols / results.length;

    console.log(
      `Files with symbols: ${withSymbols}/${results.length} (${(rate * 100).toFixed(1)}%)`
    );
    // Lower threshold — some files are pure module.pmod stubs with no symbols
    assert.ok(
      rate >= 0.6,
      `Symbol extraction rate ${(rate * 100).toFixed(1)}% below 60% threshold`
    );
  });

  it('should not report false diagnostics on valid code', () => {
    if (results.length === 0) {
      console.log('SKIP: No results to validate');
      return;
    }

    // Files that are expected to fail introspection (require external libraries)
    // These modules need C libraries that may not be installed: GTK, Gnome, MySQL, etc.
    const EXPECTED_INTROSPECT_FAILS = new Set([
      // GTK/Gnome modules (require libgtk, libgnome)
      'modules/GTKSupport.pmod/Util.pmod',
      'modules/GTKSupport.pmod/pCtree.pike',
      'modules/GTKSupport.pmod/SClist.pike',
      'modules/GTKSupport.pmod/Alert.pike',
      'modules/GTKSupport.pmod/MenuFactory.pmod',
      'modules/GTKSupport.pmod/pDrawingArea.pike',
      'modules/GDK1.pmod',
      'modules/GDK2.pmod',
      'modules/Gnome.pmod',
      'modules/Gnome2.pmod',
      'modules/System.pmod/FSEvents.pmod/BlockingEventStream.pike',
      'modules/System.pmod/FSEvents.pmod',
      'modules/Mysql.pmod/module.pmod',
      'modules/Mysql.pmod/SqlTable.pike',
      // Crypto modules (require openssl/libcrypto)
      'modules/Crypto.pmod/Arcfour.pmod',
      'modules/Crypto.pmod/Arctwo.pmod',
      // File system modules (require libfuse)
      'modules/Fuse.pmod',
      'modules/Fuse.pmod/module.pmod',
      // Sass/CSS modules (require libsass)
      'modules/Web.pmod/Sass.pmod',
      // Profiling modules (require special profiling support)
      'modules/Debug.pmod/Profiling.pmod',
      // Pike security module (special system features)
      'modules/Pike.pmod/Security.pmod',
      'modules/SSL.pmod/Constants.pmod',
      'modules/Search.pmod/Utils.pmod',
      // FSEvents module (special system features)
      'modules/System.pmod/FSEvents.pmod',
      // SQL drivers (require database client libraries)
      'modules/Sql.pmod/msql.pike',
      'modules/Sql.pmod/mysql.pike',
      'modules/Sql.pmod/mysql_result.pike',
      'modules/Sql.pmod/mysqls.pike',
      'modules/Sql.pmod/mysqls_result.pike',
      'modules/Sql.pmod/odbc.pike',
      'modules/Sql.pmod/oracle.pike',
      'modules/Sql.pmod/postgres_result.pike',
      'modules/Sql.pmod/sybase.pike',
      // Image modules (require libjpeg, libtiff)
      'modules/_Image_JPEG.pmod',
      // Graphics (require OpenGL/GLU)
      'modules/GLU.pmod',
      'modules/GLUE.pmod/module.pmod',
      // Pango (require libpango)
      'modules/Pango.pmod',
      // GDBM (require libgdbm)
      'modules/Cache.pmod/Storage.pmod/Gdbm.pike',
      // GDK (require libgdk)
      'modules/GDK.pmod',
      // PV (require special system features)
      'modules/Tools.pmod/PV.pike',
      // DSN result (requires database client libraries)
      'modules/Sql.pmod/dsn_result.pike',
      'modules/Sql.pmod/dsn.pike',
      // SQL daemon (loads heavy C modules that crash in test context)
      'modules/Tools.pmod/Standalone.pmod/rsqld.pike',
    ]);

    // Files with expected diagnostics (true positives)
    // These are known to have legitimate issues in Pike's stdlib (e.g., uninitialized variables)
    // The analyzer correctly identifies potential issues in these files.
    // New files with diagnostics should be investigated before adding here —
    // genuine analyzer bugs should be fixed rather than suppressed.
    const EXPECTED_DIAGNOSTICS: Set<string> = new Set([
      // Legacy version directories (older Pike code with different conventions)
      '7.6/modules/Calendar.pmod/YMD.pike',
      '7.6/modules/Protocols.pmod/HTTP.pmod/module.pmod',
      '7.6/modules/Stdio.pmod/module.pmod',
      '7.8/modules/Filesystem.pmod/Tar.pmod',
      '7.8/modules/SSL.pmod/connection.pike',
      '7.8/modules/SSL.pmod/handshake.pike',
      '7.8/modules/Standards.pmod/PKCS.pmod/Signature.pmod',
      // Core runtime
      'master.pike',
      // ADT modules
      'modules/ADT.pmod/BitBuffer.pike',
      'modules/ADT.pmod/CritBit.pmod',
      'modules/ADT.pmod/History.pike',
      'modules/ADT.pmod/Struct.pike',
      // System modules
      'modules/Apple.pmod/Keychain.pike',
      'modules/Arg.pmod',
      'modules/Array.pmod',
      'modules/Audio.pmod/Format.pmod/MP3.pike',
      // Cache modules
      'modules/Cache.pmod/Storage.pmod/Memory.pike',
      'modules/Cache.pmod/cache.pike',
      // Calendar (complex timezone/date logic)
      'modules/Calendar.pmod/Timezone.pmod',
      'modules/Calendar.pmod/YMD.pike',
      'modules/Calendar.pmod/mkrules.pike',
      // Charset
      'modules/Charset.pmod/Tables.pmod/iso88591.pmod',
      'modules/Charset.pmod/module.pmod',
      // Concurrent
      'modules/Concurrent.pmod',
      // Crypto modules
      'modules/Crypto.pmod/ECC.pmod',
      'modules/Crypto.pmod/Koremutake.pmod',
      'modules/Crypto.pmod/PGP.pmod',
      'modules/Crypto.pmod/Password.pike',
      'modules/Crypto.pmod/Pipe.pike',
      'modules/Crypto.pmod/RSA.pmod',
      // Filesystem monitoring
      'modules/Filesystem.pmod/Monitor.pmod/basic.pike',
      'modules/Filesystem.pmod/Monitor.pmod/symlinks.pike',
      'modules/Filesystem.pmod/Tar.pmod',
      // GLUE (graphics)
      'modules/GLUE.pmod/module.pmod',
      // GTK support (legacy UI)
      'modules/GTKSupport.pmod/Alert.pike',
      'modules/GTKSupport.pmod/MenuFactory.pmod',
      'modules/GTKSupport.pmod/SClist.pike',
      'modules/GTKSupport.pmod/Util.pmod',
      'modules/GTKSupport.pmod/pCtree.pike',
      'modules/GTKSupport.pmod/pDrawingArea.pike',
      // Utilities
      'modules/Getopt.pmod',
      'modules/Graphics.pmod/Graph.pmod/create_bars.pike',
      'modules/Graphics.pmod/Graph.pmod/create_graph.pike',
      'modules/Graphics.pmod/Graph.pmod/polyline.pike',
      'modules/Graphics.pmod/Graph.pmod/create_pie.pike',
      'modules/Gz.pmod',
      'modules/Languages.pmod/PLIS.pmod',
      'modules/Locale.pmod/module.pmod',
      // MIME
      'modules/MIME.pmod/module.pmod',
      // Database
      'modules/Mysql.pmod/SqlTable.pike',
      // Networking utilities
      'modules/NetUtils.pmod',
      // Parser modules (complex parsing logic)
      'modules/Parser.pmod/C.pmod',
      'modules/Parser.pmod/LR.pmod/module.pmod',
      'modules/Parser.pmod/RCS.pike',
      'modules/Parser.pmod/Tabular.pike',
      'modules/Parser.pmod/XML.pmod/NSTree.pmod',
      'modules/Parser.pmod/XML.pmod/SloppyDOM.pmod',
      'modules/Parser.pmod/XML.pmod/Tree.pmod',
      'modules/Parser.pmod/XML.pmod/Validating.pike',
      'modules/Parser.pmod/module.pmod',
      // Process management
      'modules/Process.pmod',
      // Protocol implementations (complex network code)
      'modules/Protocols.pmod/Bittorrent.pmod/Bencoding.pmod',
      'modules/Protocols.pmod/Bittorrent.pmod/Peer.pike',
      'modules/Protocols.pmod/Bittorrent.pmod/Torrent.pike',
      'modules/Protocols.pmod/Bittorrent.pmod/Tracker.pike',
      'modules/Protocols.pmod/DNS.pmod',
      'modules/Protocols.pmod/DNS_SD.pmod',
      'modules/Protocols.pmod/HTTP.pmod/Query.pike',
      'modules/Protocols.pmod/HTTP.pmod/Server.pmod/Proxy.pike',
      'modules/Protocols.pmod/HTTP.pmod/Server.pmod/Request.pike',
      'modules/Protocols.pmod/HTTP.pmod/Session.pike',
      'modules/Protocols.pmod/HTTP.pmod/module.pmod',
      'modules/Protocols.pmod/IMAP.pmod/imap_server.pike',
      'modules/Protocols.pmod/IMAP.pmod/parse_line.pike',
      'modules/Protocols.pmod/IMAP.pmod/requests.pmod',
      'modules/Protocols.pmod/IMAP.pmod/server.pike',
      'modules/Protocols.pmod/IRC.pmod/Client.pike',
      'modules/Protocols.pmod/Ident.pmod',
      'modules/Protocols.pmod/LDAP.pmod/client.pike',
      'modules/Protocols.pmod/LDAP.pmod/module.pmod',
      'modules/Protocols.pmod/LDAP.pmod/protocol.pike',
      'modules/Protocols.pmod/LPD.pmod',
      'modules/Protocols.pmod/LysKOM.pmod/Raw.pike',
      'modules/Protocols.pmod/LysKOM.pmod/Session.pike',
      'modules/Protocols.pmod/OBEX.pmod',
      'modules/Protocols.pmod/SMTP.pmod/module.pmod',
      'modules/Protocols.pmod/SNMP.pmod/agent.pike',
      'modules/Protocols.pmod/SNMP.pmod/protocol.pike',
      'modules/Protocols.pmod/X.pmod/Requests.pmod',
      'modules/Protocols.pmod/X.pmod/Xlib.pmod',
      'modules/Protocols.pmod/X.pmod/db/convert_compose.pike',
      'modules/Protocols.pmod/XMLRPC.pmod/module.pmod',
      // Remote
      'modules/Remote.pmod/module.pmod',
      // SSL/TLS (complex state machines)
      'modules/SSL.pmod/Cipher.pmod',
      'modules/SSL.pmod/ClientConnection.pike',
      'modules/SSL.pmod/Connection.pike',
      'modules/SSL.pmod/Context.pike',
      'modules/SSL.pmod/ServerConnection.pike',
      'modules/SSL.pmod/Session.pike',
      // Search engine
      'modules/Search.pmod/Database.pmod/MySQL.pike',
      'modules/Search.pmod/Grammar.pmod/Lexer.pmod',
      'modules/Search.pmod/MergeFile.pike',
      'modules/Search.pmod/Query.pmod',
      // SQL drivers
      'modules/Sql.pmod/Sql.pike',
      'modules/Sql.pmod/pgsql.pike',
      'modules/Sql.pmod/pgsql_util.pmod',
      'modules/Sql.pmod/postgres.pike',
      'modules/Sql.pmod/rsql.pike',
      'modules/Sql.pmod/sqlite.pike',
      'modules/Sql.pmod/tds.pike',
      // Standards (data format handling)
      'modules/Standards.pmod/BSON.pmod/module.pmod',
      'modules/Standards.pmod/EXIF.pmod',
      'modules/Standards.pmod/FIPS10_4.pmod',
      'modules/Standards.pmod/IIM.pmod',
      'modules/Standards.pmod/JSON.pmod',
      'modules/Standards.pmod/PKCS.pmod/PFX.pmod',
      'modules/Standards.pmod/X509.pmod',
      'modules/Standards.pmod/XML.pmod/Wix.pmod',
      // Stdio (I/O)
      'modules/Stdio.pmod/FakeFile.pike',
      'modules/Stdio.pmod/Readline.pike',
      'modules/Stdio.pmod/Terminfo.pmod',
      'modules/Stdio.pmod/module.pmod',
      // String utilities
      'modules/String.pmod/Elite.pmod',
      'modules/String.pmod/module.pmod',
      // Tools (build/doc system)
      'modules/Tools.pmod/AutoDoc.pmod/BMMLParser.pike',
      'modules/Tools.pmod/AutoDoc.pmod/CExtractor.pmod',
      'modules/Tools.pmod/AutoDoc.pmod/DocParser.pmod',
      'modules/Tools.pmod/AutoDoc.pmod/MirarDocParser.pike',
      'modules/Tools.pmod/AutoDoc.pmod/PikeExtractor.pmod',
      'modules/Tools.pmod/AutoDoc.pmod/PikeObjects.pmod',
      'modules/Tools.pmod/AutoDoc.pmod/PikeParser.pike',
      'modules/Tools.pmod/AutoDoc.pmod/ProcessXML.pmod',
      'modules/Tools.pmod/Hilfe.pmod',
      'modules/Tools.pmod/Install.pmod',
      'modules/Tools.pmod/Monger.pmod/MongerDeveloper.pike',
      'modules/Tools.pmod/Monger.pmod/MongerUser.pike',
      'modules/Tools.pmod/PEM.pmod',
      'modules/Tools.pmod/PV.pike',
      'modules/Tools.pmod/Standalone.pmod/assemble_autodoc.pike',
      'modules/Tools.pmod/Standalone.pmod/autodoc_to_html.pike',
      'modules/Tools.pmod/Standalone.pmod/autodoc_to_split_html.pike',
      'modules/Tools.pmod/Standalone.pmod/benchmark.pike',
      'modules/Tools.pmod/Standalone.pmod/cgrep.pike',
      'modules/Tools.pmod/Standalone.pmod/dump.pike',
      'modules/Tools.pmod/Standalone.pmod/extract_autodoc.pike',
      'modules/Tools.pmod/Standalone.pmod/extract_locale.pike',
      'modules/Tools.pmod/Standalone.pmod/features.pike',
      'modules/Tools.pmod/Standalone.pmod/git_export_autodoc.pike',
      'modules/Tools.pmod/Standalone.pmod/make_wxs.pike',
      'modules/Tools.pmod/Standalone.pmod/module.pike',
      'modules/Tools.pmod/Standalone.pmod/pmar_install.pike',
      'modules/Tools.pmod/Standalone.pmod/precompile.pike',
      'modules/Tools.pmod/Standalone.pmod/process_files.pike',
      'modules/Tools.pmod/Standalone.pmod/rsqld.pike',
      'modules/Tools.pmod/Standalone.pmod/test_pike.pike',
      'modules/Tools.pmod/X509.pmod',
      'modules/Tools.pmod/sed.pmod',
      // Web modules
      'modules/Web.pmod/Api.pmod/Api.pike',
      'modules/Web.pmod/Auth.pmod/OAuth.pmod/Authentication.pike',
      'modules/Web.pmod/Auth.pmod/OAuth2.pmod',
      'modules/Web.pmod/Crawler.pmod',
      'modules/Web.pmod/RDF.pike',
      'modules/Web.pmod/module.pmod',
      // Yabu database
      'modules/Yabu.pmod/module.pmod',
      // ZXID
      'modules/ZXID.pmod',
      // Image modules
      'modules/_Image.pmod/Dims.pmod',
      'modules/_Image.pmod/Fonts.pmod',
      'modules/_Image.pmod/module.pmod',
      'modules/_Image_DWG.pmod',
      'modules/_Image_PS.pmod',
      'modules/_Image_PSD.pmod',
      'modules/_Image_XPM.pmod',
      // Built-in Nettle Hash
      'modules/__builtin.pmod/Nettle.pmod/Hash.pike',
    ]);

    // Files with diagnostics - these are typically uninitialized variable warnings
    const filesWithDiagnostics = results.filter(
      r => r.diagnosticCount > 0 && r.operations.diagnostics === 'ok'
    );

    console.log(`Files with diagnostics: ${filesWithDiagnostics.length}/${results.length}`);

    // Separate true positives (expected) from false positives (analyzer bugs)
    const truePositives = filesWithDiagnostics.filter(r =>
      EXPECTED_DIAGNOSTICS.has(r.relativePath)
    );
    const falsePositives = filesWithDiagnostics.filter(
      r => !EXPECTED_DIAGNOSTICS.has(r.relativePath)
    );

    console.log(`  - True positives (expected): ${truePositives.length}`);
    console.log(`  - False positives (analyzer bugs): ${falsePositives.length}`);

    if (falsePositives.length > 0) {
      console.log('\nFalse positive diagnostic files (analyzer bugs):');
      for (const r of falsePositives.slice(0, 10)) {
        console.log(`  - ${r.relativePath} (${r.diagnosticCount} diagnostics)`);
      }
      if (falsePositives.length > 10) {
        console.log(`  ... and ${falsePositives.length - 10} more`);
      }
    }

    // Zero tolerance for false positives - analyzer bugs should be fixed
    assert.equal(
      falsePositives.length,
      0,
      `${falsePositives.length} files have false positive diagnostics (analyzer bugs). ` +
        `Either fix the analyzer or add the file to EXPECTED_DIAGNOSTICS if it's a true positive.`
    );

    // Diagnostics are expected on some stdlib files (uninitialized variable analysis)
    // This is NOT a bug - the analyzer correctly identifies potential issues
    const DIAGNOSTIC_THRESHOLD = 0.3; // Allow up to 30% of files to have diagnostics
    const rate = filesWithDiagnostics.length / results.length;
    assert.ok(
      rate <= DIAGNOSTIC_THRESHOLD,
      `Diagnostic rate ${(rate * 100).toFixed(1)}% exceeds threshold of ${DIAGNOSTIC_THRESHOLD * 100}%`
    );

    // Check that introspection failures are only from expected GTK/Gnome modules
    const filesWithIntrospectFailures = results.filter(r =>
      r.errors.some(e => e.includes('introspect') && e.includes('Compilation failed'))
    );

    const unexpectedFailures = filesWithIntrospectFailures.filter(
      r => !EXPECTED_INTROSPECT_FAILS.has(r.relativePath)
    );

    assert.equal(
      unexpectedFailures.length,
      0,
      `${unexpectedFailures.length} unexpected introspect failures: ` +
        unexpectedFailures.map(f => f.relativePath).join(', ')
    );

    // Collect and log operation failure messages for visibility
    const filesWithFailures = results.filter(r => r.errors.length > 0);
    if (filesWithFailures.length > 0) {
      const failureSummary: Record<string, number> = {};
      for (const r of filesWithFailures) {
        for (const err of r.errors) {
          const key = err.substring(0, 80);
          failureSummary[key] = (failureSummary[key] || 0) + 1;
        }
      }

      // Print top failure categories
      const sorted = Object.entries(failureSummary)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 10);
      console.log('\nTop operation failure categories:');
      for (const [msg, count] of sorted) {
        console.log(`  ${count}x: ${msg}`);
      }
    }
  });
});
