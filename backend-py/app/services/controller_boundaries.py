"""管制区域边界几何服务（移植 Node `src/services/controllerBoundaries.js`，977 行）。

按管制员呼号后缀决定显示形态：
  _CTR → FIR 真实边界（VATSpy GeoJSON，缺失时用内置简化 FIR）
  _APP → 80km 十二边形扇区；_TWR/_GND/_DEL → 仅点位；_FSS → FIR 命中则边界、否则不显示
  其他 → 仅点位（50km 半径常量保留但不绘制）

输出 JSON 与 Node 逐字段一致（callsign/type/label/icao/polygon|point/centerPoint/
strokeColor/strokeWeight/strokeOpacity/fillColor/fillOpacity/strokeDash/radiusKm），
前端 `GeoJSON` 风格渲染零改动。

与 Node 的差异（详见交付报告）：
1. **异步**：`get_controller_boundaries()` 是 `async def`（Node 为同步）。首次调用用
   `asyncio.to_thread` 读 FIR 数据，避免阻塞事件循环；调用方需 `await`。
2. 多 CTR 合并：Node 用 `@turf/turf` 的 `union`；这里优先用 `shapely`（GEOS）做同样的
   布尔并集，几何区域等价，但顶点顺序/冗余点可能与 turf 略有不同（前端仅绘制，不影响）。
   `shapely` 不可用或合并失败时，与 Node 的 catch 分支一致：返回未合并的原始边界列表。
3. `turf.center()`（bbox 中心）用 `merged.bounds` 的中心实现，语义相同。
"""
from __future__ import annotations

import asyncio
import json
import logging
import math
import re
from pathlib import Path
from typing import Any, Dict, Iterable, List, Optional, Tuple

from app.services.env_compat import PROJECT_ROOT, env_str

log = logging.getLogger("cwfly.boundaries")

# 半径常量（千米）——Node 保留常量但不参与绘制，这里仅作文档/排障参考
RADIUS = {
    "CTR": 600,
    "APP": 80,
    "TWR": 15,
    "GND": 5,
    "DEL": 5,
    "FSS": 1000,
    "DEFAULT": 50,
}

_fir_boundaries: Optional[Dict[str, Any]] = None
_load_lock: Optional[asyncio.Lock] = None


# ------------------------------------------------------------------ 基础工具
def ring_area(ring: List[List[float]]) -> float:
    """多边形环面积（近似平方度，用于挑主环；公式与 Node 一致）。"""
    area = 0.0
    n = len(ring)
    for i in range(n):
        p1 = ring[i]
        p2 = ring[(i + 1) % n]
        area += (p2[0] - p1[0]) * (p1[1] + p2[1]) / 2
    return abs(area)


def _parse_float_or_none(value: Any) -> Optional[float]:
    if value is None or value == "":
        return None
    try:
        n = float(value)
    except (TypeError, ValueError):
        return None
    return n if math.isfinite(n) else None


def normalize_vatspy_feature(feature: Dict[str, Any]) -> Optional[Dict[str, Any]]:
    """VATSpy MultiPolygon → 单 Polygon（取最大外环），properties 结构对齐 Node。"""
    props = feature.get("properties") or {}
    fid = str(props.get("id") or "").upper()
    if not fid:
        return None
    geometry = feature.get("geometry") or {}
    polygons = geometry.get("coordinates") or []
    best_ring: Optional[List[List[float]]] = None
    best_area = -1.0
    for polygon in polygons:
        for ring in polygon or []:
            if not isinstance(ring, list) or len(ring) < 3:
                continue
            area = ring_area(ring)
            if area > best_area:
                best_area = area
                best_ring = ring
    if best_ring is None:
        return None
    return {
        "properties": {
            "id": fid,
            "name": props.get("id") or fid,
            "label_lon": props.get("label_lon"),
            "label_lat": props.get("label_lat"),
            "oceanic": props.get("oceanic"),
            "region": props.get("region"),
            "division": props.get("division"),
        },
        "geometry": {"type": "Polygon", "coordinates": [best_ring]},
    }


def _ring_of(feature: Dict[str, Any]) -> List[List[float]]:
    coords = (feature.get("geometry") or {}).get("coordinates") or []
    return coords[0] if coords else []


def index_features(features: Iterable[Dict[str, Any]]) -> Dict[str, Dict[str, Any]]:
    """id → feature（重复 id 保留面积更大者）。"""
    by_id: Dict[str, Dict[str, Any]] = {}
    for feature in features:
        fid = str((feature.get("properties") or {}).get("id") or "").upper()
        if not fid:
            continue
        existing = by_id.get(fid)
        if existing is None:
            by_id[fid] = feature
            continue
        if ring_area(_ring_of(feature)) > ring_area(_ring_of(existing)):
            by_id[fid] = feature
    return by_id


# ------------------------------------------------------------------ FIR 数据加载
def _fir_candidates() -> List[Path]:
    """FIR 边界文件候选路径（Node: backend/src/data/fir_boundaries.json）。"""
    configured = env_str("FIR_BOUNDARIES_FILE", "")
    candidates: List[Path] = []
    if configured:
        candidates.append(Path(configured))
    candidates += [
        PROJECT_ROOT / "data" / "fir_boundaries.json",
        PROJECT_ROOT.parent / "backend" / "src" / "data" / "fir_boundaries.json",
        Path("/opt/cwfly/backend/src/data/fir_boundaries.json"),
        Path("/opt/cwfly/backend-py/data/fir_boundaries.json"),
    ]
    return candidates


