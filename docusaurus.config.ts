import {themes as prismThemes} from 'prism-react-renderer';
import type {Config} from '@docusaurus/types';
import type * as Preset from '@docusaurus/preset-classic';

const config: Config = {
  title: 'Pike LSP',
  tagline: 'Language Server Protocol implementation for Pike',
  url: 'https://thesmuks.github.io',
  baseUrl: '/pike-lsp/',
  onBrokenLinks: 'warn',
  favicon: 'img/favicon.ico',

  // GitHub pages deployment
  organizationName: 'TheSmuks',
  projectName: 'pike-lsp',

  presets: [
    [
      'classic',
      {
        docs: {
          sidebarPath: './sidebars.ts',
          // URL for "Edit this page"
          editUrl: 'https://github.com/TheSmuks/pike-lsp/tree/main/',
          // Show last update time
          showLastUpdateTime: true,
          // Show last update author
          showLastUpdateAuthor: true,
          // Only include markdown files directly in the docs folder
          includeCurrentVersion: true,
          // Exclude planning docs from the build
          exclude: [
            '**/plans/**',
            '**/specs/**',
          ],
        },
        theme: {
          customCss: './src/css/custom.css',
        },
      } satisfies Preset.Options,
    ],
  ],

  themeConfig: {
    // Image for social media
    image: 'img/pike-lsp-social-card.png',
    announcementBar: {
      id: 'alpha_notice',
      content: '⚠️ This project is in alpha. Some features may be incomplete.',
      backgroundColor: '#f5d742',
      textColor: '#000000',
      isCloseable: true,
    },
    navbar: {
      title: 'Pike LSP',
      logo: {
        alt: 'Pike LSP Logo',
        src: 'img/logo.svg',
      },
      items: [
        {
          type: 'docSidebar',
          sidebarId: 'docsSidebar',
          position: 'left',
          label: 'Docs',
        },
        {
          to: '/api/typescript/',
          label: 'API',
          position: 'left',
        },
        {
          to: '/',
          label: 'Home',
          position: 'left',
        },
        {
          href: 'https://github.com/TheSmuks/pike-lsp',
          label: 'GitHub',
          position: 'right',
        },
      ],
    },
    footer: {
      style: 'dark',
      links: [
        {
          title: 'Documentation',
          items: [
            {
              label: 'Getting Started',
              to: '/docs/getting-started',
            },
            {
              label: 'Features',
              to: '/docs/features',
            },
            {
              label: 'Configuration',
              to: '/docs/configuration',
            },
          ],
        },
        {
          title: 'Community',
          items: [
            {
              label: 'GitHub Issues',
              href: 'https://github.com/TheSmuks/pike-lsp/issues',
            },
          ],
        },
        {
          title: 'More',
          items: [
            {
              label: 'CHANGELOG',
              href: 'https://github.com/TheSmuks/pike-lsp/blob/main/CHANGELOG.md',
            },
            {
              label: 'License',
              href: 'https://github.com/TheSmuks/pike-lsp/blob/main/LICENSE',
            },
          ],
        },
      ],
      copyright: `Copyright © ${new Date().getFullYear()} Pike LSP Team. Built with Docusaurus.`,
    },
    prism: {
      theme: prismThemes.github,
      darkTheme: prismThemes.dracula,
    },
    // Algolia DocSearch configuration (optional - can be enabled later)
    // algolia: {
    //   appId: 'YOUR_APP_ID',
    //   apiKey: 'YOUR_SEARCH_API_KEY',
    //   indexName: 'pike-lsp',
    // },
  },

  plugins: [],
  stylesheets: [],
};

export default config;
