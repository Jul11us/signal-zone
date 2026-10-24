"""Render the SIGNAL//ZONE repository cover. Requires Pillow and Windows fonts."""

from pathlib import Path
from math import atan2, cos, sin, pi

from PIL import Image, ImageDraw, ImageFont


ROOT = Path(__file__).resolve().parents[1]
OUTPUT = ROOT / "docs" / "readme" / "cover.png"
S = 2
W, H = 1800, 800
NAVY = "#0f1923"
PAPER = "#ece8e1"
RED = "#ff4655"
MUTED = "#91a0ab"
GRID = "#1b2a36"
FONT_DIR = Path("C:/Windows/Fonts")


def font(size, *, chinese=False, weight=500, width=100):
    face = "msyhbd.ttc" if chinese else "bahnschrift.ttf"
    result = ImageFont.truetype(str(FONT_DIR / face), round(size * S))
    if not chinese:
        result.set_variation_by_axes([weight, width])
    return result


im = Image.new("RGB", (W * S, H * S), NAVY)
d = ImageDraw.Draw(im)


def line(points, fill, width=1):
    d.line([(round(x * S), round(y * S)) for x, y in points], fill=fill, width=round(width * S))


def ellipse(box, fill=None, outline=None, width=1):
    d.ellipse(tuple(round(n * S) for n in box), fill=fill, outline=outline, width=round(width * S))


def text(x, y, value, size=24, fill=PAPER, **kwargs):
    face = font(size, **kwargs)
    d.text((round(x * S), round(y * S)), value, font=face, fill=fill, anchor="lt")
    return d.textlength(value, font=face) / S


def dashed_circle(cx, cy, radius, color, width=1, dash=6, gap=5):
    for start in range(0, 360, dash + gap):
        d.arc(tuple(round(n * S) for n in (cx - radius, cy - radius, cx + radius, cy + radius)),
              start=start, end=start + dash, fill=color, width=round(width * S))


def marker(x, y, number, color=PAPER):
    ellipse((x - 15, y - 15, x + 15, y + 15), fill=NAVY, outline=color, width=2)
    face = font(16, weight=700)
    d.text((x * S, y * S), str(number), font=face, fill=color, anchor="mm")


# The schematic is deliberately abstract: no implied live match or game forecast.
for x in range(970, 1741, 52):
    line([(x, 148), (x, 602)], GRID)
for y in range(148, 603, 52):
    line([(970, y), (1740, y)], GRID)

# Fine topographic contours, confined to the right-hand plate.
for contour in range(7):
    coords = []
    for degree in range(0, 361, 2):
        theta = degree * pi / 180
        radius = 96 + contour * 28 + 15 * sin(theta * 3 + 0.3) + 9 * cos(theta * 5)
        coords.append((1370 + cos(theta) * radius * 1.09, 370 + sin(theta) * radius * 0.72))
    line(coords, "#24343f", 1)

# Frame and publishing furniture.
line([(76, 65), (1724, 65)], "#3c4a54")
line([(76, 65), (204, 65)], RED, 4)
text(76, 87, "SIGNAL//ZONE", 21, weight=700)
text(260, 88, "TACTICAL FIELD NOTES", 19, fill=MUTED, width=90)
text(1402, 87, "ERANGEL / MIRAMAR / RONDO", 18, fill=MUTED, width=85)

# Identity and large condensed masthead.
text(76, 170, "信号圈", 57, chinese=True)
text(272, 199, "和平精英 · 战术地图情报", 22, chinese=True, fill=MUTED)
title_x = 69
title_x += text(title_x, 272, "SIGNAL", 162, weight=700, width=75)
title_x += text(title_x + 1, 272, "//", 162, fill=RED, weight=700, width=75) + 1
text(title_x, 272, "ZONE", 162, weight=700, width=75)
text(77, 473, "READ THE MAP.", 43, weight=600, width=90)
text(77, 525, "PLAN THE NEXT MOVE.", 43, fill=MUTED, weight=500, width=90)
line([(79, 604), (113, 604)], RED, 3)
text(128, 595, "MAP INTELLIGENCE / MATCH PLANNING / TEAM BRIEFING", 19, fill=MUTED, width=90)

# A precise, restrained tactical plate.
cx, cy = 1350, 365
ellipse((cx - 235, cy - 235, cx + 235, cy + 235), outline="#65727b", width=1.6)
dashed_circle(cx, cy, 221, "#3b4b57", width=1, dash=2, gap=5)
ellipse((1269, 252, 1549, 532), fill=None, outline=RED, width=3)
dashed_circle(1393, 400, 66, PAPER, width=2, dash=7, gap=5)
ellipse((1385, 392, 1401, 408), fill=RED)
line([(1306, 400), (1369, 400)], "#70838f")
line([(1417, 400), (1480, 400)], "#70838f")
line([(1393, 313), (1393, 376)], "#70838f")
line([(1393, 424), (1393, 487)], "#70838f")

# Flight path and discrete position marks.
start, end = (1036, 555), (1615, 184)
dx, dy = end[0] - start[0], end[1] - start[1]
for part in range(31):
    a, b = part / 31, min(1, (part + 0.53) / 31)
    line([(start[0] + dx * a, start[1] + dy * a), (start[0] + dx * b, start[1] + dy * b)], PAPER, 1.5)
angle = atan2(dy, dx)
arrow = [end, (end[0] - 20 * cos(angle - 0.38), end[1] - 20 * sin(angle - 0.38)),
         (end[0] - 12 * cos(angle), end[1] - 12 * sin(angle)),
         (end[0] - 20 * cos(angle + 0.38), end[1] - 20 * sin(angle + 0.38))]
d.polygon([(round(x * S), round(y * S)) for x, y in arrow], fill=PAPER)
marker(1217, 439, "1")
marker(1446, 292, "2", RED)
text(1517, 421, "NEXT POSITION", 16, fill=RED, width=85, weight=600)
text(1517, 446, "053 / 041", 15, fill=MUTED)
text(1088, 153, "N", 17, fill=MUTED, weight=700)
line([(1094, 182), (1094, 162)], MUTED)
text(1041, 581, "FLIGHT PATH", 15, fill=MUTED, width=85)
line([(1636, 581), (1710, 581)], PAPER, 2)
line([(1636, 577), (1636, 585)], PAPER)
line([(1710, 577), (1710, 585)], PAPER)
text(1651, 593, "1 KM", 14, fill=MUTED)

# Four quiet counters, set on one baseline.
line([(76, 650), (1724, 650)], "#3c4a54")
for x, number, label in [(77, "03", "MAPS"), (441, "120", "LOCATIONS"),
                         (843, "106", "TERRAIN MARKERS"), (1327, "56", "VEHICLE MARKERS")]:
    measured = text(x, 687, number, 55, weight=700, width=85)
    text(x + measured + 20, 713, label, 19, fill=MUTED, width=85)
text(77, 766, "FAN-MADE / UNOFFICIAL", 13, fill="#667783", width=90)
text(1536, 766, "SCHEMATIC COVER ART", 13, fill="#667783", width=85)

OUTPUT.parent.mkdir(parents=True, exist_ok=True)
im = im.resize((W, H), Image.Resampling.LANCZOS)
im.save(OUTPUT, optimize=True)
print(OUTPUT)
