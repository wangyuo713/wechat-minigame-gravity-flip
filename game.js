// ============================================================
// 《重力翻转者 Flip》 — 微信小游戏
// 玩法：方块自动奔跑，点击屏幕翻转重力，躲开上下两侧的障碍。
// 操作：触摸屏幕任意位置 = 翻转重力 / 开始 / 重来
// ============================================================

const sys = wx.getSystemInfoSync()
const W = sys.windowWidth
const H = sys.windowHeight
const dpr = sys.pixelRatio || 1

// 主屏画布（高清适配）
const canvas = wx.createCanvas()
canvas.width = W * dpr
canvas.height = H * dpr
const ctx = canvas.getContext('2d')
ctx.scale(dpr, dpr)

// 安全区（避开刘海/底部）
const safe = sys.safeArea || { top: 0, bottom: H }
const PLAY_TOP = (safe.top || 0) + 28
const PLAY_BOTTOM = H - 44

// ---------- 配色（霓虹风）----------
const C = {
  player: '#3df0e0',
  playerLight: '#aafff7',
  playerGlow: 'rgba(54,240,224,0.85)',
  obstacle: '#ff3d8b',
  obstacleLight: '#ff8fc0',
  obstacleGlow: 'rgba(255,61,139,0.7)',
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

// ---------- 游戏状态 ----------
let state = 'ready' // ready | playing | over
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
let best = 0
try { best = wx.getStorageSync('flip_best') || 0 } catch (e) {}

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

// ---------- 重置 ----------
function resetGame() {
  player.y = PLAY_BOTTOM - player.size
  player.vy = 0
  player.dir = 1
  trail = []
  obstacles = []
  particles = []
  speed = 4.2
  distSinceSpawn = 0
  nextGap = 280
  score = 0
  frame = 0
}

function startGame() {
  resetGame()
  state = 'playing'
}

function flip() {
  player.dir *= -1
  if (wx.vibrateShort) wx.vibrateShort({ type: 'light' })
}

// ---------- 输入 ----------
wx.onTouchStart(() => {
  if (state === 'ready') startGame()
  else if (state === 'playing') flip()
  else if (state === 'over' && frame - overFrame > 18) startGame()
})

// ---------- 障碍生成 ----------
function spawnObstacle() {
  const h = 50 + Math.random() * 80
  const w = 30 + Math.random() * 24
  const onFloor = Math.random() < 0.5
  obstacles.push({
    x: W + w,
    w,
    h,
    y: onFloor ? PLAY_BOTTOM - h : PLAY_TOP,
    floor: onFloor,
    passed: false,
  })
}

// ---------- 死亡特效 ----------
function explode(x, y) {
  for (let i = 0; i < 30; i++) {
    const a = Math.random() * Math.PI * 2
    const s = 2 + Math.random() * 7
    particles.push({
      x, y,
      vx: Math.cos(a) * s,
      vy: Math.sin(a) * s,
      life: 1,
      r: 1.5 + Math.random() * 2.5,
    })
  }
  shake = 14
  flash = 0.8
  if (wx.vibrateShort) wx.vibrateShort({ type: 'heavy' })
}

function gameOver() {
  explode(player.x + player.size / 2, player.y + player.size / 2)
  state = 'over'
  overFrame = frame
  if (score > best) {
    best = score
    try { wx.setStorageSync('flip_best', best) } catch (e) {}
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
    player.vy += GRAVITY * player.dir
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
      nextGap = 200 + Math.random() * 160
    }

    // 移动 & 计分 & 碰撞
    for (let i = obstacles.length - 1; i >= 0; i--) {
      const o = obstacles[i]
      o.x -= speed
      if (!o.passed && o.x + o.w < player.x) {
        o.passed = true
        score++
      }
      if (hit(o)) { gameOver(); break }
      if (o.x + o.w < -10) obstacles.splice(i, 1)
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
  // 竖直渐变
  const g = ctx.createLinearGradient(0, 0, 0, H)
  g.addColorStop(0, '#0a0a1f')
  g.addColorStop(0.55, '#120e2a')
  g.addColorStop(1, '#0c0a1c')
  ctx.fillStyle = g
  ctx.fillRect(0, 0, W, H)

  // 顶部光晕
  const top = ctx.createRadialGradient(W / 2, PLAY_TOP, 0, W / 2, PLAY_TOP, W * 0.9)
  top.addColorStop(0, 'rgba(80,90,200,0.12)')
  top.addColorStop(1, 'rgba(80,90,200,0)')
  ctx.fillStyle = top
  ctx.fillRect(0, 0, W, H)

  // 星星
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

  // 高光条
  ctx.fillStyle = 'rgba(255,255,255,0.35)'
  roundRect(player.x + 6, player.y + 5, player.size - 12, 6, 3)
  ctx.fill()
}

function drawObstacles() {
  obstacles.forEach(o => {
    ctx.save()
    ctx.shadowColor = C.obstacleGlow
    ctx.shadowBlur = 18
    const g = ctx.createLinearGradient(o.x, o.y, o.x, o.y + o.h)
    g.addColorStop(0, o.floor ? C.obstacleLight : C.obstacle)
    g.addColorStop(1, o.floor ? C.obstacle : C.obstacleLight)
    ctx.fillStyle = g
    roundRect(o.x, o.y, o.w, o.h, 7)
    ctx.fill()
    ctx.restore()
  })
}

function drawParticles() {
  particles.forEach(p => {
    ctx.globalAlpha = Math.max(0, p.life)
    ctx.fillStyle = C.player
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

function drawHUD() {
  ctx.save()
  ctx.shadowColor = C.playerGlow
  ctx.shadowBlur = 16
  drawText(score, W / 2, PLAY_TOP + 56, 60, C.text, 'bold')
  ctx.restore()
}

function drawReady() {
  ctx.save()
  ctx.shadowColor = C.playerGlow
  ctx.shadowBlur = 24
  drawText('重力翻转者', W / 2, H / 2 - 64, 42, C.text, 'bold')
  ctx.restore()
  drawText('F L I P', W / 2, H / 2 - 22, 18, C.player, 'bold')
  drawText('点击屏幕翻转重力，躲开障碍', W / 2, H / 2 + 38, 16, C.sub)

  const pulse = 0.55 + 0.45 * Math.sin(frame * 0.08)
  ctx.globalAlpha = pulse
  drawText('点击任意位置开始', W / 2, H / 2 + 84, 19, C.text, 'bold')
  ctx.globalAlpha = 1

  drawText(`最高分  ${best}`, W / 2, H / 2 + 134, 15, C.sub)
}

function drawOver() {
  ctx.fillStyle = 'rgba(10,10,24,0.74)'
  ctx.fillRect(0, 0, W, H)
  drawText('结 束', W / 2, H / 2 - 78, 30, C.obstacle, 'bold')
  ctx.save()
  ctx.shadowColor = C.playerGlow
  ctx.shadowBlur = 20
  drawText(score, W / 2, H / 2 - 6, 70, C.text, 'bold')
  ctx.restore()
  drawText(`最高分  ${best}`, W / 2, H / 2 + 52, 16, C.sub)
  if (frame - overFrame > 18) {
    const pulse = 0.55 + 0.45 * Math.sin(frame * 0.08)
    ctx.globalAlpha = pulse
    drawText('点击屏幕再来一局', W / 2, H / 2 + 104, 18, C.text, 'bold')
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
  if (state !== 'over') drawPlayer()
  drawParticles()

  if (state === 'playing') drawHUD()
  else if (state === 'ready') drawReady()
  else if (state === 'over') drawOver()

  ctx.restore()

  // 死亡闪屏
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
