/**
 * RXML Tag Catalog - Advanced, Image, File, Macro, Client, Cookie, and Prestate tags
 *
 * Tags: roxen, catch, throw, warn, error, notice, sed, cvar, callers, awizard,
 *       dbutton, recursive-output, aimg, gtext, dir, define, client, cookie,
 *       prestate
 */
import type { RXMLTag } from './tag-catalog-types';

export const ADVANCED_AND_MISC_TAGS: RXMLTag[] = [
  // ==================== ADVANCED TAGS ====================
  {
    name: 'roxen',
    type: 'container',
    description: 'Roxen-specific container. Server-level operations and configuration.',
    attributes: [
      { name: 'charset', type: 'string', required: false, description: 'Character set' },
    ],
  },
  {
    name: 'catch',
    type: 'container',
    description: 'Catch and handle errors. Prevents RXML errors from stopping page rendering.',
    attributes: [
      {
        name: 'variable',
        type: 'string',
        required: false,
        description: 'Variable to store error message',
      },
    ],
  },
  {
    name: 'throw',
    type: 'simple',
    description: 'Throw an RXML error.',
    attributes: [
      { name: 'message', type: 'string', required: true, description: 'Error message' },
      { name: 'type', type: 'string', required: false, description: 'Error type' },
    ],
  },
  {
    name: 'warn',
    type: 'container',
    description: 'Display warning message. Output styled warning box.',
    attributes: [],
  },
  {
    name: 'error',
    type: 'container',
    description: 'Display error message. Output styled error box.',
    attributes: [],
  },
  {
    name: 'notice',
    type: 'container',
    description: 'Display notice message. Output styled notice box.',
    attributes: [],
  },
  {
    name: 'sed',
    type: 'container',
    description: 'Stream editor. Transform content using sed-like expressions.',
    attributes: [{ name: 'command', type: 'string', required: true, description: 'Sed command' }],
  },
  {
    name: 'cvar',
    type: 'container',
    description: 'Complex variable operations. Advanced variable manipulation.',
    attributes: [
      { name: 'name', type: 'string', required: true, description: 'Variable name' },
      {
        name: 'operation',
        type: 'string',
        required: true,
        description: 'Operation to perform',
        values: ['set', 'get', 'delete', 'exists'],
      },
    ],
  },
  {
    name: 'callers',
    type: 'container',
    description: 'Display caller information. Debugging tool for RXML call stack.',
    attributes: [],
  },
  {
    name: 'awizard',
    type: 'container',
    description: 'Admin wizard container. Used in Roxen admin interface.',
    attributes: [],
  },
  {
    name: 'dbutton',
    type: 'container',
    description: 'Default button. Form button element.',
    attributes: [
      { name: 'action', type: 'string', required: false, description: 'Form action URL' },
    ],
  },
  {
    name: 'recursive-output',
    type: 'container',
    description: 'Output with recursive RXML parsing.',
    attributes: [],
  },

  // ==================== IMAGE TAGS ====================
  {
    name: 'aimg',
    type: 'simple',
    description: 'Automated image tag. Generate img tag with calculated dimensions.',
    attributes: [
      { name: 'src', type: 'string', required: true, description: 'Image source path' },
      { name: 'alt', type: 'string', required: false, description: 'Alternative text' },
      { name: 'width', type: 'number', required: false, description: 'Display width' },
      { name: 'height', type: 'number', required: false, description: 'Display height' },
      {
        name: 'align',
        type: 'string',
        required: false,
        description: 'Alignment',
        values: ['left', 'right', 'center', 'top', 'middle', 'bottom'],
      },
      { name: 'border', type: 'number', required: false, description: 'Border width' },
    ],
  },
  {
    name: 'gtext',
    type: 'container',
    description: 'Graphical text. Render text as image using server fonts.',
    attributes: [
      { name: 'fgcolor', type: 'string', required: false, description: 'Foreground color (hex)' },
      { name: 'bgcolor', type: 'string', required: false, description: 'Background color (hex)' },
      { name: 'font', type: 'string', required: false, description: 'Font name or path' },
      { name: 'size', type: 'number', required: false, description: 'Font size in pixels' },
      { name: 'bold', type: 'boolean', required: false, description: 'Bold text' },
      { name: 'italic', type: 'boolean', required: false, description: 'Italic text' },
      {
        name: 'align',
        type: 'string',
        required: false,
        description: 'Text alignment',
        values: ['left', 'center', 'right'],
      },
      { name: 'border', type: 'number', required: false, description: 'Border width' },
      { name: 'spacing', type: 'number', required: false, description: 'Letter spacing' },
      { name: 'href', type: 'string', required: false, description: 'Link URL' },
      { name: 'alt', type: 'string', required: false, description: 'Alternative text' },
    ],
  },

  // ==================== DIRECTORY AND FILE TAGS ====================
  {
    name: 'dir',
    type: 'container',
    description: 'Directory listing. List files in a directory.',
    attributes: [
      { name: 'directory', type: 'string', required: true, description: 'Directory path' },
      { name: 'pattern', type: 'string', required: false, description: 'File glob pattern' },
      {
        name: 'sort',
        type: 'string',
        required: false,
        description: 'Sort field',
        values: ['name', 'size', 'mtime'],
      },
      {
        name: 'order',
        type: 'string',
        required: false,
        description: 'Sort order',
        values: ['asc', 'desc'],
      },
    ],
  },

  // ==================== DEFINE AND MACRO TAGS ====================
  {
    name: 'define',
    type: 'container',
    description: 'Define RXML macro or container. Create reusable content blocks.',
    attributes: [
      { name: 'name', type: 'string', required: true, description: 'Macro/container name' },
      {
        name: 'parameter',
        type: 'string',
        required: false,
        description: 'Parameter names (comma-separated)',
      },
      {
        name: 'container',
        type: 'boolean',
        required: false,
        description: 'Define as container vs macro',
      },
    ],
  },

  // ==================== CLIENT CAPABILITY TAGS ====================
  {
    name: 'client',
    type: 'container',
    description: 'Client capability checks. Test browser features.',
    attributes: [
      {
        name: 'supports',
        type: 'string',
        required: true,
        description: 'Feature to test',
        values: ['frames', 'tables', 'javascript', 'css', 'ssl'],
      },
    ],
  },

  // ==================== COOKIE TAGS ====================
  {
    name: 'cookie',
    type: 'simple',
    description: 'Set cookie value.',
    attributes: [
      { name: 'name', type: 'string', required: true, description: 'Cookie name' },
      { name: 'value', type: 'string', required: true, description: 'Cookie value' },
      {
        name: 'lifetime',
        type: 'string',
        required: false,
        description: 'Cookie lifetime (e.g., "1 day", "1 year")',
      },
      { name: 'path', type: 'string', required: false, description: 'Cookie path (default: /)' },
      { name: 'domain', type: 'string', required: false, description: 'Cookie domain' },
      { name: 'secure', type: 'boolean', required: false, description: 'HTTPS-only cookie' },
      {
        name: 'httponly',
        type: 'boolean',
        required: false,
        description: 'HTTP-only cookie (no JS access)',
      },
    ],
  },

  // ==================== PRESTATE TAGS ====================
  {
    name: 'prestate',
    type: 'container',
    description: 'Check for prestate. Conditionally show content based on URL prestate.',
    attributes: [{ name: 'name', type: 'string', required: true, description: 'Prestate name' }],
  },
];
