# Validation scope for 0.4.0

Prepared on 2026-11-03 for Codex 26.1027.51404 on Windows x64. Private screenshots, profiles, application archives and media are excluded from the release.

## Automated checks

The 36 tests cover archive preservation/integrity, preload boundaries, source/output separation, release exclusions, workshop roundtrip/validation/favorites, worker flows, catalog/download validation, media-cache identity and limits, WE event contracts, native-window cleanup, reading defaults and text contrast.

Run `npm test` and `npm run check`. Secret scanning is heuristic and should be combined with reviewing the staged file list. GitHub Windows source checks passed for the published source. One initial run failed because the moderation script was missing from the commit; it was then included and the remote rerun passed.

## Community workflow in 0.4.0

Seven new tests cover default/disabled catalogs, deterministic ZIP bytes, account changes, private repositories, draft retries, uncertain issue creation, approval permissions, ownership, hashes, covers and window-scoped consent tokens. Network/CLI are mocked in those unit tests. The package/store worker test uses real temporary files.

The native installed Electron client reached the real publication confirmation using the existing local profile. It uploaded one original procedural CC0 static demo to the authenticated user's public `codex-wallpaper-works` repository and created [submission #1](https://github.com/LFFFFFFFFFFFFFF/codex-wallpaper/issues/1). An initial real attempt stopped at the draft asset URL check: GitHub uses an untagged draft URL. Verification was corrected to check size/digest before publication and the final URL afterward; retry reused the existing draft assets. This is a real upload, not a mock, and no borrowed wallpaper was redistributed.

A local rebuild initially failed because normal window close left the test process in the background. Only that exact test runtime's background processes were stopped before replacement; the official Codex processes were untouched. A second attempt encountered the retained temporary output, then a fresh unique output completed. The original 0.3.6 EXE/ASAR and failure artifacts were retained privately. No claim of a clean first attempt is made.

The actual maintainer-label workflow passed ([run 41572248785](https://github.com/LFFFFFFFFFFFFFF/codex-wallpaper/actions/runs/41572248785)), committed the verified catalog and closed the issue. Native refresh displayed the remote work; selecting Download fetched it through the real main/worker path and reused the existing local copy. An additional anonymous network fetch imported the identical SHA-checked pack into a fresh, empty store (`reused: false`). The 480px remote cover was decoded in the native client with temporary focus emulation. No demo was applied to the user's wallpaper.

The first refresh immediately after approval saw the CDN's previous empty catalog. Refresh now adds a generated numeric cache-busting parameter after validating the configured URL, requests no-store/no-cache and still rejects caller-supplied queries/credentials. That behavior has a dedicated test and an actual fresh network read. Network failures remain possible and are shown as retryable Chinese errors.

No new 4K endurance, every creator-account permission variation, mobile UI or complete signed-in Codex workflow was tested. These checks establish this GitHub-backed media workflow, not parity with Steam Workshop or a hosted social platform. A single current account was used for the native upload; account-switch/private-repository rejection is unit tested.

## Native and browser evidence

| Area | Evidence and limits |
| --- | --- |
| Workshop | An independent native profile exercised image previews, favorites, explicit apply and a 620px layout. Video playback and preview disposal used temporary focus emulation. OS file dialogs were simulated in automated tests. |
| WE library | A development-machine scan found 25 installed works. Selected scenes displayed through the actual local renderer. Every project and web API remains unverified. |
| Player controls | Selected checks covered pause/resume, volume and mouse preference persistence, quality reopening, property submission and reload. Every parameter's visual meaning and audible output remain unverified. |
| Reading UI | Chromium fixtures checked message backgrounds, nesting, file-card colors, input/dialog fills, controls and disabled restoration. The native 0.3.6 sidebar was inspected. The final checkbox adjustment passed the fixture and was repackaged. |
| WE ordering in 0.3.6 | One actual pause/resume used temporary CDP focus emulation because the client was occluded. Frame IDs advanced 567 → 571 before pause, then to 639 after resume. Eighty read-only Windows z-order samples included 64 visible non-minimized source samples, with none above the host. Earlier no-focus runs stayed paused and are excluded from successful-resume evidence. |
| Native helper | C++20 compilation succeeded on the development machine. A subsequent PowerShell hash-display command failed and the binary hash was checked separately. A fresh toolchain setup remains unverified. |
| Final installation | Built archive members were compared with source. The diagnostic connection closed, the old process was confirmed absent, and the final normal launch produced a process and window handle. |

## Performance observations

At 2560×1392, two 15-second samples of a 720p/30 video proxy delivered 896 total frames with zero reported drops. Focus was emulated and several 12-second loops were crossed. A separate 1080p/30 sample at the same viewport dropped 61 of 180 frames in six seconds under the observed load.

WE scenes use a separate WGC/readback/IPC path. A display-adapter capture experiment measured about 4.7 captured FPS and was rejected. Competing GPU load and a hung WE renderer were observed in earlier sessions. Sustained performance remains unresolved.

An earlier private cropped screenshot left a temporary 340×620 debug viewport. Samples without viewport records cannot establish full-window smoothness. The private capture tooling was corrected and is excluded from the source release.

## Remaining validation

- Complete signed-in chat, approvals, account restoration and official-profile reuse.
- Long-running playback, multiple GPUs, 4K desktops and all resize/minimize/lock transitions.
- Every theme, page, dialog and sidebar combination in the pinned application.
- Public catalog downloads from the eventual repository and release assets.
- Clean-machine native builds and future Codex application versions.

Issue reports should include application/adapter versions, wallpaper type, display scale, GPU and a minimal redacted error.
