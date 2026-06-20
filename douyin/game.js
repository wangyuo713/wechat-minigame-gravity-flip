// ============================================================
// 《重力翻转者》 — 小游戏（微信 / 抖音通用）
// 玩法：方块自动奔跑，点击屏幕翻转重力，躲开上下两侧的障碍。
// 模式：无尽模式（挑战最高分） / 闯关模式（逐关通关，难度递进）
//
// 平台适配：同一份代码在抖音(tt)、微信(wx)两端都能跑。
// ============================================================

// ---------- 平台适配：抖音(tt) / 微信(wx) 通用 ----------
const platform = (typeof tt !== 'undefined')
  ? tt
  : (typeof wx !== 'undefined' ? wx : {})

const sys = platform.getSystemInfoSync()
const W = sys.windowWidth
const H = sys.windowHeight
const dpr = sys.pixelRatio || 1

// 主屏画布（高清适配）
const canvas = platform.createCanvas()
canvas.width = W * dpr
canvas.height = H * dpr
const ctx = canvas.getContext('2d')
ctx.scale(dpr, dpr)

// 安全区（避开刘海/底部）
const safe = sys.safeArea || { top: 0, bottom: H }
const SAFE_TOP = safe.top || 0
const PLAY_TOP = SAFE_TOP + 28
const PLAY_BOTTOM = H - 44

// ---------- 配色（霓虹风）----------
const C = {
  player: '#3df0e0',
  playerLight: '#aafff7',
  playerGlow: 'rgba(54,240,224,0.85)',
  obstacle: '#ff3d8b',
  obstacleLight: '#ff8fc0',
  obstacleGlow: 'rgba(255,61,139,0.7)',
  gold: '#ffd76a',
  text: '#eaf0ff',
  sub: '#8390c4',
  wall: 'rgba(120,140,255,0.9)',
}

// ---------- 工具：圆角矩形 ----------
function roundRect(x, y, w, h, r) {
  r = Math.min(r, w / 2, h / 2)
  ctx.beginPath()
  ctx.moveTo(x + r, y)
  ctx.arcTo(x + w, y, x + w, y + h, r)
  ctx.arcTo(x + w, y + h, x, y + h, r)
  ctx.arcTo(x, y + h, x, y, r)
  ctx.arcTo(x, y, x + w, y, r)
  ctx.closePath()
}

// ---------- 关卡配置（每关玩法不同，不只是数量变化）----------
// types: single=单障碍, moving=浮动障碍, pair=上下成对留缝穿过
// gravK: 重力倍率（<1 更飘，>1 更沉）
const LEVELS = [
  { name: '起步',   target: 6,  speed: 4.2, gapMin: 230, gapRand: 140, gravK: 1.00, types: ['single'],          color: '#ff3d8b', light: '#ff8fc0' },
  { name: '浮空',   target: 8,  speed: 4.4, gapMin: 230, gapRand: 130, gravK: 1.00, types: ['single', 'moving'], color: '#ff7a3d', light: '#ffb27a' },
  { name: '疾风',   target: 10, speed: 5.6, gapMin: 230, gapRand: 120, gravK: 1.10, types: ['single'],          color: '#ff4d4d', light: '#ff9b9b' },
  { name: '低重力', target: 10, speed: 4.6, gapMin: 240, gapRand: 130, gravK: 0.62, types: ['single', 'moving'], color: '#3dd0ff', light: '#9be6ff' },
  { name: '高重力', target: 11, speed: 5.0, gapMin: 240, gapRand: 120, gravK: 1.40, types: ['single', 'moving'], color: '#4d7bff', light: '#9bb4ff' },
  { name: '浮潮',   target: 12, speed: 5.2, gapMin: 240, gapRand: 110, gravK: 1.00, types: ['moving'],          color: '#3dffa0', light: '#a8ffd6' },
  { name: '乱流',   target: 12, speed: 5.9, gapMin: 240, gapRand: 110, gravK: 1.10, types: ['single', 'moving'], color: '#ff5de0', light: '#ffb0f1' },
  { name: '夹缝',   target: 8,  speed: 4.6, gapMin: 300, gapRand: 120, gravK: 1.00, types: ['pair'], pairGap: 200, color: '#ffd76a', light: '#fff0b8' },
]
const LEVEL_COUNT = LEVELS.length

