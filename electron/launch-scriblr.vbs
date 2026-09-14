' Launches Scriblr in prod-from-source mode (backend serves frontend/dist
' directly, no Vite/dev server involved) with no visible console window.
' Re-run `npm run build` in frontend/ after future changes to pick them up --
' this always runs whatever is currently built there, not a fixed snapshot.
Set WshShell = CreateObject("WScript.Shell")
Set WshEnv = WshShell.Environment("Process")
WshEnv("SCRIBLR_FORCE_PROD") = "1"
' Defensively unset -- if inherited from a parent process, this forces
' electron.exe to run as plain Node instead of launching the app (it
' silently crashes with no visible window, since we launch hidden).
WshEnv.Remove("ELECTRON_RUN_AS_NODE")
WshShell.CurrentDirectory = "C:\Users\rella\scriblr\scriblr\electron"
' Window style 1 (normal), not 0 (hidden) -- Electron's first window on
' Windows inherits the launching process's show-state hint, so a hidden
' launch suppresses the whole app's window, not just a console flash.
' electron.exe has no console of its own (GUI subsystem), so there's
' nothing to hide here anyway.
WshShell.Run """node_modules\electron\dist\electron.exe"" .", 1, False
