import os, re

GAME = r"D:\MuMuSetup\ss_app\www\game"
PREFIX = "/game/libs/npm/"

# 只把「字符串里的 /+esm」改成 /esm.js，避免碰坏二进制数据
pat = re.compile(r'(["\'`])(' + re.escape(PREFIX) + r'[^"\'`\s]*?)/\+esm\1')

changed = 0
for dirpath, dirs, files in os.walk(GAME):
    for fn in files:
        if not fn.endswith(".js"):
            continue
        p = os.path.join(dirpath, fn)
        try:
            txt = open(p, "r", encoding="utf-8", errors="strict").read()
        except Exception:
            continue
        if "/+esm" not in txt:
            continue
        new = pat.sub(lambda m: m.group(1) + m.group(2) + "/esm.js" + m.group(1), txt)
        if new != txt:
            open(p, "w", encoding="utf-8", newline="").write(new)
            changed += 1
            print("patched", os.path.relpath(p, GAME))
print("changed", changed)

# 检查是否还有残留
for dirpath, dirs, files in os.walk(GAME):
    for fn in files:
        if fn.endswith(".js"):
            p = os.path.join(dirpath, fn)
            try:
                t = open(p, "r", encoding="utf-8", errors="ignore").read()
            except Exception:
                continue
            if "/+esm\"" in t or "/+esm'" in t:
                print("LEFT", os.path.relpath(p, GAME))
