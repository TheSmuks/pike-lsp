/**
 * RXML Tag Catalog - Output, Conditional, Loop, and Scope tags
 *
 * Tags: echo, insert, output, quote, if, elseif, else, then, switch, case,
 *       default, for, foreach, set, let, append, prepend, apre
 */
import type { RXMLTag } from './tag-catalog-types';

export const OUTPUT_AND_CONTROL_TAGS: RXMLTag[] = [
  // ==================== OUTPUT TAGS ====================
  {
    name: 'echo',
    type: 'simple',
    description: 'Display variable values. Outputs the value of a variable to the page.',
    attributes: [
      {
        name: 'var',
        type: 'string',
        required: true,
        description: 'Variable to display (e.g., form.username, page.title)',
      },
      {
        name: 'encoding',
        type: 'string',
        required: false,
        description: 'Encoding to apply (e.g., html, url, none)',
        values: ['html', 'url', 'none'],
      },
      {
        name: 'default',
        type: 'string',
        required: false,
        description: 'Default value if variable is undefined',
      },
    ],
  },
  {
    name: 'insert',
    type: 'simple',
    description:
      'Insert content from various sources (files, variables, scopes). Can insert file contents, variable values, or scope data.',
    attributes: [
      {
        name: 'variable',
        type: 'string',
        required: false,
        description: 'Variable path to insert (e.g., config.message, user.name)',
      },
      {
        name: 'file',
        type: 'string',
        required: false,
        description: 'Path to file to insert (relative to site root)',
      },
      {
        name: 'from',
        type: 'string',
        required: false,
        description: 'Source scope for variable insertion',
      },
      {
        name: 'default',
        type: 'string',
        required: false,
        description: 'Default value if variable is undefined',
      },
      {
        name: 'htmlencode',
        type: 'boolean',
        required: false,
        description: 'Whether to HTML-encode the output',
      },
      {
        name: 'scope',
        type: 'string',
        required: false,
        description: 'Scope to read variable from',
      },
    ],
  },
  {
    name: 'output',
    type: 'container',
    description:
      'Output content with optional processing. Similar to insert but as a container tag.',
    attributes: [
      { name: 'variable', type: 'string', required: false, description: 'Variable to output' },
      { name: 'format', type: 'string', required: false, description: 'Format string for output' },
    ],
  },
  {
    name: 'quote',
    type: 'container',
    description: 'XML-escape content to prevent XSS. Converts special characters to HTML entities.',
    attributes: [
      {
        name: 'encoding',
        type: 'string',
        required: false,
        description: 'Type of encoding to apply',
        values: ['html', 'xml', 'url', 'none'],
      },
    ],
  },

  // ==================== CONDITIONAL TAGS ====================
  {
    name: 'if',
    type: 'container',
    description: 'Conditional rendering. Displays content only if condition is true.',
    attributes: [
      {
        name: 'variable',
        type: 'string',
        required: false,
        description: 'Variable to test (e.g., form.show_details)',
      },
      {
        name: 'matches',
        type: 'string',
        required: false,
        description: 'Pattern to match against (uses ~ operator)',
      },
      { name: 'not', type: 'boolean', required: false, description: 'Invert the condition' },
      {
        name: 'prestate',
        type: 'string',
        required: false,
        description: 'Check for prestate (| for multiple)',
      },
      { name: 'expr', type: 'string', required: false, description: 'Expression to evaluate' },
    ],
  },
  {
    name: 'elseif',
    type: 'simple',
    description: 'Else-if condition. Used after <if> for multiple conditions.',
    attributes: [
      { name: 'variable', type: 'string', required: false, description: 'Variable to test' },
      { name: 'matches', type: 'string', required: false, description: 'Pattern to match' },
      { name: 'not', type: 'boolean', required: false, description: 'Invert the condition' },
      { name: 'expr', type: 'string', required: false, description: 'Expression to evaluate' },
    ],
  },
  {
    name: 'else',
    type: 'simple',
    description: 'Default case for conditional. Shows content when no if/elseif matches.',
    attributes: [],
  },
  {
    name: 'then',
    type: 'simple',
    description: 'Explicit then clause for if statements.',
    attributes: [],
  },
  {
    name: 'switch',
    type: 'container',
    description: 'Multi-way branching. Switch on a variable value.',
    attributes: [
      { name: 'variable', type: 'string', required: true, description: 'Variable to switch on' },
    ],
  },
  {
    name: 'case',
    type: 'container',
    description: 'Case option within switch. Matches a specific value.',
    attributes: [
      { name: 'value', type: 'string', required: true, description: 'Value to match' },
      { name: 'matches', type: 'string', required: false, description: 'Pattern to match' },
    ],
  },
  {
    name: 'default',
    type: 'container',
    description: 'Default case within switch. Matches when no case matches.',
    attributes: [],
  },

  // ==================== LOOP TAGS ====================
  {
    name: 'for',
    type: 'container',
    description: 'Iterate over arrays. Loop through each item in an array.',
    attributes: [
      {
        name: 'variable',
        type: 'string',
        required: true,
        description: 'Variable name for each item',
      },
      {
        name: 'index',
        type: 'string',
        required: false,
        description: 'Variable name for loop index (0-based)',
      },
      {
        name: 'in',
        type: 'string',
        required: true,
        description: 'Array to iterate over (e.g., &page.items;)',
      },
    ],
  },
  {
    name: 'foreach',
    type: 'container',
    description: 'Alternative loop syntax. Iterate over data from emit tags.',
    attributes: [
      {
        name: 'iterator',
        type: 'string',
        required: true,
        description: 'Iterator variable name from emit',
      },
    ],
  },

  // ==================== SCOPE TAGS ====================
  {
    name: 'set',
    type: 'simple',
    description: 'Set variables in scopes. Create or modify variables.',
    attributes: [
      { name: 'variable', type: 'string', required: true, description: 'Variable name to set' },
      {
        name: 'value',
        type: 'string',
        required: false,
        description: 'Value to assign (use content if omitted)',
      },
      {
        name: 'scope',
        type: 'string',
        required: false,
        description: 'Target scope (form, page, var, etc.)',
        values: ['form', 'page', 'var', 'cookie', 'roxen', 'request'],
      },
      { name: 'from', type: 'string', required: false, description: 'Source scope to copy from' },
    ],
  },
  {
    name: 'let',
    type: 'container',
    description:
      'Create temporary variable (local to current scope). Variable is only available inside the container.',
    attributes: [
      { name: 'variable', type: 'string', required: true, description: 'Variable name to define' },
      { name: 'value', type: 'string', required: false, description: 'Value to assign' },
    ],
  },
  {
    name: 'append',
    type: 'simple',
    description: 'Append content to a variable. Add text to the end of an existing variable.',
    attributes: [
      {
        name: 'variable',
        type: 'string',
        required: true,
        description: 'Variable name to append to',
      },
      { name: 'value', type: 'string', required: true, description: 'Content to append' },
      { name: 'scope', type: 'string', required: false, description: 'Target scope' },
    ],
  },
  {
    name: 'prepend',
    type: 'simple',
    description:
      'Prepend content to a variable. Add text to the beginning of an existing variable.',
    attributes: [
      {
        name: 'variable',
        type: 'string',
        required: true,
        description: 'Variable name to prepend to',
      },
      { name: 'value', type: 'string', required: true, description: 'Content to prepend' },
      { name: 'scope', type: 'string', required: false, description: 'Target scope' },
    ],
  },
  {
    name: 'apre',
    type: 'simple',
    description: 'Append/prepend shorthand. Combines append and prepend operations.',
    attributes: [
      { name: 'variable', type: 'string', required: true, description: 'Variable name to modify' },
      { name: 'append', type: 'string', required: false, description: 'Content to append' },
      { name: 'prepend', type: 'string', required: false, description: 'Content to prepend' },
      { name: 'scope', type: 'string', required: false, description: 'Target scope' },
      { name: 'state', type: 'string', required: false, description: 'State to embed in URLs' },
    ],
  },
];