// ---------- 游戏状态 ----------
let state = 'ready'   // ready | playing | over | cleared
let mode = 'endless'  // endless | level
let level = 1
let target = 0
let levelGapMin = 220
let levelGapRand = 140
let gravK = 1            // 当前重力倍率
let curTypes = null      // 当前关卡的障碍类型集合
let curLevelCfg = null   // 当前关卡配置

let frame = 0
let overFrame = 0
let shake = 0
let flash = 0

const GRAVITY = 0.85
const MAX_V = 17

const player = {
  size: 34,
  x: W * 0.28,
  y: PLAY_BOTTOM - 34,
  vy: 0,
  dir: 1, // 1 = 向下, -1 = 向上
}

let trail = []
let obstacles = []
let particles = []
let speed = 4.2
let distSinceSpawn = 0
let nextGap = 300
let score = 0
let canRevive = true // 本局是否还能「看广告复活」
let best = 0
let bestLevel = 0    // 已通关的最高关卡
try { best = platform.getStorageSync('flip_best') || 0 } catch (e) {}
try { bestLevel = platform.getStorageSync('flip_level') || 0 } catch (e) {}

// ---------- 视差星空 ----------
const stars = []
for (let i = 0; i < 60; i++) {
  stars.push({
    x: Math.random() * W,
    y: Math.random() * H,
    r: Math.random() * 1.6 + 0.4,
    sp: Math.random() * 0.6 + 0.2,
    a: Math.random() * 0.5 + 0.2,
  })
}

// ---------- 重置/开始 ----------
function resetGame() {
  player.y = PLAY_BOTTOM - player.size
  player.vy = 0
  player.dir = 1
  trail = []
  obstacles = []
  particles = []
  distSinceSpawn = 0
  nextGap = 260
  score = 0
  canRevive = true
  frame = 0
}

function startEndless() {
  resetGame()
  mode = 'endless'
  speed = 4.2
  target = 0
  gravK = 1
  curTypes = null
  curLevelCfg = null
  state = 'playing'
  hideBanner()
}

function startLevel(L) {
  L = Math.max(1, Math.min(LEVEL_COUNT, L))
  resetGame()
  mode = 'level'
  level = L
  const cfg = LEVELS[L - 1]
  curLevelCfg = cfg
  speed = cfg.speed
  target = cfg.target
  levelGapMin = cfg.gapMin
  levelGapRand = cfg.gapRand
  gravK = cfg.gravK
  curTypes = cfg.types
  state = 'playing'
  hideBanner()
}

function goHome() {
  resetGame() // 清空障碍/粒子，复位方块，标题页保持干净
  state = 'ready'
  showBanner()
}

function goLevels() {
  resetGame()
  state = 'levels'
  showBanner()
}

function flip() {
  player.dir *= -1
  if (platform.vibrateShort) platform.vibrateShort({ type: 'light' })
}

// ============================================================
// 广告：激励视频（看广告复活） + Banner（标题/结束/通关页底部）
// ⚠️ 上架后在对应平台「流量主 / 广告位管理」创建广告位，把 ID 填入下面。
//    留空时不会创建广告，开发者工具 / 真机预览仍可正常游玩。
// ============================================================
const AD_UNIT = {
  rewardedVideo: '', // 激励视频广告位 ID
  banner: '',        // Banner 广告位 ID
}

// ---- 激励视频 ----
let rewardedAd = null
if (platform.createRewardedVideoAd && AD_UNIT.rewardedVideo) {
  rewardedAd = platform.createRewardedVideoAd({ adUnitId: AD_UNIT.rewardedVideo })
  rewardedAd.onClose(res => {
    if (res && res.isEnded) doRevive() // 看完整支广告才复活
  })
  rewardedAd.onError(() => {})
}

function showReviveAd() {
  if (!rewardedAd) return
  rewardedAd.show().catch(() =>
    rewardedAd.load().then(() => rewardedAd.show()).catch(() => {})
  )
}

