import io, os, shutil, zipfile
from PIL import Image

SRC = r"D:\MuMuSetup\ss_app\www\levels\sunniesnow-sample.ssc"
COVER = r"D:\MuMuSetup\ss_app\www\levels\sample-cover.png"
BAK = SRC + ".bak"

# 1. 曲绘压到 512x512（白底，压很小）
im = Image.open(COVER).convert("RGB")
im = im.resize((512, 512), Image.LANCZOS)
buf = io.BytesIO()
im.save(buf, "PNG", optimize=True)
cover_bytes = buf.getvalue()
print("cover bytes:", len(cover_bytes))

# 2. 重打包 .ssc，保留原有条目顺序与内容，追加 cover.png
if not os.path.exists(BAK):
    shutil.copy2(SRC, BAK)

with zipfile.ZipFile(BAK, "r") as zin:
    entries = [(i, zin.read(i.filename)) for i in zin.infolist()]

names = [i.filename for i, _ in entries]
assert "cover.png" not in names, "already has cover"

with zipfile.ZipFile(SRC, "w", zipfile.ZIP_DEFLATED) as zout:
    for info, data in entries:
        zout.writestr(info, data)
    zout.writestr("cover.png", cover_bytes)

with zipfile.ZipFile(SRC) as z:
    print("entries:", len(z.namelist()))
    print("has cover:", "cover.png" in z.namelist())
print("size:", os.path.getsize(SRC))
