import { pageLayout } from './shared/layout';
import { builtTools } from './shared/registry';
import { escapeHtml, siteUrl } from './shared/seo';
import { itemListJsonLd, webSiteJsonLd } from './shared/json-ld';

export const homeTitle = 'Developer Tools — Free Browser Utilities';
export const homeDescription = 'Small, free tools for everyday development. Generate UUIDs, convert Base64 and hex, and hash text or files locally in your browser, with no uploads or accounts.';

export function renderHome(baseUrl: string, nonce: string): string {
  const tools = builtTools();
  return pageLayout({
    title: homeTitle, description: homeDescription, canonical: siteUrl(baseUrl),
    currentPath: '/', nonce,
    jsonLd: [webSiteJsonLd(baseUrl, homeDescription), itemListJsonLd(baseUrl, tools)],
    content: `<p class="eyebrow">Your browser, your workspace</p>
<h1>Tools for everyday development</h1>
<p class="intro">Quick utilities for the small jobs between the big ones. Open a tool and get straight to work. Your inputs stay in your browser.</p>
<section class="section" aria-labelledby="tools-heading"><h2 id="tools-heading">Available tools</h2>
<div class="tool-directory">${tools.map((tool) => `<article class="directory-entry"><h3><a href="${escapeHtml(tool.path)}">${escapeHtml(tool.name)}</a></h3><p>${escapeHtml(tool.description)}</p><a class="open-tool" href="${escapeHtml(tool.path)}">Open ${escapeHtml(tool.name)} <span aria-hidden="true">→</span></a></article>`).join('')}</div></section>`,
  });
}
