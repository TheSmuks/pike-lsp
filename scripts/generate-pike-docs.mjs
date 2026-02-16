/**
 * Pike Autodoc Generator
 *
 * Parses //! doc comments from Pike source files and generates Docusaurus-compatible markdown.
 * Run: node scripts/generate-pike-docs.js
 */

import { readdir, readFile, writeFile, mkdir } from 'fs/promises';
import { existsSync } from 'fs';
import { join, relative } from 'path';

const PIKE_SCRIPTS_DIR = './pike-scripts';
const OUTPUT_DIR = './docs/api/pike';

// Extract //! comments from Pike source
function extractAutodoc(content) {
  const lines = content.split('\n');
  const docs = [];
  let currentDoc = null;
  let inBlock = false;
  let lineNumber = 0;

  for (const line of lines) {
    lineNumber++;
    const trimmed = line.trim();

    // Module-level doc (//! at start of file)
    if (trimmed.startsWith('//! ') && !inBlock) {
      const docText = trimmed.substring(3).trim();
      if (docText) {
        docs.push({
          type: 'module',
          text: docText,
          line: lineNumber
        });
      }
    }
    // Class doc
    else if (trimmed.startsWith('//!class') || trimmed.startsWith('//! Class')) {
      const classMatch = trimmed.match(/(?:class|Class)\s+(\w+)/);
      if (classMatch) {
        if (currentDoc) docs.push(currentDoc);
        currentDoc = {
          type: 'class',
          name: classMatch[1],
          text: '',
          line: lineNumber
        };
        inBlock = true;
      }
    }
    // Method/function doc
    else if (trimmed.startsWith('//! ') && inBlock) {
      const docText = trimmed.substring(3).trim();
      if (docText.startsWith('@param') || docText.startsWith('@returns') || docText.startsWith('@throws')) {
        currentDoc.text += '\n' + docText;
      } else if (docText) {
        currentDoc.text += '\n' + docText;
      }
    }
    // End of doc block
    else if (!trimmed.startsWith('//!') && inBlock) {
      if (currentDoc && currentDoc.text.trim()) {
        docs.push(currentDoc);
      }
      currentDoc = null;
      inBlock = false;
    }
  }

  if (currentDoc && currentDoc.text.trim()) {
    docs.push(currentDoc);
  }

  return docs;
}

// Extract class and function definitions
function extractSymbols(content) {
  const symbols = [];

  // Match class definitions
  const classRegex = /^(?:private\s+)?class\s+(\w+)/gm;
  let match;
  while ((match = classRegex.exec(content)) !== null) {
    symbols.push({ type: 'class', name: match[1], line: content.substring(0, match.index).split('\n').length });
  }

  // Match constant definitions
  const constantRegex = /^(?:private\s+)?constant\s+(\w+)\s*=/gm;
  while ((match = constantRegex.exec(content)) !== null) {
    symbols.push({ type: 'constant', name: match[1], line: content.substring(0, match.index).split('\n').length });
  }

  // Match function definitions
  const funcRegex = /(?:protected|private|public)?\s*(?:static\s*)?(?:void|mapping|int|string|array|mixed|program|object|function|multiset|float)\s+(\w+)\s*\(/gm;
  while ((match = funcRegex.exec(content)) !== null) {
    symbols.push({ type: 'function', name: match[1], line: content.substring(0, match.index).split('\n').length });
  }

  return symbols;
}

// Escape curly braces and angle brackets for MDX compatibility
function escapeForMdx(text) {
  return text
    .replace(/\{/g, '\\{')
    .replace(/\}/g, '\\}')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

// Generate markdown for a Pike file
function generateMarkdown(filename, content) {
  const baseName = filename.replace('.pike', '').replace(/\//g, '-').replace(/\./g, '-');
  const docs = extractAutodoc(content);
  const symbols = extractSymbols(content);

  let md = `---
id: pike-${baseName}
title: ${baseName}
description: API documentation for ${filename}
---

# ${filename}

`;

  // Add module-level docs
  const moduleDocs = docs.filter(d => d.type === 'module');
  if (moduleDocs.length > 0) {
    md += `## Overview\n\n`;
    for (const doc of moduleDocs) {
      md += `${escapeForMdx(doc.text)}\n\n`;
    }
  }

  // Add class documentation
  const classDocs = docs.filter(d => d.type === 'class');
  if (classDocs.length > 0) {
    md += `## Classes\n\n`;
    for (const doc of classDocs) {
      md += `### ${doc.name}\n\n`;
      md += `${escapeForMdx(doc.text)}\n\n`;
    }
  }

  // Add symbol table
  if (symbols.length > 0) {
    md += `## Symbols\n\n`;
    md += `| Symbol | Type | Line |\n`;
    md += `|--------|------|------|\n`;
    for (const sym of symbols) {
      md += `| \`${sym.name}\` | ${sym.type} | ${sym.line} |\n`;
    }
    md += `\n`;
  }

  return md;
}

// Main generator
async function generate() {
  console.log('Generating Pike API docs...');

  // Ensure output directory exists
  if (!existsSync(OUTPUT_DIR)) {
    await mkdir(OUTPUT_DIR, { recursive: true });
  }

  // Get all .pike files recursively
  async function getPikeFiles(dir) {
    const files = [];
    const entries = await readdir(dir, { withFileTypes: true });

    for (const entry of entries) {
      const fullPath = join(dir, entry.name);
      if (entry.isDirectory() && !entry.name.startsWith('.') && entry.name !== 'tests') {
        const subFiles = await getPikeFiles(fullPath);
        files.push(...subFiles);
      } else if (entry.isFile() && entry.name.endsWith('.pike')) {
        files.push(fullPath);
      }
    }

    return files;
  }

  const pikeFiles = await getPikeFiles(PIKE_SCRIPTS_DIR);
  console.log(`Found ${pikeFiles.length} Pike files`);

  for (const filePath of pikeFiles) {
    try {
      const content = await readFile(filePath, 'utf-8');
      const relativePath = relative(PIKE_SCRIPTS_DIR, filePath);
      const md = generateMarkdown(relativePath, content);

      const outFileName = relativePath.replace(/\//g, '-').replace('.pike', '.md');
      const outPath = join(OUTPUT_DIR, outFileName);

      await writeFile(outPath, md);
      console.log(`  Generated: docs/api/pike/${outFileName}`);
    } catch (err) {
      console.error(`  Error processing ${filePath}: ${err.message}`);
    }
  }

  // Generate index
  let index = `---
id: pike-api
title: Pike API
description: Auto-generated API documentation for Pike source files
slug: /api/pike
---

# Pike API

Auto-generated from Pike source files using //! autodoc comments.

`;

  const apiFiles = await readdir(OUTPUT_DIR);
  const pikeApiFiles = apiFiles.filter(f => f.endsWith('.md') && f !== 'index.md');

  index += `## Modules\n\n`;
  for (const f of pikeApiFiles) {
    const title = f.replace('.md', '').replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
    index += `- [${title}](/docs/api/pike/${f.replace('.md', '')})\n`;
  }

  await writeFile(join('./docs/api', 'pike.md'), index);
  console.log('Generated index: docs/api/pike.md');

  console.log('Done!');
}

generate().catch(console.error);
