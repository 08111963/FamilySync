# Security Advisory Notes

## Known unavoidable dependency vulnerabilities

### image-size — all versions (GHSA-w3rx-r6r6-pgpr, GHSA-5p2g-fcmc-qvqq)

**Severity:** High (upstream advisory marks `image-size *` — every published version)  
**CVEs:** ICNS parser DoS (infinite loop), JXL/HEIF parser DoS (infinite loops)  
**Affected path:** `metro >=0.22.1` → `image-size *`, pulled in transitively by the entire
React Native / Expo / Metro bundler toolchain.

**Status:** No patched version of `image-size` has been released by its maintainer.  
The npm advisory's suggested remediation is to downgrade `react-native` to `0.72.17`
(three major versions back), which is not a viable option for this project.

**Runtime impact:** None. `image-size` is consumed exclusively by Metro bundler
at **build/bundle time** (mobile app development and static export). The production
Express server (`server/index.ts`, port 5000) does not import or invoke `image-size`.
Exploitation would require an attacker to supply a malformed ICNS/JXL/HEIF image file
directly to the Metro bundler process, which is a local developer tool, not a
network-exposed service.

**Mitigation:** The npm override `"image-size": "2.0.2"` pins all usages to the latest
available release. This will be resolved automatically once the `image-size` maintainer
publishes a patched version or once Expo SDK upgrades to a Metro release that pins a
patched `image-size`.

---

*Last updated: 2026-08-18*