function doRevive() {
  // 清掉玩家前方的障碍，给重生留出安全空间
  obstacles = obstacles.filter(o => o.x > player.x + 220)
  player.y = (PLAY_TOP + PLAY_BOTTOM) / 2 - player.size / 2
  player.vy = 0
  player.dir = 1
  particles = []
  flash = 0
  shake = 0
  canRevive = false // 每局只能复活一次
  state = 'playing'
  hideBanner()
}

// ---- Banner ----
let bannerAd = null
if (platform.createBannerAd && AD_UNIT.banner) {
  bannerAd = platform.createBannerAd({
    adUnitId: AD_UNIT.banner,
    adIntervals: 30,
    style: { left: 0, top: 0, width: Math.min(W, 360) },
  })
  bannerAd.onResize(res => {
    bannerAd.style.left = (W - res.width) / 2
    bannerAd.style.top = H - res.height - 6
  })
  bannerAd.onError(() => {})
}
function showBanner() { if (bannerAd) bannerAd.show().catch(() => {}) }
function hideBanner() { if (bannerAd) bannerAd.hide().catch(() => {}) }
showBanner() // 启动即处于标题页，展示 Banner

// ---- 分享 ----
const SHARE_IMG = 'share.png'
function shareTitle() {
  if (mode === 'level') return `我在「重力翻转者」闯到第 ${level} 关，敢来挑战吗？`
  return score > 0
    ? `我在「重力翻转者」飞了 ${score} 分，敢来挑战吗？`
    : '点击翻转重力，躲开霓虹障碍，看你能飞多远！'
}
function doShare() {
  if (!platform.shareAppMessage) return
  platform.shareAppMessage({ title: shareTitle(), imageUrl: SHARE_IMG })
}
if (platform.onShareAppMessage) {
  platform.onShareAppMessage(() => ({ title: shareTitle(), imageUrl: SHARE_IMG }))
}
if (platform.showShareMenu) {
  try { platform.showShareMenu({ withShareTicket: false }) } catch (e) {}
}

// ---------- 按钮区域 ----------
// 标题页：模式选择
function modeButtons() {
  const w = 220, h = 56, gap = 16
  const y0 = H / 2 + 14
  return [
    { kind: 'endless', label: '无尽模式', x: (W - w) / 2, y: y0, w, h },
    { kind: 'level', label: '闯关模式', x: (W - w) / 2, y: y0 + h + gap, w, h },
  ]
}
// 结束页：看广告复活 / 分享
function overButtons() {
  const w = 220, h = 52, gap = 14
  const kinds = []
  if (canRevive && rewardedAd) kinds.push('revive')
  kinds.push('share')
  const y0 = H / 2 + 54
  return kinds.map((kind, i) => ({
    kind, x: (W - w) / 2, y: y0 + i * (h + gap), w, h,
  }))
}
// 通关页：下一关
function clearedButton() {
  const w = 220, h = 54
  return { x: (W - w) / 2, y: H / 2 + 40, w, h }
}
// 左上角「首页 / 返回」
function homeButton() {
  return { x: 14, y: SAFE_TOP + 10, w: 76, h: 36 }
}
// 关卡选择页：8 个关卡格子（2 列）
function levelCells() {
  const cols = 2
  const cw = Math.min(156, (W - 60) / 2)
  const ch = 80, gx = 20, gy = 16
  const x0 = (W - (cols * cw + gx)) / 2
  const y0 = H / 2 - 150
  const cells = []
  for (let i = 0; i < LEVEL_COUNT; i++) {
    const r = (i / cols) | 0, c = i % cols
    cells.push({ level: i + 1, x: x0 + c * (cw + gx), y: y0 + r * (ch + gy), w: cw, h: ch })
  }
  return cells
}
function inRect(r, x, y) {
  return x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h
}
function hitList(list, x, y) {
  for (const b of list) if (inRect(b, x, y)) return b.kind
  return null
}

