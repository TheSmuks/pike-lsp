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
