/**
 * Pike Compatibility Utilities
 *
 * Provides version detection, module availability checks, and API compatibility
 * handling for Pike LSP features.
 *
 * Target: Pike 8.0.1116 (per ADR-002)
 */

const UNKNOWN_VERSION: PikeVersionInfo = {
    major: 0,
    minor: 0,
    build: 0,
    string: 'Unknown',
};

const MIN_SUPPORTED_VERSION: PikeVersionInfo = {
    major: 8,
    minor: 0,
    build: 1116,
    string: 'Pike v8.0.1116',
};

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
const versionCache = new Map<string, PikeVersionInfo>();

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

type VersionLike = PikeVersionInfo | string;

interface FeatureRule {
    module?: string;
    minVersion?: PikeVersionInfo;
    maxMajor?: number;
}

const FEATURE_RULES: Record<string, FeatureRule> = {
    'Parser.Pike.split': {
        module: 'Parser.Pike',
        minVersion: { major: 7, minor: 0, build: 0, string: 'Pike v7.0.0' },
    },
    'Tools.AutoDoc.PikeParser': {
        module: 'Tools.AutoDoc',
        minVersion: { major: 7, minor: 0, build: 0, string: 'Pike v7.0.0' },
    },
    'Stdio.File.open': {
        module: 'Stdio.File',
        minVersion: { major: 7, minor: 0, build: 0, string: 'Pike v7.0.0' },
    },
    'String.trim': {
        module: 'String',
        minVersion: { major: 8, minor: 0, build: 0, string: 'Pike v8.0.0' },
    },
    'String.trim_all_whites': {
        module: 'String',
        maxMajor: 7,
    },
};

/**
 * Parses a Pike version string into version components.
 *
 * @param versionString - Version string like "Pike v8.0.1116" or "8.0.1116"
 * @returns Parsed version info or null if parsing fails
 */
export function parseVersion(versionString: string): PikeVersionInfo | null {
    const match = versionString.match(/(?:Pike\s*v?)?(\d+)\.(\d+)\.(\d+)(?:-([\w.-]+))?/i);
    if (!match) {
        return null;
    }

    const normalizedCore = `${match[1]}.${match[2]}.${match[3]}`;
    const suffix = match[4] ? `-${match[4]}` : '';

    return {
        major: parseInt(match[1]!, 10),
        minor: parseInt(match[2]!, 10),
        build: parseInt(match[3]!, 10),
        string: versionString.includes('Pike')
            ? versionString
            : `Pike v${normalizedCore}${suffix}`,
    };
}

export function detectVersion(
    source?: string | { __VERSION__?: string; versionString?: string }
): PikeVersionInfo {
    const key = typeof source === 'string'
        ? source
        : source?.__VERSION__ ?? source?.versionString ?? 'Unknown';

    const cached = versionCache.get(key);
    if (cached) {
        return cached;
    }

    const rawVersion = typeof source === 'string'
        ? source
        : source?.__VERSION__ ?? source?.versionString ?? 'Unknown';

    const parsed = parseVersion(rawVersion);
    const version = parsed ?? {
        ...UNKNOWN_VERSION,
        string: rawVersion,
    };

    versionCache.set(key, version);
    return version;
}

export function compareVersions(a: VersionLike, b: VersionLike): -1 | 0 | 1 {
    const versionA = typeof a === 'string' ? (parseVersion(a) ?? UNKNOWN_VERSION) : a;
    const versionB = typeof b === 'string' ? (parseVersion(b) ?? UNKNOWN_VERSION) : b;

    if (versionA.major !== versionB.major) {
        return versionA.major > versionB.major ? 1 : -1;
    }

    if (versionA.minor !== versionB.minor) {
        return versionA.minor > versionB.minor ? 1 : -1;
    }

    if (versionA.build !== versionB.build) {
        return versionA.build > versionB.build ? 1 : -1;
    }

    return 0;
}

export function checkMinimumVersion(current: VersionLike, required: VersionLike): boolean {
    return compareVersions(current, required) >= 0;
}

