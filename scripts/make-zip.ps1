param([Parameter(Mandatory=$true)][string]$Request)
$ErrorActionPreference='Stop'
Add-Type -AssemblyName System.IO.Compression
Add-Type -AssemblyName System.IO.Compression.FileSystem
$sfRequest=Get-Content -LiteralPath $Request -Raw -Encoding UTF8 | ConvertFrom-Json
$sfStream=[IO.File]::Open($sfRequest.archive,[IO.FileMode]::CreateNew)
try{
 $sfZip=[IO.Compression.ZipArchive]::new($sfStream,[IO.Compression.ZipArchiveMode]::Create,$true)
 try{foreach($sfRelative in $sfRequest.files){$sfFile=Join-Path $sfRequest.root $sfRelative;$sfName=$sfRequest.prefix+'/'+$sfRelative;[IO.Compression.ZipFileExtensions]::CreateEntryFromFile($sfZip,$sfFile,$sfName,[IO.Compression.CompressionLevel]::Optimal)|Out-Null}}finally{$sfZip.Dispose()}
}finally{$sfStream.Dispose()}
