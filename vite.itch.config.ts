import { defineConfig, mergeConfig } from 'vite';
import { n3onViteConfig } from './vite.config.ts';

export default defineConfig(
  mergeConfig(n3onViteConfig, {
    base: './',
    build: {
      outDir: 'dist-itch'
    }
  })
);
