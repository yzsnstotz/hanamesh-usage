# Windows launcher. Fixed native Node, system PowerShell 5.1, no implicit consent.
param([string]$Action)
# Simple binding preserves Node flags verbatim (advanced common parameters consume -e).
$AgentArgs = @($args)
$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'
$utf8 = [System.Text.UTF8Encoding]::new($false)
$OutputEncoding = $utf8
function Fail([string]$Code) { throw $Code }
try {
  . ([IO.Path]::Combine($PSScriptRoot,'windows-primitives.ps1'))
  # A detached PowerShell 5.1 process has valid redirected handles but no console code page.
  try { [Console]::InputEncoding=$utf8;[Console]::OutputEncoding=$utf8 } catch [IO.IOException] {
    [Console]::SetIn(([IO.StreamReader]::new([Console]::OpenStandardInput(),$utf8)))
    $writer=[IO.StreamWriter]::new([Console]::OpenStandardOutput(),$utf8);$writer.AutoFlush=$true;[Console]::SetOut($writer)
    $errorWriter=[IO.StreamWriter]::new([Console]::OpenStandardError(),$utf8);$errorWriter.AutoFlush=$true;[Console]::SetError($errorWriter)
  }
  if (!$Action) { Fail 'HANAMESH_AGENT_ACTION_REQUIRED' }
  if($PSVersionTable.PSVersion -lt [version]'5.1'){Fail 'HANAMESH_POWERSHELL51_REQUIRED'}
  $powershell=[Diagnostics.Process]::GetCurrentProcess().MainModule.FileName
  $plugin=Split-Path -Parent $PSScriptRoot
  $launcherPath=Join-Path $PSScriptRoot 'hm-agent.ps1'
  . (Join-Path $PSScriptRoot 'windows-detached.ps1')
  Initialize-HanaMeshDetached
  $arch=[HanaMeshDetached]::NativeArchitecture()
  if($arch -notin @('x64','arm64')){Fail 'HANAMESH_NODE_PLATFORM_UNSUPPORTED'}
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
    $start = [System.Diagnostics.ProcessStartInfo]::new()
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
  $statePath = Join-Path $cache 'prepare-state.json'
  $agentHome = $env:HANAMESH_AGENT_HOME
  if (!$agentHome) { $agentHome = Join-Path $shared 'agent/usage' }
  $utf8 = [Text.UTF8Encoding]::new($false)
  . (Join-Path $PSScriptRoot 'windows-state.ps1')
  function Node-Invoke([string[]]$Arguments) {
    $script:ErrorActionPreference = 'Continue'
    & $node @Arguments
    $script:nodeExit = $LASTEXITCODE
    $script:ErrorActionPreference = 'Stop'
  }
  if ($Action -eq 'prepare-worker') {
    . (Join-Path $PSScriptRoot 'windows-install.ps1')
    . (Join-Path $PSScriptRoot 'windows-worker.ps1')
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
    if($Action -in @('mcp','mcp-ready')){. (Join-Path $PSScriptRoot 'windows-mcp.ps1');Run-MCP $true;exit 0}
    $entryArgs = switch ($Action) {
      'node' { $AgentArgs }
      'hook' { @((Join-Path $plugin 'lib/agent/hook.mjs')) + $AgentArgs }
      default { @((Join-Path $plugin 'lib/agent/cli.mjs'),$Action) + $AgentArgs }
    }
    Node-Invoke $entryArgs
    exit $nodeExit
  }
  . (Join-Path $PSScriptRoot 'windows-cold-functions.ps1')
  . (Join-Path $PSScriptRoot 'windows-cold.ps1')

} catch {
  $code=$_.Exception.Message
  if($code -notmatch '^(?:HANAMESH|RUNTIME)_[A-Z0-9_]+$'){
    $line=$_.InvocationInfo.ScriptLineNumber;$category=$_.CategoryInfo.Category.ToString().ToUpperInvariant()
    [Console]::Error.WriteLine('HANAMESH_WINDOWS_FAILURE_LINE_'+$line+'_CATEGORY_'+$category)
    $code='HANAMESH_WINDOWS_BOOTSTRAP_FAILED'
  }
  [Console]::Error.WriteLine($code);exit 1
}
