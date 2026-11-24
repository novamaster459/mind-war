"""Generate PWA icons for War Room Tactics."""
from PIL import Image, ImageDraw
import math, os

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, "public", "icons")
os.makedirs(OUT, exist_ok=True)

def draw_icon(size, maskable=False):
    img = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    # Background slate with rounded corners (skip rounding when maskable)
    bg = (10, 14, 20, 255)
    if maskable:
        d.rectangle([0, 0, size, size], fill=bg)
    else:
        d.rounded_rectangle([0, 0, size - 1, size - 1], radius=size // 8, fill=bg)

    cx = cy = size / 2
    s = size / 64.0
    cyan = (34, 211, 238, 255)
    red = (239, 68, 68, 255)
    faint = (34, 211, 238, 120)

    # Radar rings
    for r in (18, 26):
        d.ellipse(
            [cx - r * s, cy - r * s, cx + r * s, cy + r * s],
            outline=cyan, width=max(1, int(2 * s)),
        )
    # Crosshairs
    d.line([cx, cy - 26 * s, cx, cy + 26 * s], fill=faint, width=max(1, int(1.5 * s)))
    d.line([cx - 26 * s, cy, cx + 26 * s, cy], fill=faint, width=max(1, int(1.5 * s)))
    # Sweep triangle (radar beam)
    d.polygon(
        [(cx, cy), (cx + 18 * s, cy - 6 * s), (cx + 18 * s, cy + 6 * s)],
        fill=(34, 211, 238, 70),
    )
    # Faction pointer arrow
    d.polygon([(cx, cy - 18 * s), (cx + 6 * s, cy + 2 * s), (cx - 6 * s, cy + 2 * s)], fill=cyan)
    # Center hostile dot
    d.ellipse([cx - 5 * s, cy - 5 * s, cx + 5 * s, cy + 5 * s], fill=red)
    return img

for sz in (192, 512):
    draw_icon(sz, maskable=False).save(os.path.join(OUT, f"icon-{sz}.png"))
draw_icon(512, maskable=True).save(os.path.join(OUT, "icon-512-maskable.png"))
print("Icons written to", OUT)