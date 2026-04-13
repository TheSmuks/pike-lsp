/**
 * RXML Tag Catalog - Content, HTTP, Include, Form, and Utility tags
 *
 * Tags: replace, sprintf, strlen, uppercase, lowercase, trimlines, header, cache,
 *       etag, last-modified, use, include, config, config-name, host, emit, date,
 *       timer, formurl, roxen-url, page-url, formoutput, input, crypt, redirect,
 *       tablist, tab, box, obox, sqloutput, sqltable, random, sort, tablify,
 *       aconf, fsize, page-size, page-size-flags, printenv, smallcaps, exec
 */
import type { RXMLTag } from './tag-catalog-types';

export const CONTENT_AND_UTILITY_TAGS: RXMLTag[] = [
  // ==================== STRING MANIPULATION ====================
  {
    name: 'replace',
    type: 'container',
    description: 'String replacement. Replace occurrences of a pattern with new text.',
    attributes: [
      { name: 'from', type: 'string', required: true, description: 'Text or pattern to find' },
      { name: 'to', type: 'string', required: true, description: 'Replacement text' },
      {
        name: 'regex',
        type: 'boolean',
        required: false,
        description: 'Treat "from" as regular expression',
      },
    ],
  },
  {
    name: 'sprintf',
    type: 'container',
    description: 'Formatted output using sprintf format string.',
    attributes: [
      {
        name: 'format',
        type: 'string',
        required: true,
        description: 'Format string (e.g., "Hello, %s!")',
      },
      {
        name: 'arg',
        type: 'string',
        required: false,
        description: 'Argument value (use multiple arg attributes)',
      },
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
      {
        name: 'name',
        type: 'string',
        required: true,
        description: 'Header name (e.g., Content-Type)',
      },
      { name: 'value', type: 'string', required: true, description: 'Header value' },
    ],
  },
  {
    name: 'cache',
    type: 'simple',
    description: 'Control caching behavior. Configure output caching for performance.',
    attributes: [
      { name: 'hours', type: 'number', required: false, description: 'Cache duration in hours' },
      {
        name: 'minutes',
        type: 'number',
        required: false,
        description: 'Cache duration in minutes',
      },
      {
        name: 'seconds',
        type: 'number',
        required: false,
        description: 'Cache duration in seconds',
      },
      { name: 'no', type: 'boolean', required: false, description: 'Disable caching' },
      {
        name: 'until',
        type: 'string',
        required: false,
        description: 'Cache until specific date/time',
      },
      {
        name: 'vary',
        type: 'string',
        required: false,
        description: 'Cache variation key (e.g., cookie:session)',
      },
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
      {
        name: 'package',
        type: 'string',
        required: false,
        description: 'Path to RXML package file',
      },
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
      {
        name: 'source',
        type: 'string',
        required: true,
        description: 'Data source type',
        values: ['sql', 'dir', 'custom', 'files', 'users'],
      },
      {
        name: 'query',
        type: 'string',
        required: false,
        description: 'SQL query or source-specific query',
      },
      {
        name: 'directory',
        type: 'string',
        required: false,
        description: 'Directory path (for dir source)',
      },
      {
        name: 'plugin',
        type: 'string',
        required: false,
        description: 'Plugin name (for custom source)',
      },
      { name: 'sort', type: 'string', required: false, description: 'Sort field or expression' },
      {
        name: 'order',
        type: 'string',
        required: false,
        description: 'Sort order',
        values: ['asc', 'desc'],
      },
    ],
  },

  // ==================== DATE/TIME TAGS ====================
  {
    name: 'date',
    type: 'simple',
    description: 'Display formatted dates. Format and display timestamps.',
    attributes: [
      {
        name: 'format',
        type: 'string',
        required: false,
        description: 'strftime format string (e.g., "%Y-%m-%d")',
      },
      {
        name: 'time',
        type: 'string',
        required: false,
        description: 'Timestamp to format (default: now)',
      },
      {
        name: 'type',
        type: 'string',
        required: false,
        description: 'Special date type',
        values: ['relative', 'weekday', 'month'],
      },
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
      {
        name: 'project',
        type: 'string',
        required: false,
        description: 'Form variables to project',
      },
    ],
  },
  {
    name: 'input',
    type: 'simple',
    description: 'Form input field.',
    attributes: [
      { name: 'name', type: 'string', required: true, description: 'Field name' },
      {
        name: 'type',
        type: 'string',
        required: false,
        description: 'Input type',
        values: ['text', 'password', 'hidden', 'submit', 'checkbox', 'radio'],
      },
      { name: 'value', type: 'string', required: false, description: 'Field value' },
      { name: 'default', type: 'string', required: false, description: 'Default value' },
    ],
  },
  {
    name: 'crypt',
    type: 'container',
    description: 'Cryptographic hashing. Hash content for passwords.',
    attributes: [
      {
        name: 'method',
        type: 'string',
        required: false,
        description: 'Hash method',
        values: ['crypt', 'md5', 'sha1', 'sha256'],
      },
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
      {
        name: 'code',
        type: 'number',
        required: false,
        description: 'HTTP status code',
        values: ['301', '302', '303', '307', '308'],
      },
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
      {
        name: 'selected',
        type: 'boolean',
        required: false,
        description: 'Whether this tab is selected',
      },
    ],
  },
  {
    name: 'box',
    type: 'container',
    description: 'Styled content box. Display content in a bordered box.',
    attributes: [
      { name: 'title', type: 'string', required: false, description: 'Box title' },
      {
        name: 'style',
        type: 'string',
        required: false,
        description: 'Box style variant',
        values: ['info', 'warning', 'error', 'success'],
      },
    ],
  },
  {
    name: 'obox',
    type: 'simple',
    description: 'Output box variant.',
    attributes: [{ name: 'title', type: 'string', required: false, description: 'Box title' }],
  },

  // ==================== DATABASE TAGS ====================
  {
    name: 'sqloutput',
    type: 'container',
    description: 'SQL query output container. Deprecated: Use emit source="sql" instead.',
    attributes: [{ name: 'query', type: 'string', required: true, description: 'SQL query' }],
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
    attributes: [{ name: 'file', type: 'string', required: true, description: 'Path to file' }],
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
      {
        name: 'scope',
        type: 'string',
        required: false,
        description: 'Scope to print',
        values: ['form', 'cookie', 'roxen', 'page', 'var', 'request'],
      },
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
];
