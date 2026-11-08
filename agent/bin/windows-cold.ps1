  $eventIndex=[Array]::IndexOf($AgentArgs,'--event')
  $event=if ($eventIndex -ge 0) { $AgentArgs[$eventIndex+1] } else { '' }
  $isSession=$Action -eq 'hook' -and $event -eq 'SessionStart'
  $payload=$null
  if ($Action -eq 'hook') { try { $payload=[Console]::In.ReadToEnd() | ConvertFrom-Json } catch { $payload=$null } }
  $channel=$env:HANAMESH_AGENT_CHANNEL
  if (!$channel) { $channel=if (($plugin.Replace('\','/') -match '/\.codex/plugins/cache/') -or ($env:CODEX_HOME -and ($plugin+ [IO.Path]::DirectorySeparatorChar).StartsWith(($env:CODEX_HOME.TrimEnd('\','/')+[IO.Path]::DirectorySeparatorChar),[StringComparison]::OrdinalIgnoreCase))) {'codex'} else {'claude'} }
  if ($Action -eq 'hook' -and $event -in @('PreToolUse','PostToolUse','PostToolUseFailure') -and $payload -and !(Test-Path -LiteralPath (Join-Path $agentHome 'withdrawal.json'))) {
    $call=if ($payload.tool_use_id) {$payload.tool_use_id} else {$payload.tool_call_id}
    $name=$payload.tool_name
    if ($payload.hook_event_name -eq $event -and $call -is [string] -and $payload.session_id -is [string] -and $name -is [string]) {
      $selector=@{};$valid=$name -cmatch '^mcp__[A-Za-z0-9_]+$'
      if ($name -eq 'Skill' -and $payload.tool_input.skill -cmatch '^[A-Za-z0-9_.:@-]+$') {$valid=$true;$selector.skill=$payload.tool_input.skill}
      if ($channel -eq 'codex' -and $name -match '^(Bash|(?:functions\.)?exec_command)$') {
        $cmd=if ($null -ne $payload.tool_input.command) {$payload.tool_input.command} else {$payload.tool_input.cmd}
        if ($cmd -match '^\s*cat (?:"([^"\n]+[\\/]SKILL\.md)"|''([^''\n]+[\\/]SKILL\.md)''|([^\s]+[\\/]SKILL\.md))\s*$') { $valid=$true;$path=if($Matches[1]){$Matches[1]}elseif($Matches[2]){$Matches[2]}else{$Matches[3]};$selector.skillPathHash=Hash-Text ($path.Replace('\','/').ToLowerInvariant()) }
      }
      if ($valid) {
        $fact=Hash-Text (ConvertTo-HanaMeshCallIdentity @($channel,$payload.session_id,$call))
        $success=$null;$response=$payload.tool_response
        if ($event -eq 'PostToolUseFailure') {$success=$false}
        elseif ($event -eq 'PostToolUse' -and $response) {
          if ($null -ne $response.error) {$success=$false}
          elseif ($response.isError -is [bool]) {$success=!$response.isError}
          elseif ($response.is_error -is [bool]) {$success=!$response.is_error}
          elseif ($response.ContainsKey('exit_code') -and $response.exit_code -is [ValueType]) {$success=$response.exit_code -eq 0}
          elseif ($name -eq 'Skill' -and $response.success -is [bool]) {$success=$response.success}
          elseif ($name -match '^mcp__' -and $response.content -is [array]) {$success=$true}
          elseif ($name -match '^mcp__' -and $response -is [array] -and $response.Count) {$success=$true}
        }
        $row=@{factId=$fact;channel=$channel;occurredAt=[DateTime]::UtcNow.ToString("yyyy-MM-dd'T'HH:mm:ss.fff'Z'");event=$event;toolName=$name;success=$success}
        foreach($k in $selector.Keys){$row[$k]=$selector[$k]}
        $dir=Join-Path $agentHome 'preparation';[IO.Directory]::CreateDirectory($dir)|Out-Null;$path=Join-Path $dir "$fact-$event.json"
        $temp=$path+'.'+[Guid]::NewGuid().ToString('N')+'.tmp'
        try {[IO.File]::WriteAllText($temp,($row|ConvertTo-Json -Compress),$utf8);try{[IO.File]::Move($temp,$path)}catch [IO.IOException]{if(!(Test-Path -LiteralPath $path)){throw}}}finally{if(Test-Path -LiteralPath $temp){[IO.File]::Delete($temp)}}
      }
    }
  }
  [IO.Directory]::CreateDirectory((Join-Path $cache 'sessions')) | Out-Null
  $newSession=$false;$firstSession=$false
  if ($isSession -and $payload.session_id -is [string] -and $payload.session_id.Length -gt 0 -and $payload.session_id.Length -le 1024) {
    $key=Hash-Text ($channel+'|'+$payload.session_id)
    $newSession=Once (Join-Path $cache "sessions/$key")
    $firstSession=Once (Join-Path $cache 'sessions/initial-session')
  }
  $lease=Lease
  if ($lease) {
    $start=$false;$initial=$null
    try {
      $s=Read-State
      if ($s -and $s.code -eq 'RUNTIME_PREPARING' -and !(Active-Starter $s)) {$s.code='RUNTIME_PREPARATION_INTERRUPTED';$s.phase='failed';$s.finishedAt=[DateTime]::UtcNow.ToString("yyyy-MM-dd'T'HH:mm:ss.fff'Z'");Atomic-JSON $statePath $s}
      if (!$s -or ($isSession -and $newSession -and !($firstSession -and $s.initialEntry -eq 'non-session') -and $s.code -ne 'RUNTIME_PREPARING')) {
        $initial=@{code='RUNTIME_PREPARING';phase='download';token=[Guid]::NewGuid().ToString('N');downloadedBytes=0;totalBytes=$target.bytes;attemptCount=1;startedAt=[DateTime]::UtcNow.ToString("yyyy-MM-dd'T'HH:mm:ss.fff'Z'");finishedAt=$null;previousError=$null;pid=$null;processStartedTicks=$null;starterPid=$PID;starterTicks=[Diagnostics.Process]::GetCurrentProcess().StartTime.ToUniversalTime().Ticks.ToString();initialEntry=if($isSession -and $payload.session_id){'session'}else{'non-session'}}
        if($s){$initial.attemptCount=1+$s.attemptCount;$initial.previousError=$s.code;$initial.initialEntry=$s.initialEntry}
        Atomic-JSON $statePath $initial;$start=$true
      }
    } finally {$lease.Dispose()}
    if($start){
      try {
        $stdinFile=Join-Path $cache 'prepare.stdin';[IO.File]::WriteAllText($stdinFile,'',$utf8)
        $launchPhase='load-verified-helper'
        . (Join-Path $PSScriptRoot 'windows-detached.ps1')
        Initialize-HanaMeshDetached
        $launchPhase='create-process'
        $workerId=[HanaMeshDetached]::Start($powershell,('-NoLogo -NoProfile -NonInteractive -ExecutionPolicy Bypass -File "'+$launcherPath+'" prepare-worker '+$initial.token),$cache,$stdinFile,(Join-Path $cache 'prepare.log'),(Join-Path $cache 'prepare-error.log'))
        $workerTicks=$null
        try{$worker=[Diagnostics.Process]::GetProcessById($workerId);$workerTicks=$worker.StartTime.ToUniversalTime().Ticks.ToString();$worker.Dispose()}catch{}
        $lease=Lease
        if($lease){try{$s=Read-State;if($s.token -eq $initial.token -and $s.code -eq 'RUNTIME_PREPARING'){$s.pid=$workerId;$s.processStartedTicks=$workerTicks;Atomic-JSON $statePath $s}}finally{$lease.Dispose()}}
      } catch { $failureLine=$_.InvocationInfo.ScriptLineNumber;$nativeError=$_.Exception.InnerException.NativeErrorCode;$lease=Lease;if($lease){try{$s=Read-State;if($s.token -eq $initial.token -and $s.code -eq 'RUNTIME_PREPARING'){$s.startFailurePhase=$launchPhase;$s.startFailureLine=$failureLine;$s.nativeErrorCode=$nativeError;$s.code='RUNTIME_PREPARER_START_FAILED';$s.phase='failed';$s.finishedAt=[DateTime]::UtcNow.ToString("yyyy-MM-dd'T'HH:mm:ss.fff'Z'");Atomic-JSON $statePath $s}}finally{$lease.Dispose()}} }
    }
  }
  if($Action -eq 'hook'){
    if($isSession -and ($newSession -or !$payload.session_id)){@{systemMessage=(Public-State).runtime.message}|ConvertTo-Json -Compress}
    exit 0
  }
  if($Action -in @('mcp','mcp-ready')){. (Join-Path $PSScriptRoot 'windows-mcp.ps1');Run-MCP $false;exit 0}
  Public-State | ConvertTo-Json -Depth 10 -Compress
  if($Action -eq 'status' -or $Action -eq 'install-runtime'){exit 0}else{exit 1}

