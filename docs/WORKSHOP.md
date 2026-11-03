# 创意工坊使用与发布

## 当前能用的功能

壁纸设置 → **创意工坊**。本机作品以卡片展示，支持搜索、预览、收藏、应用、导入和导出。点击卡片只选择作品；点击「应用壁纸」才更换背景。视频预览默认静音，使用播放器播放；关闭工坊后释放预览视频。

先用「壁纸」选择媒体，再在工坊中「保存当前壁纸为作品」，填写名称、作者、介绍、标签与许可。封面可选。保存作品不会自动应用它。每个作品可导出为 `.sfwallpaper`，其他人用相同格式导入。重复导入按规范化信息和媒体SHA复用，不增加副本；收藏跨重启保留。

这是媒体壁纸工坊，不是Steam Workshop接口，也不包含旧完整编辑器的 `.sflib`、`.sfproj` 或 `.codexscene` 转换。分层动画先从编辑器输出视频，再分享该视频。

## 社区目录

本版本没有账号服务器、自动上传或预置公共作品。发布者准备好GitHub仓库后：

1. 创作者导出分享包，把自己有权分发的包上传到自己的GitHub Release或GitHub Pages。
2. 使用下方工具生成条目，向本仓库 `community/catalog.json` 提交Pull Request。
3. 仓库维护者审核素材许可与实际包，再合并。CI校验目录结构，不会替代内容审核。
4. 使用者在工坊「社区目录」填该仓库 `community/catalog.json` 的 **raw JSON HTTPS地址**，保存地址并点击刷新。
5. 选择条目，下载到本机，预览后应用。应用不会自动启动未知脚本。

目录可以放在GitHub raw或GitHub Pages；包也支持GitHub Release。网络只在主动刷新或下载时发起，不携带登录Cookie或令牌。最多200条、目录1MiB、单次网络30秒；重定向每跳验证公开GitHub域名，支持Release资产的签名重定向。没有公共仓库地址时，本机分享仍然可用。

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
