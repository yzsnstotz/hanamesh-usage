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
      $s.phase='verifying';$s.downloadedBytes=([IO.FileInfo]::new("$scratch/node.zip")).Length;Atomic-JSON $statePath $s
      if ((Get-FileHash -Algorithm SHA256 -LiteralPath "$scratch/node.zip").Hash.ToLowerInvariant() -cne $digest) { Fail 'HANAMESH_NODE_ARCHIVE_CHECKSUM_MISMATCH' }
      [Console]::Error.WriteLine('HanaMesh [Node 2/3] SHA256 verified; extract this architecture only')
      $s.phase='extracting';Atomic-JSON $statePath $s
      [Reflection.Assembly]::Load('System.IO.Compression, Version=4.0.0.0, Culture=neutral, PublicKeyToken=b77a5c561934e089') | Out-Null
      [Reflection.Assembly]::Load('System.IO.Compression.FileSystem, Version=4.0.0.0, Culture=neutral, PublicKeyToken=b77a5c561934e089') | Out-Null
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
    } finally { if (Test-Path -LiteralPath $scratch) { [IO.Directory]::Delete($scratch,$true) } }
  }
