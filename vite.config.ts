import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import { defineConfig } from 'vite';

// `base: './'` is important for GitHub Pages project sites, which are served
// from https://<user>.github.io/<repo>/ rather than the domain root. Using a
// relative base makes the built asset URLs work regardless of the repo name.
export default defineConfig(() => {
  return {
    base: './',
    plugins: [react(), tailwindcss()],
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      },
    },
  };
});
