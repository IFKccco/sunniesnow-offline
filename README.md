# Sunniesnow 离线版（非官方安卓封装）

把开源音游 [Sunniesnow](https://github.com/sunniesnow/sunniesnow) 的内核封装成一个**可独立安装、完全离线**的安卓 App：不联网、不需要服务器、谱面和音频全部存在手机本地。

> **非官方项目**。本项目与 Sunniesnow 作者无隶属关系，不是官方版本。内核版权归原作者 UlyssesZhan 所有，按 AGPL-3.0 授权。名称与图标属于原项目，若作者要求更改，我会立即更换。

## 是什么

- **内核**：Sunniesnow 的网页构建产物，逻辑未改动，只把运行时依赖改为本地路径并去掉联网请求（见 `docs/CHANGES.md`）
- **外壳（本项目自己写的部分）**：曲库、设置、成绩、启动封面、本地账号，代码在 `shell/`
- **安卓容器**：Capacitor 6 + Android SDK 34，横屏锁定，WebView 内运行

## 功能

| 分类 | 内容 |
| --- | --- |
| 曲库 | 横屏双栏、4×4 网格、右侧曲绘详情，支持导入 `.ssc` 关卡包 |
| 游玩 | 3 秒开局缓冲、暂停（仅点左上暂停后出现）与继续缓冲、结算热区、强制横屏 |
| 判定 | 判定窗口可调、offset 与谱面 offset 校准 |
| 速度 | 四项速度（谱速 / 提示点速度 / 提示点距离 / 游戏速度） |
| 成绩 | 最佳成绩、combo、准确率本地保存；AUTO 模式不计成绩 |
| 账号 | 本地账号（昵称 + 头像），数据结构预留接入服务器的接口 |
| 音频 | 离线解码 12 种格式：mp3 / ogg-vorbis / flac / wav / opus / aac / aiff / amr / caf / qoa / webm / wma |
| 其他 | 曲绘作为游玩背景（模糊压暗）、启动封面、AGPL 声明 |

## 仓库结构

```
shell/            外壳代码（注入到内核页面运行）
  index.html      入口，跳转到内核页
  app.js          曲库 / 导入 / 设置 / 成绩 / 封面 / 校准 全部逻辑
  app.css         外壳样式
android/          Capacitor 安卓工程源码（不含构建产物与内核资源）
tools/            辅助脚本
  link_manifest.json  47 个离线依赖的来源清单
  fetch_libs.py       按清单下载依赖并做「只改字符串路径」的安全改写
  fix_libs.py         修复版：重新下载并安全改写（历史上用于抢救被改坏的库）
  fix_esm2.py         把引用里的 /+esm 改成本地 /esm.js
  patch_site.py       把外壳注入内核页面（幂等）
  inject_cover.py     生成并注入示例曲曲绘
  make_icon.py        由官方图标图源生成全 DPI 启动图标
docs/             构建说明与修改清单
LICENSE           AGPL-3.0 全文（与内核一致）
```

**本仓库不含**：内核本体（约 50 MB 的网页构建 + 字体）、第三方谱面与音乐、APK 产物。这些要么体积过大、要么涉及他人版权，请按 `docs/BUILD.md` 自行获取或由用户自行导入。

## 快速开始

完整步骤见 [`docs/BUILD.md`](docs/BUILD.md)，要点：

1. 取内核：Sunniesnow 官方网页构建产物，放进 `www/game/`
2. 离线化：`python tools/fetch_libs.py www/game`
3. 注入外壳：`python tools/patch_site.py`
4. 打包：`npx cap copy android` → `gradlew assembleDebug`

## 授权与合规

- 本项目整体按 **AGPL-3.0** 发布（外壳代码与内核同许可，避免混合许可的麻烦），全文见 [`LICENSE`](LICENSE)
- 修改内容与日期见 [`docs/CHANGES.md`](docs/CHANGES.md) 与 [`NOTICE.md`](NOTICE.md)
- 若你分发本项目的 APK，请同样提供本仓库的完整源码，并保留版权声明
- 第三方谱面（`.ssc`）与其中的音乐、曲绘版权归各自作者，本项目不分发它们；App 内的导入功能只读取用户自己选择的文件

## 已知限制

- 只有 debug 签名，未上架、未做正式 release 签名
- 只在 MuMu 模拟器（Android 12）与少量桌面浏览器上验证过，未在真机逐型号验证
- 安卓返回键未接管；iOS 版本尚未构建
- 安卓 WebView 的音频解码依赖 `@audio/*` 系列库，冷门格式（aiff / amr / caf / qoa / wma）只验证到解码器可初始化，未用真实样曲端到端跑过

## 反馈

发现内核相关的问题，请优先反馈给上游：<https://github.com/sunniesnow/sunniesnow>。
只与封装、外壳、安卓打包相关的问题，在本仓库开 Issue。
