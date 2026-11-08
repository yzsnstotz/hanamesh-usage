# Load the exact Actions-built AnyCPU helper; never compile inside a user's profile.
. ([IO.Path]::Combine($PSScriptRoot,'windows-primitives.ps1'))
function Initialize-HanaMeshDetached {
  if ('HanaMeshDetached' -as [type]) { return }
  $record=Get-Content -Raw -LiteralPath (Join-Path $PSScriptRoot 'windows-detached.json')|ConvertFrom-Json
  $source=Join-Path $PSScriptRoot 'windows-detached.cs'
  $binary=Join-Path $PSScriptRoot 'windows-detached.dll'
  $bytes=[IO.File]::ReadAllBytes($binary)
  $hasher=[Security.Cryptography.SHA256]::Create()
  try{$digest=([BitConverter]::ToString($hasher.ComputeHash($bytes))).Replace('-','').ToLowerInvariant()}finally{$hasher.Dispose()}
  if($record.schemaVersion -ne 1 -or $record.architecture -ne 'AnyCPU' -or $record.sha256 -notmatch '^[a-f0-9]{64}$' -or (Get-FileHash -LiteralPath $source -Algorithm SHA256).Hash.ToLowerInvariant() -cne $record.sourceSha256 -or $digest -cne $record.sha256){throw 'HANAMESH_WINDOWS_DETACH_HELPER_CHECKSUM_MISMATCH'}
  [Reflection.Assembly]::Load($bytes)|Out-Null
  if(!('HanaMeshDetached' -as [type])){throw 'HANAMESH_WINDOWS_DETACH_HELPER_INVALID'}
}
