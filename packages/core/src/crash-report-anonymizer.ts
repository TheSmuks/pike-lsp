import { createHash } from 'node:crypto';

const PREHASHED_IDENTIFIER = /^sym_[0-9a-f]{12}$/;

function hashHex(value: string, length = 12): string {
  return createHash('sha256').update(value).digest('hex').slice(0, length);
}

function normalizeSlashes(value: string): string {
  return value.replace(/\\/g, '/');
}

function trimTrailingSlash(value: string): string {
  if (value.length <= 1) {
    return value;
  }
  return value.replace(/[\\/]+$/, '');
}

function isWindowsAbsolutePath(value: string): boolean {
  return /^[A-Za-z]:[\\/]/.test(value);
}

function isUnixAbsolutePath(value: string): boolean {
  return value.startsWith('/');
}

function isAbsolutePath(value: string): boolean {
  return isWindowsAbsolutePath(value) || isUnixAbsolutePath(value);
}

function normalizeForComparison(pathValue: string, windowsStyle: boolean): string {
  const normalized = trimTrailingSlash(normalizeSlashes(pathValue));
  return windowsStyle ? normalized.toLowerCase() : normalized;
}

function splitBaseAndParent(pathValue: string): { basename: string; parent: string } {
  const normalized = trimTrailingSlash(pathValue);
  const pieces = normalized.split(/[\\/]/).filter(Boolean);
  const basename = pieces.length > 0 ? pieces[pieces.length - 1]! : '';
  const parent = pieces.length > 1 ? pieces.slice(0, -1).join('/') : normalized;
  return { basename, parent };
}

function sanitizeAbsolutePath(pathValue: string, workspaceRoot: string): string {
  const windowsStyle = isWindowsAbsolutePath(pathValue) || isWindowsAbsolutePath(workspaceRoot);
  const separator = windowsStyle ? '\\' : '/';
  const normalizedPath = normalizeForComparison(pathValue, windowsStyle);
  const normalizedRoot = normalizeForComparison(workspaceRoot, windowsStyle);
  const withSlash = `${normalizedRoot}/`;

  if (normalizedPath === normalizedRoot || normalizedPath.startsWith(withSlash)) {
    const relative = normalizedPath.slice(normalizedRoot.length).replace(/^\//, '');
    if (!relative) {
      return '<workspace>';
    }
    const relativeWithSeparator = relative.replace(/\//g, separator);
    return `<workspace>${separator}${relativeWithSeparator}`;
  }

  const { basename, parent } = splitBaseAndParent(pathValue);
  const hash = hashHex(normalizeSlashes(parent), 8);
  return `<external:${hash}>${separator}${basename}`;
}

function sanitizeFileUri(uri: string, workspaceRoot: string): string {
  const rawPath = uri.slice('file://'.length);
  const decoded = decodeURIComponent(rawPath);
  const normalized =
    decoded.startsWith('/') && isWindowsAbsolutePath(decoded.slice(1)) ? decoded.slice(1) : decoded;
  const normalizedWithoutLeadingSlash = normalized.replace(/^\//, '');
  if (
    normalizedWithoutLeadingSlash.startsWith('<workspace>') ||
    normalizedWithoutLeadingSlash.startsWith('<external:')
  ) {
    return `file:///${normalizedWithoutLeadingSlash.replace(/\\/g, '/')}`;
  }
  const sanitized = sanitizeAbsolutePath(normalized, workspaceRoot).replace(/\\/g, '/');
  return `file:///${sanitized}`;
}

export const PathSanitizer = {
  sanitizePath(inputPath: string, workspaceRoot: string): string {
    if (!inputPath) {
      return inputPath;
    }

    if (inputPath.startsWith('file:///')) {
      return sanitizeFileUri(inputPath, workspaceRoot);
    }

    if (!isAbsolutePath(inputPath)) {
      return inputPath;
    }

    return sanitizeAbsolutePath(inputPath, workspaceRoot);
  },

  sanitizePathsInText(value: string, workspaceRoot: string): string {
    if (!value) {
      return value;
    }

    const pattern =
      /(^|[\s([{'"=:])((?:file:\/\/\/[^\s"')\]]+)|(?:[A-Za-z]:\\[^\s"')\]]+)|(?:\/(?:[^\s"')\]/]+\/)+[^\s"')\]]+))/g;
    return value.replace(pattern, (_match, prefix: string, pathPart: string) => {
      return `${prefix}${PathSanitizer.sanitizePath(pathPart, workspaceRoot)}`;
    });
  },
};

export const StackTraceSanitizer = {
  sanitizeStackTrace(trace: string, workspaceRoot: string): string {
    return PathSanitizer.sanitizePathsInText(trace, workspaceRoot);
  },

  stripFrameSource<T>(framePayload: T): T {
    if (framePayload === null || framePayload === undefined) {
      return framePayload;
    }
    if (Array.isArray(framePayload)) {
      return framePayload.map(item => StackTraceSanitizer.stripFrameSource(item)) as T;
    }
    if (typeof framePayload !== 'object') {
      return framePayload;
    }

    const input = framePayload as Record<string, unknown>;
    const output: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(input)) {
      if (key === 'source' && typeof value === 'string') {
        output[key] = null;
      } else {
        output[key] = StackTraceSanitizer.stripFrameSource(value);
      }
    }
    return output as T;
  },
};

