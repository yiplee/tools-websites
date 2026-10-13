import { afterEach, describe, expect, it, vi } from 'vitest';
import { clientScript, initializeEncodePage } from '../src/tools/encode/client';
import { createEncodeTools, type EncodeResult } from '../src/tools/encode/encode';

/** Minimal DOM fixture for state/async/download behavior; this is not a visual browser check. */
class Control {
  value = '';
  textContent = '';
  placeholder = '';
  disabled = true;
  hidden = false;
  files: Pick<File, 'size' | 'arrayBuffer'>[] = [];
  dataset: Record<string, string> = {};
  attributes = new Map<string, string>();
  listeners = new Map<string, ((event: Event) => unknown)[]>();
  setAttribute(name: string, value: string) { this.attributes.set(name, value); }
  removeAttribute(name: string) { this.attributes.delete(name); }
  addEventListener(type: string, listener: (event: Event) => unknown) {
    this.listeners.set(type, [...(this.listeners.get(type) ?? []), listener]);
  }
  async emit(type: string) {
    await Promise.all((this.listeners.get(type) ?? []).map((listener) => listener(new Event(type, { cancelable: true }))));
  }
}

function setup(serialized = false) {
  const ids = ['encode-form', 'operation', 'input-source', 'encode-input', 'encode-file', 'text-field', 'file-field', 'alphabet-field', 'base64-alphabet', 'input-hint', 'convert', 'encode-output', 'result-summary', 'encode-status', 'copy-result', 'download-result'];
  const controls = Object.fromEntries(ids.map((id) => [id, new Control()]));
  controls.operation.value = 'base64-encode';
  controls['input-source'].value = 'text';
  controls['base64-alphabet'].value = 'standard';
  const anchor = { href: '', download: '', click: vi.fn(), remove: vi.fn() };
  const append = vi.fn();
  const clipboard = vi.fn().mockResolvedValue(undefined);
  const createUrl = vi.fn((_blob: Blob | MediaSource) => 'blob:local-result');
  const revokeUrl = vi.fn();
  const delayed: (() => void)[] = [];
  vi.stubGlobal('document', { querySelector: (selector: string) => controls[selector.slice(1)], createElement: () => anchor, body: { append } });
  vi.stubGlobal('navigator', { clipboard: { writeText: clipboard } });
  vi.stubGlobal('setTimeout', (callback: () => void, delay: number) => {
    if (delay === 0) callback(); else delayed.push(callback);
    return 1;
  });
  vi.spyOn(URL, 'createObjectURL').mockImplementation(createUrl);
  vi.spyOn(URL, 'revokeObjectURL').mockImplementation(revokeUrl);
  const tools = createEncodeTools();
  if (serialized) new Function(clientScript())();
  else initializeEncodePage(tools);
  return { controls, tools, anchor, append, clipboard, createUrl, revokeUrl, delayed };
}

afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });

