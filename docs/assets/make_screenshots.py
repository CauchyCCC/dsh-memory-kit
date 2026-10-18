from PIL import Image, ImageDraw, ImageFont
import os

FONT = "C:/Windows/Fonts/msyh.ttc"
if not os.path.exists(FONT):
    FONT = "C:/Windows/Fonts/simhei.ttf"

BG = (30, 30, 30)
BAR = (45, 45, 45)
TEXT = (210, 210, 210)
DIM = (150, 150, 150)
CMD = (235, 235, 235)
ACCENT = (255, 210, 100)
LINK = (130, 200, 255)
GREEN = (120, 210, 140)

def render(path, title, lines):
    line_h = 34
    W = 1200
    H = 60 + line_h * len(lines) + 40
    img = Image.new("RGB", (W, H), BG)
    d = ImageDraw.Draw(img)
    d.rectangle([0, 0, W, 50], fill=BAR)
    for i, c in enumerate([(255, 95, 86), (255, 189, 46), (39, 201, 63)]):
        d.ellipse([16 + i * 22, 18, 28 + i * 22, 30], fill=c)
    d.text((100, 13), title, font=ImageFont.truetype(FONT, 20), fill=DIM)
    y = 70
    for text, color in lines:
        d.text((30, y), text, font=ImageFont.truetype(FONT, 20), fill=color)
        y += line_h
    img.save(path, "PNG")
    print("wrote", path, img.size)

recall = [
    ('$ node tools/recall-query.mjs "memory bank" --limit 3', CMD),
    ('query: memory bank   (match: "memory" AND "bank")   hits: 3', LINK),
    ('', TEXT),
    ('[1] 2026-09-14 10:22:31  session-1a2b3c4d#128  user', ACCENT),
    ('    We should keep an active-context file per project...', TEXT),
    ('', TEXT),
    ('[2] 2026-09-15 09:03:12  session-5e6f7a8b#64  assistant', ACCENT),
    ('    The project brief says the API must stay read-only...', TEXT),
    ('', TEXT),
    ('[3] 2026-09-18 16:40:55  session-9c0d1e2f#201  tool-result', ACCENT),
    ('    memory-bank/activeContext.md updated', TEXT),
]
render("D:/DSH/Workspace/dsh-memory-kit/docs/assets/recall.png",
       "dsh-memory-kit  -  verbatim recall (example output)", recall)

topics = [
    ('$ node tools/topics.mjs top --limit 8', CMD),
    ('', TEXT),
    (' 1. memory-bank          score= 1010   hits= 20', GREEN),
    (' 2. recall-index         score= 1009   hits= 20', GREEN),
    (' 3. compaction           score= 1008   hits= 20', GREEN),
    (' 4. audit-timeline       score= 1007   hits= 20', GREEN),
    (' 5. hot-topics           score= 1006   hits= 20', GREEN),
    (' 6. dream                score= 1005   hits= 20', GREEN),
    (' 7. sqlite-fts5          score= 1004   hits= 20', GREEN),
    (' 8. agent-memory         score= 1003   hits= 20', GREEN),
    ('', TEXT),
    ('$ node tools/check-size.mjs', CMD),
    ('memory dir size: 12.34 MB  (warn 1024 MB, critical 5120 MB)', TEXT),
    ('[OK] well under the configured budget', GREEN),
]
render("D:/DSH/Workspace/dsh-memory-kit/docs/assets/topics.png",
       "dsh-memory-kit  -  hot topics + size guard (example output)", topics)
