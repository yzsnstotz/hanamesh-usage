# Usage rc.31 · official DSH rc.2 compatibility

Date: 2026-10-15. Scope: Usage peer admission and the public Plugin Manager BundleInfo contract. This report distinguishes source inspection and regression fixtures from real Desktop validation.

## Failure and change

Usage rc.30 declared exact DSH `0.2.1-alpha.2`, Cordis `4.0.5-alpha.1`, and zod `4.6.5` peers. Official installed Desktop `0.2.0-rc.2` therefore fails peer admission. Widening peers alone leaves a second failure: rc.2 BundleInfo has no `availability`, while Usage required `availability === 'profile'` for install and page-open facts.

rc.31 admits the owner-approved ranges:

| Peer | Range |
| --- | --- |
| `@deepseek-ai/dsh-*` | `>=0.2.0-rc.2 <0.3.0-0 \|\| >=0.2.1-0 <0.3.0-0` |
| `@deepseek-ai/cordis` | `>=4.0.4 <4.1.0-0 \|\| >=4.0.5-alpha.1 <4.1.0-0` |
| `zod` | `^4.5.4` |

The second DSH/Cordis clause admits the current alpha under ordinary npm prerelease rules. Range admission is not evidence that every admitted release has passed runtime tests. Dev dependencies remain exact alpha.2 / Cordis alpha.1 / zod 4.6.5; no peer override is introduced.

One shared `src/host/bundle-compat.js` adapter is used by inventory and page ownership. An own `availability` property is authoritative, even when missing, undefined, or unknown. Only when the property is absent does the adapter use rc.2's documented `installed === true && removable === true` evidence of a profile-owned dependency; protected installation copies are excluded. Existing error checks remain in place. Unreadable previously accepted bundles retain their baseline instead of producing false uninstall facts. Disabled installed bundles remain install inventory, while disabled pages cannot produce opens.

Storage schemas, signing, consent, write order, single-domain publication and original-session durability barriers are unchanged.

## Public source evidence

Sources were inspected read-only from the installed app archive and the official public-source tags already held in `hanamesh-desktop`. No sibling HanaMesh implementation supplies a compatibility substitute.

Installed package code is in `/Applications/DeepSeek Harness.app/Contents/Resources/app.asar`, under `dsh/node_modules/@deepseek-ai/`; `Contents/Resources/runtime/` holds the executable runtimes. Installed `dsh-plugin-manager/lib/index.js:1456–1518` returns no availability member, matching official tag `dsh-v0.2.0-rc.2`.

| Consumed public contract | rc.2 evidence / delta to alpha.2 |
| --- | --- |
| Bundle inventory and ownership | `packages/boot/plugin-manager/src/types.ts:46–69`, `src/index.ts:280–317` at rc.2 expose installed/enabled/removable/version/error/readOnlyReason/rows. Alpha.2 types lines 46–80 add availability/official/source/installTarget. Installed rc.2 computes removable from profile declaration and absence from installation dependencies. |
| Commands and original session facts | `packages/interaction/commands/src/index.ts:335–424` at rc.2 appends command/run before the handler and command/done after settlement with original commandId/agent.session. Consumed command implementation is unchanged in alpha.2. |
| Session summaries | `packages/core/session/src/index.ts:649–676,1194–1235` at rc.2 exposes snapshotEvents/isOwnSeq and sessions.flush/get/list. Installed runtime confirms sessions.flush at lib/index.js:1832–1848. Parent/header/inherited-prefix fields exist; Usage does not consume alpha plugin-record additions. |
| Native persistence | `packages/session/session-persistence/src/index.ts:52–82,165,178,201` at rc.2 provides handle metadata, open/read/close and service flush/list. Alpha adds optional snapshot formatStatus, unused by Usage. |
| Domain storage | `packages/storage/storage-domain/src/domain.ts:189–201` at rc.2 implements serialized global get/set; the consumed implementation is unchanged. Usage uses ctx.storage.domain.open and domain handles, not session.storage. |
| Client rendering | `packages/client/ui-renderer/src/client/registry.ts:160,209,741–746` at rc.2 exposes slots.inject/register and scoped effects. Relevant registry/slot implementation is unchanged in alpha.2; renderer bind diff is comments/types around an import. |
| Page Remote | `packages/typert/protocol/src/index.ts:152–223` at rc.2 exposes TypertRemoteService, invocation accessor and standard Remote initializers. Protocol implementation is unchanged. Installed client gateway lib/client.js:1636 exposes $mount. |

