// ─── Globe meridian animation (injected once) ───────────────────────────────
(function () {
  if (!document.getElementById('evolv-globe-style')) {
    var gs = document.createElement('style');
    gs.id = 'evolv-globe-style';
    gs.textContent =
      '@keyframes evolv-meridian{0%{transform:scaleX(1)}25%{transform:scaleX(0)}50%{transform:scaleX(-1)}75%{transform:scaleX(0)}100%{transform:scaleX(1)}}' +
      '.evolv-globe-meridian{animation:evolv-meridian 2.4s linear infinite;transform-box:fill-box;transform-origin:center}' +
      '.evolv-globe-meridian2{animation:evolv-meridian 2.4s linear infinite -1.2s;transform-box:fill-box;transform-origin:center}';
    document.head.appendChild(gs);
  }
})();

const TOUR_ICON_SVG = `<svg viewBox="0 0 48 48" xmlns="http://www.w3.org/2000/svg">
  <circle cx="24" cy="24" r="18.5" stroke="#d4a853" stroke-width="2" fill="none"/>
  <path d="M5.5 24 Q24 15 42.5 24" stroke="#d4a853" stroke-width="1.2" fill="none" opacity="0.65"/>
  <path d="M5.5 24 Q24 33 42.5 24" stroke="#d4a853" stroke-width="1.2" fill="none" opacity="0.65"/>
  <path d="M10.5 13 Q24 9 37.5 13" stroke="#d4a853" stroke-width="0.9" fill="none" opacity="0.45"/>
  <path d="M10.5 35 Q24 39 37.5 35" stroke="#d4a853" stroke-width="0.9" fill="none" opacity="0.45"/>
  <ellipse class="evolv-globe-meridian" cx="24" cy="24" rx="9.5" ry="18.5" stroke="#d4a853" stroke-width="2" fill="none"/>
  <ellipse class="evolv-globe-meridian2" cx="24" cy="24" rx="9.5" ry="18.5" stroke="#d4a853" stroke-width="1.5" fill="none" opacity="0.5"/>
  <text x="24" y="30" text-anchor="middle" font-family="Georgia, serif" font-size="14" font-weight="900" fill="#d4a853">?</text>
</svg>`;

// ─── Helpers ─────────────────────────────────────────────────────────────────
function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, function (c) {
    return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
  });
}

const TOUR_STORAGE_KEY = 'evolv.tours';
function getTourState() {
  try { return JSON.parse(localStorage.getItem(TOUR_STORAGE_KEY)) || {}; } catch { return {}; }
}
function saveTourState(state) {
  localStorage.setItem(TOUR_STORAGE_KEY, JSON.stringify(state));
}

