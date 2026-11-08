// Start a background preparer with exactly three inherited file handles.
// Inheriting a host's extra stdout pipe can keep a completed hook open until download ends.
using System;
using System.IO;
using System.Text;
using System.Runtime.InteropServices;
using System.ComponentModel;
using System.Diagnostics;
using System.Security.Cryptography;
using System.Text.RegularExpressions;
public static class HanaMeshDetached {
  [DllImport("kernel32.dll", SetLastError=true)]
  static extern bool IsWow64Process2(IntPtr process, out ushort processMachine, out ushort nativeMachine);
  [DllImport("kernel32.dll")] static extern IntPtr GetCurrentProcess();
  // Native ISA from the OS, independent of shell emulation and Git Bash's environment.
  public static string NativeArchitecture() {
    ushort processMachine, nativeMachine;
    Check(IsWow64Process2(GetCurrentProcess(), out processMachine, out nativeMachine));
    if(nativeMachine == 0x8664) return "x64";
    if(nativeMachine == 0xaa64) return "arm64";
    throw new InvalidOperationException("HANAMESH_NODE_PLATFORM_UNSUPPORTED");
  }
  [DllImport("kernel32.dll")] static extern IntPtr GetStdHandle(int id);
  [DllImport("kernel32.dll", SetLastError=true)] static extern uint WaitForSingleObject(IntPtr handle,uint milliseconds);
  [DllImport("kernel32.dll", SetLastError=true)] static extern bool GetExitCodeProcess(IntPtr handle,out uint code);
  static string FileHash(string path) {
    using(var hash=SHA256.Create())using(var stream=File.OpenRead(path))
      return BitConverter.ToString(hash.ComputeHash(stream)).Replace("-","").ToLowerInvariant();
  }
  static string LockedHash(string record,string key) {
    var match=Regex.Match(record,"\""+key+"\"\\s*:\\s*\"([a-f0-9]{64})\"");
    if(!match.Success)throw new InvalidOperationException("HANAMESH_WINDOWS_LAUNCHER_LOCK_INVALID");
    return match.Groups[1].Value;
  }
  static string Quote(string value) {
    var text=new StringBuilder("\"");int slashes=0;
    foreach(char c in value) {
      if(c=='\\'){slashes++;continue;}
      if(c=='\"'){text.Append('\\',slashes*2+1);text.Append(c);slashes=0;continue;}
      text.Append('\\',slashes);slashes=0;text.Append(c);
    }
    text.Append('\\',slashes*2);text.Append('\"');return text.ToString();
  }
  // A tiny fixed foreground bridge avoids MSYS console-host startup for PowerShell.
  // No payload is read here: the original three handles go directly to system 5.1.
  public static int Main(string[] args) {
    try {
      string self=typeof(HanaMeshDetached).Assembly.Location,bin=Path.GetDirectoryName(self);
      string record=File.ReadAllText(Path.Combine(bin,"windows-detached.json"));
      if(FileHash(self)!=LockedHash(record,"launcherSha256") || FileHash(Path.Combine(bin,"windows-detached.cs"))!=LockedHash(record,"sourceSha256") || FileHash(Path.Combine(bin,"windows-detached.dll"))!=LockedHash(record,"sha256"))
        throw new InvalidOperationException("HANAMESH_WINDOWS_LAUNCHER_CHECKSUM_MISMATCH");
      string app=Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.Windows),"System32\\WindowsPowerShell\\v1.0\\powershell.exe");
      var command=new StringBuilder("-NoLogo -NoProfile -NonInteractive -ExecutionPolicy Bypass -File "+Quote(Path.Combine(bin,"hm-agent.ps1")));
      foreach(string arg in args)command.Append(" "+Quote(arg));
      return Foreground(app,command.ToString());
    } catch(Exception) { Console.Error.WriteLine("HANAMESH_WINDOWS_LAUNCHER_FAILED");return 1; }
  }
  static int Foreground(string app,string arguments) {
    var handles=new IntPtr[]{GetStdHandle(-10),GetStdHandle(-11),GetStdHandle(-12)};
    foreach(var h in handles)Check(SetHandleInformation(h,1,1));
    IntPtr size=IntPtr.Zero,list=IntPtr.Zero,values=IntPtr.Zero;bool initialized=false;
    ProcessInfo child=new ProcessInfo();
    try {
      InitializeProcThreadAttributeList(IntPtr.Zero,1,0,ref size);
      list=Marshal.AllocHGlobal(size);Check(InitializeProcThreadAttributeList(list,1,0,ref size));initialized=true;
      values=Marshal.AllocHGlobal(IntPtr.Size*handles.Length);Marshal.Copy(handles,0,values,handles.Length);
      Check(UpdateProcThreadAttribute(list,0,new IntPtr(0x20002),values,new IntPtr(IntPtr.Size*handles.Length),IntPtr.Zero,IntPtr.Zero));
      var startup=new StartupInfoEx();startup.basic.cb=Marshal.SizeOf(typeof(StartupInfoEx));startup.basic.flags=0x100;
      startup.basic.input=handles[0];startup.basic.output=handles[1];startup.basic.error=handles[2];startup.attributes=list;
      Check(CreateProcessW(app,new StringBuilder(Quote(app)+" "+arguments),IntPtr.Zero,IntPtr.Zero,true,0x08080000,IntPtr.Zero,null,ref startup,out child));
      Check(WaitForSingleObject(child.process,0xffffffff)==0);uint code;Check(GetExitCodeProcess(child.process,out code));return unchecked((int)code);
    } finally {
      if(child.thread!=IntPtr.Zero)CloseHandle(child.thread);
      if(child.process!=IntPtr.Zero)CloseHandle(child.process);
      if(values!=IntPtr.Zero)Marshal.FreeHGlobal(values);
      if(initialized)DeleteProcThreadAttributeList(list);
      if(list!=IntPtr.Zero)Marshal.FreeHGlobal(list);
    }
  }
  [StructLayout(LayoutKind.Sequential, CharSet=CharSet.Unicode)]
  struct StartupInfo {
    public int cb; public string reserved, desktop, title;
    public int x,y,xSize,ySize,xChars,yChars,fill,flags;
    public short show,reservedCount; public IntPtr reservedBytes,input,output,error;
  }
  [StructLayout(LayoutKind.Sequential)]
  struct StartupInfoEx { public StartupInfo basic; public IntPtr attributes; }
  [StructLayout(LayoutKind.Sequential)]
  struct ProcessInfo { public IntPtr process,thread; public int processId,threadId; }
  [DllImport("kernel32.dll", SetLastError=true)]
  static extern bool SetHandleInformation(IntPtr handle,int mask,int flags);
  [DllImport("kernel32.dll", SetLastError=true)]
  static extern bool InitializeProcThreadAttributeList(IntPtr list,int count,int flags,ref IntPtr size);
  [DllImport("kernel32.dll", SetLastError=true)]
  static extern bool UpdateProcThreadAttribute(IntPtr list,int flags,IntPtr attribute,IntPtr value,IntPtr size,IntPtr previous,IntPtr returned);
  [DllImport("kernel32.dll")] static extern void DeleteProcThreadAttributeList(IntPtr list);
  [DllImport("kernel32.dll", SetLastError=true, CharSet=CharSet.Unicode)]
  static extern bool CreateProcessW(string app,StringBuilder command,IntPtr processSecurity,IntPtr threadSecurity,bool inherit,int flags,IntPtr environment,string directory,ref StartupInfoEx startup,out ProcessInfo process);
  [DllImport("kernel32.dll")] static extern bool CloseHandle(IntPtr handle);
  static void Check(bool ok) { if(!ok)throw new Win32Exception(Marshal.GetLastWin32Error()); }
  public static int Start(string app,string arguments,string directory,string input,string output,string error) {
    using(var stdin=File.Open(input,FileMode.Open,FileAccess.Read,FileShare.ReadWrite))
    using(var stdout=File.Open(output,FileMode.Create,FileAccess.Write,FileShare.ReadWrite|FileShare.Delete))
    using(var stderr=File.Open(error,FileMode.Create,FileAccess.Write,FileShare.ReadWrite|FileShare.Delete)) {
      var handles=new IntPtr[]{stdin.SafeFileHandle.DangerousGetHandle(),stdout.SafeFileHandle.DangerousGetHandle(),stderr.SafeFileHandle.DangerousGetHandle()};
      foreach(var h in handles)Check(SetHandleInformation(h,1,1));
      IntPtr size=IntPtr.Zero,list=IntPtr.Zero,values=IntPtr.Zero;bool initialized=false;
      try {
        InitializeProcThreadAttributeList(IntPtr.Zero,1,0,ref size);
        list=Marshal.AllocHGlobal(size);Check(InitializeProcThreadAttributeList(list,1,0,ref size));initialized=true;
        values=Marshal.AllocHGlobal(IntPtr.Size*handles.Length);Marshal.Copy(handles,0,values,handles.Length);
        Check(UpdateProcThreadAttribute(list,0,new IntPtr(0x20002),values,new IntPtr(IntPtr.Size*handles.Length),IntPtr.Zero,IntPtr.Zero));
        var startup=new StartupInfoEx();startup.basic.cb=Marshal.SizeOf(typeof(StartupInfoEx));startup.basic.flags=0x100;
        startup.basic.input=handles[0];startup.basic.output=handles[1];startup.basic.error=handles[2];startup.attributes=list;
        ProcessInfo child;
        // EXTENDED_STARTUPINFO_PRESENT | CREATE_NO_WINDOW | CREATE_NEW_PROCESS_GROUP.
        Check(CreateProcessW(app,new StringBuilder("\""+app+"\" "+arguments),IntPtr.Zero,IntPtr.Zero,true,0x08080200,IntPtr.Zero,directory,ref startup,out child));
        CloseHandle(child.thread);CloseHandle(child.process);return child.processId;
      } finally {
        if(values!=IntPtr.Zero)Marshal.FreeHGlobal(values);
        if(initialized)DeleteProcThreadAttributeList(list);
        if(list!=IntPtr.Zero)Marshal.FreeHGlobal(list);
      }
    }
  }
}
