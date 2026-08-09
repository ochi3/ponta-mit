/**
 * DMU P5 Exaflare Viewer
 * 開始座標・進行量: FFLogs cast (47932/47933) から復元
 *   xiv*(1/100) → sim: (xiv-100)*2.3 / 進行は 11.5 格子
 * タイミング等: Waju-Sims dmu_exaflare*.gd 準拠
 * ウェイマークは waymarks.gd / dmu_global.gd / waymark_menu.gd 準拠
 */

const ARENA_RADIUS = 20.11;
const AOE_RADIUS = 14.0;
const AOE_LIFETIME = 0.6; // dmu_exaflare.gd
const HIT_COUNT = 7;
const WORLD_HALF = 82;
const MARKER_HIT_RADIUS = 3.5;
const STORAGE_KEY = "dmu-exaflare-viewer-v6";
const DEFAULT_WAYMARK_PRESET = "preset_1"; // Diamond
/** xivstrat DMU P5 床（ローカルコピー） */
const FLOOR_IMAGE_URL = "./assets/P5.webp";
/** アリーナ半径に対する床画像の拡大率 */
const FLOOR_SCALE = 2.35;
const DMU_MAP_ID = 1094;
const LANE_LABELS = ["左", "中", "右"];
const WAVE_PAIR_COUNT = 5; // (1+2)(2+3)(3+4)(4+5)(5+6)
const WAVE_COUNT = 6;

/** dmu_exaflare_controller / ExaflareSequenceAnim: spawn_exa_set 間隔 */
const WAVE_SPAWN_INTERVAL = 2.5;
/** fade_in length → その後 exaflare_timeline 開始 */
const FADE_IN_DURATION = 0.2;
/**
 * exaflare_timeline 内の exa_hit(0..6) 時刻（秒）
 * PackedFloat32Array(4.3, 4.8333, 5.3667, 5.9, 6.4333, 6.9667, 7.5)
 */
const HIT_TIMES_IN_TIMELINE = [4.3, 4.8333, 5.3667, 5.9, 6.4333, 6.9667, 7.5];

/**
 * FFLogs ability 47932 cast の sourceResources 座標（15戦で完全一致）。
 * xiv 例: NW中左 (7500,9000) → sim (-57.5, -23)
 * Waju-Sims 値より約 3.1 内側（実機ログ側を正とする）。
 */
const STARTING_POSITIONS = {
  nw: {
    0: { left: [-69.0, -11.5], right: [-34.5, -46.0] },
    1: { left: [-57.5, -23.0], right: [-23.0, -57.5] },
    2: { left: [-46.0, -34.5], right: [-11.5, -69.0] },
  },
  ne: {
    0: { left: [11.5, -69.0], right: [46.0, -34.5] },
    1: { left: [23.0, -57.5], right: [57.5, -23.0] },
    2: { left: [34.5, -46.0], right: [69.0, -11.5] },
  },
};

/** ログ座標は 11.5 格子（||Δ|| = 11.5√2 ≈ 16.263）。Waju の 11.785 より実機に近い */
const INCREMENT = {
  nw: [11.5, 11.5],
  ne: [-11.5, 11.5],
};

/** Waju-Sims waymarks.tscn の色 */
const MARKER_TYPES = [
  { id: "A", key: "wm_a", label: "A", color: "#ff0000", shape: "letter" },
  { id: "B", key: "wm_b", label: "B", color: "#878f00", shape: "letter" },
  { id: "C", key: "wm_c", label: "C", color: "#208cff", shape: "letter" },
  { id: "D", key: "wm_d", label: "D", color: "#c814ff", shape: "letter" },
  { id: "1", key: "wm_1", label: "1", color: "#ff0000", shape: "number" },
  { id: "2", key: "wm_2", label: "2", color: "#878f00", shape: "number" },
  { id: "3", key: "wm_3", label: "3", color: "#208cff", shape: "number" },
  { id: "4", key: "wm_4", label: "4", color: "#c814ff", shape: "number" },
];

/** Waju-Sims dmu_global.gd プリセット */
const WAYMARK_PRESETS = {
  preset_1: {
    name: "Diamond",
    wm_1: [-13.8, -13.8],
    wm_2: [13.8, -13.8],
    wm_3: [13.8, 13.8],
    wm_4: [-13.8, 13.8],
    wm_a: [0, -27.6],
    wm_b: [27.6, 0],
    wm_c: [0, 27.6],
    wm_d: [-27.6, 0],
  },
  preset_2: {
    name: "Cross (X13)",
    wm_1: [-14.955397, -14.955397],
    wm_2: [14.955397, -14.955397],
    wm_3: [14.955397, 14.955397],
    wm_4: [-14.955397, 14.955397],
    wm_a: [-28.24936, -28.24936],
    wm_b: [28.24936, -28.24936],
    wm_c: [28.24936, 28.24936],
    wm_d: [-28.24936, 28.24936],
  },
  preset_3: {
    name: "Circle",
    wm_1: [-21.15, -21.15],
    wm_2: [21.15, -21.15],
    wm_3: [21.15, 21.15],
    wm_4: [-21.15, 21.15],
    wm_a: [0, -29.375],
    wm_b: [29.375, 0],
    wm_c: [0, 29.375],
    wm_d: [-29.375, 0],
  },
};

const IMPORT_KEYS = {
  wm_a: "A",
  wm_b: "B",
  wm_c: "C",
  wm_d: "D",
  wm_1: "One",
  wm_2: "Two",
  wm_3: "Three",
  wm_4: "Four",
};

const WAVE_COLORS = [
  "255, 139, 92",
  "77, 183, 255",
  "240, 180, 41",
  "94, 214, 160",
  "181, 123, 255",
  "255, 111, 174",
];

/** 中央〜ABCD中間付近の安置チェック点（画像の丸位置） */
const SAFE_SPOT_RADIUS = 11.5;
const SAFE_SPOTS = [
  { id: "N", x: 0, z: -SAFE_SPOT_RADIUS },
  { id: "E", x: SAFE_SPOT_RADIUS, z: 0 },
  { id: "S", x: 0, z: SAFE_SPOT_RADIUS },
  { id: "W", x: -SAFE_SPOT_RADIUS, z: 0 },
];

/** 安置ルート用: N/E/S/W = A/B/C/D（Diamond） */
const CARDINAL_SPOTS = [
  { id: "A", x: 0, z: -SAFE_SPOT_RADIUS },
  { id: "B", x: SAFE_SPOT_RADIUS, z: 0 },
  { id: "C", x: 0, z: SAFE_SPOT_RADIUS },
  { id: "D", x: -SAFE_SPOT_RADIUS, z: 0 },
];
const CW_NEXT = { A: "B", B: "C", C: "D", D: "A" };
const CCW_NEXT = { A: "D", D: "C", C: "B", B: "A" };
const LANE_PERMS = [
  [0, 1, 2],
  [0, 2, 1],
  [1, 0, 2],
  [1, 2, 0],
  [2, 0, 1],
  [2, 1, 0],
];

