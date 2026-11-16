# DFarm Collection App — Hardware Peripheral Integration Guide

## 1. Physical Device Telemetry Specifications

| Device Type | Protocol | Port / Endpoint | Default Baud | Target Hardware Specs |
|---|---|---|---|---|
| **Industrial Camera** | Browser MediaStream API | `media:video/dev0` | N/A | 1080p @ 60fps, Auto-Exposure, Wide FOV |
| **Face Recognition Engine** | WASM SIMD Runtime | In-Browser Engine | N/A | OpenCV YuNet ONNX (Detection) + SFace INT8 (Embedding) |
| **Contactless RFID Reader** | Web Serial API | `COM3` / `/dev/ttyUSB0` | 9600 bps | Mifare Classic 1K / 13.56 MHz ISO 14443A |
| **Milk Analyzer** | Web Serial API | `COM4` / `/dev/ttyUSB1` | 19200 bps | Ultrasonic Master Lactometer (Fat, SNF, CLR, Temp) |
| **Digital Weighing Scale** | Web Serial / HID | `COM5` / `/dev/ttyUSB2` | 4800 bps | Heavy-Duty Platform Scale, Continuous stream with ST flag |
| **Cloud Relay** | HTTPS REST API | `https://api.dfarm.in` | N/A | TLS 1.3, Idempotent event deduplication |

---

## 2. Scale Reading & Stability Flag
The digital weighing scale continuously streams packets formatted as:
`ST,GS,+0012.50,KG`
- `ST` indicates **Stable reading** (safe for locking into intake record).
- `US` indicates **Unstable reading** (sloshing liquid, active pouring).
The DFarm Collection App automatically enforces scale stability before enabling the intake confirmation CTA.

---

## 3. Web Speech API Voice Announcer
- **Rate:** 1.0
- **Pitch:** 1.0
- **Language:** `en-IN`
- **Debounce Window:** 8000ms (8 seconds). Prevents redundant audio triggers on continuous video frames when patron remains stationary before the camera.
