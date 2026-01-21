import { defineConfig } from '@vscode/test-cli';

// Build launch args based on environment
const buildLaunchArgs = () => {
  const args = [
    '--disable-gpu',
    '--disable-dev-shm-usage',
    '--no-sandbox'
  ];

  // If running under Wayland, add Wayland-specific flags
  if (process.env.WAYLAND_DISPLAY) {
     // Electron/Chromium auto-detects Wayland in newer versions,
     // or these flags might be causing warnings if passed incorrectly.
     // Removing explicit enable-features to reduce warnings as requested.
     // args.push(
     //   '--ozone-platform=wayland'
     // );
  }

  return args;
};

export default defineConfig([
  {
    label: 'Integration Tests',
    files: 'dist/test/integration/*.test.js',
    version: 'stable',
    workspaceFolder: './test-workspace',
    mocha: {
      ui: 'tdd',
      timeout: 120000 // 120s timeout for LSP initialization with module path loading
    },
    // Enable test mode so Pike server output is logged to console
    env: {
      PIKE_LSP_TEST_MODE: 'true'
    },
    // Disable GPU and other UI features for headless testing
    // Add Wayland flags if WAYLAND_DISPLAY is set
    launchArgs: buildLaunchArgs()
  }
]);
