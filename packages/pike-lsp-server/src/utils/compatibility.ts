/**
 * Pike Compatibility Utilities
 *
 * Provides version detection, module availability checks, and API compatibility
 * handling for Pike LSP features.
 *
 * Target: Pike 8.0.1116 (per ADR-002)
 */

/**
 * Pike version information.
 */
export interface PikeVersionInfo {
    major: number;
    minor: number;
    build: number;
    string: string;
}

/**
 * Result of a compatibility check.
 */
export interface CompatibilityResult {
    compatible: boolean;
    version: string;
    issues: string[];
}

/**
 * Feature detection cache for API availability checks.
 */
const featureCache = new Map<string, boolean>();

/**
 * Known Pike stdlib modules that should be available.
 */
const KNOWN_MODULES = new Set([
    'Parser.Pike',
    'Stdio',
    'Stdio.File',
    'Array',
    'String',
    'Mapping',
    'Multiset',
    'Tools.AutoDoc',
    'SSL.Cipher',
    'Protocols.HTTP',
]);

/**
 * Parses a Pike version string into version components.
 *
 * @param versionString - Version string like "Pike v8.0.1116" or "8.0.1116"
 * @returns Parsed version info or null if parsing fails
 */
export function parseVersion(versionString: string): PikeVersionInfo | null {
    // Handle both "Pike v8.0.1116" and "8.0.1116" formats
    const match = versionString.match(/(\d+)\.(\d+)\.(\d+)/);
    if (!match) {
        return null;
    }

    return {
        major: parseInt(match[1]!, 10),
        minor: parseInt(match[2]!, 10),
        build: parseInt(match[3]!, 10),
        string: versionString.includes('Pike')
            ? versionString
            : `Pike v${versionString}`,
    };
}

/**
 * Detects if a module is available in the Pike stdlib.
 *
 * @param moduleName - The module path (e.g., "Parser.Pike", "Stdio.File")
 * @returns true if the module is known to be available
 */
export function detectModule(moduleName: string): boolean {
    // Check cache first
    if (featureCache.has(moduleName)) {
        return featureCache.get(moduleName)!;
    }

    // Check against known modules list
    const isAvailable = KNOWN_MODULES.has(moduleName);

    // Cache the result
    featureCache.set(moduleName, isAvailable);

    return isAvailable;
}

/**
 * Handles a missing module by throwing a descriptive error.
 *
 * Use this when a feature requires a specific module that may not be available.
 * The error message can be caught and handled gracefully by the caller.
 *
 * @param moduleName - The module that is missing
 * @throws Error with message describing the missing module
 *
 * @example
 * ```typescript
 * try {
 *     if (!detectModule('Some.Optional.Module')) {
 *         handleMissingModule('Some.Optional.Module');
 *     }
 *     // Module is available, proceed
 * } catch (e) {
 *     // Gracefully handle missing module
 *     console.warn((e as Error).message);
 * }
 * ```
 */
export function handleMissingModule(moduleName: string): never {
    throw new Error(`Module '${moduleName}' is not available in this Pike version. This feature requires Pike 8.0 or higher. Check that your Pike installation includes this module and that PIKE_PATH is correctly configured.`);
}

/**
 * Checks module availability and returns a result instead of throwing.
 *
 * @param moduleName - The module to check
 * @returns Object with availability status and optional error message
 */
export function checkModuleAvailability(moduleName: string): {
    available: boolean;
    error?: string;
} {
    if (detectModule(moduleName)) {
        return { available: true };
    }

    return {
        available: false,
        error: `Module '${moduleName}' is not available. This feature requires Pike 8.0 or higher. Verify that PIKE_PATH is set correctly and your Pike installation includes this module.`,
    };
}

/**
 * Detects if a specific feature is available.
 *
 * @param featureName - The feature to check (e.g., "Parser.Pike.split")
 * @returns true if the feature is available
 */
export function detectFeature(featureName: string): boolean {
    // Check cache first
    if (featureCache.has(featureName)) {
        return featureCache.get(featureName)!;
    }

    // Extract module from feature name (e.g., "Parser.Pike.split" -> "Parser.Pike")
    const parts = featureName.split('.');
    if (parts.length < 2) {
        featureCache.set(featureName, false);
        return false;
    }

    // For features, check if the parent module exists
    // In a real implementation, this would check actual feature availability
    const moduleName = parts.slice(0, 2).join('.');
    const isAvailable = detectModule(moduleName);

    featureCache.set(featureName, isAvailable);
    return isAvailable;
}

/**
 * Clears the feature detection cache.
 * Useful for testing or when module availability may have changed.
 */
export function clearFeatureCache(): void {
    featureCache.clear();
}

/**
 * Gets the current feature cache size (useful for diagnostics).
 */
export function getFeatureCacheSize(): number {
    return featureCache.size;
}
