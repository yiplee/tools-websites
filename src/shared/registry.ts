import { renderUuidPage } from '../tools/uuid/page';
import { renderEncodePage } from '../tools/encode/page';
import { renderJwtPage } from '../tools/jwt/page';

export interface ToolInfo {
  slug: string;
  path: `/${string}`;
  name: string;
  description: string;
}

export type Tool = ToolInfo & (
  | { status: 'built'; render: (baseUrl: string, nonce: string) => string }
  | { status: 'planned' }
);
export type BuiltTool = Extract<Tool, { status: 'built' }>;

/** The single source for routing, discovery, home, navigation, and related tools. */
export const toolRegistry: readonly Tool[] = [
  {
    slug: 'uuid', path: '/uuid', name: 'UUID Generator',
    description: 'Generate, format, and inspect v1, v4, and v7 UUIDs in your browser.',
    status: 'built', render: renderUuidPage,
  },
  {
    slug: 'encode', path: '/encode', name: 'Encode & Hash',
    description: 'Convert Base64 and hex, or hash UTF-8 text and local files privately.',
    status: 'built', render: renderEncodePage,
  },
  {
    slug: 'jwt', path: '/jwt', name: 'JWT',
    description: 'Decode JWT claims and verify signatures locally with Web Crypto.',
    status: 'built', render: renderJwtPage,
  },
  {
    slug: 'keygen', path: '/keygen', name: 'Key Generator',
    description: 'Generate keys locally in your browser.', status: 'planned',
  },
];

export function builtTools(registry: readonly Tool[] = toolRegistry): BuiltTool[] {
  return registry.filter((tool): tool is BuiltTool => tool.status === 'built');
}
