import test from 'node:test';
import assert from 'node:assert/strict';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import request from 'supertest';
import { readKey, writeKey, deleteKey } from '../kvdb.js';
import { DASHBOARD_CONFIG_KEY, DEFAULT_DASHBOARD_CONFIG } from '../dashboardConfig.js';

const originalUsers = await readKey('users', null);
const originalConsumers = await readKey('consumers', null);
const originalLeads = await readKey('leads', null);
const originalInvoices = await readKey('invoices', null);
const originalState = await readKey('consumer_state', null);
const originalDashboardConfig = await readKey(DASHBOARD_CONFIG_KEY, null);

const adminUser = {
  id: 'dash-admin',
  username: 'dash-admin',
  password: bcrypt.hashSync('secret', 10),
  role: 'admin',
  permissions: ['reports']
};

await writeKey('users', { users: [adminUser] });

const now = new Date();
const nowIso = now.toISOString();
const pastIso = new Date(now.getTime() - 10 * 24 * 60 * 60 * 1000).toISOString();
const futureIso = new Date(now.getTime() + 2 * 24 * 60 * 60 * 1000).toISOString();

await writeKey('consumers', {
  consumers: [
    {
      id: 'c1',
      name: 'Ana Martinez',
      status: 'active',
      sale: 1200,
      paid: 600,
      city: 'Austin',
      state: 'TX',
      createdAt: nowIso,
      updatedAt: nowIso,
      reports: [
        {
          id: 'r1',
          uploadedAt: nowIso,
          summary: {},
          data: {}
        }
      ]
    },
    {
      id: 'c2',
      name: 'Luis Gomez',
      status: 'cancelled',
      sale: 0,
      paid: 0,
      city: 'Miami',
      state: 'FL',
      createdAt: pastIso,
      updatedAt: pastIso,
      reports: []
    }
  ]
});

await writeKey('leads', {
  leads: [
    {
      id: 'l1',
      name: 'Lead One',
      status: 'qualified',
      createdAt: nowIso,
      updatedAt: nowIso
    },
    {
      id: 'l2',
      name: 'Lead Two',
      status: 'lost',
      createdAt: pastIso,
      updatedAt: pastIso
    }
  ]
});

await writeKey('invoices', {
  invoices: [
    {
      id: 'inv1',
      consumerId: 'c1',
      desc: 'Setup fee',
      amount: 500,
      due: pastIso,
      paid: true,
      pdf: null,
      payLink: null,
      paymentProvider: null,
      stripeSessionId: null,
      createdAt: nowIso,
      updatedAt: nowIso
    },
    {
      id: 'inv2',
      consumerId: 'c2',
      desc: 'Monthly plan',
      amount: 800,
      due: futureIso,
      paid: false,
      pdf: null,
      payLink: null,
      paymentProvider: null,
      stripeSessionId: null,
      createdAt: nowIso,
      updatedAt: nowIso
    }
  ]
});

await writeKey('consumer_state', {
  consumers: {
    c1: {
      reminders: [
        {
          id: 'rem1',
          due: futureIso,
          payload: { title: 'Prep consult', description: 'Gather docs' }
        }
      ],
      events: [],
      files: [],
      tracker: {},
      creditScore: { current: 680 }
    },
    c2: {
      reminders: [
        {
          id: 'rem2',
          due: pastIso,
          payload: { title: 'Docs request', description: 'Need utility bill' }
        }
      ],
      events: [],
      files: [],
      tracker: {},
      creditScore: { current: 640 }
    }
  },
  trackerSteps: []
});

process.env.NODE_ENV = 'test';
const { default: app } = await import('../server.js');

function tokenFor(user) {
  return jwt.sign(
    {
      id: user.id,
      username: user.username,
      role: user.role,
      permissions: user.permissions || []
    },
    'dev-secret',
    { expiresIn: '1h' }
  );
}

test('GET /api/dashboard/summary returns aggregated metrics', async () => {
  const res = await request(app)
    .get('/api/dashboard/summary')
    .set('Authorization', `Bearer ${tokenFor(adminUser)}`);

  assert.equal(res.status, 200);
  assert.equal(res.body.ok, true);
  assert.ok(res.body.summary);

  const summary = res.body.summary;
  assert.equal(summary.totals.consumers, 2);
  assert.equal(summary.totals.leads, 2);
  assert.equal(summary.revenue.totalBilled, 1300);
  assert.equal(summary.revenue.totalCollected, 500);
  assert.equal(summary.revenue.outstanding, 800);
  assert.equal(summary.revenue.topOutstanding.consumerId, 'c2');
  assert.equal(summary.reminders.upcoming.length, 1);
  assert.equal(summary.reminders.upcoming[0].consumerName, 'Ana Martinez');
  assert.equal(summary.reminders.overdueCount, 1);
  assert.equal(summary.leads.consultsLast7d, 1);
  assert.equal(summary.kpis.leadToConsultRate, 50);
  assert.equal(summary.goals.leadToConsultTarget, 32);
  assert.equal(summary.goals.monthlyRecurringTarget, DEFAULT_DASHBOARD_CONFIG.goals.monthlyRecurringTarget);
  assert.equal(summary.ladder.title, DEFAULT_DASHBOARD_CONFIG.ladder.title);
  assert(summary.focus.nextRevenueMove.includes('Luis'));
});

test('PUT /api/dashboard/config updates ladder settings', async () => {
  const res = await request(app)
    .put('/api/dashboard/config')
    .set('Authorization', `Bearer ${tokenFor(adminUser)}`)
    .send({
      goals: { monthlyRecurringTarget: 55555 },
      ladder: {
        title: 'New Revenue Plan',
        pipelineValue: 'Synced',
        playbookUrl: 'https://example.com/playbook'
      }
    });

  assert.equal(res.status, 200);
  assert.equal(res.body.ok, true);
  assert.equal(res.body.config.goals.monthlyRecurringTarget, 55555);
  assert.equal(res.body.config.ladder.title, 'New Revenue Plan');
  assert.equal(res.body.config.ladder.pipelineValue, 'Synced');
  assert.equal(res.body.config.ladder.playbookUrl, 'https://example.com/playbook');

  const summaryRes = await request(app)
    .get('/api/dashboard/summary')
    .set('Authorization', `Bearer ${tokenFor(adminUser)}`);

  assert.equal(summaryRes.status, 200);
  assert.equal(summaryRes.body.summary.goals.monthlyRecurringTarget, 55555);
  assert.equal(summaryRes.body.summary.ladder.title, 'New Revenue Plan');
  assert.equal(summaryRes.body.summary.ladder.pipelineValue, 'Synced');
});

test.after(async () => {
  if (originalUsers) await writeKey('users', originalUsers); else await writeKey('users', { users: [] });
  if (originalConsumers) await writeKey('consumers', originalConsumers); else await writeKey('consumers', { consumers: [] });
  if (originalLeads) await writeKey('leads', originalLeads); else await writeKey('leads', { leads: [] });
  if (originalInvoices) await writeKey('invoices', originalInvoices); else await writeKey('invoices', { invoices: [] });
  if (originalState) await writeKey('consumer_state', originalState); else await writeKey('consumer_state', { consumers: {}, trackerSteps: [] });
  if (originalDashboardConfig) await writeKey(DASHBOARD_CONFIG_KEY, originalDashboardConfig); else await deleteKey(DASHBOARD_CONFIG_KEY);
});
