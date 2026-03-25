(function() {
  var PHOENIX_SVG = '<svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg">' +
    '<g transform="translate(50,58)">' +
    '<path d="M0,18 C-10,26 -18,16 -13,6 C-8,-4 -2,3 0,-1 Z" fill="#c49a45" opacity="0.75"/>' +
    '<path d="M0,18 C10,26 18,16 13,6 C8,-4 2,3 0,-1 Z" fill="#c49a45" opacity="0.75"/>' +
    '<path d="M0,-1 C-10,-9 -30,-5 -34,-17 C-36,-25 -24,-29 -12,-21 C-5,-15 -1,-7 0,-5 Z" fill="#d4a853" opacity="0.92"/>' +
    '<path d="M0,-1 C10,-9 30,-5 34,-17 C36,-25 24,-29 12,-21 C5,-15 1,-7 0,-5 Z" fill="#d4a853" opacity="0.92"/>' +
    '<path d="M0,-1 C-8,-7 -20,-4 -23,-13 C-25,-18 -17,-21 -8,-16 C-3,-12 -1,-5 0,-5 Z" fill="#e8c875" opacity="0.45"/>' +
    '<path d="M0,-1 C8,-7 20,-4 23,-13 C25,-18 17,-21 8,-16 C3,-12 1,-5 0,-5 Z" fill="#e8c875" opacity="0.45"/>' +
    '<ellipse cx="0" cy="-3" rx="3.5" ry="9" fill="#b8892e"/>' +
    '<circle cx="0" cy="-14" r="5" fill="#d4a853"/>' +
    '<path d="M-5,-19 C-7,-28 -1,-33 0,-25 C1,-33 7,-28 5,-19 Z" fill="#e87040" opacity="0.92"/>' +
    '<path d="M0,-21 C-2,-31 0,-38 0,-30 C0,-38 2,-31 0,-21 Z" fill="#f5a64a" opacity="0.8"/>' +
    '<circle cx="0" cy="-14" r="1.5" fill="#1a0a00"/>' +
    '</g>' +
    '</svg>';

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function(c) {
      return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c];
    });
  }

  var STORAGE_KEY = 'evolv.portal.tours';

  function getState() {
    try { return JSON.parse(localStorage.getItem(STORAGE_KEY)) || {}; } catch(e) { return {}; }
  }
  function saveState(s) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(s));
  }

  function _getPortalToken() {
    return localStorage.getItem('token') || localStorage.getItem('auth') || '';
  }

  function dismissPortalTourServer() {
    try {
      var tok = _getPortalToken();
      if (!tok) return;
      fetch('/api/portal-tour/dismiss', {
        method: 'POST',
        headers: { 'Authorization': 'Bearer ' + tok }
      }).catch(function() {});
    } catch(_) {}
  }

  function undismissPortalTourServer() {
    try {
      var tok = _getPortalToken();
      if (!tok) return;
      fetch('/api/portal-tour/undismiss', {
        method: 'POST',
        headers: { 'Authorization': 'Bearer ' + tok }
      }).catch(function() {});
    } catch(_) {}
  }

  function getPortalTourStatus() {
    var tok = _getPortalToken();
    if (!tok) return Promise.resolve({ dismissed: false });
    return fetch('/api/portal-tour/status', {
      headers: { 'Authorization': 'Bearer ' + tok }
    }).then(function(r) { return r.json(); }).catch(function() { return { dismissed: false }; });
  }

  var PORTAL_TOURS = {
    overview: {
      label: 'Overview',
      icon: '📊',
      hash: '#overview',
      desc: 'Your credit restoration dashboard at a glance',
      steps: [
        { target: '#overview', title: 'Welcome to Your Portal!', body: "Hi there! I'm Evolv, your credit restoration guide. This is your Overview dashboard — the first thing you see when you log in. It gives you a bird's-eye view of your entire credit journey: your scores, next steps, milestones, and much more. Let me walk you through each piece so you know exactly how to use everything!", pose: 'wave' },
        { target: '#creditScoreWidget', title: 'Credit Score Tracker', body: "These three cards show your latest credit scores from TransUnion, Experian, and Equifax. As your credit repair progresses, you'll see these numbers update. Watch for upward trends — that means the dispute process is working! Your team updates these scores when new credit reports are pulled.", pose: 'default' },
        { target: '#btnGoal', title: 'Daily Goal Tracker', body: "Click this button to mark your daily credit-building goal as complete. Staying consistent with small actions — like reviewing your report, making on-time payments, or checking your portal — adds up to major credit improvement over time.", pose: 'default' },
        { target: '#nextStepCard', title: 'Your Next Step', body: "This card always shows you what to do next in your credit repair journey. Whether it's uploading a document, reviewing dispute results, or making a payment, you'll never wonder \"what should I do now?\" Just follow the next step and you're on track.", pose: 'excited' },
        { target: '#milestonesCard', title: 'Milestones', body: "Track your credit repair achievements here. Milestones celebrate your progress — like your first deleted negative item, your first score increase, or completing a dispute round. Each milestone shows you how far you've come and keeps you motivated.", pose: 'default' },
        { target: '#reportSnapshotCard', title: 'Report Snapshot', body: "A quick summary of your current credit report data — how many accounts you have, negative items remaining, and your overall credit health. This snapshot updates each time your team processes a new report, so you can see improvements at a glance.", pose: 'default' },
        { target: '#teamCard', title: 'Your Team', body: "Meet the credit professionals working on your case. You can see who's assigned to you and their role. If you ever need to reach out, the Messages section lets you communicate directly with your team.", pose: 'default' },
        { target: '#newsCard', title: 'Industry News', body: "Stay informed about credit industry changes, new consumer rights, and tips that could help your credit journey. Knowledge is power — understanding how credit works helps you make better financial decisions going forward.", pose: 'default' },
        { target: '#documentsCard', title: 'Document Vault Preview', body: "A quick peek at your uploaded and received documents. You can see the most recent files here, and click through to the full Documents section for your complete file history. Keep your documents organized — they're the foundation of successful disputes.", pose: 'default' },
        { target: '#debtCalculatorCard', title: 'Debt Paydown Calculator', body: "Use this handy tool to see how different payment strategies affect your debt payoff timeline. Enter your balance, interest rate, and desired monthly payment to get a clear picture. Paying down debt improves your credit utilization ratio — one of the biggest factors in your score.", pose: 'celebrate' }
      ]
    },
    negativeItems: {
      label: 'Negative Items',
      icon: '⚠️',
      hash: '#negative-items',
      desc: 'View and understand items being disputed on your report',
      steps: [
        { target: '#negativeItemsCard', title: 'Your Negative Items', body: "This section shows every negative item found on your credit report that's being disputed. Each item is pulled directly from your credit report analysis and shows the creditor name, account details, and what's inaccurate or unfair about it. Understanding what's being disputed helps you stay informed throughout the process.", pose: 'wave' },
        { target: '#negativeItemSearch', title: 'Search Your Items', body: "Have a lot of items? Use this search bar to quickly find a specific creditor or account. Just start typing and the list filters instantly. This is especially helpful if you have items across multiple creditors and want to check on a specific one.", pose: 'default' },
        { target: '#negativeItemSort', title: 'Sort by Priority', body: "Sort your items by severity (which ones hurt your score the most) or by age (oldest first). Sorting by severity helps you understand which deletions would have the biggest positive impact on your score. Your team prioritizes the most impactful items first.", pose: 'excited' }
      ]
    },
    messages: {
      label: 'Messages',
      icon: '💬',
      hash: '#messages',
      desc: 'Communicate directly with your credit team',
      steps: [
        { target: '#messageSection .imsg-container', title: 'Your Message Center', body: "This is your direct line to your credit repair team. It works like a chat — you can ask questions, share updates, or request information at any time. Your team monitors messages and responds as quickly as possible, typically within 24 hours on business days.", pose: 'wave' },
        { target: '#messageList', title: 'Conversation History', body: "All your past messages are stored here so you can scroll back through your conversation history. Nothing gets lost — every question you've asked and every answer you've received is saved. This is great for referencing advice your team gave you earlier.", pose: 'default' },
        { target: '#messageForm', title: 'Send a Message', body: "Type your message here and hit send. You can ask about dispute status, request updates, share good news about score changes, or let your team know about any changes to your contact information. Clear communication helps your team serve you better.", pose: 'excited' }
      ]
    },
    education: {
      label: 'Education',
      icon: '🎓',
      hash: '#educationSection',
      desc: 'Learn credit fundamentals and level up your knowledge',
      steps: [
        { target: '#educationSection .edu-header', title: 'Credit Academy', body: "Welcome to Credit Academy! This is your personalized learning center where you'll master credit fundamentals, advanced strategies, and financial literacy. Each lesson is designed to be practical — you'll learn things you can immediately apply to improve your financial life.", pose: 'wave' },
        { target: '#educationSection .edu-xp-bar', title: 'Your Progress & XP', body: "Track your learning progress with the XP (experience points) system. As you complete lessons, you earn XP and level up. Keep your streak going by completing at least one lesson per day. The progress bar shows how close you are to the next level — it's like a game, but the rewards are real credit knowledge!", pose: 'excited' },
        { target: '#education', title: 'Lesson Path', body: "Your lessons are organized in a learning path, starting from the basics and progressing to advanced topics. Each lesson covers a specific credit concept — like understanding your credit report, how scoring models work, dispute strategies, and building positive credit history. Complete them in order for the best learning experience.", pose: 'default' }
      ]
    },
    documents: {
      label: 'Documents',
      icon: '📄',
      hash: '#documentSection',
      desc: 'Access your uploaded files and received documents',
      steps: [
        { target: '#documentSection', title: 'Document Vault', body: "Your Document Vault stores every file related to your credit repair case — uploaded IDs, credit reports, dispute response letters, and any other supporting documents. Everything is organized and secure, so you can always find what you need.", pose: 'wave' },
        { target: '#docSearchInput', title: 'Search Documents', body: "Looking for a specific file? Type a keyword here to search through your documents. Whether it's a credit report from a specific month or a response letter from a bureau, search finds it quickly.", pose: 'default' },
        { target: '#docList', title: 'Your Files', body: "All your documents appear here in an organized grid. You can view, download, or reference any file. Documents uploaded by you and files shared by your team are all in one place. Keep this vault well-stocked — having complete documentation strengthens your dispute cases.", pose: 'excited' }
      ]
    },
    mail: {
      label: 'Mail',
      icon: '✉️',
      hash: '#mailSection',
      desc: 'Track dispute letters and their mailing status',
      steps: [
        { target: '#mailSection', title: 'Mail Activity', body: "This section tracks every dispute letter generated for your case. You can see which letters have been created, which are waiting to be mailed, and which have already been sent. Mail tracking gives you full visibility into the dispute process.", pose: 'wave' },
        { target: '#mailTabWaiting', title: 'Waiting to Mail', body: "Letters in the \"Waiting\" tab are ready but haven't been sent yet. Your team prepares dispute letters in batches and mails them according to your dispute strategy. You'll see the letter type, the bureau or creditor it's addressed to, and when it was created.", pose: 'default' },
        { target: '#mailTabMailed', title: 'Already Mailed', body: "The \"Mailed\" tab shows letters that have been sent. Once mailed, bureaus and creditors have 30 days to investigate and respond. Keep an eye on the dates — when 30+ days pass, your team will follow up on any items that haven't received a response.", pose: 'excited' }
      ]
    },
    payments: {
      label: 'Payments',
      icon: '💳',
      hash: '#payments',
      desc: 'View invoices and manage your billing',
      steps: [
        { target: '#paymentSummaryCard', title: 'Outstanding Balance', body: "This card shows your current outstanding balance. If you have unpaid invoices, the total amount due appears here. Keeping your account current ensures your credit team can continue working on your disputes without interruption.", pose: 'wave' },
        { target: '#paymentList', title: 'Invoice History', body: "Every invoice your credit repair company has sent you is listed here. You can see the description, amount, date, and payment status for each one. Paid invoices are marked as complete, and unpaid ones will have a \"Pay Now\" button to take you through secure payment.", pose: 'default' },
        { target: '#paymentSection', title: 'Secure Payments', body: "All payments are processed securely through Stripe. When you click \"Pay Now\" on an invoice, you'll be taken to a secure checkout page. Your payment information is never stored on our servers — it's handled entirely by Stripe's bank-level security.", pose: 'excited' }
      ]
    },
    tradelines: {
      label: 'Tradelines',
      icon: '💰',
      hash: '#tradelines',
      desc: 'Browse authorized-user tradelines to boost your profile',
      steps: [
        { target: '#tradelinesSection', title: 'Tradeline Storefront', body: "Welcome to the Tradeline Storefront! Authorized-user tradelines are one of the fastest ways to boost your credit profile. When you're added as an authorized user on a seasoned account, that account's positive history can appear on your credit report, potentially increasing your score significantly.", pose: 'wave' },
        { target: '#tradelineRange, #tradelineBank', title: 'Filter & Search', body: "Use these filters to narrow down tradelines by credit limit range and bank. Looking for a high-limit Chase card? Filter by bank. Want something in a specific price range? Use the range selector. The search box lets you find specific tradelines by bank name or notes.", pose: 'default' },
        { target: '#tradelineList', title: 'Available Tradelines', body: "Each card shows a tradeline's key details: the bank, credit limit, age (how long the account has been open), price, and when the next statement reports. Older tradelines with higher limits generally have the most impact on your credit profile. Your team can help you choose the best fit for your situation.", pose: 'default' },
        { target: '#tradelineCartList', title: 'Your Cart', body: "Add tradelines to your cart to keep track of what you're interested in. You can see the total cost and review your selections before purchasing. Checkout links open securely and are saved for your convenience.", pose: 'excited' }
      ]
    },
    primaries: {
      label: 'Primaries',
      icon: '🏦',
      hash: '#primaries',
      desc: 'Build credit with primary tradeline accounts',
      steps: [
        { target: '#primariesSection', title: 'Primary Tradelines', body: "Primary tradelines are accounts you open in your own name — they're the foundation of a strong credit profile. Unlike authorized-user tradelines, these are yours and build your personal credit history over time. This section recommends the best options in several categories.", pose: 'wave' },
        { target: '#primariesSection .primaries-grid', title: 'Credit-Builder Options', body: "Browse through credit-builder loans, secured credit cards, credit-building apps, and rent-reporting services. Each card links directly to the provider's website. Your team has curated these options as the most effective and reputable choices for building primary tradelines.", pose: 'default' },
        { target: '#primariesSection .primaries-strategy-card', title: 'Recommended Strategy', body: "This strategy card outlines the most effective approach to building primary credit: start with a credit-builder loan, add a secured credit card, use apps for alternative reporting, and always pay on time. Following this step-by-step approach creates a diverse, strong credit profile that lenders love to see.", pose: 'celebrate' }
      ]
    },
    disputes: {
      label: 'Disputes',
      icon: '📋',
      hash: '#disputes',
      desc: 'Track dispute rounds, responses, and recommendations',
      steps: [
        { target: '#disputeSection', title: 'Dispute Tracker', body: "The Dispute Tracker is your window into the entire dispute process. Here you can see every round of disputes that has been filed, track responses from bureaus and creditors, and view recommendations for next steps. This is where your credit transformation journey comes to life.", pose: 'wave' },
        { target: '#disputeRoundList', title: 'Dispute Rounds', body: "Each dispute round represents a batch of letters sent on your behalf. You'll see the round number, date sent, how many items were disputed, and the current status. Rounds progress through stages: letters sent, waiting for response, responses received, and completed. Click on any round to see detailed information about each item.", pose: 'default' },
        { target: '#disputeFollowupCard', title: 'Report Your Results', body: "When you receive response letters from the credit bureaus, this section asks you to report the outcome for each disputed item. Did the item get deleted? Updated? Verified as accurate? Your answers help your team determine the best next steps — whether to escalate, try a different approach, or celebrate a successful deletion!", pose: 'excited' },
        { target: '#disputeRecommendations', title: 'Next Step Recommendations', body: "After you report your dispute results, your team provides personalized recommendations. These might include sending a follow-up dispute, escalating to a different law or strategy, adding supporting documentation, or moving to the next round. Following these recommendations keeps your case moving forward efficiently.", pose: 'default' }
      ]
    },
    uploads: {
      label: 'Uploads',
      icon: '📤',
      hash: '#uploads',
      desc: 'Upload required documents to start your credit repair',
      steps: [
        { target: '#uploadSection', title: 'Secure Uploads', body: "This is where you upload the documents your credit team needs to get started and keep your case moving. Uploading complete, clear documents speeds up the process and ensures your disputes are as strong as possible.", pose: 'wave' },
        { target: '[data-type="id"]', title: 'Government ID', body: "Upload a clear photo or scan of your government-issued ID — driver's license, passport, or state ID. This is required by law for credit disputes because bureaus need to verify your identity. Make sure all text is readable and the photo isn't blurry.", pose: 'default' },
        { target: '[data-type="residence"]', title: 'Proof of Residency', body: "A utility bill, bank statement, or lease agreement that shows your current address. This must match the address on your credit report. Bureaus use this to confirm where to send dispute results and updated reports.", pose: 'default' },
        { target: '[data-type="ssn"]', title: 'Social Security Card', body: "Your Social Security card or an SSA-1099 letter. This confirms your Social Security number, which is the primary identifier on your credit report. Your SSN is encrypted and stored securely — only your credit team can access it.", pose: 'default' },
        { target: '[data-type="other"]', title: 'Additional Documents', body: "Upload any other supporting documents here — like credit report printouts, dispute response letters you've received in the mail, proof of payments, or court documents. The more documentation your team has, the stronger your dispute cases will be.", pose: 'excited' }
      ]
    }
  };

  var HASH_MAP = {
    '#overview': 'overview',
    '#negative-items': 'negativeItems',
    '#messages': 'messages',
    '#educationSection': 'education',
    '#documentSection': 'documents',
    '#mailSection': 'mail',
    '#payments': 'payments',
    '#tradelines': 'tradelines',
    '#primaries': 'primaries',
    '#disputes': 'disputes',
    '#uploads': 'uploads'
  };

  var SECTION_ORDER = ['overview', 'negativeItems', 'messages', 'education', 'documents', 'mail', 'payments', 'tradelines', 'primaries', 'disputes', 'uploads'];

  function getNextTourKey(currentKey) {
    var idx = SECTION_ORDER.indexOf(currentKey);
    if (idx === -1 || idx >= SECTION_ORDER.length - 1) return null;
    return SECTION_ORDER[idx + 1];
  }

  function getCurrentSectionKey() {
    var hash = window.location.hash || '#overview';
    return HASH_MAP[hash] || 'overview';
  }

  function PortalTourEngine() {
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

  PortalTourEngine.prototype.start = function(tourKey, options) {
    options = options || {};
    var tour = PORTAL_TOURS[tourKey];
    if (!tour) return;

    if (tour.hash && window.location.hash !== tour.hash) {
      var link = document.querySelector('a[href="' + tour.hash + '"]');
      if (link) link.click();
      var self = this;
      var attempts = 0;
      var waitForSection = function() {
        attempts++;
        var firstTarget = tour.steps[0] && tour.steps[0].target;
        var ready = false;
        if (firstTarget) {
          try { ready = !!document.querySelector(firstTarget.split(',')[0].trim()); } catch(e) {}
        }
        if (ready || attempts >= 10) {
          self._doStart(tourKey, options);
        } else {
          setTimeout(waitForSection, 200);
        }
      };
      setTimeout(waitForSection, 300);
      return;
    }
    this._doStart(tourKey, options);
  };

  PortalTourEngine.prototype._doStart = function(tourKey, options) {
    var tour = PORTAL_TOURS[tourKey];
    if (!tour) return;

    this.tourKey = tourKey;
    this.steps = tour.steps.filter(function(s) {
      var selectors = s.target.split(',').map(function(t) { return t.trim(); });
      return selectors.some(function(sel) {
        try { return !!document.querySelector(sel); } catch(e) { return false; }
      });
    });

    if (!this.steps.length) {
      this.steps = tour.steps.slice(0, 1);
      if (this.steps.length) {
        this.steps[0] = Object.assign({}, this.steps[0], { _noTarget: true });
      } else {
        return;
      }
    }

    this.currentStep = 0;
    this.onComplete = options.onComplete || null;
    this.isActive = true;
    this.createOverlay();
    this.showStep(0);
  };

  PortalTourEngine.prototype.createOverlay = function() {
    var self = this;
    this.cleanup();
    this.overlay = document.createElement('div');
    this.overlay.className = 'ptour-overlay ptour-overlay--active';
    this.overlay.innerHTML = '<div class="ptour-backdrop"></div>';
    this.overlay.addEventListener('click', function(e) {
      if (e.target === self.overlay || e.target.classList.contains('ptour-backdrop')) {
        self.finish(false);
      }
    });
    document.body.appendChild(this.overlay);

    this.spotlight = document.createElement('div');
    this.spotlight.className = 'ptour-spotlight';
    this.overlay.appendChild(this.spotlight);

    this.popover = document.createElement('div');
    this.popover.className = 'ptour-popover';
    this.overlay.appendChild(this.popover);

    this._keyHandler = function(e) {
      if (!self.isActive) return;
      if (e.key === 'Escape') { e.preventDefault(); self.finish(false); }
      if (e.key === 'ArrowRight' || e.key === 'Enter') { e.preventDefault(); self.next(); }
      if (e.key === 'ArrowLeft') { e.preventDefault(); self.prev(); }
    };
    document.addEventListener('keydown', this._keyHandler);
  };

  PortalTourEngine.prototype.findTarget = function(step) {
    if (step._noTarget) return null;
    var selectors = step.target.split(',').map(function(t) { return t.trim(); });
    for (var i = 0; i < selectors.length; i++) {
      try {
        var el = document.querySelector(selectors[i]);
        if (el && el.offsetParent !== null) return el;
        if (el && el.getBoundingClientRect().height > 0) return el;
      } catch(e) {}
    }
    return null;
  };

  PortalTourEngine.prototype.showStep = function(index) {
    if (index < 0 || index >= this.steps.length) return;
    this.currentStep = index;
    var step = this.steps[index];
    var target = this.findTarget(step);
    var self = this;

    if (target) {
      var rect = target.getBoundingClientRect();
      var inView = rect.top >= 0 && rect.bottom <= window.innerHeight;
      if (inView) {
        this.positionElements(target, step);
      } else {
        target.scrollIntoView({ behavior: 'smooth', block: 'center' });
        var settled = 0;
        var lastY = window.scrollY;
        var frames = 0;
        var check = function() {
          frames++;
          if (Math.abs(window.scrollY - lastY) < 1) settled++;
          else settled = 0;
          lastY = window.scrollY;
          if (settled >= 3 || frames >= 120) {
            self.positionElements(target, step);
          } else {
            requestAnimationFrame(check);
          }
        };
        requestAnimationFrame(check);
      }
    } else {
      this.positionCenter(step);
    }
  };

  PortalTourEngine.prototype.positionElements = function(target, step) {
    var rect = target.getBoundingClientRect();
    var pad = 10;

    this.spotlight.style.position = 'fixed';
    this.spotlight.style.top = (rect.top - pad) + 'px';
    this.spotlight.style.left = (rect.left - pad) + 'px';
    this.spotlight.style.width = (rect.width + pad * 2) + 'px';
    this.spotlight.style.height = (rect.height + pad * 2) + 'px';

    var placement = this.calculatePlacement(rect);
    this.renderPopover(step, placement, rect);
  };

  PortalTourEngine.prototype.positionCenter = function(step) {
    this.spotlight.style.top = '-9999px';
    this.spotlight.style.left = '-9999px';
    this.spotlight.style.width = '0';
    this.spotlight.style.height = '0';
    this.renderPopover(step, 'center', null);
  };

  PortalTourEngine.prototype.calculatePlacement = function(rect) {
    var vh = window.innerHeight;
    var vw = window.innerWidth;
    var spaceBelow = vh - rect.bottom;
    var spaceAbove = rect.top;
    var spaceRight = vw - rect.right;
    var spaceLeft = rect.left;

    if (spaceBelow > 280) return 'bottom';
    if (spaceAbove > 280) return 'top';
    if (spaceRight > 460) return 'right';
    if (spaceLeft > 460) return 'left';
    return spaceBelow >= spaceAbove ? 'bottom' : 'top';
  };

  PortalTourEngine.prototype.renderPopover = function(step, placement, rect) {
    var self = this;
    var isLast = this.currentStep === this.steps.length - 1;
    var isFirst = this.currentStep === 0;
    var poseClass = step.pose ? 'ptour-phoenix--' + step.pose : '';

    var dots = this.steps.map(function(_, i) {
      var cls = 'ptour-bubble__dot';
      if (i === self.currentStep) cls += ' ptour-bubble__dot--active';
      else if (i < self.currentStep) cls += ' ptour-bubble__dot--done';
      return '<div class="' + cls + '"></div>';
    }).join('');

    this.popover.setAttribute('data-placement', placement);
    this.popover.innerHTML =
      '<div class="ptour-phoenix ' + poseClass + '">' +
        PHOENIX_SVG +
      '</div>' +
      '<div class="ptour-bubble">' +
        '<button class="ptour-bubble__close" data-action="skip" aria-label="Close" title="Close">\u2715</button>' +
        '<div class="ptour-bubble__title">' + esc(step.title) + '</div>' +
        '<div class="ptour-bubble__body">' + step.body + '</div>' +
        '<div class="ptour-bubble__footer">' +
          '<div class="ptour-bubble__progress">' + dots + '</div>' +
          '<div class="ptour-bubble__actions">' +
            (isFirst
              ? '<button class="ptour-btn ptour-btn--skip" data-action="skip">Skip Tour</button>'
              : '<button class="ptour-btn ptour-btn--prev" data-action="prev">Back</button>') +
            (isLast
              ? '<button class="ptour-btn ptour-btn--finish" data-action="finish">Got it!</button>'
              : '<button class="ptour-btn ptour-btn--next" data-action="next">Next \u2192</button>') +
          '</div>' +
        '</div>' +
      '</div>';

    this.popover.querySelectorAll('[data-action]').forEach(function(btn) {
      btn.addEventListener('click', function(e) {
        e.stopPropagation();
        var action = btn.dataset.action;
        if (action === 'next') self.next();
        else if (action === 'prev') self.prev();
        else if (action === 'skip') self.finish(false);
        else if (action === 'finish') self.finish(true);
      });
    });

    this.popover.style.animation = 'none';
    void this.popover.offsetHeight;
    this.popover.style.animation = '';

    requestAnimationFrame(function() {
      if (placement === 'center') {
        self.popover.style.position = 'fixed';
        self.popover.style.top = '50%';
        self.popover.style.left = '50%';
        self.popover.style.transform = 'translate(-50%, -50%)';
        return;
      }
      if (!rect) return;

      self.popover.style.position = 'fixed';
      self.popover.style.transform = 'none';
      var popRect = self.popover.getBoundingClientRect();
      var vw = window.innerWidth;
      var vh = window.innerHeight;
      var margin = 16;
      var top, left;

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

      self.popover.style.top = top + 'px';
      self.popover.style.left = left + 'px';
    });
  };

  PortalTourEngine.prototype.next = function() {
    if (this.currentStep < this.steps.length - 1) {
      this.showStep(this.currentStep + 1);
    } else {
      this.finish(true);
    }
  };

  PortalTourEngine.prototype.prev = function() {
    if (this.currentStep > 0) {
      this.showStep(this.currentStep - 1);
    }
  };

  PortalTourEngine.prototype.finish = function(completed) {
    this.isActive = false;
    if (this._keyHandler) {
      document.removeEventListener('keydown', this._keyHandler);
      this._keyHandler = null;
    }

    var finishedKey = this.tourKey;

    if (completed && finishedKey) {
      var state = getState();
      state[finishedKey] = { completed: true, date: new Date().toISOString() };
      saveState(state);
      this.showConfetti();
    }

    this.cleanup();

    if (completed && finishedKey) {
      var nextKey = getNextTourKey(finishedKey);
      this.showContinuePrompt(finishedKey, nextKey);
    }

    if (this.onComplete) this.onComplete(completed);
  };

  PortalTourEngine.prototype.showContinuePrompt = function(finishedKey, nextKey) {
    var self = this;
    var finishedTour = PORTAL_TOURS[finishedKey];
    var nextTour = nextKey ? PORTAL_TOURS[nextKey] : null;

    var existing = document.querySelector('.ptour-continue-overlay');
    if (existing) existing.remove();

    var overlay = document.createElement('div');
    overlay.className = 'ptour-continue-overlay';

    var content;
    if (nextTour) {
      content =
        '<div class="ptour-continue__card">' +
          '<div class="ptour-continue__phoenix">' + PHOENIX_SVG + '</div>' +
          '<div class="ptour-continue__title">Section Complete!</div>' +
          '<div class="ptour-continue__body">' +
            'Great job! You\'ve finished the <strong>' + esc(finishedTour.label) + '</strong> tour. ' +
            'Up next is <strong>' + esc(nextTour.label) + '</strong> — ' + esc(nextTour.desc) + '. ' +
            'Want to keep going?' +
          '</div>' +
          '<div class="ptour-continue__actions">' +
            '<button class="ptour-continue__btn ptour-continue__btn--next" data-action="continue">' +
              'Continue to ' + esc(nextTour.label) + ' ' + esc(nextTour.icon) +
            '</button>' +
            '<button class="ptour-continue__btn ptour-continue__btn--end" data-action="end">End Tour</button>' +
          '</div>' +
          '<div class="ptour-continue__progress">' + buildSectionProgress() + '</div>' +
        '</div>';
    } else {
      content =
        '<div class="ptour-continue__card">' +
          '<div class="ptour-continue__phoenix ptour-phoenix--celebrate">' + PHOENIX_SVG + '</div>' +
          '<div class="ptour-continue__title">Tour Complete!</div>' +
          '<div class="ptour-continue__body">' +
            'Amazing! You\'ve toured every section of your portal. You\'re all set to make the most of your credit restoration journey. ' +
            'Remember, you can always click the tour button to revisit any section.' +
          '</div>' +
          '<div class="ptour-continue__actions">' +
            '<button class="ptour-continue__btn ptour-continue__btn--next" data-action="end">Got It!</button>' +
          '</div>' +
          '<div class="ptour-continue__progress">' + buildSectionProgress() + '</div>' +
        '</div>';
    }

    overlay.innerHTML = content;

    overlay.addEventListener('click', function(e) {
      var action = e.target.closest('[data-action]');
      if (!action) {
        if (e.target === overlay) {
          overlay.remove();
        }
        return;
      }
      var act = action.dataset.action;
      overlay.remove();
      if (act === 'continue' && nextKey) {
        self.start(nextKey);
      }
    });

    document.body.appendChild(overlay);
  };

  function buildSectionProgress() {
    var state = getState();
    var items = SECTION_ORDER.map(function(key) {
      var tour = PORTAL_TOURS[key];
      var done = state[key] && state[key].completed;
      return '<span class="ptour-section-pip' + (done ? ' ptour-section-pip--done' : '') + '" title="' + esc(tour.label) + '">' +
        esc(tour.icon) +
      '</span>';
    });
    return items.join('');
  }

  PortalTourEngine.prototype.cleanup = function() {
    if (this.overlay && this.overlay.parentNode) {
      this.overlay.parentNode.removeChild(this.overlay);
    }
    this.overlay = null;
    this.spotlight = null;
    this.popover = null;
  };

  PortalTourEngine.prototype.showConfetti = function() {
    var container = document.createElement('div');
    container.className = 'ptour-confetti';
    document.body.appendChild(container);
    var colors = ['#3b82f6', '#60a5fa', '#2563eb', '#93c5fd', '#1d4ed8'];
    for (var i = 0; i < 50; i++) {
      var piece = document.createElement('div');
      piece.className = 'ptour-confetti__piece';
      piece.style.left = (Math.random() * 100) + '%';
      piece.style.background = colors[Math.floor(Math.random() * colors.length)];
      piece.style.animationDelay = (Math.random() * 0.8) + 's';
      piece.style.animationDuration = (1.5 + Math.random()) + 's';
      piece.style.width = (4 + Math.random() * 6) + 'px';
      piece.style.height = (4 + Math.random() * 6) + 'px';
      container.appendChild(piece);
    }
    setTimeout(function() { container.remove(); }, 3000);
  };

  var engine = new PortalTourEngine();

  function startSectionTour(key) {
    var k = key || getCurrentSectionKey();
    if (k) engine.start(k);
  }

  function showTourMenu() {
    var existing = document.querySelector('.ptour-menu-overlay');
    if (existing) existing.remove();

    var state = getState();
    var currentSection = getCurrentSectionKey();
    var overlay = document.createElement('div');
    overlay.className = 'ptour-menu-overlay';

    var menuItems = Object.keys(PORTAL_TOURS).map(function(key) {
      var tour = PORTAL_TOURS[key];
      var done = state[key] && state[key].completed;
      var isCurrent = key === currentSection;
      return '<div class="ptour-menu__item" data-tour-key="' + esc(key) + '">' +
        '<div class="ptour-menu__item-icon">' + esc(tour.icon) + '</div>' +
        '<div class="ptour-menu__item-text">' +
          '<div class="ptour-menu__item-label">' + esc(tour.label) + (isCurrent ? ' (current)' : '') + '</div>' +
          '<div class="ptour-menu__item-desc">' + esc(tour.desc) + '</div>' +
        '</div>' +
        (done ? '<span class="ptour-menu__item-badge">\u2713 Done</span>' : '') +
      '</div>';
    }).join('');

    getPortalTourStatus().then(function(data) {
      var autoShowOn = !(data && data.dismissed);

      overlay.innerHTML =
        '<div class="ptour-menu" style="position:relative;">' +
          '<button class="ptour-menu__close" data-close>\u2715</button>' +
          '<div class="ptour-menu__header">' +
            '<div class="ptour-phoenix" style="width:56px;height:56px;">' + PHOENIX_SVG + '</div>' +
            '<div>' +
              '<div class="ptour-menu__title">Portal Tour Guide</div>' +
              '<div class="ptour-menu__subtitle">Choose a section to learn about</div>' +
            '</div>' +
          '</div>' +
          '<div class="ptour-menu__list" style="max-height:400px;overflow-y:auto;">' +
            '<div class="ptour-menu__item ptour-menu__item--full" data-tour-key="__current__">' +
              '<div class="ptour-menu__item-icon">\uD83D\uDD25</div>' +
              '<div class="ptour-menu__item-text">' +
                '<div class="ptour-menu__item-label">Tour This Section</div>' +
                '<div class="ptour-menu__item-desc">Let Evolv walk you through what\'s on screen right now</div>' +
              '</div>' +
            '</div>' +
            menuItems +
          '</div>' +
          '<div class="tour-menu__footer">' +
            '<span class="tour-menu__footer-label">Auto-show on login</span>' +
            '<button class="tour-menu__footer-toggle ' + (autoShowOn ? 'tour-menu__footer-toggle--on' : 'tour-menu__footer-toggle--off') + '" data-action="toggle-autoshow">' +
              (autoShowOn ? 'On' : 'Off') +
            '</button>' +
          '</div>' +
        '</div>';

      overlay.addEventListener('click', function(e) {
        if (e.target === overlay || e.target.closest('[data-close]')) {
          overlay.remove();
          return;
        }

        var toggleBtn = e.target.closest('[data-action="toggle-autoshow"]');
        if (toggleBtn) {
          var isOn = toggleBtn.classList.contains('tour-menu__footer-toggle--on');
          if (isOn) {
            dismissPortalTourServer();
            toggleBtn.classList.replace('tour-menu__footer-toggle--on', 'tour-menu__footer-toggle--off');
            toggleBtn.textContent = 'Off';
          } else {
            undismissPortalTourServer();
            var st = getState();
            delete st._welcomed;
            saveState(st);
            toggleBtn.classList.replace('tour-menu__footer-toggle--off', 'tour-menu__footer-toggle--on');
            toggleBtn.textContent = 'On';
          }
          return;
        }

        var item = e.target.closest('[data-tour-key]');
        if (!item) return;
        var key = item.dataset.tourKey;
        overlay.remove();

        if (key === '__current__') {
          startSectionTour();
          return;
        }

        engine.start(key);
      });

      document.body.appendChild(overlay);
    });
  }

  function showWelcome() {
    var overlay = document.createElement('div');
    overlay.className = 'ptour-welcome';
    overlay.innerHTML =
      '<div class="ptour-welcome__card">' +
        '<div class="ptour-welcome__phoenix">' + PHOENIX_SVG + '</div>' +
        '<div class="ptour-welcome__title">Welcome to Your Portal!</div>' +
        '<div class="ptour-welcome__body">' +
          'Hi! I\'m Evolv 🔥 — your phoenix guide to credit restoration. This portal is your command center for tracking disputes, uploading documents, monitoring your credit scores, and communicating with your team. Want me to show you around?' +
        '</div>' +
        '<div class="tour-welcome__opt-out" style="margin:10px 0 4px;text-align:center;">' +
          '<label class="tour-welcome__opt-out-label" style="display:inline-flex;align-items:center;gap:7px;font-size:13px;color:#9ca3af;cursor:pointer;">' +
            '<input type="checkbox" id="ptourDontShowAgain" class="tour-welcome__opt-out-check">' +
            "Don\u2019t show this again" +
          '</label>' +
        '</div>' +
        '<div class="ptour-welcome__actions">' +
          '<button class="ptour-welcome__btn ptour-welcome__btn--start" data-action="start">Show Me Around!</button>' +
          '<button class="ptour-welcome__btn ptour-welcome__btn--skip" data-action="skip">I\'ll Explore On My Own</button>' +
        '</div>' +
      '</div>';

    overlay.addEventListener('click', function(e) {
      var action = (e.target.closest('[data-action]') || {}).dataset;
      action = action ? action.action : null;
      if (action === 'start') {
        overlay.remove();
        dismissPortalTourServer();
        startSectionTour('overview');
      } else if (action === 'skip' || e.target === overlay) {
        var cb = overlay.querySelector('#ptourDontShowAgain');
        overlay.remove();
        if (cb && cb.checked) dismissPortalTourServer();
      }
    });

    document.body.appendChild(overlay);
  }

  function checkAutoStart() {
    var state = getState();
    if (state._welcomed) return;

    getPortalTourStatus().then(function(data) {
      if (data && data.dismissed) {
        var st = getState();
        st._welcomed = true;
        saveState(st);
        return;
      }
      var st = getState();
      st._welcomed = true;
      saveState(st);
      setTimeout(showWelcome, 1500);
    });
  }

  function resetAllTours() {
    localStorage.removeItem(STORAGE_KEY);
  }

  function initFab() {
    var fab = document.getElementById('portalTourFab');
    if (fab) {
      fab.addEventListener('click', function(e) {
        e.preventDefault();
        e.stopPropagation();
        showTourMenu();
      });
    }
  }

  window.PortalTour = {
    start: startSectionTour,
    showMenu: showTourMenu,
    showWelcome: showWelcome,
    reset: resetAllTours,
    engine: engine,
    PORTAL_TOURS: PORTAL_TOURS
  };

  window.addEventListener('portal:tutorial-request', function(event) {
    var mode = (event && event.detail && event.detail.mode) || 'start';
    if (mode === 'menu') {
      showTourMenu();
    } else {
      startSectionTour();
    }
  });

  window.addEventListener('portal:tutorial-reset', function() {
    resetAllTours();
  });

  function onReady() {
    initFab();
    setTimeout(checkAutoStart, 1000);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', onReady);
  } else {
    onReady();
  }
})();
