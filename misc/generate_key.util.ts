import { encodeHex } from "@std/encoding";

export function generate_key(length = 32){
  const randomBytes = crypto.getRandomValues(new Uint8Array(length))
  return encodeHex(randomBytes)
}