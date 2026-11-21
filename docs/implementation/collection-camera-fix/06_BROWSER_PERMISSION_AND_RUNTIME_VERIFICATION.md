# 06 — Browser Permission and Runtime Verification

**Date:** 2026-11-19

---

## Runtime Context

| Property | Value | Verified? |
|----------|-------|-----------|
| Application URL | `http://localhost:5175` | ✅ localhost — camera permitted |
| Protocol | `http:` | ✅ localhost exemption applies |
| Hostname | `localhost` | ✅ Secure context per browser policy |
| getUserMedia available | Yes — localhost is a secure context | ✅ |
| iframe embedding | Not applicable — top-level frame | ✅ |

> [!NOTE]
> Chrome/Firefox allow `navigator.mediaDevices.getUserMedia` on `localhost` and `127.0.0.1` even without HTTPS. This is the **Potentially Trustworthy Origin** exemption defined in the W3C Secure Contexts spec.

---

## Secure Context Check (Post-Fix)

```typescript
const isSecure =
  location.protocol === 'https:' ||
  location.hostname === 'localhost' ||
  location.hostname === '127.0.0.1'

if (!isSecure) {
  setStatus('CAMERA_UNAVAILABLE')
  setErrorMessage('Camera requires HTTPS or localhost. Current context is insecure.')
  return false
}
```

This check runs at the top of `startCamera()` before any getUserMedia call.

---

## Deployment Requirements

| Environment | Requirement | Notes |
|------------|-------------|-------|
| Development | `localhost` or `127.0.0.1` | ✅ Already satisfied (port 5175) |
| Production | HTTPS with valid TLS certificate | Required for all non-localhost origins |
| Docker/VM | Must expose HTTPS or tunnel via localhost | SSH port forward or Caddy/nginx TLS |
| Embedded iframe | Parent page must include `allow="camera"` permission policy | Only if iframing the collection app |

---

## Camera Permission Browser Flow

1. First visit: Browser shows permission prompt → user grants → stored in browser profile.
2. Subsequent visits: Permission is remembered → `getUserMedia` succeeds silently.
3. If permission is blocked: `NotAllowedError` → `CAMERA_PERMISSION_REQUIRED` state → user-visible message.

**Error messages (post-fix):**

| Scenario | Status | Message |
|---------|--------|---------|
| Permission denied | `CAMERA_PERMISSION_REQUIRED` | "Camera access was denied. Please grant camera permission in your browser settings." |
| No camera device | `CAMERA_UNAVAILABLE` | "No camera device detected on this workstation." |
| Camera in use | `CAMERA_ALREADY_IN_USE` | "Camera is currently in use by another application or tab." |
| Constraints not met | `CAMERA_ERROR` | "Camera does not support the requested resolution. Try adjusting video constraints." |
| Aborted (race) | `INITIALIZATION_FAILED` | "Camera initialization was aborted. Please retry." |
| Metadata timeout | `INITIALIZATION_FAILED` | "Camera stream started but video did not become ready. Check browser and camera device." |
| Insecure context | `CAMERA_UNAVAILABLE` | "Camera requires HTTPS or localhost. Current context is insecure." |

---

## Camera Constraints Configured

```typescript
const constraints: MediaStreamConstraints = {
  video: {
    width: { ideal: 1280, min: 640 },
    height: { ideal: 720, min: 480 },
    facingMode: 'user',
  },
  audio: false,
}
```

The `min` values ensure the browser selects a compatible mode on lower-resolution cameras rather than failing with `OverconstrainedError`.

---

## Recommendation for Production Deployment

1. Deploy the Collection App behind HTTPS (Nginx, Caddy, or cloud load balancer with TLS).
2. Ensure the kiosk browser has the camera permission pre-granted (browser autostart policy or enrollment profile).
3. If running in a Chromium kiosk, use `--use-fake-ui-for-media-stream` for automated testing only — never in production.
4. Confirm that no other browser tab or application holds the camera device before the operator starts their shift.