def _load_sync() -> Dict[str, Any]:
    """同步加载（在 to_thread 中执行）：先读 GeoJSON，失败回退内置简化 FIR。"""
    for path in _fir_candidates():
        try:
            if not path.is_file():
                continue
            parsed = json.loads(path.read_text(encoding="utf-8", errors="replace"))
            if parsed and isinstance(parsed.get("features"), list) and parsed["features"]:
                features = [f for f in (normalize_vatspy_feature(x) for x in parsed["features"]) if f]
                if features:
                    return {"features": features, "byId": index_features(features), "source": "vatspy"}
        except Exception as exc:  # 单个候选失败继续下一个
            log.warning("[boundaries] 加载 %s 失败，尝试下一个候选: %s", path, exc)
    builtin = _builtin_features()
    return {"features": builtin, "byId": index_features(builtin), "source": "builtin"}


async def load_fir_boundaries(force: bool = False) -> Dict[str, Any]:
    """异步加载 FIR 边界（进程内缓存；`force=True` 重新加载）。"""
    global _fir_boundaries, _load_lock
    if _fir_boundaries is not None and not force:
        return _fir_boundaries
    if _load_lock is None:
        _load_lock = asyncio.Lock()
    async with _load_lock:
        if _fir_boundaries is not None and not force:
            return _fir_boundaries
        _fir_boundaries = await asyncio.to_thread(_load_sync)
        return _fir_boundaries


def fir_source() -> Optional[str]:
    """已加载数据源（'vatspy' | 'builtin' | None），便于排障接口使用。"""
    return (_fir_boundaries or {}).get("source")


# ------------------------------------------------------------------ 多边形生成
def create_circle_polygon(lat: float, lon: float, radius_km: float, points: int = 64) -> List[List[float]]:
    """圆形多边形 [[lon, lat], ...]（保留与 Node 同名实现，供调试/未来使用）。"""
    coords: List[List[float]] = []
    lat_rad = radius_km / 111.32
    denom = 111.32 * math.cos(lat * math.pi / 180)
    lon_rad = radius_km / denom if denom else 0.0
    for i in range(points + 1):
        angle = (i / points) * 2 * math.pi
        coords.append([lon + lon_rad * math.cos(angle), lat + lat_rad * math.sin(angle)])
    return coords


def create_sector_polygon(lat: float, lon: float, radius_km: float, sides: int = 8) -> List[Dict[str, float]]:
    """扇区多边形 [{lon, lat}, ...]（偏移角由经纬度决定，保证同一席位朝向稳定）。"""
    coords: List[Dict[str, float]] = []
    lat_rad = radius_km / 111.32
    denom = 111.32 * math.cos(lat * math.pi / 180)
    lon_rad = radius_km / denom if denom else 0.0
    offset = ((lat * 7 + lon * 13) % 360) * math.pi / 180
    for i in range(sides):
        angle = (i / sides) * 2 * math.pi + offset
        coords.append(
            {
                "lon": lon + lon_rad * math.cos(angle),
                "lat": lat + lat_rad * math.sin(angle),
            }
        )
    return coords


# ------------------------------------------------------------------ 呼号解析
def parse_controller_type(callsign: str) -> Dict[str, str]:
    upper = (callsign or "").upper()
    for suffix in ("_CTR", "_APP", "_TWR", "_GND", "_DEL", "_FSS"):
        if upper.endswith(suffix):
            return {"type": suffix[1:], "suffix": suffix}
    return {"type": "UNKNOWN", "suffix": ""}


_ICAO4_RE = re.compile(r"^[A-Z0-9]{4}$")


def extract_airport_icao(callsign: str) -> Optional[str]:
    """`ZSPD_TWR` → `ZSPD`（取第一个下划线前 4 位码）。"""
    parts = (callsign or "").upper().split("_")
    if len(parts) >= 2:
        icao = parts[0]
        if _ICAO4_RE.match(icao):
            return icao
    return None


