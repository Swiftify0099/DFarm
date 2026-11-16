/// <reference types="vitest" />
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import path from 'path'
import { fileURLToPath } from 'url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  assetsInclude: ['**/*.onnx'],
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://localhost:4000',
        changeOrigin: true,
      },
    },
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
    // Force a single React instance across the monorepo.
    // Without this, Vite pre-bundles @tanstack/react-query against the root
    // node_modules/react while the app bundle uses the local react copy,
    // producing two React instances → "Invalid hook call" / useEffect null crash.
    dedupe: ['react', 'react-dom', 'react-dom/client'],
  },
  // Explicitly include deps that need to be pre-bundled together with the
  // deduplicated React so esbuild uses one consistent react reference.
  optimizeDeps: {
    include: [
      'react',
      'react-dom',
      'react-dom/client',
      '@tanstack/react-query',
      'react-router-dom',
    ],
    force: false, // set to true temporarily if the error ever reappears after a cold start
  },
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
  },
} as any)
