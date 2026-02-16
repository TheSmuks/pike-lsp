---
id: configuration
title: Configuration
description: Configuration options for Pike LSP
---

# Configuration

## VS Code Settings

Add these settings to your VS Code `settings.json`:

```json
{
    // Path to Pike executable (default: "pike")
    "pike.pikePath": "/usr/local/bin/pike",

    // LSP trace level for debugging
    "pike.trace.server": "off"  // "off" | "messages" | "verbose"
}
```

## Configuration Options

| Setting | Type | Default | Description |
|---------|------|---------|-------------|
| `pike.pikePath` | string | `"pike"` | Path to the Pike executable |
| `pike.trace.server` | string | `"off"` | LSP trace level: `"off"`, `"messages"`, or `"verbose"` |
| `pike.enable` | boolean | `true` | Enable/disable the LSP server |

## Custom File Extensions

For non-standard extensions, add file associations in VSCode settings:

```json
{
  "files.associations": {
    "*.rjs": "pike",
    "*.inc": "pike"
  }
}
```

## Environment Variables

Pike LSP respects the following environment variables:

| Variable | Description |
|----------|-------------|
| `PIKE_PATH` | Pike module search path |
| `PIKE_INCLUDE_PATH` | Pike include path |
| `PIKE_MODULE_PATH` | Pike module path |
