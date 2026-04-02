import type { SidebarsConfig } from '@docusaurus/plugin-content-docs';

const sidebars: SidebarsConfig = {
  docsSidebar: [
    {
      type: 'doc',
      id: 'index',
      label: 'Welcome',
    },
    {
      type: 'category',
      label: 'Getting Started',
      collapsed: false,
      items: ['getting-started', 'configuration', 'troubleshooting'],
    },
    {
      type: 'category',
      label: 'User Guide',
      collapsed: true,
      items: ['features', 'architecture', 'known-bugs'],
    },
    {
      type: 'category',
      label: 'Development',
      collapsed: true,
      items: ['contributing', 'api', 'dev-guide/dev-guide', 'architecture'],
    },
    {
      type: 'category',
      label: 'Project',
      collapsed: true,
      items: [
        {
          type: 'doc',
          id: 'CLA',
          label: 'Contributor License Agreement',
        },
      ],
    },
  ],
};

export default sidebars;
