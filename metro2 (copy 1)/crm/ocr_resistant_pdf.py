#!/usr/bin/env python3
"""
ocr_resistant_pdf.py
Create human-readable but OCR-resistant PDFs with a neutral watermark.

NOTE: Used for dispute letters only; audit and data breach letters should
use regular PDF generation.

Features
- Neutral diagonal-stripe watermark (no text)
- Light grid background
- Random speckle noise
- Strength presets (subtle / strong)
- Safe zones to keep overlays off address/signature blocks
- CLI and importable API

Usage examples
--------------
# Strong preset with overlays everywhere:
python ocr_resistant_pdf.py --in letter.txt --out Dispute_Strong.pdf --preset strong

# Subtle preset, and keep overlays off a 4"x1.5" address window at 1" from top/left:
python ocr_resistant_pdf.py --in letter.txt --out Dispute_Subtle.pdf --preset subtle \
--safe-zone 72 72 288 108 # all values in points (1 pt = 1/72 inch)

# Fully custom:
python ocr_resistant_pdf.py --in letter.txt --out Custom.pdf \
--page 1700x2200 --margin 140 --font-size 28 \
--grid-spacing 32 --grid-alpha 28 \
--wm-spacing 200 --wm-width 4 --wm-alpha 35 \
--speckles 3200 --speckle-radius 1 2 --speckle-alpha 90
"""

import argparse, os, textwrap, random
from dataclasses import dataclass, field
from typing import List, Tuple, Optional
from PIL import Image, ImageDraw, ImageFont

@dataclass
class OCRStyle:
    page_w: int = 1700
    page_h: int = 2200
    margin: int = 140
    font_paths: List[str] = field(default_factory=lambda: [
        "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf",
        "/usr/share/fonts/truetype/liberation/LiberationSans-Regular.ttf",
        "/System/Library/Fonts/SFNS.ttf",
    ])
    font_size: int = 28
    grid_on: bool = True
    grid_spacing: int = 32
    grid_rgba: Tuple[int,int,int,int] = (100,100,100,28)
    wm_on: bool = True
    wm_spacing: int = 200
    wm_width: int = 4
    wm_rgba: Tuple[int,int,int,int] = (120,120,120,35)
    speckles_on: bool = True
    speckle_count: int = 3200
    speckle_radius_range: Tuple[int,int] = (1,2)
    speckle_rgba: Tuple[int,int,int,int] = (0,0,0,90)
    safe_zones: List[Tuple[int,int,int,int]] = field(default_factory=list)

def _load_font(paths: List[str], size: int) -> ImageFont.FreeTypeFont:
    for p in paths:
        if os.path.exists(p):
            try:
                return ImageFont.truetype(p, size)
            except Exception:
                pass
    return ImageFont.load_default()

def _draw_text_block(draw: ImageDraw.ImageDraw, text: str,
                     x: int, y: int, max_w: int,
                     font: ImageFont.FreeTypeFont,
                     line_height_mult: float = 1.35,
                     fill=(0,0,0)) -> int:
    lines = []
    for paragraph in text.split("\n"):
        if not paragraph.strip():
            lines.append("")
            continue
        try:
            avg = font.getlength("abcdefghijklmnopqrstuvwxyz") / 26.0
        except Exception:
            avg = font.size * 0.6
        est_chars = max(8, int(max_w / max(1, avg)))
        wrapped = textwrap.wrap(paragraph, width=est_chars)
        refined = []
        for line in wrapped:
            while True:
                try:
                    if font.getlength(line) <= max_w:
                        break
                except Exception:
                    break
                if " " not in line:
                    break
                line = line.rsplit(" ", 1)[0]
            refined.append(line)
        lines.extend(refined)
    line_h = int(font.size * line_height_mult)
    cy = y
    for line in lines:
        draw.text((x, cy), line, font=font, fill=fill)
        cy += line_h
    return cy

