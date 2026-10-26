# 사용: python scripts/sheet.py shots/<label> [out.png]  — 폴더 안 png 를 3열 시트로(라벨 포함)
import sys, os
from PIL import Image, ImageDraw, ImageFont
d = sys.argv[1]
out = sys.argv[2] if len(sys.argv) > 2 else os.path.join(d, '_sheet.jpg')
order = ['ac-day','close-day','river-day','beach-day','low-day','wide-day','ac-morning','ac-sunset','ac-night']
files = [f for f in os.listdir(d) if f.endswith('.png') and not f.startswith('_')]
files.sort(key=lambda f: order.index(f[:-4]) if f[:-4] in order else 99)
W = 640; cols = 3
ims = []
for f in files:
    im = Image.open(os.path.join(d, f)).convert('RGB')
    im = im.resize((W, int(im.height * W / im.width)), Image.LANCZOS)
    ImageDraw.Draw(im).text((8, 6), f[:-4], fill=(255, 255, 255), stroke_width=2, stroke_fill=(0, 0, 0))
    ims.append(im)
H = ims[0].height
rows = (len(ims) + cols - 1) // cols
sheet = Image.new('RGB', (W * cols, H * rows), (20, 20, 20))
for i, im in enumerate(ims):
    sheet.paste(im, ((i % cols) * W, (i // cols) * H))
sheet.save(out, quality=88)
print(out)
