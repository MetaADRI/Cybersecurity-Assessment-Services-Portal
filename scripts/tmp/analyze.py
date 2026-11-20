from PIL import Image
from collections import Counter
im = Image.open('OD.png').convert('RGBA')
w,h = im.size
px = im.load()

# non-white bbox
def is_ink(p, thr=245):
    r,g,b,a=p
    return a>40 and not (r>thr and g>thr and b>thr)
xs=[];ys=[]
for y in range(h):
    for x in range(w):
        if is_ink(px[x,y]):
            xs.append(x);ys.append(y)
print('ink bbox', min(xs),min(ys),max(xs),max(ys), 'w',max(xs)-min(xs)+1,'h',max(ys)-min(ys)+1)

# blue mask bbox
xs=[];ys=[]
blues=Counter()
for y in range(h):
    for x in range(w):
        r,g,b,a=px[x,y]
        if b>120 and b-r>60 and b>g+40:
            xs.append(x);ys.append(y);blues[(r,g,b)]+=1
print('blue bbox', min(xs),min(ys),max(xs),max(ys),'w',max(xs)-min(xs)+1,'h',max(ys)-min(ys)+1)
print('blue common', [( '#%02X%02X%02X'%c,n) for c,n in blues.most_common(6)])

# wordmark bbox: dark pixels right of shield
xs=[];ys=[];darks=Counter()
for y in range(h):
    for x in range(w):
        r,g,b,a=px[x,y]
        if r<100 and g<100 and b<100 and a>40:
            xs.append(x);ys.append(y);darks[(r,g,b)]+=1
print('dark bbox', min(xs),min(ys),max(xs),max(ys))
print('dark common', [( '#%02X%02X%02X'%c,n) for c,n in darks.most_common(8)])

# column profile: where does blue end / text start
cols=[]
for x in range(w):
    cnt=0
    for y in range(h):
        r,g,b,a=px[x,y]
        if a>40 and not(r>245 and g>245 and b>245): cnt+=1
    cols.append(cnt)
# print gaps
runs=[]
inrun=False
for x,c in enumerate(cols):
    if c>0 and not inrun: start=x; inrun=True
    elif c==0 and inrun: runs.append((start,x-1)); inrun=False
if inrun: runs.append((start,w-1))
print('x runs', runs)
# rows
rows=[]
for y in range(h):
    cnt=0
    for x in range(w):
        r,g,b,a=px[x,y]
        if a>40 and not(r>245 and g>245 and b>245): cnt+=1
    rows.append(cnt)
rruns=[]
inrun=False
for y,c in enumerate(rows):
    if c>0 and not inrun: start=y; inrun=True
    elif c==0 and inrun: rruns.append((start,y-1)); inrun=False
if inrun: rruns.append((start,h-1))
print('y runs', rruns)
