import { createJwtTools, type DecodedJwt, type JwtAlgorithm, type JwtTools } from './jwt';

/** Runtime dependencies stay inside this function for inline browser serialization. */
export function initializeJwtPage(tools: JwtTools): void {
  const form = document.querySelector<HTMLFormElement>('#jwt-form')!;
  const input = document.querySelector<HTMLTextAreaElement>('#jwt-input')!;
  const algorithm = document.querySelector<HTMLSelectElement>('#jwt-algorithm')!;
  const key = document.querySelector<HTMLTextAreaElement>('#jwt-key')!;
  const keyLabel = document.querySelector<HTMLElement>('#jwt-key-label')!;
  const keyHint = document.querySelector<HTMLElement>('#jwt-key-hint')!;
  const decodeStatus = document.querySelector<HTMLElement>('#jwt-decode-status')!;
  const verifyStatus = document.querySelector<HTMLElement>('#jwt-verify-status')!;
  const timeStatus = document.querySelector<HTMLElement>('#jwt-time-status')!;
  const times = document.querySelector<HTMLElement>('#jwt-times')!;
  const header = document.querySelector<HTMLElement>('#jwt-header')!;
  const payload = document.querySelector<HTMLElement>('#jwt-payload')!;
  const verify = document.querySelector<HTMLButtonElement>('#jwt-verify')!;
  const clear = document.querySelector<HTMLButtonElement>('#jwt-clear')!;
  const copy = document.querySelector<HTMLButtonElement>('#jwt-copy')!;
  const copyStatus = document.querySelector<HTMLElement>('#jwt-copy-status')!;
  let decoded: DecodedJwt | null = null;
  let revision = 0;
  let pending = false;

  function message(element: HTMLElement, text: string, state = ''): void {
    element.textContent = text;
    element.dataset.state = state;
  }

  function showTimes(): void {
    times.replaceChildren();
    if (!decoded) {
      message(timeStatus, 'No time claims yet');
      return;
    }
    const result = tools.inspectTimes(decoded.payload);
    message(timeStatus, result.invalid ? 'Invalid time claim: expected numeric Unix seconds.'
      : [result.expired ? 'Expired' : '', result.notYetValid ? 'Not yet valid' : ''].filter(Boolean).join(' · ')
      || 'Within the stated exp/nbf window. Missing claims impose no time limit.',
    result.invalid || result.expired || result.notYetValid ? 'error' : '');
    result.claims.forEach((claim) => {
      const term = document.createElement('dt');
      const detail = document.createElement('dd');
      term.textContent = claim.name;
      detail.textContent = claim.status === 'missing' ? 'Not present'
        : claim.status === 'invalid' ? 'Invalid NumericDate'
        : `${claim.time} · ${claim.status.replace(/-/g, ' ')} (${claim.value} seconds)`;
      times.append(term, detail);
    });
  }

  function update(): void {
    revision++;
    pending = false;
    decoded = null;
    header.textContent = 'No header yet';
    payload.textContent = 'No payload yet';
    copy.disabled = true;
    message(copyStatus, '');
    message(verifyStatus, 'Signature not verified. Decoded claims are untrusted.');
    const hmac = algorithm.value.startsWith('HS');
    keyLabel.textContent = hmac ? 'Shared secret (UTF-8)' : 'Public key (PEM or JWK)';
    keyHint.textContent = hmac ? 'Use the exact secret; no Base64 decoding.'
      : 'SPKI PEM or public JWK. Use a trusted key.';
    key.placeholder = hmac ? 'Enter the shared secret' : '-----BEGIN PUBLIC KEY----- or { "kty": … }';
    if (!input.value.trim()) message(decodeStatus, 'Paste a JWT to decode it locally.');
    else {
      try {
        decoded = tools.decode(input.value);
        header.textContent = JSON.stringify(decoded.header, null, 2);
        payload.textContent = JSON.stringify(decoded.payload, null, 2);
        copy.disabled = false;
        const alg = decoded.header.alg;
        const extensions = Object.prototype.hasOwnProperty.call(decoded.header, 'crit') || decoded.header.b64 === false;
        message(decodeStatus, alg === 'none' ? 'Decoded · alg none is unsigned and cannot be verified.'
          : !tools.algorithms.includes(alg as JwtAlgorithm) ? `Decoded · unsupported algorithm: ${alg}.`
          : extensions ? 'Decoded · unsupported critical or unencoded payload extension.'
          : `Decoded · ${alg}. Claims are untrusted.`,
        alg === 'none' || extensions || !tools.algorithms.includes(alg as JwtAlgorithm) ? 'error' : '');
      } catch (error) {
        message(decodeStatus, error instanceof Error ? error.message : 'Cannot decode this JWT.', 'error');
      }
    }
    verify.disabled = !decoded || !key.value || decoded.header.alg === 'none'
      || !tools.algorithms.includes(decoded.header.alg as JwtAlgorithm);
    showTimes();
  }

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    if (pending || !decoded) return;
    const current = ++revision;
    pending = true;
    verify.disabled = true;
    message(verifyStatus, 'Verifying signature locally…');
    try {
      const valid = await tools.verify(input.value, key.value, algorithm.value as JwtAlgorithm);
      if (current !== revision) return;
      message(verifyStatus, valid ? 'Signature matches the supplied key. Check time claims, issuer and audience separately.'
        : 'Signature does not match the supplied key.', valid ? 'success' : 'error');
    } catch (error) {
      if (current !== revision) return;
      message(verifyStatus, error instanceof Error ? error.message : 'Cannot verify this signature.', 'error');
    } finally {
      if (current === revision) { pending = false; verify.disabled = false; showTimes(); }
    }
  });
  input.addEventListener('input', update);
  key.addEventListener('input', update);
  algorithm.addEventListener('change', () => { key.value = ''; update(); });
  clear.addEventListener('click', () => { input.value = ''; key.value = ''; update(); input.focus(); });
  copy.addEventListener('click', async () => {
    if (!decoded) return;
    const current = revision;
    const text = JSON.stringify({ header: decoded.header, payload: decoded.payload }, null, 2);
    try {
      await navigator.clipboard.writeText(text);
      if (current === revision) message(copyStatus, 'Copied decoded JSON.', 'success');
    } catch {
      if (current === revision) message(copyStatus, 'Clipboard access was denied. Select the decoded JSON and copy it manually.', 'error');
    }
  });
  // Re-evaluate exp/nbf as the local clock advances, without retaining data outside the page.
  setInterval(() => { if (decoded) showTimes(); }, 1000);
  clear.disabled = false;
  update();
}

export function clientScript(): string {
  return `(${initializeJwtPage.toString()})((${createJwtTools.toString()})());`;
}
