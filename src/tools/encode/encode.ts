export type HashAlgorithm = 'MD5' | 'SHA-1' | 'SHA-256' | 'SHA-512';
export type EncodeOperation = 'base64-encode' | 'base64-decode' | 'hex-encode' | 'hex-decode' | HashAlgorithm;

export interface EncodeResult {
  /** Null means binary data that cannot be previewed as valid UTF-8. */
  text: string | null;
  bytes: Uint8Array;
  filename: string;
}

export interface EncodeTools {
  encodeUtf8(text: string): Uint8Array;
  decodeUtf8(bytes: Uint8Array): string;
  encodeBase64(bytes: Uint8Array, urlSafe?: boolean): string;
  decodeBase64(text: string, urlSafe?: boolean): Uint8Array;
  encodeHex(bytes: Uint8Array): string;
  decodeHex(text: string): Uint8Array;
  hash(bytes: Uint8Array, algorithm: HashAlgorithm): Promise<string>;
  run(bytes: Uint8Array, operation: EncodeOperation, urlSafe?: boolean): Promise<EncodeResult>;
}

/** Self-contained so its compiled source can run in the nonce-protected browser script. */
export function createEncodeTools(cryptoProvider: Pick<Crypto, 'subtle'> | undefined = globalThis.crypto): EncodeTools {
  const encoder = new TextEncoder();
  // Preserve a leading BOM: it is part of the user's bytes, not metadata to discard.
  const decoder = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true });
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';

  function encodeUtf8(text: string): Uint8Array {
    // TextEncoder otherwise silently replaces unpaired UTF-16 surrogates.
    for (let i = 0; i < text.length; i++) {
      const code = text.charCodeAt(i);
      if (code >= 0xd800 && code <= 0xdbff) {
        const next = text.charCodeAt(++i);
        if (!(next >= 0xdc00 && next <= 0xdfff)) throw new Error('Text contains an unpaired Unicode surrogate. Use valid UTF-8 text.');
      } else if (code >= 0xdc00 && code <= 0xdfff) {
        throw new Error('Text contains an unpaired Unicode surrogate. Use valid UTF-8 text.');
      }
    }
    return encoder.encode(text);
  }

  function decodeUtf8(bytes: Uint8Array): string {
    try { return decoder.decode(bytes); }
    catch { throw new Error('Input is not valid UTF-8 text. Use a UTF-8 encoded file for decoding.'); }
  }

  function encodeBase64(bytes: Uint8Array, urlSafe = false): string {
    const parts: string[] = [];
    let part = '';
    for (let i = 0; i < bytes.length; i += 3) {
      const a = bytes[i], b = bytes[i + 1] ?? 0, c = bytes[i + 2] ?? 0;
      part += alphabet[a >>> 2] + alphabet[((a & 3) << 4) | (b >>> 4)]
        + (i + 1 < bytes.length ? alphabet[((b & 15) << 2) | (c >>> 6)] : '=')
        + (i + 2 < bytes.length ? alphabet[c & 63] : '=');
      if (part.length >= 8192) { parts.push(part); part = ''; }
    }
    parts.push(part);
    const result = parts.join('');
    return urlSafe ? result.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '') : result;
  }

  function decodeBase64(text: string, urlSafe = false): Uint8Array {
    const compact = text.replace(/[\t\n\r ]/g, '');
    const valid = urlSafe ? /^[A-Za-z0-9_-]*={0,2}$/ : /^[A-Za-z0-9+/]*={0,2}$/;
    if (!valid.test(compact)) throw new Error(`Invalid ${urlSafe ? 'URL-safe' : 'standard'} Base64 alphabet or padding. Check the selected alphabet.`);
    const unpadded = compact.replace(/=+$/, '');
    const remainder = unpadded.length % 4;
    const padding = compact.length - unpadded.length;
    if (remainder === 1 || (padding > 0 && (compact.length % 4 !== 0 || padding !== (4 - remainder) % 4))) {
      throw new Error('Invalid Base64 length or padding. Use complete groups with optional correct trailing = padding.');
    }
    const normalized = unpadded.replace(/-/g, '+').replace(/_/g, '/');
    // RFC 4648 requires unused bits to be zero. Permissive decoders lose this information.
    const last = alphabet.indexOf(normalized.at(-1) ?? 'A');
    if ((remainder === 2 && (last & 15) !== 0) || (remainder === 3 && (last & 3) !== 0)) {
      throw new Error('Invalid Base64: unused padding bits must be zero.');
    }
    const result = new Uint8Array(Math.floor(normalized.length * 6 / 8));
    let buffer = 0, bits = 0, offset = 0;
    for (const character of normalized) {
      buffer = (buffer << 6) | alphabet.indexOf(character);
      bits += 6;
      if (bits >= 8) { bits -= 8; result[offset++] = (buffer >>> bits) & 255; }
    }
    return result;
  }

  function encodeHex(bytes: Uint8Array): string {
    const parts: string[] = [];
    let part = '';
    for (const byte of bytes) {
      part += byte.toString(16).padStart(2, '0');
      if (part.length >= 8192) { parts.push(part); part = ''; }
    }
    parts.push(part);
    return parts.join('');
  }

  function decodeHex(text: string): Uint8Array {
    const compact = text.replace(/[\t\n\r ]/g, '');
    if (!/^[0-9a-fA-F]*$/.test(compact)) throw new Error('Invalid hex: use only digits 0–9 and letters A–F, without a 0x prefix.');
    if (compact.length % 2 !== 0) throw new Error('Invalid hex length: each byte needs two hex digits.');
    const result = new Uint8Array(compact.length / 2);
    for (let i = 0; i < result.length; i++) result[i] = parseInt(compact.slice(i * 2, i * 2 + 2), 16);
    return result;
  }

  // RFC 1321: 512-bit blocks, little-endian words and length, four 16-round stages.
  const shifts = [7, 12, 17, 22, 5, 9, 14, 20, 4, 11, 16, 23, 6, 10, 15, 21];
  const constants = Array.from({ length: 64 }, (_, i) => Math.floor(Math.abs(Math.sin(i + 1)) * 0x100000000) | 0);
  function md5(bytes: Uint8Array): string {
    const padded = new Uint8Array(Math.ceil((bytes.length + 9) / 64) * 64);
    padded.set(bytes);
    padded[bytes.length] = 0x80;
    const view = new DataView(padded.buffer);
    view.setUint32(padded.length - 8, (bytes.length * 8) >>> 0, true);
    view.setUint32(padded.length - 4, Math.floor(bytes.length / 0x20000000), true);
    let a0 = 0x67452301, b0 = 0xefcdab89, c0 = 0x98badcfe, d0 = 0x10325476;
    for (let offset = 0; offset < padded.length; offset += 64) {
      let a = a0, b = b0, c = c0, d = d0;
      for (let i = 0; i < 64; i++) {
        let f: number, word: number;
        if (i < 16) { f = (b & c) | (~b & d); word = i; }
        else if (i < 32) { f = (d & b) | (~d & c); word = (5 * i + 1) % 16; }
        else if (i < 48) { f = b ^ c ^ d; word = (3 * i + 5) % 16; }
        else { f = c ^ (b | ~d); word = (7 * i) % 16; }
        const sum = (a + f + constants[i] + view.getUint32(offset + word * 4, true)) | 0;
        const shift = shifts[Math.floor(i / 16) * 4 + i % 4];
        const next = (b + ((sum << shift) | (sum >>> (32 - shift)))) | 0;
        a = d; d = c; c = b; b = next;
      }
      a0 = (a0 + a) | 0; b0 = (b0 + b) | 0; c0 = (c0 + c) | 0; d0 = (d0 + d) | 0;
    }
    const digest = new Uint8Array(16);
    const digestView = new DataView(digest.buffer);
    [a0, b0, c0, d0].forEach((word, i) => digestView.setUint32(i * 4, word, true));
    return encodeHex(digest);
  }

  async function hash(bytes: Uint8Array, algorithm: HashAlgorithm): Promise<string> {
    if (algorithm === 'MD5') return md5(bytes);
    if (!['SHA-1', 'SHA-256', 'SHA-512'].includes(algorithm)) throw new Error('Unsupported hash algorithm. Choose MD5, SHA-1, SHA-256 or SHA-512.');
    if (!cryptoProvider?.subtle) throw new Error('SHA hashing requires Web Crypto. Open this page in a browser over HTTPS.');
    try {
      return encodeHex(new Uint8Array(await cryptoProvider.subtle.digest(algorithm, new Uint8Array(bytes).buffer)));
    } catch { throw new Error(`${algorithm} hashing failed. Check that your browser supports Web Crypto.`); }
  }

  async function run(bytes: Uint8Array, operation: EncodeOperation, urlSafe = false): Promise<EncodeResult> {
    let text: string;
    if (operation === 'base64-decode' || operation === 'hex-decode') {
      // A single leading BOM is metadata on encoded text, not part of its alphabet.
      const input = decodeUtf8(bytes).replace(/^\uFEFF/, '');
      const decoded = operation === 'base64-decode' ? decodeBase64(input, urlSafe) : decodeHex(input);
      let preview: string | null;
      try { preview = decodeUtf8(decoded); } catch { preview = null; }
      return { text: preview, bytes: decoded, filename: 'decoded.bin' };
    }
    if (operation === 'base64-encode') text = encodeBase64(bytes, urlSafe);
    else if (operation === 'hex-encode') text = encodeHex(bytes);
    else text = await hash(bytes, operation);
    return { text, bytes: encodeUtf8(text), filename: operation === 'base64-encode' ? 'base64.txt' : operation === 'hex-encode' ? 'hex.txt' : 'hash.txt' };
  }

  return { encodeUtf8, decodeUtf8, encodeBase64, decodeBase64, encodeHex, decodeHex, hash, run };
}
