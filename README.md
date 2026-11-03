# Codex Wallpaper · SkinForge

[English](README.en.md)

为 Windows 版 Codex 桌面应用添加本机视频／图片壁纸的**非官方实验性适配器**。使用者从自己安装的 Codex 在本机构建独立副本，再选择自己的壁纸。

本仓库提供接入代码、本机创意工坊和本地构建工具。默认不附带壁纸、Codex 程序、账号资料或模型。当前版本 `0.3.6`，按实验性预发布整理。

## 可以做什么

- 选择 MP4、WebM、PNG、JPEG、WebP、GIF，按内容哈希存入本机壁纸目录。
- 开关背景、铺满／完整显示、整屏压暗，视频默认静音。
- 消息文字阅读底框、界面底色强度、正文／辅助文字／链接颜色。
- 设置本地保存；窗口隐藏时暂停视频。
- 保留原安装，输出独立本机运行副本；启动器默认使用独立资料目录。
- 本机工坊：卡片预览、搜索、收藏、显式应用、作品信息与可选封面。
- `.sfwallpaper` 分享包导入导出、SHA校验、重复导入复用；GitHub社区目录手动刷新与下载。
- 自动发现本机Wallpaper Engine壁纸：视频可生成1080p/30副本、场景由本机WE原引擎渲染、网页隔离运行。[接入与原生辅助程序构建](docs/WALLPAPER-ENGINE.md)。
- 播放／暂停、重载、静音／音量、WE画质、鼠标交互开关、用户参数与播放诊断。兼容帧路径复用纹理；1080p渲染上限不等于流畅保证。
- 提供720p/30性能档及1080p/30转码缓存，保留原文件和声音；本机选择、WE视频、工坊应用共用。可切回原视频。[性能与显卡选项](docs/PERFORMANCE.md)。

尚未支持旧 `.codexscene` 分层工程、伙伴系统、3D、账号服务器、自动上传或自动适配任意 Codex 更新。社区目录目前为空，需发布实际仓库后配置地址。它不是完整 SkinForge 客户端／编辑器的源码仓库。

## 兼容状态

| 项目 | 当前状态 |
| --- | --- |
| 平台 | Windows x64 |
| Node.js | 24 或更新 |
| PowerShell | 7 或更新 |
| Codex 应用版本 | **26.1027.51404** |
| 对应 Windows 安装包 | 26.1027.6604.0 |
| 其他版本 | 拒绝构建，需先审核兼容性 |

以上是已适配的固定版本，不承诺它始终是最新版。应用包和 EXE 的 SHA256 必须匹配 `supported-builds.json`；不要删除版本／哈希校验强行运行。

当前源码有 29 项自动化测试。0.3.6 已进行一次真实 WE 暂停／恢复检查，包含受控焦点和系统窗口层级采样。视频性能只做过短时、指定视口的采样。长期稳定性、全部窗口切换路径和完整登录后工作流仍待验证。参见 [验证范围](docs/VALIDATION.md)。

## 本地构建

先单独安装官方 Codex，以及 Node.js 24+、PowerShell 7+。ZIP处理复用内置的 fflate 0.8.3/MIT，可直接执行下面的命令。

```powershell
npm test
npm run check
# 自动查找本机 Codex，仅检查版本和哈希，不创建运行副本
node scripts/build.mjs --plan
# 从已审核版本创建本机副本；默认输出 .local/
node scripts/build.mjs
pwsh -NoProfile -File .local/Start-Wallpaper.ps1
```

也可以显式指定安装目录：

```powershell
node scripts/build.mjs --source 'C:/Apps/Codex/app' --out '.local'
```

输出目录必须不存在，而且不能与安装源互相包含。构建不需要修改官方安装或管理员权限；本机安装源可能因 Windows 权限而不可读取。

构建会复制较大的本机运行时，请预留足够磁盘空间。失败后保留部分输出，检查错误并指定新的空 `--out` 目录，不要盲目删除包含个人资料的旧输出。

启动后点击右下角「壁纸」，选择自己拥有使用权限的视频或图片。首次没有预设背景，选择后才会开启。

也可双击输出目录的 `Start-Wallpaper.vbs` 启动；脚本控制台隐藏，交互式应用正常显示。

随后在「壁纸」→「创意工坊」管理、收藏与分享作品。其他人导出的 `.sfwallpaper` 可直接导入；分层工程需先渲染为媒体。[工坊完整使用与社区发布说明](docs/WORKSHOP.md)。

### 账号资料

默认独立资料和 `CODEX_HOME`，可能需要重新登录。程序不导入历史或认证文件。

可选复用官方资料：先正常退出官方 Codex，再运行：

```powershell
pwsh -NoProfile -File .local/Start-Wallpaper.ps1 -ReuseOfficialProfile
```

该模式会让修改版正常读写官方资料目录，原账号／会话恢复尚未完整验收。启动器发现官方窗口仍运行时会停止，不会强制关闭。返回官方版时先正常退出修改版，再打开原入口。

## 构建与签名

这是本机自定义副本，不是官方插件。构建保留原启动代码和预加载代码，追加接入模块，并更新副本 EXE 中的 ASAR 头摘要。原发布者签名不再适用于副本；没有关闭完整性校验、sandbox 或 CSP。安全机制可能阻止自定义副本启动，遇到此情况保留错误并报告，不提供绕过系统安全提示的步骤。

## 发布源码

```powershell
npm run check
npm run release:source
```

发布包由 `release-files.json` 白名单生成。`runtime`、`.local`、账号目录、测试截图、媒体、模型和本机清单不会进入源码包。不要直接压缩整个工作目录，也不要把构建出来的运行副本放到 GitHub Releases。参见 [GitHub 发布步骤](docs/PUBLISHING.md)。

## 许可证

本仓库接入代码采用 [MIT](LICENSE)。第三方软件、素材和商标的权利范围见 [NOTICE](NOTICE.md)。不代表 OpenAI 或得到其背书。
