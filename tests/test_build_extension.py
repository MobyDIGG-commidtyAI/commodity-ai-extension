import json, sys, zipfile, pathlib

import pytest

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parents[1] / "scripts"))
from build_extension import build


def test_release_build_points_at_production_only(tmp_path):
    z = build("https://cai-api-123.asia-southeast1.run.app/", tmp_path)
    out = tmp_path / "extension"
    for name in ("background.js", "options.js", "options.html"):
        text = (out / name).read_text()
        assert "localhost:8000" not in text and "https://cai-api-123.asia-southeast1.run.app" in text
    perms = json.loads((out / "manifest.json").read_text())["host_permissions"]
    assert "https://cai-api-123.asia-southeast1.run.app/*" in perms
    assert not [p for p in perms if "localhost" in p or "127.0.0.1" in p or "*.run.app" in p or "railway" in p]
    names = zipfile.ZipFile(z).namelist()
    assert "manifest.json" in names and not [n for n in names if n.startswith("test/")]


@pytest.mark.parametrize("bad", ["http://example.com", "https://example.com/api", "localhost:8000"])
def test_rejects_non_https_origins(tmp_path, bad):
    with pytest.raises(ValueError):
        build(bad, tmp_path)
