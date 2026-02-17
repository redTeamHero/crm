const BUTTERFLY_SVG = `<svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg">
  <g transform="translate(50,50)">
    <g class="tour-butterfly__wing-l" transform="translate(-2,0)">
      <path d="M-5,-5 C-25,-35 -50,-30 -45,-10 C-42,2 -25,8 -5,2 Z" fill="#d4a853" opacity="0.9"/>
      <path d="M-5,5 C-25,30 -45,28 -40,12 C-37,2 -22,-2 -5,2 Z" fill="#c49a45" opacity="0.85"/>
      <path d="M-8,-3 C-18,-22 -35,-20 -32,-8 Z" fill="#e8c875" opacity="0.4"/>
      <path d="M-8,5 C-18,20 -32,18 -28,8 Z" fill="#e8c875" opacity="0.3"/>
    </g>
    <g class="tour-butterfly__wing-r" transform="translate(2,0)">
      <path d="M5,-5 C25,-35 50,-30 45,-10 C42,2 25,8 5,2 Z" fill="#d4a853" opacity="0.9"/>
      <path d="M5,5 C25,30 45,28 40,12 C37,2 22,-2 5,2 Z" fill="#c49a45" opacity="0.85"/>
      <path d="M8,-3 C18,-22 35,-20 32,-8 Z" fill="#e8c875" opacity="0.4"/>
      <path d="M8,5 C18,20 32,18 28,8 Z" fill="#e8c875" opacity="0.3"/>
    </g>
    <ellipse cx="0" cy="0" rx="3.5" ry="12" fill="#1a1a1a"/>
    <circle cx="-1.5" cy="-8" r="1.8" fill="#d4a853"/>
    <circle cx="1.5" cy="-8" r="1.8" fill="#d4a853"/>
    <line x1="-2" y1="-12" x2="-6" y2="-20" stroke="#d4a853" stroke-width="0.8" stroke-linecap="round"/>
    <line x1="2" y1="-12" x2="6" y2="-20" stroke="#d4a853" stroke-width="0.8" stroke-linecap="round"/>
    <circle cx="-6" cy="-21" r="1.2" fill="#d4a853"/>
    <circle cx="6" cy="-21" r="1.2" fill="#d4a853"/>
  </g>
</svg>`;

const TOUR_STORAGE_KEY = 'evolv.tours';

function getTourState() {
  try { return JSON.parse(localStorage.getItem(TOUR_STORAGE_KEY)) || {}; } catch { return {}; }
}
function saveTourState(state) {
  localStorage.setItem(TOUR_STORAGE_KEY, JSON.stringify(state));
}

