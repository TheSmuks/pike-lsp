/**
 * RXML Tag Catalog
 *
 * Comprehensive catalog of RXML tags with metadata for:
 * - Completions (provide tag suggestions)
 * - Diagnostics (validate tag usage)
 * - Hover documentation (show tag info)
 *
 * Based on Roxen's RXML tag reference and source code.
 * Reference: /home/smuks/OpenCode/Roxen/.roxen-knowledge/04-rxml-tag-reference.md
 */

export type RXMLTagType = 'simple' | 'container';

export interface RXMLAttribute {
  name: string;
  type: string;
  required: boolean;
  description: string;
  values?: string[]; // For enum-like attributes
}

export interface RXMLTag {
  name: string;
  type: RXMLTagType;
  description: string;
  attributes: RXMLAttribute[];
  deprecated?: boolean;
}

/**
 * Complete catalog of built-in RXML tags
 */
export const RXML_TAG_CATALOG: RXMLTag[] = [
  // ==================== OUTPUT TAGS ====================
  {
    name: 'echo',
    type: 'simple',
    description: 'Display variable values. Outputs the value of a variable to the page.',
    attributes: [
      { name: 'var', type: 'string', required: true, description: 'Variable to display (e.g., form.username, page.title)' },
      { name: 'encoding', type: 'string', required: false, description: 'Encoding to apply (e.g., html, url, none)', values: ['html', 'url', 'none'] },
      { name: 'default', type: 'string', required: false, description: 'Default value if variable is undefined' },
    ],
  },
  {
    name: 'insert',
    type: 'simple',
    description: 'Insert content from various sources (files, variables, scopes). Can insert file contents, variable values, or scope data.',
    attributes: [
      { name: 'variable', type: 'string', required: false, description: 'Variable path to insert (e.g., config.message, user.name)' },
      { name: 'file', type: 'string', required: false, description: 'Path to file to insert (relative to site root)' },
      { name: 'from', type: 'string', required: false, description: 'Source scope for variable insertion' },
      { name: 'default', type: 'string', required: false, description: 'Default value if variable is undefined' },
      { name: 'htmlencode', type: 'boolean', required: false, description: 'Whether to HTML-encode the output' },
      { name: 'scope', type: 'string', required: false, description: 'Scope to read variable from' },
    ],
  },
  {
    name: 'output',
    type: 'container',
    description: 'Output content with optional processing. Similar to insert but as a container tag.',
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
      { name: 'encoding', type: 'string', required: false, description: 'Type of encoding to apply', values: ['html', 'xml', 'url', 'none'] },
    ],
  },

  // ==================== CONDITIONAL TAGS ====================
  {
    name: 'if',
    type: 'container',
    description: 'Conditional rendering. Displays content only if condition is true.',
    attributes: [
      { name: 'variable', type: 'string', required: false, description: 'Variable to test (e.g., form.show_details)' },
      { name: 'matches', type: 'string', required: false, description: 'Pattern to match against (uses ~ operator)' },
      { name: 'not', type: 'boolean', required: false, description: 'Invert the condition' },
      { name: 'prestate', type: 'string', required: false, description: 'Check for prestate (| for multiple)' },
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
      { name: 'variable', type: 'string', required: true, description: 'Variable name for each item' },
      { name: 'index', type: 'string', required: false, description: 'Variable name for loop index (0-based)' },
      { name: 'in', type: 'string', required: true, description: 'Array to iterate over (e.g., &page.items;)' },
    ],
  },
  {
    name: 'foreach',
    type: 'container',
    description: 'Alternative loop syntax. Iterate over data from emit tags.',
    attributes: [
      { name: 'iterator', type: 'string', required: true, description: 'Iterator variable name from emit' },
    ],
  },

  // ==================== SCOPE TAGS ====================
  {
    name: 'set',
    type: 'simple',
    description: 'Set variables in scopes. Create or modify variables.',
    attributes: [
      { name: 'variable', type: 'string', required: true, description: 'Variable name to set' },
      { name: 'value', type: 'string', required: false, description: 'Value to assign (use content if omitted)' },
      { name: 'scope', type: 'string', required: false, description: 'Target scope (form, page, var, etc.)', values: ['form', 'page', 'var', 'cookie', 'roxen', 'request'] },
      { name: 'from', type: 'string', required: false, description: 'Source scope to copy from' },
    ],
  },
  {
    name: 'let',
    type: 'container',
    description: 'Create temporary variable (local to current scope). Variable is only available inside the container.',
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
      { name: 'variable', type: 'string', required: true, description: 'Variable name to append to' },
      { name: 'value', type: 'string', required: true, description: 'Content to append' },
      { name: 'scope', type: 'string', required: false, description: 'Target scope' },
    ],
  },
  {
    name: 'prepend',
    type: 'simple',
    description: 'Prepend content to a variable. Add text to the beginning of an existing variable.',
    attributes: [
      { name: 'variable', type: 'string', required: true, description: 'Variable name to prepend to' },
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

  // ==================== STRING MANIPULATION ====================
  {
    name: 'replace',
    type: 'container',
    description: 'String replacement. Replace occurrences of a pattern with new text.',
    attributes: [
      { name: 'from', type: 'string', required: true, description: 'Text or pattern to find' },
      { name: 'to', type: 'string', required: true, description: 'Replacement text' },
      { name: 'regex', type: 'boolean', required: false, description: 'Treat "from" as regular expression' },
    ],
  },
  {
    name: 'sprintf',
    type: 'container',
    description: 'Formatted output using sprintf format string.',
    attributes: [
      { name: 'format', type: 'string', required: true, description: 'Format string (e.g., "Hello, %s!")' },
      { name: 'arg', type: 'string', required: false, description: 'Argument value (use multiple arg attributes)' },
    ],
  },
  {
    name: 'strlen',
    type: 'container',
    description: 'String length. Returns the length of the content.',
    attributes: [],
  },
  {
    name: 'uppercase',
    type: 'container',
    description: 'Convert content to uppercase.',
    attributes: [],
  },
  {
    name: 'lowercase',
    type: 'container',
    description: 'Convert content to lowercase.',
    attributes: [],
  },
  {
    name: 'trimlines',
    type: 'container',
    description: 'Trim whitespace from lines in content.',
    attributes: [
      { name: 'left', type: 'boolean', required: false, description: 'Trim left whitespace' },
      { name: 'right', type: 'boolean', required: false, description: 'Trim right whitespace' },
    ],
  },

  // ==================== HEADERS AND META TAGS ====================
  {
    name: 'header',
    type: 'simple',
    description: 'Set HTTP response headers. Add custom headers to the HTTP response.',
    attributes: [
      { name: 'name', type: 'string', required: true, description: 'Header name (e.g., Content-Type)' },
      { name: 'value', type: 'string', required: true, description: 'Header value' },
    ],
  },
  {
    name: 'cache',
    type: 'simple',
    description: 'Control caching behavior. Configure output caching for performance.',
    attributes: [
      { name: 'hours', type: 'number', required: false, description: 'Cache duration in hours' },
      { name: 'minutes', type: 'number', required: false, description: 'Cache duration in minutes' },
      { name: 'seconds', type: 'number', required: false, description: 'Cache duration in seconds' },
      { name: 'no', type: 'boolean', required: false, description: 'Disable caching' },
      { name: 'until', type: 'string', required: false, description: 'Cache until specific date/time' },
      { name: 'vary', type: 'string', required: false, description: 'Cache variation key (e.g., cookie:session)' },
    ],
  },
  {
    name: 'etag',
    type: 'container',
    description: 'Set ETag for cache validation. Content is hashed for entity tag.',
    attributes: [],
  },
  {
    name: 'last-modified',
    type: 'container',
    description: 'Set Last-Modified header. Content is used as timestamp.',
    attributes: [],
  },

  // ==================== INCLUDE AND CONTENT TAGS ====================
  {
    name: 'use',
    type: 'container',
    description: 'Use content from files or packages. Include external RXML packages.',
    attributes: [
      { name: 'package', type: 'string', required: false, description: 'Path to RXML package file' },
      { name: 'container', type: 'string', required: false, description: 'Container name to use' },
      { name: 'file', type: 'string', required: false, description: 'File path to include' },
    ],
  },
  {
    name: 'include',
    type: 'simple',
    description: 'Include file contents directly. Similar to insert file.',
    attributes: [
      { name: 'file', type: 'string', required: true, description: 'Path to file to include' },
    ],
  },
  {
    name: 'config',
    type: 'simple',
    description: 'Insert configuration values.',
    attributes: [],
  },
  {
    name: 'config-name',
    type: 'container',
    description: 'Site configuration name.',
    attributes: [],
  },
  {
    name: 'host',
    type: 'container',
    description: 'Current host name.',
    attributes: [],
  },
  {
    name: 'emit',
    type: 'container',
    description: 'Generate content from various sources. Query databases, list directories, etc.',
    attributes: [
      { name: 'source', type: 'string', required: true, description: 'Data source type', values: ['sql', 'dir', 'custom', 'files', 'users'] },
      { name: 'query', type: 'string', required: false, description: 'SQL query or source-specific query' },
      { name: 'directory', type: 'string', required: false, description: 'Directory path (for dir source)' },
      { name: 'plugin', type: 'string', required: false, description: 'Plugin name (for custom source)' },
      { name: 'sort', type: 'string', required: false, description: 'Sort field or expression' },
      { name: 'order', type: 'string', required: false, description: 'Sort order', values: ['asc', 'desc'] },
    ],
  },

  // ==================== DATE/TIME TAGS ====================
  {
    name: 'date',
    type: 'simple',
    description: 'Display formatted dates. Format and display timestamps.',
    attributes: [
      { name: 'format', type: 'string', required: false, description: 'strftime format string (e.g., "%Y-%m-%d")' },
      { name: 'time', type: 'string', required: false, description: 'Timestamp to format (default: now)' },
      { name: 'type', type: 'string', required: false, description: 'Special date type', values: ['relative', 'weekday', 'month'] },
      { name: 'second', type: 'number', required: false, description: 'Unix timestamp' },
      { name: 'minute', type: 'number', required: false, description: 'Minute value' },
      { name: 'hour', type: 'number', required: false, description: 'Hour value' },
      { name: 'day', type: 'number', required: false, description: 'Day of month' },
      { name: 'month', type: 'number', required: false, description: 'Month number' },
      { name: 'year', type: 'number', required: false, description: 'Year' },
    ],
  },
  {
    name: 'timer',
    type: 'container',
    description: 'Measure execution time. Times the processing of content.',
    attributes: [
      { name: 'name', type: 'string', required: false, description: 'Timer name for display' },
    ],
  },

  // ==================== FORM AND REQUEST TAGS ====================
  {
    name: 'formurl',
    type: 'container',
    description: 'Generate form action URL. Preserves form variables and state.',
    attributes: [],
  },
  {
    name: 'roxen-url',
    type: 'container',
    description: 'Generate Roxen URL. Creates absolute URL to resource.',
    attributes: [],
  },
  {
    name: 'page-url',
    type: 'container',
    description: 'Current page URL.',
    attributes: [],
  },
  {
    name: 'formoutput',
    type: 'container',
    description: 'Generate form fields. Output form input fields preserving values.',
    attributes: [
      { name: 'project', type: 'string', required: false, description: 'Form variables to project' },
    ],
  },
  {
    name: 'input',
    type: 'simple',
    description: 'Form input field.',
    attributes: [
      { name: 'name', type: 'string', required: true, description: 'Field name' },
      { name: 'type', type: 'string', required: false, description: 'Input type', values: ['text', 'password', 'hidden', 'submit', 'checkbox', 'radio'] },
      { name: 'value', type: 'string', required: false, description: 'Field value' },
      { name: 'default', type: 'string', required: false, description: 'Default value' },
    ],
  },
  {
    name: 'crypt',
    type: 'container',
    description: 'Cryptographic hashing. Hash content for passwords.',
    attributes: [
      { name: 'method', type: 'string', required: false, description: 'Hash method', values: ['crypt', 'md5', 'sha1', 'sha256'] },
    ],
  },

  // ==================== REDIRECT TAGS ====================
  {
    name: 'redirect',
    type: 'simple',
    description: 'HTTP redirect. Send redirect response to browser.',
    attributes: [
      { name: 'to', type: 'string', required: true, description: 'Destination URL or path' },
      { name: 'seconds', type: 'number', required: false, description: 'Delay before redirect' },
      { name: 'code', type: 'number', required: false, description: 'HTTP status code', values: ['301', '302', '303', '307', '308'] },
      { name: 'post', type: 'boolean', required: false, description: 'Preserve POST data' },
    ],
  },

  // ==================== TABLIST AND UI TAGS ====================
  {
    name: 'tablist',
    type: 'container',
    description: 'Generate tab navigation. Create clickable tab interface.',
    attributes: [
      { name: 'name', type: 'string', required: true, description: 'Tab list identifier' },
      { name: 'selected', type: 'string', required: false, description: 'Currently selected tab' },
    ],
  },
  {
    name: 'tab',
    type: 'simple',
    description: 'Individual tab in tablist.',
    attributes: [
      { name: 'text', type: 'string', required: true, description: 'Tab label text' },
      { name: 'url', type: 'string', required: true, description: 'Tab link URL' },
      { name: 'selected', type: 'boolean', required: false, description: 'Whether this tab is selected' },
    ],
  },
  {
    name: 'box',
    type: 'container',
    description: 'Styled content box. Display content in a bordered box.',
    attributes: [
      { name: 'title', type: 'string', required: false, description: 'Box title' },
      { name: 'style', type: 'string', required: false, description: 'Box style variant', values: ['info', 'warning', 'error', 'success'] },
    ],
  },
  {
    name: 'obox',
    type: 'simple',
    description: 'Output box variant.',
    attributes: [
      { name: 'title', type: 'string', required: false, description: 'Box title' },
    ],
  },

  // ==================== DATABASE TAGS ====================
  {
    name: 'sqloutput',
    type: 'container',
    description: 'SQL query output container. Deprecated: Use emit source="sql" instead.',
    attributes: [
      { name: 'query', type: 'string', required: true, description: 'SQL query' },
    ],
    deprecated: true,
  },
  {
    name: 'sqltable',
    type: 'container',
    description: 'SQL query to HTML table. Deprecated: Use emit source="sql" instead.',
    attributes: [
      { name: 'query', type: 'string', required: true, description: 'SQL query' },
      { name: 'border', type: 'number', required: false, description: 'Table border width' },
    ],
    deprecated: true,
  },

  // ==================== UTILITIES ====================
  {
    name: 'random',
    type: 'simple',
    description: 'Generate random number.',
    attributes: [
      { name: 'max', type: 'number', required: false, description: 'Maximum value (exclusive)' },
      { name: 'min', type: 'number', required: false, description: 'Minimum value (inclusive)' },
    ],
  },
  {
    name: 'sort',
    type: 'container',
    description: 'Sort content lines.',
    attributes: [
      { name: 'case', type: 'boolean', required: false, description: 'Case-sensitive sort' },
      { name: 'reverse', type: 'boolean', required: false, description: 'Reverse sort order' },
      { name: 'numeric', type: 'boolean', required: false, description: 'Numeric sort' },
    ],
  },
  {
    name: 'tablify',
    type: 'container',
    description: 'Convert tab-separated data to HTML table.',
    attributes: [
      { name: 'border', type: 'number', required: false, description: 'Table border width' },
      { name: 'cellpadding', type: 'number', required: false, description: 'Cell padding' },
      { name: 'cellspacing', type: 'number', required: false, description: 'Cell spacing' },
    ],
  },
  {
    name: 'aconf',
    type: 'simple',
    description: 'Access configuration value from Roxen config interface.',
    attributes: [
      { name: 'query', type: 'string', required: true, description: 'Configuration variable path' },
    ],
  },
  {
    name: 'fsize',
    type: 'simple',
    description: 'File size. Display human-readable file size.',
    attributes: [
      { name: 'file', type: 'string', required: true, description: 'Path to file' },
    ],
  },
  {
    name: 'page-size',
    type: 'simple',
    description: 'Page size in bytes.',
    attributes: [],
  },
  {
    name: 'page-size-flags',
    type: 'simple',
    description: 'Page size with flags information.',
    attributes: [],
  },
  {
    name: 'printenv',
    type: 'simple',
    description: 'Print all variables in a scope. Debugging tool.',
    attributes: [
      { name: 'scope', type: 'string', required: false, description: 'Scope to print', values: ['form', 'cookie', 'roxen', 'page', 'var', 'request'] },
    ],
  },
  {
    name: 'smallcaps',
    type: 'container',
    description: 'Convert content to small caps.',
    attributes: [],
  },
  {
    name: 'exec',
    type: 'simple',
    description: 'Execute shell command. WARNING: Security risk if used with user input.',
    attributes: [
      { name: 'cmd', type: 'string', required: true, description: 'Command to execute' },
      { name: 'parse', type: 'boolean', required: false, description: 'Parse output as RXML' },
    ],
  },

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
      { name: 'variable', type: 'string', required: false, description: 'Variable to store error message' },
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
    attributes: [
      { name: 'command', type: 'string', required: true, description: 'Sed command' },
    ],
  },
  {
    name: 'cvar',
    type: 'container',
    description: 'Complex variable operations. Advanced variable manipulation.',
    attributes: [
      { name: 'name', type: 'string', required: true, description: 'Variable name' },
      { name: 'operation', type: 'string', required: true, description: 'Operation to perform', values: ['set', 'get', 'delete', 'exists'] },
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
      { name: 'align', type: 'string', required: false, description: 'Alignment', values: ['left', 'right', 'center', 'top', 'middle', 'bottom'] },
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
      { name: 'align', type: 'string', required: false, description: 'Text alignment', values: ['left', 'center', 'right'] },
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
      { name: 'sort', type: 'string', required: false, description: 'Sort field', values: ['name', 'size', 'mtime'] },
      { name: 'order', type: 'string', required: false, description: 'Sort order', values: ['asc', 'desc'] },
    ],
  },

  // ==================== DEFINE AND MACRO TAGS ====================
  {
    name: 'define',
    type: 'container',
    description: 'Define RXML macro or container. Create reusable content blocks.',
    attributes: [
      { name: 'name', type: 'string', required: true, description: 'Macro/container name' },
      { name: 'parameter', type: 'string', required: false, description: 'Parameter names (comma-separated)' },
      { name: 'container', type: 'boolean', required: false, description: 'Define as container vs macro' },
    ],
  },

  // ==================== CLIENT CAPABILITY TAGS ====================
  {
    name: 'client',
    type: 'container',
    description: 'Client capability checks. Test browser features.',
    attributes: [
      { name: 'supports', type: 'string', required: true, description: 'Feature to test', values: ['frames', 'tables', 'javascript', 'css', 'ssl'] },
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
      { name: 'lifetime', type: 'string', required: false, description: 'Cookie lifetime (e.g., "1 day", "1 year")' },
      { name: 'path', type: 'string', required: false, description: 'Cookie path (default: /)' },
      { name: 'domain', type: 'string', required: false, description: 'Cookie domain' },
      { name: 'secure', type: 'boolean', required: false, description: 'HTTPS-only cookie' },
      { name: 'httponly', type: 'boolean', required: false, description: 'HTTP-only cookie (no JS access)' },
    ],
  },

  // ==================== PRESTATE TAGS ====================
  {
    name: 'prestate',
    type: 'container',
    description: 'Check for prestate. Conditionally show content based on URL prestate.',
    attributes: [
      { name: 'name', type: 'string', required: true, description: 'Prestate name' },
    ],
  },
];

