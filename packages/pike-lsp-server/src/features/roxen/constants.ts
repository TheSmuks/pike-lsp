/**
 * Roxen module constants - Source-verified from Roxen headers
 * All values match bit positions defined in Roxen's module.h
 */

// Module type flags (bit positions 0-31)
export const MODULE_ZERO = 0;
export const MODULE_EXTENSION = 1 << 0;                  // 1  - File extension module
export const MODULE_LOCATION = 1 << 1;                   // 2  - Location module
export const MODULE_URL = 1 << 2;                        // 4  - URL module
export const MODULE_FILE_EXTENSION = 1 << 3;             // 8  - File extension handler
export const MODULE_TAG = 1 << 4;                        // 16 - Tag module
export const MODULE_PARSER = 1 << 4;                     // 16 - Alias for MODULE_TAG
export const MODULE_LAST = 1 << 5;                       // 32 - Last module
export const MODULE_FIRST = 1 << 6;                      // 64 - First module
export const MODULE_AUTH = 1 << 7;                       // 128 - Authentication module
export const MODULE_MAIN_PARSER = 1 << 8;                // 256 - Main parser
export const MODULE_TYPES = 1 << 9;                      // 512 - Types module
export const MODULE_DIRECTORIES = 1 << 10;               // 1024 - Directories module
export const MODULE_PROXY = 1 << 11;                     // 2048 - Proxy module
export const MODULE_LOGGER = 1 << 12;                    // 4096 - Logger module
export const MODULE_FILTER = 1 << 13;                    // 8192 - Filter module
export const MODULE_PROVIDER = 1 << 15;                  // 32768 - Provider module
export const MODULE_USERDB = 1 << 16;                    // 65536 - User database module
export const MODULE_DEPRECATED = 1 << 27;                // Deprecated module flag
export const MODULE_PROTOCOL = 1 << 28;                  // Protocol module
export const MODULE_CONFIG = 1 << 29;                    // Config module
export const MODULE_SECURITY = 1 << 30;                  // Security module
export const MODULE_EXPERIMENTAL = 1 << 31;              // Experimental module
export const MODULE_TYPE_MASK = (1 << 27) - 1;           // Lower 27 bits for module type

// Variable type constants (Roxen variable types)
export const TYPE_STRING = 1;                            // String variable
export const TYPE_FILE = 2;                              // File path variable
export const TYPE_INT = 3;                               // Integer variable
export const TYPE_DIR = 4;                               // Directory path variable
export const TYPE_STRING_LIST = 5;                       // String array variable
export const TYPE_MULTIPLE_STRING = 5;                   // Alias for TYPE_STRING_LIST
export const TYPE_INT_LIST = 6;                          // Integer array variable
export const TYPE_MULTIPLE_INT = 6;                      // Alias for TYPE_INT_LIST
export const TYPE_FLAG = 7;                              // Boolean flag variable
export const TYPE_TOGGLE = 7;                            // Alias for TYPE_FLAG
export const TYPE_DIR_LIST = 9;                          // Directory array variable
export const TYPE_FILE_LIST = 10;                        // File array variable
export const TYPE_LOCATION = 11;                         // Location specifier
export const TYPE_TEXT_FIELD = 13;                       // Text field (multiline)
export const TYPE_TEXT = 13;                             // Alias for TYPE_TEXT_FIELD
export const TYPE_PASSWORD = 14;                         // Password field
export const TYPE_FLOAT = 15;                            // Floating point number
export const TYPE_MODULE = 17;                           // Module reference
export const TYPE_FONT = 19;                             // Font selector
export const TYPE_CUSTOM = 20;                           // Custom type
export const TYPE_URL = 21;                              // URL variable
export const TYPE_URL_LIST = 22;                         // URL array variable

// Variable flag masks (bit positions 8-15)
export const VAR_TYPE_MASK = 0xff;                       // Lower 8 bits for type
export const VAR_EXPERT = 1 << 8;                        // Expert-only variable
export const VAR_MORE = 1 << 9;                          // "More" section variable
export const VAR_DEVELOPER = 1 << 10;                    // Developer-only variable
export const VAR_INITIAL = 1 << 11;                      // Initial configuration variable
export const VAR_NOT_CFIF = 1 << 12;                     // Not in CFIF
export const VAR_INVISIBLE = 1 << 13;                    // Invisible variable
export const VAR_PUBLIC = 1 << 14;                       // Public variable
export const VAR_NO_DEFAULT = 1 << 15;                   // No default value

