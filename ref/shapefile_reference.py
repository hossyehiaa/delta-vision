# -*- coding: utf-8 -*-
"""Reference facts about a shapefile, computed with geopandas/pyproj (independent of the JS parser).
Usage: python3 -I scripts/delta_vision/ref/shapefile_reference.py <dir-with-shapefiles> <out.json>
"""
import glob, json, os, sys
import geopandas as gpd
import pyproj

src_dir, out = sys.argv[1], sys.argv[2]
shp = sorted(glob.glob(os.path.join(src_dir, "*.shp")))[0]
g = gpd.read_file(shp)
crs = g.crs
geom_types = sorted(set(geom.geom_type for geom in g.geometry))
area_wm2 = [float(a) for a in g.to_crs(32635 if False else crs).area] if crs and crs.is_projected else None
# geodesic (ellipsoidal) areas on WGS84 in m2
geod = pyproj.Geod(ellps="WGS84")
geo = g.to_crs(4326)
geod_area = [abs(geod.geometry_area_perimeter(geom)[0]) for geom in geo.geometry]
first = geo.geometry.iloc[0]
g0 = g.geometry.iloc[0]
c = first.centroid
res = {
    "file": os.path.basename(shp),
    "n_features": int(len(g)),
    "crs_wkt": crs.to_wkt() if crs is not None else None,
    "crs_name": crs.name if crs is not None else None,
    "geom_types": geom_types,
    "columns": [c for c in g.columns if c != "geometry"],
    "attrs": g.drop(columns="geometry").astype(str).values.tolist()[:20],
    "projected_units": crs.axis_info[0].unit_name if crs is not None else None,
    "planar_area_m2": area_wm2,
    "geodesic_area_m2": geod_area,
    "total_geodesic_m2": float(sum(geod_area)),
    "first_centroid_lonlat": [float(c.x), float(c.y)],
    "bounds": [float(v) for v in crs.area_of_use.bounds] if False else None,
    "total_bounds": [float(v) for v in g.total_bounds],
    "lonlat_bounds": [float(v) for v in geo.total_bounds],
    # one sample vertex, projected and geographic, for the forward/inverse check
    # first exterior vertex: g0 is the projected geometry, first is the WGS84 one
    "sample_xy": [float(g0.exterior.coords[0][0]), float(g0.exterior.coords[0][1])] if first.geom_type == "Polygon" else None,
    "sample_lonlat": [float(first.exterior.coords[0][0]), float(first.exterior.coords[0][1])] if first.geom_type == "Polygon" else None,
    "prj": open(glob.glob(os.path.join(src_dir, "*.prj"))[0], encoding="utf-8", errors="replace").read() if glob.glob(os.path.join(src_dir, "*.prj")) else None,
    "ring_counts": [len(getattr(geom, "interiors", [])) if geom.geom_type == "Polygon" else None for geom in g.geometry][:20],
}
json.dump(res, open(out, "w"), ensure_ascii=False, indent=1)
print(json.dumps({k: (v if not isinstance(v, list) or len(v) <= 14 else v[:14] + ["..."]) for k, v in res.items() if k not in ("crs_wkt", "prj")}, ensure_ascii=False, indent=1))
