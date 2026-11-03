# Codex Wallpaper · SkinForge

[中文](README.md)

An unofficial, experimental wallpaper adapter for Windows Codex. Version **0.4.0** is prepared as a prerelease. Build a local copy from your own installation, then select local media or a Wallpaper Engine project.

## Features

- MP4/WebM and common image backgrounds, cover/contain, dimming, pause, reload, mute and volume.
- Message reading backgrounds, interface opacity and configurable text/link colors.
- Cached 720p/30 performance and 1080p/30 balanced videos, with original-video selection and source/audio preservation.
- Local workshop with previews, search, favorites, explicit apply and `.sfwallpaper` import/export.
- A default public GitHub catalog, in-app upload/submission through GitHub CLI, maintainer review and verified downloads.
- Local WE discovery, native scene capture, isolated web wallpapers, mouse interaction, supported properties and diagnostics.

## Requirements

| Component | Supported target |
| --- | --- |
| Windows | x64 |
| Node.js | 24+ |
| PowerShell | 7+ |
| Codex application | 26.1027.51404 |
| Windows package | 26.1027.6604.0 |
| WE scenes | Installed Wallpaper Engine, MSVC C++20 and Windows SDK/C++ WinRT |
| Video proxies | Locally supplied FFmpeg with H.264/AAC encoding support |

Application and executable hashes must match `supported-builds.json`. Other versions require a reviewed compatibility update. ZIP support vendors fflate 0.8.3 under MIT. The commands below work without an npm installation step.

## Build and launch

```powershell
npm test
npm run check
node scripts/build.mjs --plan
node scripts/build.mjs
pwsh -NoProfile -File .local/Start-Wallpaper.ps1
```

Use `--source 'C:/Apps/Codex/app' --out '.local'` for explicit paths. The output must be a new directory, disjoint from the installation. Building copies a substantial runtime, so reserve sufficient disk space. Partial failed builds are retained.

Open **壁纸** to select a background and **创意工坊** for the local workshop. WE scenes require a compiled helper and video proxies require FFmpeg.

- [WE setup](docs/WALLPAPER-ENGINE.md)
- [Video quality and GPU options](docs/PERFORMANCE.md)
- [Workshop packages and catalog](docs/WORKSHOP.md)

## Profiles and local builds

The default uses an independent application profile and `CODEX_HOME`. You may need to sign in again. To reuse the official profile, close official Codex normally and pass `-ReuseOfficialProfile`. Account restoration and complete signed-in workflows remain unverified. `-ProfileRoot` and `-CodexHomeRoot` support reuse of an existing independent setup after its previous process exits.

The builder appends adapter code and updates the cloned EXE's ASAR header digest. The modified copy loses the original publisher signature. Integrity verification, sandbox and CSP remain enabled. The original installation is retained.

## Release scope and status

This release covers the wallpaper adapter, launchers, capture source and local workshop. Legacy `.codexscene` editing, companions, 3D, account/upload servers and the complete SkinForge editor are outside its scope. An original CC0 community demo exercises the publishing workflow.

There are 36 automated tests. Native verification covers selected workflows and one controlled WE pause/resume with temporary focus emulation and Windows z-order sampling. Video figures are bounded samples. Sustained playback, every window transition and complete signed-in workflows remain unverified. See [validation scope](docs/VALIDATION.md).

## Publish source

```powershell
npm run check
npm run release:source
```

The source ZIP follows `release-files.json`. Generated runtimes, account data, media, models and private diagnostics are excluded. Follow the [publishing guide](docs/PUBLISHING.md).

The adapter code uses [MIT](LICENSE). See [NOTICE](NOTICE.md) for third-party scope. This independent project claims no OpenAI affiliation or endorsement.

## GitHub community publishing

The workshop now defaults to the public catalog. Select a local work and choose Publish to community. Install the official GitHub CLI and run `gh auth login` first; the app reuses its credential store without reading a token. An explicit public-sharing confirmation precedes upload to your own public `codex-wallpaper-works` repository and an issue submission to this community. A maintainer must review the content and apply `workshop-approved`; Actions validates the pack and updates the catalog. Existing player fixes are retained. See [workflow details](docs/WORKSHOP.md).