const state = {
  waveSelectMode: "single", // single | pair
  waveIndex: 0, // single: 0..5
  pairIndex: 0, // pair: 0: W1+2 … 4: W5+6
  selectedWaves: new Set([0]),
  startDir: "nw", // 実機どおり NW 先（SIMはシャッフルあり）
  nwOrder: [0, 1, 2],
  neOrder: [0, 1, 2],
  showSafeCircles: true,
  showLanes: true,
  viewMode: "static", // static | sim
  simAllWaves: true,
  simShowTelegraph: true,
  simLoop: false,
  simSpeed: 1,
  simTime: 0,
  simPlaying: false,
  activeMarkerType: null, // "A" | "1" | ...
  markers: null, // load時に Diamond を既定適用
  hoverWorld: null,
};

const canvas = document.getElementById("arena");
const ctx = canvas.getContext("2d");
const stage = document.querySelector(".stage");
const appEl = document.querySelector(".app");
const waveButtons = document.getElementById("waveButtons");
const markerPalette = document.getElementById("markerPalette");
const markerList = document.getElementById("markerList");
const waveLabel = document.getElementById("waveLabel");
const waveMeta = document.getElementById("waveMeta");
const simMeta = document.getElementById("simMeta");
const wavePairLabel = document.getElementById("wavePairLabel");
const waveHint = document.getElementById("waveHint");
const cursorMeta = document.getElementById("cursorMeta");
const importStatus = document.getElementById("importStatus");
const wavePrevBtn = document.getElementById("wavePrevBtn");
const waveNextBtn = document.getElementById("waveNextBtn");
const simControls = document.getElementById("simControls");
const simScrub = document.getElementById("simScrub");
const simTimeLabel = document.getElementById("simTimeLabel");
const simPlayBtn = document.getElementById("simPlayBtn");
const simPauseBtn = document.getElementById("simPauseBtn");
const simResetBtn = document.getElementById("simResetBtn");

let dragMarkerId = null;
let ghostEl = null;
let rafId = 0;
let lastFrameMs = 0;
let scrubbing = false;
let floorImage = null;
let floorImageReady = false;

function loadFloorImage() {
  const img = new Image();
  img.decoding = "async";
  img.onload = () => {
    floorImage = img;
    floorImageReady = true;
    render();
  };
  img.onerror = () => {
    floorImage = null;
    floorImageReady = false;
    render();
  };
  img.src = FLOOR_IMAGE_URL;
}

function parseOrder(value) {
  return value.split(",").map((n) => Number(n));
}

function shuffleCopy(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function orderKey(order) {
  return order.join(",");
}

function laneLabel(lane) {
  return LANE_LABELS[lane] ?? String(lane);
}

function orderLabel(order) {
  return order.map(laneLabel).join(" → ");
}

function pairWaves(pairIndex) {
  const a = pairIndex;
  const b = pairIndex + 1;
  return [a, b];
}

function pairText(pairIndex) {
  const [a, b] = pairWaves(pairIndex);
  return `Wave ${a + 1} + ${b + 1}`;
}

function selectionText() {
  if (state.waveSelectMode === "pair") return pairText(state.pairIndex);
  return `Wave ${state.waveIndex + 1}`;
}

function selectedWaveList() {
  return [...state.selectedWaves].sort((a, b) => a - b);
}

function selectionMaxIndex() {
  return state.waveSelectMode === "pair" ? WAVE_PAIR_COUNT - 1 : WAVE_COUNT - 1;
}

function selectionIndex() {
  return state.waveSelectMode === "pair" ? state.pairIndex : state.waveIndex;
}

function markerById(id) {
  return MARKER_TYPES.find((m) => m.id === id);
}

function markerByKey(key) {
  return MARKER_TYPES.find((m) => m.key === key);
}

function emptyMarkers() {
  return {};
}

function markersFromPreset(presetKey) {
  const preset = WAYMARK_PRESETS[presetKey];
  const next = emptyMarkers();
  if (!preset) return next;
  for (const type of MARKER_TYPES) {
    const pos = preset[type.key];
    if (pos) next[type.id] = { x: pos[0], z: pos[1] };
  }
  return next;
}

function saveState() {
  const payload = {
    waveSelectMode: state.waveSelectMode,
    waveIndex: state.waveIndex,
    pairIndex: state.pairIndex,
    nwOrder: state.nwOrder,
    neOrder: state.neOrder,
    showSafeCircles: state.showSafeCircles,
    showLanes: state.showLanes,
    viewMode: state.viewMode,
    simAllWaves: state.simAllWaves,
    simShowTelegraph: state.simShowTelegraph,
    simLoop: state.simLoop,
    simSpeed: state.simSpeed,
    markers: state.markers,
  };
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
  } catch {
    // ignore
  }
}

function loadState() {
  try {
    const raw =
      localStorage.getItem(STORAGE_KEY) ||
      localStorage.getItem("dmu-exaflare-viewer-v5") ||
      localStorage.getItem("dmu-exaflare-viewer-v4") ||
      localStorage.getItem("dmu-exaflare-viewer-v3") ||
      localStorage.getItem("dmu-exaflare-viewer-v2") ||
      localStorage.getItem("dmu-exaflare-viewer-v1");
    if (!raw) return;
    const data = JSON.parse(raw);
    if (data.waveSelectMode === "single" || data.waveSelectMode === "pair") {
      state.waveSelectMode = data.waveSelectMode;
    }
    if (typeof data.waveIndex === "number") {
      state.waveIndex = Math.max(0, Math.min(WAVE_COUNT - 1, data.waveIndex));
    }
    if (typeof data.pairIndex === "number") {
      state.pairIndex = Math.max(0, Math.min(WAVE_PAIR_COUNT - 1, data.pairIndex));
    } else if (Array.isArray(data.selectedWaves) && data.selectedWaves.length >= 2) {
      const sorted = data.selectedWaves.filter((w) => w >= 0 && w <= 5).sort((a, b) => a - b);
      const idx = sorted[0];
      if (idx >= 0 && idx <= 4 && sorted.includes(idx + 1)) state.pairIndex = idx;
    }
    if (Array.isArray(data.nwOrder)) state.nwOrder = data.nwOrder;
    if (Array.isArray(data.neOrder)) state.neOrder = data.neOrder;
    if (typeof data.showSafeCircles === "boolean") state.showSafeCircles = data.showSafeCircles;
    if (typeof data.showLanes === "boolean") state.showLanes = data.showLanes;
    if (data.viewMode === "static" || data.viewMode === "sim") state.viewMode = data.viewMode;
    if (typeof data.simAllWaves === "boolean") state.simAllWaves = data.simAllWaves;
    if (typeof data.simShowTelegraph === "boolean") state.simShowTelegraph = data.simShowTelegraph;
    if (typeof data.simLoop === "boolean") state.simLoop = data.simLoop;
    if (typeof data.simSpeed === "number") state.simSpeed = data.simSpeed;
    if (data.markers && typeof data.markers === "object" && Object.keys(data.markers).length > 0) {
      state.markers = data.markers;
    }
  } catch {
    // ignore
  }
  if (!state.markers || Object.keys(state.markers).length === 0) {
    state.markers = markersFromPreset(DEFAULT_WAYMARK_PRESET);
  }
  state.startDir = "nw";
  applySelection(false);
}

function simWaveList() {
  if (state.simAllWaves) return [...Array(WAVE_COUNT).keys()];
  return selectedWaveList();
}

/** Wave spawn からの経過秒 → ヒット発生時刻 */
function hitAbsoluteTime(waveIndex, hitIndex, waveList) {
  const localWave = waveList.indexOf(waveIndex);
  const spawnAt = Math.max(0, localWave) * WAVE_SPAWN_INTERVAL;
  return spawnAt + FADE_IN_DURATION + HIT_TIMES_IN_TIMELINE[hitIndex];
}

