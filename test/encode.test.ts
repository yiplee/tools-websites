import { describe, expect, it } from 'vitest';
import { createEncodeTools, type EncodeTools, type HashAlgorithm } from '../src/tools/encode/encode';
import { longBase64, longHex } from './fixtures/encode-long';

const tools = createEncodeTools();
const utf8 = tools.encodeUtf8;

describe('fixed long encoding output', () => {
  it.each([
    ['base64-encode', longBase64],
    ['hex-encode', longHex],
  ] as const)('matches every output character across chunks without line wrapping for %s', async (operation, expected) => {
    const bytes = new Uint8Array(8195).map((_, i) => (i * 37 + (i >>> 8) * 17 + 11) % 256);
    expect(operation === 'base64-encode' ? tools.encodeBase64(bytes) : tools.encodeHex(bytes)).toBe(expected);
    const result = await tools.run(bytes, operation);
    expect(result.text).toBe(expected);
    expect(result.bytes).toEqual(utf8(expected));
  });
});

describe('Base64 (RFC 4648)', () => {
  it.each([
    ['', ''], ['f', 'Zg=='], ['fo', 'Zm8='], ['foo', 'Zm9v'],
    ['foob', 'Zm9vYg=='], ['fooba', 'Zm9vYmE='], ['foobar', 'Zm9vYmFy'],
  ])('encodes and decodes the standard vector %j', (text, encoded) => {
    expect(tools.encodeBase64(utf8(text))).toBe(encoded);
    expect(tools.decodeUtf8(tools.decodeBase64(encoded))).toBe(text);
    expect(tools.decodeUtf8(tools.decodeBase64(encoded.replace(/=+$/, '')))).toBe(text);
    const urlSafe = encoded.replace(/=+$/, '');
    expect(tools.encodeBase64(utf8(text), true)).toBe(urlSafe);
    expect(tools.decodeUtf8(tools.decodeBase64(urlSafe, true))).toBe(text);
  });

  it('supports distinct URL-safe and standard alphabets, padding and binary bytes', () => {
    const bytes = new Uint8Array([0xfb, 0xff]);
    expect(tools.encodeBase64(bytes)).toBe('+/8=');
    expect(tools.encodeBase64(bytes, true)).toBe('-_8');
    expect(tools.decodeBase64('-_8', true)).toEqual(bytes);
    expect(tools.decodeBase64('-_8=', true)).toEqual(bytes);
    expect(tools.decodeBase64(' +/8=\r\n\t ')).toEqual(bytes);
    expect(() => tools.decodeBase64('-_8')).toThrow('alphabet');
    expect(() => tools.decodeBase64('+/8=', true)).toThrow('alphabet');
    const allBytes = new Uint8Array(Array.from({ length: 256 }, (_, i) => i));
    for (const urlSafe of [false, true]) {
      expect(tools.decodeBase64(tools.encodeBase64(allBytes, urlSafe), urlSafe)).toEqual(allBytes);
    }
  });

  it.each(['A', 'Zg=', 'Zm8==', 'Zg===', 'Z=g=', '====', 'AA==AA', 'Zm9v=', 'Zg==!', 'Zg==\u00a0', 'é', 'Zh==', 'Zm9=', 'Zh', 'Zm9'])('rejects malformed or noncanonical input %j', (text) => {
    for (const urlSafe of [false, true]) expect(() => tools.decodeBase64(text, urlSafe)).toThrow(/Base64/);
  });

  it('handles long input without spread argument limits or chunk corruption', () => {
    const bytes = new Uint8Array(100_001).map((_, i) => i % 256);
    expect(tools.decodeBase64(tools.encodeBase64(bytes))).toEqual(bytes);
  });
});

