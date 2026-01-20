import { defineConfig } from '@vscode/test-cli';

export default defineConfig([
  {
    label: 'Integration Tests',
    files: 'dist/test/integration/*.test.js',
    version: 'stable',
    workspaceFolder: './test-workspace',
    mocha: {
      ui: 'tdd',
      timeout: 120000 // 120s timeout for LSP initialization with module path loading
    }
  }
]);
