# -*- mode: python ; coding: utf-8 -*-
# Build with: pyinstaller scriblr.spec  (run `npm run build` in frontend/ first)
#
# Produces the headless backend helper that the Electron shell (see
# electron/main.js) spawns as a subprocess and bundles as an extraResource --
# this is NOT the app the user double-clicks; `electron-builder` produces
# that from electron/.
import os

frontend_dist = os.path.join(SPECPATH, '..', 'frontend', 'dist')

a = Analysis(
    ['server_main.py'],
    pathex=[SPECPATH],
    binaries=[],
    datas=[],
    hiddenimports=[],
    hookspath=[],
    hooksconfig={},
    runtime_hooks=[],
    excludes=[],
    noarchive=False,
)

# Bundles the built frontend (frontend/dist) into frontend_dist/ inside the
# app, unpacked next to server_main.py's own files at runtime (see
# frontend_dist_path() in server_main.py).
a.datas += Tree(frontend_dist, prefix='frontend_dist')

pyz = PYZ(a.pure)

exe = EXE(
    pyz,
    a.scripts,
    a.binaries,
    a.datas,
    [],
    name='scriblr-backend',
    debug=False,
    bootloader_ignore_signals=False,
    strip=False,
    upx=False,
    upx_exclude=[],
    runtime_tmpdir=None,
    console=False,
    disable_windowed_traceback=False,
    argv_emulation=False,
    target_arch=None,
    codesign_identity=None,
    entitlements_file=None,
    icon=os.path.join(SPECPATH, 'icon.ico'),
)