// ---------- 输入 ----------
platform.onTouchStart((e) => {
  const t = (e && e.touches && e.touches[0]) || (e && e.changedTouches && e.changedTouches[0])
  const x = t ? t.clientX : 0
  const y = t ? t.clientY : 0

  if (state === 'ready') {
    const k = hitList(modeButtons(), x, y)
    if (k === 'endless') startEndless()
    else if (k === 'level') goLevels()
    return
  }
  if (state === 'levels') {
    if (inRect(homeButton(), x, y)) { goHome(); return }
    for (const cell of levelCells()) {
      if (inRect(cell, x, y) && cell.level <= bestLevel + 1) { startLevel(cell.level); return }
    }
    return
  }
  if (state === 'playing') { flip(); return }

  if (state === 'over' && frame - overFrame > 18) {
    if (inRect(homeButton(), x, y)) { mode === 'level' ? goLevels() : goHome(); return }
    const kind = hitList(overButtons(), x, y)
    if (kind === 'revive') showReviveAd()
    else if (kind === 'share') doShare()
    else if (mode === 'level') startLevel(level) // 重试本关
    else startEndless()
    return
  }

  if (state === 'cleared' && frame - overFrame > 12) {
    if (inRect(homeButton(), x, y)) { goLevels(); return }
    if (level < LEVEL_COUNT) startLevel(level + 1) // 下一关
    else goLevels()                                // 全部通关，回到选关
  }
})

// ---------- 障碍生成（按关卡类型：单障碍 / 浮动 / 上下夹缝）----------
function obColors() {
  if (mode === 'level' && curLevelCfg) return [curLevelCfg.color, curLevelCfg.light]
  return [C.obstacle, C.obstacleLight]
}

// 单障碍：贴地板或天花板
function spawnSingle() {
  const h = 50 + Math.random() * 80
  const w = 30 + Math.random() * 24
  const onFloor = Math.random() < 0.5
  obstacles.push({ x: W + w, w, h, y: onFloor ? PLAY_BOTTOM - h : PLAY_TOP, floor: onFloor, passed: false })
}

// 浮动障碍：在中间区域上下飘动
function spawnMoving() {
  const h = 46 + Math.random() * 54
  const w = 30 + Math.random() * 20
  const amp = 55 + Math.random() * 70
  const lo = PLAY_TOP + amp + 8
  const hi = PLAY_BOTTOM - h - amp - 8
  const baseY = lo + Math.random() * Math.max(8, hi - lo)
  obstacles.push({
    x: W + w, w, h, y: baseY, baseY, amp,
    phase: Math.random() * Math.PI * 2, sp: 0.04 + Math.random() * 0.03,
    moving: true, floor: false, passed: false,
  })
}

// 成对障碍：上下各一根，中间留缝，需从缝隙穿过（只计 1 分）
function spawnPair() {
  const w = 28 + Math.random() * 12 // 成对障碍更薄，缩短停留在危险区的时间
  const baseGap = (mode === 'level' && curLevelCfg && curLevelCfg.pairGap) || (player.size + 108)
  const gap = baseGap + Math.random() * 24 // 中间缝隙（可按关卡用 pairGap 调宽）
  const lo = PLAY_TOP + gap / 2 + 24
  const hi = PLAY_BOTTOM - gap / 2 - 24
  const cy = lo + Math.random() * Math.max(8, hi - lo)
  const botY = cy + gap / 2
  obstacles.push({ x: W + w, w, h: cy - gap / 2 - PLAY_TOP, y: PLAY_TOP, floor: false, passed: false })
  obstacles.push({ x: W + w, w, h: PLAY_BOTTOM - botY, y: botY, floor: true, passed: false, noScore: true })
}

function spawnObstacle() {
  const [col, light] = obColors()
  const types = (mode === 'level' && curTypes) ? curTypes : ['single']
  const type = types[(Math.random() * types.length) | 0]
  const start = obstacles.length
  if (type === 'pair') spawnPair()
  else if (type === 'moving') spawnMoving()
  else spawnSingle()
  for (let i = start; i < obstacles.length; i++) {
    obstacles[i].col = col
    obstacles[i].colLight = light
  }
}

