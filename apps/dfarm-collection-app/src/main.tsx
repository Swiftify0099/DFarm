import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App'
import { pwaService } from './services/pwa-service'

// Initialize PWA Service Worker lifecycle
pwaService.init()

if (import.meta.env.DEV) {
  // Test and diagnostic harness: expose services in development/test only
  Promise.all([
    import('./services/local-storage'),
    import('./services/sync-engine'),
    import('./services/network-manager'),
    import('./services/multi-tab-lock'),
    import('./api/client'),
  ]).then(([{ localDB }, { syncEngine }, { networkManager }, { multiTabLock }, client]) => {
    ;(window as any).__DFARM__ = {
      localDB,
      syncEngine,
      networkManager,
      multiTabLock,
      client,
    }
  }).catch((err) => {
    console.warn('[DFarm Dev] Failed to mount test harness:', err)
  })
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
