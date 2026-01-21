# Phase 09: Implement Pike Version Detection - Context

**Gathered:** 2026-01-21
**Status:** Ready for planning

<domain>
## Phase Boundary

Complete the Pike version detection feature in BridgeManager so health checks show actual Pike version instead of "Unknown". This involves adding an RPC method to the analyzer, creating the bridge request logic, and updating the health check display.

</domain>

<decisions>
## Implementation Decisions

### Retrieval Strategy
- **Method:** Add `get_version` RPC method to analyzer.pike (requires bridge modification).
- **Timing:** Fetch once on bridge startup and cache the result.
- **Failure:** Log a warning if the RPC call fails (e.g., old analyzer) and return "Unknown".
- **Validation:** Validate minimum version (e.g., 8.0) and warn if unsupported.

### Display Format
- **Format:** Version number only (e.g., '8.0.1116'), normalized to remove 'v' prefix if present.
- **Path:** Include the Pike binary path in the health check output (e.g., '8.0.1116 (/usr/bin/pike)').
- **Startup:** Log the detected version to the console on startup ("Connected to Pike 8.0...").

### Failure Handling
- **Display:** Show "Unknown" in health check if detection fails.
- **Blocking:** Failure to detect version must NOT block the server from starting (informational only).
- **Retries:** Single attempt at startup only; do not retry automatically.
- **Unsupported Version:** Warn the user via Status Bar / Output but allow the server to continue running.

### Claude's Discretion
- Exact RPC method signature and response structure.
- Specific warning message text.
- Version parsing regex details.

</decisions>

<specifics>
## Specific Ideas

- "I want to know which Pike binary is actually running in case I have multiple installed."
- "Don't crash if the user has a weird custom Pike build that returns a non-standard version string."

</specifics>

<deferred>
## Deferred Ideas

- None — discussion stayed within phase scope.

</deferred>

---

*Phase: 09-implement-pike-version-detection*
*Context gathered: 2026-01-21*