# 机场 → FIR/管制区映射（与 Node 表逐条一致；中国 + 常见国际枢纽）
AIRPORT_TO_FIR: Dict[str, str] = {
    # —— 华北：北京管制区 ZBPE ——
    "ZBAA": "ZBPE", "ZBAD": "ZBPE", "ZBTJ": "ZBPE", "ZBSJ": "ZBPE", "ZBYN": "ZBPE",
    "ZBDT": "ZBPE", "ZBLL": "ZBPE", "ZBZJ": "ZBPE", "ZBCZ": "ZBPE", "ZBSH": "ZBPE",
    "ZBXZ": "ZBPE", "ZBLA": "ZBPE", "ZBES": "ZBPE", "ZBHD": "ZBPE",
    # 呼和浩特管制区 ZBHH
    "ZBHH": "ZBHH", "ZBDS": "ZBHH", "ZBYC": "ZBHH", "ZBTL": "ZBHH",
    # —— 华东：上海管制区 ZSHA ——
    "ZSSS": "ZSHA", "ZSPD": "ZSHA", "ZSNJ": "ZSHA", "ZSHC": "ZSHA", "ZSNB": "ZSHA",
    "ZSWX": "ZSHA", "ZSNT": "ZSHA", "ZSYT": "ZSHA", "ZSLY": "ZSHA", "ZSWZ": "ZSHA",
    "ZSGS": "ZSHA", "ZSXZ": "ZSHA", "ZSYA": "ZSHA", "ZSHZ": "ZSHA", "ZSJG": "ZSHA",
    "ZSJH": "ZSHA", "ZSCG": "ZSHA", "ZSQD": "ZSQD", "ZSJN": "ZSJN", "ZSOF": "ZSOF",
    "ZSCN": "ZSCN", "ZSAM": "ZSAM",
    # —— 中南：广州管制区 ZGZU ——
    "ZGGG": "ZGZU", "ZGSZ": "ZGZU", "ZGHA": "ZGZU", "ZGNN": "ZGZU", "ZGKL": "ZGZU",
    "ZHCC": "ZGZU", "ZGOW": "ZGZU", "ZGSD": "ZGZU", "ZGZJ": "ZGZU", "ZGBH": "ZGZU",
    "ZGDY": "ZGZU", "ZGHZ": "ZGZU", "ZGYY": "ZGZU", "ZHYC": "ZGZU", "ZHNY": "ZGZU",
    "ZHXF": "ZGZU", "ZHSN": "ZGZU", "ZHJZ": "ZGZU", "ZHLY": "ZGZU", "ZHEC": "ZGZU",
    # 武汉管制区 ZHWH
    "ZHHH": "ZHWH", "ZHSY": "ZHWH", "ZHGH": "ZHWH", "ZHTM": "ZHWH",
    # 三亚管制区 ZJSA
    "ZJHK": "ZJSA", "ZJSY": "ZJSA",
    # —— 西北：兰州管制区 ZLHW ——
    "ZLLL": "ZLHW", "ZLXN": "ZLHW", "ZLHZ": "ZLHW", "ZLYL": "ZLHW", "ZLDH": "ZLHW",
    "ZLIC": "ZLHW", "ZLGY": "ZLHW", "ZLZW": "ZLHW", "ZLQY": "ZLHW", "ZLSM": "ZLHW",
    "ZLAK": "ZLHW", "ZLJN": "ZLHW", "ZLYA": "ZLHW",
    # 西安管制区 ZLXY
    "ZLXY": "ZLXY",
    # —— 西南：成都管制区 ZUUU ——
    "ZUUU": "ZUUU", "ZUCK": "ZUUU", "ZUGY": "ZUUU", "ZUMY": "ZUUU", "ZUTF": "ZUUU",
    "ZUNC": "ZUUU", "ZUKJ": "ZUUU", "ZUXC": "ZUUU", "ZULZ": "ZUUU", "ZUDX": "ZUUU",
    "ZUBJ": "ZUUU", "ZUSN": "ZUUU", "ZUPS": "ZUUU", "ZUGZ": "ZUUU", "ZUPZ": "ZUUU",
    # 昆明管制区 ZPKM
    "ZPPP": "ZPKM", "ZPLJ": "ZPKM", "ZPDQ": "ZPKM", "ZPJH": "ZPKM", "ZPPX": "ZPKM",
    "ZPSM": "ZPKM", "ZPMS": "ZPKM", "ZPYM": "ZPKM", "ZPZT": "ZPKM", "ZPCZ": "ZPKM",
    # 拉萨管制区 ZULS
    "ZULS": "ZULS", "ZUNZ": "ZULS", "ZUNL": "ZULS", "ZUBD": "ZULS",
    # —— 东北：沈阳管制区 ZYSH / 哈尔滨 ZYHB ——
    "ZYTX": "ZYSH", "ZYTL": "ZYSH", "ZYCC": "ZYSH", "ZYQQ": "ZYSH", "ZYMJ": "ZYSH",
    "ZYYJ": "ZYSH", "ZYJZ": "ZYSH", "ZYDD": "ZYSH", "ZYCY": "ZYSH",
    "ZYHB": "ZYHB", "ZYMH": "ZYHB", "ZYLD": "ZYHB", "ZYHE": "ZYHB", "ZYFY": "ZYHB",
    # —— 新疆：乌鲁木齐管制区 ZWWW-N/S ——
    "ZWWW": "ZWWW-N", "ZWTN": "ZWWW-S", "ZWSH": "ZWWW-S", "ZWKM": "ZWWW-S",
    "ZWAK": "ZWWW-N", "ZWHM": "ZWWW-S", "ZWYN": "ZWWW-S", "ZWKL": "ZWWW-S",
    "ZWHZ": "ZWWW-N", "ZWDH": "ZWWW-S", "ZWKC": "ZWWW-N", "ZWBL": "ZWWW-N",
    "ZWSC": "ZWWW-S", "ZWQX": "ZWWW-S",
    # ==================== 国际常见航点 ====================
    # 日本：东京 FIR RJTG / 福冈 FIR RJBG
    "RJTT": "RJTG", "RJAA": "RJTG", "RJBB": "RJTG", "RJOO": "RJTG", "RJGG": "RJTG",
    "RJSS": "RJTG", "RJNK": "RJTG", "RJNS": "RJTG", "RJSN": "RJTG", "RJSF": "RJTG",
    "RJFF": "RJBG", "RJFU": "RJBG", "RJOA": "RJBG", "RJOK": "RJBG", "RJFR": "RJBG",
    # 韩国：仁川 FIR RKRR
    "RKSI": "RKRR", "RKSS": "RKRR", "RKPC": "RKRR", "RKTU": "RKRR", "RKPK": "RKRR",
    "RKNY": "RKRR", "RKPS": "RKRR", "RKJB": "RKRR",
    # 台湾：台北 FIR RCAA
    "RCTP": "RCAA", "RCSS": "RCAA", "RCKH": "RCAA", "RCMQ": "RCAA",
    # 港澳：香港 FIR VHHK
    "VHHH": "VHHK", "VMMC": "VHHK",
    # 新加坡 / 马来西亚
    "WSSS": "WSJC", "WMSA": "WMFC", "WMKK": "WMFC",
    # 泰国：曼谷 FIR VTBB
    "VTBS": "VTBB", "VTBD": "VTBB", "VTSP": "VTBB", "VTCC": "VTBB", "VTUD": "VTBB",
    # 越南：河内 VVHM、胡志明 VVHN
    "VVNB": "VVHM", "VVTS": "VVHN", "VVDN": "VVHN", "VVCR": "VVHN",
    # 印尼
    "WIII": "WAAF", "WADD": "WIIF",
    # 中东
    "OMDB": "OMAE", "OMAA": "OMAE", "OMSJ": "OMAE", "OTHH": "OTDF",
    "OERK": "OEJD", "OEJN": "OEJD", "OJAI": "OJAC",
    # 欧洲
    "EGLL": "EGTT", "EGKK": "EGTT", "EGGD": "EGTT", "EGPH": "EGPX", "EGPD": "EGPX",
    "EIDW": "EIDW", "LFPG": "LFFF", "LFPO": "LFFF", "LFLL": "LFFF", "LFMN": "LFFF",
    "EDDF": "EDGG", "EDDL": "EDGG", "EDDS": "EDWW", "EDDM": "EDMM",
    "EHAM": "EHAA", "EBBR": "EBBU", "LIRF": "LIRR", "LIML": "LIRR", "LIRN": "LIRR",
    "LEMD": "LECB", "LEBL": "LECB", "LPPT": "LPPC",
    # 美国（ARTCC）
    "KLAX": "KZLA", "KSAN": "KZLA", "KLAS": "KZLA",
    "KSFO": "KZOA", "KOAK": "KZOA", "KSJC": "KZOA",
    "KSEA": "KZSE", "KPDX": "KZSE", "KPHX": "KZAB", "KDEN": "KZDV", "KSLC": "KZLC",
    "KORD": "KZAU", "KMDW": "KZAU", "KATL": "KZTL", "KJFK": "KZNY", "KLGA": "KZNY",
    "KEWR": "KZNY", "KPHL": "KZNY", "KIAD": "KZDC", "KDCA": "KZDC", "KBWI": "KZDC",
    "KMIA": "KZMA", "KFLL": "KZMA", "KTPA": "KZMA", "KIAH": "KZHU", "KHOU": "KZHU",
    "KDFW": "KZFW", "KDAL": "KZFW", "KBOS": "KZBW", "KMSP": "KZMP", "KDTW": "KZOB",
    "KCLE": "KZOB", "KCMH": "KZOB", "KMEM": "KZME", "KSTL": "KZKC", "KMCI": "KZKC",
}

