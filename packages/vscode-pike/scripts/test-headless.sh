#!/bin/bash
# Run VSCode E2E tests headlessly
# - CI environments: Uses pure headless mode (no display server needed)
# - Local Linux: Uses Weston (Wayland) or falls back to Xvfb
# - macOS/Windows: Native display support

set -e

cd "$(dirname "$0")/.."

# Detect if running in CI environment
is_ci() {
    [ -n "$CI" ] || [ -n "$GITHUB_ACTIONS" ] || [ -n "$GITLAB_CI" ] || [ -n "$JENKINS_URL" ]
}

# Build tests first
bun run build:test

# Check platform
case "$(uname -s)" in
    Linux*)
        # 1. If we already have a display (e.g. xvfb-run or local X11), use it IF we are in CI or user explicitly requested it
        if ([ -n "$DISPLAY" ] || [ -n "$WAYLAND_DISPLAY" ]) && { is_ci || [ -n "$USE_CURRENT_DISPLAY" ]; }; then
            echo "Display detected (DISPLAY=$DISPLAY, WAYLAND_DISPLAY=$WAYLAND_DISPLAY). Running tests..."
            # In CI or headless environments, we still want these flags
            export ELECTRON_EXTRA_LAUNCH_ARGS="--disable-gpu --disable-dev-shm-usage --no-sandbox"
            ./node_modules/.bin/vscode-test "$@"
            exit $?
        fi

        # 2. Try to set up a headless display server
        # Prefer Xvfb for Electron/E2E tests - more stable than Weston
        if [ -z "$USE_WESTON" ] && command -v xvfb-run &> /dev/null; then
            echo "Running tests headlessly with Xvfb..."
            # -a: auto-select display number
            # --server-args: set screen size and depth
            # Set Electron args to disable GPU for headless operation
            # Unset WAYLAND_DISPLAY to prevent VSCode from using Wayland
            # Force X11 backend for all toolkits
            xvfb-run -a --server-args="-screen 0 1920x1080x24" \
                env -u WAYLAND_DISPLAY -u WAYLAND_SOCKET \
                ELECTRON_EXTRA_LAUNCH_ARGS="--disable-gpu --disable-dev-shm-usage --no-sandbox" \
                GDK_BACKEND=x11 \
                QT_QPA_PLATFORM=xcb \
                ./node_modules/.bin/vscode-test "$@"
        elif command -v weston &> /dev/null; then
            echo "Xvfb not found. Trying Weston (Wayland)..."

                # 1. Set up XDG_RUNTIME_DIR
                # Wayland requires this directory to store its socket
                export XDG_RUNTIME_DIR="/tmp/vscode-wayland-test-$(date +%s)"
                mkdir -p "$XDG_RUNTIME_DIR"
                chmod 0700 "$XDG_RUNTIME_DIR"

                # 2. Start Weston in Headless Mode
                # -B specifies the backend (headless)
                # --socket sets the display name
                export WAYLAND_DISPLAY=wayland-1
                # Suppress all Weston output (we only need it running, not visible)
                weston -B headless-backend.so --socket=$WAYLAND_DISPLAY >/dev/null 2>&1 &
                WESTON_PID=$!

                # Give Weston a moment to start
                sleep 2

                # Set Electron args to disable GPU for headless operation (Weston doesn't provide GPU accel)
                # IMPORTANT: Tell Electron to use Ozone/Wayland backend instead of X11
                export ELECTRON_OZONE_PLATFORM_HINT=wayland
                export ELECTRON_ENABLE_LOGGING=1
                export ELECTRON_EXTRA_LAUNCH_ARGS="--disable-gpu --disable-dev-shm-usage --no-sandbox"

                # 3. Run tests
                echo "Running tests on $WAYLAND_DISPLAY..."
                set +e  # Don't exit on test failure, we need to cleanup
                TEST_OUTPUT=$(./node_modules/.bin/vscode-test "$@" 2>&1)
                TEST_EXIT_CODE=$?
                echo "$TEST_OUTPUT"

                # 4. Cleanup
                kill $WESTON_PID 2>/dev/null || true
                rm -rf "$XDG_RUNTIME_DIR"

                # 5. Handle Electron SIGSEGV during teardown (known Linux issue)
                # If all tests passed but process crashed during cleanup, treat as success
                if [ $TEST_EXIT_CODE -ne 0 ]; then
                    if echo "$TEST_OUTPUT" | grep -q "passing" && ! echo "$TEST_OUTPUT" | grep -q "[0-9]\+ fail"; then
                        echo "Note: Tests passed but Electron crashed during cleanup (known Linux issue). Treating as success."
                        exit 0
                    fi
                fi

                exit $TEST_EXIT_CODE

            else
                echo "ERROR: No headless display server found. Install one of:"
                echo "  Xvfb (Recommended for Electron E2E tests):"
                echo "    Ubuntu/Debian: sudo apt-get install xvfb"
                echo "    Fedora/RHEL:   sudo dnf install xorg-x11-server-Xvfb"
                echo "    Arch:          sudo pacman -S xorg-server-xvfb"
                echo "  Weston (Alternative, Wayland-based):"
                echo "    Ubuntu/Debian: sudo apt-get install weston"
                echo "    Fedora/RHEL:   sudo dnf install weston"
                echo "    Arch:          sudo pacman -S weston"
                exit 1
            fi
        ;;
    Darwin*)
        # macOS has native display support
        echo "Running tests on macOS (native display)..."
        npx vscode-test "$@"
        ;;
    CYGWIN*|MINGW*|MSYS*)
        # Windows has native display support
        echo "Running tests on Windows (native display)..."
        npx vscode-test "$@"
        ;;
    *)
        echo "Unknown platform: $(uname -s)"
        echo "Attempting to run tests directly..."
        npx vscode-test "$@"
        ;;
esac
