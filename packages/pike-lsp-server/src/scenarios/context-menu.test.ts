import { describe, it } from 'bun:test';

async function readWorkspaceFile(relativePath: string): Promise<string> {
  const moduleUrl = (import.meta as any).url as string;
  const moduleDir = new (globalThis as any).URL('.', moduleUrl);
  const candidates = [
    `../../../../${relativePath}`,
    `../../../${relativePath}`,
    `../../../../../${relativePath}`,
  ];

  for (const candidate of candidates) {
    try {
      const url = new (globalThis as any).URL(candidate, moduleDir);
      const response = await (globalThis as any).fetch(url);
      if (response.ok) {
        return await response.text();
      }
    } catch {}
  }

  throw new Error(`Unable to locate workspace file: ${relativePath}`);
}

describe('Scenario: Pike editor context menu contributions', () => {
  it('registers Pike commands behind settings toggles for .pike and .pmod files', async () => {
    const packageJson = JSON.parse(
      await readWorkspaceFile('packages/vscode-pike/package.json')
    ) as {
      contributes: {
        menus: {
          'editor/context': Array<{
            command: string;
            when: string;
          }>;
        };
        configuration: {
          properties: Record<string, unknown>;
        };
      };
    };

    const properties = packageJson.contributes.configuration.properties;
    if (!properties['pike.editorContextMenu.showRun']) {
      throw new Error('missing pike.editorContextMenu.showRun');
    }
    if (!properties['pike.editorContextMenu.showTest']) {
      throw new Error('missing pike.editorContextMenu.showTest');
    }
    if (!properties['pike.editorContextMenu.showOrganizeImports']) {
      throw new Error('missing pike.editorContextMenu.showOrganizeImports');
    }

    const actual = packageJson.contributes.menus['editor/context'].map(menu => ({
      command: menu.command,
      when: menu.when,
    }));
    const expected = [
      {
        command: 'pike.lsp.runFile',
        when: 'resourceLangId == pike && config.pike.editorContextMenu.showRun',
      },
      {
        command: 'pike.lsp.runFileTests',
        when: 'resourceLangId == pike && config.pike.editorContextMenu.showTest',
      },
      {
        command: 'pike.lsp.organizeImports',
        when: 'resourceLangId == pike && config.pike.editorContextMenu.showOrganizeImports',
      },
    ];

    if (JSON.stringify(actual) !== JSON.stringify(expected)) {
      throw new Error(`unexpected editor/context menu contributions: ${JSON.stringify(actual)}`);
    }
  });
});
