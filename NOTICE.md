# NOTICE — 上游版权与修改声明

## 上游作品

**Sunniesnow** — 一个网页音游。

- 作者：UlyssesZhan
- 仓库：https://github.com/sunniesnow/sunniesnow
- 内核构建来源：https://sunniesnow.github.io
- 构建对应的提交：`042300541ddcec12a93675551952fd262a9afd90`（2026-09-08）
- 许可证：**GNU Affero General Public License v3.0**（全文见仓库根目录 `LICENSE`）
- 版权声明：`Sunniesnow © UlyssesZhan`，AGPL-3.0

## 本项目做了什么

本项目是 Sunniesnow 的**衍生作品**：把官方网页构建产物封装为安卓离线 App，并额外实现了一层外壳界面。内核的游戏逻辑、判定、渲染、谱面解析未改动。

### 对内核的修改（全部为「离线化」性质，不涉及玩法逻辑）

| 位置 | 修改 | 目的 |
| --- | --- | --- |
| `game/libs/npm/**/*.js` | 把 CDN 依赖（jsDelivr）下载到本地，字符串内的 `/npm/` 路径改为 `/game/libs/npm/` | 断网可运行 |
| `game/libs/npm/**/esm.js` | 引用里的 `/+esm` 改为本地文件名 `/esm.js` | 修正离线后的文件名对应 |
| `game/index.html` | 末尾追加本项目外壳的 `<link>` / `<script>` | 加载外壳界面 |

> 注意：改写依赖路径时**只能改字符串内的路径**。这些 `.js` 内部打包了压缩过的 wasm 数据，整文替换会破坏二进制，表现是白屏 + 控制台报 `simple-yenc: Decode failed crc32 validation`。`tools/fetch_libs.py` 已按此规则实现。

### 本项目新增的内容（版权归本项目，同样按 AGPL-3.0 发布）

- `shell/`：曲库、导入、设置、最佳成绩、启动封面、本地账号、校准、暂停/结算交互
- `android/`：Capacitor 安卓容器、横屏锁定、启动图标资源
- `tools/`：离线化、注入、图标生成脚本

## 商标与名称

AGPL-3.0 授权的是**代码**，不包含项目名称、Logo 与图标。本项目使用 Sunniesnow 名称与图标仅用于标识「这是 Sunniesnow 的封装版」，并在 README 与 App 启动页明确标注**非官方**。若原作者要求更名或撤下图标，本项目会立即执行。

## 不含第三方内容

本仓库与发布的 APK **均不包含**任何第三方谱面（`.ssc`）、第三方音乐或曲绘。App 内的导入功能只读取用户自己选择的本地文件，不上传、不分发。