// ---------- 特效 ----------
function explode(x, y, color) {
  for (let i = 0; i < 30; i++) {
    const a = Math.random() * Math.PI * 2
    const s = 2 + Math.random() * 7
    particles.push({
      x, y,
      vx: Math.cos(a) * s,
      vy: Math.sin(a) * s,
      life: 1,
      r: 1.5 + Math.random() * 2.5,
      color: color || C.player,
    })
  }
}

function gameOver() {
  explode(player.x + player.size / 2, player.y + player.size / 2, C.player)
  shake = 14
  flash = 0.8
  if (platform.vibrateShort) platform.vibrateShort({ type: 'heavy' })
  state = 'over'
  overFrame = frame
  showBanner()
  if (mode === 'endless' && score > best) {
    best = score
    try { platform.setStorageSync('flip_best', best) } catch (e) {}
  }
}

function levelClear() {
  // 通关庆祝粒子
  explode(player.x + player.size / 2, player.y + player.size / 2, C.gold)
  for (let i = 0; i < 24; i++) {
    const a = Math.random() * Math.PI * 2
    const s = 3 + Math.random() * 6
    particles.push({
      x: W / 2, y: H / 2 - 40,
      vx: Math.cos(a) * s, vy: Math.sin(a) * s,
      life: 1, r: 2 + Math.random() * 3, color: C.gold,
    })
  }
  flash = 0.4
  if (platform.vibrateShort) platform.vibrateShort({ type: 'medium' })
  state = 'cleared'
  overFrame = frame
  showBanner()
  if (level > bestLevel) {
    bestLevel = level
    try { platform.setStorageSync('flip_level', bestLevel) } catch (e) {}
  }
}

// ---------- 碰撞 ----------
function hit(o) {
  return (
    player.x < o.x + o.w &&
    player.x + player.size > o.x &&
    player.y < o.y + o.h &&
    player.y + player.size > o.y
  )
}

// ---------- 更新 ----------
function update() {
  frame++
  if (shake > 0) shake *= 0.86
  if (flash > 0) flash -= 0.04

  // 星空滚动
  stars.forEach(s => {
    s.x -= s.sp * (state === 'playing' ? 1.6 : 1)
    if (s.x < -2) { s.x = W + 2; s.y = Math.random() * H }
  })

  if (state === 'playing') {
    // 拖尾
    trail.push({ x: player.x, y: player.y })
    if (trail.length > 10) trail.shift()

    // 重力
    player.vy += GRAVITY * gravK * player.dir
    if (player.vy > MAX_V) player.vy = MAX_V
    if (player.vy < -MAX_V) player.vy = -MAX_V
    player.y += player.vy

    if (player.y + player.size > PLAY_BOTTOM) {
      player.y = PLAY_BOTTOM - player.size
      player.vy = 0
    }
    if (player.y < PLAY_TOP) {
      player.y = PLAY_TOP
      player.vy = 0
    }

    // 难度随时间提升
    speed += 0.0016

    // 生成障碍
    distSinceSpawn += speed
    if (distSinceSpawn >= nextGap) {
      spawnObstacle()
      distSinceSpawn = 0
      nextGap = (mode === 'level')
        ? levelGapMin + Math.random() * levelGapRand
        : 200 + Math.random() * 160
    }

    // 移动 & 计分 & 碰撞
    for (let i = obstacles.length - 1; i >= 0; i--) {
      const o = obstacles[i]
      o.x -= speed
      if (o.moving) o.y = o.baseY + Math.sin(frame * o.sp + o.phase) * o.amp
      if (!o.passed && !o.noScore && o.x + o.w < player.x) {
        o.passed = true
        score++
      }
      if (hit(o)) { gameOver(); break }
      if (o.x + o.w < -10) obstacles.splice(i, 1)
    }

    // 闯关模式：达到目标即通关
    if (mode === 'level' && state === 'playing' && score >= target) {
      levelClear()
    }
  }

  // 粒子
  for (let i = particles.length - 1; i >= 0; i--) {
    const p = particles[i]
    p.x += p.vx
    p.y += p.vy
    p.vy += 0.15
    p.vx *= 0.98
    p.life -= 0.022
    if (p.life <= 0) particles.splice(i, 1)
  }
}

