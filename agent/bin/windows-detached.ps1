# .NET Framework's automatic high-integrity CodeDOM temp-directory branch can fail
# for a Unicode TEMP on an administrator account. Supply our own owner-only directory.
function Initialize-HanaMeshDetached([string]$Directory) {
  if ('HanaMeshDetached' -as [type]) { return }
  $scratch=Join-Path $Directory ('.compiler-'+[Guid]::NewGuid().ToString('N'))
  $identity=[Security.Principal.WindowsIdentity]::GetCurrent()
  try { $sid=$identity.User } finally { $identity.Dispose() }
  $security=New-Object Security.AccessControl.DirectorySecurity
  $security.SetAccessRuleProtection($true,$false)
  $security.SetOwner($sid)
  $inherit=[Security.AccessControl.InheritanceFlags]::ContainerInherit -bor [Security.AccessControl.InheritanceFlags]::ObjectInherit
  $rule=New-Object Security.AccessControl.FileSystemAccessRule($sid,[Security.AccessControl.FileSystemRights]::FullControl,$inherit,[Security.AccessControl.PropagationFlags]::None,[Security.AccessControl.AccessControlType]::Allow)
  $security.AddAccessRule($rule)
  [IO.Directory]::CreateDirectory($scratch,$security)|Out-Null
  $parameters=New-Object CodeDom.Compiler.CompilerParameters
  try {
    $parameters.GenerateInMemory=$true
    $parameters.GenerateExecutable=$false
    $parameters.ReferencedAssemblies.Add('System.dll')|Out-Null
    $parameters.ReferencedAssemblies.Add('System.Core.dll')|Out-Null
    $parameters.TempFiles=New-Object CodeDom.Compiler.TempFileCollection($scratch,$false)
    Add-Type -Path (Join-Path $PSScriptRoot 'windows-detached.cs') -CompilerParameters $parameters
  } finally {
    if($parameters.TempFiles){([IDisposable]$parameters.TempFiles).Dispose()}
    if([IO.Directory]::Exists($scratch)){Remove-Item -LiteralPath $scratch -Recurse -Force}
  }
}
