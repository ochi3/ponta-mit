export function buildMomentNoteKey(t_sec: number, lineIndex: number) {
  return `${t_sec}::${lineIndex}`;
}

export function normalizeMomentNotes(
  raw?: Record<string, string> | null
): Record<string, string> {
  if (!raw) {
    return {};
  }

  const out: Record<string, string> = {};
  for (const [key, value] of Object.entries(raw)) {
    if (typeof value !== "string") {
      continue;
    }
    out[key] = value;
  }
  return out;
}

export function resolveMomentNote(
  momentNotes: Record<string, string>,
  t_sec: number,
  lineIndex: number,
  builtinNote?: string
) {
  const key = buildMomentNoteKey(t_sec, lineIndex);
  if (Object.prototype.hasOwnProperty.call(momentNotes, key)) {
    return momentNotes[key];
  }
  return builtinNote ?? "";
}
