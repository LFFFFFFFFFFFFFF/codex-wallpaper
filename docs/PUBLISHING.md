# GitHub 发布步骤

当前准备版本为 `0.3.6`。仓库名称可用 `codex-wallpaper`，描述可用 `Unofficial wallpaper player and local workshop for a pinned Codex Windows build.`

源码采用现有 MIT 许可证。发布范围为当前壁纸播放器适配器及本机工坊，详细功能和限制见首页。

## 上传前

在源码目录执行以下命令。

```powershell
npm test
npm run check
npm run release:source
git diff --cached --stat
git ls-files
```

源码ZIP按`release-files.json`生成。发布目录应包含源码、文档和许可证。运行副本、个人资料、模型、测试截图和第三方壁纸已排除。

## 创建仓库并上传

1. 在自己的GitHub账号创建空仓库，名称使用`codex-wallpaper`，需要开源时选择Public。README和许可证使用这份源码中的文件。
2. 在本地源码目录完成首次提交并关联实际仓库地址。

```powershell
git status
git add .
git commit -m "Release Codex Wallpaper 0.3.6 source"
git remote add origin https://github.com/YOUR_ACCOUNT/codex-wallpaper.git
git push -u origin main
```

把`YOUR_ACCOUNT`替换为实际账号。提交身份使用你自己的Git配置。也可以通过GitHub Desktop添加这个现有本地仓库，再使用Publish repository。准备目录当前已初始化`main`并暂存源码，首次提交和远程关联留待发布时完成。

## 发布预览版本

使用 `v0.3.6` 标签，Release标题可填 `v0.3.6 — Experimental source release`，勾选Pre-release。说明正文已经准备在[发布说明](RELEASE-v0.3.6.md)。附件选择白名单生成的源码ZIP，生成的Codex运行副本留在本机。

GitHub Actions已配置测试及源码检查。远程首次运行结果要在推送后查看。使用的Action版本已对照官方发布记录核对。[checkout发布记录](https://github.com/actions/checkout/releases)、[setup-node发布记录](https://github.com/actions/setup-node/releases)。

## 社区作品目录

`community/catalog.json`当前为空。仓库发布后，按[工坊指南](WORKSHOP.md)配置真实地址和作品包。每份作品包使用其素材自己的许可声明。

准备阶段仅生成本地发布材料。尚未创建远程仓库、设置远程地址或公开上传。
