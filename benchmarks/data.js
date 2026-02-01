window.BENCHMARK_DATA = {
  "lastUpdate": 1769963695650,
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
      }
    ]
  }
}