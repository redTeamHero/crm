// Inject globe meridian animation if not already present
(function() {
  if (!document.getElementById('evolv-globe-style')) {
    var gs = document.createElement('style');
    gs.id = 'evolv-globe-style';
    gs.textContent = '@keyframes evolv-meridian{0%{transform:scaleX(1)}25%{transform:scaleX(0)}50%{transform:scaleX(-1)}75%{transform:scaleX(0)}100%{transform:scaleX(1)}}.evolv-globe-meridian{animation:evolv-meridian 2.4s linear infinite;transform-box:fill-box;transform-origin:center}.evolv-globe-meridian2{animation:evolv-meridian 2.4s linear infinite -1.2s;transform-box:fill-box;transform-origin:center}';
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

function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, function(c) {
    return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c];
  });
}

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
      { target: '.hero-gold-section, .dashboard-hero, [data-tour="hero"]', title: 'Welcome to Your Command Center!', body: "Hey there! I'm Evolv, your phoenix guide. This is your dashboard — the heartbeat of your entire credit repair business. Everything you need to know about your operation is right here on one screen. Think of it as mission control. Let me walk you through each section so you can get the most out of it!", pose: 'wave' },
      { target: '#btnGoal', title: 'Daily Goal Tracker', body: "Start every day with intention. This button lets you mark your daily goal as done — whether it's booking consultations, sending letters, or following up with leads. The hero section also shows three key sub-metrics: your consultation fill rate, active automation flows, and upsell pipeline value. These numbers give you an instant snapshot of today's momentum so you know exactly where to focus your energy.", pose: 'default' },
      { target: '#focusList, #focusEditButton', title: 'Daily Focus Priorities', body: "This is your personal productivity zone. Set your top 3 priorities each morning by clicking the Edit button. Maybe it's 'Follow up with 5 clients,' 'Send batch dispute letters,' or 'Review new credit reports.' Your focus items persist so you can check them off as you go. Top performers in credit repair start every day with clear priorities — this makes it effortless.", pose: 'excited' },
      { target: '#nextRevenueWin', title: 'Next Revenue Win', body: "This card highlights your most immediate revenue opportunity — the next action you can take to bring in money. It might suggest following up on a consultation, closing a pending deal, or upselling an existing client. Think of it as your personal revenue coach, always pointing you toward the quickest win available right now.", pose: 'default' },
      { target: '#newsFeed', title: 'Live News Feed', body: "Your real-time news stream shows the latest activity across your business — new client signups, letters generated, dispute responses, and system updates. This is your business pulse. Scroll through to stay informed about what's happening without needing to check each section individually. If something important happened while you were away, you'll see it here first.", pose: 'default' },
      { target: '#msgList', title: 'Messages Center', body: "All your client messages and notifications appear here in one place. Whether a client uploads a document, asks a question through their portal, or a team member sends you an update — it shows up in this feed. Keeping communication centralized means nothing falls through the cracks and you can respond faster.", pose: 'default' },
      { target: '#eventList', title: 'Upcoming Events', body: "This card shows your next scheduled appointments, consultation calls, and important deadlines. It pulls from your calendar so you always know what's coming up. Use this to prepare — pull up client files, review their dispute status, and have talking points ready before each call. Being prepared for every interaction is what separates good credit repair pros from great ones.", pose: 'default' },
      { target: '#tourKpiSection', title: 'Business KPI Cards', body: "These four key performance indicators give you the big picture at a glance: Total Leads shows your pipeline size, Active Clients tracks who you're currently helping, Sales Revenue shows your income this period, and Payments Collected tracks actual money received. Watch the trend arrows — green means growing, red means declining. Check these daily to catch issues early before they become problems.", pose: 'default' },
      { target: '#tourNotepadCard', title: 'Quick Notepad', body: "Your built-in notepad for capturing ideas, talking points, and action items on the fly. Create titled notes, save them, and access them anytime from the dropdown. Perfect for jotting down client call notes, documenting dispute strategies, or planning your next marketing push. Everything saves automatically to your account so your notes travel with you.", pose: 'default' },
      { target: '#dashRetention', title: 'Client Retention Rate', body: "This metric shows what percentage of your clients stay with you month over month. A healthy credit repair business maintains 85%+ retention. If this number dips, it signals that clients aren't seeing results fast enough or your communication needs improvement. Focus on regular progress updates and quick wins in the first 30 days to keep retention high.", pose: 'default' },
      { target: '#dashConversion', title: 'Lead Conversion Rate', body: "Your conversion rate measures how effectively you turn leads into paying clients. Industry average is 15-25% — if you're below that, review your consultation script and follow-up timing. If you're above 30%, you're outperforming most credit repair businesses. This number directly correlates with revenue growth, so improving it even by 5% can significantly impact your bottom line.", pose: 'default' },
      { target: '#dashDeletion', title: 'Deletion Success Tracking', body: "Track your dispute success metrics here — how many negative items have been removed or updated across all your clients. This data helps you identify which types of disputes have the highest success rates, which bureaus respond fastest, and which letter strategies work best. Use these insights to refine your approach and deliver better results for every client.", pose: 'default' },
      { target: '#ladderTitle', title: 'Revenue Ladder to 7 Figures', body: "The Revenue Ladder is your visual roadmap to scaling your credit repair business. It shows your Monthly Recurring Revenue, Pipeline Forecast, and Average Order Value side by side with a progress bar tracking you toward your revenue goal. Edit your target to set personalized milestones. Each milestone unlocks new strategies — from concierge onboarding at $25k/mo to premium audit bundles at higher tiers. This keeps you focused on the big picture while working on daily tasks.", pose: 'default' },
      { target: '#tourMapCard', title: 'Client Geographic Heatmap', body: "This interactive map shows where your clients are concentrated across the country. Darker regions mean more clients. Use this intelligence to plan your marketing — if you have a cluster in Texas but none in Florida, that's an opportunity. You can also use it to schedule in-person consultations efficiently and identify underserved markets where competition is low.", pose: 'celebrate' }
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
  },
  'client-invoicing': {
    label: 'Client Invoicing',
    icon: '🧾',
    desc: 'Bill clients, track payments, and automate your revenue cycle',
    steps: [
      { target: '#invoiceCount', title: 'Welcome to Client Invoicing!', body: "Hey there! This is your invoicing command center — where you manage every dollar flowing into your credit repair business. From creating invoices and tracking payments to automating billing cycles, everything lives here. The invoice counter at the top gives you an instant snapshot of how many invoices are in your system. Let me show you every tool on this page so you can maximize your revenue.", pose: 'wave' },
      { target: '#billingMetrics', title: 'Revenue Metrics Dashboard', body: "These four metric cards are your financial pulse: Total Billed shows everything you've invoiced across all clients. Outstanding reveals unpaid invoices that need follow-up — the lower this number, the healthier your cash flow. Next Due shows your nearest upcoming payment with the amount and date. Collected YTD tracks actual money received this year. Review these weekly to spot slow-paying clients early and keep your revenue flowing consistently.", pose: 'default' },
      { target: '#billingAutopayCard', title: 'Autopay Settings', body: "Autopay is a game-changer for predictable revenue. When enabled, the system automatically drafts recurring invoices based on your client billing plans and processes payments on schedule. This eliminates the awkward 'Hey, your payment is overdue' conversations and keeps you Metro-2 compliant with consistent billing records. Toggle it on, and your billing runs itself — freeing you to focus on growing your business instead of chasing payments.", pose: 'default' },
      { target: '#invoiceTable, #invoiceEmpty', title: 'Invoice History Table', body: "Every invoice you've ever created is logged here with full details: client name, amount, due date, status (Paid, Pending, Overdue), and payment date. Filter by client using the dropdown to see a specific person's billing history. Click any row to view or resend the invoice. This complete audit trail is essential for tax time, dispute resolution, and demonstrating the value you've delivered to each client over their lifetime.", pose: 'default' },
      { target: '#planBuilder', title: 'Billing Plan Builder', body: "Create structured billing plans that define exactly how and when each client pays. Set a plan name (like 'Premium Credit Concierge'), monthly amount, start date, billing frequency (monthly, weekly, or custom intervals), and reminder lead time. Once saved, the plan auto-generates invoices on schedule. You can create different plans for different service tiers — maybe $149/mo for basic disputes and $297/mo for full-service credit restoration with monitoring.", pose: 'excited' },
      { target: '#invAmount, #invAdd', title: 'Quick Add Invoice', body: "Need to bill a client right now? The Quick Add section lets you create a one-off invoice in seconds — just pick the client, enter the amount, set the due date, and hit Add. Perfect for setup fees, one-time audit charges, or custom services that don't fit a recurring plan. The invoice is immediately logged in your history and the client can be notified automatically.", pose: 'default' }
    ]
  },
  'client-portal-settings': {
    label: 'Client Portal Settings',
    icon: '🌐',
    desc: 'Customize the branded portal experience your clients see',
    steps: [
      { target: '#adminPanel, #clientPortalTitle', title: 'Your Client Portal Hub', body: "Welcome to Client Portal Settings! This is where you control the entire experience your clients have when they log into their personal portal. A well-configured portal builds trust, reduces support calls by up to 60%, and makes your business look polished and professional. The metrics at the top show portal engagement — active users, document uploads, and client satisfaction scores. Let me walk you through every setting.", pose: 'wave' },
      { target: '#clientPortalModuleGrid', title: 'Portal Modules', body: "These toggles control exactly which features your clients can see and use in their portal. Enable or disable modules like dispute tracking, document uploads, payment history, letter previews, and progress reports. Every client's needs are different — some want full transparency into their dispute progress, while others just want to upload documents and let you handle the rest. Customize these modules to match your service style and client expectations.", pose: 'default' },
      { target: '#portalBackgroundColor, #portalLogoUrl', title: 'Theme & Branding', body: "Make the portal feel like your own branded product. Set your background color to match your brand identity, upload your company logo, and customize the primary and secondary taglines that greet clients when they log in. Consistent branding across your portal, letters, and website creates a premium experience that justifies premium pricing. Clients who see a polished portal are more likely to refer friends and stay longer.", pose: 'default' },
      { target: '#saveSettings, #portalThemeReset', title: 'Save & Reset Controls', body: "After customizing your portal, hit Save to push changes live instantly — your clients will see the updates the next time they visit. If you ever want to start over or undo experimental changes, the Reset to Defaults button restores the original theme settings. Changes reflect immediately for all portal visitors, so preview your customizations carefully before saving.", pose: 'default' },
      { target: '#ctaPortalHeading', title: 'Concierge Portal Upgrade', body: "This is a powerful revenue strategy: offer your clients a premium portal upgrade that includes priority dispute reviews and SMS alerts for an additional monthly fee. It's a win-win — clients get faster service and proactive updates, and you increase your lifetime value per client. The suggested pricing and messaging here is compliance-safe and proven to convert. Enable it and you've instantly added a new revenue stream to your business.", pose: 'excited' }
    ]
  },
  disputes: {
    label: 'Dispute Tracker',
    icon: '⚖️',
    desc: 'Track every dispute round and monitor bureau responses',
    steps: [
      { target: '.workspace-hero, .hero-title', title: 'Welcome to Dispute Tracker!', body: "This is your dispute command center — a single view of every dispute round, bureau response, and letter sent for any client. Select a client to load their full dispute history and manage the next steps in their credit repair journey.", pose: 'wave' },
      { target: '#consumerPicker', title: 'Select a Client', body: "Use the dropdown to pick any client in your roster. Once selected, their full dispute tracker loads below — showing all rounds, the timeline of bureau interactions, and every letter that's been sent on their behalf.", pose: 'default' },
      { target: '#disputeAnalysisCard', title: 'Report Analysis Card', body: "When a client has active disputes, this card shows the AI-powered analysis of their credit report. It highlights the strongest dispute arguments, flags which items have the highest deletion potential, and gives you a strategic roadmap for each round. Gold means there's action to take.", pose: 'default' },
      { target: '#letterHistoryCard', title: 'Letters Sent History', body: "This blue card tracks every dispute letter that's been generated and sent for this client. You'll see the letter type, bureau targeted, and date sent. This is your audit trail — if a bureau claims they never received correspondence, this log proves otherwise.", pose: 'default' },
      { target: '#disputeTimeline', title: 'Dispute Timeline', body: "The timeline is the heart of the tracker. Each entry shows a dispute round with its status — Pending, Awaiting Response, Resolved, or Deleted. Select multiple entries using the checkboxes and use the toolbar at the bottom to generate next-round letters, mark items as resolved, download a full round, or send letters to the client portal. Use 'Items/letter' to control how many dispute items get bundled into each letter.", pose: 'celebrate' }
    ]
  },
  cfpb: {
    label: 'CFPB Complaints',
    icon: '🏛️',
    desc: 'Generate AI-drafted federal complaints for unresolved disputes',
    steps: [
      { target: '.workspace-hero, .hero-title', title: 'CFPB Complaint Generator', body: "When bureau disputes fail — or a creditor refuses to comply — the CFPB (Consumer Financial Protection Bureau) is your next weapon. Filing a CFPB complaint puts federal oversight on the case and often produces results that dispute letters alone cannot. This tool drafts a legally-precise complaint using AI in seconds.", pose: 'wave' },
      { target: '#consumerSelect', title: 'Pick the Client', body: "Select the client you're generating the complaint for. The form will use their name and contact details in the complaint narrative automatically. Their negative items also load into the items panel so you can select exactly which accounts are part of the complaint.", pose: 'default' },
      { target: '#cfpbFormSection', title: 'Complaint Details Form', body: "Fill in the company being complained about (Equifax, Experian, TransUnion, or any creditor), the violation type (FCRA no response, inaccurate reporting, re-aged debt, and more), and attach any proof documents like dispute letters and bureau responses. The violation type list covers every common FCRA and FDCPA scenario so you don't have to write it from scratch.", pose: 'default' },
      { target: '#cfpbItemsPanel', title: 'Disputed Account Items', body: "Check the specific accounts or items you want included in the complaint. These are pulled directly from the client's credit report data. You can also add a custom item manually if the disputed account isn't listed. Being specific about which accounts are affected makes the complaint much harder for the bureau to dismiss.", pose: 'default' },
      { target: '#btnGenerateCfpb', title: 'Generate & Save', body: "Click Generate to have AI write a formal 'What Happened' narrative and a 'What Resolution I Am Seeking' statement — both using FCRA-compliant language. Review the output, copy it to file at consumerfinance.gov, and click Save to Record to attach it permanently to the client's file. Filed complaints are tracked in the Saved Complaints section below.", pose: 'celebrate' }
    ]
  },
  education: {
    label: 'Credit Academy',
    icon: '🎓',
    desc: 'Master credit repair, FCRA law, and dispute strategy',
    steps: [
      { target: '.workspace-hero, .hero-title', title: 'Welcome to Credit Academy!', body: "The Credit Academy is your personal training ground for becoming a world-class credit repair professional. Structured lessons cover everything from credit report basics and FCRA law fundamentals all the way to advanced Metro-2 dispute strategy and business scaling. Each lesson you complete builds your expertise and credibility.", pose: 'wave' },
      { target: '.edu-header', title: 'Your Learning Progress', body: "Track your growth here. Your Level badge shows your current rank as you earn XP from completing lessons. The XP progress bar fills as you learn. Your streak counter tracks consecutive days of study — consistency is the fastest path to mastery. Completed lessons show you exactly how far you've come.", pose: 'default' },
      { target: '#educationSection, #education', title: 'Course Catalog', body: "Lessons are organized by skill level — Beginner, Intermediate, and Expert. Beginner courses cover credit report anatomy, score factors, and initial dispute strategy. Intermediate dives into FCRA law, bureau-specific rules, and letter writing technique. Expert covers Metro-2 compliance, data furnisher liability, and advanced escalation strategies. Click any lesson to start it immediately.", pose: 'excited' },
      { target: '.edu-xp-bar, .edu-xp-fill', title: 'XP & Level System', body: "Every lesson you complete earns XP points. As your XP grows, you level up — from Beginner through Practitioner to Expert and beyond. Higher levels signal to your clients and peers that you've put in the work. The streak system rewards daily learning habits, which research shows is the most effective way to retain new information over the long term.", pose: 'celebrate' }
    ]
  },
  affiliate: {
    label: 'Affiliate Program',
    icon: '🔗',
    desc: 'Earn commissions by referring new users to Evolv',
    steps: [
      { target: '#affiliateNotJoined, #affiliateDashboard, #adminSection', title: 'Your Affiliate Program', body: "The Affiliate Program turns your network into a revenue stream. When someone signs up for Evolv using your referral link, you earn a commission — automatically tracked and paid out on request. Whether you're a solo practitioner or a team, this adds passive income to your business without any extra work.", pose: 'wave' },
      { target: '#affiliateNotJoined', title: 'Join to Get Started', body: "New here? Click 'Join Affiliate Program' to activate your account and get your unique referral links — one for the DIY client-facing product and one for the CRM. Once joined, your dashboard activates and tracks every click, signup, and commission earned in real time.", pose: 'default' },
      { target: '#affiliateDashboard', title: 'Affiliate Dashboard', body: "Your dashboard shows the key metrics: Total Clicks on your referral links, Signups converted, Total Earned, and your Conversion Rate. Below the stats are your Earnings Breakdown (total, paid out, pending, and available balance), your Payout History, and your full Referral History. Click 'Request Payout' when your available balance is ready to withdraw via PayPal, Venmo, or check.", pose: 'default' },
      { target: '#ratesPanel', title: 'Commission Rate Schedule', body: "Admins can set commission rates here for each product tier — DIY Basic, DIY Pro, DIY Tradeline purchases, and CRM Starter/Business/Enterprise plans. Each referral that converts to a paid subscription at that tier earns the corresponding commission amount. Higher-tier referrals pay more, so focus your outreach on prospects who need the full CRM experience.", pose: 'excited' }
    ]
  },
  social: {
    label: 'Social Media Manager',
    icon: '📱',
    desc: 'Generate and schedule AI-crafted Facebook posts from RSS feeds',
    steps: [
      { target: '.workspace-hero, .hero-title', title: 'Social Media Manager', body: "Stay top-of-mind with your audience without spending hours creating content. The Social Media Manager connects to your Facebook Page, pulls articles from RSS news feeds, and uses AI to craft compliant, engaging posts — ready to schedule with one click. This keeps your social presence active even on your busiest days.", pose: 'wave' },
      { target: '#smTabs', title: 'Section Tabs', body: "Navigate using the tabs: Connect links your Facebook Page, Feeds manages the RSS news sources you pull content from, Compose creates individual posts with AI assistance, and Schedule shows your upcoming post calendar. Start with Connect if you haven't linked Facebook yet.", pose: 'default' },
      { target: '#tab-connect, #connectBody', title: 'Facebook Connection', body: "Connect your Facebook Page using your Facebook App credentials. Once connected, the status badge turns green and your Page name appears. All posts generated here go to this connected Page. The setup guide walks you through creating a Facebook App if you don't have one — it takes about 5 minutes and you only do it once.", pose: 'default' },
      { target: '#tab-feeds, #feedsList', title: 'RSS Feed Sources', body: "Add any RSS feed URL and give it a name — for example, CFPB News, NerdWallet, or your favorite credit industry blog. The system pulls the latest articles from each feed so you always have fresh, relevant content to share. Credit-related news is perfect for positioning you as a knowledgeable expert to your followers.", pose: 'excited' }
    ]
  },
  'marketing-sms': {
    label: 'Marketing — SMS',
    icon: '📲',
    desc: 'Build compliant SMS campaigns and save reusable templates',
    steps: [
      { target: '#marketingSmsBuilder', title: 'SMS Campaign Builder', body: "The SMS builder helps you craft outreach messages before you wire them into Twilio or any SMS provider. Build your campaign name, choose a recipient segment (All Leads, New Clients, Inactive Accounts, or Owner-Operators), and write your message using merge fields like {{first_name}} and {{dispute_stage}} for personalization. A live phone preview shows exactly what recipients will see.", pose: 'wave' },
      { target: '#smsMessage, #mergeFieldSelect', title: 'Merge Fields & Personalization', body: "Personalized messages get 3-5x higher response rates. Use the merge field dropdown to insert tokens like {{first_name}}, {{credit_score}}, or {{cta_link}} directly into your message body. The character counter tracks your message length — SMS messages over 160 characters split into multiple segments, which increases cost. Keep it tight and punchy for best results.", pose: 'default' },
      { target: '#smsTemplateForm, #smsTemplateList', title: 'SMS Template Manager', body: "Save frequently-used messages as named templates organized by audience segment. Saved templates appear in the list below the form and can be reused across multiple campaigns. When you're ready to go live, templates push directly to your SMS automation backend via API. Always include opt-out language — the guardrails here remind you to append 'Reply STOP' before going live.", pose: 'excited' }
    ]
  },
  'marketing-email': {
    label: 'Marketing — Email',
    icon: '💌',
    desc: 'Design email templates, nurture sequences, and dispatch schedules',
    steps: [
      { target: '#marketingEmailBuilder', title: 'Email Template Designer', body: "Design branded email templates for every stage of the client journey — from lead nurture and onboarding to dispute updates and upsell offers. Filter templates by audience segment: B2C consumers, B2B/truckers, or attorney referral partners. Click 'New Template' to start from scratch or 'Import HTML' to upload an existing design.", pose: 'wave' },
      { target: '#emailSequenceForm, #emailSequenceList', title: 'Email Sequence Builder', body: "Sequences are multi-step email flows that fire automatically on a schedule. A '7-Day Dispute Warm-Up' sequence might send a welcome email on day 1, a credit education article on day 3, and a consultation invite on day 7. Define the sequence name, target segment, frequency, and individual steps here. Once connected to your email provider, sequences run on autopilot.", pose: 'default' },
      { target: '#dispatchForm, #dispatchList', title: 'Dispatch Scheduler', body: "The Dispatch Scheduler queues specific templates or sequences to go out to a segment at a scheduled time. Set the target asset, cadence (immediate, daily, or weekly), segment, audience count, and launch date. Upcoming dispatches appear in the list on the right. Track open-to-consult rate after each dispatch and iterate on subject lines and CTAs to improve performance over time.", pose: 'excited' }
    ]
  }
};

