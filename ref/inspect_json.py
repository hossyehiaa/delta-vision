# -*- coding: utf-8 -*-
"""
inspect_json.py — print the key structure of a JSON file (first levels only).
Usage: python3 -I inspect_json.py <file.json> [max_depth]
"""
import json, sys

path = sys.argv[1]
max_depth = int(sys.argv[2]) if len(sys.argv) > 2 else 3
data = json.load(open(path, encoding="utf-8"))


def walk(obj, depth, prefix):
    if depth > max_depth:
        return
    if isinstance(obj, dict):
        keys = list(obj.keys())
        print(prefix + "{dict %d keys} " % len(keys) + ", ".join(map(str, keys[:14])) + (" …" if len(keys) > 14 else ""))
        for k in keys[:14]:
            walk(obj[k], depth + 1, prefix + "  ." + str(k) + ": ")
    elif isinstance(obj, list):
        print(prefix + "[list %d]" % len(obj))
        if obj:
            walk(obj[0], depth + 1, prefix + "  [0]: ")
    else:
        s = repr(obj)
        print(prefix + type(obj).__name__ + " " + s[:70])


walk(data, 1, "")
