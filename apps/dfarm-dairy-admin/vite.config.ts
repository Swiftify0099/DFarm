/// <reference types="vitest" />
import { defineConfig, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import path from 'path'
import fs from 'node:fs'
import { fileURLToPath } from 'url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

function cloudflareSpaFallbackPlugin(): Plugin {
  return {
    name: 'cloudflare-spa-fallback',
    closeBundle() {
      const distIndex = path.resolve(__dirname, './dist/index.html')
      const dist200 = path.resolve(__dirname, './dist/200.html')
      if (fs.existsSync(distIndex)) {
        fs.copyFileSync(distIndex, dist200)
      }
    },
  }
}

// https://vite.dev/config/
export default defineConfig({
  plugins: [cloudflareSpaFallbackPlugin(), react(), tailwindcss()],
  server: {
    port: 5174,
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
    dedupe: ['react', 'react-dom', 'react-dom/client'],
  },
  optimizeDeps: {
    include: [
      'react',
      'react-dom',
      'react-dom/client',
      '@tanstack/react-query',
      'react-router-dom',
    ],
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks: (id: string) => {
          if (id.includes('node_modules')) {
            if (id.includes('react') || id.includes('react-dom') || id.includes('react-router')) {
              return 'vendor-react'
            }
            if (id.includes('@tanstack')) {
              return 'vendor-query'
            }
            if (id.includes('recharts') || id.includes('d3-') || id.includes('victory')) {
              return 'vendor-charts'
            }
            if (id.includes('zod') || id.includes('react-hook-form') || id.includes('@hookform')) {
              return 'vendor-forms'
            }
            return 'vendor'
          }
        },
      },
    },
  },
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
  },
} as any)
