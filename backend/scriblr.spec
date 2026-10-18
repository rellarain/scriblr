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
    # Modules this app never loads; leaving them out shrinks the bundle and its start-up.
    excludes=['tkinter', '_tkinter', 'xmlrpc', 'lib2to3', 'pydoc_data'],
    noarchive=False,
)

# Bundles the built frontend (frontend/dist) into frontend_dist/ inside the
# app, unpacked next to server_main.py's own files at runtime (see
# frontend_dist_path() in server_main.py).
a.datas += Tree(frontend_dist, prefix='frontend_dist')

pyz = PYZ(a.pure)

# One-dir: the interpreter and libraries sit unpacked beside the exe, so a launch does not extract ~20 MB into %TEMP% (and have it scanned) every
# time, as a one-file exe does. electron-builder copies dist/scriblr-backend/ whole (see electron/package.json extraResources).
exe = EXE(
    pyz,
    a.scripts,
    [],
    exclude_binaries=True,
    name='scriblr-backend',
    debug=False,
    bootloader_ignore_signals=False,
    strip=False,
    upx=False,
    upx_exclude=[],
    console=False,
    disable_windowed_traceback=False,
    argv_emulation=False,
    target_arch=None,
    codesign_identity=None,
    entitlements_file=None,
    icon=os.path.join(SPECPATH, 'icon.ico'),
)

coll = COLLECT(
    exe,
    a.binaries,
    a.datas,
    strip=False,
    upx=False,
    upx_exclude=[],
    name='scriblr-backend',
)
