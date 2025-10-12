import test from 'node:test';
import assert from 'node:assert/strict';

process.env.NODE_ENV = 'test';
const { runBasicRuleAudit } = await import('../server.js');

test('flags missing DOFD on charge-off or collection', () => {
  const report = {
    tradelines: [
      {
        per_bureau: {
          TransUnion: { account_status: 'Collection' }
        }
      }
    ]
  };
  runBasicRuleAudit(report);
  const viols = report.tradelines[0].violations || [];
  assert.ok(viols.some(v => v.id === 'MISSING_DOFD'));
});

test('flags balance mismatch across bureaus', () => {
  const report = {
    tradelines: [
      {
        violations_grouped: { Existing: [{ id: 'OTHER', title: 'Other issue' }] },
        per_bureau: {
          TransUnion: { balance: '$100' },
          Experian: { balance: '$200' }
        }
      }
    ]
  };
  runBasicRuleAudit(report);
  const viols = report.tradelines[0].violations || [];
  assert.ok(viols.some(v => v.id === 'BALANCE_MISMATCH'));
  const grouped = report.tradelines[0].violations_grouped || {};
  assert.ok(Array.isArray(grouped.Basic));
  assert.ok(grouped.Basic.some(v => v.id === 'BALANCE_MISMATCH'));
  const entry = grouped.Basic.find(v => v.id === 'BALANCE_MISMATCH');
  assert.equal(entry.source, 'basic_rule_audit');
  assert.strictEqual(entry, viols.find(v => v.id === 'BALANCE_MISMATCH'));
});

test('reuses existing violations when ids already present', () => {
  const shared = { id: 'BALANCE_MISMATCH', title: 'Existing mismatch' };
  const report = {
    tradelines: [
      {
        violations: [shared],
        per_bureau: {
          TransUnion: { balance: '100' },
          Experian: { balance: '200' },
        },
      }
    ]
  };
  runBasicRuleAudit(report);
  const tl = report.tradelines[0];
  assert.equal(tl.violations.length, 1);
  assert.strictEqual(tl.violations[0], shared);
  assert.ok(Array.isArray(tl.violations_grouped.Basic));
  assert.strictEqual(tl.violations_grouped.Basic[0], shared);
});
