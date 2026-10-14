import { afterEach, describe, expect, it, vi } from 'vitest';
import { clientScript, initializeKeygenPage } from '../src/tools/keygen/client';
import { createKeygenTools, type KeygenTools, type KeyResult } from '../src/tools/keygen/keygen';

/** Minimal DOM fixture, following the Encode/JWT client-state tests. */
class Control {
  value = '';
  textContent = '';
  disabled = true;
  hidden = false;
  dataset: Record<string, string> = {};
  attributes = new Map<string, string>();
  options: { value: string; disabled: boolean }[] = [];
  get selectedOptions() { return this.options.filter((option) => option.value === this.value); }
  listeners = new Map<string, ((event: Event) => unknown)[]>();
  setAttribute(name: string, value: string) { this.attributes.set(name, value); }
  focus = vi.fn();
  addEventListener(type: string, listener: (event: Event) => unknown) {
    this.listeners.set(type, [...(this.listeners.get(type) ?? []), listener]);
  }
  async emit(type: string) {
    await Promise.all((this.listeners.get(type) ?? []).map((listener) => listener(new Event(type, { cancelable: true }))));
  }
}
function setup(tools: KeygenTools = createKeygenTools(), serialized = false) {
  const ids = ['form', 'algorithm', 'curve', 'size', 'purpose', 'format', 'curve-field', 'rsa-field', 'generate', 'clear', 'status', 'fingerprint', 'fingerprint-label', 'private-label', 'format-hint', 'public', 'private', 'copy-public', 'copy-private', 'download-public', 'download-private'];
  const c = Object.fromEntries(ids.map((id) => [id, new Control()]));
  c.algorithm.value = 'Ed25519'; c.curve.value = 'P-256'; c.size.value = '2048'; c.purpose.value = 'RSA-PSS'; c.format.value = 'pem';
  c.format.options = ['pem', 'jwk', 'openssh', 'hex', 'base64'].map((value) => ({ value, disabled: false }));
  const anchor = { href: '', download: '', click: vi.fn(), remove: vi.fn() };
  const clipboard = vi.fn().mockResolvedValue(undefined);
  const createUrl = vi.fn((_blob: Blob | MediaSource) => 'blob:local-key');
  const revokeUrl = vi.fn();
  const delayed: (() => void)[] = [];
  const windowControl = new Control();
  vi.stubGlobal('document', { querySelector: (selector: string) => c[selector.slice('#keygen-'.length)], createElement: () => anchor, body: { append: vi.fn() } });
  vi.stubGlobal('window', windowControl);
  vi.stubGlobal('navigator', { clipboard: { writeText: clipboard } });
  vi.stubGlobal('setTimeout', (callback: () => void) => { delayed.push(callback); return 1; });
  vi.spyOn(URL, 'createObjectURL').mockImplementation(createUrl);
  vi.spyOn(URL, 'revokeObjectURL').mockImplementation(revokeUrl);
  if (serialized) new Function(clientScript())();
  else initializeKeygenPage(tools);
  return { c, clipboard, anchor, createUrl, revokeUrl, delayed, windowControl };
}
function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}
const result: KeyResult = { fingerprint: 'SHA256:public-only', fingerprintLabel: 'OpenSSH SHA-256', formats: {
  pem: { publicKey: 'PUBLIC\n', privateKey: 'PRIVATE\n', publicFilename: 'key-public.pem', privateFilename: 'key-private.pem', privateLabel: 'Private key · PKCS#8 PEM' },
  jwk: { publicKey: '{"x":"public"}\n', privateKey: '{"d":"secret"}\n', publicFilename: 'key-public.jwk', privateFilename: 'key-private.jwk', privateLabel: 'Private key · JWK' },
} };
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });

