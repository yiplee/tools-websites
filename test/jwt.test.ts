import { jwtVectors, smallRsaPem } from './fixtures/jwt-vectors';
import { describe, expect, it, vi, afterEach } from 'vitest';
import { createJwtTools, type JwtAlgorithm } from '../src/tools/jwt/jwt';

const tools = createJwtTools();
const b64 = (text: string | Uint8Array) => btoa(String.fromCharCode(...(typeof text === 'string' ? new TextEncoder().encode(text) : text))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const unb64 = (text: string) => Uint8Array.from(atob(text.replace(/-/g, '+').replace(/_/g, '/')), (char) => char.charCodeAt(0));
const parts = (header: unknown = { alg: 'HS256' }, payload: unknown = {}) => `${b64(JSON.stringify(header))}.${b64(JSON.stringify(payload))}`;
const token = (header?: unknown, payload?: unknown, signature = 'AA') => `${parts(header, payload)}.${signature}`;
const secret = ' exact 中文 secret 🌍\n';
const hmacToken = async (alg: JwtAlgorithm = 'HS256', payload: unknown = {}, header: object = { alg }, key = secret) => {
  const input = parts(header, payload);
  const cryptoKey = await crypto.subtle.importKey('raw', new TextEncoder().encode(key), { name: 'HMAC', hash: `SHA-${alg.slice(2)}` }, false, ['sign']);
  return `${input}.${b64(new Uint8Array(await crypto.subtle.sign('HMAC', cryptoKey, new TextEncoder().encode(input))))}`;
};
// Public JWT example from https://jwt.io: fixed input and signature, independent of this implementation.
const knownJwt = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIiwibmFtZSI6IkpvaG4gRG9lIiwiaWF0IjoxNTE2MjM5MDIyfQ.SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV_adQssw5c';

afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });

describe('JWT known vectors and strict decoding', () => {
  it('decodes and verifies the fixed standard HS256 JWT', async () => {
    const decoded = tools.decode(knownJwt);
    expect(decoded.header).toEqual({ alg: 'HS256', typ: 'JWT' });
    expect(decoded.payload).toEqual({ sub: '1234567890', name: 'John Doe', iat: 1516239022 });
    expect(decoded.signature).toHaveLength(32);
    expect(decoded.signingInput).toBe(knownJwt.slice(0, knownJwt.lastIndexOf('.')));
    expect(await tools.verify(knownJwt, 'your-256-bit-secret', 'HS256')).toBe(true);
    expect(await tools.verify(knownJwt, 'wrong secret', 'HS256')).toBe(false);
    expect(tools.decode(` \n${knownJwt}\t `)).toEqual(decoded);
  });
  it('preserves Unicode, JSON whitespace, original encoded signing bytes and hostile text', async () => {
    const input = `${b64('{ "typ": "JWT", "alg": "HS256" }\r\n')}.${b64('{"name":"你好🌍","text":"</script><img src=x onerror=alert(1)>"}\n')}`;
    const cryptoKey = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
    const jwt = `${input}.${b64(new Uint8Array(await crypto.subtle.sign('HMAC', cryptoKey, new TextEncoder().encode(input))))}`;
    expect(tools.decode(jwt).payload.name).toBe('你好🌍');
    expect(await tools.verify(jwt, secret, 'HS256')).toBe(true);
  });
  it.each(['', 'a', 'a.b', 'a.b.c.d', 'a.b.c.d.e', '.e30.AA', 'e30..AA', ' e30 .e30.AA', '%%%.' + b64('{}') + '.AA', `${b64('{')}.e30.AA`, `${b64('null')}.e30.AA`, `${b64('[]')}.e30.AA`, `${b64('3')}.e30.AA`, `${b64('{}')}.e30.AA`, token({ alg: 2 }), token({ alg: '' }), token({ alg: 'HS256' }, null), token({ alg: 'HS256' }, []), token({ alg: 'HS256' }, 'text'), token({ alg: 'HS256' }, {}, ''), token({ alg: 'none' }, {}, 'AA'), `${b64('{"alg":"HS256"}')}.${b64(Uint8Array.of(0xc3, 0x28))}.AA`, `${b64('\ufeff{"alg":"HS256"}')}.e30.AA`, token(undefined, undefined, 'AB')])('rejects malformed token %s', (jwt) => {
    expect(() => tools.decode(jwt)).toThrow();
  });
  it('limits input size and leaves unsigned tokens inspectable', async () => {
    expect(() => tools.decode('x'.repeat(1024 * 1024 + 1))).toThrow(/1 MiB/);
    const jwt = token({ alg: 'none' }, { sub: 'untrusted' }, '');
    expect(tools.decode(jwt).payload).toEqual({ sub: 'untrusted' });
    await expect(tools.verify(jwt, secret, 'HS256')).rejects.toThrow(/unsigned/);
    await expect(tools.verify(token({ alg: 'EdDSA' }), secret, 'HS256')).rejects.toThrow(/Unsupported/);
  });
});

