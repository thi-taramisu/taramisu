import type {Config} from '@docusaurus/types';
import type * as Preset from '@docusaurus/preset-classic';
import {themes as prismThemes} from 'prism-react-renderer';

// Public build-time settings. No credentials belong in these variables.
const siteUrl = process.env.DOCS_SITE_URL || 'http://localhost:3001';
const baseUrl = process.env.DOCS_BASE_URL || '/';
// Optional: set the complete verified repository URL, without a trailing slash.
// The supplied screenshot does not identify the repository name.
const repositoryUrl = process.env.DOCS_REPOSITORY_URL?.replace(/\/+$/, '');

const parsedUrl = new URL(siteUrl);
if (!['http:', 'https:'].includes(parsedUrl.protocol) ||
    parsedUrl.pathname !== '/' || parsedUrl.search || parsedUrl.hash ||
    parsedUrl.username || parsedUrl.password) {
  throw new Error('DOCS_SITE_URL must be an http(s) origin, without a path or credentials.');
}
if (!/^\/(?:[A-Za-z0-9_-]+\/)*$/.test(baseUrl)) {
  throw new Error('DOCS_BASE_URL must be / or a path such as /docs/ with both slashes.');
}

const config: Config = {
  title: 'Taramisu',
  tagline: 'Documentation for the TARA prototype',
  favicon: 'img/favicon.svg',
  url: parsedUrl.origin,
  baseUrl,
  trailingSlash: true,
  onBrokenLinks: 'throw',
  onBrokenAnchors: 'throw',
  i18n: {
    defaultLocale: 'en',
    locales: ['en'],
    localeConfigs: {en: {label: 'English', htmlLang: 'en'}},
  },
  markdown: {
    // Ordinary .md files stay Markdown; .mdx is an explicit opt-in.
    format: 'detect',
    hooks: {
      onBrokenMarkdownLinks: 'throw',
      onBrokenMarkdownImages: 'throw',
    },
  },
  presets: [
    [
      'classic',
      {
        docs: {
          // Intentionally select external content, never the whole docs folder.
          path: '../docs/external',
          routeBasePath: '/',
          sidebarPath: './sidebars.ts',
          ...(repositoryUrl
            ? {editUrl: `${repositoryUrl}/edit/main/docs/external/`}
            : {}),
          showLastUpdateAuthor: false,
          showLastUpdateTime: false,
        },
        blog: false,
        pages: false,
        // Enable once the deployment origin is agreed, then rebuild.
        sitemap: false,
        theme: {customCss: './src/css/custom.css'},
      } satisfies Preset.Options,
    ],
  ],
  themeConfig: {
    navbar: {
      title: 'Taramisu Docs',
      logo: {alt: 'Taramisu', src: 'img/favicon.svg'},
      items: [
        {type: 'docSidebar', sidebarId: 'externalDocs', position: 'left', label: 'Documentation'},
        {type: 'doc', docId: 'reference/api', position: 'left', label: 'API'},
        ...(repositoryUrl ? [{href: repositoryUrl, label: 'GitHub', position: 'right' as const}] : []),
      ],
    },
    footer: {
      style: 'dark',
      copyright: 'Taramisu · THI university project · Prototype documentation',
    },
    colorMode: {respectPrefersColorScheme: true},
    prism: {
      theme: prismThemes.github,
      darkTheme: prismThemes.dracula,
      additionalLanguages: ['bash', 'json', 'yaml', 'go'],
    },
  } satisfies Preset.ThemeConfig,
};

export default config;
