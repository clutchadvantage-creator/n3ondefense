import { defineConfig, type UserConfig } from 'vite';

export const n3onViteConfig: UserConfig = {
  server: {
    watch: {
      // Some Windows setups lock active audio files and crash chokidar with EBUSY.
      ignored: ['**/public/assets/audio/**']
    }
  },
  build: {
    chunkSizeWarningLimit: 1300,
    rollupOptions: {
      output: {
        manualChunks(id: string): string | undefined {
          if (id.includes('node_modules/phaser')) return 'phaser-vendor';
          if (id.includes('node_modules')) return 'vendor';
          return undefined;
        }
      }
    }
  }
};

export default defineConfig(n3onViteConfig);
