  function Read-State {
    Reject-Reparse $statePath
    $stream=$null
    for($readAttempt=0;$readAttempt -lt 20 -and !$stream;$readAttempt++){
      try{$stream=[IO.File]::Open($statePath,[IO.FileMode]::Open,[IO.FileAccess]::Read,([IO.FileShare]::ReadWrite -bor [IO.FileShare]::Delete))}
      catch [IO.FileNotFoundException]{if($readAttempt -eq 19){return $null}}
      catch [IO.DirectoryNotFoundException]{if($readAttempt -eq 19){return $null}}
      catch [IO.IOException]{if($readAttempt -eq 19){Fail 'RUNTIME_STATE_UNAVAILABLE'}}
      if(!$stream){Start-Sleep -Milliseconds 5}
    }
    $reader=[IO.StreamReader]::new($stream,$utf8)
    try { $s=$reader.ReadToEnd() | ConvertFrom-Json } finally { $reader.Dispose() }
    if ($s.code -notmatch '^RUNTIME_[A-Z_]+$') { Fail 'HANAMESH_RUNTIME_STATE_INVALID' }
    return $s
  }
  function Atomic-JSON([string]$Path,$Value) {
    Reject-Reparse $Path
    [IO.Directory]::CreateDirectory((Split-Path -Parent $Path)) | Out-Null
    $temp = $Path + '.' + [Guid]::NewGuid().ToString('N') + '.tmp'
    $previous = $temp + '.previous'
    try {
      [IO.File]::WriteAllText($temp,($Value | ConvertTo-Json -Depth 20 -Compress),$utf8)
      if (Test-Path -LiteralPath $Path) { [IO.File]::Replace($temp,$Path,$previous) } else { [IO.File]::Move($temp,$Path) }
    } finally { if ([IO.File]::Exists($temp)) { [IO.File]::Delete($temp) }; if ([IO.File]::Exists($previous)) { [IO.File]::Delete($previous) } }
  }
  function Lease {
    Reject-Reparse $cache
    [IO.Directory]::CreateDirectory($cache) | Out-Null
    $path = Join-Path $cache 'prepare.lock'
    Reject-Reparse $path
    try { return [IO.File]::Open($path,[IO.FileMode]::OpenOrCreate,[IO.FileAccess]::ReadWrite,[IO.FileShare]::None) } catch [IO.IOException] { return $null }
  }
