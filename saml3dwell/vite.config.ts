import path from 'node:path';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';

const repoRoot = path.resolve(__dirname, '..');

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      proj4: path.resolve(__dirname, 'node_modules/proj4'),
    },
    dedupe: ['react', 'react-dom', 'three'],
  },
  server: {
    host: true,
    port: 5174,
    fs: {
      allow: [repoRoot],
    },
  },
  preview: {
    host: true,
    port: 5174,
  },
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
});
