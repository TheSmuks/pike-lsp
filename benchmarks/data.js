window.BENCHMARK_DATA = {
  "lastUpdate": 1770470387550,
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
      }
    ]
  }
}