# 中国主要机场坐标（无导航数据时的兜底中心点，与 Node 表一致）
AIRPORT_POSITION: Dict[str, Tuple[float, float]] = {
    "ZBAA": (40.08, 116.58),
    "ZBTJ": (39.12, 117.35),
    "ZSSS": (31.14, 121.81),
    "ZSPD": (31.14, 121.80),
    "ZGGG": (23.39, 113.31),
    "ZGSZ": (22.64, 113.81),
    "ZUUU": (30.58, 103.95),
    "ZUCK": (29.72, 106.64),
    "ZLXY": (34.44, 108.75),
    "ZPPP": (25.02, 102.74),
    "ZHHH": (30.78, 114.21),
    "ZGHA": (28.19, 113.22),
    "ZSHC": (30.23, 120.43),
    "ZSNB": (29.82, 121.46),
    "ZSNJ": (31.74, 118.87),
    "ZSAM": (24.54, 118.13),
    "ZSFZ": (25.93, 119.66),
    "ZYTX": (41.64, 123.48),
    "ZYHB": (45.62, 126.25),
    "ZWWW": (43.91, 87.47),
    "ZULS": (29.30, 90.91),
    "ZUGY": (26.54, 106.80),
    "ZGNN": (22.61, 108.17),
    "ZJHK": (19.94, 110.46),
    "ZJSY": (18.30, 109.41),
    "ZPLJ": (26.68, 100.25),
    "ZPDQ": (27.54, 100.06),
    "ZBAD": (39.51, 116.41),
}


def get_airport_position(icao: Optional[str]) -> Optional[Dict[str, float]]:
    if not icao:
        return None
    pos = AIRPORT_POSITION.get(icao)
    if not pos:
        return None
    return {"lat": pos[0], "lon": pos[1]}


def get_fir_center(fir: Dict[str, Any]) -> Dict[str, float]:
    """FIR 中心点：优先 VATSpy label 坐标，否则顶点平均值。"""
    coords = _ring_of(fir)
    props = fir.get("properties") or {}
    lbl_lat = _parse_float_or_none(props.get("label_lat"))
    lbl_lon = _parse_float_or_none(props.get("label_lon"))
    if lbl_lat is not None and lbl_lon is not None:
        return {"lat": lbl_lat, "lon": lbl_lon}
    if not coords:
        return {"lat": 0.0, "lon": 0.0}
    sum_lat = sum(c[1] for c in coords)
    sum_lon = sum(c[0] for c in coords)
    return {"lat": sum_lat / len(coords), "lon": sum_lon / len(coords)}


def find_fir(callsign: str, airport_icao: Optional[str]) -> Optional[Dict[str, Any]]:
    """呼号直配 → 子扇区回退 → 机场映射表 → 机场本身是 FIR → 前缀兜底。"""
    firs = _fir_boundaries
    if not firs or not firs.get("features"):
        return None
    by_id: Dict[str, Dict[str, Any]] = firs.get("byId") or {}

    sector = (callsign or "").upper().replace("_CTR", "").replace("_", "-")

    if sector and sector in by_id:
        return by_id[sector]
    if sector and "-" in sector:
        main = sector.split("-")[0]
        if main in by_id:
            return by_id[main]
    if airport_icao:
        mapped = AIRPORT_TO_FIR.get(airport_icao)
        if mapped and mapped in by_id:
            return by_id[mapped]
    if airport_icao and airport_icao in by_id:
        return by_id[airport_icao]
    if airport_icao:
        prefix = airport_icao[:2]
        for feature in firs["features"]:
            fid = (feature.get("properties") or {}).get("id") or ""
            if fid.startswith(prefix) and "-" not in fid:
                return feature
    return None


