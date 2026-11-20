from PIL import Image
OUT='client/public/brand/'
def composite(path, bg):
    img=Image.open(OUT+path)
    canvas=Image.new('RGBA', img.size, bg+(255,))
    canvas.alpha_composite(img)
    return canvas.convert('RGB')

rows=[]
for name,bg in [('logo-full.png',(0xF4,0xF8,0xFF)),('logo-full-dark.png',(0x08,0x15,0x30)),('logo-full-reversed.png',(0x03,0x72,0xE5)),('logo-full.png',(0x08,0x15,0x30))]:
    im=composite(name,bg); im=im.resize((1000, round(im.height*1000/im.width)))
    rows.append(im)
W=1000; H=sum(r.height for r in rows)
out=Image.new('RGB',(W,H),(255,255,255)); y=0
for r in rows: out.paste(r,(0,y)); y+=r.height
out.save('scripts/tmp/preview-all.png'); print(out.size)

# mark variants side by side
marks=[]
for name,bg in [('logo-mark.png',(0xF4,0xF8,0xFF)),('logo-mark-dark.png',(0x08,0x15,0x30)),('logo-mark-reversed.png',(0x03,0x72,0xE5))]:
    im=composite(name,bg).resize((300,300)); marks.append(im)
row=Image.new('RGB',(900,300),(255,255,255))
for i,m in enumerate(marks): row.paste(m,(i*300,0))
row.save('scripts/tmp/preview-marks.png')

# zoomed edge check of wordmark on navy
im=composite('logo-full-dark.png',(0x08,0x15,0x30)).crop((900,0,1200,200)).resize((900,600),Image.NEAREST)
im.save('scripts/tmp/preview-edge.png')