const PAGE_TOURS = {
  dashboard: {
    label: 'Dashboard',
    icon: '📊',
    desc: 'Your command center — metrics, focus, and growth at a glance',
    steps: [
      { target: '.hero-gold-section, .dashboard-hero, [data-tour="hero"]', title: 'Welcome to Your Command Center!', body: "Hey there! I'm Evolv, your butterfly guide. This is your dashboard — the heartbeat of your entire credit repair business. Everything you need to know about your operation is right here on one screen. Think of it as mission control. Let me walk you through each section so you can get the most out of it!", pose: 'wave' },
      { target: '#metricCardsRow, .metric-card, [data-tour="metrics"]', title: 'Real-Time Business Metrics', body: "These metric cards are your pulse check. They show your active client count, total revenue, letters sent this month, and dispute success rate — all updating in real time. Watch these numbers daily to spot trends. If active clients dip, it's time to ramp up marketing. If letters sent is high but success rate is low, review your dispute strategy. These cards tell the story of your business health at a glance.", pose: 'default' },
      { target: '#focusSection, [data-tour="focus"]', title: 'Daily Focus Priorities', body: "This is your personal productivity zone. Set your top 3 priorities each morning by clicking the pencil icon. Maybe it's 'Follow up with 5 clients,' 'Send batch dispute letters,' or 'Review new credit reports.' Your focus items persist so you can check them off as you go. Top performers in credit repair start every day with clear priorities — this makes it effortless.", pose: 'excited' },
      { target: '#growthNavigator, [data-tour="growth"]', title: 'Growth Navigator Roadmap', body: "The Growth Navigator is your step-by-step business scaling roadmap. It tracks your progress from startup phase through established business milestones. Each milestone unlocks when you hit key targets — like onboarding your first 10 clients, sending 100 letters, or hitting your first $5K month. Follow the roadmap and you'll have a clear path from beginner to industry leader.", pose: 'default' },
      { target: '#clientLocationChart, .map-section, [data-tour="map"]', title: 'Client Geographic Heatmap', body: "This interactive map shows where your clients are concentrated across the country. Darker regions mean more clients. Use this intelligence to plan your marketing — if you have a cluster in Texas but none in Florida, that's an opportunity. You can also use it to schedule in-person consultations efficiently and identify underserved markets where competition is low.", pose: 'default' },
      { target: '#timelineSection, [data-tour="timeline"]', title: 'Live Activity Feed', body: "Your real-time activity stream shows everything happening in your business — new client signups, letters generated, payments received, dispute responses logged. Think of it as your business newsfeed. Scroll through to stay informed, or use it to quickly jump to items that need your attention. No more wondering 'what happened while I was away.'", pose: 'celebrate' }
    ]
  },
  clients: {
    label: 'Clients',
    icon: '👥',
    desc: 'Manage, track, and grow your client base',
    steps: [
      { target: '.client-search, [data-tour="client-search"], #searchConsumers', title: 'Instant Client Search', body: "This search bar is incredibly powerful — type any part of a client's name, email, phone number, or status and your list filters instantly. Need to find everyone with 'pending' disputes? Just type it. Looking for a specific person? Start typing their name. With hundreds of clients, this becomes your most-used tool. Pro tip: you can also search by creditor name to find all clients disputing with a specific bank.", pose: 'wave' },
      { target: '.add-consumer-btn, [data-tour="add-client"], #addConsumerBtn', title: 'Onboard New Clients', body: "Click this button to add a new client to your system. You'll enter their personal details, contact info, and initial credit situation. Once added, they appear in your pipeline and you can immediately start uploading their credit reports, running audits, and generating dispute letters. The faster you onboard, the faster you can start delivering results and building trust.", pose: 'default' },
      { target: '#consumersList, .consumer-table, [data-tour="client-list"]', title: 'Complete Client Pipeline', body: "This is your master client list — every person you're helping displayed with their key info: name, status, bureau data, number of disputes, and progress percentage. Click any row to open their full profile where you can view reports, manage letters, and track their credit improvement journey. The status badges (Active, Pending, Completed) help you instantly see who needs attention and who's on track.", pose: 'default' },
      { target: '.bank-filter, [data-tour="bank-filter"], #bankFilterSelect', title: 'Advanced Filtering', body: "These smart filters let you slice your client list by creditor/bank, dispute status, bureau, or custom tags. Working on all Capital One disputes today? Filter by that creditor. Need to see everyone waiting for bureau responses? Filter by 'Pending Response' status. Combining filters helps you batch your work efficiently — handle all similar cases together instead of jumping between different types of disputes.", pose: 'excited' },
      { target: '.bulk-actions, [data-tour="bulk-actions"], .action-bar', title: 'Bulk Actions', body: "When you need to take action on multiple clients at once, bulk actions save you hours. Select several clients using the checkboxes, then choose an action: generate letters in batch, update statuses, export data, or send notifications. Credit repair pros who master bulk actions can handle 3-5x more clients because they're not doing everything one at a time.", pose: 'default' }
    ]
  },
  leads: {
    label: 'Leads',
    icon: '🎯',
    desc: 'Capture, nurture, and convert prospects into paying clients',
    steps: [
      { target: '.lead-stats, .stats-cards, [data-tour="lead-stats"]', title: 'Lead Performance Metrics', body: "These cards give you the big picture of your sales pipeline. Total Leads shows everyone who's entered your funnel. New (7 Days) tells you how many fresh prospects came in this week — if this number is low, your marketing needs attention. Active Pipeline counts leads you're actively working. Win Rate is your conversion percentage — industry average is 15-25%, so aim to beat that. Track these weekly to spot trends early.", pose: 'wave' },
      { target: '.intake-form-section, [data-tour="intake-form"], .new-lead-intake', title: 'Lead Intake Form', body: "This is your secret weapon for organized lead capture. When a prospect calls or fills out your website form, enter their details here — name, contact info, how they found you (source), their pain points, and credit goals. The 3-step process guides you through: (1) Capture their contact and where they came from, (2) Log their specific credit problems and goals using the NEPQ method, and (3) Set up their premium onboarding path. Every field you fill in now saves you time later and helps you personalize your approach.", pose: 'default' },
      { target: '.pipeline-snapshot, [data-tour="pipeline"]', title: 'Pipeline Snapshot', body: "The Pipeline Snapshot shows you exactly where each lead stands in your sales process. Track the source (Webinar, Referral, Ads, etc.) and current stage (New, Contacted, Consultation Booked, Won, Lost). This helps you identify bottlenecks — if lots of leads stall at 'Contacted' but few book consultations, you need to improve your follow-up script. Drag leads between stages or click to update as conversations progress.", pose: 'default' },
      { target: '.win-rate-card, [data-tour="win-rate"]', title: 'Win Rate Tracking', body: "Your win rate tells the real story of your sales effectiveness. It's calculated as (Won leads / Total leads contacted) x 100. A 0% win rate? Don't worry — every pro started there. Focus on improving your consultation script, following up within 24 hours, and offering a clear value proposition. Even moving from 10% to 20% can double your revenue. Share this metric in team standups to drive accountability.", pose: 'excited' },
      { target: '[data-tour="add-lead"], .add-lead-btn, .lead-form', title: 'Quick Lead Capture', body: "When you need to log a lead fast — maybe someone just called or DM'd you — use the quick capture button. It creates a lead record with minimal info so you can follow up later with full details. Speed matters: studies show that responding to a lead within 5 minutes makes you 21x more likely to convert them. Get the name and number in, then circle back to fill in the rest.", pose: 'default' }
    ]
  },
  library: {
    label: 'Letter Library',
    icon: '📚',
    desc: 'Your arsenal of dispute letter templates and sequences',
    steps: [
      { target: '.library-hero, [data-tour="library-hero"]', title: 'Your Dispute Letter Arsenal', body: "Welcome to the Letter Library — this is where the real credit repair magic happens. Every dispute letter template you'll ever need is organized here by category, violation type, and bureau. These aren't generic templates — each one is crafted based on real FCRA, FDCPA, and Metro-2 compliance standards. Whether you're disputing late payments, collections, inquiries, or identity errors, there's a battle-tested template ready to go.", pose: 'wave' },
      { target: '#templatePanel, [data-tour="templates"]', title: 'Template Categories', body: "Templates are organized by dispute type: Initial Disputes (Round 1 letters to bureaus), Validation Letters (debt collector verification requests), Goodwill Letters (requesting removal based on good history), Legal Threat Letters (when other rounds fail), and Bureau-Specific Letters (tailored for TransUnion, Experian, and Equifax individually). Each template includes the proper legal citations, required disclosures, and formatting that credit bureaus actually respond to.", pose: 'default' },
      { target: '#sequencePanel, [data-tour="sequences"]', title: 'Automated Letter Sequences', body: "Letter Sequences are your autopilot for disputes. Instead of manually deciding what to send next, create a sequence: Round 1 goes out immediately, Round 2 fires 35 days later if no response, Round 3 escalates with legal language 30 days after that. You can customize timing, add conditions (like 'only escalate if bureau didn't respond'), and include different templates at each stage. Set it once per client and the system handles the follow-up calendar for you.", pose: 'excited' },
      { target: '#editorPanel, [data-tour="editor"]', title: 'Smart Letter Editor', body: "The editor is where templates become personalized dispute letters. It auto-fills your client's name, address, account numbers, and specific violation details using merge fields. You can customize the language, add personal notes, adjust legal citations, and preview exactly what will be printed. The editor also checks for compliance — it'll flag if you're missing required disclosures or if the formatting might cause a bureau to reject the letter. Every letter you send should look professionally crafted, and this editor makes sure it does.", pose: 'default' }
    ]
  },
  billing: {
    label: 'Billing',
    icon: '💳',
    desc: 'Manage your subscription, payments, and feature access',
    steps: [
      { target: '[data-tour="billing-plans"], .pricing-grid', title: 'Subscription Plans', body: "Choose the plan that matches your business stage. Starter ($97/mo) is perfect when you're getting off the ground — it includes core features for up to 25 clients. Growth ($297/mo) unlocks bulk automation, AI-powered letters, and up to 150 clients — ideal when you're scaling. Enterprise ($597/mo) removes all limits and adds white-labeling, API access, and priority support for established businesses. You can upgrade or downgrade anytime, and your billing adjusts automatically.", pose: 'wave' },
      { target: '[data-tour="billing-status"], .subscription-status', title: 'Your Current Subscription', body: "This section shows your active plan, next billing date, payment method on file, and current usage against your plan limits. If you're approaching your client limit, you'll see a warning here so you can upgrade before hitting the cap. You can also view your complete billing history, download invoices for tax purposes, and update your payment method — all without leaving this page.", pose: 'default' },
      { target: '[data-tour="billing-portal"], .manage-btn, .portal-btn', title: 'Manage Subscription', body: "Click here to open the Stripe customer portal where you can update your card, switch plans, cancel, or resume your subscription. Changes take effect immediately — if you upgrade mid-cycle, you're only charged the prorated difference. If you cancel, you keep access until the end of your billing period. We believe in earning your business every month, so there are no long-term contracts or cancellation fees.", pose: 'default' }
    ]
  },
  settings: {
    label: 'Settings',
    icon: '⚙️',
    desc: 'Configure integrations, shortcuts, and workspace preferences',
    steps: [
      { target: '[data-tour="api-cards"], .settings-cards', title: 'API & Integration Hub', body: "This is your integration command center. Each card represents a connected service: Stripe handles your client billing and subscription payments. OpenAI powers AI-generated dispute letters that are customized for each violation. Future integrations include credit monitoring APIs, e-signature services, and CRM connectors. Green checkmarks mean active connections. Click any card to configure API keys, test connections, or view usage stats.", pose: 'wave' },
      { target: '[data-tour="shortcuts"], .shortcut-section', title: 'Keyboard Shortcuts', body: "Power users love keyboard shortcuts — they can cut your navigation time in half. Press Cmd+K (or Ctrl+K) to open the command palette from anywhere. Use bracket keys [ ] to toggle the sidebar. Each page has its own shortcuts for common actions like 'N' for new client, 'S' for search, or 'L' to jump to letters. You can customize these shortcuts here to match your preferred workflow. The more you use them, the faster you'll fly through your daily tasks.", pose: 'default' },
      { target: '[data-tour="portal-settings"], .portal-config', title: 'Client Portal Settings', body: "Configure what your clients see when they log into their personal portal. You control which information is visible, whether they can upload documents, if they see dispute progress in real time, and how your branding appears. A well-configured portal reduces client calls by 60% because clients can self-serve their status updates instead of calling you.", pose: 'excited' }
    ]
  },
  letters: {
    label: 'Letters',
    icon: '✉️',
    desc: 'View, manage, and track all generated dispute letters',
    steps: [
      { target: '[data-tour="letter-list"], .letter-list, .letter-queue', title: 'Your Dispute Letter Queue', body: "Every dispute letter you've ever generated is cataloged here with full details: client name, letter type, target bureau or creditor, date created, and current status (Draft, Ready to Send, Sent, Response Received). Think of this as your dispatch center — you can see what's been sent, what's waiting, and what needs follow-up. Click any letter to preview the full content, download the PDF, or resend it.", pose: 'wave' },
      { target: '[data-tour="letter-actions"], .letter-actions, .action-buttons', title: 'Letter Actions & Tracking', body: "From here you can take action on any letter: download as PDF for printing and mailing, send via certified mail tracking, mark as 'Response Received' when bureaus reply, or generate the next round if the dispute wasn't resolved. The tracking system logs every action with timestamps so you have a complete audit trail. If a bureau claims they never received a letter, you have proof of when it was sent and delivered.", pose: 'default' },
      { target: '[data-tour="letter-generate"], .generate-btn', title: 'Generate New Letters', body: "Ready to create fresh dispute letters? This button takes you through the generation flow: select a client, choose which violations to dispute, pick a template or let AI craft one, review the content, and generate. You can create letters one at a time for precision or batch-generate dozens at once. Each letter is automatically formatted with proper legal headers, your company letterhead, and all required FCRA/FDCPA disclosures.", pose: 'excited' }
    ]
  },
  tradelines: {
    label: 'Tradelines',
    icon: '📋',
    desc: 'Upload credit reports and analyze tradeline violations',
    steps: [
      { target: '[data-tour="tradeline-upload"], .upload-section, .report-upload', title: 'Credit Report Upload', body: "This is where the analysis begins. Upload your client's credit report (PDF or text format) and our Metro-2 engine goes to work. It parses every tradeline — that's each account listed on the report — and checks it against Metro-2 compliance standards. The engine reads data from all three bureaus (TransUnion, Experian, Equifax) and can process reports from any major credit monitoring service. Simply drag and drop or click to browse. Processing takes just seconds.", pose: 'wave' },
      { target: '[data-tour="tradeline-results"], .tradeline-list, .violations-panel', title: 'Violation Analysis Results', body: "After processing, you'll see every violation organized by severity: Critical (things like wrong Social Security numbers, accounts that don't belong to the client), Major (incorrect balances, wrong payment history dates, status inconsistencies between bureaus), and Minor (formatting issues, missing fields). Each violation includes the exact Metro-2 field code, what the report says vs. what it should say, and which bureau is reporting it. This is your legal ammunition — the more violations you find, the stronger your dispute case.", pose: 'default' },
      { target: '[data-tour="tradeline-cross-bureau"], .cross-bureau', title: 'Cross-Bureau Comparison', body: "One of the most powerful features: cross-bureau analysis automatically compares how each account is reported across TransUnion, Experian, and Equifax. If Capital One reports a $5,000 balance to TransUnion but $4,800 to Experian, that's a dispute-worthy discrepancy. Bureaus are required to report accurately, and inconsistencies between them prove at least one (or all) are wrong. These cross-bureau findings often result in the fastest deletions because they're the hardest for bureaus to defend.", pose: 'excited' },
      { target: '[data-tour="tradeline-generate"], .generate-letters-btn', title: 'Generate Letters from Violations', body: "Once you've reviewed the violations, click here to automatically generate dispute letters targeting each finding. The system matches the right letter template to each violation type, addresses it to the correct bureau, and includes the specific account details and legal citations. You can generate all letters at once or select specific violations to dispute strategically — sometimes it's better to tackle the biggest items first for maximum score impact.", pose: 'default' }
    ]
  },
  schedule: {
    label: 'Schedule',
    icon: '📅',
    desc: 'Manage appointments, consultations, and follow-ups',
    steps: [
      { target: '[data-tour="schedule-cal"], .calendar-view, .schedule-calendar', title: 'Your Appointment Calendar', body: "This calendar shows all your booked consultations, follow-up calls, and scheduled tasks. The color-coding helps you see at a glance: blue for new consultations, green for follow-ups, gold for important deadlines. Click any slot to view details or reschedule. Your availability is automatically synced so clients can only book times when you're actually free — no more double-bookings or phone tag.", pose: 'wave' },
      { target: '[data-tour="schedule-availability"], .availability-settings', title: 'Set Your Availability', body: "Control exactly when clients can book time with you. Set your working hours for each day of the week, block off lunch breaks or personal time, and mark specific dates as unavailable for vacations. The default is Monday-Friday, 9am-5pm Eastern, but you can customize it to match your actual schedule. If you work weekends or evening hours, adjust it here and your booking page updates instantly.", pose: 'default' },
      { target: '[data-tour="schedule-upcoming"], .upcoming-bookings', title: 'Upcoming Appointments', body: "This list shows your next appointments in chronological order with client name, type of meeting (initial consult, progress review, dispute strategy), contact info, and any notes the client provided when booking. Use this to prepare before each call — pull up their credit report, review their dispute status, and have talking points ready. Being prepared for every call is what separates good credit repair pros from great ones.", pose: 'default' },
      { target: '[data-tour="schedule-book"], .book-call-btn', title: 'Share Your Booking Link', body: "Want clients to self-schedule? Share your personal booking link on your website, email signature, or social media. When prospects click it, they see your available time slots and can book instantly — no back-and-forth emails needed. The system sends automatic confirmation emails and reminders to reduce no-shows. Studies show self-service booking increases consultation rates by 40% because there's zero friction.", pose: 'excited' }
    ]
  },
  marketing: {
    label: 'Marketing',
    icon: '📢',
    desc: 'Plan campaigns, track outreach, and grow your client base',
    steps: [
      { target: '[data-tour="marketing-hero"], .marketing-hero', title: 'Your Marketing Command Center', body: "Welcome to Marketing — this is where you grow your business. Whether you're running Facebook ads, hosting webinars, doing local outreach, or building referral partnerships, everything is tracked here. The key to sustainable growth in credit repair is consistent, multi-channel marketing. This hub helps you plan, execute, and measure your efforts so you know exactly what's working and where to double down.", pose: 'wave' },
      { target: '[data-tour="marketing-campaigns"], .campaign-list', title: 'Campaign Manager', body: "Create and manage marketing campaigns from start to finish. Set up a campaign with a name, budget, target audience, and channel (social media, email, direct mail, events). Track how many leads each campaign generates and calculate your cost per lead. The best credit repair businesses spend $20-50 per qualified lead — if your cost is higher, it's time to optimize your targeting or messaging.", pose: 'default' },
      { target: '[data-tour="marketing-templates"], .template-section', title: 'Marketing Templates', body: "Don't start from scratch — use proven marketing templates for social media posts, email sequences, landing pages, and ad copy. Each template is specifically designed for credit repair businesses and includes compliant language (important since credit repair advertising has strict FTC regulations). Customize with your branding, pricing, and unique value proposition, then deploy across your channels.", pose: 'default' },
      { target: '[data-tour="marketing-analytics"], .analytics-section', title: 'Performance Analytics', body: "Track your marketing ROI with detailed analytics: impressions, clicks, leads generated, conversion rates, and revenue attributed to each campaign. The funnel view shows you exactly where prospects drop off — are they clicking your ads but not filling out forms? Filling out forms but not booking consultations? Each drop-off point reveals an optimization opportunity. Review these numbers weekly and kill campaigns that aren't delivering.", pose: 'excited' }
    ]
  },
  workflows: {
    label: 'Workflows',
    icon: '⚡',
    desc: 'Automate repetitive tasks and build smart business rules',
    steps: [
      { target: '[data-tour="workflow-list"], .workflow-list', title: 'Your Automation Library', body: "Workflows are the closest thing to cloning yourself. Each workflow is a set of rules that trigger automatically: 'When a new client is added, send welcome email + create their portal login + schedule intro call.' Or: 'When a dispute letter has no response after 35 days, generate Round 2 letter + notify me.' The most successful credit repair businesses run 10-20 active workflows that handle everything from onboarding to collections follow-up without manual intervention.", pose: 'wave' },
      { target: '[data-tour="workflow-builder"], .workflow-editor', title: 'Workflow Builder', body: "Build custom automations using our visual workflow builder. Start with a trigger (new client, letter sent, payment received, date reached), add conditions (if status equals X, if days since last letter > 30), and set actions (send email, generate letter, update status, create task). You can chain multiple steps together and add branching logic for different scenarios. Start simple with one or two workflows, then build more as you identify repetitive tasks in your daily routine.", pose: 'default' },
      { target: '[data-tour="workflow-templates"], .workflow-templates', title: 'Pre-Built Workflow Templates', body: "Don't know where to start? These pre-built templates cover the most common credit repair automations: New Client Onboarding (4 steps), Dispute Follow-Up Sequence (3 steps), Payment Reminder Series (5 steps), Client Progress Updates (2 steps), and Lead Nurture Drip (7 steps). Each template is fully customizable — activate it, tweak the messaging and timing to match your style, and you're running on autopilot.", pose: 'excited' },
      { target: '[data-tour="workflow-logs"], .workflow-history', title: 'Automation Activity Log', body: "Every automated action is logged here with timestamps, affected clients, and results. If a workflow sends 50 follow-up emails, you'll see each one listed with delivery status. This transparency ensures nothing falls through the cracks and lets you audit exactly what your automations are doing. If a client asks 'Did you send my letter?' you can pull up the exact timestamp and proof.", pose: 'default' }
    ]
  },
  'my-company': {
    label: 'My Company',
    icon: '🏢',
    desc: 'Configure your business identity and branding',
    steps: [
      { target: '[data-tour="company-info"], .company-info', title: 'Business Identity', body: "This is the foundation of your professional presence. Your company name, address, phone number, and email appear on every dispute letter, client portal, and communication you send. Make sure this information is accurate and matches your business registration — bureaus will reject letters that come from unverified business addresses. If you're operating as a sole proprietor, you can use your personal details here.", pose: 'wave' },
      { target: '[data-tour="company-logo"], .logo-section', title: 'Logo & Branding', body: "Upload your company logo and it automatically appears on your letterhead, client portal, email templates, and marketing materials. A professional logo builds trust — clients are 3x more likely to sign up when they see polished branding. If you don't have a logo yet, consider getting one designed. Your logo should be a clean PNG or SVG file, at least 400x400 pixels, with a transparent background for best results across all placements.", pose: 'default' },
      { target: '[data-tour="company-compliance"], .compliance-section', title: 'Compliance & Legal', body: "Credit repair businesses must comply with the Credit Repair Organizations Act (CROA). This section helps you stay compliant by managing your required disclosures, state-specific licensing information, and mandatory client agreements. You can upload your surety bond documentation, set up automatic disclosure delivery to new clients, and ensure every letter includes the required legal notices. Staying compliant isn't just legal protection — it's a trust signal to clients.", pose: 'default' }
    ]
  }
};