function shouldKeepIdentifier(token: string, allowList: ReadonlySet<string>): boolean {
  if (allowList.has(token)) {
    return true;
  }
  if (PREHASHED_IDENTIFIER.test(token)) {
    return true;
  }
  if (token === 'prototype' || token === 'from') {
    return true;
  }
  return false;
}

function hashIdentifierToken(token: string): string {
  return `sym_${hashHex(token, 12)}`;
}

export const IdentifierHasher = {
  hashIdentifier(identifier: string): string {
    if (PREHASHED_IDENTIFIER.test(identifier)) {
      return identifier;
    }
    return hashIdentifierToken(identifier);
  },

  hashSensitiveSegments(value: string, allowList: string[] = []): string {
    const allow = new Set(allowList);

    const quoteSanitized = value.replace(/'([A-Za-z_][A-Za-z0-9_]*)'/g, (_match, ident: string) => {
      if (shouldKeepIdentifier(ident, allow)) {
        return `'${ident}'`;
      }
      return `'${hashIdentifierToken(ident)}'`;
    });

    return quoteSanitized.replace(/\(([A-Za-z_][A-Za-z0-9_.]*)\)/g, (_match, chain: string) => {
      const mapped = chain
        .split('.')
        .map(part => (shouldKeepIdentifier(part, allow) ? part : hashIdentifierToken(part)));
      return `(${mapped.join('.')})`;
    });
  },
};

function redactTextContent(text: string): string {
  if (/^<redacted:\d+ chars>$/.test(text)) {
    return text;
  }
  return `<redacted:${text.length} chars>`;
}

function redactPathLikeName(name: string): string {
  return name ? '<workspace>' : name;
}

type JsonValue = string | number | boolean | null | JsonObject | JsonArray;
interface JsonObject {
  [key: string]: JsonValue;
}
type JsonArray = JsonValue[];

export const JsonRpcRedactor = {
  redactMessage<T>(payload: T, workspaceRoot: string, allowList: string[] = []): T {
    const redact = (value: unknown, keyName?: string): unknown => {
      if (typeof value === 'string') {
        if (keyName === 'text') {
          return redactTextContent(value);
        }
        const pathRedacted = PathSanitizer.sanitizePathsInText(value, workspaceRoot);
        if (keyName === 'message') {
          return IdentifierHasher.hashSensitiveSegments(pathRedacted, allowList);
        }
        if (keyName === 'uri' || keyName === 'rootUri' || keyName === 'rootPath') {
          return PathSanitizer.sanitizePath(pathRedacted, workspaceRoot);
        }
        return pathRedacted;
      }

      if (Array.isArray(value)) {
        return value.map(item => redact(item));
      }

      if (value && typeof value === 'object') {
        const input = value as Record<string, unknown>;
        const output: Record<string, unknown> = {};
        for (const [nestedKey, nestedValue] of Object.entries(input)) {
          if (nestedKey === 'workspaceFolders' && Array.isArray(nestedValue)) {
            output[nestedKey] = nestedValue.map(item => {
              if (!item || typeof item !== 'object') {
                return item;
              }
              const folder = item as Record<string, unknown>;
              const folderOutput: Record<string, unknown> = {};
              for (const [folderKey, folderValue] of Object.entries(folder)) {
                if (folderKey === 'uri' && typeof folderValue === 'string') {
                  folderOutput[folderKey] = PathSanitizer.sanitizePath(folderValue, workspaceRoot);
                } else if (folderKey === 'name' && typeof folderValue === 'string') {
                  folderOutput[folderKey] = redactPathLikeName(folderValue);
                } else {
                  folderOutput[folderKey] = redact(folderValue, folderKey);
                }
              }
              return folderOutput;
            });
            continue;
          }
          output[nestedKey] = redact(nestedValue, nestedKey);
        }
        return output;
      }

      return value;
    };

    return redact(payload) as T;
  },
};

const SENSITIVE_ENV_KEYS = new Set([
  'HOME',
  'USERPROFILE',
  'API_KEY',
  'SECRET_TOKEN',
  'TOKEN',
  'PASSWORD',
  'PASS',
  'AUTH',
]);

function isSensitiveKey(key: string): boolean {
  const upper = key.toUpperCase();
  if (SENSITIVE_ENV_KEYS.has(upper)) {
    return true;
  }
  return /SECRET|TOKEN|KEY|PASSWORD|PASS|AUTH/.test(upper);
}

