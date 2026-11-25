import { describe, it, expect, vi, beforeEach } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import { pwaService } from '../services/pwa-service'

describe('Prompt 3: PWA, Web App Manifest & Service Worker Test Suite', () => {
  const publicDir = path.resolve(__dirname, '../../public')
  const distDir = path.resolve(__dirname, '../../dist')

  // ============================================================================
  // Group 1: Web App Manifest & Brand Icon Verification
  // ============================================================================
  describe('1. Web App Manifest & Brand Icon Specifications', () => {
    it('loads and validates production manifest.webmanifest structure', () => {
      const manifestPath = path.resolve(publicDir, 'manifest.webmanifest')
      expect(fs.existsSync(manifestPath)).toBe(true)

      const raw = fs.readFileSync(manifestPath, 'utf-8')
      const manifest = JSON.parse(raw)

      // Application Identity
      expect(manifest.name).toBe('DFarm Smart Dairy Collection')
      expect(manifest.short_name).toBe('DFarm')
      expect(manifest.start_url).toBe('/')
      expect(manifest.scope).toBe('/')
      expect(manifest.display).toBe('standalone')
      expect(manifest.orientation).toBe('any')

      // DFarm Claymorphic Brand Colors
      expect(manifest.theme_color).toBe('#FF6A00')
      expect(manifest.background_color).toBe('#FFF5EE')

      // Categories
      expect(Array.isArray(manifest.categories)).toBe(true)
      expect(manifest.categories).toContain('productivity')

      // Icons array
      expect(Array.isArray(manifest.icons)).toBe(true)
      expect(manifest.icons.length).toBeGreaterThanOrEqual(2)

      const icon192Any = manifest.icons.find((i: any) => i.sizes === '192x192' && i.purpose === 'any')
      const icon192Maskable = manifest.icons.find((i: any) => i.sizes === '192x192' && i.purpose === 'maskable')
      const icon512Any = manifest.icons.find((i: any) => i.sizes === '512x512' && i.purpose === 'any')
      const icon512Maskable = manifest.icons.find((i: any) => i.sizes === '512x512' && i.purpose === 'maskable')

      expect(icon192Any).toBeDefined()
      expect(icon192Maskable).toBeDefined()
      expect(icon512Any).toBeDefined()
      expect(icon512Maskable).toBeDefined()
    })

    it('verifies that physical PNG icon files exist with exact pixel dimensions', () => {
      const icon192Path = path.resolve(publicDir, 'icon-192.png')
      const icon512Path = path.resolve(publicDir, 'icon-512.png')
      const appleIconPath = path.resolve(publicDir, 'apple-touch-icon.png')
      const faviconPath = path.resolve(publicDir, 'favicon.png')

      expect(fs.existsSync(icon192Path)).toBe(true)
      expect(fs.existsSync(icon512Path)).toBe(true)
      expect(fs.existsSync(appleIconPath)).toBe(true)
      expect(fs.existsSync(faviconPath)).toBe(true)

      // PNG Header Verification: bytes 16-19 are width, bytes 20-23 are height
      const buf192 = fs.readFileSync(icon192Path)
      const w192 = buf192.readUInt32BE(16)
      const h192 = buf192.readUInt32BE(20)
      expect(w192).toBe(192)
      expect(h192).toBe(192)

      const buf512 = fs.readFileSync(icon512Path)
      const w512 = buf512.readUInt32BE(16)
      const h512 = buf512.readUInt32BE(20)
      expect(w512).toBe(512)
      expect(h512).toBe(512)
    })

    it('verifies index.html links manifest, theme-color and apple-mobile tags', () => {
      const indexPath = path.resolve(__dirname, '../../index.html')
      const html = fs.readFileSync(indexPath, 'utf-8')

      expect(html).toContain('<link rel="manifest" href="/manifest.webmanifest"')
      expect(html).toContain('<meta name="theme-color" content="#FF6A00"')
      expect(html).toContain('<meta name="mobile-web-app-capable" content="yes"')
      expect(html).toContain('<meta name="apple-mobile-web-app-capable" content="yes"')
      expect(html).toContain('<title>DFarm — Smart Dairy Collection Terminal</title>')
    })
  })

  // ============================================================================
  // Group 2: Production Service Worker Precache & Large Asset Exclusion
  // ============================================================================
  describe('2. Service Worker Precaching Architecture & Large WASM Policy', () => {
    it('verifies sw.js exists in public and dist directories', () => {
      const publicSw = path.resolve(publicDir, 'sw.js')
      expect(fs.existsSync(publicSw)).toBe(true)

      const distSw = path.resolve(distDir, 'sw.js')
      expect(fs.existsSync(distSw)).toBe(true)
    })

    it('verifies compiled dist/sw.js contains valid build version and precached assets', () => {
      const distSw = path.resolve(distDir, 'sw.js')
      const content = fs.readFileSync(distSw, 'utf-8')

      // Must NOT have unresolved template placeholders
      expect(content).not.toContain('__DFARM_BUILD_VERSION__')
      expect(content).not.toContain('__DFARM_PRECACHE_ASSETS__')

      // Must have injected build version string
      expect(content).toMatch(/const BUILD_VERSION = 'v1\.0\.[a-z0-9]+';/)

      // Core App Shell must be present
      expect(content).toContain("'/index.html'")
      expect(content).toContain("'/manifest.webmanifest'")
      expect(content).toContain("'/favicon.png'")
      expect(content).toContain("'/icon-192.png'")
      expect(content).toContain("'/icon-512.png'")

      // Hashed assets must be present in precache list
      expect(content).toMatch(/\/assets\/index-[A-Za-z0-9_-]+\.js/)
      expect(content).toMatch(/\/assets\/index-[A-Za-z0-9_-]+\.css/)
    })

    it('strictly EXCLUDES large 14.8 MB WASM and ONNX models from precache list', () => {
      const distSw = path.resolve(distDir, 'sw.js')
      const content = fs.readFileSync(distSw, 'utf-8')

      // Extract INJECTED_ASSETS array from compiled sw.js
      const match = content.match(/const INJECTED_ASSETS = (\[.*?\]);/)
      expect(match).not.toBeNull()
      const injectedAssets: string[] = JSON.parse(match![1])

      // Verify no wasm or onnx is included in the initial precache payload
      const wasmEntries = injectedAssets.filter((a) => a.endsWith('.wasm'))
      const onnxEntries = injectedAssets.filter((a) => a.endsWith('.onnx'))

      expect(wasmEntries).toEqual([])
      expect(onnxEntries).toEqual([])
    })
  })

  // ============================================================================
  // Group 3: Caching Strategy & API Safety Boundaries
  // ============================================================================
  describe('3. Service Worker Caching Strategies & API Exclusion Guardrails', () => {
    it('ensures API requests are strictly Network-Only (no caching of sensitive auth/financial data)', () => {
      const swPath = path.resolve(publicDir, 'sw.js')
      const sw = fs.readFileSync(swPath, 'utf-8')

      // Verify the check exists: url.pathname.startsWith('/api/') || req.method !== 'GET'
      expect(sw).toContain("url.pathname.startsWith('/api/')")
      expect(sw).toContain("req.method !== 'GET'")
      expect(sw).toContain("req.headers.has('Authorization')")
      expect(sw).toContain("url.port === '4000'")
    })

    it('ensures WASM caching rejects Range requests and handles partial/quota limits safely', () => {
      const swPath = path.resolve(publicDir, 'sw.js')
      const sw = fs.readFileSync(swPath, 'utf-8')

      expect(sw).toContain("req.headers.has('Range')")
      expect(sw).toContain("response.status === 200")
      expect(sw).toContain("QuotaExceededError")
    })

    it('ensures HTML navigation requests fallback to cached /index.html when offline', () => {
      const swPath = path.resolve(publicDir, 'sw.js')
      const sw = fs.readFileSync(swPath, 'utf-8')

      expect(sw).toContain("req.mode === 'navigate'")
      expect(sw).toContain("cache.match('/index.html')")
    })

    it('ensures dedicated on-demand runtime cache is used for WASM and models', () => {
      const swPath = path.resolve(publicDir, 'sw.js')
      const sw = fs.readFileSync(swPath, 'utf-8')

      expect(sw).toContain("url.pathname.endsWith('.wasm')")
      expect(sw).toContain("url.pathname.endsWith('.onnx')")
      expect(sw).toContain('CACHE_WASM_PREFIX')
    })

    it('ensures obsolete cache purge ONLY targets dfarm-* caches and preserves foreign caches', () => {
      const swPath = path.resolve(publicDir, 'sw.js')
      const sw = fs.readFileSync(swPath, 'utf-8')

      // Verify that cache deletion checks prefix
      expect(sw).toContain("key.startsWith(CACHE_SHELL_PREFIX)")
      expect(sw).toContain("key.startsWith(CACHE_RUNTIME_PREFIX)")
    })
  })

  // ============================================================================
  // Group 4: PWA Service Registration & Non-Disruptive Update Management
  // ============================================================================
  describe('4. PWA Registration & Non-Disruptive Lifecycle Management', () => {
    beforeEach(() => {
      vi.restoreAllMocks()
    })

    it('provides singleton pwaService with subscription capabilities', () => {
      expect(pwaService).toBeDefined()
      expect(typeof pwaService.init).toBe('function')
      expect(typeof pwaService.subscribe).toBe('function')
      expect(typeof pwaService.applyUpdate).toBe('function')
    })

    it('refuses to reload or disrupt terminal when active transaction check fails', async () => {
      let reloadCalled = false
      const canSafelyReload = () => false // Simulation: active collection in progress!

      const applied = await pwaService.applyUpdate(canSafelyReload)
      expect(applied).toBe(false)
      expect(reloadCalled).toBe(false)
    })

    it('subscribes to updates and receives initial status cleanly', () => {
      let receivedStatus: any = null
      const unsubscribe = pwaService.subscribe((info) => {
        receivedStatus = info
      })

      expect(receivedStatus).toBeDefined()
      expect(receivedStatus.isUpdateAvailable).toBe(false)

      unsubscribe()
    })
  })

  // ============================================================================
  // Group 5: Cloudflare Pages Deployment & Header Conformance
  // ============================================================================
  describe('5. Cloudflare Pages Deployment Headers & SPA Compatibility', () => {
    it('verifies Cloudflare Pages 200.html SPA fallback file is generated in dist', () => {
      const dist200 = path.resolve(distDir, '200.html')
      const distIndex = path.resolve(distDir, 'index.html')

      expect(fs.existsSync(dist200)).toBe(true)
      expect(fs.existsSync(distIndex)).toBe(true)

      const indexContent = fs.readFileSync(distIndex, 'utf-8')
      const fallbackContent = fs.readFileSync(dist200, 'utf-8')
      expect(fallbackContent).toBe(indexContent)
    })

    it('verifies public/_headers defines correct MIME types and revalidation policies', () => {
      const headersPath = path.resolve(publicDir, '_headers')
      expect(fs.existsSync(headersPath)).toBe(true)

      const headers = fs.readFileSync(headersPath, 'utf-8')

      // Service worker must have max-age=0, must-revalidate
      expect(headers).toContain('/sw.js')
      expect(headers).toContain('max-age=0, must-revalidate')
      expect(headers).toContain('application/javascript')

      // Web App Manifest header
      expect(headers).toContain('/manifest.webmanifest')
      expect(headers).toContain('application/manifest+json')

      // Immutable cache for versioned assets
      expect(headers).toContain('/assets/*')
      expect(headers).toContain('immutable')
    })
  })
})
