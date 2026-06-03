import type { MechanismSlice, Moment, Phase, Timeline } from "../types";

function cleanPhase(phase: Phase): Phase {
  return {
    id: phase.id,
    title: phase.title,
    start_sec: phase.start_sec,
    ...(phase.end_sec !== undefined ? { end_sec: phase.end_sec } : {}),
  };
}

function cleanMoment(moment: Moment): Moment {
  const hasDamage = typeof moment.damage === "number" && moment.damage > 0;
  const hasDot = typeof moment.dot === "number" && moment.dot > 0;

  return {
    t_sec: moment.t_sec,
    ...(moment.phase_t_sec !== undefined ? { phase_t_sec: moment.phase_t_sec } : {}),
    ...(moment.order !== undefined ? { order: moment.order } : {}),
    ...(moment.alt_group ? { alt_group: moment.alt_group } : {}),
    name: moment.name,
    elem: moment.elem,
    ...(moment.tags?.length ? { tags: moment.tags } : {}),
    ...(hasDamage ? { damage: moment.damage } : {}),
    ...(hasDot ? { dot: moment.dot } : {}),
    ...(hasDot && moment.dot_ticks !== undefined
      ? { dot_ticks: moment.dot_ticks }
      : {}),
    ...(moment.note ? { note: moment.note } : {}),
    ...(moment.kind && moment.kind !== "hit"
      ? { kind: moment.kind }
      : !hasDamage && !hasDot
        ? { kind: "event" as const }
        : {}),
  };
}

function cleanMechanism(mechanism: MechanismSlice): MechanismSlice {
  return {
    name: mechanism.name,
    phaseId: mechanism.phaseId,
    start_sec: mechanism.start_sec,
    end_sec: mechanism.end_sec,
  };
}

export function normalizeTimelineForExport(timeline: Timeline): Timeline {
  return {
    id: timeline.id,
    title: timeline.title,
    version: timeline.version,
    phases: timeline.phases.map(cleanPhase),
    moments: [...timeline.moments]
      .sort(
        (a, b) =>
          a.t_sec - b.t_sec ||
          (a.order ?? 0) - (b.order ?? 0) ||
          a.name.localeCompare(b.name)
      )
      .map(cleanMoment),
    ...(timeline.mechanisms?.length
      ? { mechanisms: timeline.mechanisms.map(cleanMechanism) }
      : {}),
    ...(timeline.practice ? { practice: timeline.practice } : {}),
  };
}

function stringifyInlineObject(value: object) {
  const entries = Object.entries(value).map(
    ([key, entryValue]) => `${JSON.stringify(key)}: ${JSON.stringify(entryValue)}`
  );
  return `{ ${entries.join(", ")} }`;
}

function stringifyInlineArray(
  key: string,
  values: readonly object[],
  trailingComma: boolean
) {
  if (values.length === 0) {
    return `  ${JSON.stringify(key)}: []${trailingComma ? "," : ""}`;
  }

  return [
    `  ${JSON.stringify(key)}: [`,
    ...values.map(
      (value, index) =>
        `    ${stringifyInlineObject(value)}${index < values.length - 1 ? "," : ""}`
    ),
    `  ]${trailingComma ? "," : ""}`,
  ].join("\n");
}

function stringifyBlockProperty(
  key: string,
  value: unknown,
  trailingComma: boolean
) {
  const text = JSON.stringify(value, null, 2)
    .split("\n")
    .map((line, index) => (index === 0 ? line : `  ${line}`))
    .join("\n");
  return `  ${JSON.stringify(key)}: ${text}${trailingComma ? "," : ""}`;
}

export function serializeTimelineJson(timeline: Timeline) {
  const normalized = normalizeTimelineForExport(timeline);
  const hasMechanisms = Boolean(normalized.mechanisms?.length);
  const hasPractice = Boolean(normalized.practice);
  const lines = [
    "{",
    `  "id": ${JSON.stringify(normalized.id)},`,
    `  "title": ${JSON.stringify(normalized.title)},`,
    `  "version": ${JSON.stringify(normalized.version)},`,
    stringifyInlineArray("phases", normalized.phases, true),
    stringifyInlineArray("moments", normalized.moments, hasMechanisms || hasPractice),
  ];

  if (normalized.mechanisms?.length) {
    lines.push(
      stringifyInlineArray("mechanisms", normalized.mechanisms, hasPractice)
    );
  }

  if (normalized.practice) {
    lines.push(stringifyBlockProperty("practice", normalized.practice, false));
  }

  lines.push("}");
  return `${lines.join("\n")}\n`;
}
