// Fixed foreground bridge: raw stdio, native system PowerShell 5.1, no payload reads.
// Built as x86 with the static CRT, usable on both supported Windows OS ISAs.
#include <windows.h>
#include <bcrypt.h>
#include <string>
#include <vector>
#include <fstream>
#include <iterator>
#pragma comment(lib,"bcrypt.lib")
static void Check(bool ok) { if(!ok)throw 1; }
static std::string Hash(const std::wstring& path) {
  HANDLE file=CreateFileW(path.c_str(),GENERIC_READ,FILE_SHARE_READ,NULL,OPEN_EXISTING,0,NULL);Check(file!=INVALID_HANDLE_VALUE);
  BCRYPT_ALG_HANDLE alg=NULL;BCRYPT_HASH_HANDLE hash=NULL;
  try {
    Check(BCryptOpenAlgorithmProvider(&alg,BCRYPT_SHA256_ALGORITHM,NULL,0)>=0);
    DWORD size=0,done=0;Check(BCryptGetProperty(alg,BCRYPT_OBJECT_LENGTH,(PUCHAR)&size,sizeof(size),&done,0)>=0);
    std::vector<unsigned char> object(size),chunk(32768);unsigned char bytes[32];
    Check(BCryptCreateHash(alg,&hash,object.data(),size,NULL,0,0)>=0);
    for(;;){DWORD read=0;Check(ReadFile(file,chunk.data(),(DWORD)chunk.size(),&read,NULL)!=0);if(!read)break;Check(BCryptHashData(hash,chunk.data(),read,0)>=0);}
    Check(BCryptFinishHash(hash,bytes,sizeof(bytes),0)>=0);
    std::string out;const char* hex="0123456789abcdef";for(unsigned char b:bytes){out+=hex[b>>4];out+=hex[b&15];}
    BCryptDestroyHash(hash);BCryptCloseAlgorithmProvider(alg,0);CloseHandle(file);return out;
  }catch(...){if(hash)BCryptDestroyHash(hash);if(alg)BCryptCloseAlgorithmProvider(alg,0);CloseHandle(file);throw;}
}
static std::string Locked(const std::string& record,const std::string& key) {
  size_t at=record.find("\""+key+"\"");Check(at!=std::string::npos);at=record.find(':',at);Check(at!=std::string::npos);
  at=record.find('"',at);Check(at!=std::string::npos);auto value=record.substr(at+1,64);Check(value.size()==64&&record[at+65]=='"');
  for(char c:value)Check((c>='0'&&c<='9')||(c>='a'&&c<='f'));return value;
}
static std::wstring Quote(const std::wstring& value) {
  std::wstring out=L"\"";size_t slashes=0;
  for(wchar_t c:value){if(c==L'\\'){slashes++;continue;}if(c==L'"'){out.append(slashes*2+1,L'\\');out+=c;slashes=0;continue;}out.append(slashes,L'\\');slashes=0;out+=c;}
  out.append(slashes*2,L'\\');return out+L"\"";
}
int wmain(int argc,wchar_t** argv) {
  try {
    wchar_t path[32768];Check(GetModuleFileNameW(NULL,path,32768)>0);std::wstring self(path),bin=self.substr(0,self.find_last_of(L"\\/"));
    std::ifstream input(bin+L"\\windows-detached.json",std::ios::binary);Check(input.good());std::string record((std::istreambuf_iterator<char>(input)),std::istreambuf_iterator<char>());
    Check(Hash(self)==Locked(record,"launcherSha256")&&Hash(bin+L"\\windows-launcher.cpp")==Locked(record,"launcherSourceSha256"));
    USHORT processMachine=0,nativeMachine=0;Check(IsWow64Process2(GetCurrentProcess(),&processMachine,&nativeMachine)!=0);Check(nativeMachine==0x8664||nativeMachine==0xaa64);
    Check(GetWindowsDirectoryW(path,32768)>0);std::wstring app=std::wstring(path)+(processMachine?L"\\Sysnative":L"\\System32")+L"\\WindowsPowerShell\\v1.0\\powershell.exe";
    std::wstring command=Quote(app)+L" -NoLogo -NoProfile -NonInteractive -ExecutionPolicy Bypass -File "+Quote(bin+L"\\hm-agent.ps1");for(int i=1;i<argc;i++)command+=L" "+Quote(argv[i]);
    HANDLE handles[3]={GetStdHandle(STD_INPUT_HANDLE),GetStdHandle(STD_OUTPUT_HANDLE),GetStdHandle(STD_ERROR_HANDLE)};
    std::vector<HANDLE> inherited;for(HANDLE h:handles){Check(h&&h!=INVALID_HANDLE_VALUE);Check(SetHandleInformation(h,HANDLE_FLAG_INHERIT,HANDLE_FLAG_INHERIT)!=0);bool seen=false;for(HANDLE old:inherited)if(old==h)seen=true;if(!seen)inherited.push_back(h);}
    SIZE_T size=0;InitializeProcThreadAttributeList(NULL,1,0,&size);std::vector<unsigned char> storage(size);
    STARTUPINFOEXW start={};start.StartupInfo.cb=sizeof(start);start.StartupInfo.dwFlags=STARTF_USESTDHANDLES;start.StartupInfo.hStdInput=handles[0];start.StartupInfo.hStdOutput=handles[1];start.StartupInfo.hStdError=handles[2];start.lpAttributeList=(LPPROC_THREAD_ATTRIBUTE_LIST)storage.data();
    Check(InitializeProcThreadAttributeList(start.lpAttributeList,1,0,&size)!=0);
    PROCESS_INFORMATION child={};bool created=false;
    try {
      Check(UpdateProcThreadAttribute(start.lpAttributeList,0,PROC_THREAD_ATTRIBUTE_HANDLE_LIST,inherited.data(),inherited.size()*sizeof(HANDLE),NULL,NULL)!=0);
      Check(CreateProcessW(app.c_str(),&command[0],NULL,NULL,TRUE,CREATE_NO_WINDOW|EXTENDED_STARTUPINFO_PRESENT,NULL,NULL,&start.StartupInfo,&child)!=0);created=true;
      Check(WaitForSingleObject(child.hProcess,INFINITE)==WAIT_OBJECT_0);DWORD code=1;Check(GetExitCodeProcess(child.hProcess,&code)!=0);
      CloseHandle(child.hThread);CloseHandle(child.hProcess);DeleteProcThreadAttributeList(start.lpAttributeList);return (int)code;
    }catch(...){if(created){CloseHandle(child.hThread);CloseHandle(child.hProcess);}DeleteProcThreadAttributeList(start.lpAttributeList);throw;}
  }catch(...){const char code[]="HANAMESH_WINDOWS_LAUNCHER_FAILED\n";DWORD written;WriteFile(GetStdHandle(STD_ERROR_HANDLE),code,sizeof(code)-1,&written,NULL);return 1;}
}
