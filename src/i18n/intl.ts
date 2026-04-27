export type IntlText = string;

export function resolveIntlString(
  base: IntlText,
  intl: Record<string, string> | undefined
): string {
  if (!intl) return base;
  return intl.ja ?? base;
}
