#!/usr/bin/perl
use strict; use warnings; use utf8;
use Encode qw(encode); use JSON::PP; use Digest::SHA qw(sha256_hex); use Fcntl qw(:DEFAULT :flock); use POSIX qw(setsid WNOHANG strftime); use IO::Select; use IO::Handle; use File::Path qw(make_path remove_tree); use File::Temp qw(tempdir); use File::Basename qw(dirname); use Cwd qw(abs_path); use Time::HiRes qw(time sleep);
binmode STDIN, ':raw'; binmode STDOUT, ':raw'; binmode STDERR, ':raw'; $|=1; umask 0077;
my $json=JSON::PP->new->utf8->canonical;
my $action=shift(@ARGV)//''; my $plugin=abs_path(dirname(__FILE__).'/..');
my $shared=$ENV{HANAMESH_SHARED_HOME}//(($ENV{HOME}//'').'/.hanamesh-shared');
sub fail { die "$_[0]\n"; }
fail('HANAMESH_NODE_RUNTIME_HOME_INVALID') unless $shared=~m{^/};
my $os=`/usr/bin/uname -s`; chomp $os; my $machine=`/usr/bin/uname -m`; chomp $machine;
fail('HANAMESH_NODE_PLATFORM_UNSUPPORTED') unless $os eq 'Darwin' && ($machine eq 'arm64'||$machine eq 'x86_64');
my $arch=$machine eq 'arm64'?'arm64':'x64';
open my $recipe_f,'<:raw',"$plugin/bin/node-runtime.json" or fail('RUNTIME_RECIPE_UNAVAILABLE');my $recipe;{local $/;$recipe=$json->decode(<$recipe_f>);}close $recipe_f;
fail('RUNTIME_RECIPE_INVALID') unless $recipe->{version} eq '24.13.1'&&$recipe->{archiveFormat} eq 'tar.xz'&&$recipe->{downloadOrigin} eq 'https://nodejs.org';
my $target=$recipe->{architectures}{$arch};fail('RUNTIME_RECIPE_INVALID') unless ref($target) eq 'HASH'&&$target->{sha256}=~/^[a-f0-9]{64}$/&&$target->{legacyGzipSha256}=~/^[a-f0-9]{64}$/&&$target->{bytes}=~/^[1-9][0-9]*$/;
my $spec={sha=>$target->{sha256},gz=>$target->{legacyGzipSha256},bytes=>0+$target->{bytes}}; my $base="$shared/runtime"; my $cache="$base/node-v24.13.1-darwin-$arch";my $node="$cache/bin/node";my $statefile="$cache/prepare-state.json";my $lockfile="$cache/prepare.lock";
sub stamp {my $t=time();return strftime('%Y-%m-%dT%H:%M:%S',gmtime(int($t))).sprintf('.%03dZ',int(1000*($t-int($t))));}
sub textfile {my($path)=@_;open my $f,'<:raw',$path or fail('RUNTIME_STATE_UNAVAILABLE');local $/;my $v=<$f>;close $f;return $v;}
sub filehash {my($path)=@_;open my $f,'<:raw',$path or fail('RUNTIME_STATE_UNAVAILABLE');my $h=Digest::SHA->new(256);$h->addfile($f);close $f;return $h->hexdigest;}
sub safe_paths {for my $p($base,$cache,"$cache/bin",$node,"$cache/node.sha256","$cache/archive.sha256",$statefile,$lockfile,"$cache/prepare.log","$cache/LICENSE","$cache/sessions"){fail('HANAMESH_NODE_RUNTIME_SYMLINK_REJECTED') if -l $p;}}
sub readstate {safe_paths();return undef unless -e $statefile;my $v=eval{$json->decode(textfile($statefile))};fail('RUNTIME_STATE_INVALID') unless ref($v) eq 'HASH'&&($v->{code}//'')=~/^RUNTIME_[A-Z_]+$/;return $v;}
sub atomic {my($path,$value)=@_;my $tmp="$path.$$-".int(rand(1_000_000)).'.tmp';sysopen my $f,$tmp,O_WRONLY|O_CREAT|O_EXCL,0600 or fail('RUNTIME_STATE_UNAVAILABLE');print $f $json->encode($value);$f->sync or fail('RUNTIME_STATE_UNAVAILABLE');close $f;rename $tmp,$path or fail('RUNTIME_STATE_UNAVAILABLE');}
sub ready {
 safe_paths();return 0 unless -e $node;
 fail('HANAMESH_NODE_RUNTIME_REQUIRED') unless -f $node&&-x $node;
 my $archive=textfile("$cache/archive.sha256");$archive=~s/\s+$//;
 fail('HANAMESH_NODE_RUNTIME_CHECKSUM_MISMATCH') unless $archive eq $spec->{sha}||$archive eq $spec->{gz};
 my $hash=textfile("$cache/node.sha256");$hash=~s/\s+$//;fail('HANAMESH_NODE_RUNTIME_CHECKSUM_MISMATCH') unless $hash eq filehash($node).'  bin/node';
 open my $p,'-|',$node,'--version' or fail('HANAMESH_NODE_RUNTIME_VERSION_MISMATCH');my $v=<$p>;close $p or fail('HANAMESH_NODE_RUNTIME_VERSION_MISMATCH');chomp $v;fail('HANAMESH_NODE_RUNTIME_VERSION_MISMATCH') unless $v eq 'v24.13.1';return 1;
}
sub launch_node {my($mode)=@_;my @args=$mode eq 'hook'?('lib/agent/hook.mjs',@ARGV):$mode eq 'node'?@ARGV:('lib/agent/cli.mjs',$mode,@ARGV);my $entry=shift @args;$entry="$plugin/$entry" unless $mode eq 'node';exec {$node} $node,$entry,@args or fail('RUNTIME_EXEC_FAILED');}
# A ready entry never touches hook stdin; the existing Node projector owns it.
if(ready()){my $old=readstate();if($old&&$old->{code} ne 'RUNTIME_READY'&&$old->{code} ne 'RUNTIME_PREPARING'){sysopen my $fd,$lockfile,O_WRONLY|O_CREAT,0600 or fail('RUNTIME_STATE_UNAVAILABLE');if(flock($fd,LOCK_EX|LOCK_NB)){atomic($statefile,{%$old,code=>'RUNTIME_READY',phase=>'ready',previousError=>$old->{code},finishedAt=>stamp()});}close $fd;}if($action eq 'install-runtime'){print $json->encode({runtime=>{code=>'RUNTIME_READY'}})."\n";exit 0;}launch_node($action);}
my $is_session=$action eq 'hook'&&grep {$ARGV[$_] eq '--event'&&($ARGV[$_+1]//'') eq 'SessionStart'} 0..$#ARGV;
my $session;
if($is_session){
 # Only SessionStart control metadata, never a tool hook payload. Retain only a digest.
 my $selector=IO::Select->new(\*STDIN);my $raw='';my $limit=time()+0.10;
 while(length($raw)<65536&&time()<$limit&&$selector->can_read(0.01)){my $n=sysread(STDIN,my $chunk,4096);last unless $n;$raw.=$chunk;my $v=eval{$json->decode($raw)};if(ref($v) eq 'HASH'){if(defined($v->{session_id})&&!ref($v->{session_id})&&length($v->{session_id})>0&&length($v->{session_id})<=1024){my $channel=$ENV{HANAMESH_AGENT_CHANNEL}//(($ENV{CODEX_HOME}&&index($plugin,$ENV{CODEX_HOME})==0)?'codex':'claude');$session=sha256_hex(encode('UTF-8',$channel.'|'.$v->{session_id}));}last;}}
}
safe_paths();make_path("$cache/bin","$cache/sessions",{mode=>0700});safe_paths();
my $new_session=0;my $first_session=0;
if(defined $session){my $path="$cache/sessions/$session";if(sysopen my $f,$path,O_WRONLY|O_CREAT|O_EXCL,0600){print $f "1\n";close $f;$new_session=1;}elsif(!$!{EEXIST}){fail('RUNTIME_STATE_UNAVAILABLE');}my $first="$cache/sessions/initial-session";if(sysopen my $f,$first,O_WRONLY|O_CREAT|O_EXCL,0600){close $f;$first_session=1;}elsif(!$!{EEXIST}){fail('RUNTIME_STATE_UNAVAILABLE');}}
sub public_state {
 my $s=readstate()//{code=>'RUNTIME_PREPARING',phase=>'starting',downloadedBytes=>0,totalBytes=>$spec->{bytes}};
 my %v=map {exists $s->{$_}?($_=>$s->{$_}):()} qw(code phase downloadedBytes totalBytes attemptCount startedAt finishedAt previousError);
 $v{progress}=defined($s->{totalBytes})&&$s->{totalBytes}>0?0+sprintf('%.1f',100*($s->{downloadedBytes}//0)/$s->{totalBytes}):undef;
 $v{recordingDuringPreparation}=JSON::PP::false;
 $v{message}=$s->{code} eq 'RUNTIME_READY'?'HanaMesh 运行环境已准备完成，后续调用按本机记录设置处理。':$s->{code} eq 'RUNTIME_PREPARING'?'HanaMesh 正在准备运行环境（约 1 分钟），完成后开始本机记录；准备期间的调用不记录且不补录，已关闭者保持关闭。':'HanaMesh 运行环境准备失败；下次新会话开始时会自动再尝试一次。准备期间的调用未记录，不会补录。';
 return {runtime=>\%v,localCollection=>{enabled=>JSON::PP::false,preparingCallsRecorded=>JSON::PP::false},code=>$s->{code}};
}
sub publish_file {my($src,$dst)=@_;if(!link($src,$dst)){fail('RUNTIME_CACHE_CONFLICT') unless -f $dst&&!(-l $dst)&&filehash($src) eq filehash($dst);}}
sub producer {
 my($lock,$initial)=@_;my $scratch;my $curlpid;
 local $SIG{HUP}='IGNORE';local $SIG{TERM}=sub{kill 'TERM',$curlpid if $curlpid;die "RUNTIME_PREPARATION_INTERRUPTED\n";};
 my $state={%$initial,pid=>$$};
 my $ok=eval{
  atomic($statefile,$state);$scratch=tempdir('.node-download-XXXXXXXX',DIR=>$base,CLEANUP=>0);my $archive="$scratch/node.tar.xz";
  $curlpid=fork();fail('RUNTIME_DOWNLOAD_FAILED') unless defined $curlpid;
  if(!$curlpid){exec {'/usr/bin/curl'} '/usr/bin/curl','--fail','--show-error','--silent','--location','--proto','=https','--proto-redir','=https','--connect-timeout','15','--speed-time','30','--speed-limit','1',"https://nodejs.org/dist/v24.13.1/node-v24.13.1-darwin-$arch.tar.xz",'-o',$archive or exit 127;}
  for(;;){my $done=waitpid($curlpid,WNOHANG);$state->{downloadedBytes}=-e $archive?0+(-s $archive):0;atomic($statefile,$state);if($done==$curlpid){my $exit=$?;$curlpid=undef;fail('RUNTIME_DOWNLOAD_FAILED') if $exit!=0;last;}sleep(0.2);}
  $state->{phase}='verifying';atomic($statefile,$state);fail('RUNTIME_ARCHIVE_CHECKSUM_MISMATCH') unless filehash($archive) eq $spec->{sha};
  $state->{phase}='extracting';atomic($statefile,$state);my $name="node-v24.13.1-darwin-$arch";
  system {'/usr/bin/tar'} '/usr/bin/tar','-xf',$archive,'-C',$scratch,"$name/bin/node","$name/LICENSE";fail('RUNTIME_EXTRACT_FAILED') if $?!=0;
  open my $p,'-|',"$scratch/$name/bin/node",'--version' or fail('RUNTIME_VERSION_MISMATCH');my $version=<$p>;close $p or fail('RUNTIME_VERSION_MISMATCH');chomp $version;fail('RUNTIME_VERSION_MISMATCH') unless $version eq 'v24.13.1';
  $state->{phase}='publishing';atomic($statefile,$state);
  if(!ready()){
   open my $h,'>:raw',"$scratch/node.sha256" or fail('RUNTIME_STATE_UNAVAILABLE');print $h filehash("$scratch/$name/bin/node")."  bin/node\n";close $h;
   open my $a,'>:raw',"$scratch/archive.sha256" or fail('RUNTIME_STATE_UNAVAILABLE');print $a $spec->{sha}."\n";close $a;
   safe_paths();publish_file("$scratch/node.sha256","$cache/node.sha256");publish_file("$scratch/archive.sha256","$cache/archive.sha256");publish_file("$scratch/$name/LICENSE","$cache/LICENSE");publish_file("$scratch/$name/bin/node",$node);
  }
  ready();$state->{code}='RUNTIME_READY';$state->{phase}='ready';$state->{finishedAt}=stamp();atomic($statefile,$state);1;
 };
 if(!$ok){my $e=$@;$e=~s/\s+$//;$e='RUNTIME_PREPARATION_FAILED' unless $e=~/^(?:RUNTIME|HANAMESH_NODE)_[A-Z_]+$/;$state->{code}=$e=~/^RUNTIME_/?$e:'RUNTIME_CACHE_INVALID';$state->{phase}='failed';$state->{finishedAt}=stamp();atomic($statefile,$state);print STDERR "$e\n";}
 remove_tree($scratch) if defined($scratch)&&index($scratch,"$base/.node-download-")==0;close $lock;exit($ok?0:1);
}
my $old=readstate();sysopen my $lock,$lockfile,O_WRONLY|O_CREAT,0600 or fail('RUNTIME_STATE_UNAVAILABLE');
if(flock($lock,LOCK_EX|LOCK_NB)){
 my $s=readstate();if($s&&$s->{code} eq 'RUNTIME_PREPARING'){$s={%$s,code=>'RUNTIME_PREPARATION_INTERRUPTED',phase=>'failed',finishedAt=>stamp()};atomic($statefile,$s);}
 if(!$s||($is_session&&$new_session&&!($first_session&&($s->{initialEntry}//'non-session') eq 'non-session'))){
  my $initial={initialEntry=>$s->{initialEntry}//(defined($session)?'session':'non-session'),code=>'RUNTIME_PREPARING',phase=>'download',downloadedBytes=>0,totalBytes=>$spec->{bytes},attemptCount=>($s->{attemptCount}//0)+1,startedAt=>stamp(),previousError=>$s?$s->{code}:undef};atomic($statefile,$initial);
  my $pid=fork();fail('RUNTIME_PREPARER_START_FAILED') unless defined $pid;
  if(!$pid){setsid()>=0 or exit 1;open STDIN,'<','/dev/null';open STDOUT,'>>',"$cache/prepare.log";open STDERR,'>&STDOUT';producer($lock,$initial);}
 }
}
# Closing the parent reference leaves the forked producer's OS lock held; never LOCK_UN across fork.
close $lock;
sub emit_notice {my $s=public_state();print $json->encode({systemMessage=>$s->{runtime}{message}})."\n";}
if($action eq 'hook'){emit_notice() if $is_session&&($new_session||!defined($session));exit 0;}
if($action eq 'mcp'||$action eq 'mcp-ready'){
 my $initialized=0;my $selector=IO::Select->new(\*STDIN);my $line='';
 for(;;){
  my $s=$line eq ''?readstate():undef;if($line eq ''&&($s->{code}//'') eq 'RUNTIME_READY'&&-e $node){exec {'/bin/sh'} '/bin/sh',"$plugin/bin/hm-agent",$initialized?'mcp-ready':'mcp' or fail('RUNTIME_EXEC_FAILED');}
  next unless $selector->can_read(0.2);my $n=sysread(STDIN,my $char,1);last unless $n;$line.=$char;
  if(length($line)>131072){$line='';next;}next unless $char eq "\n";
  my $q=eval{$json->decode($line)};$line='';next unless ref($q) eq 'HASH'&&exists($q->{id});my $method=$q->{method}//'';my $params=ref($q->{params}) eq 'HASH'?$q->{params}:{};my $result;
  if($method eq 'initialize'){$initialized=1;$result={protocolVersion=>$params->{protocolVersion}//'2024-11-05',capabilities=>{tools=>{}},serverInfo=>{name=>'hanamesh-usage',version=>'0.3.0-rc.9'}};}
  elsif($method eq 'ping'){$result={};}
  elsif($method eq 'tools/list'){$result={tools=>[{name=>'hanamesh_status',description=>'只读查看运行环境准备进度；准备期间不记录调用。',inputSchema=>{type=>'object',properties=>{},additionalProperties=>JSON::PP::false},annotations=>{readOnlyHint=>JSON::PP::true,destructiveHint=>JSON::PP::false,openWorldHint=>JSON::PP::false}}]};}
  elsif($method eq 'tools/call'&&($params->{name}//'') eq 'hanamesh_status'&&ref($params->{arguments}//{}) eq 'HASH'&&!keys(%{$params->{arguments}//{}})){my $status=public_state();$result={isError=>$status->{code} eq 'RUNTIME_READY'?JSON::PP::false:JSON::PP::true,content=>[{type=>'text',text=>$json->encode($status)}]};}
  else{print $json->encode({jsonrpc=>'2.0',id=>$q->{id},error=>{code=>-32601,message=>'Method not found'}})."\n";next;}
  print $json->encode({jsonrpc=>'2.0',id=>$q->{id},result=>$result})."\n";
 }exit 0;
}
print $json->encode(public_state())."\n";exit($action eq 'status'?0:1);
