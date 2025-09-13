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
});
