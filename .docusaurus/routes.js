import React from 'react';
import ComponentCreator from '@docusaurus/ComponentCreator';

export default [
  {
    path: '/pike-lsp/docs',
    component: ComponentCreator('/pike-lsp/docs', '550'),
    routes: [
      {
        path: '/pike-lsp/docs',
        component: ComponentCreator('/pike-lsp/docs', '110'),
        routes: [
          {
            path: '/pike-lsp/docs',
            component: ComponentCreator('/pike-lsp/docs', '8a6'),
            routes: [
              {
                path: '/pike-lsp/docs',
                component: ComponentCreator('/pike-lsp/docs', '0f1'),
                exact: true,
                sidebar: "docsSidebar"
              },
              {
                path: '/pike-lsp/docs/api',
                component: ComponentCreator('/pike-lsp/docs/api', '22d'),
                exact: true,
                sidebar: "docsSidebar"
              },
              {
                path: '/pike-lsp/docs/architecture',
                component: ComponentCreator('/pike-lsp/docs/architecture', '14b'),
                exact: true,
                sidebar: "docsSidebar"
              },
              {
                path: '/pike-lsp/docs/CLA',
                component: ComponentCreator('/pike-lsp/docs/CLA', '4d8'),
                exact: true,
                sidebar: "docsSidebar"
              },
              {
                path: '/pike-lsp/docs/configuration',
                component: ComponentCreator('/pike-lsp/docs/configuration', '534'),
                exact: true,
                sidebar: "docsSidebar"
              },
              {
                path: '/pike-lsp/docs/contributing',
                component: ComponentCreator('/pike-lsp/docs/contributing', 'fed'),
                exact: true,
                sidebar: "docsSidebar"
              },
              {
                path: '/pike-lsp/docs/docs/dev-guide',
                component: ComponentCreator('/pike-lsp/docs/docs/dev-guide', '6ed'),
                exact: true,
                sidebar: "docsSidebar"
              },
              {
                path: '/pike-lsp/docs/features',
                component: ComponentCreator('/pike-lsp/docs/features', '94e'),
                exact: true,
                sidebar: "docsSidebar"
              },
              {
                path: '/pike-lsp/docs/getting-started',
                component: ComponentCreator('/pike-lsp/docs/getting-started', '456'),
                exact: true,
                sidebar: "docsSidebar"
              },
              {
                path: '/pike-lsp/docs/known-bugs',
                component: ComponentCreator('/pike-lsp/docs/known-bugs', 'b2a'),
                exact: true,
                sidebar: "docsSidebar"
              },
              {
                path: '/pike-lsp/docs/troubleshooting',
                component: ComponentCreator('/pike-lsp/docs/troubleshooting', '642'),
                exact: true,
                sidebar: "docsSidebar"
              }
            ]
          }
        ]
      }
    ]
  },
  {
    path: '/pike-lsp/',
    component: ComponentCreator('/pike-lsp/', 'c70'),
    exact: true
  },
  {
    path: '*',
    component: ComponentCreator('*'),
  },
];
