---
id: troubleshooting
title: Troubleshooting
description: Common issues and solutions for Pike LSP
---

# Troubleshooting

## Pike not found

```
Pike executable not found at "pike"
```

**Solution:** Ensure Pike 8.0+ is installed and in your PATH, or configure `pike.pikePath` in VS Code settings.

## Extension not activating

**Symptoms:**
- Extension doesn't load when opening a `.pike` file

**Solutions:**
1. Check that you have a `.pike` or `.pmod` file open
2. Check the Output panel (View > Output > Pike Language Server) for errors
3. Verify Pike is in your PATH by running `pike --version` in terminal

## Slow indexing on large projects

**Symptoms:** Editor feels sluggish when editing large files

**Solution:** Workspace indexing runs in the background and shouldn't block editing. Initial indexing of large projects may take a few seconds.

## Diagnostic Errors Not Showing

**Symptoms:** Syntax errors not highlighted in the editor

**Solutions:**
1. Check the Problems panel (View > Problems)
2. Ensure the file is saved with a `.pike` or `.pmod` extension
3. Check that diagnostics are enabled in VS Code settings

## Getting Help

If you encounter issues not listed here:

1. Check the [GitHub Issues](https://github.com/TheSmuks/pike-lsp/issues)
2. Search existing issues for similar problems
3. Open a new issue with:
   - Pike LSP version
   - VS Code version
   - Pike version
   - Steps to reproduce
   - Error messages from Output panel
