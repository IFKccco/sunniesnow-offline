#!/usr/bin/env python3
"""把 Sunniesnow 运行时依赖全部下载到本地，实现完全离线。

用法（在已解压的内核目录旁执行）：
    python tools/fetch_libs.py <path-to-www>/game

做三件事：
  1. 按 tools/link_manifest.json 从 jsDelivr 下载 47 个文件到 game/libs/npm；
  2. **只改字符串里的路径**（引号内的 /npm/ 前缀），绝不整文替换——
     这些 .js 里打包着压缩过的 wasm 数据，整文替换会破坏二进制，导致
     解码器报 `Decode failed crc32 validation`；
  3. 把引用里的 `/+esm` 改成本地文件名 `/esm.js`。
"""
import json, os, re, sys, urllib.request

HERE = os.path.dirname(os.path.abspath(__file__))
MANIFEST = os.path.join(HERE, "link_manifest.json")
PREFIX = "/game/libs/npm/"

def main():
    if len(sys.argv) < 2:
        print(__doc__)
        sys.exit(1)
    game = os.path.abspath(sys.argv[1])
    npm = os.path.join(game, "libs", "npm")
    os.makedirs(npm, exist_ok=True)
    manifest = json.load(open(MANIFEST, encoding="utf-8"))

    fail = []
    for rel, url in sorted(manifest.items()):
        dest = os.path.join(npm, rel.replace("/", os.sep))
        os.makedirs(os.path.dirname(dest), exist_ok=True)
        try:
            with urllib.request.urlopen(url, timeout=60) as r:
                data = r.read()
        except Exception as e:
            fail.append((rel, str(e)))
            continue
        if rel.endswith(".js"):
            txt = data.decode("utf-8", errors="strict")
            txt = txt.replace('"https://fastly.jsdelivr.net/npm/', '"/game/libs/npm/')
            txt = txt.replace("'https://fastly.jsdelivr.net/npm/", "'/game/libs/npm/")
            txt = txt.replace('"https://cdn.jsdelivr.net/npm/', '"/game/libs/npm/')
            txt = txt.replace("'https://cdn.jsdelivr.net/npm/", "'/game/libs/npm/")
            txt = txt.replace('"/npm/', '"/game/libs/npm/')
            txt = txt.replace("'/npm/", "'/game/libs/npm/")
            txt = txt.replace("`/npm/", "`/game/libs/npm/")
            open(dest, "w", encoding="utf-8", newline="").write(txt)
        else:
            open(dest, "wb").write(data)
        print("ok", rel)

    # 把 /+esm 改成 /esm.js（只匹配字符串内部）
    pat = re.compile(r'(["\'`])(' + re.escape(PREFIX) + r'[^"\'`\s]*?)/\+esm\1')
    changed = 0
    for dirpath, _, files in os.walk(game):
        for fn in files:
            if not fn.endswith(".js"):
                continue
            p = os.path.join(dirpath, fn)
            try:
                txt = open(p, encoding="utf-8", errors="strict").read()
            except Exception:
                continue
            if "/+esm" not in txt:
                continue
            new = pat.sub(lambda m: m.group(1) + m.group(2) + "/esm.js" + m.group(1), txt)
            if new != txt:
                open(p, "w", encoding="utf-8", newline="").write(new)
                changed += 1
    print("esm rewritten:", changed)
    print("FAIL:", fail)

if __name__ == "__main__":
    main()
