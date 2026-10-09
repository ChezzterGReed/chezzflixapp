#!/usr/bin/env python3
"""Turn the Swift runtime overlay dependencies (/usr/lib/swift/*) of a (fat) Mach-O dylib into WEAK links.

The Swift overlays libmpv autolinks (Spatial, OSLog, ...) don't all exist on older macOS versions. As hard dependencies
they'd make the app fail to launch there; as weak ones a missing library is simply skipped (we never call into them).
Edits the file in place; re-sign afterwards.
"""
import struct, sys

LC_LOAD_DYLIB, LC_LOAD_WEAK_DYLIB = 0x0C, 0x80000018
FAT_MAGIC, MH_MAGIC_64 = 0xCAFEBABE, 0xFEEDFACF

def patch_slice(buf: bytearray, base: int) -> int:
    magic, = struct.unpack_from("<I", buf, base)
    if magic != MH_MAGIC_64:
        raise SystemExit(f"unexpected slice magic {magic:#x}")
    ncmds, = struct.unpack_from("<I", buf, base + 16)
    off, changed = base + 32, 0
    for _ in range(ncmds):
        cmd, size = struct.unpack_from("<II", buf, off)
        if cmd == LC_LOAD_DYLIB:
            name_off, = struct.unpack_from("<I", buf, off + 8)
            name = bytes(buf[off + name_off: off + size]).split(b"\0", 1)[0].decode()
            if name.startswith("/usr/lib/swift/"):
                struct.pack_into("<I", buf, off, LC_LOAD_WEAK_DYLIB)
                changed += 1
        off += size
    return changed

def main(path: str) -> None:
    buf = bytearray(open(path, "rb").read())
    magic, = struct.unpack_from(">I", buf, 0)
    total = 0
    if magic == FAT_MAGIC:
        n, = struct.unpack_from(">I", buf, 4)
        for i in range(n):
            _cpu, _sub, offset, _size, _align = struct.unpack_from(">5I", buf, 8 + 20 * i)
            total += patch_slice(buf, offset)
    else:
        total += patch_slice(buf, 0)
    open(path, "wb").write(buf)
    print(f"weakened {total} Swift runtime links")

main(sys.argv[1])
