# Pike Language Support (Pike LSP)

Language Server Protocol support for the Pike programming language, providing modern IDE features in VS Code.

## Features

- Syntax highlighting with semantic tokens
- Code completion and signature help
- Go to definition, references, and hover info
- Diagnostics with real-time errors
- Rename, code lens, and inlay hints
- Document/workspace symbols and code actions

## Requirements

- Pike 8.0+
- Node.js 18+ (for development)
- VS Code 1.85+

## Configuration

All settings are optional. Add any you need to your VS Code `settings.json`:

```json
{
  "pike.pikePath": "/usr/local/bin/pike",
  "pike.pikeModulePath": ["/path/to/pike/modules"],
  "pike.pikeIncludePath": ["/path/to/pike/include"],
  "pike.pikeProgramPath": ["/path/to/pike/programs"],
  "pike.trace.server": "off"
}
```

## Using the Extension

1. Open a `.pike` or `.pmod` file.
2. The Pike Language Server starts automatically.
3. Use standard VS Code actions like `F12` (go to definition) and `F2` (rename).

## Testing

### E2E Feature Tests

Verify LSP features work end-to-end:

```bash
cd packages/vscode-pike
pnpm run test:features
```

Tests verify:

- Document symbols (outline view)
- Hover (type information)
- Go-to-definition (navigation)
- Completion (autocomplete)

**Note:** Requires `xvfb` on Linux (pre-installed in CI).

## Troubleshooting

- If Pike is not on `PATH`, set `pike.pikePath`.
- Check the Output panel and select **Pike Language Server** for logs.

## License

MIT. See `LICENSE`.
