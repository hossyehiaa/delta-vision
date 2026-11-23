# -*- coding: utf-8 -*-
"""
geo_reference.py — independent reference values + test fixtures for the JS shapefile/area code.

Computed with geopandas / shapely / pyproj (completely separate implementation from geo.js).

Usage: python3 -I geo_reference.py <bourj_shp_dir> <fixtures_out_dir>
Writes into <fixtures_out_dir>:
  bourj_deflate.zip, bourj_store.zip     zipped copies of the real Borj El Arab layer
  synth/…                                synthetic layers (donut, multipolygon, island, lines, points, Z/M)
  geo_reference.json                     expected numbers
"""
import json, math, os, struct, sys, zipfile

import geopandas as gpd
import pandas as pd
import pyproj
from pyproj import CRS, Transformer, Geod
from pyproj.enums import WktVersion
from shapely.geometry import Polygon, MultiPolygon, LineString, MultiLineString, Point, MultiPoint, mapping
from shapely.ops import transform

src_dir, out_dir = sys.argv[1], sys.argv[2]
os.makedirs(os.path.join(out_dir, "synth"), exist_ok=True)
ref = {"geod": "WGS84 (pyproj.Geod)"}
geod = Geod(ellps="WGS84")


def geod_area_m2(geom):
    """ellipsoidal area of a lon/lat geometry: shells minus holes, islands add back"""
    polys = [geom] if geom.geom_type == "Polygon" else list(geom.geoms) if geom.geom_type == "MultiPolygon" else []
    a = 0.0
    for p in polys:
        a += abs(geod.geometry_area_perimeter(Polygon(p.exterior))[0])
        for hole in p.interiors:
            a -= abs(geod.geometry_area_perimeter(Polygon(hole))[0])
    return a


# ---------------------------------------------------------------- 1) zips of the real layer
shp_dir = src_dir
names = sorted(n for n in os.listdir(shp_dir) if n.lower().endswith((".shp", ".shx", ".dbf", ".prj", ".cpg")))
for zname, comp in (("bourj_deflate.zip", zipfile.ZIP_DEFLATED), ("bourj_store.zip", zipfile.ZIP_STORED)):
    with zipfile.ZipFile(os.path.join(out_dir, zname), "w", comp) as z:
        for n in names:
            z.write(os.path.join(shp_dir, n), "Bourj/" + n)
        z.writestr("__MACOSX/._Bourj_Elarab.shp", b"\x00\x05\x16\x07" + b"\x00" * 200)  # macOS junk
        z.writestr("readme.txt", "not a shapefile")
ref["zip_entries"] = sorted(["Bourj/" + n for n in names])

# ---------------------------------------------------------------- 2) synthetic layers (UTM 35N)
utm = CRS.from_epsg(32635)
to_utm = Transformer.from_crs(4326, utm, always_xy=True)
to_wgs = Transformer.from_crs(utm, 4326, always_xy=True)
ox, oy = to_utm.transform(29.60, 30.87)  # origin near Borj El Arab


def ring(x0, y0, w, h, ccw=True):
    pts = [(x0, y0), (x0 + w, y0), (x0 + w, y0 + h), (x0, y0 + h)]
    if not ccw:
        pts = pts[::-1]
    pts.append(pts[0])
    return pts


def to_ll(pts):
    return [to_wgs.transform(x, y) for x, y in pts]


# A: 1 km square with a 200 m hole (shapely winding: shell CCW, hole CW → the opposite of the shapefile spec)
a = Polygon(ring(ox, oy, 1000, 1000, ccw=True), [ring(ox + 400, oy + 400, 200, 200, ccw=False)])
# B: 800 m square with 400 m hole + 100 m island inside the hole  +  a separate 300 m square
b = MultiPolygon([
    Polygon(ring(ox + 2000, oy, 800, 800, ccw=False), [ring(ox + 2200, oy + 200, 400, 400, ccw=True)]),
    Polygon(ring(ox + 2200 + 150, oy + 200 + 150, 100, 100, ccw=False)),
    Polygon(ring(ox + 4000, oy + 1000, 300, 300, ccw=True)),
])
# C: tiny 30 m square (CW shell)
c = Polygon(ring(ox, oy + 3000, 30, 30, ccw=False))
rows = []
for i, geom in enumerate((a, b, c)):
    g_ll = transform(lambda x, y, z=None: to_wgs.transform(x, y), geom)
    rows.append(gpd.GeoDataFrame({
        "id": [i + 1], "name_ar": ["حقل القمح الشتوي", "أرض برسيم وبور", "قطعة صغيرة"][i], "area_ha": [96.0, 112.0, 0.09][i]
    }, geometry=[geom], crs=utm))
poly = pd.concat(rows, ignore_index=True)
poly.to_file(os.path.join(out_dir, "synth", "parcels.shp"), engine="fiona", encoding="windows-1256")
ref["parcels"] = {
    "n": 3,
    "areas_m2": [geod_area_m2(g) for g in poly.to_crs(4326).geometry],
    "types": list(poly.to_crs(4326).geom_type),
    "cpg": open(os.path.join(out_dir, "synth", "parcels.cpg"), encoding="latin-1").read().strip()
        if os.path.exists(os.path.join(out_dir, "synth", "parcels.cpg")) else None,
}
# lines + points
lines = gpd.GeoDataFrame({"id": [1, 2]}, geometry=[
    MultiLineString([[(ox, oy + 5000), (ox + 600, oy + 5200), (ox + 1200, oy + 5100)], [(ox + 50, oy + 5400), (ox + 700, oy + 5600)]]),
    LineString([(ox + 2000, oy + 5000), (ox + 2600, oy + 5500)])], crs=utm)
