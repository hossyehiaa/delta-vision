# -*- coding: utf-8 -*-
"""
make_data.js generator — dump selected parts of the spectral data JSON.
Usage: python3 -I inspect_json.py ... (see make_data.py for the real generator)
"""
import json, sys

path = sys.argv[1]
data = json.load(open(path, encoding="utf-8"))
for key in sys.argv[2:]:
    print("==", key)
    print(json.dumps(data[key], ensure_ascii=False, indent=1))