describe('unpadded base64url boundaries', () => {
  it.each([['', []], ['Zg', [102]], ['Zm8', [102, 111]], ['Zm9v', [102, 111, 111]], ['AA', [0]], ['_w', [255]], ['-_8', [251, 255]], ['____', [255, 255, 255]]])('decodes %s', (input, bytes) => {
    expect([...tools.decodeBase64Url(input as string)]).toEqual(bytes);
  });
  it.each(['A', 'AAAAA', 'Zg=', 'Zg==', 'Zg===', 'Z=g', 'Zg\n', ' Zg', '+w', '/w', 'ＡＡ', 'Zh', 'Zm9', 'AB', '_x', '-_9'])('rejects %s', (input) => {
    expect(() => tools.decodeBase64Url(input)).toThrow(/base64url/);
  });
  it('round-trips all byte values and every residual length against an independent encoder', () => {
    for (let length = 0; length < 260; length++) {
      const bytes = Uint8Array.from({ length }, (_, index) => index % 256);
      expect(tools.decodeBase64Url(b64(bytes))).toEqual(bytes);
    }
    expect(() => tools.decodeBase64Url('A'.repeat(1024 * 1024 + 1))).toThrow(/1 MiB/);
  });
});

describe('NumericDate and time boundaries', () => {
  it('uses exact expiration and not-before boundaries, independently of signatures', () => {
    expect(tools.inspectTimes({ exp: 100, nbf: 99, iat: 50 }, 100)).toMatchObject({ expired: true, notYetValid: false, invalid: false });
    expect(tools.inspectTimes({ exp: 100, nbf: 99, iat: 101 }, 99)).toMatchObject({ expired: false, notYetValid: false });
    expect(tools.inspectTimes({ exp: 100, nbf: 99 }, 98.999)).toMatchObject({ expired: false, notYetValid: true });
    expect(tools.inspectTimes({ exp: 100 }, 99.999).expired).toBe(false);
    expect(tools.inspectTimes({ exp: 0 }, 0).expired).toBe(true);
    expect(tools.inspectTimes({ exp: -1, nbf: -2 }, 0).expired).toBe(true);
    const claims = tools.inspectTimes({ exp: 100.5, nbf: 100, iat: 101 }, 100).claims;
    expect(claims.map((claim) => claim.status)).toEqual(['active', 'future', 'active']);
    expect(claims[0].time).toBe('1970-01-01T00:01:40.500Z');
  });
  it.each(['100', null, true, {}, [], Infinity, NaN, 8640000000001])('flags invalid time %s', (value) => {
    const result = tools.inspectTimes({ exp: value, iat: value, nbf: value }, 100);
    expect(result.invalid).toBe(true);
    expect(result.claims.map((claim) => claim.status)).toEqual(['invalid', 'invalid', 'invalid']);
    expect(result.claims.every((claim) => claim.time === null)).toBe(true);
  });
  it('handles missing claims, UTC conversion, device clock, and invalid now', () => {
    expect(tools.inspectTimes({}, 0).claims.map((claim) => claim.status)).toEqual(['missing', 'missing', 'missing']);
    expect(tools.inspectTimes({ iat: 1516239022 }, 1516239022).claims[1]).toMatchObject({ time: '2018-01-18T01:30:22.000Z', status: 'issued' });
    vi.spyOn(Date, 'now').mockReturnValue(100000);
    expect(tools.inspectTimes({ exp: 100 }).expired).toBe(true);
    expect(tools.inspectTimes({ exp: 101, nbf: 101 })).toMatchObject({ expired: false, notYetValid: true });
    expect(() => tools.inspectTimes({}, NaN)).toThrow(/finite/);
  });
});

