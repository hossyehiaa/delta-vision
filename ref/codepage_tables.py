# -*- coding: utf-8 -*-
"""
codepage_tables.py — emit JS string literals for CP437 and CP864 from Python's own codec tables.
TextDecoder supports neither of these two code pages in browsers, so geo.js carries the tables.
Usage: python3 -I codepage_tables.py <out_dir>
"""
import json, os, sys

out_dir = sys.argv[1]
os.makedirs(out_dir, exist_ok=True)
for cp in ("cp437", "cp864"):
    chars = []
    for b in range(256):
        try:
            chars.append(bytes([b]).decode(cp))
        except UnicodeDecodeError:
            chars.append("\ufffd")  # byte undefined in this code page
    s = "".join(chars)
    lit = json.dumps(s, ensure_ascii=True)
    open(os.path.join(out_dir, cp + "_table.txt"), "w").write(lit)
    print(cp, len(lit), "chars of JS literal")
    for lo in (0x80, 0xa0, 0xc0, 0xe0):
        print("  0x%02x: %s" % (lo, "".join(chars[lo:lo + 16]).encode("unicode_escape").decode()))
# sanity: round trip a few known values
print("cp437 0x82 = %r, cp864 Arabic-Indic digits:" % bytes([0x82]).decode("cp437"),
      bytes(range(0x30, 0x3a)).decode("cp864"))
print("cp864 Arabic letters sample:", bytes([0xc1, 0xc2, 0xc3, 0xe1, 0xe2]).decode("cp864", "replace"))