const PAGE_MAP = {
  'dashboard.html': 'dashboard',
  'index.html': 'clients',
  'leads.html': 'leads',
  'library.html': 'library',
  'billing.html': 'billing',
  'settings.html': 'settings',
  'letters.html': 'letters',
  'tradelines.html': 'tradelines',
  'schedule.html': 'schedule',
  'marketing.html': 'marketing',
  'workflows.html': 'workflows',
  'my-company.html': 'my-company'
};

function getCurrentPageKey() {
  const path = window.location.pathname;
  const filename = path.split('/').pop() || 'dashboard.html';
  return PAGE_MAP[filename] || null;
}

class EvolvTourEngine {
  constructor() {
    this.steps = [];
    this.currentStep = 0;
    this.overlay = null;
    this.spotlight = null;
    this.popover = null;
    this.tourKey = null;
    this.onComplete = null;
    this.isActive = false;
    this._keyHandler = null;
  }

  start(tourKey, options = {}) {
    const tour = PAGE_TOURS[tourKey];
    if (!tour) return;

    this.tourKey = tourKey;
    this.steps = tour.steps.filter(s => {
      const selectors = s.target.split(',').map(t => t.trim());
      return selectors.some(sel => {
        try { return !!document.querySelector(sel); } catch { return false; }
      });
    });

    if (!this.steps.length) {
      this.steps = tour.steps.slice(0, 1);
      if (this.steps.length) {
        this.steps[0] = { ...this.steps[0], _noTarget: true };
      } else {
        return;
      }
    }

    this.currentStep = 0;
    this.onComplete = options.onComplete || null;
    this.isActive = true;
    this.createOverlay();
    this.showStep(0);
  }

