import test from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import { readKey, writeKey, deleteKey } from '../kvdb.js';

process.env.NODE_ENV = 'test';

const { default: app } = await import('../server.js');

const originalConsumers = await readKey('consumers', null);
const originalInvoices = await readKey('invoices', null);
const originalState = await readKey('consumer_state', null);
const originalSettings = await readKey('settings', null);

const consumerId = 'portal-test-consumer';
const nowIso = new Date().toISOString();

await writeKey('consumers', {
  consumers: [
    {
      id: consumerId,
      name: 'Portal Client',
      status: 'active',
      creditScore: {
        transunion: 702,
        experian: 698,
        updatedAt: nowIso,
      },
      reports: [
        {
          id: 'rep-1',
          uploadedAt: nowIso,
          data: {
            negative_items: [
              {
                creditor: 'ACME Bank',
                severity: 3,
                bureaus: ['TU'],
                violations: ['Late payment'],
              },
            ],
          },
        },
      ],
    },
  ],
});

await writeKey('settings', {
  clientPortal: {
    theme: {
      backgroundColor: '#f8fafc',
      taglinePrimary: 'Welcome to your audit hub',
      taglineSecondary: 'Bienvenido a tu portal',
    },
    modules: {
      payments: true,
      messages: true,
      documents: true,
    },
  },
});

await writeKey('invoices', {
  invoices: [
    {
      id: 'inv-1',
      consumerId,
      desc: 'Onboarding Audit',
      amount: 197,
      due: nowIso,
      createdAt: nowIso,
      paid: false,
      payLink: 'https://example.com/pay/inv-1',
    },
  ],
});

await writeKey('consumer_state', {
  consumers: {
    [consumerId]: {
      events: [
        {
          id: 'ev-1',
          type: 'message',
          payload: { text: 'Welcome aboard', from: 'coach' },
          at: nowIso,
        },
      ],
      files: [
        {
          id: 'file-1',
          originalName: 'id.pdf',
          storedName: 'file-1.pdf',
          type: 'id',
          size: 1024,
          uploadedAt: nowIso,
        },
      ],
      reminders: [
        {
          id: 'rem-1',
          due: nowIso,
          title: 'Upload proof of address',
        },
      ],
      tracker: {
        'Upload proof of address': true,
      },
      creditScore: {
        transunion: 702,
        experian: 698,
        updatedAt: nowIso,
      },
    },
  },
  trackerSteps: ['Upload proof of address', 'Schedule review'],
});

test.after(async () => {
  if (originalConsumers) await writeKey('consumers', originalConsumers); else await deleteKey('consumers');
  if (originalInvoices) await writeKey('invoices', originalInvoices); else await deleteKey('invoices');
  if (originalState) await writeKey('consumer_state', originalState); else await writeKey('consumer_state', { consumers: {}, trackerSteps: [] });
  if (originalSettings) await writeKey('settings', originalSettings); else await deleteKey('settings');
});

test('portal API returns enriched payload', async () => {
  const res = await request(app).get(`/api/portal/${consumerId}`);
  assert.equal(res.status, 200);
  assert.equal(res.body.ok, true);
  const portal = res.body.portal;
  assert.ok(portal);
  assert.equal(portal.consumer.id, consumerId);
  assert.equal(portal.consumer.name, 'Portal Client');
  assert.deepEqual(portal.portalSettings.theme.taglineSecondary, 'Bienvenido a tu portal');
  assert.equal(Array.isArray(portal.negativeItems), true);
  assert.ok(portal.negativeItems.length >= 1);
  assert.equal(portal.creditScore.transunion, 702);
  assert.equal(portal.invoices[0].description, 'Onboarding Audit');
  assert.equal(portal.messages[0].message, 'Welcome aboard');
  assert.equal(portal.documents[0].name, 'id.pdf');
  assert.equal(portal.tracker.steps.includes('Schedule review'), true);
});
