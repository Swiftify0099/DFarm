# DFarm Super Admin — Activation Link Routing & Deep-Linking Architecture

## Routing Overview

A critical issue in the previous onboarding workflow was that copying or clicking the activation link failed to load a working web page. The user was greeted by a redirect to `/login` or a blank page.

This document details the router registration, Vite proxy architecture, environment resolution, and robust clipboard handling implemented to ensure deep-linked activation URLs work seamlessly in any browser.

---

## 1. Frontend Router Registration (`/activate`)

### Dairy Admin Portal (`apps/dfarm-dairy-admin/src/App.tsx`)
The `/activate` route is registered as an unauthenticated public route outside of the protected `AdminLayout`:

```tsx
<BrowserRouter>
  <Routes>
    {/* Public Auth Routes */}
    <Route path="/login" element={<Login />} />
    <Route path="/activate" element={<ActivationPage />} />

    {/* Protected Dairy Admin Routes */}
    <Route path="/" element={<AdminLayout />}>
      ...
    </Route>

    {/* Catch-all */}
    <Route path="*" element={<Navigate to="/dashboard" replace />} />
  </Routes>
</BrowserRouter>
```

### Super Admin Portal (`apps/dfarm-super-admin/src/App.tsx`)
To support administrators who copy and paste the link into the same browser session or port (port 5173), `dfarm-super-admin` also registers `/activate`:

```tsx
<BrowserRouter>
  <Routes>
    {/* Public Super Admin Login & Deep-Link Activation */}
    <Route path="/login" element={<LoginPage />} />
    <Route path="/activate" element={<ActivationPage />} />

    {/* Protected Routes */}
    <Route path="/" element={<ProtectedRoute><AppLayout /></ProtectedRoute>}>
      ...
    </Route>
  </Routes>
</BrowserRouter>
```

### Deep-Linking Integrity:
- Because `/activate` is evaluated before any authentication checks or `<AdminLayout />` redirects, query parameters (`?token=...`) are preserved intact.
- The `ActivationPage` mounts immediately, reads the `token` from `useSearchParams()`, and initiates server-side cryptographic validation.

---

## 2. Vite Development Proxies

In local development, the Super Admin portal runs on port `5173`, the Dairy Admin portal on port `5174`, and the backend on port `4000`. To prevent CORS errors during token validation and activation requests, Vite reverse proxies were configured in both applications:

### In `apps/dfarm-dairy-admin/vite.config.ts`:
```typescript
server: {
  port: 5174,
  proxy: {
    '/api': {
      target: 'http://localhost:4000',
      changeOrigin: true,
      secure: false,
    },
  },
}
```

### In `apps/dfarm-super-admin/vite.config.ts`:
```typescript
server: {
  port: 5173,
  proxy: {
    '/api': {
      target: 'http://localhost:4000',
      changeOrigin: true,
      secure: false,
    },
  },
}
```

---

## 3. URL Construction & Base URL Resolution

Activation URLs are constructed strictly using environment configurations rather than hardcoded domain names:

```typescript
// Backend URL resolution in dairies.routes.ts
const webBaseUrl =
  process.env['PUBLIC_ACTIVATION_URL'] ||
  process.env['PUBLIC_WEB_URL'] ||
  (process.env['NODE_ENV'] === 'production'
    ? 'https://dairy.dfarm.in/activate'
    : 'http://localhost:5174/activate');

const activationLink = `${webBaseUrl}?token=${rawToken}&dairyCode=${generatedTenantCode}`;
```

### Environment Conventions:
- **Local Dev:** `http://localhost:5174/activate?token=...`
- **Staging / Docker:** `https://staging-dairy.dfarm.in/activate?token=...`
- **Production:** `https://dairy.dfarm.in/activate?token=...`

---

## 4. Robust Clipboard API with Textarea Fallback

In `CreateDairyModal.tsx` and `DairyDetailPage.tsx`, the **Copy Link** action uses a fail-safe implementation supporting both modern secure contexts and non-secure HTTP / iframe fallbacks:

```typescript
const handleCopyLink = async () => {
  if (!createdResult?.inviteLink) return;
  setCopyError(null);

  try {
    let success = false;
    // 1. Primary: Modern Clipboard API
    if (navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(createdResult.inviteLink);
      success = true;
    } else {
      // 2. Fallback: Invisible textarea selection
      const textArea = document.createElement('textarea');
      textArea.value = createdResult.inviteLink;
      textArea.style.position = 'fixed';
      textArea.style.left = '-999999px';
      textArea.style.top = '-999999px';
      document.body.appendChild(textArea);
      textArea.focus();
      textArea.select();
      success = document.execCommand('copy');
      document.body.removeChild(textArea);
    }

    if (success) {
      setCopiedLink(true);
      setTimeout(() => setCopiedLink(false), 3000);
    } else {
      throw new Error('Clipboard copy failed');
    }
  } catch {
    setCopyError('Unable to copy automatically. Please select the full URL text and press Ctrl+C.');
    setTimeout(() => setCopyError(null), 5000);
  }
};
```
