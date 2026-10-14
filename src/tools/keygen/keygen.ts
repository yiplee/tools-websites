export type KeyAlgorithm = 'Ed25519' | 'X25519' | 'ECDSA' | 'RSA';
export type RsaPurpose = 'RSA-PSS' | 'RSASSA-PKCS1-v1_5' | 'RSA-OAEP';
export type KeyFormat = 'pem' | 'jwk' | 'openssh' | 'hex' | 'base64';
export interface KeyOptions {
  algorithm: KeyAlgorithm;
  curve: 'P-256' | 'P-384' | 'P-521';
  modulusLength: 2048 | 3072 | 4096;
  purpose: RsaPurpose;
}
export interface KeyExport { publicKey: string; privateKey: string; publicFilename: string; privateFilename: string; privateLabel: string }
export interface KeyResult {
  formats: Partial<Record<KeyFormat, KeyExport>>;
  fingerprint: string;
  fingerprintLabel: string;
}
export interface KeygenTools { generate(options: KeyOptions): Promise<KeyResult> }

/** Self-contained for serialization into the nonce-protected browser script. */
export function createKeygenTools(): KeygenTools {
  const encoder = new TextEncoder();
  function base64(bytes: Uint8Array): string {
    return btoa(Array.from(bytes, (byte) => String.fromCharCode(byte)).join(''));
  }
  function unbase64url(text: string): Uint8Array<ArrayBuffer> {
    return Uint8Array.from(atob(text.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - text.length % 4) % 4)), (char) => char.charCodeAt(0));
  }
  function join(...parts: Uint8Array[]): Uint8Array<ArrayBuffer> {
    const output = new Uint8Array(parts.reduce((sum, part) => sum + part.length, 0));
    let offset = 0;
    for (const part of parts) { output.set(part, offset); offset += part.length; }
    return output;
  }
  // SSH strings use a big-endian uint32 length. Positive mpints need a leading
  // zero when their high bit is set (RFC 4251); RSA modulus bytes usually do.
  function sshString(bytes: Uint8Array): Uint8Array<ArrayBuffer> {
    const length = new Uint8Array(4);
    new DataView(length.buffer).setUint32(0, bytes.length);
    return join(length, bytes);
  }
  function mpint(value: string): Uint8Array<ArrayBuffer> {
    const bytes = unbase64url(value);
    let offset = 0;
    while (offset < bytes.length && bytes[offset] === 0) offset++;
    const unsigned = bytes.slice(offset);
    return sshString(unsigned[0] & 128 ? join(Uint8Array.of(0), unsigned) : unsigned);
  }
  function sshPublic(jwk: JsonWebKey): { text: string; bytes: Uint8Array<ArrayBuffer> } | null {
    let name: string;
    let fields: Uint8Array[];
    if (jwk.kty === 'OKP' && jwk.crv === 'Ed25519') {
      name = 'ssh-ed25519'; fields = [sshString(unbase64url(jwk.x!))];
    } else if (jwk.kty === 'RSA') {
      name = 'ssh-rsa'; fields = [mpint(jwk.e!), mpint(jwk.n!)];
    } else if (jwk.kty === 'EC') {
      const curve = ({ 'P-256': 'nistp256', 'P-384': 'nistp384', 'P-521': 'nistp521' } as Record<string, string>)[jwk.crv!];
      name = `ecdsa-sha2-${curve}`;
      fields = [sshString(encoder.encode(curve)), sshString(join(Uint8Array.of(4), unbase64url(jwk.x!), unbase64url(jwk.y!)))];
    } else return null; // X25519 is key agreement, not an SSH authentication key.
    const bytes = join(sshString(encoder.encode(name)), ...fields);
    return { text: `${name} ${base64(bytes)}\n`, bytes };
  }
  function pem(bytes: ArrayBuffer, label: string): string {
    const lines = base64(new Uint8Array(bytes)).match(/.{1,64}/g)!;
    return `-----BEGIN ${label}-----\n${lines.join('\n')}\n-----END ${label}-----\n`;
  }
  async function generate(options: KeyOptions): Promise<KeyResult> {
    const { algorithm, curve, modulusLength, purpose } = options;
    if (!['Ed25519', 'X25519', 'ECDSA', 'RSA'].includes(algorithm)) throw new Error('Select a supported key algorithm.');
    if (algorithm === 'ECDSA' && !['P-256', 'P-384', 'P-521'].includes(curve)) throw new Error('Select P-256, P-384 or P-521.');
    if (algorithm === 'RSA' && (![2048, 3072, 4096].includes(modulusLength) || !['RSA-PSS', 'RSASSA-PKCS1-v1_5', 'RSA-OAEP'].includes(purpose))) throw new Error('Select a supported RSA size and purpose.');
    if (!globalThis.crypto?.subtle) throw new Error('Web Crypto is unavailable. Use a browser with Web Crypto in a secure context.');
    const params = algorithm === 'RSA'
      ? { name: purpose, modulusLength, publicExponent: Uint8Array.of(1, 0, 1), hash: 'SHA-256' }
      : algorithm === 'ECDSA' ? { name: 'ECDSA', namedCurve: curve } : { name: algorithm };
    const usages: KeyUsage[] = algorithm === 'X25519' ? ['deriveBits']
      : algorithm === 'RSA' && purpose === 'RSA-OAEP' ? ['encrypt', 'decrypt'] : ['sign', 'verify'];
    let pair: CryptoKeyPair;
    try {
      pair = await crypto.subtle.generateKey(params, true, usages) as CryptoKeyPair;
    } catch {
      // Do not echo browser exceptions: errors must never include key material.
      throw new Error(`Cannot generate ${algorithm === 'RSA' ? purpose : algorithm} with Web Crypto in this browser. Try a current browser or generate locally with openssl / ssh-keygen.`);
    }
    try {
      const [spki, pkcs8, publicJwk, privateJwk] = await Promise.all([
        crypto.subtle.exportKey('spki', pair.publicKey), crypto.subtle.exportKey('pkcs8', pair.privateKey),
        crypto.subtle.exportKey('jwk', pair.publicKey), crypto.subtle.exportKey('jwk', pair.privateKey),
      ]);
      const stem = (algorithm === 'RSA' ? `${purpose}-${modulusLength}` : algorithm === 'ECDSA' ? `ecdsa-${curve}` : algorithm).toLowerCase();
      function entry(publicKey: string, privateKey: string, extension: string, privateLabel: string): KeyExport {
        return { publicKey, privateKey, publicFilename: `${stem}-public.${extension}`, privateFilename: `${stem}-private.${extension}`, privateLabel };
      }
      const pemExport = entry(pem(spki, 'PUBLIC KEY'), pem(pkcs8, 'PRIVATE KEY'), 'pem', 'Private key · PKCS#8 PEM');
      const formats: KeyResult['formats'] = {
        pem: pemExport,
        jwk: entry(JSON.stringify(publicJwk, null, 2) + '\n', JSON.stringify(privateJwk, null, 2) + '\n', 'jwk', 'Private key · JWK'),
      };
      const ssh = sshPublic(publicJwk);
      if (ssh) formats.openssh = { ...pemExport, publicKey: ssh.text, publicFilename: `${stem}-public.pub` };
      if (algorithm === 'Ed25519') {
        const publicBytes = unbase64url(publicJwk.x!);
        const seed = unbase64url(privateJwk.d!);
        const hex = (bytes: Uint8Array) => Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
        formats.hex = entry(hex(publicBytes) + '\n', hex(seed) + '\n', 'hex', 'Private key · 32-byte Ed25519 seed (hex)');
        formats.base64 = entry(base64(publicBytes) + '\n', base64(seed) + '\n', 'b64', 'Private key · 32-byte Ed25519 seed (Base64)');
      }
      const digest = await crypto.subtle.digest('SHA-256', ssh ? ssh.bytes : spki);
      return { formats, fingerprint: `SHA256:${base64(new Uint8Array(digest)).replace(/=+$/, '')}`,
        fingerprintLabel: ssh ? 'Public key fingerprint · OpenSSH SHA-256' : 'Public key fingerprint · SPKI SHA-256 (X25519 has no OpenSSH format)' };
    } catch {
      throw new Error('Cannot export this key pair with Web Crypto in this browser. Try a current browser or generate locally with openssl / ssh-keygen.');
    }
  }
  return { generate };
}
