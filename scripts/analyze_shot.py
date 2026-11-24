from PIL import Image
im = Image.open('shot2.png').convert('RGB')
w, h = im.size
cols = im.getcolors(maxcolors=2000000)
print('size', w, h, 'unique_colors', len(cols) if cols else '>2M')
print('top8', sorted(cols, reverse=True)[:8] if cols else 'many')
px = im.load()
greens = sum(1 for y in range(0, h, 3) for x in range(0, w, 3) if (lambda c: c[1] > c[0] and c[1] > c[2] and c[1] > 50)(px[x, y]))
cyans = sum(1 for y in range(0, h, 3) for x in range(0, w, 3) if (lambda c: c[2] > 120 and c[1] > 120 and c[0] < 120)(px[x, y]))
print('greenish_sampled', greens, 'cyanish_sampled', cyans)