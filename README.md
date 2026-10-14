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
    encode/
      page.ts           Server-rendered Base64/hex/hash workspace, usage and FAQ
      client.ts         Local text/file input, state, copy and byte-safe download
      encode.ts         Self-contained UTF-8, Base64, hex, MD5 and Web Crypto SHA
    jwt/
      page.ts           Server-rendered JWT workspace, usage and FAQ
      client.ts         Local decode/verify, time checks, async state and copy
      jwt.ts            Strict base64url/JSON parsing and Web Crypto verification
test/                   Vitest computation, client-state and HTTP/SEO tests
```

`/` lists every built tool. `/uuid` generates v1, v4, and v7 UUIDs, in batches
of 1–1,000, with single-row and bulk copy, TXT download, formatting, and
validation/parsing. Generation and parsing run entirely in the browser using
Web Crypto. The self-contained UUID factory and client initializer are serialized
into a nonce-protected inline script; keep their runtime dependencies inside
those functions. No API endpoint or input storage is used. JavaScript is required
for these interactions; page descriptions, FAQs, and navigation remain readable
without it.

`/encode` encodes and decodes Base64 (standard and URL-safe) and hex, and computes
MD5, SHA-1, SHA-256 and SHA-512 hashes. Choose an operation and either UTF-8 text
or a local file, then run the conversion. Encoding and hashing use the exact
input bytes: spaces, line endings and a leading BOM are preserved. Files are
read locally with `File.arrayBuffer()`, including binary and empty files. Text
and file inputs are limited to 10 MiB; the text limit counts UTF-8 bytes.

Standard Base64 output includes required `=` padding; URL-safe output uses `-`
and `_` without padding. Decoding accepts correct padded or unpadded input in
the selected alphabet, rejecting mixed alphabets, malformed padding, impossible
lengths and nonzero unused bits. Hex accepts either case and complete byte pairs,
without `0x`. Both decoders ignore ASCII spaces, tabs, CR and LF. Files used as
encoded input must contain valid UTF-8 Base64 or hex text.

Copy or download the result. Decoded downloads preserve every byte; invalid
UTF-8 results display a binary notice and remain downloadable with copying
disabled. Empty results are also downloadable. Editing the input, operation,
alphabet or source clears the result and invalidates pending work. Errors identify
invalid input, file size/read failures, unsupported Web Crypto and clipboard denial.

SHA uses `crypto.subtle.digest` in the browser; MD5 uses a self-contained RFC 1321
implementation covered by the full RFC vectors and independent binary fixtures
at block/padding boundaries. MD5 and SHA-1 are provided for compatibility checks,
and plain digests are not password hashing schemes. The Encode factory and
initializer are serialized into the same nonce-protected inline script pattern
as UUID. The Worker only serves HTML and discovery files: there are no `/api`
routes, uploads, computation requests, input storage or external dependencies.
The CSP retains `connect-src 'none'`.

`/jwt` decodes compact JWT headers and payloads into formatted JSON and checks
`exp`, `iat` and `nbf` NumericDate claims using Unix seconds. Timestamps display
in UTC. `exp` is expired at equality; `nbf` is active at equality. Fractional
seconds work, invalid/out-of-range dates are flagged, and checks refresh every
second against the device clock with no tolerance. Decoding and time checks do
not authenticate claims. A signature match does not validate issuer, audience,
revocation or application policy.

Choose the **expected algorithm** before verification. HS256/384/512 use the exact
UTF-8 shared secret, preserving spaces and line endings without Base64 decoding.
RS256/384/512, PS256/384/512 and ES256/384/512 accept SPKI `BEGIN PUBLIC KEY` PEM
or one public JWK. RSA requires at least 2048 bits; ECDSA uses P-256, P-384 and
P-521, with JWT's raw R||S signatures rather than DER. JWK algorithm, curve,
key type, use and key operations must match. Private keys, certificates,
PKCS#1 PEM and JWK sets are rejected. HMAC rejects PEM/JWK-shaped public keys.
Keys or URLs embedded in a token are never used or fetched.

JWT parsing rejects malformed segments, invalid UTF-8/nonobject JSON, padding,
whitespace within segments, noncanonical base64url unused bits, and missing
signatures. Outer whitespace is trimmed. Unsigned `alg: none` can be inspected
but cannot be verified; unsupported algorithms and critical/unencoded payload
extensions produce clear errors. Token and key inputs are limited to 1 MiB each.
Header/payload display uses `textContent`; no user content is inserted as HTML.
Editing inputs invalidates pending verification and previous results; switching
algorithms clears the key. Copy exports decoded JSON only. Clear removes the token,
key and results. Inputs are neither uploaded nor stored. Like Encode and UUID,
the JWT factory and initializer are serialized into nonce-protected browser code,
with no API routes or computation on the Worker.

The format and algorithm mappings follow [RFC 7515](https://www.rfc-editor.org/rfc/rfc7515),
[RFC 7518](https://www.rfc-editor.org/rfc/rfc7518) and
[RFC 7519](https://www.rfc-editor.org/rfc/rfc7519).

`keep_names = false` in Wrangler prevents injected name-preservation helpers from
becoming external dependencies of the serialized browser functions.

The registry drives routes, home listings, navigation, Other tools, and the
sitemap. UUID (`/uuid`), Encode & Hash (`/encode`) and JWT (`/jwt`) are built.
Base64, hex and hash operations share `/encode`; `/base64`, `/hex`, `/hash`, and nested Encode
paths are not separate routes. Key Generator (`/keygen`) is planned. Planned
tools have no public links or sitemap entries and return the shared 404 page.

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

Wrangler dev requires Node.js 22 or later.
Dependencies are already present in root `node_modules` in the sandbox. No
dependency installation or network access is required for the tests.

```sh
npm run dev        # wrangler dev
npm test           # vitest run
npm run typecheck  # tsc --noEmit
```

The required checks can also be run directly:

```sh
npx vitest run
npx tsc --noEmit
```

Tests cover RFC 4648 Base64 and hex vectors, RFC 1321 MD5 and FIPS 180 SHA
vectors, Chinese/emoji/BOM/line-ending handling, malformed Base64/hex and UTF-8,
binary decoding, file size/read errors, clipboard denial, byte-exact downloads,
stale async results, and execution of serialized browser functions. Route tests
verify `/encode` metadata, visible FAQ matching JSON-LD (WebApplication,
FAQPage and BreadcrumbList), homepage ItemList, mutual tool links, sitemap,
canonical redirects, GET/HEAD/405/404 behavior and CSP nonce/cache policies.

JWT tests add a fixed standard HS256 known vector, independent Node/OpenSSL-signed
fixtures for all 12 supported algorithms, PEM/JWK verification, wrong keys,
header/payload/signature tampering, algorithm confusion, malformed tokens,
base64url byte and residual-bit boundaries, NumericDate boundaries, clock updates,
clipboard denial, literal hostile-text display and stale async result handling.
The fixture generator uses only Node built-ins; regenerate with
`node test/fixtures/generate-jwt.mjs` (disposable test keys only).

Run targeted mutation checks with `node test/jwt-mutations.mjs`. It first checks a
passing baseline, then applies 17 logic mutations one at a time. Each must cause
an assertion failure; syntax/import failures or subprocess failures do not count.
Source files are restored in `finally`. Run it with no concurrent edits to the JWT
source files, then rerun the full tests and typecheck. The result is recorded in
[`docs/jwt-mutation-report.json`](docs/jwt-mutation-report.json). These targeted
mutations validate signature, parsing, time-boundary and async-state tests;
they are not an exhaustive mutation coverage score.

The site uses system fonts and inline styles/scripts, with no external assets.
Inputs use 16px text, controls provide at least 44px touch targets, and UUID text
wraps inside its bounded, scrollable result list. Color follows the system's
light/dark preference.

JWT was checked in local headless Chrome against the actual Wrangler Worker at
375×844, 390×844, 768×1024, 1280×900, 1440×900, 1920×1080 and 2560×1080.
Desktop uses two columns and mobile uses one; checks include horizontal overflow,
verification of all 12 algorithms (including PEM and public JWK), wrong-key and
malformed/unsigned states, literal HTML-like
claim text, clear/focus, clipboard copy, dark mode and reduced motion. No runtime
exceptions or browser computation requests were observed. Viewport measurements
and interaction results are in [docs/jwt-browser-report.json](docs/jwt-browser-report.json).
Issue #4 screenshots:
[1280px desktop](docs/screenshots/jwt-1280.png) and
[375px mobile](docs/screenshots/jwt-375.png). A later PR should include these
screenshots and `Fixes #4`; this implementation does not create a PR or deploy.

For earlier Encode work, screenshots and visual checks still need to be captured
manually at 1280px and 375px: inspect long output, file input, binary downloads,
empty inputs, operation/source changes and clipboard denial. Automated client tests
do not replace visual inspection.

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