describe('Hex and UTF-8', () => {
  it.each([['', ''], ['foo', '666f6f'], ['foobar', '666f6f626172'], ['你好🌍', 'e4bda0e5a5bdf09f8c8d']])('encodes and decodes %j', (text, hex) => {
    expect(tools.encodeHex(utf8(text))).toBe(hex);
    expect(tools.decodeUtf8(tools.decodeHex(hex))).toBe(text);
    expect(tools.decodeUtf8(tools.decodeHex(hex.toUpperCase()))).toBe(text);
  });

  it('preserves Unicode, BOM, null bytes, whitespace and line endings', () => {
    const text = '\ufeff你好🌍\0 café\r\n e\u0301 ';
    expect(tools.decodeUtf8(tools.decodeBase64(tools.encodeBase64(utf8(text))))).toBe(text);
    expect(tools.decodeUtf8(tools.decodeHex(tools.encodeHex(utf8(text))))).toBe(text);
    expect(tools.encodeBase64(utf8('你好🌍'))).toBe('5L2g5aW98J+MjQ==');
    expect(tools.decodeHex(' 00\t7F\r\nFF ')).toEqual(new Uint8Array([0, 127, 255]));
    expect(tools.decodeHex(' \n\t ')).toEqual(new Uint8Array());
  });

  it.each(['0', 'abc', '0x00', 'gg', '-1', '12:34', 'ab\u00a0cd'])('rejects invalid hex %j', (text) => {
    expect(() => tools.decodeHex(text)).toThrow(/hex/);
  });

  it.each([[0xff], [0xc0, 0xaf], [0xed, 0xa0, 0x80], [0xf0, 0x9f], [0x80]])('rejects invalid UTF-8 bytes %j', (...bytes) => {
    expect(() => tools.decodeUtf8(new Uint8Array(bytes))).toThrow('UTF-8');
  });

  it.each(['\ud800', '\udc00', 'a\ud800b'])('rejects unpaired UTF-16 surrogates rather than replacing them %j', (text) => {
    expect(() => utf8(text)).toThrow('surrogate');
  });
});

describe('MD5 (RFC 1321)', () => {
  it.each([
    ['', 'd41d8cd98f00b204e9800998ecf8427e'],
    ['a', '0cc175b9c0f1b6a831c399e269772661'],
    ['abc', '900150983cd24fb0d6963f7d28e17f72'],
    ['message digest', 'f96b697d7cb7938d525a2f31aaf161d0'],
    ['abcdefghijklmnopqrstuvwxyz', 'c3fcd3d76192e4007dfb496cca67e13b'],
    ['ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789', 'd174ab98d277d9f5a5611c2c9f419d9f'],
    ['12345678901234567890123456789012345678901234567890123456789012345678901234567890', '57edf4a22be3c955ac49da2e2107b67a'],
  ])('matches the RFC vector %j', async (text, expected) => {
    expect(await tools.hash(utf8(text), 'MD5')).toBe(expected);
  });

  // Fixed fixtures generated independently with Node/OpenSSL, without Node types in the browser/Worker project.
  it.each([
    [0, 'd41d8cd98f00b204e9800998ecf8427e'], [1, 'ff44570aca8241914870afbc310cdb85'],
    [55, '8412403cbea52dd8fa63039a39e49423'], [56, 'a3b41288abe4844eb8544d1eb7b158e2'],
    [57, '94d9252f0036e6c60a255b0450411bc8'], [63, 'a3d3df56ade67ec8f6be4d5459e28fcc'],
    [64, '287ab7dd271eca49b63aecffd44ec5aa'], [65, '60c82b70a2837fe97142c5e7d5728611'],
    [119, '392eac1e6d34abb485361a74500e3ddc'], [120, '6491d33a7068e74597e361288194c113'],
    [127, '81ba18b77353ddeaecd5c0d63bb6568b'], [128, '2323627deda2c1356c0413458395666c'],
    [8193, '4a3e9a9ceb6f7e448c1aa3ceec6603e5'],
  ] as const)('matches an independent fixture for %i binary bytes around block/padding boundaries', async (length, expected) => {
    const bytes = new Uint8Array(length + 4).map((_, i) => (i * 37) % 256).subarray(2, length + 2);
    expect(await tools.hash(bytes, 'MD5')).toBe(expected);
  });
});

