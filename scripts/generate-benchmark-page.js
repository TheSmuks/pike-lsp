#!/usr/bin/env node
/**
 * Generate Benchmark Page for GitHub Pages
 *
 * This script:
 * 1. Parses CHANGELOG.md to extract optimization entries
 * 2. Fetches benchmark history from gh-pages
 * 3. Computes rolling averages
 * 4. Generates index.html with tabbed navigation
 *
 * Usage: node scripts/generate-benchmark-page.js [output-path]
 * Default output: gh-pages/index.html
 */

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const OUTPUT_PATH = process.argv[2] || path.join(process.cwd(), 'gh-pages', 'index.html');
const CHANGELOG_PATH = path.join(process.cwd(), 'CHANGELOG.md');
const WINDOW_SIZE = 5;

// HTML Template with tabbed interface
const HTML_TEMPLATE = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Pike LSP Benchmarks</title>
  <script src="https://cdn.jsdelivr.net/npm/chart.js"></script>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@300;400;500;600;700&family=Space+Grotesk:wght@400;500;600;700&display=swap" rel="stylesheet">
  <style>
    :root {
      --bg-primary: #0d1117;
      --bg-secondary: #161b22;
      --bg-card: #21262d;
      --bg-card-hover: #30363d;
      --border: #30363d;
      --border-accent: #484f58;
      --text-primary: #f0f6fc;
      --text-secondary: #8b949e;
      --text-muted: #6e7681;
      --accent-emerald: #3fb950;
      --accent-emerald-dim: #3fb9501a;
      --accent-blue: #58a6ff;
      --accent-blue-dim: #58a6ff1a;
      --accent-orange: #d29922;
      --accent-orange-dim: #d299221a;
      --accent-red: #f85149;
      --accent-red-dim: #f851491a;
      --accent-purple: #a371f7;
      --accent-purple-dim: #a371f71a;
      --font-display: 'Space Grotesk', sans-serif;
      --font-mono: 'JetBrains Mono', monospace;
    }

    * { margin: 0; padding: 0; box-sizing: border-box; }

    body {
      font-family: var(--font-display);
      background: var(--bg-primary);
      color: var(--text-primary);
      min-height: 100vh;
      line-height: 1.6;
      overflow-x: hidden;
    }

    .bg-grid {
      position: fixed;
      top: 0; left: 0; width: 100%; height: 100%;
      pointer-events: none;
      background-image:
        linear-gradient(var(--border) 1px, transparent 1px),
        linear-gradient(90deg, var(--border) 1px, transparent 1px);
      background-size: 60px 60px;
      opacity: 0.1;
      z-index: 0;
    }

    .container {
      position: relative;
      z-index: 1;
      max-width: 1200px;
      margin: 0 auto;
      padding: 0 24px;
    }

    header {
      padding: 24px 0;
      border-bottom: 1px solid var(--border);
      margin-bottom: 24px;
    }

    .header-top {
      display: flex;
      justify-content: space-between;
      align-items: center;
      flex-wrap: wrap;
      gap: 16px;
    }

    h1 {
      font-size: 1.5rem;
      font-weight: 700;
      letter-spacing: -0.02em;
    }

    h1 .accent { color: var(--accent-blue); }

    .version-badge {
      font-family: var(--font-mono);
      font-size: 0.75rem;
      background: var(--accent-blue-dim);
      color: var(--accent-blue);
      padding: 4px 10px;
      border-radius: 6px;
    }

    /* Tab Navigation */
    .tabs {
      display: flex;
      gap: 8px;
      border-bottom: 1px solid var(--border);
      margin-bottom: 24px;
      overflow-x: auto;
    }

    .tab {
      padding: 12px 20px;
      background: transparent;
      border: none;
      color: var(--text-secondary);
      font-family: var(--font-display);
      font-size: 0.9rem;
      font-weight: 500;
      cursor: pointer;
      border-bottom: 2px solid transparent;
      transition: all 0.2s ease;
      white-space: nowrap;
    }

    .tab:hover {
      color: var(--text-primary);
      background: var(--bg-card-hover);
    }

    .tab.active {
      color: var(--accent-blue);
      border-bottom-color: var(--accent-blue);
    }

    /* Tab Content */
    .tab-content {
      display: none;
    }

    .tab-content.active {
      display: block;
    }

    /* Stats Grid */
    .stats-grid {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(250px, 1fr));
      gap: 12px;
    }

    .stat-card {
      background: var(--bg-card);
      border: 1px solid var(--border);
      border-radius: 8px;
      padding: 16px;
      transition: all 0.2s ease;
    }

    .stat-card:hover {
      border-color: var(--border-accent);
    }

    .stat-card .name {
      font-size: 0.7rem;
      color: var(--text-secondary);
      text-transform: uppercase;
      letter-spacing: 0.05em;
      margin-bottom: 8px;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }

    .stat-card .value {
      font-size: 1.25rem;
      font-weight: 700;
      font-family: var(--font-mono);
    }

    .stat-card .delta {
      font-size: 0.75rem;
      margin-top: 4px;
    }

    .stat-card .delta.improved { color: var(--accent-emerald); }
    .stat-card .delta.regressed { color: var(--accent-red); }
    .stat-card .delta.neutral { color: var(--text-secondary); }

    /* Charts */
    .charts-grid {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(500px, 1fr));
      gap: 16px;
    }

    .chart-container {
      background: var(--bg-card);
      border: 1px solid var(--border);
      border-radius: 8px;
      padding: 16px;
    }

    .chart-title {
      font-size: 0.8rem;
      font-weight: 500;
      color: var(--text-secondary);
      margin-bottom: 12px;
    }

    .chart-canvas {
      height: 180px;
    }

    /* Timeline */
    .timeline {
      position: relative;
      padding-left: 20px;
    }

    .timeline::before {
      content: '';
      position: absolute;
      left: 0;
      top: 0;
      bottom: 0;
      width: 2px;
      background: var(--border);
    }

    .timeline-item {
      position: relative;
      padding-bottom: 20px;
    }

    .timeline-item::before {
      content: '';
      position: absolute;
      left: -25px;
      top: 6px;
      width: 12px;
      height: 12px;
      border-radius: 50%;
      background: var(--accent-blue);
      border: 2px solid var(--bg-primary);
    }

    .timeline-header {
      cursor: pointer;
      padding: 12px 16px;
      background: var(--bg-card);
      border: 1px solid var(--border);
      border-radius: 8px;
      margin-bottom: 0;
      transition: all 0.2s ease;
    }

    .timeline-header:hover {
      background: var(--bg-card-hover);
    }

    .timeline-item.expanded .timeline-header {
      border-bottom-left-radius: 0;
      border-bottom-right-radius: 0;
      margin-bottom: 0;
    }

    .timeline-title {
      display: flex;
      align-items: center;
      gap: 12px;
      font-weight: 500;
    }

    .timeline-version {
      font-family: var(--font-mono);
      font-size: 0.7rem;
      background: var(--accent-blue-dim);
      color: var(--accent-blue);
      padding: 2px 8px;
      border-radius: 4px;
    }

    .timeline-date {
      font-size: 0.8rem;
      color: var(--text-secondary);
      margin-left: auto;
    }

    .timeline-content {
      display: none;
      padding: 12px 16px;
      background: var(--bg-card);
      border: 1px solid var(--border);
      border-top: none;
      border-bottom-left-radius: 8px;
      border-bottom-right-radius: 8px;
    }

    .timeline-item.expanded .timeline-content {
      display: block;
    }

    .timeline-items {
      list-style: none;
    }

    .timeline-items li {
      padding: 6px 0;
      display: flex;
      gap: 12px;
      font-size: 0.9rem;
    }

    .timeline-items li strong {
      color: var(--accent-blue);
      min-width: 180px;
      flex-shrink: 0;
    }

    .chevron {
      margin-left: auto;
      transition: transform 0.2s ease;
    }

    .timeline-item.expanded .chevron {
      transform: rotate(180deg);
    }

    footer {
      padding: 24px 0;
      border-top: 1px solid var(--border);
      text-align: center;
      color: var(--text-secondary);
      font-size: 0.8rem;
    }

    @media (max-width: 768px) {
      .stats-grid { grid-template-columns: 1fr; }
      .charts-grid { grid-template-columns: 1fr; }
      h1 { font-size: 1.25rem; }
    }
  </style>