function simDuration(waveList = simWaveList()) {
  if (!waveList.length) return 1;
  const lastWave = waveList[waveList.length - 1];
  const lastHit = hitAbsoluteTime(lastWave, HIT_COUNT - 1, waveList);
  return lastHit + AOE_LIFETIME + 0.25;
}

function timedHitsAt(t, waveList = simWaveList()) {
  const active = [];
  for (const w of waveList) {
    for (const h of hitsForWave(w)) {
      const at = hitAbsoluteTime(w, h.hit, waveList);
      const age = t - at;
      if (age >= 0 && age < AOE_LIFETIME) {
        active.push({ ...h, at, age, alpha: Math.max(0.12, 1 - age / AOE_LIFETIME) * 0.42 });
      }
    }
  }
  return active;
}

function telegraphsAt(t, waveList = simWaveList()) {
  if (!state.simShowTelegraph) return [];
  const marks = [];
  for (const w of waveList) {
    const spawnAt = waveList.indexOf(w) * WAVE_SPAWN_INTERVAL;
    const firstHitAt = hitAbsoluteTime(w, 0, waveList);
    if (t < spawnAt || t >= firstHitAt) continue;
    const { intercard, lane } = waveConfig(w);
    const inc = INCREMENT[intercard];
    for (const side of ["left", "right"]) {
      const [sx, sz] = STARTING_POSITIONS[intercard][lane][side];
      marks.push({
        wave: w,
        intercard,
        lane,
        side,
        x: sx,
        z: sz,
        dx: inc[0],
        dz: inc[1],
        progress: (t - spawnAt) / (firstHitAt - spawnAt),
      });
    }
  }
  return marks;
}

/** Wave3以降: Hit1 のこの秒数前から安置を潰す */
const SAFE_CRUSH_LEAD_FROM_WAVE3 = 3.0;

/**
 * その Wave の全ヒット位置を危険扱いして安置を潰す開始時刻。
 * Wave1-2: 予兆（spawn）または Hit1
 * Wave3以降: Hit1 の約3秒前（重なりが増えるため遅らせる）
 */
function safeCrushStartAt(waveIndex, waveList = simWaveList()) {
  const spawnAt = waveList.indexOf(waveIndex) * WAVE_SPAWN_INTERVAL;
  const firstHitAt = hitAbsoluteTime(waveIndex, 0, waveList);
  if (waveIndex >= 2) {
    return Math.max(spawnAt, firstHitAt - SAFE_CRUSH_LEAD_FROM_WAVE3);
  }
  return state.simShowTelegraph ? spawnAt : firstHitAt;
}

/**
 * 予兆または Hit1 以降、その Wave の全ヒット位置を危険扱いして安置を潰す。
 * 見た目の円は timedHitsAt のまま 1hit→2hit…、安置判定だけ全軌道を使う。
 */
function dangerHitsForSafeAt(t, waveList = simWaveList()) {
  const danger = [];
  const seen = new Set();
  for (const w of waveList) {
    const waveStart = safeCrushStartAt(w, waveList);
    const waveEnd = hitAbsoluteTime(w, HIT_COUNT - 1, waveList) + AOE_LIFETIME;
    if (t < waveStart || t >= waveEnd) continue;
    for (const h of hitsForWave(w)) {
      const key = `${h.wave}:${h.side}:${h.hit}`;
      if (seen.has(key)) continue;
      seen.add(key);
      danger.push(h);
    }
  }
  return danger;
}

function waveConfig(waveIndex) {
  const intercards = ["nw", "ne"]; // NW 固定
  const orders = { nw: state.nwOrder, ne: state.neOrder };
  const intercard = intercards[waveIndex % 2];
  const slot = Math.floor(waveIndex / 2);
  const lane = orders[intercard][slot];
  return { intercard, lane, slot };
}

function hitsForWave(waveIndex) {
  return hitsForWaveOrders(waveIndex, state.nwOrder, state.neOrder);
}

function waveConfigOrders(waveIndex, nwOrder, neOrder) {
  const intercards = ["nw", "ne"];
  const orders = { nw: nwOrder, ne: neOrder };
  const intercard = intercards[waveIndex % 2];
  const slot = Math.floor(waveIndex / 2);
  const lane = orders[intercard][slot];
  return { intercard, lane, slot };
}

function hitsForWaveOrders(waveIndex, nwOrder, neOrder) {
  const { intercard, lane } = waveConfigOrders(waveIndex, nwOrder, neOrder);
  const inc = INCREMENT[intercard];
  const starts = STARTING_POSITIONS[intercard][lane];
  const hits = [];

  for (const side of ["left", "right"]) {
    const [sx, sz] = starts[side];
    for (let i = 0; i < HIT_COUNT; i += 1) {
      hits.push({
        x: sx + inc[0] * i,
        z: sz + inc[1] * i,
        hit: i,
        side,
        intercard,
        lane,
        wave: waveIndex,
      });
    }
  }
  return hits;
}

function hitsForSelected() {
  const hits = [];
  for (const w of selectedWaveList()) hits.push(...hitsForWave(w));
  return hits;
}

function spotDist(aId, bId) {
  const a = CARDINAL_SPOTS.find((s) => s.id === aId);
  const b = CARDINAL_SPOTS.find((s) => s.id === bId);
  return Math.hypot(a.x - b.x, a.z - b.z);
}

function safeCardinals(hits) {
  return CARDINAL_SPOTS.filter((s) => !pointInAnyCircle(s.x, s.z, hits)).map((s) => s.id);
}

function pairSafeSets(nwOrder, neOrder) {
  const sets = [];
  for (let i = 0; i < WAVE_PAIR_COUNT; i += 1) {
    const hits = [...hitsForWaveOrders(i, nwOrder, neOrder), ...hitsForWaveOrders(i + 1, nwOrder, neOrder)];
    sets.push(safeCardinals(hits));
  }
  return sets;
}

function compactPath(path) {
  return path.filter((p, i) => p && (i === 0 || p !== path[i - 1]));
}

/** 時計回りでの距離（0〜3）。2 = 直径ジャンプ（A↔C / B↔D） */
function ringDistCw(from, to) {
  let d = 0;
  let x = from;
  while (x !== to && d < 4) {
    x = CW_NEXT[x];
    d += 1;
  }
  return d;
}

function detectRotation(from, to) {
  if (!from || !to || from === to) return null;
  if (CW_NEXT[from] === to) return "cw";
  if (CCW_NEXT[from] === to) return "ccw";
  return ringDistCw(from, to) <= 2 ? "cw" : "ccw";
}

/** 回転方向に沿って進み、最終組に最初に入る安置を終点とする */
function pickEndByRotation(lastSet, from, rot) {
  if (!lastSet.length) return null;
  let x = from;
  for (let i = 0; i < 4; i += 1) {
    x = rot === "cw" ? CW_NEXT[x] : CCW_NEXT[x];
    if (lastSet.includes(x)) return x;
  }
  return lastSet[0];
}

/**
 * 次の安置に近い → 終点一致 → 回転の次 → 滞在
 * rot: 'cw' | 'ccw' | null
 */
