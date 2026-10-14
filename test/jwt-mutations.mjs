// Targeted mutation checks, without a new dependency. Run: node test/jwt-mutations.mjs
// Each mutation must produce an assertion failure; syntax/import failures do not count.
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
const core = 'src/tools/jwt/jwt.ts';
const client = 'src/tools/jwt/client.ts';
const originals = new Map([core, client].map((file) => [file, readFileSync(file, 'utf8')]));
const mutations = [
  ['accept all signatures', core, 'return crypto.subtle.verify(verifyAlgorithm, key, jwt.signature, encoder.encode(jwt.signingInput));', 'return true;'],
  ['reserialize signed JSON', core, 'encoder.encode(jwt.signingInput)', "encoder.encode(JSON.stringify(jwt.header) + '.' + JSON.stringify(jwt.payload))"],
  ['skip expected algorithm', core, "if (alg !== expectedAlgorithm) throw new Error('Header alg does not match the selected expected algorithm.');", ''],
  ['skip unsigned warning', core, "if (alg === 'none') throw new Error('alg none is unsigned and cannot be verified.');", ''],
  ['accept nonzero unused bits', core, 'if ((remainder === 2 && (last & 15) !== 0) || (remainder === 3 && (last & 3) !== 0))', 'if (false)'],
  ['accept nonobject JSON', core, "if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error(`${label} must be a JSON object.`);", ''],
  ['expire one tick late', core, 'now >= value', 'now > value'],
  ['activate one tick late', core, 'now < value', 'now <= value'],
  ['treat clock milliseconds as seconds', core, 'now = Date.now() / 1000', 'now = Date.now()'],
  ['allow weak RSA keys', core, "if (family !== 'ES' && (key.algorithm as RsaKeyAlgorithm).modulusLength < 2048) throw new Error('RSA public keys must have at least 2048 bits.');", ''],
  ['allow missing signatures', core, "if (!parts[2] && header.alg !== 'none') throw new Error('A signed JWT must include a signature.');", ''],
  ['ignore critical headers', core, "if (Object.prototype.hasOwnProperty.call(jwt.header, 'crit') || jwt.header.b64 === false)", 'if (false)'],
  ['trim shared secrets', core, "encoder.encode(keyText), { name: 'HMAC', hash }", "encoder.encode(keyText.trim()), { name: 'HMAC', hash }"],
  ['accept DER ECDSA length', core, "if (signatureLength !== null && jwt.signature.length !== signatureLength) throw new Error('Signature length does not match the selected algorithm.');", ''],
  ['publish stale signature result', client, 'if (current !== revision) return;', ''],
  ['retain signature result after edits', client, "message(verifyStatus, 'Signature not verified. Decoded claims are untrusted.');", ''],
  ['retain key across algorithm changes', client, "algorithm.addEventListener('change', () => { key.value = ''; update(); });", "algorithm.addEventListener('change', () => { update(); });"],
];
function run(test) {
  const result = spawnSync(process.execPath, ['node_modules/vitest/vitest.mjs', 'run', test], { encoding: 'utf8', timeout: 60000, env: { ...process.env, NO_COLOR: '1' } });
  if (result.error) throw result.error;
  if (!result.stdout.includes('Test Files')) throw new Error('Vitest did not report a test run.');
  return result;
}
const baseline = run('test/jwt');
if (baseline.status !== 0) { process.stderr.write(baseline.stdout + baseline.stderr); process.exit(1); }
const results = [];
try {
  for (const [name, file, before, after] of mutations) {
    const original = originals.get(file);
    if (!original.includes(before)) throw new Error('Mutation anchor missing: ' + name);
    writeFileSync(file, original.replace(before, after));
    const result = run(file === core ? 'test/jwt.test.ts' : 'test/jwt-client.test.ts');
    const output = result.stdout + result.stderr;
    const killed = result.status === 1 && /AssertionError/.test(output);
    results.push({ name, file, killed });
    writeFileSync(file, original);
    console.log(`${killed ? 'KILLED' : 'SURVIVED / INVALID'}: ${name}`);
    if (!killed) process.stderr.write(output);
  }
} finally {
  for (const [file, source] of originals) writeFileSync(file, source);
}
const report = { command: 'node test/jwt-mutations.mjs', scope: '17 targeted logic mutations; not exhaustive coverage', total: results.length, killed: results.filter((result) => result.killed).length, results };
mkdirSync('docs', { recursive: true });
writeFileSync('docs/jwt-mutation-report.json', JSON.stringify(report, null, 2) + '\n');
if (report.killed !== report.total) process.exit(1);
