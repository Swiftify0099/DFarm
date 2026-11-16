# DFarm Premium Design System & Claymorphic Specifications

## 1. Approved Brand Palette

The DFarm Web Admin strictly adheres to the official DFarm brand color specifications across all modules:

| Color Token | Hex Code | Role | Description |
|---|---|---|---|
| `--color-dfarm-cream` | `#FFF5EE` | Primary Canvas / Background | Warm, organic, soothing dairy cream backdrop |
| `--color-dfarm-orange` | `#FF6A00` | Primary Accent / CTA | Energetic, sunrise harvest orange for primary actions |
| `--color-dfarm-secondary` | `#F58A38` | Secondary Accent / Highlights | Warm amber orange used in linear gradients and interactive highlights |
| `--color-dfarm-peach` | `#FFE9DC` | Soft Container / Tint | Soft peach container fill for badges, icons, and subtle cards |
| `--color-dfarm-text` | `#211B18` | Primary Typography | Deep espresso charcoal ensuring high contrast and readability |
| `--color-dfarm-text-muted` | `#817A75` | Secondary Typography | Neutral stone grey for subtitles, labels, and captions |
| `--color-dfarm-border` | `#F1E7E0` | Architectural Borders | Gentle warm border lines separating cards, tables, and rows |
| `--color-dfarm-surface` | `#FFFFFF` | Primary Card Surface | Crisp white top surface for high-information density data cards |

---

## 2. Claymorphic 3D Depth & Light Mechanics

Unlike flat design or glassmorphism, **Claymorphism** creates tangible, soft 3D physical surfaces with simulated lighting from the top-left (specular highlight) and soft ambient occlusion shadows beneath.

### Key Shadow Profiles
```css
/* Standard Clay Card Surface */
box-shadow: 
  0 10px 25px -5px rgba(245, 138, 56, 0.08), 
  0 8px 10px -6px rgba(33, 27, 24, 0.04), 
  inset 0 2px 4px 0 rgba(255, 255, 255, 0.9), 
  inset 0 -2px 4px 0 rgba(245, 138, 56, 0.05);

/* Interactive Clay Button (Primary) */
background: linear-gradient(135deg, #FF6A00 0%, #F58A38 100%);
box-shadow: 
  0 6px 16px -2px rgba(255, 106, 0, 0.35), 
  inset 0 2px 3px 0 rgba(255, 255, 255, 0.4), 
  inset 0 -2px 4px 0 rgba(0, 0, 0, 0.1);

/* Inset Input Depth */
box-shadow: 
  inset 0 2px 4px 0 rgba(33, 27, 24, 0.04),
  0 1px 2px 0 rgba(255, 255, 255, 0.8);
```

---

## 3. High Information Density Operational Guidelines

1. **Clean Professional Tables**:
   - The Dairy Admin is an operational tool where operators view hundreds of daily liters, Fat readings, and financial balances.
   - Tables use crisp white cards, sticky pastel cream headers (`#FFF5EE`), clean borders (`#F1E7E0`), and subtle hover highlights.
   - Every row is structured for fast visual scanning with bold numbers and mono-spaced transaction references.

2. **Original DFarm SVG Graphical Assets**:
   - **Logo**: Styled milk drop combined with sunrise leaf emblem.
   - **Cow Visual**: Warm amber stylized silhouette for cow milk identification.
   - **Buffalo Visual**: Dark espresso curved-horn silhouette for high-fat buffalo milk.
   - **Milk Can**: Stainless steel churn graphic representing collection batches.
   - **Biometrics Visual**: Cyan/orange scanning reticle representing OpenCV YuNet landmarks and SFace template extraction.
   - **RFID Card Visual**: Smart contactless card with transmission ripples.
   - **Analyzer Visual**: Optical lactometer and ultrasonic fat testing device.
   - **Ledger Shield Visual**: Dual-tone security shield symbolizing server-authoritative balance protection.
   - **IoT Machine Visual**: Integrated smart collection kiosk station.
   - **Empty State Visual**: Dashed circular ambient illustration indicating clean zero-record states.