describe('Key Generator browser interactions', () => {
  it('executes serialized browser functions, generates only on demand and copies each key separately', async () => {
    const generated = vi.spyOn(crypto.subtle, 'generateKey');
    const { c, clipboard, createUrl } = setup(undefined, true);
    expect(generated).not.toHaveBeenCalled();
    expect(clipboard).not.toHaveBeenCalled(); expect(createUrl).not.toHaveBeenCalled();
    expect(c.generate.disabled).toBe(false);
    expect(c['copy-private'].disabled).toBe(true);
    await c.form.emit('submit');
    expect(c.status.dataset.state).toBe('success');
    expect(c.public.value).toMatch(/^-----BEGIN PUBLIC KEY-----/);
    expect(c.private.value).toMatch(/^-----BEGIN PRIVATE KEY-----/);
    expect(c.fingerprint.textContent).toMatch(/^SHA256:/);
    expect(generated).toHaveBeenCalledTimes(1);
    expect(clipboard).not.toHaveBeenCalled(); expect(createUrl).not.toHaveBeenCalled();
    await c['copy-public'].emit('click'); expect(clipboard).toHaveBeenLastCalledWith(c.public.value);
    await c['copy-private'].emit('click'); expect(clipboard).toHaveBeenLastCalledWith(c.private.value);
    expect(c.status.textContent).toContain('secret key material');
    const originalFingerprint = c.fingerprint.textContent;
    c.format.value = 'hex'; await c.format.emit('change');
    expect(c.private.value.trim()).toMatch(/^[a-f0-9]{64}$/);
    expect(c['private-label'].textContent).toContain('seed');
    expect(c.fingerprint.textContent).toBe(originalFingerprint);
    expect(generated).toHaveBeenCalledTimes(1);
  });
  it('downloads separate byte-exact files and revokes object URLs after use', async () => {
    const { c, createUrl, anchor, delayed, revokeUrl } = setup({ generate: async () => result });
    await c['download-private'].emit('click'); expect(createUrl).not.toHaveBeenCalled();
    await c.form.emit('submit');
    for (const side of ['public', 'private'] as const) {
      await c[`download-${side}`].emit('click');
      expect(anchor.download).toBe(`key-${side}.pem`);
      const blob = createUrl.mock.calls.at(-1)![0] as Blob;
      expect(await blob.text()).toBe(side === 'public' ? 'PUBLIC\n' : 'PRIVATE\n');
    }
    expect(anchor.click).toHaveBeenCalledTimes(2); expect(anchor.remove).toHaveBeenCalledTimes(2);
    expect(revokeUrl).not.toHaveBeenCalled(); delayed.forEach((callback) => callback());
    expect(revokeUrl).toHaveBeenCalledTimes(2);
    c.format.value = 'jwk'; await c.format.emit('change');
    await c['download-private'].emit('click'); expect(anchor.download).toBe('key-private.jwk');
    expect(await (createUrl.mock.calls.at(-1)![0] as Blob).text()).toBe(result.formats.jwk!.privateKey);
    createUrl.mockImplementation(() => { throw new Error('denied'); });
    await c['download-private'].emit('click'); expect(c.status.textContent).toContain('Download failed');
  });
  it.each(['algorithm', 'curve', 'size', 'purpose', 'clear'])('clears both keys and actions on %s changes', async (control) => {
    const { c, clipboard, createUrl } = setup({ generate: async () => result });
    await c.form.emit('submit');
    await c[control].emit(control === 'clear' ? 'click' : 'change');
    expect(c.public.value).toBe(''); expect(c.private.value).toBe('');
    expect(c.fingerprint.textContent).toBe('No key pair yet');
    for (const action of ['copy-public', 'copy-private', 'download-public', 'download-private']) {
      expect(c[action].disabled).toBe(true); await c[action].emit('click');
    }
    expect(clipboard).not.toHaveBeenCalled(); expect(createUrl).not.toHaveBeenCalled();
    if (control === 'clear') expect(c.algorithm.focus).toHaveBeenCalled();
  });
  it('updates curve/RSA controls and restricts export formats without regenerating', async () => {
    const generated = vi.fn(async () => result);
    const { c } = setup({ generate: generated });
    c.format.value = 'hex'; c.algorithm.value = 'RSA'; await c.algorithm.emit('change');
    expect(c.format.value).toBe('pem'); expect(c['rsa-field'].hidden).toBe(false);
    expect(c.size.disabled).toBe(false); expect(c.purpose.disabled).toBe(false); expect(c.curve.disabled).toBe(true);
    c.size.value = '4096'; c.purpose.value = 'RSA-OAEP'; await c.purpose.emit('change'); await c.form.emit('submit');
    expect(generated).toHaveBeenLastCalledWith({ algorithm: 'RSA', curve: 'P-256', modulusLength: 4096, purpose: 'RSA-OAEP' });
    c.format.value = 'openssh'; c.algorithm.value = 'X25519'; await c.algorithm.emit('change');
    expect(c.format.value).toBe('pem');
    expect(c.format.options.find((option) => option.value === 'openssh')!.disabled).toBe(true);
    c.algorithm.value = 'ECDSA'; await c.algorithm.emit('change');
    expect(c['curve-field'].hidden).toBe(false); expect(c.curve.disabled).toBe(false); expect(c['rsa-field'].hidden).toBe(true);
  });
  it('keeps loading state, ignores duplicate submits and honors format changes while generating', async () => {
    const pending = deferred<KeyResult>(); const generated = vi.fn(() => pending.promise);
    const { c } = setup({ generate: generated });
    const work = c.form.emit('submit');
    expect(c.generate.disabled).toBe(true); expect(c.form.attributes.get('aria-busy')).toBe('true');
    await c.form.emit('submit'); expect(generated).toHaveBeenCalledTimes(1);
    c.format.value = 'jwk'; await c.format.emit('change'); expect(c.status.textContent).toContain('Generating');
    pending.resolve(result); await work;
    expect(c.private.value).toBe(result.formats.jwk!.privateKey);
    expect(c.form.attributes.get('aria-busy')).toBe('false'); expect(c.generate.disabled).toBe(false);
  });
  it.each(['resolve', 'reject'] as const)('ignores stale generation %s after Clear and a newer result', async (completion) => {
    const pending = deferred<KeyResult>();
    const generated = vi.fn().mockImplementationOnce(() => pending.promise).mockResolvedValue(result);
    const { c } = setup({ generate: generated });
    const work = c.form.emit('submit');
    await c.clear.emit('click'); await c.form.emit('submit');
    const status = c.status.textContent;
    if (completion === 'resolve') pending.resolve({ ...result, fingerprint: 'OLD', formats: {} });
    else pending.reject(new Error('OLD error'));
    await work;
    expect(c.status.textContent).toBe(status); expect(c.private.value).toBe(result.formats.pem!.privateKey);
    expect(c.fingerprint.textContent).toBe(result.fingerprint); expect(c.generate.disabled).toBe(false);
  });
  it('clears earlier keys before retrying and recovers after a generation failure', async () => {
    const generated = vi.fn().mockResolvedValueOnce(result).mockRejectedValueOnce(new Error('Unsupported Web Crypto')).mockResolvedValue(result);
    const { c } = setup({ generate: generated });
    await c.form.emit('submit'); await c.form.emit('submit');
    expect(c.status.dataset.state).toBe('error'); expect(c.status.textContent).toBe('Unsupported Web Crypto');
    expect(c.private.value).toBe(''); expect(c['download-private'].disabled).toBe(true); expect(c.generate.disabled).toBe(false);
    await c.form.emit('submit'); expect(c.status.dataset.state).toBe('success');
  });
  it('reports clipboard denial and ignores clipboard completion after format changes or Clear', async () => {
    const { c, clipboard } = setup({ generate: async () => result });
    await c.form.emit('submit');
    clipboard.mockRejectedValueOnce(new Error('denied')); await c['copy-private'].emit('click');
    expect(c.status.textContent).toContain('Clipboard access was denied');
    for (const change of ['format', 'clear']) {
      const copied = deferred<void>(); clipboard.mockImplementationOnce(() => copied.promise);
      const work = c['copy-public'].emit('click');
      if (change === 'format') { c.format.value = 'jwk'; await c.format.emit('change'); }
      else await c.clear.emit('click');
      const status = c.status.textContent; copied.resolve(); await work;
      expect(c.status.textContent).toBe(status);
    }
  });
  it('removes keys on page departure and invalidates pending generation', async () => {
    const pending = deferred<KeyResult>();
    const generated = vi.fn().mockResolvedValueOnce(result).mockImplementationOnce(() => pending.promise);
    const { c, windowControl } = setup({ generate: generated });
    await c.form.emit('submit'); await windowControl.emit('pagehide'); expect(c.private.value).toBe('');
    const work = c.form.emit('submit'); await windowControl.emit('pagehide'); pending.resolve(result); await work;
    expect(c.private.value).toBe(''); expect(c['copy-private'].disabled).toBe(true);
  });
});
