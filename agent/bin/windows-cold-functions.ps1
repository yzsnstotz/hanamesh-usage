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

# Invocation hashes share Node's JSON.stringify([channel,session,call]) bytes.
# JavaScriptSerializer intentionally escapes extra HTML characters; do not use
# its representation for that cross-runtime identity.
function ConvertTo-HanaMeshCallIdentity([string[]]$Values) {
  $parts=@()
  foreach($value in $Values) {
    $text=[Text.StringBuilder]::new();[void]$text.Append('"')
    for($i=0;$i -lt $value.Length;$i++) {
      $c=$value[$i];$n=[int]$c
      switch($n) {
        34 {[void]$text.Append('\"');continue}
        92 {[void]$text.Append('\\');continue}
        8 {[void]$text.Append('\b');continue}
        9 {[void]$text.Append('\t');continue}
        10 {[void]$text.Append('\n');continue}
        12 {[void]$text.Append('\f');continue}
        13 {[void]$text.Append('\r');continue}
        default {
          $unpaired=([char]::IsHighSurrogate($c) -and ($i+1 -eq $value.Length -or ![char]::IsLowSurrogate($value[$i+1]))) -or ([char]::IsLowSurrogate($c) -and ($i -eq 0 -or ![char]::IsHighSurrogate($value[$i-1])))
          if($n -lt 32 -or $unpaired){[void]$text.Append('\u'+$n.ToString('x4'))}else{[void]$text.Append($c)}
        }
      }
    }
    [void]$text.Append('"');$parts+=$text.ToString()
  }
  return '['+($parts -join ',')+']'
}
