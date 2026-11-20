from PIL import Image
from collections import Counter
im = Image.open('OD.png').convert('RGBA')
w,h = im.size
print('size', w, h, im.mode)
px = im.load()
corners = [(0,0),(w-1,0),(0,h-1),(w-1,h-1),(5,5),(w//2,5)]
print('corners', [px[c] for c in corners])
c = Counter()
for y in range(0,h,2):
    for x in range(0,w,2):
        r,g,b,a = px[x,y]
        if a < 200: continue
        c[(r,g,b)] += 1
print('top 25')
for col,n in c.most_common(25):
    print('#%02X%02X%02X' % col, n)