function chooseStand(candidates, prev, nextSet, endHint = null, rot = null) {
  if (!candidates.length) return null;
  const rotNext = prev && rot ? (rot === "cw" ? CW_NEXT[prev] : CCW_NEXT[prev]) : null;
  let best = null;
  let bestScore = Infinity;
  for (const c of candidates) {
    let score = 0;
    if (nextSet && nextSet.length) {
      score = Math.min(...nextSet.map((n) => spotDist(c, n)));
    } else if (prev) {
      score = spotDist(prev, c);
    }
    if (endHint && c === endHint) score -= 0.2;
    if (rotNext && c === rotNext) score -= 0.12;
    if (prev && c === prev && nextSet && nextSet.includes(c)) score -= 0.05;
    if (prev && c === prev) score -= 0.01;
    if (score < bestScore) {
      bestScore = score;
      best = c;
    }
  }
  return best;
}

function buildStandPathForced(sets, start, rot, endHint) {
  const path = [];
  for (let i = 0; i < sets.length; i += 1) {
    if (i === 0) {
      path.push(start);
      continue;
    }
    const prev = path[i - 1];
    const next = i < sets.length - 1 ? sets[i + 1] : null;
    path.push(chooseStand(sets[i], prev, next, endHint, rot));
  }
  return path;
}

/**
 * 直径ジャンプ（2点のみ）を時計回り優先で展開。
 * 途中の直径ジャンプは展開しない（A→D→B を A→D→A→B に壊さない）。
 */
function expandRouteDisplay(compact) {
  if (!compact.length) {
    return { displayText: "—", displayNote: "", variants: [] };
  }

  if (compact.length === 2 && ringDistCw(compact[0], compact[1]) === 2) {
    const from = compact[0];
    const to = compact[1];
    const cw = `${from}→${CW_NEXT[from]}→${to}`;
    const ccw = `${from}→${CCW_NEXT[from]}→${to}`;
    return {
      displayText: cw,
      displayNote: `2択: ${cw} / ${ccw}（時計 ${cw} 優先、反時計も可）`,
      variants: [{ cw, ccw }],
    };
  }

  return {
    displayText: compact.join("→") || "—",
    displayNote: "",
    variants: [],
  };
}

/**
 * 初手候補を試し、回転方向と終点を決めて最短の一貫ルートを選ぶ。
 * 例: A→D（反時計）なら終点 C → A→D→C
 *     D→A（時計）なら終点 B → D→A→B
 * 初手が滞在（例: B→B）のときは回転が未定なので cw/ccw 両方を試す。
 */
function buildRoute(nwOrder, neOrder) {
  const sets = pairSafeSets(nwOrder, neOrder);
  let best = null;
  let bestScore = Infinity;

  for (const s0 of sets[0]) {
    for (const s1 of sets[1]) {
      const detected = detectRotation(s0, s1);
      // 滞在だと回転が取れない → 両方向を試し、短い一貫経路を採用（B→A→D 等）
      const rotations = detected ? [detected] : ["cw", "ccw"];
      for (const rot of rotations) {
        const endHint = pickEndByRotation(sets[sets.length - 1], s1, rot);
        const path = buildStandPathForced(sets, s0, rot, endHint);
        if (!path.length || path[path.length - 1] !== endHint) continue;
        const compact = compactPath(path);
        let score = compact.length * 10;
        if (path[1] !== s1) score += 3;
        // 初手が直径ジャンプならわずかに減点（隣接移動を優先）
        if (s0 !== s1 && CW_NEXT[s0] !== s1 && CCW_NEXT[s0] !== s1) score += 2;
        if (score < bestScore) {
          bestScore = score;
          best = { path, compact, rot, endHint };
        }
      }
    }
  }

  if (!best) {
    const fallbackStart = sets[0][0] || "A";
    const path = buildStandPathForced(sets, fallbackStart, "cw", sets[sets.length - 1][0] || null);
    best = { path, compact: compactPath(path), rot: "cw", endHint: path[path.length - 1] };
  }

  const expanded = expandRouteDisplay(best.compact);
  const laneSeq = [];
  for (let w = 0; w < WAVE_COUNT; w += 1) {
    const { lane } = waveConfigOrders(w, nwOrder, neOrder);
    laneSeq.push(LANE_LABELS[lane]);
  }
  return {
    nwOrder: [...nwOrder],
    neOrder: [...neOrder],
    sets,
    path: best.path,
    compact: best.compact,
    start: best.compact[0] || "?",
    end: best.compact[best.compact.length - 1] || "?",
    compactText: best.compact.join("→") || "—",
    displayText: expanded.displayText,
    displayNote: expanded.displayNote,
    laneText: laneSeq.join("→"),
    nwText: orderLabel(nwOrder),
    neText: orderLabel(neOrder),
    key: `${nwOrder.join(",")}|${neOrder.join(",")}`,
  };
}

function analyzeAllRoutes() {
  const all = [];
  for (const nw of LANE_PERMS) {
    for (const ne of LANE_PERMS) {
      all.push(buildRoute(nw, ne));
    }
  }

  for (const route of all) {
    let determinedAt = WAVE_COUNT;
    for (let n = 1; n <= WAVE_COUNT; n += 1) {
      const prefix = route.laneText.split("→").slice(0, n).join("→");
      const peers = all.filter((r) => r.laneText.split("→").slice(0, n).join("→") === prefix);
      if (peers.every((p) => p.start === route.start && p.end === route.end)) {
        determinedAt = n;
        break;
      }
    }
    route.determinedAt = determinedAt;

    const prefix = route.laneText.split("→").slice(0, determinedAt).join("→");
    const peerDisplays = [
      ...new Set(
        all
          .filter((r) => r.laneText.split("→").slice(0, determinedAt).join("→") === prefix)
          .map((r) => r.displayText)
      ),
    ];
    route.altCompacts = peerDisplays;
  }

  all.sort((a, b) => {
    if (a.determinedAt !== b.determinedAt) return a.determinedAt - b.determinedAt;
    if (a.displayText !== b.displayText) return a.displayText.localeCompare(b.displayText, "ja");
    return a.laneText.localeCompare(b.laneText, "ja");
  });
  return all;
}

let cachedRoutes = null;
function allRoutes() {
  if (!cachedRoutes) cachedRoutes = analyzeAllRoutes();
  return cachedRoutes;
}

function currentRoute() {
  return buildRoute(state.nwOrder, state.neOrder);
}

let routePanelKey = "";

function updateRoutePanel() {
  const currentEl = document.getElementById("routeCurrent");
  if (!currentEl) return;

  const activeKey = `${state.nwOrder.join(",")}|${state.neOrder.join(",")}`;
  if (routePanelKey === activeKey && currentEl.dataset.key === activeKey) return;
  routePanelKey = activeKey;
  currentEl.dataset.key = activeKey;

  const cur = currentRoute();
  const match = allRoutes().find((r) => r.key === cur.key) || cur;
  const note = cur.displayNote
    ? `<span class="hud-route-note">${cur.displayNote}</span>`
    : "";
  currentEl.innerHTML = `
    <span class="hud-route-path">${cur.displayText}</span>
    ${note}
    <span class="hud-route-meta">W${match.determinedAt}確定</span>
  `;
}

function toCanvas(x, z) {
  const scale = canvas.width / (WORLD_HALF * 2);
  return {
    cx: canvas.width / 2 + x * scale,
    cy: canvas.height / 2 + z * scale,
    scale,
  };
}

