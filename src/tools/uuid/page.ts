import { escapeHtml, siteUrl } from '../../shared/seo';
import { pageLayout } from '../../shared/layout';
import { breadcrumbListJsonLd, faqPageJsonLd, webApplicationJsonLd, type FaqItem } from '../../shared/json-ld';
import { clientScript } from './client';

export const title = 'UUID Generator — v4, v7 & v1 | Free, Local & Private';
export const description = 'Generate up to 1,000 UUIDs in your browser. Choose v4, v7 or v1, format, copy or download, and validate UUID versions, variants and timestamps privately.';

export const faq: readonly FaqItem[] = [
  { question: 'Are my UUIDs or pasted values sent to a server?', answer: 'No. Generation, formatting and validation run locally in your browser. The tool does not send your inputs or generated UUIDs to a server, and it does not store them. Reloading the page clears your work.' },
  { question: 'Should I choose UUID v4, v7 or v1?', answer: 'Choose v4 for a general-purpose random identifier. Choose v7 when timestamp-based sorting is useful, such as database keys. Choose v1 for compatibility with systems that require it. Both v1 and v7 include a timestamp; v4 does not.' },
  { question: 'Can UUIDs collide, and can I use them as passwords?', answer: 'Random UUIDs have an extremely low collision probability when generated with a cryptographically secure random source, but uniqueness is not guaranteed. Enforce a unique constraint where it matters. UUIDs are identifiers, not passwords or authentication secrets; timestamp-based UUIDs reveal creation-time information.' },
  { question: 'How do I generate and export a batch?', answer: 'Choose a version and a count from 1 to 1,000, then select Generate UUIDs. Copy a single row, copy the whole batch, or download uuids.txt with one UUID per line. Formatting options change the displayed and exported text without generating new UUIDs.' },
  { question: 'What does the validator accept and show?', answer: 'The validator accepts RFC 9562 UUID versions 1 through 8, plus nil (all zeros) and max (all f characters). Standard hyphens, 32 hex digits without hyphens, uppercase, lowercase and enclosing braces are accepted. It shows the version and variant, and a UTC timestamp for v1 or v7. It checks structure, not whether an identifier has been used or is unique.' },
];

export function renderUuidPage(baseUrl: string, nonce: string): string {
  const canonical = siteUrl(baseUrl, '/uuid');
  const breadcrumbs = [{ name: 'Home', path: '/' }, { name: 'UUID Generator', path: '/uuid' }];
  const content = `
<p class="eyebrow">Identifiers, on demand</p>
<h1>UUID generator</h1>
<p class="intro">Create random v4, time-ordered v7, or timestamp-based v1 UUIDs. Generate a batch, adjust its format, and copy it straight into your work. Everything runs locally in your browser.</p>
<section class="tool" aria-label="Generate UUIDs">
<div class="tool-grid">
<form id="generator" class="controls">
<div class="field-grid">
<div><label for="version">UUID version</label><select id="version"><option value="4">v4 · Random</option><option value="7">v7 · Time ordered</option><option value="1">v1 · Timestamp</option></select></div>
<div><label for="count">Count</label><input id="count" type="number" min="1" max="1000" step="1" value="3" required aria-describedby="count-hint generation-status"></div>
</div>
<p id="count-hint" class="hint">1–1,000 UUIDs per batch.</p>
<fieldset><legend>Text format</legend>
<label class="check" for="uppercase"><input id="uppercase" type="checkbox">Uppercase letters</label>
<label class="check" for="no-hyphens"><input id="no-hyphens" type="checkbox">Remove hyphens</label>
<label class="check" for="braces"><input id="braces" type="checkbox">Wrap in braces { }</label>
</fieldset>
<button id="generate" class="primary" type="submit" disabled>Generate UUIDs</button>
<p id="generation-status" class="status" role="status" aria-live="polite">Enable JavaScript to generate your own UUIDs.</p>
</form>
<div class="results">
<div class="results-heading"><h2>Your UUIDs</h2><span id="output-count" class="hint">No UUIDs yet</span></div>
<ol id="uuid-output" class="uuid-list" aria-label="Generated UUIDs" aria-live="polite" aria-relevant="additions text"></ol>
<div class="toolbar"><button id="copy-all" type="button" disabled>Copy all</button><button id="download" type="button" disabled>Download .txt</button></div>
<p class="hint">One identifier per line. Ready for your editor or database.</p>
</div></div></section>
<noscript><p class="no-script">Enable JavaScript to generate and validate UUIDs locally in your browser.</p></noscript>
<section class="section section-grid" aria-labelledby="validate-heading">
<div><h2 id="validate-heading">Validate &amp; parse a UUID</h2><p>Inspect an identifier before you use it. Check its version and variant, or read the UTC creation timestamp embedded in v1 and v7.</p><p class="muted">Accepts standard hyphens or 32 hex digits, with optional braces. A valid structure does not prove uniqueness.</p></div>
<form id="validator" class="validator"><label for="validate-input">UUID to inspect</label><textarea id="validate-input" class="mono" rows="2" spellcheck="false" autocapitalize="off" autocomplete="off" placeholder="Paste a UUID here" aria-describedby="parse-result"></textarea><div class="toolbar"><button id="validate" type="submit" disabled>Validate UUID</button></div><div id="parse-result" class="parse-result" role="status" aria-live="polite">Your input stays in this browser.</div></form>
</section>
<section class="section" aria-labelledby="usage-heading"><h2 id="usage-heading">Identifiers for everyday development</h2><p class="intro">Use this tool for database records, test fixtures, request IDs, and application resources. Choose your UUID version and count, generate a batch, then copy or download the results. The format switches apply instantly to the current batch.</p>
<div class="version-guide">
<article><h3>v4 / Random</h3><p>122 random bits from Web Crypto, with fixed version and variant bits. A useful default when you need an identifier without an embedded timestamp.</p></article>
<article><h3>v7 / Time ordered</h3><p>Starts with a 48-bit Unix timestamp in milliseconds. A counter keeps UUIDs ordered within this page, including a batch generated in the same millisecond. Separate tabs and devices have independent clocks and counters.</p></article>
<article><h3>v1 / Timestamp</h3><p>Combines a timestamp in 100-nanosecond units since October 15, 1582, a clock sequence, and a random node identifier. This tool sets the multicast bit on the random node; it does not read your device’s MAC address.</p></article>
</div></section>
<section class="section faq" aria-labelledby="faq-heading"><h2 id="faq-heading">Frequently asked questions</h2>${faq.map(({ question, answer }) => `<details open><summary>${escapeHtml(question)}</summary><p>${escapeHtml(answer)}</p></details>`).join('')}</section>`;
  return pageLayout({
    title, description, canonical, currentPath: '/uuid', nonce, content, breadcrumbs,
    script: clientScript(),
    jsonLd: [webApplicationJsonLd({ name: 'UUID Generator', url: canonical, description }), faqPageJsonLd(faq), breadcrumbListJsonLd(baseUrl, breadcrumbs)],
  });
}
