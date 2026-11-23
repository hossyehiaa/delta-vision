# -*- coding: utf-8 -*-
"""
epsg_proj4.py — proj4 strings for the CRSs of Egypt that proj4js must know by EPSG code
(WKT2 .prj files cannot be read by proj4js 2.x, so geo.js falls back to EPSG:code → proj string).

Each string is checked here against PROJ's own Helmert transformation for that CRS.
Usage: python3 -I epsg_proj4.py <out.json>
"""
import json, re, sys, warnings

from pyproj import CRS, Transformer
from pyproj.transformer import TransformerGroup

warnings.filterwarnings("ignore")
out = {}
CODES = [22991, 22992, 22993, 22994, 23034, 23035, 23036, 23037]
for e in CODES:
    tg = TransformerGroup(e, 4326, always_xy=True)
    helm = [t for t in tg.transformers if "proj=helmert" in t.definition and "molobadek" not in t.definition]
    d = helm[0].definition
    m = re.search(r"proj=helmert (x=[^ ]+) (y=[^ ]+) (z=[^ ]+)( rx=[^ ]+)?( ry=[^ ]+)?( rz=[^ ]+)?( s=[^ ]+)?", d)
    vals = [m.group(i).split("=")[1] for i in range(1, 8) if m.group(i)]
    ps = CRS.from_epsg(e).to_proj4().replace(" +type=crs", "").replace(" +no_defs", "") + " +towgs84=" + ",".join(vals) + " +no_defs"
    lon0, lat0 = (33.5, 30.5) if e == 22991 else (29.6, 30.87)
    x, y = Transformer.from_crs(4326, CRS.from_epsg(e), always_xy=True).transform(lon0, lat0)
    ref = helm[0].transform(x, y)
    got = Transformer.from_proj(ps, 4326, always_xy=True).transform(x, y)
    dxy = (abs(got[0] - ref[0]) * 111320, abs(got[1] - ref[1]) * 110574)
    print(e, "|", helm[0].description.replace("Inverse of ", ""), "| accuracy", helm[0].accuracy, "m")
    print("    ", ps)
    print("     check vs PROJ: %.4f m, %.4f m" % dxy)
    assert max(dxy) < 0.01, dxy
    out[e] = {"proj4": ps, "name": CRS.from_epsg(e).name, "accuracy_m": helm[0].accuracy, "x": x, "y": y, "lon": ref[0], "lat": ref[1]}
for e in (3395, 3857, 4326, 32634, 32635, 32636, 32637, 32702):
    ps = CRS.from_epsg(e).to_proj4().replace(" +type=crs", "")
    lon0, lat0 = (29.6, 30.87) if e != 32702 else (25.0, -20.0)
    x, y = Transformer.from_crs(4326, CRS.from_epsg(e), always_xy=True).transform(lon0, lat0)
    print(e, "|", CRS.from_epsg(e).name, "|", ps)
    out[e] = {"proj4": ps, "name": CRS.from_epsg(e).name, "accuracy_m": None, "x": x, "y": y, "lon": lon0, "lat": lat0}
json.dump(out, open(sys.argv[1], "w"), indent=1)
print("written", sys.argv[1])
