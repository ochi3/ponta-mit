import type { JobId } from "../../types";

const iconModules = import.meta.glob("../../assets/icons/jobs/*.png", {
  eager: true,
  as: "url",
}) as Record<string, string>;

const JOB_ICON_MAP: Partial<Record<JobId, string>> = {};

for (const [path, url] of Object.entries(iconModules)) {
  const filename = path.split("/").pop()!;
  const id = filename.replace(".png", "") as JobId;
  JOB_ICON_MAP[id] = url;
}

export function getJobIcon(id: JobId): string | undefined {
  return JOB_ICON_MAP[id];
}
