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
        body: 'Your credit score is a three-digit number (300–850) that tells lenders how likely you are to repay borrowed money. Think of it like a financial GPA — it summarizes your credit history into one quick snapshot.\n\nBanks, landlords, insurance companies, and even some employers use your score to make decisions about you. A higher score means better interest rates, easier approvals, and more financial options.',
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
        title: 'FICO vs. VantageScore — What\'s the Difference?',
        body: 'There are two main scoring models, and they calculate your score differently:\n\n<strong>FICO Score</strong> — Used by 90% of lenders. Created by Fair Isaac Corporation. Most mortgage, auto, and credit card lenders rely on FICO. There are many versions (FICO 8, FICO 9, FICO 10) and each weighs factors slightly differently.\n\n<strong>VantageScore</strong> — Created by the three bureaus together. Used by many free monitoring tools like Credit Karma. Tends to be more forgiving of limited credit history.\n\nThe score you see on a free app may not match what a lender sees. Lenders often pull industry-specific FICO scores (like FICO Auto Score for car loans) that weigh certain factors more heavily.',
        visual: { type: 'cards', items: [
          { title: 'FICO 8', desc: 'Most widely used. Ignores small collections under $100. Penalizes high utilization heavily.', icon: '📈' },
          { title: 'FICO 9', desc: 'Ignores paid collections entirely. Treats medical debt more leniently. Rent payments count.', icon: '📊' },
          { title: 'FICO 10 Suite', desc: 'Newest model. Includes FICO 10T which uses 24 months of trending data, rewarding consistent paydown.', icon: '🔮' },
          { title: 'VantageScore 3.0', desc: 'Used by Credit Karma. Can score thin files. Treats paid collections as neutral.', icon: '📱' }
        ]}
      },
      {
        type: 'content',
        title: 'The 5 Factors That Build Your Score',
        body: 'Your score is calculated from five key areas. Each one carries a different weight. Understanding these factors lets you prioritize the changes that will move your score the most:',
        visual: { type: 'breakdown', items: [
          { label: 'Payment History', pct: 35, color: '#22c55e', desc: 'Do you pay on time? This is the single biggest factor. Even one 30-day late payment can drop a 780 score by 90-110 points.' },
          { label: 'Credit Utilization', pct: 30, color: '#3b82f6', desc: 'How much of your available credit are you using? The percentage of your limits you\'re using across all cards combined.' },
          { label: 'Length of History', pct: 15, color: '#8b5cf6', desc: 'How long have your accounts been open? Average age of all accounts plus age of your oldest account.' },
          { label: 'Credit Mix', pct: 10, color: '#f59e0b', desc: 'Do you have different types of credit? Revolving (cards) + installment (car, mortgage, student) = ideal mix.' },
          { label: 'New Credit', pct: 10, color: '#ef4444', desc: 'How many new accounts or inquiries do you have? Each hard pull can drop your score 5-15 points temporarily.' }
        ]}
      },
      {
        type: 'content',
        title: 'The Utilization Sweet Spots',
        body: 'Credit utilization is the second biggest factor at 30%, but most people don\'t know there are thresholds that matter:\n\n<strong>0% utilization</strong> — Surprisingly, zero usage can slightly hurt you. Lenders want to see you actually using credit responsibly.\n\n<strong>1-9% utilization</strong> — The scoring sweet spot. People with the highest scores typically use 1-9% of their limits.\n\n<strong>10-29% utilization</strong> — Still considered good. Minimal negative impact.\n\n<strong>30-49% utilization</strong> — The danger zone begins. You\'ll start seeing score drops.\n\n<strong>50-74% utilization</strong> — Significant negative impact. Lenders see risk.\n\n<strong>75%+ utilization</strong> — Severe impact. This signals financial stress to scoring models.\n\nImportant: Utilization is calculated per-card AND across all cards combined. Having one maxed-out card hurts even if your overall utilization is low.',
        visual: { type: 'tip', text: 'Advanced Tip: Your utilization is calculated based on your statement balance — the amount reported to the bureaus. You can "game" this by paying down your balance BEFORE the statement closing date. This way, a lower balance gets reported even if you use the card heavily during the month.' }
      },
      {
        type: 'scenario',
        title: 'Real-Life Scenario: Meet Marcus',
        story: 'Marcus has a credit card with a $10,000 limit. He currently carries a $7,500 balance. He always pays at least the minimum on time. His only account is 2 years old.',
        question: 'What is Marcus\'s credit utilization rate?',
        options: [
          { text: '25%', correct: false, explanation: 'That would be the case if his balance were $2,500.' },
          { text: '50%', correct: false, explanation: 'That would mean a $5,000 balance on a $10,000 limit.' },
          { text: '75%', correct: true, explanation: 'Correct! $7,500 ÷ $10,000 = 75%. This is critically high. Experts recommend keeping utilization below 30% for a healthy score, and ideally under 10% for maximum points. Marcus should focus on paying this down before anything else.' },
          { text: '100%', correct: false, explanation: 'That would mean he maxed out the entire $10,000 limit.' }
        ]
      },
      {
        type: 'scenario',
        title: 'Scenario: Which Hurts More?',
        story: 'Two neighbors both have 720 credit scores. Neighbor A misses one mortgage payment by 30 days. Neighbor B opens 3 new credit cards in the same week.',
        question: 'Which neighbor will likely see a bigger score drop?',
        options: [
          { text: 'Neighbor A — the missed payment', correct: true, explanation: 'Correct! Payment history is 35% of your score. A single 30-day late payment can drop a good score by 60-110 points. New inquiries (Neighbor B) only account for 10% and might drop 5-15 points total. The impact difference is dramatic.' },
          { text: 'Neighbor B — the new cards', correct: false, explanation: 'Opening new cards causes hard inquiries (10% of score), which typically drops 5-15 points. A missed payment affects 35% of the score and can cause a 60-110 point drop.' },
          { text: 'Both will drop equally', correct: false, explanation: 'Payment history (35%) weighs much more than new credit (10%). The missed payment will have a significantly larger impact.' },
          { text: 'Neither will be affected', correct: false, explanation: 'Both actions do affect your score, but payment history carries a much heavier weight.' }
        ]
      },
      {
        type: 'scenario',
        title: 'Scenario: The Statement Balance Trick',
        story: 'Priya has two credit cards:\n• Card A: $5,000 limit, $4,800 balance (96% utilization)\n• Card B: $15,000 limit, $200 balance (1.3% utilization)\n\nHer overall utilization is $5,000/$20,000 = 25%, which seems okay.',
        question: 'Will Priya\'s score be affected by Card A even though her overall utilization is only 25%?',
        options: [
          { text: 'No — only overall utilization matters', correct: false, explanation: 'Both individual card utilization AND overall utilization are factored in. A maxed-out card hurts regardless of what your other cards show.' },
          { text: 'Yes — having one card at 96% utilization will hurt her score even though overall utilization is 25%', correct: true, explanation: 'Correct! Scoring models look at BOTH individual card utilization and overall utilization. Having Card A at 96% is a major red flag even if the total is 25%. Priya should transfer some of Card A\'s balance to Card B, or pay down Card A aggressively.' },
          { text: 'Only if Card A is a store card', correct: false, explanation: 'The type of card doesn\'t matter here. Individual card utilization is tracked for all revolving accounts.' },
          { text: 'It depends on her payment history', correct: false, explanation: 'Payment history and utilization are scored independently. High utilization will hurt regardless of perfect payment history.' }
        ]
      },
      {
        type: 'scenario',
        title: 'Scenario: The Score Gap Mystery',
        story: 'Carlos checks his credit score on three different sources:\n• Credit Karma says 695\n• His bank app says 712\n• His mortgage lender says 668\n\nAll three were checked within the same week. Carlos is confused about which one is "real."',
        question: 'Why are Carlos\'s scores so different?',
        options: [
          { text: 'Two of the scores must be wrong', correct: false, explanation: 'All three can be accurate — they\'re just using different scoring models and pulling from different bureaus.' },
          { text: 'Each source uses a different scoring model and may pull from a different bureau, so variation is normal', correct: true, explanation: 'Correct! Credit Karma uses VantageScore (often from TransUnion or Equifax). His bank might use FICO 8 from Experian. His mortgage lender uses a specialized FICO mortgage score, which tends to be the most conservative. A 40-50 point spread between models is completely normal.' },
          { text: 'Credit Karma inflates scores to make users feel good', correct: false, explanation: 'Credit Karma accurately reports VantageScore results. The difference is in the model used, not inflation.' },
          { text: 'His mortgage lender is trying to give him a worse rate', correct: false, explanation: 'Mortgage lenders use industry-standard FICO mortgage scores required by Fannie Mae/Freddie Mac. They can\'t change which model they use.' }
        ]
      },
      {
        type: 'content',
        title: 'Key Takeaways',
        body: '<strong>Remember these golden rules:</strong>\n\n• Pay every bill on time — it\'s 35% of your score and a single late can cost 60-110 points\n• Keep credit card balances below 30% of your limit — under 10% is ideal\n• Don\'t close old accounts — length of history (15%) directly depends on account age\n• Limit new credit applications to when you truly need them\n• A healthy mix of credit types (cards + installment loans) helps the remaining 10%\n• The score you see on free apps may differ from what lenders see — understand which model you\'re looking at\n• Pay attention to BOTH individual card utilization and overall utilization',
        visual: { type: 'tip', text: 'Pro Tip: Set up autopay for at least the minimum payment on every account. Then set a calendar reminder 3 days before each statement closes to pay down balances. This ensures on-time payments AND low reported utilization — attacking both top factors at once.' }
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
        body: 'There are three major credit bureaus that collect your financial data independently. Each one may have slightly different information because not all creditors report to all three. This means you could have different accounts — and different errors — on each report.\n\nThis is why pulling all three reports is critical. An error on one report might not appear on the others, and a collection on Equifax might be missing from Experian.',
        visual: { type: 'cards', items: [
          { title: 'TransUnion', desc: 'Often the first score lenders check. Updates frequently. Known for detailed employment history tracking.', icon: '🔵' },
          { title: 'Experian', desc: 'Largest bureau globally with 1.3 billion consumer records. Offers Experian Boost to add utility/streaming payments.', icon: '🔴' },
          { title: 'Equifax', desc: 'Frequently used for mortgage lending decisions. Suffered a massive 2017 data breach affecting 147 million people.', icon: '🟣' }
        ]}
      },
      {
        type: 'content',
        title: 'Sections of Your Report',
        body: 'Every credit report has four main sections. Understanding each one is critical for spotting errors and building your dispute strategy:',
        visual: { type: 'steps', items: [
          { title: 'Personal Information', desc: 'Name, address, SSN, employers. Errors here are common and can mix your file with someone else\'s (called a "mixed file"). Check for wrong names, addresses you\'ve never lived at, or employers you\'ve never worked for.' },
          { title: 'Account History (Tradelines)', desc: 'Every credit card, loan, and line of credit. Each tradeline shows: creditor name, account number (usually partially masked), date opened, credit limit or loan amount, current balance, payment history grid (showing each month\'s status), and account status (open, closed, charged off, etc.).' },
          { title: 'Public Records', desc: 'Bankruptcies (Chapter 7 or 13) are the most common items here. Tax liens and civil judgments were removed from credit reports in 2018 for most consumers. A bankruptcy is the single most damaging item on any credit report.' },
          { title: 'Inquiries', desc: 'Hard inquiries (you applied for credit) stay for 2 years but only impact score for 12 months. Soft inquiries (pre-approvals, your own checks, employer checks) are visible only to you and NEVER affect your score.' }
        ]}
      },
      {
        type: 'content',
        title: 'How to Read a Tradeline',
        body: 'Each account (tradeline) on your report contains specific data fields. Here\'s what they mean and what to look for:\n\n<strong>Account Status Codes:</strong>\n• "Open" or "Active" — The account is currently open and in use\n• "Closed" — Account is closed. Check if it says "closed by consumer" (good) or "closed by creditor" (looks negative)\n• "Charge-Off" — Creditor gave up collecting. Severely negative.\n• "Transferred" — Debt was sold to another company\n\n<strong>Payment Status Grid:</strong>\nEach month shows a code: "OK" or "1" means on time. "30", "60", "90", "120" mean days late. Look for any month marked late that you believe you paid on time — this is a common dispute target.\n\n<strong>Date of Last Activity (DLA) vs. Date Opened:</strong>\nDLA is when the last payment or activity occurred. Date Opened is when the account started. Both matter for different reasons.',
        visual: { type: 'tip', text: 'Key Insight: The "Date of First Delinquency" (DOFD) controls when negative items fall off your report. It\'s the date you first fell behind and never recovered. This date is legally fixed and cannot be changed or reset — no matter what a collector tells you.' }
      },
      {
        type: 'scenario',
        title: 'Scenario: Spot the Error',
        story: 'Lisa pulls her credit report and finds an auto loan listed from a dealership she\'s never visited, showing a $15,000 balance. Her name is correct but the middle initial is wrong.',
        question: 'What is the most likely explanation?',
        options: [
          { text: 'A data entry error — the loan belongs to someone with a similar name', correct: true, explanation: 'Correct! This is called a "mixed file" — one of the most common credit report errors. The bureau merged another person\'s data into Lisa\'s report because of similar names. She should dispute this immediately with all three bureaus, including copies of her ID to prove her correct identity.' },
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
          { text: 'Three — one for each dealership', correct: false, explanation: 'Close, but multiple auto loan inquiries within a 14-45 day window are typically grouped as one inquiry by scoring models.' },
          { text: 'One — the auto loan inquiries count as a single inquiry', correct: true, explanation: 'Correct! Rate shopping is protected. Multiple inquiries for the same type of loan (auto, mortgage, student) within a short window (14-45 days depending on scoring model) count as just one inquiry. FICO uses a 45-day window; VantageScore uses 14 days.' },
          { text: 'Zero — dealerships don\'t pull credit', correct: false, explanation: 'Dealerships absolutely pull your credit when you apply for financing. They typically pull from all three bureaus.' }
        ]
      },
      {
        type: 'scenario',
        title: 'Scenario: The Closed Account Problem',
        story: 'Rachel paid off and closed her Bank of America credit card last year. When she checks her report, the account shows "Closed by Credit Grantor" instead of "Closed by Consumer." She called to close it herself.',
        question: 'Does the reason for closure matter?',
        options: [
          { text: 'No — closed is closed, it doesn\'t matter who closed it', correct: false, explanation: 'The reason for closure does matter. "Closed by creditor" can signal to future lenders that the bank chose to end the relationship, which looks negative.' },
          { text: 'Yes — "Closed by Credit Grantor" looks negative and Rachel should dispute it to reflect the correct closure reason', correct: true, explanation: 'Correct! "Closed by credit grantor" can be interpreted as the bank shutting down the account due to misuse or risk concerns. Since Rachel voluntarily closed it, this is inaccurate reporting and she should dispute it to have it corrected to "closed by consumer" or "closed at consumer\'s request."' },
          { text: 'It only matters if she has late payments on the account', correct: false, explanation: 'The closure reason is a separate data point from payment history. It matters independently because future lenders see it.' },
          { text: 'Closed accounts disappear from your report immediately', correct: false, explanation: 'Closed accounts in good standing stay on your report for 10 years. Closed accounts with negative history stay for 7 years from the date of first delinquency.' }
        ]
      },
      {
        type: 'scenario',
        title: 'Scenario: The Suspicious Address',
        story: 'Michael reviews the Personal Information section of his TransUnion report and notices an address listed in Florida — a state he has never lived in or visited. All his other information (name, SSN, employers) is correct.',
        question: 'What should Michael be most concerned about?',
        options: [
          { text: 'Nothing — bureaus sometimes add random addresses', correct: false, explanation: 'Bureaus don\'t add addresses randomly. Addresses come from creditor reports, meaning someone may have used Michael\'s identity at that address.' },
          { text: 'This could indicate identity theft — someone may have opened an account using his SSN at a Florida address', correct: true, explanation: 'Correct! An unfamiliar address is one of the earliest warning signs of identity theft. Someone may have used Michael\'s SSN to open an account with a different address. He should immediately: check all three reports for unfamiliar accounts, place fraud alerts or credit freezes, and dispute the address as not belonging to him.' },
          { text: 'It was probably a typo by one of his creditors', correct: false, explanation: 'While typos happen, an entirely different state address is unlikely to be a simple typo. This warrants investigation.' },
          { text: 'He should update his address with the bureau to remove it', correct: false, explanation: 'Removing the address is part of the solution, but first he needs to investigate whether any accounts were opened at that address under his name.' }
        ]
      },
      {
        type: 'content',
        title: 'Key Takeaways',
        body: '<strong>What to check on your report:</strong>\n\n• Verify ALL personal information — wrong names, addresses, or SSN variations can mean mixed files or identity theft\n• Look for accounts you don\'t recognize — possible mixed file or fraud\n• Check that closed accounts show "closed by consumer" not "closed by creditor" if you closed them\n• Verify balances and credit limits are accurate — a wrong limit changes your utilization calculation\n• Check every month in the payment history grid for inaccurate late payment marks\n• Count your hard inquiries — they should fall off after 2 years\n• Look at the Date of First Delinquency on negative items — it controls when they expire\n• Compare all three reports — errors on one may not be on the others',
        visual: { type: 'tip', text: 'Pro Tip: Pull your free reports from AnnualCreditReport.com — you\'re entitled to one free report from each bureau every 12 months (currently weekly during extended COVID provisions). Stagger them: pull TransUnion in January, Experian in May, Equifax in September for year-round monitoring at no cost.' }
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
        body: 'Negative items are derogatory marks on your credit report that lower your score. They tell lenders you\'ve had trouble managing credit in the past. The good news? Every negative item has an expiration date.\n\nThe impact of negative items diminishes over time. A collection from 5 years ago hurts much less than one from last month. And once items pass the 7-year mark, they must be removed by law.',
        visual: { type: 'timeline', items: [
          { label: 'Late Payments', duration: '7 years', severity: 'medium', desc: 'Reported at 30, 60, 90, and 120+ days late. Each level is progressively worse.' },
          { label: 'Collections', duration: '7 years', severity: 'high', desc: 'Debt sold to a collection agency after ~180 days of non-payment.' },
          { label: 'Charge-Offs', duration: '7 years', severity: 'high', desc: 'Creditor writes off debt as a loss. You still owe it — it\'s just an accounting status.' },
          { label: 'Repossessions', duration: '7 years', severity: 'high', desc: 'Vehicle or property taken back for non-payment. A deficiency balance may also remain.' },
          { label: 'Bankruptcies', duration: '7-10 years', severity: 'severe', desc: 'Chapter 7 stays 10 years, Chapter 13 stays 7 years from filing date.' },
          { label: 'Foreclosures', duration: '7 years', severity: 'severe', desc: 'Home seized by lender after mortgage default. Can drop scores 100-160 points.' }
        ]}
      },
      {
        type: 'content',
        title: 'Late Payments — The Most Common Negative Item',
        body: 'Late payments are the #1 most common derogatory mark. They\'re reported in tiers, and each tier is more damaging:\n\n<strong>30 Days Late:</strong> First tier. Can drop a 780 score by 90-110 points. Reported after the payment is 30 days past the due date. Some creditors offer a grace period before reporting.\n\n<strong>60 Days Late:</strong> More severe. Shows a pattern of non-payment is developing. Additional score drop of 10-30 points beyond the 30-day hit.\n\n<strong>90 Days Late:</strong> Significantly damaging. Many creditors begin internal collections at this stage.\n\n<strong>120+ Days Late:</strong> The account is usually heading toward charge-off or collections. Maximum damage to your score.\n\nImportant: A 30-day late on a 780 score hurts MORE than a 30-day late on a 620 score. People with higher scores have more to lose because they\'re falling further from the "perfect payment" standard.',
        visual: { type: 'tip', text: 'Quick Action: If you realize you missed a payment by just a few days, call the creditor immediately. Most won\'t report to the bureaus until a payment is 30+ days late. If you pay before that 30-day mark, it often won\'t appear on your report at all.' }
      },
      {
        type: 'content',
        title: 'Collections — Understanding the Process',
        body: 'When you stop paying a debt, here\'s the typical timeline:\n\n<strong>Day 1-30:</strong> Payment is late. Creditor calls and sends reminders.\n<strong>Day 31-60:</strong> Late fees applied. More aggressive contact.\n<strong>Day 61-90:</strong> Account flagged internally. Interest may increase.\n<strong>Day 91-120:</strong> Account sent to internal collections department.\n<strong>Day 121-180:</strong> Creditor prepares to charge off the debt.\n<strong>Day 180+:</strong> Account charged off and often sold to a third-party collection agency for pennies on the dollar.\n\nThe collection agency buys your debt for typically 4-10 cents on the dollar, which is why they\'re often willing to negotiate settlements for less than the full amount. They profit on anything above what they paid.\n\n<strong>Key Concept — "Original Creditor" vs. "Collection Agency":</strong>\nThe original creditor is who you owed initially (like a hospital or credit card company). The collection agency is the company that bought or was assigned the debt. Both may appear on your report, but the balance should only be reported by one.',
        visual: { type: 'steps', items: [
          { title: 'Internal Collections', desc: 'The original creditor tries to collect using their own team. Your account is flagged but may not yet show as delinquent if under 30 days.' },
          { title: 'Third-Party Assignment', desc: 'The creditor hires an outside agency to collect, but still owns the debt. The agency earns a percentage of what they recover.' },
          { title: 'Debt Sale', desc: 'The original creditor sells the debt to a buyer for pennies on the dollar. The buyer now owns the debt and reports it as a new collection tradeline.' },
          { title: 'Secondary Market', desc: 'If the first buyer can\'t collect, they may sell the debt again to another collector, creating a chain of ownership that can introduce errors.' }
        ]}
      },
      {
        type: 'scenario',
        title: 'Scenario: The Medical Collection',
        story: 'After an ER visit, Tanya received a $2,400 bill. She thought her insurance covered it. Six months later, a collection account appeared on her credit report from an agency she\'d never heard of. Her score dropped 80 points overnight.',
        question: 'What should Tanya do FIRST?',
        options: [
          { text: 'Pay the collection immediately to fix her score', correct: false, explanation: 'Paying a collection doesn\'t always remove it from your report. In older scoring models, a paid collection still counts as negative. She should validate the debt first and check if insurance should have covered it.' },
          { text: 'Request debt validation from the collection agency', correct: true, explanation: 'Correct! Under the FDCPA, Tanya has the right to request written verification of the debt within 30 days of first contact. The collector must prove the debt is valid, belongs to her, and show the amount is correct. She should also contact her insurance company — if coverage was denied incorrectly, the bill may not be her responsibility.' },
          { text: 'Ignore it — medical debt doesn\'t count', correct: false, explanation: 'While FICO 9 and VantageScore 3.0 treat medical collections more leniently, they still impact your score. Under new rules effective 2023, paid medical collections and those under $500 are excluded from some models, but $2,400 unpaid will definitely hurt.' },
          { text: 'Close all her other accounts to prevent more damage', correct: false, explanation: 'Closing accounts would reduce her available credit, increase utilization, and potentially lower her score even more.' }
        ]
      },
      {
        type: 'scenario',
        title: 'Scenario: Charge-Off vs. Collection',
        story: 'James stopped paying his $5,000 credit card 8 months ago. The original creditor charged it off. Now James sees BOTH a charge-off from the bank AND a collection account from a new company on his report for the same $5,000.',
        question: 'Is it legal to have both a charge-off and a collection for the same debt?',
        options: [
          { text: 'Yes — both the original creditor and collector can report', correct: false, explanation: 'While both CAN report, the balance should only show on one. If both show a $5,000 balance, that\'s illegal double-jeopardy inflating his debt by $5,000.' },
          { text: 'No — only the collection agency can report after a charge-off', correct: false, explanation: 'The original creditor can still report the charge-off, but the balance reporting matters — only one should show the balance.' },
          { text: 'It depends — the charge-off should show $0 balance if sold to collections', correct: true, explanation: 'Correct! If the debt was sold, the original charge-off should show a $0 balance with a note that it was "transferred" or "sold to another lender." If both show $5,000 balances, James can dispute the duplicate balance as inaccurate. This is one of the most common and most disputable errors on credit reports.' },
          { text: 'Neither should appear — charge-offs are automatically removed', correct: false, explanation: 'Charge-offs stay on your report for 7 years from the date of first delinquency. They don\'t automatically disappear.' }
        ]
      },
      {
        type: 'scenario',
        title: 'Scenario: The Zombie Debt',
        story: 'Rodriguez hasn\'t heard about a $900 credit card debt in 6 years. Suddenly, a new collection agency starts calling, claiming he owes $1,450 with interest. They threaten to report it to the credit bureaus as a "new" collection if he doesn\'t pay.',
        question: 'What does Rodriguez need to know about this situation?',
        options: [
          { text: 'He should pay immediately to avoid it being re-reported', correct: false, explanation: 'Paying old debt can actually restart the statute of limitations for lawsuits in many states. And the original 7-year clock for credit reporting cannot legally be reset.' },
          { text: 'The debt has expired and he has no obligation to pay', correct: false, explanation: 'The debt may have passed the statute of limitations for lawsuits, but the debt itself doesn\'t expire. However, the credit reporting period is fixed from the original DOFD and likely expires within a year.' },
          { text: 'The collector cannot legally re-age this debt — the 7-year reporting clock started from the original default and cannot be restarted', correct: true, explanation: 'Correct! Under the FCRA, the 7-year reporting period runs from the Date of First Delinquency (DOFD) with the ORIGINAL creditor. A collector cannot restart this clock by "re-aging" the account. If it\'s been 6 years, the item should fall off within about a year regardless. Re-aging a debt is illegal and can be reported to the FTC and CFPB.' },
          { text: 'He should negotiate a payment plan to stop the calls', correct: false, explanation: 'Making any payment or even verbally acknowledging the debt can restart the statute of limitations for lawsuits in some states. Rodriguez should proceed very carefully and consider consulting a consumer rights attorney.' }
        ]
      },
      {
        type: 'scenario',
        title: 'Scenario: The Bankruptcy Question',
        story: 'After drowning in $85,000 of credit card debt, Vanessa is considering bankruptcy. She\'s researching the difference between Chapter 7 and Chapter 13. She makes $55,000/year and has no assets.',
        question: 'What is the key difference Vanessa should understand?',
        options: [
          { text: 'Chapter 7 and Chapter 13 are the same thing with different names', correct: false, explanation: 'They are fundamentally different processes with different requirements, timelines, and outcomes.' },
          { text: 'Chapter 7 liquidates assets and discharges most debts (stays 10 years); Chapter 13 is a 3-5 year repayment plan (stays 7 years)', correct: true, explanation: 'Correct! Chapter 7 wipes out most unsecured debt but requires passing a "means test" (income below state median). It stays on your report for 10 years. Chapter 13 creates a court-supervised repayment plan lasting 3-5 years, and stays on your report for only 7 years. Since Vanessa has no assets and her income may qualify, Chapter 7 could discharge her debt faster, but the longer reporting period is the tradeoff.' },
          { text: 'Chapter 7 is for individuals and Chapter 13 is for businesses', correct: false, explanation: 'Both Chapter 7 and Chapter 13 are available to individuals. Business bankruptcies typically use Chapter 11.' },
          { text: 'Both stay on your report for 10 years', correct: false, explanation: 'Chapter 7 stays 10 years from the filing date. Chapter 13 stays 7 years from the filing date — a significant difference.' }
        ]
      },
      {
        type: 'content',
        title: 'The 7-Year Clock — How It Really Works',
        body: 'Every negative item has a built-in expiration. The clock starts from the <strong>Date of First Delinquency (DOFD)</strong> — the date you first fell behind and never caught up. This date cannot legally be reset.\n\n<strong>Common misconceptions:</strong>\n\n• Making a payment does NOT restart the 7-year credit reporting clock (but it CAN restart the statute of limitations for lawsuits in some states)\n\n• A debt being sold to a new collector does NOT restart the clock\n\n• Acknowledging the debt verbally does NOT restart the credit reporting clock\n\n• The DOFD is fixed by federal law (FCRA §605) and runs from the original creditor\n\n<strong>Statute of Limitations vs. Credit Reporting Period:</strong>\nThese are TWO DIFFERENT THINGS. The statute of limitations (SOL) determines how long a creditor can sue you for the debt — this varies by state (3-10 years) and CAN be restarted by making a payment. The credit reporting period is always 7 years from DOFD and cannot be changed.',
        visual: { type: 'tip', text: 'Critical Warning: Never make a payment on an old debt without understanding your state\'s statute of limitations. A $25 payment on a 5-year-old debt could restart the clock on a lawsuit, giving the collector another 3-6 years to sue you. Always consult with a consumer rights attorney before paying old debts.' }
      },
      {
        type: 'content',
        title: 'Key Takeaways',
        body: '<strong>Negative item action plan:</strong>\n\n• Always request debt validation before paying any collection — verify the debt is yours and the amount is correct\n• Check the Date of First Delinquency — items near expiration may not be worth paying or settling\n• Watch for duplicate reporting (charge-off + collection both showing balances)\n• Medical collections under $500 are excluded from newer FICO and VantageScore models\n• Bankruptcies are the most severe but even they expire (7 years for Ch.13, 10 years for Ch.7)\n• Know your state\'s statute of limitations — it\'s separate from the credit reporting period\n• Beware of "zombie debt" — collectors who try to illegally re-age old debts\n• Late payments hurt most in the first 12-24 months, then gradually diminish in impact',
        visual: { type: 'tip', text: 'Pro Tip: Under the FCRA, you have the right to dispute any item you believe is inaccurate, incomplete, or unverifiable. The bureau has 30 days to investigate (45 if you provide additional information during the investigation). If they can\'t verify it within that window, they must remove it by law.' }
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
        body: 'The Fair Credit Reporting Act (FCRA) gives you the legal right to dispute any information on your credit report that you believe is inaccurate, incomplete, or unverifiable. When you file a dispute, the bureau MUST investigate within 30 days (or 45 days if you submit additional info during the investigation).\n\nThis isn\'t just a suggestion — it\'s federal law. If the bureau or furnisher violates your rights, you can sue for damages. This is why the dispute process has real teeth and why creditors take written disputes seriously.',
        visual: { type: 'steps', items: [
          { title: 'Step 1: Identify the Error', desc: 'Review your report carefully. Note the creditor name, account number, and exactly what\'s wrong. Be specific: "Balance reported as $4,200 but should be $0 — paid in full on 3/15/2024."' },
          { title: 'Step 2: Gather Evidence', desc: 'Collect documents that support your claim — bank statements showing payments, payoff letters, court documents, canceled checks, creditor correspondence, identity theft reports.' },
          { title: 'Step 3: Write Your Dispute Letter', desc: 'Clearly state what\'s inaccurate and what correction you want. Reference the FCRA section. Include your identifying information and copies of evidence.' },
          { title: 'Step 4: Send via Certified Mail', desc: 'Always send disputes by USPS Certified Mail with Return Receipt Requested. This creates a legal paper trail with delivery confirmation. Cost: about $7-8 per letter.' },
          { title: 'Step 5: Wait and Track', desc: 'The bureau has 30 days to investigate. They\'ll contact the furnisher via e-OSCAR. Track your dispute with the certified mail receipt number and note the 30-day deadline.' },
          { title: 'Step 6: Review Results', desc: 'The bureau must send you written results AND a free updated copy of your report if changes were made. If the dispute is rejected, you have escalation options.' }
        ]}
      },
      {
        type: 'content',
        title: 'Three Ways to Dispute — Pros and Cons',
        body: 'You can dispute by mail, online, or by phone. Each method has distinct advantages and disadvantages:\n\n<strong>By Mail (Recommended):</strong>\n• Creates a paper trail with certified mail proof of delivery\n• Forces a full investigation (not the simplified e-OSCAR process)\n• You can attach unlimited supporting documents\n• Required for certain legal protections under FCRA\n• Takes 3-5 days to arrive, plus 30 days for investigation\n\n<strong>Online:</strong>\n• Fastest submission method — results in minutes to days\n• Limited space for explanations\n• May trigger the simplified e-OSCAR process (less thorough)\n• Cannot always attach detailed evidence\n• Harder to prove what you submitted if issues arise\n\n<strong>By Phone:</strong>\n• Least recommended — no paper trail\n• Agent may simplify or misrepresent your dispute\n• Hard to reference later in legal proceedings\n• Best used only as a supplement, never as your primary method',
        visual: { type: 'tip', text: 'Why Mail Wins: When you dispute by mail, you preserve your right to sue under the FCRA if the bureau mishandles your dispute. Online disputes often include arbitration clauses in the Terms of Service that limit your legal options. The certified mail receipt is your proof in court.' }
      },
      {
        type: 'content',
        title: 'The e-OSCAR System — What Happens Behind the Scenes',
        body: 'When you file a dispute, the bureau uses a system called <strong>e-OSCAR</strong> (Online Solution for Complete and Accurate Reporting) to communicate with the furnisher:\n\n1. Bureau receives your dispute\n2. Bureau translates your dispute into a 2-digit reason code (like "not his/hers" or "balance disputed")\n3. The code + your identifying info is sent electronically to the furnisher\n4. Furnisher checks their records and responds with "verified," "updated," or "deleted"\n5. Bureau sends you the results\n\nThe problem? Your detailed, evidence-backed dispute gets compressed into a simple code. The furnisher often rubber-stamps it as "verified" without looking at your actual evidence.\n\nThis is why escalation strategies (Method of Verification requests, CFPB complaints, direct furnisher disputes) are so important when the initial dispute comes back "verified."',
        visual: { type: 'tip', text: 'Insider Knowledge: The FCRA requires bureaus to forward "all relevant information" from your dispute to the furnisher. If they only send a 2-digit code and ignore your supporting documents, they\'ve violated the law. This is the basis for many successful FCRA lawsuits.' }
      },
      {
        type: 'scenario',
        title: 'Scenario: The Wrong Late Payment',
        story: 'Robert has a car loan that shows 2 late payments in March and April 2024. He has bank statements proving the payments cleared on time both months. He also has the lender\'s payment confirmation emails.',
        question: 'What is the STRONGEST dispute approach for Robert?',
        options: [
          { text: 'Call the credit bureau and explain the error verbally', correct: false, explanation: 'Phone disputes are the weakest option. There\'s no paper trail, and you can\'t attach evidence. Always dispute in writing.' },
          { text: 'Dispute online through the bureau\'s website', correct: false, explanation: 'Online disputes are convenient but limited. You can\'t always attach detailed evidence, and the bureau may use the simplified e-OSCAR process.' },
          { text: 'Send a written dispute letter with copies of bank statements and payment confirmations via certified mail', correct: true, explanation: 'Correct! A written dispute with evidence sent via certified mail is the gold standard. It creates a legal record, forces a thorough investigation, and the bank statement evidence makes the case undeniable. Robert should send this to ALL THREE bureaus if the error appears on multiple reports.' },
          { text: 'Wait for the late payments to fall off naturally', correct: false, explanation: 'Late payments stay for 7 years! Since Robert has proof they\'re inaccurate, he should dispute them immediately — his score could jump significantly once they\'re removed.' }
        ]
      },
      {
        type: 'scenario',
        title: 'Scenario: Bureau Says "Verified"',
        story: 'After disputing a collection she doesn\'t recognize, Maria gets a letter saying the bureau "verified" the account as accurate. She\'s certain the debt isn\'t hers.',
        question: 'What should Maria do next?',
        options: [
          { text: 'Give up — the bureau has the final say', correct: false, explanation: 'The bureau doesn\'t have the final say. You have several powerful escalation options available.' },
          { text: 'File a complaint with the CFPB and send a Method of Verification letter', correct: true, explanation: 'Correct! Maria can: 1) Send a "Method of Verification" (MOV) letter demanding the bureau explain exactly HOW they verified the account. 2) File a CFPB complaint, which puts regulatory pressure on the bureau — CFPB complaints often yield different results. 3) Dispute directly with the furnisher under FCRA §623. 4) Consult a consumer rights attorney about potential FCRA violations.' },
          { text: 'Dispute the same item again with the same letter', correct: false, explanation: 'Re-sending identical disputes can be flagged as "frivolous" under FCRA §611(a)(3). Maria should escalate with new strategies and new evidence, not repeat the same approach.' },
          { text: 'Sue the collection company immediately', correct: false, explanation: 'Lawsuits should be a last resort. There are several intermediate steps that are faster, free, and often effective.' }
        ]
      },
      {
        type: 'scenario',
        title: 'Scenario: The Dispute Timing Strategy',
        story: 'Angela has 6 errors on her Equifax report: 2 wrong late payments, 1 collection she doesn\'t recognize, 1 account with a wrong balance, 1 wrong employer listing, and 1 account that isn\'t hers at all. She wants to dispute everything.',
        question: 'What is the best strategy for Angela\'s disputes?',
        options: [
          { text: 'Send one letter disputing all 6 items at once for efficiency', correct: false, explanation: 'Sending too many disputes at once is a common mistake. The bureau may flag the dispute as "frivolous" or not give each item proper attention. Strategic batching is better.' },
          { text: 'Dispute 1-3 items per round, starting with the items causing the most score damage, then follow up with the remaining items after results come back', correct: true, explanation: 'Correct! Dispute in strategic rounds of 1-3 items. Start with high-impact items (the unknown account, the collection, and the wrong late payments). Wait for results (30-45 days), then send the next batch. This approach avoids frivolous flags, lets you learn from each round\'s results, and keeps steady pressure on the bureau.' },
          { text: 'Only dispute one item per year', correct: false, explanation: 'There\'s no legal limit on how many disputes you can file. One per year would take 6 years to address all the errors.' },
          { text: 'Dispute online for speed — 6 items is fine online', correct: false, explanation: 'Online disputes for 6 items would likely result in generic e-OSCAR processing. Written disputes with evidence, sent in strategic batches, give each item the best chance of success.' }
        ]
      },
      {
        type: 'content',
        title: 'Key Takeaways',
        body: '<strong>Dispute process essentials:</strong>\n\n• Always dispute in writing via certified mail — it creates a legal paper trail\n• Include copies (never originals) of supporting documents\n• Dispute 1-3 items per round — too many at once can trigger "frivolous" flags\n• Start with the items causing the most score damage\n• Keep a dispute log tracking dates, reference numbers, certified mail receipts, and results\n• If a dispute comes back "verified," escalate with: MOV request, CFPB complaint, or direct furnisher dispute under §623\n• The bureau has 30 days to investigate (45 if you provide additional info during investigation)\n• You can dispute with the bureau AND directly with the furnisher — both are protected by federal law\n• Every dispute result must include an updated copy of your report if changes were made',
        visual: { type: 'tip', text: 'Pro Tip: Dispute one or two items at a time. Keep detailed records of every letter, receipt, and response. If the bureau violates your rights (like failing to investigate within 30 days), each violation is worth up to $1,000 in statutory damages under the FCRA, plus actual damages, attorney fees, and costs.' }
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
        body: 'The best dispute letters are clear, specific, and backed by evidence. They tell the bureau exactly what\'s wrong and what you want done about it. Think of your letter as a legal document — because it is one.',
        visual: { type: 'steps', items: [
          { title: 'Your Information', desc: 'Full legal name, current address, date of birth, last 4 of SSN. Include a copy of your government-issued ID and a utility bill or bank statement showing your current address.' },
          { title: 'Account Details', desc: 'Creditor name, account number (full number if you have it), the specific data field you\'re disputing. Be precise: "Account #XXXX-4521, Date Opened field shows 01/2020, correct date is 06/2021."' },
          { title: 'Reason for Dispute', desc: 'State clearly WHY the information is wrong. Use factual language: "This account is not mine" or "The balance is incorrect — I paid this in full on March 15, 2024, confirmation #78945."' },
          { title: 'Legal Basis', desc: 'Reference the applicable law: "Per FCRA §611(a), I request that you investigate this disputed information and correct your records." This shows you know your rights.' },
          { title: 'Requested Action', desc: 'Tell them exactly what you want: "Please delete this account" or "Please update the payment status for March 2024 from \'30 days late\' to \'paid as agreed.\'"' },
          { title: 'Evidence', desc: 'List and attach copies of proof. "Enclosed: (1) Copy of driver\'s license, (2) Bank statement dated 3/18/2024 showing payment of $450 to XYZ Lender, (3) Payment confirmation email."' }
        ]}
      },
      {
        type: 'content',
        title: 'The Power Words — Language That Gets Results',
        body: 'Specific words and phrases carry legal weight in dispute letters. Using the right language triggers specific obligations:\n\n<strong>"Inaccurate"</strong> — The reported information is factually wrong. Forces the bureau to verify the specific data point.\n\n<strong>"Incomplete"</strong> — The information is partially right but missing key context. Example: account shows late payments but doesn\'t show that the creditor agreed to defer payments.\n\n<strong>"Unverifiable"</strong> — The most powerful word. If the furnisher cannot produce original documentation proving the account terms, the item is unverifiable and must be removed under FCRA §611(a)(5)(A).\n\n<strong>"Obsolete"</strong> — The item has exceeded the 7-year reporting period (FCRA §605). Forces removal.\n\n<strong>Avoid these:</strong> "I think," "I believe," "maybe," "I\'m not sure." Weak language invites denial. Be definitive: "This information IS inaccurate" not "I think this might be wrong."',
        visual: { type: 'tip', text: 'Legal Leverage: The word "unverifiable" is your secret weapon. Most collection agencies buy debts in bulk and receive only a spreadsheet — not original signed agreements. When challenged to produce the original contract with your signature, they often can\'t. Under the FCRA, unverifiable = must be removed.' }
      },
      {
        type: 'scenario',
        title: 'Scenario: Which Letter Wins?',
        story: 'Compare these two dispute approaches for a collection account the consumer says isn\'t theirs:\n\n<strong>Letter A:</strong> "I don\'t owe this money. Remove it now or I\'ll sue."\n\n<strong>Letter B:</strong> "Account #4521 from ABC Collections reporting a $1,200 balance does not belong to me. I have no record of any account with the original creditor, XYZ Bank. I have never resided at the address associated with this account. Enclosed: copy of my driver\'s license, utility bill confirming my current address, and FTC Identity Theft Report #8847. Per FCRA §611(a), please investigate and remove this unverifiable account within 30 days."',
        question: 'Which letter is more likely to get results?',
        options: [
          { text: 'Letter A — being aggressive shows you\'re serious', correct: false, explanation: 'Threats without substance are actually counterproductive. Bureau investigators process thousands of letters and respond to clear, evidence-backed disputes. Empty threats are ignored.' },
          { text: 'Letter B — it\'s specific, cites the law, and includes evidence', correct: true, explanation: 'Correct! Letter B works because it: identifies the exact account, states a clear reason ("does not belong to me"), provides context (never lived at that address), references the legal obligation (FCRA §611), includes supporting evidence (3 documents), and gives a specific deadline. This makes it easy — and legally necessary — for the investigator to act.' },
          { text: 'Both are equally effective', correct: false, explanation: 'Letter A gives the investigator nothing to work with — no account details, no evidence, no legal basis. Letter B provides everything needed to take action.' },
          { text: 'Neither — you should only dispute online', correct: false, explanation: 'Written disputes with evidence are consistently more effective than online disputes, which limit your ability to provide detailed documentation.' }
        ]
      },
      {
        type: 'content',
        title: 'Types of Dispute Letters',
        body: 'Different situations call for different types of letters. Having the right letter for the right situation dramatically improves results:\n\n<strong>1. Basic Dispute Letter (to Bureau)</strong>\n"This information is inaccurate. Here\'s proof. Please correct it."\nUse when: You have clear evidence of an error.\n\n<strong>2. Debt Validation Letter (to Collector)</strong>\n"Prove this debt is mine and the amount is correct."\nUse when: You don\'t recognize a collection or question the amount. Must be sent within 30 days of first contact.\n\n<strong>3. Method of Verification Letter (to Bureau)</strong>\n"You said you verified this account. Show me exactly how."\nUse when: A dispute comes back "verified" and you still disagree.\n\n<strong>4. Section 623 Direct Dispute (to Furnisher)</strong>\n"I already disputed with the bureau. Now I\'m disputing directly with you."\nUse when: Bureau dispute was unsuccessful. The furnisher must investigate independently.\n\n<strong>5. Goodwill Letter (to Creditor)</strong>\n"I had a hardship but I\'m back on track. Please remove the negative mark as a courtesy."\nUse when: The negative mark is technically accurate but circumstances warrant removal.\n\n<strong>6. Pay-for-Delete Letter (to Collector)</strong>\n"I\'ll pay this debt in full if you agree IN WRITING to delete it from my credit reports."\nUse when: Negotiating with collectors.',
        visual: { type: 'cards', items: [
          { title: 'Bureau Dispute', desc: 'Sent to TransUnion, Experian, or Equifax. They must investigate within 30 days.', icon: '📋' },
          { title: 'Debt Validation', desc: 'Sent to collection agency. They must provide proof of debt or stop collecting.', icon: '🔍' },
          { title: 'Method of Verification', desc: 'Follow-up to bureau after "verified" result. Forces disclosure of their process.', icon: '📎' },
          { title: 'Section 623 Direct', desc: 'Sent directly to the company that reported the data. Independent investigation required.', icon: '📨' }
        ]}
      },
      {
        type: 'scenario',
        title: 'Scenario: The 623 Direct Dispute',
        story: 'After the bureau verified a late payment that Angela knows is wrong, her credit repair specialist suggests sending a "623 dispute" directly to the creditor who reported the late payment.',
        question: 'What is a Section 623 dispute?',
        options: [
          { text: 'A type of lawsuit against the creditor', correct: false, explanation: 'Section 623 is not a lawsuit — it\'s a dispute sent directly to the company that furnished (reported) the data to the bureaus.' },
          { text: 'A dispute sent directly to the data furnisher (the creditor), who must investigate independently', correct: true, explanation: 'Correct! Under FCRA Section 623(b), after first disputing with the bureau, you can dispute directly with the furnisher. The creditor must conduct their own independent investigation (not just re-verify through e-OSCAR) and respond within 30 days. This bypasses the bureau\'s often-superficial process and forces the creditor to actually look at their records.' },
          { text: 'A dispute that gets automatic approval after 623 hours', correct: false, explanation: 'The number 623 refers to Section 623 of the Fair Credit Reporting Act (15 U.S.C. §1681s-2), not a time period.' },
          { text: 'A special form only attorneys can file', correct: false, explanation: 'Anyone can send a Section 623 dispute letter. You don\'t need an attorney. Just reference the law and send it to the creditor\'s registered agent or compliance department.' }
        ]
      },
      {
        type: 'scenario',
        title: 'Scenario: The Validation Deadline',
        story: 'Marcus receives his first letter from a collection agency about an $1,800 debt on January 5th. He\'s busy with work and doesn\'t respond. On February 10th — 36 days later — he sends a debt validation letter asking them to prove the debt is his.',
        question: 'Did Marcus miss his window for debt validation?',
        options: [
          { text: 'Yes — he only had 30 days and now he has no rights', correct: false, explanation: 'Marcus CAN still request validation after 30 days. The difference is that within 30 days, the collector MUST stop all collection activity until they validate. After 30 days, they don\'t have to stop collecting while they validate.' },
          { text: 'No — but he lost the automatic protection that makes the collector stop all activity while validating', correct: true, explanation: 'Correct! Under the FDCPA §809, if you request validation within 30 days of first contact, the collector MUST cease all collection activity until they provide validation. After 30 days, you can still request validation and the collector must provide it, but they don\'t have to stop calling or collecting in the meantime. This is why responding quickly is crucial.' },
          { text: 'The 30-day rule only applies to medical debt', correct: false, explanation: 'The 30-day validation window applies to ALL consumer debts under the FDCPA, not just medical.' },
          { text: 'There is no time limit for debt validation', correct: false, explanation: 'You can always request validation, but the automatic cease-collection protection only applies within the first 30 days.' }
        ]
      },
      {
        type: 'content',
        title: 'Key Takeaways',
        body: '<strong>Letter writing best practices:</strong>\n\n• Be specific — reference exact account numbers, dates, and amounts\n• Stay professional — no threats, no emotional language, no ALL CAPS\n• Cite the applicable law — FCRA §611 (bureau disputes), §623 (furnisher disputes), FDCPA §809 (debt validation)\n• One dispute per letter — don\'t bundle multiple issues into one letter\n• Always include copies (never originals) of supporting evidence\n• Keep your own copies of everything you send plus certified mail receipts\n• Track deadlines — bureaus have 30 days, furnishers have 30 days\n• Use powerful words: "inaccurate," "unverifiable," "incomplete," "obsolete"\n• Send debt validation requests within 30 days of first contact for maximum protection\n• Escalate strategically: Bureau dispute → MOV request → CFPB complaint → 623 direct dispute → attorney consultation',
        visual: { type: 'tip', text: 'Pro Tip: The magic word in disputes is "unverifiable." If the creditor can\'t provide original signed documents proving the account terms, the item is unverifiable and must be removed under the FCRA. Most collection agencies don\'t have original paperwork — they bought a spreadsheet.' }
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
        body: 'Once you\'ve cleaned up negative items, it\'s time to build positive credit history. There are several proven tools to get your score climbing. Each one works differently and serves a specific purpose in your credit profile.',
        visual: { type: 'cards', items: [
          { title: 'Secured Credit Card', desc: 'Put down a deposit ($200-$500) as your credit limit. Use it for small purchases and pay in full monthly. After 6-12 months, many issuers upgrade you to unsecured.', icon: '💳' },
          { title: 'Credit Builder Loan', desc: 'A bank holds your loan amount (typically $300-$1,000) in savings while you make monthly payments. Builds installment loan history. You get the money at the end.', icon: '🏦' },
          { title: 'Authorized User', desc: 'Get added to a family member\'s established card. Their positive history and credit limit appear on your report too. Instant credit profile boost.', icon: '👥' },
          { title: 'Secured Loan', desc: 'Use a savings account or CD as collateral for a small loan. Low risk for the lender. Creates an installment tradeline that diversifies your credit mix.', icon: '🔐' },
          { title: 'Rent Reporting', desc: 'Services like Rental Kharma or Boom report your rent payments to credit bureaus. Great for thin files with no traditional credit.', icon: '🏠' },
          { title: 'Experian Boost', desc: 'Free Experian tool that adds utility, phone, and streaming payments to your Experian report. Can add 10-20 points instantly.', icon: '⚡' }
        ]}
      },
      {
        type: 'content',
        title: 'The Perfect Credit-Building Timeline',
        body: 'Building credit is a marathon, not a sprint. Here\'s a realistic month-by-month timeline for someone starting from scratch or rebuilding after negative items:\n\n<strong>Month 1:</strong> Open a secured credit card. Set up one small recurring charge (streaming service or gas). Set up autopay for full balance.\n\n<strong>Month 2-3:</strong> Open a credit builder loan ($300-$500). This adds an installment tradeline to complement your revolving card.\n\n<strong>Month 4-6:</strong> Continue perfect payments. If possible, get added as an authorized user on a family member\'s old, low-utilization card.\n\n<strong>Month 6-8:</strong> Your secured card may offer a credit limit increase or upgrade to unsecured. Request it — a higher limit lowers your utilization.\n\n<strong>Month 9-12:</strong> Consider applying for an entry-level unsecured card (like Discover It or Capital One Platinum). Space applications 6+ months apart.\n\n<strong>Month 12-18:</strong> With 2-3 accounts and 12+ months of perfect payments, you should see significant score improvement. Many people reach 680-720 in this timeframe.',
        visual: { type: 'timeline', items: [
          { label: 'Month 1', duration: 'Secured Card', severity: 'medium', desc: 'Open first secured card. Start building payment history.' },
          { label: 'Month 2-3', duration: 'Credit Builder Loan', severity: 'medium', desc: 'Add installment loan for credit mix diversity.' },
          { label: 'Month 4-6', duration: 'Authorized User', severity: 'medium', desc: 'Get added to established family member\'s card for instant history.' },
          { label: 'Month 6-8', duration: 'Limit Increase', severity: 'medium', desc: 'Request higher limit on secured card. Lowers utilization ratio.' },
          { label: 'Month 9-12', duration: 'Unsecured Card', severity: 'medium', desc: 'Apply for first unsecured card with earned credit history.' },
          { label: 'Month 12-18', duration: 'Score Target: 680-720', severity: 'medium', desc: 'Continue perfect payments. Celebrate your progress!' }
        ]}
      },
      {
        type: 'scenario',
        title: 'Scenario: The Secured Card Strategy',
        story: 'After bankruptcy, Keisha gets a secured credit card with a $300 limit. She uses it to buy gas once a week (~$40) and pays the full balance when the statement arrives. After 8 months, her score has risen from 520 to 635.',
        question: 'Why is Keisha\'s strategy working so well?',
        options: [
          { text: 'She\'s spending the right amount — big purchases build credit faster', correct: false, explanation: 'The size of purchases doesn\'t matter. What matters is the utilization ratio and consistent on-time payments.' },
          { text: 'She keeps utilization low (~13%) and pays in full on time every month', correct: true, explanation: 'Correct! By spending ~$40 on a $300 limit, her utilization stays around 13% (well under 30%). Paying in full means zero interest AND shows perfect payment history. Both the payment history factor (35%) and utilization factor (30%) are working in her favor — that\'s 65% of her score being optimized.' },
          { text: 'Secured cards automatically boost your score faster than regular cards', correct: false, explanation: 'Secured cards report to bureaus exactly the same way regular cards do. The boost comes entirely from her smart usage pattern.' },
          { text: 'Bankruptcy gives you a fresh start bonus', correct: false, explanation: 'There\'s no "fresh start bonus." The bankruptcy actually stays on her report for 7-10 years. Her score is rising purely from new positive activity outweighing the aging bankruptcy.' }
        ]
      },
      {
        type: 'scenario',
        title: 'Scenario: Authorized User Strategy',
        story: 'Tyler\'s mom has a Visa card she\'s had for 15 years with a $20,000 limit, $600 balance, and perfect payment history. She adds Tyler as an authorized user. Tyler is 21 and has no credit history at all.',
        question: 'What will likely happen to Tyler\'s credit?',
        options: [
          { text: 'Nothing — authorized users don\'t get credit benefits', correct: false, explanation: 'Most major card issuers (Chase, Amex, Discover, Capital One) report authorized user accounts to the bureaus.' },
          { text: 'His score will jump significantly as the card\'s 15-year history, low utilization, and perfect payments appear on his report', correct: true, explanation: 'Correct! Tyler inherits the full history of the card — 15 years of on-time payments, 3% utilization ($600/$20,000). This is one of the fastest ways to establish credit. It could give him an instant score in the 700s. The average age of his accounts jumps from 0 to 15 years overnight.' },
          { text: 'He\'ll get a small boost but only from the date he was added', correct: false, explanation: 'Most scoring models (FICO) count the full history of the card from when it was opened, not when the AU was added. This is what makes the strategy so powerful for someone with no credit history.' },
          { text: 'It will hurt his score because he\'ll inherit the card\'s debt', correct: false, explanation: 'The card has only $600 balance on a $20,000 limit (3% utilization) with perfect payment history. There\'s nothing negative to inherit.' }
        ]
      },
      {
        type: 'scenario',
        title: 'Scenario: The Credit Limit Request',
        story: 'After 6 months of perfect payments, Darnell has two credit cards:\n• Card A: $500 limit, $100 balance (20% utilization)\n• Card B: $1,000 limit, $250 balance (25% utilization)\n\nOverall: $350 / $1,500 = 23% utilization\n\nDarnell calls Card B and they offer to increase his limit to $3,000.',
        question: 'How would accepting this limit increase affect Darnell\'s credit?',
        options: [
          { text: 'It would hurt his score because more available credit means more risk', correct: false, explanation: 'More available credit actually HELPS your score by lowering your utilization ratio. Lenders don\'t view higher limits as risky — they view high utilization as risky.' },
          { text: 'No effect — credit limits don\'t matter', correct: false, explanation: 'Credit limits directly affect your utilization ratio, which is 30% of your score. Limits matter a lot.' },
          { text: 'It would help his score — his overall utilization drops from 23% to 10% ($350/$3,500) with no additional spending', correct: true, explanation: 'Correct! With the increase: $350 / $3,500 = 10% overall utilization. That\'s a drop from 23% to 10% without paying down any debt. Card B\'s individual utilization drops from 25% to 8.3%. This could boost his score 20-40 points instantly. Important: the limit increase should ideally be a "soft pull" — ask the issuer before accepting whether they\'ll do a hard inquiry.' },
          { text: 'It would only help if he also closes Card A', correct: false, explanation: 'Closing Card A would actually hurt by reducing total available credit and shortening his credit history. Keep both cards open.' }
        ]
      },
      {
        type: 'content',
        title: 'Key Takeaways',
        body: '<strong>Credit building action plan:</strong>\n\n• Start with a secured card or credit builder loan — they\'re designed for building and rebuilding\n• Use the card for one small recurring purchase (gas, streaming) and pay the full statement balance every month\n• Keep utilization under 30%, ideally under 10% — this is 30% of your score\n• Ask a trusted family member about becoming an authorized user on a seasoned, low-utilization card\n• Space new credit applications 6+ months apart to minimize inquiry impact\n• Request credit limit increases after 6 months of perfect payments (ask if it\'s a soft pull first)\n• Consider rent reporting services and Experian Boost for easy wins on thin files\n• Don\'t close old accounts — even unused cards help your average account age\n• The ideal portfolio: 2-3 revolving accounts (credit cards) + 1 installment loan = strong credit mix',
        visual: { type: 'tip', text: 'Pro Tip: The "2/3/4 Rule" — aim for at least 2 revolving accounts (credit cards) and 1 installment loan (car, personal, or credit builder) for an ideal credit mix. Don\'t rush this — build gradually over 6-12 months. Each new account temporarily lowers your average age and adds an inquiry, so strategic timing matters.' }
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
        body: 'Once you understand the fundamentals, there are powerful advanced strategies that can accelerate your credit transformation. These techniques require precision and timing, but they can unlock results that standard disputes alone cannot achieve.',
        visual: { type: 'cards', items: [
          { title: 'Goodwill Letters', desc: 'Ask creditors to remove negative marks as a courtesy, especially if you\'re now a good customer. Works best with original creditors, not collectors.', icon: '💌' },
          { title: 'Pay-for-Delete', desc: 'Negotiate with collectors: you pay the debt in exchange for them removing the account from your report. Must be in writing.', icon: '🤝' },
          { title: 'Rapid Rescoring', desc: 'Used during mortgage applications to quickly update corrected information at the bureau level. Can update scores in 48-72 hours.', icon: '⚡' },
          { title: 'Debt Validation Deep Dive', desc: 'Challenge collectors to produce the original signed agreement — many can\'t because they bought a spreadsheet, not paperwork.', icon: '🔍' },
          { title: 'CFPB Complaint Leverage', desc: 'Filing a formal complaint with the Consumer Financial Protection Bureau puts regulatory pressure on companies. Response rate: 97%.', icon: '🏛️' },
          { title: 'The 609 Letter Strategy', desc: 'Request the bureau produce original documents used to verify an account. Many items can\'t be backed by original proof.', icon: '📜' }
        ]}
      },
      {
        type: 'content',
        title: 'Goodwill Letters — The Art of Asking',
        body: 'A goodwill letter asks a creditor to remove a negative mark as a courtesy — not because the information is wrong, but because you\'ve demonstrated you\'re now a responsible customer.\n\n<strong>When Goodwill Letters Work Best:</strong>\n• You had a legitimate hardship (job loss, medical emergency, divorce)\n• You\'ve since recovered and been paying perfectly for 6+ months\n• The creditor is the original lender (not a collection agency)\n• You\'re still a customer with the company\n• The negative mark is a 30-day late (not collections or charge-offs)\n\n<strong>Key Elements of a Successful Goodwill Letter:</strong>\n1. Take responsibility — don\'t make excuses or blame the company\n2. Explain the hardship briefly and specifically\n3. Show your recovery — "I\'ve made 18 consecutive on-time payments since"\n4. Make the ask clearly — "I respectfully request a goodwill adjustment"\n5. Be grateful — thank them for their consideration\n\n<strong>Success Rate:</strong> Approximately 15-30% of goodwill letters succeed. But when they do, the score impact can be dramatic — removing a single late payment from an otherwise clean history can add 50-100 points.',
        visual: { type: 'tip', text: 'Strategy Tip: Send goodwill letters to the creditor\'s executive office or CEO office, not the regular customer service department. Executive teams have more authority to make one-time adjustments. You can usually find executive addresses through a web search for "[Company Name] executive customer relations."' }
      },
      {
        type: 'scenario',
        title: 'Scenario: The Goodwill Letter',
        story: 'After losing her job in 2022, Patricia missed two payments on her Chase credit card. She\'s since caught up and has been paying on time for 18 months. The late payments are dragging her score down by an estimated 60 points.',
        question: 'What approach gives Patricia the best chance of getting the late payments removed?',
        options: [
          { text: 'Threaten to close her account if they don\'t remove the lates', correct: false, explanation: 'Threats usually backfire. The creditor has no obligation to remove accurate information and may simply let you close the account. You lose leverage, not them.' },
          { text: 'Write a sincere goodwill letter explaining the hardship, highlighting her recovery, and asking for a one-time courtesy removal', correct: true, explanation: 'Correct! A well-written goodwill letter works because it shows accountability (she\'s not denying the lates), explains the circumstances (job loss), and demonstrates recovery (18 months of perfect payments). Chase specifically has an internal "goodwill adjustment" process for long-standing customers with legitimate hardship stories.' },
          { text: 'Dispute the late payments as inaccurate with the bureau', correct: false, explanation: 'Since the late payments are technically accurate, this dispute would likely be verified. Goodwill is the better path for accurate-but-circumstantial negative items.' },
          { text: 'Wait for them to fall off in 7 years', correct: false, explanation: 'Seven years is a long time to wait when a goodwill letter might resolve it in 30 days. Even if the success rate is only 20-30%, it\'s absolutely worth the effort and a stamp.' }
        ]
      },
      {
        type: 'content',
        title: 'Pay-for-Delete — The Negotiation Framework',
        body: 'Pay-for-delete (PFD) is a negotiation with a collection agency where you offer to pay the debt in exchange for them agreeing to delete the account from your credit reports entirely.\n\n<strong>Why It Works:</strong>\nCollection agencies buy debts for 4-10 cents on the dollar. Even a partial payment is profitable for them. And removing the tradeline from your report costs them nothing.\n\n<strong>The Step-by-Step Process:</strong>\n1. Never acknowledge the debt in writing until you have a deal\n2. Start by requesting debt validation to verify the amount\n3. Make a settlement offer (start at 30-40% of the balance)\n4. Explicitly state: "This payment is contingent upon full deletion from all three credit bureau reports"\n5. Get the deletion agreement IN WRITING on company letterhead before sending any payment\n6. Pay by cashier\'s check or money order — never give bank account access\n7. After paying, wait 30-45 days and verify deletion on your reports\n8. If not deleted, send the written agreement and request compliance\n\n<strong>Important:</strong> Not all agencies will agree to PFD. Some have policies against it. If they refuse, you can still negotiate a lower payoff amount, but it will show as "settled" rather than being deleted.',
        visual: { type: 'tip', text: 'Negotiation Tip: The best time to negotiate pay-for-delete is at the end of the month or end of a quarter, when collectors are trying to hit quotas. They\'re more flexible under deadline pressure. Also, older debts are more negotiable — the agency knows you might just wait it out.' }
      },
      {
        type: 'scenario',
        title: 'Scenario: Pay-for-Delete Negotiation',
        story: 'A $800 medical collection from 2023 is on Derek\'s report. The collection agency contacts him offering to settle for $500. Derek wants the account completely removed from his credit report, not just paid.',
        question: 'How should Derek handle this negotiation?',
        options: [
          { text: 'Pay the $500 settlement and assume it gets removed', correct: false, explanation: 'Paying a collection doesn\'t automatically remove it. A "paid collection" still shows on your report. Under FICO 8, a paid collection is scored the same as unpaid. Only FICO 9 ignores paid collections.' },
          { text: 'Offer to pay the full $800 in exchange for a written agreement to delete the account from all three bureaus before sending any payment', correct: true, explanation: 'Correct! The key steps are: 1) Get the deletion agreement IN WRITING first — email or letter on company letterhead, 2) The agreement must state they will request deletion from TransUnion, Experian, AND Equifax, 3) Only then does Derek send payment, 4) Pay by cashier\'s check or money order, 5) Keep all documentation. Offering the full $800 instead of the $500 settlement gives him more leverage to demand deletion.' },
          { text: 'Refuse to pay anything since it\'s already on his report', correct: false, explanation: 'Not paying means the collection stays with a balance, which is the most damaging form. The collector might also escalate to legal action if the statute of limitations hasn\'t expired.' },
          { text: 'Report the collector to the police', correct: false, explanation: 'A legitimate collector contacting you about a real debt isn\'t committing a crime. The right move is to negotiate strategically for deletion.' }
        ]
      },
      {
        type: 'scenario',
        title: 'Scenario: The CFPB Complaint',
        story: 'Jennifer disputed a $3,400 collection that she already paid in full 6 months ago. She sent proof of payment (canceled check + receipt) via certified mail. The bureau came back and said the account was "verified as accurate" — but it\'s still showing a $3,400 balance with "unpaid" status.',
        question: 'What is Jennifer\'s strongest next move?',
        options: [
          { text: 'Send the same dispute letter again', correct: false, explanation: 'Repeating the same dispute with the same evidence can be flagged as frivolous. She needs to escalate, not repeat.' },
          { text: 'File a complaint with the Consumer Financial Protection Bureau (CFPB) and include all documentation proving payment', correct: true, explanation: 'Correct! The CFPB complaint is one of the most powerful tools available. Companies have a 97% response rate to CFPB complaints because federal regulators track them. Jennifer should include her proof of payment, certified mail receipts, and the bureau\'s "verified" response. CFPB complaints often produce results within 15 days — much faster than re-disputing. She can file at consumerfinance.gov.' },
          { text: 'Hire a lawyer immediately', correct: false, explanation: 'A lawyer may be the right next step if the CFPB complaint doesn\'t work, but it\'s premature to skip the CFPB process. An attorney consultation is free in many cases, though, so it\'s worth exploring in parallel.' },
          { text: 'Pay the $3,400 again to make it go away', correct: false, explanation: 'Jennifer already paid the debt. Paying again would mean paying the same debt twice — $6,800 total for a $3,400 debt. This is exactly why keeping payment proof is essential.' }
        ]
      },
      {
        type: 'scenario',
        title: 'Scenario: Rapid Rescoring for a Mortgage',
        story: 'Anthony is in the middle of a mortgage application. His credit score is 678 across all three bureaus. His mortgage broker says he needs a 680 to qualify for the best rate, saving him $43,000 over 30 years. Anthony just paid off a $2,000 credit card balance yesterday.',
        question: 'Can Anthony\'s score be updated fast enough for the mortgage?',
        options: [
          { text: 'No — credit scores only update once per month', correct: false, explanation: 'While normal bureau updates happen monthly, there is a special process available during mortgage applications.' },
          { text: 'Yes — his mortgage broker can request a "rapid rescore" which updates his credit with the bureaus in 48-72 hours', correct: true, explanation: 'Correct! Rapid rescoring is a service available through mortgage lenders. The broker submits proof of the payoff directly to the bureaus through a special channel. Within 48-72 hours, Anthony\'s report reflects the $0 balance, his utilization drops, and his score updates. This 2-point boost from 678 to 680+ could save him $43,000. Only mortgage professionals can request rapid rescores — consumers cannot do it themselves.' },
          { text: 'He should dispute all his accounts to force a rescore', correct: false, explanation: 'Filing disputes during a mortgage application is a terrible idea. Most lenders will pause or deny your application if you have active disputes because the report is considered "in flux."' },
          { text: 'He should open a new credit card for a higher limit', correct: false, explanation: 'Opening new credit during a mortgage application would trigger a hard inquiry and potentially lower his score further. Mortgage lenders also flag new accounts as a risk.' }
        ]
      },
      {
        type: 'content',
        title: 'Key Takeaways',
        body: '<strong>Advanced strategy playbook:</strong>\n\n• Goodwill letters work best when you have a track record of 6+ months of good behavior after the incident\n• Pay-for-delete MUST be in writing before you send any payment — no exceptions\n• Request "paid in full" status if PFD fails — never accept "settled for less" if you can pay in full\n• Use debt validation to challenge collections — demand the original signed contract, not just a balance statement\n• CFPB complaints have a 97% response rate and often produce results within 15 days\n• Rapid rescoring is available through mortgage lenders only and can update scores in 48-72 hours\n• Never open new credit or file disputes during an active mortgage application\n• Combine strategies: validate the debt → negotiate PFD → file CFPB complaint → escalate to attorney\n• Time your negotiations for end of month/quarter when collectors are under quota pressure',
        visual: { type: 'tip', text: 'Pro Tip: When sending a pay-for-delete offer, use language like "conditional payment" — "I will remit payment of $X via certified funds within 5 business days of receiving written confirmation that [Agency Name] will request deletion of account #XXXX from TransUnion, Experian, and Equifax within 30 days of payment receipt." Never pay first, negotiate second.' }
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
        body: 'You\'ve worked hard to build and repair your credit. Now it\'s about protecting what you\'ve earned. Think of credit maintenance like physical fitness — consistent habits matter more than dramatic efforts.\n\nThe good news: maintaining a high score is much easier than building one. Once you have good habits in place, your score becomes self-sustaining. The key is building systems that prevent mistakes.',
        visual: { type: 'cards', items: [
          { title: 'Monitor Monthly', desc: 'Check your reports and scores at least once a month. Catch errors and fraud early before they cause damage. Use free services like Credit Karma or your bank\'s score tool.', icon: '📊' },
          { title: 'Automate Everything', desc: 'Set up autopay for at least the minimum on every account. Then set separate reminders to pay the full balance before the statement date.', icon: '⚙️' },
          { title: 'Keep Utilization Low', desc: 'Stay under 30% utilization at all times. Under 10% is ideal. Consider paying balances down before the statement closes for the lowest reported utilization.', icon: '📉' },
          { title: 'Freeze Your Credit', desc: 'Place security freezes at all three bureaus to prevent unauthorized accounts. It\'s free, takes minutes, and you can temporarily lift it when you need to apply for credit.', icon: '🧊' },
          { title: 'Annual Review', desc: 'Pull full reports from AnnualCreditReport.com yearly. Check every section for errors, unfamiliar accounts, and outdated information.', icon: '📋' },
          { title: 'Strategic Limit Increases', desc: 'Request limit increases every 6-12 months. Higher limits with the same spending = lower utilization = higher score.', icon: '📈' }
        ]}
      },
      {
        type: 'content',
        title: 'The 5 Biggest Mistakes That Tank Good Scores',
        body: 'After years of building credit, many people accidentally damage their scores through common mistakes. Here are the top 5 score-killers and how to avoid them:\n\n<strong>1. Closing Old Credit Cards</strong>\nWhen you close your oldest card, your average account age drops and your total available credit decreases (raising utilization). Even if you never use a card, keep it open with a small purchase every 6 months.\n\n<strong>2. Co-Signing Loans</strong>\nCo-signing means you\'re 100% liable for the debt. If the other person misses a payment, YOUR credit takes the hit. The late payments, collections, and charge-offs appear on YOUR report too.\n\n<strong>3. Maxing Out Cards Before Statement Close</strong>\nEven if you pay in full by the due date, your utilization is calculated based on your STATEMENT balance. If your statement shows 90% utilization, that\'s what the bureaus see.\n\n<strong>4. Ignoring Small Debts</strong>\nA $50 unpaid parking ticket can go to collections and drop your score 50-100 points. Small debts cause disproportionate damage.\n\n<strong>5. Rate Shopping Without a Plan</strong>\nApplying for multiple types of credit (auto loan + credit card + personal loan) in a short window creates separate hard inquiries for each type. Rate shopping protection only applies within the SAME type of credit.',
        visual: { type: 'tip', text: 'Prevention Tip: Set up free credit monitoring alerts through Credit Karma, your bank, or each bureau. You\'ll get instant notifications when your score changes, new accounts appear, inquiries are made, or personal information is updated. This lets you catch issues immediately — not months later.' }
      },
      {
        type: 'scenario',
        title: 'Scenario: The Closing Mistake',
        story: 'Now that his credit score is 750, Daniel wants to simplify his finances. He has 5 credit cards:\n• Card 1: 12 years old, $15,000 limit (his oldest)\n• Card 2: 8 years old, $10,000 limit\n• Card 3: 5 years old, $8,000 limit\n• Card 4: 2 years old, $3,000 limit (store card, $95/yr fee)\n• Card 5: 1 year old, $5,000 limit (store card, no fee)\n\nHe wants to close Cards 1, 4, and 5.',
        question: 'What would you advise Daniel?',
        options: [
          { text: 'Close all three — fewer cards means less risk', correct: false, explanation: 'Closing cards reduces available credit (increasing utilization) and can shorten average account age. Both hurt your score.' },
          { text: 'Keep Card 1 (oldest) open, close Card 4 (has an annual fee), and keep Card 5 open since it has no fee', correct: true, explanation: 'Correct! Card 1 is anchoring his credit history at 12 years — closing it would drop his average age significantly and eliminate $15,000 in available credit. Card 4 has a $95/year fee with no benefit, so closing it makes financial sense. Card 5 has no fee, so keeping it open costs nothing. Make a small purchase on Cards 1 and 5 every 6 months to keep them active.' },
          { text: 'Close all of them and go cash-only', correct: false, explanation: 'Going cash-only means no new positive credit activity. His score would gradually decline as his credit file becomes "thin" with no active accounts.' },
          { text: 'It doesn\'t matter which ones he closes', correct: false, explanation: 'It matters a lot. Closing Card 1 (the oldest, highest-limit card) would cause the most damage to both credit history length and utilization ratio.' }
        ]
      },
      {
        type: 'scenario',
        title: 'Scenario: The Co-Signer Trap',
        story: 'Elena\'s brother asks her to co-sign his $25,000 car loan because his credit score is 520 and he can\'t qualify alone. Elena has an 810 score and has worked hard for years to achieve it. Her brother promises to make every payment on time.',
        question: 'What should Elena understand about co-signing?',
        options: [
          { text: 'It\'s safe as long as her brother promises to pay on time', correct: false, explanation: 'Promises don\'t protect credit scores. If her brother misses even one payment, Elena\'s 810 score will take a massive hit — potentially 90-110 points for a single 30-day late.' },
          { text: 'Co-signing means the full $25,000 debt appears on her credit report, affecting her utilization and debt-to-income ratio — and if her brother defaults, her score could drop over 100 points', correct: true, explanation: 'Correct! Co-signing means: 1) The full $25,000 loan balance appears on Elena\'s credit report, 2) It affects her debt-to-income ratio for future loans, 3) Every late payment hits HER report, 4) If her brother defaults, Elena is legally responsible for the remaining balance, 5) If it goes to collections, it appears on Elena\'s report too. An 810 score has the most to lose — people with higher scores experience larger drops from negative events.' },
          { text: 'Co-signing doesn\'t appear on the co-signer\'s credit report', correct: false, explanation: 'Co-signed accounts appear on BOTH the primary borrower\'s and the co-signer\'s credit reports. Every payment — good or bad — is reported for both.' },
          { text: 'She can remove herself as co-signer at any time', correct: false, explanation: 'Removing a co-signer typically requires the primary borrower to refinance the loan in their own name. Most people who need a co-signer can\'t qualify to refinance, trapping the co-signer.' }
        ]
      },
      {
        type: 'scenario',
        title: 'Scenario: The Identity Theft Alert',
        story: 'Sandra gets a notification from her credit monitoring service: a new credit card was opened in her name at a bank she\'s never used, with a $5,000 limit. She did NOT apply for this card.',
        question: 'What is the correct order of actions Sandra should take?',
        options: [
          { text: 'File a police report, then wait to see if charges appear', correct: false, explanation: 'Waiting is risky. The fraudster could run up charges immediately and open more accounts. Sandra needs to act on all fronts simultaneously.' },
          { text: 'Call the bank to close the fraudulent account, freeze credit at all 3 bureaus, file an FTC identity theft report at IdentityTheft.gov, file a police report, and dispute the account with all three bureaus', correct: true, explanation: 'Correct! The complete action plan: 1) Call the bank immediately to report fraud and close the account, 2) Freeze credit at TransUnion, Experian, and Equifax to prevent new accounts, 3) File an identity theft report at IdentityTheft.gov (creates an official FTC report), 4) File a local police report using the FTC report as documentation, 5) Send dispute letters to all three bureaus with copies of the FTC report and police report, 6) Set up fraud alerts as an additional layer, 7) Monitor all accounts closely for 12+ months.' },
          { text: 'Just dispute the account with the credit bureaus', correct: false, explanation: 'Disputing alone doesn\'t stop the fraudster from opening more accounts. She needs to freeze her credit immediately to prevent further damage.' },
          { text: 'Ignore it — the bank will figure it out eventually', correct: false, explanation: 'Ignoring identity theft allows the fraudster to continue. Without freezes and disputes, they could open multiple accounts, take out loans, and even commit crimes in Sandra\'s name.' }
        ]
      },
      {
        type: 'scenario',
        title: 'Scenario: The Statement Date Trick',
        story: 'Michelle has a Discover card with a $6,000 limit. She uses it heavily for rewards, spending about $4,000/month on groceries, gas, and bills. She always pays the full balance by the due date and has never paid interest.\n\nHer credit score is 720, but she thinks it should be higher given her perfect payment history.',
        question: 'Why might Michelle\'s score be lower than expected despite never missing a payment?',
        options: [
          { text: 'Discover cards don\'t help your credit as much as Visa or Mastercard', correct: false, explanation: 'All major credit cards report to the bureaus equally. The card network doesn\'t affect scoring.' },
          { text: 'Her statement balance of $4,000 on a $6,000 limit shows 67% utilization to the bureaus — even though she pays in full each month', correct: true, explanation: 'Correct! Credit utilization is calculated from your STATEMENT BALANCE — the amount on your bill, not your balance after payment. Even though Michelle pays in full (great for avoiding interest), the bureaus see 67% utilization every month. The fix: pay down the balance BEFORE the statement closing date. If she pays $3,500 before the statement closes, only $500 will be reported (8% utilization). Her score could jump 40-60 points.' },
          { text: 'Spending too much even if you pay it off shows irresponsibility', correct: false, explanation: 'Spending isn\'t tracked as a negative — only the balance at statement close matters. High spending with low reported utilization is actually ideal.' },
          { text: 'Her score is limited by having only one credit card', correct: false, explanation: 'While having more cards can help, the primary issue here is utilization. Fixing the statement date timing would give her the biggest immediate boost.' }
        ]
      },
      {
        type: 'content',
        title: 'Your Credit Maintenance Checklist',
        body: '<strong>Monthly, quarterly, and yearly habits for lasting credit health:</strong>\n\n<strong>Weekly:</strong>\n• Glance at credit monitoring app for alerts\n• Check for unfamiliar transactions on all accounts\n\n<strong>Monthly:</strong>\n• Review credit monitoring alerts in detail\n• Verify all statement balances are correct\n• Ensure autopay processed successfully on every account\n• Pay down balances before statement closing dates for optimal utilization\n\n<strong>Quarterly:</strong>\n• Review full credit report from one bureau (rotate bureaus)\n• Check credit utilization across all cards — both individual and overall\n• Look for unfamiliar accounts, addresses, or inquiries\n• Request credit limit increases on existing cards (ask if it\'s a soft pull)\n\n<strong>Yearly:</strong>\n• Pull free reports from AnnualCreditReport.com (all three bureaus)\n• Review and update security freezes — ensure they\'re still active\n• Assess whether to request credit limit increases\n• Check if any negative items should have aged off your report\n• Review authorized user accounts — are they still helping?\n• Consider if any annual-fee cards should be downgraded to no-fee versions',
        visual: { type: 'tip', text: 'Pro Tip: Set calendar reminders for credit check-ups. January = TransUnion, May = Experian, September = Equifax. This way you\'re reviewing a full bureau report every 4 months for free, giving you year-round coverage at zero cost.' }
      }
    ]
  },
  {
    id: 'identity-theft-recovery',
    title: 'Identity Theft Recovery',
    subtitle: 'Step-by-step guide for victims',
    icon: '🔐',
    xp: 100,
    sections: [
      {
        type: 'content',
        title: 'Recognizing Identity Theft',
        body: 'Identity theft happens when someone uses your personal information — name, Social Security number, credit card numbers, or other identifying data — without your permission to commit fraud or other crimes.\n\n<strong>Warning Signs:</strong>\n• Bills for accounts you didn\'t open\n• Calls from debt collectors about debts you don\'t owe\n• Unfamiliar accounts on your credit report\n• Denied credit for no clear reason\n• IRS notice that multiple tax returns were filed under your SSN\n• Medical bills for procedures you didn\'t have\n• Missing mail or redirected mail\n\n<strong>Types of Identity Theft:</strong>\n• <strong>Financial:</strong> Someone opens credit cards, loans, or bank accounts in your name\n• <strong>Medical:</strong> Someone uses your insurance for healthcare\n• <strong>Tax:</strong> Someone files a tax return using your SSN\n• <strong>Criminal:</strong> Someone gives your name during an arrest\n• <strong>Synthetic:</strong> Thieves combine real and fake information to create a new identity',
        visual: { type: 'cards', items: [
          { title: 'Financial ID Theft', desc: 'Most common type. Credit cards, loans, and bank accounts opened in your name.', icon: '💳' },
          { title: 'Medical ID Theft', desc: 'Your insurance used fraudulently. Can create dangerous false medical records.', icon: '🏥' },
          { title: 'Tax ID Theft', desc: 'Fraudulent tax returns filed using your SSN to steal refunds.', icon: '📋' },
          { title: 'Synthetic ID Theft', desc: 'Mix of your real SSN with a fake name. Hardest to detect.', icon: '🎭' }
        ]}
      },
      {
        type: 'content',
        title: 'Step 1: Place a Fraud Alert',
        body: 'The FIRST thing you should do when you discover identity theft is place a fraud alert with one of the three credit bureaus. By law, whichever bureau you contact must notify the other two.\n\n<strong>Types of Fraud Alerts:</strong>\n\n<strong>Initial Fraud Alert (1 year):</strong>\n• Free, lasts 1 year\n• Requires businesses to verify your identity before granting credit\n• You only need to contact ONE bureau — they notify the other two\n• Can be placed by phone or online in minutes\n\n<strong>Extended Fraud Alert (7 years):</strong>\n• Free, lasts 7 years\n• Requires an FTC Identity Theft Report (see Step 2)\n• Removes you from pre-approved credit offer lists for 5 years\n• Two free credit reports from each bureau per year\n\n<strong>Active Duty Military Alert (1 year):</strong>\n• For active duty service members\n• Similar protections to initial fraud alert\n\n<strong>Contact any ONE bureau:</strong>\n• Equifax: 1-800-525-6285\n• Experian: 1-888-397-3742\n• TransUnion: 1-800-680-7289',
        visual: { type: 'steps', items: [
          { title: 'Call One Bureau', desc: 'Contact Equifax, Experian, or TransUnion. They must notify the other two within 1 business day.' },
          { title: 'Request Initial Alert', desc: 'An initial fraud alert lasts 1 year and is placed immediately.' },
          { title: 'Confirm All Three', desc: 'Verify all three bureaus received the alert within a few days by checking your reports.' },
          { title: 'Upgrade Later', desc: 'After filing your FTC report, upgrade to an extended 7-year alert.' }
        ]}
      },
      {
        type: 'scenario',
        title: 'Scenario: The Mysterious Credit Card',
        story: 'Maria receives a call from a collection agency about a $4,200 credit card balance from a card she never opened. She checks her credit reports and finds two accounts she doesn\'t recognize — a credit card and a personal loan.',
        question: 'What should Maria do FIRST?',
        options: [
          { text: 'Pay the $4,200 to make it go away', correct: false, explanation: 'Never pay a debt that isn\'t yours. Paying it could be interpreted as acknowledging the debt and make it harder to dispute later.' },
          { text: 'Place a fraud alert with one credit bureau, then proceed to file an FTC report and police report', correct: true, explanation: 'Correct! The immediate priority is stopping further damage. A fraud alert prevents new accounts from being opened without identity verification. Then Maria should: 1) File an FTC Identity Theft Report at IdentityTheft.gov, 2) File a police report with her local department, 3) Dispute the fraudulent accounts with all three bureaus using the FTC report as evidence, 4) Consider placing a credit freeze for maximum protection.' },
          { text: 'Call the collection agency and argue with them', correct: false, explanation: 'While Maria should eventually address the collection, arguing won\'t solve the problem. She needs to establish the identity theft through proper channels first.' },
          { text: 'Close all her legitimate credit cards', correct: false, explanation: 'Closing legitimate accounts would damage her credit score and doesn\'t stop the thief from opening new ones. A fraud alert or freeze is the right approach.' }
        ]
      },
      {
        type: 'content',
        title: 'Step 2: File Your FTC Identity Theft Report',
        body: 'Go to <strong>IdentityTheft.gov</strong> — this is the FTC\'s official recovery portal. It creates a personalized recovery plan and generates your Identity Theft Report.\n\n<strong>What the FTC Report Does:</strong>\n• Serves as your official identity theft affidavit\n• Required for extended fraud alerts (7 years)\n• Required for credit bureaus to block fraudulent accounts within 4 business days\n• Proves to creditors that you\'re a victim of identity theft\n• Creates a legal record of the theft\n\n<strong>What You\'ll Need:</strong>\n• Your personal information (name, SSN, date of birth, address)\n• Details about the fraudulent accounts (creditor names, account numbers, amounts)\n• When you discovered the theft\n• Any suspect information (if known)\n\n<strong>After Filing:</strong>\nThe FTC generates a personalized recovery plan with pre-filled letters you can send to:\n• Credit bureaus (to dispute fraudulent accounts)\n• Creditors (to close fraudulent accounts)\n• Debt collectors (to stop collection on fraudulent debts)\n• The IRS (if tax fraud occurred)',
        visual: { type: 'tip', text: 'Critical: Save your FTC report number and print copies of the report. You\'ll need it for every step of the recovery process — bureau disputes, police reports, creditor communications, and potentially court proceedings. Keep both digital and physical copies in a safe place.' }
      },
      {
        type: 'content',
        title: 'Step 3: Credit Freezes',
        body: 'A <strong>credit freeze</strong> (also called a security freeze) is the strongest protection available. It prevents anyone — including you — from opening new credit in your name until you lift the freeze.\n\n<strong>How Freezes Work:</strong>\n• Each bureau gives you a PIN or password to manage your freeze\n• No one can access your credit report for new credit applications\n• Does NOT affect your credit score\n• Does NOT prevent you from using existing accounts\n• Free to place and lift since 2018 (Economic Growth Act)\n\n<strong>Freeze vs. Fraud Alert:</strong>\n• Fraud Alert = asks creditors to verify your identity (they don\'t have to)\n• Freeze = completely blocks access to your report (much stronger)\n• You can have BOTH active simultaneously\n\n<strong>When to Temporarily Lift:</strong>\n• Applying for a new credit card or loan\n• Applying for an apartment\n• Setting up new utilities\n• Getting a new cell phone plan\n• You can lift for a specific creditor or for a specific time period\n\n<strong>Freeze All Three Bureaus:</strong>\n• Equifax: equifax.com/personal/credit-report-services/credit-freeze/\n• Experian: experian.com/freeze/\n• TransUnion: transunion.com/credit-freeze',
        visual: { type: 'cards', items: [
          { title: 'Freeze', desc: 'Completely blocks report access. Strongest protection. Must be lifted for new applications.', icon: '🔒' },
          { title: 'Fraud Alert', desc: 'Asks creditors to verify identity. Easier to manage. Doesn\'t block access.', icon: '⚠️' },
          { title: 'Credit Lock', desc: 'Bureau-specific service (often paid). Similar to freeze but may have fewer legal protections.', icon: '🔑' },
          { title: 'Credit Monitoring', desc: 'Alerts you to changes. Doesn\'t prevent anything. Good as an additional layer.', icon: '👁️' }
        ]}
      },
      {
        type: 'scenario',
        title: 'Scenario: The Job Application Freeze',
        story: 'David placed credit freezes after identity theft 6 months ago. Now he\'s applying for a new job and the employer wants to run a background check that includes a credit check. David is worried he\'ll have to remove his freeze entirely.',
        question: 'What should David do?',
        options: [
          { text: 'Remove the freeze permanently — he doesn\'t need it anymore', correct: false, explanation: 'Removing the freeze entirely would leave David unprotected again. There are better options that maintain his security.' },
          { text: 'Temporarily lift the freeze for only the specific bureau the employer\'s background check company uses, for a limited time period', correct: true, explanation: 'Correct! David can temporarily lift his freeze at just one bureau (whichever the background check company uses — they\'ll tell him which one). He can set it for a specific date range (e.g., 1 week) and it automatically re-freezes after that period. This allows the check while maintaining protection at the other two bureaus and re-freezing automatically.' },
          { text: 'Tell the employer he can\'t do a credit check', correct: false, explanation: 'Refusing could cost David the job opportunity. A temporary lift is quick, free, and solves the problem.' },
          { text: 'Give the employer his freeze PIN so they can lift it themselves', correct: false, explanation: 'Never share your freeze PIN with anyone. Only YOU should control your freeze. Lift it yourself for the specific time period needed.' }
        ]
      },
      {
        type: 'content',
        title: 'Step 4: Dispute Fraudulent Accounts',
        body: 'With your FTC Identity Theft Report in hand, dispute every fraudulent account with all three credit bureaus:\n\n<strong>Under FCRA §605B, bureaus MUST block fraudulent accounts within 4 business days</strong> when you provide:\n1. Your FTC Identity Theft Report\n2. Proof of your identity\n3. A clear statement identifying the fraudulent accounts\n\n<strong>How to Dispute:</strong>\n• Send disputes via certified mail to each bureau\n• Include your FTC Identity Theft Report\n• Include a copy of your government-issued ID\n• Include a utility bill or bank statement proving your address\n• List each fraudulent account specifically (creditor name, account number)\n• Request blocking under §605B\n\n<strong>Also Contact the Creditors Directly:</strong>\n• Call each creditor where fraudulent accounts were opened\n• Ask for their fraud/identity theft department\n• Provide your FTC report and police report\n• Request the account be closed and reported as fraudulent\n• Ask for copies of the application and transaction records (you have a right to these under §609(e))',
        visual: { type: 'tip', text: 'Key Difference: §605B blocking is DIFFERENT from a regular §611 dispute. With a regular dispute, the bureau has 30 days and might verify the account. With §605B identity theft blocking, the bureau must block the account within 4 business days. Always cite §605B when disputing identity theft accounts — it\'s much faster and more powerful.' }
      },
      {
        type: 'content',
        title: 'Recovery Timeline and Checklist',
        body: '<strong>Your Identity Theft Recovery Timeline:</strong>\n\n<strong>Day 1 (Immediately):</strong>\n• Place fraud alert with one bureau\n• File FTC report at IdentityTheft.gov\n• Place credit freeze at all three bureaus\n• Change passwords on all financial accounts\n• Enable two-factor authentication everywhere\n\n<strong>Week 1:</strong>\n• File police report with local department\n• Dispute all fraudulent accounts with bureaus (cite §605B)\n• Contact each creditor\'s fraud department\n• Request copies of fraudulent applications under §609(e)\n• Notify your bank and existing credit card companies\n\n<strong>Month 1:</strong>\n• Follow up on bureau disputes (should be blocked within 4 days)\n• Follow up with creditors on account closures\n• Check for fraudulent tax returns (IRS Identity Protection PIN)\n• Check for fraudulent utility or phone accounts\n• Set up ongoing credit monitoring\n\n<strong>Ongoing:</strong>\n• Monitor credit reports monthly for 12+ months\n• Keep freeze in place (lift temporarily as needed)\n• Maintain your documentation file\n• Report any new fraudulent activity immediately',
        visual: { type: 'timeline', items: [
          { label: 'Day 1', duration: 'Immediate', severity: 'severe', desc: 'Fraud alert + FTC report + Credit freeze + Password changes' },
          { label: 'Week 1', duration: '7 days', severity: 'high', desc: 'Police report + Bureau disputes + Creditor fraud departments' },
          { label: 'Month 1', duration: '30 days', severity: 'medium', desc: 'Follow up on disputes + Check for tax/utility fraud + Set up monitoring' },
          { label: 'Months 2-12', duration: 'Ongoing', severity: 'medium', desc: 'Monthly monitoring + Keep freeze active + Document everything' }
        ]}
      },
      {
        type: 'scenario',
        title: 'Scenario: The Repeat Victim',
        story: 'Three months after resolving her identity theft case, Jessica notices a new fraudulent account on her Equifax report — a store credit card she didn\'t open. She already has fraud alerts and had frozen her credit, but she temporarily lifted the freeze 2 weeks ago to apply for an apartment.',
        question: 'What likely happened and what should Jessica do?',
        options: [
          { text: 'The identity thief must have her freeze PIN — she should call the police', correct: false, explanation: 'While possible, it\'s more likely the thief used the window when the freeze was temporarily lifted. She should re-freeze immediately.' },
          { text: 'She should just dispute it and move on', correct: false, explanation: 'While she should dispute it, she also needs to investigate the vulnerability and take additional protective steps.' },
          { text: 'The thief likely exploited the temporary freeze lift. Jessica should immediately re-freeze all bureaus, file a new FTC report supplement, dispute the new account under §605B, and consider an extended fraud alert', correct: true, explanation: 'Correct! The temporary freeze lift created a window of vulnerability. Jessica should: 1) Immediately confirm all three freezes are back in place, 2) File a supplement to her existing FTC Identity Theft Report, 3) Dispute the new fraudulent account under §605B at all three bureaus, 4) File an updated police report, 5) In the future, lift freezes for the shortest possible period and only at the specific bureau needed, 6) Consider placing an extended 7-year fraud alert for additional protection.' },
          { text: 'Identity theft can\'t happen if you have a freeze — she must be mistaken about the account', correct: false, explanation: 'Freezes only work when they\'re active. When Jessica temporarily lifted her freeze, her report was accessible. This is why temporary lifts should be as short as possible.' }
        ]
      },
      {
        type: 'content',
        title: 'Key Takeaways',
        body: '<strong>Identity Theft Recovery Checklist:</strong>\n\n• Act immediately — the faster you respond, the less damage occurs\n• Place a fraud alert with ONE bureau (they notify all three)\n• File your FTC report at IdentityTheft.gov — this is your key document\n• File a police report — some creditors and bureaus require it\n• Place credit freezes at ALL three bureaus (free since 2018)\n• Dispute fraudulent accounts under §605B for 4-day blocking (not the standard 30-day §611)\n• Contact creditors\' fraud departments directly and close fraudulent accounts\n• Request copies of fraudulent applications under §609(e)\n• Monitor your credit reports monthly for at least 12 months\n• Keep freezes in place permanently — lift temporarily only when needed\n• Save ALL documentation — FTC report, police report, dispute letters, correspondence\n• Consider an IRS Identity Protection PIN to prevent tax identity theft\n• Change passwords and enable two-factor authentication on all financial accounts',
        visual: { type: 'tip', text: 'Prevention Tip: Even after recovery, keep these habits forever: credit freezes at all three bureaus (lift only when needed), two-factor authentication on all financial accounts, unique passwords for each account (use a password manager), and regular credit monitoring. Prevention is always easier than recovery.' }
      }
    ]
  },
  {
    id: 'credit-building',
    title: 'Credit Building Strategies',
    subtitle: 'Build and grow your credit score',
    icon: '📈',
    xp: 100,
    sections: [
      {
        type: 'content',
        title: 'Starting from Zero — Building Credit from Scratch',
        body: 'Whether you\'re building credit for the first time or rebuilding after damage, the fundamentals are the same. You need to establish a history of responsible credit use.\n\n<strong>The Credit Building Pyramid:</strong>\n\nThink of credit building as a pyramid with four levels:\n\n<strong>Level 1: Foundation (0-6 months)</strong>\nGet your first credit account open and start building payment history.\n\n<strong>Level 2: Growth (6-12 months)</strong>\nAdd a second account type and optimize utilization.\n\n<strong>Level 3: Expansion (12-24 months)</strong>\nStrategically add accounts, manage credit mix, and maintain low utilization.\n\n<strong>Level 4: Optimization (24+ months)</strong>\nFine-tune your profile for the highest possible score.',
        visual: { type: 'steps', items: [
          { title: 'Level 1: Foundation', desc: 'Secured card or credit builder loan. Make on-time payments. Wait 6 months for score to develop.' },
          { title: 'Level 2: Growth', desc: 'Add a second account (different type). Keep utilization under 30%. Never miss a payment.' },
          { title: 'Level 3: Expansion', desc: 'Apply for an unsecured card. Request credit limit increases. Diversify account types.' },
          { title: 'Level 4: Optimization', desc: 'Target <10% utilization. Maximize age of accounts. Minimize inquiries. Hit 750+ score.' }
        ]}
      },
      {
        type: 'content',
        title: 'Secured Credit Cards — Your Starting Point',
        body: '<strong>What Is a Secured Card?</strong>\nA secured credit card requires a refundable security deposit (typically $200-$500) that becomes your credit limit. You use it like a regular card — the deposit is just collateral.\n\n<strong>Best Secured Card Strategy:</strong>\n• Choose a card that reports to ALL THREE bureaus (essential)\n• Put 1-2 small recurring charges on it (like a streaming subscription)\n• Set up autopay for full balance each month\n• Keep utilization under 30% (under 10% is even better)\n• Never carry a balance — you\'ll pay high interest\n• After 6-12 months, ask about graduating to an unsecured card\n\n<strong>Top Tips:</strong>\n• Some cards offer automatic graduation (your deposit is returned and limit increased)\n• Discover it Secured and Capital One Platinum Secured are popular options that report to all three bureaus\n• Don\'t apply for multiple secured cards — one is enough to start\n• Your secured card is a TOOL, not for everyday spending. Use it for one small bill and autopay it.',
        visual: { type: 'tip', text: 'Strategy: Put your Netflix or Spotify subscription ($10-15/month) on your secured card and set up autopay. This creates a perfect payment pattern: low utilization, consistent payments, zero effort. Your credit builds on autopilot.' }
      },
      {
        type: 'scenario',
        title: 'Scenario: The Secured Card Decision',
        story: 'Alex has no credit history and wants to start building credit. He\'s considering two secured cards: Card A requires a $200 deposit, has a $49 annual fee, and reports to all three bureaus. Card B requires a $200 deposit, has no annual fee, but only reports to Experian and TransUnion.',
        question: 'Which card should Alex choose?',
        options: [
          { text: 'Card B — no annual fee means it\'s free', correct: false, explanation: 'The annual fee savings is small ($49), but missing one bureau means Alex won\'t build an Equifax history. Many lenders pull Equifax specifically.' },
          { text: 'Card A — reporting to all three bureaus is critical for building a complete credit profile, even with the small annual fee', correct: true, explanation: 'Correct! Reporting to all three bureaus is the single most important feature of a starter card. If Card B doesn\'t report to Equifax, any lender that pulls Equifax will see no credit history at all. The $49 annual fee is a small investment in building a complete credit profile across all three bureaus. After 6-12 months of history, Alex can apply for a no-fee card and potentially cancel Card A.' },
          { text: 'He should get both cards to build credit faster', correct: false, explanation: 'Two secured cards isn\'t necessary and the two hard inquiries could hurt his thin file. One card reporting to all three bureaus is sufficient.' },
          { text: 'He shouldn\'t get a secured card — he should wait until he can get an unsecured card', correct: false, explanation: 'Without any credit history, Alex likely won\'t qualify for an unsecured card. A secured card is specifically designed for people building from scratch.' }
        ]
      },
      {
        type: 'content',
        title: 'Credit Builder Loans',
        body: '<strong>What Is a Credit Builder Loan?</strong>\nUnlike a traditional loan where you get money upfront, a credit builder loan works in reverse — you make payments into a savings account, and the lender reports your payments to the credit bureaus. At the end of the term, you get the money.\n\n<strong>How It Works:</strong>\n1. You "borrow" $300-$1,000 (the money goes into a locked savings account)\n2. You make monthly payments for 6-24 months\n3. Each payment is reported to the credit bureaus as an installment loan payment\n4. When you finish, the locked savings (minus fees/interest) are released to you\n\n<strong>Why They\'re Valuable:</strong>\n• Adds an installment loan to your credit mix (different from revolving credit cards)\n• Creates a forced savings habit\n• Low risk — if you can\'t pay, you just lose the locked funds\n• Popular through credit unions, Self (formerly Self Lender), and community banks\n\n<strong>Best Strategy:</strong>\n• Use a credit builder loan ALONGSIDE a secured card\n• This creates two account types (installment + revolving) which improves your credit mix\n• Choose the smallest loan amount to minimize cost\n• Set up autopay to ensure perfect payment history',
        visual: { type: 'cards', items: [
          { title: 'Self (App)', desc: 'Loans from $25-$150/month for 12-24 months. Reports to all 3 bureaus. No hard inquiry to apply.', icon: '📱' },
          { title: 'Credit Unions', desc: 'Many credit unions offer credit builder loans at low interest. Worth checking local options.', icon: '🏦' },
          { title: 'Credit Strong', desc: 'Another app option. Various loan amounts. Can close early without penalty.', icon: '💪' },
          { title: 'Secured Loan', desc: 'Some banks offer loans secured by your savings account balance. Very low rates.', icon: '🔒' }
        ]}
      },
      {
        type: 'content',
        title: 'The Authorized User Strategy',
        body: '<strong>What Is an Authorized User?</strong>\nWhen someone adds you as an authorized user on their credit card, the card\'s entire history appears on YOUR credit report. You don\'t even need to use the card — just being listed gives you the benefit.\n\n<strong>How to Use It Effectively:</strong>\n\n<strong>Choose the Right Account:</strong>\n• The account should have perfect payment history (no late payments ever)\n• Low utilization (under 10% is ideal)\n• Old age (the longer the history, the more it helps your average age)\n• The card must report authorized users to the bureaus (most major banks do)\n\n<strong>Best Practices:</strong>\n• Ask a trusted family member or close friend\n• You DON\'T need to have or use the physical card\n• The primary cardholder remains responsible for all charges\n• Both parties should agree that you won\'t make charges\n• Check after 30 days to confirm it appeared on your report\n\n<strong>Impact:</strong>\n• Can add years of credit history instantly\n• Can significantly boost your score if the account is old, high-limit, and low-utilization\n• Most effective when you have a thin file (few accounts of your own)',
        visual: { type: 'tip', text: 'Power Move: A family member\'s 15-year-old credit card with $20,000 limit, 3% utilization, and perfect payment history can appear on your report within 30 days. This single action can add years of history and dramatically improve your score — legally and for free. The key is finding someone with a pristine account who trusts you.' }
      },
      {
        type: 'scenario',
        title: 'Scenario: The Utilization Trap',
        story: 'Brittany has been building credit for 8 months with a secured card ($500 limit). She typically charges about $400/month and pays the full balance by the due date. Her score is 640 and isn\'t improving. She never misses a payment.',
        question: 'Why isn\'t Brittany\'s score improving despite perfect payments?',
        options: [
          { text: 'She needs to wait longer — 8 months isn\'t enough', correct: false, explanation: 'While time helps, the main issue is her utilization ratio. She should see improvement by addressing that.' },
          { text: 'Her utilization ratio is too high — $400/$500 = 80%. She should keep her balance under $50 (10%) when the statement closes, not just by the due date', correct: true, explanation: 'Correct! Brittany is making a common mistake. Even though she pays in full by the due date, the balance that gets REPORTED to the bureaus is the statement balance — and her statement is showing 80% utilization ($400/$500). She should either: 1) Pay down the balance BEFORE the statement closes (not the due date), 2) Only charge $25-$50 per month ($500 × 10% = $50 max), 3) Request a credit limit increase to lower her ratio. The statement closing date and the payment due date are different. What matters for your score is what\'s on the statement.' },
          { text: 'She should close the card and get a new one', correct: false, explanation: 'Closing the card would eliminate her only credit history. The solution is fixing her utilization, not starting over.' },
          { text: 'Secured cards don\'t actually build credit', correct: false, explanation: 'Secured cards absolutely build credit — they report the same as unsecured cards. Brittany\'s issue is utilization, not the card type.' }
        ]
      },
      {
        type: 'content',
        title: 'Advanced Credit Optimization',
        body: '<strong>Techniques for Maximizing Your Score:</strong>\n\n<strong>1. The Statement Balance Trick</strong>\nPay down your balance BEFORE the statement closing date, not just the due date. The statement balance is what gets reported. Aim for 1-3% utilization on the statement (not zero — a small balance shows active use).\n\n<strong>2. Request Credit Limit Increases</strong>\nAfter 6 months of on-time payments, request a limit increase. Higher limits mean lower utilization ratios. Ask if it\'s a "soft pull" — some issuers do a hard inquiry for limit increases.\n\n<strong>3. The 2/3/4 Rule for Applications</strong>\n• Wait at least 6 months between credit card applications\n• No more than 2-3 hard inquiries per year\n• Keep 3-4 credit accounts total (mix of types)\n\n<strong>4. Never Close Old Accounts</strong>\nOld accounts increase your average age of credit. If you have an old card with an annual fee, ask to downgrade to a no-fee version rather than closing it.\n\n<strong>5. The AZEO Method (All Zero Except One)</strong>\nKeep all cards at $0 balance except one card with a small balance (1-3%). This is the optimal utilization pattern for maximum score impact.\n\n<strong>6. Rate Shopping Window</strong>\nWhen shopping for a mortgage, auto loan, or student loan, multiple inquiries within a 14-45 day window count as a single inquiry for scoring purposes.',
        visual: { type: 'tip', text: 'AZEO Method Example: If you have 3 credit cards, pay all three to $0 before statement closing dates. On ONE card, leave a small balance ($5-$20). This shows all three accounts are responsibly managed while demonstrating active credit use. This single change can boost your score 20-40 points.' }
      },
      {
        type: 'scenario',
        title: 'Scenario: The Rebuilder\'s Path',
        story: 'James completed bankruptcy 2 years ago and currently has no credit accounts. His score is 520. He wants to buy a home in 3 years. He has $500 available for credit building.',
        question: 'What is James\'s optimal 3-year credit building strategy?',
        options: [
          { text: 'Apply for as many credit cards as possible to build history quickly', correct: false, explanation: 'Multiple applications will generate hard inquiries that hurt his score, and he\'ll likely be denied for most cards post-bankruptcy. Quality over quantity.' },
          { text: 'Wait until the bankruptcy falls off his report', correct: false, explanation: 'Chapter 7 bankruptcy stays for 10 years. Waiting 8 more years isn\'t necessary — James can build credit now alongside the bankruptcy record.' },
          { text: 'Month 1: Get a secured card ($300 deposit) reporting to all 3 bureaus + credit builder loan ($200). Month 6: Request limit increase. Month 12: Apply for unsecured card. Months 1-36: Perfect payments, under 10% utilization, build authorized user history', correct: true, explanation: 'Correct! This systematic approach builds a strong credit profile: 1) Secured card ($300) + credit builder loan ($200) = $500 budget used, two account types reporting, 2) Perfect payment history from day 1 — this is the #1 scoring factor, 3) Keep utilization under 10% ($30 max on secured card), 4) At 6 months, request limit increase on secured card, 5) At 12 months, apply for an unsecured card (Discover or Capital One are bankruptcy-friendly), 6) If possible, get added as authorized user on a family member\'s old, clean card. With this strategy, James could realistically reach 680-720+ within 2-3 years — enough for many mortgage programs.' },
          { text: 'Only use debit cards — they\'re safer than credit', correct: false, explanation: 'Debit cards are NOT reported to credit bureaus and do nothing to build credit history. James needs credit accounts to build a score.' }
        ]
      },
      {
        type: 'content',
        title: 'Key Takeaways',
        body: '<strong>Credit Building Strategy Checklist:</strong>\n\n• Start with a secured credit card that reports to ALL THREE bureaus\n• Add a credit builder loan for installment loan history (improves credit mix)\n• Consider becoming an authorized user on a trusted person\'s old, clean account\n• Keep utilization under 10% — pay before the STATEMENT closing date, not just the due date\n• Never miss a payment — set up autopay on every account\n• Request credit limit increases every 6 months (ask for soft pull)\n• Don\'t close old accounts — downgrade annual fee cards to no-fee versions\n• Apply for new credit sparingly — no more than 2-3 inquiries per year\n• Use the AZEO method: All Zero Except One card with a small balance\n• Be patient — meaningful credit building takes 12-24 months\n• Monitor your progress monthly through free credit monitoring apps\n• Remember: payment history (35%) and utilization (30%) are 65% of your score',
        visual: { type: 'tip', text: 'The Golden Rule of Credit Building: The best credit building strategy is boring. Small recurring charges, autopay, low utilization, and time. No tricks, no shortcuts. Consistency beats complexity every time. Set it up once and let it work for you on autopilot.' }
      }
    ]
  }
];
