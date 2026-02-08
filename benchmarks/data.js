window.BENCHMARK_DATA = {
  "lastUpdate": 1770558170941,
  "repoUrl": "https://github.com/TheSmuks/pike-lsp",
  "entries": {
    "Pike LSP Performance": [
      {
        "commit": {
          "author": {
            "email": "therealsmuks@gmail.com",
            "name": "TheSmuks",
            "username": "TheSmuks"
          },
          "committer": {
            "email": "therealsmuks@gmail.com",
            "name": "TheSmuks",
            "username": "TheSmuks"
          },
          "distinct": true,
          "id": "edda6165c613d13a4b9327997070b91dde6c03f6",
          "message": "chore: bump version to 0.1.0-alpha.12\n\n- Update all package.json files to 0.1.0-alpha.12\n- Add CHANGELOG entry for benchmark automation\n\nCo-Authored-By: Claude Opus 4.5 <noreply@anthropic.com>",
          "timestamp": "2026-01-26T17:07:29+01:00",
          "tree_id": "f110b812580e16e11f19d3b933238dcf1545700f",
          "url": "https://github.com/TheSmuks/pike-lsp/commit/edda6165c613d13a4b9327997070b91dde6c03f6"
        },
        "date": 1769443745070,
        "tool": "customSmallerIsBetter",
        "benches": [
          {
            "name": "PikeBridge.start() [Cold Start]",
            "value": 202.89474441666667,
            "unit": "ms"
          },
          {
            "name": "PikeBridge.start() with detailed metrics [Cold Start]",
            "value": 257.23261133333335,
            "unit": "ms"
          },
          {
            "name": "Cold Start + First Request (getVersionInfo)",
            "value": 256.205288,
            "unit": "ms"
          },
          {
            "name": "Cold Start + Introspect",
            "value": 258.54699108333335,
            "unit": "ms"
          },
          {
            "name": "Validation: Small File (~15 lines)",
            "value": 1.7063228292079207,
            "unit": "ms"
          },
          {
            "name": "Validation: Medium File (~100 lines)",
            "value": 4.741187833333333,
            "unit": "ms"
          },
          {
            "name": "Validation: Large File (~1000 lines)",
            "value": 53.097068,
            "unit": "ms"
          },
          {
            "name": "Validation Legacy (3 calls: introspect + parse + analyzeUninitialized)",
            "value": 4.598544141891892,
            "unit": "ms"
          },
          {
            "name": "Validation Consolidated (1 call: analyze with all includes)",
            "value": 3.620803664893617,
            "unit": "ms"
          },
          {
            "name": "Cache Hit: analyze with same document version",
            "value": 0.1779171568573015,
            "unit": "ms"
          },
          {
            "name": "Cache Miss: analyze with different version",
            "value": 0.1740524199945667,
            "unit": "ms"
          },
          {
            "name": "Closed File: analyze without version (stat-based key)",
            "value": 0.43234813709160796,
            "unit": "ms"
          },
          {
            "name": "Cross-file: compile main with inherited utils",
            "value": 0.20882364791464597,
            "unit": "ms"
          },
          {
            "name": "Cross-file: recompile main (cache hit)",
            "value": 0.22145620664335666,
            "unit": "ms"
          },
          {
            "name": "resolveStdlib(\"Stdio\") - warm",
            "value": 0.446171090548579,
            "unit": "ms"
          },
          {
            "name": "resolveStdlib(\"String\")",
            "value": 0.27906815313420275,
            "unit": "ms"
          },
          {
            "name": "resolveStdlib(\"Array\")",
            "value": 0.37469505409927495,
            "unit": "ms"
          },
          {
            "name": "resolveStdlib(\"Mapping\")",
            "value": 0.11610831488151659,
            "unit": "ms"
          },
          {
            "name": "resolveStdlib(\"Stdio.File\") - nested",
            "value": 0.6852999689067202,
            "unit": "ms"
          },
          {
            "name": "resolveStdlib(\"String.SplitIterator\") - nested",
            "value": 0.0936440550327006,
            "unit": "ms"
          },
          {
            "name": "First diagnostic after document change",
            "value": 0.18465693264545716,
            "unit": "ms"
          },
          {
            "name": "Validation with 250ms debounce (default)",
            "value": 250.894766,
            "unit": "ms"
          },
          {
            "name": "Rapid edit simulation (debounce coalescing)",
            "value": 254.916812,
            "unit": "ms"
          },
          {
            "name": "Hover: resolveStdlib(\"Stdio.File\")",
            "value": 0.5917658036490008,
            "unit": "ms"
          },
          {
            "name": "Hover: resolveModule(\"Stdio.File\")",
            "value": 0.08435862830725462,
            "unit": "ms"
          },
          {
            "name": "Completion: getCompletionContext (Large File, Warm Cache)",
            "value": 10.274492692307692,
            "unit": "ms"
          },
          {
            "name": "Completion: getCompletionContext (Large File, Cold Cache)",
            "value": 10.449152031746031,
            "unit": "ms"
          }
        ]
      },
      {
        "commit": {
          "author": {
            "email": "therealsmuks@gmail.com",
            "name": "TheSmuks",
            "username": "TheSmuks"
          },
          "committer": {
            "email": "therealsmuks@gmail.com",
            "name": "TheSmuks",
            "username": "TheSmuks"
          },
          "distinct": true,
          "id": "09e39b61af8bcad47337517f7873c88a3ab30ac5",
          "message": "fix: gh-pages deployment to handle remote changes\n\n- Checkout gh-pages from origin to ensure we have latest state\n- Use HEAD:gh-pages push syntax to avoid branch tracking issues\n- Generate page directly in current directory (on gh-pages branch)\n\nCo-Authored-By: Claude Opus 4.5 <noreply@anthropic.com>",
          "timestamp": "2026-01-26T17:11:11+01:00",
          "tree_id": "bf6133f0b56a93934a09e75f71107208483cd893",
          "url": "https://github.com/TheSmuks/pike-lsp/commit/09e39b61af8bcad47337517f7873c88a3ab30ac5"
        },
        "date": 1769443961723,
        "tool": "customSmallerIsBetter",
        "benches": [
          {
            "name": "PikeBridge.start() [Cold Start]",
            "value": 202.02850916666665,
            "unit": "ms"
          },
          {
            "name": "PikeBridge.start() with detailed metrics [Cold Start]",
            "value": 251.447552,
            "unit": "ms"
          },
          {
            "name": "Cold Start + First Request (getVersionInfo)",
            "value": 250.90355625,
            "unit": "ms"
          },
          {
            "name": "Cold Start + Introspect",
            "value": 255.49997908333333,
            "unit": "ms"
          },
          {
            "name": "Validation: Small File (~15 lines)",
            "value": 1.4554500611814347,
            "unit": "ms"
          },
          {
            "name": "Validation: Medium File (~100 lines)",
            "value": 4.6934758424657534,
            "unit": "ms"
          },
          {
            "name": "Validation: Large File (~1000 lines)",
            "value": 52.2184954,
            "unit": "ms"
          },
          {
            "name": "Validation Legacy (3 calls: introspect + parse + analyzeUninitialized)",
            "value": 4.526321529801325,
            "unit": "ms"
          },
          {
            "name": "Validation Consolidated (1 call: analyze with all includes)",
            "value": 3.5422238195876288,
            "unit": "ms"
          },
          {
            "name": "Cache Hit: analyze with same document version",
            "value": 0.17024342063281042,
            "unit": "ms"
          },
          {
            "name": "Cache Miss: analyze with different version",
            "value": 0.16279141700611,
            "unit": "ms"
          },
          {
            "name": "Closed File: analyze without version (stat-based key)",
            "value": 0.424403620754717,
            "unit": "ms"
          },
          {
            "name": "Cross-file: compile main with inherited utils",
            "value": 0.18305698657909766,
            "unit": "ms"
          },
          {
            "name": "Cross-file: recompile main (cache hit)",
            "value": 0.18651736560397777,
            "unit": "ms"
          },
          {
            "name": "resolveStdlib(\"Stdio\") - warm",
            "value": 0.44370141469816277,
            "unit": "ms"
          },
          {
            "name": "resolveStdlib(\"String\")",
            "value": 0.2881465380269448,
            "unit": "ms"
          },
          {
            "name": "resolveStdlib(\"Array\")",
            "value": 0.368670397147559,
            "unit": "ms"
          },
          {
            "name": "resolveStdlib(\"Mapping\")",
            "value": 0.1012173283408221,
            "unit": "ms"
          },
          {
            "name": "resolveStdlib(\"Stdio.File\") - nested",
            "value": 0.5835435282051281,
            "unit": "ms"
          },
          {
            "name": "resolveStdlib(\"String.SplitIterator\") - nested",
            "value": 0.07778614187126742,
            "unit": "ms"
          },
          {
            "name": "First diagnostic after document change",
            "value": 0.18437659280411195,
            "unit": "ms"
          },
          {
            "name": "Validation with 250ms debounce (default)",
            "value": 250.56861633333335,
            "unit": "ms"
          },
          {
            "name": "Rapid edit simulation (debounce coalescing)",
            "value": 252.507602,
            "unit": "ms"
          },
          {
            "name": "Hover: resolveStdlib(\"Stdio.File\")",
            "value": 0.5859879785223369,
            "unit": "ms"
          },
          {
            "name": "Hover: resolveModule(\"Stdio.File\")",
            "value": 0.08931095164670659,
            "unit": "ms"
          },
          {
            "name": "Completion: getCompletionContext (Large File, Warm Cache)",
            "value": 9.968559835820894,
            "unit": "ms"
          },
          {
            "name": "Completion: getCompletionContext (Large File, Cold Cache)",
            "value": 9.908258985074626,
            "unit": "ms"
          }
        ]
      },
      {
        "commit": {
          "author": {
            "email": "therealsmuks@gmail.com",
            "name": "TheSmuks",
            "username": "TheSmuks"
          },
          "committer": {
            "email": "therealsmuks@gmail.com",
            "name": "TheSmuks",
            "username": "TheSmuks"
          },
          "distinct": true,
          "id": "43fed9b3f5bd9f736d7f2eb74ae2bd5bb9ac2cb5",
          "message": "fix: run benchmarks before switching to gh-pages branch\n\n- Run benchmarks and generate page while on main branch\n- Save generated page to /tmp before branch switch\n- Copy temp file to gh-pages branch after checkout\n- This ensures scripts and benchmark results are accessible\n\nCo-Authored-By: Claude Opus 4.5 <noreply@anthropic.com>",
          "timestamp": "2026-01-26T17:14:09+01:00",
          "tree_id": "dd06fb10492c10ead1adf8e53f25a05af3656406",
          "url": "https://github.com/TheSmuks/pike-lsp/commit/43fed9b3f5bd9f736d7f2eb74ae2bd5bb9ac2cb5"
        },
        "date": 1769444145793,
        "tool": "customSmallerIsBetter",
        "benches": [
          {
            "name": "PikeBridge.start() [Cold Start]",
            "value": 201.639657,
            "unit": "ms"
          },
          {
            "name": "PikeBridge.start() with detailed metrics [Cold Start]",
            "value": 240.571826,
            "unit": "ms"
          },
          {
            "name": "Cold Start + First Request (getVersionInfo)",
            "value": 238.89577891666664,
            "unit": "ms"
          },
          {
            "name": "Cold Start + Introspect",
            "value": 243.37094941666666,
            "unit": "ms"
          },
          {
            "name": "Validation: Small File (~15 lines)",
            "value": 1.1222075470779223,
            "unit": "ms"
          },
          {
            "name": "Validation: Medium File (~100 lines)",
            "value": 3.4620338190954776,
            "unit": "ms"
          },
          {
            "name": "Validation: Large File (~1000 lines)",
            "value": 39.463266142857144,
            "unit": "ms"
          },
          {
            "name": "Validation Legacy (3 calls: introspect + parse + analyzeUninitialized)",
            "value": 3.4520000854271355,
            "unit": "ms"
          },
          {
            "name": "Validation Consolidated (1 call: analyze with all includes)",
            "value": 2.6774426317829456,
            "unit": "ms"
          },
          {
            "name": "Cache Hit: analyze with same document version",
            "value": 0.1023430815067381,
            "unit": "ms"
          },
          {
            "name": "Cache Miss: analyze with different version",
            "value": 0.09591649984732825,
            "unit": "ms"
          },
          {
            "name": "Closed File: analyze without version (stat-based key)",
            "value": 0.2845882473662031,
            "unit": "ms"
          },
          {
            "name": "Cross-file: compile main with inherited utils",
            "value": 0.12827839776876268,
            "unit": "ms"
          },
          {
            "name": "Cross-file: recompile main (cache hit)",
            "value": 0.12034013519637463,
            "unit": "ms"
          },
          {
            "name": "resolveStdlib(\"Stdio\") - warm",
            "value": 0.28284407265854683,
            "unit": "ms"
          },
          {
            "name": "resolveStdlib(\"String\")",
            "value": 0.1821462486903777,
            "unit": "ms"
          },
          {
            "name": "resolveStdlib(\"Array\")",
            "value": 0.24083619734004313,
            "unit": "ms"
          },
          {
            "name": "resolveStdlib(\"Mapping\")",
            "value": 0.07102569047339363,
            "unit": "ms"
          },
          {
            "name": "resolveStdlib(\"Stdio.File\") - nested",
            "value": 0.4120841527272727,
            "unit": "ms"
          },
          {
            "name": "resolveStdlib(\"String.SplitIterator\") - nested",
            "value": 0.04355488991292318,
            "unit": "ms"
          },
          {
            "name": "First diagnostic after document change",
            "value": 0.10943058303155717,
            "unit": "ms"
          },
          {
            "name": "Validation with 250ms debounce (default)",
            "value": 250.28708375,
            "unit": "ms"
          },
          {
            "name": "Rapid edit simulation (debounce coalescing)",
            "value": 252.45070491666667,
            "unit": "ms"
          },
          {
            "name": "Hover: resolveStdlib(\"Stdio.File\")",
            "value": 0.4155626660550458,
            "unit": "ms"
          },
          {
            "name": "Hover: resolveModule(\"Stdio.File\")",
            "value": 0.047863439453125,
            "unit": "ms"
          },
          {
            "name": "Completion: getCompletionContext (Large File, Warm Cache)",
            "value": 7.304759096774194,
            "unit": "ms"
          },
          {
            "name": "Completion: getCompletionContext (Large File, Cold Cache)",
            "value": 7.340107369565218,
            "unit": "ms"
          }
        ]
      },
      {
        "commit": {
          "author": {
            "email": "therealsmuks@gmail.com",
            "name": "TheSmuks",
            "username": "TheSmuks"
          },
          "committer": {
            "email": "therealsmuks@gmail.com",
            "name": "TheSmuks",
            "username": "TheSmuks"
          },
          "distinct": true,
          "id": "3938d958c175442c68f8037059212a4fe6fbc226",
          "message": "feat: add TDD Guard integration for Test-Driven Development enforcement\n\nAdd tdd-guard integration to enforce TDD principles in Claude Code:\n\n- Configure Claude Code hooks (PreToolUse, UserPromptSubmit, SessionStart)\n- Create custom JUnit to JSON converter for bun test compatibility\n- Add tdd-guard configuration and documentation\n- Include example test demonstrating TDD workflow\n- Add test wrapper script for running tests with JUnit output\n\nTDD Guard ensures:\n1. Tests are written before implementation\n2. No over-implementation beyond test requirements\n3. All code changes follow TDD workflow\n\nRelated: https://github.com/nizos/tdd-guard\n\nCo-Authored-By: Claude Sonnet 4.5 <noreply@anthropic.com>",
          "timestamp": "2026-02-01T17:20:22+01:00",
          "tree_id": "671777c7153f0fcf8ad50de585c8b740691cc9e4",
          "url": "https://github.com/TheSmuks/pike-lsp/commit/3938d958c175442c68f8037059212a4fe6fbc226"
        },
        "date": 1769962974789,
        "tool": "customSmallerIsBetter",
        "benches": [
          {
            "name": "PikeBridge.start() [Cold Start]",
            "value": 201.42449466666665,
            "unit": "ms"
          },
          {
            "name": "PikeBridge.start() with detailed metrics [Cold Start]",
            "value": 250.67907408333335,
            "unit": "ms"
          },
          {
            "name": "Cold Start + First Request (getVersionInfo)",
            "value": 250.09743041666667,
            "unit": "ms"
          },
          {
            "name": "Cold Start + Introspect",
            "value": 255.01164341666666,
            "unit": "ms"
          },
          {
            "name": "Validation: Small File (~15 lines)",
            "value": 1.5986534965197217,
            "unit": "ms"
          },
          {
            "name": "Validation: Medium File (~100 lines)",
            "value": 4.5670566133333335,
            "unit": "ms"
          },
          {
            "name": "Validation: Large File (~1000 lines)",
            "value": 52.3418861,
            "unit": "ms"
          },
          {
            "name": "Validation Legacy (3 calls: introspect + parse + analyzeUninitialized)",
            "value": 4.536940834437086,
            "unit": "ms"
          },
          {
            "name": "Validation Consolidated (1 call: analyze with all includes)",
            "value": 3.553673268041237,
            "unit": "ms"
          },
          {
            "name": "Cache Hit: analyze with same document version",
            "value": 0.15212592331581462,
            "unit": "ms"
          },
          {
            "name": "Cache Miss: analyze with different version",
            "value": 0.17038594750865974,
            "unit": "ms"
          },
          {
            "name": "Closed File: analyze without version (stat-based key)",
            "value": 0.4024647892857143,
            "unit": "ms"
          },
          {
            "name": "Cross-file: compile main with inherited utils",
            "value": 0.182697111174135,
            "unit": "ms"
          },
          {
            "name": "Cross-file: recompile main (cache hit)",
            "value": 0.18933565715135298,
            "unit": "ms"
          },
          {
            "name": "resolveStdlib(\"Stdio\") - warm",
            "value": 0.3981195826446281,
            "unit": "ms"
          },
          {
            "name": "resolveStdlib(\"String\")",
            "value": 0.2588903634232122,
            "unit": "ms"
          },
          {
            "name": "resolveStdlib(\"Array\")",
            "value": 0.34131713842239186,
            "unit": "ms"
          },
          {
            "name": "resolveStdlib(\"Mapping\")",
            "value": 0.09476725141065831,
            "unit": "ms"
          },
          {
            "name": "resolveStdlib(\"Stdio.File\") - nested",
            "value": 0.5588572832512315,
            "unit": "ms"
          },
          {
            "name": "resolveStdlib(\"String.SplitIterator\") - nested",
            "value": 0.07614832705790704,
            "unit": "ms"
          },
          {
            "name": "First diagnostic after document change",
            "value": 0.15502920866618253,
            "unit": "ms"
          },
          {
            "name": "Validation with 250ms debounce (default)",
            "value": 250.17196725,
            "unit": "ms"
          },
          {
            "name": "Rapid edit simulation (debounce coalescing)",
            "value": 253.36714416666666,
            "unit": "ms"
          },
          {
            "name": "Hover: resolveStdlib(\"Stdio.File\")",
            "value": 0.5327515054773083,
            "unit": "ms"
          },
          {
            "name": "Hover: resolveModule(\"Stdio.File\")",
            "value": 0.07493582311621966,
            "unit": "ms"
          },
          {
            "name": "Completion: getCompletionContext (Large File, Warm Cache)",
            "value": 9.798983911764706,
            "unit": "ms"
          },
          {
            "name": "Completion: getCompletionContext (Large File, Cold Cache)",
            "value": 9.722411608695653,
            "unit": "ms"
          }
        ]
      },
      {
        "commit": {
          "author": {
            "email": "therealsmuks@gmail.com",
            "name": "TheSmuks",
            "username": "TheSmuks"
          },
          "committer": {
            "email": "therealsmuks@gmail.com",
            "name": "TheSmuks",
            "username": "TheSmuks"
          },
          "distinct": true,
          "id": "884bb6c48d8b6b104c8b41f44ca22c1edcd665c6",
          "message": "fix: replace __filename with import.meta.url for ESM compatibility\n\nFixed \"__filename is not defined\" error that prevented LSP server from\nstarting when compiled with TypeScript in ESM mode.\n\nChanges:\n- Updated pike-bridge and pike-lsp-server to use import.meta.url instead\n  of CommonJS __filename variable\n- Added fileURLToPath import to convert module URL to file path\n- Added ESM compatibility test to prevent regression\n\nThis was a bug fix where the code assumed CommonJS bundling but the\nproject uses ESM mode with \"type\": \"module\" in package.json.\n\nTested with:\n- Unit test verifying compiled output doesn't use __filename\n- Full E2E test suite (25 LSP feature tests all passing)\n\nCo-Authored-By: Claude Sonnet 4.5 <noreply@anthropic.com>",
          "timestamp": "2026-02-01T17:32:49+01:00",
          "tree_id": "a56e2cdb232051ec1b680dedfb7c966b3443bee3",
          "url": "https://github.com/TheSmuks/pike-lsp/commit/884bb6c48d8b6b104c8b41f44ca22c1edcd665c6"
        },
        "date": 1769963695315,
        "tool": "customSmallerIsBetter",
        "benches": [
          {
            "name": "PikeBridge.start() [Cold Start]",
            "value": 201.73393075,
            "unit": "ms"
          },
          {
            "name": "PikeBridge.start() with detailed metrics [Cold Start]",
            "value": 254.318307,
            "unit": "ms"
          },
          {
            "name": "Cold Start + First Request (getVersionInfo)",
            "value": 254.21811366666665,
            "unit": "ms"
          },
          {
            "name": "Cold Start + Introspect",
            "value": 257.11424191666663,
            "unit": "ms"
          },
          {
            "name": "Validation: Small File (~15 lines)",
            "value": 1.5939633842592593,
            "unit": "ms"
          },
          {
            "name": "Validation: Medium File (~100 lines)",
            "value": 4.614295256756757,
            "unit": "ms"
          },
          {
            "name": "Validation: Large File (~1000 lines)",
            "value": 53.0034309,
            "unit": "ms"
          },
          {
            "name": "Validation Legacy (3 calls: introspect + parse + analyzeUninitialized)",
            "value": 4.573973353333334,
            "unit": "ms"
          },
          {
            "name": "Validation Consolidated (1 call: analyze with all includes)",
            "value": 3.5233399384615383,
            "unit": "ms"
          },
          {
            "name": "Cache Hit: analyze with same document version",
            "value": 0.19457884215300877,
            "unit": "ms"
          },
          {
            "name": "Cache Miss: analyze with different version",
            "value": 0.16365793157355202,
            "unit": "ms"
          },
          {
            "name": "Closed File: analyze without version (stat-based key)",
            "value": 0.4394680566775244,
            "unit": "ms"
          },
          {
            "name": "Cross-file: compile main with inherited utils",
            "value": 0.19532566039453716,
            "unit": "ms"
          },
          {
            "name": "Cross-file: recompile main (cache hit)",
            "value": 0.19934837332502336,
            "unit": "ms"
          },
          {
            "name": "resolveStdlib(\"Stdio\") - warm",
            "value": 0.41818910607940446,
            "unit": "ms"
          },
          {
            "name": "resolveStdlib(\"String\")",
            "value": 0.2864790614718615,
            "unit": "ms"
          },
          {
            "name": "resolveStdlib(\"Array\")",
            "value": 0.36114774582660203,
            "unit": "ms"
          },
          {
            "name": "resolveStdlib(\"Mapping\")",
            "value": 0.10670059850200314,
            "unit": "ms"
          },
          {
            "name": "resolveStdlib(\"Stdio.File\") - nested",
            "value": 0.6217852922374429,
            "unit": "ms"
          },
          {
            "name": "resolveStdlib(\"String.SplitIterator\") - nested",
            "value": 0.08480101074498567,
            "unit": "ms"
          },
          {
            "name": "First diagnostic after document change",
            "value": 0.16913926191102924,
            "unit": "ms"
          },
          {
            "name": "Validation with 250ms debounce (default)",
            "value": 250.76619308333335,
            "unit": "ms"
          },
          {
            "name": "Rapid edit simulation (debounce coalescing)",
            "value": 252.81266825,
            "unit": "ms"
          },
          {
            "name": "Hover: resolveStdlib(\"Stdio.File\")",
            "value": 0.5586668285479902,
            "unit": "ms"
          },
          {
            "name": "Hover: resolveModule(\"Stdio.File\")",
            "value": 0.09149341104668904,
            "unit": "ms"
          },
          {
            "name": "Completion: getCompletionContext (Large File, Warm Cache)",
            "value": 9.952217863636363,
            "unit": "ms"
          },
          {
            "name": "Completion: getCompletionContext (Large File, Cold Cache)",
            "value": 9.813745294117647,
            "unit": "ms"
          }
        ]
      },
      {
        "commit": {
          "author": {
            "email": "therealsmuks@gmail.com",
            "name": "TheSmuks",
            "username": "TheSmuks"
          },
          "committer": {
            "email": "therealsmuks@gmail.com",
            "name": "TheSmuks",
            "username": "TheSmuks"
          },
          "distinct": true,
          "id": "43188a92a5df3427178b7589f5a9490ae63ea39d",
          "message": "fix: exclude test files from TypeScript build",
          "timestamp": "2026-02-01T18:19:54+01:00",
          "tree_id": "fcd1d3bfb1dff79e54bf2b5ee9a780eaefa8ebdd",
          "url": "https://github.com/TheSmuks/pike-lsp/commit/43188a92a5df3427178b7589f5a9490ae63ea39d"
        },
        "date": 1769966509661,
        "tool": "customSmallerIsBetter",
        "benches": [
          {
            "name": "PikeBridge.start() [Cold Start]",
            "value": 201.13312875,
            "unit": "ms"
          },
          {
            "name": "PikeBridge.start() with detailed metrics [Cold Start]",
            "value": 248.98420166666665,
            "unit": "ms"
          },
          {
            "name": "Cold Start + First Request (getVersionInfo)",
            "value": 248.16634158333335,
            "unit": "ms"
          },
          {
            "name": "Cold Start + Introspect",
            "value": 253.558752,
            "unit": "ms"
          },
          {
            "name": "Validation: Small File (~15 lines)",
            "value": 1.4143887371663244,
            "unit": "ms"
          },
          {
            "name": "Validation: Medium File (~100 lines)",
            "value": 4.544828766666667,
            "unit": "ms"
          },
          {
            "name": "Validation: Large File (~1000 lines)",
            "value": 50.4649512,
            "unit": "ms"
          },
          {
            "name": "Validation Legacy (3 calls: introspect + parse + analyzeUninitialized)",
            "value": 4.595310168918918,
            "unit": "ms"
          },
          {
            "name": "Validation Consolidated (1 call: analyze with all includes)",
            "value": 3.3090924951923073,
            "unit": "ms"
          },
          {
            "name": "Cache Hit: analyze with same document version",
            "value": 0.15250685333333333,
            "unit": "ms"
          },
          {
            "name": "Cache Miss: analyze with different version",
            "value": 0.15030439764492756,
            "unit": "ms"
          },
          {
            "name": "Closed File: analyze without version (stat-based key)",
            "value": 0.38693441060349687,
            "unit": "ms"
          },
          {
            "name": "Cross-file: compile main with inherited utils",
            "value": 0.16408001028084251,
            "unit": "ms"
          },
          {
            "name": "Cross-file: recompile main (cache hit)",
            "value": 0.14519119604395603,
            "unit": "ms"
          },
          {
            "name": "resolveStdlib(\"Stdio\") - warm",
            "value": 0.39282424195402293,
            "unit": "ms"
          },
          {
            "name": "resolveStdlib(\"String\")",
            "value": 0.2233686091387245,
            "unit": "ms"
          },
          {
            "name": "resolveStdlib(\"Array\")",
            "value": 0.3050034839142091,
            "unit": "ms"
          },
          {
            "name": "resolveStdlib(\"Mapping\")",
            "value": 0.08802958259687288,
            "unit": "ms"
          },
          {
            "name": "resolveStdlib(\"Stdio.File\") - nested",
            "value": 0.5582307886178861,
            "unit": "ms"
          },
          {
            "name": "resolveStdlib(\"String.SplitIterator\") - nested",
            "value": 0.06889224310232457,
            "unit": "ms"
          },
          {
            "name": "First diagnostic after document change",
            "value": 0.15536441651075772,
            "unit": "ms"
          },
          {
            "name": "Validation with 250ms debounce (default)",
            "value": 250.24912433333336,
            "unit": "ms"
          },
          {
            "name": "Rapid edit simulation (debounce coalescing)",
            "value": 252.19929091666665,
            "unit": "ms"
          },
          {
            "name": "Hover: resolveStdlib(\"Stdio.File\")",
            "value": 0.5632967738193869,
            "unit": "ms"
          },
          {
            "name": "Hover: resolveModule(\"Stdio.File\")",
            "value": 0.06279483093261719,
            "unit": "ms"
          },
          {
            "name": "Completion: getCompletionContext (Large File, Warm Cache)",
            "value": 9.518147928571429,
            "unit": "ms"
          },
          {
            "name": "Completion: getCompletionContext (Large File, Cold Cache)",
            "value": 9.334505472222222,
            "unit": "ms"
          }
        ]
      },
      {
        "commit": {
          "author": {
            "email": "therealsmuks@gmail.com",
            "name": "TheSmuks",
            "username": "TheSmuks"
          },
          "committer": {
            "email": "therealsmuks@gmail.com",
            "name": "TheSmuks",
            "username": "TheSmuks"
          },
          "distinct": true,
          "id": "1d0070e089b9db9a9b60d3896e12cb40a9b29fbd",
          "message": "refactor: remove deprecated introspect handler and dead code\n\nRemove 1,073 lines of unused/deprecated code:\n- Delete type-introspector.pike (568 lines, superseded by LSP.Intelligence)\n- Remove deprecated handle_introspect() handler from analyzer.pike\n- Remove PikeBridge.introspect() and BridgeManager.introspect() methods\n- Migrate signature-help.ts to use analyze(['parse']) instead of parse()\n- Update benchmark code to use unified analyze() API\n\nAll tests passing (40 E2E + 30 bridge tests), no breaking changes.\nThe deprecated introspect handler was just a wrapper calling analyze()\nwith include:['introspect'], so removing it simplifies the codebase.\n\nDocumentation:\n- Add CLEANUP_REPORT.md with full analysis\n- Add TS_DEPENDENCIES.json and PIKE_DEPENDENCIES.json for future reference\n- Add CLEANUP_INVENTORY.md with complete file listing",
          "timestamp": "2026-02-01T18:50:15+01:00",
          "tree_id": "808dff70a2569e254297c40c75d49eee560ec484",
          "url": "https://github.com/TheSmuks/pike-lsp/commit/1d0070e089b9db9a9b60d3896e12cb40a9b29fbd"
        },
        "date": 1769968329410,
        "tool": "customSmallerIsBetter",
        "benches": [
          {
            "name": "PikeBridge.start() [Cold Start]",
            "value": 201.46219141666666,
            "unit": "ms"
          },
          {
            "name": "PikeBridge.start() with detailed metrics [Cold Start]",
            "value": 251.09246191666665,
            "unit": "ms"
          },
          {
            "name": "Cold Start + First Request (getVersionInfo)",
            "value": 252.86812975,
            "unit": "ms"
          },
          {
            "name": "Cold Start + Introspect",
            "value": 255.83100975,
            "unit": "ms"
          },
          {
            "name": "Validation: Small File (~15 lines)",
            "value": 1.0473990792682926,
            "unit": "ms"
          },
          {
            "name": "Validation: Medium File (~100 lines)",
            "value": 3.555580592783505,
            "unit": "ms"
          },
          {
            "name": "Validation: Large File (~1000 lines)",
            "value": 43.02658415384615,
            "unit": "ms"
          },
          {
            "name": "Validation Legacy (3 calls: analyze + parse + analyzeUninitialized)",
            "value": 4.559084746666667,
            "unit": "ms"
          },
          {
            "name": "Validation Consolidated (1 call: analyze with all includes)",
            "value": 3.5034664081632654,
            "unit": "ms"
          },
          {
            "name": "Cache Hit: analyze with same document version",
            "value": 0.1523406425491136,
            "unit": "ms"
          },
          {
            "name": "Cache Miss: analyze with different version",
            "value": 0.18070156703358733,
            "unit": "ms"
          },
          {
            "name": "Closed File: analyze without version (stat-based key)",
            "value": 0.46549302622498273,
            "unit": "ms"
          },
          {
            "name": "Cross-file: compile main with inherited utils",
            "value": 0.18618584020918072,
            "unit": "ms"
          },
          {
            "name": "Cross-file: recompile main (cache hit)",
            "value": 0.17669754391328515,
            "unit": "ms"
          },
          {
            "name": "resolveStdlib(\"Stdio\") - warm",
            "value": 0.4314499750639387,
            "unit": "ms"
          },
          {
            "name": "resolveStdlib(\"String\")",
            "value": 0.2761522565707134,
            "unit": "ms"
          },
          {
            "name": "resolveStdlib(\"Array\")",
            "value": 0.365535468119891,
            "unit": "ms"
          },
          {
            "name": "resolveStdlib(\"Mapping\")",
            "value": 0.10621629582608696,
            "unit": "ms"
          },
          {
            "name": "resolveStdlib(\"Stdio.File\") - nested",
            "value": 0.5612049174917492,
            "unit": "ms"
          },
          {
            "name": "resolveStdlib(\"String.SplitIterator\") - nested",
            "value": 0.0782994273139504,
            "unit": "ms"
          },
          {
            "name": "First diagnostic after document change",
            "value": 0.16074330524203662,
            "unit": "ms"
          },
          {
            "name": "Validation with 250ms debounce (default)",
            "value": 250.28813875,
            "unit": "ms"
          },
          {
            "name": "Rapid edit simulation (debounce coalescing)",
            "value": 251.73478416666666,
            "unit": "ms"
          },
          {
            "name": "Hover: resolveStdlib(\"Stdio.File\")",
            "value": 0.584762350816853,
            "unit": "ms"
          },
          {
            "name": "Hover: resolveModule(\"Stdio.File\")",
            "value": 0.08223870086302895,
            "unit": "ms"
          },
          {
            "name": "Completion: getCompletionContext (Large File, Warm Cache)",
            "value": 9.831720529411765,
            "unit": "ms"
          },
          {
            "name": "Completion: getCompletionContext (Large File, Cold Cache)",
            "value": 9.820451220588236,
            "unit": "ms"
          }
        ]
      },
      {
        "commit": {
          "author": {
            "email": "therealsmuks@gmail.com",
            "name": "TheSmuks",
            "username": "TheSmuks"
          },
          "committer": {
            "email": "therealsmuks@gmail.com",
            "name": "TheSmuks",
            "username": "TheSmuks"
          },
          "distinct": true,
          "id": "d1669ef5b2199e976c045de268e98b91540df5ca",
          "message": "fix: update pre-push hook to run tests from src directory\n\nThe pre-push hook was looking for compiled smoke.test.js in dist/,\nbut test files are excluded from TypeScript compilation.\n\nUpdated to run tests directly from src/ using bun test, which\nhandles TypeScript files natively.\n\nCo-Authored-By: Claude Sonnet 4.5 <noreply@anthropic.com>",
          "timestamp": "2026-02-01T21:18:33+01:00",
          "tree_id": "c76d5abb2ad556fd4aa5848131c2705bf9d30139",
          "url": "https://github.com/TheSmuks/pike-lsp/commit/d1669ef5b2199e976c045de268e98b91540df5ca"
        },
        "date": 1769977233514,
        "tool": "customSmallerIsBetter",
        "benches": [
          {
            "name": "PikeBridge.start() [Cold Start]",
            "value": 201.21652766666665,
            "unit": "ms"
          },
          {
            "name": "PikeBridge.start() with detailed metrics [Cold Start]",
            "value": 249.68282241666665,
            "unit": "ms"
          },
          {
            "name": "Cold Start + First Request (getVersionInfo)",
            "value": 249.99338158333333,
            "unit": "ms"
          },
          {
            "name": "Cold Start + Introspect",
            "value": 253.93734925,
            "unit": "ms"
          },
          {
            "name": "Validation: Small File (~15 lines)",
            "value": 1.0575049110429449,
            "unit": "ms"
          },
          {
            "name": "Validation: Medium File (~100 lines)",
            "value": 3.57547871875,
            "unit": "ms"
          },
          {
            "name": "Validation: Large File (~1000 lines)",
            "value": 43.52815207692308,
            "unit": "ms"
          },
          {
            "name": "Validation Legacy (3 calls: analyze + parse + analyzeUninitialized)",
            "value": 4.554065278145695,
            "unit": "ms"
          },
          {
            "name": "Validation Consolidated (1 call: analyze with all includes)",
            "value": 3.528946476923077,
            "unit": "ms"
          },
          {
            "name": "Cache Hit: analyze with same document version",
            "value": 0.15481932370082566,
            "unit": "ms"
          },
          {
            "name": "Cache Miss: analyze with different version",
            "value": 0.14887844114205476,
            "unit": "ms"
          },
          {
            "name": "Closed File: analyze without version (stat-based key)",
            "value": 0.388347917146145,
            "unit": "ms"
          },
          {
            "name": "Cross-file: compile main with inherited utils",
            "value": 0.1818058473952435,
            "unit": "ms"
          },
          {
            "name": "Cross-file: recompile main (cache hit)",
            "value": 0.16621726100547018,
            "unit": "ms"
          },
          {
            "name": "resolveStdlib(\"Stdio\") - warm",
            "value": 0.39484067721148214,
            "unit": "ms"
          },
          {
            "name": "resolveStdlib(\"String\")",
            "value": 0.2680555346294046,
            "unit": "ms"
          },
          {
            "name": "resolveStdlib(\"Array\")",
            "value": 0.32759591988275527,
            "unit": "ms"
          },
          {
            "name": "resolveStdlib(\"Mapping\")",
            "value": 0.090953924781429,
            "unit": "ms"
          },
          {
            "name": "resolveStdlib(\"Stdio.File\") - nested",
            "value": 0.5249539290670779,
            "unit": "ms"
          },
          {
            "name": "resolveStdlib(\"String.SplitIterator\") - nested",
            "value": 0.08031662747237757,
            "unit": "ms"
          },
          {
            "name": "First diagnostic after document change",
            "value": 0.16404302227342552,
            "unit": "ms"
          },
          {
            "name": "Validation with 250ms debounce (default)",
            "value": 250.14854175,
            "unit": "ms"
          },
          {
            "name": "Rapid edit simulation (debounce coalescing)",
            "value": 252.64224575,
            "unit": "ms"
          },
          {
            "name": "Hover: resolveStdlib(\"Stdio.File\")",
            "value": 0.5302970669781931,
            "unit": "ms"
          },
          {
            "name": "Hover: resolveModule(\"Stdio.File\")",
            "value": 0.07343419089426816,
            "unit": "ms"
          },
          {
            "name": "Completion: getCompletionContext (Large File, Warm Cache)",
            "value": 9.898215865671641,
            "unit": "ms"
          },
          {
            "name": "Completion: getCompletionContext (Large File, Cold Cache)",
            "value": 9.837819176470589,
            "unit": "ms"
          }
        ]
      },
      {
        "commit": {
          "author": {
            "email": "therealsmuks@gmail.com",
            "name": "TheSmuks",
            "username": "TheSmuks"
          },
          "committer": {
            "email": "therealsmuks@gmail.com",
            "name": "TheSmuks",
            "username": "TheSmuks"
          },
          "distinct": true,
          "id": "a9e143b7b7871675eb1a839d52770241460690be",
          "message": "fix: correct CI test failures\n\n1. ESM Compatibility test: Fix path to compiled server.js from '../server.js' to '../../dist/server.js'\n\n2. Hover Provider test: Change symbol kind from 'function' to 'method' to match PikeSymbolKind type definition",
          "timestamp": "2026-02-01T21:23:51+01:00",
          "tree_id": "41ea827c82f1d65c6ac22bcf90a7eec51f5db064",
          "url": "https://github.com/TheSmuks/pike-lsp/commit/a9e143b7b7871675eb1a839d52770241460690be"
        },
        "date": 1769977546858,
        "tool": "customSmallerIsBetter",
        "benches": [
          {
            "name": "PikeBridge.start() [Cold Start]",
            "value": 201.365694,
            "unit": "ms"
          },
          {
            "name": "PikeBridge.start() with detailed metrics [Cold Start]",
            "value": 251.63442883333335,
            "unit": "ms"
          },
          {
            "name": "Cold Start + First Request (getVersionInfo)",
            "value": 251.42052508333333,
            "unit": "ms"
          },
          {
            "name": "Cold Start + Introspect",
            "value": 256.2863995,
            "unit": "ms"
          },
          {
            "name": "Validation: Small File (~15 lines)",
            "value": 1.0587660276497695,
            "unit": "ms"
          },
          {
            "name": "Validation: Medium File (~100 lines)",
            "value": 3.5501136701030926,
            "unit": "ms"
          },
          {
            "name": "Validation: Large File (~1000 lines)",
            "value": 43.92906776923077,
            "unit": "ms"
          },
          {
            "name": "Validation Legacy (3 calls: analyze + parse + analyzeUninitialized)",
            "value": 4.702367952054795,
            "unit": "ms"
          },
          {
            "name": "Validation Consolidated (1 call: analyze with all includes)",
            "value": 3.510036520408163,
            "unit": "ms"
          },
          {
            "name": "Cache Hit: analyze with same document version",
            "value": 0.15958586868434216,
            "unit": "ms"
          },
          {
            "name": "Cache Miss: analyze with different version",
            "value": 0.1520229766053951,
            "unit": "ms"
          },
          {
            "name": "Closed File: analyze without version (stat-based key)",
            "value": 0.40670579036144583,
            "unit": "ms"
          },
          {
            "name": "Cross-file: compile main with inherited utils",
            "value": 0.18021658555774095,
            "unit": "ms"
          },
          {
            "name": "Cross-file: recompile main (cache hit)",
            "value": 0.17294418280444807,
            "unit": "ms"
          },
          {
            "name": "resolveStdlib(\"Stdio\") - warm",
            "value": 0.4048751523178808,
            "unit": "ms"
          },
          {
            "name": "resolveStdlib(\"String\")",
            "value": 0.26653429532634976,
            "unit": "ms"
          },
          {
            "name": "resolveStdlib(\"Array\")",
            "value": 0.34578087977296185,
            "unit": "ms"
          },
          {
            "name": "resolveStdlib(\"Mapping\")",
            "value": 0.0972369685443749,
            "unit": "ms"
          },
          {
            "name": "resolveStdlib(\"Stdio.File\") - nested",
            "value": 0.5802535170357751,
            "unit": "ms"
          },
          {
            "name": "resolveStdlib(\"String.SplitIterator\") - nested",
            "value": 0.08041472350293276,
            "unit": "ms"
          },
          {
            "name": "First diagnostic after document change",
            "value": 0.1644044831921991,
            "unit": "ms"
          },
          {
            "name": "Validation with 250ms debounce (default)",
            "value": 250.81842283333333,
            "unit": "ms"
          },
          {
            "name": "Rapid edit simulation (debounce coalescing)",
            "value": 252.80444408333335,
            "unit": "ms"
          },
          {
            "name": "Hover: resolveStdlib(\"Stdio.File\")",
            "value": 0.5493038821630347,
            "unit": "ms"
          },
          {
            "name": "Hover: resolveModule(\"Stdio.File\")",
            "value": 0.07806620093023256,
            "unit": "ms"
          },
          {
            "name": "Completion: getCompletionContext (Large File, Warm Cache)",
            "value": 9.953217417910448,
            "unit": "ms"
          },
          {
            "name": "Completion: getCompletionContext (Large File, Cold Cache)",
            "value": 9.878695485294118,
            "unit": "ms"
          }
        ]
      },
      {
        "commit": {
          "author": {
            "email": "therealsmuks@gmail.com",
            "name": "TheSmuks",
            "username": "TheSmuks"
          },
          "committer": {
            "email": "therealsmuks@gmail.com",
            "name": "TheSmuks",
            "username": "TheSmuks"
          },
          "distinct": true,
          "id": "363fa918e18ccf48d1104f3af7e811d602f6ad81",
          "message": "fix: correct smoke test path in CI workflow\n\nChanged from ./dist/tests/smoke.test.js to ./src/tests/smoke.test.ts\nbecause *.test.ts files are excluded from TypeScript compilation.\n\nThe tsconfig excludes \"src/tests/**/*.test.ts\" but includes\n\"src/tests/**/*-tests.ts\" files.",
          "timestamp": "2026-02-01T21:28:22+01:00",
          "tree_id": "67ff7211867d8b86a4c91d5d19b19c183c64c9c6",
          "url": "https://github.com/TheSmuks/pike-lsp/commit/363fa918e18ccf48d1104f3af7e811d602f6ad81"
        },
        "date": 1769977824896,
        "tool": "customSmallerIsBetter",
        "benches": [
          {
            "name": "PikeBridge.start() [Cold Start]",
            "value": 202.923045,
            "unit": "ms"
          },
          {
            "name": "PikeBridge.start() with detailed metrics [Cold Start]",
            "value": 247.77191541666664,
            "unit": "ms"
          },
          {
            "name": "Cold Start + First Request (getVersionInfo)",
            "value": 248.57047166666666,
            "unit": "ms"
          },
          {
            "name": "Cold Start + Introspect",
            "value": 251.94141658333334,
            "unit": "ms"
          },
          {
            "name": "Validation: Small File (~15 lines)",
            "value": 0.9491572626538988,
            "unit": "ms"
          },
          {
            "name": "Validation: Medium File (~100 lines)",
            "value": 3.32162675,
            "unit": "ms"
          },
          {
            "name": "Validation: Large File (~1000 lines)",
            "value": 39.13526971428572,
            "unit": "ms"
          },
          {
            "name": "Validation Legacy (3 calls: analyze + parse + analyzeUninitialized)",
            "value": 4.187751115853659,
            "unit": "ms"
          },
          {
            "name": "Validation Consolidated (1 call: analyze with all includes)",
            "value": 3.2251474392523365,
            "unit": "ms"
          },
          {
            "name": "Cache Hit: analyze with same document version",
            "value": 0.12895602376777712,
            "unit": "ms"
          },
          {
            "name": "Cache Miss: analyze with different version",
            "value": 0.13619917198107387,
            "unit": "ms"
          },
          {
            "name": "Closed File: analyze without version (stat-based key)",
            "value": 0.3836698327721661,
            "unit": "ms"
          },
          {
            "name": "Cross-file: compile main with inherited utils",
            "value": 0.15442580458412097,
            "unit": "ms"
          },
          {
            "name": "Cross-file: recompile main (cache hit)",
            "value": 0.13930213194004645,
            "unit": "ms"
          },
          {
            "name": "resolveStdlib(\"Stdio\") - warm",
            "value": 0.35456312157268494,
            "unit": "ms"
          },
          {
            "name": "resolveStdlib(\"String\")",
            "value": 0.251514493135436,
            "unit": "ms"
          },
          {
            "name": "resolveStdlib(\"Array\")",
            "value": 0.32411440608654307,
            "unit": "ms"
          },
          {
            "name": "resolveStdlib(\"Mapping\")",
            "value": 0.08015923502304148,
            "unit": "ms"
          },
          {
            "name": "resolveStdlib(\"Stdio.File\") - nested",
            "value": 0.5538951762328214,
            "unit": "ms"
          },
          {
            "name": "resolveStdlib(\"String.SplitIterator\") - nested",
            "value": 0.05545649839274088,
            "unit": "ms"
          },
          {
            "name": "First diagnostic after document change",
            "value": 0.14504256908613905,
            "unit": "ms"
          },
          {
            "name": "Validation with 250ms debounce (default)",
            "value": 251.00636241666666,
            "unit": "ms"
          },
          {
            "name": "Rapid edit simulation (debounce coalescing)",
            "value": 254.98500308333334,
            "unit": "ms"
          },
          {
            "name": "Hover: resolveStdlib(\"Stdio.File\")",
            "value": 0.5414304004739336,
            "unit": "ms"
          },
          {
            "name": "Hover: resolveModule(\"Stdio.File\")",
            "value": 0.05677186100260417,
            "unit": "ms"
          },
          {
            "name": "Completion: getCompletionContext (Large File, Warm Cache)",
            "value": 8.973322706666668,
            "unit": "ms"
          },
          {
            "name": "Completion: getCompletionContext (Large File, Cold Cache)",
            "value": 9.0408155,
            "unit": "ms"
          }
        ]
      },
      {
        "commit": {
          "author": {
            "email": "therealsmuks@gmail.com",
            "name": "TheSmuks",
            "username": "TheSmuks"
          },
          "committer": {
            "email": "therealsmuks@gmail.com",
            "name": "TheSmuks",
            "username": "TheSmuks"
          },
          "distinct": true,
          "id": "62dad236543164eee7a81f2a07297ee7efd1cc46",
          "message": "fix: handle import.meta.url in bundled CJS code\n\nWhen the LSP server is bundled with esbuild to CJS format, import.meta.url\ndoesn't work correctly. This fix makes the PikeBridge constructor skip the\npike-scripts directory search when analyzerPath is explicitly provided via\ninitialization options.\n\nChanges:\n- bridge.ts: Skip auto-detection when analyzerPath is provided\n- bridge.ts: Handle both ESM (import.meta.url) and CJS (__filename) modes\n- server.ts: Add logging for analyzer path resolution\n- Fixes CI failures where bundled server couldn't find pike-scripts",
          "timestamp": "2026-02-01T21:47:08+01:00",
          "tree_id": "da82a2fb5aefe808e8db8302de76817c88156aeb",
          "url": "https://github.com/TheSmuks/pike-lsp/commit/62dad236543164eee7a81f2a07297ee7efd1cc46"
        },
        "date": 1769978946191,
        "tool": "customSmallerIsBetter",
        "benches": [
          {
            "name": "PikeBridge.start() [Cold Start]",
            "value": 201.98170375,
            "unit": "ms"
          },
          {
            "name": "PikeBridge.start() with detailed metrics [Cold Start]",
            "value": 252.44430858333334,
            "unit": "ms"
          },
          {
            "name": "Cold Start + First Request (getVersionInfo)",
            "value": 253.14353816666664,
            "unit": "ms"
          },
          {
            "name": "Cold Start + Introspect",
            "value": 257.04757275,
            "unit": "ms"
          },
          {
            "name": "Validation: Small File (~15 lines)",
            "value": 1.1028767163461537,
            "unit": "ms"
          },
          {
            "name": "Validation: Medium File (~100 lines)",
            "value": 3.556494164948454,
            "unit": "ms"
          },
          {
            "name": "Validation: Large File (~1000 lines)",
            "value": 44.194067583333336,
            "unit": "ms"
          },
          {
            "name": "Validation Legacy (3 calls: analyze + parse + analyzeUninitialized)",
            "value": 4.55363236,
            "unit": "ms"
          },
          {
            "name": "Validation Consolidated (1 call: analyze with all includes)",
            "value": 3.5306935487179487,
            "unit": "ms"
          },
          {
            "name": "Cache Hit: analyze with same document version",
            "value": 0.17632720644095787,
            "unit": "ms"
          },
          {
            "name": "Cache Miss: analyze with different version",
            "value": 0.1656843654045643,
            "unit": "ms"
          },
          {
            "name": "Closed File: analyze without version (stat-based key)",
            "value": 0.4089601920048455,
            "unit": "ms"
          },
          {
            "name": "Cross-file: compile main with inherited utils",
            "value": 0.18894968439612106,
            "unit": "ms"
          },
          {
            "name": "Cross-file: recompile main (cache hit)",
            "value": 0.1854020238510762,
            "unit": "ms"
          },
          {
            "name": "resolveStdlib(\"Stdio\") - warm",
            "value": 0.416059087708462,
            "unit": "ms"
          },
          {
            "name": "resolveStdlib(\"String\")",
            "value": 0.2643454318272691,
            "unit": "ms"
          },
          {
            "name": "resolveStdlib(\"Array\")",
            "value": 0.38725413394919167,
            "unit": "ms"
          },
          {
            "name": "resolveStdlib(\"Mapping\")",
            "value": 0.1037080860160109,
            "unit": "ms"
          },
          {
            "name": "resolveStdlib(\"Stdio.File\") - nested",
            "value": 0.5534152504065041,
            "unit": "ms"
          },
          {
            "name": "resolveStdlib(\"String.SplitIterator\") - nested",
            "value": 0.08776098269230768,
            "unit": "ms"
          },
          {
            "name": "First diagnostic after document change",
            "value": 0.17961301814122244,
            "unit": "ms"
          },
          {
            "name": "Validation with 250ms debounce (default)",
            "value": 250.82831758333333,
            "unit": "ms"
          },
          {
            "name": "Rapid edit simulation (debounce coalescing)",
            "value": 253.35200716666665,
            "unit": "ms"
          },
          {
            "name": "Hover: resolveStdlib(\"Stdio.File\")",
            "value": 0.5718073495798319,
            "unit": "ms"
          },
          {
            "name": "Hover: resolveModule(\"Stdio.File\")",
            "value": 0.08500328069420539,
            "unit": "ms"
          },
          {
            "name": "Completion: getCompletionContext (Large File, Warm Cache)",
            "value": 9.866989147058824,
            "unit": "ms"
          },
          {
            "name": "Completion: getCompletionContext (Large File, Cold Cache)",
            "value": 9.815955176470588,
            "unit": "ms"
          }
        ]
      },
      {
        "commit": {
          "author": {
            "email": "therealsmuks@gmail.com",
            "name": "TheSmuks",
            "username": "TheSmuks"
          },
          "committer": {
            "email": "therealsmuks@gmail.com",
            "name": "TheSmuks",
            "username": "TheSmuks"
          },
          "distinct": true,
          "id": "2d8a3a0d2994ff9fe400804aad9a2d107985a64b",
          "message": "test: update ESM compatibility test to check source code\n\nThe previous test checked for __filename in the bundled server code,\nbut esbuild minifies and transforms the code, making this unreliable.\n\nThe new test:\n- Checks that the bundled server accepts analyzerPath from init options\n- Verifies the source code uses import.meta.url (not __filename)\n- Focuses on functionality rather than implementation details",
          "timestamp": "2026-02-01T21:54:47+01:00",
          "tree_id": "0e38465f72d3b057141c176f80abf2441a218b45",
          "url": "https://github.com/TheSmuks/pike-lsp/commit/2d8a3a0d2994ff9fe400804aad9a2d107985a64b"
        },
        "date": 1769979410619,
        "tool": "customSmallerIsBetter",
        "benches": [
          {
            "name": "PikeBridge.start() [Cold Start]",
            "value": 202.832622,
            "unit": "ms"
          },
          {
            "name": "PikeBridge.start() with detailed metrics [Cold Start]",
            "value": 252.84972933333336,
            "unit": "ms"
          },
          {
            "name": "Cold Start + First Request (getVersionInfo)",
            "value": 252.97697816666667,
            "unit": "ms"
          },
          {
            "name": "Cold Start + Introspect",
            "value": 257.79353725,
            "unit": "ms"
          },
          {
            "name": "Validation: Small File (~15 lines)",
            "value": 1.108988072463768,
            "unit": "ms"
          },
          {
            "name": "Validation: Medium File (~100 lines)",
            "value": 3.5944847905759163,
            "unit": "ms"
          },
          {
            "name": "Validation: Large File (~1000 lines)",
            "value": 44.460501916666665,
            "unit": "ms"
          },
          {
            "name": "Validation Legacy (3 calls: analyze + parse + analyzeUninitialized)",
            "value": 4.616504722972973,
            "unit": "ms"
          },
          {
            "name": "Validation Consolidated (1 call: analyze with all includes)",
            "value": 3.5695371927083337,
            "unit": "ms"
          },
          {
            "name": "Cache Hit: analyze with same document version",
            "value": 0.16666547302580142,
            "unit": "ms"
          },
          {
            "name": "Cache Miss: analyze with different version",
            "value": 0.17312586235803135,
            "unit": "ms"
          },
          {
            "name": "Closed File: analyze without version (stat-based key)",
            "value": 0.4473389066225166,
            "unit": "ms"
          },
          {
            "name": "Cross-file: compile main with inherited utils",
            "value": 0.19709533608815427,
            "unit": "ms"
          },
          {
            "name": "Cross-file: recompile main (cache hit)",
            "value": 0.19276977217496963,
            "unit": "ms"
          },
          {
            "name": "resolveStdlib(\"Stdio\") - warm",
            "value": 0.4172366592455164,
            "unit": "ms"
          },
          {
            "name": "resolveStdlib(\"String\")",
            "value": 0.2755811733887734,
            "unit": "ms"
          },
          {
            "name": "resolveStdlib(\"Array\")",
            "value": 0.3560006153028693,
            "unit": "ms"
          },
          {
            "name": "resolveStdlib(\"Mapping\")",
            "value": 0.10225405318074723,
            "unit": "ms"
          },
          {
            "name": "resolveStdlib(\"Stdio.File\") - nested",
            "value": 0.6018902689594356,
            "unit": "ms"
          },
          {
            "name": "resolveStdlib(\"String.SplitIterator\") - nested",
            "value": 0.08822124881093936,
            "unit": "ms"
          },
          {
            "name": "First diagnostic after document change",
            "value": 0.19056900324675324,
            "unit": "ms"
          },
          {
            "name": "Validation with 250ms debounce (default)",
            "value": 250.90637008333334,
            "unit": "ms"
          },
          {
            "name": "Rapid edit simulation (debounce coalescing)",
            "value": 254.91282775,
            "unit": "ms"
          },
          {
            "name": "Hover: resolveStdlib(\"Stdio.File\")",
            "value": 0.5668833022481266,
            "unit": "ms"
          },
          {
            "name": "Hover: resolveModule(\"Stdio.File\")",
            "value": 0.08041822364478345,
            "unit": "ms"
          },
          {
            "name": "Completion: getCompletionContext (Large File, Warm Cache)",
            "value": 9.883277838235294,
            "unit": "ms"
          },
          {
            "name": "Completion: getCompletionContext (Large File, Cold Cache)",
            "value": 9.77712875,
            "unit": "ms"
          }
        ]
      },
      {
        "commit": {
          "author": {
            "email": "therealsmuks@gmail.com",
            "name": "TheSmuks",
            "username": "TheSmuks"
          },
          "committer": {
            "email": "therealsmuks@gmail.com",
            "name": "TheSmuks",
            "username": "TheSmuks"
          },
          "distinct": true,
          "id": "c04d29a37a1e5a2af2fdf46dbfb009aacf7ad7e8",
          "message": "fix: use proportional threshold for benchmark regression detection\n\nThe flat 0.5ms minAbsDiff for fast benchmarks (<10ms) was too tight,\ncausing false positive regressions from CI runner timing variance.\nUse Math.max(0.5, avg * 0.15) so the threshold scales with benchmark\nsize while keeping a 0.5ms floor for sub-millisecond benchmarks.",
          "timestamp": "2026-02-01T22:05:32+01:00",
          "tree_id": "0fa283b0d496a1f8efa00bdd11888b9aecb13e4b",
          "url": "https://github.com/TheSmuks/pike-lsp/commit/c04d29a37a1e5a2af2fdf46dbfb009aacf7ad7e8"
        },
        "date": 1769980068719,
        "tool": "customSmallerIsBetter",
        "benches": [
          {
            "name": "PikeBridge.start() [Cold Start]",
            "value": 201.11780683333333,
            "unit": "ms"
          },
          {
            "name": "PikeBridge.start() with detailed metrics [Cold Start]",
            "value": 250.69080966666667,
            "unit": "ms"
          },
          {
            "name": "Cold Start + First Request (getVersionInfo)",
            "value": 251.24360933333335,
            "unit": "ms"
          },
          {
            "name": "Cold Start + Introspect",
            "value": 254.89724875,
            "unit": "ms"
          },
          {
            "name": "Validation: Small File (~15 lines)",
            "value": 1.1007002731629394,
            "unit": "ms"
          },
          {
            "name": "Validation: Medium File (~100 lines)",
            "value": 3.5994119790575914,
            "unit": "ms"
          },
          {
            "name": "Validation: Large File (~1000 lines)",
            "value": 43.41747907692308,
            "unit": "ms"
          },
          {
            "name": "Validation Legacy (3 calls: analyze + parse + analyzeUninitialized)",
            "value": 4.710325634482759,
            "unit": "ms"
          },
          {
            "name": "Validation Consolidated (1 call: analyze with all includes)",
            "value": 3.5638050932642487,
            "unit": "ms"
          },
          {
            "name": "Cache Hit: analyze with same document version",
            "value": 0.17083702081665333,
            "unit": "ms"
          },
          {
            "name": "Cache Miss: analyze with different version",
            "value": 0.16969730551139375,
            "unit": "ms"
          },
          {
            "name": "Closed File: analyze without version (stat-based key)",
            "value": 0.4174501619283066,
            "unit": "ms"
          },
          {
            "name": "Cross-file: compile main with inherited utils",
            "value": 0.18452838163558105,
            "unit": "ms"
          },
          {
            "name": "Cross-file: recompile main (cache hit)",
            "value": 0.19517521118581907,
            "unit": "ms"
          },
          {
            "name": "resolveStdlib(\"Stdio\") - warm",
            "value": 0.41371274462860647,
            "unit": "ms"
          },
          {
            "name": "resolveStdlib(\"String\")",
            "value": 0.2597633012946253,
            "unit": "ms"
          },
          {
            "name": "resolveStdlib(\"Array\")",
            "value": 0.37046558319513545,
            "unit": "ms"
          },
          {
            "name": "resolveStdlib(\"Mapping\")",
            "value": 0.0960756803993028,
            "unit": "ms"
          },
          {
            "name": "resolveStdlib(\"Stdio.File\") - nested",
            "value": 0.5466192784911718,
            "unit": "ms"
          },
          {
            "name": "resolveStdlib(\"String.SplitIterator\") - nested",
            "value": 0.08372366930469191,
            "unit": "ms"
          },
          {
            "name": "First diagnostic after document change",
            "value": 0.17025058976398832,
            "unit": "ms"
          },
          {
            "name": "Validation with 250ms debounce (default)",
            "value": 250.48822233333334,
            "unit": "ms"
          },
          {
            "name": "Rapid edit simulation (debounce coalescing)",
            "value": 253.96491966666665,
            "unit": "ms"
          },
          {
            "name": "Hover: resolveStdlib(\"Stdio.File\")",
            "value": 0.546294974317817,
            "unit": "ms"
          },
          {
            "name": "Hover: resolveModule(\"Stdio.File\")",
            "value": 0.08009659025515745,
            "unit": "ms"
          },
          {
            "name": "Completion: getCompletionContext (Large File, Warm Cache)",
            "value": 9.902542731343285,
            "unit": "ms"
          },
          {
            "name": "Completion: getCompletionContext (Large File, Cold Cache)",
            "value": 9.853744014705882,
            "unit": "ms"
          }
        ]
      },
      {
        "commit": {
          "author": {
            "email": "therealsmuks@gmail.com",
            "name": "TheSmuks",
            "username": "TheSmuks"
          },
          "committer": {
            "email": "therealsmuks@gmail.com",
            "name": "TheSmuks",
            "username": "TheSmuks"
          },
          "distinct": true,
          "id": "a3a61233f0398d2c291e9aafe9b34fc7b335c78d",
          "message": "docs: enforce TDD workflow in project guidelines\n\nAdd mandatory test-driven development section to CLAUDE.md with\nRED/GREEN/REFACTOR workflow, per-package test commands, test file\nplacement conventions, and bug fix TDD process.",
          "timestamp": "2026-02-01T22:16:45+01:00",
          "tree_id": "e022652c8a5b5ec8999ab1c46130a11862d0f6ba",
          "url": "https://github.com/TheSmuks/pike-lsp/commit/a3a61233f0398d2c291e9aafe9b34fc7b335c78d"
        },
        "date": 1769980736222,
        "tool": "customSmallerIsBetter",
        "benches": [
          {
            "name": "PikeBridge.start() [Cold Start]",
            "value": 201.79319658333335,
            "unit": "ms"
          },
          {
            "name": "PikeBridge.start() with detailed metrics [Cold Start]",
            "value": 252.65461475,
            "unit": "ms"
          },
          {
            "name": "Cold Start + First Request (getVersionInfo)",
            "value": 250.9541865,
            "unit": "ms"
          },
          {
            "name": "Cold Start + Introspect",
            "value": 255.69634483333334,
            "unit": "ms"
          },
          {
            "name": "Validation: Small File (~15 lines)",
            "value": 1.0812612119309262,
            "unit": "ms"
          },
          {
            "name": "Validation: Medium File (~100 lines)",
            "value": 3.6154841263157893,
            "unit": "ms"
          },
          {
            "name": "Validation: Large File (~1000 lines)",
            "value": 43.43935361538462,
            "unit": "ms"
          },
          {
            "name": "Validation Legacy (3 calls: analyze + parse + analyzeUninitialized)",
            "value": 4.595684637583893,
            "unit": "ms"
          },
          {
            "name": "Validation Consolidated (1 call: analyze with all includes)",
            "value": 3.5808648020833336,
            "unit": "ms"
          },
          {
            "name": "Cache Hit: analyze with same document version",
            "value": 0.16256944319918493,
            "unit": "ms"
          },
          {
            "name": "Cache Miss: analyze with different version",
            "value": 0.15904891774675972,
            "unit": "ms"
          },
          {
            "name": "Closed File: analyze without version (stat-based key)",
            "value": 0.4085304552599758,
            "unit": "ms"
          },
          {
            "name": "Cross-file: compile main with inherited utils",
            "value": 0.196096892519084,
            "unit": "ms"
          },
          {
            "name": "Cross-file: recompile main (cache hit)",
            "value": 0.18517042054992763,
            "unit": "ms"
          },
          {
            "name": "resolveStdlib(\"Stdio\") - warm",
            "value": 0.4189492495332918,
            "unit": "ms"
          },
          {
            "name": "resolveStdlib(\"String\")",
            "value": 0.27283592051070843,
            "unit": "ms"
          },
          {
            "name": "resolveStdlib(\"Array\")",
            "value": 0.34732530383022775,
            "unit": "ms"
          },
          {
            "name": "resolveStdlib(\"Mapping\")",
            "value": 0.09948136125654451,
            "unit": "ms"
          },
          {
            "name": "resolveStdlib(\"Stdio.File\") - nested",
            "value": 0.5486220338436745,
            "unit": "ms"
          },
          {
            "name": "resolveStdlib(\"String.SplitIterator\") - nested",
            "value": 0.06652144303385417,
            "unit": "ms"
          },
          {
            "name": "First diagnostic after document change",
            "value": 0.15690055536501715,
            "unit": "ms"
          },
          {
            "name": "Validation with 250ms debounce (default)",
            "value": 250.168294,
            "unit": "ms"
          },
          {
            "name": "Rapid edit simulation (debounce coalescing)",
            "value": 252.64599766666666,
            "unit": "ms"
          },
          {
            "name": "Hover: resolveStdlib(\"Stdio.File\")",
            "value": 0.5352336999214454,
            "unit": "ms"
          },
          {
            "name": "Hover: resolveModule(\"Stdio.File\")",
            "value": 0.07725524011559175,
            "unit": "ms"
          },
          {
            "name": "Completion: getCompletionContext (Large File, Warm Cache)",
            "value": 9.74622956521739,
            "unit": "ms"
          },
          {
            "name": "Completion: getCompletionContext (Large File, Cold Cache)",
            "value": 9.688970811594203,
            "unit": "ms"
          }
        ]
      },
      {
        "commit": {
          "author": {
            "email": "therealsmuks@gmail.com",
            "name": "TheSmuks",
            "username": "TheSmuks"
          },
          "committer": {
            "email": "therealsmuks@gmail.com",
            "name": "TheSmuks",
            "username": "TheSmuks"
          },
          "distinct": true,
          "id": "91d2c5ddaaa4ee871d3fe1cc81fa055b2e6e76cd",
          "message": "chore: bump version to 0.1.0-alpha.13 and cleanup repo\n\nVersion: 0.1.0-alpha.12 → 0.1.0-alpha.13\n\nCleanup:\n- Remove .beads/ directory (claude-mem artifacts)\n- Remove .cleanup-status.json (cleanup script state)\n- Remove gsd/CLAUDE.md (get-shit-done planning artifacts)\n- Remove TDD-IMPLEMENTATION-PROGRESS.md (temporary planning doc)\n- Remove CLEANUP_INVENTORY.md, CLEANUP_REPORT.md (cleanup artifacts)\n- Remove PIKE_DEPENDENCIES.json, PIKE_DEPENDENCIES_SUMMARY.md (temporary analysis)\n- Remove TS_DEPENDENCIES.json (temporary analysis)\n- Remove benchmark-summary.json (unused, benchmark-results.json is used)\n- Remove pike-development.skill (skill artifact)\n\nFeatures (CHANGELOG):\n- Smart Completion E2E tests\n- TDD coverage (100% for smart completion)\n- Benchmark regression detection improvements (2ms floor for fast benchmarks)\n- Phase 1-10 TDD test suites (550+ tests)\n- Navigation features with TDD tests\n- Include resolution (#include directives)",
          "timestamp": "2026-02-01T23:18:28+01:00",
          "tree_id": "e08a363eea4d98fee1c719be9f4ca0f597b50e6c",
          "url": "https://github.com/TheSmuks/pike-lsp/commit/91d2c5ddaaa4ee871d3fe1cc81fa055b2e6e76cd"
        },
        "date": 1769984429268,
        "tool": "customSmallerIsBetter",
        "benches": [
          {
            "name": "PikeBridge.start() [Cold Start]",
            "value": 202.22419325,
            "unit": "ms"
          },
          {
            "name": "PikeBridge.start() with detailed metrics [Cold Start]",
            "value": 250.92507325,
            "unit": "ms"
          },
          {
            "name": "Cold Start + First Request (getVersionInfo)",
            "value": 252.90040566666664,
            "unit": "ms"
          },
          {
            "name": "Cold Start + Introspect",
            "value": 255.69072241666666,
            "unit": "ms"
          },
          {
            "name": "Validation: Small File (~15 lines)",
            "value": 1.1089297971014491,
            "unit": "ms"
          },
          {
            "name": "Validation: Medium File (~100 lines)",
            "value": 3.7330015760869566,
            "unit": "ms"
          },
          {
            "name": "Validation: Large File (~1000 lines)",
            "value": 46.8074915,
            "unit": "ms"
          },
          {
            "name": "Validation Legacy (3 calls: analyze + parse + analyzeUninitialized)",
            "value": 4.745678951388889,
            "unit": "ms"
          },
          {
            "name": "Validation Consolidated (1 call: analyze with all includes)",
            "value": 3.708725102702703,
            "unit": "ms"
          },
          {
            "name": "Cache Hit: analyze with same document version",
            "value": 0.24989000114111828,
            "unit": "ms"
          },
          {
            "name": "Cache Miss: analyze with different version",
            "value": 0.23973597880891487,
            "unit": "ms"
          },
          {
            "name": "Closed File: analyze without version (stat-based key)",
            "value": 0.4985521622613803,
            "unit": "ms"
          },
          {
            "name": "Cross-file: compile main with inherited utils",
            "value": 0.19909870309597524,
            "unit": "ms"
          },
          {
            "name": "Cross-file: recompile main (cache hit)",
            "value": 0.18493462966175195,
            "unit": "ms"
          },
          {
            "name": "resolveStdlib(\"Stdio\") - warm",
            "value": 1.6316455402843604,
            "unit": "ms"
          },
          {
            "name": "resolveStdlib(\"String\")",
            "value": 0.3748249977666108,
            "unit": "ms"
          },
          {
            "name": "resolveStdlib(\"Array\")",
            "value": 0.3602610627682403,
            "unit": "ms"
          },
          {
            "name": "resolveStdlib(\"Mapping\")",
            "value": 0.09887547238964,
            "unit": "ms"
          },
          {
            "name": "resolveStdlib(\"Stdio.File\") - nested",
            "value": 0.5963818618881119,
            "unit": "ms"
          },
          {
            "name": "resolveStdlib(\"String.SplitIterator\") - nested",
            "value": 0.08292722424756252,
            "unit": "ms"
          },
          {
            "name": "First diagnostic after document change",
            "value": 0.3233193110140708,
            "unit": "ms"
          },
          {
            "name": "Validation with 250ms debounce (default)",
            "value": 250.90727516666666,
            "unit": "ms"
          },
          {
            "name": "Rapid edit simulation (debounce coalescing)",
            "value": 254.9439,
            "unit": "ms"
          },
          {
            "name": "Hover: resolveStdlib(\"Stdio.File\")",
            "value": 0.5527639951377633,
            "unit": "ms"
          },
          {
            "name": "Hover: resolveModule(\"Stdio.File\")",
            "value": 0.08142562713048337,
            "unit": "ms"
          },
          {
            "name": "Completion: getCompletionContext (Large File, Warm Cache)",
            "value": 9.962880820895522,
            "unit": "ms"
          },
          {
            "name": "Completion: getCompletionContext (Large File, Cold Cache)",
            "value": 9.961234208955224,
            "unit": "ms"
          }
        ]
      },
      {
        "commit": {
          "author": {
            "email": "therealsmuks@gmail.com",
            "name": "TheSmuks",
            "username": "TheSmuks"
          },
          "committer": {
            "email": "therealsmuks@gmail.com",
            "name": "TheSmuks",
            "username": "TheSmuks"
          },
          "distinct": true,
          "id": "ba16793d306f5fc6bcf9f8628ae14f37dac7457e",
          "message": "fix: suppress esbuild import.meta warnings when bundling to CJS\n\n- Add CJS fallback check in pike-bridge (same as pike-lsp-server)\n- Add --define:import.meta.url='undefined' to esbuild in bundle-server.sh\n- Eliminates warnings about import.meta not being available in CJS format\n\nThe code already checks for __filename (CJS mode) before falling back\nto import.meta.url (ESM mode), so defining import.meta.url as\nundefined during the CJS build doesn't affect functionality.",
          "timestamp": "2026-02-01T23:23:38+01:00",
          "tree_id": "e592bedb0b8eff294b3413dd32c3208d19537e43",
          "url": "https://github.com/TheSmuks/pike-lsp/commit/ba16793d306f5fc6bcf9f8628ae14f37dac7457e"
        },
        "date": 1769984741589,
        "tool": "customSmallerIsBetter",
        "benches": [
          {
            "name": "PikeBridge.start() [Cold Start]",
            "value": 201.55592566666667,
            "unit": "ms"
          },
          {
            "name": "PikeBridge.start() with detailed metrics [Cold Start]",
            "value": 251.35253258333336,
            "unit": "ms"
          },
          {
            "name": "Cold Start + First Request (getVersionInfo)",
            "value": 249.97019458333335,
            "unit": "ms"
          },
          {
            "name": "Cold Start + Introspect",
            "value": 255.42032766666665,
            "unit": "ms"
          },
          {
            "name": "Validation: Small File (~15 lines)",
            "value": 1.1441456179401994,
            "unit": "ms"
          },
          {
            "name": "Validation: Medium File (~100 lines)",
            "value": 3.7278676432432434,
            "unit": "ms"
          },
          {
            "name": "Validation: Large File (~1000 lines)",
            "value": 46.58285516666666,
            "unit": "ms"
          },
          {
            "name": "Validation Legacy (3 calls: analyze + parse + analyzeUninitialized)",
            "value": 4.7635163356643355,
            "unit": "ms"
          },
          {
            "name": "Validation Consolidated (1 call: analyze with all includes)",
            "value": 3.698559059139785,
            "unit": "ms"
          },
          {
            "name": "Cache Hit: analyze with same document version",
            "value": 0.23454563974267334,
            "unit": "ms"
          },
          {
            "name": "Cache Miss: analyze with different version",
            "value": 0.23748278646398843,
            "unit": "ms"
          },
          {
            "name": "Closed File: analyze without version (stat-based key)",
            "value": 0.5167589832572298,
            "unit": "ms"
          },
          {
            "name": "Cross-file: compile main with inherited utils",
            "value": 0.20605703780839477,
            "unit": "ms"
          },
          {
            "name": "Cross-file: recompile main (cache hit)",
            "value": 0.18986261879274458,
            "unit": "ms"
          },
          {
            "name": "resolveStdlib(\"Stdio\") - warm",
            "value": 1.643240888095238,
            "unit": "ms"
          },
          {
            "name": "resolveStdlib(\"String\")",
            "value": 0.38715820552677027,
            "unit": "ms"
          },
          {
            "name": "resolveStdlib(\"Array\")",
            "value": 0.36462922922324825,
            "unit": "ms"
          },
          {
            "name": "resolveStdlib(\"Mapping\")",
            "value": 0.10744284682943966,
            "unit": "ms"
          },
          {
            "name": "resolveStdlib(\"Stdio.File\") - nested",
            "value": 0.642203597928437,
            "unit": "ms"
          },
          {
            "name": "resolveStdlib(\"String.SplitIterator\") - nested",
            "value": 0.08890349798777761,
            "unit": "ms"
          },
          {
            "name": "First diagnostic after document change",
            "value": 0.2989072569756976,
            "unit": "ms"
          },
          {
            "name": "Validation with 250ms debounce (default)",
            "value": 250.53941675,
            "unit": "ms"
          },
          {
            "name": "Rapid edit simulation (debounce coalescing)",
            "value": 253.47468433333336,
            "unit": "ms"
          },
          {
            "name": "Hover: resolveStdlib(\"Stdio.File\")",
            "value": 0.5850650678111589,
            "unit": "ms"
          },
          {
            "name": "Hover: resolveModule(\"Stdio.File\")",
            "value": 0.08046843287858117,
            "unit": "ms"
          },
          {
            "name": "Completion: getCompletionContext (Large File, Warm Cache)",
            "value": 9.846788897058824,
            "unit": "ms"
          },
          {
            "name": "Completion: getCompletionContext (Large File, Cold Cache)",
            "value": 9.798544220588235,
            "unit": "ms"
          }
        ]
      },
      {
        "commit": {
          "author": {
            "email": "therealsmuks@gmail.com",
            "name": "TheSmuks",
            "username": "TheSmuks"
          },
          "committer": {
            "email": "therealsmuks@gmail.com",
            "name": "TheSmuks",
            "username": "TheSmuks"
          },
          "distinct": true,
          "id": "0135fb70ca2d858eb830e1d9fe155b3c4d3d2126",
          "message": "fix: exclude definitions from reference counts and prioritize main signatures\n\nTDD implementation of two LSP fixes:\n\nPhase 1 - Reference Count Fix:\n- Modified buildSymbolPositionIndex in diagnostics.ts to track definition lines\n- Token-based, findOccurrences, and regex fallbacks all now exclude definitions\n- Unused functions now correctly show \"0 references\" instead of \"1 reference\"\n- Functions with N references show N instead of N+1\n\nPhase 2 - Hover Variant Prioritization:\n- Modified findSymbolInCollection in hover.ts to prioritize non-variant symbols\n- Hover now shows main function signatures first, variant signatures second\n- First pass searches for non-variant symbols, second pass falls back to variants\n\nTests:\n- Added reference-counting.test.ts (5 tests demonstrating bug/fix)\n- Added reference-counting-code-lens.test.ts (2 integration tests)\n- Added hover-variant-prioritization.test.ts (3 tests)\n- All 75 unit tests pass\n- All 40 E2E tests pass\n\nResolves: Reference count shows 1 instead of 0 for unused functions\nResolves: Hover shows variant instead of main documentation",
          "timestamp": "2026-02-01T23:52:05+01:00",
          "tree_id": "b370732c866668357c968e6f6b1452169a8d9b56",
          "url": "https://github.com/TheSmuks/pike-lsp/commit/0135fb70ca2d858eb830e1d9fe155b3c4d3d2126"
        },
        "date": 1769986464877,
        "tool": "customSmallerIsBetter",
        "benches": [
          {
            "name": "PikeBridge.start() [Cold Start]",
            "value": 201.21604258333335,
            "unit": "ms"
          },
          {
            "name": "PikeBridge.start() with detailed metrics [Cold Start]",
            "value": 251.0287965,
            "unit": "ms"
          },
          {
            "name": "Cold Start + First Request (getVersionInfo)",
            "value": 250.06885466666665,
            "unit": "ms"
          },
          {
            "name": "Cold Start + Introspect",
            "value": 255.76837408333336,
            "unit": "ms"
          },
          {
            "name": "Validation: Small File (~15 lines)",
            "value": 1.0831761556603774,
            "unit": "ms"
          },
          {
            "name": "Validation: Medium File (~100 lines)",
            "value": 3.739592304347826,
            "unit": "ms"
          },
          {
            "name": "Validation: Large File (~1000 lines)",
            "value": 47.39211345454545,
            "unit": "ms"
          },
          {
            "name": "Validation Legacy (3 calls: analyze + parse + analyzeUninitialized)",
            "value": 4.845441,
            "unit": "ms"
          },
          {
            "name": "Validation Consolidated (1 call: analyze with all includes)",
            "value": 3.6849791559139784,
            "unit": "ms"
          },
          {
            "name": "Cache Hit: analyze with same document version",
            "value": 0.23408760706638118,
            "unit": "ms"
          },
          {
            "name": "Cache Miss: analyze with different version",
            "value": 0.24843722823618472,
            "unit": "ms"
          },
          {
            "name": "Closed File: analyze without version (stat-based key)",
            "value": 0.507842743801653,
            "unit": "ms"
          },
          {
            "name": "Cross-file: compile main with inherited utils",
            "value": 0.20006027695625386,
            "unit": "ms"
          },
          {
            "name": "Cross-file: recompile main (cache hit)",
            "value": 0.18597072464191755,
            "unit": "ms"
          },
          {
            "name": "resolveStdlib(\"Stdio\") - warm",
            "value": 1.6625232548076923,
            "unit": "ms"
          },
          {
            "name": "resolveStdlib(\"String\")",
            "value": 0.37320935777777775,
            "unit": "ms"
          },
          {
            "name": "resolveStdlib(\"Array\")",
            "value": 0.3622763041599136,
            "unit": "ms"
          },
          {
            "name": "resolveStdlib(\"Mapping\")",
            "value": 0.10131064705882352,
            "unit": "ms"
          },
          {
            "name": "resolveStdlib(\"Stdio.File\") - nested",
            "value": 0.5623422824112304,
            "unit": "ms"
          },
          {
            "name": "resolveStdlib(\"String.SplitIterator\") - nested",
            "value": 0.08774649970059879,
            "unit": "ms"
          },
          {
            "name": "First diagnostic after document change",
            "value": 0.3070056132162661,
            "unit": "ms"
          },
          {
            "name": "Validation with 250ms debounce (default)",
            "value": 250.32065216666666,
            "unit": "ms"
          },
          {
            "name": "Rapid edit simulation (debounce coalescing)",
            "value": 255.112193,
            "unit": "ms"
          },
          {
            "name": "Hover: resolveStdlib(\"Stdio.File\")",
            "value": 0.5715488933669185,
            "unit": "ms"
          },
          {
            "name": "Hover: resolveModule(\"Stdio.File\")",
            "value": 0.08204678489098735,
            "unit": "ms"
          },
          {
            "name": "Completion: getCompletionContext (Large File, Warm Cache)",
            "value": 9.982060343283582,
            "unit": "ms"
          },
          {
            "name": "Completion: getCompletionContext (Large File, Cold Cache)",
            "value": 9.939656746268657,
            "unit": "ms"
          }
        ]
      },
      {
        "commit": {
          "author": {
            "email": "therealsmuks@gmail.com",
            "name": "TheSmuks",
            "username": "TheSmuks"
          },
          "committer": {
            "email": "therealsmuks@gmail.com",
            "name": "TheSmuks",
            "username": "TheSmuks"
          },
          "distinct": true,
          "id": "0e679e78bf25f7e3df3dcaf0732138def330cc64",
          "message": "refactor: consolidate duplicate code in Pike LSP modules\n\nConsolidate three duplicate code patterns to single implementations,\neliminating ~160 lines of redundant code while maintaining 100%\ntest coverage (42/42 E2E tests passing).\n\nChanges:\n- extract_autodoc_comments: Single implementation in Intelligence.module\n- get_char_position: Single implementation in Analysis.module\n- simple_parse_autodoc: Delegates to enhanced TypeAnalysis.parse_autodoc()\n\nEnhancements:\n- TypeAnalysis.parse_autodoc() now supports paramOrder tracking\n- TypeAnalysis.parse_autodoc() now supports @ignore/@endignore blocks\n- Complete AutoDoc documentation added to all consolidated functions\n\nFiles modified:\n- LSP.pmod/Parser.pike: -189 lines (removed duplicates)\n- LSP.pmod/Intelligence.pmod/TypeAnalysis.pike: Enhanced with paramOrder and @ignore support\n- LSP.pmod/Analysis.pmod/module.pmod: Renamed get_char_pos_in_line → get_char_position\n- LSP.pmod/Analysis.pmod/Completions.pike: Removed duplicate get_char_position\n- LSP.pmod/Analysis.pmod/Variables.pike: Removed dead code (get_char_position)\n- LSP.pmod/Analysis.pmod/Diagnostics.pike: Updated function references\n\nAll E2E tests pass: 42/42 passing (21s)",
          "timestamp": "2026-02-03T19:46:50+01:00",
          "tree_id": "91010ba416bd6e6e6968b32a736bc7d17dbb8230",
          "url": "https://github.com/TheSmuks/pike-lsp/commit/0e679e78bf25f7e3df3dcaf0732138def330cc64"
        },
        "date": 1770144529360,
        "tool": "customSmallerIsBetter",
        "benches": [
          {
            "name": "PikeBridge.start() [Cold Start]",
            "value": 201.26191358333335,
            "unit": "ms"
          },
          {
            "name": "PikeBridge.start() with detailed metrics [Cold Start]",
            "value": 249.02670116666667,
            "unit": "ms"
          },
          {
            "name": "Cold Start + First Request (getVersionInfo)",
            "value": 249.22286158333335,
            "unit": "ms"
          },
          {
            "name": "Cold Start + Introspect",
            "value": 254.42806316666665,
            "unit": "ms"
          },
          {
            "name": "Validation: Small File (~15 lines)",
            "value": 1.109958408064516,
            "unit": "ms"
          },
          {
            "name": "Validation: Medium File (~100 lines)",
            "value": 3.7226784239130435,
            "unit": "ms"
          },
          {
            "name": "Validation: Large File (~1000 lines)",
            "value": 47.45634436363637,
            "unit": "ms"
          },
          {
            "name": "Validation Legacy (3 calls: analyze + parse + analyzeUninitialized)",
            "value": 4.860641471428571,
            "unit": "ms"
          },
          {
            "name": "Validation Consolidated (1 call: analyze with all includes)",
            "value": 3.731260690217391,
            "unit": "ms"
          },
          {
            "name": "Cache Hit: analyze with same document version",
            "value": 0.2513232661321115,
            "unit": "ms"
          },
          {
            "name": "Cache Miss: analyze with different version",
            "value": 0.25354829187524064,
            "unit": "ms"
          },
          {
            "name": "Closed File: analyze without version (stat-based key)",
            "value": 0.5139165518546556,
            "unit": "ms"
          },
          {
            "name": "Cross-file: compile main with inherited utils",
            "value": 0.22083823699621083,
            "unit": "ms"
          },
          {
            "name": "Cross-file: recompile main (cache hit)",
            "value": 0.21145860236998024,
            "unit": "ms"
          },
          {
            "name": "resolveStdlib(\"Stdio\") - warm",
            "value": 1.8356503183023873,
            "unit": "ms"
          },
          {
            "name": "resolveStdlib(\"String\")",
            "value": 0.4018837268932618,
            "unit": "ms"
          },
          {
            "name": "resolveStdlib(\"Array\")",
            "value": 0.3875922553191489,
            "unit": "ms"
          },
          {
            "name": "resolveStdlib(\"Mapping\")",
            "value": 0.09720111805111822,
            "unit": "ms"
          },
          {
            "name": "resolveStdlib(\"Stdio.File\") - nested",
            "value": 0.6053769299645391,
            "unit": "ms"
          },
          {
            "name": "resolveStdlib(\"String.SplitIterator\") - nested",
            "value": 0.07980112800756961,
            "unit": "ms"
          },
          {
            "name": "First diagnostic after document change",
            "value": 0.3014822310140973,
            "unit": "ms"
          },
          {
            "name": "Validation with 250ms debounce (default)",
            "value": 251.0092195,
            "unit": "ms"
          },
          {
            "name": "Rapid edit simulation (debounce coalescing)",
            "value": 255.15173558333333,
            "unit": "ms"
          },
          {
            "name": "Hover: resolveStdlib(\"Stdio.File\")",
            "value": 0.6100926595174263,
            "unit": "ms"
          },
          {
            "name": "Hover: resolveModule(\"Stdio.File\")",
            "value": 0.07870204254467858,
            "unit": "ms"
          },
          {
            "name": "Completion: getCompletionContext (Large File, Warm Cache)",
            "value": 10.132100712121213,
            "unit": "ms"
          },
          {
            "name": "Completion: getCompletionContext (Large File, Cold Cache)",
            "value": 10.189141676923077,
            "unit": "ms"
          }
        ]
      },
      {
        "commit": {
          "author": {
            "email": "therealsmuks@gmail.com",
            "name": "TheSmuks",
            "username": "TheSmuks"
          },
          "committer": {
            "email": "therealsmuks@gmail.com",
            "name": "TheSmuks",
            "username": "TheSmuks"
          },
          "distinct": true,
          "id": "8398bb42bb766de4c38321d086761e64bd0d830d",
          "message": "fix: remove CJS fallback for ESM compatibility\n\nRemove __filename usage from bridge.ts to ensure pure ESM compatibility.\nThe test requires that source code uses only import.meta.url, not __filename\nwhich only works in CJS mode.\n\nesbuild correctly handles import.meta.url when bundling to CJS, so no\nfallback is needed.\n\nFixes: ESM Compatibility > LSP server supports ESM mode via import.meta.url\n\nCo-Authored-By: Claude Sonnet 4.5 <noreply@anthropic.com>",
          "timestamp": "2026-02-03T20:27:50+01:00",
          "tree_id": "f7cd2883e22b79408f358374b6b3946f8bc77987",
          "url": "https://github.com/TheSmuks/pike-lsp/commit/8398bb42bb766de4c38321d086761e64bd0d830d"
        },
        "date": 1770146996668,
        "tool": "customSmallerIsBetter",
        "benches": [
          {
            "name": "PikeBridge.start() [Cold Start]",
            "value": 200.96524983333333,
            "unit": "ms"
          },
          {
            "name": "PikeBridge.start() with detailed metrics [Cold Start]",
            "value": 247.60673141666666,
            "unit": "ms"
          },
          {
            "name": "Cold Start + First Request (getVersionInfo)",
            "value": 249.03779908333334,
            "unit": "ms"
          },
          {
            "name": "Cold Start + Introspect",
            "value": 253.03443741666666,
            "unit": "ms"
          },
          {
            "name": "Validation: Small File (~15 lines)",
            "value": 1.0929101204437401,
            "unit": "ms"
          },
          {
            "name": "Validation: Medium File (~100 lines)",
            "value": 3.6897799193548386,
            "unit": "ms"
          },
          {
            "name": "Validation: Large File (~1000 lines)",
            "value": 46.21464641666667,
            "unit": "ms"
          },
          {
            "name": "Validation Legacy (3 calls: analyze + parse + analyzeUninitialized)",
            "value": 4.787869993006993,
            "unit": "ms"
          },
          {
            "name": "Validation Consolidated (1 call: analyze with all includes)",
            "value": 3.666950919786096,
            "unit": "ms"
          },
          {
            "name": "Cache Hit: analyze with same document version",
            "value": 0.23709990922242316,
            "unit": "ms"
          },
          {
            "name": "Cache Miss: analyze with different version",
            "value": 0.23090520861277797,
            "unit": "ms"
          },
          {
            "name": "Closed File: analyze without version (stat-based key)",
            "value": 0.480345983745583,
            "unit": "ms"
          },
          {
            "name": "Cross-file: compile main with inherited utils",
            "value": 0.1900701621462264,
            "unit": "ms"
          },
          {
            "name": "Cross-file: recompile main (cache hit)",
            "value": 0.1874008769502502,
            "unit": "ms"
          },
          {
            "name": "resolveStdlib(\"Stdio\") - warm",
            "value": 1.65411254676259,
            "unit": "ms"
          },
          {
            "name": "resolveStdlib(\"String\")",
            "value": 0.37162099668508286,
            "unit": "ms"
          },
          {
            "name": "resolveStdlib(\"Array\")",
            "value": 0.36561043773790103,
            "unit": "ms"
          },
          {
            "name": "resolveStdlib(\"Mapping\")",
            "value": 0.09968761386789353,
            "unit": "ms"
          },
          {
            "name": "resolveStdlib(\"Stdio.File\") - nested",
            "value": 0.5885305107851596,
            "unit": "ms"
          },
          {
            "name": "resolveStdlib(\"String.SplitIterator\") - nested",
            "value": 0.08609834268919911,
            "unit": "ms"
          },
          {
            "name": "First diagnostic after document change",
            "value": 0.2878282329004329,
            "unit": "ms"
          },
          {
            "name": "Validation with 250ms debounce (default)",
            "value": 250.79825341666665,
            "unit": "ms"
          },
          {
            "name": "Rapid edit simulation (debounce coalescing)",
            "value": 251.93301075,
            "unit": "ms"
          },
          {
            "name": "Hover: resolveStdlib(\"Stdio.File\")",
            "value": 0.5775134000000001,
            "unit": "ms"
          },
          {
            "name": "Hover: resolveModule(\"Stdio.File\")",
            "value": 0.08009424175524667,
            "unit": "ms"
          },
          {
            "name": "Completion: getCompletionContext (Large File, Warm Cache)",
            "value": 10.035634552238806,
            "unit": "ms"
          },
          {
            "name": "Completion: getCompletionContext (Large File, Cold Cache)",
            "value": 9.968777955223882,
            "unit": "ms"
          }
        ]
      },
      {
        "commit": {
          "author": {
            "email": "therealsmuks@gmail.com",
            "name": "TheSmuks",
            "username": "TheSmuks"
          },
          "committer": {
            "email": "therealsmuks@gmail.com",
            "name": "TheSmuks",
            "username": "TheSmuks"
          },
          "distinct": true,
          "id": "3a46230463decf4f8257d5cdffdb7fe5c5eadd5d",
          "message": "fix: improve import and inherit resolution with workspace symbol caching\n\nThis commit fixes three critical gaps in import/inherit resolution identified\nthrough TDD testing:\n\n1. Added symbol cache to ResolvedImport type (Gap 5)\n   - New optional fields: symbols, lastAccessed, resolvedPath\n   - Enables workspace imports to cache and expose their symbols\n\n2. Enabled workspace import completion (Gap 1)\n   - Removed stdlib-only check in completion handler\n   - Workspace imports now contribute symbols to autocomplete\n\n3. Fixed order-independent inherit resolution (Gap 2)\n   - Removed line number filter from inherit resolution\n   - Inherit statements now work regardless of import position\n\nTest Results:\n- All 271 tests pass (15 new import/inherit tests + 256 existing)\n- No regressions detected\n- Coverage: 70.81% functions, 75.53% lines\n\nFiles Modified:\n- packages/pike-lsp-server/src/core/types.ts (+8, -1)\n- packages/pike-lsp-server/src/features/editing/completion.ts (+35, -20)\n- packages/pike-lsp-server/src/features/navigation/definition.ts (+8, -4)\n- packages/pike-lsp-server/src/tests/import-inherit-resolution.test.ts (new)\n\nDocumentation:\n- IMPORT_INHERIT_IMPLEMENTATION_SPEC.md\n- IMPORT_INHERIT_TEST_SUMMARY.md\n- IMPLEMENTATION_COMPLETE.md",
          "timestamp": "2026-02-03T21:47:49+01:00",
          "tree_id": "c35cb1502f498d4aa4cc6b6f2f3cf5f0abb01e38",
          "url": "https://github.com/TheSmuks/pike-lsp/commit/3a46230463decf4f8257d5cdffdb7fe5c5eadd5d"
        },
        "date": 1770151795009,
        "tool": "customSmallerIsBetter",
        "benches": [
          {
            "name": "PikeBridge.start() [Cold Start]",
            "value": 202.59263883333335,
            "unit": "ms"
          },
          {
            "name": "PikeBridge.start() with detailed metrics [Cold Start]",
            "value": 247.88460833333335,
            "unit": "ms"
          },
          {
            "name": "Cold Start + First Request (getVersionInfo)",
            "value": 250.92060358333333,
            "unit": "ms"
          },
          {
            "name": "Cold Start + Introspect",
            "value": 252.24490525,
            "unit": "ms"
          },
          {
            "name": "Validation: Small File (~15 lines)",
            "value": 1.143897149501661,
            "unit": "ms"
          },
          {
            "name": "Validation: Medium File (~100 lines)",
            "value": 3.690879516129032,
            "unit": "ms"
          },
          {
            "name": "Validation: Large File (~1000 lines)",
            "value": 46.392999,
            "unit": "ms"
          },
          {
            "name": "Validation Legacy (3 calls: analyze + parse + analyzeUninitialized)",
            "value": 4.682474890410959,
            "unit": "ms"
          },
          {
            "name": "Validation Consolidated (1 call: analyze with all includes)",
            "value": 3.697858518918919,
            "unit": "ms"
          },
          {
            "name": "Cache Hit: analyze with same document version",
            "value": 0.23315673124777817,
            "unit": "ms"
          },
          {
            "name": "Cache Miss: analyze with different version",
            "value": 0.2401347873352855,
            "unit": "ms"
          },
          {
            "name": "Closed File: analyze without version (stat-based key)",
            "value": 0.5223587682832949,
            "unit": "ms"
          },
          {
            "name": "Cross-file: compile main with inherited utils",
            "value": 0.19600610630520865,
            "unit": "ms"
          },
          {
            "name": "Cross-file: recompile main (cache hit)",
            "value": 0.19021456747919144,
            "unit": "ms"
          },
          {
            "name": "resolveStdlib(\"Stdio\") - warm",
            "value": 1.6276921717647057,
            "unit": "ms"
          },
          {
            "name": "resolveStdlib(\"String\")",
            "value": 0.38228889584519066,
            "unit": "ms"
          },
          {
            "name": "resolveStdlib(\"Array\")",
            "value": 0.34935773579989576,
            "unit": "ms"
          },
          {
            "name": "resolveStdlib(\"Mapping\")",
            "value": 0.09631065524932292,
            "unit": "ms"
          },
          {
            "name": "resolveStdlib(\"Stdio.File\") - nested",
            "value": 0.5622441542904291,
            "unit": "ms"
          },
          {
            "name": "resolveStdlib(\"String.SplitIterator\") - nested",
            "value": 0.08132497338665196,
            "unit": "ms"
          },
          {
            "name": "First diagnostic after document change",
            "value": 0.3159785971360382,
            "unit": "ms"
          },
          {
            "name": "Validation with 250ms debounce (default)",
            "value": 250.95468791666664,
            "unit": "ms"
          },
          {
            "name": "Rapid edit simulation (debounce coalescing)",
            "value": 255.0237085,
            "unit": "ms"
          },
          {
            "name": "Hover: resolveStdlib(\"Stdio.File\")",
            "value": 0.588301014693172,
            "unit": "ms"
          },
          {
            "name": "Hover: resolveModule(\"Stdio.File\")",
            "value": 0.07835758941897654,
            "unit": "ms"
          },
          {
            "name": "Completion: getCompletionContext (Large File, Warm Cache)",
            "value": 10.063229242424242,
            "unit": "ms"
          },
          {
            "name": "Completion: getCompletionContext (Large File, Cold Cache)",
            "value": 9.962929447761194,
            "unit": "ms"
          }
        ]
      },
      {
        "commit": {
          "author": {
            "email": "therealsmuks@gmail.com",
            "name": "TheSmuks",
            "username": "TheSmuks"
          },
          "committer": {
            "email": "therealsmuks@gmail.com",
            "name": "TheSmuks",
            "username": "TheSmuks"
          },
          "distinct": true,
          "id": "bdfb26b310cd7ca757c1842c9d74ae9c5316e8b2",
          "message": "fix: render autodoc @returns @mapping @member tags in hover\n\n- Fix @member inside @mapping blocks: add to group_items instead of\n  result->members directly (TypeAnalysis.pike)\n- Make has_autodoc_markup public for use by Parser.pike (module.pmod)\n- Add fallback to autodoc_by_line when //! buffer is empty (Parser.pike)\n- Build: minify server and exclude test pike scripts from VSIX\n\nThe @returns with nested @mapping/@member tags now render correctly:\n  **Mapping members:**\n    - `\"version\"` (int)\n    - `\"tstamp\"` (int)\n    ...\n\nCo-Authored-By: Claude Opus 4.5 <noreply@anthropic.com>",
          "timestamp": "2026-02-03T23:27:43+01:00",
          "tree_id": "adc135574cfaa09c4202f371f99abe114359fd22",
          "url": "https://github.com/TheSmuks/pike-lsp/commit/bdfb26b310cd7ca757c1842c9d74ae9c5316e8b2"
        },
        "date": 1770157792223,
        "tool": "customSmallerIsBetter",
        "benches": [
          {
            "name": "PikeBridge.start() [Cold Start]",
            "value": 201.47458433333335,
            "unit": "ms"
          },
          {
            "name": "PikeBridge.start() with detailed metrics [Cold Start]",
            "value": 247.28586733333336,
            "unit": "ms"
          },
          {
            "name": "Cold Start + First Request (getVersionInfo)",
            "value": 246.7170405,
            "unit": "ms"
          },
          {
            "name": "Cold Start + Introspect",
            "value": 252.27383675,
            "unit": "ms"
          },
          {
            "name": "Validation: Small File (~15 lines)",
            "value": 1.1086065578778135,
            "unit": "ms"
          },
          {
            "name": "Validation: Medium File (~100 lines)",
            "value": 3.779788214285714,
            "unit": "ms"
          },
          {
            "name": "Validation: Large File (~1000 lines)",
            "value": 46.9852979090909,
            "unit": "ms"
          },
          {
            "name": "Validation Legacy (3 calls: analyze + parse + analyzeUninitialized)",
            "value": 4.9787404963503645,
            "unit": "ms"
          },
          {
            "name": "Validation Consolidated (1 call: analyze with all includes)",
            "value": 3.693258139784946,
            "unit": "ms"
          },
          {
            "name": "Cache Hit: analyze with same document version",
            "value": 0.2334759650997151,
            "unit": "ms"
          },
          {
            "name": "Cache Miss: analyze with different version",
            "value": 0.24050029273661042,
            "unit": "ms"
          },
          {
            "name": "Closed File: analyze without version (stat-based key)",
            "value": 0.49361628727272727,
            "unit": "ms"
          },
          {
            "name": "Cross-file: compile main with inherited utils",
            "value": 0.1965080222832723,
            "unit": "ms"
          },
          {
            "name": "Cross-file: recompile main (cache hit)",
            "value": 0.18066096544888133,
            "unit": "ms"
          },
          {
            "name": "resolveStdlib(\"Stdio\") - warm",
            "value": 1.7658420846153846,
            "unit": "ms"
          },
          {
            "name": "resolveStdlib(\"String\")",
            "value": 0.37505392127303183,
            "unit": "ms"
          },
          {
            "name": "resolveStdlib(\"Array\")",
            "value": 0.36945151843698404,
            "unit": "ms"
          },
          {
            "name": "resolveStdlib(\"Mapping\")",
            "value": 0.10417994255428278,
            "unit": "ms"
          },
          {
            "name": "resolveStdlib(\"Stdio.File\") - nested",
            "value": 0.5827264439692045,
            "unit": "ms"
          },
          {
            "name": "resolveStdlib(\"String.SplitIterator\") - nested",
            "value": 0.08326059524146723,
            "unit": "ms"
          },
          {
            "name": "First diagnostic after document change",
            "value": 0.2984578271992819,
            "unit": "ms"
          },
          {
            "name": "Validation with 250ms debounce (default)",
            "value": 249.99811425,
            "unit": "ms"
          },
          {
            "name": "Rapid edit simulation (debounce coalescing)",
            "value": 252.32477416666666,
            "unit": "ms"
          },
          {
            "name": "Hover: resolveStdlib(\"Stdio.File\")",
            "value": 0.5848560317596566,
            "unit": "ms"
          },
          {
            "name": "Hover: resolveModule(\"Stdio.File\")",
            "value": 0.08173159795664779,
            "unit": "ms"
          },
          {
            "name": "Completion: getCompletionContext (Large File, Warm Cache)",
            "value": 10.150141075757576,
            "unit": "ms"
          },
          {
            "name": "Completion: getCompletionContext (Large File, Cold Cache)",
            "value": 10.188462446153846,
            "unit": "ms"
          }
        ]
      },
      {
        "commit": {
          "author": {
            "email": "therealsmuks@gmail.com",
            "name": "TheSmuks",
            "username": "TheSmuks"
          },
          "committer": {
            "email": "therealsmuks@gmail.com",
            "name": "TheSmuks",
            "username": "TheSmuks"
          },
          "distinct": true,
          "id": "80529e15bdb4f042c39b24a5e47ee41eda5a0ec6",
          "message": "chore: bump version to 0.1.0-alpha.14",
          "timestamp": "2026-02-04T17:31:09+01:00",
          "tree_id": "227bd50ce71d8cce5842d0b11aae9d1aea02d381",
          "url": "https://github.com/TheSmuks/pike-lsp/commit/80529e15bdb4f042c39b24a5e47ee41eda5a0ec6"
        },
        "date": 1770222788305,
        "tool": "customSmallerIsBetter",
        "benches": [
          {
            "name": "PikeBridge.start() [Cold Start]",
            "value": 201.57934258333336,
            "unit": "ms"
          },
          {
            "name": "PikeBridge.start() with detailed metrics [Cold Start]",
            "value": 249.75430925,
            "unit": "ms"
          },
          {
            "name": "Cold Start + First Request (getVersionInfo)",
            "value": 249.15515425,
            "unit": "ms"
          },
          {
            "name": "Cold Start + Introspect",
            "value": 254.99614608333334,
            "unit": "ms"
          },
          {
            "name": "Validation: Small File (~15 lines)",
            "value": 0,
            "unit": "ms"
          },
          {
            "name": "Validation: Medium File (~100 lines)",
            "value": 0,
            "unit": "ms"
          },
          {
            "name": "Validation: Large File (~1000 lines)",
            "value": 0,
            "unit": "ms"
          },
          {
            "name": "Validation Legacy (3 calls: analyze + parse + analyzeUninitialized)",
            "value": 0,
            "unit": "ms"
          },
          {
            "name": "Validation Consolidated (1 call: analyze with all includes)",
            "value": 0,
            "unit": "ms"
          },
          {
            "name": "Cache Hit: analyze with same document version",
            "value": 0,
            "unit": "ms"
          },
          {
            "name": "Cache Miss: analyze with different version",
            "value": 0,
            "unit": "ms"
          },
          {
            "name": "Closed File: analyze without version (stat-based key)",
            "value": 0,
            "unit": "ms"
          },
          {
            "name": "Cross-file: compile main with inherited utils",
            "value": 0,
            "unit": "ms"
          },
          {
            "name": "Cross-file: recompile main (cache hit)",
            "value": 0,
            "unit": "ms"
          },
          {
            "name": "resolveStdlib(\"Stdio\") - warm",
            "value": 0,
            "unit": "ms"
          },
          {
            "name": "resolveStdlib(\"String\")",
            "value": 0,
            "unit": "ms"
          },
          {
            "name": "resolveStdlib(\"Array\")",
            "value": 0,
            "unit": "ms"
          },
          {
            "name": "resolveStdlib(\"Mapping\")",
            "value": 0,
            "unit": "ms"
          },
          {
            "name": "resolveStdlib(\"Stdio.File\") - nested",
            "value": 0,
            "unit": "ms"
          },
          {
            "name": "resolveStdlib(\"String.SplitIterator\") - nested",
            "value": 0,
            "unit": "ms"
          },
          {
            "name": "First diagnostic after document change",
            "value": 0,
            "unit": "ms"
          },
          {
            "name": "Validation with 250ms debounce (default)",
            "value": 251.06478025,
            "unit": "ms"
          },
          {
            "name": "Rapid edit simulation (debounce coalescing)",
            "value": 0,
            "unit": "ms"
          },
          {
            "name": "Hover: resolveStdlib(\"Stdio.File\")",
            "value": 0,
            "unit": "ms"
          },
          {
            "name": "Hover: resolveModule(\"Stdio.File\")",
            "value": 0,
            "unit": "ms"
          },
          {
            "name": "Completion: getCompletionContext (Large File, Warm Cache)",
            "value": 0,
            "unit": "ms"
          },
          {
            "name": "Completion: getCompletionContext (Large File, Cold Cache)",
            "value": 0,
            "unit": "ms"
          }
        ]
      },
      {
        "commit": {
          "author": {
            "email": "therealsmuks@gmail.com",
            "name": "TheSmuks",
            "username": "TheSmuks"
          },
          "committer": {
            "email": "therealsmuks@gmail.com",
            "name": "TheSmuks",
            "username": "TheSmuks"
          },
          "distinct": true,
          "id": "23ca3dcabf6dda69a3b286f522a98863e43bdb1a",
          "message": "fix: make rate limiter opt-in (disabled by default)",
          "timestamp": "2026-02-04T17:44:21+01:00",
          "tree_id": "a318408e346ee43fb223c03fd96aafbf533ee272",
          "url": "https://github.com/TheSmuks/pike-lsp/commit/23ca3dcabf6dda69a3b286f522a98863e43bdb1a"
        },
        "date": 1770223587998,
        "tool": "customSmallerIsBetter",
        "benches": [
          {
            "name": "PikeBridge.start() [Cold Start]",
            "value": 200.88828525,
            "unit": "ms"
          },
          {
            "name": "PikeBridge.start() with detailed metrics [Cold Start]",
            "value": 246.87755075,
            "unit": "ms"
          },
          {
            "name": "Cold Start + First Request (getVersionInfo)",
            "value": 247.09651825,
            "unit": "ms"
          },
          {
            "name": "Cold Start + Introspect",
            "value": 251.91879366666666,
            "unit": "ms"
          },
          {
            "name": "Validation: Small File (~15 lines)",
            "value": 1.0953318330683623,
            "unit": "ms"
          },
          {
            "name": "Validation: Medium File (~100 lines)",
            "value": 3.7108184486486486,
            "unit": "ms"
          },
          {
            "name": "Validation: Large File (~1000 lines)",
            "value": 46.473858166666666,
            "unit": "ms"
          },
          {
            "name": "Validation Legacy (3 calls: analyze + parse + analyzeUninitialized)",
            "value": 4.681271150684931,
            "unit": "ms"
          },
          {
            "name": "Validation Consolidated (1 call: analyze with all includes)",
            "value": 3.648858079787234,
            "unit": "ms"
          },
          {
            "name": "Cache Hit: analyze with same document version",
            "value": 0.2213362653820149,
            "unit": "ms"
          },
          {
            "name": "Cache Miss: analyze with different version",
            "value": 0.22225147930800543,
            "unit": "ms"
          },
          {
            "name": "Closed File: analyze without version (stat-based key)",
            "value": 0.48954054545454545,
            "unit": "ms"
          },
          {
            "name": "Cross-file: compile main with inherited utils",
            "value": 0.17991504346606843,
            "unit": "ms"
          },
          {
            "name": "Cross-file: recompile main (cache hit)",
            "value": 0.18098696801585054,
            "unit": "ms"
          },
          {
            "name": "resolveStdlib(\"Stdio\") - warm",
            "value": 1.833380055851064,
            "unit": "ms"
          },
          {
            "name": "resolveStdlib(\"String\")",
            "value": 0.35647985554965483,
            "unit": "ms"
          },
          {
            "name": "resolveStdlib(\"Array\")",
            "value": 0.3401618524340771,
            "unit": "ms"
          },
          {
            "name": "resolveStdlib(\"Mapping\")",
            "value": 0.09895865377081293,
            "unit": "ms"
          },
          {
            "name": "resolveStdlib(\"Stdio.File\") - nested",
            "value": 0.5400707589214908,
            "unit": "ms"
          },
          {
            "name": "resolveStdlib(\"String.SplitIterator\") - nested",
            "value": 0.07160890496733638,
            "unit": "ms"
          },
          {
            "name": "First diagnostic after document change",
            "value": 0.27571972053311117,
            "unit": "ms"
          },
          {
            "name": "Validation with 250ms debounce (default)",
            "value": 250.69800841666665,
            "unit": "ms"
          },
          {
            "name": "Rapid edit simulation (debounce coalescing)",
            "value": 251.71507333333335,
            "unit": "ms"
          },
          {
            "name": "Hover: resolveStdlib(\"Stdio.File\")",
            "value": 0.5594883711001643,
            "unit": "ms"
          },
          {
            "name": "Hover: resolveModule(\"Stdio.File\")",
            "value": 0.07296342448112028,
            "unit": "ms"
          },
          {
            "name": "Completion: getCompletionContext (Large File, Warm Cache)",
            "value": 9.84278182352941,
            "unit": "ms"
          },
          {
            "name": "Completion: getCompletionContext (Large File, Cold Cache)",
            "value": 9.774479529411765,
            "unit": "ms"
          }
        ]
      },
      {
        "commit": {
          "author": {
            "email": "therealsmuks@gmail.com",
            "name": "TheSmuks",
            "username": "TheSmuks"
          },
          "committer": {
            "email": "therealsmuks@gmail.com",
            "name": "TheSmuks",
            "username": "TheSmuks"
          },
          "distinct": true,
          "id": "6e53b13db755d7c19e0488241c1a2e597b4f085f",
          "message": "test: fix E2E test skips and update completion tests\n\n- Fix regex patterns in e2e-workflows.test.ts: remove ^ and /m flags\n  from test_function/caller_function regex to allow matches\n  anywhere in the document\n\n- Add skips to smart-completion.test.ts for known issues:\n  - N.1, N.2, N.3: stdlib member completion (pre-existing bug)\n  - P.2: deprecated tags on inherited members\n  - Q.1: this_program:: completion\n\n- Update test-smart-completion.pike fixture to use valid Pike\n  syntax and add unique pattern comments for test positioning",
          "timestamp": "2026-02-05T19:52:43+01:00",
          "tree_id": "4dbf843322545d6fb4c3752f073699584122d819",
          "url": "https://github.com/TheSmuks/pike-lsp/commit/6e53b13db755d7c19e0488241c1a2e597b4f085f"
        },
        "date": 1770318001050,
        "tool": "customSmallerIsBetter",
        "benches": [
          {
            "name": "PikeBridge.start() [Cold Start]",
            "value": 202.52842791666666,
            "unit": "ms"
          },
          {
            "name": "PikeBridge.start() with detailed metrics [Cold Start]",
            "value": 248.42019675,
            "unit": "ms"
          },
          {
            "name": "Cold Start + First Request (getVersionInfo)",
            "value": 248.79706783333333,
            "unit": "ms"
          },
          {
            "name": "Cold Start + Introspect",
            "value": 253.433104,
            "unit": "ms"
          },
          {
            "name": "Validation: Small File (~15 lines)",
            "value": 1.1233316704730831,
            "unit": "ms"
          },
          {
            "name": "Validation: Medium File (~100 lines)",
            "value": 3.7399937336956524,
            "unit": "ms"
          },
          {
            "name": "Validation: Large File (~1000 lines)",
            "value": 46.53161158333334,
            "unit": "ms"
          },
          {
            "name": "Validation Legacy (3 calls: analyze + parse + analyzeUninitialized)",
            "value": 4.835429404255319,
            "unit": "ms"
          },
          {
            "name": "Validation Consolidated (1 call: analyze with all includes)",
            "value": 3.6855026075268817,
            "unit": "ms"
          },
          {
            "name": "Cache Hit: analyze with same document version",
            "value": 0.23165816261022928,
            "unit": "ms"
          },
          {
            "name": "Cache Miss: analyze with different version",
            "value": 0.24498073348264277,
            "unit": "ms"
          },
          {
            "name": "Closed File: analyze without version (stat-based key)",
            "value": 0.5151636476841306,
            "unit": "ms"
          },
          {
            "name": "Cross-file: compile main with inherited utils",
            "value": 0.2006159791212216,
            "unit": "ms"
          },
          {
            "name": "Cross-file: recompile main (cache hit)",
            "value": 0.19163690584707646,
            "unit": "ms"
          },
          {
            "name": "resolveStdlib(\"Stdio\") - warm",
            "value": 1.7045678024691358,
            "unit": "ms"
          },
          {
            "name": "resolveStdlib(\"String\")",
            "value": 0.3941536812865497,
            "unit": "ms"
          },
          {
            "name": "resolveStdlib(\"Array\")",
            "value": 0.3832809925968109,
            "unit": "ms"
          },
          {
            "name": "resolveStdlib(\"Mapping\")",
            "value": 0.1088709730017762,
            "unit": "ms"
          },
          {
            "name": "resolveStdlib(\"Stdio.File\") - nested",
            "value": 0.6117725264100268,
            "unit": "ms"
          },
          {
            "name": "resolveStdlib(\"String.SplitIterator\") - nested",
            "value": 0.07682293304450571,
            "unit": "ms"
          },
          {
            "name": "First diagnostic after document change",
            "value": 0.29796585637342904,
            "unit": "ms"
          },
          {
            "name": "Validation with 250ms debounce (default)",
            "value": 250.31026566666665,
            "unit": "ms"
          },
          {
            "name": "Rapid edit simulation (debounce coalescing)",
            "value": 253.65767333333335,
            "unit": "ms"
          },
          {
            "name": "Hover: resolveStdlib(\"Stdio.File\")",
            "value": 0.6220964977210574,
            "unit": "ms"
          },
          {
            "name": "Hover: resolveModule(\"Stdio.File\")",
            "value": 0.0816683388030888,
            "unit": "ms"
          },
          {
            "name": "Completion: getCompletionContext (Large File, Warm Cache)",
            "value": 10.111503924242424,
            "unit": "ms"
          },
          {
            "name": "Completion: getCompletionContext (Large File, Cold Cache)",
            "value": 9.964192462686567,
            "unit": "ms"
          }
        ]
      },
      {
        "commit": {
          "author": {
            "email": "therealsmuks@gmail.com",
            "name": "TheSmuks",
            "username": "TheSmuks"
          },
          "committer": {
            "email": "therealsmuks@gmail.com",
            "name": "TheSmuks",
            "username": "TheSmuks"
          },
          "distinct": true,
          "id": "d54d6f17751a5648c13f970ccc2985e8fa3cdcf4",
          "message": "test: fix signature help test for user-defined functions\n\n- Update test to use softer assertion since signature help for\n  user-defined functions may not be fully implemented\n- Add complex_function call inside test_complex_function",
          "timestamp": "2026-02-06T13:45:24+01:00",
          "tree_id": "a5e8860011b371a9eee47cd04e4ff317dadebf41",
          "url": "https://github.com/TheSmuks/pike-lsp/commit/d54d6f17751a5648c13f970ccc2985e8fa3cdcf4"
        },
        "date": 1770382048034,
        "tool": "customSmallerIsBetter",
        "benches": [
          {
            "name": "PikeBridge.start() [Cold Start]",
            "value": 202.72306725,
            "unit": "ms"
          },
          {
            "name": "PikeBridge.start() with detailed metrics [Cold Start]",
            "value": 249.30155708333334,
            "unit": "ms"
          },
          {
            "name": "Cold Start + First Request (getVersionInfo)",
            "value": 248.6103495,
            "unit": "ms"
          },
          {
            "name": "Cold Start + Introspect",
            "value": 253.4699465,
            "unit": "ms"
          },
          {
            "name": "Validation: Small File (~15 lines)",
            "value": 1.210922404217926,
            "unit": "ms"
          },
          {
            "name": "Validation: Medium File (~100 lines)",
            "value": 3.877368881355932,
            "unit": "ms"
          },
          {
            "name": "Validation: Large File (~1000 lines)",
            "value": 46.75313858333334,
            "unit": "ms"
          },
          {
            "name": "Validation Legacy (3 calls: analyze + parse + analyzeUninitialized)",
            "value": 4.93183064028777,
            "unit": "ms"
          },
          {
            "name": "Validation Consolidated (1 call: analyze with all includes)",
            "value": 3.7766220824175827,
            "unit": "ms"
          },
          {
            "name": "Cache Hit: analyze with same document version",
            "value": 0.28729946467273515,
            "unit": "ms"
          },
          {
            "name": "Cache Miss: analyze with different version",
            "value": 0.2744797255794702,
            "unit": "ms"
          },
          {
            "name": "Closed File: analyze without version (stat-based key)",
            "value": 0.5503871712439419,
            "unit": "ms"
          },
          {
            "name": "Cross-file: compile main with inherited utils",
            "value": 0.21127811132940405,
            "unit": "ms"
          },
          {
            "name": "Cross-file: recompile main (cache hit)",
            "value": 0.18292288815789476,
            "unit": "ms"
          },
          {
            "name": "resolveStdlib(\"Stdio\") - warm",
            "value": 1.6850133341463416,
            "unit": "ms"
          },
          {
            "name": "resolveStdlib(\"String\")",
            "value": 0.4028824013157895,
            "unit": "ms"
          },
          {
            "name": "resolveStdlib(\"Array\")",
            "value": 0.381114607587769,
            "unit": "ms"
          },
          {
            "name": "resolveStdlib(\"Mapping\")",
            "value": 0.10546779430543572,
            "unit": "ms"
          },
          {
            "name": "resolveStdlib(\"Stdio.File\") - nested",
            "value": 0.6089541122994653,
            "unit": "ms"
          },
          {
            "name": "resolveStdlib(\"String.SplitIterator\") - nested",
            "value": 0.08588720268902704,
            "unit": "ms"
          },
          {
            "name": "First diagnostic after document change",
            "value": 0.40066422961630693,
            "unit": "ms"
          },
          {
            "name": "Validation with 250ms debounce (default)",
            "value": 251.02407033333336,
            "unit": "ms"
          },
          {
            "name": "Rapid edit simulation (debounce coalescing)",
            "value": 255.25295475,
            "unit": "ms"
          },
          {
            "name": "Hover: resolveStdlib(\"Stdio.File\")",
            "value": 0.620740166212534,
            "unit": "ms"
          },
          {
            "name": "Hover: resolveModule(\"Stdio.File\")",
            "value": 0.07972676172455738,
            "unit": "ms"
          },
          {
            "name": "Completion: getCompletionContext (Large File, Warm Cache)",
            "value": 5.783547906779661,
            "unit": "ms"
          },
          {
            "name": "Completion: getCompletionContext (Large File, Cold Cache)",
            "value": 5.7902337542372875,
            "unit": "ms"
          }
        ]
      },
      {
        "commit": {
          "author": {
            "email": "therealsmuks@gmail.com",
            "name": "TheSmuks",
            "username": "TheSmuks"
          },
          "committer": {
            "email": "therealsmuks@gmail.com",
            "name": "TheSmuks",
            "username": "TheSmuks"
          },
          "distinct": true,
          "id": "47e03dda8c0a13fd5b08738de06f9c7cf92b055e",
          "message": "fix: correct test script path in pike-lsp-server package\n\nThe test script was using ./dist/src/ which doesn't exist after cd ../...\nChanged to ./packages/pike-lsp-server/dist/ to properly find compiled tests.",
          "timestamp": "2026-02-06T14:55:42+01:00",
          "tree_id": "c81ff23bc89e176a06ba4dee0016bc9ce65a7d55",
          "url": "https://github.com/TheSmuks/pike-lsp/commit/47e03dda8c0a13fd5b08738de06f9c7cf92b055e"
        },
        "date": 1770386268085,
        "tool": "customSmallerIsBetter",
        "benches": [
          {
            "name": "PikeBridge.start() [Cold Start]",
            "value": 201.20268733333333,
            "unit": "ms"
          },
          {
            "name": "PikeBridge.start() with detailed metrics [Cold Start]",
            "value": 249.90075533333334,
            "unit": "ms"
          },
          {
            "name": "Cold Start + First Request (getVersionInfo)",
            "value": 249.45948816666666,
            "unit": "ms"
          },
          {
            "name": "Cold Start + Introspect",
            "value": 254.16691966666664,
            "unit": "ms"
          },
          {
            "name": "Validation: Small File (~15 lines)",
            "value": 1.17984836130137,
            "unit": "ms"
          },
          {
            "name": "Validation: Medium File (~100 lines)",
            "value": 3.8102836277777774,
            "unit": "ms"
          },
          {
            "name": "Validation: Large File (~1000 lines)",
            "value": 47.050884454545454,
            "unit": "ms"
          },
          {
            "name": "Validation Legacy (3 calls: analyze + parse + analyzeUninitialized)",
            "value": 4.797951979020979,
            "unit": "ms"
          },
          {
            "name": "Validation Consolidated (1 call: analyze with all includes)",
            "value": 3.7746381373626376,
            "unit": "ms"
          },
          {
            "name": "Cache Hit: analyze with same document version",
            "value": 0.2796613113924051,
            "unit": "ms"
          },
          {
            "name": "Cache Miss: analyze with different version",
            "value": 0.2694857996742671,
            "unit": "ms"
          },
          {
            "name": "Closed File: analyze without version (stat-based key)",
            "value": 0.5511578380566802,
            "unit": "ms"
          },
          {
            "name": "Cross-file: compile main with inherited utils",
            "value": 0.18746532664339732,
            "unit": "ms"
          },
          {
            "name": "Cross-file: recompile main (cache hit)",
            "value": 0.1933000268882175,
            "unit": "ms"
          },
          {
            "name": "resolveStdlib(\"Stdio\") - warm",
            "value": 1.647927121718377,
            "unit": "ms"
          },
          {
            "name": "resolveStdlib(\"String\")",
            "value": 0.37040137927232636,
            "unit": "ms"
          },
          {
            "name": "resolveStdlib(\"Array\")",
            "value": 0.3657164616222101,
            "unit": "ms"
          },
          {
            "name": "resolveStdlib(\"Mapping\")",
            "value": 0.11174925697503671,
            "unit": "ms"
          },
          {
            "name": "resolveStdlib(\"Stdio.File\") - nested",
            "value": 0.5926330660295396,
            "unit": "ms"
          },
          {
            "name": "resolveStdlib(\"String.SplitIterator\") - nested",
            "value": 0.07534307936098943,
            "unit": "ms"
          },
          {
            "name": "First diagnostic after document change",
            "value": 0.3870025632183908,
            "unit": "ms"
          },
          {
            "name": "Validation with 250ms debounce (default)",
            "value": 250.26080241666665,
            "unit": "ms"
          },
          {
            "name": "Rapid edit simulation (debounce coalescing)",
            "value": 252.51244366666666,
            "unit": "ms"
          },
          {
            "name": "Hover: resolveStdlib(\"Stdio.File\")",
            "value": 0.5932595852173913,
            "unit": "ms"
          },
          {
            "name": "Hover: resolveModule(\"Stdio.File\")",
            "value": 0.09060667492024914,
            "unit": "ms"
          },
          {
            "name": "Completion: getCompletionContext (Large File, Warm Cache)",
            "value": 5.693934916666667,
            "unit": "ms"
          },
          {
            "name": "Completion: getCompletionContext (Large File, Cold Cache)",
            "value": 5.655376545454546,
            "unit": "ms"
          }
        ]
      },
      {
        "commit": {
          "author": {
            "email": "therealsmuks@gmail.com",
            "name": "TheSmuks",
            "username": "TheSmuks"
          },
          "committer": {
            "email": "therealsmuks@gmail.com",
            "name": "TheSmuks",
            "username": "TheSmuks"
          },
          "distinct": true,
          "id": "b4bf6722687ce6104f3abf93638b2f7586c52ece",
          "message": "test: fix completion tests for scope operator (this_program::, this::)\n\nThe tests were providing flat symbols but the completion handler expects\nan enclosing class symbol with children. Added classSym() helper and\nupdated tests C.1, C.2, C.4, C.5 to properly structure symbols as\nclass with children members.\n\nThis fixes CI failures in the Test workflow.",
          "timestamp": "2026-02-06T15:03:46+01:00",
          "tree_id": "c252416845d7850028c43001718711230d6924bd",
          "url": "https://github.com/TheSmuks/pike-lsp/commit/b4bf6722687ce6104f3abf93638b2f7586c52ece"
        },
        "date": 1770386744658,
        "tool": "customSmallerIsBetter",
        "benches": [
          {
            "name": "PikeBridge.start() [Cold Start]",
            "value": 202.81472408333335,
            "unit": "ms"
          },
          {
            "name": "PikeBridge.start() with detailed metrics [Cold Start]",
            "value": 250.92808016666666,
            "unit": "ms"
          },
          {
            "name": "Cold Start + First Request (getVersionInfo)",
            "value": 250.26944283333333,
            "unit": "ms"
          },
          {
            "name": "Cold Start + Introspect",
            "value": 256.01535725,
            "unit": "ms"
          },
          {
            "name": "Validation: Small File (~15 lines)",
            "value": 1.1671728714043994,
            "unit": "ms"
          },
          {
            "name": "Validation: Medium File (~100 lines)",
            "value": 3.7782391043956043,
            "unit": "ms"
          },
          {
            "name": "Validation: Large File (~1000 lines)",
            "value": 47.465925454545456,
            "unit": "ms"
          },
          {
            "name": "Validation Legacy (3 calls: analyze + parse + analyzeUninitialized)",
            "value": 4.836561077464789,
            "unit": "ms"
          },
          {
            "name": "Validation Consolidated (1 call: analyze with all includes)",
            "value": 3.7094429945945944,
            "unit": "ms"
          },
          {
            "name": "Cache Hit: analyze with same document version",
            "value": 0.269264731300813,
            "unit": "ms"
          },
          {
            "name": "Cache Miss: analyze with different version",
            "value": 0.27678627944862155,
            "unit": "ms"
          },
          {
            "name": "Closed File: analyze without version (stat-based key)",
            "value": 0.5376464652448657,
            "unit": "ms"
          },
          {
            "name": "Cross-file: compile main with inherited utils",
            "value": 0.18756307200929154,
            "unit": "ms"
          },
          {
            "name": "Cross-file: recompile main (cache hit)",
            "value": 0.1850918684057971,
            "unit": "ms"
          },
          {
            "name": "resolveStdlib(\"Stdio\") - warm",
            "value": 1.65893259375,
            "unit": "ms"
          },
          {
            "name": "resolveStdlib(\"String\")",
            "value": 0.3699883738888889,
            "unit": "ms"
          },
          {
            "name": "resolveStdlib(\"Array\")",
            "value": 0.40221918469814705,
            "unit": "ms"
          },
          {
            "name": "resolveStdlib(\"Mapping\")",
            "value": 0.11173845461173897,
            "unit": "ms"
          },
          {
            "name": "resolveStdlib(\"Stdio.File\") - nested",
            "value": 0.5639546186931349,
            "unit": "ms"
          },
          {
            "name": "resolveStdlib(\"String.SplitIterator\") - nested",
            "value": 0.07379669449355898,
            "unit": "ms"
          },
          {
            "name": "First diagnostic after document change",
            "value": 0.3870033910293272,
            "unit": "ms"
          },
          {
            "name": "Validation with 250ms debounce (default)",
            "value": 251.1524675,
            "unit": "ms"
          },
          {
            "name": "Rapid edit simulation (debounce coalescing)",
            "value": 255.08128016666666,
            "unit": "ms"
          },
          {
            "name": "Hover: resolveStdlib(\"Stdio.File\")",
            "value": 0.5691233859649123,
            "unit": "ms"
          },
          {
            "name": "Hover: resolveModule(\"Stdio.File\")",
            "value": 0.08298663394854586,
            "unit": "ms"
          },
          {
            "name": "Completion: getCompletionContext (Large File, Warm Cache)",
            "value": 5.604473278688525,
            "unit": "ms"
          },
          {
            "name": "Completion: getCompletionContext (Large File, Cold Cache)",
            "value": 5.583942942622952,
            "unit": "ms"
          }
        ]
      },
      {
        "commit": {
          "author": {
            "email": "therealsmuks@gmail.com",
            "name": "TheSmuks",
            "username": "TheSmuks"
          },
          "committer": {
            "email": "therealsmuks@gmail.com",
            "name": "TheSmuks",
            "username": "TheSmuks"
          },
          "distinct": true,
          "id": "01af11ebb8419b5860855e9afee614123ff9db68",
          "message": "chore: bump version to 0.1.0-alpha.16",
          "timestamp": "2026-02-06T15:18:50+01:00",
          "tree_id": "4086cac424e123da897fc503e102fbea95da001c",
          "url": "https://github.com/TheSmuks/pike-lsp/commit/01af11ebb8419b5860855e9afee614123ff9db68"
        },
        "date": 1770387647241,
        "tool": "customSmallerIsBetter",
        "benches": [
          {
            "name": "PikeBridge.start() [Cold Start]",
            "value": 200.79752308333335,
            "unit": "ms"
          },
          {
            "name": "PikeBridge.start() with detailed metrics [Cold Start]",
            "value": 247.94094083333334,
            "unit": "ms"
          },
          {
            "name": "Cold Start + First Request (getVersionInfo)",
            "value": 250.12612016666665,
            "unit": "ms"
          },
          {
            "name": "Cold Start + Introspect",
            "value": 254.91101391666666,
            "unit": "ms"
          },
          {
            "name": "Validation: Small File (~15 lines)",
            "value": 1.1707843327674023,
            "unit": "ms"
          },
          {
            "name": "Validation: Medium File (~100 lines)",
            "value": 3.861830921348315,
            "unit": "ms"
          },
          {
            "name": "Validation: Large File (~1000 lines)",
            "value": 47.99675763636363,
            "unit": "ms"
          },
          {
            "name": "Validation Legacy (3 calls: analyze + parse + analyzeUninitialized)",
            "value": 4.897621251798561,
            "unit": "ms"
          },
          {
            "name": "Validation Consolidated (1 call: analyze with all includes)",
            "value": 3.7841078736263736,
            "unit": "ms"
          },
          {
            "name": "Cache Hit: analyze with same document version",
            "value": 0.27382323614557486,
            "unit": "ms"
          },
          {
            "name": "Cache Miss: analyze with different version",
            "value": 0.2867127755190312,
            "unit": "ms"
          },
          {
            "name": "Closed File: analyze without version (stat-based key)",
            "value": 0.5437182254196643,
            "unit": "ms"
          },
          {
            "name": "Cross-file: compile main with inherited utils",
            "value": 0.19777149538745387,
            "unit": "ms"
          },
          {
            "name": "Cross-file: recompile main (cache hit)",
            "value": 0.19642390215384617,
            "unit": "ms"
          },
          {
            "name": "resolveStdlib(\"Stdio\") - warm",
            "value": 1.634461193853428,
            "unit": "ms"
          },
          {
            "name": "resolveStdlib(\"String\")",
            "value": 0.3600304243562232,
            "unit": "ms"
          },
          {
            "name": "resolveStdlib(\"Array\")",
            "value": 0.3459067227671657,
            "unit": "ms"
          },
          {
            "name": "resolveStdlib(\"Mapping\")",
            "value": 0.10240299258760108,
            "unit": "ms"
          },
          {
            "name": "resolveStdlib(\"Stdio.File\") - nested",
            "value": 0.5799330366269165,
            "unit": "ms"
          },
          {
            "name": "resolveStdlib(\"String.SplitIterator\") - nested",
            "value": 0.08241624283917842,
            "unit": "ms"
          },
          {
            "name": "First diagnostic after document change",
            "value": 0.3958985593620791,
            "unit": "ms"
          },
          {
            "name": "Validation with 250ms debounce (default)",
            "value": 250.56875508333334,
            "unit": "ms"
          },
          {
            "name": "Rapid edit simulation (debounce coalescing)",
            "value": 252.56133708333334,
            "unit": "ms"
          },
          {
            "name": "Hover: resolveStdlib(\"Stdio.File\")",
            "value": 0.5811123427109974,
            "unit": "ms"
          },
          {
            "name": "Hover: resolveModule(\"Stdio.File\")",
            "value": 0.08466870261391231,
            "unit": "ms"
          },
          {
            "name": "Completion: getCompletionContext (Large File, Warm Cache)",
            "value": 5.643434371900827,
            "unit": "ms"
          },
          {
            "name": "Completion: getCompletionContext (Large File, Cold Cache)",
            "value": 5.621559214876033,
            "unit": "ms"
          }
        ]
      },
      {
        "commit": {
          "author": {
            "email": "therealsmuks@gmail.com",
            "name": "TheSmuks",
            "username": "TheSmuks"
          },
          "committer": {
            "email": "therealsmuks@gmail.com",
            "name": "TheSmuks",
            "username": "TheSmuks"
          },
          "distinct": true,
          "id": "ccb73dcccb08cea6d3e730cc30376e17740d9238",
          "message": "docs(project): add workflow protocols and Pike code style guidelines to CLAUDE.md\n\n- Add Workflow Protocols section with quick reference for agents\n- Add Proper Pike Code Style section covering:\n  - Naming conventions (snake_case, PascalCase)\n  - Pike 8.0.1116 compatibility (String.trim_all_whites vs String.trim)\n  - JSON-RPC handler pattern template\n  - Data structures (arrays, mappings, multisets)\n  - Common patterns (foreach, type checking, string/array ops)\n  - Module loading pattern\n  - Anti-patterns to avoid\n\nThis enables all agents to automatically see proper Pike idioms\nwhen working on the project, without needing to reference external\nskill files.",
          "timestamp": "2026-02-06T18:59:29+01:00",
          "tree_id": "9c223e3c5a30569e3248697ebacd5455f0eee381",
          "url": "https://github.com/TheSmuks/pike-lsp/commit/ccb73dcccb08cea6d3e730cc30376e17740d9238"
        },
        "date": 1770415205916,
        "tool": "customSmallerIsBetter",
        "benches": [
          {
            "name": "PikeBridge.start() [Cold Start]",
            "value": 201.058527,
            "unit": "ms"
          },
          {
            "name": "PikeBridge.start() with detailed metrics [Cold Start]",
            "value": 245.52440025,
            "unit": "ms"
          },
          {
            "name": "Cold Start + First Request (getVersionInfo)",
            "value": 246.46528141666667,
            "unit": "ms"
          },
          {
            "name": "Cold Start + Introspect",
            "value": 249.9240075,
            "unit": "ms"
          },
          {
            "name": "Validation: Small File (~15 lines)",
            "value": 1.1070606135265701,
            "unit": "ms"
          },
          {
            "name": "Validation: Medium File (~100 lines)",
            "value": 3.6203096157894734,
            "unit": "ms"
          },
          {
            "name": "Validation: Large File (~1000 lines)",
            "value": 42.59911838461539,
            "unit": "ms"
          },
          {
            "name": "Validation Legacy (3 calls: analyze + parse + analyzeUninitialized)",
            "value": 4.482688065359477,
            "unit": "ms"
          },
          {
            "name": "Validation Consolidated (1 call: analyze with all includes)",
            "value": 3.58215528125,
            "unit": "ms"
          },
          {
            "name": "Cache Hit: analyze with same document version",
            "value": 0.24277451019664967,
            "unit": "ms"
          },
          {
            "name": "Cache Miss: analyze with different version",
            "value": 0.2465868393574297,
            "unit": "ms"
          },
          {
            "name": "Closed File: analyze without version (stat-based key)",
            "value": 0.5218962152671756,
            "unit": "ms"
          },
          {
            "name": "Cross-file: compile main with inherited utils",
            "value": 0.1480583885021334,
            "unit": "ms"
          },
          {
            "name": "Cross-file: recompile main (cache hit)",
            "value": 0.1394582493115865,
            "unit": "ms"
          },
          {
            "name": "resolveStdlib(\"Stdio\") - warm",
            "value": 1.6173783504672898,
            "unit": "ms"
          },
          {
            "name": "resolveStdlib(\"String\")",
            "value": 0.3234096514719848,
            "unit": "ms"
          },
          {
            "name": "resolveStdlib(\"Array\")",
            "value": 0.32120128349788435,
            "unit": "ms"
          },
          {
            "name": "resolveStdlib(\"Mapping\")",
            "value": 0.08001581211218664,
            "unit": "ms"
          },
          {
            "name": "resolveStdlib(\"Stdio.File\") - nested",
            "value": 0.5403793150039277,
            "unit": "ms"
          },
          {
            "name": "resolveStdlib(\"String.SplitIterator\") - nested",
            "value": 0.0580412026977539,
            "unit": "ms"
          },
          {
            "name": "First diagnostic after document change",
            "value": 0.35470845800730305,
            "unit": "ms"
          },
          {
            "name": "Validation with 250ms debounce (default)",
            "value": 250.35463533333333,
            "unit": "ms"
          },
          {
            "name": "Rapid edit simulation (debounce coalescing)",
            "value": 252.56776533333334,
            "unit": "ms"
          },
          {
            "name": "Hover: resolveStdlib(\"Stdio.File\")",
            "value": 0.5485264182692308,
            "unit": "ms"
          },
          {
            "name": "Hover: resolveModule(\"Stdio.File\")",
            "value": 0.05871328329613095,
            "unit": "ms"
          },
          {
            "name": "Completion: getCompletionContext (Large File, Warm Cache)",
            "value": 5.390392566929133,
            "unit": "ms"
          },
          {
            "name": "Completion: getCompletionContext (Large File, Cold Cache)",
            "value": 5.36120559055118,
            "unit": "ms"
          }
        ]
      },
      {
        "commit": {
          "author": {
            "name": "TheSmuks",
            "username": "TheSmuks"
          },
          "committer": {
            "name": "TheSmuks",
            "username": "TheSmuks"
          },
          "id": "709c1eeada8fce9d29d113b87fb98f3a3411a56f",
          "message": "chore(agents): add comprehensive agent team protocols",
          "timestamp": "2026-02-06T21:58:44Z",
          "url": "https://github.com/TheSmuks/pike-lsp/pull/2/commits/709c1eeada8fce9d29d113b87fb98f3a3411a56f"
        },
        "date": 1770470104537,
        "tool": "customSmallerIsBetter",
        "benches": [
          {
            "name": "PikeBridge.start() [Cold Start]",
            "value": 201.46505058333335,
            "unit": "ms"
          },
          {
            "name": "PikeBridge.start() with detailed metrics [Cold Start]",
            "value": 246.29660525,
            "unit": "ms"
          },
          {
            "name": "Cold Start + First Request (getVersionInfo)",
            "value": 246.34418883333333,
            "unit": "ms"
          },
          {
            "name": "Cold Start + Introspect",
            "value": 250.9716455,
            "unit": "ms"
          },
          {
            "name": "Validation: Small File (~15 lines)",
            "value": 1.0985052044374009,
            "unit": "ms"
          },
          {
            "name": "Validation: Medium File (~100 lines)",
            "value": 3.491396045685279,
            "unit": "ms"
          },
          {
            "name": "Validation: Large File (~1000 lines)",
            "value": 42.347562230769235,
            "unit": "ms"
          },
          {
            "name": "Validation Legacy (3 calls: analyze + parse + analyzeUninitialized)",
            "value": 4.6234062348993294,
            "unit": "ms"
          },
          {
            "name": "Validation Consolidated (1 call: analyze with all includes)",
            "value": 3.417385149253731,
            "unit": "ms"
          },
          {
            "name": "Cache Hit: analyze with same document version",
            "value": 0.2308527828902522,
            "unit": "ms"
          },
          {
            "name": "Cache Miss: analyze with different version",
            "value": 0.22602875108441775,
            "unit": "ms"
          },
          {
            "name": "Closed File: analyze without version (stat-based key)",
            "value": 0.5110043794642858,
            "unit": "ms"
          },
          {
            "name": "Cross-file: compile main with inherited utils",
            "value": 0.15990374346563407,
            "unit": "ms"
          },
          {
            "name": "Cross-file: recompile main (cache hit)",
            "value": 0.15353969493109088,
            "unit": "ms"
          },
          {
            "name": "resolveStdlib(\"Stdio\") - warm",
            "value": 1.6155656378504673,
            "unit": "ms"
          },
          {
            "name": "resolveStdlib(\"String\")",
            "value": 0.32436358851447555,
            "unit": "ms"
          },
          {
            "name": "resolveStdlib(\"Array\")",
            "value": 0.349226118852459,
            "unit": "ms"
          },
          {
            "name": "resolveStdlib(\"Mapping\")",
            "value": 0.08708736736356232,
            "unit": "ms"
          },
          {
            "name": "resolveStdlib(\"Stdio.File\") - nested",
            "value": 0.556958016194332,
            "unit": "ms"
          },
          {
            "name": "resolveStdlib(\"String.SplitIterator\") - nested",
            "value": 0.06438907236909258,
            "unit": "ms"
          },
          {
            "name": "First diagnostic after document change",
            "value": 0.34247709884596084,
            "unit": "ms"
          },
          {
            "name": "Validation with 250ms debounce (default)",
            "value": 251.17356191666667,
            "unit": "ms"
          },
          {
            "name": "Rapid edit simulation (debounce coalescing)",
            "value": 254.85356291666665,
            "unit": "ms"
          },
          {
            "name": "Hover: resolveStdlib(\"Stdio.File\")",
            "value": 0.567564289017341,
            "unit": "ms"
          },
          {
            "name": "Hover: resolveModule(\"Stdio.File\")",
            "value": 0.06710382130002117,
            "unit": "ms"
          },
          {
            "name": "Completion: getCompletionContext (Large File, Warm Cache)",
            "value": 5.436717624,
            "unit": "ms"
          },
          {
            "name": "Completion: getCompletionContext (Large File, Cold Cache)",
            "value": 5.379774937007874,
            "unit": "ms"
          }
        ]
      },
      {
        "commit": {
          "author": {
            "name": "TheSmuks",
            "username": "TheSmuks"
          },
          "committer": {
            "name": "TheSmuks",
            "username": "TheSmuks"
          },
          "id": "a0b884f94fb43fe2cd7b90f1aa25ff551786a846",
          "message": "chore(agents): add comprehensive agent team protocols",
          "timestamp": "2026-02-06T21:58:44Z",
          "url": "https://github.com/TheSmuks/pike-lsp/pull/2/commits/a0b884f94fb43fe2cd7b90f1aa25ff551786a846"
        },
        "date": 1770470182152,
        "tool": "customSmallerIsBetter",
        "benches": [
          {
            "name": "PikeBridge.start() [Cold Start]",
            "value": 201.14418166666667,
            "unit": "ms"
          },
          {
            "name": "PikeBridge.start() with detailed metrics [Cold Start]",
            "value": 249.29738666666665,
            "unit": "ms"
          },
          {
            "name": "Cold Start + First Request (getVersionInfo)",
            "value": 248.21294883333334,
            "unit": "ms"
          },
          {
            "name": "Cold Start + Introspect",
            "value": 253.99388633333334,
            "unit": "ms"
          },
          {
            "name": "Validation: Small File (~15 lines)",
            "value": 1.1433081227197346,
            "unit": "ms"
          },
          {
            "name": "Validation: Medium File (~100 lines)",
            "value": 3.7721432472527474,
            "unit": "ms"
          },
          {
            "name": "Validation: Large File (~1000 lines)",
            "value": 46.80802575,
            "unit": "ms"
          },
          {
            "name": "Validation Legacy (3 calls: analyze + parse + analyzeUninitialized)",
            "value": 4.812841753521127,
            "unit": "ms"
          },
          {
            "name": "Validation Consolidated (1 call: analyze with all includes)",
            "value": 3.7576891639344265,
            "unit": "ms"
          },
          {
            "name": "Cache Hit: analyze with same document version",
            "value": 0.2639251670653907,
            "unit": "ms"
          },
          {
            "name": "Cache Miss: analyze with different version",
            "value": 0.2618762181314331,
            "unit": "ms"
          },
          {
            "name": "Closed File: analyze without version (stat-based key)",
            "value": 0.535900182821119,
            "unit": "ms"
          },
          {
            "name": "Cross-file: compile main with inherited utils",
            "value": 0.20007730704488777,
            "unit": "ms"
          },
          {
            "name": "Cross-file: recompile main (cache hit)",
            "value": 0.18412367724257284,
            "unit": "ms"
          },
          {
            "name": "resolveStdlib(\"Stdio\") - warm",
            "value": 1.663738508433735,
            "unit": "ms"
          },
          {
            "name": "resolveStdlib(\"String\")",
            "value": 0.35909183636363634,
            "unit": "ms"
          },
          {
            "name": "resolveStdlib(\"Array\")",
            "value": 0.3507120967573222,
            "unit": "ms"
          },
          {
            "name": "resolveStdlib(\"Mapping\")",
            "value": 0.09213725229357798,
            "unit": "ms"
          },
          {
            "name": "resolveStdlib(\"Stdio.File\") - nested",
            "value": 0.565250115448505,
            "unit": "ms"
          },
          {
            "name": "resolveStdlib(\"String.SplitIterator\") - nested",
            "value": 0.07475385378022259,
            "unit": "ms"
          },
          {
            "name": "First diagnostic after document change",
            "value": 0.3791946800452233,
            "unit": "ms"
          },
          {
            "name": "Validation with 250ms debounce (default)",
            "value": 250.75547483333335,
            "unit": "ms"
          },
          {
            "name": "Rapid edit simulation (debounce coalescing)",
            "value": 253.6934495,
            "unit": "ms"
          },
          {
            "name": "Hover: resolveStdlib(\"Stdio.File\")",
            "value": 0.5622297475247525,
            "unit": "ms"
          },
          {
            "name": "Hover: resolveModule(\"Stdio.File\")",
            "value": 0.08443091847748899,
            "unit": "ms"
          },
          {
            "name": "Completion: getCompletionContext (Large File, Warm Cache)",
            "value": 5.678489575,
            "unit": "ms"
          },
          {
            "name": "Completion: getCompletionContext (Large File, Cold Cache)",
            "value": 5.612018639344262,
            "unit": "ms"
          }
        ]
      },
      {
        "commit": {
          "author": {
            "name": "TheSmuks",
            "username": "TheSmuks"
          },
          "committer": {
            "name": "TheSmuks",
            "username": "TheSmuks"
          },
          "id": "db94a5ce285b3c0ac7671d56e500cb1ee130c024",
          "message": "chore(agents): add comprehensive agent team protocols",
          "timestamp": "2026-02-06T21:58:44Z",
          "url": "https://github.com/TheSmuks/pike-lsp/pull/2/commits/db94a5ce285b3c0ac7671d56e500cb1ee130c024"
        },
        "date": 1770470387329,
        "tool": "customSmallerIsBetter",
        "benches": [
          {
            "name": "PikeBridge.start() [Cold Start]",
            "value": 202.82492475,
            "unit": "ms"
          },
          {
            "name": "PikeBridge.start() with detailed metrics [Cold Start]",
            "value": 249.96279208333334,
            "unit": "ms"
          },
          {
            "name": "Cold Start + First Request (getVersionInfo)",
            "value": 251.13601308333335,
            "unit": "ms"
          },
          {
            "name": "Cold Start + Introspect",
            "value": 255.00484983333334,
            "unit": "ms"
          },
          {
            "name": "Validation: Small File (~15 lines)",
            "value": 1.2203265433628319,
            "unit": "ms"
          },
          {
            "name": "Validation: Medium File (~100 lines)",
            "value": 3.89115575,
            "unit": "ms"
          },
          {
            "name": "Validation: Large File (~1000 lines)",
            "value": 47.696349909090905,
            "unit": "ms"
          },
          {
            "name": "Validation Legacy (3 calls: analyze + parse + analyzeUninitialized)",
            "value": 4.857828269503546,
            "unit": "ms"
          },
          {
            "name": "Validation Consolidated (1 call: analyze with all includes)",
            "value": 3.8449950111731845,
            "unit": "ms"
          },
          {
            "name": "Cache Hit: analyze with same document version",
            "value": 0.2834469910141207,
            "unit": "ms"
          },
          {
            "name": "Cache Miss: analyze with different version",
            "value": 0.2722421354679803,
            "unit": "ms"
          },
          {
            "name": "Closed File: analyze without version (stat-based key)",
            "value": 0.5704586255247691,
            "unit": "ms"
          },
          {
            "name": "Cross-file: compile main with inherited utils",
            "value": 0.20342115340909092,
            "unit": "ms"
          },
          {
            "name": "Cross-file: recompile main (cache hit)",
            "value": 0.1928420255792958,
            "unit": "ms"
          },
          {
            "name": "resolveStdlib(\"Stdio\") - warm",
            "value": 1.6418453325415678,
            "unit": "ms"
          },
          {
            "name": "resolveStdlib(\"String\")",
            "value": 0.38707948504027617,
            "unit": "ms"
          },
          {
            "name": "resolveStdlib(\"Array\")",
            "value": 0.37016363781697903,
            "unit": "ms"
          },
          {
            "name": "resolveStdlib(\"Mapping\")",
            "value": 0.10668332902323957,
            "unit": "ms"
          },
          {
            "name": "resolveStdlib(\"Stdio.File\") - nested",
            "value": 0.6157071924119242,
            "unit": "ms"
          },
          {
            "name": "resolveStdlib(\"String.SplitIterator\") - nested",
            "value": 0.08202450242752114,
            "unit": "ms"
          },
          {
            "name": "First diagnostic after document change",
            "value": 0.3815141811470755,
            "unit": "ms"
          },
          {
            "name": "Validation with 250ms debounce (default)",
            "value": 251.23437008333335,
            "unit": "ms"
          },
          {
            "name": "Rapid edit simulation (debounce coalescing)",
            "value": 255.25099908333334,
            "unit": "ms"
          },
          {
            "name": "Hover: resolveStdlib(\"Stdio.File\")",
            "value": 0.5724668874895047,
            "unit": "ms"
          },
          {
            "name": "Hover: resolveModule(\"Stdio.File\")",
            "value": 0.08841460888888888,
            "unit": "ms"
          },
          {
            "name": "Completion: getCompletionContext (Large File, Warm Cache)",
            "value": 6.104547781818182,
            "unit": "ms"
          },
          {
            "name": "Completion: getCompletionContext (Large File, Cold Cache)",
            "value": 5.645933710743802,
            "unit": "ms"
          }
        ]
      },
      {
        "commit": {
          "author": {
            "name": "TheSmuks",
            "username": "TheSmuks"
          },
          "committer": {
            "name": "TheSmuks",
            "username": "TheSmuks"
          },
          "id": "c0465ffb57447dbf303d854635aae754d876d906",
          "message": "chore(agents): add comprehensive agent team protocols",
          "timestamp": "2026-02-06T21:58:44Z",
          "url": "https://github.com/TheSmuks/pike-lsp/pull/2/commits/c0465ffb57447dbf303d854635aae754d876d906"
        },
        "date": 1770470483483,
        "tool": "customSmallerIsBetter",
        "benches": [
          {
            "name": "PikeBridge.start() [Cold Start]",
            "value": 202.61867216666667,
            "unit": "ms"
          },
          {
            "name": "PikeBridge.start() with detailed metrics [Cold Start]",
            "value": 249.12986175,
            "unit": "ms"
          },
          {
            "name": "Cold Start + First Request (getVersionInfo)",
            "value": 250.17939458333333,
            "unit": "ms"
          },
          {
            "name": "Cold Start + Introspect",
            "value": 254.30133275,
            "unit": "ms"
          },
          {
            "name": "Validation: Small File (~15 lines)",
            "value": 1.1845996099656357,
            "unit": "ms"
          },
          {
            "name": "Validation: Medium File (~100 lines)",
            "value": 3.895822051136364,
            "unit": "ms"
          },
          {
            "name": "Validation: Large File (~1000 lines)",
            "value": 47.37161918181818,
            "unit": "ms"
          },
          {
            "name": "Validation Legacy (3 calls: analyze + parse + analyzeUninitialized)",
            "value": 4.877134535714285,
            "unit": "ms"
          },
          {
            "name": "Validation Consolidated (1 call: analyze with all includes)",
            "value": 3.817685216666667,
            "unit": "ms"
          },
          {
            "name": "Cache Hit: analyze with same document version",
            "value": 0.28623235609334485,
            "unit": "ms"
          },
          {
            "name": "Cache Miss: analyze with different version",
            "value": 0.2758964881299459,
            "unit": "ms"
          },
          {
            "name": "Closed File: analyze without version (stat-based key)",
            "value": 0.5409252567567568,
            "unit": "ms"
          },
          {
            "name": "Cross-file: compile main with inherited utils",
            "value": 0.19514199362670714,
            "unit": "ms"
          },
          {
            "name": "Cross-file: recompile main (cache hit)",
            "value": 0.1856017260075384,
            "unit": "ms"
          },
          {
            "name": "resolveStdlib(\"Stdio\") - warm",
            "value": 1.6339556879432626,
            "unit": "ms"
          },
          {
            "name": "resolveStdlib(\"String\")",
            "value": 0.3819955093590471,
            "unit": "ms"
          },
          {
            "name": "resolveStdlib(\"Array\")",
            "value": 0.37699193445378154,
            "unit": "ms"
          },
          {
            "name": "resolveStdlib(\"Mapping\")",
            "value": 0.10075091731437076,
            "unit": "ms"
          },
          {
            "name": "resolveStdlib(\"Stdio.File\") - nested",
            "value": 0.5994684315789474,
            "unit": "ms"
          },
          {
            "name": "resolveStdlib(\"String.SplitIterator\") - nested",
            "value": 0.07152818443483633,
            "unit": "ms"
          },
          {
            "name": "First diagnostic after document change",
            "value": 0.37988698082346306,
            "unit": "ms"
          },
          {
            "name": "Validation with 250ms debounce (default)",
            "value": 250.87996108333334,
            "unit": "ms"
          },
          {
            "name": "Rapid edit simulation (debounce coalescing)",
            "value": 254.91591866666667,
            "unit": "ms"
          },
          {
            "name": "Hover: resolveStdlib(\"Stdio.File\")",
            "value": 0.5993328683055312,
            "unit": "ms"
          },
          {
            "name": "Hover: resolveModule(\"Stdio.File\")",
            "value": 0.07371495964294694,
            "unit": "ms"
          },
          {
            "name": "Completion: getCompletionContext (Large File, Warm Cache)",
            "value": 5.907690391304348,
            "unit": "ms"
          },
          {
            "name": "Completion: getCompletionContext (Large File, Cold Cache)",
            "value": 5.852150318965517,
            "unit": "ms"
          }
        ]
      },
      {
        "commit": {
          "author": {
            "name": "TheSmuks",
            "username": "TheSmuks"
          },
          "committer": {
            "name": "TheSmuks",
            "username": "TheSmuks"
          },
          "id": "c5ed0abed3fdbd1721b841bcdba7b75d5d9f4827",
          "message": "chore(agents): add comprehensive agent team protocols",
          "timestamp": "2026-02-06T21:58:44Z",
          "url": "https://github.com/TheSmuks/pike-lsp/pull/2/commits/c5ed0abed3fdbd1721b841bcdba7b75d5d9f4827"
        },
        "date": 1770470564457,
        "tool": "customSmallerIsBetter",
        "benches": [
          {
            "name": "PikeBridge.start() [Cold Start]",
            "value": 202.6573875,
            "unit": "ms"
          },
          {
            "name": "PikeBridge.start() with detailed metrics [Cold Start]",
            "value": 250.99704891666664,
            "unit": "ms"
          },
          {
            "name": "Cold Start + First Request (getVersionInfo)",
            "value": 249.63964541666667,
            "unit": "ms"
          },
          {
            "name": "Cold Start + Introspect",
            "value": 254.84643725,
            "unit": "ms"
          },
          {
            "name": "Validation: Small File (~15 lines)",
            "value": 1.192265820069204,
            "unit": "ms"
          },
          {
            "name": "Validation: Medium File (~100 lines)",
            "value": 3.855032275280899,
            "unit": "ms"
          },
          {
            "name": "Validation: Large File (~1000 lines)",
            "value": 47.35921954545454,
            "unit": "ms"
          },
          {
            "name": "Validation Legacy (3 calls: analyze + parse + analyzeUninitialized)",
            "value": 4.868183171428571,
            "unit": "ms"
          },
          {
            "name": "Validation Consolidated (1 call: analyze with all includes)",
            "value": 3.7668201373626378,
            "unit": "ms"
          },
          {
            "name": "Cache Hit: analyze with same document version",
            "value": 0.2820590744997871,
            "unit": "ms"
          },
          {
            "name": "Cache Miss: analyze with different version",
            "value": 0.27277494936187735,
            "unit": "ms"
          },
          {
            "name": "Closed File: analyze without version (stat-based key)",
            "value": 0.5532284153094463,
            "unit": "ms"
          },
          {
            "name": "Cross-file: compile main with inherited utils",
            "value": 0.20478345600756861,
            "unit": "ms"
          },
          {
            "name": "Cross-file: recompile main (cache hit)",
            "value": 0.1883044192009541,
            "unit": "ms"
          },
          {
            "name": "resolveStdlib(\"Stdio\") - warm",
            "value": 1.6314330070921985,
            "unit": "ms"
          },
          {
            "name": "resolveStdlib(\"String\")",
            "value": 0.3960295532039977,
            "unit": "ms"
          },
          {
            "name": "resolveStdlib(\"Array\")",
            "value": 0.41922063387297637,
            "unit": "ms"
          },
          {
            "name": "resolveStdlib(\"Mapping\")",
            "value": 0.1064053563718663,
            "unit": "ms"
          },
          {
            "name": "resolveStdlib(\"Stdio.File\") - nested",
            "value": 0.6225805228102189,
            "unit": "ms"
          },
          {
            "name": "resolveStdlib(\"String.SplitIterator\") - nested",
            "value": 0.08025863206002729,
            "unit": "ms"
          },
          {
            "name": "First diagnostic after document change",
            "value": 0.3821157819420784,
            "unit": "ms"
          },
          {
            "name": "Validation with 250ms debounce (default)",
            "value": 251.22004866666666,
            "unit": "ms"
          },
          {
            "name": "Rapid edit simulation (debounce coalescing)",
            "value": 254.91890091666664,
            "unit": "ms"
          },
          {
            "name": "Hover: resolveStdlib(\"Stdio.File\")",
            "value": 0.6014190934744268,
            "unit": "ms"
          },
          {
            "name": "Hover: resolveModule(\"Stdio.File\")",
            "value": 0.08998257218203737,
            "unit": "ms"
          },
          {
            "name": "Completion: getCompletionContext (Large File, Warm Cache)",
            "value": 5.803137435897436,
            "unit": "ms"
          },
          {
            "name": "Completion: getCompletionContext (Large File, Cold Cache)",
            "value": 5.74608162184874,
            "unit": "ms"
          }
        ]
      },
      {
        "commit": {
          "author": {
            "name": "TheSmuks",
            "username": "TheSmuks"
          },
          "committer": {
            "name": "TheSmuks",
            "username": "TheSmuks"
          },
          "id": "0bcb03542f1f5856085c259d1b9b23aa6fd3ee7d",
          "message": "chore(agents): add comprehensive agent team protocols",
          "timestamp": "2026-02-06T21:58:44Z",
          "url": "https://github.com/TheSmuks/pike-lsp/pull/2/commits/0bcb03542f1f5856085c259d1b9b23aa6fd3ee7d"
        },
        "date": 1770470898768,
        "tool": "customSmallerIsBetter",
        "benches": [
          {
            "name": "PikeBridge.start() [Cold Start]",
            "value": 201.04247041666665,
            "unit": "ms"
          },
          {
            "name": "PikeBridge.start() with detailed metrics [Cold Start]",
            "value": 245.878442,
            "unit": "ms"
          },
          {
            "name": "Cold Start + First Request (getVersionInfo)",
            "value": 246.07285416666664,
            "unit": "ms"
          },
          {
            "name": "Cold Start + Introspect",
            "value": 251.59586125,
            "unit": "ms"
          },
          {
            "name": "Validation: Small File (~15 lines)",
            "value": 1.0882418445839874,
            "unit": "ms"
          },
          {
            "name": "Validation: Medium File (~100 lines)",
            "value": 3.551921505154639,
            "unit": "ms"
          },
          {
            "name": "Validation: Large File (~1000 lines)",
            "value": 43.56730192307692,
            "unit": "ms"
          },
          {
            "name": "Validation Legacy (3 calls: analyze + parse + analyzeUninitialized)",
            "value": 4.483830607843137,
            "unit": "ms"
          },
          {
            "name": "Validation Consolidated (1 call: analyze with all includes)",
            "value": 3.4593357286432163,
            "unit": "ms"
          },
          {
            "name": "Cache Hit: analyze with same document version",
            "value": 0.24045805512091037,
            "unit": "ms"
          },
          {
            "name": "Cache Miss: analyze with different version",
            "value": 0.2325128880109928,
            "unit": "ms"
          },
          {
            "name": "Closed File: analyze without version (stat-based key)",
            "value": 0.49572238256484147,
            "unit": "ms"
          },
          {
            "name": "Cross-file: compile main with inherited utils",
            "value": 0.1454883872330961,
            "unit": "ms"
          },
          {
            "name": "Cross-file: recompile main (cache hit)",
            "value": 0.14569391502979473,
            "unit": "ms"
          },
          {
            "name": "resolveStdlib(\"Stdio\") - warm",
            "value": 1.63764731042654,
            "unit": "ms"
          },
          {
            "name": "resolveStdlib(\"String\")",
            "value": 0.3384267717987045,
            "unit": "ms"
          },
          {
            "name": "resolveStdlib(\"Array\")",
            "value": 0.33139658466763705,
            "unit": "ms"
          },
          {
            "name": "resolveStdlib(\"Mapping\")",
            "value": 0.08372934257579684,
            "unit": "ms"
          },
          {
            "name": "resolveStdlib(\"Stdio.File\") - nested",
            "value": 0.5516220721732157,
            "unit": "ms"
          },
          {
            "name": "resolveStdlib(\"String.SplitIterator\") - nested",
            "value": 0.05959907094882225,
            "unit": "ms"
          },
          {
            "name": "First diagnostic after document change",
            "value": 0.3407704837743385,
            "unit": "ms"
          },
          {
            "name": "Validation with 250ms debounce (default)",
            "value": 250.68102525,
            "unit": "ms"
          },
          {
            "name": "Rapid edit simulation (debounce coalescing)",
            "value": 253.25427708333333,
            "unit": "ms"
          },
          {
            "name": "Hover: resolveStdlib(\"Stdio.File\")",
            "value": 0.5307248487654321,
            "unit": "ms"
          },
          {
            "name": "Hover: resolveModule(\"Stdio.File\")",
            "value": 0.057334229654947916,
            "unit": "ms"
          },
          {
            "name": "Completion: getCompletionContext (Large File, Warm Cache)",
            "value": 5.5249656370967735,
            "unit": "ms"
          },
          {
            "name": "Completion: getCompletionContext (Large File, Cold Cache)",
            "value": 5.489446637096774,
            "unit": "ms"
          }
        ]
      },
      {
        "commit": {
          "author": {
            "name": "TheSmuks",
            "username": "TheSmuks"
          },
          "committer": {
            "name": "TheSmuks",
            "username": "TheSmuks"
          },
          "id": "517efceee0f423a7460ebdf1e17878f8eb6df571",
          "message": "chore(agents): add comprehensive agent team protocols",
          "timestamp": "2026-02-06T21:58:44Z",
          "url": "https://github.com/TheSmuks/pike-lsp/pull/2/commits/517efceee0f423a7460ebdf1e17878f8eb6df571"
        },
        "date": 1770471041907,
        "tool": "customSmallerIsBetter",
        "benches": [
          {
            "name": "PikeBridge.start() [Cold Start]",
            "value": 202.18690183333334,
            "unit": "ms"
          },
          {
            "name": "PikeBridge.start() with detailed metrics [Cold Start]",
            "value": 247.30252075,
            "unit": "ms"
          },
          {
            "name": "Cold Start + First Request (getVersionInfo)",
            "value": 245.27829916666667,
            "unit": "ms"
          },
          {
            "name": "Cold Start + Introspect",
            "value": 250.39168266666667,
            "unit": "ms"
          },
          {
            "name": "Validation: Small File (~15 lines)",
            "value": 1.1083497616,
            "unit": "ms"
          },
          {
            "name": "Validation: Medium File (~100 lines)",
            "value": 3.503617324873096,
            "unit": "ms"
          },
          {
            "name": "Validation: Large File (~1000 lines)",
            "value": 45.52753209090909,
            "unit": "ms"
          },
          {
            "name": "Validation Legacy (3 calls: analyze + parse + analyzeUninitialized)",
            "value": 4.628876027027027,
            "unit": "ms"
          },
          {
            "name": "Validation Consolidated (1 call: analyze with all includes)",
            "value": 3.5683267604166664,
            "unit": "ms"
          },
          {
            "name": "Cache Hit: analyze with same document version",
            "value": 0.24673769657184536,
            "unit": "ms"
          },
          {
            "name": "Cache Miss: analyze with different version",
            "value": 0.2595262723076923,
            "unit": "ms"
          },
          {
            "name": "Closed File: analyze without version (stat-based key)",
            "value": 0.48119775977653634,
            "unit": "ms"
          },
          {
            "name": "Cross-file: compile main with inherited utils",
            "value": 0.16321244030587076,
            "unit": "ms"
          },
          {
            "name": "Cross-file: recompile main (cache hit)",
            "value": 0.16371795997986408,
            "unit": "ms"
          },
          {
            "name": "resolveStdlib(\"Stdio\") - warm",
            "value": 1.6625169350961537,
            "unit": "ms"
          },
          {
            "name": "resolveStdlib(\"String\")",
            "value": 0.34301293721747866,
            "unit": "ms"
          },
          {
            "name": "resolveStdlib(\"Array\")",
            "value": 0.3172435716937355,
            "unit": "ms"
          },
          {
            "name": "resolveStdlib(\"Mapping\")",
            "value": 0.08640025147137508,
            "unit": "ms"
          },
          {
            "name": "resolveStdlib(\"Stdio.File\") - nested",
            "value": 0.5574491654501216,
            "unit": "ms"
          },
          {
            "name": "resolveStdlib(\"String.SplitIterator\") - nested",
            "value": 0.062240499287923176,
            "unit": "ms"
          },
          {
            "name": "First diagnostic after document change",
            "value": 0.33934680736684913,
            "unit": "ms"
          },
          {
            "name": "Validation with 250ms debounce (default)",
            "value": 250.38066216666667,
            "unit": "ms"
          },
          {
            "name": "Rapid edit simulation (debounce coalescing)",
            "value": 252.09457741666665,
            "unit": "ms"
          },
          {
            "name": "Hover: resolveStdlib(\"Stdio.File\")",
            "value": 0.5685880298013245,
            "unit": "ms"
          },
          {
            "name": "Hover: resolveModule(\"Stdio.File\")",
            "value": 0.06326205824788411,
            "unit": "ms"
          },
          {
            "name": "Completion: getCompletionContext (Large File, Warm Cache)",
            "value": 5.431432396825397,
            "unit": "ms"
          },
          {
            "name": "Completion: getCompletionContext (Large File, Cold Cache)",
            "value": 5.32824640625,
            "unit": "ms"
          }
        ]
      },
      {
        "commit": {
          "author": {
            "name": "TheSmuks",
            "username": "TheSmuks"
          },
          "committer": {
            "name": "TheSmuks",
            "username": "TheSmuks"
          },
          "id": "45c81cea9a7a596f09c4c6dcfe217f682804ce77",
          "message": "chore(agents): add comprehensive agent team protocols",
          "timestamp": "2026-02-06T21:58:44Z",
          "url": "https://github.com/TheSmuks/pike-lsp/pull/2/commits/45c81cea9a7a596f09c4c6dcfe217f682804ce77"
        },
        "date": 1770471200003,
        "tool": "customSmallerIsBetter",
        "benches": [
          {
            "name": "PikeBridge.start() [Cold Start]",
            "value": 201.92368466666665,
            "unit": "ms"
          },
          {
            "name": "PikeBridge.start() with detailed metrics [Cold Start]",
            "value": 249.61227908333333,
            "unit": "ms"
          },
          {
            "name": "Cold Start + First Request (getVersionInfo)",
            "value": 249.2994705,
            "unit": "ms"
          },
          {
            "name": "Cold Start + Introspect",
            "value": 254.77225766666666,
            "unit": "ms"
          },
          {
            "name": "Validation: Small File (~15 lines)",
            "value": 1.1593978403361345,
            "unit": "ms"
          },
          {
            "name": "Validation: Medium File (~100 lines)",
            "value": 3.841282877094972,
            "unit": "ms"
          },
          {
            "name": "Validation: Large File (~1000 lines)",
            "value": 47.40288336363637,
            "unit": "ms"
          },
          {
            "name": "Validation Legacy (3 calls: analyze + parse + analyzeUninitialized)",
            "value": 4.889333302158274,
            "unit": "ms"
          },
          {
            "name": "Validation Consolidated (1 call: analyze with all includes)",
            "value": 3.792579082872928,
            "unit": "ms"
          },
          {
            "name": "Cache Hit: analyze with same document version",
            "value": 0.2780223884228188,
            "unit": "ms"
          },
          {
            "name": "Cache Miss: analyze with different version",
            "value": 0.26666334661835744,
            "unit": "ms"
          },
          {
            "name": "Closed File: analyze without version (stat-based key)",
            "value": 0.5370756706161137,
            "unit": "ms"
          },
          {
            "name": "Cross-file: compile main with inherited utils",
            "value": 0.20153033825840933,
            "unit": "ms"
          },
          {
            "name": "Cross-file: recompile main (cache hit)",
            "value": 0.19098313070725156,
            "unit": "ms"
          },
          {
            "name": "resolveStdlib(\"Stdio\") - warm",
            "value": 1.650894624401914,
            "unit": "ms"
          },
          {
            "name": "resolveStdlib(\"String\")",
            "value": 0.36911770400878635,
            "unit": "ms"
          },
          {
            "name": "resolveStdlib(\"Array\")",
            "value": 0.3568593258904838,
            "unit": "ms"
          },
          {
            "name": "resolveStdlib(\"Mapping\")",
            "value": 0.10200565315013405,
            "unit": "ms"
          },
          {
            "name": "resolveStdlib(\"Stdio.File\") - nested",
            "value": 0.5595625373256767,
            "unit": "ms"
          },
          {
            "name": "resolveStdlib(\"String.SplitIterator\") - nested",
            "value": 0.07848498733671021,
            "unit": "ms"
          },
          {
            "name": "First diagnostic after document change",
            "value": 0.39357575381008203,
            "unit": "ms"
          },
          {
            "name": "Validation with 250ms debounce (default)",
            "value": 251.03892166666665,
            "unit": "ms"
          },
          {
            "name": "Rapid edit simulation (debounce coalescing)",
            "value": 254.06509108333336,
            "unit": "ms"
          },
          {
            "name": "Hover: resolveStdlib(\"Stdio.File\")",
            "value": 0.5618544187963725,
            "unit": "ms"
          },
          {
            "name": "Hover: resolveModule(\"Stdio.File\")",
            "value": 0.07678745020232346,
            "unit": "ms"
          },
          {
            "name": "Completion: getCompletionContext (Large File, Warm Cache)",
            "value": 5.767957796610169,
            "unit": "ms"
          },
          {
            "name": "Completion: getCompletionContext (Large File, Cold Cache)",
            "value": 5.71465519327731,
            "unit": "ms"
          }
        ]
      },
      {
        "commit": {
          "author": {
            "name": "TheSmuks",
            "username": "TheSmuks"
          },
          "committer": {
            "name": "TheSmuks",
            "username": "TheSmuks"
          },
          "id": "7c256adc4794c63f2a08ef01eac8bae4f46741c7",
          "message": "chore(ci): add required status checks and PR requirement",
          "timestamp": "2026-02-06T21:58:44Z",
          "url": "https://github.com/TheSmuks/pike-lsp/pull/3/commits/7c256adc4794c63f2a08ef01eac8bae4f46741c7"
        },
        "date": 1770472070349,
        "tool": "customSmallerIsBetter",
        "benches": [
          {
            "name": "PikeBridge.start() [Cold Start]",
            "value": 201.13308825,
            "unit": "ms"
          },
          {
            "name": "PikeBridge.start() with detailed metrics [Cold Start]",
            "value": 249.12189491666666,
            "unit": "ms"
          },
          {
            "name": "Cold Start + First Request (getVersionInfo)",
            "value": 248.09679591666665,
            "unit": "ms"
          },
          {
            "name": "Cold Start + Introspect",
            "value": 254.14297833333333,
            "unit": "ms"
          },
          {
            "name": "Validation: Small File (~15 lines)",
            "value": 1.1925721366782007,
            "unit": "ms"
          },
          {
            "name": "Validation: Medium File (~100 lines)",
            "value": 3.886491220338983,
            "unit": "ms"
          },
          {
            "name": "Validation: Large File (~1000 lines)",
            "value": 47.590885,
            "unit": "ms"
          },
          {
            "name": "Validation Legacy (3 calls: analyze + parse + analyzeUninitialized)",
            "value": 4.874326557142857,
            "unit": "ms"
          },
          {
            "name": "Validation Consolidated (1 call: analyze with all includes)",
            "value": 3.824403638888889,
            "unit": "ms"
          },
          {
            "name": "Cache Hit: analyze with same document version",
            "value": 0.2864559424740485,
            "unit": "ms"
          },
          {
            "name": "Cache Miss: analyze with different version",
            "value": 0.29042309190371995,
            "unit": "ms"
          },
          {
            "name": "Closed File: analyze without version (stat-based key)",
            "value": 0.5545387858306189,
            "unit": "ms"
          },
          {
            "name": "Cross-file: compile main with inherited utils",
            "value": 0.20654971301020408,
            "unit": "ms"
          },
          {
            "name": "Cross-file: recompile main (cache hit)",
            "value": 0.18205180995082443,
            "unit": "ms"
          },
          {
            "name": "resolveStdlib(\"Stdio\") - warm",
            "value": 1.667625345410628,
            "unit": "ms"
          },
          {
            "name": "resolveStdlib(\"String\")",
            "value": 0.3912582588714369,
            "unit": "ms"
          },
          {
            "name": "resolveStdlib(\"Array\")",
            "value": 0.36674760710382515,
            "unit": "ms"
          },
          {
            "name": "resolveStdlib(\"Mapping\")",
            "value": 0.10269112691724254,
            "unit": "ms"
          },
          {
            "name": "resolveStdlib(\"Stdio.File\") - nested",
            "value": 0.6330001558441558,
            "unit": "ms"
          },
          {
            "name": "resolveStdlib(\"String.SplitIterator\") - nested",
            "value": 0.0808783696070349,
            "unit": "ms"
          },
          {
            "name": "First diagnostic after document change",
            "value": 0.3804255590729226,
            "unit": "ms"
          },
          {
            "name": "Validation with 250ms debounce (default)",
            "value": 250.67646441666665,
            "unit": "ms"
          },
          {
            "name": "Rapid edit simulation (debounce coalescing)",
            "value": 252.53323441666666,
            "unit": "ms"
          },
          {
            "name": "Hover: resolveStdlib(\"Stdio.File\")",
            "value": 0.5905255385281385,
            "unit": "ms"
          },
          {
            "name": "Hover: resolveModule(\"Stdio.File\")",
            "value": 0.08595501856686974,
            "unit": "ms"
          },
          {
            "name": "Completion: getCompletionContext (Large File, Warm Cache)",
            "value": 5.740323739495798,
            "unit": "ms"
          },
          {
            "name": "Completion: getCompletionContext (Large File, Cold Cache)",
            "value": 5.724940453781513,
            "unit": "ms"
          }
        ]
      },
      {
        "commit": {
          "author": {
            "name": "TheSmuks",
            "username": "TheSmuks"
          },
          "committer": {
            "name": "TheSmuks",
            "username": "TheSmuks"
          },
          "id": "51e57a6b7bb4a335a4fd856bc3811c30481bcceb",
          "message": "feat(agents): add seed-based test subsampling",
          "timestamp": "2026-02-06T21:58:44Z",
          "url": "https://github.com/TheSmuks/pike-lsp/pull/4/commits/51e57a6b7bb4a335a4fd856bc3811c30481bcceb"
        },
        "date": 1770472701688,
        "tool": "customSmallerIsBetter",
        "benches": [
          {
            "name": "PikeBridge.start() [Cold Start]",
            "value": 201.56213841666667,
            "unit": "ms"
          },
          {
            "name": "PikeBridge.start() with detailed metrics [Cold Start]",
            "value": 252.260234,
            "unit": "ms"
          },
          {
            "name": "Cold Start + First Request (getVersionInfo)",
            "value": 252.19269741666665,
            "unit": "ms"
          },
          {
            "name": "Cold Start + Introspect",
            "value": 254.49977958333335,
            "unit": "ms"
          },
          {
            "name": "Validation: Small File (~15 lines)",
            "value": 1.1719121731748727,
            "unit": "ms"
          },
          {
            "name": "Validation: Medium File (~100 lines)",
            "value": 3.9982992573099416,
            "unit": "ms"
          },
          {
            "name": "Validation: Large File (~1000 lines)",
            "value": 49.529219090909095,
            "unit": "ms"
          },
          {
            "name": "Validation Legacy (3 calls: analyze + parse + analyzeUninitialized)",
            "value": 5.248817790697674,
            "unit": "ms"
          },
          {
            "name": "Validation Consolidated (1 call: analyze with all includes)",
            "value": 3.91655224,
            "unit": "ms"
          },
          {
            "name": "Cache Hit: analyze with same document version",
            "value": 0.2900445146480105,
            "unit": "ms"
          },
          {
            "name": "Cache Miss: analyze with different version",
            "value": 0.28435831016731017,
            "unit": "ms"
          },
          {
            "name": "Closed File: analyze without version (stat-based key)",
            "value": 0.5662605834724541,
            "unit": "ms"
          },
          {
            "name": "Cross-file: compile main with inherited utils",
            "value": 0.20125736156250001,
            "unit": "ms"
          },
          {
            "name": "Cross-file: recompile main (cache hit)",
            "value": 0.18417624260694804,
            "unit": "ms"
          },
          {
            "name": "resolveStdlib(\"Stdio\") - warm",
            "value": 1.679328082725061,
            "unit": "ms"
          },
          {
            "name": "resolveStdlib(\"String\")",
            "value": 0.37430767966573814,
            "unit": "ms"
          },
          {
            "name": "resolveStdlib(\"Array\")",
            "value": 0.37523377361654553,
            "unit": "ms"
          },
          {
            "name": "resolveStdlib(\"Mapping\")",
            "value": 0.11728496242884251,
            "unit": "ms"
          },
          {
            "name": "resolveStdlib(\"Stdio.File\") - nested",
            "value": 0.596503819614711,
            "unit": "ms"
          },
          {
            "name": "resolveStdlib(\"String.SplitIterator\") - nested",
            "value": 0.0915462423359902,
            "unit": "ms"
          },
          {
            "name": "First diagnostic after document change",
            "value": 0.39887761652794296,
            "unit": "ms"
          },
          {
            "name": "Validation with 250ms debounce (default)",
            "value": 250.98829808333335,
            "unit": "ms"
          },
          {
            "name": "Rapid edit simulation (debounce coalescing)",
            "value": 255.61737366666665,
            "unit": "ms"
          },
          {
            "name": "Hover: resolveStdlib(\"Stdio.File\")",
            "value": 0.5765783234546994,
            "unit": "ms"
          },
          {
            "name": "Hover: resolveModule(\"Stdio.File\")",
            "value": 0.09195040254367147,
            "unit": "ms"
          },
          {
            "name": "Completion: getCompletionContext (Large File, Warm Cache)",
            "value": 6.026843769911505,
            "unit": "ms"
          },
          {
            "name": "Completion: getCompletionContext (Large File, Cold Cache)",
            "value": 5.905987182608696,
            "unit": "ms"
          }
        ]
      },
      {
        "commit": {
          "author": {
            "name": "TheSmuks",
            "username": "TheSmuks"
          },
          "committer": {
            "name": "TheSmuks",
            "username": "TheSmuks"
          },
          "id": "1fae2e147c2bae4a70b8af9b526daa8b0ea9b92d",
          "message": "test: convert Tier 1 placeholder tests to real assertions",
          "timestamp": "2026-02-06T21:58:44Z",
          "url": "https://github.com/TheSmuks/pike-lsp/pull/5/commits/1fae2e147c2bae4a70b8af9b526daa8b0ea9b92d"
        },
        "date": 1770472874453,
        "tool": "customSmallerIsBetter",
        "benches": [
          {
            "name": "PikeBridge.start() [Cold Start]",
            "value": 202.66793841666666,
            "unit": "ms"
          },
          {
            "name": "PikeBridge.start() with detailed metrics [Cold Start]",
            "value": 249.71399241666666,
            "unit": "ms"
          },
          {
            "name": "Cold Start + First Request (getVersionInfo)",
            "value": 249.15134466666666,
            "unit": "ms"
          },
          {
            "name": "Cold Start + Introspect",
            "value": 254.07481925,
            "unit": "ms"
          },
          {
            "name": "Validation: Small File (~15 lines)",
            "value": 1.2063987653239931,
            "unit": "ms"
          },
          {
            "name": "Validation: Medium File (~100 lines)",
            "value": 3.8135998388888885,
            "unit": "ms"
          },
          {
            "name": "Validation: Large File (~1000 lines)",
            "value": 46.66858358333334,
            "unit": "ms"
          },
          {
            "name": "Validation Legacy (3 calls: analyze + parse + analyzeUninitialized)",
            "value": 4.965354547445255,
            "unit": "ms"
          },
          {
            "name": "Validation Consolidated (1 call: analyze with all includes)",
            "value": 3.7940540220994476,
            "unit": "ms"
          },
          {
            "name": "Cache Hit: analyze with same document version",
            "value": 0.26833407826439576,
            "unit": "ms"
          },
          {
            "name": "Cache Miss: analyze with different version",
            "value": 0.27672266220735786,
            "unit": "ms"
          },
          {
            "name": "Closed File: analyze without version (stat-based key)",
            "value": 0.5527501356620633,
            "unit": "ms"
          },
          {
            "name": "Cross-file: compile main with inherited utils",
            "value": 0.19405207466266866,
            "unit": "ms"
          },
          {
            "name": "Cross-file: recompile main (cache hit)",
            "value": 0.18567464174271417,
            "unit": "ms"
          },
          {
            "name": "resolveStdlib(\"Stdio\") - warm",
            "value": 1.6362940118483411,
            "unit": "ms"
          },
          {
            "name": "resolveStdlib(\"String\")",
            "value": 0.3990153160714286,
            "unit": "ms"
          },
          {
            "name": "resolveStdlib(\"Array\")",
            "value": 0.3463913520908622,
            "unit": "ms"
          },
          {
            "name": "resolveStdlib(\"Mapping\")",
            "value": 0.10738553170130327,
            "unit": "ms"
          },
          {
            "name": "resolveStdlib(\"Stdio.File\") - nested",
            "value": 0.5602031126644738,
            "unit": "ms"
          },
          {
            "name": "resolveStdlib(\"String.SplitIterator\") - nested",
            "value": 0.07516454843689695,
            "unit": "ms"
          },
          {
            "name": "First diagnostic after document change",
            "value": 0.36381657436452136,
            "unit": "ms"
          },
          {
            "name": "Validation with 250ms debounce (default)",
            "value": 250.898091,
            "unit": "ms"
          },
          {
            "name": "Rapid edit simulation (debounce coalescing)",
            "value": 254.69800458333333,
            "unit": "ms"
          },
          {
            "name": "Hover: resolveStdlib(\"Stdio.File\")",
            "value": 0.5728385302521007,
            "unit": "ms"
          },
          {
            "name": "Hover: resolveModule(\"Stdio.File\")",
            "value": 0.08031868509942795,
            "unit": "ms"
          },
          {
            "name": "Completion: getCompletionContext (Large File, Warm Cache)",
            "value": 5.719916394957983,
            "unit": "ms"
          },
          {
            "name": "Completion: getCompletionContext (Large File, Cold Cache)",
            "value": 5.706266291666667,
            "unit": "ms"
          }
        ]
      },
      {
        "commit": {
          "author": {
            "email": "60717893+TheSmuks@users.noreply.github.com",
            "name": "Smuks",
            "username": "TheSmuks"
          },
          "committer": {
            "email": "noreply@github.com",
            "name": "GitHub",
            "username": "web-flow"
          },
          "distinct": true,
          "id": "11c8faa9478c74fceb6e17fb193e4d0f2552df37",
          "message": "Merge pull request #3 from TheSmuks/chore/branch-protection\n\nchore(ci): add required status checks and PR requirement",
          "timestamp": "2026-02-07T15:04:30+01:00",
          "tree_id": "bdefeae85faa43f46d3af4f6c81172b652ff0f32",
          "url": "https://github.com/TheSmuks/pike-lsp/commit/11c8faa9478c74fceb6e17fb193e4d0f2552df37"
        },
        "date": 1770473162575,
        "tool": "customSmallerIsBetter",
        "benches": [
          {
            "name": "PikeBridge.start() [Cold Start]",
            "value": 202.43207583333336,
            "unit": "ms"
          },
          {
            "name": "PikeBridge.start() with detailed metrics [Cold Start]",
            "value": 249.77481483333335,
            "unit": "ms"
          },
          {
            "name": "Cold Start + First Request (getVersionInfo)",
            "value": 250.96226466666667,
            "unit": "ms"
          },
          {
            "name": "Cold Start + Introspect",
            "value": 254.71358633333335,
            "unit": "ms"
          },
          {
            "name": "Validation: Small File (~15 lines)",
            "value": 1.200044611498258,
            "unit": "ms"
          },
          {
            "name": "Validation: Medium File (~100 lines)",
            "value": 3.876921790960452,
            "unit": "ms"
          },
          {
            "name": "Validation: Large File (~1000 lines)",
            "value": 48.490158,
            "unit": "ms"
          },
          {
            "name": "Validation Legacy (3 calls: analyze + parse + analyzeUninitialized)",
            "value": 4.958777384057971,
            "unit": "ms"
          },
          {
            "name": "Validation Consolidated (1 call: analyze with all includes)",
            "value": 3.8422266983240223,
            "unit": "ms"
          },
          {
            "name": "Cache Hit: analyze with same document version",
            "value": 0.2650442364,
            "unit": "ms"
          },
          {
            "name": "Cache Miss: analyze with different version",
            "value": 0.271812611634576,
            "unit": "ms"
          },
          {
            "name": "Closed File: analyze without version (stat-based key)",
            "value": 0.5803490674061433,
            "unit": "ms"
          },
          {
            "name": "Cross-file: compile main with inherited utils",
            "value": 0.20129429541913368,
            "unit": "ms"
          },
          {
            "name": "Cross-file: recompile main (cache hit)",
            "value": 0.19747794780728845,
            "unit": "ms"
          },
          {
            "name": "resolveStdlib(\"Stdio\") - warm",
            "value": 1.6722156585956416,
            "unit": "ms"
          },
          {
            "name": "resolveStdlib(\"String\")",
            "value": 0.3776150044969084,
            "unit": "ms"
          },
          {
            "name": "resolveStdlib(\"Array\")",
            "value": 0.35325929647182724,
            "unit": "ms"
          },
          {
            "name": "resolveStdlib(\"Mapping\")",
            "value": 0.0974969366059818,
            "unit": "ms"
          },
          {
            "name": "resolveStdlib(\"Stdio.File\") - nested",
            "value": 0.5685254770642202,
            "unit": "ms"
          },
          {
            "name": "resolveStdlib(\"String.SplitIterator\") - nested",
            "value": 0.08805073733333334,
            "unit": "ms"
          },
          {
            "name": "First diagnostic after document change",
            "value": 0.38328560102447357,
            "unit": "ms"
          },
          {
            "name": "Validation with 250ms debounce (default)",
            "value": 251.02060558333335,
            "unit": "ms"
          },
          {
            "name": "Rapid edit simulation (debounce coalescing)",
            "value": 254.97365275,
            "unit": "ms"
          },
          {
            "name": "Hover: resolveStdlib(\"Stdio.File\")",
            "value": 0.5737471516427969,
            "unit": "ms"
          },
          {
            "name": "Hover: resolveModule(\"Stdio.File\")",
            "value": 0.08721553530618224,
            "unit": "ms"
          },
          {
            "name": "Completion: getCompletionContext (Large File, Warm Cache)",
            "value": 5.6712667833333334,
            "unit": "ms"
          },
          {
            "name": "Completion: getCompletionContext (Large File, Cold Cache)",
            "value": 5.651351375,
            "unit": "ms"
          }
        ]
      },
      {
        "commit": {
          "author": {
            "name": "TheSmuks",
            "username": "TheSmuks"
          },
          "committer": {
            "name": "TheSmuks",
            "username": "TheSmuks"
          },
          "id": "58667c8b8b0dd50e73e618b22c0d1f6380b810ba",
          "message": "feat(agents): add seed-based test subsampling",
          "timestamp": "2026-02-07T14:04:35Z",
          "url": "https://github.com/TheSmuks/pike-lsp/pull/4/commits/58667c8b8b0dd50e73e618b22c0d1f6380b810ba"
        },
        "date": 1770473216331,
        "tool": "customSmallerIsBetter",
        "benches": [
          {
            "name": "PikeBridge.start() [Cold Start]",
            "value": 202.24118225,
            "unit": "ms"
          },
          {
            "name": "PikeBridge.start() with detailed metrics [Cold Start]",
            "value": 250.64588583333335,
            "unit": "ms"
          },
          {
            "name": "Cold Start + First Request (getVersionInfo)",
            "value": 251.65935566666667,
            "unit": "ms"
          },
          {
            "name": "Cold Start + Introspect",
            "value": 257.20123033333334,
            "unit": "ms"
          },
          {
            "name": "Validation: Small File (~15 lines)",
            "value": 1.2424146130198916,
            "unit": "ms"
          },
          {
            "name": "Validation: Medium File (~100 lines)",
            "value": 4.061735851190476,
            "unit": "ms"
          },
          {
            "name": "Validation: Large File (~1000 lines)",
            "value": 49.22193863636363,
            "unit": "ms"
          },
          {
            "name": "Validation Legacy (3 calls: analyze + parse + analyzeUninitialized)",
            "value": 5.141414916666667,
            "unit": "ms"
          },
          {
            "name": "Validation Consolidated (1 call: analyze with all includes)",
            "value": 3.9150344285714285,
            "unit": "ms"
          },
          {
            "name": "Cache Hit: analyze with same document version",
            "value": 0.27722492887029293,
            "unit": "ms"
          },
          {
            "name": "Cache Miss: analyze with different version",
            "value": 0.27918586304256215,
            "unit": "ms"
          },
          {
            "name": "Closed File: analyze without version (stat-based key)",
            "value": 0.5639667797173732,
            "unit": "ms"
          },
          {
            "name": "Cross-file: compile main with inherited utils",
            "value": 0.21058777755905514,
            "unit": "ms"
          },
          {
            "name": "Cross-file: recompile main (cache hit)",
            "value": 0.1920683517905507,
            "unit": "ms"
          },
          {
            "name": "resolveStdlib(\"Stdio\") - warm",
            "value": 1.7707288714652956,
            "unit": "ms"
          },
          {
            "name": "resolveStdlib(\"String\")",
            "value": 0.39054857707969753,
            "unit": "ms"
          },
          {
            "name": "resolveStdlib(\"Array\")",
            "value": 0.3824579886039886,
            "unit": "ms"
          },
          {
            "name": "resolveStdlib(\"Mapping\")",
            "value": 0.10775945593937258,
            "unit": "ms"
          },
          {
            "name": "resolveStdlib(\"Stdio.File\") - nested",
            "value": 0.5822885474764756,
            "unit": "ms"
          },
          {
            "name": "resolveStdlib(\"String.SplitIterator\") - nested",
            "value": 0.08332488687209794,
            "unit": "ms"
          },
          {
            "name": "First diagnostic after document change",
            "value": 0.3979378971023063,
            "unit": "ms"
          },
          {
            "name": "Validation with 250ms debounce (default)",
            "value": 250.68232358333336,
            "unit": "ms"
          },
          {
            "name": "Rapid edit simulation (debounce coalescing)",
            "value": 254.21769333333333,
            "unit": "ms"
          },
          {
            "name": "Hover: resolveStdlib(\"Stdio.File\")",
            "value": 0.5894361479238754,
            "unit": "ms"
          },
          {
            "name": "Hover: resolveModule(\"Stdio.File\")",
            "value": 0.08735562083639031,
            "unit": "ms"
          },
          {
            "name": "Completion: getCompletionContext (Large File, Warm Cache)",
            "value": 5.793799393162393,
            "unit": "ms"
          },
          {
            "name": "Completion: getCompletionContext (Large File, Cold Cache)",
            "value": 5.744535542372882,
            "unit": "ms"
          }
        ]
      },
      {
        "commit": {
          "author": {
            "name": "TheSmuks",
            "username": "TheSmuks"
          },
          "committer": {
            "name": "TheSmuks",
            "username": "TheSmuks"
          },
          "id": "c717c035bc62647af72cf62eb7b4474392e23995",
          "message": "test: convert Tier 1 placeholder tests to real assertions",
          "timestamp": "2026-02-07T14:04:35Z",
          "url": "https://github.com/TheSmuks/pike-lsp/pull/5/commits/c717c035bc62647af72cf62eb7b4474392e23995"
        },
        "date": 1770473216076,
        "tool": "customSmallerIsBetter",
        "benches": [
          {
            "name": "PikeBridge.start() [Cold Start]",
            "value": 201.79784766666666,
            "unit": "ms"
          },
          {
            "name": "PikeBridge.start() with detailed metrics [Cold Start]",
            "value": 249.78223766666665,
            "unit": "ms"
          },
          {
            "name": "Cold Start + First Request (getVersionInfo)",
            "value": 249.27839733333334,
            "unit": "ms"
          },
          {
            "name": "Cold Start + Introspect",
            "value": 253.8982885,
            "unit": "ms"
          },
          {
            "name": "Validation: Small File (~15 lines)",
            "value": 1.178432252991453,
            "unit": "ms"
          },
          {
            "name": "Validation: Medium File (~100 lines)",
            "value": 3.81156355,
            "unit": "ms"
          },
          {
            "name": "Validation: Large File (~1000 lines)",
            "value": 47.275842090909094,
            "unit": "ms"
          },
          {
            "name": "Validation Legacy (3 calls: analyze + parse + analyzeUninitialized)",
            "value": 4.811817514084507,
            "unit": "ms"
          },
          {
            "name": "Validation Consolidated (1 call: analyze with all includes)",
            "value": 3.795874143646409,
            "unit": "ms"
          },
          {
            "name": "Cache Hit: analyze with same document version",
            "value": 0.27728015934755335,
            "unit": "ms"
          },
          {
            "name": "Cache Miss: analyze with different version",
            "value": 0.2810211254237288,
            "unit": "ms"
          },
          {
            "name": "Closed File: analyze without version (stat-based key)",
            "value": 0.5439289192645883,
            "unit": "ms"
          },
          {
            "name": "Cross-file: compile main with inherited utils",
            "value": 0.19770214001225492,
            "unit": "ms"
          },
          {
            "name": "Cross-file: recompile main (cache hit)",
            "value": 0.17190537197802197,
            "unit": "ms"
          },
          {
            "name": "resolveStdlib(\"Stdio\") - warm",
            "value": 1.730545585,
            "unit": "ms"
          },
          {
            "name": "resolveStdlib(\"String\")",
            "value": 0.416817413473424,
            "unit": "ms"
          },
          {
            "name": "resolveStdlib(\"Array\")",
            "value": 0.3742158460255698,
            "unit": "ms"
          },
          {
            "name": "resolveStdlib(\"Mapping\")",
            "value": 0.10417474854700855,
            "unit": "ms"
          },
          {
            "name": "resolveStdlib(\"Stdio.File\") - nested",
            "value": 0.599149754601227,
            "unit": "ms"
          },
          {
            "name": "resolveStdlib(\"String.SplitIterator\") - nested",
            "value": 0.07838005633240111,
            "unit": "ms"
          },
          {
            "name": "First diagnostic after document change",
            "value": 0.3969237113341204,
            "unit": "ms"
          },
          {
            "name": "Validation with 250ms debounce (default)",
            "value": 251.06381683333333,
            "unit": "ms"
          },
          {
            "name": "Rapid edit simulation (debounce coalescing)",
            "value": 254.95900816666665,
            "unit": "ms"
          },
          {
            "name": "Hover: resolveStdlib(\"Stdio.File\")",
            "value": 0.6129343348294435,
            "unit": "ms"
          },
          {
            "name": "Hover: resolveModule(\"Stdio.File\")",
            "value": 0.07765809726081778,
            "unit": "ms"
          },
          {
            "name": "Completion: getCompletionContext (Large File, Warm Cache)",
            "value": 5.724948546218488,
            "unit": "ms"
          },
          {
            "name": "Completion: getCompletionContext (Large File, Cold Cache)",
            "value": 5.69905085,
            "unit": "ms"
          }
        ]
      },
      {
        "commit": {
          "author": {
            "email": "60717893+TheSmuks@users.noreply.github.com",
            "name": "Smuks",
            "username": "TheSmuks"
          },
          "committer": {
            "email": "noreply@github.com",
            "name": "GitHub",
            "username": "web-flow"
          },
          "distinct": true,
          "id": "e1c41ec6b1b55e083100a2eb3ffec2f2e31bd86b",
          "message": "Merge pull request #4 from TheSmuks/chore/test-subsampling\n\nfeat(agents): add seed-based test subsampling",
          "timestamp": "2026-02-07T15:08:09+01:00",
          "tree_id": "925c1d09d0c5db7b4fbf9d03186688123b3874d4",
          "url": "https://github.com/TheSmuks/pike-lsp/commit/e1c41ec6b1b55e083100a2eb3ffec2f2e31bd86b"
        },
        "date": 1770473371651,
        "tool": "customSmallerIsBetter",
        "benches": [
          {
            "name": "PikeBridge.start() [Cold Start]",
            "value": 202.20981983333334,
            "unit": "ms"
          },
          {
            "name": "PikeBridge.start() with detailed metrics [Cold Start]",
            "value": 251.57483733333333,
            "unit": "ms"
          },
          {
            "name": "Cold Start + First Request (getVersionInfo)",
            "value": 251.9184565,
            "unit": "ms"
          },
          {
            "name": "Cold Start + Introspect",
            "value": 256.6323875,
            "unit": "ms"
          },
          {
            "name": "Validation: Small File (~15 lines)",
            "value": 1.1991289426086957,
            "unit": "ms"
          },
          {
            "name": "Validation: Medium File (~100 lines)",
            "value": 3.918018051428571,
            "unit": "ms"
          },
          {
            "name": "Validation: Large File (~1000 lines)",
            "value": 48.054098909090904,
            "unit": "ms"
          },
          {
            "name": "Validation Legacy (3 calls: analyze + parse + analyzeUninitialized)",
            "value": 4.956923507246377,
            "unit": "ms"
          },
          {
            "name": "Validation Consolidated (1 call: analyze with all includes)",
            "value": 3.8442667765363128,
            "unit": "ms"
          },
          {
            "name": "Cache Hit: analyze with same document version",
            "value": 0.2872974668687744,
            "unit": "ms"
          },
          {
            "name": "Cache Miss: analyze with different version",
            "value": 0.28286776781903544,
            "unit": "ms"
          },
          {
            "name": "Closed File: analyze without version (stat-based key)",
            "value": 0.5540440716612377,
            "unit": "ms"
          },
          {
            "name": "Cross-file: compile main with inherited utils",
            "value": 0.20678720829315334,
            "unit": "ms"
          },
          {
            "name": "Cross-file: recompile main (cache hit)",
            "value": 0.19046818089854212,
            "unit": "ms"
          },
          {
            "name": "resolveStdlib(\"Stdio\") - warm",
            "value": 1.7601980331632654,
            "unit": "ms"
          },
          {
            "name": "resolveStdlib(\"String\")",
            "value": 0.3960198018812463,
            "unit": "ms"
          },
          {
            "name": "resolveStdlib(\"Array\")",
            "value": 0.3963502947058824,
            "unit": "ms"
          },
          {
            "name": "resolveStdlib(\"Mapping\")",
            "value": 0.10737176954083422,
            "unit": "ms"
          },
          {
            "name": "resolveStdlib(\"Stdio.File\") - nested",
            "value": 0.5993312414398595,
            "unit": "ms"
          },
          {
            "name": "resolveStdlib(\"String.SplitIterator\") - nested",
            "value": 0.07836120650863801,
            "unit": "ms"
          },
          {
            "name": "First diagnostic after document change",
            "value": 0.4045233359375,
            "unit": "ms"
          },
          {
            "name": "Validation with 250ms debounce (default)",
            "value": 251.68298383333334,
            "unit": "ms"
          },
          {
            "name": "Rapid edit simulation (debounce coalescing)",
            "value": 256.2698585,
            "unit": "ms"
          },
          {
            "name": "Hover: resolveStdlib(\"Stdio.File\")",
            "value": 0.639203908411215,
            "unit": "ms"
          },
          {
            "name": "Hover: resolveModule(\"Stdio.File\")",
            "value": 0.08042698151922816,
            "unit": "ms"
          },
          {
            "name": "Completion: getCompletionContext (Large File, Warm Cache)",
            "value": 5.722286075630252,
            "unit": "ms"
          },
          {
            "name": "Completion: getCompletionContext (Large File, Cold Cache)",
            "value": 5.82614147008547,
            "unit": "ms"
          }
        ]
      },
      {
        "commit": {
          "author": {
            "email": "60717893+TheSmuks@users.noreply.github.com",
            "name": "Smuks",
            "username": "TheSmuks"
          },
          "committer": {
            "email": "noreply@github.com",
            "name": "GitHub",
            "username": "web-flow"
          },
          "distinct": true,
          "id": "daa59fd0bbb2e8791263be2a197c484a0b7b95bf",
          "message": "Merge pull request #5 from TheSmuks/test/placeholder-conversion\n\ntest: convert Tier 1 placeholder tests to real assertions",
          "timestamp": "2026-02-07T15:08:12+01:00",
          "tree_id": "2fb71446096e782c3b939cd7a8ee0cf699d7a880",
          "url": "https://github.com/TheSmuks/pike-lsp/commit/daa59fd0bbb2e8791263be2a197c484a0b7b95bf"
        },
        "date": 1770473374871,
        "tool": "customSmallerIsBetter",
        "benches": [
          {
            "name": "PikeBridge.start() [Cold Start]",
            "value": 202.51689691666667,
            "unit": "ms"
          },
          {
            "name": "PikeBridge.start() with detailed metrics [Cold Start]",
            "value": 250.93395608333336,
            "unit": "ms"
          },
          {
            "name": "Cold Start + First Request (getVersionInfo)",
            "value": 249.78618158333333,
            "unit": "ms"
          },
          {
            "name": "Cold Start + Introspect",
            "value": 255.0531215,
            "unit": "ms"
          },
          {
            "name": "Validation: Small File (~15 lines)",
            "value": 1.2078930998248687,
            "unit": "ms"
          },
          {
            "name": "Validation: Medium File (~100 lines)",
            "value": 3.924067525714286,
            "unit": "ms"
          },
          {
            "name": "Validation: Large File (~1000 lines)",
            "value": 48.82847381818182,
            "unit": "ms"
          },
          {
            "name": "Validation Legacy (3 calls: analyze + parse + analyzeUninitialized)",
            "value": 5.046635397058823,
            "unit": "ms"
          },
          {
            "name": "Validation Consolidated (1 call: analyze with all includes)",
            "value": 3.843115488764045,
            "unit": "ms"
          },
          {
            "name": "Cache Hit: analyze with same document version",
            "value": 0.27841363434089,
            "unit": "ms"
          },
          {
            "name": "Cache Miss: analyze with different version",
            "value": 0.29350390132743365,
            "unit": "ms"
          },
          {
            "name": "Closed File: analyze without version (stat-based key)",
            "value": 0.5550308135179153,
            "unit": "ms"
          },
          {
            "name": "Cross-file: compile main with inherited utils",
            "value": 0.19865591817346,
            "unit": "ms"
          },
          {
            "name": "Cross-file: recompile main (cache hit)",
            "value": 0.19995309159112223,
            "unit": "ms"
          },
          {
            "name": "resolveStdlib(\"Stdio\") - warm",
            "value": 1.6728630629539951,
            "unit": "ms"
          },
          {
            "name": "resolveStdlib(\"String\")",
            "value": 0.39305826767971946,
            "unit": "ms"
          },
          {
            "name": "resolveStdlib(\"Array\")",
            "value": 0.3703980634307777,
            "unit": "ms"
          },
          {
            "name": "resolveStdlib(\"Mapping\")",
            "value": 0.1065390249736194,
            "unit": "ms"
          },
          {
            "name": "resolveStdlib(\"Stdio.File\") - nested",
            "value": 0.5910241005199307,
            "unit": "ms"
          },
          {
            "name": "resolveStdlib(\"String.SplitIterator\") - nested",
            "value": 0.08061679773131065,
            "unit": "ms"
          },
          {
            "name": "First diagnostic after document change",
            "value": 0.4391057662760417,
            "unit": "ms"
          },
          {
            "name": "Validation with 250ms debounce (default)",
            "value": 251.2683595,
            "unit": "ms"
          },
          {
            "name": "Rapid edit simulation (debounce coalescing)",
            "value": 256.00905966666664,
            "unit": "ms"
          },
          {
            "name": "Hover: resolveStdlib(\"Stdio.File\")",
            "value": 0.5978339719051801,
            "unit": "ms"
          },
          {
            "name": "Hover: resolveModule(\"Stdio.File\")",
            "value": 0.08416797164729231,
            "unit": "ms"
          },
          {
            "name": "Completion: getCompletionContext (Large File, Warm Cache)",
            "value": 5.66829455,
            "unit": "ms"
          },
          {
            "name": "Completion: getCompletionContext (Large File, Cold Cache)",
            "value": 5.63474794214876,
            "unit": "ms"
          }
        ]
      },
      {
        "commit": {
          "author": {
            "name": "TheSmuks",
            "username": "TheSmuks"
          },
          "committer": {
            "name": "TheSmuks",
            "username": "TheSmuks"
          },
          "id": "495647ef485399981615a0d9ad8bebc8ad8e7adf",
          "message": "chore: Carlini Protocol audit fixes + oracle testing",
          "timestamp": "2026-02-07T14:08:19Z",
          "url": "https://github.com/TheSmuks/pike-lsp/pull/6/commits/495647ef485399981615a0d9ad8bebc8ad8e7adf"
        },
        "date": 1770474673848,
        "tool": "customSmallerIsBetter",
        "benches": [
          {
            "name": "PikeBridge.start() [Cold Start]",
            "value": 200.9704995,
            "unit": "ms"
          },
          {
            "name": "PikeBridge.start() with detailed metrics [Cold Start]",
            "value": 247.966054,
            "unit": "ms"
          },
          {
            "name": "Cold Start + First Request (getVersionInfo)",
            "value": 247.96936275,
            "unit": "ms"
          },
          {
            "name": "Cold Start + Introspect",
            "value": 253.58868891666665,
            "unit": "ms"
          },
          {
            "name": "Validation: Small File (~15 lines)",
            "value": 1.2086731684210525,
            "unit": "ms"
          },
          {
            "name": "Validation: Medium File (~100 lines)",
            "value": 3.840739547486033,
            "unit": "ms"
          },
          {
            "name": "Validation: Large File (~1000 lines)",
            "value": 46.996106727272725,
            "unit": "ms"
          },
          {
            "name": "Validation Legacy (3 calls: analyze + parse + analyzeUninitialized)",
            "value": 4.920575100719425,
            "unit": "ms"
          },
          {
            "name": "Validation Consolidated (1 call: analyze with all includes)",
            "value": 3.7561938743169403,
            "unit": "ms"
          },
          {
            "name": "Cache Hit: analyze with same document version",
            "value": 0.26920813751017086,
            "unit": "ms"
          },
          {
            "name": "Cache Miss: analyze with different version",
            "value": 0.26655146779388084,
            "unit": "ms"
          },
          {
            "name": "Closed File: analyze without version (stat-based key)",
            "value": 0.5576394807219032,
            "unit": "ms"
          },
          {
            "name": "Cross-file: compile main with inherited utils",
            "value": 0.2098415814863103,
            "unit": "ms"
          },
          {
            "name": "Cross-file: recompile main (cache hit)",
            "value": 0.18657121182983682,
            "unit": "ms"
          },
          {
            "name": "resolveStdlib(\"Stdio\") - warm",
            "value": 1.651968885167464,
            "unit": "ms"
          },
          {
            "name": "resolveStdlib(\"String\")",
            "value": 0.3853741163990826,
            "unit": "ms"
          },
          {
            "name": "resolveStdlib(\"Array\")",
            "value": 0.3969258242924528,
            "unit": "ms"
          },
          {
            "name": "resolveStdlib(\"Mapping\")",
            "value": 0.10598942451185495,
            "unit": "ms"
          },
          {
            "name": "resolveStdlib(\"Stdio.File\") - nested",
            "value": 0.5998795101143359,
            "unit": "ms"
          },
          {
            "name": "resolveStdlib(\"String.SplitIterator\") - nested",
            "value": 0.08710859498313041,
            "unit": "ms"
          },
          {
            "name": "First diagnostic after document change",
            "value": 0.3925890432748538,
            "unit": "ms"
          },
          {
            "name": "Validation with 250ms debounce (default)",
            "value": 250.740752,
            "unit": "ms"
          },
          {
            "name": "Rapid edit simulation (debounce coalescing)",
            "value": 254.51479283333333,
            "unit": "ms"
          },
          {
            "name": "Hover: resolveStdlib(\"Stdio.File\")",
            "value": 0.6117003820627803,
            "unit": "ms"
          },
          {
            "name": "Hover: resolveModule(\"Stdio.File\")",
            "value": 0.07936722440997977,
            "unit": "ms"
          },
          {
            "name": "Completion: getCompletionContext (Large File, Warm Cache)",
            "value": 5.667887325000001,
            "unit": "ms"
          },
          {
            "name": "Completion: getCompletionContext (Large File, Cold Cache)",
            "value": 5.585469450819672,
            "unit": "ms"
          }
        ]
      },
      {
        "commit": {
          "author": {
            "email": "60717893+TheSmuks@users.noreply.github.com",
            "name": "Smuks",
            "username": "TheSmuks"
          },
          "committer": {
            "email": "noreply@github.com",
            "name": "GitHub",
            "username": "web-flow"
          },
          "distinct": true,
          "id": "bf000ad55c07e2682af62df00e44c4ad10da1dd2",
          "message": "chore: Carlini Protocol audit fixes + oracle testing (#6)\n\n* chore: fix Carlini Protocol gaps from audit\n\nRewrote AGENTS.md to reflect current tooling (bun, not pnpm) and added\nCarlini Protocol startup sequence, task locking, worktree protocol, and\nagent role documentation. Created 5 agent role prompt templates in\n.claude/agent-roles/ for parallel agent specialization.\n\nCo-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>\n\n* feat(tests): add oracle testing pattern (Carlini known-good oracle)\n\nCompares bridge.parse() output against bridge.analyze(['introspect'])\nwhich uses Pike's own compiler as ground truth. Catches parser\nregressions where symbols are missed or hallucinated. Documents one\nknown parser bug (enum followed by declaration).\n\nCo-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>\n\n* chore: update STATUS.md and logs for oracle testing\n\nCo-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>\n\n---------\n\nCo-authored-by: Claude Opus 4.6 <noreply@anthropic.com>",
          "timestamp": "2026-02-07T15:32:32+01:00",
          "tree_id": "7fed51fc809b01f1a411f348857f5ca5396c7ef2",
          "url": "https://github.com/TheSmuks/pike-lsp/commit/bf000ad55c07e2682af62df00e44c4ad10da1dd2"
        },
        "date": 1770474842634,
        "tool": "customSmallerIsBetter",
        "benches": [
          {
            "name": "PikeBridge.start() [Cold Start]",
            "value": 202.50191016666665,
            "unit": "ms"
          },
          {
            "name": "PikeBridge.start() with detailed metrics [Cold Start]",
            "value": 249.78185966666666,
            "unit": "ms"
          },
          {
            "name": "Cold Start + First Request (getVersionInfo)",
            "value": 249.43151641666665,
            "unit": "ms"
          },
          {
            "name": "Cold Start + Introspect",
            "value": 255.22142333333335,
            "unit": "ms"
          },
          {
            "name": "Validation: Small File (~15 lines)",
            "value": 1.1697979269949066,
            "unit": "ms"
          },
          {
            "name": "Validation: Medium File (~100 lines)",
            "value": 3.8491618938547485,
            "unit": "ms"
          },
          {
            "name": "Validation: Large File (~1000 lines)",
            "value": 46.74383054545455,
            "unit": "ms"
          },
          {
            "name": "Validation Legacy (3 calls: analyze + parse + analyzeUninitialized)",
            "value": 4.924049489208633,
            "unit": "ms"
          },
          {
            "name": "Validation Consolidated (1 call: analyze with all includes)",
            "value": 3.7913272651933703,
            "unit": "ms"
          },
          {
            "name": "Cache Hit: analyze with same document version",
            "value": 0.2840080994854202,
            "unit": "ms"
          },
          {
            "name": "Cache Miss: analyze with different version",
            "value": 0.27545203786933004,
            "unit": "ms"
          },
          {
            "name": "Closed File: analyze without version (stat-based key)",
            "value": 0.550910933603239,
            "unit": "ms"
          },
          {
            "name": "Cross-file: compile main with inherited utils",
            "value": 0.19078783703046434,
            "unit": "ms"
          },
          {
            "name": "Cross-file: recompile main (cache hit)",
            "value": 0.1786300044730221,
            "unit": "ms"
          },
          {
            "name": "resolveStdlib(\"Stdio\") - warm",
            "value": 1.6327314420803782,
            "unit": "ms"
          },
          {
            "name": "resolveStdlib(\"String\")",
            "value": 0.35580426800847453,
            "unit": "ms"
          },
          {
            "name": "resolveStdlib(\"Array\")",
            "value": 0.3626457268793943,
            "unit": "ms"
          },
          {
            "name": "resolveStdlib(\"Mapping\")",
            "value": 0.095597228725087,
            "unit": "ms"
          },
          {
            "name": "resolveStdlib(\"Stdio.File\") - nested",
            "value": 0.6194476930063578,
            "unit": "ms"
          },
          {
            "name": "resolveStdlib(\"String.SplitIterator\") - nested",
            "value": 0.08303183462132921,
            "unit": "ms"
          },
          {
            "name": "First diagnostic after document change",
            "value": 0.3738002105555555,
            "unit": "ms"
          },
          {
            "name": "Validation with 250ms debounce (default)",
            "value": 251.03046925,
            "unit": "ms"
          },
          {
            "name": "Rapid edit simulation (debounce coalescing)",
            "value": 255.14142966666665,
            "unit": "ms"
          },
          {
            "name": "Hover: resolveStdlib(\"Stdio.File\")",
            "value": 0.5599752985197368,
            "unit": "ms"
          },
          {
            "name": "Hover: resolveModule(\"Stdio.File\")",
            "value": 0.0811622893289329,
            "unit": "ms"
          },
          {
            "name": "Completion: getCompletionContext (Large File, Warm Cache)",
            "value": 5.616469289256198,
            "unit": "ms"
          },
          {
            "name": "Completion: getCompletionContext (Large File, Cold Cache)",
            "value": 5.603407172131147,
            "unit": "ms"
          }
        ]
      },
      {
        "commit": {
          "author": {
            "name": "TheSmuks",
            "username": "TheSmuks"
          },
          "committer": {
            "name": "TheSmuks",
            "username": "TheSmuks"
          },
          "id": "6720dd818f5375911aace23d7f1e131b948a21e6",
          "message": "chore: default agents to --auto merge",
          "timestamp": "2026-02-07T14:32:37Z",
          "url": "https://github.com/TheSmuks/pike-lsp/pull/7/commits/6720dd818f5375911aace23d7f1e131b948a21e6"
        },
        "date": 1770475066642,
        "tool": "customSmallerIsBetter",
        "benches": [
          {
            "name": "PikeBridge.start() [Cold Start]",
            "value": 202.79421666666667,
            "unit": "ms"
          },
          {
            "name": "PikeBridge.start() with detailed metrics [Cold Start]",
            "value": 249.94575608333335,
            "unit": "ms"
          },
          {
            "name": "Cold Start + First Request (getVersionInfo)",
            "value": 250.4660135,
            "unit": "ms"
          },
          {
            "name": "Cold Start + Introspect",
            "value": 254.70871,
            "unit": "ms"
          },
          {
            "name": "Validation: Small File (~15 lines)",
            "value": 1.2118648257042253,
            "unit": "ms"
          },
          {
            "name": "Validation: Medium File (~100 lines)",
            "value": 3.85726695505618,
            "unit": "ms"
          },
          {
            "name": "Validation: Large File (~1000 lines)",
            "value": 47.637066272727274,
            "unit": "ms"
          },
          {
            "name": "Validation Legacy (3 calls: analyze + parse + analyzeUninitialized)",
            "value": 4.959072115942029,
            "unit": "ms"
          },
          {
            "name": "Validation Consolidated (1 call: analyze with all includes)",
            "value": 3.8275273463687154,
            "unit": "ms"
          },
          {
            "name": "Cache Hit: analyze with same document version",
            "value": 0.2869410770896492,
            "unit": "ms"
          },
          {
            "name": "Cache Miss: analyze with different version",
            "value": 0.2852765529715762,
            "unit": "ms"
          },
          {
            "name": "Closed File: analyze without version (stat-based key)",
            "value": 0.5554999222585925,
            "unit": "ms"
          },
          {
            "name": "Cross-file: compile main with inherited utils",
            "value": 0.20201275381263617,
            "unit": "ms"
          },
          {
            "name": "Cross-file: recompile main (cache hit)",
            "value": 0.18079922669735327,
            "unit": "ms"
          },
          {
            "name": "resolveStdlib(\"Stdio\") - warm",
            "value": 1.6758474393203882,
            "unit": "ms"
          },
          {
            "name": "resolveStdlib(\"String\")",
            "value": 0.3661466480874317,
            "unit": "ms"
          },
          {
            "name": "resolveStdlib(\"Array\")",
            "value": 0.35768572,
            "unit": "ms"
          },
          {
            "name": "resolveStdlib(\"Mapping\")",
            "value": 0.11563973611895352,
            "unit": "ms"
          },
          {
            "name": "resolveStdlib(\"Stdio.File\") - nested",
            "value": 0.5624092113955409,
            "unit": "ms"
          },
          {
            "name": "resolveStdlib(\"String.SplitIterator\") - nested",
            "value": 0.08827532532265242,
            "unit": "ms"
          },
          {
            "name": "First diagnostic after document change",
            "value": 0.40498451624548737,
            "unit": "ms"
          },
          {
            "name": "Validation with 250ms debounce (default)",
            "value": 250.95200516666665,
            "unit": "ms"
          },
          {
            "name": "Rapid edit simulation (debounce coalescing)",
            "value": 255.25173633333335,
            "unit": "ms"
          },
          {
            "name": "Hover: resolveStdlib(\"Stdio.File\")",
            "value": 0.5751429045608107,
            "unit": "ms"
          },
          {
            "name": "Hover: resolveModule(\"Stdio.File\")",
            "value": 0.09371174390625,
            "unit": "ms"
          },
          {
            "name": "Completion: getCompletionContext (Large File, Warm Cache)",
            "value": 5.603334557377049,
            "unit": "ms"
          },
          {
            "name": "Completion: getCompletionContext (Large File, Cold Cache)",
            "value": 5.593579729508197,
            "unit": "ms"
          }
        ]
      },
      {
        "commit": {
          "author": {
            "email": "60717893+TheSmuks@users.noreply.github.com",
            "name": "Smuks",
            "username": "TheSmuks"
          },
          "committer": {
            "email": "noreply@github.com",
            "name": "GitHub",
            "username": "web-flow"
          },
          "distinct": true,
          "id": "1dc6f22e548bca0b23d1a1f04a0851605fc869ec",
          "message": "chore: default agents to --auto merge with branch cleanup (#7)\n\nCo-authored-by: Claude Opus 4.6 <noreply@anthropic.com>",
          "timestamp": "2026-02-07T14:38:23Z",
          "tree_id": "82665aa396555b0702767012686e09ee9c18af32",
          "url": "https://github.com/TheSmuks/pike-lsp/commit/1dc6f22e548bca0b23d1a1f04a0851605fc869ec"
        },
        "date": 1770475192158,
        "tool": "customSmallerIsBetter",
        "benches": [
          {
            "name": "PikeBridge.start() [Cold Start]",
            "value": 201.47911616666664,
            "unit": "ms"
          },
          {
            "name": "PikeBridge.start() with detailed metrics [Cold Start]",
            "value": 248.83394458333333,
            "unit": "ms"
          },
          {
            "name": "Cold Start + First Request (getVersionInfo)",
            "value": 248.13435691666666,
            "unit": "ms"
          },
          {
            "name": "Cold Start + Introspect",
            "value": 254.10228616666666,
            "unit": "ms"
          },
          {
            "name": "Validation: Small File (~15 lines)",
            "value": 1.196297,
            "unit": "ms"
          },
          {
            "name": "Validation: Medium File (~100 lines)",
            "value": 3.8492217640449438,
            "unit": "ms"
          },
          {
            "name": "Validation: Large File (~1000 lines)",
            "value": 47.67788027272727,
            "unit": "ms"
          },
          {
            "name": "Validation Legacy (3 calls: analyze + parse + analyzeUninitialized)",
            "value": 4.853347368794327,
            "unit": "ms"
          },
          {
            "name": "Validation Consolidated (1 call: analyze with all includes)",
            "value": 3.8089172777777778,
            "unit": "ms"
          },
          {
            "name": "Cache Hit: analyze with same document version",
            "value": 0.2883645208877284,
            "unit": "ms"
          },
          {
            "name": "Cache Miss: analyze with different version",
            "value": 0.28382580736301366,
            "unit": "ms"
          },
          {
            "name": "Closed File: analyze without version (stat-based key)",
            "value": 0.5510144,
            "unit": "ms"
          },
          {
            "name": "Cross-file: compile main with inherited utils",
            "value": 0.1999279474009901,
            "unit": "ms"
          },
          {
            "name": "Cross-file: recompile main (cache hit)",
            "value": 0.19870959148803977,
            "unit": "ms"
          },
          {
            "name": "resolveStdlib(\"Stdio\") - warm",
            "value": 1.6465844547619046,
            "unit": "ms"
          },
          {
            "name": "resolveStdlib(\"String\")",
            "value": 0.37652841301907963,
            "unit": "ms"
          },
          {
            "name": "resolveStdlib(\"Array\")",
            "value": 0.39345072892271665,
            "unit": "ms"
          },
          {
            "name": "resolveStdlib(\"Mapping\")",
            "value": 0.09559600727617842,
            "unit": "ms"
          },
          {
            "name": "resolveStdlib(\"Stdio.File\") - nested",
            "value": 0.5649591095435684,
            "unit": "ms"
          },
          {
            "name": "resolveStdlib(\"String.SplitIterator\") - nested",
            "value": 0.08079407506849315,
            "unit": "ms"
          },
          {
            "name": "First diagnostic after document change",
            "value": 0.37822339909553415,
            "unit": "ms"
          },
          {
            "name": "Validation with 250ms debounce (default)",
            "value": 250.93777258333336,
            "unit": "ms"
          },
          {
            "name": "Rapid edit simulation (debounce coalescing)",
            "value": 253.48684241666666,
            "unit": "ms"
          },
          {
            "name": "Hover: resolveStdlib(\"Stdio.File\")",
            "value": 0.5665003552412645,
            "unit": "ms"
          },
          {
            "name": "Hover: resolveModule(\"Stdio.File\")",
            "value": 0.08259524117729111,
            "unit": "ms"
          },
          {
            "name": "Completion: getCompletionContext (Large File, Warm Cache)",
            "value": 5.7158544033613445,
            "unit": "ms"
          },
          {
            "name": "Completion: getCompletionContext (Large File, Cold Cache)",
            "value": 5.699225075,
            "unit": "ms"
          }
        ]
      },
      {
        "commit": {
          "author": {
            "name": "TheSmuks",
            "username": "TheSmuks"
          },
          "committer": {
            "name": "TheSmuks",
            "username": "TheSmuks"
          },
          "id": "3f41f5d78ef4adaa0fe042bbb652ca6e087964bf",
          "message": "test: Convert 84 placeholder tests in advanced features B",
          "timestamp": "2026-02-07T14:38:28Z",
          "url": "https://github.com/TheSmuks/pike-lsp/pull/9/commits/3f41f5d78ef4adaa0fe042bbb652ca6e087964bf"
        },
        "date": 1770482860109,
        "tool": "customSmallerIsBetter",
        "benches": [
          {
            "name": "PikeBridge.start() [Cold Start]",
            "value": 201.58739633333334,
            "unit": "ms"
          },
          {
            "name": "PikeBridge.start() with detailed metrics [Cold Start]",
            "value": 251.00681175,
            "unit": "ms"
          },
          {
            "name": "Cold Start + First Request (getVersionInfo)",
            "value": 252.40241608333335,
            "unit": "ms"
          },
          {
            "name": "Cold Start + Introspect",
            "value": 256.41686708333333,
            "unit": "ms"
          },
          {
            "name": "Validation: Small File (~15 lines)",
            "value": 1.1942772495667244,
            "unit": "ms"
          },
          {
            "name": "Validation: Medium File (~100 lines)",
            "value": 3.915268685714286,
            "unit": "ms"
          },
          {
            "name": "Validation: Large File (~1000 lines)",
            "value": 48.217361454545454,
            "unit": "ms"
          },
          {
            "name": "Validation Legacy (3 calls: analyze + parse + analyzeUninitialized)",
            "value": 4.962735942028985,
            "unit": "ms"
          },
          {
            "name": "Validation Consolidated (1 call: analyze with all includes)",
            "value": 3.8122327555555557,
            "unit": "ms"
          },
          {
            "name": "Cache Hit: analyze with same document version",
            "value": 0.2811825191001698,
            "unit": "ms"
          },
          {
            "name": "Cache Miss: analyze with different version",
            "value": 0.28768905729166666,
            "unit": "ms"
          },
          {
            "name": "Closed File: analyze without version (stat-based key)",
            "value": 0.580797558697515,
            "unit": "ms"
          },
          {
            "name": "Cross-file: compile main with inherited utils",
            "value": 0.20775605530401034,
            "unit": "ms"
          },
          {
            "name": "Cross-file: recompile main (cache hit)",
            "value": 0.18950739103325415,
            "unit": "ms"
          },
          {
            "name": "resolveStdlib(\"Stdio\") - warm",
            "value": 1.7493565507614213,
            "unit": "ms"
          },
          {
            "name": "resolveStdlib(\"String\")",
            "value": 0.3899328212420197,
            "unit": "ms"
          },
          {
            "name": "resolveStdlib(\"Array\")",
            "value": 0.3793071859807801,
            "unit": "ms"
          },
          {
            "name": "resolveStdlib(\"Mapping\")",
            "value": 0.11327927349953833,
            "unit": "ms"
          },
          {
            "name": "resolveStdlib(\"Stdio.File\") - nested",
            "value": 0.5990926786971832,
            "unit": "ms"
          },
          {
            "name": "resolveStdlib(\"String.SplitIterator\") - nested",
            "value": 0.08951800784550391,
            "unit": "ms"
          },
          {
            "name": "First diagnostic after document change",
            "value": 0.4024834524805738,
            "unit": "ms"
          },
          {
            "name": "Validation with 250ms debounce (default)",
            "value": 251.23065708333334,
            "unit": "ms"
          },
          {
            "name": "Rapid edit simulation (debounce coalescing)",
            "value": 255.08854116666666,
            "unit": "ms"
          },
          {
            "name": "Hover: resolveStdlib(\"Stdio.File\")",
            "value": 0.6161014855334539,
            "unit": "ms"
          },
          {
            "name": "Hover: resolveModule(\"Stdio.File\")",
            "value": 0.0855059494803695,
            "unit": "ms"
          },
          {
            "name": "Completion: getCompletionContext (Large File, Warm Cache)",
            "value": 5.79039488034188,
            "unit": "ms"
          },
          {
            "name": "Completion: getCompletionContext (Large File, Cold Cache)",
            "value": 5.80874235042735,
            "unit": "ms"
          }
        ]
      },
      {
        "commit": {
          "author": {
            "name": "TheSmuks",
            "username": "TheSmuks"
          },
          "committer": {
            "name": "TheSmuks",
            "username": "TheSmuks"
          },
          "id": "65747ba61338cd6f7e154513a124955db98469ea",
          "message": "test: Convert 158 placeholder tests in hierarchy and diagnostics",
          "timestamp": "2026-02-07T14:38:28Z",
          "url": "https://github.com/TheSmuks/pike-lsp/pull/8/commits/65747ba61338cd6f7e154513a124955db98469ea"
        },
        "date": 1770482864088,
        "tool": "customSmallerIsBetter",
        "benches": [
          {
            "name": "PikeBridge.start() [Cold Start]",
            "value": 200.42844575,
            "unit": "ms"
          },
          {
            "name": "PikeBridge.start() with detailed metrics [Cold Start]",
            "value": 246.53223816666664,
            "unit": "ms"
          },
          {
            "name": "Cold Start + First Request (getVersionInfo)",
            "value": 246.83760908333335,
            "unit": "ms"
          },
          {
            "name": "Cold Start + Introspect",
            "value": 251.96197916666665,
            "unit": "ms"
          },
          {
            "name": "Validation: Small File (~15 lines)",
            "value": 1.1806176797945207,
            "unit": "ms"
          },
          {
            "name": "Validation: Medium File (~100 lines)",
            "value": 3.8053879166666666,
            "unit": "ms"
          },
          {
            "name": "Validation: Large File (~1000 lines)",
            "value": 46.693921083333336,
            "unit": "ms"
          },
          {
            "name": "Validation Legacy (3 calls: analyze + parse + analyzeUninitialized)",
            "value": 4.839457283687944,
            "unit": "ms"
          },
          {
            "name": "Validation Consolidated (1 call: analyze with all includes)",
            "value": 3.771137214285714,
            "unit": "ms"
          },
          {
            "name": "Cache Hit: analyze with same document version",
            "value": 0.2773267359832636,
            "unit": "ms"
          },
          {
            "name": "Cache Miss: analyze with different version",
            "value": 0.26831847428108546,
            "unit": "ms"
          },
          {
            "name": "Closed File: analyze without version (stat-based key)",
            "value": 0.5571863114754099,
            "unit": "ms"
          },
          {
            "name": "Cross-file: compile main with inherited utils",
            "value": 0.18835792143066551,
            "unit": "ms"
          },
          {
            "name": "Cross-file: recompile main (cache hit)",
            "value": 0.183995661971831,
            "unit": "ms"
          },
          {
            "name": "resolveStdlib(\"Stdio\") - warm",
            "value": 1.6211316877934272,
            "unit": "ms"
          },
          {
            "name": "resolveStdlib(\"String\")",
            "value": 0.36162152045209905,
            "unit": "ms"
          },
          {
            "name": "resolveStdlib(\"Array\")",
            "value": 0.33878749621020715,
            "unit": "ms"
          },
          {
            "name": "resolveStdlib(\"Mapping\")",
            "value": 0.09673592390087929,
            "unit": "ms"
          },
          {
            "name": "resolveStdlib(\"Stdio.File\") - nested",
            "value": 0.5435338963317384,
            "unit": "ms"
          },
          {
            "name": "resolveStdlib(\"String.SplitIterator\") - nested",
            "value": 0.08770356370884394,
            "unit": "ms"
          },
          {
            "name": "First diagnostic after document change",
            "value": 0.3842751071019473,
            "unit": "ms"
          },
          {
            "name": "Validation with 250ms debounce (default)",
            "value": 250.3138555,
            "unit": "ms"
          },
          {
            "name": "Rapid edit simulation (debounce coalescing)",
            "value": 252.36557808333333,
            "unit": "ms"
          },
          {
            "name": "Hover: resolveStdlib(\"Stdio.File\")",
            "value": 0.5619005952184666,
            "unit": "ms"
          },
          {
            "name": "Hover: resolveModule(\"Stdio.File\")",
            "value": 0.0824141807681603,
            "unit": "ms"
          },
          {
            "name": "Completion: getCompletionContext (Large File, Warm Cache)",
            "value": 5.699898583333333,
            "unit": "ms"
          },
          {
            "name": "Completion: getCompletionContext (Large File, Cold Cache)",
            "value": 5.902159184210527,
            "unit": "ms"
          }
        ]
      },
      {
        "commit": {
          "author": {
            "name": "TheSmuks",
            "username": "TheSmuks"
          },
          "committer": {
            "name": "TheSmuks",
            "username": "TheSmuks"
          },
          "id": "942159498244c7b8b73852edeaf122d1229f7c7b",
          "message": "test: Convert 44 placeholder tests in symbols and config",
          "timestamp": "2026-02-07T14:38:28Z",
          "url": "https://github.com/TheSmuks/pike-lsp/pull/10/commits/942159498244c7b8b73852edeaf122d1229f7c7b"
        },
        "date": 1770482878724,
        "tool": "customSmallerIsBetter",
        "benches": [
          {
            "name": "PikeBridge.start() [Cold Start]",
            "value": 200.73646966666666,
            "unit": "ms"
          },
          {
            "name": "PikeBridge.start() with detailed metrics [Cold Start]",
            "value": 248.0745285,
            "unit": "ms"
          },
          {
            "name": "Cold Start + First Request (getVersionInfo)",
            "value": 247.59749666666664,
            "unit": "ms"
          },
          {
            "name": "Cold Start + Introspect",
            "value": 252.67365275,
            "unit": "ms"
          },
          {
            "name": "Validation: Small File (~15 lines)",
            "value": 1.1786525521367521,
            "unit": "ms"
          },
          {
            "name": "Validation: Medium File (~100 lines)",
            "value": 3.855214162921348,
            "unit": "ms"
          },
          {
            "name": "Validation: Large File (~1000 lines)",
            "value": 46.87234616666667,
            "unit": "ms"
          },
          {
            "name": "Validation Legacy (3 calls: analyze + parse + analyzeUninitialized)",
            "value": 4.859841936170213,
            "unit": "ms"
          },
          {
            "name": "Validation Consolidated (1 call: analyze with all includes)",
            "value": 3.7614947032967034,
            "unit": "ms"
          },
          {
            "name": "Cache Hit: analyze with same document version",
            "value": 0.2726397109921778,
            "unit": "ms"
          },
          {
            "name": "Cache Miss: analyze with different version",
            "value": 0.2742397087298304,
            "unit": "ms"
          },
          {
            "name": "Closed File: analyze without version (stat-based key)",
            "value": 0.5518787388483375,
            "unit": "ms"
          },
          {
            "name": "Cross-file: compile main with inherited utils",
            "value": 0.20893441006493507,
            "unit": "ms"
          },
          {
            "name": "Cross-file: recompile main (cache hit)",
            "value": 0.19822301269349846,
            "unit": "ms"
          },
          {
            "name": "resolveStdlib(\"Stdio\") - warm",
            "value": 1.628075474056604,
            "unit": "ms"
          },
          {
            "name": "resolveStdlib(\"String\")",
            "value": 0.3618414806034483,
            "unit": "ms"
          },
          {
            "name": "resolveStdlib(\"Array\")",
            "value": 0.3539081045406547,
            "unit": "ms"
          },
          {
            "name": "resolveStdlib(\"Mapping\")",
            "value": 0.09983041933892452,
            "unit": "ms"
          },
          {
            "name": "resolveStdlib(\"Stdio.File\") - nested",
            "value": 0.5478233419147225,
            "unit": "ms"
          },
          {
            "name": "resolveStdlib(\"String.SplitIterator\") - nested",
            "value": 0.08813275817965496,
            "unit": "ms"
          },
          {
            "name": "First diagnostic after document change",
            "value": 0.3642190705371677,
            "unit": "ms"
          },
          {
            "name": "Validation with 250ms debounce (default)",
            "value": 250.41712008333334,
            "unit": "ms"
          },
          {
            "name": "Rapid edit simulation (debounce coalescing)",
            "value": 251.83926725,
            "unit": "ms"
          },
          {
            "name": "Hover: resolveStdlib(\"Stdio.File\")",
            "value": 0.5604494950657894,
            "unit": "ms"
          },
          {
            "name": "Hover: resolveModule(\"Stdio.File\")",
            "value": 0.08513542007168458,
            "unit": "ms"
          },
          {
            "name": "Completion: getCompletionContext (Large File, Warm Cache)",
            "value": 5.677727875,
            "unit": "ms"
          },
          {
            "name": "Completion: getCompletionContext (Large File, Cold Cache)",
            "value": 5.64878120661157,
            "unit": "ms"
          }
        ]
      },
      {
        "commit": {
          "author": {
            "email": "60717893+TheSmuks@users.noreply.github.com",
            "name": "Smuks",
            "username": "TheSmuks"
          },
          "committer": {
            "email": "noreply@github.com",
            "name": "GitHub",
            "username": "web-flow"
          },
          "distinct": true,
          "id": "2b5c95a599334ec1621a53c880af2d8e346c4688",
          "message": "test: Convert 84 placeholder tests in advanced features B\n\n* fix: disable DBus for Chromium in headless E2E tests\n\nThis resolves the DBus connection errors that were blocking E2E tests\nin headless mode. Chromium now runs with explicit DBUS_SESSION_BUS_ADDRESS=''\nand --disable-features=UseOzonePlatform flag.\n\n- Set DBUS_SESSION_BUS_ADDRESS to empty string in xvfb-run environment\n- Add --disable-features=UseOzonePlatform to ELECTRON_EXTRA_LAUNCH_ARGS\n- E2E tests now pass: 108 passing (3m)\n\nFixes #E2E-ENV\n\n* test: convert 84 placeholder tests in advanced features B\n\nConverted placeholder tests to real assertions across 5 files:\n- code-actions-provider.test.ts (2 placeholders)\n- rename-provider.test.ts (18 placeholders)\n- signature-help-provider.test.ts (18 placeholders)\n- inlay-hints-provider.test.ts (26 placeholders)\n- folding-range-provider.test.ts (20 placeholders)\n\nAll tests validate actual LSP provider behavior and pass successfully.",
          "timestamp": "2026-02-07T16:48:38Z",
          "tree_id": "fc1595e6578efb6a15d275398bdbf5e24ca1c814",
          "url": "https://github.com/TheSmuks/pike-lsp/commit/2b5c95a599334ec1621a53c880af2d8e346c4688"
        },
        "date": 1770482998209,
        "tool": "customSmallerIsBetter",
        "benches": [
          {
            "name": "PikeBridge.start() [Cold Start]",
            "value": 202.85616491666664,
            "unit": "ms"
          },
          {
            "name": "PikeBridge.start() with detailed metrics [Cold Start]",
            "value": 250.8367065,
            "unit": "ms"
          },
          {
            "name": "Cold Start + First Request (getVersionInfo)",
            "value": 251.95561866666665,
            "unit": "ms"
          },
          {
            "name": "Cold Start + Introspect",
            "value": 255.53504683333335,
            "unit": "ms"
          },
          {
            "name": "Validation: Small File (~15 lines)",
            "value": 1.2085025912280702,
            "unit": "ms"
          },
          {
            "name": "Validation: Medium File (~100 lines)",
            "value": 3.9191405314285714,
            "unit": "ms"
          },
          {
            "name": "Validation: Large File (~1000 lines)",
            "value": 48.54436272727273,
            "unit": "ms"
          },
          {
            "name": "Validation Legacy (3 calls: analyze + parse + analyzeUninitialized)",
            "value": 4.962173442028985,
            "unit": "ms"
          },
          {
            "name": "Validation Consolidated (1 call: analyze with all includes)",
            "value": 3.847730483146067,
            "unit": "ms"
          },
          {
            "name": "Cache Hit: analyze with same document version",
            "value": 0.28981017104111984,
            "unit": "ms"
          },
          {
            "name": "Cache Miss: analyze with different version",
            "value": 0.27466631714404316,
            "unit": "ms"
          },
          {
            "name": "Closed File: analyze without version (stat-based key)",
            "value": 0.5465211890587288,
            "unit": "ms"
          },
          {
            "name": "Cross-file: compile main with inherited utils",
            "value": 0.19085865181224004,
            "unit": "ms"
          },
          {
            "name": "Cross-file: recompile main (cache hit)",
            "value": 0.18100397422096318,
            "unit": "ms"
          },
          {
            "name": "resolveStdlib(\"Stdio\") - warm",
            "value": 1.6565637913669065,
            "unit": "ms"
          },
          {
            "name": "resolveStdlib(\"String\")",
            "value": 0.3722196104328524,
            "unit": "ms"
          },
          {
            "name": "resolveStdlib(\"Array\")",
            "value": 0.36033335553168633,
            "unit": "ms"
          },
          {
            "name": "resolveStdlib(\"Mapping\")",
            "value": 0.10271637701032674,
            "unit": "ms"
          },
          {
            "name": "resolveStdlib(\"Stdio.File\") - nested",
            "value": 0.5504694923201293,
            "unit": "ms"
          },
          {
            "name": "resolveStdlib(\"String.SplitIterator\") - nested",
            "value": 0.07947901675449263,
            "unit": "ms"
          },
          {
            "name": "First diagnostic after document change",
            "value": 0.3698790209135938,
            "unit": "ms"
          },
          {
            "name": "Validation with 250ms debounce (default)",
            "value": 251.12588458333335,
            "unit": "ms"
          },
          {
            "name": "Rapid edit simulation (debounce coalescing)",
            "value": 255.417277,
            "unit": "ms"
          },
          {
            "name": "Hover: resolveStdlib(\"Stdio.File\")",
            "value": 0.5665372094763093,
            "unit": "ms"
          },
          {
            "name": "Hover: resolveModule(\"Stdio.File\")",
            "value": 0.07903433629390393,
            "unit": "ms"
          },
          {
            "name": "Completion: getCompletionContext (Large File, Warm Cache)",
            "value": 5.756801677966102,
            "unit": "ms"
          },
          {
            "name": "Completion: getCompletionContext (Large File, Cold Cache)",
            "value": 5.681941491666667,
            "unit": "ms"
          }
        ]
      },
      {
        "commit": {
          "author": {
            "name": "TheSmuks",
            "username": "TheSmuks"
          },
          "committer": {
            "name": "TheSmuks",
            "username": "TheSmuks"
          },
          "id": "de1529a6e9a16a1fc9130c196975d65c0add1bb7",
          "message": "test: Convert 158 placeholder tests in hierarchy and diagnostics",
          "timestamp": "2026-02-07T16:48:42Z",
          "url": "https://github.com/TheSmuks/pike-lsp/pull/8/commits/de1529a6e9a16a1fc9130c196975d65c0add1bb7"
        },
        "date": 1770483283491,
        "tool": "customSmallerIsBetter",
        "benches": [
          {
            "name": "PikeBridge.start() [Cold Start]",
            "value": 200.77121266666666,
            "unit": "ms"
          },
          {
            "name": "PikeBridge.start() with detailed metrics [Cold Start]",
            "value": 248.16748083333334,
            "unit": "ms"
          },
          {
            "name": "Cold Start + First Request (getVersionInfo)",
            "value": 249.74745233333334,
            "unit": "ms"
          },
          {
            "name": "Cold Start + Introspect",
            "value": 252.9388235,
            "unit": "ms"
          },
          {
            "name": "Validation: Small File (~15 lines)",
            "value": 1.2008416289198607,
            "unit": "ms"
          },
          {
            "name": "Validation: Medium File (~100 lines)",
            "value": 3.8480460726256984,
            "unit": "ms"
          },
          {
            "name": "Validation: Large File (~1000 lines)",
            "value": 47.499114636363636,
            "unit": "ms"
          },
          {
            "name": "Validation Legacy (3 calls: analyze + parse + analyzeUninitialized)",
            "value": 4.937619,
            "unit": "ms"
          },
          {
            "name": "Validation Consolidated (1 call: analyze with all includes)",
            "value": 3.832781290502793,
            "unit": "ms"
          },
          {
            "name": "Cache Hit: analyze with same document version",
            "value": 0.27407037809917356,
            "unit": "ms"
          },
          {
            "name": "Cache Miss: analyze with different version",
            "value": 0.27101388139059307,
            "unit": "ms"
          },
          {
            "name": "Closed File: analyze without version (stat-based key)",
            "value": 0.5464575550200803,
            "unit": "ms"
          },
          {
            "name": "Cross-file: compile main with inherited utils",
            "value": 0.18202247918436704,
            "unit": "ms"
          },
          {
            "name": "Cross-file: recompile main (cache hit)",
            "value": 0.18323317424892704,
            "unit": "ms"
          },
          {
            "name": "resolveStdlib(\"Stdio\") - warm",
            "value": 1.672398966101695,
            "unit": "ms"
          },
          {
            "name": "resolveStdlib(\"String\")",
            "value": 0.3949862721407625,
            "unit": "ms"
          },
          {
            "name": "resolveStdlib(\"Array\")",
            "value": 0.3498798280354351,
            "unit": "ms"
          },
          {
            "name": "resolveStdlib(\"Mapping\")",
            "value": 0.09327585132192846,
            "unit": "ms"
          },
          {
            "name": "resolveStdlib(\"Stdio.File\") - nested",
            "value": 0.5603910123355262,
            "unit": "ms"
          },
          {
            "name": "resolveStdlib(\"String.SplitIterator\") - nested",
            "value": 0.06743864644368489,
            "unit": "ms"
          },
          {
            "name": "First diagnostic after document change",
            "value": 0.38718224238943133,
            "unit": "ms"
          },
          {
            "name": "Validation with 250ms debounce (default)",
            "value": 250.47021008333334,
            "unit": "ms"
          },
          {
            "name": "Rapid edit simulation (debounce coalescing)",
            "value": 252.56359616666666,
            "unit": "ms"
          },
          {
            "name": "Hover: resolveStdlib(\"Stdio.File\")",
            "value": 0.5600449202958094,
            "unit": "ms"
          },
          {
            "name": "Hover: resolveModule(\"Stdio.File\")",
            "value": 0.07328144451402806,
            "unit": "ms"
          },
          {
            "name": "Completion: getCompletionContext (Large File, Warm Cache)",
            "value": 5.639844785123967,
            "unit": "ms"
          },
          {
            "name": "Completion: getCompletionContext (Large File, Cold Cache)",
            "value": 5.795645581196581,
            "unit": "ms"
          }
        ]
      },
      {
        "commit": {
          "author": {
            "name": "TheSmuks",
            "username": "TheSmuks"
          },
          "committer": {
            "name": "TheSmuks",
            "username": "TheSmuks"
          },
          "id": "ef14301a11f6dacefd65e84f3c711d5ab51843d8",
          "message": "test: Convert 44 placeholder tests in symbols and config",
          "timestamp": "2026-02-07T16:48:42Z",
          "url": "https://github.com/TheSmuks/pike-lsp/pull/10/commits/ef14301a11f6dacefd65e84f3c711d5ab51843d8"
        },
        "date": 1770483312691,
        "tool": "customSmallerIsBetter",
        "benches": [
          {
            "name": "PikeBridge.start() [Cold Start]",
            "value": 202.81299633333333,
            "unit": "ms"
          },
          {
            "name": "PikeBridge.start() with detailed metrics [Cold Start]",
            "value": 247.48821008333334,
            "unit": "ms"
          },
          {
            "name": "Cold Start + First Request (getVersionInfo)",
            "value": 248.33177775,
            "unit": "ms"
          },
          {
            "name": "Cold Start + Introspect",
            "value": 252.80569516666665,
            "unit": "ms"
          },
          {
            "name": "Validation: Small File (~15 lines)",
            "value": 1.0988225841269843,
            "unit": "ms"
          },
          {
            "name": "Validation: Medium File (~100 lines)",
            "value": 3.5311049282051283,
            "unit": "ms"
          },
          {
            "name": "Validation: Large File (~1000 lines)",
            "value": 42.872562307692306,
            "unit": "ms"
          },
          {
            "name": "Validation Legacy (3 calls: analyze + parse + analyzeUninitialized)",
            "value": 4.504784125,
            "unit": "ms"
          },
          {
            "name": "Validation Consolidated (1 call: analyze with all includes)",
            "value": 3.5623924248704664,
            "unit": "ms"
          },
          {
            "name": "Cache Hit: analyze with same document version",
            "value": 0.23412123425605535,
            "unit": "ms"
          },
          {
            "name": "Cache Miss: analyze with different version",
            "value": 0.2214924254486134,
            "unit": "ms"
          },
          {
            "name": "Closed File: analyze without version (stat-based key)",
            "value": 0.5107540995542348,
            "unit": "ms"
          },
          {
            "name": "Cross-file: compile main with inherited utils",
            "value": 0.1569493311874106,
            "unit": "ms"
          },
          {
            "name": "Cross-file: recompile main (cache hit)",
            "value": 0.15404344969440525,
            "unit": "ms"
          },
          {
            "name": "resolveStdlib(\"Stdio\") - warm",
            "value": 1.6214055690866511,
            "unit": "ms"
          },
          {
            "name": "resolveStdlib(\"String\")",
            "value": 0.3225572789820924,
            "unit": "ms"
          },
          {
            "name": "resolveStdlib(\"Array\")",
            "value": 0.33206584717444715,
            "unit": "ms"
          },
          {
            "name": "resolveStdlib(\"Mapping\")",
            "value": 0.08453510353403142,
            "unit": "ms"
          },
          {
            "name": "resolveStdlib(\"Stdio.File\") - nested",
            "value": 0.5522601229903538,
            "unit": "ms"
          },
          {
            "name": "resolveStdlib(\"String.SplitIterator\") - nested",
            "value": 0.057379008302919705,
            "unit": "ms"
          },
          {
            "name": "First diagnostic after document change",
            "value": 0.3162339782608696,
            "unit": "ms"
          },
          {
            "name": "Validation with 250ms debounce (default)",
            "value": 251.18733858333334,
            "unit": "ms"
          },
          {
            "name": "Rapid edit simulation (debounce coalescing)",
            "value": 255.56677425,
            "unit": "ms"
          },
          {
            "name": "Hover: resolveStdlib(\"Stdio.File\")",
            "value": 0.5432281484992101,
            "unit": "ms"
          },
          {
            "name": "Hover: resolveModule(\"Stdio.File\")",
            "value": 0.053771343953450526,
            "unit": "ms"
          },
          {
            "name": "Completion: getCompletionContext (Large File, Warm Cache)",
            "value": 5.487201120967742,
            "unit": "ms"
          },
          {
            "name": "Completion: getCompletionContext (Large File, Cold Cache)",
            "value": 5.42352846031746,
            "unit": "ms"
          }
        ]
      },
      {
        "commit": {
          "author": {
            "name": "TheSmuks",
            "username": "TheSmuks"
          },
          "committer": {
            "name": "TheSmuks",
            "username": "TheSmuks"
          },
          "id": "ffcad749b44271b0a83ba2a396d839ea7a80fd89",
          "message": "test: Convert 44 placeholder tests in symbols and config",
          "timestamp": "2026-02-07T16:48:42Z",
          "url": "https://github.com/TheSmuks/pike-lsp/pull/10/commits/ffcad749b44271b0a83ba2a396d839ea7a80fd89"
        },
        "date": 1770483323574,
        "tool": "customSmallerIsBetter",
        "benches": [
          {
            "name": "PikeBridge.start() [Cold Start]",
            "value": 201.48002391666665,
            "unit": "ms"
          },
          {
            "name": "PikeBridge.start() with detailed metrics [Cold Start]",
            "value": 248.65473891666664,
            "unit": "ms"
          },
          {
            "name": "Cold Start + First Request (getVersionInfo)",
            "value": 248.05264516666665,
            "unit": "ms"
          },
          {
            "name": "Cold Start + Introspect",
            "value": 254.03918891666666,
            "unit": "ms"
          },
          {
            "name": "Validation: Small File (~15 lines)",
            "value": 1.1861412409638554,
            "unit": "ms"
          },
          {
            "name": "Validation: Medium File (~100 lines)",
            "value": 3.8877116779661014,
            "unit": "ms"
          },
          {
            "name": "Validation: Large File (~1000 lines)",
            "value": 47.262667,
            "unit": "ms"
          },
          {
            "name": "Validation Legacy (3 calls: analyze + parse + analyzeUninitialized)",
            "value": 4.904683532374101,
            "unit": "ms"
          },
          {
            "name": "Validation Consolidated (1 call: analyze with all includes)",
            "value": 3.8075198950276246,
            "unit": "ms"
          },
          {
            "name": "Cache Hit: analyze with same document version",
            "value": 0.2742199044269756,
            "unit": "ms"
          },
          {
            "name": "Cache Miss: analyze with different version",
            "value": 0.26867739416058395,
            "unit": "ms"
          },
          {
            "name": "Closed File: analyze without version (stat-based key)",
            "value": 0.5601072512355848,
            "unit": "ms"
          },
          {
            "name": "Cross-file: compile main with inherited utils",
            "value": 0.19865509369202225,
            "unit": "ms"
          },
          {
            "name": "Cross-file: recompile main (cache hit)",
            "value": 0.17732868976989188,
            "unit": "ms"
          },
          {
            "name": "resolveStdlib(\"Stdio\") - warm",
            "value": 1.6412438527315916,
            "unit": "ms"
          },
          {
            "name": "resolveStdlib(\"String\")",
            "value": 0.3634463311653116,
            "unit": "ms"
          },
          {
            "name": "resolveStdlib(\"Array\")",
            "value": 0.35223551993704094,
            "unit": "ms"
          },
          {
            "name": "resolveStdlib(\"Mapping\")",
            "value": 0.09942128541018504,
            "unit": "ms"
          },
          {
            "name": "resolveStdlib(\"Stdio.File\") - nested",
            "value": 0.5612699003294893,
            "unit": "ms"
          },
          {
            "name": "resolveStdlib(\"String.SplitIterator\") - nested",
            "value": 0.07272517228511009,
            "unit": "ms"
          },
          {
            "name": "First diagnostic after document change",
            "value": 0.3739499259052925,
            "unit": "ms"
          },
          {
            "name": "Validation with 250ms debounce (default)",
            "value": 250.52596466666665,
            "unit": "ms"
          },
          {
            "name": "Rapid edit simulation (debounce coalescing)",
            "value": 252.37868916666665,
            "unit": "ms"
          },
          {
            "name": "Hover: resolveStdlib(\"Stdio.File\")",
            "value": 0.5593882298850574,
            "unit": "ms"
          },
          {
            "name": "Hover: resolveModule(\"Stdio.File\")",
            "value": 0.0877861109152343,
            "unit": "ms"
          },
          {
            "name": "Completion: getCompletionContext (Large File, Warm Cache)",
            "value": 5.616806512396694,
            "unit": "ms"
          },
          {
            "name": "Completion: getCompletionContext (Large File, Cold Cache)",
            "value": 5.640436768595042,
            "unit": "ms"
          }
        ]
      },
      {
        "commit": {
          "author": {
            "name": "TheSmuks",
            "username": "TheSmuks"
          },
          "committer": {
            "name": "TheSmuks",
            "username": "TheSmuks"
          },
          "id": "5fc941c705b7411ada346655f49664c79f373cec",
          "message": "test: Convert 44 placeholder tests in symbols and config",
          "timestamp": "2026-02-07T16:48:42Z",
          "url": "https://github.com/TheSmuks/pike-lsp/pull/10/commits/5fc941c705b7411ada346655f49664c79f373cec"
        },
        "date": 1770483375434,
        "tool": "customSmallerIsBetter",
        "benches": [
          {
            "name": "PikeBridge.start() [Cold Start]",
            "value": 202.87567566666667,
            "unit": "ms"
          },
          {
            "name": "PikeBridge.start() with detailed metrics [Cold Start]",
            "value": 253.32854516666666,
            "unit": "ms"
          },
          {
            "name": "Cold Start + First Request (getVersionInfo)",
            "value": 254.26614475,
            "unit": "ms"
          },
          {
            "name": "Cold Start + Introspect",
            "value": 258.3698590833333,
            "unit": "ms"
          },
          {
            "name": "Validation: Small File (~15 lines)",
            "value": 1.2043035646853146,
            "unit": "ms"
          },
          {
            "name": "Validation: Medium File (~100 lines)",
            "value": 3.9640272716763008,
            "unit": "ms"
          },
          {
            "name": "Validation: Large File (~1000 lines)",
            "value": 49.322303363636365,
            "unit": "ms"
          },
          {
            "name": "Validation Legacy (3 calls: analyze + parse + analyzeUninitialized)",
            "value": 5.010069382352941,
            "unit": "ms"
          },
          {
            "name": "Validation Consolidated (1 call: analyze with all includes)",
            "value": 3.9903838837209302,
            "unit": "ms"
          },
          {
            "name": "Cache Hit: analyze with same document version",
            "value": 0.28681016688283617,
            "unit": "ms"
          },
          {
            "name": "Cache Miss: analyze with different version",
            "value": 0.28431653482373176,
            "unit": "ms"
          },
          {
            "name": "Closed File: analyze without version (stat-based key)",
            "value": 0.5673431980033278,
            "unit": "ms"
          },
          {
            "name": "Cross-file: compile main with inherited utils",
            "value": 0.2109339568062827,
            "unit": "ms"
          },
          {
            "name": "Cross-file: recompile main (cache hit)",
            "value": 0.20125218503315442,
            "unit": "ms"
          },
          {
            "name": "resolveStdlib(\"Stdio\") - warm",
            "value": 1.7110196253101737,
            "unit": "ms"
          },
          {
            "name": "resolveStdlib(\"String\")",
            "value": 0.3973972643067847,
            "unit": "ms"
          },
          {
            "name": "resolveStdlib(\"Array\")",
            "value": 0.3911213696158323,
            "unit": "ms"
          },
          {
            "name": "resolveStdlib(\"Mapping\")",
            "value": 0.1180737009399578,
            "unit": "ms"
          },
          {
            "name": "resolveStdlib(\"Stdio.File\") - nested",
            "value": 0.5948468532751092,
            "unit": "ms"
          },
          {
            "name": "resolveStdlib(\"String.SplitIterator\") - nested",
            "value": 0.09328034731199748,
            "unit": "ms"
          },
          {
            "name": "First diagnostic after document change",
            "value": 0.407455053874092,
            "unit": "ms"
          },
          {
            "name": "Validation with 250ms debounce (default)",
            "value": 251.62247125,
            "unit": "ms"
          },
          {
            "name": "Rapid edit simulation (debounce coalescing)",
            "value": 254.99791208333335,
            "unit": "ms"
          },
          {
            "name": "Hover: resolveStdlib(\"Stdio.File\")",
            "value": 0.6268847518382353,
            "unit": "ms"
          },
          {
            "name": "Hover: resolveModule(\"Stdio.File\")",
            "value": 0.0848306501928296,
            "unit": "ms"
          },
          {
            "name": "Completion: getCompletionContext (Large File, Warm Cache)",
            "value": 5.771288220338984,
            "unit": "ms"
          },
          {
            "name": "Completion: getCompletionContext (Large File, Cold Cache)",
            "value": 5.780225881355932,
            "unit": "ms"
          }
        ]
      },
      {
        "commit": {
          "author": {
            "name": "TheSmuks",
            "username": "TheSmuks"
          },
          "committer": {
            "name": "TheSmuks",
            "username": "TheSmuks"
          },
          "id": "83666b379f0ad3353896efa9f43b0a2ec841ccce",
          "message": "test: Convert 44 placeholder tests in symbols and config",
          "timestamp": "2026-02-07T16:48:42Z",
          "url": "https://github.com/TheSmuks/pike-lsp/pull/10/commits/83666b379f0ad3353896efa9f43b0a2ec841ccce"
        },
        "date": 1770483395427,
        "tool": "customSmallerIsBetter",
        "benches": [
          {
            "name": "PikeBridge.start() [Cold Start]",
            "value": 202.6651225,
            "unit": "ms"
          },
          {
            "name": "PikeBridge.start() with detailed metrics [Cold Start]",
            "value": 249.93200566666667,
            "unit": "ms"
          },
          {
            "name": "Cold Start + First Request (getVersionInfo)",
            "value": 249.773049,
            "unit": "ms"
          },
          {
            "name": "Cold Start + Introspect",
            "value": 254.30376041666665,
            "unit": "ms"
          },
          {
            "name": "Validation: Small File (~15 lines)",
            "value": 1.1638492411467116,
            "unit": "ms"
          },
          {
            "name": "Validation: Medium File (~100 lines)",
            "value": 3.8230615,
            "unit": "ms"
          },
          {
            "name": "Validation: Large File (~1000 lines)",
            "value": 47.36543627272727,
            "unit": "ms"
          },
          {
            "name": "Validation Legacy (3 calls: analyze + parse + analyzeUninitialized)",
            "value": 4.9091197338129495,
            "unit": "ms"
          },
          {
            "name": "Validation Consolidated (1 call: analyze with all includes)",
            "value": 3.8123676222222223,
            "unit": "ms"
          },
          {
            "name": "Cache Hit: analyze with same document version",
            "value": 0.2751135369601329,
            "unit": "ms"
          },
          {
            "name": "Cache Miss: analyze with different version",
            "value": 0.2627705017864232,
            "unit": "ms"
          },
          {
            "name": "Closed File: analyze without version (stat-based key)",
            "value": 0.5376344636075949,
            "unit": "ms"
          },
          {
            "name": "Cross-file: compile main with inherited utils",
            "value": 0.19791034112580744,
            "unit": "ms"
          },
          {
            "name": "Cross-file: recompile main (cache hit)",
            "value": 0.1813484378194208,
            "unit": "ms"
          },
          {
            "name": "resolveStdlib(\"Stdio\") - warm",
            "value": 1.6670072971014491,
            "unit": "ms"
          },
          {
            "name": "resolveStdlib(\"String\")",
            "value": 0.37171382014388493,
            "unit": "ms"
          },
          {
            "name": "resolveStdlib(\"Array\")",
            "value": 0.3498667221063608,
            "unit": "ms"
          },
          {
            "name": "resolveStdlib(\"Mapping\")",
            "value": 0.1039262687382619,
            "unit": "ms"
          },
          {
            "name": "resolveStdlib(\"Stdio.File\") - nested",
            "value": 0.5568904636140638,
            "unit": "ms"
          },
          {
            "name": "resolveStdlib(\"String.SplitIterator\") - nested",
            "value": 0.07807185665031163,
            "unit": "ms"
          },
          {
            "name": "First diagnostic after document change",
            "value": 0.36467923695652177,
            "unit": "ms"
          },
          {
            "name": "Validation with 250ms debounce (default)",
            "value": 250.9377265,
            "unit": "ms"
          },
          {
            "name": "Rapid edit simulation (debounce coalescing)",
            "value": 254.9917845,
            "unit": "ms"
          },
          {
            "name": "Hover: resolveStdlib(\"Stdio.File\")",
            "value": 0.5754631131756757,
            "unit": "ms"
          },
          {
            "name": "Hover: resolveModule(\"Stdio.File\")",
            "value": 0.08784886025622146,
            "unit": "ms"
          },
          {
            "name": "Completion: getCompletionContext (Large File, Warm Cache)",
            "value": 5.700854258333334,
            "unit": "ms"
          },
          {
            "name": "Completion: getCompletionContext (Large File, Cold Cache)",
            "value": 5.626214900826446,
            "unit": "ms"
          }
        ]
      },
      {
        "commit": {
          "author": {
            "name": "TheSmuks",
            "username": "TheSmuks"
          },
          "committer": {
            "name": "TheSmuks",
            "username": "TheSmuks"
          },
          "id": "fdd73bfe98d3591b52fea4c71e05bfc5bd9334e4",
          "message": "test: Convert 44 placeholder tests in symbols and config",
          "timestamp": "2026-02-07T16:48:42Z",
          "url": "https://github.com/TheSmuks/pike-lsp/pull/10/commits/fdd73bfe98d3591b52fea4c71e05bfc5bd9334e4"
        },
        "date": 1770483435472,
        "tool": "customSmallerIsBetter",
        "benches": [
          {
            "name": "PikeBridge.start() [Cold Start]",
            "value": 202.86858583333336,
            "unit": "ms"
          },
          {
            "name": "PikeBridge.start() with detailed metrics [Cold Start]",
            "value": 251.02846933333333,
            "unit": "ms"
          },
          {
            "name": "Cold Start + First Request (getVersionInfo)",
            "value": 252.390352,
            "unit": "ms"
          },
          {
            "name": "Cold Start + Introspect",
            "value": 255.5411775,
            "unit": "ms"
          },
          {
            "name": "Validation: Small File (~15 lines)",
            "value": 1.1888196310344827,
            "unit": "ms"
          },
          {
            "name": "Validation: Medium File (~100 lines)",
            "value": 3.8202736944444444,
            "unit": "ms"
          },
          {
            "name": "Validation: Large File (~1000 lines)",
            "value": 47.81235618181818,
            "unit": "ms"
          },
          {
            "name": "Validation Legacy (3 calls: analyze + parse + analyzeUninitialized)",
            "value": 4.9240268129496405,
            "unit": "ms"
          },
          {
            "name": "Validation Consolidated (1 call: analyze with all includes)",
            "value": 3.756211306010929,
            "unit": "ms"
          },
          {
            "name": "Cache Hit: analyze with same document version",
            "value": 0.26999977700774563,
            "unit": "ms"
          },
          {
            "name": "Cache Miss: analyze with different version",
            "value": 0.2674415722940226,
            "unit": "ms"
          },
          {
            "name": "Closed File: analyze without version (stat-based key)",
            "value": 0.5427070223463688,
            "unit": "ms"
          },
          {
            "name": "Cross-file: compile main with inherited utils",
            "value": 0.1884244193358801,
            "unit": "ms"
          },
          {
            "name": "Cross-file: recompile main (cache hit)",
            "value": 0.19128630943847072,
            "unit": "ms"
          },
          {
            "name": "resolveStdlib(\"Stdio\") - warm",
            "value": 1.637131817535545,
            "unit": "ms"
          },
          {
            "name": "resolveStdlib(\"String\")",
            "value": 0.3729543403664631,
            "unit": "ms"
          },
          {
            "name": "resolveStdlib(\"Array\")",
            "value": 0.34619924212700054,
            "unit": "ms"
          },
          {
            "name": "resolveStdlib(\"Mapping\")",
            "value": 0.09793933618187682,
            "unit": "ms"
          },
          {
            "name": "resolveStdlib(\"Stdio.File\") - nested",
            "value": 0.5472035630522089,
            "unit": "ms"
          },
          {
            "name": "resolveStdlib(\"String.SplitIterator\") - nested",
            "value": 0.0726364517013586,
            "unit": "ms"
          },
          {
            "name": "First diagnostic after document change",
            "value": 0.3804782552467385,
            "unit": "ms"
          },
          {
            "name": "Validation with 250ms debounce (default)",
            "value": 251.0037,
            "unit": "ms"
          },
          {
            "name": "Rapid edit simulation (debounce coalescing)",
            "value": 255.26186983333335,
            "unit": "ms"
          },
          {
            "name": "Hover: resolveStdlib(\"Stdio.File\")",
            "value": 0.5611894444444445,
            "unit": "ms"
          },
          {
            "name": "Hover: resolveModule(\"Stdio.File\")",
            "value": 0.07832003548644338,
            "unit": "ms"
          },
          {
            "name": "Completion: getCompletionContext (Large File, Warm Cache)",
            "value": 5.675210516666667,
            "unit": "ms"
          },
          {
            "name": "Completion: getCompletionContext (Large File, Cold Cache)",
            "value": 5.675354325,
            "unit": "ms"
          }
        ]
      },
      {
        "commit": {
          "author": {
            "name": "TheSmuks",
            "username": "TheSmuks"
          },
          "committer": {
            "name": "TheSmuks",
            "username": "TheSmuks"
          },
          "id": "effc582177237813970f151349dddc350adec026",
          "message": "test: Convert 44 placeholder tests in symbols and config",
          "timestamp": "2026-02-07T16:48:42Z",
          "url": "https://github.com/TheSmuks/pike-lsp/pull/10/commits/effc582177237813970f151349dddc350adec026"
        },
        "date": 1770483477818,
        "tool": "customSmallerIsBetter",
        "benches": [
          {
            "name": "PikeBridge.start() [Cold Start]",
            "value": 201.55323941666666,
            "unit": "ms"
          },
          {
            "name": "PikeBridge.start() with detailed metrics [Cold Start]",
            "value": 249.98072558333334,
            "unit": "ms"
          },
          {
            "name": "Cold Start + First Request (getVersionInfo)",
            "value": 250.4780335,
            "unit": "ms"
          },
          {
            "name": "Cold Start + Introspect",
            "value": 254.49670066666667,
            "unit": "ms"
          },
          {
            "name": "Validation: Small File (~15 lines)",
            "value": 1.1868626919104992,
            "unit": "ms"
          },
          {
            "name": "Validation: Medium File (~100 lines)",
            "value": 3.8956688579545453,
            "unit": "ms"
          },
          {
            "name": "Validation: Large File (~1000 lines)",
            "value": 47.78947872727273,
            "unit": "ms"
          },
          {
            "name": "Validation Legacy (3 calls: analyze + parse + analyzeUninitialized)",
            "value": 4.917341043165468,
            "unit": "ms"
          },
          {
            "name": "Validation Consolidated (1 call: analyze with all includes)",
            "value": 3.8184201666666664,
            "unit": "ms"
          },
          {
            "name": "Cache Hit: analyze with same document version",
            "value": 0.2755081762261014,
            "unit": "ms"
          },
          {
            "name": "Cache Miss: analyze with different version",
            "value": 0.26963101505288856,
            "unit": "ms"
          },
          {
            "name": "Closed File: analyze without version (stat-based key)",
            "value": 0.5743598021978022,
            "unit": "ms"
          },
          {
            "name": "Cross-file: compile main with inherited utils",
            "value": 0.18424069517795635,
            "unit": "ms"
          },
          {
            "name": "Cross-file: recompile main (cache hit)",
            "value": 0.19981444340505145,
            "unit": "ms"
          },
          {
            "name": "resolveStdlib(\"Stdio\") - warm",
            "value": 1.640405268408551,
            "unit": "ms"
          },
          {
            "name": "resolveStdlib(\"String\")",
            "value": 0.3868856737629459,
            "unit": "ms"
          },
          {
            "name": "resolveStdlib(\"Array\")",
            "value": 0.3691958487348735,
            "unit": "ms"
          },
          {
            "name": "resolveStdlib(\"Mapping\")",
            "value": 0.10478154640590152,
            "unit": "ms"
          },
          {
            "name": "resolveStdlib(\"Stdio.File\") - nested",
            "value": 0.5638965753311259,
            "unit": "ms"
          },
          {
            "name": "resolveStdlib(\"String.SplitIterator\") - nested",
            "value": 0.07416473551432293,
            "unit": "ms"
          },
          {
            "name": "First diagnostic after document change",
            "value": 0.40008028256989886,
            "unit": "ms"
          },
          {
            "name": "Validation with 250ms debounce (default)",
            "value": 250.94639591666666,
            "unit": "ms"
          },
          {
            "name": "Rapid edit simulation (debounce coalescing)",
            "value": 254.85428816666666,
            "unit": "ms"
          },
          {
            "name": "Hover: resolveStdlib(\"Stdio.File\")",
            "value": 0.555141766286645,
            "unit": "ms"
          },
          {
            "name": "Hover: resolveModule(\"Stdio.File\")",
            "value": 0.07845158435337946,
            "unit": "ms"
          },
          {
            "name": "Completion: getCompletionContext (Large File, Warm Cache)",
            "value": 5.636072685950413,
            "unit": "ms"
          },
          {
            "name": "Completion: getCompletionContext (Large File, Cold Cache)",
            "value": 5.6145939008264465,
            "unit": "ms"
          }
        ]
      },
      {
        "commit": {
          "author": {
            "name": "TheSmuks",
            "username": "TheSmuks"
          },
          "committer": {
            "name": "TheSmuks",
            "username": "TheSmuks"
          },
          "id": "196ac298979db96b60b042a14c6fd6cdc9829101",
          "message": "test: Convert 44 placeholder tests in symbols and config",
          "timestamp": "2026-02-07T16:48:42Z",
          "url": "https://github.com/TheSmuks/pike-lsp/pull/10/commits/196ac298979db96b60b042a14c6fd6cdc9829101"
        },
        "date": 1770483490968,
        "tool": "customSmallerIsBetter",
        "benches": [
          {
            "name": "PikeBridge.start() [Cold Start]",
            "value": 202.619015,
            "unit": "ms"
          },
          {
            "name": "PikeBridge.start() with detailed metrics [Cold Start]",
            "value": 249.82093575,
            "unit": "ms"
          },
          {
            "name": "Cold Start + First Request (getVersionInfo)",
            "value": 250.08922083333334,
            "unit": "ms"
          },
          {
            "name": "Cold Start + Introspect",
            "value": 253.98700383333335,
            "unit": "ms"
          },
          {
            "name": "Validation: Small File (~15 lines)",
            "value": 1.166433416243655,
            "unit": "ms"
          },
          {
            "name": "Validation: Medium File (~100 lines)",
            "value": 3.8464030111731846,
            "unit": "ms"
          },
          {
            "name": "Validation: Large File (~1000 lines)",
            "value": 46.833619416666664,
            "unit": "ms"
          },
          {
            "name": "Validation Legacy (3 calls: analyze + parse + analyzeUninitialized)",
            "value": 4.936300834532375,
            "unit": "ms"
          },
          {
            "name": "Validation Consolidated (1 call: analyze with all includes)",
            "value": 3.804041640883978,
            "unit": "ms"
          },
          {
            "name": "Cache Hit: analyze with same document version",
            "value": 0.2898985426695842,
            "unit": "ms"
          },
          {
            "name": "Cache Miss: analyze with different version",
            "value": 0.2786474678436318,
            "unit": "ms"
          },
          {
            "name": "Closed File: analyze without version (stat-based key)",
            "value": 0.5463469574638844,
            "unit": "ms"
          },
          {
            "name": "Cross-file: compile main with inherited utils",
            "value": 0.20828684371972875,
            "unit": "ms"
          },
          {
            "name": "Cross-file: recompile main (cache hit)",
            "value": 0.2119252893081761,
            "unit": "ms"
          },
          {
            "name": "resolveStdlib(\"Stdio\") - warm",
            "value": 1.739500628787879,
            "unit": "ms"
          },
          {
            "name": "resolveStdlib(\"String\")",
            "value": 0.38931547715442455,
            "unit": "ms"
          },
          {
            "name": "resolveStdlib(\"Array\")",
            "value": 0.38348036296296295,
            "unit": "ms"
          },
          {
            "name": "resolveStdlib(\"Mapping\")",
            "value": 0.11354627724418175,
            "unit": "ms"
          },
          {
            "name": "resolveStdlib(\"Stdio.File\") - nested",
            "value": 0.6237571181318681,
            "unit": "ms"
          },
          {
            "name": "resolveStdlib(\"String.SplitIterator\") - nested",
            "value": 0.08067077736726874,
            "unit": "ms"
          },
          {
            "name": "First diagnostic after document change",
            "value": 0.4024686973525872,
            "unit": "ms"
          },
          {
            "name": "Validation with 250ms debounce (default)",
            "value": 251.04853716666665,
            "unit": "ms"
          },
          {
            "name": "Rapid edit simulation (debounce coalescing)",
            "value": 254.99002741666666,
            "unit": "ms"
          },
          {
            "name": "Hover: resolveStdlib(\"Stdio.File\")",
            "value": 0.5993621088674276,
            "unit": "ms"
          },
          {
            "name": "Hover: resolveModule(\"Stdio.File\")",
            "value": 0.08570399351304597,
            "unit": "ms"
          },
          {
            "name": "Completion: getCompletionContext (Large File, Warm Cache)",
            "value": 5.696524159663865,
            "unit": "ms"
          },
          {
            "name": "Completion: getCompletionContext (Large File, Cold Cache)",
            "value": 5.62948132231405,
            "unit": "ms"
          }
        ]
      },
      {
        "commit": {
          "author": {
            "email": "60717893+TheSmuks@users.noreply.github.com",
            "name": "Smuks",
            "username": "TheSmuks"
          },
          "committer": {
            "email": "noreply@github.com",
            "name": "GitHub",
            "username": "web-flow"
          },
          "distinct": true,
          "id": "438e0724f092733aaae63c14d975afe356b9fa68",
          "message": "test: Convert 158 placeholder tests in hierarchy and diagnostics\n\n* test: convert 158 placeholder tests in hierarchy and diagnostics\n\nConverted placeholder tests to real assertions across 3 files:\n- call-hierarchy-provider.test.ts (55 placeholders)\n- type-hierarchy-provider.test.ts (59 placeholders)\n- diagnostics-provider.test.ts (44 placeholders)\n\nAll tests validate actual LSP provider behavior:\n- Call hierarchy (incoming/outgoing calls)\n- Type hierarchy (super/subtypes)\n- Diagnostics (error reporting)\n\nTests verify handler implementations in hierarchy.ts and diagnostics.ts.\nAll 158 tests passing.\n\n* fix: disable DBus for Chromium in headless E2E tests\n\nThis resolves the DBus connection errors that were blocking E2E tests\nin headless mode. Chromium now runs with explicit DBUS_SESSION_BUS_ADDRESS=''\nand --disable-features=UseOzonePlatform flag.\n\n- Set DBUS_SESSION_BUS_ADDRESS to empty string in xvfb-run environment\n- Add --disable-features=UseOzonePlatform to ELECTRON_EXTRA_LAUNCH_ARGS\n- E2E tests now pass: 108 passing (3m)\n\nFixes #E2E-ENV\n\n* fix: replace broken test assertions with test.skip\n\nThe test conversion agent left 86 broken assertions referencing undefined 'code' variable.\nThis commit replaces them with proper test.skip() markers.\n\n* fix: use return instead of test.skip for unimplemented tests\n\ntest.skip() is not available inside it() blocks in bun test framework.\nUsing return statements instead to skip unimplemented test assertions.",
          "timestamp": "2026-02-07T18:00:55+01:00",
          "tree_id": "d640453c9e29a8e382f7c3727e5972e90de4ac6f",
          "url": "https://github.com/TheSmuks/pike-lsp/commit/438e0724f092733aaae63c14d975afe356b9fa68"
        },
        "date": 1770483742747,
        "tool": "customSmallerIsBetter",
        "benches": [
          {
            "name": "PikeBridge.start() [Cold Start]",
            "value": 201.79077291666667,
            "unit": "ms"
          },
          {
            "name": "PikeBridge.start() with detailed metrics [Cold Start]",
            "value": 251.48040016666667,
            "unit": "ms"
          },
          {
            "name": "Cold Start + First Request (getVersionInfo)",
            "value": 249.48992308333334,
            "unit": "ms"
          },
          {
            "name": "Cold Start + Introspect",
            "value": 254.87866225,
            "unit": "ms"
          },
          {
            "name": "Validation: Small File (~15 lines)",
            "value": 1.174115654761905,
            "unit": "ms"
          },
          {
            "name": "Validation: Medium File (~100 lines)",
            "value": 3.8689502078651685,
            "unit": "ms"
          },
          {
            "name": "Validation: Large File (~1000 lines)",
            "value": 47.28374581818182,
            "unit": "ms"
          },
          {
            "name": "Validation Legacy (3 calls: analyze + parse + analyzeUninitialized)",
            "value": 4.905104714285715,
            "unit": "ms"
          },
          {
            "name": "Validation Consolidated (1 call: analyze with all includes)",
            "value": 3.787421408839779,
            "unit": "ms"
          },
          {
            "name": "Cache Hit: analyze with same document version",
            "value": 0.26546153333333333,
            "unit": "ms"
          },
          {
            "name": "Cache Miss: analyze with different version",
            "value": 0.2761419841600667,
            "unit": "ms"
          },
          {
            "name": "Closed File: analyze without version (stat-based key)",
            "value": 0.5460281789727127,
            "unit": "ms"
          },
          {
            "name": "Cross-file: compile main with inherited utils",
            "value": 0.19979828478260872,
            "unit": "ms"
          },
          {
            "name": "Cross-file: recompile main (cache hit)",
            "value": 0.20462450589735415,
            "unit": "ms"
          },
          {
            "name": "resolveStdlib(\"Stdio\") - warm",
            "value": 1.6610554783653846,
            "unit": "ms"
          },
          {
            "name": "resolveStdlib(\"String\")",
            "value": 0.38054582379603397,
            "unit": "ms"
          },
          {
            "name": "resolveStdlib(\"Array\")",
            "value": 0.3642389109663409,
            "unit": "ms"
          },
          {
            "name": "resolveStdlib(\"Mapping\")",
            "value": 0.10896011576135352,
            "unit": "ms"
          },
          {
            "name": "resolveStdlib(\"Stdio.File\") - nested",
            "value": 0.5918738706597223,
            "unit": "ms"
          },
          {
            "name": "resolveStdlib(\"String.SplitIterator\") - nested",
            "value": 0.08157065863453815,
            "unit": "ms"
          },
          {
            "name": "First diagnostic after document change",
            "value": 0.3869265599078341,
            "unit": "ms"
          },
          {
            "name": "Validation with 250ms debounce (default)",
            "value": 251.23929983333335,
            "unit": "ms"
          },
          {
            "name": "Rapid edit simulation (debounce coalescing)",
            "value": 255.39414091666666,
            "unit": "ms"
          },
          {
            "name": "Hover: resolveStdlib(\"Stdio.File\")",
            "value": 0.5809464083546462,
            "unit": "ms"
          },
          {
            "name": "Hover: resolveModule(\"Stdio.File\")",
            "value": 0.09062154753601213,
            "unit": "ms"
          },
          {
            "name": "Completion: getCompletionContext (Large File, Warm Cache)",
            "value": 5.7275485966386555,
            "unit": "ms"
          },
          {
            "name": "Completion: getCompletionContext (Large File, Cold Cache)",
            "value": 5.628555892561983,
            "unit": "ms"
          }
        ]
      },
      {
        "commit": {
          "author": {
            "name": "TheSmuks",
            "username": "TheSmuks"
          },
          "committer": {
            "name": "TheSmuks",
            "username": "TheSmuks"
          },
          "id": "aca18d2bb1b037123c8b7a08c9c8215cbc137312",
          "message": "fix: replace O(n²) paramOrder array append with O(1) mapping insert",
          "timestamp": "2026-02-07T17:01:00Z",
          "url": "https://github.com/TheSmuks/pike-lsp/pull/11/commits/aca18d2bb1b037123c8b7a08c9c8215cbc137312"
        },
        "date": 1770485530888,
        "tool": "customSmallerIsBetter",
        "benches": [
          {
            "name": "PikeBridge.start() [Cold Start]",
            "value": 200.85279558333335,
            "unit": "ms"
          },
          {
            "name": "PikeBridge.start() with detailed metrics [Cold Start]",
            "value": 247.53231316666665,
            "unit": "ms"
          },
          {
            "name": "Cold Start + First Request (getVersionInfo)",
            "value": 248.21722675,
            "unit": "ms"
          },
          {
            "name": "Cold Start + Introspect",
            "value": 255.03310825,
            "unit": "ms"
          },
          {
            "name": "Validation: Small File (~15 lines)",
            "value": 1.1727431819727892,
            "unit": "ms"
          },
          {
            "name": "Validation: Medium File (~100 lines)",
            "value": 3.821339861111111,
            "unit": "ms"
          },
          {
            "name": "Validation: Large File (~1000 lines)",
            "value": 46.935044,
            "unit": "ms"
          },
          {
            "name": "Validation Legacy (3 calls: analyze + parse + analyzeUninitialized)",
            "value": 4.840319808510638,
            "unit": "ms"
          },
          {
            "name": "Validation Consolidated (1 call: analyze with all includes)",
            "value": 3.7612137213114756,
            "unit": "ms"
          },
          {
            "name": "Cache Hit: analyze with same document version",
            "value": 0.2699912581433225,
            "unit": "ms"
          },
          {
            "name": "Cache Miss: analyze with different version",
            "value": 0.2748268307053942,
            "unit": "ms"
          },
          {
            "name": "Closed File: analyze without version (stat-based key)",
            "value": 0.5432733730031949,
            "unit": "ms"
          },
          {
            "name": "Cross-file: compile main with inherited utils",
            "value": 0.18677717899622862,
            "unit": "ms"
          },
          {
            "name": "Cross-file: recompile main (cache hit)",
            "value": 0.18192276787240103,
            "unit": "ms"
          },
          {
            "name": "resolveStdlib(\"Stdio\") - warm",
            "value": 1.6172781967213115,
            "unit": "ms"
          },
          {
            "name": "resolveStdlib(\"String\")",
            "value": 0.36137704036598495,
            "unit": "ms"
          },
          {
            "name": "resolveStdlib(\"Array\")",
            "value": 0.34531752032938756,
            "unit": "ms"
          },
          {
            "name": "resolveStdlib(\"Mapping\")",
            "value": 0.0980318081366965,
            "unit": "ms"
          },
          {
            "name": "resolveStdlib(\"Stdio.File\") - nested",
            "value": 0.5550128231458843,
            "unit": "ms"
          },
          {
            "name": "resolveStdlib(\"String.SplitIterator\") - nested",
            "value": 0.07571299341680651,
            "unit": "ms"
          },
          {
            "name": "First diagnostic after document change",
            "value": 0.3843945522558538,
            "unit": "ms"
          },
          {
            "name": "Validation with 250ms debounce (default)",
            "value": 251.06684191666665,
            "unit": "ms"
          },
          {
            "name": "Rapid edit simulation (debounce coalescing)",
            "value": 255.0373095,
            "unit": "ms"
          },
          {
            "name": "Hover: resolveStdlib(\"Stdio.File\")",
            "value": 0.5699555682008368,
            "unit": "ms"
          },
          {
            "name": "Hover: resolveModule(\"Stdio.File\")",
            "value": 0.08669591642399534,
            "unit": "ms"
          },
          {
            "name": "Completion: getCompletionContext (Large File, Warm Cache)",
            "value": 5.6812201,
            "unit": "ms"
          },
          {
            "name": "Completion: getCompletionContext (Large File, Cold Cache)",
            "value": 5.688832008333334,
            "unit": "ms"
          }
        ]
      },
      {
        "commit": {
          "author": {
            "name": "TheSmuks",
            "username": "TheSmuks"
          },
          "committer": {
            "name": "TheSmuks",
            "username": "TheSmuks"
          },
          "id": "2338e705ef3cb0fe59f789468ec38f8e7e01debc",
          "message": "fix: improve benchmark accuracy and regression detection",
          "timestamp": "2026-02-07T17:01:00Z",
          "url": "https://github.com/TheSmuks/pike-lsp/pull/12/commits/2338e705ef3cb0fe59f789468ec38f8e7e01debc"
        },
        "date": 1770485810639,
        "tool": "customSmallerIsBetter",
        "benches": [
          {
            "name": "PikeBridge.start() [Cold Start]",
            "value": 202.5358995,
            "unit": "ms"
          },
          {
            "name": "PikeBridge.start() with detailed metrics [Cold Start]",
            "value": 251.06087083333335,
            "unit": "ms"
          },
          {
            "name": "Cold Start + First Request (getVersionInfo)",
            "value": 253.13666833333335,
            "unit": "ms"
          },
          {
            "name": "Cold Start + Introspect",
            "value": 257.24304125,
            "unit": "ms"
          },
          {
            "name": "Validation: Small File (~15 lines)",
            "value": 1.233104771019678,
            "unit": "ms"
          },
          {
            "name": "Validation: Medium File (~100 lines)",
            "value": 3.9509787873563216,
            "unit": "ms"
          },
          {
            "name": "Validation: Large File (~1000 lines)",
            "value": 48.77001781818182,
            "unit": "ms"
          },
          {
            "name": "Validation Legacy (3 calls: analyze + parse + analyzeUninitialized)",
            "value": 5.086685723880597,
            "unit": "ms"
          },
          {
            "name": "Validation Consolidated (1 call: analyze with all includes)",
            "value": 3.92390872,
            "unit": "ms"
          },
          {
            "name": "Cache Hit: analyze with same document version",
            "value": 0.2797515128746306,
            "unit": "ms"
          },
          {
            "name": "Cache Miss: analyze with different version",
            "value": 0.29255923521624005,
            "unit": "ms"
          },
          {
            "name": "Closed File: analyze without version (stat-based key)",
            "value": 0.5816941280956448,
            "unit": "ms"
          },
          {
            "name": "Cross-file: compile main with inherited utils",
            "value": 0.20809385967170904,
            "unit": "ms"
          },
          {
            "name": "Cross-file: recompile main (cache hit)",
            "value": 0.190967287503728,
            "unit": "ms"
          },
          {
            "name": "resolveStdlib(\"Stdio\") - warm",
            "value": 1.6590204038461538,
            "unit": "ms"
          },
          {
            "name": "resolveStdlib(\"String\")",
            "value": 0.39361176039835966,
            "unit": "ms"
          },
          {
            "name": "resolveStdlib(\"Array\")",
            "value": 0.36510057834602827,
            "unit": "ms"
          },
          {
            "name": "resolveStdlib(\"Mapping\")",
            "value": 0.11329928516057586,
            "unit": "ms"
          },
          {
            "name": "resolveStdlib(\"Stdio.File\") - nested",
            "value": 0.6258011323529412,
            "unit": "ms"
          },
          {
            "name": "resolveStdlib(\"String.SplitIterator\") - nested",
            "value": 0.08451423606933105,
            "unit": "ms"
          },
          {
            "name": "First diagnostic after document change",
            "value": 0.3951564947183098,
            "unit": "ms"
          },
          {
            "name": "[Debounce] Validation with 250ms debounce",
            "value": 251.12941575,
            "unit": "ms"
          },
          {
            "name": "[Debounce] Rapid edit simulation (5x50ms)",
            "value": 255.47425558333333,
            "unit": "ms"
          },
          {
            "name": "Validation: sequential warm revalidation",
            "value": 0.4065899692028986,
            "unit": "ms"
          },
          {
            "name": "Hover: resolveStdlib(\"Stdio.File\")",
            "value": 0.6015853233215548,
            "unit": "ms"
          },
          {
            "name": "Hover: resolveModule(\"Stdio.File\")",
            "value": 0.08888832950990615,
            "unit": "ms"
          },
          {
            "name": "Completion: getCompletionContext (Large File, Warm Cache)",
            "value": 5.929470104347826,
            "unit": "ms"
          },
          {
            "name": "Completion: getCompletionContext (Large File, Cold Cache)",
            "value": 5.797778170940171,
            "unit": "ms"
          }
        ]
      },
      {
        "commit": {
          "author": {
            "name": "TheSmuks",
            "username": "TheSmuks"
          },
          "committer": {
            "name": "TheSmuks",
            "username": "TheSmuks"
          },
          "id": "23d9ba99e2cc578d704f35a148e0e8b831000c61",
          "message": "feat: replace nuclear cache eviction with LRU strategy",
          "timestamp": "2026-02-07T17:01:00Z",
          "url": "https://github.com/TheSmuks/pike-lsp/pull/13/commits/23d9ba99e2cc578d704f35a148e0e8b831000c61"
        },
        "date": 1770486943180,
        "tool": "customSmallerIsBetter",
        "benches": [
          {
            "name": "PikeBridge.start() [Cold Start]",
            "value": 202.39814591666666,
            "unit": "ms"
          },
          {
            "name": "PikeBridge.start() with detailed metrics [Cold Start]",
            "value": 250.39859366666667,
            "unit": "ms"
          },
          {
            "name": "Cold Start + First Request (getVersionInfo)",
            "value": 249.69954391666667,
            "unit": "ms"
          },
          {
            "name": "Cold Start + Introspect",
            "value": 254.47778558333334,
            "unit": "ms"
          },
          {
            "name": "Validation: Small File (~15 lines)",
            "value": 1.1924608183391003,
            "unit": "ms"
          },
          {
            "name": "Validation: Medium File (~100 lines)",
            "value": 3.8392832849162013,
            "unit": "ms"
          },
          {
            "name": "Validation: Large File (~1000 lines)",
            "value": 47.480312363636365,
            "unit": "ms"
          },
          {
            "name": "Validation Legacy (3 calls: analyze + parse + analyzeUninitialized)",
            "value": 4.867019578571429,
            "unit": "ms"
          },
          {
            "name": "Validation Consolidated (1 call: analyze with all includes)",
            "value": 3.838238067039106,
            "unit": "ms"
          },
          {
            "name": "Cache Hit: analyze with same document version",
            "value": 0.29269899911738745,
            "unit": "ms"
          },
          {
            "name": "Cache Miss: analyze with different version",
            "value": 0.28022419077834176,
            "unit": "ms"
          },
          {
            "name": "Closed File: analyze without version (stat-based key)",
            "value": 0.5586203476112026,
            "unit": "ms"
          },
          {
            "name": "Cross-file: compile main with inherited utils",
            "value": 0.20997810473735096,
            "unit": "ms"
          },
          {
            "name": "Cross-file: recompile main (cache hit)",
            "value": 0.18590122957993,
            "unit": "ms"
          },
          {
            "name": "resolveStdlib(\"Stdio\") - warm",
            "value": 1.6358109526066351,
            "unit": "ms"
          },
          {
            "name": "resolveStdlib(\"String\")",
            "value": 0.3892959807130333,
            "unit": "ms"
          },
          {
            "name": "resolveStdlib(\"Array\")",
            "value": 0.3769548197088466,
            "unit": "ms"
          },
          {
            "name": "resolveStdlib(\"Mapping\")",
            "value": 0.10907590347284062,
            "unit": "ms"
          },
          {
            "name": "resolveStdlib(\"Stdio.File\") - nested",
            "value": 0.5814940221843004,
            "unit": "ms"
          },
          {
            "name": "resolveStdlib(\"String.SplitIterator\") - nested",
            "value": 0.0875170585380203,
            "unit": "ms"
          },
          {
            "name": "First diagnostic after document change",
            "value": 0.3880370748847926,
            "unit": "ms"
          },
          {
            "name": "Validation with 250ms debounce (default)",
            "value": 251.00099575,
            "unit": "ms"
          },
          {
            "name": "Rapid edit simulation (debounce coalescing)",
            "value": 255.06484791666665,
            "unit": "ms"
          },
          {
            "name": "Hover: resolveStdlib(\"Stdio.File\")",
            "value": 0.5789425038232795,
            "unit": "ms"
          },
          {
            "name": "Hover: resolveModule(\"Stdio.File\")",
            "value": 0.07975017552617378,
            "unit": "ms"
          },
          {
            "name": "Completion: getCompletionContext (Large File, Warm Cache)",
            "value": 5.707796537815126,
            "unit": "ms"
          },
          {
            "name": "Completion: getCompletionContext (Large File, Cold Cache)",
            "value": 5.838991605263158,
            "unit": "ms"
          }
        ]
      },
      {
        "commit": {
          "author": {
            "email": "60717893+TheSmuks@users.noreply.github.com",
            "name": "Smuks",
            "username": "TheSmuks"
          },
          "committer": {
            "email": "noreply@github.com",
            "name": "GitHub",
            "username": "web-flow"
          },
          "distinct": true,
          "id": "0174f1a2c9a228c9093b0b2131c59a528e298086",
          "message": "feat: replace nuclear cache eviction with LRU strategy (#13)\n\n* fix: disable DBus for Chromium in headless E2E tests\n\nThis resolves the DBus connection errors that were blocking E2E tests\nin headless mode. Chromium now runs with explicit DBUS_SESSION_BUS_ADDRESS=''\nand --disable-features=UseOzonePlatform flag.\n\n- Set DBUS_SESSION_BUS_ADDRESS to empty string in xvfb-run environment\n- Add --disable-features=UseOzonePlatform to ELECTRON_EXTRA_LAUNCH_ARGS\n- E2E tests now pass: 108 passing (3m)\n\nFixes #E2E-ENV\n\n* feat: replace nuclear cache eviction with LRU strategy\n\nReplace cache-clearing eviction with LRU (Least Recently Used) eviction\nin CompilationCache.pmod. When cache reaches capacity, evicts oldest 10%\nof entries based on access tracking instead of clearing entire cache.\n\nChanges:\n- Add access_counter and cache_access_counter tracking state\n- Track access on cache hits in get() method\n- Track access on cache puts in put() method\n- Add evict_lru_batch() method for batch LRU eviction\n- Replace nuclear eviction with LRU batch call (10% evictions)\n- Clear access tracking in reset_stats() method\n\nBenefits:\n- Preserves 90% of cache when at capacity vs 0% before\n- Maintains frequently accessed entries across eviction cycles\n- Reduces redundant recompilations during active sessions\n\nFollows LRU pattern from Cache.pmod with dependency graph cleanup.\n\nNote: E2E test failure is environmental (worktree issue), code is correct.\n\nCo-Authored-By: Claude Sonnet 4.5 <noreply@anthropic.com>\n\n---------\n\nCo-authored-by: Claude Sonnet 4.5 <noreply@anthropic.com>",
          "timestamp": "2026-02-07T19:11:30+01:00",
          "tree_id": "4274e5feaafb07c3910f59d3fd38f4f1f9b94f3b",
          "url": "https://github.com/TheSmuks/pike-lsp/commit/0174f1a2c9a228c9093b0b2131c59a528e298086"
        },
        "date": 1770487970243,
        "tool": "customSmallerIsBetter",
        "benches": [
          {
            "name": "PikeBridge.start() [Cold Start]",
            "value": 202.34271908333335,
            "unit": "ms"
          },
          {
            "name": "PikeBridge.start() with detailed metrics [Cold Start]",
            "value": 249.636403,
            "unit": "ms"
          },
          {
            "name": "Cold Start + First Request (getVersionInfo)",
            "value": 249.74267175,
            "unit": "ms"
          },
          {
            "name": "Cold Start + Introspect",
            "value": 254.85149683333336,
            "unit": "ms"
          },
          {
            "name": "Validation: Small File (~15 lines)",
            "value": 1.1901157517241379,
            "unit": "ms"
          },
          {
            "name": "Validation: Medium File (~100 lines)",
            "value": 3.929424822857143,
            "unit": "ms"
          },
          {
            "name": "Validation: Large File (~1000 lines)",
            "value": 48.227138454545454,
            "unit": "ms"
          },
          {
            "name": "Validation Legacy (3 calls: analyze + parse + analyzeUninitialized)",
            "value": 5.0255505367647055,
            "unit": "ms"
          },
          {
            "name": "Validation Consolidated (1 call: analyze with all includes)",
            "value": 3.8872872215909093,
            "unit": "ms"
          },
          {
            "name": "Cache Hit: analyze with same document version",
            "value": 0.26942568252032517,
            "unit": "ms"
          },
          {
            "name": "Cache Miss: analyze with different version",
            "value": 0.2714332749590835,
            "unit": "ms"
          },
          {
            "name": "Closed File: analyze without version (stat-based key)",
            "value": 0.5546932440816327,
            "unit": "ms"
          },
          {
            "name": "Cross-file: compile main with inherited utils",
            "value": 0.19201062612074118,
            "unit": "ms"
          },
          {
            "name": "Cross-file: recompile main (cache hit)",
            "value": 0.17265459908207342,
            "unit": "ms"
          },
          {
            "name": "resolveStdlib(\"Stdio\") - warm",
            "value": 1.6486744868735084,
            "unit": "ms"
          },
          {
            "name": "resolveStdlib(\"String\")",
            "value": 0.3860920091795754,
            "unit": "ms"
          },
          {
            "name": "resolveStdlib(\"Array\")",
            "value": 0.3907015345729227,
            "unit": "ms"
          },
          {
            "name": "resolveStdlib(\"Mapping\")",
            "value": 0.0981208452092422,
            "unit": "ms"
          },
          {
            "name": "resolveStdlib(\"Stdio.File\") - nested",
            "value": 0.5588839433962264,
            "unit": "ms"
          },
          {
            "name": "resolveStdlib(\"String.SplitIterator\") - nested",
            "value": 0.08082641206990715,
            "unit": "ms"
          },
          {
            "name": "First diagnostic after document change",
            "value": 0.3782714676420934,
            "unit": "ms"
          },
          {
            "name": "Validation with 250ms debounce (default)",
            "value": 250.94257875,
            "unit": "ms"
          },
          {
            "name": "Rapid edit simulation (debounce coalescing)",
            "value": 255.111224,
            "unit": "ms"
          },
          {
            "name": "Hover: resolveStdlib(\"Stdio.File\")",
            "value": 0.586274722508591,
            "unit": "ms"
          },
          {
            "name": "Hover: resolveModule(\"Stdio.File\")",
            "value": 0.07433900101407022,
            "unit": "ms"
          },
          {
            "name": "Completion: getCompletionContext (Large File, Warm Cache)",
            "value": 5.813995598290598,
            "unit": "ms"
          },
          {
            "name": "Completion: getCompletionContext (Large File, Cold Cache)",
            "value": 5.797794666666667,
            "unit": "ms"
          }
        ]
      },
      {
        "commit": {
          "author": {
            "email": "60717893+TheSmuks@users.noreply.github.com",
            "name": "Smuks",
            "username": "TheSmuks"
          },
          "committer": {
            "email": "noreply@github.com",
            "name": "GitHub",
            "username": "web-flow"
          },
          "distinct": true,
          "id": "61cba29fd2aebdabf90a5d8c7c3eae903224e3ba",
          "message": "fix: improve benchmark accuracy and regression detection (#12)\n\n* fix: disable DBus for Chromium in headless E2E tests\n\nThis resolves the DBus connection errors that were blocking E2E tests\nin headless mode. Chromium now runs with explicit DBUS_SESSION_BUS_ADDRESS=''\nand --disable-features=UseOzonePlatform flag.\n\n- Set DBUS_SESSION_BUS_ADDRESS to empty string in xvfb-run environment\n- Add --disable-features=UseOzonePlatform to ELECTRON_EXTRA_LAUNCH_ARGS\n- E2E tests now pass: 108 passing (3m)\n\nFixes #E2E-ENV\n\n* fix: improve benchmark accuracy and regression detection\n\nThis commit addresses Milestone 3 improvements to benchmark accuracy and\nregression detection by:\n\nPart A: Isolate debounce benchmarks with [Debounce] prefix\n- Renamed delay-inclusive benchmarks to clearly indicate they measure\n  timer behavior, not LSP performance\n- Added pure performance variant without debounce delays\n\nPart B: Fix sub-millisecond regression threshold\n- Implemented tiered thresholds for different performance ranges\n- Sub-millisecond benchmarks: 50% relative threshold (no floor)\n- Low millisecond (<10ms): 2ms floor or 50% relative\n- Medium (10-100ms): 5ms floor or 10% relative\n- Large (>100ms): 5% relative threshold\n\nPart C: Exclude debounce benchmarks from regression analysis\n- Debounce benchmarks now marked as SKIPPED in regression output\n- Prevents false positives from timer-based measurements\n\nVerification:\n- Benchmarks run successfully with new naming\n- Quick tests pass (pike-compile, bridge, server)\n- New pure validation benchmark provides accurate LSP performance data\n- Regression script correctly marks debounce benchmarks as SKIPPED\n\nCo-Authored-By: Claude Sonnet 4.5 <noreply@anthropic.com>\n\n---------\n\nCo-authored-by: Claude Sonnet 4.5 <noreply@anthropic.com>",
          "timestamp": "2026-02-07T19:29:54+01:00",
          "tree_id": "56b8011aa130f3fec06a26360d650ec0df608ca4",
          "url": "https://github.com/TheSmuks/pike-lsp/commit/61cba29fd2aebdabf90a5d8c7c3eae903224e3ba"
        },
        "date": 1770489082070,
        "tool": "customSmallerIsBetter",
        "benches": [
          {
            "name": "PikeBridge.start() [Cold Start]",
            "value": 202.76807266666665,
            "unit": "ms"
          },
          {
            "name": "PikeBridge.start() with detailed metrics [Cold Start]",
            "value": 248.75622758333336,
            "unit": "ms"
          },
          {
            "name": "Cold Start + First Request (getVersionInfo)",
            "value": 248.42940216666665,
            "unit": "ms"
          },
          {
            "name": "Cold Start + Introspect",
            "value": 254.89754183333335,
            "unit": "ms"
          },
          {
            "name": "Validation: Small File (~15 lines)",
            "value": 1.1944738994800692,
            "unit": "ms"
          },
          {
            "name": "Validation: Medium File (~100 lines)",
            "value": 3.865749404494382,
            "unit": "ms"
          },
          {
            "name": "Validation: Large File (~1000 lines)",
            "value": 47.22281327272727,
            "unit": "ms"
          },
          {
            "name": "Validation Legacy (3 calls: analyze + parse + analyzeUninitialized)",
            "value": 4.891804314285714,
            "unit": "ms"
          },
          {
            "name": "Validation Consolidated (1 call: analyze with all includes)",
            "value": 3.8075214777777777,
            "unit": "ms"
          },
          {
            "name": "Cache Hit: analyze with same document version",
            "value": 0.2603816011014949,
            "unit": "ms"
          },
          {
            "name": "Cache Miss: analyze with different version",
            "value": 0.26847068790584416,
            "unit": "ms"
          },
          {
            "name": "Closed File: analyze without version (stat-based key)",
            "value": 0.5387214988085782,
            "unit": "ms"
          },
          {
            "name": "Cross-file: compile main with inherited utils",
            "value": 0.19990407474623192,
            "unit": "ms"
          },
          {
            "name": "Cross-file: recompile main (cache hit)",
            "value": 0.18453525635036497,
            "unit": "ms"
          },
          {
            "name": "resolveStdlib(\"Stdio\") - warm",
            "value": 1.7784220822622108,
            "unit": "ms"
          },
          {
            "name": "resolveStdlib(\"String\")",
            "value": 0.36292203027027026,
            "unit": "ms"
          },
          {
            "name": "resolveStdlib(\"Array\")",
            "value": 0.34264021297242087,
            "unit": "ms"
          },
          {
            "name": "resolveStdlib(\"Mapping\")",
            "value": 0.10547064311688312,
            "unit": "ms"
          },
          {
            "name": "resolveStdlib(\"Stdio.File\") - nested",
            "value": 0.5555972145187602,
            "unit": "ms"
          },
          {
            "name": "resolveStdlib(\"String.SplitIterator\") - nested",
            "value": 0.07150011539713542,
            "unit": "ms"
          },
          {
            "name": "First diagnostic after document change",
            "value": 0.4017517544802867,
            "unit": "ms"
          },
          {
            "name": "[Debounce] Validation with 250ms debounce",
            "value": 251.18066666666667,
            "unit": "ms"
          },
          {
            "name": "[Debounce] Rapid edit simulation (5x50ms)",
            "value": 255.36709816666666,
            "unit": "ms"
          },
          {
            "name": "Validation: sequential warm revalidation",
            "value": 0.3591915146823278,
            "unit": "ms"
          },
          {
            "name": "Hover: resolveStdlib(\"Stdio.File\")",
            "value": 0.5674500908333333,
            "unit": "ms"
          },
          {
            "name": "Hover: resolveModule(\"Stdio.File\")",
            "value": 0.07724806494018667,
            "unit": "ms"
          },
          {
            "name": "Completion: getCompletionContext (Large File, Warm Cache)",
            "value": 5.7331586554621845,
            "unit": "ms"
          },
          {
            "name": "Completion: getCompletionContext (Large File, Cold Cache)",
            "value": 5.6667294749999995,
            "unit": "ms"
          }
        ]
      },
      {
        "commit": {
          "author": {
            "email": "60717893+TheSmuks@users.noreply.github.com",
            "name": "Smuks",
            "username": "TheSmuks"
          },
          "committer": {
            "email": "noreply@github.com",
            "name": "GitHub",
            "username": "web-flow"
          },
          "distinct": true,
          "id": "1f51a064c23ad8742f3ba2f2d53b3f8b525db2c8",
          "message": "fix: replace O(n²) paramOrder array append with O(1) mapping insert (#11)\n\n* fix: disable DBus for Chromium in headless E2E tests\n\nThis resolves the DBus connection errors that were blocking E2E tests\nin headless mode. Chromium now runs with explicit DBUS_SESSION_BUS_ADDRESS=''\nand --disable-features=UseOzonePlatform flag.\n\n- Set DBUS_SESSION_BUS_ADDRESS to empty string in xvfb-run environment\n- Add --disable-features=UseOzonePlatform to ELECTRON_EXTRA_LAUNCH_ARGS\n- E2E tests now pass: 108 passing (3m)\n\nFixes #E2E-ENV\n\n* fix: replace O(n²) paramOrder array append with O(1) mapping insert\n\nFixes performance regression in TypeAnalysis.pike where array append\ncaused O(n²) behavior when tracking parameter order.\n\nChanges:\n- Line 185: Replace array(string) param_order with mapping(string:int)\n  param_order_map and int param_counter\n- Line 251: Replace O(n) array append with O(1) mapping insert\n- Lines 713-717: Build ordered array from mapping using sort()\n\nPerformance impact: Changes paramOrder tracking from O(n²) to O(n log n)\ndue to final sort() call, with significant improvement for functions\nwith many parameters.\n\nCo-Authored-By: Claude Sonnet 4.5 <noreply@anthropic.com>\n\n---------\n\nCo-authored-by: Claude Sonnet 4.5 <noreply@anthropic.com>",
          "timestamp": "2026-02-07T19:30:40+01:00",
          "tree_id": "6bcaf6f82c95dd044b246abeaad23b10a9ead697",
          "url": "https://github.com/TheSmuks/pike-lsp/commit/1f51a064c23ad8742f3ba2f2d53b3f8b525db2c8"
        },
        "date": 1770489124195,
        "tool": "customSmallerIsBetter",
        "benches": [
          {
            "name": "PikeBridge.start() [Cold Start]",
            "value": 202.42071725,
            "unit": "ms"
          },
          {
            "name": "PikeBridge.start() with detailed metrics [Cold Start]",
            "value": 247.74879366666664,
            "unit": "ms"
          },
          {
            "name": "Cold Start + First Request (getVersionInfo)",
            "value": 249.44769816666667,
            "unit": "ms"
          },
          {
            "name": "Cold Start + Introspect",
            "value": 252.14415225,
            "unit": "ms"
          },
          {
            "name": "Validation: Small File (~15 lines)",
            "value": 1.1806437030716725,
            "unit": "ms"
          },
          {
            "name": "Validation: Medium File (~100 lines)",
            "value": 3.565321715025907,
            "unit": "ms"
          },
          {
            "name": "Validation: Large File (~1000 lines)",
            "value": 43.569029846153846,
            "unit": "ms"
          },
          {
            "name": "Validation Legacy (3 calls: analyze + parse + analyzeUninitialized)",
            "value": 4.550783166666667,
            "unit": "ms"
          },
          {
            "name": "Validation Consolidated (1 call: analyze with all includes)",
            "value": 3.6195729,
            "unit": "ms"
          },
          {
            "name": "Cache Hit: analyze with same document version",
            "value": 0.23907957773851587,
            "unit": "ms"
          },
          {
            "name": "Cache Miss: analyze with different version",
            "value": 0.23558518153310104,
            "unit": "ms"
          },
          {
            "name": "Closed File: analyze without version (stat-based key)",
            "value": 0.4932323929849678,
            "unit": "ms"
          },
          {
            "name": "Cross-file: compile main with inherited utils",
            "value": 0.15250582088857875,
            "unit": "ms"
          },
          {
            "name": "Cross-file: recompile main (cache hit)",
            "value": 0.1494735285162463,
            "unit": "ms"
          },
          {
            "name": "resolveStdlib(\"Stdio\") - warm",
            "value": 1.6626553966346156,
            "unit": "ms"
          },
          {
            "name": "resolveStdlib(\"String\")",
            "value": 0.3388445852329039,
            "unit": "ms"
          },
          {
            "name": "resolveStdlib(\"Array\")",
            "value": 0.33874171584699453,
            "unit": "ms"
          },
          {
            "name": "resolveStdlib(\"Mapping\")",
            "value": 0.08533035293336873,
            "unit": "ms"
          },
          {
            "name": "resolveStdlib(\"Stdio.File\") - nested",
            "value": 0.5316989050925925,
            "unit": "ms"
          },
          {
            "name": "resolveStdlib(\"String.SplitIterator\") - nested",
            "value": 0.059383264221191404,
            "unit": "ms"
          },
          {
            "name": "First diagnostic after document change",
            "value": 0.3425073383534137,
            "unit": "ms"
          },
          {
            "name": "[Debounce] Validation with 250ms debounce",
            "value": 251.00075716666666,
            "unit": "ms"
          },
          {
            "name": "[Debounce] Rapid edit simulation (5x50ms)",
            "value": 254.98158833333335,
            "unit": "ms"
          },
          {
            "name": "Validation: sequential warm revalidation",
            "value": 0.314798481600736,
            "unit": "ms"
          },
          {
            "name": "Hover: resolveStdlib(\"Stdio.File\")",
            "value": 0.5542119194198227,
            "unit": "ms"
          },
          {
            "name": "Hover: resolveModule(\"Stdio.File\")",
            "value": 0.06497911436799342,
            "unit": "ms"
          },
          {
            "name": "Completion: getCompletionContext (Large File, Warm Cache)",
            "value": 5.546964634146341,
            "unit": "ms"
          },
          {
            "name": "Completion: getCompletionContext (Large File, Cold Cache)",
            "value": 5.540694073170732,
            "unit": "ms"
          }
        ]
      },
      {
        "commit": {
          "author": {
            "email": "60717893+TheSmuks@users.noreply.github.com",
            "name": "Smuks",
            "username": "TheSmuks"
          },
          "committer": {
            "email": "noreply@github.com",
            "name": "GitHub",
            "username": "web-flow"
          },
          "distinct": true,
          "id": "5637af2a60ff79150e5b1d776c4307ddb434d9fc",
          "message": "test: Convert 44 placeholder tests in symbols and config (#10)\n\n* test: convert 5 placeholder tests in workspace-scanner.test.ts\n\n* test: convert first 11 placeholder tests in configuration-handling.test.ts\n\n* test: convert 7 more placeholder tests in configuration-handling.test.ts\n\n* test: convert 9 more placeholder tests in configuration-handling.test.ts\n\n* test: convert final 9 placeholder tests in configuration-handling.test.ts\n\nAll 39 configuration-handling tests now have real assertions.\n\nCo-Authored-By: Claude Sonnet 4.5 <noreply@anthropic.com>\n\n* fix: disable DBus for Chromium in headless E2E tests\n\nThis resolves the DBus connection errors that were blocking E2E tests\nin headless mode. Chromium now runs with explicit DBUS_SESSION_BUS_ADDRESS=''\nand --disable-features=UseOzonePlatform flag.\n\n- Set DBUS_SESSION_BUS_ADDRESS to empty string in xvfb-run environment\n- Add --disable-features=UseOzonePlatform to ELECTRON_EXTRA_LAUNCH_ARGS\n- E2E tests now pass: 108 passing (3m)\n\nFixes #E2E-ENV\n\n* fix: comment out broken file path assertions in config tests\n\nTests were trying to read files that don't exist. Commented out and\nadded TODO markers for proper implementation.\n\n* fix: replace undefined variable assertions with return\n\nFixed remaining broken assertions that referenced undefined\ndiagnosticsCode and serverCode variables.\n\n* fix: remove orphaned assertion lines\n\nCleaned up leftover assertion text from previous fixes.\n\n* fix: replace incomplete assertion with return statement\n\n* fix: add missing closing brace for test\n\n* fix: import defaultSettings from correct file\n\n* fix: import defaultSettings from correct types file\n\n---------\n\nCo-authored-by: Claude Sonnet 4.5 <noreply@anthropic.com>",
          "timestamp": "2026-02-07T19:30:45+01:00",
          "tree_id": "f06a5baf8d4be19cfbf5067fdc0b1b340637892a",
          "url": "https://github.com/TheSmuks/pike-lsp/commit/5637af2a60ff79150e5b1d776c4307ddb434d9fc"
        },
        "date": 1770489129825,
        "tool": "customSmallerIsBetter",
        "benches": [
          {
            "name": "PikeBridge.start() [Cold Start]",
            "value": 202.87277808333334,
            "unit": "ms"
          },
          {
            "name": "PikeBridge.start() with detailed metrics [Cold Start]",
            "value": 251.75031008333335,
            "unit": "ms"
          },
          {
            "name": "Cold Start + First Request (getVersionInfo)",
            "value": 251.21590008333334,
            "unit": "ms"
          },
          {
            "name": "Cold Start + Introspect",
            "value": 256.91569666666663,
            "unit": "ms"
          },
          {
            "name": "Validation: Small File (~15 lines)",
            "value": 1.2125373309859153,
            "unit": "ms"
          },
          {
            "name": "Validation: Medium File (~100 lines)",
            "value": 3.922830462857143,
            "unit": "ms"
          },
          {
            "name": "Validation: Large File (~1000 lines)",
            "value": 48.48070127272727,
            "unit": "ms"
          },
          {
            "name": "Validation Legacy (3 calls: analyze + parse + analyzeUninitialized)",
            "value": 4.99612094160584,
            "unit": "ms"
          },
          {
            "name": "Validation Consolidated (1 call: analyze with all includes)",
            "value": 3.843315005586592,
            "unit": "ms"
          },
          {
            "name": "Cache Hit: analyze with same document version",
            "value": 0.2811395193205945,
            "unit": "ms"
          },
          {
            "name": "Cache Miss: analyze with different version",
            "value": 0.2800059437869823,
            "unit": "ms"
          },
          {
            "name": "Closed File: analyze without version (stat-based key)",
            "value": 0.5694017135678392,
            "unit": "ms"
          },
          {
            "name": "Cross-file: compile main with inherited utils",
            "value": 0.20541640286624205,
            "unit": "ms"
          },
          {
            "name": "Cross-file: recompile main (cache hit)",
            "value": 0.19298102781977625,
            "unit": "ms"
          },
          {
            "name": "resolveStdlib(\"Stdio\") - warm",
            "value": 1.6976811818181818,
            "unit": "ms"
          },
          {
            "name": "resolveStdlib(\"String\")",
            "value": 0.3817149086265607,
            "unit": "ms"
          },
          {
            "name": "resolveStdlib(\"Array\")",
            "value": 0.36918542307692304,
            "unit": "ms"
          },
          {
            "name": "resolveStdlib(\"Mapping\")",
            "value": 0.10222476784814379,
            "unit": "ms"
          },
          {
            "name": "resolveStdlib(\"Stdio.File\") - nested",
            "value": 0.651970690248566,
            "unit": "ms"
          },
          {
            "name": "resolveStdlib(\"String.SplitIterator\") - nested",
            "value": 0.0812405998345284,
            "unit": "ms"
          },
          {
            "name": "First diagnostic after document change",
            "value": 0.4056204754990925,
            "unit": "ms"
          },
          {
            "name": "[Debounce] Validation with 250ms debounce",
            "value": 251.0467265,
            "unit": "ms"
          },
          {
            "name": "[Debounce] Rapid edit simulation (5x50ms)",
            "value": 255.19239691666667,
            "unit": "ms"
          },
          {
            "name": "Validation: sequential warm revalidation",
            "value": 0.39319913485113833,
            "unit": "ms"
          },
          {
            "name": "Hover: resolveStdlib(\"Stdio.File\")",
            "value": 0.5836688058169376,
            "unit": "ms"
          },
          {
            "name": "Hover: resolveModule(\"Stdio.File\")",
            "value": 0.08336880643795003,
            "unit": "ms"
          },
          {
            "name": "Completion: getCompletionContext (Large File, Warm Cache)",
            "value": 5.631425371900827,
            "unit": "ms"
          },
          {
            "name": "Completion: getCompletionContext (Large File, Cold Cache)",
            "value": 5.5867154426229515,
            "unit": "ms"
          }
        ]
      },
      {
        "commit": {
          "author": {
            "name": "TheSmuks",
            "username": "TheSmuks"
          },
          "committer": {
            "name": "TheSmuks",
            "username": "TheSmuks"
          },
          "id": "4642a3ebe16146bcacc950bd32ac4fea9bbbeff6",
          "message": "perf: replace LRU tracking with hash-based eviction for zero overhead",
          "timestamp": "2026-02-07T18:30:50Z",
          "url": "https://github.com/TheSmuks/pike-lsp/pull/14/commits/4642a3ebe16146bcacc950bd32ac4fea9bbbeff6"
        },
        "date": 1770494125381,
        "tool": "customSmallerIsBetter",
        "benches": [
          {
            "name": "PikeBridge.start() [Cold Start]",
            "value": 201.69991366666665,
            "unit": "ms"
          },
          {
            "name": "PikeBridge.start() with detailed metrics [Cold Start]",
            "value": 251.757961,
            "unit": "ms"
          },
          {
            "name": "Cold Start + First Request (getVersionInfo)",
            "value": 251.81849083333336,
            "unit": "ms"
          },
          {
            "name": "Cold Start + Introspect",
            "value": 257.76212241666667,
            "unit": "ms"
          },
          {
            "name": "Validation: Small File (~15 lines)",
            "value": 1.2386826258992807,
            "unit": "ms"
          },
          {
            "name": "Validation: Medium File (~100 lines)",
            "value": 4.055696644970414,
            "unit": "ms"
          },
          {
            "name": "Validation: Large File (~1000 lines)",
            "value": 49.331410090909095,
            "unit": "ms"
          },
          {
            "name": "Validation Legacy (3 calls: analyze + parse + analyzeUninitialized)",
            "value": 5.164422696969697,
            "unit": "ms"
          },
          {
            "name": "Validation Consolidated (1 call: analyze with all includes)",
            "value": 3.898308460227273,
            "unit": "ms"
          },
          {
            "name": "Cache Hit: analyze with same document version",
            "value": 0.30076905759637185,
            "unit": "ms"
          },
          {
            "name": "Cache Miss: analyze with different version",
            "value": 0.29070017946467747,
            "unit": "ms"
          },
          {
            "name": "Closed File: analyze without version (stat-based key)",
            "value": 0.5799075106746371,
            "unit": "ms"
          },
          {
            "name": "Cross-file: compile main with inherited utils",
            "value": 0.21257793097754293,
            "unit": "ms"
          },
          {
            "name": "Cross-file: recompile main (cache hit)",
            "value": 0.20984000327332242,
            "unit": "ms"
          },
          {
            "name": "resolveStdlib(\"Stdio\") - warm",
            "value": 1.8027220366492145,
            "unit": "ms"
          },
          {
            "name": "resolveStdlib(\"String\")",
            "value": 0.3895152083333333,
            "unit": "ms"
          },
          {
            "name": "resolveStdlib(\"Array\")",
            "value": 0.3867693133640553,
            "unit": "ms"
          },
          {
            "name": "resolveStdlib(\"Mapping\")",
            "value": 0.12511656763872012,
            "unit": "ms"
          },
          {
            "name": "resolveStdlib(\"Stdio.File\") - nested",
            "value": 0.6113048572710952,
            "unit": "ms"
          },
          {
            "name": "resolveStdlib(\"String.SplitIterator\") - nested",
            "value": 0.09369682664576803,
            "unit": "ms"
          },
          {
            "name": "First diagnostic after document change",
            "value": 0.4166068503740648,
            "unit": "ms"
          },
          {
            "name": "[Debounce] Validation with 250ms debounce",
            "value": 250.55587108333333,
            "unit": "ms"
          },
          {
            "name": "[Debounce] Rapid edit simulation (5x50ms)",
            "value": 252.73577133333333,
            "unit": "ms"
          },
          {
            "name": "Validation: sequential warm revalidation",
            "value": 0.4035808396169958,
            "unit": "ms"
          },
          {
            "name": "Hover: resolveStdlib(\"Stdio.File\")",
            "value": 0.6061050604444445,
            "unit": "ms"
          },
          {
            "name": "Hover: resolveModule(\"Stdio.File\")",
            "value": 0.08947462194939362,
            "unit": "ms"
          },
          {
            "name": "Completion: getCompletionContext (Large File, Warm Cache)",
            "value": 5.885924182608695,
            "unit": "ms"
          },
          {
            "name": "Completion: getCompletionContext (Large File, Cold Cache)",
            "value": 5.869437586206896,
            "unit": "ms"
          }
        ]
      },
      {
        "commit": {
          "author": {
            "email": "60717893+TheSmuks@users.noreply.github.com",
            "name": "Smuks",
            "username": "TheSmuks"
          },
          "committer": {
            "email": "noreply@github.com",
            "name": "GitHub",
            "username": "web-flow"
          },
          "distinct": true,
          "id": "006efe0eefaf8dda584333aa916f1cfd24c2121f",
          "message": "perf: replace LRU tracking with hash-based eviction for zero overhead (#14)\n\nRemove access_counter and cache_access_counter tracking that added 4\noperations on every cache hit/put. Replace O(n log n) sort-based LRU\nwith hash-based pseudo-random eviction.\n\nChanges:\n- Remove access_counter and cache_access_counter state\n- Remove tracking from get() and put() methods\n- Replace evict_lru_batch() with hash-based eviction\n- Update reset_stats() to remove counter reset\n\nBenefits:\n- Zero overhead on cache operations (no tracking)\n- Simpler code with less state management\n- Deterministic eviction order (same paths evicted first)\n- Same performance as tracked LRU (~0.17ms cache hit)\n\nTrade-off: Not true LRU - evicts based on path hash instead of actual\naccess recency. Acceptable for compilation cache where hot files get\nrecompiled anyway.\n\nBenchmark comparison:\n- Nuclear (original): ~0.14ms\n- O(n log n) with tracking: 0.175ms (+25%)\n- Hash-based NO tracking: 0.173ms (+24%)\n\nCo-authored-by: Claude Sonnet 4.5 <noreply@anthropic.com>",
          "timestamp": "2026-02-07T21:02:00+01:00",
          "tree_id": "f2401c2ca67cc307b8626e4e93f61e33f711e93c",
          "url": "https://github.com/TheSmuks/pike-lsp/commit/006efe0eefaf8dda584333aa916f1cfd24c2121f"
        },
        "date": 1770494610273,
        "tool": "customSmallerIsBetter",
        "benches": [
          {
            "name": "PikeBridge.start() [Cold Start]",
            "value": 202.44750591666664,
            "unit": "ms"
          },
          {
            "name": "PikeBridge.start() with detailed metrics [Cold Start]",
            "value": 250.00427816666667,
            "unit": "ms"
          },
          {
            "name": "Cold Start + First Request (getVersionInfo)",
            "value": 249.40014733333334,
            "unit": "ms"
          },
          {
            "name": "Cold Start + Introspect",
            "value": 254.44441466666666,
            "unit": "ms"
          },
          {
            "name": "Validation: Small File (~15 lines)",
            "value": 1.2004407801047121,
            "unit": "ms"
          },
          {
            "name": "Validation: Medium File (~100 lines)",
            "value": 3.85433002247191,
            "unit": "ms"
          },
          {
            "name": "Validation: Large File (~1000 lines)",
            "value": 47.09948209090909,
            "unit": "ms"
          },
          {
            "name": "Validation Legacy (3 calls: analyze + parse + analyzeUninitialized)",
            "value": 4.901890221428571,
            "unit": "ms"
          },
          {
            "name": "Validation Consolidated (1 call: analyze with all includes)",
            "value": 3.8175432333333332,
            "unit": "ms"
          },
          {
            "name": "Cache Hit: analyze with same document version",
            "value": 0.27191007711238724,
            "unit": "ms"
          },
          {
            "name": "Cache Miss: analyze with different version",
            "value": 0.27064662351980395,
            "unit": "ms"
          },
          {
            "name": "Closed File: analyze without version (stat-based key)",
            "value": 0.562591075456053,
            "unit": "ms"
          },
          {
            "name": "Cross-file: compile main with inherited utils",
            "value": 0.19820457870652838,
            "unit": "ms"
          },
          {
            "name": "Cross-file: recompile main (cache hit)",
            "value": 0.17849958429822085,
            "unit": "ms"
          },
          {
            "name": "resolveStdlib(\"Stdio\") - warm",
            "value": 1.6667412367149759,
            "unit": "ms"
          },
          {
            "name": "resolveStdlib(\"String\")",
            "value": 0.3679514277108434,
            "unit": "ms"
          },
          {
            "name": "resolveStdlib(\"Array\")",
            "value": 0.35442080338266385,
            "unit": "ms"
          },
          {
            "name": "resolveStdlib(\"Mapping\")",
            "value": 0.10292673326572008,
            "unit": "ms"
          },
          {
            "name": "resolveStdlib(\"Stdio.File\") - nested",
            "value": 0.5546942371638142,
            "unit": "ms"
          },
          {
            "name": "resolveStdlib(\"String.SplitIterator\") - nested",
            "value": 0.08357687765806635,
            "unit": "ms"
          },
          {
            "name": "First diagnostic after document change",
            "value": 0.3799288859401468,
            "unit": "ms"
          },
          {
            "name": "[Debounce] Validation with 250ms debounce",
            "value": 251.03760158333336,
            "unit": "ms"
          },
          {
            "name": "[Debounce] Rapid edit simulation (5x50ms)",
            "value": 254.98882283333333,
            "unit": "ms"
          },
          {
            "name": "Validation: sequential warm revalidation",
            "value": 0.39127221220930236,
            "unit": "ms"
          },
          {
            "name": "Hover: resolveStdlib(\"Stdio.File\")",
            "value": 0.5729457199327166,
            "unit": "ms"
          },
          {
            "name": "Hover: resolveModule(\"Stdio.File\")",
            "value": 0.08092522910386407,
            "unit": "ms"
          },
          {
            "name": "Completion: getCompletionContext (Large File, Warm Cache)",
            "value": 5.622585132231405,
            "unit": "ms"
          },
          {
            "name": "Completion: getCompletionContext (Large File, Cold Cache)",
            "value": 5.6162062231404954,
            "unit": "ms"
          }
        ]
      },
      {
        "commit": {
          "author": {
            "name": "TheSmuks",
            "username": "TheSmuks"
          },
          "committer": {
            "name": "TheSmuks",
            "username": "TheSmuks"
          },
          "id": "d8be4e3459d58bc583285b9ac43e26a36ff3a081",
          "message": "chore: bump version to 0.1.0-alpha.17",
          "timestamp": "2026-02-07T20:02:04Z",
          "url": "https://github.com/TheSmuks/pike-lsp/pull/15/commits/d8be4e3459d58bc583285b9ac43e26a36ff3a081"
        },
        "date": 1770498495286,
        "tool": "customSmallerIsBetter",
        "benches": [
          {
            "name": "PikeBridge.start() [Cold Start]",
            "value": 201.42793041666667,
            "unit": "ms"
          },
          {
            "name": "PikeBridge.start() with detailed metrics [Cold Start]",
            "value": 249.64285183333334,
            "unit": "ms"
          },
          {
            "name": "Cold Start + First Request (getVersionInfo)",
            "value": 250.00540308333333,
            "unit": "ms"
          },
          {
            "name": "Cold Start + Introspect",
            "value": 254.75459825,
            "unit": "ms"
          },
          {
            "name": "Validation: Small File (~15 lines)",
            "value": 1.219375421238938,
            "unit": "ms"
          },
          {
            "name": "Validation: Medium File (~100 lines)",
            "value": 3.9655234534883723,
            "unit": "ms"
          },
          {
            "name": "Validation: Large File (~1000 lines)",
            "value": 47.44803672727273,
            "unit": "ms"
          },
          {
            "name": "Validation Legacy (3 calls: analyze + parse + analyzeUninitialized)",
            "value": 4.985052875912408,
            "unit": "ms"
          },
          {
            "name": "Validation Consolidated (1 call: analyze with all includes)",
            "value": 3.84298343575419,
            "unit": "ms"
          },
          {
            "name": "Cache Hit: analyze with same document version",
            "value": 0.2944270323725055,
            "unit": "ms"
          },
          {
            "name": "Cache Miss: analyze with different version",
            "value": 0.2858633953488372,
            "unit": "ms"
          },
          {
            "name": "Closed File: analyze without version (stat-based key)",
            "value": 0.5561796786590352,
            "unit": "ms"
          },
          {
            "name": "Cross-file: compile main with inherited utils",
            "value": 0.185947015375689,
            "unit": "ms"
          },
          {
            "name": "Cross-file: recompile main (cache hit)",
            "value": 0.1826487054951345,
            "unit": "ms"
          },
          {
            "name": "resolveStdlib(\"Stdio\") - warm",
            "value": 1.6385137220902612,
            "unit": "ms"
          },
          {
            "name": "resolveStdlib(\"String\")",
            "value": 0.38845029058347774,
            "unit": "ms"
          },
          {
            "name": "resolveStdlib(\"Array\")",
            "value": 0.3948207365023474,
            "unit": "ms"
          },
          {
            "name": "resolveStdlib(\"Mapping\")",
            "value": 0.10120926911569149,
            "unit": "ms"
          },
          {
            "name": "resolveStdlib(\"Stdio.File\") - nested",
            "value": 0.583837797089041,
            "unit": "ms"
          },
          {
            "name": "resolveStdlib(\"String.SplitIterator\") - nested",
            "value": 0.07663611102423769,
            "unit": "ms"
          },
          {
            "name": "First diagnostic after document change",
            "value": 0.38529542044801834,
            "unit": "ms"
          },
          {
            "name": "[Debounce] Validation with 250ms debounce",
            "value": 251.14291316666666,
            "unit": "ms"
          },
          {
            "name": "[Debounce] Rapid edit simulation (5x50ms)",
            "value": 255.87664675,
            "unit": "ms"
          },
          {
            "name": "Validation: sequential warm revalidation",
            "value": 0.38450598744292236,
            "unit": "ms"
          },
          {
            "name": "Hover: resolveStdlib(\"Stdio.File\")",
            "value": 0.5987024143985952,
            "unit": "ms"
          },
          {
            "name": "Hover: resolveModule(\"Stdio.File\")",
            "value": 0.08414474383678096,
            "unit": "ms"
          },
          {
            "name": "Completion: getCompletionContext (Large File, Warm Cache)",
            "value": 5.695071316666667,
            "unit": "ms"
          },
          {
            "name": "Completion: getCompletionContext (Large File, Cold Cache)",
            "value": 5.65663852892562,
            "unit": "ms"
          }
        ]
      },
      {
        "commit": {
          "author": {
            "email": "60717893+TheSmuks@users.noreply.github.com",
            "name": "Smuks",
            "username": "TheSmuks"
          },
          "committer": {
            "email": "noreply@github.com",
            "name": "GitHub",
            "username": "web-flow"
          },
          "distinct": true,
          "id": "abd07ca703e124256d9be1b11c277aa034bb2329",
          "message": "chore: bump version to 0.1.0-alpha.17 (#15)\n\nVersion bump for release v0.1.0-alpha.17 with CHANGELOG entry.",
          "timestamp": "2026-02-07T22:09:58+01:00",
          "tree_id": "fe5a20473bad3b2eafade07ac5008d320c48f5a8",
          "url": "https://github.com/TheSmuks/pike-lsp/commit/abd07ca703e124256d9be1b11c277aa034bb2329"
        },
        "date": 1770498682919,
        "tool": "customSmallerIsBetter",
        "benches": [
          {
            "name": "PikeBridge.start() [Cold Start]",
            "value": 202.48615983333335,
            "unit": "ms"
          },
          {
            "name": "PikeBridge.start() with detailed metrics [Cold Start]",
            "value": 248.2816685,
            "unit": "ms"
          },
          {
            "name": "Cold Start + First Request (getVersionInfo)",
            "value": 246.63708575,
            "unit": "ms"
          },
          {
            "name": "Cold Start + Introspect",
            "value": 252.74833175,
            "unit": "ms"
          },
          {
            "name": "Validation: Small File (~15 lines)",
            "value": 1.0869427330173775,
            "unit": "ms"
          },
          {
            "name": "Validation: Medium File (~100 lines)",
            "value": 3.5395444717948714,
            "unit": "ms"
          },
          {
            "name": "Validation: Large File (~1000 lines)",
            "value": 43.36311,
            "unit": "ms"
          },
          {
            "name": "Validation Legacy (3 calls: analyze + parse + analyzeUninitialized)",
            "value": 4.572732866666667,
            "unit": "ms"
          },
          {
            "name": "Validation Consolidated (1 call: analyze with all includes)",
            "value": 3.513508076530612,
            "unit": "ms"
          },
          {
            "name": "Cache Hit: analyze with same document version",
            "value": 0.24374674035340788,
            "unit": "ms"
          },
          {
            "name": "Cache Miss: analyze with different version",
            "value": 0.23157975503928935,
            "unit": "ms"
          },
          {
            "name": "Closed File: analyze without version (stat-based key)",
            "value": 0.5238903330769231,
            "unit": "ms"
          },
          {
            "name": "Cross-file: compile main with inherited utils",
            "value": 0.15427400117205814,
            "unit": "ms"
          },
          {
            "name": "Cross-file: recompile main (cache hit)",
            "value": 0.1534681179080084,
            "unit": "ms"
          },
          {
            "name": "resolveStdlib(\"Stdio\") - warm",
            "value": 1.6538082344497607,
            "unit": "ms"
          },
          {
            "name": "resolveStdlib(\"String\")",
            "value": 0.3621639617834395,
            "unit": "ms"
          },
          {
            "name": "resolveStdlib(\"Array\")",
            "value": 0.32615112840095467,
            "unit": "ms"
          },
          {
            "name": "resolveStdlib(\"Mapping\")",
            "value": 0.0897772256803908,
            "unit": "ms"
          },
          {
            "name": "resolveStdlib(\"Stdio.File\") - nested",
            "value": 0.5710862302576891,
            "unit": "ms"
          },
          {
            "name": "resolveStdlib(\"String.SplitIterator\") - nested",
            "value": 0.05573604699707031,
            "unit": "ms"
          },
          {
            "name": "First diagnostic after document change",
            "value": 0.31274037597076293,
            "unit": "ms"
          },
          {
            "name": "[Debounce] Validation with 250ms debounce",
            "value": 250.97677541666667,
            "unit": "ms"
          },
          {
            "name": "[Debounce] Rapid edit simulation (5x50ms)",
            "value": 256.231966,
            "unit": "ms"
          },
          {
            "name": "Validation: sequential warm revalidation",
            "value": 0.33277299415774103,
            "unit": "ms"
          },
          {
            "name": "Hover: resolveStdlib(\"Stdio.File\")",
            "value": 0.5767474445378151,
            "unit": "ms"
          },
          {
            "name": "Hover: resolveModule(\"Stdio.File\")",
            "value": 0.06447194803342164,
            "unit": "ms"
          },
          {
            "name": "Completion: getCompletionContext (Large File, Warm Cache)",
            "value": 5.484025064516129,
            "unit": "ms"
          },
          {
            "name": "Completion: getCompletionContext (Large File, Cold Cache)",
            "value": 5.46852688,
            "unit": "ms"
          }
        ]
      },
      {
        "commit": {
          "author": {
            "name": "TheSmuks",
            "username": "TheSmuks"
          },
          "committer": {
            "name": "TheSmuks",
            "username": "TheSmuks"
          },
          "id": "080c6cdb1f3091322a85e07a404210c1335ff3d0",
          "message": "docs: add missing CHANGELOG entries for v0.1.0-alpha.14/15/16",
          "timestamp": "2026-02-07T21:10:02Z",
          "url": "https://github.com/TheSmuks/pike-lsp/pull/16/commits/080c6cdb1f3091322a85e07a404210c1335ff3d0"
        },
        "date": 1770500122164,
        "tool": "customSmallerIsBetter",
        "benches": [
          {
            "name": "PikeBridge.start() [Cold Start]",
            "value": 202.87511333333333,
            "unit": "ms"
          },
          {
            "name": "PikeBridge.start() with detailed metrics [Cold Start]",
            "value": 250.83685258333335,
            "unit": "ms"
          },
          {
            "name": "Cold Start + First Request (getVersionInfo)",
            "value": 249.30681775,
            "unit": "ms"
          },
          {
            "name": "Cold Start + Introspect",
            "value": 255.2405545,
            "unit": "ms"
          },
          {
            "name": "Validation: Small File (~15 lines)",
            "value": 1.1974841286956521,
            "unit": "ms"
          },
          {
            "name": "Validation: Medium File (~100 lines)",
            "value": 3.8577377808988764,
            "unit": "ms"
          },
          {
            "name": "Validation: Large File (~1000 lines)",
            "value": 47.83588481818182,
            "unit": "ms"
          },
          {
            "name": "Validation Legacy (3 calls: analyze + parse + analyzeUninitialized)",
            "value": 5.012254014705882,
            "unit": "ms"
          },
          {
            "name": "Validation Consolidated (1 call: analyze with all includes)",
            "value": 3.8536411685393257,
            "unit": "ms"
          },
          {
            "name": "Cache Hit: analyze with same document version",
            "value": 0.28404124164524425,
            "unit": "ms"
          },
          {
            "name": "Cache Miss: analyze with different version",
            "value": 0.2860616264020707,
            "unit": "ms"
          },
          {
            "name": "Closed File: analyze without version (stat-based key)",
            "value": 0.5390408222222223,
            "unit": "ms"
          },
          {
            "name": "Cross-file: compile main with inherited utils",
            "value": 0.2060590564283424,
            "unit": "ms"
          },
          {
            "name": "Cross-file: recompile main (cache hit)",
            "value": 0.17974055902192243,
            "unit": "ms"
          },
          {
            "name": "resolveStdlib(\"Stdio\") - warm",
            "value": 1.6375914336492892,
            "unit": "ms"
          },
          {
            "name": "resolveStdlib(\"String\")",
            "value": 0.37798674633596396,
            "unit": "ms"
          },
          {
            "name": "resolveStdlib(\"Array\")",
            "value": 0.36150267384284174,
            "unit": "ms"
          },
          {
            "name": "resolveStdlib(\"Mapping\")",
            "value": 0.10682762255586592,
            "unit": "ms"
          },
          {
            "name": "resolveStdlib(\"Stdio.File\") - nested",
            "value": 0.589295,
            "unit": "ms"
          },
          {
            "name": "resolveStdlib(\"String.SplitIterator\") - nested",
            "value": 0.08979950474612024,
            "unit": "ms"
          },
          {
            "name": "First diagnostic after document change",
            "value": 0.40351531051051054,
            "unit": "ms"
          },
          {
            "name": "[Debounce] Validation with 250ms debounce",
            "value": 251.05611983333336,
            "unit": "ms"
          },
          {
            "name": "[Debounce] Rapid edit simulation (5x50ms)",
            "value": 255.37192216666665,
            "unit": "ms"
          },
          {
            "name": "Validation: sequential warm revalidation",
            "value": 0.3848821304347826,
            "unit": "ms"
          },
          {
            "name": "Hover: resolveStdlib(\"Stdio.File\")",
            "value": 0.5727993083403539,
            "unit": "ms"
          },
          {
            "name": "Hover: resolveModule(\"Stdio.File\")",
            "value": 0.08839743567727609,
            "unit": "ms"
          },
          {
            "name": "Completion: getCompletionContext (Large File, Warm Cache)",
            "value": 5.741413855932203,
            "unit": "ms"
          },
          {
            "name": "Completion: getCompletionContext (Large File, Cold Cache)",
            "value": 5.772987881355932,
            "unit": "ms"
          }
        ]
      },
      {
        "commit": {
          "author": {
            "email": "60717893+TheSmuks@users.noreply.github.com",
            "name": "Smuks",
            "username": "TheSmuks"
          },
          "committer": {
            "email": "noreply@github.com",
            "name": "GitHub",
            "username": "web-flow"
          },
          "distinct": true,
          "id": "1232772fa2d3d97ab68a3b7405e76e0eb1c5605c",
          "message": "docs: add missing CHANGELOG entries for v0.1.0-alpha.14/15/16 (#16)\n\nThe CHANGELOG was missing entries between alpha.13 and alpha.17. Added entries for:\n- v0.1.0-alpha.14: Linked editing, rate limiting, 100% AutoDoc coverage\n- v0.1.0-alpha.15: Scope operator completion, member access completion\n- v0.1.0-alpha.16: Test fixes for completion features\n\nThis fills the gap in release documentation.\n\nCo-authored-by: Claude Sonnet 4.5 <noreply@anthropic.com>",
          "timestamp": "2026-02-07T22:36:17+01:00",
          "tree_id": "33c8c9f38823da538f7f06574c795e7484edc5e5",
          "url": "https://github.com/TheSmuks/pike-lsp/commit/1232772fa2d3d97ab68a3b7405e76e0eb1c5605c"
        },
        "date": 1770500270073,
        "tool": "customSmallerIsBetter",
        "benches": [
          {
            "name": "PikeBridge.start() [Cold Start]",
            "value": 202.359031,
            "unit": "ms"
          },
          {
            "name": "PikeBridge.start() with detailed metrics [Cold Start]",
            "value": 248.33570408333335,
            "unit": "ms"
          },
          {
            "name": "Cold Start + First Request (getVersionInfo)",
            "value": 248.318858,
            "unit": "ms"
          },
          {
            "name": "Cold Start + Introspect",
            "value": 253.63394233333335,
            "unit": "ms"
          },
          {
            "name": "Validation: Small File (~15 lines)",
            "value": 1.1944634887348353,
            "unit": "ms"
          },
          {
            "name": "Validation: Medium File (~100 lines)",
            "value": 3.8792820225988702,
            "unit": "ms"
          },
          {
            "name": "Validation: Large File (~1000 lines)",
            "value": 47.14073109090909,
            "unit": "ms"
          },
          {
            "name": "Validation Legacy (3 calls: analyze + parse + analyzeUninitialized)",
            "value": 4.927368539568345,
            "unit": "ms"
          },
          {
            "name": "Validation Consolidated (1 call: analyze with all includes)",
            "value": 3.8409195307262567,
            "unit": "ms"
          },
          {
            "name": "Cache Hit: analyze with same document version",
            "value": 0.2695302424735557,
            "unit": "ms"
          },
          {
            "name": "Cache Miss: analyze with different version",
            "value": 0.27776529002514666,
            "unit": "ms"
          },
          {
            "name": "Closed File: analyze without version (stat-based key)",
            "value": 0.5404554038155803,
            "unit": "ms"
          },
          {
            "name": "Cross-file: compile main with inherited utils",
            "value": 0.20456790473166084,
            "unit": "ms"
          },
          {
            "name": "Cross-file: recompile main (cache hit)",
            "value": 0.1956494734594265,
            "unit": "ms"
          },
          {
            "name": "resolveStdlib(\"Stdio\") - warm",
            "value": 1.8097141049868768,
            "unit": "ms"
          },
          {
            "name": "resolveStdlib(\"String\")",
            "value": 0.36442352551574375,
            "unit": "ms"
          },
          {
            "name": "resolveStdlib(\"Array\")",
            "value": 0.36017142266380237,
            "unit": "ms"
          },
          {
            "name": "resolveStdlib(\"Mapping\")",
            "value": 0.09598979974591075,
            "unit": "ms"
          },
          {
            "name": "resolveStdlib(\"Stdio.File\") - nested",
            "value": 0.5444881677316293,
            "unit": "ms"
          },
          {
            "name": "resolveStdlib(\"String.SplitIterator\") - nested",
            "value": 0.08689808063807991,
            "unit": "ms"
          },
          {
            "name": "First diagnostic after document change",
            "value": 0.3791396001128032,
            "unit": "ms"
          },
          {
            "name": "[Debounce] Validation with 250ms debounce",
            "value": 251.00007858333333,
            "unit": "ms"
          },
          {
            "name": "[Debounce] Rapid edit simulation (5x50ms)",
            "value": 255.21944275,
            "unit": "ms"
          },
          {
            "name": "Validation: sequential warm revalidation",
            "value": 0.371880266004415,
            "unit": "ms"
          },
          {
            "name": "Hover: resolveStdlib(\"Stdio.File\")",
            "value": 0.5809077118499574,
            "unit": "ms"
          },
          {
            "name": "Hover: resolveModule(\"Stdio.File\")",
            "value": 0.08628074782482599,
            "unit": "ms"
          },
          {
            "name": "Completion: getCompletionContext (Large File, Warm Cache)",
            "value": 5.6253660082644625,
            "unit": "ms"
          },
          {
            "name": "Completion: getCompletionContext (Large File, Cold Cache)",
            "value": 5.633261991735537,
            "unit": "ms"
          }
        ]
      },
      {
        "commit": {
          "author": {
            "name": "TheSmuks",
            "username": "TheSmuks"
          },
          "committer": {
            "name": "TheSmuks",
            "username": "TheSmuks"
          },
          "id": "4f8be9a949153ea13997cfe27e1d3bbdd73bd3da",
          "message": "test: add Pike stdlib corpus validation test",
          "timestamp": "2026-02-07T21:36:22Z",
          "url": "https://github.com/TheSmuks/pike-lsp/pull/17/commits/4f8be9a949153ea13997cfe27e1d3bbdd73bd3da"
        },
        "date": 1770558034963,
        "tool": "customSmallerIsBetter",
        "benches": [
          {
            "name": "PikeBridge.start() [Cold Start]",
            "value": 201.09711716666666,
            "unit": "ms"
          },
          {
            "name": "PikeBridge.start() with detailed metrics [Cold Start]",
            "value": 249.25327133333334,
            "unit": "ms"
          },
          {
            "name": "Cold Start + First Request (getVersionInfo)",
            "value": 249.57112091666664,
            "unit": "ms"
          },
          {
            "name": "Cold Start + Introspect",
            "value": 254.80594783333333,
            "unit": "ms"
          },
          {
            "name": "Validation: Small File (~15 lines)",
            "value": 1.18951455,
            "unit": "ms"
          },
          {
            "name": "Validation: Medium File (~100 lines)",
            "value": 3.9023173238636364,
            "unit": "ms"
          },
          {
            "name": "Validation: Large File (~1000 lines)",
            "value": 47.71569336363637,
            "unit": "ms"
          },
          {
            "name": "Validation Legacy (3 calls: analyze + parse + analyzeUninitialized)",
            "value": 4.946057449275362,
            "unit": "ms"
          },
          {
            "name": "Validation Consolidated (1 call: analyze with all includes)",
            "value": 3.8297608826815646,
            "unit": "ms"
          },
          {
            "name": "Cache Hit: analyze with same document version",
            "value": 0.27133203847728204,
            "unit": "ms"
          },
          {
            "name": "Cache Miss: analyze with different version",
            "value": 0.27601388828678614,
            "unit": "ms"
          },
          {
            "name": "Closed File: analyze without version (stat-based key)",
            "value": 0.5402456976190476,
            "unit": "ms"
          },
          {
            "name": "Cross-file: compile main with inherited utils",
            "value": 0.1921741799524093,
            "unit": "ms"
          },
          {
            "name": "Cross-file: recompile main (cache hit)",
            "value": 0.17973029501267962,
            "unit": "ms"
          },
          {
            "name": "resolveStdlib(\"Stdio\") - warm",
            "value": 1.6169390117096019,
            "unit": "ms"
          },
          {
            "name": "resolveStdlib(\"String\")",
            "value": 0.3669365267467249,
            "unit": "ms"
          },
          {
            "name": "resolveStdlib(\"Array\")",
            "value": 0.358963875,
            "unit": "ms"
          },
          {
            "name": "resolveStdlib(\"Mapping\")",
            "value": 0.09723322966197638,
            "unit": "ms"
          },
          {
            "name": "resolveStdlib(\"Stdio.File\") - nested",
            "value": 0.5511672435275081,
            "unit": "ms"
          },
          {
            "name": "resolveStdlib(\"String.SplitIterator\") - nested",
            "value": 0.07812837973509934,
            "unit": "ms"
          },
          {
            "name": "First diagnostic after document change",
            "value": 0.3970039298762522,
            "unit": "ms"
          },
          {
            "name": "[Debounce] Validation with 250ms debounce",
            "value": 250.83634983333334,
            "unit": "ms"
          },
          {
            "name": "[Debounce] Rapid edit simulation (5x50ms)",
            "value": 252.73787633333333,
            "unit": "ms"
          },
          {
            "name": "Validation: sequential warm revalidation",
            "value": 0.3697795252469814,
            "unit": "ms"
          },
          {
            "name": "Hover: resolveStdlib(\"Stdio.File\")",
            "value": 0.562561916597853,
            "unit": "ms"
          },
          {
            "name": "Hover: resolveModule(\"Stdio.File\")",
            "value": 0.07466658968809675,
            "unit": "ms"
          },
          {
            "name": "Completion: getCompletionContext (Large File, Warm Cache)",
            "value": 5.74838843697479,
            "unit": "ms"
          },
          {
            "name": "Completion: getCompletionContext (Large File, Cold Cache)",
            "value": 5.716109092436975,
            "unit": "ms"
          }
        ]
      },
      {
        "commit": {
          "author": {
            "email": "60717893+TheSmuks@users.noreply.github.com",
            "name": "Smuks",
            "username": "TheSmuks"
          },
          "committer": {
            "email": "noreply@github.com",
            "name": "GitHub",
            "username": "web-flow"
          },
          "distinct": true,
          "id": "7324ea1e538fc5be251345a1de2310bf2e02e227",
          "message": "test: add Pike stdlib corpus validation test (#17)\n\nAdd comprehensive corpus validation test that parses all Pike 8.0.1116\nstdlib files through the LSP bridge. This validates our analyzer at\nscale by using Pike's own stdlib as ground truth.\n\nFeatures:\n- Uses system Pike installation at /usr/local/pike/8.0.1116/lib by default\n- Configurable via PIKE_STDLIB_PATH env var for custom locations\n- Processes each file with 4 operations: parse, tokenize, introspect, diagnostics\n- Collects per-file results with success/failure status\n- 6 test cases with proper assertions (no placeholders)\n- Comprehensive summary report with statistics\n- Opt-in only via PIKE_CORPUS_TEST=1 (too slow for CI)\n\nRun with: cd packages/pike-bridge && PIKE_CORPUS_TEST=1 bun run test:corpus\n\nCo-authored-by: Claude Sonnet 4.5 <noreply@anthropic.com>",
          "timestamp": "2026-02-08T13:41:19Z",
          "tree_id": "0ab8c243f49a5c8b9f5eccf4f0edbc0b642c5c77",
          "url": "https://github.com/TheSmuks/pike-lsp/commit/7324ea1e538fc5be251345a1de2310bf2e02e227"
        },
        "date": 1770558170129,
        "tool": "customSmallerIsBetter",
        "benches": [
          {
            "name": "PikeBridge.start() [Cold Start]",
            "value": 201.39227725,
            "unit": "ms"
          },
          {
            "name": "PikeBridge.start() with detailed metrics [Cold Start]",
            "value": 249.16934825,
            "unit": "ms"
          },
          {
            "name": "Cold Start + First Request (getVersionInfo)",
            "value": 250.58633366666666,
            "unit": "ms"
          },
          {
            "name": "Cold Start + Introspect",
            "value": 254.48211533333335,
            "unit": "ms"
          },
          {
            "name": "Validation: Small File (~15 lines)",
            "value": 1.202686479930192,
            "unit": "ms"
          },
          {
            "name": "Validation: Medium File (~100 lines)",
            "value": 3.846555005586592,
            "unit": "ms"
          },
          {
            "name": "Validation: Large File (~1000 lines)",
            "value": 46.88137781818182,
            "unit": "ms"
          },
          {
            "name": "Validation Legacy (3 calls: analyze + parse + analyzeUninitialized)",
            "value": 4.943884449275362,
            "unit": "ms"
          },
          {
            "name": "Validation Consolidated (1 call: analyze with all includes)",
            "value": 3.800991955801105,
            "unit": "ms"
          },
          {
            "name": "Cache Hit: analyze with same document version",
            "value": 0.280223120186204,
            "unit": "ms"
          },
          {
            "name": "Cache Miss: analyze with different version",
            "value": 0.2616788389261745,
            "unit": "ms"
          },
          {
            "name": "Closed File: analyze without version (stat-based key)",
            "value": 0.5392093827258321,
            "unit": "ms"
          },
          {
            "name": "Cross-file: compile main with inherited utils",
            "value": 0.19443180290644868,
            "unit": "ms"
          },
          {
            "name": "Cross-file: recompile main (cache hit)",
            "value": 0.21221543225380038,
            "unit": "ms"
          },
          {
            "name": "resolveStdlib(\"Stdio\") - warm",
            "value": 1.6043747865429234,
            "unit": "ms"
          },
          {
            "name": "resolveStdlib(\"String\")",
            "value": 0.36364415692640695,
            "unit": "ms"
          },
          {
            "name": "resolveStdlib(\"Array\")",
            "value": 0.35759804157782515,
            "unit": "ms"
          },
          {
            "name": "resolveStdlib(\"Mapping\")",
            "value": 0.0996394024991779,
            "unit": "ms"
          },
          {
            "name": "resolveStdlib(\"Stdio.File\") - nested",
            "value": 0.5790572727272727,
            "unit": "ms"
          },
          {
            "name": "resolveStdlib(\"String.SplitIterator\") - nested",
            "value": 0.08682563450888953,
            "unit": "ms"
          },
          {
            "name": "First diagnostic after document change",
            "value": 0.3735135189309577,
            "unit": "ms"
          },
          {
            "name": "[Debounce] Validation with 250ms debounce",
            "value": 251.12074566666666,
            "unit": "ms"
          },
          {
            "name": "[Debounce] Rapid edit simulation (5x50ms)",
            "value": 254.36277233333334,
            "unit": "ms"
          },
          {
            "name": "Validation: sequential warm revalidation",
            "value": 0.3675314596069869,
            "unit": "ms"
          },
          {
            "name": "Hover: resolveStdlib(\"Stdio.File\")",
            "value": 0.561918850660066,
            "unit": "ms"
          },
          {
            "name": "Hover: resolveModule(\"Stdio.File\")",
            "value": 0.07802697456953643,
            "unit": "ms"
          },
          {
            "name": "Completion: getCompletionContext (Large File, Warm Cache)",
            "value": 5.648701396694215,
            "unit": "ms"
          },
          {
            "name": "Completion: getCompletionContext (Large File, Cold Cache)",
            "value": 5.601870319672131,
            "unit": "ms"
          }
        ]
      }
    ]
  }
}