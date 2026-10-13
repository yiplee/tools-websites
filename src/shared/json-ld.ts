import { siteUrl } from './seo';
import type { ToolInfo } from './registry';

export interface FaqItem { question: string; answer: string }
export interface Breadcrumb { name: string; path: string }

export function webApplicationJsonLd(options: { name: string; url: string; description: string }) {
  return {
    '@context': 'https://schema.org', '@type': 'WebApplication', ...options,
    applicationCategory: 'DeveloperApplication', operatingSystem: 'Any',
    browserRequirements: 'Requires JavaScript and Web Crypto support.',
    offers: { '@type': 'Offer', price: '0', priceCurrency: 'USD' },
  };
}

export function faqPageJsonLd(items: readonly FaqItem[]) {
  return {
    '@context': 'https://schema.org', '@type': 'FAQPage',
    mainEntity: items.map(({ question, answer }) => ({
      '@type': 'Question', name: question,
      acceptedAnswer: { '@type': 'Answer', text: answer },
    })),
  };
}

export function webSiteJsonLd(baseUrl: string, description: string) {
  return {
    '@context': 'https://schema.org', '@type': 'WebSite',
    name: 'Developer tools', url: siteUrl(baseUrl), description,
  };
}

export function itemListJsonLd(baseUrl: string, tools: readonly ToolInfo[]) {
  return {
    '@context': 'https://schema.org', '@type': 'ItemList',
    itemListElement: tools.map((tool, index) => ({
      '@type': 'ListItem', position: index + 1, name: tool.name,
      description: tool.description, url: siteUrl(baseUrl, tool.path),
    })),
  };
}

export function breadcrumbListJsonLd(baseUrl: string, items: readonly Breadcrumb[]) {
  return {
    '@context': 'https://schema.org', '@type': 'BreadcrumbList',
    itemListElement: items.map((item, index) => ({
      '@type': 'ListItem', position: index + 1,
      name: item.name, item: siteUrl(baseUrl, item.path),
    })),
  };
}