// ─── Tour step data ───────────────────────────────────────────────────────────
const PAGE_TOURS = {
  dashboard: {
    label: 'Dashboard',
    icon: '📊',
    desc: 'Your command center — metrics, focus, and growth at a glance',
    steps: [
      { target: '[data-tour="hero"], .hero-gold-section, .dashboard-hero', title: 'Welcome to Your Command Center!', body: "This is your dashboard — the heartbeat of your entire credit repair business. Everything you need to know about your operation is right here on one screen. Think of it as mission control. Let me walk you through each section so you can get the most out of it!" },
      { target: '#btnGoal', title: 'Daily Goal Tracker', body: "Start every day with intention. This button lets you mark your daily goal as done — whether it's booking consultations, sending letters, or following up with leads. The hero section also shows three key sub-metrics: your consultation fill rate, active automation flows, and upsell pipeline value." },
      { target: '[data-tour="focus"], #focusList, #focusEditButton', title: 'Daily Focus Priorities', body: "This is your personal productivity zone. Set your top 3 priorities each morning by clicking the Edit button. Your focus items persist so you can check them off as you go. Top performers in credit repair start every day with clear priorities — this makes it effortless." },
      { target: '#nextRevenueWin', title: 'Next Revenue Win', body: "This card highlights your most immediate revenue opportunity — the next action you can take to bring in money. Think of it as your personal revenue coach, always pointing you toward the quickest win available right now." },
      { target: '[data-tour="news"], #newsFeed', title: 'Live News Feed', body: "Your real-time news stream shows the latest activity across your business — new client signups, letters generated, dispute responses, and system updates. This is your business pulse. If something important happened while you were away, you'll see it here first." },
      { target: '[data-tour="messages"], #msgList', title: 'Messages Center', body: "All your client messages and notifications appear here in one place. Whether a client uploads a document, asks a question through their portal, or a team member sends you an update — it shows up in this feed." },
      { target: '[data-tour="events"], #eventList', title: 'Upcoming Events', body: "This card shows your next scheduled appointments, consultation calls, and important deadlines. Use this to prepare — pull up client files, review their dispute status, and have talking points ready before each call." },
      { target: '[data-tour="kpi"], #tourKpiSection', title: 'Business KPI Cards', body: "These four key performance indicators give you the big picture at a glance: Total Leads, Active Clients, Sales Revenue, and Payments Collected. Watch the trend arrows — green means growing, red means declining. Check these daily to catch issues early." },
      { target: '[data-tour="notepad"], #tourNotepadCard', title: 'Quick Notepad', body: "Your built-in notepad for capturing ideas, talking points, and action items on the fly. Create titled notes, save them, and access them anytime from the dropdown. Everything saves automatically to your account." },
      { target: '[data-tour="retention"], #dashRetention', title: 'Client Retention Rate', body: "This metric shows what percentage of your clients stay with you month over month. A healthy credit repair business maintains 85%+ retention. If this number dips, focus on regular progress updates and quick wins in the first 30 days." },
      { target: '[data-tour="conversion"], #dashConversion', title: 'Lead Conversion Rate', body: "Your conversion rate measures how effectively you turn leads into paying clients. Industry average is 15-25% — improving it even by 5% can significantly impact your bottom line." },
      { target: '[data-tour="deletion"], #dashDeletion', title: 'Deletion Success Tracking', body: "Track your dispute success metrics here — how many negative items have been removed or updated across all your clients. Use these insights to refine your approach and deliver better results." },
      { target: '[data-tour="ladder"], #ladderTitle', title: 'Revenue Ladder to 7 Figures', body: "The Revenue Ladder is your visual roadmap to scaling your credit repair business. It shows your Monthly Recurring Revenue, Pipeline Forecast, and Average Order Value side by side with a progress bar tracking you toward your revenue goal." },
      { target: '[data-tour="map"], #tourMapCard', title: 'Client Geographic Heatmap', body: "This interactive map shows where your clients are concentrated across the country. Use this intelligence to plan your marketing — identify underserved markets where competition is low and schedule in-person consultations efficiently." }
    ]
  },
  clients: {
    label: 'Clients',
    icon: '👥',
    desc: 'Manage, track, and grow your client base',
    steps: [
      { target: '#clientsMetrics, .workspace-hero, [data-tour="clients-hero"]', title: 'Clients: Your Full Roster at a Glance', body: "This page is the heart of your credit repair operation — every client you're helping is managed from here. The metrics panel at the top shows Active Clients (currently enrolled), revenue collected, and fulfillment progress. Think of it as your client database and operations dashboard in one place." },
      { target: '#consumerSearch, [data-tour="client-search"]', title: 'Client Search: Instant Lookup', body: "Type any part of a client's name, email, or phone number and your list filters instantly. With dozens or hundreds of clients, this search saves you minutes every day. You can also search by creditor name to quickly find all clients who have a dispute with a specific bank or collections agency." },
      { target: '#btnCreateClient, [data-tour="add-client"]', title: 'Create Client: Start a New Case', body: "Click here to onboard a new client. Enter their contact information, and once they're in the system you can upload their credit reports (PDF or HTML format), run a full bureau analysis, and start generating dispute letters — all without leaving this page. Faster onboarding means faster results." },
      { target: '#consumerList, [data-tour="client-list"]', title: 'Client List: Your Active Case Files', body: "Every client you're working with appears in this sidebar list. Click any name to load their full file in the main panel — credit report data, tradelines (individual accounts), letters sent, and messages. The list updates in real time as you add clients or load reports." },
      { target: '#tlList, [data-tour="negative-items"]', title: 'Tradelines & Negative Items: Where Disputes Are Born', body: "A tradeline is any account on a credit report — credit cards, loans, collections, judgments. When you upload a client's report, their tradelines appear here. The system automatically flags potential violations. Check the items you want to dispute, pick a letter template, and you're ready to generate. This panel is where credit repair actually happens." },
      { target: '#btnGenerate, [data-tour="generate-letters"]', title: 'Generate Dispute Letters', body: "After selecting the negative items to dispute, click Generate Letters. The system creates professionally written, legally precise dispute letters — referencing the FCRA (Fair Credit Reporting Act, the federal law that gives consumers the right to challenge inaccurate credit information) and pulling the client's exact account details automatically. Generate one at a time or in bulk across multiple accounts." }
    ]
  },
  leads: {
    label: 'Leads',
    icon: '🎯',
    desc: 'Capture, nurture, and convert prospects into paying clients',
    steps: [
      { target: '.lead-stats, .stats-cards, [data-tour="lead-stats"]', title: 'Lead Performance Metrics', body: "These cards give you the big picture of your sales pipeline. Total Leads shows everyone in your funnel. New (7 Days) tells you how many fresh prospects came in this week. Win Rate is your conversion percentage — industry average is 15-25%, so aim to beat that." },
      { target: '.intake-form-section, [data-tour="intake-form"], .new-lead-intake', title: 'Lead Intake Form: Your Secret Weapon', body: "When a prospect calls or fills out your website form, enter their details here — name, contact info, how they found you, their pain points, and credit goals. The 3-step process guides you through capturing and qualifying each lead with the NEPQ method." },
      { target: '.pipeline-snapshot, [data-tour="pipeline"]', title: 'Pipeline Snapshot: Track Every Lead Stage', body: "The Pipeline Snapshot shows exactly where each lead stands in your sales process. Track the source (Webinar, Referral, Ads) and current stage (New, Contacted, Consultation Booked, Won, Lost). Identify bottlenecks and optimize your follow-up strategy." },
      { target: '.win-rate-card, [data-tour="win-rate"]', title: 'Win Rate Tracking', body: "Your win rate tells the real story of your sales effectiveness. Even moving from 10% to 20% can double your revenue. Focus on improving your consultation script, following up within 24 hours, and offering a clear value proposition." },
      { target: '[data-tour="add-lead"], .add-lead-btn, .lead-form', title: 'Quick Lead Capture', body: "When you need to log a lead fast — maybe someone just called or DM'd you — use quick capture. Studies show responding to a lead within 5 minutes makes you 21x more likely to convert them. Get the name and number in, then circle back to fill in the rest." }
    ]
  },
  library: {
    label: 'Letter Library',
    icon: '📚',
    desc: 'Your arsenal of dispute letter templates and sequences',
    steps: [
      { target: '.library-hero, [data-tour="library-hero"]', title: 'Letter Library: Your Dispute Arsenal', body: "Every dispute letter template you'll ever need is organized here by category, violation type, and bureau. These aren't generic templates — each one is crafted based on real FCRA, FDCPA, and Metro-2 compliance standards." },
      { target: '#templatePanel, [data-tour="templates"]', title: 'Template Categories', body: "Templates are organized by dispute type: Initial Disputes (Round 1 letters), Validation Letters (debt collector verification), Goodwill Letters (removal based on good history), Legal Threat Letters (when other rounds fail), and Bureau-Specific Letters for each bureau individually." },
      { target: '#sequencePanel, [data-tour="sequences"]', title: 'Automated Letter Sequences: Your Autopilot', body: "Letter Sequences handle your dispute follow-up automatically. Round 1 goes out immediately, Round 2 fires 35 days later, Round 3 escalates with legal language. Set it once per client and the system handles the follow-up calendar for you." },
      { target: '#editorPanel, [data-tour="editor"]', title: 'Smart Letter Editor', body: "The editor auto-fills your client's name, address, account numbers, and violation details using merge fields. It also checks for compliance — flagging missing required disclosures before you send. Every letter looks professionally crafted." }
    ]
  },
  billing: {
    label: 'Billing',
    icon: '💳',
    desc: 'Manage your subscription, payments, and feature access',
    steps: [
      { target: '[data-tour="billing-plans"], .pricing-grid', title: 'Subscription Plans', body: "Starter ($97/mo) is perfect when you're getting off the ground — core features for up to 25 clients. Growth ($297/mo) unlocks bulk automation and AI-powered letters for up to 150 clients. Enterprise ($597/mo) removes all limits and adds white-labeling and API access." },
      { target: '[data-tour="billing-status"], .subscription-status', title: 'Your Current Subscription', body: "This section shows your active plan, next billing date, payment method on file, and current usage against your plan limits. You can also view your complete billing history, download invoices for tax purposes, and update your payment method." },
      { target: '[data-tour="billing-portal"], .manage-btn, .portal-btn', title: 'Manage Subscription', body: "Click here to open the Stripe customer portal where you can update your card, switch plans, or cancel. Changes take effect immediately — upgrades are prorated. There are no long-term contracts or cancellation fees." }
    ]
  },
  settings: {
    label: 'Settings',
    icon: '⚙️',
    desc: 'Configure integrations, shortcuts, and workspace preferences',
    steps: [
      { target: '[data-tour="api-cards"], .settings-cards', title: 'API & Integration Hub', body: "Each card represents a connected service: Stripe handles client billing and subscription payments. OpenAI powers AI-generated dispute letters customized for each violation. Green checkmarks mean active connections. Click any card to configure API keys." },
      { target: '[data-tour="shortcuts"], .shortcut-section', title: 'Keyboard Shortcuts: Power-User Speed', body: "Press Cmd+K (or Ctrl+K) to open the command palette from anywhere. Each page has its own shortcuts for common actions like 'N' for new client, 'S' for search, or 'L' to jump to letters. Customize these to match your preferred workflow." },
      { target: '[data-tour="portal-settings"], .portal-config', title: 'Client Portal Settings', body: "Configure what your clients see when they log into their personal portal. A well-configured portal reduces client calls by 60% because clients can self-serve their status updates instead of calling you." }
    ]
  },
  letters: {
    label: 'Letters',
    icon: '✉️',
    desc: 'View, manage, and track all generated dispute letters',
    steps: [
      { target: '[data-tour="letter-list"], .letter-list, .letter-queue', title: 'Dispute Letter Queue: Your Dispatch Center', body: "Every dispute letter you've ever generated is cataloged here with full details: client name, letter type, target bureau or creditor, date created, and current status (Draft, Ready to Send, Sent, Response Received). Click any letter to preview, download, or resend." },
      { target: '[data-tour="letter-actions"], .letter-actions, .action-buttons', title: 'Letter Actions & Tracking', body: "Download as PDF for printing and mailing, send via certified mail tracking, mark as 'Response Received' when bureaus reply, or generate the next round if the dispute wasn't resolved. The tracking system logs every action with timestamps — a complete audit trail." },
      { target: '[data-tour="letter-generate"], .generate-btn', title: 'Generate New Letters', body: "This button takes you through the generation flow: select a client, choose violations to dispute, pick a template or let AI craft one, review the content, and generate. Create letters one at a time for precision or batch-generate dozens at once." }
    ]
  },
  tradelines: {
    label: 'Tradelines',
    icon: '📋',
    desc: 'Upload credit reports and analyze tradeline violations',
    steps: [
      { target: '[data-tour="tradeline-upload"], .upload-section, .report-upload', title: 'Credit Report Upload: Analysis Begins Here', body: "Upload your client's credit report (PDF or text format) and our Metro-2 engine parses every tradeline and checks it against Metro-2 compliance standards. Processing takes just seconds and covers all three bureaus simultaneously." },
      { target: '[data-tour="tradeline-results"], .tradeline-list, .violations-panel', title: 'Violation Analysis Results', body: "After processing, you'll see every violation organized by severity: Critical (wrong Social Security numbers, accounts that don't belong), Major (incorrect balances, wrong payment history), and Minor (formatting issues). Each violation is your legal ammunition." },
      { target: '[data-tour="tradeline-cross-bureau"], .cross-bureau', title: 'Cross-Bureau Comparison', body: "Automatically compares how each account is reported across TransUnion, Experian, and Equifax. Inconsistencies between bureaus prove at least one is wrong. These findings often result in the fastest deletions because they're the hardest for bureaus to defend." },
      { target: '[data-tour="tradeline-generate"], .generate-letters-btn', title: 'Generate Letters from Violations', body: "Click here to automatically generate dispute letters targeting each finding. The system matches the right letter template to each violation type, addresses it to the correct bureau, and includes the specific account details and legal citations." }
    ]
  },
  schedule: {
    label: 'Schedule',
    icon: '📅',
    desc: 'Manage appointments, consultations, and follow-ups',
    steps: [
      { target: '[data-tour="schedule-cal"], .calendar-view, .schedule-calendar', title: 'Appointment Calendar: Your Time Hub', body: "This calendar shows all your booked consultations, follow-up calls, and scheduled tasks. Color-coded views let you see at a glance: blue for new consultations, green for follow-ups, gold for important deadlines. Your availability is automatically synced." },
      { target: '[data-tour="schedule-availability"], .availability-settings', title: 'Set Your Availability', body: "Control exactly when clients can book time with you. Set your working hours for each day of the week, block off personal time, and mark specific dates as unavailable. The default is Monday-Friday, 9am-5pm Eastern — customize it to match your actual schedule." },
      { target: '[data-tour="schedule-upcoming"], .upcoming-bookings', title: 'Upcoming Appointments', body: "Your next appointments in chronological order with client name, meeting type, contact info, and any notes provided when booking. Use this to prepare before each call — pull up their credit report and review their dispute status." },
      { target: '[data-tour="schedule-book"], .book-call-btn', title: 'Booking Link: Self-Schedule Made Easy', body: "Share your personal booking link on your website, email signature, or social media. Prospects can book instantly — no back-and-forth emails. The system sends automatic confirmations and reminders to reduce no-shows." }
    ]
  },
  marketing: {
    label: 'Marketing',
    icon: '📢',
    desc: 'Plan campaigns, track outreach, and grow your client base',
    steps: [
      { target: '[data-tour="marketing-hero"], .marketing-hero', title: 'Marketing Command Center', body: "Whether you're running Facebook ads, hosting webinars, doing local outreach, or building referral partnerships, everything is tracked here. Consistent multi-channel marketing is the key to sustainable growth in credit repair." },
      { target: '[data-tour="marketing-campaigns"], .campaign-list', title: 'Campaign Manager', body: "Create and manage marketing campaigns from start to finish. Set a name, budget, target audience, and channel. Track how many leads each campaign generates and calculate your cost per lead. Top credit repair businesses spend $20-50 per qualified lead." },
      { target: '[data-tour="marketing-templates"], .template-section', title: 'Marketing Templates: Proven Frameworks', body: "Proven templates for social media posts, email sequences, landing pages, and ad copy. Each template includes compliant language important since credit repair advertising has strict FTC regulations. Customize with your branding and unique value proposition." },
      { target: '[data-tour="marketing-analytics"], .analytics-section', title: 'Performance Analytics: Measure Everything', body: "Track your marketing ROI with detailed analytics: impressions, clicks, leads generated, conversion rates, and revenue attributed to each campaign. Each drop-off point reveals an optimization opportunity. Review these numbers weekly." }
    ]
  },
  workflows: {
    label: 'Workflows',
    icon: '⚡',
    desc: 'Automate repetitive tasks and build smart business rules',
    steps: [
      { target: '[data-tour="workflow-list"], .workflow-list', title: 'Automation Library: Clone Yourself', body: "Each workflow is a set of rules that trigger automatically: 'When a new client is added, send welcome email + create their portal login + schedule intro call.' The most successful credit repair businesses run 10-20 active workflows." },
      { target: '[data-tour="workflow-builder"], .workflow-editor', title: 'Workflow Builder: Visual Automation', body: "Start with a trigger (new client, letter sent, payment received), add conditions (if status equals X, if days since last letter > 30), and set actions (send email, generate letter, update status). Chain multiple steps together for complex automations." },
      { target: '[data-tour="workflow-templates"], .workflow-templates', title: 'Pre-Built Workflow Templates', body: "Pre-built templates cover the most common automations: New Client Onboarding (4 steps), Dispute Follow-Up Sequence (3 steps), Payment Reminder Series (5 steps), Client Progress Updates (2 steps), and Lead Nurture Drip (7 steps)." },
      { target: '[data-tour="workflow-logs"], .workflow-history', title: 'Automation Activity Log: Full Transparency', body: "Every automated action is logged here with timestamps, affected clients, and results. If a client asks 'Did you send my letter?' you can pull up the exact timestamp and proof. This ensures nothing falls through the cracks." }
    ]
  },
  'my-company': {
    label: 'My Company',
    icon: '🏢',
    desc: 'Configure your business identity and branding',
    steps: [
      { target: '[data-tour="company-info"], .company-info', title: 'Business Identity: Your Foundation', body: "Your company name, address, phone number, and email appear on every dispute letter, client portal, and communication you send. Make sure this information matches your business registration — bureaus reject letters from unverified business addresses." },
      { target: '[data-tour="company-logo"], .logo-section', title: 'Logo & Branding', body: "Upload your company logo and it automatically appears on your letterhead, client portal, email templates, and marketing materials. A professional logo builds trust — clients are 3x more likely to sign up when they see polished branding." },
      { target: '[data-tour="company-compliance"], .compliance-section', title: 'Compliance & Legal: Stay Protected', body: "Credit repair businesses must comply with the Credit Repair Organizations Act (CROA). This section manages your required disclosures, state-specific licensing, and mandatory client agreements. Staying compliant is both legal protection and a trust signal." }
    ]
  },
  'client-invoicing': {
    label: 'Client Invoicing',
    icon: '🧾',
    desc: 'Bill clients, track payments, and automate your revenue cycle',
    steps: [
      { target: '#invoiceCount', title: 'Client Invoicing: Revenue Command Center', body: "This is where you manage every dollar flowing into your credit repair business. From creating invoices and tracking payments to automating billing cycles, everything lives here. The invoice counter gives you an instant snapshot of your total volume." },
      { target: '#billingMetrics', title: 'Revenue Metrics Dashboard', body: "Four metric cards are your financial pulse: Total Billed, Outstanding (unpaid invoices needing follow-up), Next Due (upcoming payment with amount and date), and Collected YTD (actual money received this year). Review these weekly to spot slow-paying clients early." },
      { target: '#billingAutopayCard', title: 'Autopay Settings: Predictable Revenue', body: "When enabled, the system automatically drafts recurring invoices and processes payments on schedule. This eliminates the awkward 'your payment is overdue' conversations. Toggle it on, and your billing runs itself — freeing you to focus on growing your business." },
      { target: '#invoiceTable, #invoiceEmpty', title: 'Invoice History Table', body: "Every invoice you've ever created is logged here with full details: client name, amount, due date, status (Paid, Pending, Overdue), and payment date. This complete audit trail is essential for tax time and demonstrating the value you've delivered." },
      { target: '#planBuilder', title: 'Billing Plan Builder', body: "Create structured billing plans that define exactly how and when each client pays. Set a plan name, monthly amount, start date, and billing frequency. Once saved, the plan auto-generates invoices on schedule. Create different plans for different service tiers." },
      { target: '#invAmount, #invAdd', title: 'Quick Add Invoice', body: "Need to bill a client right now? Create a one-off invoice in seconds — pick the client, enter the amount, set the due date, and hit Add. Perfect for setup fees, one-time audit charges, or custom services outside a recurring plan." }
    ]
  },
  'client-portal-settings': {
    label: 'Client Portal Settings',
    icon: '🌐',
    desc: 'Customize the branded portal experience your clients see',
    steps: [
      { target: '#adminPanel, #clientPortalTitle', title: 'Client Portal Hub: Control the Experience', body: "This is where you control the entire experience your clients have when they log into their personal portal. A well-configured portal builds trust, reduces support calls by up to 60%, and makes your business look polished and professional." },
      { target: '#clientPortalModuleGrid', title: 'Portal Modules: Choose What Clients See', body: "These toggles control exactly which features your clients can see and use: dispute tracking, document uploads, payment history, letter previews, and progress reports. Customize these modules to match your service style and client expectations." },
      { target: '#portalBackgroundColor, #portalLogoUrl', title: 'Theme & Branding: Your Branded Product', body: "Set your background color to match your brand identity, upload your company logo, and customize the taglines that greet clients. Consistent branding across your portal, letters, and website creates a premium experience that justifies premium pricing." },
      { target: '#saveSettings, #portalThemeReset', title: 'Save & Reset Controls', body: "After customizing your portal, hit Save to push changes live instantly. If you ever want to undo experimental changes, the Reset to Defaults button restores original theme settings. Changes reflect immediately for all portal visitors." },
      { target: '#ctaPortalHeading', title: 'Concierge Portal Upgrade: New Revenue Stream', body: "Offer your clients a premium portal upgrade that includes priority dispute reviews and SMS alerts for an additional monthly fee. Clients get faster service, and you increase your lifetime value per client. Enable it and you've instantly added a new revenue stream." }
    ]
  },
  disputes: {
    label: 'Dispute Tracker',
    icon: '⚖️',
    desc: 'Track every dispute round and monitor bureau responses',
    steps: [
      { target: '.workspace-hero, [data-tour="disputes-hero"]', title: 'Dispute Tracker: Your Case Management System', body: "The dispute process is a multi-round journey. You send a dispute letter to the bureau, they have 30 days to investigate and respond, and if the item isn't removed you escalate with a stronger Round 2. This tracker gives you a complete case file for every client — every round sent, every bureau response received, and exactly what needs to happen next. Select a client below to load their history." },
      { target: '#consumerPicker', title: 'Select a Client to Review', body: "Choose which client's case you want to view from this dropdown. Their complete dispute history loads instantly — every letter sent to every bureau (TransUnion, Experian, Equifax), the dates, the responses received, and the current status of every disputed item. Open this before every client consultation call so you're fully prepared." },
      { target: '#disputeAnalysisCard', title: 'AI Report Analysis: Your Strategic Roadmap', body: "When a client's credit report has been uploaded and analyzed, this card shows the AI's findings — negative items ranked by deletion potential along with the recommended letter strategy for each. It highlights which items have the strongest grounds for removal: accounts past the 7-year reporting limit, Metro-2 format violations (technical data errors bureaus make), or FCRA violations (Fair Credit Reporting Act — the law that governs what can be on your report). Think of it as a second expert opinion on every case." },
      { target: '#letterHistoryCard', title: 'Letters Sent: Your Complete Audit Trail', body: "This card shows every dispute letter generated for this client — the letter type, which bureau or creditor it targeted, and the date it was created and sent. If a bureau ever claims they never received a dispute (which happens), this log combined with your certified mail tracking proves it was sent. A complete paper trail protects both you and your client if a case ever escalates to legal action." },
      { target: '#disputeTimeline', title: 'Dispute Timeline: The Full Case History', body: "The timeline is the heart of the tracker. Each entry shows a dispute round with its current status: Pending (letter sent, waiting to be mailed), Awaiting Response (in the 30-day investigation window), Resolved (bureau acknowledged), or Deleted (negative item removed — this is a win to celebrate with your client!). Use the checkboxes to select multiple rounds, then use the action toolbar to generate next-round letters, mark items resolved, or download a complete round summary." }
    ]
  },
  cfpb: {
    label: 'CFPB Complaints',
    icon: '🏛️',
    desc: 'Generate AI-drafted federal complaints for unresolved disputes',
    steps: [
      { target: '.workspace-hero, [data-tour="cfpb-hero"]', title: 'CFPB Complaints: Federal-Level Escalation', body: "The CFPB is the Consumer Financial Protection Bureau — a federal agency created to protect consumers from unfair financial practices. When a credit bureau continues to report information you've proven is wrong, or ignores your dispute entirely, filing a CFPB complaint brings federal regulators into the case. Bureaus respond to CFPB complaints far more seriously than direct dispute letters because the CFPB can investigate and fine them. This tool generates a legally precise complaint using AI in seconds." },
      { target: '#consumerSelect', title: 'Select Which Client This Is For', body: "Choose the client you're filing a complaint on behalf of. Their name, address, and contact details will be used in the complaint narrative automatically. Their previously uploaded negative items also load below — so you can specify exactly which accounts are part of the complaint. Precision matters: a complaint about one specific wrong item is more effective than a vague complaint about 'my whole credit report.'" },
      { target: '#cfpbFormSection', title: 'Complaint Details: Build a Strong Case', body: "Fill in who you're complaining about (Equifax, Experian, TransUnion, or a specific creditor like Capital One or Midland Credit), the type of violation (30-Day No Response, Inaccurate Reporting, Re-aged Debt — reporting a debt as newer than it really is — Identity Theft, etc.), the date you sent the original dispute, and what response you received. The more factual and specific your description, the harder the complaint is to dismiss." },
      { target: '#cfpbItemsPanel', title: 'Select the Disputed Accounts', body: "Check the specific accounts you want to include. These are pulled from the client's credit report data already in the system — or you can type a custom item manually if it's not there. Be precise: list only the accounts directly related to the violation you're reporting. A focused complaint targeting one or two specific accounts is far more effective than a broad complaint listing everything." },
      { target: '#btnGenerateCfpb', title: 'Generate the Complaint & Save to File', body: "Click Generate CFPB Complaint to have AI write two sections: a clear 'What Happened' narrative (a factual, chronological story of the violation) and a 'What Resolution I Am Seeking' statement (deletion, correction, or both). Both use formal, CFPB-appropriate language. Review the output, copy it to consumerfinance.gov/complaint to actually file it (filing is free and takes 5 minutes), then click Save to Record to attach the complaint to the client's permanent file." }
    ]
  },
  education: {
    label: 'Credit Academy',
    icon: '🎓',
    desc: 'Master credit repair, FCRA law, and dispute strategy',
    steps: [
      { target: '.workspace-hero, [data-tour="education-hero"]', title: 'Credit Academy: Master Your Craft', body: "The Credit Academy is your structured path to becoming a world-class credit repair professional. Whether you just started or have years of experience, the curriculum covers everything from credit report basics all the way to advanced Metro-2 dispute strategy. Metro-2 is the technical data format all three credit bureaus use — knowing it deeply lets you spot violations others miss." },
      { target: '.edu-header, [data-tour="edu-header"]', title: 'Your Learning Progress Dashboard', body: "Your Level badge shows your current rank in the academy — everyone starts at Beginner and earns XP (experience points) by completing lessons. The XP progress bar fills as you learn, and each level up is a real marker of expertise. Your streak counter tracks consecutive days of study. Even 10 minutes a day compounds into mastery over months." },
      { target: '#educationSection, #education', title: 'Course Catalog: Structured Learning Paths', body: "Lessons are organized by skill level so your learning builds progressively. Beginner covers credit report anatomy — what are the different sections, how are scores calculated, and what makes an item dispute-worthy. Intermediate dives into FCRA law (the Fair Credit Reporting Act — the federal law governing what can appear on your report) and the FDCPA (Fair Debt Collection Practices Act). Expert covers Metro-2 compliance and advanced escalation strategy." },
      { target: '.edu-xp-bar, .edu-xp-fill', title: 'XP & Level System: Gamified Mastery', body: "Every lesson you complete earns XP. Short lessons earn 50 XP; full modules earn 250 XP. As XP accumulates you level up through the mastery ladder: Beginner → Practitioner → Expert → Master. Each level represents real, applicable knowledge — clients can sense when their advisor truly understands the law vs. just following a script." },
      { target: '.edu-header .edu-level-badge, .edu-streak, [data-tour="edu-streak"]', title: 'Your Study Streak: Build the Habit', body: "Your streak counter shows how many consecutive days you've studied. Consistent daily learning is the single most effective habit for building credit repair expertise. If you miss a day, don't stop — simply start a new streak tomorrow. Top performers in this industry spend at least 15 minutes daily studying laws, new case strategies, and bureau behavior patterns." }
    ]
  },
  affiliate: {
    label: 'Affiliate Program',
    icon: '🔗',
    desc: 'Earn commissions by referring new users to Evolv',
    steps: [
      { target: '#affiliateNotJoined, #affiliateDashboard, #adminSection', title: 'Affiliate Program: Turn Referrals into Revenue', body: "When someone signs up for Evolv using your referral link, you earn a commission — automatically tracked and paid out on request. Whether you're a solo practitioner or a team, this adds passive income to your business without any extra work." },
      { target: '#affiliateNotJoined', title: 'Join to Get Started', body: "Click 'Join Affiliate Program' to activate your account and get your unique referral links — one for the DIY client-facing product and one for the CRM. Once joined, your dashboard tracks every click, signup, and commission earned in real time." },
      { target: '#affiliateDashboard', title: 'Affiliate Dashboard: Track Your Earnings', body: "Your dashboard shows: Total Clicks on your referral links, Signups converted, Total Earned, and your Conversion Rate. Below are your Earnings Breakdown, Payout History, and full Referral History. Click 'Request Payout' when your available balance is ready." },
      { target: '#ratesPanel', title: 'Commission Rate Schedule', body: "Admins can set commission rates for each product tier — DIY Basic, DIY Pro, DIY Tradeline purchases, and CRM Starter/Business/Enterprise plans. Higher-tier referrals pay more, so focus your outreach on prospects who need the full CRM experience." }
    ]
  },
  social: {
    label: 'Social Media Manager',
    icon: '📱',
    desc: 'Generate and schedule AI-crafted Facebook posts from RSS feeds',
    steps: [
      { target: '.workspace-hero, [data-tour="social-hero"]', title: 'Social Media Manager: Consistent Content on Autopilot', body: "Staying active on social media is one of the highest-ROI marketing activities for credit repair businesses — but most owners don't post consistently because content creation takes too much time. This tool eliminates that barrier. It connects to your Facebook Business Page, pulls fresh articles from news feeds (RSS feeds are automatic news streams from websites), and uses AI to craft compliant, engaging posts you can publish with one click." },
      { target: '#smTabs', title: 'Navigation Tabs: Four Tools in One', body: "Use the tabs at the top to switch between four sections. Facebook Connect is where you link your Business Page. RSS Feeds is where you add news sources the system pulls articles from. Compose is where AI turns any article into a ready-to-publish post. Post Queue shows your scheduled content waiting to go live." },
      { target: '#tab-connect, #connectBody', title: 'Facebook Connection: Link Your Business Page', body: "Connect your Facebook Business Page using your Facebook App ID and App Secret (the step-by-step guide on this page walks you through creating these in about 10 minutes — no programming required). Once connected, the status badge turns green and shows your page name. Every post created here publishes directly to that page." },
      { target: '#tab-feeds, #feedsList', title: 'RSS Feeds: Fresh Content Automatically', body: "RSS feeds are automatic news streams from websites. Add any RSS feed URL — the CFPB's official news feed, NerdWallet's credit tips, or your favorite credit industry blog — and the system pulls the latest articles automatically. Credit-related content performs especially well because it's timely and positions you as an informed expert. Add 3–5 feeds to always have fresh material available." },
      { target: '#tab-compose, #composeContent, #btnAiGenerate', title: 'AI Post Generator: Article to Post in Seconds', body: "Select an article from your RSS feeds (or type a topic manually), click 'Generate with AI,' and the system writes an engaging, compliant Facebook post in seconds. The AI avoids FTC-prohibited language (no guarantee of score increases or promised results) while writing in a tone that's relatable to consumers. Review, edit if needed, then publish immediately or schedule it for later. A week of content can be prepared in under 20 minutes." }
    ]
  },
  'marketing-sms': {
    label: 'Marketing — SMS',
    icon: '📲',
    desc: 'Build compliant SMS campaigns and save reusable templates',
    steps: [
      { target: '#marketingSmsBuilder', title: 'SMS Campaign Builder', body: "Build your campaign name, choose a recipient segment (All Leads, New Clients, Inactive Accounts), and write your message using merge fields like {{first_name}} and {{dispute_stage}} for personalization. A live phone preview shows exactly what recipients will see." },
      { target: '#smsMessage, #mergeFieldSelect', title: 'Merge Fields & Personalization', body: "Personalized messages get 3-5x higher response rates. Use the merge field dropdown to insert tokens directly into your message body. The character counter tracks your message length — SMS messages over 160 characters split into multiple segments, increasing cost." },
      { target: '#smsTemplateForm, #smsTemplateList', title: 'SMS Template Manager: Save and Reuse', body: "Save frequently-used messages as named templates organized by audience segment. Always include opt-out language — the guardrails here remind you to append 'Reply STOP' before going live. Templates push directly to your SMS automation backend via API." }
    ]
  },
  'marketing-email': {
    label: 'Marketing — Email',
    icon: '💌',
    desc: 'Design email templates, nurture sequences, and dispatch schedules',
    steps: [
      { target: '#marketingEmailBuilder', title: 'Email Template Designer', body: "Design branded email templates for every stage of the client journey — from lead nurture and onboarding to dispute updates and upsell offers. Filter templates by audience segment. Click 'New Template' to start from scratch or 'Import HTML' to upload an existing design." },
      { target: '#emailSequenceForm, #emailSequenceList', title: 'Email Sequence Builder: Autopilot Nurture', body: "Sequences are multi-step email flows that fire automatically on a schedule. A '7-Day Dispute Warm-Up' might send a welcome email day 1, a credit article day 3, and a consultation invite day 7. Once connected to your email provider, sequences run on autopilot." },
      { target: '#dispatchForm, #dispatchList', title: 'Dispatch Scheduler: Queue Your Sends', body: "The Dispatch Scheduler queues specific templates or sequences to go out to a segment at a scheduled time. Track open-to-consult rate after each dispatch and iterate on subject lines and CTAs to improve performance over time." }
    ]
  }
};

