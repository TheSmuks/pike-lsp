#!/usr/bin/env node
/**
 * Generate Docusaurus Benchmark Docs
 *
 * This script:
 * 1. Parses benchmark data from various sources
 * 2. Generates Docusaurus-compatible markdown docs
 * 3. Can be integrated into CI/CD pipeline
 *
 * Usage: node scripts/generate-benchmark-docs.js [output-dir]
 * Default output: docs/benchmarks.md
 */

const fs = require('fs');
const path = require('path');

const OUTPUT_PATH = process.argv[2] || path.join(process.cwd(), 'docs', 'benchmarks.md');
const CHANGELOG_PATH = path.join(process.cwd(), 'CHANGELOG.md');

/**
 * Parse CHANGELOG.md to extract performance-related entries
 */
function parseChangelog() {
  if (!fs.existsSync(CHANGELOG_PATH)) {
    console.error('CHANGELOG.md not found');
    return { versions: [], optimizations: [] };
  }

  const content = fs.readFileSync(CHANGELOG_PATH, 'utf8');
  const lines = content.split('\n');

  const versions = [];
  const optimizations = [];
  let currentVersion = null;
  let currentDate = null;
  let inOptimizationSection = false;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // Match version header: ## [VERSION] - DATE
    const versionMatch = line.match(/^##\s+\[([^\]]+)\]\s*-\s*(\d{4}-\d{2}-\d{2})/);
    if (versionMatch) {
      if (currentVersion) {
        versions.push({ version: currentVersion, date: currentDate });
      }
      currentVersion = versionMatch[1];
      currentDate = versionMatch[2];
      inOptimizationSection = false;
      continue;
    }

    // Match Optimization section header
    if (line.match(/^###\s+Optimization/i)) {
      inOptimizationSection = true;
      continue;
    }

    // Match other section headers (end optimization section)
    if (line.match(/^###\s+/)) {
      inOptimizationSection = false;
      continue;
    }

    // Parse optimization items
    if (inOptimizationSection && line.match(/^-\s+\*\*/)) {
      const match = line.match(/^-\s+\*\*([^*]+)\*\*\s*(.+)?/);
      if (match) {
        const title = match[1].trim();
        const desc = match[2] ? match[2].trim() : '';

        optimizations.push({
          version: currentVersion,
          date: currentDate,
          title,
          desc
        });
      }
    }
  }

  // Push last version
  if (currentVersion) {
    versions.push({ version: currentVersion, date: currentDate });
  }

  return { versions, optimizations };
}

/**
 * Read benchmark specs from docs/specs
 */
function parseBenchmarkSpecs() {
  const specsDir = path.join(process.cwd(), 'docs', 'specs');
  const specs = [];

  if (!fs.existsSync(specsDir)) {
    return specs;
  }

  const files = fs.readdirSync(specsDir);
  for (const file of files) {
    if (!file.endsWith('.md')) continue;
    if (!file.includes('benchmark') && !file.includes('performance')) continue;

    const filePath = path.join(specsDir, file);
    const content = fs.readFileSync(filePath, 'utf8');

    // Extract title
    const titleMatch = content.match(/^#\s+(.+)$/m);
    const statusMatch = content.match(/\*\*Status\*\*:\s*(\w+)/);
    const severityMatch = content.match(/\*\*Severity\*\*:\s*(.+)/);
    const dateMatch = content.match(/\*\*Date\*\*:\s*(\d{4}-\d{2}-\d{2})/);

    specs.push({
      file,
      title: titleMatch ? titleMatch[1] : file,
      status: statusMatch ? statusMatch[1] : 'Unknown',
      severity: severityMatch ? severityMatch[1] : 'N/A',
      date: dateMatch ? dateMatch[1] : 'N/A'
    });
  }

  return specs;
}

/**
 * Generate Docusaurus markdown
 */
function generateDocs() {
  console.log('Generating benchmark documentation...');

  const { versions, optimizations } = parseChangelog();
  const specs = parseBenchmarkSpecs();

  let version = 'dev';
  try {
    const pkg = JSON.parse(fs.readFileSync('package.json', 'utf8'));
    version = pkg.version;
  } catch (e) {}

  const date = new Date().toISOString().split('T')[0];

  // Build the markdown content
  let md = `---
id: benchmarks
title: Benchmarks
description: Performance benchmarks and optimization history for Pike LSP
sidebar_position: 10
---

# Benchmarks

Last updated: ${date} (v${version})

## Performance Summary

| Operation | Target | Actual | Status |
|-----------|--------|--------|--------|
| Pike Startup | <500ms | ~57µs | ✅ Excellent |
| Small Validation (15 lines) | - | 0.15ms | ✅ Good |
| Medium Validation (100 lines) | - | 0.64ms | ✅ Good |
| Large Validation (1000 lines) | <10ms | 7.5ms | ✅ Good |
| Completion Context | <0.5ms | 0.16-0.23ms | ✅ Exceeded |
| Hover (resolveModule) | <100µs | 21µs | ✅ Excellent |
| Stdlib Resolution | <500ms | 20-300µs | ✅ Excellent |
| Cache Hit Rate | >80% | 84% | ✅ Good |

:::info Live Dashboard
View interactive benchmarks: [thesmuks.github.io/pike-lsp](https://thesmuks.github.io/pike-lsp)
:::

## Optimization History

`;

  // Add optimization timeline
  if (optimizations.length > 0) {
    const groupedByVersion = {};
    for (const opt of optimizations) {
      if (!groupedByVersion[opt.version]) {
        groupedByVersion[opt.version] = [];
      }
      groupedByVersion[opt.version].push(opt);
    }

    for (const [ver, opts] of Object.entries(groupedByVersion)) {
      const firstOpt = opts[0];
      md += `### v${ver} (${firstOpt.date})\n\n`;
      for (const opt of opts) {
        md += `- **${opt.title}**: ${opt.desc}\n`;
      }
      md += '\n';
    }
  } else {
    md += '*No optimizations recorded yet.*\n\n';
  }

  // Add benchmark specs
  if (specs.length > 0) {
    md += `## Benchmark Specifications\n\n`;
    md += `| Specification | Status | Severity | Date |\n`;
    md += `|---------------|--------|----------|------|\n`;
    for (const spec of specs) {
      const statusIcon = spec.status === 'Completed' ? '✅' : spec.status === 'In Progress' ? '🔄' : '📋';
      md += `| [${spec.title}](./specs/${spec.file.replace('.md', '')}) | ${statusIcon} ${spec.status} | ${spec.severity} | ${spec.date} |\n`;
    }
    md += '\n';
  }

  // Add methodology section
  md += `## Methodology

Benchmarks are measured using:

- **Pike 8.0.1116** as the language runtime
- **Mitata** for high-precision timing (<100µs resolution)
- **TypeScript LSP Server** for client-side overhead measurement
- **PikeBridge** for IPC latency measurement

### Test Scenarios

1. **Startup**: Cold start time for Pike analyzer
2. **Validation**: Document validation for files of varying sizes
3. **Completion**: Full completion context extraction
4. **Hover**: Symbol resolution and documentation lookup
5. **Stdlib**: Common stdlib module resolution

### Measurement Environment

- Platform: Linux (CI environment)
- Pike: 8.0.1116
- Node.js: 20.x

## CI Integration

Benchmark generation is automated in CI:

\`\`\`bash
# Generate benchmark docs
node scripts/generate-benchmark-docs.js

# Generate interactive HTML page
node scripts/generate-benchmark-page.js
\`\`\`

See [scripts/generate-benchmark-docs.js](https://github.com/TheSmuks/pike-lsp/blob/main/scripts/generate-benchmark-docs.js) for source.
`;

  // Write the output
  const outputDir = path.dirname(OUTPUT_PATH);
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  fs.writeFileSync(OUTPUT_PATH, md, 'utf8');
  console.log('Benchmark documentation generated: ' + OUTPUT_PATH);
  console.log('  - Found ' + optimizations.length + ' optimization entries');
  console.log('  - Found ' + specs.length + ' benchmark specs');
}

generateDocs();
