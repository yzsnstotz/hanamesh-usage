  if ($Action -eq 'prepare-worker') {
    $token = $AgentArgs[0]
    $lease = $null
    for ($i=0; $i -lt 100 -and !$lease; $i++) { $lease=Lease; if (!$lease) { Start-Sleep -Milliseconds 20 } }
    if (!$lease) { exit 0 }
    try {
      $s = Read-State
      if (!$s -or $s.token -ne $token -or $s.code -ne 'RUNTIME_PREPARING') { exit 0 }
      $s.pid=$PID; $s.processStartedTicks=[Diagnostics.Process]::GetCurrentProcess().StartTime.ToUniversalTime().Ticks.ToString()
      Atomic-JSON $statePath $s
      try {
        Install-Runtime
        $s.code='RUNTIME_READY';$s.phase='ready';$s.downloadedBytes=$target.bytes;$s.finishedAt=[DateTime]::UtcNow.ToString("yyyy-MM-dd'T'HH:mm:ss.fff'Z'");Atomic-JSON $statePath $s
        Node-Invoke @((Join-Path $plugin 'lib/agent/preparation.mjs'))
      } catch {
        $code=$_.Exception.Message
        $s.code=switch($code){
          'HANAMESH_NODE_ARCHIVE_CHECKSUM_MISMATCH' {'RUNTIME_ARCHIVE_CHECKSUM_MISMATCH'}
          'HANAMESH_NODE_EXTRACT_FAILED' {'RUNTIME_EXTRACT_FAILED'}
          'HANAMESH_NODE_RUNTIME_VERSION_MISMATCH' {'RUNTIME_VERSION_MISMATCH'}
          default {if($code -match '^RUNTIME_[A-Z_]+$'){$code}elseif($code -match '^HANAMESH_NODE_'){'RUNTIME_CACHE_INVALID'}else{'RUNTIME_PREPARATION_FAILED'}}
        }
        $s.phase='failed';$s.finishedAt=[DateTime]::UtcNow.ToString("yyyy-MM-dd'T'HH:mm:ss.fff'Z'");Atomic-JSON $statePath $s
      }
    } finally { $lease.Dispose() }
    exit 0
  }
