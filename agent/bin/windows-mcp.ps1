  function Run-MCP([bool]$Published) {
    $initialized=$Action -eq 'mcp-ready';$child=$null;$childLine=$null;$stderrTask=$null
    # Console.In is a SyncTextReader on a redirected PowerShell host: its async call blocks.
    # An independent StreamReader lets readiness and child replies progress while stdin is idle.
    $inputReader=[IO.StreamReader]::new([Console]::OpenStandardInput(),$utf8)
    $inputTask=$inputReader.ReadLineAsync()
    try {
      for(;;){
        if(!$child -and ($Published -or (Read-State).code -eq 'RUNTIME_READY') -and (Test-Path -LiteralPath $node)){
          Check-Runtime
          $start=[Diagnostics.ProcessStartInfo]::new();$start.FileName=$node;$start.Arguments='"'+(Join-Path $plugin 'lib/agent/cli.mjs')+'" '+$(if($initialized){'mcp-ready'}else{'mcp'})
          $start.UseShellExecute=$false;$start.CreateNoWindow=$true;$start.RedirectStandardInput=$true;$start.RedirectStandardOutput=$true;$start.RedirectStandardError=$true
          $child=[Diagnostics.Process]::Start($start);$childLine=$child.StandardOutput.ReadLineAsync();$stderrTask=$child.StandardError.ReadToEndAsync()
        }
        if($childLine -and $childLine.IsCompleted){$line=$childLine.Result;if($null -ne $line){[Console]::Out.WriteLine($line);$childLine=$child.StandardOutput.ReadLineAsync()}else{$childLine=$null}}
        if($inputTask.IsCompleted){
          $line=$inputTask.Result;if($null -eq $line){break}
          if($child){$child.StandardInput.WriteLine($line);$child.StandardInput.Flush()}
          else{
            try{$q=$line|ConvertFrom-Json}catch{$q=$null}
            if($q -and $null -ne $q.id){
              $result=$null
              switch($q.method){
                'initialize'{$initialized=$true;$result=@{protocolVersion=if($q.params.protocolVersion){$q.params.protocolVersion}else{'2024-11-05'};capabilities=@{tools=@{}};serverInfo=@{name='hanamesh-usage';version=$manifestVersion}}}
                'ping'{$result=@{}}
                'tools/list'{$result=@{tools=@(@{name='hanamesh_status';description='Read runtime preparation status';inputSchema=@{type='object';properties=@{};additionalProperties=$false};annotations=@{readOnlyHint=$true;destructiveHint=$false;openWorldHint=$false}})}}
                'tools/call'{if($q.params.name -eq 'hanamesh_status' -and ($null -eq $q.params.arguments -or $q.params.arguments.Count -eq 0)){$status=Public-State;$result=@{isError=$true;content=@(@{type='text';text=($status|ConvertTo-Json -Depth 10 -Compress)})}}}
              }
              if($null -ne $result){@{jsonrpc='2.0';id=$q.id;result=$result}|ConvertTo-Json -Depth 20 -Compress}else{@{jsonrpc='2.0';id=$q.id;error=@{code=-32601;message='Method not found'}}|ConvertTo-Json -Compress}
            }
          }
          $inputTask=$inputReader.ReadLineAsync()
        }
        if($child -and $child.HasExited -and !$childLine){break}
        Start-Sleep -Milliseconds 20
      }
    }finally{
      if($child){$child.StandardInput.Close();while($childLine){$line=$childLine.GetAwaiter().GetResult();if($null -eq $line){break};[Console]::Out.WriteLine($line);$childLine=$child.StandardOutput.ReadLineAsync()};$child.WaitForExit();if($stderrTask){[Console]::Error.Write($stderrTask.Result)};$child.Dispose()}
    }
  }
