import { afterEach, describe, expect, it, vi } from "vitest";
import { createPrivateKey, createPublicKey, createHash, sign, verify, constants, publicEncrypt, privateDecrypt, diffieHellman } from "node:crypto";
import { spawnSync } from "node:child_process";
import { createKeygenTools } from "../src/tools/keygen/keygen";
// Node/OpenSSL interoperability lives in MJS to avoid adding Node globals to the
// browser/Worker TypeScript configuration. Generated test keys are disposable.
const defaults = { algorithm: "Ed25519", curve: "P-256", modulusLength: 2048, purpose: "RSA-PSS" };
const tools = createKeygenTools();
const bytes = (text) => Uint8Array.from(atob(text.replace(/-/g, "+").replace(/_/g, "/")), (char) => char.charCodeAt(0));
const der = (pem) => bytes(pem.replace(/-----[^\n]+-----|\s/g, ""));
const options = [
  defaults,
  { ...defaults, algorithm: "X25519" },
  ...["P-256", "P-384", "P-521"].map((curve) => ({ ...defaults, algorithm: "ECDSA", curve })),
  ...["RSA-PSS", "RSASSA-PKCS1-v1_5", "RSA-OAEP"].flatMap((purpose) => [2048, 3072, 4096].map((modulusLength) => ({ ...defaults, algorithm: "RSA", purpose, modulusLength })))
];
function parseSsh(text) {
  // Independently parse SSH lengths, positive RSA mpints and EC points, then
  // reconstruct a JWK that Node/OpenSSL imports as an SPKI public key.
  const [type, encoded] = text.trim().split(" ");
  const blob = bytes(encoded);
  let offset = 0;
  function field() {
    const length = new DataView(blob.buffer, blob.byteOffset + offset, 4).getUint32(0);
    offset += 4;
    const value = blob.slice(offset, offset + length);
    expect(value.length).toBe(length);
    offset += length;
    return value;
  }
  const b64url = (value) => Buffer.from(value).toString("base64url");
  expect(new TextDecoder().decode(field())).toBe(type);
  let jwk;
  if (type === "ssh-rsa") {
    const positive = () => {
      const integer = field();
      expect(integer[0] & 128).toBe(0);
      if (integer[0] === 0) {
        expect(integer[1] & 128).toBe(128);
        return integer.slice(1);
      }
      return integer;
    };
    const e = positive();
    const n = positive();
    expect([...e]).toEqual([1, 0, 1]);
    jwk = { kty: "RSA", e: b64url(e), n: b64url(n) };
  } else if (type === "ssh-ed25519") {
    const key = field();
    expect(key.length).toBe(32);
    jwk = { kty: "OKP", crv: "Ed25519", x: b64url(key) };
  } else {
    const curve = new TextDecoder().decode(field());
    expect(type).toBe(`ecdsa-sha2-${curve}`);
    const sizes = { nistp256: 32, nistp384: 48, nistp521: 66 };
    const point = field();
    const size = sizes[curve];
    expect(point.length).toBe(1 + size * 2);
    expect(point[0]).toBe(4);
    jwk = {
      kty: "EC",
      crv: { nistp256: "P-256", nistp384: "P-384", nistp521: "P-521" }[curve],
      x: b64url(point.slice(1, 1 + size)),
      y: b64url(point.slice(1 + size))
    };
  }
  expect(offset).toBe(blob.length);
  return jwk;
}
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});
describe("key pair generation and independent interoperability", () => {
  it.each(options)("round-trips $algorithm $curve $purpose $modulusLength with Web Crypto and OpenSSL", async (option) => {
    const result = await tools.generate(option);
    const pem = result.formats.pem;
    const publicJwk = JSON.parse(result.formats.jwk.publicKey);
    const privateJwk = JSON.parse(result.formats.jwk.privateKey);
    const publicKey = createPublicKey(pem.publicKey);
    const privateKey = createPrivateKey(pem.privateKey);
    expect(createPublicKey({ key: publicJwk, format: "jwk" }).export({ type: "spki", format: "pem" })).toBe(pem.publicKey);
    expect(createPrivateKey({ key: privateJwk, format: "jwk" }).export({ type: "pkcs8", format: "pem" })).toBe(pem.privateKey);
    expect(createPublicKey(privateKey).export({ type: "spki", format: "pem" })).toBe(pem.publicKey);
    for (const [input, args] of [[pem.privateKey, ["pkey", "-check", "-noout"]], [pem.publicKey, ["pkey", "-pubin", "-pubcheck", "-noout"]]]) {
      const checked = spawnSync("openssl", [...args], { input, encoding: "utf8" });
      expect(checked.status).toBe(0);
    }
    for (const field of ["d", "p", "q", "dp", "dq", "qi", "oth"]) expect(publicJwk).not.toHaveProperty(field);
    expect(privateJwk.d).toBeTruthy();
    const importAlgorithm = option.algorithm === "RSA" ? { name: option.purpose, hash: "SHA-256" } : option.algorithm === "ECDSA" ? { name: "ECDSA", namedCurve: option.curve } : option.algorithm;
    const usages = option.algorithm === "X25519" ? ["deriveBits"] : option.algorithm === "RSA" && option.purpose === "RSA-OAEP" ? ["decrypt"] : ["sign"];
    const publicUsages = usages[0] === "deriveBits" ? [] : usages[0] === "decrypt" ? ["encrypt"] : ["verify"];
    const message = new TextEncoder().encode("independent key pair test \u4F60\u597D");
    for (const format of ["pem", "jwk"]) {
      const importedPrivate = format === "pem" ? await crypto.subtle.importKey("pkcs8", der(pem.privateKey), importAlgorithm, false, usages) : await crypto.subtle.importKey("jwk", privateJwk, importAlgorithm, false, usages);
      const importedPublic = format === "pem" ? await crypto.subtle.importKey("spki", der(pem.publicKey), importAlgorithm, false, publicUsages) : await crypto.subtle.importKey("jwk", publicJwk, importAlgorithm, false, publicUsages);
      expect(importedPrivate.usages).toEqual(usages);
      expect(importedPublic.usages).toEqual(publicUsages);
      if (option.algorithm === "X25519") {
        const peer = await crypto.subtle.generateKey("X25519", true, ["deriveBits"]);
        const a = await crypto.subtle.deriveBits({ name: "X25519", public: peer.publicKey }, importedPrivate, 256);
        const b = await crypto.subtle.deriveBits({ name: "X25519", public: importedPublic }, peer.privateKey, 256);
        expect(new Uint8Array(a)).toEqual(new Uint8Array(b));
        const peerPublic = createPublicKey({ key: JSON.parse(JSON.stringify(await crypto.subtle.exportKey("jwk", peer.publicKey))), format: "jwk" });
        expect(new Uint8Array(diffieHellman({ privateKey, publicKey: peerPublic }))).toEqual(new Uint8Array(a));
      } else if (usages[0] === "decrypt") {
        const encrypted = await crypto.subtle.encrypt("RSA-OAEP", importedPublic, message);
        expect(new Uint8Array(await crypto.subtle.decrypt("RSA-OAEP", importedPrivate, encrypted))).toEqual(message);
        expect(new Uint8Array(privateDecrypt({ key: privateKey, oaepHash: "sha256" }, Buffer.from(encrypted)))).toEqual(message);
        const independent = publicEncrypt({ key: publicKey, oaepHash: "sha256" }, message);
        expect(new Uint8Array(await crypto.subtle.decrypt("RSA-OAEP", importedPrivate, independent))).toEqual(message);
      } else {
        const signing = option.algorithm === "ECDSA" ? { name: "ECDSA", hash: "SHA-256" } : option.algorithm === "RSA" && option.purpose === "RSA-PSS" ? { name: "RSA-PSS", saltLength: 32 } : option.algorithm === "RSA" ? option.purpose : "Ed25519";
        const signature = await crypto.subtle.sign(signing, importedPrivate, message);
        expect(await crypto.subtle.verify(signing, importedPublic, signature, message)).toBe(true);
        expect(await crypto.subtle.verify(signing, importedPublic, signature, new Uint8Array([0]))).toBe(false);
        const nodeOptions = {
          key: publicKey,
          dsaEncoding: "ieee-p1363",
          ...option.algorithm === "RSA" && option.purpose === "RSA-PSS" ? { padding: constants.RSA_PKCS1_PSS_PADDING, saltLength: 32 } : {}
        };
        expect(verify(option.algorithm === "Ed25519" ? null : "sha256", message, nodeOptions, Buffer.from(signature))).toBe(true);
        const independent = sign(option.algorithm === "Ed25519" ? null : "sha256", message, { ...nodeOptions, key: privateKey });
        expect(await crypto.subtle.verify(signing, importedPublic, independent, message)).toBe(true);
      }
    }
    const ssh = result.formats.openssh;
    if (option.algorithm === "X25519") {
      expect(ssh).toBeUndefined();
      expect(result.fingerprintLabel).toContain("SPKI");
      expect(result.fingerprint).toBe("SHA256:" + createHash("sha256").update(der(pem.publicKey)).digest("base64").replace(/=+$/, ""));
    } else {
      const decoded = parseSsh(ssh.publicKey);
      expect(createPublicKey({ key: decoded, format: "jwk" }).export({ type: "spki", format: "pem" })).toBe(pem.publicKey);
      expect(result.fingerprintLabel).toContain("OpenSSH");
      expect(result.fingerprint).toBe("SHA256:" + createHash("sha256").update(bytes(ssh.publicKey.trim().split(" ")[1])).digest("base64").replace(/=+$/, ""));
      expect(ssh.privateKey).toBe(pem.privateKey);
      expect(ssh.privateFilename).toMatch(/private\.pem$/);
    }
    expect(result.formats.hex !== void 0).toBe(option.algorithm === "Ed25519");
    if (option.algorithm === "Ed25519") {
      expect(result.formats.hex.publicKey.trim()).toBe(Buffer.from(publicJwk.x, "base64url").toString("hex"));
      expect(result.formats.hex.privateKey.trim()).toBe(Buffer.from(privateJwk.d, "base64url").toString("hex"));
      expect(result.formats.hex.privateKey.trim()).toHaveLength(64);
      expect(result.formats.base64.publicKey.trim()).toBe(Buffer.from(publicJwk.x, "base64url").toString("base64"));
      expect(result.formats.base64.privateKey.trim()).toBe(Buffer.from(privateJwk.d, "base64url").toString("base64"));
    }
  }, 6e4);
  it("produces distinct fresh key pairs and executes a serialized factory", async () => {
    const serialized = new Function(`return (${createKeygenTools.toString()})();`)();
    const a = await serialized.generate(defaults);
    const b = await tools.generate(defaults);
    expect(a.fingerprint === b.fingerprint).toBe(false);
  });
  it.each([
    { algorithm: "secp256k1" },
    { algorithm: "ECDSA", curve: "secp256k1" },
    { algorithm: "RSA", modulusLength: 1024 },
    { algorithm: "RSA", purpose: "unknown" }
  ])("rejects unsupported options before generating", async (invalid) => {
    const generate = vi.spyOn(crypto.subtle, "generateKey");
    await expect(tools.generate({ ...defaults, ...invalid })).rejects.toThrow(/Select/);
    expect(generate).not.toHaveBeenCalled();
  });
  it("reports absent crypto and unsupported generation/export without echoing errors", async () => {
    vi.stubGlobal("crypto", void 0);
    await expect(tools.generate(defaults)).rejects.toThrow(/secure context/);
    vi.unstubAllGlobals();
    const generated = vi.spyOn(crypto.subtle, "generateKey").mockRejectedValue(new Error("private secret"));
    await expect(tools.generate(defaults)).rejects.toThrow(/Cannot generate Ed25519/);
    generated.mockRestore();
    vi.spyOn(crypto.subtle, "exportKey").mockRejectedValue(new Error("private secret"));
    await expect(tools.generate(defaults)).rejects.toThrow(/^Cannot export/);
  });
});
