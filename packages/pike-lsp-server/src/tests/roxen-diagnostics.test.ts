import { describe, expect, it } from 'bun:test';
import { provideRoxenDiagnostics } from '../features/roxen/diagnostics.js';

describe('provideRoxenDiagnostics', () => {
  it('resolves superseded debounced requests instead of leaving them pending', async () => {
    const bridge = {
      roxenValidate: async () => ({ diagnostics: [] }),
    };

    const first = provideRoxenDiagnostics('file:///a.pike', 'inherit "module";', bridge, 100);
    const second = provideRoxenDiagnostics(
      'file:///a.pike',
      'inherit "module";\nconstant module_type = MODULE_TAG;',
      bridge,
      0
    );

    const [firstResult, secondResult] = await Promise.all([first, second]);
    expect(firstResult).toEqual([]);
    expect(secondResult).toEqual([]);
  });

  it('keeps newer pending debounce entry when older in-flight request finishes', async () => {
    let resolveFirstCall: (() => void) | null = null;
    let callCount = 0;

    const bridge = {
      roxenValidate: async () => {
        callCount += 1;
        if (callCount === 1) {
          await new Promise<void>(resolve => {
            resolveFirstCall = resolve;
          });
        }
        return { diagnostics: [] };
      },
    };

    const first = provideRoxenDiagnostics('file:///race.pike', 'inherit "module";', bridge, 0);
    await Bun.sleep(5);

    const second = provideRoxenDiagnostics(
      'file:///race.pike',
      'inherit "module";\nconstant module_type = MODULE_TAG;',
      bridge,
      100
    );

    if (resolveFirstCall) {
      resolveFirstCall();
    }
    await first;

    const third = provideRoxenDiagnostics(
      'file:///race.pike',
      'inherit "module";\nvoid create(){}',
      bridge,
      0
    );

    const [secondResult, thirdResult] = await Promise.all([second, third]);
    expect(secondResult).toEqual([]);
    expect(thirdResult).toEqual([]);
  });
});
