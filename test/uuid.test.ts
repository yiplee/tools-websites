import { describe, expect, it, vi } from 'vitest';
import { createUuidTools, type UuidTools, type UuidVersion } from '../src/tools/uuid/uuid';

const milliseconds = 1_750_000_000_123;
function fixedRandom(byte = 0): Pick<Crypto, 'getRandomValues'> {
  return { getRandomValues: <T extends ArrayBufferView | null>(array: T): T => {
    if (array) new Uint8Array(array.buffer, array.byteOffset, array.byteLength).fill(byte);
    return array;
  } };
}

describe('UUID generation and formatting', () => {
  it.each([1, 4, 7] as const)('generates a unique bulk batch with v%i and RFC variant bits', (version) => {
    const tools = createUuidTools();
    const batch = tools.generateMany(version, 1000);
    expect(new Set(batch).size).toBe(1000);
    for (const uuid of batch) {
      expect(uuid).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[147][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
      expect(uuid[14]).toBe(String(version));
      expect(tools.parse(uuid)).toMatchObject({ valid: true, version, variant: 'RFC 9562 (10xx)' });
    }
  });

  it.each([1, 4, 7] as const)('applies all case, hyphen, and brace combinations to v%i', (version) => {
    const tools = createUuidTools(fixedRandom(0xab), () => milliseconds);
    const uuid = tools.generate(version);
    for (const uppercase of [false, true]) for (const hyphens of [false, true]) for (const braces of [false, true]) {
      const formatted = tools.format(uuid, { uppercase, hyphens, braces });
      expect(formatted.includes('-')).toBe(hyphens);
      expect(formatted.startsWith('{') && formatted.endsWith('}')).toBe(braces);
      expect(formatted).toBe(uppercase ? formatted.toUpperCase() : formatted.toLowerCase());
      expect(tools.parse(formatted)).toMatchObject({ valid: true, canonical: uuid, version });
      expect(tools.parse(tools.generate(version, { uppercase, hyphens, braces })).valid).toBe(true);
    }
  });

  it('uses native randomUUID for v4 when available, with getRandomValues as fallback', () => {
    const uuid = 'abcdef01-2345-4678-9abc-def012345678' as const;
    const randomUUID = vi.fn(() => uuid);
    const getRandomValues = vi.fn(fixedRandom().getRandomValues);
    const tools = createUuidTools({ randomUUID, getRandomValues: getRandomValues as typeof crypto.getRandomValues }, () => milliseconds);
    expect(tools.generate(4, { uppercase: true, braces: true, hyphens: false })).toBe('{ABCDEF01234546789ABCDEF012345678}');
    expect(randomUUID).toHaveBeenCalledOnce();
    expect(getRandomValues).not.toHaveBeenCalled();
    expect(createUuidTools(fixedRandom(255)).generate(4)).toBe('ffffffff-ffff-4fff-bfff-ffffffffffff');
    tools.generate(7);
    tools.generate(1);
    expect(randomUUID).toHaveBeenCalledOnce();
    expect(getRandomValues).toHaveBeenCalled();
  });

  it('enforces whole-number bulk counts from 1 to 1000 and supported versions', () => {
    const tools = createUuidTools();
    expect(tools.generateMany(4, 1)).toHaveLength(1);
    for (const count of [0, -1, 1001, 1.5, NaN, Infinity]) {
      expect(() => tools.generateMany(4, count)).toThrow(RangeError);
    }
    expect(() => tools.generate(3 as UuidVersion)).toThrow(RangeError);
  });

  it('encodes v1 timestamps and uses a stable random multicast node', () => {
    let time = milliseconds;
    const tools = createUuidTools(fixedRandom(0xaa), () => time);
    const first = tools.generate(1);
    const second = tools.generate(1);
    expect(tools.parse(first).timestampMilliseconds).toBe(time);
    expect(tools.parse(second).timestampMilliseconds).toBe(time);
    expect(first).not.toBe(second);
    expect(first.slice(24)).toBe('abaaaaaaaaaa');
    expect(first.slice(24)).toBe(second.slice(24));
    time--;
    const afterRollback = tools.generate(1);
    expect(afterRollback).not.toBe(first);
    expect(afterRollback.slice(19, 23)).not.toBe(first.slice(19, 23));
  });

  it('orders v7 within a millisecond, across clock changes, and on counter overflow', () => {
    let time = milliseconds;
    const tools = createUuidTools(fixedRandom(), () => time);
    const first = tools.generate(7);
    expect(tools.parse(first)).toMatchObject({ timestampMilliseconds: milliseconds, timestamp: new Date(milliseconds).toISOString() });
    const batch = [first, ...Array.from({ length: 5000 }, () => tools.generate(7))];
    expect(batch).toEqual([...batch].sort());
    expect(new Set(batch).size).toBe(batch.length);
    expect(tools.parse(batch[4095]).timestampMilliseconds).toBe(milliseconds);
    expect(tools.parse(batch[4096]).timestampMilliseconds).toBe(milliseconds + 1);
    time -= 100;
    const rollback = tools.generate(7);
    expect(rollback > batch.at(-1)!).toBe(true);
    time += 1000;
    const later = tools.generate(7);
    expect(later > rollback).toBe(true);
    expect(tools.parse(later).timestampMilliseconds).toBe(time);
  });

  it('rejects out-of-range timestamps and v7 overflow', () => {
    for (const time of [-1, NaN, Infinity, 1.5, 0x1000000000000]) {
      expect(() => createUuidTools(fixedRandom(), () => time).generate(7)).toThrow(RangeError);
    }
    for (const time of [NaN, -12_219_292_800_001, 200_000_000_000_000]) {
      expect(() => createUuidTools(fixedRandom(), () => time).generate(1)).toThrow(RangeError);
    }
    const tools = createUuidTools(fixedRandom(), () => 0xffffffffffff);
    for (let i = 0; i < 4096; i++) tools.generate(7);
    expect(() => tools.generate(7)).toThrow('overflow');
  });

  it('keeps the serialized browser factory self-contained', () => {
    const browserTools = new Function(`return (${createUuidTools.toString()})();`)() as UuidTools;
    for (const version of [1, 4, 7] as const) {
      expect(browserTools.parse(browserTools.generate(version))).toMatchObject({ valid: true, version });
    }
  });
});

describe('UUID validation and parsing', () => {
  const tools = createUuidTools();

  it('parses known v1 and v7 timestamps, including dates before the Unix epoch', () => {
    expect(tools.parse('01890f3e-7b00-7000-8000-000000000000').timestampMilliseconds).toBe(0x01890f3e7b00);
    expect(tools.parse('13814000-1dd2-11b2-8000-000000000001').timestamp).toBe('1970-01-01T00:00:00.000Z');
    expect(tools.parse('13813fff-1dd2-11b2-8000-000000000001').timestampMilliseconds).toBe(-1);
    expect(tools.parse('ffffffff-ffff-7fff-bfff-ffffffffffff').timestampMilliseconds).toBe(0xffffffffffff);
    expect(tools.parse('f47ac10b-58cc-4372-a567-0e02b2c3d479').timestamp).toBeUndefined();
  });

  it('accepts whitespace, either case, standard or missing hyphens, and optional braces', () => {
    const canonical = 'f47ac10b-58cc-4372-a567-0e02b2c3d479';
    for (const value of [canonical, canonical.toUpperCase(), canonical.replace(/-/g, ''), `{${canonical}}`, ` \n{${canonical.toUpperCase().replace(/-/g, '')}}\t`]) {
      expect(tools.parse(value)).toMatchObject({ valid: true, canonical, version: 4, kind: 'uuid' });
    }
  });

  it('recognizes nil and max special UUIDs', () => {
    expect(tools.parse('00000000-0000-0000-0000-000000000000')).toMatchObject({ valid: true, kind: 'nil', version: null, variant: 'NCS (0xxx)' });
    expect(tools.parse('{FFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFF}')).toMatchObject({ valid: true, kind: 'max', version: null, variant: 'Reserved for future use (111x)' });
  });

  it.each([null, 42, undefined, '', 'hello', 'g'.repeat(32), 'f'.repeat(31), 'f'.repeat(33), '{f47ac10b-58cc-4372-a567-0e02b2c3d479', 'f47ac10b58cc-4372a5670e02b2c3d479', '{{f47ac10b-58cc-4372-a567-0e02b2c3d479}}'])('rejects malformed input %s', (value) => {
    expect(tools.parse(value)).toMatchObject({ valid: false, error: expect.any(String) });
  });

  it('reports non-RFC variants and unsupported versions as invalid', () => {
    const variants = [['0', 'NCS'], ['c', 'Microsoft'], ['e', 'Reserved']] as const;
    for (const [bits, variant] of variants) {
      const result = tools.parse(`f47ac10b-58cc-4372-${bits}567-0e02b2c3d479`);
      expect(result.valid).toBe(false);
      expect(result.variant).toContain(variant);
    }
    for (const version of ['0', '9', 'a', 'f']) {
      expect(tools.parse(`f47ac10b-58cc-${version}372-a567-0e02b2c3d479`).valid).toBe(false);
    }
    for (let version = 1; version <= 8; version++) {
      expect(tools.parse(`f47ac10b-58cc-${version}372-a567-0e02b2c3d479`).valid).toBe(true);
    }
  });
});
