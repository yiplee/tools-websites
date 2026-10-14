import { afterEach, describe, expect, it, vi } from 'vitest';
import { clientScript, initializeJwtPage } from '../src/tools/jwt/client';
import { createJwtTools } from '../src/tools/jwt/jwt';

const knownJwt = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIiwibmFtZSI6IkpvaG4gRG9lIiwiaWF0IjoxNTE2MjM5MDIyfQ.SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV_adQssw5c';
/** Minimal DOM for async state tests; rendered layout is verified separately. */
class Control {
  value = '';
  textContent = '';
  placeholder = '';
  disabled = true;
  dataset: Record<string, string> = {};
  children: Control[] = [];
  focus = vi.fn();
  listeners = new Map<string, ((event: Event) => unknown)[]>();
  addEventListener(type: string, listener: (event: Event) => unknown) {
    this.listeners.set(type, [...(this.listeners.get(type) ?? []), listener]);
  }
  replaceChildren(...children: Control[]) { this.children = children; }
  append(...children: Control[]) { this.children.push(...children); }
  async emit(type: string) {
    await Promise.all((this.listeners.get(type) ?? []).map((listener) => listener(new Event(type, { cancelable: true }))));
  }
}
function setup(serialized = false) {
  const ids = ['jwt-form', 'jwt-input', 'jwt-algorithm', 'jwt-key', 'jwt-key-label', 'jwt-key-hint', 'jwt-decode-status', 'jwt-verify-status', 'jwt-time-status', 'jwt-times', 'jwt-header', 'jwt-payload', 'jwt-verify', 'jwt-clear', 'jwt-copy', 'jwt-copy-status'];
  const c = Object.fromEntries(ids.map((id) => [id, new Control()]));
  c['jwt-algorithm'].value = 'HS256';
  const clipboard = vi.fn().mockResolvedValue(undefined);
  let tick = () => {};
  vi.stubGlobal('document', { querySelector: (selector: string) => c[selector.slice(1)], createElement: () => new Control() });
  vi.stubGlobal('navigator', { clipboard: { writeText: clipboard } });
  vi.stubGlobal('setInterval', (callback: () => void) => { tick = callback; return 1; });
  const tools = createJwtTools();
  if (serialized) new Function(clientScript())();
  else initializeJwtPage(tools);
  async function enter(jwt = knownJwt, key = 'your-256-bit-secret') {
    c['jwt-input'].value = jwt; await c['jwt-input'].emit('input');
    c['jwt-key'].value = key; await c['jwt-key'].emit('input');
  }
  return { c, clipboard, tools, enter, tick: () => tick() };
}
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });

