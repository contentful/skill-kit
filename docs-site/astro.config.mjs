import { defineConfig } from 'astro/config';
import mdx from '@astrojs/mdx';
import react from '@astrojs/react';

export default defineConfig({
  site: 'https://contentful.github.io/skill-kit',
  base: '/skill-kit/',
  trailingSlash: 'always',
  output: 'static',
  integrations: [mdx(), react()],
  markdown: {
    shikiConfig: {
      theme: 'github-dark',
    },
  },
});
