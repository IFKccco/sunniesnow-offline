# 构建说明

目标：从上游官方构建产物 + 本仓库源码，产出一个可安装的 debug APK。

## 0. 环境

| 组件 | 版本 |
| --- | --- |
| JDK | 17（Temurin 17.0.21+9 验证过） |
| Android SDK | platforms;android-34、build-tools;34.0.0、platform-tools |
| Node | 任意 LTS（仅用于 Capacitor CLI） |
| Python | 3.x（只用到标准库） |

环境变量：`JAVA_HOME` 指向 JDK 17，`ANDROID_HOME` 指向 SDK 根目录。

## 1. 取内核（网页构建产物）

把 Sunniesnow 官方站点 https://sunniesnow.github.io 的构建产物整份放到：

```
www/game/
```

需要包含 `index.html`、`js/`、`libs/`、`fonts/`、`json/` 等。上游对应提交见 `NOTICE.md`。

这一步**不进本仓库**：内核体积约 50 MB（其中字体就占 ~49 MB），且最稳妥的取法是直接用官方发布的构建。

## 2. 离线化依赖

```bash
python tools/fetch_libs.py www/game
```

它按 `tools/link_manifest.json` 从 jsDelivr 下载 47 个文件到 `www/game/libs/npm/`，并做两步安全改写：

1. **只改字符串里的路径**（引号内的 `/npm/` 前缀）——绝不能整文替换，否则会破坏库内打包的 wasm 二进制，症状是白屏 + `Decode failed crc32 validation`
2. 引用里的 `/+esm` 改成本地 `/esm.js`

## 3. 注入外壳

```bash
python tools/patch_site.py
```

在 `www/game/index.html` 末尾幂等追加外壳的 CSS / JS 引用（带 `?v=mtime` 防缓存）。重复执行不会重复注入。

准备站点其余文件，形成如下结构：

```
www/
  index.html        入口（跳转到 game/index.html）
  app/app.js        外壳逻辑
  css/app.css       外壳样式
  game/             内核
  levels/           示例曲（sunniesnow-sample.ssc + sample-cover.png）
```

`shell/` 里的三个文件即 `index.html`、`app/app.js`、`css/app.css` 的原样拷贝。

## 4. 组装安卓工程

```bash
npm install                 # 装 Capacitor 6 依赖
npx cap copy android        # 把 www 同步进 android/app/src/main/assets/public
```

`capacitor.config.json` 关键项：

```json
{ "appId": "com.sunniesnow.offline", "appName": "Sunniesnow", "webDir": "www", "androidScheme": "https" }
```

`android/app/src/main/AndroidManifest.xml` 中已设 `android:screenOrientation="sensorLandscape"`（强制横屏）。

图标：`python tools/make_icon.py` 会以官方图标图源生成全 DPI 的 `ic_launcher*.png`、圆形图标与自适应前景（背景色纯黑）。图源需自行准备为 `icon_src.png`。

## 5. 打包

```bash
cd android
gradlew assembleDebug
```

产物：`android/app/build/outputs/apk/debug/app-debug.apk`。

安装到设备/模拟器：

```bash
adb install -r app-debug.apk
```

## 6. 验证清单

装好后应确认：

- [ ] 启动封面正常，点屏幕进入曲库
- [ ] 示例曲可开局，AUTO 模式自动演奏并结算 S
- [ ] 导入一个含 mp3 的 `.ssc`，进关不白屏
- [ ] 导入一个含 ogg 的 `.ssc`，进关不白屏（ogg 走 vorbis 解码器，最容易踩到二进制被改坏的坑）
- [ ] 游玩背景显示的是曲绘（不是纯白）
- [ ] 点左上暂停 → 出现「继续 / 曲库」两个按钮、背景变灰；继续前有缓冲
- [ ] 结算页点左上角才出现「重试 / 曲库」

若某个格式白屏，先在桌面浏览器打开 `game/index.html?skipSplash=1&diag=1`，看控制台是否报 `Decode failed crc32 validation`——报这个说明依赖库被改坏，重跑第 2 步。