function eventToWorld(e) {
  const rect = canvas.getBoundingClientRect();
  const sx = canvas.width / rect.width;
  const sy = canvas.height / rect.height;
  const cx = (e.clientX - rect.left) * sx;
  const cy = (e.clientY - rect.top) * sy;
  const scale = canvas.width / (WORLD_HALF * 2);
  return {
    x: (cx - canvas.width / 2) / scale,
    z: (cy - canvas.height / 2) / scale,
    cx,
    cy,
    clientX: e.clientX,
    clientY: e.clientY,
  };
}

function findMarkerAt(x, z) {
  let best = null;
  let bestDist = MARKER_HIT_RADIUS;
  for (const [id, m] of Object.entries(state.markers)) {
    const d = Math.hypot(m.x - x, m.z - z);
    if (d <= bestDist) {
      bestDist = d;
      best = id;
    }
  }
  return best;
}

/** DMU: (xiv - 100) * 2.3 */
function convertXivToSim(x, z) {
  return [(x - 100) * 2.3, (z - 100) * 2.3];
}

function applyPreset(presetKey) {
  state.markers = markersFromPreset(presetKey);
  saveState();
  render();
}

function drawArena() {
  const { cx, cy, scale } = toCanvas(0, 0);
  const r = ARENA_RADIUS * scale;

  // フォールバック床
  const floor = ctx.createRadialGradient(cx, cy, r * 0.1, cx, cy, r * 1.15);
  floor.addColorStop(0, "#243445");
  floor.addColorStop(0.7, "#1a2734");
  floor.addColorStop(1, "#121c26");
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.fillStyle = floor;
  ctx.fill();

  // xivstrat P5 床画像（アリーナの約2倍サイズ）
  if (floorImageReady && floorImage) {
    const floorR = r * FLOOR_SCALE;
    const floorDiam = floorR * 2;
    ctx.save();
    ctx.beginPath();
    ctx.arc(cx, cy, floorR, 0, Math.PI * 2);
    ctx.clip();
    ctx.drawImage(floorImage, cx - floorR, cy - floorR, floorDiam, floorDiam);
    ctx.restore();
  }

  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.strokeStyle = "rgba(232, 238, 245, 0.55)";
  ctx.lineWidth = 2.5;
  ctx.stroke();

  ctx.fillStyle = "rgba(232, 238, 245, 0.75)";
  ctx.font = "600 18px 'IBM Plex Sans JP', sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  const labelR = r + 22;
  ctx.fillText("N", cx, cy - labelR);
  ctx.fillText("S", cx, cy + labelR);
  ctx.fillText("W", cx - labelR, cy);
  ctx.fillText("E", cx + labelR, cy);
}

function drawLaneGuides() {
  if (!state.showLanes) return;
  for (const dir of ["nw", "ne"]) {
    const color = dir === "nw" ? "rgba(255, 139, 92, 0.22)" : "rgba(77, 183, 255, 0.22)";
    for (let lane = 0; lane < 3; lane += 1) {
      for (const side of ["left", "right"]) {
        const [sx, sz] = STARTING_POSITIONS[dir][lane][side];
        const inc = INCREMENT[dir];
        const a = toCanvas(sx, sz);
        const b = toCanvas(sx + inc[0] * (HIT_COUNT - 1), sz + inc[1] * (HIT_COUNT - 1));
        ctx.beginPath();
        ctx.moveTo(a.cx, a.cy);
        ctx.lineTo(b.cx, b.cy);
        ctx.strokeStyle = color;
        ctx.lineWidth = 1.5;
        ctx.setLineDash([6, 6]);
        ctx.stroke();
        ctx.setLineDash([]);
      }
    }
  }
}

function drawHitCircle(hit, alpha) {
  const { cx, cy, scale } = toCanvas(hit.x, hit.z);
  const r = AOE_RADIUS * scale;
  const rgb = WAVE_COLORS[hit.wave % WAVE_COLORS.length];

  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.fillStyle = `rgba(${rgb}, ${alpha})`;
  ctx.fill();
  ctx.strokeStyle = `rgba(${rgb}, ${Math.min(1, alpha + 0.35)})`;
  ctx.lineWidth = 1.5;
  ctx.stroke();
}

/** 予兆: Hit1 発生位置の矢印のみ（SIMの矢印相当。左右各1本） */
function drawTelegraph(mark) {
  const { cx, cy, scale } = toCanvas(mark.x, mark.z);
  const rgb = WAVE_COLORS[mark.wave % WAVE_COLORS.length];
  const alpha = 0.55 + mark.progress * 0.4;

  // Hit1 中心の小さな点
  ctx.beginPath();
  ctx.arc(cx, cy, 1.4 * scale, 0, Math.PI * 2);
  ctx.fillStyle = `rgba(${rgb}, ${alpha})`;
  ctx.fill();

  const tip = toCanvas(mark.x + mark.dx * 1.35, mark.z + mark.dz * 1.35);
  ctx.beginPath();
  ctx.moveTo(cx, cy);
  ctx.lineTo(tip.cx, tip.cy);
  ctx.strokeStyle = `rgba(${rgb}, ${alpha})`;
  ctx.lineWidth = 3;
  ctx.stroke();

  const ang = Math.atan2(tip.cy - cy, tip.cx - cx);
  const size = 11;
  ctx.beginPath();
  ctx.moveTo(tip.cx, tip.cy);
  ctx.lineTo(tip.cx - size * Math.cos(ang - 0.45), tip.cy - size * Math.sin(ang - 0.45));
  ctx.lineTo(tip.cx - size * Math.cos(ang + 0.45), tip.cy - size * Math.sin(ang + 0.45));
  ctx.closePath();
  ctx.fillStyle = `rgba(${rgb}, ${Math.min(1, alpha + 0.15)})`;
  ctx.fill();
}

function pointInAnyCircle(x, z, hits) {
  const r2 = AOE_RADIUS * AOE_RADIUS;
  for (const h of hits) {
    const dx = x - h.x;
    const dz = z - h.z;
    if (dx * dx + dz * dz <= r2) return true;
  }
  return false;
}

function drawPathArrows(hits) {
  const byKey = new Map();
  for (const h of hits) {
    const key = `${h.wave}:${h.side}`;
    if (!byKey.has(key)) byKey.set(key, []);
    byKey.get(key).push(h);
  }

  for (const sideHits of byKey.values()) {
    sideHits.sort((a, b) => a.hit - b.hit);
    if (sideHits.length < 2) continue;
    const a = toCanvas(sideHits[0].x, sideHits[0].z);
    const b = toCanvas(sideHits.at(-1).x, sideHits.at(-1).z);
    const rgb = WAVE_COLORS[sideHits[0].wave % WAVE_COLORS.length];
    const color = `rgba(${rgb}, 0.9)`;

    ctx.beginPath();
    ctx.moveTo(a.cx, a.cy);
    ctx.lineTo(b.cx, b.cy);
    ctx.strokeStyle = color;
    ctx.lineWidth = 2;
    ctx.stroke();

    const ang = Math.atan2(b.cy - a.cy, b.cx - a.cx);
    const size = 10;
    ctx.beginPath();
    ctx.moveTo(b.cx, b.cy);
    ctx.lineTo(b.cx - size * Math.cos(ang - 0.4), b.cy - size * Math.sin(ang - 0.4));
    ctx.lineTo(b.cx - size * Math.cos(ang + 0.4), b.cy - size * Math.sin(ang + 0.4));
    ctx.closePath();
    ctx.fillStyle = color;
    ctx.fill();
  }
}

