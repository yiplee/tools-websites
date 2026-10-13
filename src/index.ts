import { renderHome } from './home';
import { builtTools } from './shared/registry';
import { cachePolicies, createNonce, responseHeaders } from './shared/headers';
import { robotsTxt, sitemapXml } from './shared/discovery';
import { pageLayout } from './shared/layout';
import { siteUrl } from './shared/seo';

export interface Env { BASE_URL: string }

export default {
  fetch(request: Request, env: Env): Response {
    const isHead = request.method === 'HEAD';
    if (request.method !== 'GET' && !isHead) {
      const headers = responseHeaders('text/plain; charset=utf-8', cachePolicies.noStore);
      headers.set('Allow', 'GET, HEAD');
      return new Response('Method not allowed\n', { status: 405, headers });
    }
    const url = new URL(request.url);
    const path = url.pathname;
    const tools = builtTools();
    const withoutSlash = path.endsWith('/') ? path.slice(0, -1) : path;
    if (path !== withoutSlash && tools.some((tool) => tool.path === withoutSlash)) {
      const headers = responseHeaders('text/plain; charset=utf-8', cachePolicies.redirect);
      headers.set('Location', withoutSlash + url.search);
      return new Response(null, { status: 301, headers });
    }
    if (path === '/robots.txt' || path === '/sitemap.xml') {
      const robots = path === '/robots.txt';
      return new Response(isHead ? null : robots ? robotsTxt(env.BASE_URL) : sitemapXml(env.BASE_URL), {
        headers: responseHeaders(robots ? 'text/plain; charset=utf-8' : 'application/xml; charset=utf-8', cachePolicies.discovery),
      });
    }
    const tool = tools.find((entry) => entry.path === path);
    const nonce = createNonce();
    const found = path === '/' || !!tool;
    // HEAD returns the same representation headers without rendering a body.
    const body = isHead ? null : path === '/' ? renderHome(env.BASE_URL, nonce)
      : tool ? tool.render(env.BASE_URL, nonce)
      : pageLayout({
        title: 'Page Not Found — Developer Tools',
        description: 'This page is not available. Find an available developer tool on the home page.',
        canonical: siteUrl(env.BASE_URL, path), currentPath: path, nonce, noIndex: true,
        breadcrumbs: [{ name: 'Home', path: '/' }, { name: 'Page not found', path }],
        content: '<p class="eyebrow">404</p><h1>Page not found</h1><p>This page is not available.</p><p><a class="open-tool" href="/">Browse available tools</a></p>',
      });
    return new Response(body, {
      status: found ? 200 : 404,
      headers: responseHeaders('text/html; charset=utf-8', found ? cachePolicies.html : cachePolicies.noStore, nonce),
    });
  },
};
