import test from 'node:test';
import assert from 'node:assert/strict';
import {
  generatePersonalInfoLetters,
  generateInquiryLetters,
  generateDebtCollectorLetters,
} from '../letterEngine.js';

const consumer = {
  name: 'John Doe',
  addr1: '123 Main St',
  city: 'Town',
  state: 'CA',
  zip: '90000',
  phone: '555-0000',
  email: 'john@example.com',
  ssn_last4: '1234',
  dob: '1990-01-01',
};

test('personal info letter includes table and header', () => {
  const letters = generatePersonalInfoLetters({ consumer, mismatchedFields: ['name'] });
  const letter = letters.find((l) => l.bureau === 'Equifax');
  assert.ok(letter);
  assert.match(letter.html, /Personal Information Dispute/);
  assert.match(letter.html, /My Correct Information/);
});

test('inquiry letter mentions creditor', () => {
  const [letter] = generateInquiryLetters({
    consumer,
    inquiries: [{ bureau: 'Equifax', creditor: 'ABC Bank', date: '2024-01-02' }],
  });
  assert.match(letter.html, /Unauthorized Inquiry Dispute/);
  assert.match(letter.html, /ABC Bank/);
});

test('collector letter includes collector name', () => {
  const [letter] = generateDebtCollectorLetters({
    consumer,
    collectors: [{ name: 'Collection Co', addr1: '321 Road' }],
  });
  assert.match(letter.html, /Debt Validation Request/);
  assert.match(letter.html, /Collection Co/);
});

