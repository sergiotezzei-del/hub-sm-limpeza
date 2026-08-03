from __future__ import annotations

import apply_profile_camera_pwa as updater

old_picker = '''  function openFilePicker() {\n    if (detailsRef.current) detailsRef.current.open = false;\n    fileInputRef.current?.click();\n  }\n'''
new_picker = '''  function openFilePicker() {\n    if (detailsRef.current) detailsRef.current.open = false;\n    if (cameraOpen) {\n      stopCamera();\n      setCameraOpen(false);\n      setCameraReady(false);\n    }\n    window.setTimeout(() => fileInputRef.current?.click(), 0);\n  }\n'''

if updater.PROFILE_AVATAR_MENU.count(old_picker) != 1:
    raise RuntimeError("Não foi possível ajustar o seletor de foto")
updater.PROFILE_AVATAR_MENU = updater.PROFILE_AVATAR_MENU.replace(old_picker, new_picker, 1)

old_cache_fallback = '''      }).catch(() => cached);\n'''
new_cache_fallback = '''      }).catch(() => cached || Response.error());\n'''
if updater.SERVICE_WORKER.count(old_cache_fallback) != 1:
    raise RuntimeError("Não foi possível ajustar o fallback do service worker")
updater.SERVICE_WORKER = updater.SERVICE_WORKER.replace(old_cache_fallback, new_cache_fallback, 1)

updater.main()