/**
 * Map of tag names to tag info for O(1) lookup
 */
const TAG_INFO_MAP = new Map<string, RXMLTag>();

// Build case-insensitive lookup map
for (const tag of RXML_TAG_CATALOG) {
  TAG_INFO_MAP.set(tag.name.toLowerCase(), tag);
}

/**
 * Get tag information by name (case-insensitive)
 *
 * @param tagName - Tag name to look up
 * @returns Tag info or undefined if not found
 *
 * @example
 * ```ts
 * const ifTag = getTagInfo('if');
 * // Returns: { name: 'if', type: 'container', ... }
 *
 * const uppercase = getTagInfo('IF');
 * // Same result (case-insensitive)
 *
 * const unknown = getTagInfo('nonexistent');
 * // Returns: undefined
 * ```
 */
export function getTagInfo(tagName: string): RXMLTag | undefined {
  return TAG_INFO_MAP.get(tagName.toLowerCase());
}

/**
 * Get all tags of a specific type
 *
 * @param type - Tag type to filter by
 * @returns Array of tags matching the type
 *
 * @example
 * ```ts
 * const containers = getTagsByType('container');
 * const simpleTags = getTagsByType('simple');
 * ```
 */
export function getTagsByType(type: RXMLTagType): RXMLTag[] {
  return RXML_TAG_CATALOG.filter(tag => tag.type === type);
}