export const EnvironmentScrubber = {
  scrubEnv(env: Record<string, string>, allowList: string[] = []): Record<string, string> {
    const allow = new Set(allowList.map(item => item.toUpperCase()));
    const output: Record<string, string> = {};
    for (const [key, value] of Object.entries(env)) {
      const upper = key.toUpperCase();
      if (allow.size > 0 && !allow.has(upper)) {
        output[key] = '<redacted>';
        continue;
      }
      if (isSensitiveKey(key)) {
        output[key] = '<redacted>';
        continue;
      }
      output[key] = value;
    }
    return output;
  },

  scrubArgs(args: string[], workspaceRoot: string): string[] {
    return args.map(arg => {
      if (/^--[A-Za-z0-9_-]*(key|token|secret|password)/i.test(arg) && arg.includes('=')) {
        const [name] = arg.split('=', 1);
        return `${name}=<redacted>`;
      }
      if (isAbsolutePath(arg) || arg.startsWith('file:///')) {
        return PathSanitizer.sanitizePath(arg, workspaceRoot);
      }
      return arg;
    });
  },
};

export const CatchAllScanner = {
  scan(value: string): string {
    if (!value) {
      return value;
    }

    const emailReplaced = value.replace(
      /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/g,
      email => {
        return `<email:${hashHex(email, 8)}>`;
      }
    );

    const pathReplaced = emailReplaced.replace(
      /(?<!>)\/(?:[A-Za-z0-9._-]+\/)+([A-Za-z0-9._-]+)/g,
      (match, fileName: string) => {
        const hash = hashHex(match, 8);
        return `<path:${hash}>/${fileName}`;
      }
    );

    return pathReplaced.replace(
      /(?<![\/<])\b((?:[A-Za-z0-9-]+\.)+[A-Za-z]{2,}|(?:\d{1,3}\.){3}\d{1,3})(?::(\d+))?/g,
      (_all, host: string, port: string | undefined) => {
        const suffix = port ? `:${port}` : '';
        return `<host:${hashHex(host, 8)}>${suffix}`;
      }
    );
  },
};

interface PipelineOptions {
  workspaceRoot: string;
  identifierAllowList?: string[];
  envAllowList?: string[];
  createLocalMap?: boolean;
}

interface PipelineResult<T> {
  payload: T;
  localMap?: Record<string, string>;
}

function sanitizeAllStrings(value: unknown, fn: (value: string) => string): unknown {
  if (typeof value === 'string') {
    return fn(value);
  }
  if (Array.isArray(value)) {
    return value.map(item => sanitizeAllStrings(item, fn));
  }
  if (value && typeof value === 'object') {
    const input = value as Record<string, unknown>;
    const output: Record<string, unknown> = {};
    for (const [key, item] of Object.entries(input)) {
      output[key] = sanitizeAllStrings(item, fn);
    }
    return output;
  }
  return value;
}

export const AnonymizerPipeline = {
  anonymize<T extends Record<string, unknown>>(
    payload: T,
    options: PipelineOptions
  ): PipelineResult<T> {
    const identifierAllowList = options.identifierAllowList ?? [
      'String',
      'Array',
      'Object',
      'Promise',
    ];

    const stage1 = JsonRpcRedactor.redactMessage(
      payload,
      options.workspaceRoot,
      identifierAllowList
    );
    const stage2 = sanitizeAllStrings(stage1, value =>
      PathSanitizer.sanitizePathsInText(value, options.workspaceRoot)
    ) as T;
    const stage3 = sanitizeAllStrings(stage2, value =>
      IdentifierHasher.hashSensitiveSegments(value, identifierAllowList)
    ) as T;

    const stage4Input = stage3 as Record<string, unknown>;
    const env = stage4Input['env'];
    const args = stage4Input['args'];
    const stage4 = {
      ...stage4Input,
      ...(env && typeof env === 'object'
        ? {
            env: EnvironmentScrubber.scrubEnv(
              env as Record<string, string>,
              options.envAllowList ?? []
            ),
          }
        : {}),
      ...(Array.isArray(args)
        ? {
            args: EnvironmentScrubber.scrubArgs(
              args.filter((arg): arg is string => typeof arg === 'string'),
              options.workspaceRoot
            ),
          }
        : {}),
    } as T;

    const stage5 = StackTraceSanitizer.stripFrameSource(
      sanitizeAllStrings(stage4, value =>
        StackTraceSanitizer.sanitizeStackTrace(value, options.workspaceRoot)
      )
    ) as T;

    const stage6 = sanitizeAllStrings(stage5, CatchAllScanner.scan) as T;

    if (!options.createLocalMap) {
      return { payload: stage6 };
    }

    const localMap: Record<string, string> = {
      '<workspace>': options.workspaceRoot,
    };

    return {
      payload: stage6,
      localMap,
    };
  },
};
