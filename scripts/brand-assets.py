"""Generate the OpenDefenders brand asset set from the source logo (OD.png).

Requires Pillow (pip install pillow). Run from the repository root:

    python scripts/brand-assets.py

The source artwork is flat brand-blue / navy-ink / grey on a white background.
Rather than keying the white out (which leaves grey fringes), each pixel is
matched to its nearest source ink and un-composited from white, so the output
PNGs keep clean anti-aliased edges and transparent interiors.
"""

from __future__ import annotations

from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
SOURCE = ROOT / "OD.png"
OUT = ROOT / "client" / "public" / "brand"

# Sampled from OD.png.
BLUE = (0x03, 0x72, 0xE5)
NAVY = (0x15, 0x29, 0x32)
GREY = (0x62, 0x62, 0x62)

# Palette tokens used by the variants (mirrors client/src/index.css).
BLUE_300 = (0x7F, 0xAE, 0xFF)
BLUE_600 = (0x03, 0x72, 0xE5)
NAVY_900 = (0x08, 0x15, 0x30)
WHITE = (0xFF, 0xFF, 0xFF)
INK_LIGHT = (0xEA, 0xF2, 0xFF)
MUTED_DARK = (0x9D, 0xB2, 0xD6)

# Shield artwork occupies the left block of the source image.
MARK_BOX = (0, 0, 606, 520)


def uncomposite(image: Image.Image) -> tuple[Image.Image, Image.Image]:
    """Split the artwork into (ink-id, alpha) planes, removed from white."""
    image = image.convert("RGBA")
    width, height = image.size
    inks = (BLUE, NAVY, GREY)
    index = Image.new("L", (width, height), 0)
    alpha = Image.new("L", (width, height), 0)
    src = image.load()
    idx = index.load()
    alp = alpha.load()

    for y in range(height):
        for x in range(width):
            r, g, b, a = src[x, y]
            if a == 0:
                continue
            p = (r, g, b)
            best_i, best_err, best_alpha = 0, 1e18, 0.0
            for i, c in enumerate(inks):
                v = (255 - c[0], 255 - c[1], 255 - c[2])
                denom = v[0] * v[0] + v[1] * v[1] + v[2] * v[2]
                num = (255 - p[0]) * v[0] + (255 - p[1]) * v[1] + (255 - p[2]) * v[2]
                ca = max(0.0, min(1.0, num / denom))
                err = 0.0
                for ch in range(3):
                    pred = 255 * (1 - ca) + c[ch] * ca
                    err += (p[ch] - pred) ** 2
                if err < best_err:
                    best_i, best_err, best_alpha = i, err, ca
            if best_alpha < 0.02:
                continue
            idx[x, y] = best_i + 1
            alp[x, y] = int(round(best_alpha * (a / 255) * 255))

    return index, alpha


def render(index: Image.Image, alpha: Image.Image, colours: tuple[tuple[int, int, int], ...]):
    out = Image.new("RGBA", index.size, (0, 0, 0, 0))
    dst = out.load()
    idx = index.load()
    alp = alpha.load()
    for y in range(index.height):
        for x in range(index.width):
            i = idx[x, y]
            if not i:
                continue
            c = colours[i - 1]
            dst[x, y] = (c[0], c[1], c[2], alp[x, y])
    return out


def save(image: Image.Image, name: str, width: int | None = None) -> None:
    if width and image.width > width:
        height = round(image.height * width / image.width)
        image = image.resize((width, height), Image.LANCZOS)
    image.save(OUT / name, optimize=True)
    print(f"  {name}  {image.width}x{image.height}")


def tight(image: Image.Image, pad: int = 0) -> Image.Image:
    box = image.getbbox()
    if box is None:
        return image
    x0, y0, x1, y1 = box
    return image.crop((max(0, x0 - pad), max(0, y0 - pad), min(image.width, x1 + pad), min(image.height, y1 + pad)))


def main() -> None:
    OUT.mkdir(parents=True, exist_ok=True)
    src = Image.open(SOURCE)
    index, alpha = uncomposite(src)

    full = Image.new("RGBA", src.size)
    full.paste(render(index, alpha, (BLUE, NAVY, GREY)))
    mark_index = index.crop(MARK_BOX)
    mark_alpha = alpha.crop(MARK_BOX)

    print("logo variants")
    save(tight(full), "logo-full.png", 1440)
    save(tight(render(index, alpha, (WHITE, WHITE, WHITE))), "logo-full-reversed.png", 1440)
    save(tight(render(index, alpha, (BLUE_300, INK_LIGHT, MUTED_DARK))), "logo-full-dark.png", 1440)

    mark = tight(render(mark_index, mark_alpha, (BLUE, BLUE, BLUE)))
    mark_rev = tight(render(mark_index, mark_alpha, (WHITE, WHITE, WHITE)))
    mark_dark = tight(render(mark_index, mark_alpha, (BLUE_300, BLUE_300, BLUE_300)))
    save(mark, "logo-mark.png", 640)
    save(mark_rev, "logo-mark-reversed.png", 640)
    save(mark_dark, "logo-mark-dark.png", 640)

    print("favicons and app icons")
    # Favicons: transparent, brand blue, so they read on light and dark toolbars.
    def square(image: Image.Image, size: int, background: tuple[int, int, int] | None) -> Image.Image:
        canvas = Image.new("RGBA", (size, size), (*background, 255) if background else (0, 0, 0, 0))
        target = round(size * 0.74)
        scale = min(target / image.width, target / image.height)
        resized = image.resize(
            (max(1, round(image.width * scale)), max(1, round(image.height * scale))), Image.LANCZOS
        )
        canvas.paste(
            resized,
            ((size - resized.width) // 2, (size - resized.height) // 2),
            resized,
        )
        return canvas

    icon16 = square(mark, 16, None)
    icon32 = square(mark, 32, None)
    icon48 = square(mark, 48, None)
    save(icon32, "favicon-32.png")
    icon16.save(OUT / "favicon.ico", sizes=[(16, 16), (32, 32), (48, 48)])
    print("  favicon.ico  16/32/48")

    # App icons on brand blue with the fully white shield.
    save(square(mark_rev, 180, BLUE_600), "apple-touch-icon.png")
    save(square(mark_rev, 192, BLUE_600), "icon-192.png")
    save(square(mark_rev, 512, BLUE_600), "icon-512.png")
    # Maskable: extra safe-area padding on the navy page base.
    save(square(mark_dark, 512, NAVY_900), "icon-maskable-512.png")

    # Verification contact sheet (not shipped).
    preview = Image.new("RGBA", (1440, 720), (0x08, 0x15, 0x30, 255))
    light_preview = Image.new("RGBA", (1440, 240), (0xF4, 0xF8, 0xFF, 255))
    full_dark = Image.open(OUT / "logo-full-dark.png")
    full_light = Image.open(OUT / "logo-full.png")
    full_rev = Image.open(OUT / "logo-full-reversed.png")
    for img, y in ((full_dark, 20), (full_rev, 240)):
        preview.paste(img.resize((900, round(img.height * 900 / img.width))), (40, y), None)
    light_preview.paste(
        full_light.resize((900, round(full_light.height * 900 / full_light.width))), (40, 40), None
    )
    preview = Image.alpha_composite(
        Image.new("RGBA", (1440, 720), (0, 0, 0, 0)), preview
    )
    preview.save(Path("scripts") / "tmp" / "preview-dark.png")
    light_preview.save(Path("scripts") / "tmp" / "preview-light.png")


if __name__ == "__main__":
    main()
