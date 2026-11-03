param([ValidateSet('verify','running','start','cache','find','place','pause','resume','mouse','close')][string]$Action,[string]$EnginePath,[string]$Title,[string]$CacheKey,[int]$X=0,[int]$Y=0,[int]$Width=960,[int]$Height=540)
$ErrorActionPreference='Stop'
$EnginePath=[IO.Path]::GetFullPath($EnginePath)
function Get-SceneCacheLocation([string]$LocalData,[string]$CommonData,[string]$UserSid,[string]$Key){
 if($Key -cnotmatch '^[a-f0-9]{32}$' -or $UserSid -cnotmatch '^S-1-(?:[0-9]+-)+[0-9]+$'){throw 'Invalid scene cache identity'}
 # Wallpaper Engine needs an ASCII path. Known folders are independent of the
 # install directory and environment overrides; the ProgramData fallback is per
 # SID. Public Documents permits other users to delete even private children.
 $folder=$LocalData;$name='CodexWECache'
 if($folder -notmatch '^[A-Za-z]:\\' -or $folder -notmatch '^[\x20-\x7e]+$'){$folder=$CommonData;$name+='-'+$UserSid}
 if($folder -notmatch '^[A-Za-z]:\\' -or $folder -notmatch '^[\x20-\x7e]+$'){throw 'No local ASCII scene cache folder is available'}
 $parent=Join-Path ([IO.Path]::GetFullPath($folder)) $name
 return @{parent=$parent;target=(Join-Path $parent $Key)}
}
if($Action -in @('running','start')){
 $directory=[IO.Path]::GetDirectoryName([IO.Path]::GetFullPath($EnginePath))
 foreach($name in @('wallpaper64','wallpaper32')){
  foreach($candidate in [Diagnostics.Process]::GetProcessesByName($name)){
   try{
    $filename=$candidate.MainModule.FileName
    $processInfo=Get-CimInstance Win32_Process -Filter ('ProcessId='+$candidate.Id)
    # Short-lived CLI clients are not the engine server, even if another bitness
    # is running. Sending future commands to the client can break window ownership.
    if($processInfo.CommandLine -match '(?i)(?:^|\s)"?-control"?(?:\s|$)'){continue}
    if([IO.Path]::GetDirectoryName($filename) -eq $directory){@{running=$true;enginePath=$filename;pid=$candidate.Id}|ConvertTo-Json -Compress;exit}
   }catch{}
  }
 }
 if($Action -eq 'running'){Write-Output '{"running":false}';exit}
 $signature=Get-AuthenticodeSignature -LiteralPath $EnginePath
 if($signature.Status -ne 'Valid' -or $signature.SignerCertificate.Subject -notmatch 'Skutta Software GmbH'){throw 'Wallpaper Engine executable signature is invalid'}
 $started=Start-Process -FilePath $EnginePath -ArgumentList '-silent' -WorkingDirectory $directory -WindowStyle Hidden -PassThru
 @{started=$true;pid=$started.Id}|ConvertTo-Json -Compress;exit
}
if($Action -eq 'verify'){
 $signature=Get-AuthenticodeSignature -LiteralPath $EnginePath
 if($signature.Status -ne 'Valid' -or $signature.SignerCertificate.Subject -notmatch 'Skutta Software GmbH'){throw 'Wallpaper Engine executable signature is invalid'}
 Write-Output '{"verified":true}';exit
}
if($Action -eq 'cache'){
 $identity=[Security.Principal.WindowsIdentity]::GetCurrent().User
 $location=Get-SceneCacheLocation ([Environment]::GetFolderPath('LocalApplicationData')) ([Environment]::GetFolderPath('CommonApplicationData')) $identity.Value $CacheKey
 $parent=$location.parent;$target=$location.target
 $trustedOwners=@($identity.Value,'S-1-5-18','S-1-5-32-544','S-1-5-80-956008885-3418522649-1831038044-1853292631-2271478464') # TrustedInstaller
 $unsafeRights=[Security.AccessControl.FileSystemRights]::DeleteSubdirectoriesAndFiles -bor [Security.AccessControl.FileSystemRights]::Delete -bor [Security.AccessControl.FileSystemRights]::ChangePermissions -bor [Security.AccessControl.FileSystemRights]::TakeOwnership
 for($current=$target;$current;$current=[IO.Path]::GetDirectoryName($current)){
  if(Test-Path -LiteralPath $current){
   if((Get-Item -LiteralPath $current -Force).Attributes -band [IO.FileAttributes]::ReparsePoint){throw 'Scene cache cannot contain a link or junction'}
   if($current -ne $parent -and $current -ne $target){
    # A private child DACL cannot defeat FILE_DELETE_CHILD on an ancestor.
    # Fail closed on customized unsafe known folders; never change their ACLs.
    $ancestorAcl=Get-Acl -LiteralPath $current
    if($ancestorAcl.GetOwner([Security.Principal.SecurityIdentifier]).Value -notin $trustedOwners){throw 'Scene cache ancestor has an untrusted owner'}
    foreach($rule in $ancestorAcl.GetAccessRules($true,$true,[Security.Principal.SecurityIdentifier])){
     if($rule.AccessControlType -eq 'Allow' -and -not ($rule.PropagationFlags -band [Security.AccessControl.PropagationFlags]::InheritOnly) -and $rule.IdentityReference.Value -notin $trustedOwners -and ($rule.FileSystemRights -band $unsafeRights)){throw 'Scene cache ancestor permits replacement by another user'}
    }
   }
  }
 }
 if(Test-Path -LiteralPath $parent){$existing=Get-Acl -LiteralPath $parent;if($existing.GetOwner([Security.Principal.SecurityIdentifier]) -ne $identity){throw 'Scene cache parent has a different owner'}}
 if(Test-Path -LiteralPath $target){$existing=Get-Acl -LiteralPath $target;if($existing.GetOwner([Security.Principal.SecurityIdentifier]) -ne $identity){throw 'Scene cache has a different owner'}}
 # Create the private parent with a protected DACL before adding any children.
 $privateAcl=[Security.AccessControl.DirectorySecurity]::new();$privateAcl.SetOwner($identity);$privateAcl.SetAccessRuleProtection($true,$false)
 foreach($sid in @($identity,[Security.Principal.SecurityIdentifier]::new('S-1-5-18'),[Security.Principal.SecurityIdentifier]::new('S-1-5-32-544'))){$privateAcl.AddAccessRule([Security.AccessControl.FileSystemAccessRule]::new($sid,'FullControl','ContainerInherit,ObjectInherit','None','Allow'))}
 foreach($directory in @($parent,$target)){
  [IO.Directory]::CreateDirectory($directory,$privateAcl)|Out-Null
  $existing=Get-Acl -LiteralPath $directory
  if($existing.GetOwner([Security.Principal.SecurityIdentifier]) -ne $identity){throw 'Scene cache has a different owner'}
  if((Get-Item -LiteralPath $directory -Force).Attributes -band [IO.FileAttributes]::ReparsePoint){throw 'Scene cache cannot contain a link or junction'}
  $info=[IO.DirectoryInfo]::new($directory);$acl=$info.GetAccessControl([Security.AccessControl.AccessControlSections]::Access);$acl.SetAccessRuleProtection($true,$false)
  foreach($rule in $acl.GetAccessRules($true,$false,[Security.Principal.SecurityIdentifier])){[void]$acl.RemoveAccessRuleSpecific($rule)}
  foreach($sid in @($identity,[Security.Principal.SecurityIdentifier]::new('S-1-5-18'),[Security.Principal.SecurityIdentifier]::new('S-1-5-32-544'))){$acl.AddAccessRule([Security.AccessControl.FileSystemAccessRule]::new($sid,'FullControl','ContainerInherit,ObjectInherit','None','Allow'))}
  $info.SetAccessControl($acl)
  & icacls $directory /setintegritylevel '(OI)(CI)M' | Out-Null;if($LASTEXITCODE -ne 0){throw 'Scene cache integrity labeling failed'}
 }
 @{protected=$true;cachePath=$target}|ConvertTo-Json -Compress;exit
}
if($Title -notmatch '^Codex WE Scene [a-f0-9]{32}$'){throw 'Invalid owned window title'}
Add-Type -TypeDefinition @'
using System;
using System.Text;
using System.Runtime.InteropServices;
public static class SkinForgeNativeWindow {
 public delegate bool Callback(IntPtr h,IntPtr l);
 [DllImport("user32.dll")] public static extern bool EnumWindows(Callback cb,IntPtr l);
 [DllImport("user32.dll",CharSet=CharSet.Unicode)] public static extern int GetWindowText(IntPtr h,StringBuilder s,int n);
 [DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(IntPtr h,out uint pid);
 [DllImport("user32.dll")] public static extern bool SetWindowPos(IntPtr h,IntPtr after,int x,int y,int w,int height,uint flags);
 [DllImport("user32.dll")] public static extern bool ShowWindow(IntPtr h,int cmd);
 [DllImport("user32.dll")] public static extern bool IsIconic(IntPtr h);
 [DllImport("user32.dll")] public static extern bool IsWindowVisible(IntPtr h);
 [DllImport("user32.dll")] public static extern bool PostMessage(IntPtr h,uint msg,IntPtr w,IntPtr l);
 [DllImport("user32.dll")] public static extern int GetWindowLong(IntPtr h,int index);
 [DllImport("user32.dll")] public static extern int SetWindowLong(IntPtr h,int index,int value);
 [StructLayout(LayoutKind.Sequential)] public struct Rect { public int left,top,right,bottom; }
 [DllImport("user32.dll")] public static extern bool GetWindowRect(IntPtr h,out Rect rect);
 [DllImport("user32.dll")] public static extern IntPtr SetThreadDpiAwarenessContext(IntPtr context);
}
'@
[void][SkinForgeNativeWindow]::SetThreadDpiAwarenessContext([IntPtr](-4))
$script:ownedHandle=[IntPtr]::Zero
[SkinForgeNativeWindow]::EnumWindows({param($h,$l)
 $text=[Text.StringBuilder]::new(512);[void][SkinForgeNativeWindow]::GetWindowText($h,$text,512)
 if($text.ToString() -eq $Title){$script:ownedHandle=$h;return $false};return $true
},[IntPtr]::Zero)|Out-Null
if($script:ownedHandle -eq [IntPtr]::Zero){Write-Output '{"found":false}';exit}
$enginePid=[uint32]0;[void][SkinForgeNativeWindow]::GetWindowThreadProcessId($script:ownedHandle,[ref]$enginePid)
$owner=[Diagnostics.Process]::GetProcessById($enginePid)
if($owner.MainModule.FileName -ne $EnginePath){throw 'Window is not owned by the verified engine'}
switch($Action){
 'close' {[void][SkinForgeNativeWindow]::PostMessage($script:ownedHandle,0x0010,[IntPtr]::Zero,[IntPtr]::Zero)}
 'place' {if(-not [SkinForgeNativeWindow]::IsIconic($script:ownedHandle)){$style=[SkinForgeNativeWindow]::GetWindowLong($script:ownedHandle,-20);[void][SkinForgeNativeWindow]::SetWindowLong($script:ownedHandle,-20,($style -bor 0x08000080) -band (-bnot 0x40000));[void][SkinForgeNativeWindow]::SetWindowPos($script:ownedHandle,[IntPtr]1,$X,$Y,$Width,$Height,0x0030)}}
 'pause' {[void][SkinForgeNativeWindow]::ShowWindow($script:ownedHandle,7)}
 'resume' {
  [void][SkinForgeNativeWindow]::ShowWindow($script:ownedHandle,4)
  # Restore can raise the source above the host. Lower it in this same helper,
  # before another PowerShell invocation is needed to update its coordinates.
  [void][SkinForgeNativeWindow]::SetWindowPos($script:ownedHandle,[IntPtr]1,0,0,0,0,0x0013)
 }
 'mouse' {[void][SkinForgeNativeWindow]::PostMessage($script:ownedHandle,0x0200,[IntPtr]::Zero,[IntPtr](($Y -shl 16) -bor ($X -band 65535)))}
}
$rect=[SkinForgeNativeWindow+Rect]::new();[void][SkinForgeNativeWindow]::GetWindowRect($script:ownedHandle,[ref]$rect)
@{found=$true;handle=$script:ownedHandle.ToInt64().ToString();visible=[SkinForgeNativeWindow]::IsWindowVisible($script:ownedHandle);minimized=[SkinForgeNativeWindow]::IsIconic($script:ownedHandle);x=$rect.left;y=$rect.top;width=($rect.right-$rect.left);height=($rect.bottom-$rect.top)}|ConvertTo-Json -Compress