  createOverlay() {
    this.cleanup();
    this.overlay = document.createElement('div');
    this.overlay.className = 'tour-overlay tour-overlay--active';
    this.overlay.innerHTML = '<div class="tour-backdrop"></div>';
    this.overlay.addEventListener('click', (e) => {
      if (e.target === this.overlay || e.target.classList.contains('tour-backdrop')) {
        this.finish(false);
      }
    });
    document.body.appendChild(this.overlay);

    this.spotlight = document.createElement('div');
    this.spotlight.className = 'tour-spotlight';
    this.overlay.appendChild(this.spotlight);

    this.popover = document.createElement('div');
    this.popover.className = 'tour-popover';
    this.overlay.appendChild(this.popover);

    this._keyHandler = (e) => {
      if (!this.isActive) return;
      if (e.key === 'Escape') { e.preventDefault(); this.finish(false); }
      if (e.key === 'ArrowRight' || e.key === 'Enter') { e.preventDefault(); this.next(); }
      if (e.key === 'ArrowLeft') { e.preventDefault(); this.prev(); }
    };
    document.addEventListener('keydown', this._keyHandler);
  }

  findTarget(step) {
    if (step._noTarget) return null;
    const selectors = step.target.split(',').map(t => t.trim());
    for (const sel of selectors) {
      try {
        const el = document.querySelector(sel);
        if (el && el.offsetParent !== null) return el;
      } catch { /* skip invalid selectors */ }
    }
    return null;
  }

