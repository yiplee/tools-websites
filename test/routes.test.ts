import { describe, expect, it } from 'vitest';
import worker from '../src/index';
import { homeDescription, homeTitle } from '../src/home';
import { title as uuidTitle, description as uuidDescription, faq } from '../src/tools/uuid/page';
import { builtTools, toolRegistry, type Tool } from '../src/shared/registry';
import { pageLayout } from '../src/shared/layout';
import { sitemapXml } from '../src/shared/discovery';
import { serializeJsonLd, siteUrl } from '../src/shared/seo';

const baseUrl = 'https://tools-websites.yiplee.workers.dev';
const env = { BASE_URL: baseUrl };
const request = (path: string, method = 'GET') => worker.fetch(new Request(`https://incoming.example${path}`, { method }), env);
const anchors = (html: string) => [...html.matchAll(/<a\b[^>]*href="([^"]+)"[^>]*>/g)].map((match) => match[1]);
const jsonLd = (html: string): Record<string, any>[] => [...html.matchAll(/<script type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/g)].map((match) => JSON.parse(match[1]));
const locations = (xml: string) => [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((match) => match[1]);

describe('HTML routes and SEO', () => {
  it.each([
    ['/', homeTitle, homeDescription, ['WebSite', 'ItemList']],
    ['/uuid', uuidTitle, uuidDescription, ['WebApplication', 'FAQPage', 'BreadcrumbList']],
  ] as const)('renders %s with its own metadata and parseable structured data', async (path, title, description, types) => {
    const response = request(path);
    const html = await response.text();
    const canonical = baseUrl + path;
    expect(response.status).toBe(200);
    expect(response.headers.get('Content-Type')).toBe('text/html; charset=utf-8');
    expect(response.headers.get('Cache-Control')).toBe('no-store');
    expect(html).toContain(`<title>${title.replace(/&/g, '&amp;')}</title>`);
    expect(html).toContain(`<meta name="description" content="${description}">`);
    expect(html).toContain(`<link rel="canonical" href="${canonical}">`);
    expect(html).toContain(`<meta property="og:url" content="${canonical}">`);
    expect(html).toContain(`<meta name="twitter:url" content="${canonical}">`);
    expect(html).toContain('name="viewport" content="width=device-width, initial-scale=1"');
    expect(jsonLd(html).map((value) => value['@type'])).toEqual(types);
    expect(html).toContain(`<a href="${path}" aria-current="page">`);
    expect(anchors(html)).toContain('/');
    expect(anchors(html)).toContain('/uuid');
    expect(anchors(html).every((href) => href.startsWith('/') || href === '#main')).toBe(true);
    for (const plannedPath of ['/encode', '/jwt', '/keygen', '/base64', '/hex', '/hash']) {
      expect(anchors(html)).not.toContain(plannedPath);
    }
    for (const tool of toolRegistry.filter((entry) => entry.status === 'planned')) {
      expect(anchors(html)).not.toContain(tool.path);
    }
  });

  it('lists all built tools on home, with matching ItemList URLs', async () => {
    const html = await request('/').text();
    const list = jsonLd(html).find((value) => value['@type'] === 'ItemList')!;
    expect(list.itemListElement.map((item: any) => item.url)).toEqual(builtTools().map((tool) => baseUrl + tool.path));
    for (const tool of builtTools()) expect(html).toContain(`<h3><a href="${tool.path}">${tool.name}</a></h3>`);
    expect(jsonLd(html).find((value) => value['@type'] === 'WebSite')!.url).toBe(baseUrl + '/');
  });

  it('renders UUID usage, FAQ, breadcrumbs, and all client controls', async () => {
    const html = await request('/uuid').text();
    expect(html).toContain('Identifiers for everyday development');
    expect(html).toContain('Frequently asked questions');
    const data = jsonLd(html);
    const application = data.find((value) => value['@type'] === 'WebApplication')!;
    expect(application.url).toBe(baseUrl + '/uuid');
    expect(application.description).toBe(uuidDescription);
    const questions = data.find((value) => value['@type'] === 'FAQPage')!.mainEntity;
    expect(questions).toHaveLength(faq.length);
    for (const [index, item] of faq.entries()) {
      expect(questions[index]).toMatchObject({ name: item.question, acceptedAnswer: { text: item.answer } });
      expect(html).toContain(item.question.replace(/&/g, '&amp;'));
      expect(html).toContain(item.answer.replace(/&/g, '&amp;'));
    }
    const breadcrumbs = data.find((value) => value['@type'] === 'BreadcrumbList')!.itemListElement;
    expect(breadcrumbs.map((item: any) => item.item)).toEqual([baseUrl + '/', baseUrl + '/uuid']);
    expect(html).toContain('aria-label="Breadcrumb"');
    expect(html).not.toContain('id="other-tools-heading"');
    for (const id of ['generator', 'count', 'version', 'uppercase', 'no-hyphens', 'braces', 'copy-all', 'download', 'validator', 'validate-input']) {
      expect(html).toContain(`id="${id}"`);
    }
    // No UUID generation is performed during server rendering.
    expect(html).toContain('id="output-count" class="hint">No UUIDs yet');
    expect(html).toContain('aria-relevant="additions text"></ol>');
    const script = [...html.matchAll(/<script nonce="[^"]+">([\s\S]*?)<\/script>/g)][0][1];
    expect(() => new Function(script)).not.toThrow();
    expect(script).not.toMatch(/\bfetch\s*\(|XMLHttpRequest|sendBeacon/);
    expect(script).toContain('clipboard.writeText');
    expect(script).toContain('getRandomValues');
    expect(script).toContain('randomUUID');
  });

  it('uses configured BASE_URL rather than the request host', async () => {
    const response = worker.fetch(new Request('https://preview.example/uuid'), { BASE_URL: 'https://custom.example/' });
    expect(await response.text()).toContain('<link rel="canonical" href="https://custom.example/uuid">');
  });
});

describe('registry-driven navigation and discovery', () => {
  it('filters planned tools and excludes the current page from Other tools', () => {
    const registry: Tool[] = [
      ...toolRegistry,
      { slug: 'second', path: '/second', name: 'Second Tool', description: 'Another available tool.', status: 'built', render: () => '' },
    ];
    expect(builtTools(registry).map((tool) => tool.slug)).toEqual(['uuid', 'second']);
    const html = pageLayout({ title: 'Test', description: 'Test', canonical: baseUrl + '/uuid', nonce: 'testnonce', currentPath: '/uuid', content: '', registry });
    const nav = html.match(/<nav class="tool-nav"[^>]*>(.*?)<\/nav>/s)![1];
    expect(anchors(nav)).toEqual(['/', '/uuid', '/second']);
    expect(nav).toContain('<a href="/uuid" aria-current="page">');
    const other = html.match(/<section class="other-tools"[^>]*>(.*?)<\/section>/s)![1];
    expect(anchors(other)).toEqual(['/second']);
    expect(other).toContain('Another available tool.');
    expect(locations(sitemapXml(baseUrl, registry))).toEqual([baseUrl + '/', baseUrl + '/uuid', baseUrl + '/second']);
  });

  it('activates a built tool everywhere with one registry entry', async () => {
    const registry = toolRegistry as Tool[];
    const extra: Tool = { slug: 'example', path: '/example', name: 'Example Tool', description: 'A new tool.', status: 'built', render: (url, nonce) => pageLayout({ title: 'Example Tool', description: 'A new tool.', canonical: siteUrl(url, '/example'), currentPath: '/example', nonce, content: '<h1>Example Tool</h1>' }) };
    registry.push(extra);
    try {
      expect(request('/example').status).toBe(200);
      const home = await request('/').text();
      expect(home).toContain('<h3><a href="/example">Example Tool</a></h3>');
      expect(jsonLd(home).find((value) => value['@type'] === 'ItemList')!.itemListElement).toHaveLength(2);
      const uuid = await request('/uuid').text();
      expect(uuid).toContain('id="other-tools-heading"');
      expect(uuid.match(/<section class="other-tools"[^>]*>(.*?)<\/section>/s)![1]).toContain('href="/example"');
      expect(locations(await request('/sitemap.xml').text())).toEqual([baseUrl + '/', baseUrl + '/uuid', baseUrl + '/example']);
      expect(request('/example/').headers.get('Location')).toBe('/example');
    } finally {
      registry.splice(registry.indexOf(extra), 1);
    }
  });
});

describe('HTTP routes, caching, and security', () => {
  it('returns a sitemap containing exactly home and built pages with absolute URLs', async () => {
    const response = request('/sitemap.xml');
    expect(response.status).toBe(200);
    expect(response.headers.get('Content-Type')).toBe('application/xml; charset=utf-8');
    const xml = await response.text();
    expect(xml).toContain('xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"');
    expect(locations(xml)).toEqual([baseUrl + '/', ...builtTools().map((tool) => baseUrl + tool.path)]);
    expect(new Set(locations(xml)).size).toBe(locations(xml).length);
  });

  it('serves one site robots file with its absolute Sitemap line', async () => {
    const response = request('/robots.txt');
    expect(response.headers.get('Content-Type')).toBe('text/plain; charset=utf-8');
    expect(await response.text()).toBe(`User-agent: *\nAllow: /\nSitemap: ${baseUrl}/sitemap.xml\n`);
  });

  it.each(['/jwt', '/jwt/', '/encode', '/keygen', '/base64', '/hex', '/hash', '/encode/base64', '/encode/hex', '/encode/hash', '/api', '/api/uuid', '/uuid/api', '/uuid/robots.txt', '/missing'])('returns a layout 404 for %s', async (path) => {
    const response = request(path);
    const html = await response.text();
    expect(response.status).toBe(404);
    expect(response.headers.get('Content-Type')).toBe('text/html; charset=utf-8');
    expect(response.headers.get('Cache-Control')).toBe('no-store');
    expect(html).toContain('<h1>Page not found</h1>');
    expect(html).toContain('<header class="site-header">');
    expect(html).toContain('<footer class="site-footer">');
    expect(html).toContain('name="robots" content="noindex"');
    expect(anchors(html).filter((href) => href !== '#main').every((href) => ['/', '/uuid'].includes(href))).toBe(true);
  });

  it.each(['POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'])('returns 405 for %s on any route', async (method) => {
    for (const path of ['/', '/uuid', '/uuid/', '/robots.txt', '/sitemap.xml', '/api/uuid', '/missing']) {
      const response = request(path, method);
      expect(response.status).toBe(405);
      expect(response.headers.get('Allow')).toBe('GET, HEAD');
      expect(response.headers.get('Cache-Control')).toBe('no-store');
      expect(await response.text()).toBe('Method not allowed\n');
    }
  });

  it('redirects the built trailing-slash route with 301 and preserves query parameters', () => {
    for (const method of ['GET', 'HEAD']) {
      const response = request('/uuid/?version=7', method);
      expect(response.status).toBe(301);
      expect(response.headers.get('Location')).toBe('/uuid?version=7');
      expect(response.headers.get('Cache-Control')).toBe('public, max-age=3600');
      expect(response.headers.get('Content-Security-Policy')).not.toContain('nonce-');
    }
  });

  it.each(['/', '/uuid', '/robots.txt', '/sitemap.xml', '/jwt', '/api/uuid', '/uuid/'])('supports HEAD without a body on %s', async (path) => {
    const get = request(path);
    const head = request(path, 'HEAD');
    expect(head.status).toBe(get.status);
    for (const header of ['Content-Type', 'Cache-Control', 'Location', 'X-Content-Type-Options', 'Referrer-Policy']) {
      expect(head.headers.get(header)).toBe(get.headers.get(header));
    }
    expect(await head.text()).toBe('');
  });

  it.each([
    ['/', 'no-store'],
    ['/uuid', 'no-store'],
    ['/missing', 'no-store'],
    ['/robots.txt', 'public, max-age=86400'],
    ['/sitemap.xml', 'public, max-age=86400'],
  ])('sets cache and security headers on %s', async (path, cacheControl) => {
    const response = request(path);
    expect(response.headers.get('Cache-Control')).toBe(cacheControl);
    expect(response.headers.get('X-Content-Type-Options')).toBe('nosniff');
    expect(response.headers.get('Referrer-Policy')).toBe('strict-origin-when-cross-origin');
    expect(response.headers.get('X-Frame-Options')).toBe('DENY');
    const csp = response.headers.get('Content-Security-Policy')!;
    expect(csp).toContain("default-src 'none'");
    expect(csp).toContain("connect-src 'none'");
    expect(csp).not.toContain('unsafe-inline');
    if (response.headers.get('Content-Type')!.startsWith('text/html')) {
      const nonce = csp.match(/script-src 'nonce-([^']+)'/)![1];
      expect(csp).toContain(`style-src 'nonce-${nonce}'`);
      const html = await response.text();
      const tags = [...html.matchAll(/<(script|style)\b([^>]*)>/g)];
      expect(tags.length).toBeGreaterThan(0);
      for (const tag of tags) expect(tag[2]).toContain(`nonce="${nonce}"`);
    } else {
      expect(csp).not.toContain('nonce-');
    }
  });

  it('uses a fresh cryptographic nonce for each HTML response', () => {
    expect(request('/uuid').headers.get('Content-Security-Policy')).not.toBe(request('/uuid').headers.get('Content-Security-Policy'));
  });

  it('safely serializes structured data containing HTML delimiters', () => {
    const value = { text: '</script><script>alert(1)</script>&\u2028\u2029' };
    const json = serializeJsonLd(value);
    expect(json).not.toContain('<');
    expect(json).not.toContain('&');
    expect(JSON.parse(json)).toEqual(value);
  });
});