# ------------------------------------------------------------------ 单席位边界
def get_controller_boundary(controller: Dict[str, Any]) -> Optional[Dict[str, Any]]:
    callsign = controller.get("callsign") or ""
    info = parse_controller_type(callsign)
    icao = extract_airport_icao(callsign)

    ap = get_airport_position(icao)
    center = ap or {
        "lat": controller.get("lat") or 35,
        "lon": controller.get("lon") or 110,
    }

    if info["type"] == "CTR":
        fir = find_fir(callsign, icao)
        if fir:
            coords = _ring_of(fir)
            props = fir.get("properties") or {}
            return {
                "callsign": callsign,
                "type": "CTR",
                "label": props.get("name") or props.get("id"),
                "icao": props.get("id"),
                "polygon": [{"lon": c[0], "lat": c[1]} for c in coords],
                "centerPoint": get_fir_center(fir),
                "strokeColor": "#d6e41c",
                "strokeWeight": 1.5,
                "strokeOpacity": 0.5,
                "fillColor": "#2e7d32",
                "fillOpacity": 0.2,
                "strokeDash": False,
            }
    elif info["type"] == "APP":
        poly = create_sector_polygon(center["lat"], center["lon"], 80, 12)
        return {
            "callsign": callsign,
            "type": "APP",
            "label": f"{callsign} (APP)",
            "icao": icao or "",
            "polygon": poly,
            "centerPoint": center,
            "strokeColor": "#920197",
            "strokeWeight": 1.5,
            "strokeOpacity": 0.45,
            "fillColor": "#1976d2",
            "fillOpacity": 0.18,
            "strokeDash": True,
            "radiusKm": 80,
        }
    elif info["type"] == "TWR":
        return {
            "callsign": callsign,
            "type": "TWR",
            "label": f"{callsign} (TWR)",
            "icao": icao or "",
            "point": center,
            "strokeColor": "#c92121",
        }
    elif info["type"] == "GND":
        return {
            "callsign": callsign,
            "type": "GND",
            "label": f"{callsign} (GND)",
            "icao": icao or "",
            "point": center,
            "strokeColor": "#1fd67b",
        }
    elif info["type"] == "DEL":
        return {
            "callsign": callsign,
            "type": "DEL",
            "label": f"{callsign} (DEL)",
            "icao": icao or "",
            "point": center,
            "strokeColor": "#00bcd4",
        }
    elif info["type"] == "FSS":
        fir = find_fir(callsign, icao)
        if fir:
            coords = _ring_of(fir)
            props = fir.get("properties") or {}
            return {
                "callsign": callsign,
                "type": "FSS",
                "label": props.get("name") or props.get("id"),
                "icao": props.get("id"),
                "polygon": [{"lon": c[0], "lat": c[1]} for c in coords],
                "centerPoint": get_fir_center(fir),
                "strokeColor": "#d6e41c",
                "strokeWeight": 1.5,
                "strokeOpacity": 0.5,
                "fillColor": "#6a1b9a",
                "fillOpacity": 0.2,
                "strokeDash": False,
            }
        return None
    else:
        return {
            "callsign": callsign,
            "type": info["type"],
            "label": callsign,
            "icao": icao or "",
            "point": center,
            "strokeColor": "#546e7a",
        }

    # CTR 无 FIR 数据时的备用：仅点位
    return {
        "callsign": callsign,
        "type": "CTR",
        "label": callsign,
        "icao": icao or "",
        "point": center,
        "strokeColor": "#2e7d32",
    }


# ------------------------------------------------------------------ 多 CTR 合并
def _merge_ctr_polygons(ctr_list: List[Dict[str, Any]]) -> Optional[Dict[str, Any]]:
    """多个 CTR 边界做并集 → 单个「管制区边界」（Node 用 @turf/union）。"""
    try:
        from shapely.geometry import Polygon  # type: ignore[import-not-found]
        from shapely.ops import unary_union  # type: ignore[import-not-found]
    except Exception:
        return None

    def close_ring(ring: List[List[float]]) -> List[List[float]]:
        if ring and ring[0][0] == ring[-1][0] and ring[0][1] == ring[-1][1]:
            return ring
        return ring + [ring[0]]

    polygons = []
    try:
        for boundary in ctr_list:
            ring = close_ring([[pt["lon"], pt["lat"]] for pt in boundary["polygon"]])
            if len(ring) < 4:
                return None
            poly = Polygon(ring)
            if not poly.is_valid:
                poly = poly.buffer(0)  # 自交修复（turf 内部同样做清理）
            if poly.is_empty:
                return None
            polygons.append(poly)
        merged = unary_union(polygons)
        if merged.is_empty:
            return None
        geom = merged
        if geom.geom_type == "MultiPolygon":
            geom = list(geom.geoms)[0]  # Node 只取 coordinates[0]
        if geom.geom_type != "Polygon":
            return None
        outer = [[x, y] for x, y in geom.exterior.coords]
        minx, miny, maxx, maxy = merged.bounds
        center = {"lat": (miny + maxy) / 2, "lon": (minx + maxx) / 2}
    except Exception:
        return None

    return {
        "callsign": "CTR",
        "type": "CTR",
        "label": "管制区边界",
        "icao": "",
        "polygon": [{"lon": c[0], "lat": c[1]} for c in outer],
        "centerPoint": center,
        "strokeColor": "#2e7d32",
        "strokeWeight": 1.5,
        "strokeOpacity": 0.5,
        "fillColor": "#2e7d32",
        "fillOpacity": 0.2,
        "strokeDash": False,
    }


_OBS_RE = re.compile(r"^.*_OBS$", re.IGNORECASE)


