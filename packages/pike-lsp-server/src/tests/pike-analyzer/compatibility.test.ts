// @ts-nocheck

import { beforeEach, describe, it } from 'bun:test';
import * as assert from 'node:assert/strict';
import {
  checkMinimumVersion,
  clearFeatureCache,
  compareVersions,
  createAPILayer,
  createTrimWrapper,
  detectFeature,
  detectFeatureForVersion,
  detectModule,
  detectTrimSupport,
  detectVersion,
  getCompatibilityInfo,
  parseVersion,
  trim,
  trimLeft,
  trimRight,
} from '../../utils/compatibility.js';

describe('Compatibility - Version Detection and Comparison', () => {
  beforeEach(() => {
    clearFeatureCache();
  });

  it('parses Pike 8.x versions from runtime banner', () => {
    const parsed = parseVersion('Pike v8.0.1116');
    if (!parsed) {
      throw new Error('Expected parseVersion to return a version object');
    }
    assert.equal(parsed.major, 8);
    assert.equal(parsed.minor, 0);
    assert.equal(parsed.build, 1116);
  });

  it('parses raw __VERSION__ constants', () => {
    const version = detectVersion({ __VERSION__: '7.8.866' });
    assert.equal(version.major, 7);
    assert.equal(version.minor, 8);
    assert.equal(version.build, 866);
    assert.equal(version.string, 'Pike v7.8.866');
  });

  it('parses development suffixes and preserves string value', () => {
    const version = detectVersion('Pike v8.1.1234-dev');
    assert.equal(version.major, 8);
    assert.equal(version.minor, 1);
    assert.equal(version.build, 1234);
    assert.equal(version.string, 'Pike v8.1.1234-dev');
  });

  it('returns explicit unknown version when parsing fails', () => {
    const version = detectVersion('Unknown Version');
    assert.equal(version.major, 0);
    assert.equal(version.minor, 0);
    assert.equal(version.build, 0);
    assert.equal(version.string, 'Unknown Version');
  });

  it('compares versions using major, minor, and build ordering', () => {
    assert.equal(compareVersions('8.0.1116', '8.0.1116'), 0);
    assert.equal(compareVersions('8.0.1118', '8.0.1116'), 1);
    assert.equal(compareVersions('7.8.866', '8.0.1116'), -1);
  });

  it('checks minimum supported version thresholds correctly', () => {
    assert.equal(checkMinimumVersion('8.0.1116', '7.8.0'), true);
    assert.equal(checkMinimumVersion('7.6.0', '7.8.0'), false);
  });

  it('returns compatibility issues for unsupported and unknown versions', () => {
    const unsupported = getCompatibilityInfo('Pike v7.6.0', 'Pike v7.8.0');
    assert.equal(unsupported.compatible, false);
    assert.ok(unsupported.issues.some(issue => issue.includes('Minimum required version is 7.8.0')));
    assert.ok(unsupported.issues.some(issue => issue.includes('Current version is 7.6.0')));

    const unknown = getCompatibilityInfo('Unknown Version');
    assert.equal(unknown.compatible, false);
    assert.ok(unknown.issues.some(issue => issue.includes('Unable to parse Pike version')));
  });
});

describe('Compatibility - String Trim Wrappers', () => {
  beforeEach(() => {
    clearFeatureCache();
  });

  it('uses runtime-compatible trim wrappers and handles unicode whitespace', () => {
    const wrap7 = createTrimWrapper('Pike v7.8.0');
    const wrap8 = createTrimWrapper('Pike v8.0.1116');

    assert.equal(wrap7('\u00A0test\u00A0'), 'test');
    assert.equal(wrap8('  test  '), 'test');
    assert.equal(wrap8('   \t\n   '), '');
  });

  it('provides standalone trim helpers', () => {
    assert.equal(trim('  test  ', 'Pike v8.0.1116'), 'test');
    assert.equal(trim(null, 'Pike v8.0.1116'), '');
    assert.equal(trimLeft('  test  '), 'test  ');
    assert.equal(trimRight('  test  '), '  test');
  });

  it('detects trim runtime strategy without throwing', () => {
    const support = detectTrimSupport();
    assert.equal(typeof support.nativeTrim, 'boolean');
    assert.equal(typeof support.trimAllWhites, 'boolean');
    assert.ok(['native', 'trim_all_whites', 'regex'].includes(support.strategy));
  });
});

describe('Compatibility - Module and Feature Detection', () => {
  beforeEach(() => {
    clearFeatureCache();
  });

  it('detects known modules and rejects unknown modules', () => {
    assert.equal(detectModule('Parser.Pike'), true);
    assert.equal(detectModule('Tools.AutoDoc'), true);
    assert.equal(detectModule('NonExistent.Module'), false);
  });

  it('detects known features with version-aware behavior', () => {
    assert.equal(detectFeature('Parser.Pike.split'), true);
    assert.equal(detectFeatureForVersion('String.trim', 'Pike v7.8.0'), false);
    assert.equal(detectFeatureForVersion('String.trim', 'Pike v8.0.1116'), true);
    assert.equal(detectFeatureForVersion('String.trim_all_whites', 'Pike v7.8.0'), true);
    assert.equal(detectFeatureForVersion('String.trim_all_whites', 'Pike v8.0.1116'), false);
  });

  it('falls back to module-level checks for unknown features', () => {
    assert.equal(detectFeatureForVersion('Parser.Pike.unknownThing', 'Pike v8.0.1116'), true);
    assert.equal(detectFeatureForVersion('Fake.Module.api', 'Pike v8.0.1116'), false);
    assert.equal(detectFeatureForVersion('NoDotFeature', 'Pike v8.0.1116'), false);
  });

  it('builds a version-aware compatibility API layer', () => {
    const layer = createAPILayer('Pike v7.8.866');

    assert.equal(layer.version.major, 7);
    assert.equal(layer.trim('  value  '), 'value');
    assert.equal(layer.trimLeft('  value  '), 'value  ');
    assert.equal(layer.trimRight('  value  '), '  value');
    assert.equal(layer.hasModule('Parser.Pike'), true);
    assert.equal(layer.hasFeature('String.trim'), false);
    assert.equal(layer.hasFeature('String.trim_all_whites'), true);
  });
});
