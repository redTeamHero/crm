import { setupPageTour } from './tour-guide.js';

setupPageTour('settings-workflows', {
  steps: [
    {
      id: 'workflows-nav',
      title: 'Navigation',
      text: `<p class="font-semibold">Move between Workflows, Library, Marketing, and Billing.</p>
             <p class="mt-1 text-xs text-slate-600">Connect automation plans with the rest of the revenue stack.</p>`,
      attachTo: { element: '#primaryNav', on: 'bottom' }
    },
    {
      id: 'workflows-hero',
      title: 'Workflow launchpad',
      text: `<p class="font-semibold">Frame the mission and KPIs for automation.</p>
             <p class="mt-1 text-xs text-slate-600">Use this to align teams on scaling to 7–8 figures.</p>`,
      attachTo: { element: '#workflowsHero', on: 'top' }
    },
    {
      id: 'workflows-grid',
      title: 'Workflow catalog',
      text: `<p class="font-semibold">Browse prebuilt automations for disputes, billing, and marketing.</p>
             <p class="mt-1 text-xs text-slate-600">Document triggers, steps, and upsells before handing off to devs.</p>`,
      attachTo: { element: '#workflowGrid', on: 'top' }
    },
    {
      id: 'workflows-analytics',
      title: 'Analytics backlog',
      text: `<p class="font-semibold">Instrument every workflow.</p>
             <p class="mt-1 text-xs text-slate-600">Plan tracking for time-to-value, Metro-2 resolution, and billing recovery.</p>`,
      attachTo: { element: '#workflowsAnalytics', on: 'top' }
    },
    {
      id: 'workflows-revenue',
      title: 'Next revenue wins',
      text: `<p class="font-semibold">Prioritize experiments and upsells.</p>
             <p class="mt-1 text-xs text-slate-600">Log sprint ideas that move AOV, retention, and consult rates.</p>`,
      attachTo: { element: '#workflowsRevenue', on: 'top' }
    }
  ]
});

