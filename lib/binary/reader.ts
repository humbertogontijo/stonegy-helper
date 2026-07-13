export class BinaryReader {
  private offset = 0;

  constructor(private readonly buffer: Uint8Array) {}

  get position() {
    return this.offset;
  }

  get remaining() {
    return this.buffer.length - this.offset;
  }

  get length() {
    return this.buffer.length;
  }

  get bufferView() {
    return this.buffer;
  }

  slice(start = 0, end = this.buffer.length) {
    return this.buffer.slice(start, end);
  }

  seek(position: number) {
    if (position < 0 || position > this.buffer.length) {
      throw new RangeError(`Seek position ${position} is out of range`);
    }
    this.offset = position;
  }

  skip(bytes: number) {
    if (bytes < 0) {
      throw new RangeError(`Cannot skip negative byte count: ${bytes}`);
    }
    this.offset += bytes;
    if (this.offset > this.buffer.length) {
      throw new RangeError(`Read past end of buffer at offset ${this.offset}`);
    }
  }

  u8() {
    this.ensureAvailable(1);
    return this.buffer[this.offset++];
  }

  u16() {
    this.ensureAvailable(2);
    const value = this.buffer[this.offset] | (this.buffer[this.offset + 1] << 8);
    this.offset += 2;
    return value;
  }

  u16Be() {
    this.ensureAvailable(2);
    const value = (this.buffer[this.offset] << 8) | this.buffer[this.offset + 1];
    this.offset += 2;
    return value;
  }

  u32() {
    this.ensureAvailable(4);
    const value =
      this.buffer[this.offset] |
      (this.buffer[this.offset + 1] << 8) |
      (this.buffer[this.offset + 2] << 16) |
      (this.buffer[this.offset + 3] << 24);
    this.offset += 4;
    return value >>> 0;
  }

  u32Be() {
    this.ensureAvailable(4);
    const value =
      (this.buffer[this.offset] << 24) |
      (this.buffer[this.offset + 1] << 16) |
      (this.buffer[this.offset + 2] << 8) |
      this.buffer[this.offset + 3];
    this.offset += 4;
    return value >>> 0;
  }

  /**
   * Read a little-endian u64 as a JS number.
   * Values above Number.MAX_SAFE_INTEGER lose precision — use {@link u64Safe}
   * for money / quantity fields that must stay exact.
   */
  u64() {
    const lo = this.u32();
    const hi = this.u32();
    return lo + hi * 0x100000000;
  }

  /** Like {@link u64}, but rejects values outside Number.MAX_SAFE_INTEGER. */
  u64Safe() {
    const value = this.u64();
    if (!Number.isSafeInteger(value) || value < 0) {
      throw new RangeError(`u64 value ${value} is not a safe integer`);
    }
    return value;
  }

  i32() {
    return this.u32() | 0;
  }

  /**
   * Read a little-endian i64 as a JS number (may lose precision for huge magnitudes).
   * Use {@link i64Safe} when exactness matters.
   */
  i64() {
    const lo = this.u32();
    const hi = this.i32();
    return lo + hi * 0x100000000;
  }

  /** Like {@link i64}, but rejects values outside Number.MAX_SAFE_INTEGER. */
  i64Safe() {
    const value = this.i64();
    if (!Number.isSafeInteger(value)) {
      throw new RangeError(`i64 value ${value} is not a safe integer`);
    }
    return value;
  }

  bytes(length: number) {
    this.ensureAvailable(length);
    const value = this.buffer.slice(this.offset, this.offset + length);
    this.offset += length;
    return value;
  }

  uuid() {
    const raw = this.bytes(16);
    const hex = [...raw].map((byte) => byte.toString(16).padStart(2, "0")).join("");
    return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
  }

  stringUtf16LengthPrefixed() {
    const length = this.u16();
    const raw = this.bytes(length);
    return new TextDecoder().decode(raw);
  }

  stringAsciiLengthPrefixed() {
    const length = this.u16();
    const raw = this.bytes(length);
    return new TextDecoder().decode(raw);
  }

  stringAsciiLengthPrefixedBe() {
    const length = this.u16Be();
    const raw = this.bytes(length);
    return new TextDecoder().decode(raw);
  }

  rest() {
    return this.bytes(this.remaining);
  }

  private ensureAvailable(length: number) {
    if (this.offset + length > this.buffer.length) {
      throw new RangeError(
        `Need ${length} bytes at offset ${this.offset}, but only ${this.remaining} remain`
      );
    }
  }
}

export function decodeBase64ToBytes(base64: string): Uint8Array {
  const binary = globalThis.atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return bytes;
}

export function encodeBytesToBase64(bytes: Uint8Array): string {
  let binary = "";
  for (let index = 0; index < bytes.length; index += 1) {
    binary += String.fromCharCode(bytes[index]);
  }
  return globalThis.btoa(binary);
}
