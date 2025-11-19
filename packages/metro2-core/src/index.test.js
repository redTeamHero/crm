import assert from 'node:assert';
import { isNonCreditorHeader, sanitizeCreditor } from './index.js';

// ensure sanitizeCreditor remains available for test use
assert.strictEqual(typeof sanitizeCreditor, 'function');

const HEADER = 'Three Bureau Credit Report One Bureau Credit Report Reference #: M66794041 Report Date: 09/16/2025';

assert.ok(
  isNonCreditorHeader(HEADER),
  'Headers describing the credit report should not be treated as creditors'
);

assert.ok(
  !isNonCreditorHeader('Example Bank'),
  'Legitimate creditor names should not be filtered out'
);
