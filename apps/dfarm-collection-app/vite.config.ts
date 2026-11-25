/// <reference types="vitest" />
import { defineConfig, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import path from 'path'
import fs from 'node:fs'
import { fileURLToPath } from 'url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

/**
 * Custom middleware to serve ONNX WebAssembly (.wasm) and ESM loader (.mjs) files
 * directly before Vite's transform middleware intercepts dynamic import() queries (?import).
 * This prevents Vite from throwing:
 * "Failed to load url ... This file is in /public and will be copied as-is during build without going through plugin transforms"
 */
function onnxWasmMiddlewarePlugin(): Plugin {
  return {
    name: 'onnx-wasm-middleware',
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const rawUrl = req.url || ''
        const cleanPath = rawUrl.split('?')[0]
        if (cleanPath.startsWith('/ort-wasm') || cleanPath.startsWith('/ort.')) {
          const filePath = path.resolve(__dirname, './public', '.' + cleanPath)
          if (fs.existsSync(filePath) && fs.statSync(filePath).isFile()) {
            const ext = path.extname(filePath)
            if (ext === '.mjs' || ext === '.js') {
              res.setHeader('Content-Type', 'application/javascript; charset=utf-8')
            } else if (ext === '.wasm') {
              res.setHeader('Content-Type', 'application/wasm')
            }
            res.setHeader('Cross-Origin-Opener-Policy', 'same-origin')
            res.setHeader('Cross-Origin-Embedder-Policy', 'require-corp')
            res.setHeader('Access-Control-Allow-Origin', '*')
            const content = fs.readFileSync(filePath)
            res.end(content)
            return
          }
        }
        next()
      })
    },
  }
}

function dfarmPwaPlugin(): Plugin {
  return {
    name: 'dfarm-pwa-builder',
    closeBundle() {
      const distDir = path.resolve(__dirname, './dist')
      const distIndex = path.resolve(distDir, 'index.html')
      const dist200 = path.resolve(distDir, '200.html')
      const distSw = path.resolve(distDir, 'sw.js')
      const assetsDir = path.resolve(distDir, 'assets')

      // 1. Cloudflare Pages SPA 200.html fallback
      if (fs.existsSync(distIndex)) {
        fs.copyFileSync(distIndex, dist200)
      }

      // 2. Precache Asset Discovery & Service Worker Injection
      if (fs.existsSync(distSw) && fs.existsSync(assetsDir)) {
        const files = fs.readdirSync(assetsDir)
        // Only precache core JS and CSS chunks (EXCLUDE large wasm, onnx, map)
        const precacheAssets = files
          .filter((f) => (f.endsWith('.js') || f.endsWith('.css')) && !f.endsWith('.map'))
          .map((f) => `/assets/${f}`)

        const buildVersion = `v1.0.${Date.now().toString(36)}`
        let swContent = fs.readFileSync(distSw, 'utf-8')
        swContent = swContent.replace(
          "const BUILD_VERSION = '__DFARM_BUILD_VERSION__';",
          `const BUILD_VERSION = '${buildVersion}';`
        )
        swContent = swContent.replace(
          'const INJECTED_ASSETS = __DFARM_PRECACHE_ASSETS__;',
          `const INJECTED_ASSETS = ${JSON.stringify(precacheAssets)};`
        )
        fs.writeFileSync(distSw, swContent, 'utf-8')
      }
    },
  }
}

// https://vite.dev/config/
export default defineConfig({
  plugins: [onnxWasmMiddlewarePlugin(), dfarmPwaPlugin(), react(), tailwindcss()],
  assetsInclude: ['**/*.onnx'],
  server: {
    port: 5175,
    headers: {
      'Cross-Origin-Opener-Policy': 'same-origin',
      'Cross-Origin-Embedder-Policy': 'require-corp',
    },
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
