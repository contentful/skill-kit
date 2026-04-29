import { defineConfig } from 'astro/config';
import mdx from '@astrojs/mdx';
import react from '@astrojs/react';

export default defineConfig({
  // TODO: set custom domain or make Pages public so this serves at contentful.github.io/skill-kit/
  site: 'https://contentful.github.io',
  trailingSlash: 'always',
  output: 'static',
  integrations: [mdx(), react()],
  markdown: {
    shikiConfig: {
      theme: 'github-dark',
    },
  },
});
