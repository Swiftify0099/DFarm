# MobileFaceNet ArcFace Model — DOWNLOAD REQUIRED

## Status: MODEL BINARY MUST BE DOWNLOADED MANUALLY

The `.tflite` model binary is NOT included in this repository (too large for Git, and must be verified against known SHA-256 before deployment).

## Model Specification

| Property | Value |
|---|---|
| Architecture | MobileFaceNet with ArcFace loss |
| Input | 112×112×3 (RGB, Float32) |
| Normalization | mean=127.5, scale=128.0 → pixel_norm = (pixel - 127.5) / 128.0 |
| Output | 512-dimensional Float32 L2-normalized embedding |
| Format | TensorFlow Lite (.tflite) |
| Expected File Size | ~4–10 MB |

## Authoritative Download Sources

### Option A — Deepinsight InsightFace (Recommended)
MobileFaceNet ArcFace R100 model available via model zoo:
- Repository: https://github.com/deepinsight/insightface
- Model Zoo: https://github.com/deepinsight/insightface/tree/master/model_zoo
- License: MIT License
- Download script: `python -m insightface.app.face_analysis` or via their model downloader

### Option B — Sirius-AI MobileFaceNet_TF
- Repository: https://github.com/sirius-ai/MobileFaceNet_TF
- Provides TF checkpoint + conversion to TFLite
- License: MIT License
- Conversion: `python export_to_tflite.py --checkpoint_path ./ckpt/ --output_path ./out/MobileFaceNet.tflite`

### Option C — Pre-converted GitHub releases (community verified)
- https://github.com/shubham0204/FaceRecognition_With_FaceNet_Android — FaceNet 512D TFLite
- Note: FaceNet (Google) produces 512D embeddings compatible with this pipeline

## Verification Before Deployment

After downloading, verify:
```powershell
# Windows PowerShell SHA-256 verification
Get-FileHash -Algorithm SHA256 ".\mobilefacenet_arcface_v1.tflite"
```

Expected properties:
- File size: 4–10 MB (reject if smaller — indicates truncated or wrong file)
- Output tensor shape: [1, 512] Float32
- Input tensor shape: [1, 112, 112, 3] Float32

## Conversion from ONNX (if only ONNX available)

If only ONNX model is available from InsightFace:
```bash
pip install tf2onnx onnx
# Convert ONNX → TFLite
python -m tf2onnx.convert --onnx model.onnx --output model_tf.pb
tflite_convert --saved_model_dir=model_tf.pb --output_file=mobilefacenet_arcface_v1.tflite
```

## Placement

Place the downloaded file at BOTH paths:
- `apps/registration-expo/assets/models/mobilefacenet_arcface_v1.tflite`
- `apps/collection-expo/assets/models/mobilefacenet_arcface_v1.tflite`

Update `docs/face-model/MODEL_PROVENANCE.md` with actual SHA-256 and file size after download.
