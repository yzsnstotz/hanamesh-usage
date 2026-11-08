# PX1 public runner matrix

Node 24.13.1 / pnpm 10.33.0. Standard public runners only; no secrets or paid services.
Runner labels and free public-repository policy verified 2026-11-08 against:
https://docs.github.com/en/actions/reference/runners/github-hosted-runners

Each job records the actual OS/CPU and runs frozen strict install, normal build,
repository tests, normal pack, and official npm DSH 0.2.2-rc.1 loading. AppHost
also runs AH1 installation-* tests separately. Commands receive an environment
allowlist and fresh HOME/USERPROFILE/DSH_HOME; ports are random, models unused.

fixtures/provenance.json pins the normal archives and source commits: PK2's
Core/Usage inputs and PX1's AppHost native-root fix. The previous PK2 AppHost
hash is retained explicitly; the same unpublished version has new candidate
bytes, never a replacement claimed to be the old artifact.
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

## PK3 consolidation

The four fixture archives are a single consolidated candidate snapshot. `fixtures/provenance.json` records each normal pack source commit, exact SHA256, reviewed gate source and previous provenance. The role archive is still replaced by that runner’s normal pack; failed packs remain failures. Core includes the PX3 Windows ACL implementation, Usage includes R128b Agent 0.2.9, and AppHost includes PX3 with the reviewed gate 0.1.12. No published version bytes are claimed to have changed.

AH2 follow-up: AppHost source candidate `d5b659a91cf053dc875efcb84ee53fdbe2133818` closes the AH-HO01 investigation and passes all 130 mutation checks. Its normal archive remains SHA256 `57c0fcfff6baf6bfe569a2d8589b212d2a963e2c541587116f8cd53ab89c24bd`, byte-identical to the consolidated snapshot. Provenance selects that reviewed source; GT19 two-machine gates and the new platform matrices remain separate.
