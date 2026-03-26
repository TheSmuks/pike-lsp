import { describe, it, expect } from 'bun:test';
import { uriToFsPath } from '../../utils/uri-path.js';

describe('document links URI decoding regression', () => {
  it('decodes encoded characters in file URI paths', () => {
    expect(uriToFsPath('file:///workspace/my%20file.pike')).toBe('/workspace/my file.pike');
  });

  it('keeps double-leading slash shape after scheme removal', () => {
    expect(uriToFsPath('file:////server/share/module.pike')).toBe('//server/share/module.pike');
  });

  it('preserves Windows-like drive URI shape', () => {
    expect(uriToFsPath('file:///C:/workspace/module.pike')).toBe('/C:/workspace/module.pike');
  });
});
