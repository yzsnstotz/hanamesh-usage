// Start a background preparer with exactly three inherited file handles.
// Inheriting a host's extra stdout pipe can keep a completed hook open until download ends.
using System;
using System.IO;
using System.Text;
using System.Runtime.InteropServices;
using System.ComponentModel;
public static class HanaMeshDetached {
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
