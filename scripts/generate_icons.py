import os
import math
import numpy as np
from PIL import Image, ImageDraw, ImageFilter, ImageFont

def create_dfarm_icons(output_dir):
    os.makedirs(output_dir, exist_ok=True)
    scale = 2  # 2048x2048 supersampling for ultimate vector-like clarity
    SW, SH = 1024 * scale, 1024 * scale
    CX, CY = SW // 2, SH // 2

    # -------------------------------------------------------------
    # 1. Background Gradient (Full Bleed Orange for icon.png)
    # -------------------------------------------------------------
    yy, xx = np.mgrid[0:SH, 0:SW]
    norm_y = yy / SH
    norm_x = xx / SW

    # Deep, warm, radiant brand orange gradient:
    # Top-Left: #FF7700 -> Bottom-Right: #E04D00
    r = 255 - norm_y * 32 - norm_x * 12
    g = 126 - norm_y * 58 - norm_x * 22
    b = 12 - norm_y * 10 - norm_x * 4

    # Radial ambient highlight near (0.5, 0.42)
    dx = (xx - SW * 0.5) / SW
    dy = (yy - SH * 0.42) / SH
    dist = np.sqrt(dx*dx + dy*dy)
    glow = np.clip(1.0 - dist * 1.5, 0, 1) * 38

    r = np.clip(r + glow, 0, 255).astype(np.uint8)
    g = np.clip(g + glow * 0.72, 0, 255).astype(np.uint8)
    b = np.clip(b + glow * 0.25, 0, 255).astype(np.uint8)
    a = np.full((SH, SW), 255, dtype=np.uint8)

    bg_arr = np.dstack([r, g, b, a])
    full_bg = Image.fromarray(bg_arr, 'RGBA')

    # -------------------------------------------------------------
    # 2. Central Elevated Emblem Badge (Safe zone: diameter ~600px in 1024, so ~1200px at 2x)
    # -------------------------------------------------------------
    emblem_layer = Image.new('RGBA', (SW, SH), (0, 0, 0, 0))
    
    # Badge radius: 560px at 2x (280px at 1024 -> 560px diameter, safe within 680px circle)
    badge_r = 560
    badge_cy = CY - 20  # slight optical center adjustment

    # Shadow layer
    shadow = Image.new('RGBA', (SW, SH), (0, 0, 0, 0))
    s_draw = ImageDraw.Draw(shadow)
    # Multi-pass soft ambient shadow
    s_draw.ellipse(
        [CX - badge_r - 10, badge_cy - badge_r + 30, CX + badge_r + 10, badge_cy + badge_r + 50],
        fill=(160, 40, 0, 110)
    )
    shadow = shadow.filter(ImageFilter.GaussianBlur(radius=38))

    # Badge base (Pure gleaming white circle with subtle warm bottom tint)
    badge_mask = Image.new('L', (SW, SH), 0)
    b_draw = ImageDraw.Draw(badge_mask)
    b_draw.ellipse([CX - badge_r, badge_cy - badge_r, CX + badge_r, badge_cy + badge_r], fill=255)

    badge_img = Image.new('RGBA', (SW, SH), (255, 255, 255, 255))
    # Subtle gradient on badge
    badge_yy = np.clip((yy - (badge_cy - badge_r)) / (2 * badge_r), 0, 1)
    badge_r_ch = (255 - badge_yy * 4).astype(np.uint8)
    badge_g_ch = (255 - badge_yy * 7).astype(np.uint8)
    badge_b_ch = (255 - badge_yy * 12).astype(np.uint8)
    badge_grad = Image.fromarray(np.dstack([badge_r_ch, badge_g_ch, badge_b_ch, np.full((SH, SW), 255, dtype=np.uint8)]), 'RGBA')
    badge_grad.putalpha(badge_mask)

    # Inner subtle rim ring
    rim = Image.new('RGBA', (SW, SH), (0, 0, 0, 0))
    r_draw = ImageDraw.Draw(rim)
    r_draw.ellipse([CX - badge_r + 8, badge_cy - badge_r + 8, CX + badge_r - 8, badge_cy + badge_r - 8],
                   outline=(255, 245, 235, 180), width=6)
    r_draw.ellipse([CX - badge_r, badge_cy - badge_r, CX + badge_r, badge_cy + badge_r],
                   outline=(250, 220, 195, 120), width=4)

    # -------------------------------------------------------------
    # 3. Authentic DFarm 3-Leaf Sprout & Pure Dairy Milk Droplet
    # -------------------------------------------------------------
    content_layer = Image.new('RGBA', (SW, SH), (0, 0, 0, 0))
    c_draw = ImageDraw.Draw(content_layer)

    # Sprout Base Anchor position
    base_x = CX
    base_y = badge_cy + 130

    # Draw Center Leaf (Tallest) - Saffron Orange
    # Bezier points scaled up by 5.5x
    center_leaf_pts = []
    for t in np.linspace(0, 1, 100):
        # Left curve: base -> tip
        # p0=(base_x - 30, base_y), p1=(base_x - 130, base_y - 280), p2=(base_x - 70, base_y - 480), p3=(base_x, base_y - 620)
        x = (1-t)**3 * (base_x - 30) + 3*(1-t)**2*t*(base_x - 120) + 3*(1-t)*t**2*(base_x - 60) + t**3*(base_x)
        y = (1-t)**3 * (base_y) + 3*(1-t)**2*t*(base_y - 280) + 3*(1-t)*t**2*(base_y - 480) + t**3*(base_y - 620)
        center_leaf_pts.append((x, y))
    for t in np.linspace(0, 1, 100):
        # Right curve: tip -> base
        # p0=(base_x, base_y - 620), p1=(base_x + 60, base_y - 480), p2=(base_x + 120, base_y - 280), p3=(base_x + 30, base_y)
        x = (1-t)**3 * (base_x) + 3*(1-t)**2*t*(base_x + 60) + 3*(1-t)*t**2*(base_x + 120) + t**3*(base_x + 30)
        y = (1-t)**3 * (base_y - 620) + 3*(1-t)**2*t*(base_y - 480) + 3*(1-t)*t**2*(base_y - 280) + t**3*(base_y)
        center_leaf_pts.append((x, y))

    # Center leaf gradient fill (from #E65100 at base to #FFA726 at tip)
    c_mask = Image.new('L', (SW, SH), 0)
    ImageDraw.Draw(c_mask).polygon(center_leaf_pts, fill=255)
    center_grad_arr = np.zeros((SH, SW, 4), dtype=np.uint8)
    for y_i in range(int(base_y - 630), int(base_y + 10)):
        if 0 <= y_i < SH:
            ratio = (y_i - (base_y - 620)) / 620.0  # 0 at tip, 1 at base
            ratio = np.clip(ratio, 0, 1)
            # Tip: #FFA726 (255, 167, 38), Base: #E65100 (230, 81, 0)
            r_val = int(255 - ratio * 25)
            g_val = int(167 - ratio * 86)
            b_val = int(38 - ratio * 38)
            center_grad_arr[y_i, :, 0] = r_val
            center_grad_arr[y_i, :, 1] = g_val
            center_grad_arr[y_i, :, 2] = b_val
            center_grad_arr[y_i, :, 3] = 255
    center_leaf_img = Image.fromarray(center_grad_arr, 'RGBA')
    center_leaf_img.putalpha(c_mask)
    content_layer = Image.alpha_composite(content_layer, center_leaf_img)

    # Center Leaf Spine (crisp white)
    c_draw = ImageDraw.Draw(content_layer)
    spine_pts = []
    for t in np.linspace(0, 1, 50):
        y = (base_y - 40) * (1-t) + (base_y - 590) * t
        spine_pts.append((base_x, y))
    c_draw.line(spine_pts, fill=(255, 255, 255, 230), width=14)

    # -------------------------------------------------------------
    # Left Leaf: Lush Agricultural Green (#2E7D32 -> #66BB6A)
    # -------------------------------------------------------------
    left_leaf_pts = []
    # Left leaf curves outward to the left (representing fresh agriculture/fodder)
    tip_lx = base_x - 310
    tip_ly = base_y - 340
    for t in np.linspace(0, 1, 80):
        # Outer curve: base -> tip
        x = (1-t)**3 * (base_x - 20) + 3*(1-t)**2*t*(base_x - 140) + 3*(1-t)*t**2*(tip_lx - 40) + t**3*(tip_lx)
        y = (1-t)**3 * (base_y - 10) + 3*(1-t)**2*t*(base_y - 120) + 3*(1-t)*t**2*(tip_ly + 80) + t**3*(tip_ly)
        left_leaf_pts.append((x, y))
    for t in np.linspace(0, 1, 80):
        # Inner curve: tip -> base
        x = (1-t)**3 * (tip_lx) + 3*(1-t)**2*t*(tip_lx + 100) + 3*(1-t)*t**2*(base_x - 80) + t**3*(base_x - 20)
        y = (1-t)**3 * (tip_ly) + 3*(1-t)**2*t*(tip_ly - 40) + 3*(1-t)*t**2*(base_y - 200) + t**3*(base_y - 10)
        left_leaf_pts.append((x, y))

    l_mask = Image.new('L', (SW, SH), 0)
    ImageDraw.Draw(l_mask).polygon(left_leaf_pts, fill=255)
    left_grad_arr = np.zeros((SH, SW, 4), dtype=np.uint8)
    for y_i in range(int(tip_ly - 60), int(base_y + 10)):
        if 0 <= y_i < SH:
            ratio = (y_i - tip_ly) / max(1, (base_y - tip_ly))
            ratio = np.clip(ratio, 0, 1)
            # Tip: #4CAF50 (76, 175, 80), Base: #1B5E20 (27, 94, 32)
            left_grad_arr[y_i, :, 0] = int(76 - ratio * 49)
            left_grad_arr[y_i, :, 1] = int(175 - ratio * 81)
            left_grad_arr[y_i, :, 2] = int(80 - ratio * 48)
            left_grad_arr[y_i, :, 3] = 255
    left_leaf_img = Image.fromarray(left_grad_arr, 'RGBA')
    left_leaf_img.putalpha(l_mask)
    content_layer = Image.alpha_composite(content_layer, left_leaf_img)

    # Left leaf spine
    c_draw = ImageDraw.Draw(content_layer)
    l_spine = []
    for t in np.linspace(0, 1, 50):
        x = (1-t)**2 * (base_x - 25) + 2*(1-t)*t*(base_x - 160) + t**2 * (tip_lx + 20)
        y = (1-t)**2 * (base_y - 30) + 2*(1-t)*t*(base_y - 160) + t**2 * (tip_ly + 20)
        l_spine.append((x, y))
    c_draw.line(l_spine, fill=(255, 255, 255, 215), width=12)

    # -------------------------------------------------------------
    # Right Leaf: Radiant Harvest Golden Orange (#E65100 -> #FFB74D)
    # -------------------------------------------------------------
    right_leaf_pts = []
    tip_rx = base_x + 310
    tip_ry = base_y - 340
    for t in np.linspace(0, 1, 80):
        # Outer curve: base -> tip
        x = (1-t)**3 * (base_x + 20) + 3*(1-t)**2*t*(base_x + 140) + 3*(1-t)*t**2*(tip_rx + 40) + t**3*(tip_rx)
        y = (1-t)**3 * (base_y - 10) + 3*(1-t)**2*t*(base_y - 120) + 3*(1-t)*t**2*(tip_ry + 80) + t**3*(tip_ry)
        right_leaf_pts.append((x, y))
    for t in np.linspace(0, 1, 80):
        # Inner curve: tip -> base
        x = (1-t)**3 * (tip_rx) + 3*(1-t)**2*t*(tip_rx - 100) + 3*(1-t)*t**2*(base_x + 80) + t**3*(base_x + 20)
        y = (1-t)**3 * (tip_ry) + 3*(1-t)**2*t*(tip_ry - 40) + 3*(1-t)*t**2*(base_y - 200) + t**3*(base_y - 10)
        right_leaf_pts.append((x, y))

    r_mask = Image.new('L', (SW, SH), 0)
    ImageDraw.Draw(r_mask).polygon(right_leaf_pts, fill=255)
    right_grad_arr = np.zeros((SH, SW, 4), dtype=np.uint8)
    for y_i in range(int(tip_ry - 60), int(base_y + 10)):
        if 0 <= y_i < SH:
            ratio = (y_i - tip_ry) / max(1, (base_y - tip_ry))
            ratio = np.clip(ratio, 0, 1)
            # Tip: #FFB74D (255, 183, 77), Base: #E65100 (230, 81, 0)
            right_grad_arr[y_i, :, 0] = int(255 - ratio * 25)
            right_grad_arr[y_i, :, 1] = int(183 - ratio * 102)
            right_grad_arr[y_i, :, 2] = int(77 - ratio * 77)
            right_grad_arr[y_i, :, 3] = 255
    right_leaf_img = Image.fromarray(right_grad_arr, 'RGBA')
    right_leaf_img.putalpha(r_mask)
    content_layer = Image.alpha_composite(content_layer, right_leaf_img)

    # Right leaf spine
    c_draw = ImageDraw.Draw(content_layer)
    r_spine = []
    for t in np.linspace(0, 1, 50):
        x = (1-t)**2 * (base_x + 25) + 2*(1-t)*t*(base_x + 160) + t**2 * (tip_rx - 20)
        y = (1-t)**2 * (base_y - 30) + 2*(1-t)*t*(base_y - 160) + t**2 * (tip_ry + 20)
        r_spine.append((x, y))
    c_draw.line(r_spine, fill=(255, 255, 255, 215), width=12)

    # Stem Base Anchor (#BF360C)
    c_draw.polygon([
        (base_x - 32, base_y - 5),
        (base_x + 32, base_y - 5),
        (base_x + 18, base_y + 35),
        (base_x - 18, base_y + 35)
    ], fill=(191, 54, 12, 255))

    # -------------------------------------------------------------
    # 4. Pure Milk Splash Drop at Base of Sprout
    # -------------------------------------------------------------
    # Glistening milk droplet in front of the stem base
    drop_cy = base_y + 40
    drop_pts = []
    for t in np.linspace(0, 1, 40):
        # Tip to bottom left arc
        y = (drop_cy - 45) * (1-t) + (drop_cy + 25) * t
        w = math.sin(t * math.pi) * 32
        drop_pts.append((CX - w, y))
    for t in np.linspace(0, math.pi, 30):
        x = CX + math.cos(t) * 32
        y = (drop_cy + 25) + math.sin(t) * 20
        drop_pts.append((x, y))
    for t in np.linspace(1, 0, 40):
        y = (drop_cy - 45) * (1-t) + (drop_cy + 25) * t
        w = math.sin(t * math.pi) * 32
        drop_pts.append((CX + w, y))
    c_draw.polygon(drop_pts, fill=(255, 255, 255, 250))
    c_draw.line(drop_pts, fill=(230, 235, 240, 200), width=3)
    # Specular shine on milk drop
    c_draw.ellipse([CX - 16, drop_cy + 5, CX - 6, drop_cy + 20], fill=(255, 255, 255, 255))

    # -------------------------------------------------------------
    # 5. Bold Modern Wordmark "DFarm"
    # -------------------------------------------------------------
    try:
        font_path = r'C:\Windows\Fonts\segoeuib.ttf'
        font_large = ImageFont.truetype(font_path, 170)
        font_badge = ImageFont.truetype(font_path, 54)
    except Exception:
        font_large = ImageFont.load_default()
        font_badge = ImageFont.load_default()

    word = "DFarm"
    w_bbox = c_draw.textbbox((0, 0), word, font=font_large)
    word_w = w_bbox[2] - w_bbox[0]
    word_x = CX - word_w // 2
    word_y = base_y + 90

    # Draw "DFarm" with high-contrast rich brand chocolate-slate #211B18
    c_draw.text((word_x, word_y), word, font=font_large, fill=(33, 27, 24, 255))

    # Pill badge "CUSTOMER" below DFarm
    badge_text = "CUSTOMER"
    b_bbox = c_draw.textbbox((0, 0), badge_text, font=font_badge)
    b_w = b_bbox[2] - b_bbox[0]
    b_h = b_bbox[3] - b_bbox[1]
    pill_cx = CX
    pill_cy = word_y + 190
    pw = b_w + 64
    ph = b_h + 32
    pill_rect = [pill_cx - pw//2, pill_cy - ph//2, pill_cx + pw//2, pill_cy + ph//2]
    # Orange pill badge
    c_draw.rounded_rectangle(pill_rect, radius=ph//2, fill=(255, 106, 0, 255))
    # Crisp white text
    c_draw.text((pill_cx - b_w//2, pill_cy - b_h//2 - 4), badge_text, font=font_badge, fill=(255, 255, 255, 255))

    # -------------------------------------------------------------
    # 6. Composite Layers
    # -------------------------------------------------------------
    # Emblem composition (Shadow + Badge + Content)
    emblem_layer = Image.alpha_composite(emblem_layer, shadow)
    emblem_layer = Image.alpha_composite(emblem_layer, badge_grad)
    emblem_layer = Image.alpha_composite(emblem_layer, rim)
    emblem_layer = Image.alpha_composite(emblem_layer, content_layer)

    # MASTER 1: Adaptive Icon Foreground (Transparent background, emblem centered)
    # Downsample from 2048x2048 to 1024x1024 with Lanczos
    adaptive_icon = emblem_layer.resize((1024, 1024), Image.Resampling.LANCZOS)
    adaptive_path = os.path.join(output_dir, "adaptive-icon.png")
    adaptive_icon.save(adaptive_path, format="PNG", optimize=True)
    print(f"Saved adaptive icon: {adaptive_path} ({os.path.getsize(adaptive_path)} bytes)")

    # MASTER 2: Full-Bleed Standard App Icon (Full gradient background + emblem)
    master_icon_2x = Image.alpha_composite(full_bg, emblem_layer)
    icon_final = master_icon_2x.resize((1024, 1024), Image.Resampling.LANCZOS)
    icon_path = os.path.join(output_dir, "icon.png")
    icon_final.save(icon_path, format="PNG", optimize=True)
    print(f"Saved master icon: {icon_path} ({os.path.getsize(icon_path)} bytes)")

    # Also save a copy in artifacts directory for preview
    artifact_dir = r"C:\Users\panka\.gemini\antigravity\brain\fb48a3da-5691-497d-95df-6e3cedb1d59c"
    icon_final.save(os.path.join(artifact_dir, "icon_preview.png"), format="PNG")
    adaptive_icon.save(os.path.join(artifact_dir, "adaptive_preview.png"), format="PNG")
    print("Previews saved to artifact directory!")

if __name__ == "__main__":
    out_dir = r"c:\Users\panka\.gemini\antigravity\worktrees\DFarm\dfarm_customer_app_init\apps\dfarm-customer-app\assets\branding"
    create_dfarm_icons(out_dir)
