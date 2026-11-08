// Each OS executes its actual bridge; Windows has native equivalents of the POSIX contracts.
await import(process.platform==='win32'?'./windows/agent-preparation-recording.test.mjs':'./posix/agent-preparation-recording.test.mjs');