// ---------- 绘制 ----------
function drawBackground() {
  const g = ctx.createLinearGradient(0, 0, 0, H)
  g.addColorStop(0, '#0a0a1f')
  g.addColorStop(0.55, '#120e2a')
  g.addColorStop(1, '#0c0a1c')
  ctx.fillStyle = g
  ctx.fillRect(0, 0, W, H)

  const top = ctx.createRadialGradient(W / 2, PLAY_TOP, 0, W / 2, PLAY_TOP, W * 0.9)
  top.addColorStop(0, 'rgba(80,90,200,0.12)')
  top.addColorStop(1, 'rgba(80,90,200,0)')
  ctx.fillStyle = top
  ctx.fillRect(0, 0, W, H)

  stars.forEach(s => {
    ctx.globalAlpha = s.a
    ctx.fillStyle = '#aab4ff'
    ctx.beginPath()
    ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2)
    ctx.fill()
  })
  ctx.globalAlpha = 1
}

function drawWalls() {
  ctx.save()
  ctx.shadowColor = C.wall
  ctx.shadowBlur = 12
  ctx.strokeStyle = C.wall
  ctx.lineWidth = 3
  ctx.beginPath(); ctx.moveTo(0, PLAY_TOP - 3); ctx.lineTo(W, PLAY_TOP - 3); ctx.stroke()
  ctx.beginPath(); ctx.moveTo(0, PLAY_BOTTOM + 3); ctx.lineTo(W, PLAY_BOTTOM + 3); ctx.stroke()
  ctx.restore()
}

function drawTrail() {
  for (let i = 0; i < trail.length; i++) {
    const t = trail[i]
    const k = i / trail.length
    ctx.globalAlpha = k * 0.35
    const s = player.size * (0.5 + k * 0.5)
    const off = (player.size - s) / 2
    ctx.fillStyle = C.player
    roundRect(t.x + off, t.y + off, s, s, 8)
    ctx.fill()
  }
  ctx.globalAlpha = 1
}

function drawPlayer() {
  ctx.save()
  ctx.shadowColor = C.playerGlow
  ctx.shadowBlur = 22
  const g = ctx.createLinearGradient(player.x, player.y, player.x, player.y + player.size)
  g.addColorStop(0, C.playerLight)
  g.addColorStop(1, C.player)
  ctx.fillStyle = g
  roundRect(player.x, player.y, player.size, player.size, 9)
  ctx.fill()
  ctx.restore()

  ctx.fillStyle = 'rgba(255,255,255,0.35)'
  roundRect(player.x + 6, player.y + 5, player.size - 12, 6, 3)
  ctx.fill()
}

function drawObstacles() {
  obstacles.forEach(o => {
    const col = o.col || C.obstacle
    const light = o.colLight || C.obstacleLight
    ctx.save()
    ctx.shadowColor = col
    ctx.shadowBlur = 18
    const g = ctx.createLinearGradient(o.x, o.y, o.x, o.y + o.h)
    g.addColorStop(0, o.floor ? light : col)
    g.addColorStop(1, o.floor ? col : light)
    ctx.fillStyle = g
    roundRect(o.x, o.y, o.w, o.h, 7)
    ctx.fill()
    ctx.restore()
  })
}

function drawParticles() {
  particles.forEach(p => {
    ctx.globalAlpha = Math.max(0, p.life)
    ctx.fillStyle = p.color || C.player
    ctx.beginPath()
    ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2)
    ctx.fill()
  })
  ctx.globalAlpha = 1
}

function drawText(t, x, y, size, color, weight) {
  ctx.fillStyle = color
  ctx.font = `${weight || ''} ${size}px sans-serif`
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillText(t, x, y)
}

