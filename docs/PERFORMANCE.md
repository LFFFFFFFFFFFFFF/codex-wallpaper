# 播放质量与性能

0.3.6 提供三种视频质量，播放器会显示实际播放源的尺寸。

| 模式 | 实际处理 |
| --- | --- |
| 性能 | 最高1280×720、30fps、H.264 Main、AAC |
| 均衡 | 最高1920×1080、30fps、H.264、AAC |
| 原画 | 使用所选原视频 |

本机视频、WE视频和工坊视频共用VideoCache。首次转换异步排队，后续按源文件指纹及输出SHA复用。转换保留原文件和可用音轨，导出使用原文件。小尺寸素材不会被放大，转码不会裁切画面。首次准备大视频可能耗时。

## 配置 FFmpeg

构建时可以传入本机已安装的工具。

```powershell
$env:SKINFORGE_FFMPEG_EXE='C:/Tools/ffmpeg/bin/ffmpeg.exe'
node scripts/build.mjs --out .local
```

也可在运行后的播放器里点击「选择 FFmpeg 工具」。需要支持H.264和AAC编码的版本。工具缺失时会明确显示使用原视频，转换失败会显示错误。FFmpeg由使用者自行提供。

## 显卡选择与升级

```powershell
pwsh -NoProfile -File .local/Start-Wallpaper.ps1 -PreferDisplayGpu
```

该选项为当前运行副本写入Windows每应用GPU偏好，并保存原值到`display-gpu-before.json`。最终使用的显卡应以实际渲染器为准。

升级时，先正常退出旧副本，再用`-ProfileRoot`和`-CodexHomeRoot`指向原有独立资料目录。使用显式的`-CodexHomeRoot`可以避免推测旧目录结构。两个运行副本不得同时写入同一资料目录。

## 已观察到的限制

开发机上，720p/30视频在2560×1392视口的两次15秒受控采样共896帧，报告丢帧为0。相同视口下，另一次1080p/30采样在6秒内丢61/180帧。测试使用临时焦点模拟，不能代表长期表现。

WE场景通过原引擎渲染、Windows Graphics Capture、回读、IPC和画布合成。1080p设置限制的是场景尺寸，实际帧率还受WE设置、采集耗时和GPU负载影响。视频转码数据不适用于这条路径。

0.3.6 修复了恢复时源窗口层级、首帧前黑底和侧栏底色。场景长期性能及全部窗口切换路径仍待验证。诊断时记录实际源尺寸、帧数、丢帧、视口和其他GPU负载。详细范围见[验证记录](VALIDATION.md)。
