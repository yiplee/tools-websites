# tools-websites

One developer-tools website served by one Cloudflare Worker at
`https://tools-websites.yiplee.workers.dev`. Root `wrangler.toml` configures the
Worker named `tools-websites`, its entry point `src/index.ts`, and the public
`BASE_URL` variable. There are no secrets, custom domains, or route bindings.

## Architecture

```text
src/
  index.ts              GET/HEAD routing and HTTP responses
  home.ts               Home page and available-tool listing
  shared/
    registry.ts         Single registry: metadata, built/planned status, renderer
    layout.ts           Navigation, breadcrumbs, footer, and Other tools
    seo.ts              Metadata, absolute URLs, escaping, JSON serialization
    json-ld.ts          WebApplication, FAQPage, WebSite, ItemList, BreadcrumbList
    styles.ts           Responsive light/dark styles
    discovery.ts        Site robots.txt and built-page sitemap.xml
    headers.ts          Cache policy, CSP nonces, and security headers
  tools/
    uuid/
      page.ts           Server-rendered tool, usage, and FAQ
      client.ts         Browser interactions and inline script
      uuid.ts           Self-contained UUID generation, formatting, and parsing
test/                   Vitest UUID and HTTP/SEO/registry tests
```

`/` lists every built tool. `/uuid` generates v1, v4, and v7 UUIDs, in batches
of 1–1,000, with single-row and bulk copy, TXT download, formatting, and
validation/parsing. Generation and parsing run entirely in the browser using
Web Crypto. The self-contained UUID factory and client initializer are serialized
into a nonce-protected inline script; keep their runtime dependencies inside
those functions. No API endpoint or input storage is used. JavaScript is required
for these interactions; page descriptions, FAQs, and navigation remain readable
without it.

`keep_names = false` in Wrangler prevents injected name-preservation helpers from
becoming external dependencies of the serialized browser functions.

The registry drives routes, home listings, navigation, Other tools, and the
sitemap. Encode (`/encode`, with future `/base64`, `/hex`, and `/hash`), JWT
(`/jwt`), and Key Generator (`/keygen`) are planned. Planned tools have no public
links or sitemap entries and return the shared 404 page.

Internal anchors use relative paths. Canonical, Open Graph, Twitter, JSON-LD,
and discovery URLs use `BASE_URL`, independent of the incoming request host.
Built tool paths with a trailing slash redirect permanently to the canonical
path, preserving query parameters. GET and HEAD are supported; other methods
return 405. Successful HTML responses use `Cache-Control: no-store` to prevent
cached CSP nonce reuse; 404 responses also use `no-store`. Nonce-free 301
redirects retain `public, max-age=3600`, while robots.txt and sitemap.xml retain
`public, max-age=86400`. HEAD uses the same cache policy as GET. Responses
include CSP, nosniff, Referrer-Policy, and frame protection.

The root TypeScript config uses DOM/Web API types for both browser code and the
Worker's standard Request/Response entry point. It avoids globally loading
Cloudflare's HTMLRewriter `Element`, which conflicts with the browser DOM
`Element`. `@cloudflare/workers-types` remains available as a dev dependency for
explicit imports if Cloudflare-specific bindings are introduced.

## Development and checks

Dependencies are already present in root `node_modules` in the sandbox. No
dependency installation or network access is required for the tests.

```sh
npm run dev        # wrangler dev
npm test           # vitest run
npm run typecheck  # tsc --noEmit
```

The site uses system fonts and inline styles/scripts, with no external assets.
Inputs use 16px text, controls provide at least 44px touch targets, and UUID text
wraps inside its bounded, scrollable result list. Color follows the system's
light/dark preference.

Browser automation is unavailable in this sandbox, so rendered visual checks
must be performed manually: check 360px for horizontal overflow, then
390×844, 768×1024, 1440×900, 1920×1080, and 2560×1080 in light and dark mode.
Check navigation wrapping, the controls/results grid, long UUIDs with braces,
keyboard focus, validation errors, all copy actions (including denied clipboard
access), and the TXT download. Automated tests exercise UUID rules, registry
integration, metadata, and HTTP behavior; they do not replace these visual checks.

## Deployment

When ready and authorized, authenticate Wrangler with Cloudflare and run:

```sh
npm run deploy     # wrangler deploy
```

This publishes the single Worker to its workers.dev address. No deployment is
part of the local test workflow.

## Add a tool

1. Add `src/tools/<tool>/` with a page renderer accepting `(baseUrl, nonce)` and
   returning HTML through `pageLayout`. Use `currentPath`, visible usage/help,
   and an appropriate breadcrumb list; supply a unique title, description,
   canonical, and relevant JSON-LD through the shared helpers.
2. Import the renderer in `src/shared/registry.ts` and add one entry with `slug`,
   `path`, `name`, a one-line `description`, `status: 'built'`, and `render`.
   For an unfinished tool, use `status: 'planned'` without a renderer.
3. Add tool tests under `test/`, then run `npm test` and `npm run typecheck`.

No routing, navigation, homepage, footer, or sitemap edits are needed. Only built
tools are published. Keep tool computation in the browser and nonce all inline
scripts/styles through the shared layout.