const workflows = [
  {
    id: 'client-onboarding',
    icon: '🧭',
    segments: ['Client Success', 'Operations'],
    title: 'Client Onboarding Workflow',
    purpose: 'Automatically guide new clients from signup to dispute readiness.',
    trigger: 'Trigger: New client created in the CRM.',
    steps: [
      'Send welcome email/text with portal login and expectations.',
      'Request IdentityIQ or SmartCredit credentials or secure report upload.',
      'Auto-generate a client folder, assign a case owner, and create kickoff tasks.',
      'Notify the team to begin the credit analysis.'
    ],
    outcome: 'Move clients from signup to “Ready for dispute” without manual busywork.',
    kpis: ['Lead→Consult %', 'Time-to-Value (hours)', 'Portal login rate'],
    automations: [
      'Webhook: POST /api/clients → workflow trigger',
      'Secure form + vault for IdentityIQ credentials',
      'Auto-assign via case routing rules'
    ],
    upsell: 'Pitch a concierge onboarding call ($197) once the client logs in.',
    abTest: 'Test SMS-first vs email-first welcome sequences for first-response time.'
  },
  {
    id: 'dispute-letter-generation',
    icon: '⚖️',
    segments: ['Disputes', 'Compliance'],
    title: 'Dispute Letter Generation Workflow',
    purpose: 'Generate Metro-2 compliant letters and track certified mail automatically.',
    trigger: 'Trigger: Violation found or dispute marked ready.',
    steps: [
      'Run Metro-2 parser to detect inaccurate tradelines and reasons.',
      'Auto-generate dispute templates (FCRA, FCBA, etc.).',
      'Send letters via certified mail API (SimpleCertifiedMail, Click2Mail).',
      'Store tracking numbers, timestamp, and mark items as “In dispute”.'
    ],
    outcome: 'Every dispute is mailed, tracked, and auditable without manual prep.',
    kpis: ['Dispute completion rate', 'Mail turnaround time', 'Violation categories fixed'],
    automations: [
      'Use metro2-core to score violations before generation',
      'Connect to certified mail API + webhook for delivery',
      'Sync status back to CRM tasks'
    ],
    upsell: 'Bundle “Dispute Concierge” service that handles all certified mail at a premium.',
    abTest: 'Test letter previews vs summary emails for client reassurance.'
  },
  {
    id: 'round-update',
    icon: '📈',
    segments: ['Disputes', 'Retention'],
    title: 'Round Update & Follow-Up Workflow',
    purpose: 'Keep disputes cycling every 30–45 days with automated follow-ups.',
    trigger: 'Trigger: 30 days since the last dispute round.',
    steps: [
      'Check for unresolved or unverified items.',
      'Auto-generate follow-up or escalation letters (Method of Verification, CFPB, etc.).',
      'Send a client update and notify staff with next steps.'
    ],
    outcome: 'No missed rounds; every client stays in an active repair cycle.',
    kpis: ['Round completion rate', 'Average days between rounds', 'Client update open rate'],
    automations: [
      'Scheduler checks unresolved disputes nightly',
      'Auto-create tasks for escalations when 3rd response fails',
      'Send multilingual status updates via SMS/email'
    ],
    upsell: 'Offer a “Priority Rounds” add-on with accelerated review windows.',
    abTest: 'Compare educational vs progress-driven update messaging for retention.'
  },
  {
    id: 'billing-payments',
    icon: '💰',
    segments: ['Finance', 'Revenue'],
    title: 'Billing & Payment Reminder Workflow',
    purpose: 'Automate invoices, receipts, and payment nudges.',
    trigger: 'Trigger: Invoice created or payment due date approaching.',
    steps: [
      'Send invoice with payment link (Stripe, PayPal, etc.).',
      'Schedule reminder emails/texts at 3-day intervals.',
      'Auto-pause reminders if payment is received.'
    ],
    outcome: 'Reduce revenue leakage and manual chasing with automated billing ops.',
    kpis: ['Days Sales Outstanding', 'Payment recovery rate', 'Failed payment retry success'],
    automations: [
      'Stripe Checkout sessions via API',
      'Webhook to pause reminders on payment success',
      'Sync receipts to accounting'
    ],
    upsell: 'Introduce premium “Done-for-you billing” for partner agencies.',
    abTest: 'Experiment with payment CTA copy to lift conversion.'
  },
  {
    id: 'credit-monitoring',
    icon: '🔍',
    segments: ['Monitoring', 'Operations'],
    title: 'Credit Monitoring Refresh Workflow',
    purpose: 'Pull updated credit reports each month and flag changes.',
    trigger: 'Trigger: Monthly refresh date.',
    steps: [
      'Call IdentityIQ/SmartCredit API to request the latest report.',
      'Compare the new report to the previous version and detect changes.',
      'Notify the case owner or client of new items or score shifts.'
    ],
    outcome: 'Keep CRM data and client progress dashboards up to date.',
    kpis: ['Refresh completion rate', 'New item detection time', 'Client acknowledgement rate'],
    automations: [
      'Scheduled cron via server.js',
      'Diff engine highlights Metro-2 risk changes',
      'Auto-create tasks for new derogatory items'
    ],
    upsell: 'Offer monthly “Progress Pulse” reports as an add-on subscription.',
    abTest: 'Test PDF vs interactive dashboard for monthly update engagement.'
  },
  {
    id: 'compliance-docs',
    icon: '📚',
    segments: ['Compliance', 'Client Success'],
    title: 'Compliance & Document Upload Workflow',
    purpose: 'Collect IDs and proof of address before disputes are launched.',
    trigger: 'Trigger: Client signup completed.',
    steps: [
      'Send checklist (ID, proof of address, social security doc last4).',
      'Accept uploads through secure portal with PII redaction.',
      'Mark client as “Verified ID” and move to next pipeline stage.'
    ],
    outcome: 'No compliance delays; disputes stay audit-ready.',
    kpis: ['Checklist completion rate', 'Average time to verification', 'Document rejection rate'],
    automations: [
      'Use secure upload widgets with virus/OCR checks',
      'Auto-expire links after verification',
      'Sync compliance status to CRM stage'
    ],
    upsell: 'Sell a “Compliance Fast-Track” where staff reviews docs within 2 hours.',
    abTest: 'Experiment with video checklist explainer vs static text for completion.'
  },
  {
    id: 're-engagement',
    icon: '🔄',
    segments: ['Sales', 'Marketing'],
    title: 'Re-Engagement Workflow (Leads → Clients)',
    purpose: 'Convert cold leads or former clients via educational drips.',
    trigger: 'Trigger: Lead inactive for 14+ days.',
    steps: [
      'Send educational message on why consistent credit care matters.',
      'Deliver a limited-time promo or consultation offer.',
      'Auto-assign to a rep if the lead replies or clicks.'
    ],
    outcome: 'Revive dormant leads automatically and feed the sales calendar.',
    kpis: ['Reactivation rate', 'Consult bookings from drip', 'Offer acceptance rate'],
    automations: [
      'Segment leads by inactivity in CRM',
      'Send compliance drip via Twilio/SendGrid',
      'Webhook to create NEPQ task when a reply lands'
    ],
    upsell: 'Bundle a “Credit Readiness Audit” for reactivated leads at a special price.',
    abTest: 'Test urgency-based vs story-based copy for lead reply rate.'
  },
  {
    id: 'audit-reporting',
    icon: '🧾',
    segments: ['Analytics', 'Client Success'],
    title: 'Audit & Reporting Workflow',
    purpose: 'Calculate success rates and share progress recaps.',
    trigger: 'Trigger: Dispute round completed or monthly review cadence.',
    steps: [
      'Calculate percent of items deleted/updated in the last round.',
      'Update the client progress chart in the CRM.',
      'Send a progress email with recommended next actions.'
    ],
    outcome: 'Showcase visible wins to boost retention and referrals.',
    kpis: ['Report delivery rate', 'Satisfaction score', 'Referral requests sent'],
    automations: [
      'Use reportPipeline.js for calculations',
      'Include insights in templates',
      'Post summary to the client portal timeline'
    ],
    upsell: 'Offer quarterly strategy sessions based on the reports.',
    abTest: 'Compare concise vs detailed analytics sections for reader engagement.'
  },
  {
    id: 'escalation',
    icon: '🚀',
    segments: ['Compliance', 'Disputes'],
    title: 'Escalation Workflow (CFPB / AG / CRA)',
    purpose: 'Escalate repeated violations to regulators with full documentation.',
    trigger: 'Trigger: 3+ unverified responses from a bureau.',
    steps: [
      'Auto-generate a complaint packet (CFPB, Attorney General, etc.).',
      'Email compliance officer or admin for approval.',
      'Track escalation status and follow-up deadlines.'
    ],
    outcome: 'Adds professionalism and pressure without manual handling.',
    kpis: ['Escalation success rate', 'Average approval time', 'Regulator response time'],
    automations: [
      'Auto-fill complaint forms with metro2-core data',
      'Securely store supporting evidence',
      'Create compliance tasks with due dates'
    ],
    upsell: 'Offer an “Agency escalation” add-on for clients needing regulator support.',
    abTest: 'Test long-form vs bullet-point client updates post-escalation.'
  },
  {
    id: 'referral-review',
    icon: '💼',
    segments: ['Marketing', 'Retention'],
    title: 'Referral & Review Workflow',
    purpose: 'Convert happy clients into promoters and referral sources.',
    trigger: 'Trigger: Score improvement > 80 points or dispute success rate > 70%.',
    steps: [
      'Send thank-you note with Google/Facebook review link.',
      'Offer a referral bonus or partner incentive.',
      'Notify marketing when a review or referral is submitted.'
    ],
    outcome: 'Automated word-of-mouth that compounds lifetime value.',
    kpis: ['Review submission rate', 'Referral to consult %', 'Net Promoter Score'],
    automations: [
      'Trigger from analytics webhook when thresholds met',
      'Use review request API (NiceJob, Birdeye)',
      'Send referral payouts through Stripe'
    ],
    upsell: 'Introduce a “VIP Rewards Club” for clients who bring 3+ referrals.',
    abTest: 'Test testimonial video request vs written review CTA.'
  }
];

