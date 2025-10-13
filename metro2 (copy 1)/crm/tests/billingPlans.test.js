import test from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import { readKey, writeKey, deleteKey } from '../kvdb.js';

const originalPlans = await readKey('billing_plans', null);
const originalInvoices = await readKey('invoices', null);
const originalConsumers = await readKey('consumers', null);
const originalState = await readKey('consumer_state', null);

const consumerId = 'plan-consumer-test';
await writeKey('consumers', { consumers: [{ id: consumerId, name: 'Plan Tester', reports: [] }] });
await writeKey('billing_plans', { plans: [] });
await writeKey('invoices', { invoices: [] });
await writeKey('consumer_state', { consumers: {}, trackerSteps: [] });

process.env.NODE_ENV = 'test';
const { default: app } = await import('../server.js');

let createdPlan;

function futureDate(daysAhead = 5){
  const now = new Date();
  now.setDate(now.getDate() + daysAhead);
  return now.toISOString().slice(0, 10);
}

test('create billing plan schedules reminder', async () => {
  const startDate = futureDate(7);
  const res = await request(app)
    .post('/api/billing/plans')
    .send({
      consumerId,
      name: 'Concierge Plan',
      amount: 199,
      frequency: 'monthly',
      startDate,
      reminderLeadDays: 2,
    });
  assert.equal(res.status, 200);
  assert.equal(res.body.ok, true);
  assert.ok(res.body.plan);
  createdPlan = res.body.plan;
  assert.equal(createdPlan.consumerId, consumerId);
  assert.equal(createdPlan.nextBillDate, startDate);
  assert.equal(createdPlan.reminderLeadDays, 2);
  assert.ok(createdPlan.reminderId);

  const plansDb = await readKey('billing_plans', null);
  assert.equal(plansDb.plans.length, 1);
  assert.equal(plansDb.plans[0].id, createdPlan.id);

  const state = await readKey('consumer_state', null);
  const reminder = state?.consumers?.[consumerId]?.reminders?.find((r) => r.id === createdPlan.reminderId);
  assert.ok(reminder, 'reminder scheduled in consumer state');
});

test('send billing plan invoice advances schedule', async () => {
  assert.ok(createdPlan, 'plan must be created first');
  const res = await request(app)
    .post(`/api/billing/plans/${createdPlan.id}/send`)
    .send({ company: { name: 'Test Co' } });
  assert.equal(res.status, 200);
  assert.equal(res.body.ok, true);
  assert.ok(res.body.invoice);
  assert.ok(res.body.plan);
  assert.equal(res.body.plan.id, createdPlan.id);
  assert.equal(res.body.plan.cyclesCompleted, 1);
  assert.notEqual(res.body.plan.nextBillDate, createdPlan.nextBillDate);
  assert.notEqual(res.body.plan.reminderId, createdPlan.reminderId);
  const invoicesDb = await readKey('invoices', null);
  assert.equal(invoicesDb.invoices.length, 1);
  assert.equal(invoicesDb.invoices[0].planId, createdPlan.id);
});

test.after(async () => {
  if(originalPlans) await writeKey('billing_plans', originalPlans); else await deleteKey('billing_plans');
  if(originalInvoices) await writeKey('invoices', originalInvoices); else await deleteKey('invoices');
  if(originalConsumers) await writeKey('consumers', originalConsumers); else await deleteKey('consumers');
  if(originalState) await writeKey('consumer_state', originalState); else await deleteKey('consumer_state');
});
