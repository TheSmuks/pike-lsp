---
name: vscode-e2e-testing-linux-headless
description: |
  Resolve stability issues when running VSCode extension E2E tests in headless Linux environments. Use when: (1) Tests crash with SIGSEGV or GDK assertions (GDK_IS_SEAT), (2) Weston (Wayland) fails to start or connect, (3) CI/Headless tests are flaky. Covers forcing Xvfb over Weston for better stability.
author: Claude Code
version: 1.0.0
date: 2026-01-22
---

# VSCode E2E Testing on Headless Linux

## Problem
Running VSCode extension End-to-End (E2E) tests in headless Linux environments (CI, containers, remote VMs) can be unstable. While modern setups often prefer Wayland (via Weston), it can be flaky or fail entirely with obscure GDK/GTK errors, whereas the older X11 (via Xvfb) is often more robust for headless testing.

## Context / Trigger Conditions
-   **Environment:** Headless Linux (CI, Docker, SSH without X forwarding).
-   **Errors:**
    -   `Gdk: gdk_seat_get_keyboard: assertion 'GDK_IS_SEAT (seat)' failed`
    -   `Exit code: SIGSEGV`
    -   `Weston` failing to create a socket or seemingly hanging.
    -   Electron/VSCode failing to launch.

## Solution

### 1. Prefer Xvfb for Stability
If your test script defaults to Weston/Wayland and fails, force it to use Xvfb (X Virtual Framebuffer). Xvfb creates a virtual display in memory and is highly reliable for Electron-based tests.

### 2. Script Modification Pattern
Modify test runner scripts to allow forcing Xvfb via an environment variable (e.g., `USE_XVFB=1`).

**Before (Implicit preference):**
```bash
if command -v weston &> /dev/null; then
    # Runs Weston
elif command -v xvfb-run &> /dev/null; then
    # Runs Xvfb
fi
```

**After (Explicit control):**
```bash
# Allow forcing Xvfb with USE_XVFB=1
if [ -z "$USE_XVFB" ] && command -v weston &> /dev/null; then
    # Runs Weston
elif command -v xvfb-run &> /dev/null; then
    # Runs Xvfb
fi
```

### 3. Running with Xvfb
When running manually or in CI:
```bash
# Direct usage
xvfb-run -a npm run test

# With the script modification
USE_XVFB=1 npm run test
```
*Note: `-a` finds a free display number automatically.*

## Verification
1.  Set the environment variable: `export USE_XVFB=1`
2.  Run the tests.
3.  Observe that `xvfb-run` is invoked instead of `weston`.
4.  Tests should pass without GDK assertion failures or SIGSEGV crashes.

## Notes
-   **GPU Disabling:** Always ensure Electron is launched with `--disable-gpu` in headless environments.
-   **Dependencies:** Xvfb requires `xvfb` or `xorg-server-xvfb` packages.
-   **Wayland:** While Wayland is the future, Xvfb remains the de-facto standard for stable headless browser/Electron testing as of 2026.

## References
-   [Running VSCode Tests in CI](https://code.visualstudio.com/api/working-with-extensions/testing-extension#running-tests-in-ci)
-   [Electron Headless Testing](https://www.electronjs.org/docs/latest/tutorial/testing-on-headless-ci)
