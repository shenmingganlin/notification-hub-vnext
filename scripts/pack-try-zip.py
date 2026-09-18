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
try_zip = dist / "notification-hub-vnext-0.1.8-visual-pkg.zip"
studio_persist_zip = dist / "notification-hub-vnext-0.1.8-studio-persist.zip"
studio_persist_expected = "9AAE8613F34C736773E336F0663CA0F2434F7A0B143D5B0716C9DC800EB5B96C"
margins_zip = dist / "notification-hub-vnext-0.1.8-margins.zip"
margins_expected = "065B6F1FEFF2C5DEF3AA38B1A24B4928E5B447AC9B2A14A5F0515B386ED44663"
content_zip = dist / "notification-hub-vnext-0.1.8-content.zip"
content_expected = "CDD0BC9C2557A428972685F57B68A8EB1E9A92393C255865AD9E5071D6BB3F9D"
hover_zip = dist / "notification-hub-vnext-0.1.8-hover.zip"
hover_expected = "DCD480E3931079902DA1777AE9323D3732F8997E09C3AB45278EC2269871A980"
overlay_zip = dist / "notification-hub-vnext-0.1.8-overlay.zip"
overlay_expected = "CA8484EC76A32751CB4698A2F09CB7F7AB0FAF4BD0F93689B5BE32508E851B21"
coil_zip = dist / "notification-hub-vnext-0.1.8-coil.zip"
coil_expected = "C8B503DA19BDCBCD61CA23A4CA62F3874DF6E7C442A0BAC07BC2B1CDC4EF0900"
newest_zip = dist / "notification-hub-vnext-0.1.8-newest.zip"
newest_expected = "2C15540465B3BBE7E1EFEE8527CA08D8DD96B9E87198D7EA70E695696D4C16D5"
sound_lib_zip = dist / "notification-hub-vnext-0.1.8-sound-lib.zip"
sound_lib_expected = "F5228300DF4260A53C7B39B2EB37FDC6FF15B199399F069CE641261EBBE927E5"
follow_zip = dist / "notification-hub-vnext-0.1.8-follow.zip"
follow_expected = "BA96ED19DB41E962DA64A1DC4A2BD5554202EFBBAC8CA3FE2E087FC3B7B21EA1"
perf_zip = dist / "notification-hub-vnext-0.1.8-perf.zip"
perf_expected = "6F2C2A2FE82A80A928F54067779F648DDDDD6416D02DEF9B158B5F95CC76F7E3"
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
            "domain/visual-package-io.js",
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
pinned_zip = dist / "notification-hub-vnext-0.1.8.zip"
pinned_expected = "CA8484EC76A32751CB4698A2F09CB7F7AB0FAF4BD0F93689B5BE32508E851B21"
if studio_persist_zip.is_file():
    studio_persist_sha = hashlib.sha256(studio_persist_zip.read_bytes()).hexdigest().upper()
    print("STUDIO_PERSIST_ZIP_SHA256", studio_persist_sha)
    if studio_persist_sha != studio_persist_expected:
        raise SystemExit(f"studio-persist try zip hash drifted: {studio_persist_sha}")
if margins_zip.is_file():
    margins_sha = hashlib.sha256(margins_zip.read_bytes()).hexdigest().upper()
    print("MARGINS_ZIP_SHA256", margins_sha)
    if margins_sha != margins_expected:
        raise SystemExit(f"margins try zip hash drifted: {margins_sha}")
if content_zip.is_file():
    content_sha = hashlib.sha256(content_zip.read_bytes()).hexdigest().upper()
    print("CONTENT_ZIP_SHA256", content_sha)
    if content_sha != content_expected:
        raise SystemExit(f"content try zip hash drifted: {content_sha}")
if hover_zip.is_file():
    hover_sha = hashlib.sha256(hover_zip.read_bytes()).hexdigest().upper()
    print("HOVER_ZIP_SHA256", hover_sha)
    if hover_sha != hover_expected:
        raise SystemExit(f"hover try zip hash drifted: {hover_sha}")
if overlay_zip.is_file():
    overlay_sha = hashlib.sha256(overlay_zip.read_bytes()).hexdigest().upper()
    print("OVERLAY_ZIP_SHA256", overlay_sha)
    if overlay_sha != overlay_expected:
        raise SystemExit(f"overlay try zip hash drifted: {overlay_sha}")
if coil_zip.is_file():
    coil_sha = hashlib.sha256(coil_zip.read_bytes()).hexdigest().upper()
    print("COIL_ZIP_SHA256", coil_sha)
    if coil_sha != coil_expected:
        raise SystemExit(f"coil try zip hash drifted: {coil_sha}")
if newest_zip.is_file():
    newest_sha = hashlib.sha256(newest_zip.read_bytes()).hexdigest().upper()
    print("NEWEST_ZIP_SHA256", newest_sha)
    if newest_sha != newest_expected:
        raise SystemExit(f"newest try zip hash drifted: {newest_sha}")
if sound_lib_zip.is_file():
    sound_lib_sha = hashlib.sha256(sound_lib_zip.read_bytes()).hexdigest().upper()
    print("SOUND_LIB_ZIP_SHA256", sound_lib_sha)
    if sound_lib_sha != sound_lib_expected:
        raise SystemExit(f"sound-lib try zip hash drifted: {sound_lib_sha}")
if follow_zip.is_file():
    follow_sha = hashlib.sha256(follow_zip.read_bytes()).hexdigest().upper()
    print("FOLLOW_ZIP_SHA256", follow_sha)
    if follow_sha != follow_expected:
        raise SystemExit(f"follow try zip hash drifted: {follow_sha}")
if perf_zip.is_file():
    perf_sha = hashlib.sha256(perf_zip.read_bytes()).hexdigest().upper()
    print("PERF_ZIP_SHA256", perf_sha)
    if perf_sha != perf_expected:
        raise SystemExit(f"perf try zip hash drifted: {perf_sha}")
if pinned_zip.is_file():
    pinned_sha = hashlib.sha256(pinned_zip.read_bytes()).hexdigest().upper()
    print("PINNED_0_1_8_SHA256", pinned_sha)
    if pinned_sha != pinned_expected:
        raise SystemExit(f"pinned 0.1.8 zip hash drifted: {pinned_sha}")
if freeze_sha_before:
    freeze_sha_after = hashlib.sha256(freeze.read_bytes()).hexdigest().upper()
    print("FREEZE_SHA256", freeze_sha_after)
    if freeze_sha_after != freeze_sha_before:
        raise SystemExit("freeze zip mutated")
else:
    print("FREEZE_ZIP", "missing; 0.1.6 freeze not present")
if baseline_zip.is_file():
    print("BASELINE_ZIP", baseline_zip.name, baseline_zip.stat().st_size)
