# Validation scope for 0.3.6

Prepared on 2026-11-03 for Codex 26.1027.51404 on Windows x64. Private screenshots, profiles, application archives and media are excluded from the release.

## Automated checks

The 29 tests cover archive preservation/integrity, preload boundaries, source/output separation, release exclusions, workshop roundtrip/validation/favorites, worker flows, catalog/download validation, media-cache identity and limits, WE event contracts, native-window cleanup, reading defaults and text contrast.

Run `npm test` and `npm run check`. Secret scanning is heuristic and should be combined with reviewing the staged file list. The prepared GitHub Actions workflow has not run in the eventual remote repository.

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
