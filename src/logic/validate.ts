import type { MechanismSlice, Moment, Timeline } from "../types";

/** Validates moment rows (typing, damage vs event, duplicates). */
export function validateMoments(ms: Moment[]) {
  for (const m of ms) {
    if (!Number.isInteger(m.t_sec)) {
      throw new Error(`t_sec must be integer: ${m.name}@${m.t_sec}`);
    }
    if (!m.elem) {
      throw new Error(`elem is required (use "none" for non-damage events): ${m.name}@${m.t_sec}`);
    }

    const hasInstant = typeof m.damage === "number" && m.damage > 0;
    const hasDot     = typeof m.dot === "number"    && m.dot > 0;
    const isEvent    = !hasInstant && !hasDot;
    const truthyCount = (hasInstant ? 1 : 0) + (hasDot ? 1 : 0) + (isEvent ? 1 : 0);
    if (truthyCount !== 1) {
      throw new Error(
        `exactly one of {damage, dot(+ticks), event} must apply: ${m.name}@${m.t_sec} (got: ` +
        `${hasInstant ? "damage " : ""}${hasDot ? "dot " : ""}${isEvent ? "event " : ""})`
      );
    }

    if (isEvent) {
      if (m.damage !== undefined || m.dot !== undefined || m.dot_ticks !== undefined) {
        throw new Error(`event must not carry damage/dot fields: ${m.name}@${m.t_sec}`);
      }
      if (m.elem !== "none") {
        throw new Error(`event must have elem="none": ${m.name}@${m.t_sec}`);
      }
    }

    if (hasInstant) {
      if (m.elem === "none") {
        throw new Error(`damage moment cannot have elem="none": ${m.name}@${m.t_sec}`);
      }
    }

    if (hasDot) {
      if ((m.dot_ticks ?? 0) <= 0) {
        throw new Error(`dot_ticks must be > 0 when dot is set: ${m.name}@${m.t_sec}`);
      }
      if (m.elem === "none") {
        throw new Error(`dot moment cannot have elem="none": ${m.name}@${m.t_sec}`);
      }
    }
  }

  const seen = new Set<string>();
  for (const m of ms) {
    const key = `${m.t_sec}::${m.name}::${m.order ?? 0}::${m.alt_group ?? ""}`;
    if (seen.has(key)) {
      throw new Error(
        `duplicate moment at same t_sec/name/order: ${m.name}@${m.t_sec} order=${m.order ?? 0}`
      );
    }
    seen.add(key);
  }
}

function validateMechanisms(tl: Timeline) {
  const { mechanisms } = tl;
  if (!mechanisms || mechanisms.length === 0) return;

  if (tl.moments.length === 0) {
    throw new Error(`Timeline "${tl.id}" cannot declare mechanisms without moments`);
  }

  const phasesById = new Map(tl.phases.map((p) => [p.id, p] as const));

  mechanisms.forEach((slice: MechanismSlice, idx) => {
    const phase = phasesById.get(slice.phaseId);
    if (!phase) {
      throw new Error(`mechanism[${idx}] refers to unknown phaseId="${slice.phaseId}"`);
    }
    if (!Number.isInteger(slice.start_sec) || !Number.isInteger(slice.end_sec)) {
      throw new Error(`mechanism[${idx}] must use integer seconds: ${slice.name}`);
    }
    if (slice.start_sec > slice.end_sec) {
      throw new Error(`mechanism[${idx}] start_sec must not exceed end_sec: ${slice.name}`);
    }
    const phaseStart = phase.start_sec;
    const phaseEnd = phase.end_sec ?? Number.POSITIVE_INFINITY;
    if (slice.start_sec < phaseStart || slice.end_sec > phaseEnd) {
      throw new Error(
        `mechanism[${idx}] must stay within phase ${phase.id} (${phaseStart}-${phase.end_sec ?? "∞"}): ${slice.name}`
      );
    }
  });
}

export function validateTimeline(tl: Timeline) {
  if (!tl.moments.every((m, i, arr) => i === 0 || arr[i - 1].t_sec <= m.t_sec)) {
    throw new Error(`Timeline "${tl.id}" moments are not sorted by t_sec`);
  }
  validateMoments(tl.moments);
  validateMechanisms(tl);
}