export function getCompatibilityInfo(
    current: VersionLike,
    required: VersionLike = MIN_SUPPORTED_VERSION
): CompatibilityResult {
    const currentVersion = typeof current === 'string' ? detectVersion(current) : current;
    const requiredVersion = typeof required === 'string' ? (parseVersion(required) ?? MIN_SUPPORTED_VERSION) : required;

    const issues: string[] = [];
    if (currentVersion.major === 0 && currentVersion.minor === 0 && currentVersion.build === 0) {
        issues.push(`Unable to parse Pike version from '${currentVersion.string}'`);
    }

    if (!checkMinimumVersion(currentVersion, requiredVersion)) {
        issues.push(
            `Minimum required version is ${requiredVersion.major}.${requiredVersion.minor}.${requiredVersion.build}`
        );
        issues.push(
            `Current version is ${currentVersion.major}.${currentVersion.minor}.${currentVersion.build}`
        );
    }

    return {
        compatible: issues.length === 0,
        version: currentVersion.string,
        issues,
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
    return detectFeatureForVersion(featureName, MIN_SUPPORTED_VERSION);
}

export function detectFeatureForVersion(
    featureName: string,
    version: VersionLike
): boolean {
    const versionInfo = typeof version === 'string' ? detectVersion(version) : version;
    const cacheKey = `${featureName}@${versionInfo.major}.${versionInfo.minor}.${versionInfo.build}`;
    if (featureCache.has(cacheKey)) {
        return featureCache.get(cacheKey)!;
    }

    const rule = FEATURE_RULES[featureName];
    if (rule) {
        const moduleOk = rule.module ? detectModule(rule.module) : true;
        const minOk = rule.minVersion ? checkMinimumVersion(versionInfo, rule.minVersion) : true;
        const maxOk = rule.maxMajor !== undefined ? versionInfo.major <= rule.maxMajor : true;
        const available = moduleOk && minOk && maxOk;
        featureCache.set(cacheKey, available);
        return available;
    }

    // Extract module from feature name (e.g., "Parser.Pike.split" -> "Parser.Pike")
    const parts = featureName.split('.');
    if (parts.length < 2) {
        featureCache.set(cacheKey, false);
        return false;
    }

    const moduleName = parts.slice(0, 2).join('.');
    const isAvailable = detectModule(moduleName);

    featureCache.set(cacheKey, isAvailable);
    return isAvailable;
}

export interface TrimSupport {
    nativeTrim: boolean;
    trimAllWhites: boolean;
    strategy: 'native' | 'trim_all_whites' | 'regex';
}

export function detectTrimSupport(): TrimSupport {
    const sample = '  test  ' as string & { trim_all_whites?: () => string };
    const nativeTrim = typeof sample.trim === 'function';
    const trimAllWhites = typeof sample.trim_all_whites === 'function';

    if (nativeTrim) {
        return { nativeTrim, trimAllWhites, strategy: 'native' };
    }

    if (trimAllWhites) {
        return { nativeTrim, trimAllWhites, strategy: 'trim_all_whites' };
    }

    return { nativeTrim, trimAllWhites, strategy: 'regex' };
}

function normalizeInput(value: string | null | undefined): string {
    return typeof value === 'string' ? value : '';
}

export function createTrimWrapper(version: VersionLike): (value: string | null | undefined) => string {
    const versionInfo = typeof version === 'string' ? detectVersion(version) : version;
    const trimSupport = detectTrimSupport();

    if (versionInfo.major <= 7 && trimSupport.trimAllWhites) {
        return (value: string | null | undefined): string => {
            const input = normalizeInput(value) as string & { trim_all_whites?: () => string };
            if (typeof input.trim_all_whites === 'function') {
                return input.trim_all_whites();
            }
            return input.replace(/^\s+|\s+$/gu, '');
        };
    }

    if (trimSupport.nativeTrim) {
        return (value: string | null | undefined): string => normalizeInput(value).trim();
    }

    return (value: string | null | undefined): string => normalizeInput(value).replace(/^\s+|\s+$/gu, '');
}

export function trim(value: string | null | undefined, version: VersionLike = MIN_SUPPORTED_VERSION): string {
    return createTrimWrapper(version)(value);
}

export function trimLeft(value: string | null | undefined): string {
    return normalizeInput(value).replace(/^\s+/u, '');
}

export function trimRight(value: string | null | undefined): string {
    return normalizeInput(value).replace(/\s+$/u, '');
}

export interface CompatibilityApiLayer {
    version: PikeVersionInfo;
    trim: (value: string | null | undefined) => string;
    trimLeft: (value: string | null | undefined) => string;
    trimRight: (value: string | null | undefined) => string;
    hasModule: (moduleName: string) => boolean;
    hasFeature: (featureName: string) => boolean;
}

export function createAPILayer(version: VersionLike): CompatibilityApiLayer {
    const resolvedVersion = typeof version === 'string' ? detectVersion(version) : version;
    return {
        version: resolvedVersion,
        trim: (value) => trim(value, resolvedVersion),
        trimLeft,
        trimRight,
        hasModule: detectModule,
        hasFeature: (featureName: string) => detectFeatureForVersion(featureName, resolvedVersion),
    };
}

/**
 * Clears the feature detection cache.
 * Useful for testing or when module availability may have changed.
 */
export function clearFeatureCache(): void {
    featureCache.clear();
    versionCache.clear();
}

/**
 * Gets the current feature cache size (useful for diagnostics).
 */
export function getFeatureCacheSize(): number {
    return featureCache.size;
}
