/**
 * 3D 飞机渲染层（Mapbox CustomLayer + Three.js）
 *
 * 功能：
 *   - 在 Mapbox GL globe 上以真实 glTF 模型渲染在线飞机（位置/航向/俯仰/滚转/高度）
 *   - 模型按 ICAO 机型代码匹配（a320.glb / b738.glb ...），未匹配机型回退 plane.glb
 *   - 5s 轮询更新时对位置做插值动画，飞机平滑移动不跳格
 *   - 模型尺寸随 zoom 动态缩放（低 zoom 缩小避免糊成一团）
 *
 * 数据来源：OnlineMap.vue 的 pilots（后端 /fsd/online 快照）
 * 调用方：OnlineMap.vue renderMapboxPilots() 中替换 symbol 图层
 */

import * as THREE from 'three'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'

// ===== 常量 =====
const MODEL_BASE = '/models/aircraft/'
const FALLBACK_MODEL = 'b738'           // 未匹配机型的兜底模型
// 高度夸张系数：1ft = 0.02 单位（万米巡航 ≈ 60 单位抬升，视觉明显但不夸张失真）
const ALT_SCALE = 0.02
// 模型基础缩放：fr24 模型翼展
const MODEL_VIS_SCALE = 3
// zoom 自适应基准：zoom 9 时 scale = MODEL_VIS_SCALE。
// 缩放随 zoom 反向（近大远小补偿）：zoom 越高(越近)飞机越小，屏幕大小保持稳定，
// 避免高 zoom 下模型爆炸式放大占满屏幕（clamp 0.5~2.5 倍）
const REF_ZOOM = 9

// ===== 模块状态 =====
let map = null                  // mapboxgl.Map 实例
let renderer = null             // Three.js WebGLRenderer（复用 Mapbox 的 GL 上下文）
let scene = null                // Three.js 场景
let _customLayer = null          // Mapbox custom layer 实例
const modelCache = new Map()      // 机型 -> THREE.Group（已加载模型模板）
const aircraftPool = new Map()    // callsign -> { group, target, current }（每架飞机的实例与插值状态）
let loader = null               // GLTFLoader
let ready = false               // 图层是否已加入地图
let pendingPilots = []          // 地图就绪前到达的数据缓存

/** ICAO 机型代码 -> 模型名（小写无后缀）；匹配不到返回兜底 */
export function modelForAircraft(aircraft) {
  const a = (aircraft || '').toUpperCase().replace(/[^A-Z0-9]/g, '')
  if (!a) return FALLBACK_MODEL
  // 直接前缀匹配：A320/B738/A359/B77W...（取字母+数字前 3~4 位）
  const m = a.match(/^([A-Z]{1,3}[0-9]{2,3})/)
  const code = m ? m[1].toLowerCase() : ''
  return code || FALLBACK_MODEL
}

/** 加载单个机型模型（带缓存；克隆实例供多架飞机复用） */
function loadModel(name) {
  if (modelCache.has(name)) return Promise.resolve(modelCache.get(name))
  return new Promise((resolve) => {
    loader.load(`${MODEL_BASE}${name}.glb`,
      (gltf) => {
        const template = gltf.scene
        // 统一材质光照响应：fr24 模型多为 MeshPhongMaterial，场景光已配置
        template.traverse((o) => {
          if (o.isMesh) {
            o.material.side = THREE.DoubleSide
          }
        })
        modelCache.set(name, template)
        resolve(template)
      },
      undefined,
      () => {
        // 加载失败：缓存空值避免重复请求，调用方回退
        modelCache.set(name, null)
        resolve(null)
      })
  })
}

/**
 * 从模板克隆飞机实例
 * 姿态基准（场景 z-up 坐标系）：机头 +y(北)、上 +z
 * glTF 模型约定 y-up、机头 +z，需两层旋转归一：
 *   up.rotation.x = 90° → y-up 转为 z-up（机头 +z → 场景 -y，指向南）
 *   nose.rotation.z = 180° → 机头 -y 转为 +y（北）
 */
async function acquireAircraft(aircraftType) {
  let name = modelForAircraft(aircraftType)
  let template = await loadModel(name)
  if (!template && name !== FALLBACK_MODEL) {
    template = await loadModel(FALLBACK_MODEL)
    name = FALLBACK_MODEL
  }
  if (!template) return null

  const model = template.clone(true)
  model.scale.setScalar(MODEL_VIS_SCALE)

  const up = new THREE.Group()       // y-up → z-up
  up.rotation.x = Math.PI / 2
  up.add(model)
  const nose = new THREE.Group()     // 机头转向北
  nose.rotation.z = Math.PI
  nose.add(up)

  const group = new THREE.Group()    // 外层：heading/pitch/bank 由 render 驱动
  group.rotation.order = 'ZYX'       // 航空姿态顺序 yaw(Z)→pitch(Y)→roll(X)
  group.add(nose)
  // 保存模型本体引用，供 render 里按 zoom 动态缩放
  group.userData.model = model
  scene.add(group)
  return group
}

