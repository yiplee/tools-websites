export type JwtAlgorithm = 'HS256' | 'HS384' | 'HS512' | 'RS256' | 'RS384' | 'RS512' | 'PS256' | 'PS384' | 'PS512' | 'ES256' | 'ES384' | 'ES512';
export interface DecodedJwt {
  header: Record<string, unknown>;
  payload: Record<string, unknown>;
  signingInput: string;
  signature: Uint8Array<ArrayBuffer>;
}
export interface JwtTimeClaim {
  name: 'exp' | 'iat' | 'nbf';
  value: unknown;
  time: string | null;
  status: 'missing' | 'invalid' | 'expired' | 'not-yet-valid' | 'future' | 'active' | 'issued';
}
export interface JwtTimes {
  claims: JwtTimeClaim[];
  expired: boolean;
  notYetValid: boolean;
  invalid: boolean;
}
export interface JwtTools {
  algorithms: readonly JwtAlgorithm[];
  decodeBase64Url: (input: string) => Uint8Array<ArrayBuffer>;
  decode: (input: string) => DecodedJwt;
  inspectTimes: (payload: Record<string, unknown>, now?: number) => JwtTimes;
  verify: (input: string, key: string, expectedAlgorithm: JwtAlgorithm) => Promise<boolean>;
}

