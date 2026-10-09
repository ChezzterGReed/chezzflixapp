#!/usr/bin/env python3
"""Writes releases/latest.json (the update feed every installed Chezzflix reads) for one version.
Mac entries come from releases/<v>/Chezzflix.app.tar.gz(.sig); the Android entry from releases/<v>/Chezzflix_<v>_android.apk.
Whatever exists is included. Usage: make-feed.py <version> <base-download-url-for-that-version>"""
import datetime, hashlib, json, os, sys

ver, base = sys.argv[1], sys.argv[2].rstrip("/")
d = f"releases/{ver}"
feed = {"version": ver, "notes": "", "pub_date": datetime.datetime.now(datetime.timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"), "platforms": {}}
if os.path.exists(f"{d}/notes.txt"):
    feed["notes"] = open(f"{d}/notes.txt").read().strip()

tar, sig = f"{d}/Chezzflix.app.tar.gz", f"{d}/Chezzflix.app.tar.gz.sig"
if os.path.exists(tar) and os.path.exists(sig):
    entry = {"signature": open(sig).read().strip(), "url": f"{base}/Chezzflix.app.tar.gz" if "github.com" in base else f"{base}/{ver}/Chezzflix.app.tar.gz"}
    feed["platforms"] = {"darwin-aarch64": entry, "darwin-x86_64": entry}

apk = f"{d}/Chezzflix_{ver}_android.apk"
if os.path.exists(apk):
    h = hashlib.sha256(open(apk, "rb").read()).hexdigest()
    feed["android"] = {"version": ver, "url": f"{base}/Chezzflix_{ver}_android.apk" if "github.com" in base else f"{base}/{ver}/Chezzflix_{ver}_android.apk", "sha256": h, "size": os.path.getsize(apk)}

if not feed["platforms"] and "android" not in feed:
    sys.exit(f"nothing to publish in {d}")
json.dump(feed, open("releases/latest.json", "w"), indent=2)
print(f"feed: v{ver}  mac={'yes' if feed['platforms'] else 'no'}  android={'yes' if 'android' in feed else 'no'}")
