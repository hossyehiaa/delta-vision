# -*- coding: utf-8 -*-
"""
build.py — assemble the single-file app (public/index.html) from src/ + vendor/ + images/.

Usage:
  python3 build.py               # -> public/index.html
  python3 build.py <out.html>    # anywhere
"""
import base64
import sys
import io
import json
import pathlib
import re

# repo layout: this file sits at the repo root next to src/, vendor/, images/
ROOT = pathlib.Path(__file__).resolve().parent
SRC = ROOT / "src"
VENDOR = ROOT / "vendor"
IMAGES = ROOT / "images"
OUT = pathlib.Path(sys.argv[1]) if len(sys.argv) > 1 else ROOT / "public" / "index.html"

# ---------------------------------------------------------------- images
# name -> (source png, max width, webp quality). Verified by VLM earlier.
IMAGE_SPEC = {
    "hero":      ("hero.png", 1100, 76),
    "c_space":   ("c_space.png", 900, 72),
    "c_drone":   ("c_drone.png", 900, 72),
    "c_tablet":  ("c_tablet.png", 800, 74),
    "c_wheat":   ("c_wheat.png", 900, 74),
    "c_rice":    ("c_rice.png", 900, 74),
    "p_mosaic":  ("p_mosaic.png", 760, 74),
    "p_laptop":  ("p_laptop.png", 560, 74),
    "p_desert":  ("p_desert.png", 700, 74),
}

def image_data_uri(png_path: pathlib.Path, max_w: int, quality: int) -> str:
    from PIL import Image
    im = Image.open(png_path)
    im = im.convert("RGB")
    if im.width > max_w:
        h = round(im.height * max_w / im.width)
        im = im.resize((max_w, h), Image.LANCZOS)
    buf = io.BytesIO()
    im.save(buf, "WEBP", quality=quality, method=6)
    data = buf.getvalue()
    return "data:image/webp;base64," + base64.b64encode(data).decode("ascii"), len(data)

# ---------------------------------------------------------------- fonts
def font_faces() -> str:
    manifest = json.loads((VENDOR / "fonts" / "manifest.json").read_text())
    files = VENDOR / "fonts"
    # Cairo files of the same subset are identical (variable font) — dedupe to 2 files.
    seen = {}
    css = []
    arabic_ranges = {
        "arabic": "U+0600-06FF, U+0750-077F, U+0870-088E, U+08A0-08FF, U+FB50-FDFF, U+FE70-FEFF, U+200C-200F, U+2010-2011, U+204F, U+2E41",
        "latin": "U+0000-00FF, U+0131, U+0152-0153, U+02BB-02BC, U+02C6, U+02DA, U+02DC, U+2000-206F, U+2074, U+20AC, U+2122, U+2191, U+2193, U+2212, U+2215, U+FEFF, U+FFFD",
        "latin-ext": "U+0100-02AF, U+0300-0301, U+0303-0304, U+0306-0307, U+0309, U+030A, U+0323, U+0329, U+1E00-1EFF, U+2020, U+20A0-20AB, U+20AD-20C0, U+2113, U+2C60-2C7F, U+A720-A7FF",
    }
    for f in manifest:
        key = (f["family"], f["subset"])
        if f["family"] == "Cairo":
            if key in seen:
                continue
            seen[key] = True
            b64 = base64.b64encode((files / f["file"]).read_bytes()).decode("ascii")
            css.append(
                "@font-face{font-family:'Cairo';font-style:normal;font-weight:200 1000;"
                "font-display:swap;src:url(data:font/woff2;base64," + b64 + ") format('woff2');"
                "unicode-range:" + arabic_ranges[f["subset"]] + ";}"
            )
        else:
            b64 = base64.b64encode((files / f["file"]).read_bytes()).decode("ascii")
            css.append(
                "@font-face{font-family:'Poppins';font-style:normal;font-weight:" + str(f["weight"]) + ";"
                "font-display:swap;src:url(data:font/woff2;base64," + b64 + ") format('woff2');"
                "unicode-range:" + arabic_ranges[f["subset"]] + ";}"
            )
    return "\n".join(css)

# ---------------------------------------------------------------- leaflet css
def leaflet_css() -> str:
    css = (VENDOR / "leaflet" / "leaflet.css").read_text()
    transparent_png = base64.b64encode(bytes.fromhex(
        "89504e470d0a1a0a0000000d494844520000000100000001080600000"
        "01f15c4890000000d49444154789c6260010000050001"
        "57bfabd50000000049454e44ae426082"
    )).decode("ascii")
    layers = base64.b64encode((VENDOR / "leaflet" / "layers.png").read_bytes()).decode("ascii")
    layers2x = base64.b64encode((VENDOR / "leaflet" / "layers-2x.png").read_bytes()).decode("ascii")
    css = css.replace("url(images/layers-2x.png)", "url(data:image/png;base64," + layers2x + ")")
    css = css.replace("url(images/layers.png)", "url(data:image/png;base64," + layers + ")")
    css = css.replace("url(images/marker-icon.png)", "url(data:image/png;base64," + transparent_png + ")")
    css = css.replace("url(images/marker-icon-2x.png)", "url(data:image/png;base64," + transparent_png + ")")
    css = css.replace("url(images/marker-shadow.png)", "url(data:image/png;base64," + transparent_png + ")")
    return css

# ---------------------------------------------------------------- js guard
def js(code: str) -> str:
    return code.replace("</script", "<\\/script")

def b64_comment(data_uri: str) -> str:
    return data_uri

# ---------------------------------------------------------------- build
def main():
    html = (SRC / "index.html").read_text()

    images = {}
    total_img = 0
    for name, (fname, maxw, q) in IMAGE_SPEC.items():
        uri, n = image_data_uri(IMAGES / fname, maxw, q)
        images[name] = uri
        total_img += n
        print(f"  img {name:10s} {n/1024:7.1f} KB")

    dvimg = "window.DVIMG = {" + ",".join(
        name + ':"' + uri + '"' for name, uri in images.items()
    ) + "};\n"

    style = (SRC / "style.css").read_text()
    libs = {
        "/*__FONTS__*/": font_faces(),
        "/*__LEAFLET_CSS__*/": leaflet_css(),
        "/*__STYLE__*/": style,
    }
    for k, v in libs.items():
        html = html.replace(k, v)

    scripts = {
        "/*__PROJ4__*/": js((VENDOR / "proj4" / "proj4.js").read_text()),
        "/*__LEAFLET__*/": js((VENDOR / "leaflet" / "leaflet.js").read_text()),
        "/*__GEO__*/": js((SRC / "geo.js").read_text()),
        "/*__AUTH__*/": js((SRC / "auth.js").read_text()),
        "/*__DATA__*/": js((SRC / "data.js").read_text()),
        "/*__I18N__*/": js((SRC / "i18n.js").read_text()),
        "/*__APP__*/": dvimg + js((SRC / "app.js").read_text()),
    }
    for k, v in scripts.items():
        html = html.replace(k, v)

    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(html)
    print(f"\nwrote {OUT} ({OUT.stat().st_size/1024/1024:.2f} MB; images {total_img/1024:.0f} KB)")

    # sanity: no leftover placeholders
    leftovers = re.findall(r"/\*__[A-Z]+__\*/", html)
    if leftovers:
        raise SystemExit("leftover placeholders: " + ", ".join(leftovers))
    for bad in ["images/layers.png", "images/marker-icon.png"]:
        if bad in html:
            raise SystemExit("un-inlined url: " + bad)

if __name__ == "__main__":
    main()