const PAGE_MAP = {
  'dashboard': 'dashboard',
  'dashboard.html': 'dashboard',
  'clients': 'clients',
  'index.html': 'clients',
  'leads': 'leads',
  'leads.html': 'leads',
  'library': 'library',
  'library.html': 'library',
  'billing': 'billing',
  'billing.html': 'billing',
  'settings': 'settings',
  'settings.html': 'settings',
  'letters': 'letters',
  'letters.html': 'letters',
  'tradelines': 'tradelines',
  'tradelines.html': 'tradelines',
  'schedule': 'schedule',
  'schedule.html': 'schedule',
  'marketing': 'marketing',
  'marketing.html': 'marketing',
  'workflows': 'workflows',
  'workflows.html': 'workflows',
  'my-company': 'my-company',
  'my-company.html': 'my-company',
  'client-invoicing': 'client-invoicing',
  'client-invoicing.html': 'client-invoicing',
  'client-portal-settings': 'client-portal-settings',
  'client-portal-settings.html': 'client-portal-settings',
  'disputes': 'disputes',
  'disputes.html': 'disputes',
  'cfpb': 'cfpb',
  'cfpb.html': 'cfpb',
  'education': 'education',
  'education.html': 'education',
  'affiliate': 'affiliate',
  'affiliate.html': 'affiliate',
  'social': 'social',
  'facebook-manager': 'social',
  'facebook-manager.html': 'social',
  'sms': 'marketing-sms',
  'email': 'marketing-email'
};

