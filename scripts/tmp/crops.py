from PIL import Image
im = Image.open('OD.png').convert('RGB')
im.crop((0,0,620,558)).resize((930,837)).save('scripts/tmp/shield.png')
im.crop((600,120,1920,330)).save('scripts/tmp/wordmark.png')
im.crop((600,300,1920,558)).save('scripts/tmp/tagline.png')
print('ok')