describe('JWT browser interactions', () => {
  it('executes serialized code, decodes, verifies, copies, clears, and treats output as text', async () => {
    const { c, enter, clipboard } = setup(true);
    expect(c['jwt-verify'].disabled).toBe(true);
    expect(c['jwt-copy'].disabled).toBe(true);
    expect(c['jwt-clear'].disabled).toBe(false);
    await enter();
    expect(JSON.parse(c['jwt-header'].textContent)).toEqual({ alg: 'HS256', typ: 'JWT' });
    expect(JSON.parse(c['jwt-payload'].textContent).name).toBe('John Doe');
    expect(c['jwt-times'].children[3].textContent).toContain('2018-01-18T01:30:22.000Z');
    expect(c['jwt-verify'].disabled).toBe(false);
    await c['jwt-form'].emit('submit');
    expect(c['jwt-verify-status'].dataset.state).toBe('success');
    await c['jwt-copy'].emit('click');
    expect(JSON.parse(clipboard.mock.calls[0][0])).toEqual({ header: { alg: 'HS256', typ: 'JWT' }, payload: { sub: '1234567890', name: 'John Doe', iat: 1516239022 } });
    const json = btoa('{"name":"</pre><img src=x onerror=alert(1)>"}').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
    await enter(knownJwt.split('.')[0] + '.' + json + '.' + knownJwt.split('.')[2]);
    expect(c['jwt-decode-status'].dataset.state, c['jwt-decode-status'].textContent).not.toBe('error');
    expect(c['jwt-payload'].textContent).toContain('</pre><img');
    expect(clientScript()).not.toContain('innerHTML');
    await c['jwt-clear'].emit('click');
    expect(c['jwt-input'].value).toBe('');
    expect(c['jwt-key'].value).toBe('');
    expect(c['jwt-header'].textContent).toBe('No header yet');
    expect(c['jwt-times'].children).toHaveLength(0);
    expect(c['jwt-copy'].disabled).toBe(true);
    expect(c['jwt-verify'].disabled).toBe(true);
    expect(c['jwt-input'].focus).toHaveBeenCalled();
  });
  it('clears stale success on edits and reports mismatch, malformed input, none and unknown algorithms', async () => {
    const { c, enter } = setup();
    await enter(); await c['jwt-form'].emit('submit');
    c['jwt-key'].value = 'wrong'; await c['jwt-key'].emit('input');
    expect(c['jwt-verify-status'].textContent).toContain('not verified');
    await c['jwt-form'].emit('submit');
    expect(c['jwt-verify-status'].textContent).toContain('does not match');
    const encode = (value: object) => btoa(JSON.stringify(value)).replace(/=+$/, '');
    await enter(`${encode({ alg: 'none' })}.${encode({})}.`);
    expect(c['jwt-decode-status'].textContent).toContain('unsigned');
    expect(c['jwt-verify'].disabled).toBe(true);
    await enter(`${encode({ alg: 'EdDSA' })}.${encode({})}.AA`);
    expect(c['jwt-decode-status'].textContent).toContain('unsupported');
    expect(c['jwt-verify'].disabled).toBe(true);
    await enter('bad token');
    expect(c['jwt-decode-status'].dataset.state).toBe('error');
    expect(c['jwt-payload'].textContent).toBe('No payload yet');
    expect(c['jwt-copy'].disabled).toBe(true);
  });
  it('changes key mode, discards the previous key, and rejects algorithm mismatch', async () => {
    const { c, enter } = setup(); await enter();
    c['jwt-algorithm'].value = 'RS256'; await c['jwt-algorithm'].emit('change');
    expect(c['jwt-key'].value).toBe('');
    expect(c['jwt-key-label'].textContent).toBe('Public key (PEM or JWK)');
    expect(c['jwt-key-hint'].textContent).toContain('SPKI');
    c['jwt-key'].value = 'public-key'; await c['jwt-key'].emit('input'); await c['jwt-form'].emit('submit');
    expect(c['jwt-verify-status'].textContent).toContain('expected algorithm');
    c['jwt-algorithm'].value = 'HS256'; await c['jwt-algorithm'].emit('change');
    expect(c['jwt-key-label'].textContent).toBe('Shared secret (UTF-8)');
    expect(c['jwt-key'].value).toBe('');
  });
  it.each(['edit', 'clear', 'algorithm'] as const)('ignores a pending verification after %s and prevents duplicate submits', async (change) => {
    const { c, tools, enter } = setup(); await enter();
    let resolve!: (valid: boolean) => void;
    const verify = vi.spyOn(tools, 'verify').mockImplementation(() => new Promise((done) => { resolve = done; }));
    const pending = c['jwt-form'].emit('submit');
    expect(c['jwt-verify'].disabled).toBe(true);
    await c['jwt-form'].emit('submit'); expect(verify).toHaveBeenCalledTimes(1);
    if (change === 'edit') { c['jwt-input'].value = 'bad'; await c['jwt-input'].emit('input'); }
    if (change === 'clear') await c['jwt-clear'].emit('click');
    if (change === 'algorithm') { c['jwt-algorithm'].value = 'RS256'; await c['jwt-algorithm'].emit('change'); }
    resolve(true); await pending;
    expect(c['jwt-verify-status'].textContent).toContain('not verified');
    expect(c['jwt-verify'].disabled).toBe(true);
  });
  it('reports unavailable Web Crypto and clipboard denial; suppresses stale clipboard feedback', async () => {
    const { c, clipboard, enter } = setup(true); await enter();
    vi.stubGlobal('crypto', {}); await c['jwt-form'].emit('submit');
    expect(c['jwt-verify-status'].textContent).toContain('Web Crypto is unavailable');
    clipboard.mockRejectedValueOnce(new Error('denied')); await c['jwt-copy'].emit('click');
    expect(c['jwt-copy-status'].dataset.state).toBe('error');
    let resolve!: () => void;
    clipboard.mockImplementationOnce(() => new Promise<void>((done) => { resolve = done; }));
    const pending = c['jwt-copy'].emit('click'); await c['jwt-clear'].emit('click'); resolve(); await pending;
    expect(c['jwt-copy-status'].textContent).toBe('');
  });
  it('updates time claims as the local clock crosses nbf and exp without claiming signature success', async () => {
    vi.spyOn(Date, 'now').mockReturnValue(99000);
    const { c, enter, tick } = setup();
    const payload = btoa('{"exp":101,"nbf":100,"iat":102}').replace(/=+$/, '');
    await enter(`${knownJwt.split('.')[0]}.${payload}.${knownJwt.split('.')[2]}`);
    expect(c['jwt-time-status'].textContent).toBe('Not yet valid');
    expect(c['jwt-times'].children[3].textContent).toContain('future');
    vi.spyOn(Date, 'now').mockReturnValue(100000); tick();
    expect(c['jwt-time-status'].textContent).toContain('Within');
    vi.spyOn(Date, 'now').mockReturnValue(101000); tick();
    expect(c['jwt-time-status'].textContent).toBe('Expired');
    expect(c['jwt-verify-status'].textContent).toContain('not verified');
    expect(c['jwt-verify-status'].dataset.state).not.toBe('success');
  });
});
