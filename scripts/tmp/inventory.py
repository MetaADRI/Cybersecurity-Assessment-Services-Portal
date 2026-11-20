import re, pathlib, collections
root = pathlib.Path('.')
files = [p for p in list(root.glob('client/src/**/*.ts*')) + list(root.glob('server/src/**/*.ts')) + list(root.glob('shared/*.ts'))]
tok_re = re.compile(r'(?<![\w-])((?:[a-z]+:)*(?:bg|text|border|from|via|to|ring|divide|fill|stroke|shadow|outline|decoration|placeholder|accent|caret|prose)-(?:slate|navy|teal|emerald|green|sky|amber|orange|red|rose|violet|purple|indigo|cyan|blue|white|black|current)(?:-\d{2,3})?(?:/\d{1,3})?)(?![\w-])')
counts = collections.Counter()
perfile = collections.defaultdict(collections.Counter)
for p in files:
    txt = p.read_text(encoding='utf-8')
    for m in tok_re.finditer(txt):
        counts[m.group(1)] += 1
        perfile[str(p)][m.group(1)] += 1
print('=== UNIQUE TOKENS', len(counts))
for t,c in counts.most_common():
    print(f'{c:5} {t}')