/** SIM風: 光柱 + ビルボードアイコン */
function drawWaymark(type, x, z) {
  const { cx, cy, scale } = toCanvas(x, z);
  const pillarR = 2.5 * scale * 0.55;
  const iconR = 11;

  // 光柱（真上視点ではリング）
  const glow = ctx.createRadialGradient(cx, cy, 0, cx, cy, pillarR * 1.8);
  glow.addColorStop(0, `${type.color}66`);
  glow.addColorStop(0.55, `${type.color}22`);
  glow.addColorStop(1, `${type.color}00`);
  ctx.beginPath();
  ctx.arc(cx, cy, pillarR * 1.8, 0, Math.PI * 2);
  ctx.fillStyle = glow;
  ctx.fill();

  ctx.beginPath();
  ctx.arc(cx, cy, pillarR, 0, Math.PI * 2);
  ctx.strokeStyle = `${type.color}aa`;
  ctx.lineWidth = 2;
  ctx.stroke();

  // アイコン
  ctx.save();
  ctx.translate(cx, cy - 2);

  if (type.shape === "letter") {
    ctx.beginPath();
    ctx.arc(0, 0, iconR, 0, Math.PI * 2);
    ctx.fillStyle = "rgba(12, 18, 24, 0.82)";
    ctx.fill();
    ctx.lineWidth = 2.5;
    ctx.strokeStyle = type.color;
    ctx.stroke();
  } else {
    // 数字マーカーは菱形フレーム（SIMの複数面イメージ）
    ctx.beginPath();
    ctx.moveTo(0, -iconR);
    ctx.lineTo(iconR, 0);
    ctx.lineTo(0, iconR);
    ctx.lineTo(-iconR, 0);
    ctx.closePath();
    ctx.fillStyle = "rgba(12, 18, 24, 0.82)";
    ctx.fill();
    ctx.lineWidth = 2.5;
    ctx.strokeStyle = type.color;
    ctx.stroke();
  }

  ctx.fillStyle = type.color;
  ctx.font = "800 13px Syne, sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(type.label, 0, 0.5);
  ctx.restore();
}

function isPointSafe(x, z, hits) {
  return !pointInAnyCircle(x, z, hits);
}

/** 安置のときだけ N/E/S/W に ◯ を表示（一重リング） */
function drawSafeSpotCircles(hits) {
  if (!state.showSafeCircles) return;

  for (const spot of SAFE_SPOTS) {
    if (!isPointSafe(spot.x, spot.z, hits)) continue;

    const { cx, cy, scale } = toCanvas(spot.x, spot.z);
    const r = 2.4 * scale;

    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.fillStyle = "rgba(72, 196, 140, 0.18)";
    ctx.fill();
    ctx.lineWidth = 3;
    ctx.strokeStyle = "rgba(120, 230, 170, 0.95)";
    ctx.stroke();
  }
}

function drawMarkers() {
  for (const type of MARKER_TYPES) {
    const m = state.markers[type.id];
    if (!m) continue;
    drawWaymark(type, m.x, m.z);
  }

  // 設置プレビュー（選択中マーカー）
  if (state.activeMarkerType && state.hoverWorld) {
    const type = markerById(state.activeMarkerType);
    if (type) {
      ctx.globalAlpha = 0.55;
      drawWaymark(type, state.hoverWorld.x, state.hoverWorld.z);
      ctx.globalAlpha = 1;
    }
  }
}

function updateHud() {
  const isSim = state.viewMode === "sim";
  const waveList = isSim ? simWaveList() : selectedWaveList();
  const text = isSim
    ? state.simAllWaves
      ? "全Wave 再生"
      : selectionText()
    : selectionText();
  waveLabel.textContent = text;
  wavePairLabel.textContent = selectionText();

  waveMeta.textContent = waveList
    .map((w) => {
      const cfg = waveConfig(w);
      return `W${w + 1}:${cfg.intercard.toUpperCase()}/${laneLabel(cfg.lane)}`;
    })
    .join(" · ");

  if (isSim) {
    const active = timedHitsAt(state.simTime, waveList);
    const hitNums = [...new Set(active.map((h) => h.hit + 1))].sort((a, b) => a - b);
    const hitText = hitNums.length ? `Hit ${hitNums.join(",")}` : "予兆/待機";
    simMeta.textContent = `再生 ${state.simTime.toFixed(2)}s · ${hitText}${
      state.simPlaying ? " · ▶" : " · ❚❚"
    }`;
  } else {
    simMeta.textContent = "モード: 静的（全ヒット同時）";
  }

  const current = selectionIndex();
  [...waveButtons.querySelectorAll(".wave-btn")].forEach((btn) => {
    const i = Number(btn.dataset.index);
    btn.setAttribute("aria-pressed", i === current ? "true" : "false");
  });

  wavePrevBtn.disabled = current <= 0;
  waveNextBtn.disabled = current >= selectionMaxIndex();
  waveButtons.classList.toggle("is-pair", state.waveSelectMode === "pair");
  if (waveHint) {
    waveHint.textContent =
      state.waveSelectMode === "pair"
        ? "← → で組を移動（1+2 → … → 5+6）。キー 1〜5 でも切替可"
        : "← → で Wave を移動。キー 1〜6 でも切替可";
  }

  if (markerPalette) {
    [...markerPalette.querySelectorAll(".marker-btn")].forEach((btn) => {
      const id = btn.dataset.marker;
      btn.setAttribute("aria-pressed", state.activeMarkerType === id ? "true" : "false");
    });
  }

  stage?.classList.toggle("placing", Boolean(state.activeMarkerType));
  appEl?.classList.toggle("is-sim", isSim);
  simControls?.classList.toggle("is-disabled", !isSim);
  updateSimScrubUi();
  updateMarkerList();
  updateRoutePanel();
}

function updateSimScrubUi() {
  const dur = simDuration();
  if (!scrubbing) {
    const max = Number(simScrub.max) || 1000;
    simScrub.value = String(Math.round((state.simTime / dur) * max));
  }
  simTimeLabel.textContent = `${state.simTime.toFixed(2)}s / ${dur.toFixed(2)}s`;
  simPlayBtn.disabled = state.viewMode !== "sim" || state.simPlaying;
  simPauseBtn.disabled = state.viewMode !== "sim" || !state.simPlaying;
}

function updateMarkerList() {
  if (!markerList) return;
  markerList.innerHTML = "";
  for (const type of MARKER_TYPES) {
    const m = state.markers[type.id];
    if (!m) continue;
    const li = document.createElement("li");
    li.innerHTML = `
      <span class="label" style="color:${type.color}">${type.label}</span>
      <span>(${m.x.toFixed(1)}, ${m.z.toFixed(1)})</span>
      <button type="button" data-remove="${type.id}">削除</button>
    `;
    markerList.appendChild(li);
  }
  markerList.querySelectorAll("button[data-remove]").forEach((btn) => {
    btn.addEventListener("click", () => {
      delete state.markers[btn.dataset.remove];
      saveState();
      render();
    });
  });
}

