/**
 * Pike Installation Detector
 *
 * Automatically detects Pike installation paths on Windows, Linux, and macOS.
 * Provides utilities to find the Pike executable and the Pike module/library directory.
 */

import * as fs from 'fs';
import * as path from 'path';
import { spawn } from 'child_process';
import * as os from 'os';

/**
 * Result of Pike detection
 */
export interface PikeDetectionResult {
    /** Path to the Pike executable */
    pikePath: string;
    /** Path to the Pike module/library directory */
    modulePath: string;
    /** Detected Pike version */
    version: string;
    /** Whether this is the default system Pike */
    isSystemDefault: boolean;
    /** Platform-specific paths */
    includePath: string;
}

/**
 * Platform-specific Pike installation patterns
 */
const PIKE_PATTERNS: Partial<Record<NodeJS.Platform, string[]>> = {
    win32: [
        // Common Windows installation paths
        'C:\\Pike\\pike.exe',
        'C:\\Program Files\\Pike\\pike.exe',
        'C:\\Program Files (x86)\\Pike\\pike.exe',
        'C:\\Pike\\v*.*.*\\pike.exe',
        // WSL paths (accessed from Windows)
        '\\\\wsl$\\Ubuntu\\usr\\bin\\pike',
        '\\\\wsl$\\Ubuntu-22.04\\usr\\bin\\pike',
        '\\\\wsl.localhost\\Ubuntu\\usr\\bin\\pike',
    ],
    linux: [
        '/usr/bin/pike',
        '/usr/local/bin/pike',
        // Common versioned installations
        '/usr/bin/pike*',
        '/opt/pike*/bin/pike',
        // Home directory installations
        path.join(os.homedir(), '.local', 'bin', 'pike'),
        path.join(os.homedir(), 'pike', 'bin', 'pike'),
    ],
    darwin: [
        '/usr/local/bin/pike',
        '/opt/homebrew/bin/pike',
        '/opt/pike/bin/pike',
        path.join(os.homedir(), '.local', 'bin', 'pike'),
    ],
};

/**
 * Find Pike module directory relative to executable
 */
async function getModuleDirs(pikeExe: string): Promise<{ modulePath: string; includePath: string }> {
    const pikeDir = path.dirname(pikeExe);

    // Common module path patterns relative to Pike binary
    const modulePatterns = [
        path.join(pikeDir, '..', 'lib', 'pike', '*', 'modules'),  // Linux/macOS
        path.join(pikeDir, '..', 'lib', 'pike', '*'),              // Alternative
        path.join(pikeDir, '..', 'share', 'pike', '*', 'modules'), // Some installs
        path.join(pikeDir, 'modules'),                             // Windows
        path.join(pikeDir, '..', 'modules'),                       // Windows alt
    ];

    // Common include path patterns
    const includePatterns = [
        path.join(pikeDir, '..', 'include', 'pike', '*'),  // Linux/macOS
        path.join(pikeDir, '..', 'include'),               // Some installs
        path.join(pikeDir, 'include'),                     // Windows
    ];

    let modulePath = '';
    let includePath = '';

    // Find module directory
    for (const pattern of modulePatterns) {
        const matches = findGlobMatches(pattern);
        if (matches.length > 0) {
            // Use the first match (or highest version if versioned)
            modulePath = matches[0]!;
            break;
        }
    }

    // Find include directory
    for (const pattern of includePatterns) {
        const matches = findGlobMatches(pattern);
        if (matches.length > 0) {
            includePath = matches[0]!;
            break;
        }
    }

    // If still not found, try querying Pike itself
    if (!modulePath || !includePath) {
        const queried = await queryPikePaths(pikeExe);
        if (queried.modulePath) modulePath = queried.modulePath;
        if (queried.includePath) includePath = queried.includePath;
    }

    return { modulePath, includePath };
}

/**
 * Synchronous version of getModuleDirs for quick checks
 */
