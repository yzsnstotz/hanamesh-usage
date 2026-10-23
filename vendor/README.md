# Reviewed development-only release tool

- Supply: @hanamesh/release-platform-gate 0.1.9, private=true; no separate SPDX license field declared by the supplied package. Product license/runtime payloads are unchanged.
- Source: https://github.com/yzsnstotz/hanamesh-docs/tree/dad7fc34d52c784ac99cdd7a8a31fcaa0a618d36/tools/release-platform-gate
- Reviewed subtree: 14354103655804e3ad8d825701a804d2c7190821, retained on Docs main 13ec0db3b.
- Reviewed normal tar: 33790 bytes, SHA256 c72010c96a5f22e36d65f6c1fd850e583dead7e843644eba1657b4416d9cbd0d.
- SRI: sha512-Ro+Oeorjitxxn6szRDrxUBGHuDTFZaxxIGHOopbaFjp+ugtJ9TAlmNrj3rtkB4NNhzoFFCuYa050W4gxKgGl1A==
- Approved source request: prd/待办/C-四插件平台依赖发布硬门-GI接线请求-2026-10-22.md on Docs main (final 0.1.9); independent review 95988178db76caa38c4160ae0c779061d8d8795a.

The tar is copied byte-for-byte, never rebuilt here; pnpm generates its frozen lock normally. This is a devDependency only. It is absent from product runtime dependencies/peers/bundles and the published payload list. The shared scanner exists only inside this exact reviewed tar. Daily checks do not import another repository or fetch Docs contracts. See the package README for the invariant, reason, normal npm release workflow, and dependency-shapes-v1 supported/unsupported boundary.