const state = {
  segment: 'all'
};

const segmentSelect = document.getElementById('segmentFilter');
const grid = document.getElementById('workflowGrid');

function renderFilters() {
  const segments = new Set();
  workflows.forEach((wf) => wf.segments.forEach((seg) => segments.add(seg)));
  segments.forEach((segment) => {
    if (!segmentSelect.querySelector(`option[value="${segment}"]`)) {
      const option = document.createElement('option');
      option.value = segment;
      option.textContent = segment;
      segmentSelect.appendChild(option);
    }
  });
  segmentSelect.value = state.segment;
}

function badgeTemplate(segment) {
  return `<span class="inline-flex items-center rounded-full bg-indigo-50 px-2.5 py-1 text-xs font-semibold text-indigo-600">${segment}</span>`;
}

function listTemplate(items) {
  return items.map((item) => `<li class="flex gap-2 text-sm text-slate-600"><span class="text-slate-400">•</span><span>${item}</span></li>`).join('');
}

function stepTemplate(steps) {
  return steps
    .map(
      (step, index) => `
      <li class="flex gap-3 text-sm text-slate-700">
        <span class="font-semibold text-slate-500">${index + 1}.</span>
        <span>${step}</span>
      </li>`
    )
    .join('');
}

function renderWorkflows() {
  const { segment } = state;
  grid.innerHTML = '';
  const fragment = document.createDocumentFragment();

  workflows
    .filter((wf) => segment === 'all' || wf.segments.includes(segment))
    .forEach((wf) => {
      const article = document.createElement('article');
      article.className = 'glass card p-6 space-y-4 shadow-sm';
      article.dataset.workflowId = wf.id;

      article.innerHTML = `
        <div class="flex flex-col gap-2 md:flex-row md:items-start md:justify-between">
          <div class="flex items-start gap-3">
            <span class="text-3xl" aria-hidden="true">${wf.icon}</span>
            <div>
              <h2 class="text-xl font-semibold">${wf.title}</h2>
              <p class="text-sm text-slate-600">${wf.purpose}</p>
            </div>
          </div>
          <div class="flex flex-wrap gap-2">${wf.segments.map(badgeTemplate).join('')}</div>
        </div>
        <div class="grid gap-4 md:grid-cols-2">
          <div class="space-y-3">
            <p class="text-sm font-semibold text-slate-500">${wf.trigger}</p>
            <ol class="space-y-2">${stepTemplate(wf.steps)}</ol>
            <p class="rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-700">${wf.outcome}</p>
          </div>
          <div class="space-y-3">
            <div>
              <h3 class="text-sm font-semibold text-slate-700">KPIs</h3>
              <ul class="space-y-1">${listTemplate(wf.kpis)}</ul>
            </div>
            <div>
              <h3 class="text-sm font-semibold text-slate-700">Automation</h3>
              <ul class="space-y-1">${listTemplate(wf.automations)}</ul>
            </div>
            <div class="rounded-lg bg-slate-100 px-3 py-2 text-sm text-slate-700">
              <p class="font-semibold text-slate-900">Upsell</p>
              <p>${wf.upsell}</p>
            </div>
            <div class="rounded-lg bg-slate-100 px-3 py-2 text-sm text-slate-700">
              <p class="font-semibold text-slate-900">A/B Idea</p>
              <p>${wf.abTest}</p>
            </div>
          </div>
        </div>
      `;

      fragment.appendChild(article);
    });

  grid.appendChild(fragment);
}

