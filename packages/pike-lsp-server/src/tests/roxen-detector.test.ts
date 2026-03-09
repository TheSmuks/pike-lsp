import { describe, expect, it } from 'bun:test';
import { detectRoxenModule } from '../features/roxen/detector.js';

describe('detectRoxenModule', () => {
  it('skips bridge call for plain Pike files without Roxen markers', async () => {
    let called = false;
    const bridge = {
      roxenDetect: async () => {
        called = true;
        return { is_roxen_module: 0 };
      },
    };

    const result = await detectRoxenModule(
      'int main() { return 0; }',
      'file:///plain.pike',
      bridge
    );

    expect(result).toBeNull();
    expect(called).toBeFalse();
  });

  it('calls bridge when file has Roxen markers', async () => {
    let called = false;
    const bridge = {
      roxenDetect: async () => {
        called = true;
        return {
          is_roxen_module: 1,
          module_type: ['MODULE_TAG'],
          inherits: ['module'],
          module_name: 'test',
          tags: [],
          variables: [],
          lifecycle: {
            callbacks: [],
            has_create: 0,
            has_start: 0,
            has_stop: 0,
            has_status: 0,
          },
        };
      },
    };

    const result = await detectRoxenModule(
      'inherit "module";\nconstant module_type = MODULE_TAG;',
      'file:///roxen-module.pike',
      bridge
    );

    expect(called).toBeTrue();
    expect(result?.is_roxen_module).toBe(1);
  });

  it('calls bridge for module.h include marker', async () => {
    let called = false;
    const bridge = {
      roxenDetect: async () => {
        called = true;
        return { is_roxen_module: 0 };
      },
    };

    const result = await detectRoxenModule(
      '#include "module.h"\nint x;',
      'file:///include-only.pike',
      bridge
    );

    expect(called).toBeTrue();
    expect(result).toBeNull();
  });
});