const ROUTE_MAP = {
  'dashboard': '/dashboard',
  'clients': '/clients',
  'leads': '/leads',
  'library': '/library',
  'billing': '/billing',
  'settings': '/settings',
  'letters': '/letters',
  'tradelines': '/tradelines',
  'schedule': '/schedule',
  'marketing': '/marketing',
  'workflows': '/workflows',
  'my-company': '/my-company',
  'client-invoicing': '/client-invoicing',
  'client-portal-settings': '/client-portal-settings',
  'disputes': '/disputes',
  'cfpb': '/cfpb',
  'education': '/education',
  'affiliate': '/affiliate',
  'social': '/social',
  'marketing-sms': '/marketing/sms',
  'marketing-email': '/marketing/email'
};

function getCurrentPageKey() {
  const path = window.location.pathname;
  const segment = path.split('/').filter(Boolean).pop() || 'dashboard';
  return PAGE_MAP[segment] || null;
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
        if (el && el.getBoundingClientRect().height > 0) return el;
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
      const rect = target.getBoundingClientRect();
      const inView = rect.top >= 0 && rect.bottom <= window.innerHeight;
      if (inView) {
        this.positionElements(target, step);
      } else {
        target.scrollIntoView({ behavior: 'smooth', block: 'center' });
        const waitForScroll = () => {
          let settled = 0;
          let lastY = window.scrollY;
          let frames = 0;
          const maxFrames = 120;
          const check = () => {
            frames++;
            if (Math.abs(window.scrollY - lastY) < 1) settled++;
            else settled = 0;
            lastY = window.scrollY;
            if (settled >= 3 || frames >= maxFrames) {
              this.positionElements(target, step);
            } else {
              requestAnimationFrame(check);
            }
          };
          requestAnimationFrame(check);
        };
        waitForScroll();
      }
    } else {
      this.positionCenter(step);
    }
  }

  positionElements(target, step) {
    const rect = target.getBoundingClientRect();
    const pad = 10;

    this.spotlight.style.position = 'fixed';
    this.spotlight.style.top = `${rect.top - pad}px`;
    this.spotlight.style.left = `${rect.left - pad}px`;
    this.spotlight.style.width = `${rect.width + pad * 2}px`;
    this.spotlight.style.height = `${rect.height + pad * 2}px`;

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
    const spaceLeft = rect.left;

    if (spaceBelow > 280) return 'bottom';
    if (spaceAbove > 280) return 'top';
    if (spaceRight > 460) return 'right';
    if (spaceLeft > 460) return 'left';
    return spaceBelow >= spaceAbove ? 'bottom' : 'top';
  }

  renderPopover(step, placement, rect) {
    const isLast = this.currentStep === this.steps.length - 1;
    const isFirst = this.currentStep === 0;
    const poseClass = step.pose ? `tour-phoenix--${step.pose}` : '';

    const dots = this.steps.map((_, i) => {
      let cls = 'tour-bubble__dot';
      if (i === this.currentStep) cls += ' tour-bubble__dot--active';
      else if (i < this.currentStep) cls += ' tour-bubble__dot--done';
      return `<div class="${cls}"></div>`;
    }).join('');

    this.popover.setAttribute('data-placement', placement);
    this.popover.innerHTML = `
      <div class="tour-phoenix ${poseClass}">
        ${TOUR_ICON_SVG}
      </div>
      <div class="tour-bubble">
        <button class="tour-bubble__close" data-action="skip" aria-label="Close" title="Close">✕</button>
        <div class="tour-bubble__title">${esc(step.title)}</div>
        <div class="tour-bubble__body">${step.body}</div>
        <div class="tour-bubble__footer">
          <div class="tour-bubble__progress">${dots}</div>
          <div class="tour-bubble__actions">
            ${isFirst ? `<button class="tour-btn tour-btn--skip" data-action="skip">Skip Tour</button>` : `<button class="tour-btn tour-btn--prev" data-action="prev">Back</button>`}
            ${isLast
              ? `<button class="tour-btn tour-btn--finish" data-action="finish">Got it! 🔥</button>`
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
      const vw = window.innerWidth;
      const vh = window.innerHeight;
      const margin = 16;
      let top, left;

      switch (placement) {
        case 'bottom':
          top = rect.bottom + 16;
          left = Math.max(margin, Math.min(rect.left, vw - popRect.width - margin));
          break;
        case 'top':
          top = rect.top - popRect.height - 16;
          left = Math.max(margin, Math.min(rect.left, vw - popRect.width - margin));
          break;
        case 'right':
          top = Math.max(margin, rect.top);
          left = rect.right + 16;
          break;
        case 'left':
          top = Math.max(margin, rect.top);
          left = rect.left - popRect.width - 16;
          break;
      }

      top = Math.max(margin, Math.min(top, vh - popRect.height - margin));
      left = Math.max(margin, Math.min(left, vw - popRect.width - margin));

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

async function showTourMenu() {
  const existing = document.querySelector('.tour-menu-overlay');
  if (existing) existing.remove();

  const state = getTourState();
  const currentPage = getCurrentPageKey();
  const overlay = document.createElement('div');
  overlay.className = 'tour-menu-overlay';

  let autoShowOn = true;
  try {
    const tok = localStorage.getItem('token');
    if (tok) {
      const res = await fetch('/api/tour/status', { headers: { 'Authorization': 'Bearer ' + tok } });
      if (res.ok) {
        const data = await res.json();
        autoShowOn = !data.dismissed;
      }
    }
  } catch (_) {}

  const menuItems = Object.entries(PAGE_TOURS).map(([key, tour]) => {
    const done = state[key]?.completed;
    const isCurrent = key === currentPage;
    return `
      <div class="tour-menu__item" data-tour-key="${esc(key)}">
        <div class="tour-menu__item-icon">${esc(tour.icon)}</div>
        <div class="tour-menu__item-text">
          <div class="tour-menu__item-label">${esc(tour.label)}${isCurrent ? ' (current page)' : ''}</div>
          <div class="tour-menu__item-desc">${esc(tour.desc)}</div>
        </div>
        ${done ? '<span class="tour-menu__item-badge">✓ Done</span>' : ''}
      </div>
    `;
  }).join('');

  overlay.innerHTML = `
    <div class="tour-menu" style="position:relative;">
      <button class="tour-menu__close" data-close>✕</button>
      <div class="tour-menu__header">
        <div class="tour-phoenix" style="width:56px;height:56px;">${TOUR_ICON_SVG}</div>
        <div>
          <div class="tour-menu__title">Explore Evolv</div>
          <div class="tour-menu__subtitle">Choose a section to learn about</div>
        </div>
      </div>
      <div class="tour-menu__list" style="max-height: 400px; overflow-y: auto;">
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
        <button class="tour-menu__footer-toggle ${autoShowOn ? 'tour-menu__footer-toggle--on' : 'tour-menu__footer-toggle--off'}" data-action="toggle-autoshow">
          ${autoShowOn ? 'On' : 'Off'}
        </button>
      </div>
    </div>
  `;

  overlay.addEventListener('click', (e) => {
    if (e.target === overlay || e.target.closest('[data-close]')) {
      overlay.remove();
      return;
    }

    const toggleBtn = e.target.closest('[data-action="toggle-autoshow"]');
    if (toggleBtn) {
      const isOn = toggleBtn.classList.contains('tour-menu__footer-toggle--on');
      if (isOn) {
        dismissTourServer();
        toggleBtn.classList.replace('tour-menu__footer-toggle--on', 'tour-menu__footer-toggle--off');
        toggleBtn.textContent = 'Off';
      } else {
        undismissTourServer();
        const state = getTourState();
        delete state._welcomed;
        saveTourState(state);
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
      if (route) {
        sessionStorage.setItem('evolv.tour.autostart', key);
        window.location.href = route;
      }
    }
  });

  document.body.appendChild(overlay);
}

function dismissTourServer() {
  try {
    const tok = localStorage.getItem('token');
    if (!tok) return;
    fetch('/api/tour/dismiss', {
      method: 'POST',
      headers: { 'Authorization': 'Bearer ' + tok }
    }).catch(() => {});
  } catch (_) {}
}

function undismissTourServer() {
  try {
    const tok = localStorage.getItem('token');
    if (!tok) return;
    fetch('/api/tour/undismiss', {
      method: 'POST',
      headers: { 'Authorization': 'Bearer ' + tok }
    }).catch(() => {});
  } catch (_) {}
}

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
      const res = await fetch('/api/tour/status', {
        headers: { 'Authorization': 'Bearer ' + tok }
      });
      if (res.ok) {
        const data = await res.json();
        if (data.dismissed) {
          state._welcomed = true;
          saveTourState(state);
          return;
        }
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

function showWelcome() {
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
    </div>
  `;

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
