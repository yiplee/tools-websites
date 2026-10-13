export type UuidVersion = 1 | 4 | 7;
export interface FormatOptions { uppercase?: boolean; hyphens?: boolean; braces?: boolean }
export interface ParsedUuid {
  valid: boolean;
  error?: string;
  canonical?: string;
  version?: number | null;
  variant?: string;
  kind?: 'uuid' | 'nil' | 'max';
  timestamp?: string;
  timestampMilliseconds?: number;
}

/**
 * A self-contained factory, serialized into the page after TypeScript compilation.
 * Keep every runtime dependency inside this function: UUID computation runs only
 * in the browser. Inject the clock/crypto for deterministic tests.
 */
export function createUuidTools(
  random: Pick<Crypto, 'getRandomValues'> & Partial<Pick<Crypto, 'randomUUID'>> = globalThis.crypto,
  now: () => number = Date.now,
) {
  let lastV7 = -1;
  let v7Counter = 0;
  let lastV1Ticks = -1n;
  let previousV1Clock = -1;
  let node: Uint8Array | undefined;
  let clockSequence = 0;
  const gregorianOffset = 122192928000000000n;

  function hex(bytes: Uint8Array): string {
    return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
  }

  function canonical(value: string): string {
    return `${value.slice(0, 8)}-${value.slice(8, 12)}-${value.slice(12, 16)}-${value.slice(16, 20)}-${value.slice(20)}`;
  }

  function format(value: string, options: FormatOptions = {}): string {
    let result = options.hyphens === false ? value.replace(/-/g, '') : value;
    result = options.uppercase ? result.toUpperCase() : result.toLowerCase();
    return options.braces ? `{${result}}` : result;
  }

  function generate(version: UuidVersion = 4, options: FormatOptions = {}): string {
    if (version !== 1 && version !== 4 && version !== 7) throw new RangeError('Choose UUID version 1, 4, or 7.');
    if (version === 4 && random.randomUUID) return format(random.randomUUID(), options);
    const bytes = random.getRandomValues(new Uint8Array(16));
    if (version === 7) {
      // RFC 9562 Method 1: 12-bit counter in rand_a, random 62-bit rand_b.
      // Preserve ordering within this factory even if the wall clock goes back.
      const wallClock = now();
      if (!Number.isSafeInteger(wallClock) || wallClock < 0 || wallClock > 0xffffffffffff) {
        throw new RangeError('Clock is outside the UUID v7 timestamp range.');
      }
      let milliseconds = Math.max(wallClock, lastV7);
      if (milliseconds === lastV7) {
        v7Counter++;
        if (v7Counter > 0xfff) { milliseconds++; v7Counter = 0; }
      } else {
        // Random start in the lower half leaves room for a large batch.
        v7Counter = ((bytes[6] << 8) | bytes[7]) & 0x7ff;
      }
      if (milliseconds > 0xffffffffffff) throw new RangeError('UUID v7 timestamp overflow.');
      lastV7 = milliseconds;
      let timestamp = BigInt(milliseconds);
      for (let index = 5; index >= 0; index--) {
        bytes[index] = Number(timestamp & 0xffn);
        timestamp >>= 8n;
      }
      bytes[6] = 0x70 | (v7Counter >> 8);
      bytes[7] = v7Counter & 0xff;
    } else if (version === 1) {
      if (!node) {
        node = random.getRandomValues(new Uint8Array(6));
        node[0] |= 1; // RFC 9562: random node identifier has the multicast bit set.
        clockSequence = ((bytes[8] << 8) | bytes[9]) & 0x3fff;
      }
      const wallClock = now();
      if (!Number.isSafeInteger(wallClock)) throw new RangeError('Invalid clock.');
      if (wallClock < previousV1Clock) clockSequence = (clockSequence + 1) & 0x3fff;
      previousV1Clock = wallClock;
      let ticks = BigInt(wallClock) * 10000n + gregorianOffset;
      if (ticks < 0 || ticks >= (1n << 60n)) throw new RangeError('Clock is outside the UUID v1 timestamp range.');
      if (ticks <= lastV1Ticks) ticks = lastV1Ticks + 1n;
      if (ticks < 0 || ticks >= (1n << 60n)) throw new RangeError('Clock is outside the UUID v1 timestamp range.');
      lastV1Ticks = ticks;
      const low = Number(ticks & 0xffffffffn);
      bytes[0] = low >>> 24;
      bytes[1] = (low >>> 16) & 0xff;
      bytes[2] = (low >>> 8) & 0xff;
      bytes[3] = low & 0xff;
      const mid = Number((ticks >> 32n) & 0xffffn);
      bytes[4] = mid >>> 8;
      bytes[5] = mid & 0xff;
      const high = Number((ticks >> 48n) & 0xfffn);
      bytes[6] = 0x10 | (high >>> 8);
      bytes[7] = high & 0xff;
      bytes[8] = (clockSequence >> 8) & 0x3f;
      bytes[9] = clockSequence & 0xff;
      bytes.set(node, 10);
    } else {
      bytes[6] = (bytes[6] & 0x0f) | 0x40;
    }
    bytes[8] = (bytes[8] & 0x3f) | 0x80;
    return format(canonical(hex(bytes)), options);
  }

  function generateMany(version: UuidVersion, count: number, options: FormatOptions = {}): string[] {
    if (!Number.isInteger(count) || count < 1 || count > 1000) throw new RangeError('Count must be a whole number from 1 to 1000.');
    return Array.from({ length: count }, () => generate(version, options));
  }

  function parse(input: unknown): ParsedUuid {
    if (typeof input !== 'string') return { valid: false, error: 'Enter a UUID as text.' };
    let text = input.trim();
    if (text.startsWith('{') && text.endsWith('}')) text = text.slice(1, -1);
    if (!/^(?:[0-9a-f]{32}|[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$/i.test(text)) {
      return { valid: false, error: 'Use 32 hexadecimal digits, with standard hyphens or no hyphens. Braces are optional.' };
    }
    const compact = text.replace(/-/g, '').toLowerCase();
    const normalized = canonical(compact);
    if (compact === '0'.repeat(32)) return { valid: true, canonical: normalized, kind: 'nil', version: null, variant: 'NCS (0xxx)' };
    if (compact === 'f'.repeat(32)) return { valid: true, canonical: normalized, kind: 'max', version: null, variant: 'Reserved for future use (111x)' };
    const version = parseInt(compact[12], 16);
    const variantBits = parseInt(compact[16], 16);
    const variant = variantBits < 8 ? 'NCS (0xxx)' : variantBits < 12 ? 'RFC 9562 (10xx)' : variantBits < 14 ? 'Microsoft (110x)' : 'Reserved for future use (111x)';
    const result: ParsedUuid = { valid: true, canonical: normalized, kind: 'uuid', version, variant };
    if (variantBits < 8 || variantBits >= 12) return { ...result, valid: false, error: 'This tool validates RFC 9562 UUIDs, plus the special nil and max UUIDs. This variant is not RFC 9562.' };
    if (version < 1 || version > 8) return { ...result, valid: false, error: 'The version field must be between 1 and 8 for an RFC 9562 UUID.' };
    if (version === 7) {
      result.timestampMilliseconds = Number(BigInt(`0x${compact.slice(0, 12)}`));
    } else if (version === 1) {
      const ticks = BigInt(`0x${compact.slice(13, 16)}${compact.slice(8, 12)}${compact.slice(0, 8)}`);
      // Floor correctly for timestamps before the Unix epoch, too.
      const unixTicks = ticks - gregorianOffset;
      result.timestampMilliseconds = Number(unixTicks >= 0n ? unixTicks / 10000n : (unixTicks - 9999n) / 10000n);
    }
    if (result.timestampMilliseconds !== undefined) result.timestamp = new Date(result.timestampMilliseconds).toISOString();
    return result;
  }

  return { generate, generateMany, format, parse };
}

export type UuidTools = ReturnType<typeof createUuidTools>;