function render() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = "#0b1219";
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  drawArena();
  drawLaneGuides();

  if (state.viewMode === "sim") {
    const waveList = simWaveList();
    const activeHits = timedHitsAt(state.simTime, waveList);
    const safeDangerHits = dangerHitsForSafeAt(state.simTime, waveList);
    const teles = telegraphsAt(state.simTime, waveList);

    // 安置◯判定は全軌道、見た目の予兆は Hit1 矢印のみ（安置ハイライト/ヒット番号は無し）
    for (const t of teles) drawTelegraph(t);
    for (const h of activeHits) drawHitCircle(h, h.alpha);
    drawSafeSpotCircles(safeDangerHits);
    drawMarkers();
    updateHud();
    return;
  }

  const activeHits = hitsForSelected();
  const multi = selectedWaveList().length > 1;
  const alpha = multi ? 0.22 : 0.3;

  for (const h of activeHits) drawHitCircle(h, alpha);
  drawPathArrows(activeHits);
  drawSafeSpotCircles(activeHits);
  drawMarkers();
  updateHud();
}

function setSimTime(t, { fromScrub = false } = {}) {
  const dur = simDuration();
  let next = Math.max(0, Math.min(dur, t));
  if (next >= dur) {
    if (state.simLoop) {
      next = 0;
    } else {
      next = dur;
      state.simPlaying = false;
    }
  }
  state.simTime = next;
  if (!fromScrub) updateSimScrubUi();
  render();
}

function stopSimLoop() {
  if (rafId) cancelAnimationFrame(rafId);
  rafId = 0;
  lastFrameMs = 0;
}

function simFrame(now) {
  if (!state.simPlaying || state.viewMode !== "sim") {
    stopSimLoop();
    return;
  }
  if (!lastFrameMs) lastFrameMs = now;
  const dt = ((now - lastFrameMs) / 1000) * state.simSpeed;
  lastFrameMs = now;
  setSimTime(state.simTime + dt);
  rafId = requestAnimationFrame(simFrame);
}

function playSim() {
  if (state.viewMode !== "sim") return;
  if (state.simTime >= simDuration() - 1e-6) state.simTime = 0;
  state.simPlaying = true;
  stopSimLoop();
  lastFrameMs = 0;
  rafId = requestAnimationFrame(simFrame);
  updateHud();
}

function pauseSim() {
  state.simPlaying = false;
  stopSimLoop();
  updateHud();
}

function resetSim() {
  pauseSim();
  setSimTime(0);
}

function setViewMode(mode) {
  state.viewMode = mode === "sim" ? "sim" : "static";
  if (state.viewMode !== "sim") pauseSim();
  syncControlsFromState();
  saveState();
  render();
}

function applySelection(shouldSave = true) {
  if (state.waveSelectMode === "pair") {
    state.pairIndex = Math.max(0, Math.min(WAVE_PAIR_COUNT - 1, state.pairIndex));
    state.selectedWaves = new Set(pairWaves(state.pairIndex));
  } else {
    state.waveIndex = Math.max(0, Math.min(WAVE_COUNT - 1, state.waveIndex));
    state.selectedWaves = new Set([state.waveIndex]);
  }
  if (shouldSave) saveState();
}

function setSelectionIndex(index) {
  if (state.waveSelectMode === "pair") {
    state.pairIndex = Math.max(0, Math.min(WAVE_PAIR_COUNT - 1, index));
  } else {
    state.waveIndex = Math.max(0, Math.min(WAVE_COUNT - 1, index));
  }
  applySelection(true);
  render();
}

function stepSelection(delta) {
  setSelectionIndex(selectionIndex() + delta);
}

function setWaveSelectMode(mode) {
  state.waveSelectMode = mode === "pair" ? "pair" : "single";
  rebuildWaveButtons();
  applySelection(true);
  syncControlsFromState();
  render();
}

function setActiveMarker(id) {
  state.activeMarkerType = state.activeMarkerType === id ? null : id;
  render();
}

function placeMarker(id, x, z) {
  state.markers[id] = { x, z };
  saveState();
  render();
}

function clearSelectedMarker() {
  if (!state.activeMarkerType) return;
  delete state.markers[state.activeMarkerType];
  saveState();
  render();
}

function syncControlsFromState() {
  document.querySelectorAll("[data-wave-mode]").forEach((btn) => {
    btn.setAttribute(
      "aria-pressed",
      btn.dataset.waveMode === state.waveSelectMode ? "true" : "false"
    );
  });
  document.querySelectorAll(".mode-btn[data-mode]").forEach((btn) => {
    btn.setAttribute(
      "aria-pressed",
      btn.dataset.mode === state.viewMode ? "true" : "false"
    );
  });
  const viewModeSelect = document.getElementById("viewMode");
  if (viewModeSelect) viewModeSelect.value = state.viewMode;
  document.getElementById("nwOrder").value = orderKey(state.nwOrder);
  document.getElementById("neOrder").value = orderKey(state.neOrder);
  document.getElementById("showSafeCircles").checked = state.showSafeCircles;
  document.getElementById("showLanes").checked = state.showLanes;
  document.getElementById("simSpeed").value = String(state.simSpeed);
  document.getElementById("simAllWaves").checked = state.simAllWaves;
  document.getElementById("simShowTelegraph").checked = state.simShowTelegraph;
  document.getElementById("simLoop").checked = state.simLoop;
}

function rebuildWaveButtons() {
  waveButtons.innerHTML = "";
  if (state.waveSelectMode === "pair") {
    for (let i = 0; i < WAVE_PAIR_COUNT; i += 1) {
      const [a, b] = pairWaves(i);
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "wave-btn";
      btn.dataset.index = String(i);
      btn.textContent = `${a + 1}+${b + 1}`;
      btn.title = pairText(i);
      btn.setAttribute("aria-pressed", "false");
      btn.addEventListener("click", () => setSelectionIndex(i));
      waveButtons.appendChild(btn);
    }
  } else {
    for (let i = 0; i < WAVE_COUNT; i += 1) {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "wave-btn";
      btn.dataset.index = String(i);
      btn.textContent = String(i + 1);
      btn.title = `Wave ${i + 1}`;
      btn.setAttribute("aria-pressed", "false");
      btn.addEventListener("click", () => setSelectionIndex(i));
      waveButtons.appendChild(btn);
    }
  }
}

function initMarkerPalette() {
  if (!markerPalette) return;
  for (const type of MARKER_TYPES) {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "marker-btn";
    btn.dataset.marker = type.id;
    btn.innerHTML = `<span class="dot" style="background:${type.color}"></span>${type.label}`;
    btn.title = type.key;
    btn.addEventListener("click", () => setActiveMarker(type.id));
    markerPalette.appendChild(btn);
  }
}

function ensureGhost() {
  if (ghostEl) return ghostEl;
  ghostEl = document.createElement("div");
  ghostEl.className = "ghost-preview";
  stage.appendChild(ghostEl);
  return ghostEl;
}

function updateGhost(e) {
  const g = ensureGhost();
  if (!state.activeMarkerType) {
    g.style.display = "none";
    return;
  }
  const rect = stage.getBoundingClientRect();
  g.style.display = "block";
  g.style.left = `${e.clientX - rect.left}px`;
  g.style.top = `${e.clientY - rect.top}px`;
  const type = markerById(state.activeMarkerType);
  if (type) g.style.borderColor = type.color;
}