async def get_controller_boundaries(controllers: Optional[Iterable[Dict[str, Any]]]) -> List[Dict[str, Any]]:
    """为所有在线管制员生成边界（`GET /api/flightplans/fsd/boundaries` 数据源）。

    :param controllers: 管制员列表（callsign/lat/lon 必需，其余字段可缺省）
    :return: 与 Node `getControllerBoundaries()` 完全同结构的列表
    """
    if controllers is None or isinstance(controllers, (str, bytes, dict)):
        return []
    await load_fir_boundaries()

    # 连飞地图不显示 OBS（实习管制）席位
    visible = [c for c in controllers if not _OBS_RE.match(str(c.get("callsign") or "").strip())]

    results: List[Dict[str, Any]] = []
    for controller in visible:
        boundary = get_controller_boundary(controller)
        if not boundary:
            continue
        polygon = boundary.get("polygon")
        if (polygon is not None and len(polygon) >= 3) or boundary.get("point"):
            results.append(boundary)

    ctr_list = [b for b in results if b.get("type") == "CTR" and len(b.get("polygon") or []) >= 3]
    others = [b for b in results if b.get("type") != "CTR"]

    if len(ctr_list) > 1:
        merged = _merge_ctr_polygons(ctr_list)
        if merged is not None:
            return [merged] + others
    return results


