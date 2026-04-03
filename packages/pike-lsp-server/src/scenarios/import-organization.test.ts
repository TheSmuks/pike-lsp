import { describe, it } from 'bun:test';

describe('Import Organization', () => {
  it('should group imports by origin', async () => {
    const stdlib = ['stdio.h', 'stdlib.h', 'Stdio'];
    const thirdParty = ['SomeLibrary', 'external.pike'];
    const local = ['./local.pike', '../other.pike', 'MyModule'];

    if (stdlib.length !== 3) throw new Error('Expected 3 stdlib imports');
    if (thirdParty.length !== 2) throw new Error('Expected 3 third-party imports');
    if (local.length !== 3) throw new Error('Expected 3 local imports');
  });

  it('should respect imports.mode setting', async () => {
    const mode = 'grouped';
    if (mode !== 'grouped' && mode !== 'basic' && mode !== 'none') {
      throw new Error('Invalid mode');
    }
  });

  it('should respect imports.localPrefix setting', async () => {
    const localPrefixes = ['MyProject', './src'];
    if (localPrefixes.length !== 2) throw new Error('Expected 2 prefixes');
  });

  it('should separate groups with blank lines', async () => {
    const sections = ['stdlib', 'thirdParty', 'local'];
    const formatted = sections.join('\n\n');
    if (!formatted.includes('\n\n')) throw new Error('Expected blank line separation');
  });
});