function bindCanvas() {
  canvas.addEventListener("mousemove", (e) => {
    const p = eventToWorld(e);
    state.hoverWorld = { x: p.x, z: p.z };
    if (cursorMeta) cursorMeta.textContent = `座標: (${p.x.toFixed(1)}, ${p.z.toFixed(1)})`;
    updateGhost(e);

    if (dragMarkerId) {
      state.markers[dragMarkerId] = { x: p.x, z: p.z };
      render();
      return;
    }

    if (state.activeMarkerType) render();
  });

  canvas.addEventListener("mouseleave", () => {
    if (cursorMeta) cursorMeta.textContent = "座標: —";
    state.hoverWorld = null;
    if (ghostEl) ghostEl.style.display = "none";
    if (state.activeMarkerType) render();
  });

  canvas.addEventListener("mousedown", (e) => {
    const p = eventToWorld(e);

    // SIM: 右クリックは選択中ウェイマークを消す
    if (e.button === 2) {
      e.preventDefault();
      if (state.activeMarkerType) {
        clearSelectedMarker();
      } else {
        const hit = findMarkerAt(p.x, p.z);
        if (hit) {
          delete state.markers[hit];
          saveState();
          render();
        }
      }
      return;
    }

    if (e.button !== 0) return;

    // 設置モード
    if (state.activeMarkerType) {
      placeMarker(state.activeMarkerType, p.x, p.z);
      return;
    }

    // 非設置時はドラッグ移動
    const hit = findMarkerAt(p.x, p.z);
    if (hit) dragMarkerId = hit;
  });

  window.addEventListener("mouseup", () => {
    if (dragMarkerId) {
      dragMarkerId = null;
      saveState();
      render();
    }
  });

  canvas.addEventListener("contextmenu", (e) => e.preventDefault());
}

function importWaymarksFromJson(text) {
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    importStatus.textContent = "JSONの解析に失敗しました";
    importStatus.style.color = "#ff7b7b";
    return;
  }

  if (!data || typeof data !== "object") {
    importStatus.textContent = "不正なデータです";
    importStatus.style.color = "#ff7b7b";
    return;
  }

  if (data.MapID != null && Number(data.MapID) !== DMU_MAP_ID) {
    importStatus.textContent = `警告: MapID=${data.MapID}（DMUは ${DMU_MAP_ID}）。変換は続行します`;
    importStatus.style.color = "#f0c24b";
  } else {
    importStatus.textContent = "取り込み成功";
    importStatus.style.color = "#5ee0a8";
  }

  const next = { ...state.markers };
  for (const [wmKey, jsonKey] of Object.entries(IMPORT_KEYS)) {
    const coords = data[jsonKey];
    const type = markerByKey(wmKey);
    if (!type || !coords) continue;
    if (typeof coords.X === "number" && typeof coords.Z === "number") {
      const [x, z] = convertXivToSim(coords.X, coords.Z);
      next[type.id] = { x, z };
    }
  }
  state.markers = next;
  saveState();
  render();
}

function bindControls() {
  document.getElementById("nwOrder").addEventListener("change", (e) => {
    state.nwOrder = parseOrder(e.target.value);
    saveState();
    render();
  });
  document.getElementById("neOrder").addEventListener("change", (e) => {
    state.neOrder = parseOrder(e.target.value);
    saveState();
    render();
  });
  document.querySelectorAll("[data-wave-mode]").forEach((btn) => {
    btn.addEventListener("click", () => setWaveSelectMode(btn.dataset.waveMode));
  });
  document.querySelectorAll(".mode-btn[data-mode]").forEach((btn) => {
    btn.addEventListener("click", () => setViewMode(btn.dataset.mode));
  });
  document.getElementById("showSafeCircles").addEventListener("change", (e) => {
    state.showSafeCircles = e.target.checked;
    saveState();
    render();
  });
  document.getElementById("showLanes").addEventListener("change", (e) => {
    state.showLanes = e.target.checked;
    saveState();
    render();
  });
  document.getElementById("randomizeBtn").addEventListener("click", () => {
    state.nwOrder = shuffleCopy([0, 1, 2]);
    state.neOrder = shuffleCopy([0, 1, 2]);
    syncControlsFromState();
    saveState();
    render();
  });

  const viewModeSelect = document.getElementById("viewMode");
  if (viewModeSelect) {
    viewModeSelect.addEventListener("change", (e) => {
      setViewMode(e.target.value);
    });
  }
  document.getElementById("simSpeed").addEventListener("change", (e) => {
    state.simSpeed = Number(e.target.value) || 1;
    saveState();
  });
  document.getElementById("simAllWaves").addEventListener("change", (e) => {
    state.simAllWaves = e.target.checked;
    saveState();
    setSimTime(Math.min(state.simTime, simDuration()));
  });
  document.getElementById("simShowTelegraph").addEventListener("change", (e) => {
    state.simShowTelegraph = e.target.checked;
    saveState();
    render();
  });
  document.getElementById("simLoop").addEventListener("change", (e) => {
    state.simLoop = e.target.checked;
    saveState();
  });
  simPlayBtn.addEventListener("click", () => playSim());
  simPauseBtn.addEventListener("click", () => pauseSim());
  simResetBtn.addEventListener("click", () => resetSim());
  simScrub.addEventListener("pointerdown", () => {
    scrubbing = true;
    pauseSim();
  });
  simScrub.addEventListener("pointerup", () => {
    scrubbing = false;
  });
  simScrub.addEventListener("input", (e) => {
    const max = Number(simScrub.max) || 1000;
    const t = (Number(e.target.value) / max) * simDuration();
    setSimTime(t, { fromScrub: true });
    simTimeLabel.textContent = `${state.simTime.toFixed(2)}s / ${simDuration().toFixed(2)}s`;
  });

  wavePrevBtn.addEventListener("click", () => stepSelection(-1));
  waveNextBtn.addEventListener("click", () => stepSelection(1));

  document.getElementById("markerNoneBtn").addEventListener("click", () => {
    state.activeMarkerType = null;
    render();
  });
  document.getElementById("markerClearBtn").addEventListener("click", () => {
    state.markers = emptyMarkers();
    saveState();
    render();
  });

  document.querySelectorAll("[data-preset]").forEach((btn) => {
    btn.addEventListener("click", () => applyPreset(btn.dataset.preset));
  });

  document.getElementById("importBtn").addEventListener("click", () => {
    importWaymarksFromJson(document.getElementById("importText").value);
  });

  window.addEventListener("keydown", (e) => {
    if (e.target && ["INPUT", "SELECT", "TEXTAREA"].includes(e.target.tagName)) return;
    if (e.code === "Space") {
      e.preventDefault();
      if (state.viewMode !== "sim") setViewMode("sim");
      if (state.simPlaying) pauseSim();
      else playSim();
      syncControlsFromState();
      return;
    }
    if (e.key === "ArrowRight" || e.key === "→") {
      stepSelection(1);
    } else if (e.key === "ArrowLeft") {
      stepSelection(-1);
    } else if (e.key >= "1" && e.key <= "6") {
      const n = Number(e.key) - 1;
      if (state.waveSelectMode === "pair") {
        if (n <= 4) setSelectionIndex(n);
      } else {
        setSelectionIndex(n);
      }
    } else if (e.key === "Escape") {
      state.activeMarkerType = null;
      render();
    }
  });
}

loadState();
if (!state.markers) state.markers = markersFromPreset(DEFAULT_WAYMARK_PRESET);
loadFloorImage();
rebuildWaveButtons();
initMarkerPalette();
bindControls();
bindCanvas();
syncControlsFromState();
render();