# ------------------------------------------------------------------ 内置简化 FIR
# (id, name, country, [[lon, lat], ...]) —— 与 Node getBuiltinFirs() 数据逐点一致
_BUILTIN_FIRS: List[Tuple[str, str, str, List[List[float]]]] = [
    # ==================== 中国 ====================
    ("ZBAA", "北京 FIR", "CN", [[108,48],[120,48],[126,42],[126,38],[124,36],[122,34],[120,32],
        [118,30],[116,28],[114,26],[110,26],[108,28],[106,30],[104,34],[106,38],[108,42],[108,48]]),
    ("ZSSS", "上海 FIR", "CN", [[118,34],[122,34],[126,32],[126,28],[124,26],[122,24],[120,22],
        [118,22],[116,24],[116,28],[118,30],[118,34]]),
    ("ZGGG", "广州 FIR", "CN", [[108,26],[116,24],[118,22],[120,22],[118,20],[116,18],[112,18],
        [110,20],[108,22],[106,24],[108,26]]),
    ("ZUUU", "成都 FIR", "CN", [[97,34],[104,34],[106,30],[108,28],[110,26],[108,26],[106,24],
        [104,26],[100,26],[97,28],[95,30],[97,34]]),
    ("ZPKM", "昆明 FIR", "CN", [[97,28],[100,26],[104,26],[106,24],[104,22],[100,22],[97,24],[95,26],[97,28]]),
    ("ZLXY", "西安 FIR", "CN", [[104,38],[106,38],[108,42],[108,38],[106,34],[104,34],[102,32],[100,34],[102,36],[104,38]]),
    ("ZYSH", "沈阳 FIR", "CN", [[118,42],[126,42],[132,40],[132,36],[130,34],[126,34],[124,36],[122,38],[120,38],[118,40],[118,42]]),
    ("ZWWW", "乌鲁木齐 FIR", "CN", [[73,50],[90,50],[96,46],[96,40],[90,36],[85,34],[80,36],[73,40],[73,50]]),
    ("ZGKL", "桂林 FIR", "CN", [[108,26],[110,26],[112,24],[110,22],[108,22],[106,24],[108,26]]),
    ("ZJH", "海口 FIR", "CN", [[108,20],[116,18],[118,16],[114,14],[110,16],[108,18],[108,20]]),
    # ==================== 日本 ====================
    ("RJAA", "东京 FIR / 福冈 FIR", "JP", [[127,35],[132,33],[135,35],[140,35],[145,40],[145,45],[140,48],
        [135,50],[130,50],[127,45],[125,40],[125,35],[127,35]]),
    ("ROAH", "那霸 FIR（冲绳）", "JP", [[122,24],[125,24],[128,26],[130,28],[128,30],[125,28],[122,26],[122,24]]),
    # ==================== 韩国 ====================
    ("RKRR", "仁川 FIR", "KR", [[124,38],[126,35],[128,35],[130,37],[130,40],[128,42],[126,42],[124,40],[124,38]]),
    # ==================== 东南亚 ====================
    ("VTSM", "曼谷 FIR", "TH", [[100,5],[105,5],[107,8],[107,14],[105,18],[102,20],[100,18],
        [98,16],[97,12],[97,8],[100,5]]),
    ("VVTS", "胡志明 FIR", "VN", [[102,8],[105,5],[108,5],[110,8],[110,12],[108,16],[105,18],
        [102,18],[100,14],[100,10],[102,8]]),
    ("WSJC", "新加坡 FIR", "SG", [[100,-2],[105,-2],[107,0],[107,5],[105,5],[103,5],[100,3],[100,-2]]),
    ("WAAF", "雅加达 FIR", "ID", [[100,-8],[108,-8],[115,-8],[118,-5],[118,0],[115,0],[110,0],
        [105,0],[100,0],[97,-3],[97,-6],[100,-8]]),
    ("RPMZ", "马尼拉 FIR", "PH", [[116,5],[120,5],[125,5],[128,8],[128,15],[125,18],[120,20],
        [116,18],[114,15],[114,10],[116,5]]),
    ("WMFC", "吉隆坡 FIR", "MY", [[100,0],[105,0],[108,3],[108,8],[105,8],[103,8],[100,6],[100,0]]),
    # ==================== 北美 ====================
    ("KZLA", "洛杉矶 ARTCC（ZLA）", "US", [[-126,38],[-120,38],[-118,36],[-117,34],[-114,34],[-114,32],
        [-117,32],[-120,32],[-122,34],[-124,36],[-126,38]]),
    ("KZOA", "奥克兰 ARTCC（ZOA）", "US", [[-126,42],[-120,42],[-120,38],[-124,36],[-126,38],[-126,42]]),
    ("KZSE", "西雅图 ARTCC（ZSE）", "US", [[-126,48],[-120,48],[-120,42],[-124,40],[-126,42],[-126,48]]),
    ("KZMP", "明尼阿波利斯 ARTCC（ZMP）", "US", [[-105,49],[-97,49],[-97,43],[-100,42],[-105,43],[-105,49]]),
    ("KZAU", "芝加哥 ARTCC（ZAU）", "US", [[-93,44],[-87,44],[-87,40],[-90,39],[-93,40],[-93,44]]),
    ("KZNY", "纽约 ARTCC（ZNY）", "US", [[-80,42],[-73,42],[-73,40],[-75,38],[-78,38],[-80,40],[-80,42]]),
    ("KZDC", "华盛顿 ARTCC（ZDC）", "US", [[-80,40],[-75,38],[-75,36],[-77,36],[-80,38],[-80,40]]),
    ("KZTL", "亚特兰大 ARTCC（ZTL）", "US", [[-85,38],[-80,38],[-80,34],[-83,32],[-87,32],[-88,35],[-85,38]]),
    ("KZMA", "迈阿密 ARTCC（ZMA）", "US", [[-85,30],[-80,30],[-80,24],[-82,22],[-85,24],[-85,30]]),
    ("KZHU", "休斯顿 ARTCC（ZHU）", "US", [[-98,34],[-93,34],[-93,28],[-97,26],[-100,28],[-100,32],[-98,34]]),
    ("KZFW", "沃斯堡 ARTCC（ZFW）", "US", [[-100,36],[-97,36],[-97,32],[-100,32],[-100,36]]),
    ("KZDV", "丹佛 ARTCC（ZDV）", "US", [[-109,41],[-102,41],[-102,37],[-105,36],[-109,37],[-109,41]]),
    ("KZAB", "阿尔伯克基 ARTCC（ZAB）", "US", [[-110,38],[-102,37],[-102,32],[-106,31],[-110,32],[-110,38]]),
    ("KZKC", "堪萨斯城 ARTCC（ZKC）", "US", [[-97,40],[-93,40],[-93,36],[-97,36],[-97,40]]),
    ("KZOB", "克利夫兰 ARTCC（ZOB）", "US", [[-87,44],[-80,44],[-80,40],[-83,40],[-87,40],[-87,44]]),
    ("CZEG", "埃德蒙顿 FIR", "CA", [[-130,60],[-110,60],[-110,54],[-114,52],[-120,52],[-130,55],[-130,60]]),
    ("CZVR", "温哥华 FIR", "CA", [[-140,54],[-130,55],[-120,52],[-120,48],[-126,48],[-130,50],[-140,52],[-140,54]]),
    ("CZWG", "温尼伯 FIR", "CA", [[-110,60],[-95,60],[-95,54],[-100,52],[-110,54],[-110,60]]),
    ("CZUL", "蒙特利尔 FIR", "CA", [[-80,52],[-70,52],[-65,48],[-70,45],[-75,45],[-80,48],[-80,52]]),
    ("CZYZ", "多伦多 FIR", "CA", [[-95,54],[-80,52],[-80,48],[-85,44],[-90,44],[-95,48],[-95,54]]),
    # ==================== 欧洲 ====================
    ("EDUU", "慕尼黑 UIR / 德国 FIR", "DE", [[5,47],[10,47],[13,48],[15,50],[15,54],[13,55],[10,55],[7,54],[5,52],[5,47]]),
    ("EGTT", "伦敦 FIR / 苏格兰 FIR", "GB", [[-8,52],[0,52],[2,54],[2,58],[0,60],[-3,60],[-6,58],[-8,55],[-8,52]]),
    ("LFFF", "巴黎 FIR", "FR", [[-5,45],[0,45],[2,47],[5,47],[5,50],[2,50],[0,50],[-2,48],[-5,47],[-5,45]]),
    ("LIRR", "罗马 FIR / 米兰 FIR", "IT", [[6,44],[10,44],[12,43],[14,42],[14,38],[12,37],[10,38],[8,38],[6,40],[6,44]]),
    ("LECB", "巴塞罗那 FIR / 马德里 FIR", "ES", [[-10,40],[-2,40],[0,42],[3,42],[3,44],[0,44],[-5,44],[-10,42],[-10,40]]),
    ("EBBU", "布鲁塞尔 FIR", "BE", [[2,49],[5,49],[6,51],[5,52],[3,52],[2,50],[2,49]]),
    ("EHAA", "阿姆斯特丹 FIR", "NL", [[3,51],[5,51],[7,52],[7,54],[5,54],[3,53],[3,51]]),
    ("EKDK", "哥本哈根 FIR", "DK", [[8,54],[12,54],[15,55],[15,57],[12,57],[10,56],[8,55],[8,54]]),
    ("ESOS", "瑞典 FIR", "SE", [[11,55],[15,55],[18,56],[20,58],[20,62],[18,64],[15,65],[12,64],[10,62],[10,58],[11,55]]),
    ("ENOB", "挪威 FIR", "NO", [[4,57],[10,57],[12,58],[15,60],[15,65],[12,68],[10,70],[5,70],[4,68],[4,60],[4,57]]),
    ("EFIN", "芬兰 FIR", "FI", [[20,60],[25,60],[28,62],[30,65],[30,70],[28,70],[25,70],[22,68],[20,65],[20,60]]),
    ("UUWV", "莫斯科 FIR", "RU", [[35,50],[40,48],[45,48],[50,50],[50,55],[48,58],[45,60],[40,60],[35,58],[33,55],[33,52],[35,50]]),
    ("ULLL", "圣彼得堡 FIR", "RU", [[28,56],[33,55],[35,58],[33,62],[30,64],[28,62],[27,60],[27,58],[28,56]]),
    ("LRBB", "布加勒斯特 FIR", "RO", [[20,44],[25,44],[28,45],[30,47],[30,48],[28,48],[25,48],[22,47],[20,44]]),
    ("LZBB", "布拉迪斯拉发 FIR / 维也纳 FIR", "AT", [[12,46],[16,46],[18,48],[17,50],[15,50],[13,49],[12,47],[12,46]]),
    ("EPWW", "华沙 FIR", "PL", [[14,49],[18,49],[22,50],[24,52],[24,54],[22,55],[18,55],[15,54],[14,52],[14,49]]),
    # ==================== 中东 ====================
    ("OAKX", "达卡 FIR / 巴林 FIR", "BH", [[48,24],[52,24],[55,25],[56,27],[55,28],[52,28],[50,27],[48,26],[48,24]]),
    ("ORBB", "巴格达 FIR", "IQ", [[38,30],[44,30],[46,32],[46,36],[44,38],[42,38],[40,37],[38,35],[38,30]]),
    ("OJAC", "阿曼 FIR", "OM", [[52,16],[56,16],[58,18],[58,22],[56,24],[54,24],[52,22],[52,18],[52,16]]),
    ("OSTT", "大马士革 FIR / 贝鲁特 FIR", "SY", [[35,32],[38,32],[40,34],[40,36],[38,37],[36,37],[35,35],[35,32]]),
    ("LTBB", "安卡拉 FIR", "TR", [[26,36],[32,36],[36,36],[38,38],[38,40],[36,42],[32,42],[28,42],[26,40],[26,36]]),
    # ==================== 南亚 ====================
    ("VIDF", "德里 FIR", "IN", [[72,28],[78,28],[82,26],[84,28],[84,32],[82,34],[78,34],[76,32],[74,30],[72,28]]),
    ("VEGF", "加尔各答 FIR", "IN", [[82,22],[86,22],[90,24],[92,26],[92,22],[90,20],[86,18],[84,20],[82,22]]),
    ("VABF", "孟买 FIR", "IN", [[68,22],[72,22],[76,20],[78,18],[76,16],[72,16],[68,18],[68,22]]),
    ("OPKR", "卡拉奇 FIR", "PK", [[62,24],[68,22],[70,24],[70,28],[68,30],[66,30],[64,28],[62,26],[62,24]]),
    # ==================== 大洋洲 ====================
    ("YBBB", "布里斯班 FIR", "AU", [[145,-20],[150,-20],[155,-22],[155,-28],[153,-30],[150,-30],[148,-28],[145,-25],[145,-20]]),
    ("YMMM", "墨尔本 FIR", "AU", [[140,-30],[145,-25],[148,-28],[150,-32],[150,-38],[148,-40],[145,-40],[142,-38],[140,-35],[140,-30]]),
    ("NZZO", "奥克兰 FIR", "NZ", [[165,-35],[170,-35],[175,-37],[175,-42],[173,-44],[170,-44],[168,-42],[165,-38],[165,-35]]),
    # ==================== 南美 ====================
    ("SBAO", "巴西利亚 FIR", "BR", [[-50,-10],[-45,-10],[-40,-12],[-38,-15],[-40,-18],[-45,-20],[-48,-20],[-50,-15],[-50,-10]]),
    ("SBRE", "累西腓 FIR", "BR", [[-38,-5],[-35,-5],[-33,-8],[-33,-12],[-35,-15],[-38,-15],[-38,-5]]),
    ("SAEF", "埃塞萨 FIR / 布宜诺斯艾利斯", "AR", [[-62,-30],[-58,-30],[-55,-32],[-55,-36],[-58,-38],[-60,-38],[-62,-35],[-62,-30]]),
    ("SCEZ", "智利 FIR", "CL", [[-76,-20],[-70,-20],[-68,-22],[-68,-30],[-70,-33],[-72,-35],[-75,-33],[-76,-25],[-76,-20]]),
    # ==================== 非洲 ====================
    ("HAAA", "亚的斯亚贝巴 FIR", "ET", [[33,5],[38,5],[42,8],[44,10],[44,14],[42,15],[38,15],[35,12],[33,10],[33,5]]),
    ("HECC", "开罗 FIR", "EG", [[24,22],[30,22],[34,24],[35,28],[35,30],[34,32],[30,32],[28,30],[26,28],[24,25],[24,22]]),
    ("FAJA", "约翰内斯堡 FIR", "ZA", [[22,-28],[26,-28],[30,-26],[32,-28],[32,-32],[30,-34],[28,-34],[26,-32],[24,-30],[22,-28]]),
    ("DNKK", "拉各斯 FIR", "NG", [[2,4],[6,4],[10,6],[12,8],[12,12],[10,12],[8,12],[6,10],[4,8],[2,6],[2,4]]),
    ("GOOO", "达喀尔 FIR", "SN", [[-20,12],[-15,12],[-12,14],[-12,16],[-15,18],[-17,18],[-20,16],[-20,12]]),
]


def _builtin_features() -> List[Dict[str, Any]]:
    """内置简化 FIR → GeoJSON Feature 列表（结构与 VATSpy 规范化后一致）。"""
    return [
        {
            "properties": {"id": fid, "name": name, "country": country},
            "geometry": {"type": "Polygon", "coordinates": [coords]},
        }
        for fid, name, country, coords in _BUILTIN_FIRS
    ]


__all__ = [
    "RADIUS",
    "AIRPORT_TO_FIR",
    "AIRPORT_POSITION",
    "ring_area",
    "normalize_vatspy_feature",
    "index_features",
    "load_fir_boundaries",
    "fir_source",
    "create_circle_polygon",
    "create_sector_polygon",
    "parse_controller_type",
    "extract_airport_icao",
    "get_airport_position",
    "get_fir_center",
    "find_fir",
    "get_controller_boundary",
    "get_controller_boundaries",
]