function drawButton(b, primary, label) {
  ctx.save()
  ctx.shadowColor = primary ? C.playerGlow : C.obstacleGlow
  ctx.shadowBlur = 16
  if (primary) {
    const g = ctx.createLinearGradient(b.x, b.y, b.x, b.y + b.h)
    g.addColorStop(0, C.playerLight)
    g.addColorStop(1, C.player)
    ctx.fillStyle = g
    roundRect(b.x, b.y, b.w, b.h, 14)
    ctx.fill()
  } else {
    ctx.fillStyle = 'rgba(255,61,139,0.16)'
    roundRect(b.x, b.y, b.w, b.h, 14)
    ctx.fill()
    ctx.lineWidth = 2
    ctx.strokeStyle = C.obstacle
    roundRect(b.x, b.y, b.w, b.h, 14)
    ctx.stroke()
  }
  ctx.restore()
  drawText(label, b.x + b.w / 2, b.y + b.h / 2, 18, primary ? '#0a0a1f' : C.text, 'bold')
}

function drawHomeButton(label) {
  const b = homeButton()
  ctx.fillStyle = 'rgba(255,255,255,0.08)'
  roundRect(b.x, b.y, b.w, b.h, 10)
  ctx.fill()
  drawText(label || '‹ 首页', b.x + b.w / 2, b.y + b.h / 2, 15, C.sub, 'bold')
}

function drawLevels() {
  drawHomeButton('‹ 返回')
  drawText('选择关卡', W / 2, H / 2 - 196, 30, C.text, 'bold')
  drawText(bestLevel >= LEVEL_COUNT ? '已通关全部关卡 🏆' : '通关当前关卡，解锁下一关',
    W / 2, H / 2 - 168, 14, C.sub)

  levelCells().forEach(cell => {
    const cfg = LEVELS[cell.level - 1]
    const unlocked = cell.level <= bestLevel + 1
    const cleared = cell.level <= bestLevel
    const cx = cell.x + cell.w / 2
    ctx.save()
    if (unlocked) {
      ctx.shadowColor = cleared ? 'rgba(255,215,106,0.7)' : C.playerGlow
      ctx.shadowBlur = 14
      ctx.fillStyle = cleared ? 'rgba(255,215,106,0.16)' : 'rgba(61,240,224,0.14)'
      roundRect(cell.x, cell.y, cell.w, cell.h, 14); ctx.fill()
      ctx.lineWidth = 2
      ctx.strokeStyle = cleared ? C.gold : C.player
      roundRect(cell.x, cell.y, cell.w, cell.h, 14); ctx.stroke()
    } else {
      ctx.fillStyle = 'rgba(255,255,255,0.05)'
      roundRect(cell.x, cell.y, cell.w, cell.h, 14); ctx.fill()
    }
    ctx.restore()
    if (unlocked) {
      drawText(`第 ${cell.level} 关${cleared ? '  ✓' : ''}`, cx, cell.y + 30, 18, cleared ? C.gold : C.text, 'bold')
      drawText(cfg.name, cx, cell.y + 56, 15, C.sub)
    } else {
      drawText('🔒', cx, cell.y + 30, 22, C.sub)
      drawText(`第 ${cell.level} 关`, cx, cell.y + 58, 14, C.sub)
    }
  })
}

function drawHUD() {
  ctx.save()
  ctx.shadowColor = C.playerGlow
  ctx.shadowBlur = 16
  if (mode === 'level') {
    drawText(`第 ${level} 关 · ${curLevelCfg ? curLevelCfg.name : ''}`, W / 2, PLAY_TOP + 34, 22, C.text, 'bold')
    drawText(`${score} / ${target}`, W / 2, PLAY_TOP + 70, 40, C.player, 'bold')
  } else {
    drawText(score, W / 2, PLAY_TOP + 56, 60, C.text, 'bold')
  }
  ctx.restore()
}

