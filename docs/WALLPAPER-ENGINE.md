# Wallpaper Engine 本机接入

点击「壁纸 → Wallpaper Engine 本机壁纸」，自动读取本机Steam库中的431960作品目录。也可选择含`project.json`的完整作品文件夹。搜索或点击缩略图查看类型，点击「应用此WE壁纸」后播放。

- video：使用本机视频作为背景，不需要重做作品。
- scene：使用你已安装的Wallpaper Engine原引擎打开独立场景窗口，通过Windows Graphics Capture接收该窗口画面，在Codex背景合成。粒子、人物运动和材质仍由WE执行。
- web：复用原隔离网页播放器，默认离线、静音，无Node或主应用IPC。系统音频响应与原生插件不在此次范围。
- application和未知类型不运行。缺清单、缺资源或不安全路径会显示不可用。

本机默认使用流畅画质，上限1080p/30fps；这不是4K或长期性能承诺。关闭、最小化或切换背景会暂停／释放原播放器；只控制本程序创建并核验过的WE场景窗口，不关闭整个WE或改变桌面壁纸。WE原生场景不会自动放进媒体分享包。

播放器面板另有播放／暂停、重新加载、静音／音量、流畅／原画、鼠标移动交互、WE用户参数和诊断。参数类型包含布尔、数值、颜色、文本和组合选项；不支持的类型会标明。网页壁纸可在参数窗口中配置已有的HTTPS域名授权，默认离线。WE与桌面引擎的帧率设置仍会影响实际帧率，30fps是上限。

纹理上传沿用旧播放器的尺寸缓存策略：普通帧只更新内容，尺寸变化时才重新分配。当前宿主没有提供可验证的无光标视频流约束，因此采用兼容WGC帧传递；没有为了流通道移除光标校验，也不宣称零拷贝。流畅模式可减少大窗口像素带宽；本版本仍需继续实测大屏和长期性能。

## 构建场景画面接收器

读取库、视频和网页不需要C++辅助程序；WE场景接收需要本仓库的辅助程序。它不是WE自身的程序，源码为复用的项目原有Windows Graphics Capture模块。

在带MSVC C++20及Windows SDK/C++ WinRT的x64 Visual Studio Developer PowerShell中：

```powershell
pwsh -NoProfile -File scripts/build-we-capture.ps1
$env:SKINFORGE_WE_CAPTURE_EXE=(Resolve-Path .native/codex-we-window-capture.exe).Path
node scripts/build.mjs --out .local-we
```

构建器把指定的本地接收器复制到新运行副本，并复制配套的窗口核验脚本；不会打包Wallpaper Engine或任何订阅作品。0.3.6 的接收器已在开发机使用 MSVC/C++20 编译，并完成一次真实恢复检查。全新工具链环境仍需验证。

接入沿用项目原来的Steam路径发现、作品校验、场景缓存、原引擎窗口管理、单帧确认及故障恢复模块。原作品保持原样，场景／网页在本机`we-projects/`建立校验副本；场景还有供WE读取的本机ASCII路径缓存。它们不会进入开源源码包。
