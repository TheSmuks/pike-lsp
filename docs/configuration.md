---
id: configuration
title: Configuration
description: Configuration options for Pike LSP
---

# Configuration

Pike LSP can be configured through VS Code settings to customize its behavior for your workflow.

## VS Code Settings

Open VS Code settings (`Ctrl+,`) and search for "Pike" to find all available options.

### Core Settings

| Setting             | Type      | Default  | Description                                            |
| ------------------- | --------- | -------- | ------------------------------------------------------ |
| `pike.pikePath`     | `string`  | `"pike"` | Path to the Pike executable                            |
| `pike.trace.server` | `string`  | `"off"`  | LSP trace level: `"off"`, `"messages"`, or `"verbose"` |
| `pike.enable`       | `boolean` | `true`   | Enable/disable the LSP server                          |

### Example Configuration

```json
{
  "pike.pikePath": "/usr/local/bin/pike",
  "pike.trace.server": "off"
}
```

## File Associations

By default, Pike LSP activates for `.pike` and `.pmod` files. To enable it for additional file types:

```json
{
  "files.associations": {
    "*.rjs": "pike",
    "*.inc": "pike",
    "*.pike.in": "pike"
  }
}
```

## Environment Variables

Pike LSP respects the following environment variables:

| Variable            | Description                              |
| ------------------- | ---------------------------------------- |
| `PIKE_PATH`         | Pike module search path                  |
| `PIKE_INCLUDE_PATH` | Pike include path                        |
| `PIKE_MODULE_PATH`  | Pike module path                         |
| `PIKE_SRC`          | Pike source directory (for development)  |
| `ROXEN_SRC`         | Roxen source directory (for development) |

## Pike Path Resolution

Pike LSP uses the following order to find the Pike executable:

1. `pike.pikePath` setting (if configured)
2. `PIKE_PATH` environment variable
3. System PATH

## Troubleshooting Configuration

### Verify Pike Path

```bash
which pike
# or
whereis pike
```

### Test Pike Execution

```bash
pike --version
```

### Enable Verbose Logging

For debugging issues:

```json
{
  "pike.trace.server": "verbose"
}
```

View logs in VS Code: **Output** panel → Select **"Pike Language Server"** from dropdown

## Workspace-Specific Configuration

You can configure Pike LSP per workspace by creating `.vscode/settings.json`:

```json
{
  "pike.pikePath": "/path/to/project-specific/pike",
  "files.associations": {
    "*.module": "pike"
  }
}
```

## Roxen Configuration

For Roxen module development, additional settings may be needed:

```json
{
  "pike.roxenPath": "/path/to/roxen",
  "files.associations": {
    "*.rjs": "pike"
  }
}
```

## Keyboard Shortcuts

Default VS Code shortcuts for LSP features:

| Feature            | Shortcut           |
| ------------------ | ------------------ |
| Go to Definition   | `F12`              |
| Find References    | `Shift+F12`        |
| Rename Symbol      | `F2`               |
| Trigger Completion | `Ctrl+Space`       |
| Signature Help     | `Ctrl+Shift+Space` |
| Go to Symbol       | `Ctrl+Shift+O`     |
| Workspace Symbol   | `Ctrl+T`           |
| Show Hover         | `Ctrl+K Ctrl+I`    |
| Code Actions       | `Ctrl+.`           |
| Format Document    | `Shift+Alt+F`      |

You can customize these in VS Code Keyboard Shortcuts settings.

## Related Topics

- [Getting Started](/docs/getting-started) - Installation guide
- [Troubleshooting](/docs/troubleshooting) - Common issues and solutions
- [Features](/docs/features) - Complete feature list
