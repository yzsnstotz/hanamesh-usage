# Windows-native launcher. No PATH Node discovery and no implicit consent/download.
param([Parameter(Position=0)][string]$Action, [Parameter(ValueFromRemainingArguments=$true)][string[]]$AgentArgs)
$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'
$utf8 = New-Object System.Text.UTF8Encoding($false)
[Console]::InputEncoding = $utf8
[Console]::OutputEncoding = $utf8
$OutputEncoding = $utf8
function Fail([string]$Code) { throw $Code }
try {
  if (!$Action) { Fail 'HANAMESH_AGENT_ACTION_REQUIRED' }
  $arch = [System.Runtime.InteropServices.RuntimeInformation]::OSArchitecture.ToString().ToLowerInvariant()
  switch ($arch) {
    'x64' { $digest = 'fba577c4bb87df04d54dd87bbdaa5a2272f1f99a2acbf9152e1a91b8b5f0b279' }
    'arm64' { $digest = '0cd29eeb64f3c649db2c4c868779ca277f5a4c49e26c69e5928d01fe0ae06da8' }
    default { Fail 'HANAMESH_NODE_PLATFORM_UNSUPPORTED' }
  }
  $shared = $env:HANAMESH_SHARED_HOME
  if (!$shared) { $shared = Join-Path $env:USERPROFILE '.hanamesh-shared' }
  if (![IO.Path]::IsPathRooted($shared)) { Fail 'HANAMESH_NODE_RUNTIME_HOME_INVALID' }
  $name = "node-v24.13.1-win-$arch"
  $cache = Join-Path $shared "runtime/$name"
  $node = Join-Path $cache 'node.exe'
  function Reject-Reparse([string]$Path) {
    # Walk every existing ancestor; Windows junctions are reparse points too.
    for ($p = [IO.Path]::GetFullPath($Path); $p; $p = [IO.Path]::GetDirectoryName($p)) {
      if ((Test-Path -LiteralPath $p) -and ((Get-Item -Force -LiteralPath $p).Attributes -band [IO.FileAttributes]::ReparsePoint)) { Fail 'HANAMESH_NODE_RUNTIME_SYMLINK_REJECTED' }
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
      if ((Get-FileHash -Algorithm SHA256 -LiteralPath "$scratch/node.zip").Hash.ToLowerInvariant() -cne $digest) { Fail 'HANAMESH_NODE_ARCHIVE_CHECKSUM_MISMATCH' }
      [Console]::Error.WriteLine('HanaMesh [Node 2/3] SHA256 verified; extract this architecture only')
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
  if ($Action -in @('install-runtime','setup')) { Install-Runtime }
  if ($Action -eq 'install-runtime') { exit 0 }
  Check-Runtime
  $plugin = Split-Path -Parent $PSScriptRoot
  $entryArgs = switch ($Action) {
    'node' { $AgentArgs }
    'hook' { @("$plugin/lib/agent/hook.mjs") + $AgentArgs }
    default { @("$plugin/lib/agent/cli.mjs", $Action) + $AgentArgs }
  }
  # PowerShell's native invocation preserves the host's pipes. Allow native
  # stderr (for example node:sqlite warnings) without turning it into a
  # terminating PowerShell error; the native exit code remains authoritative.
  $ErrorActionPreference = 'Continue'
  & $node @entryArgs
  $nativeSucceeded = $?
  $nodeExit = $LASTEXITCODE
  if (!$nativeSucceeded -and !$nodeExit) { Fail 'HANAMESH_RUNTIME_EXEC_FAILED' }
  exit $nodeExit
} catch {
  $code = $_.Exception.Message
  if ($code -notmatch '^HANAMESH_[A-Z0-9_]+$') { $code = 'HANAMESH_WINDOWS_LAUNCH_FAILED'; [Console]::Error.WriteLine('HanaMesh launcher line ' + $_.InvocationInfo.ScriptLineNumber + ' category ' + $_.CategoryInfo.Category) }
  [Console]::Error.WriteLine($code)
  exit 1
}
