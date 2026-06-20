#!/usr/bin/env python3
# 生成《重力翻转者》转发卡片配图 share.png（5:4，500x400）
# 霓虹风：发光青方块(带上下箭头) + 拖尾 + 上下两根粉色障碍 + 星空。纯标准库。
import math, zlib, struct, os

SS = 2
OW, OH = 500, 400
W, H = OW * SS, OH * SS

def mix(c1, c2, t): return tuple(c1[i] + (c2[i] - c1[i]) * t for i in range(3))
def add(c, g, t): return tuple(c[i] + (g[i] - c[i]) * t for i in range(3))

BG_TOP, BG_MID, BG_BOT = (10, 10, 31), (18, 14, 42), (12, 10, 28)
CY_LT, CY, CY_GLOW = (170, 255, 247), (61, 240, 224), (54, 240, 224)
PK_LT, PK, PK_GLOW = (255, 143, 192), (255, 61, 139), (255, 61, 139)
ARROW = (8, 13, 28)

# 确定性"星空"（不用随机，避免环境限制）
stars = []
sx, sy = 12345, 67890
for i in range(70):
    sx = (1103515245 * sx + 12345) & 0x7fffffff
    sy = (1103515245 * sy + 54321) & 0x7fffffff
    stars.append((sx % W, sy % H, (sx % 5) * 0.3 * SS + 0.4 * SS, 0.15 + (sy % 40) / 100))

def rr_sdf(px, py, cx, cy, hw, hh, r):
    qx = abs(px - cx) - hw + r
    qy = abs(py - cy) - hh + r
    return math.hypot(max(qx, 0), max(qy, 0)) + min(max(qx, qy), 0) - r

def seg_dist(px, py, x1, y1, x2, y2):
    vx, vy = x2 - x1, y2 - y1
    c2 = vx * vx + vy * vy
    t = 0 if c2 == 0 else max(0, min(1, ((px - x1) * vx + (py - y1) * vy) / c2))
    return math.hypot(px - (x1 + t * vx), py - (y1 + t * vy))

# 主角方块
PX, PY, PH = 0.30 * W, 0.50 * H, 0.135 * H
PR = 0.28 * PH
glowR = 0.10 * H
# 箭头
L, hw_a, hh_a, ht = 0.075 * H, 0.040 * H, 0.042 * H, 0.014 * H
segs = [
    (PX, PY - L, PX, PY + L),
    (PX, PY - L, PX - hw_a, PY - L + hh_a), (PX, PY - L, PX + hw_a, PY - L + hh_a),
    (PX, PY + L, PX - hw_a, PY + L - hh_a), (PX, PY + L, PX + hw_a, PY + L - hh_a),
]
# 拖尾（主角左侧，渐隐）
trail = [(PX - 0.13 * W, PY, PH * 0.78, 0.32), (PX - 0.23 * W, PY, PH * 0.58, 0.16)]
# 障碍：上垂下、下顶上
obs = [
    dict(cx=0.64 * W, cy=0.135 * H, hw=0.038 * W, hh=0.135 * H, r=0.02 * W, top=True),
    dict(cx=0.80 * W, cy=0.84 * H,  hw=0.038 * W, hh=0.16 * H,  r=0.02 * W, top=False),
]

def obs_fill(o, py):
    t = (py - (o['cy'] - o['hh'])) / (2 * o['hh'])
    t = max(0, min(1, t))
    return mix(PK_LT, PK, t) if o['top'] else mix(PK, PK_LT, t)

hi = bytearray(W * H * 3)
for y in range(H):
    ty = y / (H - 1)
    bg = mix(BG_TOP, BG_MID, ty / 0.55) if ty < 0.55 else mix(BG_MID, BG_BOT, (ty - 0.55) / 0.45)
    for x in range(W):
        col = bg
        # 星
        for s in stars:
            if (x - s[0]) ** 2 + (y - s[1]) ** 2 < s[2] ** 2:
                col = add(col, (170, 180, 255), s[3]); break
        # 发光层（叠加）
        for o in obs:
            d = rr_sdf(x, y, o['cx'], o['cy'], o['hw'], o['hh'], o['r'])
            if 0 < d < glowR:
                col = add(col, PK_GLOW, (1 - d / glowR) ** 2 * 0.75)
        dp = rr_sdf(x, y, PX, PY, PH, PH, PR)
        if 0 < dp < glowR * 1.4:
            col = add(col, CY_GLOW, (1 - dp / (glowR * 1.4)) ** 2 * 0.85)
        # 填充层（覆盖，按从后到前）
        for o in obs:
            if rr_sdf(x, y, o['cx'], o['cy'], o['hw'], o['hh'], o['r']) < 0:
                col = obs_fill(o, y)
        for tr in trail:
            if rr_sdf(x, y, tr[0], tr[1], tr[2], tr[2], tr[2] * 0.28) < 0:
                col = add(col, CY, tr[3])
        if dp < 0:
            ty2 = max(0, min(1, (y - (PY - PH)) / (2 * PH)))
            c = mix(CY_LT, CY, ty2)
            if (PY - PH + 0.10 * H) < y < (PY - PH + 0.16 * H) and abs(x - PX) < PH - 0.08 * H:
                c = mix(c, (255, 255, 255), 0.30)
            if min(seg_dist(x, y, *s) for s in segs) < ht:
                c = ARROW
            col = c
        i = (y * W + x) * 3
        hi[i], hi[i + 1], hi[i + 2] = int(col[0]), int(col[1]), int(col[2])

# 降采样
out = bytearray(OW * OH * 3)
n = SS * SS
for oy in range(OH):
    for ox in range(OW):
        r = g = b = 0
        for dy in range(SS):
            base = ((oy * SS + dy) * W + ox * SS) * 3
            for dx in range(SS):
                j = base + dx * 3
                r += hi[j]; g += hi[j + 1]; b += hi[j + 2]
        o = (oy * OW + ox) * 3
        out[o], out[o + 1], out[o + 2] = r // n, g // n, b // n

def chunk(tag, data):
    return struct.pack(">I", len(data)) + tag + data + struct.pack(">I", zlib.crc32(tag + data) & 0xffffffff)

raw = bytearray()
for y in range(OH):
    raw.append(0); raw += out[y * OW * 3:(y + 1) * OW * 3]
png = (b"\x89PNG\r\n\x1a\n" +
       chunk(b"IHDR", struct.pack(">IIBBBBB", OW, OH, 8, 2, 0, 0, 0)) +
       chunk(b"IDAT", zlib.compress(bytes(raw), 9)) + chunk(b"IEND", b""))
path = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "share.png"))
with open(path, "wb") as f:
    f.write(png)
print("written:", path, len(png), "bytes")
