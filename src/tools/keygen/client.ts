import { createKeygenTools, type KeyFormat, type KeyOptions, type KeyResult, type KeygenTools } from './keygen';

/** All runtime dependencies stay inside this function for browser serialization. */
export function initializeKeygenPage(tools: KeygenTools): void {
  const form = document.querySelector<HTMLFormElement>('#keygen-form')!;
  const algorithm = document.querySelector<HTMLSelectElement>('#keygen-algorithm')!;
  const curve = document.querySelector<HTMLSelectElement>('#keygen-curve')!;
  const size = document.querySelector<HTMLSelectElement>('#keygen-size')!;
  const purpose = document.querySelector<HTMLSelectElement>('#keygen-purpose')!;
  const format = document.querySelector<HTMLSelectElement>('#keygen-format')!;
  const curveField = document.querySelector<HTMLElement>('#keygen-curve-field')!;
  const rsaField = document.querySelector<HTMLElement>('#keygen-rsa-field')!;
  const generate = document.querySelector<HTMLButtonElement>('#keygen-generate')!;
  const clear = document.querySelector<HTMLButtonElement>('#keygen-clear')!;
  const status = document.querySelector<HTMLElement>('#keygen-status')!;
  const fingerprint = document.querySelector<HTMLElement>('#keygen-fingerprint')!;
  const fingerprintLabel = document.querySelector<HTMLElement>('#keygen-fingerprint-label')!;
  const privateLabel = document.querySelector<HTMLElement>('#keygen-private-label')!;
  const formatHint = document.querySelector<HTMLElement>('#keygen-format-hint')!;
  const publicOutput = document.querySelector<HTMLTextAreaElement>('#keygen-public')!;
  const privateOutput = document.querySelector<HTMLTextAreaElement>('#keygen-private')!;
  const publicCopy = document.querySelector<HTMLButtonElement>('#keygen-copy-public')!;
  const privateCopy = document.querySelector<HTMLButtonElement>('#keygen-copy-private')!;
  const publicDownload = document.querySelector<HTMLButtonElement>('#keygen-download-public')!;
  const privateDownload = document.querySelector<HTMLButtonElement>('#keygen-download-private')!;
  let result: KeyResult | null = null;
  let revision = 0;
  let displayRevision = 0;
  let pending = false;

  function message(text: string, state = ''): void { status.textContent = text; status.dataset.state = state; }
  function show(): void {
    displayRevision++;
    const exported = result?.formats[format.value as KeyFormat];
    publicOutput.value = exported?.publicKey ?? '';
    privateOutput.value = exported?.privateKey ?? '';
    privateLabel.textContent = exported?.privateLabel ?? 'Private key';
    fingerprint.textContent = result?.fingerprint ?? 'No key pair yet';
    fingerprintLabel.textContent = result?.fingerprintLabel ?? 'Public key fingerprint';
    [publicCopy, privateCopy, publicDownload, privateDownload].forEach((button) => { button.disabled = !exported; });
    formatHint.textContent = format.value === 'openssh' ? 'OpenSSH public key; private key stays PKCS#8 PEM. OpenSSH private keys are not exported.'
      : ['hex', 'base64'].includes(format.value) ? 'Ed25519 raw public key and 32-byte private seed; not a 64-byte expanded secret key.'
      : format.value === 'pem' ? 'SPKI public key and unencrypted PKCS#8 private key.' : 'Public and private JSON Web Keys include the selected Web Crypto key operations.';
  }
  function update(): void {
    revision++;
    pending = false;
    result = null;
    curveField.hidden = curve.disabled = algorithm.value !== 'ECDSA';
    rsaField.hidden = size.disabled = purpose.disabled = algorithm.value !== 'RSA';
    for (const option of Array.from(format.options)) {
      option.disabled = option.value === 'openssh' ? algorithm.value === 'X25519'
        : ['hex', 'base64'].includes(option.value) && algorithm.value !== 'Ed25519';
    }
    if (format.selectedOptions[0].disabled) format.value = 'pem';
    generate.disabled = false;
    form.setAttribute('aria-busy', 'false');
    show();
    message('Ready. Generate a fresh key pair locally.');
  }
  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    if (pending) return;
    const ticket = ++revision;
    const options: KeyOptions = { algorithm: algorithm.value as KeyOptions['algorithm'], curve: curve.value as KeyOptions['curve'],
      modulusLength: Number(size.value) as KeyOptions['modulusLength'], purpose: purpose.value as KeyOptions['purpose'] };
    pending = true;
    result = null;
    show();
    generate.disabled = true;
    form.setAttribute('aria-busy', 'true');
    message('Generating locally… RSA may take a few seconds.');
    try {
      const computed = await tools.generate(options);
      if (ticket !== revision) return;
      result = computed;
      show();
      message('Key pair generated locally. Keep the private key secret.', 'success');
    } catch (error) {
      if (ticket !== revision) return;
      message(error instanceof Error ? error.message : 'Key generation failed. Try a current browser.', 'error');
    } finally {
      if (ticket === revision) {
        pending = false;
        generate.disabled = false;
        form.setAttribute('aria-busy', 'false');
      }
    }
  });
  [algorithm, curve, size, purpose].forEach((control) => control.addEventListener('change', update));
  format.addEventListener('change', () => {
    show();
    if (!pending) message(result ? 'Export format changed. The key pair is unchanged.' : 'Ready. Generate a fresh key pair locally.');
  });
  clear.addEventListener('click', () => { update(); message('Key pair cleared from this page.'); algorithm.focus(); });
  function copy(button: HTMLButtonElement, isPrivate: boolean): void {
    button.addEventListener('click', async () => {
      const exported = result?.formats[format.value as KeyFormat];
      if (!exported) return;
      const ticket = displayRevision;
      try {
        await navigator.clipboard.writeText(isPrivate ? exported.privateKey : exported.publicKey);
        if (ticket === displayRevision) message(isPrivate ? 'Private key copied. Your clipboard now contains secret key material.' : 'Public key copied.', 'success');
      } catch {
        if (ticket === displayRevision) message('Clipboard access was denied. Select the key to copy it manually, or download it.', 'error');
      }
    });
  }
  function download(button: HTMLButtonElement, isPrivate: boolean): void {
    button.addEventListener('click', () => {
      const exported = result?.formats[format.value as KeyFormat];
      if (!exported) return;
      const filename = isPrivate ? exported.privateFilename : exported.publicFilename;
      try {
        const blob = new Blob([isPrivate ? exported.privateKey : exported.publicKey], { type: 'text/plain;charset=utf-8' });
        const url = URL.createObjectURL(blob);
        try {
          const link = document.createElement('a');
          link.href = url; link.download = filename;
          document.body.append(link); link.click(); link.remove();
        } finally { setTimeout(() => URL.revokeObjectURL(url), 1000); }
        message(`${isPrivate ? 'Private' : 'Public'} key download requested: ${filename}.`, 'success');
      } catch { message('Download failed. Copy the key or try another browser.', 'error'); }
    });
  }
  copy(publicCopy, false); copy(privateCopy, true);
  download(publicDownload, false); download(privateDownload, true);
  // Remove page-held exports on departure, including when restored from bfcache.
  window.addEventListener('pagehide', () => { update(); });
  clear.disabled = false;
  update();
}

export function clientScript(): string {
  return `(${initializeKeygenPage.toString()})((${createKeygenTools.toString()})());`;
}