def _apply_mask_for_safe_zones(layer: Image.Image, safe_zones: List[Tuple[int,int,int,int]]) -> Image.Image:
    if not safe_zones:
        return layer
    w, h = layer.size
    mask = Image.new("L", (w, h), 255)
    md = ImageDraw.Draw(mask)
    for (sx, sy, sw, sh) in safe_zones:
        md.rectangle([sx, sy, sx+sw, sy+sh], fill=0)
    rgba = layer.split()
    new_alpha = Image.eval(rgba[3], lambda a: int(a))
    black = Image.new("L", (w, h), 0)
    new_alpha.paste(black, mask=Image.eval(mask, lambda v: 255 - v))
    combined = Image.merge("RGBA", (rgba[0], rgba[1], rgba[2], new_alpha))
    return combined

def add_light_grid(base: Image.Image, style: OCRStyle) -> None:
    if not style.grid_on:
        return
    grid = Image.new("RGBA", base.size, (0,0,0,0))
    g = ImageDraw.Draw(grid)
    w, h = base.size
    for x in range(0, w, style.grid_spacing):
        g.line([(x,0), (x,h)], fill=style.grid_rgba, width=1)
    for y in range(0, h, style.grid_spacing):
        g.line([(0,y), (w,y)], fill=style.grid_rgba, width=1)
    grid = _apply_mask_for_safe_zones(grid, style.safe_zones)
    base.alpha_composite(grid)

def add_neutral_watermark(base: Image.Image, style: OCRStyle) -> None:
    if not style.wm_on:
        return
    wm = Image.new("RGBA", base.size, (0,0,0,0))
    d = ImageDraw.Draw(wm)
    w, h = wm.size
    step = style.wm_spacing
    for i in range(-h, w, step):
        d.line([(i, 0), (i + h, h)], fill=style.wm_rgba, width=style.wm_width)
    wm = _apply_mask_for_safe_zones(wm, style.safe_zones)
    base.alpha_composite(wm)

def add_speckles(base: Image.Image, style: OCRStyle) -> None:
    if not style.speckles_on or style.speckle_count <= 0:
        return
    speck = Image.new("RGBA", base.size, (0,0,0,0))
    d = ImageDraw.Draw(speck)
    w, h = base.size
    rmin, rmax = style.speckle_radius_range
    for _ in range(style.speckle_count):
        r = random.randint(rmin, rmax)
        x = random.randint(0, w-1)
        y = random.randint(0, h-1)
        if r <= 0:
            d.point((x, y), fill=style.speckle_rgba)
        else:
            d.ellipse((x-r, y-r, x+r, y+r), fill=style.speckle_rgba, outline=None)
    speck = _apply_mask_for_safe_zones(speck, style.safe_zones)
    base.alpha_composite(speck)

def render_ocr_resistant_pdf(text: str, out_path: str, style: Optional[OCRStyle] = None) -> str:
    style = style or OCRStyle()
    page = Image.new("RGBA", (style.page_w, style.page_h), (255,255,255,255))
    add_light_grid(page, style)
    add_neutral_watermark(page, style)
    font = _load_font(style.font_paths, style.font_size)
    d = ImageDraw.Draw(page)
    x = style.margin
    y = style.margin
    max_w = style.page_w - style.margin*2
    _draw_text_block(d, text, x, y, max_w, font)
    add_speckles(page, style)
    rgb = page.convert("RGB")
    os.makedirs(os.path.dirname(out_path) or ".", exist_ok=True)
    rgb.save(out_path, "PDF", resolution=150.0)

    return out_path

def _parse_pt_rect(val: List[str]) -> Tuple[int,int,int,int]:
    if len(val) != 4:
        raise ValueError("safe-zone needs 4 integers: x y w h")
    return tuple(int(v) for v in val)  # type: ignore

