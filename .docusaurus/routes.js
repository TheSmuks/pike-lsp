import React from 'react';
import ComponentCreator from '@docusaurus/ComponentCreator';

export default [
  {
    path: '/pike-lsp/docs',
    component: ComponentCreator('/pike-lsp/docs', 'c0b'),
    routes: [
      {
        path: '/pike-lsp/docs',
        component: ComponentCreator('/pike-lsp/docs', 'edb'),
        routes: [
          {
            path: '/pike-lsp/docs',
            component: ComponentCreator('/pike-lsp/docs', '998'),
            routes: [
              {
                path: '/pike-lsp/docs/',
                component: ComponentCreator('/pike-lsp/docs/', 'edb'),
                exact: true,
                sidebar: "docsSidebar"
              },
              {
                path: '/pike-lsp/docs/configuration',
                component: ComponentCreator('/pike-lsp/docs/configuration', '797'),
                exact: true,
                sidebar: "docsSidebar"
              },
              {
                path: '/pike-lsp/docs/contributing',
                component: ComponentCreator('/pike-lsp/docs/contributing', 'dbe'),
                exact: true,
                sidebar: "docsSidebar"
              },
              {
                path: '/pike-lsp/docs/features',
                component: ComponentCreator('/pike-lsp/docs/features', '676'),
                exact: true,
                sidebar: "docsSidebar"
              },
              {
                path: '/pike-lsp/docs/getting-started',
                component: ComponentCreator('/pike-lsp/docs/getting-started', '855'),
                exact: true,
                sidebar: "docsSidebar"
              },
              {
                path: '/pike-lsp/docs/troubleshooting',
                component: ComponentCreator('/pike-lsp/docs/troubleshooting', '945'),
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
