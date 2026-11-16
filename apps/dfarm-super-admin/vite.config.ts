import { defineConfig } from 'vitest/config'
import { loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import path from 'path'
import { fileURLToPath } from 'url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

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
      'import.meta.env.VITE_API_URL': JSON.stringify(
        env.VITE_API_URL || 'http://localhost:4000/api/v1'
      ),
    },
    plugins: [
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
