window.BENCHMARK_DATA = {
  "lastUpdate": 1769443962357,
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
      }
    ]
  }
}