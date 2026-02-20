/**
 * Development Guide Generator
 *
 * Parses TypeScript JSDoc comments and Pike autodoc comments from source files
 * and generates Docusaurus-compatible markdown.
 */

import { readdir, readFile, writeFile, mkdir } from 'fs/promises';
import { existsSync } from 'fs';
import { join, relative, dirname } from 'path';

const TYPESCRIPT_DIR = './packages/pike-lsp-server/src';
const PIKE_SCRIPTS_DIR = './pike-scripts';
const OUTPUT_DIR = './docs/dev-guide';

// ============================================================================
// TypeScript JSDoc Parsing
// ============================================================================

interface TSDocBlock {
  name: string;
  text: string;
  params: { name: string; text: string }[];
  returns: string;
  type: 'class' | 'function' | 'interface' | 'type' | 'method';
  line: number;
}

function extractJSDoc(content: string): TSDocBlock[] {
  const docs: TSDocBlock[] = [];
  const lines = content.split('\n');

  let currentDoc: TSDocBlock | null = null;
  let inBlock = false;
  let braceCount = 0;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trim();

    // Start of JSDoc block
    if (trimmed.startsWith('/**')) {
      inBlock = true;
      currentDoc = {
        name: '',
        text: '',
        params: [],
        returns: '',
        type: 'function',
        line: i + 1
      };
      continue;
    }

    if (!inBlock || !currentDoc) continue;

    // End of JSDoc block
    if (trimmed === '*/') {
      if (currentDoc.name && currentDoc.text.trim()) {
        docs.push(currentDoc);
      }
      inBlock = false;
      currentDoc = null;
      continue;
    }

    // Parse JSDoc content
    const docLine = trimmed.replace(/^\* ?/, '');

    if (docLine.startsWith('@')) {
      const parts = docLine.slice(1).split(/\s+/);
      const tag = parts[0];

      if (tag === 'param') {
        const paramMatch = docLine.match(/@param\s+\{([^}]+)\}\s+(\w+)\s+(.*)/);
        if (paramMatch) {
          currentDoc.params.push({
            name: paramMatch[2],
            text: paramMatch[3] || ''
          });
        }
      } else if (tag === 'returns' || tag === 'return') {
        const returnMatch = docLine.match(/@returns?\s+\{([^}]+)\}\s*(.*)/);
        if (returnMatch) {
          currentDoc.returns = returnMatch[2];
        }
      } else if (tag === 'name') {
        currentDoc.name = parts[1] || '';
      }
    } else if (docLine.trim() && !currentDoc.name) {
      currentDoc.text += docLine + '\n';
    }
  }

  return docs;
}

function extractTSSymbols(content: string): { name: string; type: string; line: number }[] {
  const symbols: { name: string; type: string; line: number }[] = [];

  // Match class definitions
  const classRegex = /^export\s+class\s+(\w+)/gm;
  let match;
  while ((match = classRegex.exec(content)) !== null) {
    const line = content.substring(0, match.index).split('\n').length;
    symbols.push({ name: match[1], type: 'class', line });
  }

  // Match interface definitions
  const interfaceRegex = /^export\s+interface\s+(\w+)/gm;
  while ((match = interfaceRegex.exec(content)) !== null) {
    const line = content.substring(0, match.index).split('\n').length;
    symbols.push({ name: match[1], type: 'interface', line });
  }

  // Match function exports
  const funcRegex = /^export\s+(?:async\s+)?function\s+(\w+)/gm;
  while ((match = funcRegex.exec(content)) !== null) {
    const line = content.substring(0, match.index).split('\n').length;
    symbols.push({ name: match[1], type: 'function', line });
  }

  // Match type exports
  const typeRegex = /^export\s+type\s+(\w+)/gm;
  while ((match = typeRegex.exec(content)) !== null) {
    const line = content.substring(0, match.index).split('\n').length;
    symbols.push({ name: match[1], type: 'type', line });
  }

  return symbols;
}

// ============================================================================
// Pike Autodoc Parsing
// ============================================================================

interface PikeDocBlock {
  name: string;
  text: string;
  type: 'class' | 'function' | 'method' | 'constant';
  line: number;
}

