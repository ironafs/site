// @ts-check
import { defineConfig } from 'astro/config';
import sitemap from '@astrojs/sitemap';

export default defineConfig({
  site: 'https://www.ironafs.org/',
  output: 'static',
  trailingSlash: 'always',
  integrations: [sitemap({ filter: page => !/^\/404(?:\/|\.html)?$/.test(new URL(page).pathname) })],
  // inlineStylesheets: 'never' keeps every stylesheet external for style-src 'self'.
  build: { format: 'directory', inlineStylesheets: 'never' },
  // Keep even small processed scripts external for script-src 'self'.
  vite: { build: { assetsInlineLimit: 0 } },
});
