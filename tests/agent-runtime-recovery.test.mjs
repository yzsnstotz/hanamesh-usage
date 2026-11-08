// Each OS executes its actual bridge; Windows has native equivalents of the POSIX contracts.
await import(process.platform==='win32'?'./windows/agent-runtime-recovery.test.mjs':'./posix/agent-runtime-recovery.test.mjs');