describe('Web Crypto signature verification against independent Node signing', () => {
  it.each(['HS256', 'HS384', 'HS512'] as const)('verifies %s and rejects wrong secret, tampered payload and signature', async (alg) => {
    const jwt = jwtVectors.find((vector) => vector.alg === alg)!.token;
    expect(await tools.verify(jwt, secret, alg)).toBe(true); // Expiration never changes the signature result.
    expect(await tools.verify(jwt, secret.trim(), alg)).toBe(false);
    expect(await tools.verify(jwt, secret + 'x', alg)).toBe(false);
    const segments = jwt.split('.');
    expect(await tools.verify(`${b64(JSON.stringify({ alg, typ: 'tampered' }))}.${segments[1]}.${segments[2]}`, secret, alg)).toBe(false);
    expect(await tools.verify(`${segments[0]}.${b64('{"exp":2}')}.${segments[2]}`, secret, alg)).toBe(false);
    const bytes = unb64(segments[2]); bytes[0] ^= 1;
    expect(await tools.verify(`${segments[0]}.${segments[1]}.${b64(bytes)}`, secret, alg)).toBe(false);
    await expect(tools.verify(token({ alg }, {}, 'AA'), secret, alg)).rejects.toThrow(/length/);
  });
  const rsa = jwtVectors.find((vector) => vector.alg === 'RS256')!;
  it.each(jwtVectors.filter((vector) => !vector.alg.startsWith('HS')))('verifies $alg with SPKI PEM and public JWK; rejects wrong keys and tampering', async (vector) => {
    if (!('pem' in vector)) throw new Error('Missing public-key fixture.');
    const { alg, token: jwt, pem, privatePem, privateJwk, wrongPem } = vector;
    const jwk = JSON.stringify({ ...vector.jwk, alg, use: 'sig', key_ops: ['verify'] });
    expect(await tools.verify(jwt, pem, alg)).toBe(true);
    expect(await tools.verify(jwt, jwk, alg)).toBe(true);
    expect(await tools.verify(jwt, wrongPem, alg)).toBe(false);
    const segments = jwt.split('.');
    const signature = unb64(segments[2]); signature[0] ^= 1;
    expect(await tools.verify(`${b64(JSON.stringify({ alg, typ: 'tampered' }))}.${segments[1]}.${segments[2]}`, pem, alg)).toBe(false);
    expect(await tools.verify(`${segments[0]}.${segments[1]}.${b64(signature)}`, pem, alg)).toBe(false);
    expect(await tools.verify(`${segments[0]}.${b64('{"sub":"tampered"}')}.${segments[2]}`, pem, alg)).toBe(false);
    await expect(tools.verify(jwt, privatePem, alg)).rejects.toThrow(/public key/i);
    await expect(tools.verify(jwt, JSON.stringify(privateJwk), alg)).rejects.toThrow(/private/);
    if ('derToken' in vector) await expect(tools.verify(vector.derToken, pem, alg)).rejects.toThrow(/length/);
  });
  it('rejects algorithm confusion, critical headers and token-provided keys', async () => {
    await expect(tools.verify(await hmacToken(), secret, 'HS384')).rejects.toThrow(/expected algorithm/);
    await expect(tools.verify(await hmacToken(), rsa.pem, 'HS256')).rejects.toThrow(/not a PEM/);
    await expect(tools.verify(await hmacToken(), JSON.stringify(rsa.jwk), 'HS256')).rejects.toThrow(/not a PEM/);
    for (const extra of [{ crit: ['unknown'] }, { crit: [] }, { b64: false }]) {
      await expect(tools.verify(await hmacToken('HS256', {}, { alg: 'HS256', ...extra }), secret, 'HS256')).rejects.toThrow(/extensions/);
    }
    const jwt = await hmacToken('HS256', {}, { alg: 'HS256', jku: 'https://example.com/key', jwk: { kty: 'oct', k: b64(secret) } });
    expect(await tools.verify(jwt, 'wrong trusted secret', 'HS256')).toBe(false);
  });
  it('rejects invalid public keys and incompatible JWK metadata', async () => {
    const jwt = rsa.token;
    const jwk = rsa.jwk;
    for (const value of ['not a key', '{}', '{bad', JSON.stringify({ keys: [jwk] }), '-----BEGIN PUBLIC KEY-----\nAA==\n-----END PUBLIC KEY-----']) {
      await expect(tools.verify(jwt, value, 'RS256')).rejects.toThrow(/import verification key/);
    }
    for (const extra of [{ alg: 'RS384' }, { kty: 'EC' }, { use: 'enc' }, { key_ops: ['sign'] }, { key_ops: 'verify' }, { d: '' }]) {
      await expect(tools.verify(jwt, JSON.stringify({ ...jwk, ...extra }), 'RS256')).rejects.toThrow(/import verification key/);
    }
    await expect(tools.verify(jwt, smallRsaPem, 'RS256')).rejects.toThrow(/2048/);
    const ec = jwtVectors.find((vector) => vector.alg === 'ES384')!;
    await expect(tools.verify(token({ alg: 'ES256' }, {}, b64(new Uint8Array(64))), JSON.stringify(ec.jwk), 'ES256')).rejects.toThrow(/curve/);
  });
  it('rejects missing/oversized keys and reports unsupported Web Crypto', async () => {
    await expect(tools.verify(knownJwt, '', 'HS256')).rejects.toThrow(/Enter a key/);
    await expect(tools.verify(knownJwt, 'x'.repeat(1024 * 1024 + 1), 'HS256')).rejects.toThrow(/1 MiB/);
    await expect(tools.verify(knownJwt, '中'.repeat(400000), 'HS256')).rejects.toThrow(/1 MiB/);
    vi.stubGlobal('crypto', {});
    await expect(tools.verify(knownJwt, secret, 'HS256')).rejects.toThrow(/Web Crypto is unavailable/);
  });
});
