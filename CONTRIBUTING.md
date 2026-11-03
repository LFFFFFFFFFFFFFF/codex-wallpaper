# Contributing

Use Node.js 24+. There are no npm dependencies. Run `npm test` and `npm run check`.

Keep changes focused. Do not remove pinned version, hash, IPC-owner, source/output separation or media checks to make an unsupported build appear compatible. A new supported build needs its own metadata and a native validation scope. Do not include extracted Codex files in a pull request.

Use synthetic fixtures in tests. Avoid real accounts, proprietary screenshots, personal paths, wallpapers or model weights. Never add generated local runtimes to commits or Releases.

Report which checks were actually run. Archive validity, video decoding and a screenshot are different checks; none automatically certifies all visual or chat behavior.
