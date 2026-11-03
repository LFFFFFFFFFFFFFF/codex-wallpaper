Option Explicit
Dim shell, fso, folder, command, result, powershell, candidate
Set shell = CreateObject("WScript.Shell")
Set fso = CreateObject("Scripting.FileSystemObject")
folder = fso.GetParentFolderName(WScript.ScriptFullName)
powershell = "pwsh.exe"
For Each candidate In Array(shell.ExpandEnvironmentStrings("%ProgramFiles%\PowerShell\7\pwsh.exe"), shell.ExpandEnvironmentStrings("%USERPROFILE%\.cache\codex-runtimes\codex-primary-runtime\dependencies\native\powershell\pwsh.exe"))
  If fso.FileExists(candidate) Then
    powershell = candidate
    Exit For
  End If
Next
command = Chr(34) & powershell & Chr(34) & " -NoLogo -NoProfile -WindowStyle Hidden -File " & Chr(34) & fso.BuildPath(folder, "Start-Wallpaper.ps1") & Chr(34)
On Error Resume Next
result = shell.Run(command, 0, True)
If Err.Number <> 0 Or result <> 0 Then
  MsgBox "Unable to launch. Install PowerShell 7, then run Start-Wallpaper.ps1 in a terminal to see the error.", 48, "Codex Wallpaper"
End If
