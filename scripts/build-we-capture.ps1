param([string]$OutDir=(Join-Path $PSScriptRoot '../.native'))
$ErrorActionPreference='Stop'
$sfCompiler=Get-Command cl.exe -ErrorAction SilentlyContinue
if(-not $sfCompiler){throw 'Run this script in an x64 Visual Studio Developer PowerShell with MSVC and Windows 10/11 SDK installed.'}
$sfOutput=[IO.Path]::GetFullPath($OutDir)
New-Item -ItemType Directory -Path $sfOutput -Force | Out-Null
$sfSource=[IO.Path]::GetFullPath((Join-Path $PSScriptRoot '../src/we/wallpaper-window-capture.cpp'))
$sfExe=Join-Path $sfOutput 'codex-we-window-capture.exe'
& $sfCompiler.Source /nologo /std:c++20 /EHsc /O2 /DUNICODE /D_UNICODE $sfSource ('/Fe:'+$sfExe) ('/Fo:'+(Join-Path $sfOutput 'capture.obj')) ('/Fd:'+(Join-Path $sfOutput 'capture.pdb')) /link d3d11.lib dxgi.lib windowsapp.lib user32.lib ole32.lib runtimeobject.lib
if($LASTEXITCODE -ne 0){throw 'WE capture helper compilation failed'}
Get-FileHash -LiteralPath $sfExe -Algorithm SHA256
Write-Output ('Set SKINFORGE_WE_CAPTURE_EXE to '+$sfExe+' before building the local runtime.')