function extractPikeAutodoc(content: string): PikeDocBlock[] {
  const docs: PikeDocBlock[] = [];
  const lines = content.split('\n');

  let currentDoc: PikeDocBlock | null = null;
  let inBlock = false;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trim();

    // Module-level doc (//! at start of file)
    if (trimmed.startsWith('//! ') && !inBlock && !trimmed.startsWith('//!class')) {
      const docText = trimmed.substring(3).trim();
      if (docText) {
        docs.push({
          name: 'module',
          text: docText,
          type: 'class',
          line: i + 1
        });
      }
    }
    // Class doc
    else if (trimmed.startsWith('//!class') || trimmed.startsWith('//! Class')) {
      const classMatch = trimmed.match(/(?:class|Class)\s+(\w+)/);
      if (classMatch) {
        if (currentDoc && currentDoc.text.trim()) {
          docs.push(currentDoc);
        }
        currentDoc = {
          name: classMatch[1],
          text: '',
          type: 'class',
          line: i + 1
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
    else if (!trimmed.startsWith('//!') && inBlock && trimmed.length > 0) {
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

function extractPikeSymbols(content: string): { name: string; type: string; line: number }[] {
  const symbols: { name: string; type: string; line: number }[] = [];

  // Match class definitions
  const classRegex = /^(?:private\s+)?class\s+(\w+)/gm;
  let match;
  while ((match = classRegex.exec(content)) !== null) {
    const line = content.substring(0, match.index).split('\n').length;
    symbols.push({ name: match[1], type: 'class', line });
  }

  // Match constant definitions
  const constantRegex = /^(?:private\s+)?constant\s+(\w+)\s*=/gm;
  while ((match = constantRegex.exec(content)) !== null) {
    const line = content.substring(0, match.index).split('\n').length;
    symbols.push({ name: match[1], type: 'constant', line });
  }

  // Match function definitions
  const funcRegex = /(?:protected|private|public)?\s*(?:static\s*)?(?:void|mapping|int|string|array|mixed|program|object|function|multiset|float)\s+(\w+)\s*\(/gm;
  while ((match = funcRegex.exec(content)) !== null) {
    const line = content.substring(0, match.index).split('\n').length;
    symbols.push({ name: match[1], type: 'function', line });
  }

  return symbols;
}

// ============================================================================
// Markdown Generation
// ============================================================================

function escapeForMdx(text: string): string {
  return text
    .replace(/\{/g, '\\{')
    .replace(/\}/g, '\\}')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function generateTypeScriptMarkdown(relativePath: string, content: string): string {
  const baseName = relativePath.replace(/\.ts$/, '').replace(/\//g, '-');
  const docs = extractJSDoc(content);
  const symbols = extractTSSymbols(content);

  let md = `---
id: ts-${baseName}
title: ${relativePath}
description: Development guide for ${relativePath}
---

# ${relativePath}

`;

  // Add overview from module-level JSDoc
  const moduleDocs = docs.filter(d => d.type === 'interface' || d.type === 'type');
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

      if (doc.params.length > 0) {
        md += `**Parameters:**\n`;
        for (const param of doc.params) {
          md += `- \`${param.name}\`: ${escapeForMdx(param.text)}\n`;
        }
        md += '\n';
      }

      if (doc.returns) {
        md += `**Returns:** ${escapeForMdx(doc.returns)}\n\n`;
      }
    }
  }

  // Add function documentation
  const funcDocs = docs.filter(d => d.type === 'function');
  if (funcDocs.length > 0) {
    md += `## Functions\n\n`;
    for (const doc of funcDocs) {
      md += `### ${doc.name}\n\n`;
      md += `${escapeForMdx(doc.text)}\n\n`;

      if (doc.params.length > 0) {
        md += `**Parameters:**\n`;
        for (const param of doc.params) {
          md += `- \`${param.name}\`: ${escapeForMdx(param.text)}\n`;
        }
        md += '\n';
      }

      if (doc.returns) {
        md += `**Returns:** ${escapeForMdx(doc.returns)}\n\n`;
      }
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
    md += '\n';
  }

  return md;
}

function generatePikeMarkdown(relativePath: string, content: string): string {
  const baseName = relativePath.replace('.pike', '').replace(/\//g, '-');
  const docs = extractPikeAutodoc(content);
  const symbols = extractPikeSymbols(content);

  let md = `---
id: pike-${baseName}
title: ${relativePath}
description: Development guide for ${relativePath}
---

# ${relativePath}

`;

  // Add module-level docs
  const moduleDocs = docs.filter(d => d.name === 'module');
  if (moduleDocs.length > 0) {
    md += `## Overview\n\n`;
    for (const doc of moduleDocs) {
      md += `${escapeForMdx(doc.text)}\n\n`;
    }
  }

  // Add class documentation
  const classDocs = docs.filter(d => d.type === 'class' && d.name !== 'module');
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
    md += '\n';
  }

  return md;
}

// ============================================================================
// File Discovery
// ============================================================================

async function getTypeScriptFiles(dir: string): Promise<string[]> {
  const files: string[] = [];
  const entries = await readdir(dir, { withFileTypes: true });

  for (const entry of entries) {
    const fullPath = join(dir, entry.name);
    if (entry.isDirectory() && !entry.name.startsWith('.') && !entry.name.includes('test')) {
      const subFiles = await getTypeScriptFiles(fullPath);
      files.push(...subFiles);
    } else if (entry.isFile() && entry.name.endsWith('.ts') && !entry.name.endsWith('.test.ts')) {
      files.push(fullPath);
    }
  }

  return files;
}

async function getPikeFiles(dir: string): Promise<string[]> {
  const files: string[] = [];
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

// ============================================================================
// Main Generator
// ============================================================================

async function generate() {
  console.log('Generating development guide...');

  // Ensure output directories exist
  const tsOutputDir = join(OUTPUT_DIR, 'typescript');
  const pikeOutputDir = join(OUTPUT_DIR, 'pike');

  if (!existsSync(OUTPUT_DIR)) {
    await mkdir(OUTPUT_DIR, { recursive: true });
  }
  if (!existsSync(tsOutputDir)) {
    await mkdir(tsOutputDir, { recursive: true });
  }
  if (!existsSync(pikeOutputDir)) {
    await mkdir(pikeOutputDir, { recursive: true });
  }

  // Generate TypeScript documentation
  console.log('\n--- TypeScript Files ---');
  const tsFiles = await getTypeScriptFiles(TYPESCRIPT_DIR);
  console.log(`Found ${tsFiles.length} TypeScript files`);

  for (const filePath of tsFiles) {
    try {
      const content = await readFile(filePath, 'utf-8');
      const relativePath = relative(TYPESCRIPT_DIR, filePath);
      const md = generateTypeScriptMarkdown(relativePath, content);

      const outFileName = relativePath.replace(/\//g, '-').replace('.ts', '.md');
      const outPath = join(tsOutputDir, outFileName);

      await writeFile(outPath, md);
      console.log(`  Generated: docs/dev-guide/typescript/${outFileName}`);
    } catch (err) {
      console.error(`  Error processing ${filePath}: ${err}`);
    }
  }

  // Generate Pike documentation
  console.log('\n--- Pike Files ---');
  const pikeFiles = await getPikeFiles(PIKE_SCRIPTS_DIR);
  console.log(`Found ${pikeFiles.length} Pike files`);

  for (const filePath of pikeFiles) {
    try {
      const content = await readFile(filePath, 'utf-8');
      const relativePath = relative(PIKE_SCRIPTS_DIR, filePath);
      const md = generatePikeMarkdown(relativePath, content);

      const outFileName = relativePath.replace(/\//g, '-').replace('.pike', '.md');
      const outPath = join(pikeOutputDir, outFileName);

      await writeFile(outPath, md);
      console.log(`  Generated: docs/dev-guide/pike/${outFileName}`);
    } catch (err) {
      console.error(`  Error processing ${filePath}: ${err}`);
    }
  }

  // Generate index
  console.log('\n--- Index ---');
  let index = `---
id: dev-guide
title: Development Guide
description: Auto-generated development guide for Pike LSP
slug: /docs/dev-guide
---

# Development Guide

Auto-generated from TypeScript JSDoc and Pike autodoc comments.

## TypeScript Source

Documentation extracted from \`packages/pike-lsp-server/src/\`:

`;

  const tsApiFiles = await readdir(tsOutputDir);
  const tsMdFiles = tsApiFiles.filter(f => f.endsWith('.md'));

  if (tsMdFiles.length > 0) {
    index += `### Server Features\n\n`;
    for (const f of tsMdFiles) {
      const title = f.replace('.md', '').replace(/-/g, ' / ').replace(/\b\w/g, c => c.toUpperCase());
      index += `- [${title}](/docs/dev-guide/typescript/${f.replace('.md', '')})\n`;
    }
  }

  index += `\n## Pike Source\n\nDocumentation extracted from \`pike-scripts/LSP.pmod/\`:\n\n`;

  const pikeApiFiles = await readdir(pikeOutputDir);
  const pikeMdFiles = pikeApiFiles.filter(f => f.endsWith('.md'));

  if (pikeMdFiles.length > 0) {
    for (const f of pikeMdFiles) {
      const title = f.replace('.md', '').replace(/-/g, ' / ').replace(/\b\w/g, c => c.toUpperCase());
      index += `- [${title}](/docs/dev-guide/pike/${f.replace('.md', '')})\n`;
    }
  }

  await writeFile(join(OUTPUT_DIR, 'index.md'), index);
  console.log('Generated: docs/dev-guide/index.md');

  console.log('\nDone!');
}

generate().catch(console.error);
