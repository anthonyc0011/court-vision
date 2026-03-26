# -*- mode: python ; coding: utf-8 -*-


a = Analysis(
    ['excel_quiz_mac.py'],
    pathex=[],
    binaries=[],
    datas=[('ALL_NBA_PLAYERS.xlsx', '.')],
    hiddenimports=['pandas', 'numpy', 'openpyxl'],
    hookspath=[],
    hooksconfig={},
    runtime_hooks=[],
    excludes=[],
    noarchive=False,
    optimize=0,
)
pyz = PYZ(a.pure)

exe = EXE(
    pyz,
    a.scripts,
    a.binaries,
    a.datas,
    [],
    name='excel_quiz_mac',
    debug=False,
    bootloader_ignore_signals=False,
    strip=False,
    upx=True,
    upx_exclude=[],
    runtime_tmpdir=None,
    console=False,
    disable_windowed_traceback=False,
    argv_emulation=False,
    target_arch=None,
    codesign_identity=None,
    entitlements_file=None,
)
app = BUNDLE(
    exe,
    name='excel_quiz_mac.app',
    icon=None,
    bundle_identifier=None,
)
