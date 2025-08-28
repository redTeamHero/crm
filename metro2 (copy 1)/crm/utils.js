export function ensureBuffer(data) {
  return Buffer.isBuffer(data) ? data : Buffer.from(data);
}
