import os
from PIL import Image, ImageDraw

SRC = r'D:\MuMuSetup\pwtest\icon_src2.png'
RES = r'D:\MuMuSetup\ss_and\android\app\src\main\res'

im = Image.open(SRC).convert('RGB')
px = im.load()
W, H = im.size

minx, miny, maxx, maxy = W, H, 0, 0
for y in range(0, H, 2):
    for x in range(0, W, 2):
        r, g, b = px[x, y]
        if r > 60 and (r - b) > 50:
            minx = min(minx, x)
            miny = min(miny, y)
            maxx = max(maxx, x)
            maxy = max(maxy, y)
print('bbox', minx, miny, maxx, maxy)

pad = 8
box = (max(0, minx - pad), max(0, miny - pad), min(W, maxx + pad + 1), min(H, maxy + pad + 1))
icon = im.crop(box)
w, h = icon.size
side = max(w, h)
sq = Image.new('RGB', (side, side), (0, 0, 0))
sq.paste(icon, ((side - w) // 2, (side - h) // 2))
master = sq.resize((1024, 1024), Image.LANCZOS)
# 清掉截图里的灰色圆环残留
mpx = master.load()
for yy in range(1024):
    for xx in range(1024):
        rr, gg, bb = mpx[xx, yy]
        if max(rr, gg, bb) < 95:
            mpx[xx, yy] = (0, 0, 0)
master.save(r'D:\MuMuSetup\pwtest\icon_master2.png')
print('master', master.size, 'cropped', icon.size)


def save_dirs(name, sizes):
    for dpi, size in sizes.items():
        d = os.path.join(RES, 'mipmap-' + dpi)
        os.makedirs(d, exist_ok=True)
        master.resize((size, size), Image.LANCZOS).save(os.path.join(d, name))
        print('wrote', dpi, name, size)


LEGACY = {'mdpi': 48, 'hdpi': 72, 'xhdpi': 96, 'xxhdpi': 144, 'xxxhdpi': 192}
FG = {'mdpi': 108, 'hdpi': 162, 'xhdpi': 216, 'xxhdpi': 324, 'xxxhdpi': 432}

save_dirs('ic_launcher.png', LEGACY)

for dpi, size in LEGACY.items():
    d = os.path.join(RES, 'mipmap-' + dpi)
    rounded = master.resize((size * 4, size * 4), Image.LANCZOS).convert('RGBA')
    mask = Image.new('L', (size * 4, size * 4), 0)
    ImageDraw.Draw(mask).ellipse((0, 0, size * 4 - 1, size * 4 - 1), fill=255)
    rounded.putalpha(mask)
    rounded.resize((size, size), Image.LANCZOS).save(os.path.join(d, 'ic_launcher_round.png'))

for dpi, size in FG.items():
    canvas = Image.new('RGBA', (size, size), (0, 0, 0, 0))
    inner = int(size * 0.62)
    art = master.resize((inner, inner), Image.LANCZOS).convert('RGBA')
    canvas.paste(art, ((size - inner) // 2, (size - inner) // 2))
    d = os.path.join(RES, 'mipmap-' + dpi)
    os.makedirs(d, exist_ok=True)
    canvas.save(os.path.join(d, 'ic_launcher_foreground.png'))

bg = os.path.join(RES, 'values', 'ic_launcher_background.xml')
with open(bg, 'w', encoding='utf-8', newline='\n') as f:
    f.write('<?xml version="1.0" encoding="utf-8"?>\n<resources>\n    <color name="ic_launcher_background">#000000</color>\n</resources>\n')
print('bg color set')
