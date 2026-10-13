import { escapeHtml, seoHead, type SeoOptions } from './seo';
import { baseStyles } from './styles';
import { builtTools, toolRegistry, type Tool } from './registry';
import type { Breadcrumb } from './json-ld';

export interface PageOptions extends SeoOptions {
  content: string;
  currentPath: string;
  nonce: string;
  script?: string;
  breadcrumbs?: readonly Breadcrumb[];
  registry?: readonly Tool[];
}

export function renderBreadcrumbs(items: readonly Breadcrumb[]): string {
  if (!items.length) return '';
  return `<nav class="breadcrumbs" aria-label="Breadcrumb"><ol>${items.map((item, index) =>
    `<li>${index === items.length - 1
      ? `<span aria-current="page">${escapeHtml(item.name)}</span>`
      : `<a href="${escapeHtml(item.path)}">${escapeHtml(item.name)}</a>`}</li>`
  ).join('')}</ol></nav>`;
}

/** Only site-authored content/script may be passed as trusted markup. */
export function pageLayout(options: PageOptions): string {
  const nonce = escapeHtml(options.nonce);
  const tools = builtTools(options.registry ?? toolRegistry);
  const links = [{ path: '/', name: 'Home' }, ...tools];
  const navigation = links.map((link) =>
    `<a href="${escapeHtml(link.path)}"${link.path === options.currentPath ? ' aria-current="page"' : ''}>${escapeHtml(link.name)}</a>`
  ).join('');
  const others = tools.filter((tool) => tool.path !== options.currentPath);
  const otherTools = others.length ? `<section class="other-tools" aria-labelledby="other-tools-heading"><h2 id="other-tools-heading">Other tools</h2><ul>${others.map((tool) =>
    `<li><a href="${escapeHtml(tool.path)}">${escapeHtml(tool.name)}</a><span>${escapeHtml(tool.description)}</span></li>`
  ).join('')}</ul></section>` : '';
  return `<!doctype html>
<html lang="en">
<head>${seoHead(options)}
<style nonce="${nonce}">${baseStyles}</style>
</head>
<body>
<a class="skip-link" href="#main">Skip to content</a>
<header class="site-header"><div class="container header-inner">
<a class="brand" href="/">Developer tools</a>
<nav class="tool-nav" aria-label="Developer tools">${navigation}</nav>
</div></header>
<main id="main" class="container">${renderBreadcrumbs(options.breadcrumbs ?? [])}${options.content}</main>
<footer class="site-footer"><div class="container">${otherTools}<div class="footer-inner"><p>Small tools for everyday development.</p><p>Runs locally in your browser.</p></div></div></footer>
${options.script ? `<script nonce="${nonce}">${options.script}</script>` : ''}
</body>
</html>`;
}
