import { getUncachableStripeClient } from './stripeClient.js';

const CRM_PRODUCTS = [
  {
    name: 'Starter',
    description: 'For solo credit repair professionals. Includes Metro-2 auditing, letter generation, and up to 25 clients.',
    metadata: { tier: 'starter', type: 'crm', clientLimit: '25' },
    price: { amount: 9700, interval: 'month' }
  },
  {
    name: 'Growth',
    description: 'For growing teams. Unlimited clients, bulk automation, AI-powered letters, team member seats, and priority support.',
    metadata: { tier: 'growth', type: 'crm', clientLimit: 'unlimited' },
    price: { amount: 29700, interval: 'month' }
  },
  {
    name: 'Enterprise',
    description: 'Full platform access with white-label branding, API access, dedicated onboarding, and custom integrations.',
    metadata: { tier: 'enterprise', type: 'crm', clientLimit: 'unlimited' },
    price: { amount: 59700, interval: 'month' }
  }
];

const DIY_PRODUCTS = [
  {
    name: 'DIY Basic',
    description: 'Upload credit reports, run audits, and generate up to 5 dispute letters per month.',
    metadata: { tier: 'basic', type: 'diy', letterLimit: '5' },
    price: { amount: 2900, interval: 'month' }
  },
  {
    name: 'DIY Pro',
    description: 'Unlimited audits, AI-powered dispute letters, cross-bureau analysis, and priority processing.',
    metadata: { tier: 'pro', type: 'diy', letterLimit: 'unlimited' },
    price: { amount: 7900, interval: 'month' }
  }
];

async function seedProducts() {
  const stripe = await getUncachableStripeClient();
  console.log('Connected to Stripe. Seeding subscription products...\n');

  const allProducts = [...CRM_PRODUCTS, ...DIY_PRODUCTS];

  for (const prod of allProducts) {
    const existing = await stripe.products.search({ query: `name:'${prod.name}'` });
    if (existing.data.length > 0) {
      console.log(`  [skip] "${prod.name}" already exists (${existing.data[0].id})`);
      const prices = await stripe.prices.list({ product: existing.data[0].id, active: true, limit: 5 });
      if (prices.data.length > 0) {
        console.log(`         Price: ${prices.data[0].id} ($${(prices.data[0].unit_amount / 100).toFixed(2)}/${prices.data[0].recurring?.interval})`);
      }
      continue;
    }

    const product = await stripe.products.create({
      name: prod.name,
      description: prod.description,
      metadata: prod.metadata
    });

    const price = await stripe.prices.create({
      product: product.id,
      unit_amount: prod.price.amount,
      currency: 'usd',
      recurring: { interval: prod.price.interval }
    });

    console.log(`  [created] "${prod.name}" → ${product.id}`);
    console.log(`            Price: ${price.id} ($${(prod.price.amount / 100).toFixed(2)}/${prod.price.interval})`);
  }

  console.log('\nDone! Products are synced to Stripe.');
  console.log('Webhooks will automatically sync them to your local database.');
  process.exit(0);
}

seedProducts().catch(err => {
  console.error('Seed failed:', err);
  process.exit(1);
});