</head>
<body>
  <div class="bg-grid"></div>

  <div class="container">
    <header>
      <div class="header-top">
        <h1>Pike LSP <span class="accent">Benchmarks</span></h1>
        <span class="version-badge" id="versionDisplay">{{VERSION}}</span>
      </div>
    </header>

    <nav class="tabs">
      <button class="tab active" data-tab="overview">Overview</button>
      <button class="tab" data-tab="history">History</button>
      <button class="tab" data-tab="timeline">Optimizations</button>
    </nav>

    <!-- Overview Tab -->
    <div class="tab-content active" id="tab-overview">
      <div class="stats-grid" id="statsGrid">
        <!-- Stats inserted by JS -->
      </div>
    </div>

    <!-- History Tab -->
    <div class="tab-content" id="tab-history">
      <div class="charts-grid" id="chartsContainer">
        <!-- Charts inserted by JS -->
      </div>
    </div>

    <!-- Timeline Tab -->
    <div class="tab-content" id="tab-timeline">
      <div class="timeline" id="timelineContainer">
        <!-- Timeline inserted by JS -->
      </div>
    </div>

    <footer>
      <p>Updated: {{DATE}} • <a href="https://github.com/TheSmuks/pike-lsp" style="color: var(--accent-blue);">Pike LSP</a></p>
    </footer>
  </div>

  <script>
    const BENCHMARK_DATA = {{BENCHMARK_DATA}};
    const OPTIMIZATIONS = {{OPTIMIZATIONS}};
    const VERSION = "{{VERSION}}";

    // Tab navigation
    document.querySelectorAll('.tab').forEach(tab => {
      tab.addEventListener('click', () => {
        document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
        document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
        tab.classList.add('active');
        document.getElementById('tab-' + tab.dataset.tab).classList.add('active');
      });
    });

    // Render stats
    function renderStats() {
      const container = document.getElementById('statsGrid');
      if (!BENCHMARK_DATA || !BENCHMARK_DATA.current || BENCHMARK_DATA.current.length === 0) {
        container.innerHTML = '<p style="color: var(--text-secondary); grid-column: 1/-1;">No benchmark data available.</p>';
        return;
      }

      container.innerHTML = BENCHMARK_DATA.current.map(stat => \`
        <div class="stat-card">
          <div class="name">\${stat.name}</div>
          <div class="value">\${stat.value.toFixed(2)} ms</div>
          <div class="delta \${stat.deltaClass}">\${stat.deltaText}</div>
        </div>
      \`).join('');
    }

    // Render charts
    function renderCharts() {
      const container = document.getElementById('chartsContainer');
      if (!BENCHMARK_DATA || !BENCHMARK_DATA.history || BENCHMARK_DATA.history.length === 0) {
        container.innerHTML = '<p style="color: var(--text-secondary);">No historical data available.</p>';
        return;
      }

      container.innerHTML = BENCHMARK_DATA.history.map(chart => \`
        <div class="chart-container">
          <div class="chart-title">\${chart.name}</div>
          <div class="chart-canvas">
            <canvas id="chart-\${chart.id}"></canvas>
          </div>
        </div>
      \`).join('');

      BENCHMARK_DATA.history.forEach(chart => {
        const ctx = document.getElementById('chart-' + chart.id).getContext('2d');
        new Chart(ctx, {
          type: 'line',
          data: {
            labels: chart.labels,
            datasets: [{
              data: chart.values,
              borderColor: '#58a6ff',
              backgroundColor: '#58a6ff1a',
              fill: true,
              tension: 0.3,
              pointRadius: 3,
              pointHoverRadius: 5
            }]
          },
          options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: { legend: { display: false } },
            scales: {
              y: { beginAtZero: true, grid: { color: '#30363d' }, ticks: { color: '#8b949e' } },
              x: { grid: { display: false }, ticks: { color: '#8b949e', maxRotation: 45 } }
            }
          }
        });
      });
    }

    // Render timeline
    function renderTimeline() {
      const container = document.getElementById('timelineContainer');
      if (!OPTIMIZATIONS || OPTIMIZATIONS.length === 0) {
        container.innerHTML = '<p style="color: var(--text-secondary);">No optimization history available.</p>';
        return;
      }

      container.innerHTML = OPTIMIZATIONS.map(opt => \`
        <div class="timeline-item">
          <div class="timeline-header" onclick="this.parentElement.classList.toggle('expanded')">
            <div class="timeline-title">
              <span class="timeline-version">\${opt.version}</span>
              \${opt.title}
              <svg class="chevron" width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
                <path d="M4.427 7.427l3.396 3.396a.25.25 0 00.354 0l3.396-3.396A.25.25 0 0011.396 7H4.604a.25.25 0 00-.177.427z"/>
              </svg>
            </div>
            <span class="timeline-date">\${opt.date}</span>
          </div>
          <div class="timeline-content">
            <ul class="timeline-items">
              \${opt.items.map(item => \`<li><strong>\${item.title}</strong> \${item.desc}</li>\`).join('')
              }
            </ul>
          </div>
        </div>
      \`).join('');
    }

    // Initialize
    document.getElementById('versionDisplay').textContent = VERSION;
    renderStats();
    renderCharts();
    renderTimeline();
  </script>
</body>
</html>
`;

/**
 * Parse CHANGELOG.md to extract optimization entries
 */
function parseChangelog() {
  if (!fs.existsSync(CHANGELOG_PATH)) {
    console.error('CHANGELOG.md not found');
    return [];
  }

  const content = fs.readFileSync(CHANGELOG_PATH, 'utf8');
  const lines = content.split('\n');

  const optimizations = [];
  let currentVersion = null;
  let currentDate = null;
  let inOptimizationSection = false;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // Match version header: ## [VERSION] - DATE
    const versionMatch = line.match(/^##\s+\[([^\]]+)\]\s*-\s*(\d{4}-\d{2}-\d{2})/);
    if (versionMatch) {
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

        let optEntry = optimizations.find(o => o.version === currentVersion);
        if (!optEntry) {
          optEntry = {
            version: currentVersion,
            date: currentDate,
            title: 'Performance Optimizations',
            items: []
          };
          optimizations.push(optEntry);
        }

        optEntry.items.push({ title, desc });
      }
    }
  }

  return optimizations;
}

/**
 * Fetch benchmark data from gh-pages
 */
function fetchBenchmarkData() {
  try {
    const data = execSync('git show origin/gh-pages:benchmarks/data.js 2>/dev/null', {
      encoding: 'utf8',
      maxBuffer: 10 * 1024 * 1024
    });

    const jsonMatch = data.match(/window\.BENCHMARK_DATA\s*=\s*(\{[\s\S]*\})\s*;?\s*$/);
    if (jsonMatch) {
      return JSON.parse(jsonMatch[1]);
    }
  } catch (error) {
    console.log('Could not fetch historical benchmark data:', error.message);
  }
  return null;
}

/**
 * Compute rolling averages and prepare chart data
 */
function prepareChartData(historicalData) {
  if (!historicalData || !historicalData.entries) {
    return { current: [], history: [] };
  }

  const entries = historicalData.entries['Pike LSP Performance'] || [];
  if (entries.length === 0) {
    return { current: [], history: [] };
  }

  // Group by benchmark name
  const byName = {};
  for (const run of entries) {
    if (!run.benches) continue;
    for (const bench of run.benches) {
      if (!byName[bench.name]) {
        byName[bench.name] = [];
      }
      byName[bench.name].push({
        date: run.date,
        commit: run.commit,
        value: bench.value
      });
    }
  }

  const currentStats = [];
  const history = [];

  for (const [name, values] of Object.entries(byName)) {
    if (values.length < 2) continue;

    values.sort((a, b) => new Date(a.date) - new Date(b.date));

    // Compute rolling average
    const rollingData = [];
    for (let i = 0; i < values.length; i++) {
      const start = Math.max(0, i - WINDOW_SIZE + 1);
      const window = values.slice(start, i + 1);
      const avg = window.reduce((s, v) => s + v.value, 0) / window.length;
      rollingData.push({
        date: values[i].date,
        value: avg
      });
    }

    const labels = rollingData.map(d => {
      const date = new Date(d.date);
      return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    });
    const chartValues = rollingData.map(d => d.value);

    const latest = rollingData[rollingData.length - 1].value;
    const previous = rollingData.length > 1 ? rollingData[rollingData.length - 2].value : latest;
    const deltaPercent = previous > 0 ? ((latest - previous) / previous) * 100 : 0;

    let deltaClass = 'neutral';
    let deltaText = 'No change';
    if (deltaPercent < -5) {
      deltaClass = 'improved';
      deltaText = Math.abs(deltaPercent).toFixed(0) + '% faster';
    } else if (deltaPercent > 5) {
      deltaClass = 'regressed';
      deltaText = deltaPercent.toFixed(0) + '% slower';
    }

    currentStats.push({
      name: name.replace(/_/g, ' '),
      value: latest,
      deltaClass,
      deltaText
    });

    history.push({
      id: name.replace(/[^a-z0-9]/gi, '-'),
      name: name.replace(/_/g, ' '),
      labels,
      values: chartValues
    });
  }

  currentStats.sort((a, b) => a.name.localeCompare(b.name));
  history.sort((a, b) => a.name.localeCompare(b.name));

  return { current: currentStats, history };
}

/**
 * Generate the HTML page
 */
function generatePage() {
  console.log('Generating benchmark page...');

  const optimizations = parseChangelog();
  console.log('Found ' + optimizations.length + ' releases with optimization entries');

  const historicalData = fetchBenchmarkData();
  const { current, history } = prepareChartData(historicalData);

  console.log('Prepared ' + history.length + ' benchmark charts');

  let version = 'dev';
  const date = new Date().toISOString().split('T')[0];

  try {
    version = execSync('git describe --tags --abbrev=0 2>/dev/null || echo "dev"', {
      encoding: 'utf8'
    }).trim();
  } catch (e) {
    try {
      const pkg = JSON.parse(fs.readFileSync('package.json', 'utf8'));
      version = pkg.version;
    } catch (e2) {}
  }

  let html = HTML_TEMPLATE
    .replace(/\{\{VERSION\}\}/g, version)
    .replace(/\{\{DATE\}\}/g, date)
    .replace(/\{\{BENCHMARK_DATA\}\}/g, JSON.stringify({ current, history }, null, 2))
    .replace(/\{\{OPTIMIZATIONS\}\}/g, JSON.stringify(optimizations, null, 2));

  const outputDir = path.dirname(OUTPUT_PATH);
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  fs.writeFileSync(OUTPUT_PATH, html, 'utf8');
  console.log('Benchmark page generated: ' + OUTPUT_PATH);
}

generatePage();