// ─── Page routing ─────────────────────────────────────────────────────────────
const PAGE_MAP = {
  'dashboard': 'dashboard', 'dashboard.html': 'dashboard',
  'clients': 'clients', 'index.html': 'clients',
  'leads': 'leads', 'leads.html': 'leads',
  'library': 'library', 'library.html': 'library',
  'billing': 'billing', 'billing.html': 'billing',
  'settings': 'settings', 'settings.html': 'settings',
  'letters': 'letters', 'letters.html': 'letters',
  'tradelines': 'tradelines', 'tradelines.html': 'tradelines',
  'schedule': 'schedule', 'schedule.html': 'schedule',
  'marketing': 'marketing', 'marketing.html': 'marketing',
  'workflows': 'workflows', 'workflows.html': 'workflows',
  'my-company': 'my-company', 'my-company.html': 'my-company',
  'client-invoicing': 'client-invoicing', 'client-invoicing.html': 'client-invoicing',
  'client-portal-settings': 'client-portal-settings', 'client-portal-settings.html': 'client-portal-settings',
  'disputes': 'disputes', 'disputes.html': 'disputes',
  'cfpb': 'cfpb', 'cfpb.html': 'cfpb',
  'education': 'education', 'education.html': 'education',
  'affiliate': 'affiliate', 'affiliate.html': 'affiliate',
  'social': 'social', 'facebook-manager': 'social', 'facebook-manager.html': 'social',
  'sms': 'marketing-sms', 'email': 'marketing-email'
};

