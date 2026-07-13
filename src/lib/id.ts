import { randomBytes } from "node:crypto";

const ALPHABET = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";

function encode(value: bigint, length: number): string {
  let output = "";
  let remaining = value;
  for (let index = 0; index < length; index += 1) {
    output = ALPHABET[Number(remaining & 31n)] + output;
    remaining >>= 5n;
  }
  return output;
}

export function ulid(now = Date.now()): string {
  const timestamp = encode(BigInt(now), 10);
  const random = randomBytes(10);
  let randomValue = 0n;
  for (const byte of random) randomValue = (randomValue << 8n) | BigInt(byte);
  return `${timestamp}${encode(randomValue, 16)}`;
}

export function newId(prefix: string, now = Date.now()): string {
  return `${prefix}-${ulid(now)}`;
}
