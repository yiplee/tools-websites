/** Shared responsive primitives for every page and tool. */
export const baseStyles = `
:root {
  color-scheme: light dark;
  --page: #f4f6f8; --surface: #ffffff; --inset: #edf1f5;
  --text: #182333; --muted: #4b5d70; --border: #c4ced8;
  --accent: #075aa8; --accent-hover: #064881; --on-accent: #ffffff;
  --focus: #a44700; --danger: #a11e26; --success: #196236;
  --mono: ui-monospace, SFMono-Regular, Consolas, "Liberation Mono", monospace;
}
@media (prefers-color-scheme: dark) {
  :root {
    --page: #111820; --surface: #192430; --inset: #101a25;
    --text: #edf3fa; --muted: #b2c1d0; --border: #506174;
    --accent: #99cbff; --accent-hover: #c1dfff; --on-accent: #11283f;
    --focus: #ffd18c; --danger: #ffb4b9; --success: #91dcad;
  }
}
*, *::before, *::after { box-sizing: border-box; }
body { margin: 0; background: var(--page); color: var(--text); font: 16px/1.6 system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; }
a { color: var(--accent); text-underline-offset: .2em; }
a:hover { text-decoration-thickness: 2px; }
button, input, select, textarea { font: inherit; font-size: 16px; }
button, input:not([type="checkbox"]), select { min-height: 44px; }
button, input, select, textarea { max-width: 100%; border: 1px solid var(--border); border-radius: 6px; background: var(--surface); color: var(--text); }
button { padding: .5rem .9rem; cursor: pointer; font-weight: 650; line-height: 1.35; }
button:hover { background: var(--inset); border-color: var(--muted); }
button:active { transform: translateY(1px); }
button:disabled { cursor: not-allowed; opacity: .6; }
button.primary { background: var(--accent); border-color: var(--accent); color: var(--on-accent); }
button.primary:hover { background: var(--accent-hover); }
:focus-visible { outline: 3px solid var(--focus); outline-offset: 3px; }
input, select, textarea { padding: .55rem .7rem; width: 100%; }
textarea { resize: vertical; min-height: 96px; overflow-wrap: anywhere; }
input[type="checkbox"] { width: 20px; height: 20px; margin: 0; accent-color: var(--accent); flex: 0 0 auto; }
fieldset { margin: 0; border: 0; padding: 0; min-width: 0; }
legend { padding: 0; font-weight: 650; margin-bottom: .35rem; }
label { display: block; font-weight: 600; }
.container { width: min(1080px, calc(100% - 32px)); margin-inline: auto; }
.site-header { border-bottom: 1px solid var(--border); background: var(--surface); }
.header-inner { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: .5rem 1rem; min-height: 72px; padding-block: .5rem; }
.brand { display: inline-flex; align-items: center; min-height: 44px; color: var(--text); text-decoration: none; font-weight: 750; letter-spacing: -.03em; }
.tool-nav { display: flex; flex-wrap: wrap; gap: .35rem; min-width: 0; }
.tool-nav a { display: inline-flex; align-items: center; min-height: 44px; padding: .4rem .65rem; text-decoration: none; border-radius: 5px; font-weight: 600; }
.tool-nav a[aria-current="page"] { color: var(--text); background: var(--inset); }
.skip-link { position: absolute; left: 1rem; top: -100px; z-index: 10; padding: .6rem 1rem; background: var(--surface); }
.skip-link:focus { top: 1rem; }
main { padding-block: 2.25rem 3rem; }
.breadcrumbs { color: var(--muted); margin-bottom: 1rem; }
.breadcrumbs ol { display: flex; flex-wrap: wrap; gap: .5rem; list-style: none; margin: 0; padding: 0; }
.breadcrumbs li { display: inline-flex; align-items: center; gap: .5rem; }
.breadcrumbs li + li::before { content: '/'; }
.breadcrumbs a { display: inline-flex; align-items: center; min-height: 44px; }
h1, h2, h3 { line-height: 1.2; letter-spacing: -.025em; }
h1 { font-size: clamp(1.8rem, 4vw, 2.5rem); margin: 0 0 .65rem; }
h2 { font-size: 1.4rem; margin: 0 0 1rem; }
h3 { font-size: 1.1rem; margin: 0 0 .55rem; }
p { margin: 0 0 1rem; }
.intro { max-width: 72ch; color: var(--muted); }
.eyebrow { color: var(--accent); font-weight: 700; font-size: .8rem; letter-spacing: .12em; text-transform: uppercase; margin-bottom: .5rem; }
.tool { margin-top: 1.5rem; background: var(--surface); border: 1px solid var(--border); border-radius: 10px; overflow: hidden; }
.tool-grid { display: grid; min-width: 0; }
.controls, .results { padding: 1.25rem; min-width: 0; }
.controls { display: grid; align-content: start; gap: .9rem; }
.results { border-top: 1px solid var(--border); }
.field-grid { display: grid; grid-template-columns: 1fr 1fr; gap: .8rem; min-width: 0; }
.field-grid > *, .section-grid > * { min-width: 0; }
.field-grid label { margin-bottom: .3rem; }
.check { display: flex; gap: .65rem; align-items: center; min-height: 44px; font-weight: 400; }
.hint, .muted { color: var(--muted); }
.hint { font-size: .875rem; margin: 0; }
.status { min-height: 1.6em; font-size: .9rem; color: var(--muted); margin: 0; overflow-wrap: anywhere; }
.status[data-state="error"] { color: var(--danger); }
.status[data-state="success"] { color: var(--success); }
.results-heading { display: flex; align-items: center; justify-content: space-between; gap: .75rem; margin-bottom: .75rem; }
.results-heading h2 { margin: 0; font-size: 1.1rem; }
.toolbar { display: flex; flex-wrap: wrap; gap: .6rem; margin-top: .9rem; }
.uuid-list { list-style: none; padding: 0; margin: 0; max-height: 360px; overflow: auto; scrollbar-gutter: stable; }
.uuid-row { display: flex; gap: .6rem; align-items: center; padding-block: .55rem; border-bottom: 1px solid var(--border); }
.uuid-row:last-child { border-bottom: 0; }
.uuid-value { font-family: var(--mono); font-size: .94rem; line-height: 1.6; overflow-wrap: anywhere; min-width: 0; flex: 1; user-select: all; }
.uuid-row button { flex: 0 0 auto; padding-inline: .7rem; }
.section { margin-top: 2.5rem; }
.section-grid { display: grid; gap: 1.5rem; }
.validator { background: var(--surface); border: 1px solid var(--border); border-radius: 10px; padding: 1.25rem; }
.validator label { margin-bottom: .4rem; }
.mono { font-family: var(--mono); overflow-wrap: anywhere; }
.parse-result { margin-top: 1rem; min-height: 1.6em; overflow-wrap: anywhere; }
.parse-result dl { display: grid; grid-template-columns: auto minmax(0, 1fr); gap: .35rem 1rem; margin-bottom: 0; }
dt { color: var(--muted); }
dd { margin: 0; min-width: 0; overflow-wrap: anywhere; }
.version-guide { margin-top: 1.5rem; display: grid; gap: 1.25rem; }
.version-guide p { color: var(--muted); margin: 0; }
.faq details { border-bottom: 1px solid var(--border); padding-block: .65rem; }
.faq summary { min-height: 44px; display: list-item; align-content: center; cursor: pointer; font-weight: 650; padding-block: .5rem; }
.faq details p { color: var(--muted); margin: .5rem 0 .65rem; }
.site-footer { border-top: 1px solid var(--border); padding-block: 1.4rem; color: var(--muted); font-size: .9rem; }
.footer-inner { display: flex; justify-content: space-between; flex-wrap: wrap; gap: .6rem 1rem; }
.site-footer p { margin: 0; }
.no-script { border-left: 3px solid var(--focus); padding: .75rem 1rem; background: var(--inset); margin-top: 1rem; }
.tool-directory { display: grid; grid-template-columns: repeat(auto-fit, minmax(min(100%, 300px), 1fr)); gap: 1.5rem; }
.directory-entry { min-width: 0; background: var(--surface); border: 1px solid var(--border); border-radius: 10px; padding: 1.5rem; }
.directory-entry p { color: var(--muted); }
.directory-entry h3 a, .open-tool { display: inline-flex; align-items: center; min-height: 44px; gap: .5rem; }
.other-tools { margin-bottom: 1.5rem; }
.other-tools h2 { font-size: 1.1rem; margin-bottom: .5rem; }
.other-tools ul { list-style: none; padding: 0; margin: 0; }
.other-tools li { display: flex; flex-wrap: wrap; align-items: center; gap: .25rem 1rem; }
.other-tools a { display: inline-flex; align-items: center; min-height: 44px; }
.other-tools span { overflow-wrap: anywhere; }
@media (min-width: 900px) {
  .tool-grid { grid-template-columns: minmax(270px, .8fr) minmax(0, 1.6fr); }
  .results { border-top: 0; border-left: 1px solid var(--border); }
  .controls, .results { padding: 1.5rem; }
  .section-grid { grid-template-columns: 1fr 1fr; align-items: start; gap: 2.5rem; }
  .version-guide { grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 2rem; }
}
@media (max-width: 420px) {
  .header-inner { gap: .25rem; min-height: 64px; }
  .brand { font-size: .9rem; }
  .tool-nav { gap: 0; }
  .tool-nav a { padding-inline: .45rem; }
  main { padding-top: 1.5rem; }
  .controls, .results, .validator { padding: 1rem; }
}
@media (prefers-reduced-motion: reduce) { *, *::before, *::after { scroll-behavior: auto !important; transition: none !important; animation: none !important; } }
`;
