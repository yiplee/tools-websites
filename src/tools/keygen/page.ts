import { escapeHtml, siteUrl } from '../../shared/seo';
import { pageLayout } from '../../shared/layout';
import { breadcrumbListJsonLd, faqPageJsonLd, webApplicationJsonLd, type FaqItem } from '../../shared/json-ld';
import { clientScript } from './client';

export const title = 'Key Pair Generator | Ed25519, X25519, ECDSA & RSA';
export const description = 'Generate asymmetric key pairs locally with Web Crypto. Export PEM, JWK and OpenSSH public keys, inspect SHA-256 fingerprints, and copy or download keys without uploading them.';
export const faq: readonly FaqItem[] = [
  { question: 'Are private keys uploaded, logged or saved?', answer: 'No. Keys are generated only in your browser with Web Crypto. This page makes no computation requests, logs no keys and uses no input storage. Keys remain in page memory until you clear, reload or leave the page. Copy and download happen only when you click them; copied keys remain on your clipboard and downloaded files remain on your device. JavaScript cannot guarantee secure erasure of memory.' },
  { question: 'Which algorithms and purposes are supported?', answer: 'Ed25519 signs messages; X25519 derives shared secrets. ECDSA supports P-256, P-384 and P-521. RSA supports 2048, 3072 and 4096 bits with RSA-PSS, RSASSA-PKCS1-v1_5 or RSA-OAEP, using SHA-256 and exponent 65537. Browser support varies. If Web Crypto does not support an algorithm, generation shows an error; there is no library or server fallback. secp256k1 is not offered.' },
  { question: 'What do the export formats contain?', answer: 'PEM contains an SPKI public key and an unencrypted PKCS#8 private key. JWK exports separate public and private JSON objects. OpenSSH exports ssh-ed25519, ssh-rsa or ecdsa-sha2-nistp256/nistp384/nistp521 public keys; its private download remains PKCS#8 PEM, not an OpenSSH private key. Ed25519 also offers raw hex and standard padded Base64: 32 public bytes and a 32-byte private seed, not a 64-byte expanded secret key.' },
  { question: 'How is the public key fingerprint calculated?', answer: 'For Ed25519, ECDSA and RSA, SHA-256 hashes the SSH public key wire blob, displayed as SHA256 followed by unpadded Base64, matching OpenSSH fingerprints. X25519 has no OpenSSH authentication-key format: it offers PEM and JWK, and a separately labeled SHA-256 fingerprint of the SPKI DER public key. Changing export format does not change the pair or fingerprint.' },
  { question: 'Should I generate production keys here?', answer: 'For production, generate keys on your own machine with openssl or ssh-keygen and protect the private files. This tool is useful for development, test fixtures and format exploration. Private exports here are unencrypted. Do not share them or commit them to a repository.' },
];

