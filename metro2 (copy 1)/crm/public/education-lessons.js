window.EDUCATION_LESSONS = [
  {
    id: 'credit-score',
    title: 'Understanding Your Credit Score',
    subtitle: 'Learn what makes up your score',
    icon: '📊',
    xp: 100,
    sections: [
      {
        type: 'content',
        title: 'What Is a Credit Score?',
        body: 'Your credit score is a three-digit number (300–850) that tells lenders how likely you are to repay borrowed money. Think of it like a financial GPA — it summarizes your credit history into one quick snapshot.',
        visual: { type: 'meter', label: 'Credit Score Range', ranges: [
          { min: 300, max: 579, label: 'Poor', color: '#ef4444' },
          { min: 580, max: 669, label: 'Fair', color: '#f59e0b' },
          { min: 670, max: 739, label: 'Good', color: '#22c55e' },
          { min: 740, max: 799, label: 'Very Good', color: '#3b82f6' },
          { min: 800, max: 850, label: 'Excellent', color: '#8b5cf6' }
        ]}
      },
      {
        type: 'content',
        title: 'The 5 Factors That Build Your Score',
        body: 'Your score is calculated from five key areas. Each one carries a different weight:',
        visual: { type: 'breakdown', items: [
          { label: 'Payment History', pct: 35, color: '#22c55e', desc: 'Do you pay on time? This is the single biggest factor.' },
          { label: 'Credit Utilization', pct: 30, color: '#3b82f6', desc: 'How much of your available credit are you using?' },
          { label: 'Length of History', pct: 15, color: '#8b5cf6', desc: 'How long have your accounts been open?' },
          { label: 'Credit Mix', pct: 10, color: '#f59e0b', desc: 'Do you have different types of credit (cards, loans, mortgage)?' },
          { label: 'New Credit', pct: 10, color: '#ef4444', desc: 'How many new accounts or inquiries do you have?' }
        ]}
      },
      {
        type: 'scenario',
        title: 'Real-Life Scenario: Meet Marcus',
        story: 'Marcus has a credit card with a $10,000 limit. He currently carries a $7,500 balance. He always pays at least the minimum on time. His only account is 2 years old.',
        question: 'What is Marcus\'s credit utilization rate?',
        options: [
          { text: '25%', correct: false, explanation: 'That would be the case if his balance were $2,500.' },
          { text: '50%', correct: false, explanation: 'That would mean a $5,000 balance on a $10,000 limit.' },
          { text: '75%', correct: true, explanation: 'Correct! $7,500 ÷ $10,000 = 75%. Experts recommend keeping utilization below 30% for a healthy score.' },
          { text: '100%', correct: false, explanation: 'That would mean he maxed out the entire $10,000 limit.' }
        ]
      },
      {
        type: 'scenario',
        title: 'Scenario: Which Hurts More?',
        story: 'Two neighbors both have 720 credit scores. Neighbor A misses one mortgage payment by 30 days. Neighbor B opens 3 new credit cards in the same week.',
        question: 'Which neighbor will likely see a bigger score drop?',
        options: [
          { text: 'Neighbor A — the missed payment', correct: true, explanation: 'Correct! Payment history is 35% of your score. A single 30-day late payment can drop a good score by 60-110 points. New inquiries (Neighbor B) only account for 10% and might drop 5-15 points.' },
          { text: 'Neighbor B — the new cards', correct: false, explanation: 'Opening new cards causes hard inquiries (10% of score), which typically drops 5-15 points. A missed payment affects 35% of the score and can cause a 60-110 point drop.' },
          { text: 'Both will drop equally', correct: false, explanation: 'Payment history (35%) weighs much more than new credit (10%). The missed payment will have a significantly larger impact.' },
          { text: 'Neither will be affected', correct: false, explanation: 'Both actions do affect your score, but payment history carries a much heavier weight.' }
        ]
      },
      {
        type: 'content',
        title: 'Key Takeaways',
        body: '<strong>Remember these golden rules:</strong>\n\n• Pay every bill on time — it\'s 35% of your score\n• Keep credit card balances below 30% of your limit\n• Don\'t close old accounts — length of history matters\n• Limit new credit applications to when you truly need them\n• A healthy mix of credit types (cards + installment loans) helps',
        visual: { type: 'tip', text: 'Pro Tip: Set up autopay for at least the minimum payment on every account. One missed payment can undo months of progress.' }
      }
    ]
  },
  {
    id: 'reading-report',
    title: 'Reading Your Credit Report',
    subtitle: 'Navigate the 3 bureau reports',
    icon: '📄',
    xp: 100,
    sections: [
      {
        type: 'content',
        title: 'The 3 Credit Bureaus',
        body: 'There are three major credit bureaus that collect your financial data independently. Each one may have slightly different information, which is why your scores can vary.',
        visual: { type: 'cards', items: [
          { title: 'TransUnion', desc: 'Often the first score lenders check. Updates frequently.', icon: '🔵' },
          { title: 'Experian', desc: 'Largest bureau globally. Offers free monitoring tools.', icon: '🔴' },
          { title: 'Equifax', desc: 'Frequently used for mortgage lending decisions.', icon: '🟣' }
        ]}
      },
      {
        type: 'content',
        title: 'Sections of Your Report',
        body: 'Every credit report has four main sections. Understanding each one is critical for spotting errors:',
        visual: { type: 'steps', items: [
          { title: 'Personal Information', desc: 'Name, address, SSN, employers. Errors here are common and can mix your file with someone else\'s.' },
          { title: 'Account History (Tradelines)', desc: 'Every credit card, loan, and line of credit. Shows balances, limits, payment history, and status.' },
          { title: 'Public Records', desc: 'Bankruptcies, tax liens, and civil judgments. These are the most damaging items.' },
          { title: 'Inquiries', desc: 'Hard inquiries (you applied for credit) and soft inquiries (pre-approvals, your own checks). Only hard inquiries affect your score.' }
        ]}
      },
      {
        type: 'scenario',
        title: 'Scenario: Spot the Error',
        story: 'Lisa pulls her credit report and finds an auto loan listed from a dealership she\'s never visited, showing a $15,000 balance. Her name is correct but the middle initial is wrong.',
        question: 'What is the most likely explanation?',
        options: [
          { text: 'A data entry error — the loan belongs to someone with a similar name', correct: true, explanation: 'Correct! This is called a "mixed file" — one of the most common credit report errors. The bureau merged another person\'s data into Lisa\'s report. She should dispute this immediately.' },
          { text: 'She co-signed for someone and forgot', correct: false, explanation: 'While possible, the wrong middle initial strongly suggests a mixed file error, not a co-signed loan.' },
          { text: 'It\'s normal — bureaus add accounts for testing', correct: false, explanation: 'Bureaus never add test accounts. Every item on your report represents real reported data.' },
          { text: 'The dealership made a mistake but it will fix itself', correct: false, explanation: 'Credit report errors don\'t fix themselves. You must actively dispute them to get them removed.' }
        ]
      },
      {
        type: 'scenario',
        title: 'Scenario: Hard vs. Soft Inquiry',
        story: 'David checked his own credit score on Credit Karma last week. Today, he applied for a car loan at three different dealerships within a 2-hour window.',
        question: 'How many hard inquiries will appear on David\'s report?',
        options: [
          { text: 'Four — one for Credit Karma plus three dealerships', correct: false, explanation: 'Credit Karma is a soft inquiry and never appears as a hard inquiry on your report.' },
          { text: 'Three — one for each dealership', correct: false, explanation: 'Close, but multiple auto loan inquiries within a 14-45 day window are typically grouped as one inquiry.' },
          { text: 'One — the auto loan inquiries count as a single inquiry', correct: true, explanation: 'Correct! Rate shopping is protected. Multiple inquiries for the same type of loan (auto, mortgage, student) within a short window (14-45 days depending on scoring model) count as just one inquiry.' },
          { text: 'Zero — dealerships don\'t pull credit', correct: false, explanation: 'Dealerships absolutely pull your credit when you apply for financing.' }
        ]
      },
      {
        type: 'content',
        title: 'Key Takeaways',
        body: '<strong>What to check on your report:</strong>\n\n• Verify all personal information is correct (name, SSN, addresses)\n• Look for accounts you don\'t recognize — possible mixed file or fraud\n• Check that closed accounts show as "closed by consumer" not "closed by creditor"\n• Verify balances and payment history are accurate\n• Count your hard inquiries — they should fall off after 2 years',
        visual: { type: 'tip', text: 'Pro Tip: Pull your free reports from AnnualCreditReport.com. You\'re entitled to one free report from each bureau every 12 months.' }
      }
    ]
  },
  {
    id: 'negative-items',
    title: 'Types of Negative Items',
    subtitle: 'Collections, charge-offs & more',
    icon: '⚠️',
    xp: 100,
    sections: [
      {
        type: 'content',
        title: 'What Are Negative Items?',
        body: 'Negative items are derogatory marks on your credit report that lower your score. They tell lenders you\'ve had trouble managing credit in the past. The good news? Every negative item has an expiration date.',
        visual: { type: 'timeline', items: [
          { label: 'Late Payments', duration: '7 years', severity: 'medium', desc: 'Reported at 30, 60, 90, and 120+ days late.' },
          { label: 'Collections', duration: '7 years', severity: 'high', desc: 'Debt sold to a collection agency after non-payment.' },
          { label: 'Charge-Offs', duration: '7 years', severity: 'high', desc: 'Creditor writes off debt as a loss. Still owed.' },
          { label: 'Repossessions', duration: '7 years', severity: 'high', desc: 'Vehicle or property taken back for non-payment.' },
          { label: 'Bankruptcies', duration: '7-10 years', severity: 'severe', desc: 'Chapter 7 stays 10 years, Chapter 13 stays 7 years.' },
          { label: 'Foreclosures', duration: '7 years', severity: 'severe', desc: 'Home seized by lender after mortgage default.' }
        ]}
      },
      {
        type: 'scenario',
        title: 'Scenario: The Medical Collection',
        story: 'After an ER visit, Tanya received a $2,400 bill. She thought her insurance covered it. Six months later, a collection account appeared on her credit report from an agency she\'d never heard of. Her score dropped 80 points overnight.',
        question: 'What should Tanya do FIRST?',
        options: [
          { text: 'Pay the collection immediately to fix her score', correct: false, explanation: 'Paying a collection doesn\'t always remove it from your report. In some scoring models, a paid collection still counts as negative. She should validate the debt first.' },
          { text: 'Request debt validation from the collection agency', correct: true, explanation: 'Correct! Under the FDCPA, Tanya has the right to request written verification of the debt within 30 days. The collector must prove the debt is valid and belongs to her. She should also check if insurance should have covered it.' },
          { text: 'Ignore it — medical debt doesn\'t count', correct: false, explanation: 'While recent FICO models weigh medical debt less heavily, it still impacts your score significantly. Ignoring it won\'t make it go away.' },
          { text: 'Close all her other accounts to prevent more damage', correct: false, explanation: 'Closing accounts would reduce her available credit, increase utilization, and potentially lower her score even more.' }
        ]
      },
      {
        type: 'scenario',
        title: 'Scenario: Charge-Off vs. Collection',
        story: 'James stopped paying his $5,000 credit card 8 months ago. The original creditor charged it off. Now James sees BOTH a charge-off from the bank AND a collection account from a new company on his report.',
        question: 'Is it legal to have both a charge-off and a collection for the same debt?',
        options: [
          { text: 'Yes — both the original creditor and collector can report', correct: false, explanation: 'While both CAN report, the balance should only show on one. If both show a balance, that\'s double-jeopardy and can be disputed.' },
          { text: 'No — only the collection agency can report after a charge-off', correct: false, explanation: 'The original creditor can still report the charge-off, but the balance reporting matters.' },
          { text: 'It depends — the charge-off should show $0 balance if sold to collections', correct: true, explanation: 'Correct! If the debt was sold, the original charge-off should show a $0 balance with a note that it was "transferred" or "sold." If both show balances, you can dispute the duplicate balance as inaccurate.' },
          { text: 'Neither should appear — charge-offs are automatically removed', correct: false, explanation: 'Charge-offs stay on your report for 7 years from the date of first delinquency. They don\'t automatically disappear.' }
        ]
      },
      {
        type: 'content',
        title: 'The 7-Year Clock',
        body: 'Every negative item has a built-in expiration. The clock starts from the <strong>Date of First Delinquency (DOFD)</strong> — the date you first fell behind and never caught up. This date cannot legally be reset.',
        visual: { type: 'tip', text: 'Important: If a collector tells you that paying or acknowledging the debt restarts the 7-year clock on your credit REPORT, that\'s false. The DOFD is fixed by law. However, making a payment CAN restart the statute of limitations for lawsuits in some states — know the difference!' }
      },
      {
        type: 'content',
        title: 'Key Takeaways',
        body: '<strong>Negative item action plan:</strong>\n\n• Always request debt validation before paying a collection\n• Check the Date of First Delinquency — items near expiration may not be worth paying\n• Watch for duplicate reporting (charge-off + collection with balances)\n• Medical collections under $500 are excluded from newer FICO models\n• Bankruptcies are the most severe but even they expire after 7-10 years',
        visual: { type: 'tip', text: 'Pro Tip: Under the FCRA, you have the right to dispute any item you believe is inaccurate, incomplete, or unverifiable. The bureau has 30 days to investigate.' }
      }
    ]
  },
  {
    id: 'dispute-process',
    title: 'The Dispute Process',
    subtitle: 'How to challenge inaccuracies',
    icon: '📝',
    xp: 100,
    sections: [
      {
        type: 'content',
        title: 'Your Legal Right to Dispute',
        body: 'The Fair Credit Reporting Act (FCRA) gives you the legal right to dispute any information on your credit report that you believe is inaccurate, incomplete, or unverifiable. When you file a dispute, the bureau MUST investigate within 30 days.',
        visual: { type: 'steps', items: [
          { title: 'Step 1: Identify the Error', desc: 'Review your report carefully. Note the account name, number, and what\'s wrong.' },
          { title: 'Step 2: Gather Evidence', desc: 'Collect documents that support your claim — statements, letters, ID, proof of payment.' },
          { title: 'Step 3: Write Your Dispute Letter', desc: 'Clearly state what\'s inaccurate and what correction you want. Include supporting documents.' },
          { title: 'Step 4: Send via Certified Mail', desc: 'Always send disputes by certified mail with return receipt. This creates a legal paper trail.' },
          { title: 'Step 5: Wait for Results', desc: 'The bureau has 30 days to investigate. They\'ll send you results and an updated report.' }
        ]}
      },
      {
        type: 'scenario',
        title: 'Scenario: The Wrong Late Payment',
        story: 'Robert has a car loan that shows 2 late payments in March and April 2024. He has bank statements proving the payments cleared on time both months. He also has the lender\'s payment confirmation emails.',
        question: 'What is the STRONGEST dispute approach for Robert?',
        options: [
          { text: 'Call the credit bureau and explain the error verbally', correct: false, explanation: 'Phone disputes are the weakest option. There\'s no paper trail, and you can\'t attach evidence. Always dispute in writing.' },
          { text: 'Dispute online through the bureau\'s website', correct: false, explanation: 'Online disputes are convenient but limited. You can\'t always attach detailed evidence, and the bureau may use a simplified "e-OSCAR" process that\'s less thorough.' },
          { text: 'Send a written dispute letter with copies of bank statements and payment confirmations via certified mail', correct: true, explanation: 'Correct! A written dispute with evidence sent via certified mail is the gold standard. It creates a legal record, forces a thorough investigation, and the evidence makes the case clear-cut.' },
          { text: 'Wait for the late payments to fall off naturally', correct: false, explanation: 'Late payments stay for 7 years! Since Robert has proof they\'re inaccurate, he should dispute them immediately.' }
        ]
      },
      {
        type: 'scenario',
        title: 'Scenario: Bureau Says "Verified"',
        story: 'After disputing a collection she doesn\'t recognize, Maria gets a letter saying the bureau "verified" the account as accurate. She\'s certain the debt isn\'t hers.',
        question: 'What should Maria do next?',
        options: [
          { text: 'Give up — the bureau has the final say', correct: false, explanation: 'The bureau doesn\'t have the final say. You have several escalation options available.' },
          { text: 'File a complaint with the CFPB and send a Method of Verification letter', correct: true, explanation: 'Correct! Maria can request the bureau\'s "method of verification" — they must tell her exactly how they verified the account. She can also file a CFPB complaint, which puts regulatory pressure on the bureau and often yields different results.' },
          { text: 'Dispute the same item again with the same letter', correct: false, explanation: 'Re-sending the same dispute can be flagged as "frivolous." Maria should escalate with new strategies — MOV request, CFPB complaint, or dispute directly with the furnisher.' },
          { text: 'Sue the collection company immediately', correct: false, explanation: 'Lawsuits should be a last resort. There are several intermediate steps that are faster and free.' }
        ]
      },
      {
        type: 'content',
        title: 'Key Takeaways',
        body: '<strong>Dispute process essentials:</strong>\n\n• Always dispute in writing — never rely on phone calls alone\n• Send letters via certified mail with return receipt requested\n• Include copies (never originals) of supporting documents\n• Keep a dispute log tracking dates, reference numbers, and results\n• If a dispute comes back "verified," escalate with a Method of Verification request or CFPB complaint\n• You can dispute with the bureau AND directly with the furnisher (the company that reported the data)',
        visual: { type: 'tip', text: 'Pro Tip: Dispute one or two items at a time. Flooding bureaus with many disputes at once can trigger "frivolous" flags and they may refuse to investigate.' }
      }
    ]
  },
  {
    id: 'writing-disputes',
    title: 'Writing Effective Disputes',
    subtitle: 'Craft letters that get results',
    icon: '✍️',
    xp: 100,
    sections: [
      {
        type: 'content',
        title: 'Anatomy of a Winning Dispute Letter',
        body: 'The best dispute letters are clear, specific, and backed by evidence. They tell the bureau exactly what\'s wrong and what you want done about it.',
        visual: { type: 'steps', items: [
          { title: 'Your Information', desc: 'Full name, address, date of birth, last 4 of SSN. Include a copy of your ID and a utility bill.' },
          { title: 'Account Details', desc: 'Creditor name, account number, the specific data you\'re disputing. Be precise.' },
          { title: 'Reason for Dispute', desc: 'State clearly WHY the information is wrong. "This account is not mine" or "The balance is incorrect — I paid this in full on [date]."' },
          { title: 'What You Want', desc: 'Tell them the action you want: "Please remove this account" or "Please update the balance to $0."' },
          { title: 'Evidence', desc: 'Attach copies of proof. Payment receipts, court documents, identity theft reports, etc.' }
        ]}
      },
      {
        type: 'scenario',
        title: 'Scenario: Which Letter Wins?',
        story: 'Compare these two dispute approaches for a collection account the consumer says isn\'t theirs:\n\n<strong>Letter A:</strong> "I don\'t owe this money. Remove it now or I\'ll sue."\n\n<strong>Letter B:</strong> "Account #4521 from ABC Collections reporting a $1,200 balance does not belong to me. I have no record of any account with the original creditor, XYZ Bank. Enclosed: copy of my ID and FTC Identity Theft Report #8847. Please investigate and remove this unverifiable account per FCRA §611."',
        question: 'Which letter is more likely to get results?',
        options: [
          { text: 'Letter A — being aggressive shows you\'re serious', correct: false, explanation: 'Threats without substance are actually counterproductive. Bureau investigators process thousands of letters and respond to clear, evidence-backed disputes.' },
          { text: 'Letter B — it\'s specific, cites the law, and includes evidence', correct: true, explanation: 'Correct! Letter B works because it: identifies the exact account, states a clear reason, references the legal obligation (FCRA §611), and includes supporting evidence. This makes it easy for the investigator to act.' },
          { text: 'Both are equally effective', correct: false, explanation: 'Letter A gives the investigator nothing to work with. Letter B provides everything needed to take action.' },
          { text: 'Neither — you should only dispute online', correct: false, explanation: 'Written disputes with evidence are consistently more effective than online disputes, which limit your ability to provide detailed documentation.' }
        ]
      },
      {
        type: 'scenario',
        title: 'Scenario: The 623 Direct Dispute',
        story: 'After the bureau verified a late payment that Angela knows is wrong, her credit repair specialist suggests sending a "623 dispute" directly to the creditor who reported the late payment.',
        question: 'What is a Section 623 dispute?',
        options: [
          { text: 'A type of lawsuit against the creditor', correct: false, explanation: 'Section 623 is not a lawsuit — it\'s a dispute sent directly to the company that furnished (reported) the data to the bureaus.' },
          { text: 'A dispute sent directly to the data furnisher (the creditor), who must investigate independently', correct: true, explanation: 'Correct! Under FCRA Section 623, after first disputing with the bureau, you can dispute directly with the furnisher. The creditor must conduct their own investigation and respond within 30 days. This bypasses the bureau\'s often-superficial e-OSCAR process.' },
          { text: 'A dispute that gets automatic approval after 623 hours', correct: false, explanation: 'The number 623 refers to the section of the Fair Credit Reporting Act, not a time period.' },
          { text: 'A special form only attorneys can file', correct: false, explanation: 'Anyone can send a 623 dispute letter. You don\'t need an attorney.' }
        ]
      },
      {
        type: 'content',
        title: 'Key Takeaways',
        body: '<strong>Letter writing best practices:</strong>\n\n• Be specific — reference exact account numbers and dates\n• Stay professional — no threats or emotional language\n• Cite the law — FCRA §611 (bureau disputes) or §623 (furnisher disputes)\n• One dispute per letter — don\'t bundle multiple issues\n• Always include copies of supporting evidence\n• Keep your own copies of everything you send\n• Track deadlines — bureaus have 30 days, furnishers have 30 days',
        visual: { type: 'tip', text: 'Pro Tip: The magic word in disputes is "unverifiable." If the creditor can\'t provide original signed documents proving the account terms, the item is unverifiable and must be removed under the FCRA.' }
      }
    ]
  },
  {
    id: 'building-credit',
    title: 'Building Positive Credit',
    subtitle: 'Strategies for credit growth',
    icon: '🌱',
    xp: 100,
    sections: [
      {
        type: 'content',
        title: 'The Credit-Building Toolkit',
        body: 'Once you\'ve cleaned up negative items, it\'s time to build positive credit history. There are several proven tools to get your score climbing.',
        visual: { type: 'cards', items: [
          { title: 'Secured Credit Card', desc: 'Put down a deposit ($200-$500) as your credit limit. Use it for small purchases and pay in full monthly.', icon: '💳' },
          { title: 'Credit Builder Loan', desc: 'A bank holds your loan amount in savings. You make monthly payments, building history. You get the money at the end.', icon: '🏦' },
          { title: 'Authorized User', desc: 'Get added to a family member\'s established card. Their positive history appears on your report too.', icon: '👥' },
          { title: 'Secured Loan', desc: 'Use a savings account as collateral for a small loan. Low risk for the lender, great for building your file.', icon: '🔐' }
        ]}
      },
      {
        type: 'scenario',
        title: 'Scenario: The Secured Card Strategy',
        story: 'After bankruptcy, Keisha gets a secured credit card with a $300 limit. She uses it to buy gas once a week (~$40) and pays the full balance when the statement arrives. After 8 months, her score has risen from 520 to 635.',
        question: 'Why is Keisha\'s strategy working so well?',
        options: [
          { text: 'She\'s spending the right amount — big purchases build credit faster', correct: false, explanation: 'The size of purchases doesn\'t matter. What matters is the utilization ratio and consistent on-time payments.' },
          { text: 'She keeps utilization low (~13%) and pays in full on time every month', correct: true, explanation: 'Correct! By spending ~$40 on a $300 limit, her utilization stays around 13% (well under 30%). Paying in full avoids interest AND shows perfect payment history. Both factors together are the fastest way to build credit.' },
          { text: 'Secured cards automatically boost your score faster than regular cards', correct: false, explanation: 'Secured cards report to bureaus the same way regular cards do. The boost comes from her smart usage pattern.' },
          { text: 'Bankruptcy gives you a fresh start bonus', correct: false, explanation: 'There\'s no "fresh start bonus." The bankruptcy actually stays on her report for 7-10 years. Her score is rising purely from new positive activity.' }
        ]
      },
      {
        type: 'scenario',
        title: 'Scenario: Authorized User Strategy',
        story: 'Tyler\'s mom has a Visa card she\'s had for 15 years with a $20,000 limit, $600 balance, and perfect payment history. She adds Tyler as an authorized user. Tyler is 21 and has no credit history at all.',
        question: 'What will likely happen to Tyler\'s credit?',
        options: [
          { text: 'Nothing — authorized users don\'t get credit benefits', correct: false, explanation: 'Most major card issuers report authorized user accounts to the bureaus, giving the AU the same history.' },
          { text: 'His score will jump significantly as the card\'s 15-year history, low utilization, and perfect payments appear on his report', correct: true, explanation: 'Correct! Tyler inherits the full history of the card — 15 years of on-time payments, 3% utilization ($600/$20,000). This is one of the fastest ways to establish credit. It could give him an instant score in the 700s.' },
          { text: 'He\'ll get a small boost but only from the date he was added', correct: false, explanation: 'Most scoring models count the full history of the card from when it was opened, not when the AU was added. This is what makes the strategy so powerful.' },
          { text: 'It will hurt his score because he\'ll inherit any late payments', correct: false, explanation: 'The card has perfect payment history, so there\'s nothing negative to inherit. If it did have negatives, Tyler could simply ask to be removed.' }
        ]
      },
      {
        type: 'content',
        title: 'Key Takeaways',
        body: '<strong>Credit building action plan:</strong>\n\n• Start with a secured card or credit builder loan — they\'re designed for rebuilding\n• Use the card for one small recurring purchase (gas, streaming subscription)\n• Pay the full statement balance every month — not just the minimum\n• Keep utilization under 30%, ideally under 10%\n• Ask a trusted family member about becoming an authorized user on a seasoned card\n• Don\'t apply for too many things at once — space applications 6+ months apart',
        visual: { type: 'tip', text: 'Pro Tip: The "2/3/4 Rule" — try to have at least 2 revolving accounts (credit cards) and 1 installment loan (car, personal, or credit builder) for an ideal credit mix. Don\'t rush this — build gradually over 6-12 months.' }
      }
    ]
  },
  {
    id: 'advanced-strategies',
    title: 'Advanced Strategies',
    subtitle: 'Goodwill letters & pay-for-delete',
    icon: '🚀',
    xp: 100,
    sections: [
      {
        type: 'content',
        title: 'Beyond Basic Disputes',
        body: 'Once you understand the fundamentals, there are powerful advanced strategies that can accelerate your credit transformation. These techniques require precision, but they can unlock results that standard disputes alone cannot achieve.',
        visual: { type: 'cards', items: [
          { title: 'Goodwill Letters', desc: 'Ask creditors to remove negative marks as a courtesy, especially if you\'re now a good customer.', icon: '💌' },
          { title: 'Pay-for-Delete', desc: 'Negotiate with collectors: you pay the debt in exchange for them removing the account from your report.', icon: '🤝' },
          { title: 'Rapid Rescoring', desc: 'Used during mortgage applications to quickly update corrected information at the bureau level.', icon: '⚡' },
          { title: 'Debt Validation Deep Dive', desc: 'Challenge collectors to produce the original signed agreement — many can\'t, which means removal.', icon: '🔍' }
        ]}
      },
      {
        type: 'scenario',
        title: 'Scenario: The Goodwill Letter',
        story: 'After losing her job in 2022, Patricia missed two payments on her Chase credit card. She\'s since caught up and has been paying on time for 18 months. The late payments are dragging her score down by an estimated 60 points.',
        question: 'What approach gives Patricia the best chance of getting the late payments removed?',
        options: [
          { text: 'Threaten to close her account if they don\'t remove the lates', correct: false, explanation: 'Threats usually backfire. The creditor has no obligation to remove accurate information and may simply let you close the account.' },
          { text: 'Write a sincere goodwill letter explaining the hardship, highlighting her recovery, and asking for a one-time courtesy removal', correct: true, explanation: 'Correct! A well-written goodwill letter works because: it shows accountability (she\'s not denying the lates), explains the circumstances (job loss), and demonstrates recovery (18 months of perfect payments). Chase and many creditors have internal policies for goodwill adjustments.' },
          { text: 'Dispute the late payments as inaccurate with the bureau', correct: false, explanation: 'Since the late payments are technically accurate, this dispute would likely be verified. Goodwill is the better path for accurate-but-circumstantial negative items.' },
          { text: 'Wait for them to fall off in 7 years', correct: false, explanation: 'Seven years is a long time to wait when a goodwill letter might resolve it in 30 days. It\'s worth the effort.' }
        ]
      },
      {
        type: 'scenario',
        title: 'Scenario: Pay-for-Delete Negotiation',
        story: 'A $800 medical collection from 2023 is on Derek\'s report. The collection agency contacts him offering to settle for $500. Derek wants the account completely removed from his credit report, not just paid.',
        question: 'How should Derek handle this negotiation?',
        options: [
          { text: 'Pay the $500 settlement and assume it gets removed', correct: false, explanation: 'Paying a collection doesn\'t automatically remove it. A "paid collection" still shows on your report and can still hurt your score.' },
          { text: 'Offer to pay the full $800 in exchange for a written agreement to delete the account from all three bureaus', correct: true, explanation: 'Correct! The key is getting the deletion agreement IN WRITING before paying. Derek might offer the full amount (or start lower) specifically because he wants full deletion. Get the letter on company letterhead or via email before sending any payment.' },
          { text: 'Refuse to pay anything since it\'s already on his report', correct: false, explanation: 'Not paying means the collection stays, and the collector might escalate to legal action depending on the statute of limitations.' },
          { text: 'Report the collector to the police', correct: false, explanation: 'A legitimate collector contacting you about a real debt isn\'t committing a crime. The right move is to negotiate strategically.' }
        ]
      },
      {
        type: 'content',
        title: 'Key Takeaways',
        body: '<strong>Advanced strategy playbook:</strong>\n\n• Goodwill letters work best when you have a track record of good recent behavior\n• Pay-for-delete MUST be in writing before you send payment\n• Request "paid in full" status, never "settled" if possible — "settled" looks worse\n• Use debt validation to challenge old collections — demand the original signed contract\n• Rapid rescoring is available through mortgage lenders and can update scores in 48-72 hours\n• Combine strategies: validate the debt first, then negotiate pay-for-delete if it\'s valid',
        visual: { type: 'tip', text: 'Pro Tip: When sending a pay-for-delete offer, use language like "conditional payment" — "I will remit payment of $X within 5 business days of receiving written confirmation that [Agency Name] will request deletion of account #XXXX from all three credit bureaus."' }
      }
    ]
  },
  {
    id: 'maintaining-score',
    title: 'Maintaining Your Score',
    subtitle: 'Keep your credit strong forever',
    icon: '🛡️',
    xp: 100,
    sections: [
      {
        type: 'content',
        title: 'The Maintenance Mindset',
        body: 'You\'ve worked hard to build and repair your credit. Now it\'s about protecting what you\'ve earned. Think of credit maintenance like physical fitness — consistent habits matter more than dramatic efforts.',
        visual: { type: 'cards', items: [
          { title: 'Monitor Monthly', desc: 'Check your reports and scores at least once a month. Catch errors early before they cause damage.', icon: '📊' },
          { title: 'Automate Payments', desc: 'Set up autopay for at least the minimum on every account. One late payment can undo months of progress.', icon: '⚙️' },
          { title: 'Keep Utilization Low', desc: 'Stay under 30% utilization at all times. Under 10% is ideal for maximum score potential.', icon: '📉' },
          { title: 'Freeze Your Credit', desc: 'Place security freezes at all three bureaus to prevent unauthorized accounts. Free and takes minutes.', icon: '🧊' }
        ]}
      },
      {
        type: 'scenario',
        title: 'Scenario: The Closing Mistake',
        story: 'Now that his credit score is 750, Daniel wants to simplify his finances. He has 5 credit cards and wants to close 3 of them — including his oldest card (opened 12 years ago) and two retail store cards.',
        question: 'What would you advise Daniel?',
        options: [
          { text: 'Close all three — fewer cards means less risk', correct: false, explanation: 'Closing cards reduces available credit (increasing utilization) and can shorten average account age. Both hurt your score.' },
          { text: 'Keep the oldest card open, and consider closing the two newest store cards only if they have annual fees', correct: true, explanation: 'Correct! The 12-year-old card is anchoring his credit history length. Closing it would dramatically reduce his average account age. If the store cards have no annual fees, it costs nothing to keep them open with a small purchase every 6 months.' },
          { text: 'Close all of them and go cash-only', correct: false, explanation: 'Going cash-only means no new positive credit activity. His score would gradually decline as his credit file becomes "thin" with no active accounts.' },
          { text: 'It doesn\'t matter which ones he closes', correct: false, explanation: 'It matters a lot. Closing the oldest card would hurt the most because it removes 12 years of history from the "average age" calculation.' }
        ]
      },
      {
        type: 'scenario',
        title: 'Scenario: The Identity Theft Alert',
        story: 'Sandra gets a notification from her credit monitoring service: a new credit card was opened in her name at a bank she\'s never used, with a $5,000 limit. She did NOT apply for this card.',
        question: 'What is the correct order of actions Sandra should take?',
        options: [
          { text: 'File a police report, then wait to see if charges appear', correct: false, explanation: 'Waiting is risky. The fraudster could run up charges immediately. Sandra needs to act on all fronts simultaneously.' },
          { text: 'Call the bank, freeze credit at all 3 bureaus, file an FTC identity theft report, file a police report, dispute the account', correct: true, explanation: 'Correct! Sandra needs to: 1) Call the bank to close the fraudulent account, 2) Freeze her credit at TransUnion, Experian, and Equifax immediately, 3) File an identity theft report at IdentityTheft.gov, 4) File a police report for documentation, 5) Dispute the account with all three bureaus using the FTC report.' },
          { text: 'Just dispute the account with the credit bureaus', correct: false, explanation: 'Disputing alone doesn\'t stop the fraudster from opening more accounts. She needs to freeze her credit immediately to prevent further damage.' },
          { text: 'Ignore it — the bank will figure it out eventually', correct: false, explanation: 'Ignoring identity theft allows the fraudster to continue, potentially opening more accounts, taking loans, or committing crimes in Sandra\'s name.' }
        ]
      },
      {
        type: 'content',
        title: 'Your Credit Maintenance Checklist',
        body: '<strong>Monthly, quarterly, and yearly habits for lasting credit health:</strong>\n\n<strong>Monthly:</strong>\n• Check credit monitoring alerts\n• Verify all statement balances are correct\n• Ensure autopay processed successfully\n\n<strong>Quarterly:</strong>\n• Review full credit report from one bureau (rotate bureaus)\n• Check credit utilization across all cards\n• Look for unfamiliar accounts or inquiries\n\n<strong>Yearly:</strong>\n• Pull free reports from AnnualCreditReport.com\n• Review and update security freezes\n• Assess whether to request credit limit increases (boosts utilization ratio)',
        visual: { type: 'tip', text: 'Pro Tip: Set calendar reminders for credit check-ups. January = TransUnion, May = Experian, September = Equifax. This way you\'re checking a bureau report every 4 months for free.' }
      }
    ]
  }
];
