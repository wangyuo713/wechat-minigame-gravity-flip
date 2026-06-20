#!/usr/bin/env python3
# 生成《重力翻转者》小程序头像：霓虹青发光方块 + 上下双向箭头（重力翻转）
# 纯标准库（zlib/struct），4x 超采样后缩放到 144x144 抗锯齿，输出 PNG。
import math, zlib, struct, os

SS = 4            # 超采样倍数
OUT = 144         # 最终尺寸
S = OUT * SS      # 渲染尺寸 = 576

def lerp(a, b, t): return a + (b - a) * t
def mix(c1, c2, t): return tuple(lerp(c1[i], c2[i], t) for i in range(3))

BG_TOP = (10, 10, 31)     # #0a0a1f
BG_MID = (18, 14, 42)     # #120e2a
BG_BOT = (12, 10, 28)     # #0c0a1c
CY_LT  = (170, 255, 247)  # #aafff7
CY     = (61, 240, 224)   # #3df0e0
GLOW   = (54, 240, 224)
ARROW  = (8, 13, 28)
HILITE = (255, 255, 255)

cx = cy = S / 2
half = 0.30 * S           # 方块半边长
rad  = 0.28 * half        # 圆角半径
glowR = 0.13 * S          # 外发光范围

# 箭头几何
L  = 0.165 * S            # 箭杆半高
hw = 0.085 * S            # 箭头宽
hh = 0.090 * S            # 箭头高
ht = 0.030 * S            # 线半粗
segs = [
    (cx, cy - L, cx, cy + L),                  # 竖杆
    (cx, cy - L, cx - hw, cy - L + hh),        # 上箭头左
    (cx, cy - L, cx + hw, cy - L + hh),        # 上箭头右
    (cx, cy + L, cx - hw, cy + L - hh),        # 下箭头左
    (cx, cy + L, cx + hw, cy + L - hh),        # 下箭头右
]

def rr_sdf(px, py):
    qx = abs(px - cx) - half + rad
    qy = abs(py - cy) - half + rad
    outside = math.hypot(max(qx, 0), max(qy, 0))
    inside = min(max(qx, qy), 0)
    return outside + inside - rad

def seg_dist(px, py, x1, y1, x2, y2):
    vx, vy = x2 - x1, y2 - y1
    c2 = vx * vx + vy * vy
    t = 0 if c2 == 0 else max(0, min(1, ((px - x1) * vx + (py - y1) * vy) / c2))
    return math.hypot(px - (x1 + t * vx), py - (y1 + t * vy))

def arrow_dist(px, py):
    return min(seg_dist(px, py, *s) for s in segs)

# 渲染高分辨率缓冲（RGB）
hi = bytearray(S * S * 3)
for y in range(S):
    ty = y / (S - 1)
    if ty < 0.55:
        bg = mix(BG_TOP, BG_MID, ty / 0.55)
    else:
        bg = mix(BG_MID, BG_BOT, (ty - 0.55) / 0.45)
    for x in range(S):
        r, g, b = bg
        sdf = rr_sdf(x, y)
        if sdf < 0:
            # 方块内：青色竖向渐变
            ty2 = (y - (cy - half)) / (2 * half)
            ty2 = max(0, min(1, ty2))
            col = mix(CY_LT, CY, ty2)
            # 顶部高光条
            if (cy - half + 0.10 * S) < y < (cy - half + 0.17 * S) and abs(x - cx) < half - 0.10 * S:
                col = mix(col, HILITE, 0.30)
            # 箭头
            ad = arrow_dist(x, y)
            if ad < ht:
                col = ARROW
            r, g, b = col
        elif sdf < glowR:
            # 外发光叠加
            inten = (1 - sdf / glowR) ** 2 * 0.85
            r = r + (GLOW[0] - r) * inten
            g = g + (GLOW[1] - g) * inten
            b = b + (GLOW[2] - b) * inten
        i = (y * S + x) * 3
        hi[i] = int(r); hi[i + 1] = int(g); hi[i + 2] = int(b)

# 盒式降采样 SS×SS -> OUT
out = bytearray(OUT * OUT * 3)
n = SS * SS
for oy in range(OUT):
    for ox in range(OUT):
        rs = gs = bs = 0
        for dy in range(SS):
            base = ((oy * SS + dy) * S + ox * SS) * 3
            for dx in range(SS):
                j = base + dx * 3
                rs += hi[j]; gs += hi[j + 1]; bs += hi[j + 2]
        o = (oy * OUT + ox) * 3
        out[o] = rs // n; out[o + 1] = gs // n; out[o + 2] = bs // n

# 编码 PNG
def chunk(tag, data):
    return (struct.pack(">I", len(data)) + tag + data +
            struct.pack(">I", zlib.crc32(tag + data) & 0xffffffff))

raw = bytearray()
for y in range(OUT):
    raw.append(0)  # filter: none
    raw += out[y * OUT * 3:(y + 1) * OUT * 3]

png = (b"\x89PNG\r\n\x1a\n" +
       chunk(b"IHDR", struct.pack(">IIBBBBB", OUT, OUT, 8, 2, 0, 0, 0)) +
       chunk(b"IDAT", zlib.compress(bytes(raw), 9)) +
       chunk(b"IEND", b""))

path = os.path.join(os.path.dirname(__file__), "..", "icon-144.png")
path = os.path.abspath(path)
with open(path, "wb") as f:
    f.write(png)
print("written:", path, len(png), "bytes")