  showStep(index) {
    if (index < 0 || index >= this.steps.length) return;
    this.currentStep = index;
    const step = this.steps[index];
    const target = this.findTarget(step);

    if (target) {
      target.scrollIntoView({ behavior: 'smooth', block: 'center' });
      setTimeout(() => this.positionElements(target, step), 400);
    } else {
      this.positionCenter(step);
    }
  }

  positionElements(target, step) {
    const rect = target.getBoundingClientRect();
    const pad = 10;

    this.spotlight.style.top = `${rect.top - pad + window.scrollY}px`;
    this.spotlight.style.left = `${rect.left - pad}px`;
    this.spotlight.style.width = `${rect.width + pad * 2}px`;
    this.spotlight.style.height = `${rect.height + pad * 2}px`;
    this.spotlight.style.position = 'fixed';
    this.spotlight.style.top = `${rect.top - pad}px`;

    const placement = this.calculatePlacement(rect);
    this.renderPopover(step, placement, rect);
  }

  positionCenter(step) {
    this.spotlight.style.top = '-9999px';
    this.spotlight.style.left = '-9999px';
    this.spotlight.style.width = '0';
    this.spotlight.style.height = '0';
    this.renderPopover(step, 'center', null);
  }

  calculatePlacement(rect) {
    const vh = window.innerHeight;
    const vw = window.innerWidth;
    const spaceBelow = vh - rect.bottom;
    const spaceAbove = rect.top;
    const spaceRight = vw - rect.right;

    if (spaceBelow > 260) return 'bottom';
    if (spaceAbove > 260) return 'top';
    if (spaceRight > 440) return 'right';
    return 'bottom';
  }

