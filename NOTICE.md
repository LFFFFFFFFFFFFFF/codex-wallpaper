# Scope and third-party materials

The MIT license covers the adapter, launchers, documentation and build utilities in this repository. It does not license OpenAI software, Codex, Electron distributions, third-party artwork, videos, trademarks or account data.

This is an independent, unofficial experiment. It is not an official Codex extension or an OpenAI-supported integration. No affiliation or endorsement is claimed.

The repository contains no Codex executable, application archive, extracted proprietary application source, authentication data or wallpaper media. Build locally from an installation you obtained separately. Do not attach the generated runtime to GitHub Releases.

The ASAR utilities were extracted from this project's existing local build helpers and limited to the reusable archive and integrity-resource functions. They depend only on Node.js built-in modules. The release has no npm runtime dependencies.

Workshop ZIP packages use **fflate 0.8.3**, vendored without changes from `lib/browser.cjs`, under MIT. Its license and pinned source/hash record are in `third-party/`; local builds copy the license into `licenses/`. See [fflate upstream](https://github.com/101arrowz/fflate). No package-manager install is required.

Workshop packages carry their own media licenses; the adapter's MIT license does not grant rights to shared wallpapers. No third-party wallpaper packages are bundled.

Reference documents:

- [Electron ASAR integrity](https://www.electronjs.org/docs/latest/tutorial/asar-integrity)
- [GitHub repository licensing](https://docs.github.com/en/repositories/managing-your-repositorys-settings-and-features/customizing-your-repository/licensing-a-repository)

Modified local executables do not retain the original publisher signature. The build updates the cloned executable's existing ASAR header digest; it does not disable the integrity fuse, sandbox or CSP. Keep the generated executable and archive together. Platform restrictions can prevent a custom copy from launching.