/** 释放飞机实例 */
function releaseAircraft(callsign) {
  const rec = aircraftPool.get(callsign)
  if (!rec) return
  scene.remove(rec.group)
  aircraftPool.delete(callsign)
}

/** 经纬度 + 高度(ft) -> 场景局部坐标（米，原点=当前地图中心；x东 y北 z上）
 *  每次调用实时以当前地图中心为原点：飞机离原点近 → float32 精度好（不消失/不偏移）；
 *  拖动时 center 变化 → 位置实时重算 → 飞机正确钉在地理位置（不漂移）。 */
function llaToLocal(lon, lat, altFt) {
  const c = map.getCenter()
  const mPerDegLat = 111320
  const mPerDegLon = 111320 * Math.cos(c.lat * Math.PI / 180)
  return {
    x: (lon - c.lng) * mPerDegLon,
    y: (lat - c.lat) * mPerDegLat,
    // 高度 = 气压高度×夸张系数 最低抬升2米 再 +3米补偿（避免贴地穿模/轻微上浮）
    z: Math.max((altFt || 0) * ALT_SCALE, 2) + 3,
  }
}

/** 更新单架飞机的目标状态（轮询数据到达时调用）。
 *  目标存经纬度（不存局部坐标），渲染时实时换算成相对当前中心的局部坐标，保证精度与不漂移。 */
function setTarget(rec, p) {
  rec.target = {
    lon: Number(p.lon),
    lat: Number(p.lat),
    alt: Number(p.altitude) || 0,
    heading: Number(p.heading) || 0,
    pitch: Number(p.pitch) || 0,
    bank: Number(p.bank) || 0,
  }
  // 首次出现直接落位（不做跨图插值）
  if (!rec.current) {
    rec.current = { ...rec.target }
  }
}

/**
 * 创建 Mapbox custom layer
 * 返回图层对象；addLayer 后由 Mapbox 驱动 onAdd/render
 */
export function createAircraft3DLayer(mapboxMap) {
  map = mapboxMap
  loader = new GLTFLoader()

  const layer = _customLayer = {
    id: 'aircraft-3d-layer',
    type: 'custom',
    renderingMode: '3d',

    /** 图层加入地图时初始化 Three.js（复用 Mapbox 的 WebGL 上下文） */
    onAdd(_map, gl) {
      try {
        this.camera = new THREE.Camera()
        scene = new THREE.Scene()
        // 环境光 + 方向光：保证模型各角度可见
        const ambient = new THREE.AmbientLight(0xffffff, 1.6)
        const directional = new THREE.DirectionalLight(0xffffff, 1.2)
        directional.position.set(100, 200, 100)
        scene.add(ambient, directional)

        renderer = new THREE.WebGLRenderer({ canvas: gl.canvas, context: gl })
        renderer.autoClear = false
        // 与 Mapbox 画布像素尺寸一致，避免渲染区域/视口错位
        renderer.setPixelRatio(window.devicePixelRatio || 1)
        renderer.setSize(gl.canvas.width, gl.canvas.height, false)

        ready = true
        if (pendingPilots.length) {
          updateAircraft3D(pendingPilots)
          pendingPilots = []
        }
      } catch (e) {
        // 初始化失败不传播到 Mapbox（否则渲染循环崩溃），仅降级为 2D 图标
        console.error('[Aircraft3D] onAdd 初始化失败:', e)
        ready = false
      }
    },

    /** 每帧渲染：同步 Mapbox 相机矩阵 + 插值更新飞机位姿 */
    render(_gl, matrix) {
      if (!scene || !renderer || !map) return
      try {
      // 模型按 zoom 动态缩放（近大远小补偿：zoom 越高飞机越小，屏幕大小稳定）
      // zoom 9 → 1.0×；zoom 12 → 0.5×；zoom 6 → 2.0×（clamp 0.5~2.5）
      const zoomScale = Math.min(2.5, Math.max(0.5, Math.pow(2, (REF_ZOOM - map.getZoom()) * 0.5)))
      const modelScale = MODEL_VIS_SCALE * zoomScale
      // 插值：经纬度/高度/角度最短路径插值；渲染时实时换算相对当前地图中心的局部坐标
      for (const rec of aircraftPool.values()) {
        if (!rec.current || !rec.target) continue
        const c = rec.current, t = rec.target
        const k = 0.12   // 插值系数（越大越快）
        c.lon += (t.lon - c.lon) * k
        c.lat += (t.lat - c.lat) * k
        c.alt += (t.alt - c.alt) * k
        c.heading += shortestAngle(c.heading, t.heading) * k
        c.pitch += (t.pitch - c.pitch) * k
        c.bank += (t.bank - c.bank) * k
        // 实时换算：以当前地图中心为原点（精度好、拖动不漂移）
        const w = llaToLocal(c.lon, c.lat, c.alt)
        rec.group.position.set(w.x, w.y, w.z)
        // 姿态：heading 顺时针从北(+y)；pitch 抬头绕 x 正向；bank 右坡度绕 y 正向
        // 修正：模型归一化后机头指向与航向差 180°，yaw 需再 +180°
        rec.group.rotation.z = THREE.MathUtils.degToRad(-c.heading + 180)
        rec.group.rotation.y = THREE.MathUtils.degToRad(c.bank)
        rec.group.rotation.x = THREE.MathUtils.degToRad(c.pitch)
        // 应用 zoom 自适应缩放（model 为模型本体引用，存于 userData）
        if (rec.group.userData.model) {
          rec.group.userData.model.scale.setScalar(modelScale)
        }
      }
      // Mapbox 官方方案：mercator 矩阵 × 当前中心平移 × 米制缩放（y 翻转：mercator y 向南）
      const c0 = map.getCenter()
      const merc = window.mapboxgl.MercatorCoordinate.fromLngLat([c0.lng, c0.lat], 0)
      const s = merc.meterInMercatorCoordinateUnits()
      const local = new THREE.Matrix4()
        .makeTranslation(merc.x, merc.y, merc.z)
        .scale(new THREE.Vector3(s, -s, s))
      this.camera.projectionMatrix = new THREE.Matrix4().fromArray(matrix).multiply(local)
      this.camera.projectionMatrixInverse.copy(this.camera.projectionMatrix).invert()
      renderer.resetState()
      renderer.render(scene, this.camera)
      // 有飞机时持续重绘以驱动插值动画；无飞机不触发（避免空转）
      if (aircraftPool.size) map.triggerRepaint()
      } catch (e) {
        // 渲染异常不传播到 Mapbox（否则中断渲染循环导致 getOwnLayer 等内部报错）
      }
    },
  }
  return layer
}

