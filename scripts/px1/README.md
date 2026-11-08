# PX1 public runner matrix

Node 24.13.1 / pnpm 10.33.0. Standard public runners only; no secrets or paid services.
Runner labels and free public-repository policy verified 2026-11-08 against:
https://docs.github.com/en/actions/reference/runners/github-hosted-runners

Each job records the actual OS/CPU and runs frozen strict install, normal build,
repository tests, normal pack, and official npm DSH 0.2.2-rc.1 loading. AppHost
also runs AH1 installation-* tests separately. Commands receive an environment
allowlist and fresh HOME/USERPROFILE/DSH_HOME; ports are random, models unused.

fixtures/provenance.json pins PK2's exact normal archives and source commits.
The local repository's normal pack replaces its fixture for native loading;
other components remain those locked archives. The unchanged suite tuple/patch
is normally repacked with the actual input hashes in release.json. A failed
local pack can run a baseline diagnostic, but the native phase still FAILS and
records localCandidate:false. It never claims baseline success as a candidate.

The four separate profiles assert exact versions, ACTIVE fibers, public service
slots, default withheld consent, zero model requests, fiber disposal, service
revocation and listener closure. Native-case derives from PK2's final .24 probe;
fileURLToPath handles Windows paths. Logs and JSON receipts preserve failures.
This is Node/web-profile loading, not GUI/product, owned Windows process, CLI
real-vendor installation, or paid-model acceptance. Unsupported functionality
must remain explicitly reported even if its refusal is expected.
