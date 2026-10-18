"""Package extension/ for release with the production API baked in.

The source keeps http://localhost:8000 as its default for development. This copies it to dist/extension/,
points DEFAULT_API_BASE (background.js, options.js) and the options placeholder at the given URL, narrows
host_permissions to the shops plus that one origin, and zips it for the Chrome Web Store.
usage: python scripts/build_extension.py https://cai-api-xxxxx.asia-southeast1.run.app
"""
import json, pathlib, shutil, sys, zipfile
from urllib.parse import urlsplit

ROOT = pathlib.Path(__file__).resolve().parents[1]
SRC, DIST = ROOT / "extension", ROOT / "dist"
DEV_BASE = "http://localhost:8000"


def build(api_base: str, dist: pathlib.Path = DIST) -> pathlib.Path:
    u = urlsplit(api_base.strip())
    if u.scheme != "https" or not u.netloc or u.path not in ("", "/"):
        raise ValueError(f"need an https origin like https://host, got {api_base!r}")
    origin = f"https://{u.netloc}"
    out = dist / "extension"
    shutil.rmtree(out, ignore_errors=True)
    shutil.copytree(SRC, out, ignore=shutil.ignore_patterns("test", "README.md", ".*"))
    for name in ("background.js", "options.js", "options.html"):
        f = out / name
        text = f.read_text()
        if DEV_BASE not in text:
            raise RuntimeError(f"{name} no longer contains {DEV_BASE}; update build_extension.py")
        f.write_text(text.replace(DEV_BASE, origin))
    manifest = json.loads((out / "manifest.json").read_text())
    shops = [p for p in manifest["host_permissions"] if "shopee" in p or "lazada" in p]
    manifest["host_permissions"] = shops + [f"{origin}/*"]
    (out / "manifest.json").write_text(json.dumps(manifest, indent=2, ensure_ascii=False) + "\n")
    zip_path = dist / f"commodity-ai-extension-{manifest['version']}.zip"
    with zipfile.ZipFile(zip_path, "w", zipfile.ZIP_DEFLATED) as z:
        for f in sorted(out.rglob("*")):
            if f.is_file():
                z.write(f, f.relative_to(out))
    return zip_path


if __name__ == "__main__":
    if len(sys.argv) != 2:
        sys.exit(__doc__)
    print(build(sys.argv[1]))
