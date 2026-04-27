/**
 * Runtime `pako` does not always ship with typings consumed by `tsc` in CI.
 * Keep this minimal surface aligned with `src/logic/share.ts`.
 */
declare module "pako" {
  interface DeflateOptions {
    level?: number;
  }

  const pako: {
    deflate(data: Uint8Array, options?: DeflateOptions): Uint8Array;
    inflate(data: Uint8Array): Uint8Array;
  };

  export default pako;
}
