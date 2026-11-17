import os, re, shutil, urllib.request, sys

ROOT = r"D:\MuMuSetup\ss_app\www\game\libs"
NPM = os.path.join(ROOT, "npm")
CDN = "https://fastly.jsdelivr.net/npm/"

def dl(path):
    url = CDN + path
    dest = os.path.join(NPM, path.replace("/", os.sep))
    os.makedirs(os.path.dirname(dest), exist_ok=True)
    try:
        with urllib.request.urlopen(url, timeout=60) as r:
            data = r.read()
        with open(dest, "wb") as f:
            f.write(data)
        print(f"  + {len(data)/1024:.1f} KB  {path}")
        return dest
    except Exception as e:
        print(f"  ! FAIL {path}: {e}")
        return None

# 1) 把第一批文件挪到 npm/ 下
if os.path.isdir(ROOT):
    for name in os.listdir(ROOT):
        src = os.path.join(ROOT, name)
        if name == "npm" or not os.path.isdir(src):
            continue
        for dirpath, dirs, files in os.walk(src):
            for fn in files:
                s = os.path.join(dirpath, fn)
                rel = os.path.relpath(s, ROOT)
                d = os.path.join(NPM, rel)
                os.makedirs(os.path.dirname(d), exist_ok=True)
                shutil.move(s, d)
        shutil.rmtree(src, ignore_errors=True)

# 2) 递归补齐 /npm/ 引用并改写成站点绝对路径
PREFIX = "/game/libs/npm/"
seen = set()
for _ in range(8):
    pending = set()
    for dirpath, dirs, files in os.walk(NPM):
        for fn in files:
            p = os.path.join(dirpath, fn)
            if p in seen:
                continue
            seen.add(p)
            try:
                txt = open(p, "r", encoding="utf-8", errors="ignore").read()
            except Exception:
                continue
            for m in re.finditer(r'/npm/([A-Za-z0-9@._+\-/%~]+)', txt):
                ref = m.group(1)
                if ref.startswith("game/"):
                    continue
                dest = os.path.join(NPM, ref.replace("/", os.sep))
                if not os.path.exists(dest):
                    pending.add(ref)
    if not pending:
        break
    print(f"--- 轮次下载 {len(pending)} 个 ---")
    for ref in sorted(pending):
        dl(ref)

# 3) 改写所有 /npm/ 前缀
changed = 0
for dirpath, dirs, files in os.walk(NPM):
    for fn in files:
        p = os.path.join(dirpath, fn)
        if fn.endswith(".map"):
            continue
        txt = open(p, "r", encoding="utf-8", errors="ignore").read()
        if "/npm/" not in txt:
            continue
        new = (txt.replace("https://fastly.jsdelivr.net/npm/", PREFIX)
                  .replace("https://cdn.jsdelivr.net/npm/", PREFIX)
                  .replace("/game/libs/npm/", "\x00")
                  .replace("/npm/", PREFIX)
                  .replace("\x00", PREFIX))
        if new != txt:
            open(p, "w", encoding="utf-8", newline="").write(new)
            changed += 1
print(f"改写文件数 {changed}")

total = 0
count = 0
for dirpath, dirs, files in os.walk(NPM):
    for fn in files:
        count += 1
        total += os.path.getsize(os.path.join(dirpath, fn))
print(f"共 {count} 个文件, {total/1024/1024:.2f} MB")
