# Changelog

## 0.4.0

- Default public community catalog; in-app GitHub CLI publishing with explicit consent.
- Draft upload, asset digest validation and retry reconciliation.
- Maintainer-gated Issues/Actions catalog publishing; no embedded credentials.
- Deterministic package ZIP timestamps for safe retries.


## 0.3.6

- Keep the owned WE source window behind the client after resume, including unchanged geometry.
- Restore the original app surface until wallpaper pixels load, and show loading errors at the wallpaper button.
- Adapt the additional conversation sidebar background and restore visible reading checkboxes.

## 0.3.5

- Restore the existing player reading surfaces, contrast palette and scoped shell transparency.
- Adapt top and footer fade selectors to the pinned application version.
- Restore reading and text color controls with persisted settings and a scrollable small-window panel.

## 0.3.4 — explicit 720p video performance profile

- Add separately keyed, SHA-checked 1280×720/30 H.264 Main profile copies alongside 1080p/30 and original-video modes. Preserve audio and source files.
- Show actual playback dimensions; do not expose the video performance profile for live WE scenes.
- In a controlled same-viewport 2560×1392 native comparison, the current 1080p proxy dropped 61/180 frames over 6 seconds; an alternate 1080p baseline encode also failed. The 720p Main candidate delivered 180 callbacks and 0/180 drops over 6 seconds. Bounded samples do not establish long-run performance.
- Existing user window received a source-specific session playback patch without quitting. The desktop entry contains the persistent three-mode version for the next normal restart. No other client was minimized or terminated by this change.

## 0.3.3 — confirmed close and recovery feedback

- Await native close before returning success; serialize repeated closes and retain failed exact-window cleanup for retry.
- Retry previously failed owned-window cleanup once during shutdown; normalize the helper engine path. Never add automatic termination of the shared WE service.
- Actual final 0.3.2 video retest initially regressed under a hung WE service occupying about 95% of the 3D engine. Normal close failed; that verified nonresponsive render service was stopped and restart attempted. With the competing load gone, the same existing player delivered 297 frames with zero drops over 10 seconds. WE was not left running by that restart attempt; native scenes still require separate validation.
- The close changes pass focused asynchronous failure/retry tests and a pinned Windows build. They have not been newly validated against a real hung WE process.

## 0.3.2 — restore measured video playback path

- Reuse the earlier checked FFmpeg cache for real 1080p/30 H.264/AAC copies; keep original source/export and quality switching.
- Share source preparation across local selection, WE video and workshop apply; serialize state commits, preserve the prior choice on conversion failure, keep frame ACKs outside the conversion queue.
- Show actual playback quality, expose FFmpeg selection, encode local URLs correctly and disclose the WE source FPS preference.
- Add optional per-executable display-GPU launcher preference with a backup, without changing global preferences.
- Native short video check: AMD display GPU, 1920×1080/30 copy about 29.7 delivered FPS and 0 drops over 10 seconds; original 3840×2160/60 dropped about 10.3%. This does not establish sustained performance or real-time WE scene smoothness.
- Reject an experimental display-GPU capture change after it measured worse; preserve the original native capture selection.

## 0.3.1 — player controls and performance correction

- Restore pause/resume, reload, mute/volume, quality selection, mouse switch, user properties and diagnostics using existing runtime actions.
- Restore the existing web wallpaper domain authorization interface.
- Reuse texture allocation between same-sized frames. Restore smooth quality after native QA instead of leaving the tested original-quality setting active.
- Native controls checked pause/resume, saved volume/mouse settings, quality reopen, 34 parameter inputs/write and reload. Audible output and all per-wallpaper parameter effects are not claimed verified.

## 0.3.0 — restore Wallpaper Engine

- Reuse existing Steam discovery, project validation, isolated web renderer and native WE/WGC scene player.
- Add local wallpaper cards, search and explicit apply; default to smooth playback.
- Include capture helper source and local build instructions, without bundling WE or artwork in source.
- Resolve installed PowerShell paths in the double-click launcher.

## 0.2.0 — local workshop

- Add cover cards, search, favorites, media preview and explicit apply.
- Add stored-ZIP `.sfwallpaper` packages with metadata, content hashes, worker processing and deduplication.
- Add opt-in GitHub catalog refresh, bounded downloads and package verification. No public catalog has been deployed.
- Add creator CLI, empty catalog, submission template and format guide; reuse vendored fflate/MIT.
- Build and inspect an independent native test copy; keep unresolved signed-in and long-running checks explicit.

## 0.1.0 — source preparation

- Extracted the local Windows media wallpaper adapter into a self-contained source tree.
- Removed private absolute imports, diagnostic hooks and bundled artwork.
- Added pinned build planning, an independent-profile launcher, source allowlisting, tests and CI.
- Documented unresolved signed-in, display-corruption and future-version compatibility checks.

No claim of a complete SkinForge editor or production-ready official integration.