/** Keep runtime dependencies inside the factory: it is serialized for the browser. */
export function createJwtTools(): JwtTools {
  const algorithms: readonly JwtAlgorithm[] = ['HS256', 'HS384', 'HS512', 'RS256', 'RS384', 'RS512', 'PS256', 'PS384', 'PS512', 'ES256', 'ES384', 'ES512'];
  const maxLength = 1024 * 1024;
  const encoder = new TextEncoder();

  function decodeBase64Url(input: string): Uint8Array<ArrayBuffer> {
    if (input.length > maxLength) throw new Error('Base64url input is limited to 1 MiB.');
    if (!/^[A-Za-z0-9_-]*$/.test(input) || input.length % 4 === 1) {
      throw new Error('Invalid base64url: use the URL-safe alphabet without padding or whitespace.');
    }
    const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';
    const remainder = input.length % 4;
    const last = alphabet.indexOf(input.charAt(input.length - 1));
    if ((remainder === 2 && (last & 15) !== 0) || (remainder === 3 && (last & 3) !== 0)) {
      throw new Error('Invalid base64url: unused bits must be zero.');
    }
    const binary = atob(input.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - remainder) % 4));
    return Uint8Array.from(binary, (char) => char.charCodeAt(0));
  }

  function jsonObject(segment: string, label: string): Record<string, unknown> {
    let value: unknown;
    try {
      const text = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(decodeBase64Url(segment));
      value = JSON.parse(text);
    } catch (error) {
      throw new Error(`${label} must be a base64url-encoded UTF-8 JSON object. ${error instanceof Error ? error.message : ''}`);
    }
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error(`${label} must be a JSON object.`);
    return value as Record<string, unknown>;
  }

  function decode(input: string): DecodedJwt {
    if (input.length > maxLength) throw new Error('JWT input is limited to 1 MiB.');
    const parts = input.trim().split('.');
    if (parts.length !== 3 || !parts[0] || !parts[1]) {
      throw new Error('A signed JWT needs three dot-separated parts: header.payload.signature. Encrypted JWE tokens are not supported.');
    }
    const header = jsonObject(parts[0], 'Header');
    const payload = jsonObject(parts[1], 'Payload');
    if (typeof header.alg !== 'string' || !header.alg) throw new Error('Header alg must be a nonempty string.');
    if (!parts[2] && header.alg !== 'none') throw new Error('A signed JWT must include a signature.');
    if (parts[2] && header.alg === 'none') throw new Error('An alg none token must have an empty signature.');
    return { header, payload, signingInput: `${parts[0]}.${parts[1]}`, signature: decodeBase64Url(parts[2]) };
  }

  /** NumericDate uses seconds; equality at exp is expired and equality at nbf is active. */
  function inspectTimes(payload: Record<string, unknown>, now = Date.now() / 1000): JwtTimes {
    if (!Number.isFinite(now)) throw new Error('Current time must be finite Unix seconds.');
    const claims: JwtTimeClaim[] = (['exp', 'iat', 'nbf'] as const).map((name) => {
      const value = payload[name];
      if (!Object.prototype.hasOwnProperty.call(payload, name)) return { name, value, time: null, status: 'missing' };
      if (typeof value !== 'number' || !Number.isFinite(value) || Math.abs(value * 1000) > 8640000000000000) {
        return { name, value, time: null, status: 'invalid' };
      }
      const time = new Date(value * 1000).toISOString();
      const status = name === 'exp' ? (now >= value ? 'expired' : 'active')
        : name === 'nbf' ? (now < value ? 'not-yet-valid' : 'active')
        : value > now ? 'future' : 'issued';
      return { name, value, time, status };
    });
    return { claims, expired: claims.some((claim) => claim.status === 'expired'),
      notYetValid: claims.some((claim) => claim.status === 'not-yet-valid'), invalid: claims.some((claim) => claim.status === 'invalid') };
  }

  async function isSpkiPublicKey(text: string): Promise<boolean> {
    const body = text.replace(/\s/g, '');
    if (!/^[A-Za-z0-9+/_-]+={0,2}$/.test(body)) return false;
    let bytes: Uint8Array<ArrayBuffer>;
    try {
      bytes = Uint8Array.from(atob(body.replace(/-/g, '+').replace(/_/g, '/')), (char) => char.charCodeAt(0));
    } catch {
      return false;
    }
    // Probe public-key formats even when PEM armor is absent. Never use decoded
    // bytes as the HMAC secret: ordinary secrets retain their exact UTF-8 bytes.
    const imports: (AlgorithmIdentifier | RsaHashedImportParams | EcKeyImportParams)[] = [
      { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
      { name: 'RSA-PSS', hash: 'SHA-256' },
      ...['P-256', 'P-384', 'P-521'].map((namedCurve) => ({ name: 'ECDSA', namedCurve })),
      'Ed25519', 'X25519',
    ];
    for (const algorithm of imports) {
      try {
        const publicKey = await crypto.subtle.importKey('spki', bytes, algorithm, false, []);
        if (publicKey.type === 'public') return true;
      } catch {
        // A format or algorithm unavailable in this browser is not importable.
      }
    }
    return false;
  }

  async function verify(input: string, keyText: string, expectedAlgorithm: JwtAlgorithm): Promise<boolean> {
    const jwt = decode(input);
    const alg = jwt.header.alg;
    if (alg === 'none') throw new Error('alg none is unsigned and cannot be verified.');
    if (!algorithms.includes(alg as JwtAlgorithm)) throw new Error(`Unsupported signing algorithm: ${alg}.`);
    if (alg !== expectedAlgorithm) throw new Error('Header alg does not match the selected expected algorithm.');
    if (Object.prototype.hasOwnProperty.call(jwt.header, 'crit') || jwt.header.b64 === false) {
      throw new Error('Critical headers and unencoded payload extensions are not supported.');
    }
    if (!globalThis.crypto?.subtle) throw new Error('Web Crypto is unavailable. Use a browser with Web Crypto in a secure context.');
    if (!keyText || keyText.length > maxLength || encoder.encode(keyText).byteLength > maxLength) throw new Error('Enter a key or secret of at most 1 MiB in UTF-8.');
    const suffix = String(alg).slice(2);
    const hash = `SHA-${suffix}`;
    const family = String(alg).slice(0, 2);
    const bits = Number(suffix);
    const signatureLength = family === 'HS' ? bits / 8 : family === 'ES' ? (bits === 512 ? 132 : bits / 4) : null;
    if (signatureLength !== null && jwt.signature.length !== signatureLength) throw new Error('Signature length does not match the selected algorithm.');
    let key: CryptoKey;
    let verifyAlgorithm: AlgorithmIdentifier | RsaPssParams | EcdsaParams;
    try {
      if (family === 'HS') {
        if (keyText.includes('-----BEGIN') || keyText.trimStart().startsWith('{') || await isSpkiPublicKey(keyText)) {
          throw new Error('HMAC requires a shared UTF-8 secret, not a PEM, SPKI or JWK public key.');
        }
        key = await crypto.subtle.importKey('raw', encoder.encode(keyText), { name: 'HMAC', hash }, false, ['verify']);
        verifyAlgorithm = 'HMAC';
      } else {
        const curve = bits === 256 ? 'P-256' : bits === 384 ? 'P-384' : 'P-521';
        const name = family === 'ES' ? 'ECDSA' : family === 'PS' ? 'RSA-PSS' : 'RSASSA-PKCS1-v1_5';
        const importAlgorithm = family === 'ES' ? { name, namedCurve: curve } : { name, hash };
        verifyAlgorithm = family === 'ES' ? { name, hash } : family === 'PS' ? { name, saltLength: bits / 8 } : name;
        const text = keyText.trim();
        if (text.startsWith('{')) {
          const jwk = JSON.parse(text) as JsonWebKey;
          if (!jwk || typeof jwk !== 'object' || Array.isArray(jwk)) throw new Error('Enter one public JWK object.');
          if (['d', 'p', 'q', 'dp', 'dq', 'qi', 'oth', 'k'].some((field) => Object.prototype.hasOwnProperty.call(jwk, field))) throw new Error('Use a public JWK, without private key material.');
          if (jwk.kty !== (family === 'ES' ? 'EC' : 'RSA')) throw new Error('JWK key type does not match the selected algorithm.');
          if (jwk.alg !== undefined && jwk.alg !== alg) throw new Error('JWK alg does not match the selected algorithm.');
          if (jwk.use !== undefined && jwk.use !== 'sig') throw new Error('JWK use must be sig.');
          if (jwk.key_ops !== undefined && (!Array.isArray(jwk.key_ops) || !jwk.key_ops.includes('verify'))) throw new Error('JWK key_ops must allow verify.');
          if (family === 'ES' && jwk.crv !== curve) throw new Error('JWK curve does not match the selected algorithm.');
          key = await crypto.subtle.importKey('jwk', jwk, importAlgorithm, false, ['verify']);
        } else {
          const pem = text.match(/^-----BEGIN PUBLIC KEY-----\s*([A-Za-z0-9+/=\s]+)\s*-----END PUBLIC KEY-----$/);
          if (!pem) throw new Error('Enter an SPKI PEM public key (BEGIN PUBLIC KEY) or a public JWK.');
          const binary = atob(pem[1].replace(/\s/g, ''));
          key = await crypto.subtle.importKey('spki', Uint8Array.from(binary, (char) => char.charCodeAt(0)), importAlgorithm, false, ['verify']);
        }
        if (family !== 'ES' && (key.algorithm as RsaKeyAlgorithm).modulusLength < 2048) throw new Error('RSA public keys must have at least 2048 bits.');
      }
    } catch (error) {
      throw new Error(`Cannot import verification key. ${error instanceof Error ? error.message : 'Check the key format and algorithm.'}`);
    }
    // Authenticate the original encoded segments; do not reserialize their JSON.
    return crypto.subtle.verify(verifyAlgorithm, key, jwt.signature, encoder.encode(jwt.signingInput));
  }

  return { algorithms, decodeBase64Url, decode, inspectTimes, verify };
}