const ROUTE_MAP = {
  'dashboard': '/dashboard', 'clients': '/clients', 'leads': '/leads',
  'library': '/library', 'billing': '/billing', 'settings': '/settings',
  'letters': '/letters', 'tradelines': '/tradelines', 'schedule': '/schedule',
  'marketing': '/marketing', 'workflows': '/workflows', 'my-company': '/my-company',
  'client-invoicing': '/client-invoicing', 'client-portal-settings': '/client-portal-settings',
  'disputes': '/disputes', 'cfpb': '/cfpb', 'education': '/education',
  'affiliate': '/affiliate', 'social': '/facebook-manager',
  'marketing-sms': '/marketing', 'marketing-email': '/marketing'
};

function getCurrentPageKey() {
  const path = window.location.pathname.replace(/^\//, '') || 'dashboard';
  const stem = path.replace(/\.html$/, '');
  return PAGE_MAP[stem] || PAGE_MAP[path] || null;
}

// ─── Tour Engine ──────────────────────────────────────────────────────────────
class EvolvTourEngine {
  constructor() {
    this._reset();
  }

  _reset() {
    this.overlay  = null;  // dark backdrop (catches outside-click to close)
    this.ring     = null;  // gold spotlight ring around target
    this.modal    = null;  // centered explanation card
    this.steps    = [];
    this.currentStep = 0;
    this.isActive = false;
    this.tourKey  = null;
    this.onComplete = null;
    this._keyHandler = null;
    this._prevTarget = null;
    this._resizeObserver = null;
  }

  // ── Public API ──────────────────────────────────────────────────────────────
  start(tourKey, options = {}) {
    const tour = PAGE_TOURS[tourKey];
    if (!tour) return;

    this.cleanup();
    this.tourKey    = tourKey;
    this.onComplete = options.onComplete || null;
    this.isActive   = true;

    // Include all steps; steps whose target is missing will fall back gracefully
    this.steps = tour.steps;
    if (!this.steps.length) return;

    this.currentStep = 0;
    this._createOverlay();
    this._showStep(0);
  }

  next() {
    if (!this.isActive) return;
    if (this.currentStep < this.steps.length - 1) {
      this._showStep(this.currentStep + 1);
    } else {
      this.finish(true);
    }
  }

  prev() {
    if (!this.isActive) return;
    if (this.currentStep > 0) this._showStep(this.currentStep - 1);
  }

  finish(completed) {
    if (!this.isActive) return;
    this.isActive = false;

    if (completed && this.tourKey) {
      const state = getTourState();
      state[this.tourKey] = { completed: true, date: new Date().toISOString() };
      saveTourState(state);
      this._showConfetti();
    }

    this.cleanup();
    if (this.onComplete) this.onComplete(completed);
  }

  cleanup() {
    // Remove landmark elements
    ['overlay', 'ring', 'modal'].forEach(k => {
      if (this[k] && this[k].parentNode) this[k].parentNode.removeChild(this[k]);
      this[k] = null;
    });

    // Remove highlight from target
    this._clearHighlight();

    // Keyboard
    if (this._keyHandler) {
      document.removeEventListener('keydown', this._keyHandler);
      this._keyHandler = null;
    }

    // ResizeObserver
    if (this._resizeObserver) {
      this._resizeObserver.disconnect();
      this._resizeObserver = null;
    }
  }

  // ── Internal: overlay creation ──────────────────────────────────────────────
  _createOverlay() {
    // 1. Dark backdrop — full-screen, catches clicks outside ring to close
    this.overlay = document.createElement('div');
    this.overlay.className = 'evolv-tour-overlay';
    this.overlay.setAttribute('role', 'presentation');
    document.body.appendChild(this.overlay);

    // 2. Spotlight ring — positioned at target, transparent inside, gold border,
    //    box-shadow creates the dark area outside. pointer-events:none so clicks
    //    on the overlay below can still be caught.
    this.ring = document.createElement('div');
    this.ring.className = 'evolv-tour-ring';
    this.ring.setAttribute('aria-hidden', 'true');
    document.body.appendChild(this.ring);

    // 3. Centered modal card
    this.modal = document.createElement('div');
    this.modal.className = 'evolv-tour-modal';
    this.modal.setAttribute('role', 'dialog');
    this.modal.setAttribute('aria-modal', 'true');
    this.modal.setAttribute('aria-label', 'Guided tour step');
    document.body.appendChild(this.modal);

    // Overlay click → close tour
    this.overlay.addEventListener('click', (e) => {
      if (!this.isActive) return;
      // Only close if NOT clicking within the ring bounds
      if (this.ring) {
        const rr = this.ring.getBoundingClientRect();
        const { clientX: x, clientY: y } = e;
        if (x >= rr.left && x <= rr.right && y >= rr.top && y <= rr.bottom) return;
      }
      this.finish(false);
    });

    // Keyboard navigation
    this._keyHandler = (e) => {
      if (!this.isActive) return;
      if (e.key === 'Escape')     { e.preventDefault(); this.finish(false); }
      if (e.key === 'ArrowRight' || e.key === 'Enter') { e.preventDefault(); this.next(); }
      if (e.key === 'ArrowLeft')  { e.preventDefault(); this.prev(); }
    };
    document.addEventListener('keydown', this._keyHandler);

    // Reposition ring on window resize
    this._resizeObserver = new ResizeObserver(() => this._repositionRing());
    this._resizeObserver.observe(document.body);
    window.addEventListener('resize', () => this._repositionRing(), { passive: true });
  }

  // ── Internal: step rendering ────────────────────────────────────────────────
  _showStep(index) {
    if (!this.isActive || index < 0 || index >= this.steps.length) return;
    this.currentStep = index;
    const step = this.steps[index];

    // Render modal first (so user sees progress immediately)
    this._renderModal(step);

    // Find and highlight target
    const target = this._findTarget(step);
    this._highlightTarget(target);

    if (target) {
      const rect = target.getBoundingClientRect();
      const vh = window.innerHeight;
      const elemCenterY = (rect.top + rect.bottom) / 2;
      // "Well-centered": element is fully visible AND its center sits in the middle 50% of viewport
      const wellCentered = rect.top >= 60 && rect.bottom <= vh - 60 &&
                           elemCenterY >= vh * 0.25 && elemCenterY <= vh * 0.75;

      if (wellCentered) {
        this._positionRing(rect);
      } else {
        target.scrollIntoView({ behavior: 'smooth', block: 'center' });
        this._waitForScroll(() => {
          if (this.isActive && this.currentStep === index) {
            this._positionRing(target.getBoundingClientRect());
          }
        });
      }
    } else {
      // No target found — hide ring, modal stays centered
      this._hideRing();
    }
  }

  // ── Internal: target finding ────────────────────────────────────────────────
  _findTarget(step) {
    if (!step.target) return null;
    const selectors = step.target.split(',').map(s => s.trim()).filter(Boolean);
    for (const sel of selectors) {
      try {
        const el = document.querySelector(sel);
        if (el) {
          const rect = el.getBoundingClientRect();
          // Accept element if it has any size or is in DOM
          if (rect.width > 0 || rect.height > 0 || el.offsetParent !== null) return el;
        }
      } catch { /* skip invalid selectors */ }
    }
    return null;
  }

  // ── Internal: target highlight ──────────────────────────────────────────────
  _clearHighlight() {
    if (this._prevTarget) {
      this._prevTarget.classList.remove('evolv-tour-target-active');
      this._prevTarget = null;
    }
  }

  _highlightTarget(el) {
    this._clearHighlight();
    if (!el) return;
    el.classList.add('evolv-tour-target-active');
    this._prevTarget = el;
  }

  // ── Internal: ring positioning ──────────────────────────────────────────────
  _positionRing(rect) {
    if (!this.ring || !rect) { this._hideRing(); return; }
    const pad = 10;

    // ring is position:fixed — use viewport-relative coords from getBoundingClientRect()
    this.ring.style.top    = `${rect.top    - pad}px`;
    this.ring.style.left   = `${rect.left   - pad}px`;
    this.ring.style.width  = `${rect.width  + pad * 2}px`;
    this.ring.style.height = `${rect.height + pad * 2}px`;
    this.ring.style.opacity = '1';
  }

  _hideRing() {
    if (this.ring) this.ring.style.opacity = '0';
  }

  _repositionRing() {
    if (!this.isActive || !this._prevTarget) return;
    this._positionRing(this._prevTarget.getBoundingClientRect());
  }

  // ── Internal: scroll settle detection ──────────────────────────────────────
  _waitForScroll(cb) {
    let lastY = window.scrollY, settled = 0, frames = 0;
    const check = () => {
      frames++;
      if (Math.abs(window.scrollY - lastY) < 0.5) settled++;
      else { settled = 0; lastY = window.scrollY; }
      if (settled >= 4 || frames >= 150) cb();
      else requestAnimationFrame(check);
    };
    requestAnimationFrame(check);
  }

  // ── Internal: modal rendering ───────────────────────────────────────────────
  _renderModal(step) {
    if (!this.modal) return;
    const total   = this.steps.length;
    const current = this.currentStep + 1;
    const isFirst = this.currentStep === 0;
    const isLast  = this.currentStep === total - 1;
    const prefersReduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    const dots = this.steps.map((_, i) => {
      let cls = 'evolv-tm__dot';
      if (i === this.currentStep)   cls += ' evolv-tm__dot--active';
      else if (i < this.currentStep) cls += ' evolv-tm__dot--done';
      return `<button class="${cls}" aria-label="Go to step ${i + 1}" data-step="${i}"></button>`;
    }).join('');

    this.modal.innerHTML = `
      <div class="evolv-tm ${prefersReduced ? 'evolv-tm--reduced' : ''}">
        <div class="evolv-tm__header">
          <div class="evolv-tm__logo">${TOUR_ICON_SVG}</div>
          <div class="evolv-tm__meta">
            <span class="evolv-tm__label">Guided Tour</span>
            <span class="evolv-tm__counter">${current} of ${total}</span>
          </div>
          <button class="evolv-tm__close" data-action="skip" aria-label="Close guided tour">✕</button>
        </div>
        <h2 class="evolv-tm__title">${esc(step.title)}</h2>
        <div class="evolv-tm__body">${step.body}</div>
        <div class="evolv-tm__footer">
          <div class="evolv-tm__dots" role="tablist" aria-label="Tour progress">${dots}</div>
          <div class="evolv-tm__actions">
            ${isFirst
              ? `<button class="evolv-tm__btn evolv-tm__btn--ghost" data-action="skip">Skip tour</button>`
              : `<button class="evolv-tm__btn evolv-tm__btn--ghost" data-action="prev">← Back</button>`
            }
            ${isLast
              ? `<button class="evolv-tm__btn evolv-tm__btn--primary" data-action="finish">Got it! 🔥</button>`
              : `<button class="evolv-tm__btn evolv-tm__btn--primary" data-action="next">Next →</button>`
            }
          </div>
        </div>
      </div>
    `;

    // Bind buttons
    this.modal.querySelectorAll('[data-action]').forEach(btn => {
      btn.addEventListener('click', e => {
        e.stopPropagation();
        const a = btn.dataset.action;
        if (a === 'next')   this.next();
        if (a === 'prev')   this.prev();
        if (a === 'skip')   this.finish(false);
        if (a === 'finish') this.finish(true);
      });
    });

    // Dot navigation
    this.modal.querySelectorAll('[data-step]').forEach(dot => {
      dot.addEventListener('click', e => {
        e.stopPropagation();
        this._showStep(parseInt(dot.dataset.step, 10));
      });
    });

    // Focus the modal for accessibility
    requestAnimationFrame(() => {
      const firstBtn = this.modal.querySelector('button');
      if (firstBtn) firstBtn.focus();
    });
  }

  // ── Internal: confetti ──────────────────────────────────────────────────────
  _showConfetti() {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const container = document.createElement('div');
    container.className = 'tour-confetti';
    document.body.appendChild(container);
    const colors = ['#d4a853', '#e8c875', '#c49a45', '#fff', '#f0d78c'];
    for (let i = 0; i < 60; i++) {
      const piece = document.createElement('div');
      piece.className = 'tour-confetti__piece';
      piece.style.cssText = [
        `left:${Math.random() * 100}%`,
        `background:${colors[Math.floor(Math.random() * colors.length)]}`,
        `animation-delay:${Math.random() * 0.9}s`,
        `animation-duration:${1.4 + Math.random() * 0.8}s`,
        `width:${4 + Math.random() * 7}px`,
        `height:${4 + Math.random() * 7}px`
      ].join(';');
      container.appendChild(piece);
    }
    setTimeout(() => { if (container.parentNode) container.remove(); }, 4000);
  }
}

// ─── Singleton engine ─────────────────────────────────────────────────────────
const tourEngine = new EvolvTourEngine();

function startPageTour(pageKey) {
  const key = pageKey || getCurrentPageKey();
  if (!key) return;
  tourEngine.start(key);
}

// ─── Tour menu ("Explore Evolv") ──────────────────────────────────────────────
async function showTourMenu() {
  const existing = document.querySelector('.tour-menu-overlay');
  if (existing) { existing.remove(); return; }

  const state       = getTourState();
  const currentPage = getCurrentPageKey();

  let autoShowOn = true;
  try {
    const tok = localStorage.getItem('token');
    if (tok) {
      const res = await fetch('/api/tour/status', { headers: { 'Authorization': 'Bearer ' + tok } });
      if (res.ok) { const d = await res.json(); autoShowOn = !d.dismissed; }
    }
  } catch (_) {}

  const menuItems = Object.entries(PAGE_TOURS).map(([key, tour]) => {
    const done      = state[key]?.completed;
    const isCurrent = key === currentPage;
    return `
      <div class="tour-menu__item" data-tour-key="${esc(key)}">
        <div class="tour-menu__item-icon">${esc(tour.icon)}</div>
        <div class="tour-menu__item-text">
          <div class="tour-menu__item-label">${esc(tour.label)}${isCurrent ? ' <em>(current page)</em>' : ''}</div>
          <div class="tour-menu__item-desc">${esc(tour.desc)}</div>
        </div>
        ${done ? '<span class="tour-menu__item-badge">✓ Done</span>' : ''}
      </div>`;
  }).join('');

  const overlay = document.createElement('div');
  overlay.className = 'tour-menu-overlay';
  overlay.innerHTML = `
    <div class="tour-menu" style="position:relative;">
      <button class="tour-menu__close" data-close aria-label="Close menu">✕</button>
      <div class="tour-menu__header">
        <div class="tour-phoenix" style="width:56px;height:56px;">${TOUR_ICON_SVG}</div>
        <div>
          <div class="tour-menu__title">Explore Evolv</div>
          <div class="tour-menu__subtitle">Choose a section to learn about</div>
        </div>
      </div>
      <div class="tour-menu__list" style="max-height:400px;overflow-y:auto;">
        <div class="tour-menu__item tour-menu__item--full" data-tour-key="__current__">
          <div class="tour-menu__item-icon">🔥</div>
          <div class="tour-menu__item-text">
            <div class="tour-menu__item-label">Tour This Page</div>
            <div class="tour-menu__item-desc">Let Evolv walk you through what's on screen</div>
          </div>
        </div>
        ${menuItems}
      </div>
      <div class="tour-menu__footer">
        <span class="tour-menu__footer-label">Auto-show on login</span>
        <button class="tour-menu__footer-toggle ${autoShowOn ? 'tour-menu__footer-toggle--on' : 'tour-menu__footer-toggle--off'}"
                data-action="toggle-autoshow">${autoShowOn ? 'On' : 'Off'}</button>
      </div>
    </div>`;

  overlay.addEventListener('click', (e) => {
    if (e.target === overlay || e.target.closest('[data-close]')) { overlay.remove(); return; }

    const toggleBtn = e.target.closest('[data-action="toggle-autoshow"]');
    if (toggleBtn) {
      const isOn = toggleBtn.classList.contains('tour-menu__footer-toggle--on');
      if (isOn) {
        dismissTourServer();
        toggleBtn.classList.replace('tour-menu__footer-toggle--on', 'tour-menu__footer-toggle--off');
        toggleBtn.textContent = 'Off';
      } else {
        undismissTourServer();
        const s = getTourState(); delete s._welcomed; saveTourState(s);
        toggleBtn.classList.replace('tour-menu__footer-toggle--off', 'tour-menu__footer-toggle--on');
        toggleBtn.textContent = 'On';
      }
      return;
    }

    const item = e.target.closest('[data-tour-key]');
    if (!item) return;
    const key = item.dataset.tourKey;
    overlay.remove();

    if (key === '__current__') {
      const current = getCurrentPageKey();
      if (current) tourEngine.start(current);
      return;
    }
    if (key === getCurrentPageKey()) {
      tourEngine.start(key);
    } else {
      const route = ROUTE_MAP[key];
      if (route) { sessionStorage.setItem('evolv.tour.autostart', key); window.location.href = route; }
    }
  });

  document.body.appendChild(overlay);
}

// ─── Server dismiss / undismiss ───────────────────────────────────────────────
function dismissTourServer() {
  try {
    const tok = localStorage.getItem('token');
    if (!tok) return;
    fetch('/api/tour/dismiss', { method: 'POST', headers: { 'Authorization': 'Bearer ' + tok } }).catch(() => {});
  } catch (_) {}
}

function undismissTourServer() {
  try {
    const tok = localStorage.getItem('token');
    if (!tok) return;
    fetch('/api/tour/undismiss', { method: 'POST', headers: { 'Authorization': 'Bearer ' + tok } }).catch(() => {});
  } catch (_) {}
}

// ─── Auto-start check ─────────────────────────────────────────────────────────
async function checkAutoStartTour() {
  const pending = sessionStorage.getItem('evolv.tour.autostart');
  if (pending) {
    sessionStorage.removeItem('evolv.tour.autostart');
    setTimeout(() => tourEngine.start(pending), 800);
    return;
  }

  const state = getTourState();
  if (state._welcomed) return;

  try {
    const tok = localStorage.getItem('token');
    if (tok) {
      const res = await fetch('/api/tour/status', { headers: { 'Authorization': 'Bearer ' + tok } });
      if (res.ok) {
        const data = await res.json();
        if (data.dismissed) { state._welcomed = true; saveTourState(state); return; }
      }
    }
  } catch (_) {}

  const currentPage = getCurrentPageKey();
  if (currentPage) {
    state._welcomed = true;
    saveTourState(state);
    setTimeout(() => showWelcome(), 2000);
  }
}

// ─── Welcome card ─────────────────────────────────────────────────────────────
function showWelcome() {
  const existing = document.querySelector('.tour-welcome');
  if (existing) return;

  const overlay = document.createElement('div');
  overlay.className = 'tour-welcome';
  overlay.innerHTML = `
    <div class="tour-welcome__card">
      <div class="tour-welcome__phoenix">${TOUR_ICON_SVG}</div>
      <div class="tour-welcome__title">Hi! I'm Evolv 🔥</div>
      <div class="tour-welcome__body">
        I'm your personal guide to mastering your credit repair business. Want me to show you around? I'll walk you through everything — it only takes a minute!
      </div>
      <div class="tour-welcome__opt-out">
        <label class="tour-welcome__opt-out-label">
          <input type="checkbox" id="tourDontShowAgain" class="tour-welcome__opt-out-check">
          Don't show this again
        </label>
      </div>
      <div class="tour-welcome__actions">
        <button class="tour-welcome__btn tour-welcome__btn--start" data-action="start">Show Me Around!</button>
        <button class="tour-welcome__btn tour-welcome__btn--skip" data-action="skip">I'll Explore On My Own</button>
      </div>
    </div>`;

  overlay.addEventListener('click', (e) => {
    const action = e.target.closest('[data-action]')?.dataset?.action;
    if (action === 'start') {
      const checked = overlay.querySelector('#tourDontShowAgain')?.checked;
      overlay.remove();
      if (checked) dismissTourServer();
      const current = getCurrentPageKey();
      if (current) tourEngine.start(current);
    } else if (action === 'skip' || e.target === overlay) {
      const checked = overlay.querySelector('#tourDontShowAgain')?.checked;
      overlay.remove();
      if (checked) dismissTourServer();
    }
  });

  document.body.appendChild(overlay);
}

// ─── Reset ────────────────────────────────────────────────────────────────────
function resetAllTours() {
  localStorage.removeItem(TOUR_STORAGE_KEY);
  sessionStorage.removeItem('evolv.tour.autostart');
}

// ─── Public API ───────────────────────────────────────────────────────────────
window.EvolvTour = {
  start: startPageTour,
  showMenu: showTourMenu,
  showWelcome,
  reset: resetAllTours,
  engine: tourEngine,
  PAGE_TOURS,
  getCurrentPageKey
};

// ─── Event bridge (sidebar integration) ───────────────────────────────────────
window.addEventListener('crm:tutorial-request', (event) => {
  const mode = event?.detail?.mode || 'start';
  if (mode === 'menu') showTourMenu();
  else startPageTour();
});

window.addEventListener('crm:tutorial-reset', () => resetAllTours());

// ─── Boot ─────────────────────────────────────────────────────────────────────
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => setTimeout(checkAutoStartTour, 1000));
} else {
  setTimeout(checkAutoStartTour, 1000);
}

export { tourEngine, startPageTour, showTourMenu, showWelcome, resetAllTours, PAGE_TOURS, getCurrentPageKey };
export function setupPageTour() {
  return { startTour: startPageTour, resetTour: resetAllTours, refreshHelpState: () => {} };
}
