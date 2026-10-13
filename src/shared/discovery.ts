import { builtTools, toolRegistry, type Tool } from './registry';
import { escapeHtml, siteUrl } from './seo';

export function robotsTxt(baseUrl: string): string {
  return `User-agent: *\nAllow: /\nSitemap: ${siteUrl(baseUrl, '/sitemap.xml')}\n`;
}

export function sitemapXml(baseUrl: string, registry: readonly Tool[] = toolRegistry): string {
  const paths = ['/', ...builtTools(registry).map((tool) => tool.path)];
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${paths.map((path) => `  <url><loc>${escapeHtml(siteUrl(baseUrl, path))}</loc></url>`).join('\n')}\n</urlset>\n`;
}
