import { escapeHtml, siteUrl } from '../../shared/seo';
import { pageLayout } from '../../shared/layout';
import { breadcrumbListJsonLd, faqPageJsonLd, webApplicationJsonLd, type FaqItem } from '../../shared/json-ld';
import { clientScript } from './client';

export const title = 'JWT Decoder & Signature Verifier | Local & Private';
export const description = 'Decode JWT headers and payloads, inspect exp, iat and nbf timestamps, and verify HMAC, RSA, RSA-PSS and ECDSA signatures locally with Web Crypto. Tokens and keys stay in your browser.';
export const faq: readonly FaqItem[] = [
  { question: 'Are my tokens or keys uploaded or stored?', answer: 'No. Tokens, secrets and public keys are processed only in your browser. This tool makes no computation requests and does not store inputs. Reload the page or use Clear to remove your work. Token and key inputs are limited to 1 MiB each.' },
  { question: 'Does decoding a JWT prove it is authentic?', answer: 'No. Header and payload are readable base64url-encoded JSON, not encrypted data. Decoded claims are untrusted until the signature is verified with a trusted key. A matching signature alone does not check issuer, audience, revocation or your application policy.' },
  { question: 'Which algorithms and keys are supported?', answer: 'HS256, HS384 and HS512 use an exact UTF-8 shared secret, without Base64 decoding. RS256/384/512, PS256/384/512 and ES256/384/512 use an SPKI PEM public key (BEGIN PUBLIC KEY) or one public JWK. RSA keys must be at least 2048 bits. ES256, ES384 and ES512 use P-256, P-384 and P-521 respectively. Certificates, PKCS#1 PEM, private keys and JWK sets are not accepted.' },
  { question: 'Why must I select the expected algorithm?', answer: 'Select the algorithm your issuer is configured to use. Verification rejects a different header alg and incompatible keys. Keys and key URLs supplied inside the token are never trusted or fetched. The unsigned alg none, unknown algorithms, critical header extensions and unencoded payload extensions cannot be verified by this tool.' },
  { question: 'How are exp, iat and nbf interpreted?', answer: 'NumericDate claims use Unix seconds, not milliseconds. Times are displayed in UTC and checked against your device clock with no clock tolerance. A token is expired at or after exp, and is not yet valid before nbf. iat describes when it was issued; a future iat is flagged separately. Missing claims impose no time limit. Invalid or out-of-range timestamps are marked clearly. Time checks refresh while the page is open and do not authenticate the claims.' },
  { question: 'What token formats can I decode?', answer: 'Paste a compact JWT with three dot-separated parts. Header and payload must be UTF-8 JSON objects in unpadded base64url. Outer whitespace is removed; whitespace within parts, padding, mixed alphabets, nonzero unused bits, missing signatures and encrypted five-part JWE tokens are rejected. An alg none token with an empty signature can be inspected but never verified.' },
];

export function renderJwtPage(baseUrl: string, nonce: string): string {
  const canonical = siteUrl(baseUrl, '/jwt');
  const breadcrumbs = [{ name: 'Home', path: '/' }, { name: 'JWT', path: '/jwt' }];
  const content = `
<p class="eyebrow">Inspect claims, check signatures</p>
<h1>JWT decoder &amp; verifier</h1>
<p class="intro">Decode a JWT and verify its signature with Web Crypto. Tokens and keys stay in your browser.</p>
<section class="tool jwt-tool" aria-label="JWT decoding and verification workspace"><div class="tool-grid jwt-grid">
<form id="jwt-form" class="controls" autocomplete="off">
<div><label for="jwt-input">JSON Web Token</label><textarea id="jwt-input" class="mono" rows="3" spellcheck="false" autocapitalize="off" autocomplete="off" aria-describedby="jwt-decode-status" placeholder="header.payload.signature"></textarea><p id="jwt-decode-status" class="status" role="status" aria-live="polite">Enable JavaScript to decode a JWT locally.</p></div>
<div><label for="jwt-algorithm">Expected signing algorithm</label><select id="jwt-algorithm"><optgroup label="HMAC shared secret"><option>HS256</option><option>HS384</option><option>HS512</option></optgroup><optgroup label="RSA public key"><option>RS256</option><option>RS384</option><option>RS512</option></optgroup><optgroup label="RSA-PSS public key"><option>PS256</option><option>PS384</option><option>PS512</option></optgroup><optgroup label="ECDSA public key"><option>ES256</option><option>ES384</option><option>ES512</option></optgroup></select></div>
<div><label id="jwt-key-label" for="jwt-key">Shared secret (UTF-8)</label><textarea id="jwt-key" class="mono" rows="3" spellcheck="false" autocapitalize="off" autocomplete="off" aria-describedby="jwt-key-hint" placeholder="Enter the shared secret"></textarea><p id="jwt-key-hint" class="hint">Use the exact secret; no Base64 decoding.</p></div>
<div class="toolbar"><button id="jwt-verify" class="primary" type="submit" disabled>Verify signature</button><button id="jwt-clear" type="button" disabled>Clear</button></div>
</form>
<div class="results jwt-results">
<h2>Signature &amp; time claims</h2><p id="jwt-verify-status" class="status" role="status" aria-live="polite">Signature not verified. Decoded claims are untrusted.</p>
<p id="jwt-time-status" class="status">No time claims yet</p><dl id="jwt-times" class="jwt-times"></dl>
<h2 id="jwt-header-heading">Header</h2><pre id="jwt-header" class="mono" aria-labelledby="jwt-header-heading">No header yet</pre>
<h2 id="jwt-payload-heading">Payload</h2><pre id="jwt-payload" class="mono" aria-labelledby="jwt-payload-heading">No payload yet</pre>
<div class="toolbar"><button id="jwt-copy" type="button" disabled>Copy decoded JSON</button></div><p id="jwt-copy-status" class="status" role="status" aria-live="polite"></p>
</div></div></section>
<noscript><p class="no-script">Enable JavaScript to decode tokens and verify signatures locally in your browser.</p></noscript>
<section class="section" aria-labelledby="usage-heading"><h2 id="usage-heading">Inspect a token without sending it anywhere</h2><p class="intro">Paste a JWT to view formatted header and payload JSON. To verify, choose the expected algorithm and supply the shared secret or a trusted public key. Signature verification and expiration checks are shown separately. Clear removes both the token and key.</p>
<div class="version-guide"><article><h3>Header / Algorithm</h3><p>The header identifies the signing algorithm and may include a key identifier. Choose the algorithm configured by your issuer; token-provided keys are never used.</p></article><article><h3>Payload / Claims</h3><p>Inspect application claims and UTC times for exp, iat and nbf. Your device clock controls the time check. Missing exp does not prove unlimited validity.</p></article><article><h3>Signature / Integrity</h3><p>Web Crypto checks the original encoded header and payload against your supplied key. Also check the issuer, audience and application policy before accepting a token.</p></article></div></section>
<section class="section faq" aria-labelledby="faq-heading"><h2 id="faq-heading">Frequently asked questions</h2>${faq.map(({ question, answer }) => `<details open><summary>${escapeHtml(question)}</summary><p>${escapeHtml(answer)}</p></details>`).join('')}</section>`;
  return pageLayout({ title, description, canonical, currentPath: '/jwt', nonce, content, breadcrumbs, script: clientScript(),
    jsonLd: [webApplicationJsonLd({ name: 'JWT Decoder & Signature Verifier', url: canonical, description }), faqPageJsonLd(faq), breadcrumbListJsonLd(baseUrl, breadcrumbs)] });
}
