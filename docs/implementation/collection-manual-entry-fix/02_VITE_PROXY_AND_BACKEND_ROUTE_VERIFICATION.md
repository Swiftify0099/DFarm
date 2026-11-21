# VITE PROXY AND BACKEND ROUTE VERIFICATION

**Reference:** DFARM-COLLECTION-MANUAL-ENTRY-409-FIX  
**Target:** `http://localhost:5175/api/*` -> `http://localhost:4000/api/*`  
**Execution Context:** Verification of frontend development proxy and backend route dispatching

---

## 1. Vite Proxy Configuration Audit

### File Inspected: `apps/dfarm-collection-app/vite.config.ts`

```ts
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  server: {
    port: 5175,
    host: true,
    proxy: {
      '/api': {
        target: 'http://localhost:4000',
        changeOrigin: true,
      },
    },
  },
})
```

### Analysis
- **Port:** Vite development server runs on port `5175`.
- **Target:** Directs all `/api/*` requests to `http://localhost:4000`.
- **Path Rewriting:** No path rewriting is applied; `/api/v1/collections/transactions` is forwarded verbatim to `http://localhost:4000/api/v1/collections/transactions`.
- **Headers:** `changeOrigin: true` correctly alters the Host header to match the destination.
- **Request Method & Body:** `POST` method and JSON bodies are transparently forwarded without mutation or truncation.

---

## 2. Live Proxy Forwarding Verification

A direct live curl probe was conducted against `http://localhost:5175`:

```bash
# Request via Vite proxy
curl -X POST http://localhost:5175/api/v1/auth/operator/otp/request \
  -H "Content-Type: application/json" \
  -d '{"mobileNumber":"9822114477"}'
```

**Result:**
- Status: `HTTP/1.1 200 OK`
- Body: `{"success":true,"message":"Verification code sent successfully to ********4477",...}`
- Verified that requests made to `http://localhost:5175/api/v1/*` are accurately proxied to the active backend instance on port `4000`.

---

## 3. Backend Route Mapping Audit

### File Inspected: `services/backend/src/presentation/routes/index.ts`
```ts
cleanApiRouter.use('/collections', collectionsRouter);
```

### File Inspected: `services/backend/src/presentation/routes/collections.routes.ts`
```ts
// Atomic Milk Intake Transaction
const handleIntakeTransaction = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  ...
};
router.post('/transactions', authenticate, handleIntakeTransaction);
```

### Route Route Path:
`/api/v1` (app.ts) + `/collections` (presentation/routes/index.ts) + `/transactions` (collections.routes.ts)
= `POST /api/v1/collections/transactions`

---

## 4. Conclusion

The observed `HTTP 409 Conflict` is **NOT** caused by a proxy configuration error, incorrect port, URL rewrite mismatch, or duplicate path prefix. The request reaches the correct backend route on port 4000.
