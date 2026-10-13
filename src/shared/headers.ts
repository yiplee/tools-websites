export const cachePolicies = {
  html: 'no-store',
  redirect: 'public, max-age=3600',
  discovery: 'public, max-age=86400',
  noStore: 'no-store',
} as const;

export function createNonce(): string {
  return Array.from(crypto.getRandomValues(new Uint8Array(18)), (byte) => byte.toString(16).padStart(2, '0')).join('');
}

export function securityHeaders(nonce?: string): Headers {
  if (nonce && !/^[a-zA-Z0-9+/_=-]+$/.test(nonce)) throw new Error('Invalid CSP nonce.');
  const inline = nonce ? `'nonce-${nonce}'` : "'none'";
  return new Headers({
    'X-Content-Type-Options': 'nosniff',
    'Referrer-Policy': 'strict-origin-when-cross-origin',
    'X-Frame-Options': 'DENY',
    'Permissions-Policy': 'camera=(), microphone=(), geolocation=()',
    'Content-Security-Policy': `default-src 'none'; script-src ${inline}; style-src ${inline}; connect-src 'none'; img-src 'none'; font-src 'none'; object-src 'none'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'`,
  });
}

export function responseHeaders(contentType: string, cacheControl: string, nonce?: string): Headers {
  const headers = securityHeaders(nonce);
  headers.set('Content-Type', contentType);
  headers.set('Cache-Control', cacheControl);
  return headers;
}
