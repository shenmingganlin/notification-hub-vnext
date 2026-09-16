import hashlib
import json
import shutil
import tempfile
import zipfile
from pathlib import Path

root = Path(__file__).resolve().parents[1]
dist = root / "dist"
freeze = dist / "notification-hub-vnext-0.1.6.zip"
baseline_zip = dist / "notification-hub-vnext-0.1.7-try.zip"
try_zip = dist / "notification-hub-vnext-0.1.8.zip"
plugin = root / "plugin"
expected_freeze = "2BD878DEF7D8CCFCD47FA0482E8444BC0D1B967AC0FBBA201B3F226A7BB54D88"
audio_src = root / "build" / "audio-follow-default" / "runtime" / "Release" / "notification-hub-audio-engine.exe"

freeze_sha_before = None
if freeze.is_file():
    freeze_sha_before = hashlib.sha256(freeze.read_bytes()).hexdigest().upper()
    if freeze_sha_before != expected_freeze:
        raise SystemExit(f"freeze zip hash drifted: {freeze_sha_before}")

if not audio_src.is_file():
    raise SystemExit(f"new audio engine missing: {audio_src}")

stage = Path(tempfile.mkdtemp(prefix="nh-try-full-"))
try:
    for rel in ["package.json", "package-lock.json", "LICENSE", "schemas"]:
        src = root / rel
        dest = stage / rel
        if src.is_dir():
            shutil.copytree(src, dest)
        else:
            shutil.copy2(src, dest)

    for item in plugin.iterdir():
        if item.name == "commands":
            continue
        dest = stage / item.name
        if item.is_dir():
            shutil.copytree(item, dest)
        else:
            shutil.copy2(item, dest)

    runtime_dir = stage / "runtime"
    runtime_dir.mkdir(exist_ok=True)
    shutil.copy2(plugin / "runtime" / "notification-hub-runtime.exe", runtime_dir / "notification-hub-runtime.exe")
    shutil.copy2(audio_src, runtime_dir / "notification-hub-audio-engine.exe")

    adm_src = root / "node_modules" / "adm-zip"
    if not (adm_src / "adm-zip.js").is_file():
        raise SystemExit("missing node_modules/adm-zip/adm-zip.js")
    adm_dest = stage / "node_modules" / "adm-zip"
    adm_dest.parent.mkdir(parents=True, exist_ok=True)
    if adm_dest.exists():
        shutil.rmtree(adm_dest)
    shutil.copytree(adm_src, adm_dest)

    pkg_path = stage / "package.json"
    pkg = json.loads(pkg_path.read_text(encoding="utf-8"))
    pkg.pop("scripts", None)
    pkg_path.write_text(json.dumps(pkg, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")

    if try_zip.exists():
        try_zip.unlink()
    with zipfile.ZipFile(try_zip, "w", zipfile.ZIP_DEFLATED) as z:
        for path in sorted(p for p in stage.rglob("*") if p.is_file()):
            z.write(path, path.relative_to(stage).as_posix())

    with zipfile.ZipFile(try_zip) as z:
        names = [n.replace("\\", "/") for n in z.namelist()]
        required = [
            "manifest.json",
            "index.js",
            "package.json",
            "runtime/notification-hub-runtime.exe",
            "runtime/notification-hub-audio-engine.exe",
            "node_modules/adm-zip/adm-zip.js",
            "routes/settings-visual.js",
            "routes/settings-visual-client.js",
            "routes/settings-font-assets.js",
            "routes/settings-font-assets-page.js",
            "domain/font-asset-library.js",
            "domain/sound-library-reconcile.js",
            "domain/sound-asset-storage-path.js",
            "assets/yuan/Hanako.png",
            "assets/yuan/Butter.png",
            "assets/yuan/Ming.png",
            "assets/yuan/Kong.png",
        ]
        missing = [n for n in required if n not in names]
        if missing:
            raise SystemExit("missing entries: " + ", ".join(missing))
        nested = [
            n
            for n in names
            if n.endswith("plugin/manifest.json") or n.endswith("notification-hub-vnext/manifest.json")
        ]
        if nested:
            raise SystemExit("nested plugin root: " + ", ".join(nested))
        leaked_commands = [n for n in names if n.startswith("commands/")]
        if leaked_commands:
            raise SystemExit("commands leaked")
        print("entries", len(names))
        print("runtime.exe", z.getinfo("runtime/notification-hub-runtime.exe").file_size)
        print("audio.exe", z.getinfo("runtime/notification-hub-audio-engine.exe").file_size)
finally:
    shutil.rmtree(stage, ignore_errors=True)

digest = hashlib.sha256(try_zip.read_bytes()).hexdigest().upper()
print("TRY_ZIP_SHA256", digest)
print("TRY_ZIP_SIZE", try_zip.stat().st_size)
if freeze_sha_before:
    freeze_sha_after = hashlib.sha256(freeze.read_bytes()).hexdigest().upper()
    print("FREEZE_SHA256", freeze_sha_after)
    if freeze_sha_after != freeze_sha_before:
        raise SystemExit("freeze zip mutated")
else:
    print("FREEZE_ZIP", "missing; 0.1.6 freeze not present")
if baseline_zip.is_file():
    print("BASELINE_ZIP", baseline_zip.name, baseline_zip.stat().st_size)
