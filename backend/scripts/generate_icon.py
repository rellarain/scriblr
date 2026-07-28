"""One-off dev tool: generates backend/icon.ico, the packaged app's icon.

Not part of the app's runtime dependencies -- Pillow is only needed to run
this script once; the output .ico is what actually ships. Re-run manually
(`./.venv/Scripts/python scripts/generate_icon.py`) if the design changes.
"""

from pathlib import Path

from PIL import Image, ImageDraw

ACCENT = (122, 59, 88)  # matches frontend --accent
SIZE = 256


def build_icon() -> Image.Image:
    img = Image.new("RGBA", (SIZE, SIZE), (0, 0, 0, 0))
    draw = ImageDraw.Draw(img)

    # Rounded-square background in the app's accent color.
    margin = 8
    draw.rounded_rectangle(
        [margin, margin, SIZE - margin, SIZE - margin],
        radius=48,
        fill=ACCENT,
    )

    # A simple quill/pencil glyph in white, echoing the Draft nav icon.
    def scaled(points: list[tuple[float, float]]) -> list[tuple[float, float]]:
        return [(x / 20 * SIZE, y / 20 * SIZE) for x, y in points]

    body = scaled([(13.5, 3.5), (16.5, 6.5), (7.0, 16.0), (3.4, 17.0), (4.4, 13.4)])
    draw.polygon(body, fill="white")

    nib = scaled([(11.8, 5.2), (14.8, 8.2), (13.3, 9.7), (10.3, 6.7)])
    draw.polygon(nib, fill=ACCENT)

    return img


def main() -> None:
    icon = build_icon()
    dest = Path(__file__).resolve().parent.parent / "icon.ico"
    icon.save(dest, sizes=[(16, 16), (32, 32), (48, 48), (64, 64), (128, 128), (256, 256)])
    print(f"Wrote {dest}")


if __name__ == "__main__":
    main()
