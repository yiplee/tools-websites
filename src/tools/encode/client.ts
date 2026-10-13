import { createEncodeTools, type EncodeOperation, type EncodeResult, type EncodeTools } from './encode';

/** Runtime dependencies stay inside this function for inline browser serialization. */
export function initializeEncodePage(tools: EncodeTools): void {
  const form = document.querySelector<HTMLFormElement>('#encode-form')!;
  const operation = document.querySelector<HTMLSelectElement>('#operation')!;
  const source = document.querySelector<HTMLSelectElement>('#input-source')!;
  const input = document.querySelector<HTMLTextAreaElement>('#encode-input')!;
  const file = document.querySelector<HTMLInputElement>('#encode-file')!;
  const textField = document.querySelector<HTMLElement>('#text-field')!;
  const fileField = document.querySelector<HTMLElement>('#file-field')!;
  const alphabetField = document.querySelector<HTMLElement>('#alphabet-field')!;
  const alphabet = document.querySelector<HTMLSelectElement>('#base64-alphabet')!;
  const hint = document.querySelector<HTMLElement>('#input-hint')!;
  const action = document.querySelector<HTMLButtonElement>('#convert')!;
  const output = document.querySelector<HTMLTextAreaElement>('#encode-output')!;
  const summary = document.querySelector<HTMLElement>('#result-summary')!;
  const status = document.querySelector<HTMLElement>('#encode-status')!;
  const copy = document.querySelector<HTMLButtonElement>('#copy-result')!;
  const download = document.querySelector<HTMLButtonElement>('#download-result')!;
  const maxBytes = 10 * 1024 * 1024;
  let result: EncodeResult | null = null;
  let revision = 0;

  function message(text: string, state = ''): void {
    status.textContent = text;
    status.dataset.state = state;
  }

  function clearResult(): void {
    result = null;
    output.value = '';
    output.placeholder = 'Your result will appear here';
    summary.textContent = 'No result yet';
    copy.disabled = download.disabled = true;
  }

  function update(): void {
    // An edit invalidates pending file reads, hashes, and clipboard feedback.
    revision++;
    clearResult();
    action.disabled = false;
    form.setAttribute('aria-busy', 'false');
    input.removeAttribute('aria-invalid');
    file.removeAttribute('aria-invalid');
    const isFile = source.value === 'file';
    const isBase64 = operation.value.startsWith('base64-');
    const isDecode = operation.value.endsWith('-decode');
    textField.hidden = input.disabled = isFile;
    fileField.hidden = file.disabled = !isFile;
    alphabetField.hidden = alphabet.disabled = !isBase64;
    action.textContent = isDecode ? 'Decode input' : operation.value.endsWith('-encode') ? 'Encode input' : 'Compute hash';
    hint.textContent = isDecode
      ? `Enter ${isBase64 ? 'Base64' : 'hex'} text, or select a UTF-8 file containing it. Spaces, tabs and line breaks are ignored.`
      : 'Text uses UTF-8; files use their original bytes. Whitespace and line endings are preserved.';
    message('Ready. Inputs up to 10 MiB stay in this browser.');
  }

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    const ticket = ++revision;
    const selectedOperation = operation.value as EncodeOperation;
    const urlSafe = alphabet.value === 'url-safe';
    const isFile = source.value === 'file';
    const selectedFile = file.files?.[0];
    const selectedText = input.value;
    clearResult();
    action.disabled = true;
    form.setAttribute('aria-busy', 'true');
    input.removeAttribute('aria-invalid');
    file.removeAttribute('aria-invalid');
    message('Processing locally…');
    try {
      // Allow the pending state to render before synchronous encoding or MD5 work.
      await new Promise<void>((resolve) => setTimeout(resolve, 0));
      let bytes: Uint8Array;
      if (isFile) {
        if (!selectedFile) throw new Error('Select a local file first.');
        if (selectedFile.size > maxBytes) throw new Error('File exceeds 10 MiB. Choose a smaller file.');
        try { bytes = new Uint8Array(await selectedFile.arrayBuffer()); }
        catch { throw new Error('The local file could not be read. Select the file again.'); }
      } else {
        if (selectedText.length > maxBytes) throw new Error('Input exceeds 10 MiB. Use a smaller input.');
        bytes = tools.encodeUtf8(selectedText);
      }
      if (bytes.byteLength > maxBytes) throw new Error('Input exceeds 10 MiB in UTF-8. Use a smaller input.');
      if (ticket !== revision) return;
      const computed = await tools.run(bytes, selectedOperation, urlSafe);
      if (ticket !== revision) return;
      result = computed;
      output.value = computed.text ?? '';
      summary.textContent = `${bytes.byteLength.toLocaleString()} input bytes → ${computed.bytes.byteLength.toLocaleString()} output bytes`;
      download.disabled = false;
      copy.disabled = computed.text === null;
      if (computed.text === null) {
        output.placeholder = 'Binary result: download to preserve the exact bytes.';
        message('Decoded successfully. The result is not valid UTF-8 text; download the original bytes.', 'success');
      } else {
        message('Done. Copy the result or download it. Nothing was uploaded.', 'success');
      }
    } catch (error) {
      if (ticket !== revision) return;
      (isFile ? file : input).setAttribute('aria-invalid', 'true');
      message(error instanceof Error ? error.message : 'Conversion failed. Check your input and try again.', 'error');
    } finally {
      if (ticket === revision) {
        action.disabled = false;
        form.setAttribute('aria-busy', 'false');
      }
    }
  });

  copy.addEventListener('click', async () => {
    if (!result || result.text === null) return;
    const ticket = revision;
    try {
      await navigator.clipboard.writeText(result.text);
      if (ticket === revision) message('Copied the result.', 'success');
    } catch {
      if (ticket === revision) message('Clipboard access was denied. Select the result to copy it, or download it.', 'error');
    }
  });

  download.addEventListener('click', () => {
    if (!result) return;
    const blob = new Blob([new Uint8Array(result.bytes).buffer], { type: result.text === null ? 'application/octet-stream' : 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = result.filename;
    document.body.append(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    message(`Downloaded ${result.filename}.`, 'success');
  });

  [operation, source, alphabet, file].forEach((control) => control.addEventListener('change', update));
  input.addEventListener('input', update);
  update();
}

export function clientScript(): string {
  return `(${initializeEncodePage.toString()})((${createEncodeTools.toString()})());`;
}
