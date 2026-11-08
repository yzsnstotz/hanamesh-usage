# Windows-native launcher. No PATH Node discovery and no implicit consent/download.
param([string]$Action)
# Simple binding preserves Node flags verbatim (advanced common parameters consume -e).
$AgentArgs = @($args)
$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'
$utf8 = New-Object System.Text.UTF8Encoding($false)
[Console]::InputEncoding = $utf8
[Console]::OutputEncoding = $utf8
$OutputEncoding = $utf8
function Fail([string]$Code) { throw $Code }
try {
  if (!$Action) { Fail 'HANAMESH_AGENT_ACTION_REQUIRED' }
  # Windows 5.1/.NET Framework under x64 Git Bash emulation can report X64 on ARM64.
  # WOW64 exports the native processor architecture separately from the process ISA.
  $nativeArch = $env:PROCESSOR_ARCHITEW6432
  if (!$nativeArch) { $nativeArch = $env:PROCESSOR_ARCHITECTURE }
  $arch = switch ($nativeArch) {
    'ARM64' { 'arm64' }
    'AMD64' { 'x64' }
    default { [System.Runtime.InteropServices.RuntimeInformation]::OSArchitecture.ToString().ToLowerInvariant() }
  }
  if($arch -notin @('x64','arm64')){Fail 'HANAMESH_NODE_PLATFORM_UNSUPPORTED'}
  $plugin=Split-Path -Parent $PSScriptRoot
  $recipe=Get-Content -Raw -LiteralPath (Join-Path $PSScriptRoot 'node-runtime.json')|ConvertFrom-Json
  $target=$recipe.platforms.('win-'+$arch)
  if($recipe.version -ne '24.13.1' -or $recipe.downloadOrigin -ne 'https://nodejs.org' -or $target.archiveFormat -ne 'zip' -or $target.sha256 -notmatch '^[a-f0-9]{64}$'){Fail 'HANAMESH_RUNTIME_RECIPE_INVALID'}
  $digest=$target.sha256
  $manifestVersion=(Get-Content -Raw -LiteralPath (Join-Path $plugin '.claude-plugin/plugin.json')|ConvertFrom-Json).version
  $shared = $env:HANAMESH_SHARED_HOME
  if (!$shared) { $shared = Join-Path $env:USERPROFILE '.hanamesh-shared' }
  if (![IO.Path]::IsPathRooted($shared)) { Fail 'HANAMESH_NODE_RUNTIME_HOME_INVALID' }
  $name = "node-v24.13.1-win-$arch"
  $cache = Join-Path $shared "runtime/$name"
  $node = Join-Path $cache 'node.exe'
  function Reject-Reparse([string]$Path) {
    # Walk every existing ancestor; Windows junctions are reparse points too.
    for ($p = [IO.Path]::GetFullPath($Path); $p; $p = [IO.Path]::GetDirectoryName($p)) {
      try { $attributes=[IO.File]::GetAttributes($p) } catch [IO.FileNotFoundException] { continue } catch [IO.DirectoryNotFoundException] { continue }
      if ($attributes -band [IO.FileAttributes]::ReparsePoint) { Fail 'HANAMESH_NODE_RUNTIME_SYMLINK_REJECTED' }
    }
  }
  function Check-Version([string]$Executable) {
    $start = New-Object System.Diagnostics.ProcessStartInfo
    $start.FileName = $Executable
    $start.Arguments = '--version'
    $start.UseShellExecute = $false
    $start.CreateNoWindow = $true
    $start.RedirectStandardOutput = $true
    $start.RedirectStandardError = $true
    $child = [System.Diagnostics.Process]::Start($start)
    try {
      $version = $child.StandardOutput.ReadToEnd().Trim()
      $child.StandardError.ReadToEnd() | Out-Null
      $child.WaitForExit()
      if ($version -cne 'v24.13.1' -or $child.ExitCode -ne 0) { Fail 'HANAMESH_NODE_RUNTIME_VERSION_MISMATCH' }
    } finally { $child.Dispose() }
  }
  function Check-Runtime {
    Reject-Reparse $node
    if (!(Test-Path -LiteralPath $node -PathType Leaf)) { Fail 'HANAMESH_NODE_RUNTIME_REQUIRED' }
    foreach ($f in @('archive.sha256','node.sha256')) { Reject-Reparse (Join-Path $cache $f) }
    if (!(Test-Path -LiteralPath "$cache/archive.sha256") -or !(Test-Path -LiteralPath "$cache/node.sha256")) { Fail 'HANAMESH_NODE_RUNTIME_CHECKSUM_MISMATCH' }
    if ([IO.File]::ReadAllText("$cache/archive.sha256").TrimEnd() -cne $digest) { Fail 'HANAMESH_NODE_RUNTIME_CHECKSUM_MISMATCH' }
    $hash = (Get-FileHash -Algorithm SHA256 -LiteralPath $node).Hash.ToLowerInvariant()
    if ([IO.File]::ReadAllText("$cache/node.sha256").TrimEnd() -cne "$hash  node.exe") { Fail 'HANAMESH_NODE_RUNTIME_CHECKSUM_MISMATCH' }
    Check-Version $node
  }
  function Publish([string]$Source, [string]$Destination) {
    try { [IO.File]::Copy($Source,$Destination,$false) }
    catch {
      Reject-Reparse $Destination
      if (!(Test-Path -LiteralPath $Destination -PathType Leaf) -or (Get-FileHash -LiteralPath $Source).Hash -cne (Get-FileHash -LiteralPath $Destination).Hash) { Fail 'HANAMESH_NODE_RUNTIME_CACHE_CONFLICT' }
    }
  }
  function Install-Runtime {
    Reject-Reparse $cache
    if (Test-Path -LiteralPath $node) { Check-Runtime; [Console]::Error.WriteLine('HanaMesh Node 24.13.1: verified cache'); return }
    [IO.Directory]::CreateDirectory($cache) | Out-Null
    $scratch = Join-Path $shared ('runtime/.node-download-' + [Guid]::NewGuid().ToString('N'))
    [IO.Directory]::CreateDirectory($scratch) | Out-Null
    try {
      [Console]::Error.WriteLine("HanaMesh [Node 1/3] Download $name directly from nodejs.org")
      [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
      # No redirects or non-HTTPS destinations. The archive digest is pinned below.
      Invoke-WebRequest -UseBasicParsing -MaximumRedirection 0 -TimeoutSec 120 -Uri "https://nodejs.org/dist/v24.13.1/$name.zip" -OutFile "$scratch/node.zip"
      $s.phase='verifying';$s.downloadedBytes=(Get-Item -LiteralPath "$scratch/node.zip").Length;Atomic-JSON $statePath $s
      if ((Get-FileHash -Algorithm SHA256 -LiteralPath "$scratch/node.zip").Hash.ToLowerInvariant() -cne $digest) { Fail 'HANAMESH_NODE_ARCHIVE_CHECKSUM_MISMATCH' }
      [Console]::Error.WriteLine('HanaMesh [Node 2/3] SHA256 verified; extract this architecture only')
      $s.phase='extracting';Atomic-JSON $statePath $s
      Add-Type -AssemblyName System.IO.Compression
      Add-Type -AssemblyName System.IO.Compression.FileSystem
      $zip = [IO.Compression.ZipFile]::OpenRead("$scratch/node.zip")
      try {
        foreach ($file in @('node.exe','LICENSE')) {
          $entry = $zip.GetEntry("$name/$file")
          if (!$entry) { Fail 'HANAMESH_NODE_EXTRACT_FAILED' }
          [IO.Compression.ZipFileExtensions]::ExtractToFile($entry,"$scratch/$file",$false)
        }
      } finally { $zip.Dispose() }
      Check-Version "$scratch/node.exe"
      $hash = (Get-FileHash -Algorithm SHA256 -LiteralPath "$scratch/node.exe").Hash.ToLowerInvariant()
      [IO.File]::WriteAllText("$scratch/node.sha256", "$hash  node.exe`n")
      [IO.File]::WriteAllText("$scratch/archive.sha256", "$digest`n")
      foreach ($file in @('node.sha256','archive.sha256','LICENSE','node.exe')) { Publish "$scratch/$file" "$cache/$file" }
      Check-Runtime
      [Console]::Error.WriteLine('HanaMesh [Node 3/3] Fixed runtime ready')
    } finally { if (Test-Path -LiteralPath $scratch) { Remove-Item -LiteralPath $scratch -Recurse -Force } }
  }
  $statePath = Join-Path $cache 'prepare-state.json'
  $agentHome = $env:HANAMESH_AGENT_HOME
  if (!$agentHome) { $agentHome = Join-Path $shared 'agent/usage' }
  $utf8 = New-Object Text.UTF8Encoding($false)
  function Read-State {
    Reject-Reparse $statePath
    if (!(Test-Path -LiteralPath $statePath)) { return $null }
    $stream=[IO.File]::Open($statePath,[IO.FileMode]::Open,[IO.FileAccess]::Read,([IO.FileShare]::ReadWrite -bor [IO.FileShare]::Delete))
    $reader=New-Object IO.StreamReader($stream,$utf8)
    try { $s=$reader.ReadToEnd() | ConvertFrom-Json } finally { $reader.Dispose() }
    if ($s.code -notmatch '^RUNTIME_[A-Z_]+$') { Fail 'HANAMESH_RUNTIME_STATE_INVALID' }
    $row=@{};foreach($property in $s.PSObject.Properties){$row[$property.Name]=$property.Value};return $row
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
  function Process-Matches($IdValue,$Ticks) {
    if (!$IdValue -or !$Ticks) { return $false }
    try { $p = [Diagnostics.Process]::GetProcessById([int]$IdValue); return $p.StartTime.ToUniversalTime().Ticks.ToString() -eq [string]$Ticks } catch { return $false }
  }
  function Active-Starter($s) {
    return (Process-Matches $s.pid $s.processStartedTicks) -or (Process-Matches $s.starterPid $s.starterTicks)
  }
  function Hash-Text([string]$Text) {
    $h = [Security.Cryptography.SHA256]::Create()
    try { return ([BitConverter]::ToString($h.ComputeHash($utf8.GetBytes($Text)))).Replace('-','').ToLowerInvariant() } finally { $h.Dispose() }
  }
  function Once([string]$Path) {
    Reject-Reparse $Path
    try { $f = [IO.File]::Open($Path,[IO.FileMode]::CreateNew,[IO.FileAccess]::Write,[IO.FileShare]::None); $f.Dispose(); return $true } catch [IO.IOException] { if (Test-Path -LiteralPath $Path) { return $false }; throw }
  }
  function Public-State {
    $s = Read-State
    if (!$s) { $s = @{code='RUNTIME_PREPARING';phase='starting';downloadedBytes=0;totalBytes=$target.bytes} }
    $v = [ordered]@{}
    foreach ($k in @('code','phase','downloadedBytes','totalBytes','attemptCount','startedAt','finishedAt','previousError')) { if ($s.ContainsKey($k)) { $v[$k]=$s.$k } }
    $v.progress = if ($s.totalBytes -gt 0) { [Math]::Round(100.0*$s.downloadedBytes/$s.totalBytes,1) } else { $null }
    $enabled = !(Test-Path -LiteralPath (Join-Path $agentHome 'withdrawal.json'))
    $v.recordingDuringPreparation = $enabled
    $v.message = if ($s.code -eq 'RUNTIME_READY') { 'HanaMesh 运行环境已准备完成，后续调用按本机记录设置处理。' } elseif ($s.code -eq 'RUNTIME_PREPARING') { 'HanaMesh 正在准备运行环境；准备期间的插件调用在本机暂存，就绪后处理；已关闭者保持关闭。' } else { 'HanaMesh 运行环境准备失败；下次新会话开始时自动再尝试一次。' }
    return @{runtime=$v;localCollection=@{enabled=$enabled;preparingCallsRecorded=$enabled};code=$s.code}
  }
  function Node-Invoke([string[]]$Arguments) {
    $script:ErrorActionPreference = 'Continue'
    & $node @Arguments
    $script:nodeExit = $LASTEXITCODE
    $script:ErrorActionPreference = 'Stop'
  }
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
  if (Test-Path -LiteralPath $node) {
    Check-Runtime
    $s=Read-State
    if ($s -and $s.code -ne 'RUNTIME_READY') {
      $lease=Lease
      if ($lease) { try { $s=Read-State; if ($s.code -ne 'RUNTIME_READY') { $s.previousError=$s.code;$s.code='RUNTIME_READY';$s.phase='ready';$s.finishedAt=[DateTime]::UtcNow.ToString("yyyy-MM-dd'T'HH:mm:ss.fff'Z'");Atomic-JSON $statePath $s } } finally { $lease.Dispose() } }
    }
    if ($Action -eq 'install-runtime') { @{runtime=@{code='RUNTIME_READY'}} | ConvertTo-Json -Compress; exit 0 }
    $entryArgs = switch ($Action) {
      'node' { $AgentArgs }
      'hook' { @((Join-Path $plugin 'lib/agent/hook.mjs')) + $AgentArgs }
      default { @((Join-Path $plugin 'lib/agent/cli.mjs'),$Action) + $AgentArgs }
    }
    Node-Invoke $entryArgs
    exit $nodeExit
  }
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
      if ($channel -eq 'codex' -and $name -match '^(functions\.)?exec_command$') {
        $cmd=if ($payload.tool_input.cmd) {$payload.tool_input.cmd} else {$payload.tool_input.command}
        if ($cmd -match '^\s*cat (?:"([^"\n]+[\\/]SKILL\.md)"|''([^''\n]+[\\/]SKILL\.md)''|([^\s]+[\\/]SKILL\.md))\s*$') { $valid=$true;$path=if($Matches[1]){$Matches[1]}elseif($Matches[2]){$Matches[2]}else{$Matches[3]};$selector.skillPathHash=Hash-Text ($path.Replace('\','/').ToLowerInvariant()) }
      }
      if ($valid) {
        $fact=Hash-Text (ConvertTo-Json -InputObject @($channel,$payload.session_id,$call) -Compress)
        $success=$null;$response=$payload.tool_response
        if ($event -eq 'PostToolUseFailure') {$success=$false}
        elseif ($event -eq 'PostToolUse' -and $response) {
          if ($null -ne $response.error) {$success=$false}
          elseif ($response.isError -is [bool]) {$success=!$response.isError}
          elseif ($response.is_error -is [bool]) {$success=!$response.is_error}
          elseif ($response.PSObject.Properties.Name -contains 'exit_code' -and $response.exit_code -is [ValueType]) {$success=$response.exit_code -eq 0}
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
        Add-Type -Path (Join-Path $PSScriptRoot 'windows-detached.cs')
        $workerId=[HanaMeshDetached]::Start((Join-Path $PSHOME 'powershell.exe'),('-NoLogo -NoProfile -NonInteractive -ExecutionPolicy Bypass -File "'+$PSCommandPath+'" prepare-worker '+$initial.token),$cache,$stdinFile,(Join-Path $cache 'prepare.log'),(Join-Path $cache 'prepare-error.log'))
        $workerTicks=$null
        try{$worker=[Diagnostics.Process]::GetProcessById($workerId);$workerTicks=$worker.StartTime.ToUniversalTime().Ticks.ToString();$worker.Dispose()}catch{}
        $lease=Lease
        if($lease){try{$s=Read-State;if($s.token -eq $initial.token -and $s.code -eq 'RUNTIME_PREPARING'){$s.pid=$workerId;$s.processStartedTicks=$workerTicks;Atomic-JSON $statePath $s}}finally{$lease.Dispose()}}
      } catch { $lease=Lease;if($lease){try{$s=Read-State;if($s.token -eq $initial.token){$s.code='RUNTIME_PREPARER_START_FAILED';$s.phase='failed';$s.finishedAt=[DateTime]::UtcNow.ToString("yyyy-MM-dd'T'HH:mm:ss.fff'Z'");Atomic-JSON $statePath $s}}finally{$lease.Dispose()}} }
    }
  }
  if($Action -eq 'hook'){
    if($isSession -and ($newSession -or !$payload.session_id)){@{systemMessage=(Public-State).runtime.message}|ConvertTo-Json -Compress}
    exit 0
  }
  if($Action -in @('mcp','mcp-ready')){
    $initialized=$Action -eq 'mcp-ready';$child=$null;$childLine=$null;$stderrTask=$null
    # Console.In is a SyncTextReader on Windows PowerShell 5.1: its async call blocks.
    # An independent StreamReader lets readiness and child replies progress while stdin is idle.
    $inputReader=New-Object IO.StreamReader([Console]::OpenStandardInput(),$utf8)
    $inputTask=$inputReader.ReadLineAsync()
    try {
      for(;;){
        if(!$child -and (Read-State).code -eq 'RUNTIME_READY' -and (Test-Path -LiteralPath $node)){
          Check-Runtime
          $start=New-Object Diagnostics.ProcessStartInfo;$start.FileName=$node;$start.Arguments='"'+(Join-Path $plugin 'lib/agent/cli.mjs')+'" '+$(if($initialized){'mcp-ready'}else{'mcp'})
          $start.UseShellExecute=$false;$start.CreateNoWindow=$true;$start.RedirectStandardInput=$true;$start.RedirectStandardOutput=$true;$start.RedirectStandardError=$true
          $child=[Diagnostics.Process]::Start($start);$childLine=$child.StandardOutput.ReadLineAsync();$stderrTask=$child.StandardError.ReadToEndAsync()
        }
        if($childLine -and $childLine.IsCompleted){$line=$childLine.Result;if($null -ne $line){[Console]::Out.WriteLine($line);$childLine=$child.StandardOutput.ReadLineAsync()}else{$childLine=$null}}
        if($inputTask.IsCompleted){
          $line=$inputTask.Result;if($null -eq $line){break}
          if($child){$child.StandardInput.WriteLine($line);$child.StandardInput.Flush()}
          else{
            try{$q=$line|ConvertFrom-Json}catch{$q=$null}
            if($q -and $null -ne $q.id){
              $result=$null
              switch($q.method){
                'initialize'{$initialized=$true;$result=@{protocolVersion=if($q.params.protocolVersion){$q.params.protocolVersion}else{'2024-11-05'};capabilities=@{tools=@{}};serverInfo=@{name='hanamesh-usage';version=$manifestVersion}}}
                'ping'{$result=@{}}
                'tools/list'{$result=@{tools=@(@{name='hanamesh_status';description='Read runtime preparation status';inputSchema=@{type='object';properties=@{};additionalProperties=$false};annotations=@{readOnlyHint=$true;destructiveHint=$false;openWorldHint=$false}})}}
                'tools/call'{if($q.params.name -eq 'hanamesh_status' -and ($null -eq $q.params.arguments -or @($q.params.arguments.PSObject.Properties).Count -eq 0)){$status=Public-State;$result=@{isError=$true;content=@(@{type='text';text=($status|ConvertTo-Json -Depth 10 -Compress)})}}}
              }
              if($null -ne $result){@{jsonrpc='2.0';id=$q.id;result=$result}|ConvertTo-Json -Depth 20 -Compress}else{@{jsonrpc='2.0';id=$q.id;error=@{code=-32601;message='Method not found'}}|ConvertTo-Json -Compress}
            }
          }
          $inputTask=$inputReader.ReadLineAsync()
        }
        if($child -and $child.HasExited -and !$childLine){break}
        Start-Sleep -Milliseconds 20
      }
    }finally{
      if($child){$child.StandardInput.Close();while($childLine){$line=$childLine.GetAwaiter().GetResult();if($null -eq $line){break};[Console]::Out.WriteLine($line);$childLine=$child.StandardOutput.ReadLineAsync()};$child.WaitForExit();if($stderrTask){[Console]::Error.Write($stderrTask.Result)};$child.Dispose()}
    }
    exit 0
  }
  Public-State | ConvertTo-Json -Depth 10 -Compress
  if($Action -eq 'status' -or $Action -eq 'install-runtime'){exit 0}else{exit 1}

} catch {
  $code=$_.Exception.Message
  if($code -notmatch '^(?:HANAMESH|RUNTIME)_[A-Z0-9_]+$'){
    $line=$_.InvocationInfo.ScriptLineNumber;$category=$_.CategoryInfo.Category.ToString().ToUpperInvariant()
    [Console]::Error.WriteLine('HANAMESH_WINDOWS_FAILURE_LINE_'+$line+'_CATEGORY_'+$category)
    $code='HANAMESH_WINDOWS_BOOTSTRAP_FAILED'
  }
  [Console]::Error.WriteLine($code);exit 1
}