  renderPopover(step, placement, rect) {
    const isLast = this.currentStep === this.steps.length - 1;
    const isFirst = this.currentStep === 0;
    const poseClass = step.pose ? `tour-butterfly--${step.pose}` : '';

    const dots = this.steps.map((_, i) => {
      let cls = 'tour-bubble__dot';
      if (i === this.currentStep) cls += ' tour-bubble__dot--active';
      else if (i < this.currentStep) cls += ' tour-bubble__dot--done';
      return `<div class="${cls}"></div>`;
    }).join('');

    this.popover.setAttribute('data-placement', placement);
    this.popover.innerHTML = `
      <div class="tour-butterfly ${poseClass}">
        ${BUTTERFLY_SVG}
      </div>
      <div class="tour-bubble">
        <div class="tour-bubble__title">${step.title}</div>
        <div class="tour-bubble__body">${step.body}</div>
        <div class="tour-bubble__footer">
          <div class="tour-bubble__progress">${dots}</div>
          <div class="tour-bubble__actions">
            ${isFirst ? `<button class="tour-btn tour-btn--skip" data-action="skip">Skip Tour</button>` : `<button class="tour-btn tour-btn--prev" data-action="prev">Back</button>`}
            ${isLast
              ? `<button class="tour-btn tour-btn--finish" data-action="finish">Got it! 🦋</button>`
              : `<button class="tour-btn tour-btn--next" data-action="next">Next →</button>`
            }
          </div>
        </div>
      </div>
    `;

    this.popover.querySelectorAll('[data-action]').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const action = btn.dataset.action;
        if (action === 'next') this.next();
        else if (action === 'prev') this.prev();
        else if (action === 'skip') this.finish(false);
        else if (action === 'finish') this.finish(true);
      });
    });

    this.popover.style.animation = 'none';
    void this.popover.offsetHeight;
    this.popover.style.animation = '';

    requestAnimationFrame(() => {
      if (placement === 'center') {
        this.popover.style.position = 'fixed';
        this.popover.style.top = '50%';
        this.popover.style.left = '50%';
        this.popover.style.transform = 'translate(-50%, -50%)';
        return;
      }
      if (!rect) return;

      this.popover.style.position = 'fixed';
      this.popover.style.transform = 'none';
      const popRect = this.popover.getBoundingClientRect();
      let top, left;

      switch (placement) {
        case 'bottom':
          top = rect.bottom + 20;
          left = Math.max(16, Math.min(rect.left, window.innerWidth - popRect.width - 16));
          break;
        case 'top':
          top = rect.top - popRect.height - 20;
          left = Math.max(16, Math.min(rect.left, window.innerWidth - popRect.width - 16));
          break;
        case 'right':
          top = Math.max(16, rect.top);
          left = rect.right + 20;
          break;
        case 'left':
          top = Math.max(16, rect.top);
          left = rect.left - popRect.width - 20;
          break;
      }

      this.popover.style.top = `${top}px`;
      this.popover.style.left = `${left}px`;
    });
  }

  next() {
    if (this.currentStep < this.steps.length - 1) {
      this.showStep(this.currentStep + 1);
    } else {
      this.finish(true);
    }
  }

  prev() {
    if (this.currentStep > 0) {
      this.showStep(this.currentStep - 1);
    }
  }

  finish(completed) {
    this.isActive = false;
    if (this._keyHandler) {
      document.removeEventListener('keydown', this._keyHandler);
      this._keyHandler = null;
    }

    if (completed && this.tourKey) {
      const state = getTourState();
      state[this.tourKey] = { completed: true, date: new Date().toISOString() };
      saveTourState(state);
      this.showConfetti();
    }

    this.cleanup();
    if (this.onComplete) this.onComplete(completed);
  }

  cleanup() {
    if (this.overlay && this.overlay.parentNode) {
      this.overlay.parentNode.removeChild(this.overlay);
    }
    this.overlay = null;
    this.spotlight = null;
    this.popover = null;
  }

  showConfetti() {
    const container = document.createElement('div');
    container.className = 'tour-confetti';
    document.body.appendChild(container);
    const colors = ['#d4a853', '#e8c875', '#c49a45', '#fff', '#f0d78c'];
    for (let i = 0; i < 50; i++) {
      const piece = document.createElement('div');
      piece.className = 'tour-confetti__piece';
      piece.style.left = `${Math.random() * 100}%`;
      piece.style.background = colors[Math.floor(Math.random() * colors.length)];
      piece.style.animationDelay = `${Math.random() * 0.8}s`;
      piece.style.animationDuration = `${1.5 + Math.random()}s`;
      piece.style.width = `${4 + Math.random() * 6}px`;
      piece.style.height = `${4 + Math.random() * 6}px`;
      container.appendChild(piece);
    }
    setTimeout(() => container.remove(), 3000);
  }
}

