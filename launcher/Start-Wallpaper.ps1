param([string]$BuildRoot=$PSScriptRoot,[switch]$ReuseOfficialProfile,[switch]$PreferDisplayGpu,[string]$ProfileRoot,[string]$CodexHomeRoot)
$ErrorActionPreference='Stop'
$sfRoot=[IO.Path]::GetFullPath($BuildRoot)
$sfManifest=Get-Content -LiteralPath (Join-Path $sfRoot 'build-manifest.json') -Raw -Encoding UTF8 | ConvertFrom-Json
if($sfManifest.format -ne 'skinforge.local-wallpaper-build'){throw 'Unsupported build manifest'}
if((Get-FileHash -LiteralPath $sfManifest.archive -Algorithm SHA256).Hash.ToLowerInvariant() -ne $sfManifest.archiveSha256){throw 'Archive integrity mismatch'}
if((Get-FileHash -LiteralPath $sfManifest.exe -Algorithm SHA256).Hash.ToLowerInvariant() -ne $sfManifest.executable.customExecutableSha256){throw 'Executable integrity mismatch'}
if($PreferDisplayGpu){
 $sfGpuKey='HKCU:\Software\Microsoft\DirectX\UserGpuPreferences'
 New-Item -Path $sfGpuKey -Force | Out-Null
 $sfGpuBackup=Join-Path $sfRoot 'display-gpu-before.json'
 if(-not (Test-Path -LiteralPath $sfGpuBackup)){
  $sfValue=(Get-Item -LiteralPath $sfGpuKey).GetValue($sfManifest.exe,$null)
  @{executable=$sfManifest.exe;existed=($null -ne $sfValue);value=$sfValue} | ConvertTo-Json | Set-Content -LiteralPath $sfGpuBackup -Encoding UTF8
 }
 New-ItemProperty -LiteralPath $sfGpuKey -Name $sfManifest.exe -PropertyType String -Value 'GpuPreference=1;' -Force | Out-Null
}
if($ReuseOfficialProfile){
 $sfRunning=Get-CimInstance Win32_Process | Where-Object { $_.Name -eq 'ChatGPT.exe' -and $_.ExecutablePath -like '*WindowsApps*OpenAI.Codex*' }
 if($sfRunning){throw 'Close the official Codex normally before reusing its profile. This launcher will not stop it.'}
 $sfProfile=Join-Path $env:APPDATA 'Codex'
}elseif($ProfileRoot){$sfProfile=[IO.Path]::GetFullPath($ProfileRoot)}else{$sfProfile=Join-Path $sfRoot 'profile'}
$sfHasher=[Security.Cryptography.SHA256]::Create()
try{$sfHash=$sfHasher.ComputeHash([Text.Encoding]::UTF8.GetBytes($sfProfile.ToLowerInvariant()))}finally{$sfHasher.Dispose()}
$sfPipe='skinforge-wallpaper-'+([BitConverter]::ToString($sfHash)).Replace('-','').Substring(0,24).ToLowerInvariant()
$sfInfo=[Diagnostics.ProcessStartInfo]::new();$sfInfo.FileName=$sfManifest.exe;$sfInfo.WorkingDirectory=Join-Path $sfRoot 'runtime';$sfInfo.UseShellExecute=$false;$sfInfo.WindowStyle=[Diagnostics.ProcessWindowStyle]::Normal
$sfInfo.Environment['CODEX_ELECTRON_USER_DATA_PATH']=$sfProfile
$sfInfo.Environment['SKINFORGE_WALLPAPER_IPC']=$sfPipe
if(-not $ReuseOfficialProfile){$sfInfo.Environment['CODEX_HOME']=if($CodexHomeRoot){[IO.Path]::GetFullPath($CodexHomeRoot)}elseif($ProfileRoot){Join-Path (Split-Path $sfProfile) 'codex-home'}else{Join-Path $sfRoot 'codex-home'}}
$sfInfo.ArgumentList.Add('--user-data-dir='+$sfProfile)
$sfProcess=[Diagnostics.Process]::Start($sfInfo)
Write-Output ('Started local wallpaper build, PID '+$sfProcess.Id)
