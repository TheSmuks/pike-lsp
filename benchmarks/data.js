window.BENCHMARK_DATA = {
  "lastUpdate": 1769984429537,
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
      }
    ]
  }
}