/**
 * Search tags by name or description
 *
 * @param query - Search query
 * @returns Array of matching tags
 *
 * @example
 * ```ts
 * const sqlTags = searchTags('sql');
 * const cacheTags = searchTags('cache');
 * ```
 */
export function searchTags(query: string): RXMLTag[] {
  const lowerQuery = query.toLowerCase();
  return RXML_TAG_CATALOG.filter(tag =>
    tag.name.includes(lowerQuery) ||
    tag.description.toLowerCase().includes(lowerQuery)
  );
}

/**
 * Get deprecated tags
 *
 * @returns Array of deprecated tags
 */
export function getDeprecatedTags(): RXMLTag[] {
  return RXML_TAG_CATALOG.filter(tag => tag.deprecated);
}

/**
 * Common scope variables for attribute value completion
 * These are the built-in RXML scopes available for variable access
 */
export const SCOPE_VARIABLES = [
  'form',
  'variables',
  'page',
  'request',
  'session',
  'cookies',
  'client',
  'config',
  'roxen',
  'site',
  'user',
  'var',
] as const;

/**
 * Legacy compatibility functions
 * @deprecated Use getTagInfo() instead
 */
export function hasTag(tagName: string): boolean {
  return getTagInfo(tagName) !== undefined;
}

/**
 * Get all tag names
 * @returns Array of all tag names
 */
export function getAllTagNames(): string[] {
  return RXML_TAG_CATALOG.map(tag => tag.name);
}