describe('SHA (FIPS 180)', () => {
  it.each([
    ['SHA-1', '', 'da39a3ee5e6b4b0d3255bfef95601890afd80709'],
    ['SHA-1', 'abc', 'a9993e364706816aba3e25717850c26c9cd0d89d'],
    ['SHA-256', '', 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855'],
    ['SHA-256', 'abc', 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad'],
    ['SHA-256', 'abcdbcdecdefdefgefghfghighijhijkijkljklmklmnlmnomnopnopq', '248d6a61d20638b8e5c026930c3e6039a33ce45964ff2167f6ecedd419db06c1'],
    ['SHA-512', '', 'cf83e1357eefb8bdf1542850d66d8007d620e4050b5715dc83f4a921d36ce9ce47d0d13c5d85f2b0ff8318d2877eec2f63b931bd47417a81a538327af927da3e'],
    ['SHA-512', 'abc', 'ddaf35a193617abacc417349ae20413112e6fa4e89a97ea20a9eeee64b55d39a2192992a274fc1a836ba3c23a3feebbd454d4423643ce80e2a9ac94fa54ca49f'],
  ] as const)('matches %s for %j', async (algorithm, text, expected) => {
    expect(await tools.hash(utf8(text), algorithm)).toBe(expected);
  });

  it.each([
    ['MD5', 'ee7f1dd429e9e2735c1ebbc02a4b5c2e'],
    ['SHA-1', '4f9f706943eb66cc8580ca287b9b63c40c982d2a'],
    ['SHA-256', '15e9c601cc3e2a9953426451eb8a89a2ead363e0e3f3cb490829a5185eefdaf9'],
    ['SHA-512', '7799888c823441fd8e7040503351e15831eb419b0bca5e8b129eb62590fbb889c38cf7b2d33024fd438e1079de7f56685edbb79bfc76e16a6f9f626d33a7cc8d'],
  ] as const)('hashes exact UTF-8 and binary subarray bytes with %s', async (algorithm, reference) => {
    const text = '\ufeff你好🌍\r\n';
    const bytes = utf8(text);
    expect(await tools.hash(bytes, algorithm)).toBe(reference);
    const wrapped = new Uint8Array(bytes.length + 2);
    wrapped.set(bytes, 1);
    expect(await tools.hash(wrapped.subarray(1, -1), algorithm)).toBe(reference);
    expect(await tools.hash(utf8(text + '\n'), algorithm)).not.toBe(reference);
  });

  it('reports unavailable Web Crypto, rejected digests and unsupported algorithms', async () => {
    const unavailable = createEncodeTools(undefined);
    // An explicitly empty provider simulates an insecure/unsupported browser.
    const noSubtle = createEncodeTools({} as Pick<Crypto, 'subtle'>);
    expect(await unavailable.hash(utf8('abc'), 'MD5')).toBe('900150983cd24fb0d6963f7d28e17f72');
    await expect(noSubtle.hash(utf8('abc'), 'SHA-256')).rejects.toThrow('requires Web Crypto');
    const rejected = createEncodeTools({ subtle: { digest: async () => { throw new Error('unsupported'); } } as unknown as SubtleCrypto });
    await expect(rejected.hash(utf8('abc'), 'SHA-512')).rejects.toThrow('hashing failed');
    await expect(tools.hash(utf8('abc'), 'SHA-224' as HashAlgorithm)).rejects.toThrow('Unsupported');
  });
});

describe('browser operation pipeline', () => {
  it.each([
    ['base64-decode', '77u/Zm9v'],
    ['hex-decode', 'efbbbf666f6f'],
  ] as const)('removes exactly one leading input BOM and preserves decoded BOM bytes for %s', async (operation, encoded) => {
    expect(await tools.run(utf8('\ufeff' + encoded), operation)).toEqual({ text: '\ufefffoo', bytes: utf8('\ufefffoo'), filename: 'decoded.bin' });
    expect(await tools.run(utf8('\ufeff'), operation)).toEqual({ text: '', bytes: new Uint8Array(), filename: 'decoded.bin' });
    for (const invalid of ['\ufeff\ufeff' + encoded, ' \ufeff' + encoded, encoded + '\ufeff']) {
      await expect(tools.run(utf8(invalid), operation)).rejects.toThrow(/alphabet|hex/);
    }
  });

  // Fixed BOM fixtures computed offline with Buffer and node:crypto.
  it.each([
    ['base64-encode', '77u/Zm9v'],
    ['hex-encode', 'efbbbf666f6f'],
    ['MD5', '32c27a619c8e5abf3f24a3e33e099c12'],
    ['SHA-1', '154c1271e3bc3a50d04dd7cf1d70f4c97168d25e'],
    ['SHA-256', '857d0a404e89f3dae3bd73082006517d58620f93f78430b8b7ff44f05ec59f79'],
    ['SHA-512', '5ebfc5baec3920fb17bb66abb67c524dfd263917bb5f7dc1db6a0be5f9c5d05c55eb1202c387dd619e750a9d5e0ae9176326767a0a63a581885cbb959e8e9519'],
  ] as const)('preserves original BOM bytes when running %s', async (operation, expected) => {
    expect((await tools.run(utf8('\ufefffoo'), operation)).text).toBe(expected);
  });

  it('returns downloadable binary bytes when decoded data is not UTF-8', async () => {
    for (const [text, operation] of [['/wA=', 'base64-decode'], ['ff00', 'hex-decode']] as const) {
      expect(await tools.run(utf8(text), operation)).toEqual({ text: null, bytes: new Uint8Array([255, 0]), filename: 'decoded.bin' });
    }
    await expect(tools.run(new Uint8Array([255]), 'hex-decode')).rejects.toThrow('UTF-8');
    await expect(tools.run(utf8('bad!'), 'base64-decode')).rejects.toThrow('Base64');
  });

  it('preserves text/binary/empty outputs and selects suitable download filenames', async () => {
    expect(await tools.run(utf8('foo'), 'base64-encode')).toEqual({ text: 'Zm9v', bytes: utf8('Zm9v'), filename: 'base64.txt' });
    expect((await tools.run(new Uint8Array([251, 255]), 'base64-encode', true)).text).toBe('-_8');
    expect((await tools.run(utf8('-_8'), 'base64-decode', true)).bytes).toEqual(new Uint8Array([251, 255]));
    expect(await tools.run(utf8('你好🌍'), 'hex-encode')).toEqual({ text: 'e4bda0e5a5bdf09f8c8d', bytes: utf8('e4bda0e5a5bdf09f8c8d'), filename: 'hex.txt' });
    expect((await tools.run(utf8('666f6f'), 'hex-decode')).text).toBe('foo');
    for (const operation of ['base64-encode', 'base64-decode', 'hex-encode', 'hex-decode'] as const) {
      expect(await tools.run(new Uint8Array(), operation)).toMatchObject({ text: '', bytes: new Uint8Array() });
    }
    expect(await tools.run(utf8('abc'), 'SHA-256')).toMatchObject({ filename: 'hash.txt', text: 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad' });
  });

  it('executes the serialized factory without module imports or bundler helpers', async () => {
    const browserTools = new Function(`return (${createEncodeTools.toString()})();`)() as EncodeTools;
    expect(browserTools.decodeUtf8(browserTools.decodeBase64('5L2g5aW98J+MjQ=='))).toBe('你好🌍');
    expect(await browserTools.hash(utf8('abc'), 'MD5')).toBe('900150983cd24fb0d6963f7d28e17f72');
    expect(await browserTools.hash(utf8('abc'), 'SHA-256')).toBe('ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
  });
});