describe('Encode browser interactions', () => {
  it('executes the inline initializer, converts, copies, and invalidates output on edits', async () => {
    const { controls: c, clipboard } = setup(true);
    expect(c.convert.disabled).toBe(false);
    expect(c['file-field'].hidden).toBe(true);
    expect(c['copy-result'].disabled).toBe(true);
    c['encode-input'].value = '你好🌍';
    await c['encode-form'].emit('submit');
    expect(c['encode-output'].value).toBe('5L2g5aW98J+MjQ==');
    expect(c['result-summary'].textContent).toBe('10 input bytes → 16 output bytes');
    await c['copy-result'].emit('click');
    expect(clipboard).toHaveBeenCalledWith('5L2g5aW98J+MjQ==');
    c['encode-input'].value = 'next';
    await c['encode-input'].emit('input');
    expect(c['encode-output'].value).toBe('');
    expect(c['copy-result'].disabled).toBe(true);
    expect(c['download-result'].disabled).toBe(true);
  });

  it('changes operation/alphabet/source controls, reads file bytes, and clears results after errors', async () => {
    const { controls: c } = setup();
    c['input-source'].value = 'file';
    await c['input-source'].emit('change');
    expect(c['text-field'].hidden).toBe(true);
    expect(c['encode-input'].disabled).toBe(true);
    expect(c['file-field'].hidden).toBe(false);
    expect(c['encode-file'].disabled).toBe(false);
    c['encode-file'].files = [new File([new Uint8Array([251, 255]).buffer], 'binary.dat')];
    c['base64-alphabet'].value = 'url-safe';
    await c['base64-alphabet'].emit('change');
    await c['encode-form'].emit('submit');
    expect(c['encode-output'].value).toBe('-_8');
    c.operation.value = 'hex-decode';
    await c.operation.emit('change');
    expect(c.convert.textContent).toBe('Decode input');
    expect(c['alphabet-field'].hidden).toBe(true);
    await c['encode-form'].emit('submit');
    expect(c['encode-status'].textContent).toContain('UTF-8');
    expect(c['encode-file'].attributes.get('aria-invalid')).toBe('true');
    expect(c['encode-output'].value).toBe('');
    expect(c['download-result'].disabled).toBe(true);
    c['encode-file'].files = [new File(['666f6f'], 'hex.txt')];
    await c['encode-file'].emit('change');
    await c['encode-form'].emit('submit');
    expect(c['encode-output'].value).toBe('foo');
    expect(c['encode-file'].attributes.has('aria-invalid')).toBe(false);
  });

  it('downloads exact binary bytes and revokes the temporary URL', async () => {
    const { controls: c, anchor, append, createUrl, revokeUrl, delayed } = setup();
    c.operation.value = 'hex-decode';
    await c.operation.emit('change');
    c['encode-input'].value = 'ff000d0a';
    await c['encode-form'].emit('submit');
    expect(c['copy-result'].disabled).toBe(true);
    expect(c['download-result'].disabled).toBe(false);
    expect(c['encode-status'].textContent).toContain('not valid UTF-8');
    await c['download-result'].emit('click');
    const blob = createUrl.mock.calls[0][0] as unknown as Blob;
    expect(blob.type).toBe('application/octet-stream');
    expect(new Uint8Array(await blob.arrayBuffer())).toEqual(new Uint8Array([255, 0, 13, 10]));
    expect(anchor.download).toBe('decoded.bin');
    expect(anchor.href).toBe('blob:local-result');
    expect(append).toHaveBeenCalledWith(anchor);
    expect(anchor.click).toHaveBeenCalledOnce();
    expect(anchor.remove).toHaveBeenCalledOnce();
    expect(revokeUrl).not.toHaveBeenCalled();
    delayed.forEach((callback) => callback());
    expect(revokeUrl).toHaveBeenCalledWith('blob:local-result');
  });

  it('handles empty results and denied clipboard permission', async () => {
    const { controls: c, clipboard, createUrl } = setup();
    await c['encode-form'].emit('submit');
    expect(c['copy-result'].disabled).toBe(false);
    expect(c['download-result'].disabled).toBe(false);
    clipboard.mockRejectedValueOnce(new Error('denied'));
    await c['copy-result'].emit('click');
    expect(clipboard).toHaveBeenCalledWith('');
    expect(c['encode-status'].dataset.state).toBe('error');
    expect(c['encode-status'].textContent).toContain('Select the result');
    await c['download-result'].emit('click');
    const blob = createUrl.mock.calls[0][0] as unknown as Blob;
    expect(blob.size).toBe(0);
  });

  it('rejects missing, oversized and unreadable files without computing a result', async () => {
    const { controls: c, tools } = setup();
    const run = vi.spyOn(tools, 'run');
    c['input-source'].value = 'file';
    await c['input-source'].emit('change');
    await c['encode-form'].emit('submit');
    expect(c['encode-status'].textContent).toContain('Select a local file');
    const read = vi.fn().mockResolvedValue(new ArrayBuffer(0));
    c['encode-file'].files = [{ size: 10 * 1024 * 1024 + 1, arrayBuffer: read }];
    await c['encode-form'].emit('submit');
    expect(c['encode-status'].textContent).toContain('exceeds 10 MiB');
    expect(read).not.toHaveBeenCalled();
    c['encode-file'].files = [{ size: 1, arrayBuffer: async () => { throw new Error('read error'); } }];
    await c['encode-form'].emit('submit');
    expect(c['encode-status'].textContent).toContain('could not be read');
    expect(run).not.toHaveBeenCalled();
    expect(c.convert.disabled).toBe(false);
    expect(c['encode-form'].attributes.get('aria-busy')).toBe('false');
  });

  it('enforces the input byte limit for multibyte UTF-8 text', async () => {
    const { controls: c, tools } = setup();
    const run = vi.spyOn(tools, 'run');
    c['encode-input'].value = '界'.repeat(Math.floor(10 * 1024 * 1024 / 3) + 1);
    await c['encode-form'].emit('submit');
    expect(c['encode-status'].textContent).toContain('exceeds 10 MiB in UTF-8');
    expect(run).not.toHaveBeenCalled();
  });

  it('ignores a pending hash completed after the user edits or runs again', async () => {
    const { controls: c, tools } = setup();
    let resolve!: (result: EncodeResult) => void;
    const run = vi.spyOn(tools, 'run').mockImplementationOnce(() => new Promise((done) => { resolve = done; }));
    c.operation.value = 'SHA-256';
    await c.operation.emit('change');
    expect(c.convert.textContent).toBe('Compute hash');
    c['encode-input'].value = 'old';
    const pending = c['encode-form'].emit('submit');
    await vi.waitFor(() => expect(run).toHaveBeenCalledOnce());
    expect(c['encode-form'].attributes.get('aria-busy')).toBe('true');
    c['encode-input'].value = 'abc';
    await c['encode-input'].emit('input');
    await c['encode-form'].emit('submit');
    const expected = 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad';
    expect(c['encode-output'].value).toBe(expected);
    resolve({ text: 'stale', bytes: new Uint8Array(), filename: 'hash.txt' });
    await pending;
    expect(c['encode-output'].value).toBe(expected);
    expect(c['encode-status'].dataset.state).toBe('success');
  });

  it('ignores a local file read completed after the input source changes', async () => {
    const { controls: c, tools } = setup();
    const run = vi.spyOn(tools, 'run');
    let finishRead!: (value: ArrayBuffer) => void;
    const read = vi.fn(() => new Promise<ArrayBuffer>((resolve) => { finishRead = resolve; }));
    c['input-source'].value = 'file';
    await c['input-source'].emit('change');
    c['encode-file'].files = [{ size: 1, arrayBuffer: read }];
    const pending = c['encode-form'].emit('submit');
    await vi.waitFor(() => expect(read).toHaveBeenCalledOnce());
    c['input-source'].value = 'text';
    await c['input-source'].emit('change');
    finishRead(new Uint8Array([255]).buffer);
    await pending;
    expect(run).not.toHaveBeenCalled();
    expect(c['encode-output'].value).toBe('');
    expect(c['download-result'].disabled).toBe(true);
    expect(c.convert.disabled).toBe(false);
  });
});
