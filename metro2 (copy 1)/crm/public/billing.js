import { api, escapeHtml, formatCurrency, getTranslation, getCurrentLanguage } from './common.js';
import { setupPageTour } from './tour-guide.js';

function restoreBillingTour(context) {
  if (!context || context.restored) return;
  context.restored = true;
}

setupPageTour('billing', {
  onBeforeStart: () => {
    const state = {};
    return state;
  },
  onAfterComplete: ({ context }) => restoreBillingTour(context),
  onAfterCancel: ({ context }) => restoreBillingTour(context),
  steps: [
    {
      id: 'billing-nav',
      title: 'Navigate revenue ops',
      text: `<p class="font-semibold">Use the nav to jump from fulfillment to cashflow.</p>
             <p class="mt-1 text-xs text-slate-600">Check Dashboard KPIs, revisit Clients, then collect payment links here.</p>`,
      attachTo: { element: '#primaryNav', on: 'bottom' }
    },
    {
      id: 'billing-subscription',
      title: 'Manage your plan',
      text: `<p class="font-semibold">View pricing tiers and manage your CRM subscription.</p>
             <p class="mt-1 text-xs text-slate-600">Upgrade anytime to unlock more features like bulk automation and AI letters.</p>`,
      attachTo: { element: '#subscriptionSection', on: 'top' }
    }
  ]
});

function translate(key, replacements = {}) {
  const template = getTranslation(key, getCurrentLanguage());
  if (!template) return '';
  return template.replace(/\{(\w+)\}/g, (_, token) => {
    const replacement = replacements[token];
    return replacement === undefined ? '' : String(replacement);
  });
}

let stripeProducts = [];
let currentSubscription = null;
let currentCustomerId = null;

async function loadSubscriptionStatus() {
  try {
    const token = localStorage.getItem('token');
    const headers = token ? { 'Authorization': `Bearer ${token}` } : {};
    const res = await fetch('/api/stripe/subscription-status?mode=crm', { headers });
    const data = await res.json();
    if (data.ok && data.subscription) {
      currentSubscription = data.subscription;
      currentCustomerId = data.customerId;
      showCurrentSubscription(data.plan, data.subscription);
    }
  } catch (err) {
    console.warn('Could not load subscription status:', err);
  }
}

function showCurrentSubscription(plan, sub) {
  const statusEl = document.getElementById('currentSubStatus');
  const nameEl = document.getElementById('currentPlanName');
  const detailsEl = document.getElementById('currentSubDetails');

  if (!statusEl || !nameEl) return;

  statusEl.classList.remove('hidden');
  nameEl.textContent = plan || 'Active';

  if (sub.currentPeriodEnd) {
    const endDate = new Date(sub.currentPeriodEnd);
    const formatted = endDate.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
    let detail = `Status: ${sub.status} | Renews: ${formatted}`;
    if (sub.cancelAtPeriodEnd) {
      detail = `Status: canceling | Ends: ${formatted}`;
    }
    if (detailsEl) detailsEl.textContent = detail;
  }

  const buttons = document.querySelectorAll('.subscribe-btn');
  buttons.forEach(btn => {
    const tier = btn.dataset.tier;
    if (tier === plan) {
      btn.textContent = 'Current plan';
      btn.disabled = true;
      btn.style.opacity = '0.6';
    }
  });
}

async function loadStripeProducts() {
  try {
    const res = await fetch('/api/stripe/products');
    const data = await res.json();
    if (data.ok && data.products.length > 0) {
      stripeProducts = data.products.filter(p => p.type === 'crm');
      updatePricingFromStripe(stripeProducts);
    }
  } catch (err) {
    console.warn('Could not load Stripe products:', err);
  }
}

function updatePricingFromStripe(products) {
  for (const prod of products) {
    const tier = prod.tier;
    const card = document.querySelector(`[data-tier="${tier}"]`);
    if (!card) continue;

    const price = prod.prices[0];
    if (!price) continue;

    const priceEl = card.querySelector('p.text-3xl');
    if (priceEl) {
      const dollars = Math.round(price.unit_amount / 100);
      priceEl.innerHTML = `$${dollars}<span class="text-base font-normal text-slate-500">/${price.interval}</span>`;
    }

    const btn = card.querySelector('.subscribe-btn');
    if (btn && !btn.disabled) {
      btn.dataset.priceId = price.id;
    }
  }
}

document.querySelectorAll('.subscribe-btn').forEach(btn => {
  btn.addEventListener('click', async () => {
    const priceId = btn.dataset.priceId;
    const tier = btn.dataset.tier;

    if (!priceId) {
      const product = stripeProducts.find(p => p.tier === tier);
      if (!product || !product.prices[0]) {
        const errEl = document.getElementById('subscriptionError');
        if (errEl) {
          errEl.textContent = 'Subscription plans are loading. Please try again in a moment.';
          errEl.classList.remove('hidden');
          setTimeout(() => errEl.classList.add('hidden'), 4000);
        }
        return;
      }
      btn.dataset.priceId = product.prices[0].id;
    }

    btn.disabled = true;
    btn.textContent = 'Redirecting...';

    try {
      const token = localStorage.getItem('token');
      const res = await fetch('/api/stripe/checkout', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { 'Authorization': `Bearer ${token}` } : {})
        },
        body: JSON.stringify({ priceId: btn.dataset.priceId, mode: 'crm' })
      });
      const data = await res.json();
      if (data.ok && data.url) {
        window.location.href = data.url;
      } else {
        throw new Error(data.error || 'Checkout failed');
      }
    } catch (err) {
      console.error('Checkout error:', err);
      btn.disabled = false;
      btn.textContent = 'Try again';
      const errEl = document.getElementById('subscriptionError');
      if (errEl) {
        errEl.textContent = err.message || 'Checkout failed. Please try again.';
        errEl.classList.remove('hidden');
      }
    }
  });
});

document.getElementById('manageSubBtn')?.addEventListener('click', async () => {
  if (!currentCustomerId) return;
  try {
    const token = localStorage.getItem('token');
    const res = await fetch('/api/stripe/portal', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { 'Authorization': `Bearer ${token}` } : {})
      },
      body: JSON.stringify({ customerId: currentCustomerId, mode: 'crm' })
    });
    const data = await res.json();
    if (data.ok && data.url) {
      window.location.href = data.url;
    }
  } catch (err) {
    console.error('Portal error:', err);
  }
});

const urlParams = new URLSearchParams(window.location.search);
if (urlParams.get('subscription') === 'success') {
  const subSection = document.getElementById('subscriptionSection');
  if (subSection) {
    const successBanner = document.createElement('div');
    successBanner.className = 'rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-800 font-medium';
    successBanner.textContent = 'Subscription activated! Your plan is now active.';
    subSection.prepend(successBanner);
    setTimeout(() => successBanner.remove(), 8000);
  }
  window.history.replaceState({}, '', '/billing');
}

loadStripeProducts();
loadSubscriptionStatus();
