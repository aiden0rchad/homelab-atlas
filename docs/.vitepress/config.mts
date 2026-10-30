import { defineConfig } from 'vitepress'

export default defineConfig({
  lang: 'en-US',
  title: 'Homelab Atlas Docs',
  titleTemplate: ':title | Homelab Atlas Docs',
  description: 'Make and export a diagram of your homelab.',
  base: '/homelab-atlas/',
  appearance: 'dark',
  cleanUrls: true,
  lastUpdated: true,
  sitemap: { hostname: 'https://aiden0rchad.github.io/homelab-atlas/' },
  head: [
    ['link', { rel: 'icon', type: 'image/svg+xml', href: '/homelab-atlas/atlas-mark.svg' }],
    ['meta', { name: 'theme-color', content: '#0b1117' }],
  ],
  markdown: { lineNumbers: true },
  themeConfig: {
    logo: { src: '/atlas-mark.svg', alt: 'Homelab Atlas' },
    siteTitle: 'Homelab Atlas Docs',
    nav: [
      { text: 'Install', link: '/getting-started' },
      { text: 'FAQ', link: '/faq' },
      { text: 'Releases', link: '/releases/' },
      { text: 'GitHub', link: 'https://github.com/aiden0rchad/homelab-atlas' },
    ],
    sidebar: [
      {
        text: 'Start here',
        items: [
          { text: 'Getting started', link: '/getting-started' },
          { text: 'Install on Unraid', link: '/unraid' },
          { text: 'Discovery', link: '/discovery' },
          { text: 'Privacy and deployment', link: '/privacy' },
        ],
      },
      {
        text: 'Build a diagram',
        items: [
          { text: 'Editor', link: '/editor' },
          { text: 'Networking', link: '/networking' },
        ],
      },
      {
        text: 'Save and share',
        items: [
          { text: 'Sharing and backup', link: '/sharing' },
          { text: 'Exporting', link: '/exporting' },
        ],
      },
      {
        text: 'Reference',
        items: [
          { text: 'FAQ', link: '/faq' },
          { text: 'Troubleshooting', link: '/troubleshooting' },
          { text: 'Project format', link: '/project-format' },
          { text: 'Releases', link: '/releases/' },
          { text: 'v0.12.0', link: '/releases/v0.12.0' },
          { text: 'v0.11.0', link: '/releases/v0.11.0' },
          { text: 'v0.10.0', link: '/releases/v0.10.0' },
          { text: 'v0.9.0', link: '/releases/v0.9.0' },
          { text: 'v0.8.0', link: '/releases/v0.8.0' },
          { text: 'v0.6.0', link: '/releases/v0.6.0' },
          { text: 'v0.5.0', link: '/releases/v0.5.0' },
          { text: 'v0.4.0', link: '/releases/v0.4.0' },
          { text: 'v0.3.0', link: '/releases/v0.3.0' },
          { text: 'v0.2.0', link: '/releases/v0.2.0' },
          { text: 'v0.1.0', link: '/releases/v0.1.0' },
          { text: 'Development', link: '/development' },
        ],
      },
    ],
    search: { provider: 'local' },
    outline: { level: [2, 3], label: 'On this page' },
    editLink: {
      pattern: 'https://github.com/aiden0rchad/homelab-atlas/edit/main/docs/:path',
      text: 'Edit this page on GitHub',
    },
    lastUpdated: { text: 'Last updated', formatOptions: { dateStyle: 'medium' } },
    socialLinks: [{ icon: 'github', link: 'https://github.com/aiden0rchad/homelab-atlas' }],
    footer: {
      message: 'MIT licensed · <a href="https://github.com/aiden0rchad/homelab-atlas/blob/main/docs/THIRD_PARTY_NOTICES.md">Logo attribution</a>',
      copyright: 'Homelab Atlas contributors',
    },
    darkModeSwitchLabel: 'Theme',
    sidebarMenuLabel: 'Menu',
    returnToTopLabel: 'Back to top',
    externalLinkIcon: true,
  },
})