def _make_preset(name: str) -> OCRStyle:
    s = OCRStyle()
    if name == "subtle":
        s.grid_spacing = 48
        s.grid_rgba = (100,100,100,24)
        s.wm_spacing = 240
        s.wm_width = 3
        s.wm_rgba = (120,120,120,28)
        s.speckle_count = 1200
        s.speckle_radius_range = (0,1)
        s.speckle_rgba = (0,0,0,70)
    elif name == "strong":
        s.grid_spacing = 32
        s.grid_rgba = (100,100,100,28)
        s.wm_spacing = 200
        s.wm_width = 4
        s.wm_rgba = (120,120,120,35)
        s.speckle_count = 3200
        s.speckle_radius_range = (1,2)
        s.speckle_rgba = (0,0,0,90)
    else:
        raise ValueError("preset must be 'subtle' or 'strong'")
    return s

def main():
    ap = argparse.ArgumentParser(description="Generate OCR-resistant PDF with neutral watermark.")
    ap.add_argument("--in", dest="infile", required=True, help="Path to input .txt")
    ap.add_argument("--out", dest="outfile", required=True, help="Path to output .pdf")
    ap.add_argument("--preset", choices=["subtle","strong"], default="strong", help="Strength preset")
    ap.add_argument("--page", default=None, help="Custom page size WxH (e.g., 1700x2200)")
    ap.add_argument("--margin", type=int, default=None, help="Page margin in pixels")
    ap.add_argument("--font-size", type=int, default=None, help="Font size in pixels")
    ap.add_argument("--font-path", action="append", default=None, help="Add a font path (can repeat)")
    ap.add_argument("--no-grid", action="store_true")
    ap.add_argument("--grid-spacing", type=int, default=None)
    ap.add_argument("--grid-alpha", type=int, default=None)
    ap.add_argument("--no-watermark", action="store_true")
    ap.add_argument("--wm-spacing", type=int, default=None)
    ap.add_argument("--wm-width", type=int, default=None)
    ap.add_argument("--wm-alpha", type=int, default=None)
    ap.add_argument("--no-speckles", action="store_true")
    ap.add_argument("--speckles", type=int, default=None, help="Number of speckles")
    ap.add_argument("--speckle-radius", nargs=2, type=int, default=None, metavar=("RMIN","RMAX"))
    ap.add_argument("--speckle-alpha", type=int, default=None)
    ap.add_argument("--safe-zone", nargs=4, action="append", metavar=("X","Y","W","H"),
                    help="Rectangle (px) where overlays are disabled (can repeat)")
    args = ap.parse_args()
    with open(args.infile, "r", encoding="utf-8", errors="ignore") as f:
        text = f.read()
    style = _make_preset(args.preset)
    if args.page:
        w,h = args.page.lower().split("x")
        style.page_w, style.page_h = int(w), int(h)
    if args.margin is not None:
        style.margin = args.margin
    if args.font_size is not None:
        style.font_size = args.font_size
    if args.font_path:
        style.font_paths = args.font_path + style.font_paths
    if args.no_grid:
        style.grid_on = False
    if args.grid_spacing is not None:
        style.grid_spacing = args.grid_spacing
    if args.grid_alpha is not None:
        r,g,b,_ = style.grid_rgba
        style.grid_rgba = (r,g,b,max(0,min(255,args.grid_alpha)))
    if args.no_watermark:
        style.wm_on = False
    if args.wm_spacing is not None:
        style.wm_spacing = args.wm_spacing
    if args.wm_width is not None:
        style.wm_width = args.wm_width
    if args.wm_alpha is not None:
        r,g,b,_ = style.wm_rgba
        style.wm_rgba = (r,g,b,max(0,min(255,args.wm_alpha)))
    if args.no_speckles:
        style.speckles_on = False
    if args.speckles is not None:
        style.speckle_count = args.speckles
    if args.speckle_radius is not None:
        style.speckle_radius_range = tuple(args.speckle_radius)
    if args.speckle_alpha is not None:
        r,g,b,_ = style.speckle_rgba
        style.speckle_rgba = (r,g,b,max(0,min(255,args.speckle_alpha)))
    if args.safe_zone:
        style.safe_zones = [tuple(map(int, sz)) for sz in args.safe_zone]
    out = render_ocr_resistant_pdf(text, args.outfile, style)
    print(f"Saved: {out}")

if __name__ == "__main__":
    main()