export function renderKeygenPage(baseUrl: string, nonce: string): string {
  const canonical = siteUrl(baseUrl, '/keygen');
  const breadcrumbs = [{ name: 'Home', path: '/' }, { name: 'Key Generator', path: '/keygen' }];
  const content = `
<p class="eyebrow">Create a pair, keep the secret</p>
<h1>Key pair generator</h1>
<p class="intro">Generate Ed25519, X25519, ECDSA and RSA keys with Web Crypto.</p>
<p class="no-script keygen-notice"><strong>Private keys stay in your browser.</strong> Generated locally, never uploaded, logged or saved by this page. For production, use openssl or ssh-keygen on your own machine.</p>
<section class="tool keygen-tool" aria-label="Local key pair generation workspace">
<form id="keygen-form" class="controls" autocomplete="off">
<div class="field-grid"><div><label for="keygen-algorithm">Algorithm</label><select id="keygen-algorithm"><option>Ed25519</option><option>X25519</option><option>ECDSA</option><option>RSA</option></select></div>
<div><label for="keygen-format">Export format</label><select id="keygen-format" aria-describedby="keygen-format-hint"><option value="pem">PEM</option><option value="jwk">JWK</option><option value="openssh">OpenSSH public key</option><option value="hex">Raw hex (Ed25519)</option><option value="base64">Raw Base64 (Ed25519)</option></select></div></div>
<div id="keygen-curve-field" hidden><label for="keygen-curve">ECDSA curve</label><select id="keygen-curve" disabled><option>P-256</option><option>P-384</option><option>P-521</option></select></div>
<div id="keygen-rsa-field" class="field-grid" hidden><div><label for="keygen-size">RSA bits</label><select id="keygen-size" disabled><option>2048</option><option>3072</option><option>4096</option></select></div><div><label for="keygen-purpose">RSA purpose (SHA-256)</label><select id="keygen-purpose" disabled><option>RSA-PSS</option><option>RSASSA-PKCS1-v1_5</option><option>RSA-OAEP</option></select></div></div>
<div class="toolbar"><button id="keygen-generate" class="primary" type="submit" disabled>Generate key pair</button><button id="keygen-clear" type="button" disabled>Clear keys</button></div>
<p id="keygen-format-hint" class="hint">SPKI public key and unencrypted PKCS#8 private key.</p>
<p id="keygen-status" class="status" role="status" aria-live="polite">Enable JavaScript to generate a key pair locally.</p>
</form>
<div class="keygen-fingerprint"><h2 id="keygen-fingerprint-label">Public key fingerprint</h2><p id="keygen-fingerprint" class="mono">No key pair yet</p></div>
<div class="tool-grid keygen-grid">
<div class="controls keygen-output"><label for="keygen-public">Public key</label><textarea id="keygen-public" class="mono" rows="8" readonly spellcheck="false" autocomplete="off" placeholder="No public key yet"></textarea><div class="toolbar"><button id="keygen-copy-public" type="button" disabled>Copy public key</button><button id="keygen-download-public" type="button" disabled>Download public key</button></div></div>
<div class="results keygen-output"><label id="keygen-private-label" for="keygen-private">Private key</label><textarea id="keygen-private" class="mono" rows="8" readonly spellcheck="false" autocomplete="off" placeholder="No private key yet"></textarea><div class="toolbar"><button id="keygen-copy-private" type="button" disabled>Copy private key</button><button id="keygen-download-private" type="button" disabled>Download private key</button></div></div>
</div></section>
<noscript><p class="no-script">Enable JavaScript to generate keys locally in your browser.</p></noscript>
<section class="section" aria-labelledby="usage-heading"><h2 id="usage-heading">Choose a purpose, export the pair</h2><p class="intro">Choose an algorithm and export format, then generate a fresh pair. Changing algorithm, curve, size or purpose clears the old keys. Changing format reuses the same pair. Copy or download each key separately; Clear keys removes the results from this page.</p>
<div class="version-guide"><article><h3>Sign / Verify</h3><p>Ed25519, ECDSA, RSA-PSS and RSASSA-PKCS1-v1_5 generate signing keys. Share the public key to verify signatures; keep the private key secret.</p></article><article><h3>Agree / Encrypt</h3><p>X25519 is for shared-secret derivation, not signing or direct encryption. RSA-OAEP is for encryption and decryption with SHA-256.</p></article><article><h3>Export / Identify</h3><p>PEM and JWK work with Web Crypto and other key tools. OpenSSH public keys include an SSH-compatible fingerprint. Downloads contain unencrypted key material.</p></article></div></section>
<section class="section faq" aria-labelledby="faq-heading"><h2 id="faq-heading">Frequently asked questions</h2>${faq.map(({ question, answer }) => `<details open><summary>${escapeHtml(question)}</summary><p>${escapeHtml(answer)}</p></details>`).join('')}</section>`;
  return pageLayout({ title, description, canonical, currentPath: '/keygen', nonce, content, breadcrumbs, script: clientScript(),
    jsonLd: [webApplicationJsonLd({ name: 'Key Pair Generator', url: canonical, description }), faqPageJsonLd(faq), breadcrumbListJsonLd(baseUrl, breadcrumbs)] });
}
