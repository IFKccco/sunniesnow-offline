# 修改清单（相对上游）

日期：2026-11-17
上游构建对应提交：`042300541ddcec12a93675551952fd262a9afd90`

## 一、对内核的修改

### 1. 依赖本地化

- 把 `js/index.html` 与各 bundle 中引用的 jsDelivr 依赖整树下载到 `game/libs/npm/`
  （47 个文件：`@audio/decode*` 12 个解码器、`audio-decode`、`audio-type`、`pixi.js` 及其 transcoder、`jszip`、`marked`、`mime`、`liquidjs`、`dompurify`、`vconsole`）
- 把字符串内的 `/npm/` 前缀改写为 `/game/libs/npm/`，使离线时路径可解析
- 把引用里的 `/+esm` 改写为本地文件名 `/esm.js`

**踩过的坑**：第一版脚本对 `.js` 做全文 `replace("/npm/", prefix)`，命中了库内打包的 wasm yenc 数据，导致 12 个音频解码器全部 CRC 校验失败——症状是导入的关卡白屏，控制台报
`simple-yenc: Decode failed crc32 validation`。修复方式是只替换引号内的路径（见 `tools/fetch_libs.py`）。

### 2. 页面注入

- `game/index.html` 末尾追加外壳的样式与脚本引用（幂等，带 `?v=mtime`）

### 3. 未改动的部分

游戏逻辑、判定窗口、谱面解析、渲染管线、UI 布局、音频调度均保持上游原样。

## 二、外壳功能（本项目新增）

- 启动封面：品牌图占宽度 80%、点屏幕开始、右上角本地账号、底部 AGPL 声明
- 曲库：横屏双栏，左侧 4×4 网格 + 分页，右侧曲绘与曲目详情（曲名 / 曲师 / 谱师 / 大小 / 难度数）
- 导入：接受 `.ssc`（zip），解析出 music / 各难度 json / 曲绘，可多首管理，支持删除
- 难度选择：按 `difficulty` 排序生成按钮，显示最佳成绩
- 游玩：
  - 3 秒开局缓冲（`3 → 2 → 1 → GO`）
  - 强制横屏，竖屏时提示「请把手机横过来」
  - 暂停：只有点左上角内置暂停键才出现「继续 / 曲库」，背景变灰，两个按钮居中上下排列
  - 继续游玩前有缓冲时间
  - 结算：点左上角才出现「重试 / 曲库」
  - 背景使用关卡包内的曲绘（`background: from-level` + 模糊/亮度沿用上游默认）
- 判定与校准：判定窗口档位、音频 offset（ms）、谱面 offset（ms）、节拍器校准
- 速度四项：谱速 `speed`、提示点速度 `tipPointSpeed`、提示点距离 `tipPointDistance`、游戏速度 `gameSpeed`
- 成绩：combo、准确率、最佳分数与评级按「谱面文件」维度存 `localStorage`；AUTO 模式不写成绩并提示
- 账号：本地档案（`{v, id, name, avatarUrl, provider}`），头像压缩到 192px 存 dataURL；结构上预留 `provider: 'remote'` 接入服务器
- AUTO 开关常驻曲库顶栏，其余设置收进设置面板
- 版权：启动页与设置页保留 `内核 Sunniesnow © UlyssesZhan · AGPL-3.0` 声明

## 三、安卓封装

- Capacitor 6 + Android SDK 34，`appId = com.sunniesnow.offline`
- `sensorLandscape` 强制横屏，`backgroundColor #0f1418`
- 启动图标：由官方图标图源按黄/红像素求外框裁切 → 1024 母版（清除截图残留的灰色圆环）→ 全 DPI 方形/圆形/自适应前景，背景纯黑

## 四、已知未做

- release 签名、版本号、上架物料
- 安卓返回键接管
- iOS 构建与自签
- 结算页的「下一首 / 返回详情」完整流程；成绩未画进内核 canvas 结算页
- 登录页「游客 / 绑定账号」切换
- 冷门音频格式（aiff / amr / caf / qoa / wma）缺真实样曲的端到端验证