const tourEngine = new EvolvTourEngine();

function startPageTour(pageKey) {
  const key = pageKey || getCurrentPageKey();
  if (!key) return;
  tourEngine.start(key);
}

function showTourMenu() {
  const existing = document.querySelector('.tour-menu-overlay');
  if (existing) existing.remove();

  const state = getTourState();
  const currentPage = getCurrentPageKey();
  const overlay = document.createElement('div');
  overlay.className = 'tour-menu-overlay';

  const menuItems = Object.entries(PAGE_TOURS).map(([key, tour]) => {
    const done = state[key]?.completed;
    const isCurrent = key === currentPage;
    return `
      <div class="tour-menu__item" data-tour-key="${key}">
        <div class="tour-menu__item-icon">${tour.icon}</div>
        <div class="tour-menu__item-text">
          <div class="tour-menu__item-label">${tour.label}${isCurrent ? ' (current page)' : ''}</div>
          <div class="tour-menu__item-desc">${tour.desc}</div>
        </div>
        ${done ? '<span class="tour-menu__item-badge">✓ Done</span>' : ''}
      </div>
    `;
  }).join('');

  overlay.innerHTML = `
    <div class="tour-menu" style="position:relative;">
      <button class="tour-menu__close" data-close>✕</button>
      <div class="tour-menu__header">
        <div class="tour-butterfly" style="width:56px;height:56px;">${BUTTERFLY_SVG}</div>
        <div>
          <div class="tour-menu__title">Explore Evolv.AI</div>
          <div class="tour-menu__subtitle">Choose a section to learn about</div>
        </div>
      </div>
      <div class="tour-menu__list" style="max-height: 400px; overflow-y: auto;">
        <div class="tour-menu__item tour-menu__item--full" data-tour-key="__current__">
          <div class="tour-menu__item-icon">🦋</div>
          <div class="tour-menu__item-text">
            <div class="tour-menu__item-label">Tour This Page</div>
            <div class="tour-menu__item-desc">Let Evolv walk you through what's on screen</div>
          </div>
        </div>
        ${menuItems}
      </div>
    </div>
  `;

  overlay.addEventListener('click', (e) => {
    if (e.target === overlay || e.target.closest('[data-close]')) {
      overlay.remove();
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
      const pageFile = Object.entries(PAGE_MAP).find(([, v]) => v === key);
      if (pageFile) {
        sessionStorage.setItem('evolv.tour.autostart', key);
        window.location.href = `/${pageFile[0]}`;
      }
    }
  });

  document.body.appendChild(overlay);
}

