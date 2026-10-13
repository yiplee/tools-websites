export function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (character) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  })[character]!);
}

/** Escape script delimiters, including JSON containing a closing script tag. */
export function serializeJsonLd(value: unknown): string {
  return JSON.stringify(value).replace(/[<>&\u2028\u2029]/g, (character) =>
    `\\u${character.charCodeAt(0).toString(16).padStart(4, '0')}`);
}

export function siteUrl(baseUrl: string, path = '/'): string {
  const base = new URL(baseUrl);
  if (!['https:', 'http:'].includes(base.protocol)) throw new Error('BASE_URL must be an HTTP(S) URL.');
  const url = new URL(base.origin);
  url.pathname = path;
  return url.href;
}

export interface SeoOptions {
  title: string;
  description: string;
  canonical: string;
  siteName?: string;
  jsonLd?: readonly unknown[];
  nonce?: string;
  noIndex?: boolean;
}

export function seoHead(options: SeoOptions): string {
  const title = escapeHtml(options.title);
  const description = escapeHtml(options.description);
  const canonical = escapeHtml(options.canonical);
  const nonce = options.nonce ? ` nonce="${escapeHtml(options.nonce)}"` : '';
  return `<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="color-scheme" content="light dark">
<title>${title}</title>
<meta name="description" content="${description}">
${options.noIndex ? '<meta name="robots" content="noindex">' : ''}
<link rel="canonical" href="${canonical}">
<meta property="og:type" content="website">
<meta property="og:title" content="${title}">
<meta property="og:description" content="${description}">
<meta property="og:url" content="${canonical}">
<meta property="og:locale" content="en_US">
<meta property="og:site_name" content="${escapeHtml(options.siteName ?? 'Developer tools')}">
<meta name="twitter:card" content="summary">
<meta name="twitter:title" content="${title}">
<meta name="twitter:description" content="${description}">
<meta name="twitter:url" content="${canonical}">
${(options.jsonLd ?? []).map((value) => `<script type="application/ld+json"${nonce}>${serializeJsonLd(value)}</script>`).join('\n')}`;
}