/** 角度最短路径差（-180~180） */
function shortestAngle(from, to) {
  let d = (to - from) % 360
  if (d > 180) d -= 360
  if (d < -180) d += 360
  return d
}

/**
 * 批量更新飞机（OnlineMap.vue 轮询回调调用）
 * @param {Array} pilots 后端 /fsd/online 数据
 *
 * 注意：本函数为 async（内部 await 模型异步加载）。组件挂载轮询与 map load
 * 事件可能并发调用，若并发执行会为同一 callsign 创建两个实例（第二个覆盖
 * pool 引用，第一个成为场景中的"孤儿"——停在原点/地图中心，永不消失）。
 * 因此用 updating 互斥锁串行化，并在创建前二次检查 pool。
 */
let updating = false

export async function updateAircraft3D(pilots) {
  if (!ready) { pendingPilots = pilots; return }
  if (!map || !scene) return
  if (updating) return   // 已有更新在进行中，跳过本轮
  updating = true
  try {
    const seen = new Set()
    for (const p of pilots) {
      if (!p.lat || !p.lon || p.type === 'ATC') continue
      seen.add(p.callsign)
      let rec = aircraftPool.get(p.callsign)
      if (rec && rec.aircraft !== (p.aircraft || '')) {
        // 机型变化：销毁旧实例，重新加载对应模型
        releaseAircraft(p.callsign)
        rec = null
      }
      if (!rec) {
        // await 前再次检查（避免并发期间被其他调用创建）
        rec = aircraftPool.get(p.callsign)
        if (!rec) {
          const group = await acquireAircraft(p.aircraft)
          if (!group) continue
          rec = { group, target: null, current: null, aircraft: p.aircraft || '' }
          aircraftPool.set(p.callsign, rec)
        }
      }
      setTarget(rec, p)
    }
    // 移除已下线的飞机
    for (const cs of [...aircraftPool.keys()]) {
      if (!seen.has(cs)) releaseAircraft(cs)
    }
  } finally {
    updating = false
  }
}

/** 销毁全部（仅引擎切换/组件卸载等必要时调用） */
export function destroyAircraft3D() {
  for (const cs of [...aircraftPool.keys()]) releaseAircraft(cs)
  // 注意：不在此处调 map.getLayer/removeLayer —— 调用时机通常在 mapboxMap.remove() 之后，
  // 此时 map.style 已销毁，getLayer 内部 getOwnLayer 会抛 "Cannot read properties of undefined"。
  // Mapbox 销毁地图时会自动清理全部图层，无需手动移除。
  if (renderer) { renderer.dispose(); renderer = null }
  if (scene) { scene.clear(); scene = null }
  modelCache.clear()
  ready = false
  pendingPilots = []
  _customLayer = null
  map = null
}
