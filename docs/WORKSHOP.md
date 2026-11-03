# 创意工坊使用与发布

## 当前能用的功能

壁纸设置 → **创意工坊**。本机作品以卡片展示，支持搜索、预览、收藏、应用、导入和导出。点击卡片只选择作品；点击「应用壁纸」才更换背景。视频预览默认静音，使用播放器播放；关闭工坊后释放预览视频。

先用「壁纸」选择媒体，再在工坊中「保存当前壁纸为作品」，填写名称、作者、介绍、标签与许可。封面可选。保存作品不会自动应用它。每个作品可导出为 `.sfwallpaper`，其他人用相同格式导入。重复导入按规范化信息和媒体SHA复用，不增加副本；收藏跨重启保留。

这是媒体壁纸工坊，不是Steam Workshop接口，也不包含旧完整编辑器的 `.sflib`、`.sfproj` 或 `.codexscene` 转换。分层动画先从编辑器输出视频，再分享该视频。

## 在线社区与投稿（0.4.0）

社区目录默认连接本项目公开仓库。进入「社区目录」会主动刷新；点击作品下载到本机，再预览和应用。旧设置如果明确保存了空地址，继续保留关闭状态，可点击「官方目录」接入；自定义GitHub目录也保留。

### 创作者

1. 从 [GitHub CLI 官方项目](https://cli.github.com/) 安装 `gh`，在自己的终端执行 `gh auth login` 并选择 GitHub.com。程序不索取或保存GitHub令牌。CLI不在PATH时，在工坊点「配置GitHub CLI」选择官方 `gh.exe`。
2. 将自己的视频或图片保存为本机作品，核对作者和素材许可。仅分发自己有权发布的内容。
3. 选中本机作品，点击「发布到社区」。核对登录账号、公开仓库、许可和大小，勾选公开发布与分发权利确认，再点击「确认公开上传并投稿」。
4. 程序在你的账号下创建公开的 `codex-wallpaper-works` 仓库，为作品创建Release、上传分享包与封面，并向本项目创建投稿Issue。已存在的私有仓库不会被改成公开，已有不同内容的文件不会被覆盖。
5. 通过「投稿与审核记录」查看进展。上传不等于审核通过；维护者批准后，使用者刷新社区目录即可看到作品。

上传先使用草稿Release，核对GitHub返回的文件大小与SHA256后才公开。分享包导出采用固定ZIP时间戳，同一内容可确定性重建。失败后重新点击发布，会复用相同作品的Release与投稿；上传完成但投稿未确认会明确提示。单进程有在途保护；不能保证多台机器同时投稿时绝无重复。每次CLI命令最多180秒，应用退出会终止自己的CLI子进程。网络中断后请核对Release/Issue再重试；已发布的远程内容不会因关闭窗口自动删除。

只上传媒体、封面与作品元数据，不上传Codex运行时、会话或本机资料。首次CLI登录由用户在官方流程完成，不在播放器内输入密码或令牌。首次使用需要GitHub公开仓库与Issues相关权限；本应用不修改全局Git配置。

### 维护者审核

投稿集中在 [社区Issues](https://github.com/LFFFFFFFFFFFFFF/codex-wallpaper/issues)。先查看作品的实际画面、素材来源与分发许可，再添加 **workshop-approved** 标签。拥有仓库 write/maintain/admin 权限的人才可批准。GitHub Actions随后：

- 核对投稿作者与Release仓库归属、固定URL结构、审批快照；
- 下载并检查分享包大小、SHA256、清单、媒体与封面；从真实包提取目录信息；
- 在下载期间复查投稿未变化，按目录SHA比较提交、冲突后重读重试，更新main并关闭投稿。

校验失败保持投稿打开，原因见Actions日志。修正后须重新审查、移除再添加标签；维护者也可在Actions中手动运行并填写已批准的Issue编号。脚本不会运行投稿中的代码，机器人不能代替人工判断版权或美术质量。拒绝或撤下作品可关闭投稿或用PR移除目录条目；删除目录不删除创作者自己的Release。

源码自托管者需要调整 `workshop-submission.cjs` 中的社区仓库常量及工作流仓库约束。没有自建账号服务器，也不是Steam Workshop接口。

目录最多200条/1MiB，媒体128MiB，封面4MiB；下载每次30秒并逐跳验证GitHub域名，公开读取不带登录Cookie或令牌。包仍使用相同的本机校验和显式应用流程。

## 无界面打包与目录校验

不需要安装npm依赖：ZIP功能复用vendored **fflate 0.8.3 / MIT**。

```powershell
node scripts/workshop.mjs package --media sample.mp4 --out sample.sfwallpaper --title 'My wallpaper' --author 'Artist' --license CC-BY-4.0 --tags 'anime,night' --cover cover.png
node scripts/workshop.mjs inspect --file sample.sfwallpaper
node scripts/workshop.mjs catalog-entry --file sample.sfwallpaper --id my-wallpaper --url 'https://github.com/OWNER/REPO/releases/download/v1/sample.sfwallpaper'
node scripts/workshop.mjs validate-catalog --file community/catalog.json
```

`package` 不覆盖已有文件。`catalog-entry`输出一个条目，把它加入目录的 `items` 数组。署名许可要求填写作者。请按素材实际权利选择许可；接入代码的MIT许可不会自动授权壁纸内容。

## 格式和边界

`.sfwallpaper`是固定结构的无压缩ZIP：`manifest.json`、`media.ext`、可选`cover.ext`。清单格式 `skinforge.wallpaper` version 1，包括名称、作者、介绍、标签、许可、字节数、MIME和SHA256。ID由规范化清单决定，不含本机绝对路径或时间戳。

- 媒体：PNG/JPEG/WebP/GIF/MP4/WebM，最大128MiB；封面：PNG/JPEG/WebP，最大4MiB。
- 最多3个文件、清单16KiB、8个标签、本机最多500个作品。
- 拒绝未知文件、路径穿越、压缩条目、重复条目、超限、内容哈希不符及未知版本。
- 导入先完整校验，再以临时目录提交；损坏包不覆盖已有作品。应用和导出再次校验媒体SHA。
- 文件头校验不代表完整解码通过；坏媒体可能在播放器报错，仍需实际预览。
- 包的解包、哈希、导出在固定Worker中执行，单任务、90秒超时。超时后可重试；进程意外退出可能留下隐藏临时目录，不会显示为作品。

本机运行目录的 `workshop/`保存作品与收藏，`wallpaper-data/`保存直接选取的壁纸。不要把这些个人媒体目录或运行时上传到源码仓库。
