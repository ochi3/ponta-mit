import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const raw = readFileSync(path.join(root, "scripts/dmu-timeline-raw.txt"), "utf8");

function parseTime(text) {
  const [m, s] = text.split(":").map(Number);
  return m * 60 + s;
}

function parseElem(text) {
  if (!text) return "none";
  const lower = text.toLowerCase();
  if (lower === "physical") return "physical";
  if (lower === "magic") return "magic";
  if (lower === "unique") return "unique";
  return "none";
}

function parseDamage(text) {
  if (!text || !text.trim()) return undefined;
  const trimmed = text.trim();
  if (trimmed === "MAX HP - 1") return undefined;
  const num = Number(trimmed.replaceAll(",", ""));
  return Number.isFinite(num) ? num : undefined;
}

function fmtMoment(moment) {
  const fields = [
    `t_sec: ${moment.t_sec}`,
    ...(moment.phase_t_sec !== undefined ? [`phase_t_sec: ${moment.phase_t_sec}`] : []),
    `name: ${JSON.stringify(moment.name)}`,
    `elem: ${JSON.stringify(moment.elem)}`,
  ];
  if (moment.order) fields.push(`order: ${moment.order}`);
  if (moment.damage !== undefined) fields.push(`damage: ${moment.damage}`);
  if (moment.note) fields.push(`note: ${JSON.stringify(moment.note)}`);
  if (moment.kind) fields.push(`kind: ${JSON.stringify(moment.kind)}`);
  return `  { ${fields.join(", ")} },`;
}

function buildMoments(lines, { usePhaseTime }) {
  const moments = [];
  const orderBySec = new Map();

  for (const line of lines) {
    const parts = line.split("\t").map((p) => p.trim());
    if (parts.length < 2) continue;

    let t_sec;
    let phase_t_sec;
    let name;
    let elem;
    let damageText;

    if (/^P[1-5]$/.test(parts[0])) continue;

    if (/^\d{2}:\d{2}$/.test(parts[0]) && /^\d{2}:\d{2}$/.test(parts[1])) {
      t_sec = parseTime(parts[0]);
      phase_t_sec = usePhaseTime ? parseTime(parts[1]) : undefined;
      name = parts[2];
      elem = parts[3];
      damageText = parts[4];
    } else if (parts.length >= 4 && /^\d{2}:\d{2}$/.test(parts[1]) && /^\d{2}:\d{2}$/.test(parts[2])) {
      t_sec = parseTime(parts[1]);
      phase_t_sec = parseTime(parts[2]);
      name = parts[3];
      elem = parts[4];
      damageText = parts[5];
    } else {
      continue;
    }

    if (!name) continue;

    const order = (orderBySec.get(t_sec) ?? 0) + 1;
    orderBySec.set(t_sec, order);

    const moment = {
      t_sec,
      ...(usePhaseTime && phase_t_sec !== undefined ? { phase_t_sec } : {}),
      name,
      elem: parseElem(elem),
      ...(order > 1 ? { order } : {}),
    };

    const damage = parseDamage(damageText);
    if (damage !== undefined) {
      if (damage === 0 && (moment.elem === "unique" || moment.elem === "none")) {
        moment.kind = "event";
      } else {
        moment.damage = damage;
        if (damage >= 9999999 && moment.elem === "none") {
          moment.elem = "magic";
        }
      }
    } else if (damageText?.includes("MAX HP")) {
      moment.note = damageText.trim();
      moment.kind = "event";
    } else if (moment.elem === "unique" || !elem || parseElem(elem) === "none") {
      moment.kind = "event";
    }

    if (moment.elem === "none" && !moment.kind) {
      moment.kind = "event";
    }

    moments.push(moment);
  }

  moments.sort((a, b) => a.t_sec - b.t_sec || (a.order ?? 1) - (b.order ?? 1));

  const orderAfterSort = new Map();
  for (const moment of moments) {
    const next = (orderAfterSort.get(moment.t_sec) ?? 0) + 1;
    orderAfterSort.set(moment.t_sec, next);
    if (next > 1) {
      moment.order = next;
    } else {
      delete moment.order;
    }
  }

  return moments;
}

function fmtMechanisms(items) {
  return items
    .map(
      (m) =>
        `  { name: ${JSON.stringify(m.name)}, phaseId: ${JSON.stringify(m.phaseId)}, start_sec: ${m.start_sec}, end_sec: ${m.end_sec} },`
    )
    .join("\n");
}

function splitPhaseSections(source) {
  const sections = new Map();
  const parts = source.split(/^P([1-5])$/m);
  for (let i = 1; i < parts.length; i += 2) {
    const phaseNum = parts[i];
    const body = (parts[i + 1] ?? "").trim();
    sections.set(
      `p${phaseNum}`,
      body.split("\n").map((line) => line.trimEnd()).filter(Boolean)
    );
  }
  return sections;
}

const phaseSections = splitPhaseSections(raw);

const P1_END = 202;
const P2_START = 197;
const P2_END = 387;
const P3_START = 382;
const P3_END = 734;
const P4_START = 734;
const P4_END = 868;
const P5_START = 862;
const P5_END = 1122;

const momentsP1 = [
  { t_sec: -15, name: "戦闘前", elem: "none", kind: "event" },
  ...buildMoments(phaseSections.get("p1") ?? [], { usePhaseTime: false }),
];
const momentsP2 = buildMoments(phaseSections.get("p2") ?? [], { usePhaseTime: true });
const momentsP3 = buildMoments(phaseSections.get("p3") ?? [], { usePhaseTime: true });
const momentsP4 = buildMoments(phaseSections.get("p4") ?? [], { usePhaseTime: true });
const momentsP5 = buildMoments(phaseSections.get("p5") ?? [], { usePhaseTime: true });