The adapter reads neither private profile manifests nor undocumented context version fields. `provenance.dshVersion` continues to record the build-composition version from `src/host/pins.js`, not the active host version. The Settings UI does not present it as active-host detection. Query/export consumers must retain this distinction.

## Peer history

- `5b5ce2a`: introduced the previously measured 0.1.5 host range.
- `d467128` (2026-10-05): changed that range back to exact rc.2 and exact overrides.
- `05d9c81` (2026-10-11): changed exact rc.2 to exact alpha.2 / Cordis 4.0.5-alpha.1 / zod 4.6.5, removing overrides.
- rc.31 separates compatible host admission from the pinned development build closure.

## Verification status

Before implementation, the new focused regressions ran against rc.30 and failed at the expected assertions: rc.2 install facts, preservation of an accepted baseline on read error, late Core install reporting, page ownership, and rc.2 peer admission (24 tests: 19 passed, 5 failed). This lightweight RED run used local Node 22.12.0 and is not target-toolchain validation.

Target engineering validation used Node 24.13.1 / pnpm 10.33.0 / TypeScript 5.9.3, with a 1024 MiB heap cap and the shared dependency store:

| Check | Result |
| --- | --- |
| Normal frozen dependency install | PASS; exact development closure retained |
| Target semantic build | PASS; strict host types checked and tracked lib outputs regenerated |
| Focused compatibility regressions | 31/31 PASS |
| Full suite | 340 total: 338 PASS, 2 optional real-backend tests skipped because HANAMESH_TEST_SERVER_ORIGIN was unset |
| Physical closure / consistency check | PASS; 35 dependency packages / 92 edges |
| Mutation suite | 24/24 rejected by assertion failures, including X03 ordering mutations; FIXTURE evidence |
| Fresh packed consumer | Normal strict-peer install, public declaration compilation with skipLibCheck:false, and packed host entry import PASS against the exact alpha development peers |
| Agent package versions | Both packaged plugin manifests and the packaged MCP CLI declare rc.31; previous rc.30 delivery preserved |

The tarball is `/Users/yzliu/.cache/hanamesh-runs/session-g-dsh-compat-20261015/hanamesh-usage-0.2.0-rc.31.tgz`, SHA-256 `14880b899e5d27b7a87db8e970aba932a2df4e3cdc04b1c2267b7428e1717af6`. Per-command logs and the compact engineering receipt are in sibling `usage-rc31/`, with `receipt.json` as the entry point. No new Claude/Codex plugin materialization was run for this DSH compatibility change.

Real installed Desktop validation, a fresh rc.2-host plugin installation, native-media crash validation, cross-platform environment rows and owner acceptance remain separate gates. No runtime success, environment-matrix PASS, release or owner acceptance is claimed by this source report. The global DSH shim/preflight was not invoked, and no shared runtime, browser, production service or personal profile was accessed during implementation or these engineering checks.

## Applied constraints

`laws/environment-matrix.md` separates plugin host compatibility from a private pinned runtime and requires explicit real-machine evidence. This change keeps pinned development artifacts while admitting the approved host ranges. Read-side law/learning usage metadata was not edited during this narrowly scoped repository task.

## Subsequent real-host receipts (root, same candidate bytes)

The installed official Desktop 0.2.0-rc.2 and the public npm CLI/web 0.2.1-alpha.2 both passed isolated real installation and activation of Core0.3.7/Usagerc.31/AppHost0.6.2. The actual UI consent switch kept events at zero while withheld; after consent, real pluginManager inventory generated signed local install facts. Opening the actual Usage settings page generated its public page-open fact; withdrawal cleared local events. No backend origin was configured, so records stayed offline and no points/backend result is claimed. The local harmless market target needed a restart on rc.2 and applied live on alpha.2; its official Plugins page showed Running in both.

Receipts: `/Users/yzliu/.cache/hanamesh-runs/session-g-dsh-compat-20261015/evidence/rc2-exercise-{before,after}.json`, `native-runner-receipt.json`, `alpha-exercise-{before,after}.json`, `alpha-runner-receipt.json`. Temporary canonical roots included spaces/CJK, and isolated Electron/Chrome used their own user-data, minimal environment and mock keychain. Cross-platform/native-media gates and owner acceptance are still separate. Latest owner commands are in Core `docs/acceptance/OWNER-VALIDATION-3.md`; those commands replace the old alpha-only prerequisite. This source report is not embedded in the npm tarball.