function getModuleDirsSync(pikeExe: string): { modulePath: string; includePath: string } {
    const pikeDir = path.dirname(pikeExe);

    // Common module path patterns relative to Pike binary
    const modulePatterns = [
        path.join(pikeDir, '..', 'lib', 'pike', '*', 'modules'),  // Linux/macOS
        path.join(pikeDir, '..', 'lib', 'pike', '*'),              // Alternative
        path.join(pikeDir, '..', 'share', 'pike', '*', 'modules'), // Some installs
        path.join(pikeDir, 'modules'),                             // Windows
        path.join(pikeDir, '..', 'modules'),                       // Windows alt
    ];

    // Common include path patterns
    const includePatterns = [
        path.join(pikeDir, '..', 'include', 'pike', '*'),  // Linux/macOS
        path.join(pikeDir, '..', 'include'),               // Some installs
        path.join(pikeDir, 'include'),                     // Windows
    ];

    let modulePath = '';
    let includePath = '';

    // Find module directory
    for (const pattern of modulePatterns) {
        const matches = findGlobMatches(pattern);
        if (matches.length > 0) {
            modulePath = matches[0]!;
            break;
        }
    }

    // Find include directory
    for (const pattern of includePatterns) {
        const matches = findGlobMatches(pattern);
        if (matches.length > 0) {
            includePath = matches[0]!;
            break;
        }
    }

    return { modulePath, includePath };
}

/**
 * Simple glob expansion for Pike path patterns
 */
function findGlobMatches(pattern: string): string[] {
    const results: string[] = [];
    const parts = pattern.split(path.sep);
    let currentPaths = ['/'];

    // Handle Windows absolute paths
    if (pattern.match(/^[A-Za-z]:/)) {
        const drive = pattern.substring(0, 3);
        const rest = pattern.substring(3).split(path.sep);
        currentPaths = [drive];
        parts.splice(0, 3, ...rest);
    }

    for (const part of parts) {
        const newPaths: string[] = [];

        for (const currentPath of currentPaths) {
            if (!part.includes('*')) {
                newPaths.push(path.join(currentPath, part));
            } else {
                // Expand wildcard
                try {
                    const parent = path.dirname(pattern.replace(/[*][*].*$/, ''));
                    const wildcardDir = path.join(parent, part.replace(/\*.*/, ''));
                    if (fs.existsSync(wildcardDir)) {
                        const entries = fs.readdirSync(wildcardDir, { withFileTypes: true });
                        for (const entry of entries) {
                            if (entry.isDirectory()) {
                                newPaths.push(path.join(wildcardDir, entry.name));
                            }
                        }
                    }
                } catch {
                    // Ignore errors
                }
            }
        }
        currentPaths = newPaths;
        if (currentPaths.length === 0) break;
    }

    for (const p of currentPaths) {
        if (fs.existsSync(p)) {
            results.push(p);
        }
    }

    return results;
}

/**
 * Query Pike for its include and module paths
 */
function queryPikePaths(pikeExe: string): Promise<{ modulePath: string; includePath: string }> {
    return new Promise((resolve) => {
        const script = `
            write(master()->pike_module_path + "\\n");
            write(master()->pike_include_path + "\\n");
        `;

        const child = spawn(pikeExe, ['-e', script]);

        let stdout = '';
        let stderr = '';

        child.stdout?.on('data', (data) => {
            stdout += data.toString();
        });

        child.stderr?.on('data', (data) => {
            stderr += data.toString();
        });

        child.on('close', () => {
            const lines = stdout.trim().split('\n');
            const modulePath = lines[0]?.trim() || '';
            const includePath = lines[1]?.trim() || '';
            resolve({ modulePath, includePath });
        });

        child.on('error', () => {
            resolve({ modulePath: '', includePath: '' });
        });

        // Timeout after 5 seconds
        setTimeout(() => {
            child.kill();
            resolve({ modulePath: '', includePath: '' });
        }, 5000);
    });
}

/**
 * Get Pike version by running the executable
 */
async function getPikeVersion(pikeExe: string): Promise<string> {
    return new Promise((resolve) => {
        const child = spawn(pikeExe, ['--version']);

        let stdout = '';
        let stderr = '';

        child.stdout?.on('data', (data) => {
            stdout += data.toString();
        });

        child.stderr?.on('data', (data) => {
            stderr += data.toString();
        });

        child.on('close', () => {
            const output = stdout || stderr;
            // Parse version from "Pike v8.0 release 1956" format
            const match = output.match(/Pike v(\d+\.\d+)/);
            resolve(match?.[1] || 'unknown');
        });

        child.on('error', () => {
            resolve('unknown');
        });

        // Timeout after 5 seconds
        setTimeout(() => {
            child.kill();
            resolve('unknown');
        }, 5000);
    });
}

