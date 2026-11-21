import { defineConfig } from 'vitest/config'
import { loadEnv, type Plugin } from 'vite'
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
export default defineConfig(({ mode }) => {
  // Load workspace root .env as well as local .env
  const rootEnv = loadEnv(mode, path.resolve(__dirname, '../../'), '')
  const localEnv = loadEnv(mode, __dirname, '')
  const env = { ...rootEnv, ...localEnv }

  return {
    define: {
      'import.meta.env.VITE_GOOGLE_MAPS_API_KEY': JSON.stringify(
        env.VITE_GOOGLE_MAPS_API_KEY || ''
      ),
      'import.meta.env.VITE_API_BASE_URL': JSON.stringify(
        env.VITE_API_BASE_URL || env.VITE_API_URL || (mode === 'production' ? 'https://dfarm-backend.onrender.com/api/v1' : 'http://localhost:4000/api/v1')
      ),
      'import.meta.env.VITE_API_URL': JSON.stringify(
        env.VITE_API_BASE_URL || env.VITE_API_URL || (mode === 'production' ? 'https://dfarm-backend.onrender.com/api/v1' : 'http://localhost:4000/api/v1')
      ),
    },
    plugins: [
      cloudflareSpaFallbackPlugin(),
      tailwindcss(),
      react(),
    ],
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
      alias: [
        { find: '@', replacement: path.resolve(__dirname, './src') },
        { find: /^react$/, replacement: path.resolve(__dirname, '../../node_modules/react') },
        { find: /^react\/(.*)$/, replacement: path.resolve(__dirname, '../../node_modules/react/$1') },
        { find: /^react-dom$/, replacement: path.resolve(__dirname, '../../node_modules/react-dom') },
        { find: /^react-dom\/(.*)$/, replacement: path.resolve(__dirname, '../../node_modules/react-dom/$1') },
      ],
      dedupe: ['react', 'react-dom'],
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
          // Split vendor libraries into separate cacheable chunks
          manualChunks: (id) => {
            if (id.includes('node_modules')) {
              if (id.includes('react') || id.includes('react-dom') || id.includes('react-router')) {
                return 'vendor-react'
              }
              if (id.includes('@tanstack')) {
                return 'vendor-query'
              }
              if (id.includes('@googlemaps') || id.includes('google.maps')) {
                return 'vendor-maps'
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
      server: {
        deps: {
          inline: [/react/],
        },
      },
    },
  }
})
