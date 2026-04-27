export type IntlText = string;

export function resolveIntlString(
  base: IntlText,
  intl: any | undefined,
  _locale: string
): string {
  if (!intl) return base;
  return intl.ja ?? base;
}