async function bootstrapWorkflowEngineSummary() {
  try {
    const res = await fetch('/api/workflows/config', { credentials: 'include' });
    if (!res.ok) return;
    const data = await res.json();
    if (!data?.summary) return;

    const summary = data.summary;
    const lettersRuleSet = (summary.operations || []).find((op) => op.operation === 'letters.generate');
    const cadenceRule = lettersRuleSet?.rules?.find((rule) => rule.type === 'minInterval');
    const validationRule = lettersRuleSet?.rules?.find((rule) => rule.type === 'requireRecentEvent');
    const resolvedEvent = (summary.events || []).find((evt) => evt.eventType === 'dispute_resolved');

    const steps = [];
    if (cadenceRule) {
      steps.push(`Blocks disputes if a bureau was hit within ${cadenceRule.intervalDays} day(s).`);
    }
    if (validationRule) {
      const mode = validationRule.enforcement === 'warn' ? 'warns' : 'requires';
      steps.push(`${mode.charAt(0).toUpperCase()}${mode.slice(1)} validation within ${validationRule.maxAgeDays} day(s).`);
    }
    if (resolvedEvent?.actions?.length) {
      steps.push('Auto-schedules bilingual follow-up reminders when disputes resolve.');
    }
    if (!steps.length) {
      steps.push('Configure cadence, validation, and follow-up triggers inside the workflow engine.');
    }

    const engineWorkflow = {
      id: 'workflow-engine',
      icon: '🧠',
      segments: ['Automation', 'Compliance'],
      title: 'Workflow Engine Rules',
      purpose: 'Configurable rules enforce dispute spacing, validation freshness, and follow-up automation.',
      trigger: `Trigger: ${lettersRuleSet ? 'Letters.generate + dispute events' : 'Workflow events'}`,
      steps,
      outcome: 'Keep dispute rounds compliant and revenue-focused without manual spreadsheet policing.',
      kpis: ['Avg days between disputes', 'Validation recency %', 'Follow-up completion rate'],
      automations: [
        'API: GET/PUT /api/workflows/config to edit rules',
        'API: POST /api/workflows/validate for pre-flight checks',
        'Auto reminders + notifications when disputes resolve (English/Spanish copy)'
      ],
      upsell: 'Offer “Managed Workflow Governance” for partner agencies needing compliance audits.',
      abTest: 'Test advisor messaging (gentle warning vs hard stop) to maximize throughput without risking compliance.',
    };

    const existing = workflows.findIndex((wf) => wf.id === 'workflow-engine');
    if (existing !== -1) {
      workflows.splice(existing, 1);
    }
    workflows.unshift(engineWorkflow);
    renderFilters();
    renderWorkflows();
  } catch (err) {
    console.warn('Failed to load workflow engine summary', err);
  }
}

segmentSelect.addEventListener('change', (event) => {
  state.segment = event.target.value;
  renderWorkflows();
});

renderFilters();
renderWorkflows();
bootstrapWorkflowEngineSummary();