/**
 * Synchronously check if a file exists and is executable
 */
function checkExecutable(filePath: string): boolean {
    try {
        fs.accessSync(filePath, fs.constants.X_OK);
        return true;
    } catch {
        return false;
    }
}

/**
 * Detect Pike installation on the system
 *
 * @returns Detection result with paths, or null if Pike not found
 */
export async function detectPike(): Promise<PikeDetectionResult | null> {
    const platform = process.platform;
    const patterns = PIKE_PATTERNS[platform] || PIKE_PATTERNS.linux || [];

    // First, try the system PATH
    const systemPike = await findInPath('pike');
    if (systemPike) {
        const { modulePath, includePath } = await getModuleDirs(systemPike);
        const version = await getPikeVersion(systemPike);
        return {
            pikePath: systemPike,
            modulePath,
            includePath,
            version,
            isSystemDefault: true,
        };
    }

    // Then try platform-specific paths
    for (const pattern of patterns) {
        const matches = findGlobMatches(pattern);
        for (const match of matches) {
            if (checkExecutable(match)) {
                const { modulePath, includePath } = await getModuleDirs(match);
                const version = await getPikeVersion(match);
                return {
                    pikePath: match,
                    modulePath,
                    includePath,
                    version,
                    isSystemDefault: false,
                };
            }
        }
    }

    return null;
}

/**
 * Find an executable in the system PATH
 */
async function findInPath(executable: string): Promise<string | null> {
    // On Windows, try .exe extension
    const exeName = process.platform === 'win32' && !executable.endsWith('.exe')
        ? `${executable}.exe`
        : executable;

    const pathEnv = process.env['PATH'] || '';
    const pathDirs = pathEnv.split(path.delimiter);

    for (const dir of pathDirs) {
        const fullPath = path.join(dir, exeName);
        if (fs.existsSync(fullPath)) {
            try {
                fs.accessSync(fullPath, fs.constants.X_OK);
                return fullPath;
            } catch {
                // Not executable
            }
        }
    }

    return null;
}

/**
 * Get module path suggestions for a given Pike installation
 *
 * @param pikeExe Path to Pike executable
 * @returns Array of suggested module paths
 */
export async function getModulePathSuggestions(pikeExe: string): Promise<string[]> {
    const suggestions: string[] = [];

    const { modulePath, includePath } = await getModuleDirs(pikeExe);

    if (modulePath && fs.existsSync(modulePath)) {
        suggestions.push(modulePath);
    }

    if (includePath && fs.existsSync(includePath)) {
        suggestions.push(includePath);
    }

    // Add parent directories for module discovery
    const pikeDir = path.dirname(pikeExe);
    const libDir = path.join(pikeDir, '..', 'lib', 'pike');
    if (fs.existsSync(libDir)) {
        const entries = fs.readdirSync(libDir, { withFileTypes: true });
        for (const entry of entries) {
            if (entry.isDirectory()) {
                suggestions.push(path.join(libDir, entry.name, 'modules'));
            }
        }
    }

    // Filter out duplicates and non-existent paths
    return [...new Set(suggestions)].filter(p => fs.existsSync(p));
}

/**
 * Synchronous wrapper for detectPike (returns best guess)
 */
export function detectPikeSync(): Partial<PikeDetectionResult> | null {
    const platform = process.platform;

    // Quick system PATH check
    const pathEnv = process.env['PATH'] || '';
    const pathDirs = pathEnv.split(path.delimiter);

    for (const dir of pathDirs) {
        const exeName = platform === 'win32' ? 'pike.exe' : 'pike';
        const fullPath = path.join(dir, exeName);
        if (fs.existsSync(fullPath)) {
            const { modulePath, includePath } = getModuleDirsSync(fullPath);
            return {
                pikePath: fullPath,
                modulePath,
                includePath,
            };
        }
    }

    return null;
}
