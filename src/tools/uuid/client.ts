import { createUuidTools, type UuidTools, type UuidVersion } from './uuid';

/** Also self-contained: compiled function source is embedded in the SSR page. */
export function initializeUuidPage(tools: UuidTools): void {
  const form = document.querySelector<HTMLFormElement>('#generator')!;
  const version = document.querySelector<HTMLSelectElement>('#version')!;
  const count = document.querySelector<HTMLInputElement>('#count')!;
  const uppercase = document.querySelector<HTMLInputElement>('#uppercase')!;
  const noHyphens = document.querySelector<HTMLInputElement>('#no-hyphens')!;
  const braces = document.querySelector<HTMLInputElement>('#braces')!;
  const output = document.querySelector<HTMLOListElement>('#uuid-output')!;
  const status = document.querySelector<HTMLParagraphElement>('#generation-status')!;
  const total = document.querySelector<HTMLElement>('#output-count')!;
  const copyAll = document.querySelector<HTMLButtonElement>('#copy-all')!;
  const download = document.querySelector<HTMLButtonElement>('#download')!;
  const validator = document.querySelector<HTMLFormElement>('#validator')!;
  const validationInput = document.querySelector<HTMLTextAreaElement>('#validate-input')!;
  const validationOutput = document.querySelector<HTMLElement>('#parse-result')!;
  let rawValues: string[] = [];
  let values: string[] = [];

  function message(text: string, state = 'success'): void {
    status.textContent = text;
    status.dataset.state = state;
  }

  function render(): void {
    values = rawValues.map((value) => tools.format(value, { uppercase: uppercase.checked, hyphens: !noHyphens.checked, braces: braces.checked }));
    const fragment = document.createDocumentFragment();
    values.forEach((value, index) => {
      const row = document.createElement('li');
      row.className = 'uuid-row';
      const code = document.createElement('code');
      code.className = 'uuid-value';
      code.textContent = value;
      const button = document.createElement('button');
      button.type = 'button';
      button.textContent = 'Copy';
      button.dataset.index = String(index);
      button.setAttribute('aria-label', `Copy UUID ${index + 1}`);
      row.append(code, button);
      fragment.append(row);
    });
    output.replaceChildren(fragment);
    total.textContent = `${values.length} UUID${values.length === 1 ? '' : 's'}`;
    copyAll.disabled = download.disabled = values.length === 0;
  }

  function generate(): void {
    try {
      rawValues = tools.generateMany(Number(version.value) as UuidVersion, count.valueAsNumber);
      render();
      output.scrollTop = 0;
      count.removeAttribute('aria-invalid');
      message(`Generated ${values.length} UUID${values.length === 1 ? '' : 's'} (v${version.value}) locally.`);
    } catch (error) {
      count.setAttribute('aria-invalid', 'true');
      message(error instanceof Error ? error.message : 'Generation failed. Web Crypto support is required.', 'error');
    }
  }

  async function copy(text: string, success: string): Promise<void> {
    try {
      await navigator.clipboard.writeText(text);
      message(success);
    } catch {
      message('Clipboard access was denied. Select the UUID text to copy it, or download the text file.', 'error');
    }
  }

  form.addEventListener('submit', (event) => { event.preventDefault(); generate(); });
  form.addEventListener('invalid', () => {
    count.setAttribute('aria-invalid', 'true');
    message('Count must be a whole number from 1 to 1000.', 'error');
  }, true);
  [uppercase, noHyphens, braces].forEach((control) => control.addEventListener('change', () => {
    render();
    message('Formatting updated. UUID values are unchanged.');
  }));
  output.addEventListener('click', (event) => {
    const button = (event.target as Element).closest<HTMLButtonElement>('button[data-index]');
    if (!button) return;
    const index = Number(button.dataset.index);
    void copy(values[index], `Copied UUID ${index + 1}.`);
  });
  copyAll.addEventListener('click', () => { void copy(values.join('\n'), `Copied all ${values.length} UUIDs.`); });
  download.addEventListener('click', () => {
    const blob = new Blob([values.join('\n') + '\n'], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'uuids.txt';
    document.body.append(link);
    link.click();
    link.remove();
    // Give the browser time to begin consuming the blob before revoking it.
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    message(`Downloaded ${values.length} UUIDs as uuids.txt.`);
  });

  function validate(): void {
    const result = tools.parse(validationInput.value);
    validationOutput.replaceChildren();
    validationInput.setAttribute('aria-invalid', String(!result.valid));
    const heading = document.createElement('p');
    heading.textContent = result.valid ? `Valid ${result.kind === 'uuid' ? 'UUID' : result.kind + ' UUID'}.` : `Invalid UUID. ${result.error}`;
    validationOutput.append(heading);
    if (!result.canonical) return;
    const details = document.createElement('dl');
    const fields: [string, string][] = [
      ['Canonical', result.canonical],
      ['Version', result.version === null ? 'Not applicable' : String(result.version)],
      ['Variant', result.variant!],
    ];
    if (result.timestamp) fields.push(['Timestamp (UTC)', result.timestamp]);
    fields.forEach(([name, value]) => {
      const term = document.createElement('dt');
      term.textContent = name;
      const definition = document.createElement('dd');
      definition.className = 'mono';
      definition.textContent = value;
      details.append(term, definition);
    });
    validationOutput.append(details);
  }

  validator.addEventListener('submit', (event) => { event.preventDefault(); validate(); });
  // These protections also prevent native form navigation before JS initialization.
  document.querySelector<HTMLButtonElement>('#generate')!.disabled = false;
  document.querySelector<HTMLButtonElement>('#validate')!.disabled = false;
  generate();
}

export function clientScript(): string {
  return `(${initializeUuidPage.toString()})((${createUuidTools.toString()})());`;
}