lines.to_file(os.path.join(out_dir, "synth", "lines.shp"), engine="fiona")
pts = gpd.GeoDataFrame({"id": [1, 2, 3]}, geometry=[Point(ox, oy + 6000), Point(ox + 100, oy + 6100), Point(ox + 200, oy + 6200)], crs=utm)
pts.to_file(os.path.join(out_dir, "synth", "points.shp"), engine="fiona")
ref["lines"] = {"n": 2, "types": list(lines.to_crs(4326).geom_type)}
ref["points"] = {"n": 3, "first_lonlat": list(to_wgs.transform(ox, oy + 6000))}

# hand-built .shp binaries: PolygonZ (type 15) and PolylineM (type 23) in lon/lat (no .prj → lat/lon fallback)


def shp_header(shape_type, content_bytes):
    body = b"".join(content_bytes)
    return struct.pack(">i", 9994) + struct.pack(">i", 0) * 5 + struct.pack(">i", len(body) + 100) + struct.pack("<ii", 1000, shape_type) + struct.pack("<8d", *([0] * 8)) + body  # 100-byte header


def rec(num, content):
    return struct.pack(">ii", num, len(content) // 2) + content


sq = [(29.60, 30.87), (29.61, 30.87), (29.61, 30.88), (29.60, 30.88), (29.60, 30.87)]
pts_bytes = b"".join(struct.pack("<2d", x, y) for x, y in sq)
# PolygonZ: type, bbox(4), zrange(2), nParts, nPoints, parts, points, Z[nPoints], mrange(2)
z_content = struct.pack("<i", 15) + struct.pack("<4d", 29.60, 30.87, 29.61, 30.88) + struct.pack("<2d", 0, 0) + struct.pack("<ii", 1, 5) + struct.pack("<i", 0) + pts_bytes + struct.pack("<5d", *(0,) * 5) + struct.pack("<2d", 0, 0)
open(os.path.join(out_dir, "synth", "polyz.shp"), "wb").write(shp_header(15, [rec(1, z_content)]))
# PolylineM: type, bbox(4), nParts, nPoints, parts, points, mrange(2)
m_content = struct.pack("<i", 23) + struct.pack("<4d", 29.60, 30.87, 29.61, 30.88) + struct.pack("<ii", 1, 3) + struct.pack("<i", 0) + b"".join(struct.pack("<2d", x, y) for x, y in sq[:3]) + struct.pack("<2d", 0, 0)
open(os.path.join(out_dir, "synth", "linem.shp"), "wb").write(shp_header(23, [rec(1, m_content)]))
ref["polyz"] = {"area_m2": abs(geod.geometry_area_perimeter(Polygon(sq))[0])}
# no .prj next to them → the loader must take these lon/lat values as WGS84 with a warning

# ---------------------------------------------------------------- 3) big polygons (area accuracy)


def rect(lon0, lat0, lon1, lat1, n=60):
    pts = []
    for i in range(n):  # densified rectangle (so the reference geodesic polygon is unambiguous)
        pts.append((lon0 + (lon1 - lon0) * i / n, lat0))
    for i in range(n):
        pts.append((lon1, lat0 + (lat1 - lat0) * i / n))
    for i in range(n):
        pts.append((lon1 - (lon1 - lon0) * i / n, lat1))
    for i in range(n):
        pts.append((lon0, lat1 - (lat1 - lat0) * i / n))
    pts.append(pts[0])
    return pts


ref["big"] = []
for (lon0, lat0, lon1, lat1) in [(29.0, 30.0, 30.0, 31.0), (29.0, 60.0, 30.0, 61.0), (25.0, 15.0, 35.0, 32.0), (-73.0, -50.0, -71.0, -49.0)]:
    pts = rect(lon0, lat0, lon1, lat1)
    ref["big"].append({"ring": pts, "area_m2": abs(geod.geometry_area_perimeter(Polygon(pts))[0])})
# a 1 km square in UTM (for the preview-grid sanity check)
sq1 = to_ll(ring(ox, oy, 1000, 1000))
ref["sq1km"] = {"ring": sq1, "area_m2": abs(geod.geometry_area_perimeter(Polygon(sq1))[0])}

# ---------------------------------------------------------------- 4) WKT variants through proj4
ref["wkt"] = []
samples = [(32635, (750706.9722, 3434295.8539)), (32636, (500000.0, 3420000.0)), (3857, (3285000.0, 3620000.0)),
           (4326, (29.6261, 31.0156)), (22992, None), (32702, (200000.0, 6000000.0))]
for epsg, xy in samples:
    crs = CRS.from_epsg(epsg)
    if xy is None:
        x, y = Transformer.from_crs(4326, crs, always_xy=True).transform(29.6, 30.87)
    else:
        x, y = xy
    lon, lat = Transformer.from_crs(crs, 4326, always_xy=True).transform(x, y)
    for label, ver in (("gdal", WktVersion.WKT1_GDAL), ("wkt2", WktVersion.WKT2_2019), ("esri", WktVersion.WKT1_ESRI)):
        ref["wkt"].append({"epsg": epsg, "variant": label, "wkt": crs.to_wkt(ver), "x": x, "y": y, "lon": lon, "lat": lat})

json.dump(ref, open(os.path.join(out_dir, "geo_reference.json"), "w"), ensure_ascii=False, indent=1)
print("fixtures written to", out_dir)
print("parcels areas m2:", [round(v, 2) for v in ref["parcels"]["areas_m2"]], "cpg:", repr(ref["parcels"]["cpg"]))
print("big areas m2   :", [round(b["area_m2"]) for b in ref["big"]])
print("sq1km area m2  :", round(ref["sq1km"]["area_m2"], 2))
print("wkt cases      :", len(ref["wkt"]))
print("files:", sorted(os.listdir(os.path.join(out_dir, "synth"))))