function checkAutoStartTour() {
  const pending = sessionStorage.getItem('evolv.tour.autostart');
  if (pending) {
    sessionStorage.removeItem('evolv.tour.autostart');
    setTimeout(() => tourEngine.start(pending), 800);
    return;
  }

  const state = getTourState();
  if (!state._welcomed) {
    const currentPage = getCurrentPageKey();
    if (currentPage) {
      state._welcomed = true;
      saveTourState(state);
      setTimeout(() => showWelcome(), 2000);
    }
  }
}

function showWelcome() {
  const overlay = document.createElement('div');
  overlay.className = 'tour-welcome';
  overlay.innerHTML = `
    <div class="tour-welcome__card">
      <div class="tour-welcome__butterfly">${BUTTERFLY_SVG}</div>
      <div class="tour-welcome__title">Hi! I'm Evolv 🦋</div>
      <div class="tour-welcome__body">
        I'm your personal guide to mastering your credit repair business. Want me to show you around? I'll walk you through everything — it only takes a minute!
      </div>
      <div class="tour-welcome__actions">
        <button class="tour-welcome__btn tour-welcome__btn--start" data-action="start">Show Me Around!</button>
        <button class="tour-welcome__btn tour-welcome__btn--skip" data-action="skip">I'll Explore On My Own</button>
      </div>
    </div>
  `;

  overlay.addEventListener('click', (e) => {
    const action = e.target.closest('[data-action]')?.dataset?.action;
    if (action === 'start') {
      overlay.remove();
      const current = getCurrentPageKey();
      if (current) tourEngine.start(current);
    } else if (action === 'skip' || e.target === overlay) {
      overlay.remove();
    }
  });

  document.body.appendChild(overlay);
}

function resetAllTours() {
  localStorage.removeItem(TOUR_STORAGE_KEY);
  sessionStorage.removeItem('evolv.tour.autostart');
}

window.EvolvTour = {
  start: startPageTour,
  showMenu: showTourMenu,
  showWelcome,
  reset: resetAllTours,
  engine: tourEngine,
  PAGE_TOURS,
  getCurrentPageKey
};

window.addEventListener('crm:tutorial-request', (event) => {
  const mode = event?.detail?.mode || 'start';
  if (mode === 'menu') {
    showTourMenu();
  } else {
    startPageTour();
  }
});

window.addEventListener('crm:tutorial-reset', () => {
  resetAllTours();
});

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => setTimeout(checkAutoStartTour, 1000));
} else {
  setTimeout(checkAutoStartTour, 1000);
}

export { tourEngine, startPageTour, showTourMenu, showWelcome, resetAllTours, PAGE_TOURS, getCurrentPageKey };

export function setupPageTour() {
  return {
    startTour: startPageTour,
    resetTour: resetAllTours,
    refreshHelpState: () => {}
  };
}
