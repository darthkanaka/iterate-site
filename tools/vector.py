"""Turn a one-color PDF or PDF-compatible .ai into a currentColor SVG.

The brand files are simple: filled paths and rectangles, a few coordinate
transforms, and a clip that only covers the artboard. That is all this reads.
Anything it does not understand makes it stop rather than guess.

    python3 tools/vector.py <in.pdf|in.ai> <out.svg>

Also used for the mark's favicons: `python3 tools/vector.py --favicons`.
"""
import re
import sys

from pypdf import PdfReader

TOKEN = re.compile(r"/[^\s/\[\]()<>]+|-?\d*\.\d+|-?\d+|[A-Za-z\*']+")


def mul(a, b):
    """Multiply two PDF matrices [a b c d e f]."""
    return [
        a[0] * b[0] + a[1] * b[2], a[0] * b[1] + a[1] * b[3],
        a[2] * b[0] + a[3] * b[2], a[2] * b[1] + a[3] * b[3],
        a[4] * b[0] + a[5] * b[2] + b[4], a[4] * b[1] + a[5] * b[3] + b[5],
    ]


def parse(path):
    """Return (width, height, [svg path d strings]) for the first page."""
    page = PdfReader(path).pages[0]
    box = page.mediabox
    W, H = float(box.width), float(box.height)
    ops = TOKEN.findall(page.get_contents().get_data().decode("latin-1"))

    ctm = [1, 0, 0, 1, 0, 0]
    stack, nums, cur, shapes = [], [], [], []

    def pt(x, y):
        X = ctm[0] * x + ctm[2] * y + ctm[4]
        Y = ctm[1] * x + ctm[3] * y + ctm[5]
        return f"{X:.3f} {H - Y:.3f}"

    for t in ops:
        if re.fullmatch(r"-?\d*\.?\d+", t):
            nums.append(float(t))
            continue
        a = nums
        nums = []
        if t == "q":
            stack.append(ctm[:])
        elif t == "Q":
            ctm = stack.pop()
        elif t == "cm":
            ctm = mul(a, ctm)
        elif t == "m":
            cur.append("M" + pt(*a))
        elif t == "l":
            cur.append("L" + pt(*a))
        elif t == "c":
            cur.append("C" + pt(a[0], a[1]) + " " + pt(a[2], a[3]) + " " + pt(a[4], a[5]))
        elif t == "h":
            cur.append("Z")
        elif t == "re":
            x, y, w, h = a
            # Draw every rectangle the same way round. The mark has rectangles
            # with negative width or height, and where one of those overlaps a
            # normal one, the nonzero fill rule reads opposite windings as
            # cancelling, which left hairline gaps inside the HI.
            if w < 0: x, w = x + w, -w
            if h < 0: y, h = y + h, -h
            cur.append("M" + pt(x, y) + " L" + pt(x + w, y) + " L" + pt(x + w, y + h) + " L" + pt(x, y + h) + " Z")
        elif t in ("f", "F", "f*"):
            shapes.append(("evenodd" if t == "f*" else "nonzero", " ".join(cur)))
            cur = []
        elif t == "n":
            cur = []          # end of a clip path, nothing painted
        elif t in ("W", "W*", "BDC", "EMC", "gs", "cs", "scn", "rg", "g", "k") or t.startswith("/"):
            pass
        else:
            sys.exit(f"{path}: unsupported operator {t!r}, not guessing")
    return W, H, shapes


def to_svg(src, dst, label):
    W, H, shapes = parse(src)
    paths = "\n  ".join(
        f'<path fill-rule="{rule}" d="{d}"/>' for rule, d in shapes)
    svg = (f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {W:g} {H:g}" '
           f'fill="currentColor" role="img" aria-label="{label}">\n  {paths}\n</svg>\n')
    open(dst, "w").write(svg)
    print(f"{dst}: {len(shapes)} shapes, {W:g} x {H:g}")


def favicons():
    """Raster favicons of the mark, from the same parsed rectangles."""
    from PIL import Image, ImageDraw
    W, H, shapes = parse("harvest/brand/evolve/Evolve-Icon-Black.pdf")
    # The browser tab icon is the banyan HI (icon-tree-32/192.png and favicon.ico,
    # made from harvest/photos/backgrounds/Icon_Tree.png). This makes the flat
    # navy mark only where a photo would not read: the home screen icon and
    # the logo in search results.
    for size, name, bg in ((180, "favicon-180.png", "#F0EEE8"), (512, "mark-512.png", None)):
        pad = size * 0.1
        scale = (size - pad * 2) / max(W, H)
        ox = (size - W * scale) / 2
        oy = (size - H * scale) / 2
        big = 4                                  # draw large, shrink, clean edges
        im = Image.new("RGBA", (size * big, size * big), bg or (0, 0, 0, 0))
        d = ImageDraw.Draw(im)
        for _, dstr in shapes:
            for sub in dstr.split("Z"):
                xy = [tuple(map(float, p.split())) for p in re.findall(r"[ML]([-\d.]+ [-\d.]+)", sub)]
                if len(xy) < 3:
                    continue
                d.polygon([((ox + x * scale) * big, (oy + y * scale) * big) for x, y in xy], fill="#181D38")
        im.resize((size, size), Image.LANCZOS).save("assets/img/" + name)
        print("assets/img/" + name)


if __name__ == "__main__":
    if sys.argv[1:] == ["--favicons"]:
        favicons()
    else:
        to_svg(sys.argv[1], sys.argv[2], sys.argv[3] if len(sys.argv) > 3 else "")