// Module type constant metadata for completions
export const MODULE_CONSTANTS: Record<string, { value: number; description: string }> = {
    MODULE_ZERO: { value: MODULE_ZERO, description: 'Zero/undefined module type' },
    MODULE_EXTENSION: { value: MODULE_EXTENSION, description: 'File extension module' },
    MODULE_LOCATION: { value: MODULE_LOCATION, description: 'Location module' },
    MODULE_URL: { value: MODULE_URL, description: 'URL module' },
    MODULE_FILE_EXTENSION: { value: MODULE_FILE_EXTENSION, description: 'File extension handler' },
    MODULE_TAG: { value: MODULE_TAG, description: 'RXML tag module' },
    MODULE_PARSER: { value: MODULE_PARSER, description: 'Content parser (alias for MODULE_TAG)' },
    MODULE_LAST: { value: MODULE_LAST, description: 'Last module' },
    MODULE_FIRST: { value: MODULE_FIRST, description: 'First module' },
    MODULE_AUTH: { value: MODULE_AUTH, description: 'Authentication module' },
    MODULE_MAIN_PARSER: { value: MODULE_MAIN_PARSER, description: 'Main parser' },
    MODULE_TYPES: { value: MODULE_TYPES, description: 'Types module' },
    MODULE_DIRECTORIES: { value: MODULE_DIRECTORIES, description: 'Directories module' },
    MODULE_PROXY: { value: MODULE_PROXY, description: 'Proxy module' },
    MODULE_LOGGER: { value: MODULE_LOGGER, description: 'Logger module' },
    MODULE_FILTER: { value: MODULE_FILTER, description: 'Filter module' },
    MODULE_PROVIDER: { value: MODULE_PROVIDER, description: 'Provider module' },
    MODULE_USERDB: { value: MODULE_USERDB, description: 'User database module' },
    MODULE_DEPRECATED: { value: MODULE_DEPRECATED, description: 'Deprecated module' },
    MODULE_PROTOCOL: { value: MODULE_PROTOCOL, description: 'Protocol module' },
    MODULE_CONFIG: { value: MODULE_CONFIG, description: 'Config module' },
    MODULE_SECURITY: { value: MODULE_SECURITY, description: 'Security module' },
    MODULE_EXPERIMENTAL: { value: MODULE_EXPERIMENTAL, description: 'Experimental module' },
};

// Variable type constant metadata for completions
export const TYPE_CONSTANTS: Record<string, { value: number; description: string }> = {
    TYPE_STRING: { value: TYPE_STRING, description: 'String variable' },
    TYPE_FILE: { value: TYPE_FILE, description: 'File path variable' },
    TYPE_INT: { value: TYPE_INT, description: 'Integer variable' },
    TYPE_DIR: { value: TYPE_DIR, description: 'Directory path variable' },
    TYPE_STRING_LIST: { value: TYPE_STRING_LIST, description: 'String array variable' },
    TYPE_MULTIPLE_STRING: { value: TYPE_MULTIPLE_STRING, description: 'Alias for TYPE_STRING_LIST' },
    TYPE_INT_LIST: { value: TYPE_INT_LIST, description: 'Integer array variable' },
    TYPE_MULTIPLE_INT: { value: TYPE_MULTIPLE_INT, description: 'Alias for TYPE_INT_LIST' },
    TYPE_FLAG: { value: TYPE_FLAG, description: 'Boolean flag variable' },
    TYPE_TOGGLE: { value: TYPE_TOGGLE, description: 'Alias for TYPE_FLAG' },
    TYPE_DIR_LIST: { value: TYPE_DIR_LIST, description: 'Directory array variable' },
    TYPE_FILE_LIST: { value: TYPE_FILE_LIST, description: 'File array variable' },
    TYPE_LOCATION: { value: TYPE_LOCATION, description: 'Location specifier' },
    TYPE_TEXT_FIELD: { value: TYPE_TEXT_FIELD, description: 'Text field (multiline)' },
    TYPE_TEXT: { value: TYPE_TEXT, description: 'Alias for TYPE_TEXT_FIELD' },
    TYPE_PASSWORD: { value: TYPE_PASSWORD, description: 'Password field' },
    TYPE_FLOAT: { value: TYPE_FLOAT, description: 'Floating point number' },
    TYPE_MODULE: { value: TYPE_MODULE, description: 'Module reference' },
    TYPE_FONT: { value: TYPE_FONT, description: 'Font selector' },
    TYPE_CUSTOM: { value: TYPE_CUSTOM, description: 'Custom type' },
    TYPE_URL: { value: TYPE_URL, description: 'URL variable' },
    TYPE_URL_LIST: { value: TYPE_URL_LIST, description: 'URL array variable' },
};

// Variable flag metadata for completions
export const VAR_FLAGS: Record<string, { value: number; description: string }> = {
    VAR_EXPERT: { value: VAR_EXPERT, description: 'Expert-only variable' },
    VAR_MORE: { value: VAR_MORE, description: '"More" section variable' },
    VAR_DEVELOPER: { value: VAR_DEVELOPER, description: 'Developer-only variable' },
    VAR_INITIAL: { value: VAR_INITIAL, description: 'Initial configuration variable' },
    VAR_NOT_CFIF: { value: VAR_NOT_CFIF, description: 'Not in CFIF' },
    VAR_INVISIBLE: { value: VAR_INVISIBLE, description: 'Invisible variable' },
    VAR_PUBLIC: { value: VAR_PUBLIC, description: 'Public variable' },
    VAR_NO_DEFAULT: { value: VAR_NO_DEFAULT, description: 'No default value' },
};
