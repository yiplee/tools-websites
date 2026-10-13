import { escapeHtml, siteUrl } from '../../shared/seo';
import { pageLayout } from '../../shared/layout';
import { breadcrumbListJsonLd, faqPageJsonLd, webApplicationJsonLd, type FaqItem } from '../../shared/json-ld';
import { clientScript } from './client';

export const title = 'Base64 & Hex Encoder, Decoder and Hash Tool | Local & Private';
export const description = 'Encode and decode Base64 or hex, and compute MD5, SHA-1, SHA-256 and SHA-512 hashes from UTF-8 text or local files. Everything runs privately in your browser.';

export const faq: readonly FaqItem[] = [
  { question: 'Are my text or files uploaded?', answer: 'No. Encoding, decoding and hashing run locally in your browser. Files are read on your device; inputs and results are never uploaded or stored by this tool. Reloading clears your work. Inputs are limited to 10 MiB to keep the page responsive.' },
  { question: 'How do standard and URL-safe Base64 differ?', answer: 'Standard Base64 uses + and / and includes trailing = padding when needed. URL-safe Base64 replaces them with - and _; this tool omits padding when encoding URL-safe output. Decoding accepts padded or unpadded input in the selected alphabet and rejects incorrect padding or nonzero unused bits.' },
  { question: 'Which text and hex formats are accepted?', answer: 'Text is encoded as UTF-8, including Chinese characters and emoji. Encoding and hashing preserve spaces, line endings and a leading byte order mark. Base64 and hex decoding ignore ASCII spaces, tabs, CR and LF. Hex accepts uppercase or lowercase digits in complete byte pairs, without a 0x prefix.' },
  { question: 'Can I encode or hash a binary file?', answer: 'Yes. Choose Local file to encode or hash its original bytes. To decode a file, select a UTF-8 text file containing Base64 or hex. Decoded bytes can always be downloaded, even when they are not valid UTF-8 and cannot be displayed as text. Empty text and empty files are valid inputs.' },
  { question: 'Can I decrypt a hash or use MD5 for passwords?', answer: 'Hashes are one-way digests and cannot be decoded back to their input. This tool uses Web Crypto for SHA-1, SHA-256 and SHA-512, and a tested local implementation for MD5. MD5 and SHA-1 have known collision weaknesses; use them only for compatibility checks. These plain hashes are not password hashing schemes.' },
];

export function renderEncodePage(baseUrl: string, nonce: string): string {
  const canonical = siteUrl(baseUrl, '/encode');
  const breadcrumbs = [{ name: 'Home', path: '/' }, { name: 'Encode & Hash', path: '/encode' }];
  const content = `
<p class="eyebrow">Text and bytes, locally</p>
<h1>Encode &amp; hash</h1>
<p class="intro">Convert Base64 or hex and compute text or file hashes. Everything runs locally in your browser.</p>
<section class="tool encode-tool" aria-label="Encoding and hashing workspace">
<div class="tool-grid encode-grid">
<form id="encode-form" class="controls">
<div class="field-grid">
<div><label for="operation">Operation</label><select id="operation"><optgroup label="Base64"><option value="base64-encode">Base64 · Encode</option><option value="base64-decode">Base64 · Decode</option></optgroup><optgroup label="Hex"><option value="hex-encode">Hex · Encode</option><option value="hex-decode">Hex · Decode</option></optgroup><optgroup label="Hash"><option value="MD5">MD5</option><option value="SHA-1">SHA-1</option><option value="SHA-256">SHA-256</option><option value="SHA-512">SHA-512</option></optgroup></select></div>
<div><label for="input-source">Input source</label><select id="input-source"><option value="text">UTF-8 text</option><option value="file">Local file</option></select></div>
</div>
<div id="alphabet-field"><label for="base64-alphabet">Base64 alphabet</label><select id="base64-alphabet"><option value="standard">Standard (+ /, padded)</option><option value="url-safe">URL-safe (- _, unpadded)</option></select></div>
<div id="text-field"><label for="encode-input">Input text</label><textarea id="encode-input" class="mono" rows="3" spellcheck="false" autocapitalize="off" autocomplete="off" placeholder="Enter text here" aria-describedby="input-hint encode-status"></textarea></div>
<div id="file-field" hidden><label for="encode-file">Local file</label><input id="encode-file" type="file" disabled aria-describedby="input-hint encode-status"><p class="hint">Up to 10 MiB. File contents stay on your device.</p></div>
<p id="input-hint" class="hint">Text uses UTF-8; files use their original bytes. Whitespace and line endings are preserved.</p>
<button id="convert" class="primary" type="submit" disabled>Encode input</button>
<p id="encode-status" class="status" role="status" aria-live="polite">Enable JavaScript to convert your input locally.</p>
</form>
<div class="results encode-results">
<div class="results-heading"><h2>Result</h2></div>
<label for="encode-output">Output text</label><textarea id="encode-output" class="mono" rows="8" readonly spellcheck="false" placeholder="Your result will appear here" aria-describedby="result-summary"></textarea>
<p id="result-summary" class="hint" aria-live="polite">No result yet</p>
<div class="toolbar"><button id="copy-result" type="button" disabled>Copy result</button><button id="download-result" type="button" disabled>Download result</button></div>
<p class="hint">Text can be copied. Downloads preserve the exact output bytes, including binary decoded data.</p>
</div></div></section>
<noscript><p class="no-script">Enable JavaScript to encode, decode and hash text or files locally in your browser.</p></noscript>
<section class="section" aria-labelledby="usage-heading"><h2 id="usage-heading">From text to bytes to a digest</h2><p class="intro">Choose an operation and input source, then select Encode input, Decode input or Compute hash. Copy the text result or download the output. Changing the input or operation clears the previous result so you can run the next conversion.</p>
<div class="version-guide">
<article><h3>Base64 / Transport</h3><p>Represent binary bytes as ASCII text for payloads and data interchange. Select the alphabet your destination expects. For example, UTF-8 text <code>foo</code> encodes to <code>Zm9v</code>.</p></article>
<article><h3>Hex / Inspect bytes</h3><p>Show each byte as two hexadecimal digits. UTF-8 text <code>foo</code> becomes <code>666f6f</code>. Decode complete pairs back to their original bytes.</p></article>
<article><h3>Hash / Compare content</h3><p>Compute MD5, SHA-1, SHA-256 or SHA-512 from exact input bytes. A trailing newline changes the digest. Use SHA-256 or SHA-512 for modern digest comparisons; MD5 and SHA-1 remain available for compatibility.</p></article>
</div></section>
<section class="section faq" aria-labelledby="faq-heading"><h2 id="faq-heading">Frequently asked questions</h2>${faq.map(({ question, answer }) => `<details open><summary>${escapeHtml(question)}</summary><p>${escapeHtml(answer)}</p></details>`).join('')}</section>`;
  return pageLayout({
    title, description, canonical, currentPath: '/encode', nonce, content, breadcrumbs,
    script: clientScript(),
    jsonLd: [webApplicationJsonLd({ name: 'Encode & Hash', url: canonical, description }), faqPageJsonLd(faq), breadcrumbListJsonLd(baseUrl, breadcrumbs)],
  });
}
