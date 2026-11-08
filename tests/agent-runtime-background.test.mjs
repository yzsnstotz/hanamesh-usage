// Each OS executes its actual bridge; Windows has native equivalents of the POSIX contracts.
await import(process.platform==='win32'?'./windows/agent-runtime-background.test.mjs':'./posix/agent-runtime-background.test.mjs');