function drawReady() {
  ctx.save()
  ctx.shadowColor = C.playerGlow
  ctx.shadowBlur = 24
  drawText('重力翻转者', W / 2, H / 2 - 118, 42, C.text, 'bold')
  ctx.restore()
  drawText('翻 转 重 力', W / 2, H / 2 - 78, 18, C.player, 'bold')
  drawText('点击屏幕翻转重力，躲开障碍', W / 2, H / 2 - 44, 15, C.sub)

  modeButtons().forEach(b => drawButton(b, b.kind === 'endless', b.label))

  const tip = bestLevel >= LEVEL_COUNT
    ? '已通关全部关卡 🏆'
    : (bestLevel > 0 ? `闯关进度：已通关第 ${bestLevel} 关` : '闯关模式：从第 1 关开始')
  drawText(`无尽最高分  ${best}`, W / 2, H / 2 + 168, 15, C.sub)
  drawText(tip, W / 2, H / 2 + 194, 14, C.sub)
}

function drawOver() {
  ctx.fillStyle = 'rgba(10,10,24,0.74)'
  ctx.fillRect(0, 0, W, H)
  drawHomeButton(mode === 'level' ? '‹ 选关' : '‹ 首页')

  drawText('结 束', W / 2, H / 2 - 92, 30, C.obstacle, 'bold')
  ctx.save()
  ctx.shadowColor = C.playerGlow
  ctx.shadowBlur = 20
  drawText(score, W / 2, H / 2 - 22, 70, C.text, 'bold')
  ctx.restore()
  const sub = mode === 'level' ? `第 ${level} 关「${curLevelCfg ? curLevelCfg.name : ''}」` : `最高分  ${best}`
  drawText(sub, W / 2, H / 2 + 34, 16, C.sub)

  if (frame - overFrame > 18) {
    const btns = overButtons()
    btns.forEach(b => drawButton(b, b.kind === 'revive', b.kind === 'revive' ? '▶  看广告复活' : '↗  分享给好友'))
    const last = btns[btns.length - 1]
    const pulse = 0.55 + 0.45 * Math.sin(frame * 0.08)
    ctx.globalAlpha = pulse
    drawText(mode === 'level' ? '点击其它位置 · 重试本关' : '点击其它位置 · 再来一局',
      W / 2, last.y + last.h + 28, 15, C.sub)
    ctx.globalAlpha = 1
  }
}

function drawCleared() {
  ctx.fillStyle = 'rgba(10,10,24,0.74)'
  ctx.fillRect(0, 0, W, H)
  drawHomeButton('‹ 选关')

  const allDone = level >= LEVEL_COUNT
  ctx.save()
  ctx.shadowColor = 'rgba(255,215,106,0.8)'
  ctx.shadowBlur = 22
  drawText(allDone ? '全部通关！' : '通 关！', W / 2, H / 2 - 70, allDone ? 38 : 44, C.gold, 'bold')
  ctx.restore()
  drawText(allDone ? `你已征服全部 ${LEVEL_COUNT} 关 🏆` : `第 ${level} 关「${curLevelCfg ? curLevelCfg.name : ''}」达成`, W / 2, H / 2 - 16, 18, C.text)

  if (frame - overFrame > 12) {
    const b = clearedButton()
    drawButton(b, true, allDone ? '🏆  返回首页' : '下一关  ▶')
    const pulse = 0.55 + 0.45 * Math.sin(frame * 0.08)
    ctx.globalAlpha = pulse
    drawText('点击其它位置 · 返回首页', W / 2, b.y + b.h + 28, 14, C.sub)
    ctx.globalAlpha = 1
  }
}

function render() {
  ctx.save()
  if (shake > 0.5) {
    ctx.translate((Math.random() - 0.5) * shake, (Math.random() - 0.5) * shake)
  }

  drawBackground()
  drawWalls()
  if (state === 'playing') drawTrail()
  drawObstacles()
  if (state === 'playing' || state === 'ready') drawPlayer()
  drawParticles()

  if (state === 'playing') drawHUD()
  else if (state === 'ready') drawReady()
  else if (state === 'levels') drawLevels()
  else if (state === 'over') drawOver()
  else if (state === 'cleared') drawCleared()

  ctx.restore()

  if (flash > 0) {
    ctx.fillStyle = `rgba(255,255,255,${Math.max(0, flash)})`
    ctx.fillRect(0, 0, W, H)
  }
}

// ---------- 主循环 ----------
function loop() {
  update()
  render()
  requestAnimationFrame(loop)
}
loop()
