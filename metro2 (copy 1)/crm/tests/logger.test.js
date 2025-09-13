import test from 'node:test';
import assert from 'node:assert/strict';
import { logInfo, logWarn, logError } from '../logger.js';

const sensitiveMeta = {
  ssn: '123-45-6789',
  email: 'user@example.com',
  token: 'secret-token',
  nested: { token: 'nested-token', ok: 'value' }
};

test('loggers redact sensitive fields', () => {
  const out = [];
  const origLog = console.log;
  const origWarn = console.warn;
  const origErr = console.error;
  console.log = (msg) => out.push(['info', msg]);
  console.warn = (msg) => out.push(['warn', msg]);
  console.error = (msg) => out.push(['error', msg]);

  logInfo('I1', 'info', sensitiveMeta);
  logWarn('W1', 'warn', sensitiveMeta);
  logError('E1', 'error', new Error('fail'), sensitiveMeta);

  console.log = origLog;
  console.warn = origWarn;
  console.error = origErr;

  assert.equal(out.length, 3);
  for (const [, msg] of out) {
    const parsed = JSON.parse(msg);
    assert.equal(parsed.ssn, '[REDACTED]');
    assert.equal(parsed.email, '[REDACTED]');
    assert.equal(parsed.token, '[REDACTED]');
    assert.equal(parsed.nested.token, '[REDACTED]');
    assert.equal(parsed.nested.ok, 'value');
  }
});