const mechanismsP1 = [
  { name: "開幕", phaseId: "p1", start_sec: -15, end_sec: 28 },
  { name: "神々の像 (魔神)", phaseId: "p1", start_sec: 29, end_sec: 79 },
  { name: "神々の像 (鬼神)", phaseId: "p1", start_sec: 80, end_sec: 140 },
  { name: "神々の像 (女神)", phaseId: "p1", start_sec: 141, end_sec: P1_END },
];

const mechanismsP2 = [
  { name: "開幕", phaseId: "p2", start_sec: P2_START, end_sec: 235 },
  { name: "ミッシング", phaseId: "p2", start_sec: 236, end_sec: 353 },
  { name: "トライン", phaseId: "p2", start_sec: 354, end_sec: P2_END },
];

const mechanismsP3 = [
  { name: "開幕", phaseId: "p3", start_sec: P3_START, end_sec: 430 },
  { name: "決戦 1 回目", phaseId: "p3", start_sec: 431, end_sec: 506 },
  { name: "アルテマブラスター", phaseId: "p3", start_sec: 507, end_sec: 544 },
  { name: "じしん & ブラックホール", phaseId: "p3", start_sec: 545, end_sec: 699 },
  { name: "どんどこ地団駄", phaseId: "p3", start_sec: 700, end_sec: 717 },
  { name: "時間切れまで", phaseId: "p3", start_sec: 718, end_sec: P3_END },
];

const mechanismsP4 = [
  { name: "開幕", phaseId: "p4", start_sec: P4_START, end_sec: 758 },
  { name: "真偽記憶フェーズ", phaseId: "p4", start_sec: 759, end_sec: 804 },
  { name: "デバフ解放フェーズ", phaseId: "p4", start_sec: 805, end_sec: P4_END },
];

const mechanismsP5 = [
  { name: "開幕", phaseId: "p5", start_sec: P5_START, end_sec: 927 },
  { name: "カオティックフラッド", phaseId: "p5", start_sec: 928, end_sec: 939 },
  { name: "狂気のオーケストラ", phaseId: "p5", start_sec: 940, end_sec: 961 },
  { name: "スリースターズ", phaseId: "p5", start_sec: 962, end_sec: 992 },
  { name: "混沌の終末", phaseId: "p5", start_sec: 993, end_sec: 1032 },
  { name: "狂気のオーケストラ", phaseId: "p5", start_sec: 1033, end_sec: 1061 },
  { name: "ミッシング・ゼロ", phaseId: "p5", start_sec: 1062, end_sec: P5_END },
];

const file = `import type { MechanismSlice, Timeline, Moment } from "../../types";

export const MOMENTS_P1: Moment[] = [
${momentsP1.map(fmtMoment).join("\n")}
];

export const MECHANISMS_P1: MechanismSlice[] = [
${fmtMechanisms(mechanismsP1)}
];

export const MOMENTS_P2: Moment[] = [
${momentsP2.map(fmtMoment).join("\n")}
];

export const MECHANISMS_P2: MechanismSlice[] = [
${fmtMechanisms(mechanismsP2)}
];

export const MOMENTS_P3: Moment[] = [
${momentsP3.map(fmtMoment).join("\n")}
];

export const MECHANISMS_P3: MechanismSlice[] = [
${fmtMechanisms(mechanismsP3)}
];

export const MOMENTS_P4: Moment[] = [
${momentsP4.map(fmtMoment).join("\n")}
];

export const MECHANISMS_P4: MechanismSlice[] = [
${fmtMechanisms(mechanismsP4)}
];

export const MOMENTS_P5: Moment[] = [
${momentsP5.map(fmtMoment).join("\n")}
];

export const MECHANISMS_P5: MechanismSlice[] = [
${fmtMechanisms(mechanismsP5)}
];

const MOMENTS: Moment[] = [
  ...MOMENTS_P1,
  ...MOMENTS_P2,
  ...MOMENTS_P3,
  ...MOMENTS_P4,
  ...MOMENTS_P5,
];
MOMENTS.sort((a, b) => a.t_sec - b.t_sec || (a.order ?? 1e9) - (b.order ?? 1e9));

const MECHANISMS: MechanismSlice[] = [
  ...MECHANISMS_P1,
  ...MECHANISMS_P2,
  ...MECHANISMS_P3,
  ...MECHANISMS_P4,
  ...MECHANISMS_P5,
];

export const DANCING_MAD: Timeline = {
  id: "dancing-mad",
  title: "絶妖星乱舞",
  version: 1,
  phases: [
    { id: "p1", title: "P1", start_sec: -15, end_sec: ${P1_END} },
    { id: "p2", title: "P2", start_sec: ${P2_START}, end_sec: ${P2_END} },
    { id: "p3", title: "P3", start_sec: ${P3_START}, end_sec: ${P3_END} },
    { id: "p4", title: "P4", start_sec: ${P4_START}, end_sec: ${P4_END} },
    { id: "p5", title: "P5", start_sec: ${P5_START}, end_sec: ${P5_END} },
  ],
  moments: MOMENTS,
  mechanisms: MECHANISMS,
};
`;

writeFileSync(path.join(root, "src/data/timelines/dancing-mad.ts"), file, "utf8");
console.log(
  [
    `P1: ${momentsP1.length}`,
    `P2: ${momentsP2.length}`,
    `P3: ${momentsP3.length}`,
    `P4: ${momentsP4.length}`,
    `P5: ${momentsP5.length}`,
  ].join(", ")
);
