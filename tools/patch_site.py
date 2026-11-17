import io, os, json, re, time

GAME = r"D:\MuMuSetup\ss_app\www\game\index.html"
CSS = r"D:\MuMuSetup\ss_app\www\css\app.css"
JS = r"D:\MuMuSetup\ss_app\www\app\app.js"
raw = open(GAME, "r", encoding="utf-8").read()

if "/css/app.css" not in raw:
    raw = raw.replace("</head>", '\t<link rel="stylesheet" href="/css/app.css">\n</head>', 1)

if "/app/app.js" not in raw:
    inject = (
        '<script src="/game/libs/npm/jszip@3.10.1/dist/jszip.min.js"></script>\n'
        '<script src="/app/app.js"></script>\n'
    )
    raw = raw.replace("</body>", inject + "</body>", 1)

# 给外壳的 css/js 带上版本号，避免浏览器/WebView 一直用旧缓存
def ver(p):
    return int(os.path.getmtime(p))

raw = re.sub(r'/css/app\.css(?:\?v=\d+)?', '/css/app.css?v=%d' % ver(CSS), raw)
raw = re.sub(r'src="/app/app\.js(?:\?v=\d+)?"', 'src="/app/app.js?v=%d"' % ver(JS), raw)

open(GAME, "w", encoding="utf-8", newline="").write(raw)

# 入口页：直接转到游戏页（曲库界面由 app.js 注入）
index = r"D:\MuMuSetup\ss_app\www\index.html"
open(index, "w", encoding="utf-8", newline="").write(
"""<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>Sunniesnow</title>
<style>html,body{margin:0;height:100%;background:#0d0d12;color:#9a9aad}
body{display:flex;align-items:center;justify-content:center;font-family:-apple-system,"PingFang SC",sans-serif}</style>
</head>
<body>
<div>载入中…</div>
<script>location.replace('game/index.html');</script>
</body>
</html>
""")
print("patched")
