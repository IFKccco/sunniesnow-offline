import os, re, shutil, urllib.request

ROOT = r"D:\MuMuSetup\ss_app\www\game\libs"
NPM = os.path.join(ROOT, "npm")
CDN = "https://fastly.jsdelivr.net/npm/"
BK = r"D:\MuMuSetup\libs_backup"

# 0) 备份当前库目录
if not os.path.isdir(BK):
    shutil.copytree(NPM, BK)
    print("backup ok")

def url_for(rel):
    # rel 用 / 分隔，形如 @audio/decode-vorbis@1.3.0/esm.js
    if rel.endswith("/esm.js"):
        return CDN + rel[:-len("/esm.js")] + "/+esm"
    if rel.startswith("pixi.js/transcoders/"):
        return CDN + "pixi.js@8.20.1/" + rel[len("pixi.js/"):]
    return CDN + rel

targets = []
for dirpath, dirs, files in os.walk(NPM):
    for fn in files:
        p = os.path.join(dirpath, fn)
        rel = os.path.relpath(p, NPM).replace(os.sep, "/")
        targets.append((p, rel))

fail = []
for p, rel in targets:
    if rel.endswith(".map"):
        continue
    u = url_for(rel)
    try:
        with urllib.request.urlopen(u, timeout=60) as r:
            data = r.read()
    except Exception as e:
        fail.append((rel, str(e)))
        continue
    if rel.endswith(".js"):
        txt = data.decode("utf-8", errors="strict")
        # 只改「字符串里的路径」，不碰二进制数据
        txt = txt.replace('"https://fastly.jsdelivr.net/npm/', '"/game/libs/npm/')
        txt = txt.replace("'https://fastly.jsdelivr.net/npm/", "'/game/libs/npm/")
        txt = txt.replace('"https://cdn.jsdelivr.net/npm/', '"/game/libs/npm/')
        txt = txt.replace("'https://cdn.jsdelivr.net/npm/", "'/game/libs/npm/")
        txt = txt.replace('"/npm/', '"/game/libs/npm/')
        txt = txt.replace("'/npm/", "'/game/libs/npm/")
        txt = txt.replace("`/npm/", "`/game/libs/npm/")
        with open(p, "w", encoding="utf-8", newline="") as f:
            f.write(txt)
    else:
        with open(p, "wb") as f:
            f.write(data)
    print("re", rel, len(data))

print("FAIL:", fail)
for rel in ("@audio/decode-vorbis@1.3.0/esm.js", "@audio/decode-mp3@1.3.0/esm.js"):
    p = os.path.join(NPM, rel.replace("/", os.sep))
    t = open(p, encoding="utf-8").read()
    print(rel, "remaining raw /npm/:", len(re.findall(r'/npm/', t)), "prefix count:", t.count("/game/libs/npm/"))
