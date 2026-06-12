/**
 * Minimal type declaration for bs58 v4 (no @types/bs58 available).
 * bs58 v4 uses a default export with encode/decode.
 */
declare module "bs58" {
  const bs58: {
    encode(data: Uint8Array | Buffer): string;
    decode(str: string): Buffer;
  };
  export default bs58;
}
