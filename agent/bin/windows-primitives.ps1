# System 5.1 primitives without module autoload. On ARM64, importing the stock
# Utility/Management modules costs 20-30 seconds per hook. Keep the same JSON,
# exact-path IO, SHA256 and bounded HTTPS operations on built-in .NET Framework.
$PSModuleAutoLoadingPreference = 'None'
if (!$HanaMeshJSON) {
  [Reflection.Assembly]::Load('System.Web.Extensions, Version=4.0.0.0, Culture=neutral, PublicKeyToken=31bf3856ad364e35') | Out-Null
  $HanaMeshJSON=[System.Web.Script.Serialization.JavaScriptSerializer]::new()
  $HanaMeshJSON.MaxJsonLength=[int]::MaxValue
}
function Join-Path([string]$Path,[string]$ChildPath) { return [IO.Path]::Combine($Path,$ChildPath) }
function Split-Path([string]$Path,[switch]$Parent) { return [IO.Path]::GetDirectoryName($Path) }
function Test-Path([string]$LiteralPath,[string]$PathType) {
  if($PathType -eq 'Leaf'){return [IO.File]::Exists($LiteralPath)}
  return [IO.File]::Exists($LiteralPath) -or [IO.Directory]::Exists($LiteralPath)
}
function Start-Sleep([int]$Milliseconds) { [Threading.Thread]::Sleep($Milliseconds) }
function Get-Content([string]$LiteralPath,[switch]$Raw) { return [IO.File]::ReadAllText($LiteralPath) }
function Get-FileHash([string]$LiteralPath,[string]$Algorithm='SHA256') {
  if($Algorithm -ne 'SHA256'){throw 'HANAMESH_HASH_ALGORITHM_INVALID'}
  $stream=[IO.File]::OpenRead($LiteralPath);$hasher=[Security.Cryptography.SHA256]::Create()
  try{return @{Hash=([BitConverter]::ToString($hasher.ComputeHash($stream))).Replace('-','')}}finally{$stream.Dispose();$hasher.Dispose()}
}
function Convert-HanaMeshJSONValue($Value) {
  if($Value -is [Collections.IDictionary]) {
    $row=@{};foreach($key in $Value.Keys){$row[$key]=Convert-HanaMeshJSONValue $Value[$key]};return $row
  }
  if($Value -is [array]) {
    $rows=@();foreach($item in $Value){$rows+= ,(Convert-HanaMeshJSONValue $item)};return ,$rows
  }
  return $Value
}
function ConvertFrom-Json {
  param([Parameter(ValueFromPipeline=$true)][string]$InputObject)
  process { return ,(Convert-HanaMeshJSONValue ($HanaMeshJSON.DeserializeObject($InputObject))) }
}
function ConvertTo-Json {
  param([Parameter(ValueFromPipeline=$true)]$InputObject,[switch]$Compress,[int]$Depth=100)
  process { return $HanaMeshJSON.Serialize($InputObject) }
}
function Invoke-WebRequest([string]$Uri,[string]$OutFile,[int]$TimeoutSec,[int]$MaximumRedirection,[switch]$UseBasicParsing) {
  $request=[Net.HttpWebRequest]::CreateHttp($Uri)
  $request.AllowAutoRedirect=$false;$request.Timeout=$TimeoutSec*1000;$request.ReadWriteTimeout=$TimeoutSec*1000
  $response=$request.GetResponse()
  try {
    if($response.StatusCode -ne [Net.HttpStatusCode]::OK){throw 'RUNTIME_DOWNLOAD_FAILED'}
    $inputStream=$response.GetResponseStream();$outputStream=[IO.File]::Create($OutFile)
    try{$inputStream.CopyTo($outputStream)}finally{$inputStream.Dispose();$outputStream.Dispose()}
  }finally{$response.Dispose()}
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
