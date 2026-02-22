window.EDUCATION_INTERMEDIATE = [
  {
    id: 'fcra-deep-dive',
    title: 'FCRA Deep Dive',
    subtitle: 'Master the Fair Credit Reporting Act',
    icon: '⚖️',
    xp: 150,
    tier: 'intermediate',
    sections: [
      {
        type: 'content',
        title: 'What Is the FCRA?',
        body: 'The <strong>Fair Credit Reporting Act (FCRA)</strong>, codified at 15 U.S.C. §1681, is the federal law that governs how credit bureaus collect, share, and report your information. Enacted in 1970 and significantly amended in 1996 and 2003, it\'s the foundation of every credit dispute.\n\nThe FCRA creates obligations for three parties:\n\n<strong>1. Consumer Reporting Agencies (CRAs)</strong> — TransUnion, Experian, Equifax. They must follow "reasonable procedures to assure maximum possible accuracy" of your report.\n\n<strong>2. Furnishers</strong> — Banks, lenders, collectors, and anyone who reports data to the bureaus. They must report accurately and investigate disputes.\n\n<strong>3. Users</strong> — Anyone who pulls your credit. They must have a "permissible purpose" under §604.',
        visual: { type: 'cards', items: [
          { title: '§604 – Permissible Purpose', desc: 'Only certain people can pull your credit: lenders you applied to, employers (with consent), insurers, landlords, and you.', icon: '🔐' },
          { title: '§605 – Reporting Periods', desc: 'Negative items must be removed after 7 years (10 for Ch.7 bankruptcy). This is the "time limit" section.', icon: '⏰' },
          { title: '§611 – Dispute Rights', desc: 'Your right to dispute. Bureaus must investigate within 30 days, contact the furnisher, and report results to you.', icon: '📝' },
          { title: '§623 – Furnisher Duties', desc: 'After a bureau dispute, you can dispute directly with the furnisher. They must independently investigate.', icon: '🏦' }
        ]}
      },
      {
        type: 'content',
        title: 'Section 611 — Your Dispute Rights in Detail',
        body: 'Section 611 is the heart of credit repair. Here\'s what it actually requires:\n\n<strong>§611(a)(1) — Right to Dispute:</strong>\nYou can dispute any item you believe is "inaccurate or incomplete." Notice it says OR — the information doesn\'t have to be completely wrong; even incomplete information qualifies.\n\n<strong>§611(a)(1)(A) — Investigation Required:</strong>\nThe CRA must conduct a "reasonable reinvestigation" within 30 days. They cannot just rubber-stamp the furnisher\'s response.\n\n<strong>§611(a)(2) — Forward All Relevant Information:</strong>\nThe CRA must send "all relevant information" from your dispute to the furnisher. If they only send a 2-digit e-OSCAR code and ignore your evidence, they\'ve violated the law.\n\n<strong>§611(a)(3) — Frivolous Disputes:</strong>\nThe CRA can refuse to investigate if the dispute is "frivolous or irrelevant." But they must notify you within 5 business days and explain WHY they consider it frivolous.\n\n<strong>§611(a)(5)(A) — Delete if Unverifiable:</strong>\nIf the furnisher cannot verify the information within 30 days, the CRA MUST "promptly delete" the item. This is the most powerful provision — many items are deleted because furnishers simply don\'t respond in time.\n\n<strong>§611(a)(6) — Notice of Results:</strong>\nThe CRA must notify you of results within 5 business days of completing the investigation, AND provide a free updated report if changes were made.',
        visual: { type: 'tip', text: 'Legal Strategy: When a bureau violates §611 — for example, by failing to forward your evidence to the furnisher — each violation can be worth $100-$1,000 in statutory damages under §616(a), plus actual damages, attorney fees, and costs. Many consumer rights attorneys take these cases on contingency (no upfront cost to you).' }
      },
      {
        type: 'scenario',
        title: 'Scenario: The 30-Day Clock',
        story: 'On March 1st, Jordan sends a dispute letter via certified mail to Equifax about a $3,200 collection he doesn\'t recognize. The certified mail receipt shows delivery on March 4th. On April 8th — 35 days after delivery — Jordan still hasn\'t received any response from Equifax.',
        question: 'Has Equifax violated the FCRA?',
        options: [
          { text: 'No — 35 days is close enough to the deadline', correct: false, explanation: 'The FCRA doesn\'t have a "close enough" standard. 30 days means 30 days from receipt. At 35 days without a response, Equifax is in violation.' },
          { text: 'Yes — under §611(a)(1)(A), the investigation must be completed within 30 days of receiving the dispute, and Equifax failed to meet this deadline', correct: true, explanation: 'Correct! The 30-day clock starts when the CRA receives the dispute (March 4th per the certified mail receipt). The deadline was April 3rd. By April 8th without a response, Equifax has violated §611. Jordan should: 1) Send a follow-up letter demanding immediate deletion under §611(a)(5)(A) since the item is now unverified, 2) File a CFPB complaint citing the violation, 3) Consult a consumer rights attorney about statutory damages.' },
          { text: 'No — the clock starts from when Jordan mailed the letter, not when Equifax received it', correct: false, explanation: 'The 30-day period begins when the CRA receives the dispute, not when it was mailed. This is why certified mail with return receipt is essential — it proves exactly when the bureau received it.' },
          { text: 'Yes — but only if Jordan filed the dispute online', correct: false, explanation: 'The 30-day deadline applies regardless of how the dispute was filed — mail, online, or phone. The method doesn\'t change the legal obligation.' }
        ]
      },
      {
        type: 'content',
        title: 'Section 623 — Furnisher Duties',
        body: 'Section 623 is your second line of attack after a bureau dispute. It creates obligations for the companies that report your data:\n\n<strong>§623(a)(1) — Duty to Report Accurately:</strong>\nFurnishers cannot report information they know (or should know) is inaccurate. If you notify them of an error and they keep reporting it, they\'re violating the law.\n\n<strong>§623(a)(2) — Duty to Correct:</strong>\nIf a furnisher discovers they reported inaccurate data, they must notify all CRAs and correct it. They can\'t just fix it at one bureau.\n\n<strong>§623(b) — Duty to Investigate After Bureau Dispute:</strong>\nAfter you dispute with the bureau, the furnisher receives a notice via e-OSCAR. They must:\n• Conduct a reasonable investigation\n• Review ALL relevant information provided by the CRA\n• Report results to the CRA\n• Correct inaccurate information at all bureaus\n\nThe key phrase is "reasonable investigation." Simply checking their own records without considering your evidence is NOT reasonable. Courts have consistently ruled that furnishers must actually investigate, not just rubber-stamp.\n\n<strong>§623(b) Direct Disputes (Post-2010):</strong>\nAfter first disputing with the bureau, you can dispute DIRECTLY with the furnisher. This triggers an independent investigation obligation. The furnisher must investigate within 30 days and report results.',
        visual: { type: 'steps', items: [
          { title: 'Step 1: Bureau Dispute First', desc: 'You must dispute with the CRA before using §623(b). This is a prerequisite — you can\'t skip to the furnisher.' },
          { title: 'Step 2: Get Bureau Results', desc: 'Wait for the bureau\'s response. If they say "verified," you now have standing for a §623 direct dispute.' },
          { title: 'Step 3: Send 623 Letter to Furnisher', desc: 'Write directly to the furnisher\'s compliance department. Reference §623(b), include your bureau dispute results, and demand investigation.' },
          { title: 'Step 4: Furnisher Must Investigate', desc: 'The furnisher must conduct their own investigation (not just re-verify via e-OSCAR). They have 30 days.' },
          { title: 'Step 5: Document Everything', desc: 'If the furnisher fails to investigate or continues reporting inaccurately, you have grounds for a private lawsuit under §623(b).' }
        ]}
      },
      {
        type: 'scenario',
        title: 'Scenario: The Furnisher Rubber Stamp',
        story: 'Andrea disputed a $4,500 credit card balance showing as $7,200 on her Experian report. She sent bank statements proving the correct balance. Experian forwarded the dispute to Capital One via e-OSCAR. Capital One responded "verified as reported" within 3 days without reviewing Andrea\'s bank statements.',
        question: 'Did Capital One violate the FCRA?',
        options: [
          { text: 'No — they verified the information in their own records', correct: false, explanation: 'Simply checking internal records without considering the consumer\'s evidence is not a "reasonable investigation" as required by §623(b). Courts have repeatedly ruled on this.' },
          { text: 'Yes — under §623(b), Capital One was required to review ALL relevant information, including Andrea\'s bank statements, and conduct a reasonable investigation', correct: true, explanation: 'Correct! Under §623(b)(1)(A), the furnisher must "conduct an investigation with respect to the disputed information" and "review all relevant information provided by the CRA." If Experian forwarded Andrea\'s bank statements (as required by §611(a)(2)), Capital One was obligated to review them. A 3-day turnaround without reviewing evidence suggests rubber-stamping, which courts have found to violate the FCRA in cases like Gorman v. Wolpoff & Abramson (2009).' },
          { text: 'No — the 3-day response time shows they were diligent', correct: false, explanation: 'A fast response is not evidence of a thorough investigation — in fact, it suggests the opposite. Reviewing bank statements and cross-referencing account records takes time.' },
          { text: 'Andrea needs to sue Experian, not Capital One', correct: false, explanation: 'Andrea can potentially pursue both. Experian may have violated §611(a)(2) by not forwarding her evidence, and Capital One may have violated §623(b) by not conducting a reasonable investigation.' }
        ]
      },
      {
        type: 'content',
        title: 'Section 605 — Time Limits on Reporting',
        body: 'Section 605 sets the maximum time negative items can stay on your report. These are absolute limits that cannot be extended:\n\n<strong>§605(a)(1) — Bankruptcies: 10 years</strong>\nChapter 7 and Chapter 11 bankruptcies: 10 years from filing date. Chapter 13: 7 years from filing date.\n\n<strong>§605(a)(2) — Civil Judgments: 7 years</strong>\n(Note: As of 2018, most civil judgments and tax liens have been removed from credit reports due to new bureau policies.)\n\n<strong>§605(a)(4) — Collections & Charge-offs: 7 years</strong>\nThe 7-year clock runs from the "date of first delinquency" (DOFD) on the ORIGINAL account — not from when the collection was placed.\n\n<strong>§605(a)(5) — Inquiries: 2 years</strong>\nHard inquiries must be removed after 2 years (though they only affect scoring for 12 months).\n\n<strong>§605(c) — No Re-aging:</strong>\nThe reporting period cannot be restarted. If a collector places a "new" collection for an old debt and reports a recent DOFD, they\'ve violated §605(c). This is called "re-aging" and is illegal.',
        visual: { type: 'timeline', items: [
          { label: 'Hard Inquiries', duration: '2 years', severity: 'medium', desc: 'Must be removed after 2 years. Only affects score for first 12 months.' },
          { label: 'Late Payments', duration: '7 years from DOFD', severity: 'high', desc: 'Clock starts from the date you first fell behind on that account.' },
          { label: 'Collections', duration: '7 years from original DOFD', severity: 'high', desc: 'Based on ORIGINAL account default date, not when the collector got the debt.' },
          { label: 'Charge-offs', duration: '7 years from DOFD', severity: 'high', desc: 'Same as collections — tied to original delinquency date.' },
          { label: 'Ch. 13 Bankruptcy', duration: '7 years from filing', severity: 'severe', desc: 'Shorter reporting period than Ch. 7 because you repaid debts.' },
          { label: 'Ch. 7 Bankruptcy', duration: '10 years from filing', severity: 'severe', desc: 'Longest reporting period for any consumer credit item.' }
        ]}
      },
      {
        type: 'scenario',
        title: 'Scenario: The Re-Aged Collection',
        story: 'Kenneth defaulted on a credit card in January 2019. The original creditor charged it off in July 2019 and sold the debt. In March 2025, a new collection agency starts reporting the account with a "Date of First Delinquency" of March 2025 and claims the 7-year clock just started.',
        question: 'Is this legal?',
        options: [
          { text: 'Yes — the new collector has the right to set a new DOFD', correct: false, explanation: 'Collectors cannot change the Date of First Delinquency. It is fixed by law and tied to the original account.' },
          { text: 'No — this is illegal re-aging in violation of §605(c). The true DOFD is January 2019, meaning the item should fall off by approximately January 2026', correct: true, explanation: 'Correct! Under §605(c), the DOFD is set by the original creditor and runs from when Kenneth first became delinquent (January 2019). The collection agency reporting a 2025 DOFD is illegally re-aging the debt. Kenneth should: 1) Dispute with the bureaus citing §605(c), 2) File a complaint with the CFPB, 3) Send a cease and desist citing the violation, 4) Consult an attorney — willful FCRA violations carry $100-$1,000 statutory damages per violation under §616.' },
          { text: 'It depends on which state Kenneth lives in', correct: false, explanation: 'The FCRA is federal law and applies uniformly in all states. The DOFD rules under §605 are not state-dependent.' },
          { text: 'Yes — but only for 5 more years', correct: false, explanation: 'The collector has no right to report this with any new date. The original DOFD controls, and the item should be near expiration already.' }
        ]
      },
      {
        type: 'content',
        title: 'Section 609 — Your Right to See Your File',
        body: '<strong>Section 609</strong> requires CRAs to disclose to you, upon request:\n\n• All information in your file at the time of the request\n• The sources of the information\n• The identity of anyone who received your report in the past year (or two years for employment)\n• Your credit score and the factors affecting it\n\n<strong>The "609 Letter" Misconception:</strong>\nThere\'s a popular myth that "609 letters" are a secret weapon that forces bureaus to produce original documents or delete items. This is NOT what §609 says. Section 609 requires disclosure of what\'s IN your file — it doesn\'t create a separate dispute mechanism.\n\nHowever, a §609 request CAN be useful strategically:\n• Request the "source" of disputed information — if the bureau can\'t identify the furnisher, the item may be unverifiable\n• Request the "method of verification" used in a previous dispute — this exposes weak investigations\n• Compare what the bureau has in their file vs. what appears on your report — discrepancies can support disputes',
        visual: { type: 'tip', text: 'Strategy Tip: Don\'t fall for the "609 letter template" scams sold online. §609 is a disclosure right, not a dispute right. Your dispute power comes from §611 and §623. Use §609 strategically to gather information that supports your disputes, not as a standalone removal tactic.' }
      },
      {
        type: 'scenario',
        title: 'Scenario: Damages and Lawsuits',
        story: 'After months of disputing, Samantha has proof that Equifax: 1) Failed to investigate her dispute within 30 days (§611 violation), 2) Did not forward her evidence to the furnisher (§611(a)(2) violation), and 3) The furnisher continued reporting inaccurate information that cost Samantha a mortgage approval. She was denied a 3.5% rate and had to take a 5.8% rate on her $250,000 mortgage.',
        question: 'What damages might Samantha be entitled to?',
        options: [
          { text: 'Nothing — you can\'t sue credit bureaus', correct: false, explanation: 'The FCRA explicitly creates a private right of action under §616 (willful violations) and §617 (negligent violations).' },
          { text: 'Only $1,000 maximum', correct: false, explanation: '$1,000 is the maximum STATUTORY damage per willful violation, but actual damages (the real financial harm) can be much higher and are uncapped.' },
          { text: 'Statutory damages ($100-$1,000 per willful violation), actual damages (the interest rate difference over 30 years = ~$50,000+), punitive damages, and attorney fees', correct: true, explanation: 'Correct! Under the FCRA, Samantha can pursue: 1) Statutory damages of $100-$1,000 per willful violation (§616), 2) Actual damages — the financial harm she suffered, which includes the difference in interest rates over 30 years (potentially $50,000+), 3) Punitive damages if the violations were willful, 4) Attorney fees and costs. Many consumer rights attorneys take FCRA cases on contingency because the law requires the violator to pay attorney fees.' },
          { text: 'She can only file a complaint, not a lawsuit', correct: false, explanation: 'The FCRA specifically creates a private right of action, meaning individual consumers can sue. Complaints (CFPB, FTC) and lawsuits are separate tools that can be used simultaneously.' }
        ]
      },
      {
        type: 'content',
        title: 'Key Takeaways',
        body: '<strong>FCRA Mastery Checklist:</strong>\n\n• §604 — Credit can only be pulled with "permissible purpose." Unauthorized pulls are violations worth suing over.\n• §605 — Negative items have absolute time limits. Re-aging is illegal under §605(c).\n• §609 — Your right to see your file and its sources. Not a dispute mechanism, but useful for intelligence gathering.\n• §611 — Your core dispute right. 30-day investigation deadline. Bureau must forward ALL your evidence. Unverified items must be deleted.\n• §616 — Willful violations: $100-$1,000 statutory damages + actual damages + punitive + attorney fees.\n• §617 — Negligent violations: actual damages + attorney fees.\n• §623 — Furnisher must investigate after bureau dispute. "Reasonable investigation" means actually reviewing your evidence.\n• Always document everything — certified mail receipts, timeline, copies of all letters and responses. This is your evidence file for potential litigation.',
        visual: { type: 'tip', text: 'Power Move: If you suspect willful FCRA violations, consult a consumer rights attorney. Many work on contingency (free to you) because the FCRA requires violators to pay the winner\'s attorney fees. Organizations like NACA (National Association of Consumer Advocates) maintain directories of consumer rights attorneys by state.' }
      }
    ]
  },
  {
    id: 'fdcpa-mastery',
    title: 'FDCPA Mastery',
    subtitle: 'Your rights against debt collectors',
    icon: '🛡️',
    xp: 150,
    tier: 'intermediate',
    sections: [
      {
        type: 'content',
        title: 'What Is the FDCPA?',
        body: 'The <strong>Fair Debt Collection Practices Act (FDCPA)</strong>, codified at 15 U.S.C. §1692, regulates how third-party debt collectors can behave when trying to collect a debt from you. It was passed in 1977 to eliminate abusive collection practices.\n\n<strong>Critical Distinction — Who It Covers:</strong>\nThe FDCPA applies to <strong>third-party collectors</strong> — companies that collect debts on behalf of others, or that buy and collect debts. It does NOT apply to original creditors collecting their own debts.\n\nExample: If you owe Chase Bank and Chase calls you — that\'s NOT covered by FDCPA. But if Chase sells your debt to ABC Collections and ABC calls you — ABC is bound by the FDCPA.\n\n<strong>What It Covers:</strong>\n• Personal, family, or household debts (credit cards, medical, auto, mortgage)\n• NOT business debts\n• NOT debts owed to the government (taxes, student loans held by DoE)',
        visual: { type: 'cards', items: [
          { title: '§1692c – Communication Rules', desc: 'Limits when, where, and how collectors can contact you. They can\'t call before 8am or after 9pm.', icon: '📞' },
          { title: '§1692d – Harassment Ban', desc: 'No threats of violence, profane language, repeated calls to annoy, or publishing your name on a "deadbeat list."', icon: '🚫' },
          { title: '§1692e – No Deception', desc: 'Can\'t lie about who they are, the amount owed, threaten actions they can\'t take, or impersonate attorneys/government.', icon: '🎭' },
          { title: '§1692g – Validation Rights', desc: 'Must send written notice within 5 days of first contact. You have 30 days to request debt validation.', icon: '✉️' }
        ]}
      },
      {
        type: 'content',
        title: 'What Collectors CANNOT Do',
        body: 'The FDCPA creates a detailed list of prohibited practices. Each violation is actionable:\n\n<strong>Harassment (§1692d):</strong>\n• Use or threaten violence or criminal means\n• Use profane or obscene language\n• Call repeatedly to annoy or harass\n• Call without identifying themselves\n• Publish lists of people who owe debts\n\n<strong>False or Misleading Representations (§1692e):</strong>\n• Falsely represent the amount of the debt\n• Claim to be an attorney when they\'re not\n• Threaten to take action they legally cannot (like arrest or wage garnishment without a court order)\n• Imply they\'re affiliated with the government\n• Falsely represent the debt as a crime\n• Use a false company name\n• Misrepresent the legal status of the debt\n\n<strong>Unfair Practices (§1692f):</strong>\n• Collect any amount not authorized by the agreement or law (unauthorized fees, interest)\n• Threaten to seize property they have no right to take\n• Communicate by postcard (exposing your debt to others)\n• Use deceptive means to collect\n\n<strong>Communication Restrictions (§1692c):</strong>\n• Cannot call before 8:00 AM or after 9:00 PM in YOUR time zone\n• Cannot contact you at work if you tell them your employer prohibits it\n• Cannot contact you directly if you have an attorney and they know it\n• MUST stop contacting you if you send a written cease and desist',
        visual: { type: 'tip', text: 'Documentation Tip: If a collector violates the FDCPA, document everything. Note the date, time, caller\'s name, company, what was said, and any witnesses. If your state allows it, record the call (check your state\'s recording consent laws). Each violation is worth up to $1,000 in statutory damages.' }
      },
      {
        type: 'scenario',
        title: 'Scenario: The Workplace Call',
        story: 'Mike told a collector from National Recovery Agency that his employer doesn\'t allow personal calls at work. The collector said "I don\'t care about your employer\'s rules — you owe this money and I\'ll call wherever I need to." The collector called Mike\'s office three more times the same week.',
        question: 'How many FDCPA violations occurred?',
        options: [
          { text: 'One — the rude comment', correct: false, explanation: 'Multiple violations occurred across multiple calls and statements.' },
          { text: 'None — collectors can call wherever they want', correct: false, explanation: 'The FDCPA explicitly restricts workplace calls and requires collectors to stop calling your workplace if you inform them your employer prohibits it.' },
          { text: 'At least four: 1) continuing to call workplace after being told employer prohibits it (§1692c), 2-4) three additional workplace calls, each a separate violation', correct: true, explanation: 'Correct! Under §1692c(a)(3), a collector may not contact you at your place of employment if they know your employer prohibits it. Mike informed them, making each subsequent call a separate violation. Each violation carries up to $1,000 in statutory damages. The "I don\'t care" comment could also constitute harassment under §1692d. Mike should: 1) Document all dates and times, 2) Send a written cease and desist via certified mail, 3) File a CFPB complaint, 4) Consult an FDCPA attorney — with multiple documented violations, this is a strong case.' },
          { text: 'Two — one for the comment and one for calling back', correct: false, explanation: 'Each call to the workplace after being told to stop constitutes a separate violation, not just one.' }
        ]
      },
      {
        type: 'content',
        title: 'Debt Validation — Your Most Powerful FDCPA Right',
        body: 'Under §1692g, within 5 days of first contacting you, a collector MUST send written notice containing:\n\n1. The amount of the debt\n2. The name of the creditor to whom the debt is owed\n3. A statement that unless you dispute within 30 days, the debt will be "assumed valid"\n4. A statement that if you dispute in writing within 30 days, the collector will provide verification\n5. A statement that they\'ll provide the original creditor\'s name if requested\n\n<strong>What "Verification" Should Include:</strong>\nCourts have differed on what constitutes adequate verification, but at minimum:\n• Proof the debt exists and the amount is correct\n• Proof that YOU are the debtor\n• Proof the collector has the right to collect (chain of ownership)\n• Ideally: the original signed credit agreement\n\n<strong>The 30-Day Window:</strong>\nIf you request validation within 30 days:\n• The collector MUST cease ALL collection activity until validation is provided\n• They cannot report to credit bureaus during this period\n• They cannot call, send letters, or threaten legal action\n\nAfter 30 days, you can still request validation, but the automatic "cease collection" protection expires.',
        visual: { type: 'steps', items: [
          { title: 'Day 1: First Contact', desc: 'Collector calls or sends a letter. The 30-day clock starts.' },
          { title: 'Days 1-5: Validation Notice Required', desc: 'Collector must send you written notice with required information within 5 days.' },
          { title: 'Days 1-30: Your Validation Window', desc: 'Send a written validation request via certified mail. Collector must stop ALL collection activity.' },
          { title: 'After Validation Request: Ball Is in Their Court', desc: 'Collector must provide verification before resuming ANY collection. If they can\'t validate, they must stop.' },
          { title: 'If They Continue Without Validating', desc: 'Each collection attempt without providing requested validation is a separate FDCPA violation.' }
        ]}
      },
      {
        type: 'scenario',
        title: 'Scenario: The Cease and Desist',
        story: 'Rosa is being harassed by a collector calling 3-4 times per day about a $1,200 credit card debt. She\'s sent a debt validation request (still within the 30-day window), but the collector keeps calling daily. They haven\'t provided any validation.',
        question: 'What violations are occurring and what should Rosa do?',
        options: [
          { text: 'No violations — collectors can call as often as they want until the debt is paid', correct: false, explanation: 'Multiple FDCPA violations are occurring. Repeated calls to annoy violate §1692d, and continuing collection activity after a validation request violates §1692g.' },
          { text: 'The collector is violating §1692g (continuing collection without providing validation) and §1692d (repeated calls to harass). Rosa should send a cease and desist letter, file a CFPB complaint, and consult an attorney', correct: true, explanation: 'Correct! Two types of violations: 1) §1692g violation — after receiving a validation request within 30 days, the collector must CEASE all collection activity until they provide validation. Each call is a separate violation. 2) §1692d(5) violation — calling 3-4 times daily with intent to annoy or harass. Rosa should: 1) Send a written cease and desist via certified mail, 2) Document every call with date/time, 3) File a CFPB complaint, 4) Contact an FDCPA attorney. With multiple daily violations, statutory damages could be significant.' },
          { text: 'Rosa should just pay the debt to make the calls stop', correct: false, explanation: 'Rosa has no obligation to pay an unvalidated debt. The collector is breaking the law by continuing to collect without providing validation.' },
          { text: 'Rosa needs to call the police', correct: false, explanation: 'While extreme harassment could warrant police involvement, the more effective route is FDCPA enforcement through CFPB complaints and attorney action.' }
        ]
      },
      {
        type: 'scenario',
        title: 'Scenario: The Fake Threat',
        story: 'A collector leaves a voicemail for Deshawn saying: "This is Officer Martinez from the Financial Crimes Unit. You have an outstanding warrant for failure to pay a debt of $2,800. You must call us back immediately or face arrest and prosecution."',
        question: 'How many FDCPA violations are in this single voicemail?',
        options: [
          { text: 'One — they used a fake title', correct: false, explanation: 'Multiple violations are packed into this one message.' },
          { text: 'None — if the debt is real, they can say whatever they need to', correct: false, explanation: 'The FDCPA specifically prohibits many of the tactics used in this voicemail, regardless of whether the debt is real.' },
          { text: 'At least five: impersonating a government official, using a false name/title, falsely claiming criminal liability, threatening arrest, and implying debt is a crime', correct: true, explanation: 'Correct! This voicemail contains: 1) §1692e(1) — falsely implying affiliation with government ("Financial Crimes Unit"), 2) §1692e(14) — using a false name or title ("Officer Martinez"), 3) §1692e(4) — threatening action that cannot legally be taken (arrest for a civil debt), 4) §1692e(7) — falsely representing the debt as criminal, 5) §1692e(5) — threatening to take action not intended to be taken. In some states, impersonating a law enforcement officer is also a criminal offense. Deshawn should save this voicemail, report it to the FTC and CFPB, file a police report, and contact an FDCPA attorney immediately.' },
          { text: 'Two — the fake name and the arrest threat', correct: false, explanation: 'There are far more violations. Each false representation and illegal threat is a separate violation under different subsections of §1692e.' }
        ]
      },
      {
        type: 'content',
        title: 'FDCPA Damages and Enforcement',
        body: 'The FDCPA provides strong enforcement mechanisms:\n\n<strong>Statutory Damages (§1692k(a)(2)):</strong>\n• Individual action: up to $1,000 per lawsuit (not per violation)\n• Class action: up to $500,000 or 1% of the collector\'s net worth\n\n<strong>Actual Damages (§1692k(a)(1)):</strong>\n• No cap — whatever financial harm you actually suffered\n• Includes: lost wages (from work calls), medical bills (stress-related), credit damage, lost loan opportunities\n\n<strong>Attorney Fees (§1692k(a)(3)):</strong>\n• The losing collector pays YOUR attorney fees\n• This is why many attorneys take FDCPA cases on contingency\n\n<strong>Statute of Limitations:</strong>\n• You must file within 1 year of the violation\n• However, the CFPB has extended this to 2 years in some interpretations for ongoing violations\n\n<strong>Where to File Complaints:</strong>\n• CFPB — consumerfinance.gov (primary federal regulator)\n• FTC — reportfraud.ftc.gov (tracks patterns, may pursue enforcement)\n• Your state\'s Attorney General — many states have additional protections\n• Private attorney — for direct lawsuits',
        visual: { type: 'tip', text: 'Strategy Tip: Many FDCPA cases settle for $3,000-$10,000+ before trial because collectors don\'t want the expense of litigation or the risk of a public judgment. If you have documented violations, an attorney consultation (usually free for FDCPA cases) is always worth pursuing.' }
      },
      {
        type: 'content',
        title: 'Key Takeaways',
        body: '<strong>FDCPA Power Checklist:</strong>\n\n• The FDCPA applies to third-party collectors only — not original creditors\n• Request debt validation IN WRITING within 30 days for maximum protection\n• Send a cease and desist letter to stop all collector contact (they can still sue, but can\'t call/write)\n• Collectors cannot call before 8am or after 9pm, at your workplace if told to stop, or contact known third parties\n• False threats (arrest, lawsuits they won\'t file, impersonating officials) are violations worth up to $1,000\n• Document EVERYTHING: dates, times, names, what was said, voicemails, letters\n• Statute of limitations for FDCPA lawsuits is 1 year from the violation\n• Attorneys take FDCPA cases on contingency because violators pay attorney fees\n• File complaints with CFPB AND your state Attorney General for maximum pressure\n• Recording calls is legal in many states (one-party consent states) — check your state law',
        visual: { type: 'tip', text: 'Pro Tip: Create a "Collector Contact Log." Every time a collector calls, note: date, time, phone number, collector name, company name, what was said, and how long the call lasted. This log becomes critical evidence in any FDCPA lawsuit. Many attorneys say a good contact log is worth more than any other piece of evidence.' }
      }
    ]
  },
  {
    id: 'cfpb-weapon',
    title: 'CFPB as a Weapon',
    subtitle: 'Using regulatory complaints effectively',
    icon: '🏛️',
    xp: 150,
    tier: 'intermediate',
    sections: [
      {
        type: 'content',
        title: 'What Is the CFPB?',
        body: 'The <strong>Consumer Financial Protection Bureau (CFPB)</strong> is a federal agency created in 2010 by the Dodd-Frank Act to protect consumers in the financial sector. It supervises banks, credit unions, payday lenders, mortgage companies, debt collectors, and credit bureaus.\n\n<strong>Why the CFPB Matters for Credit Repair:</strong>\n\nThe CFPB is the single most effective complaint channel for credit disputes because:\n\n1. <strong>Companies MUST respond.</strong> The CFPB tracks response rates. Companies that ignore complaints face regulatory scrutiny. The current response rate is 97%+.\n\n2. <strong>Faster than traditional disputes.</strong> Companies typically respond to CFPB complaints within 15 days (vs. 30 days for bureau disputes).\n\n3. <strong>Regulatory pressure.</strong> The CFPB can investigate, fine, and take enforcement action against companies with patterns of violations.\n\n4. <strong>Public record.</strong> CFPB complaints are published in a searchable database. Companies care about their public complaint record.\n\n5. <strong>Executive-level attention.</strong> CFPB complaints often get routed to a company\'s executive or compliance team, not a frontline worker.',
        visual: { type: 'cards', items: [
          { title: 'Credit Reporting', desc: 'The #1 complaint category at the CFPB. Covers inaccurate information, dispute results, and bureau practices.', icon: '📊' },
          { title: 'Debt Collection', desc: '#2 complaint category. Covers harassment, validation failures, false threats, and improper practices.', icon: '📞' },
          { title: 'Credit Cards', desc: 'Covers billing disputes, unauthorized charges, fee disputes, and promotional rate issues.', icon: '💳' },
          { title: 'Mortgages', desc: 'Covers servicing issues, payment application errors, foreclosure, and escrow disputes.', icon: '🏠' }
        ]}
      },
      {
        type: 'content',
        title: 'How to File an Effective CFPB Complaint',
        body: 'Filing a CFPB complaint at consumerfinance.gov is free and takes about 15-20 minutes. Here\'s how to make it effective:\n\n<strong>Step 1: Choose the Right Category</strong>\n• Credit reporting → for bureau disputes and furnisher issues\n• Debt collection → for collector behavior violations\n• Pick the specific sub-issue (incorrect information, investigation results, etc.)\n\n<strong>Step 2: Write a Clear Narrative</strong>\nThis is the most important part. Include:\n• Specific dates, account numbers, and amounts\n• What happened in chronological order\n• What laws were violated (FCRA §611, FDCPA §1692g, etc.)\n• What steps you\'ve already taken (prior disputes, certified mail dates)\n• What resolution you want (deletion, correction, investigation)\n\n<strong>Step 3: Attach Supporting Documents</strong>\n• Copies of dispute letters and certified mail receipts\n• Bureau responses ("verified" letters)\n• Bank statements, payment proof, or other evidence\n• Correspondence with the company\n\n<strong>Step 4: Submit and Track</strong>\n• You\'ll receive a tracking number\n• The company has 15 days to respond (60 days in complex cases)\n• You can add follow-up information at any time\n• Review the response and indicate if you\'re satisfied or not',
        visual: { type: 'steps', items: [
          { title: 'Go to consumerfinance.gov/complaint', desc: 'Free, no login required initially. You\'ll create an account to track your complaint.' },
          { title: 'Select Product and Issue', desc: 'Choose "Credit reporting" for bureau issues, "Debt collection" for collector issues.' },
          { title: 'Write Your Narrative', desc: 'Be specific, factual, and chronological. Cite laws. Include dates. State what you want.' },
          { title: 'Attach Documents', desc: 'Upload dispute letters, certified mail receipts, bureau responses, evidence.' },
          { title: 'Submit and Track', desc: 'Company has 15 days to respond. You\'ll be notified and can review their response.' }
        ]}
      },
      {
        type: 'scenario',
        title: 'Scenario: The Bureau That Won\'t Investigate',
        story: 'Nina has disputed the same incorrect collection three times with Experian over 6 months. Each time, Experian sends back a form letter saying the account was "verified as accurate" — but Nina has proof the debt was paid in full 2 years ago. She has the payoff letter from the original creditor and bank statements showing the final payment.',
        question: 'How should Nina\'s CFPB complaint be structured?',
        options: [
          { text: 'Simply write "Experian won\'t fix my report"', correct: false, explanation: 'Vague complaints get vague responses. Nina needs specifics to trigger real investigation.' },
          { text: 'Write a detailed chronological narrative citing three prior disputes with dates, certified mail receipt numbers, attach the payoff letter and bank statements, cite §611(a)(5)(A) requiring deletion of unverifiable items, and request the account be deleted', correct: true, explanation: 'Correct! An effective CFPB complaint includes: 1) "I have disputed this account three times: [date 1, certified mail #], [date 2, #], [date 3, #]", 2) "Each time Experian responded with a form letter verifying the account without a meaningful investigation," 3) "Attached: payoff letter from [Original Creditor] dated [X], bank statement showing final payment of $X on [date]," 4) "Experian has violated FCRA §611(a)(2) by failing to forward my evidence, and §611(a)(1)(A) by failing to conduct a reasonable reinvestigation," 5) "I request deletion of this account under §611(a)(5)(A) as it cannot be accurately verified." This level of detail gets executive attention.' },
          { text: 'Threaten to sue Experian in the complaint', correct: false, explanation: 'Legal threats in a CFPB complaint aren\'t necessary and can be counterproductive. Let the facts and law speak for themselves.' },
          { text: 'File the complaint against the collection agency instead of Experian', correct: false, explanation: 'Nina should file against Experian since they\'re the ones failing to investigate properly. She could file a separate complaint against the collection agency for continued inaccurate reporting.' }
        ]
      },
      {
        type: 'scenario',
        title: 'Scenario: The Company Response',
        story: 'After filing a CFPB complaint about a $6,000 collection that wasn\'t hers, Keisha receives a response from the collection agency through the CFPB portal. The response says: "We have reviewed the account and confirmed the debt is valid. No changes will be made." They provided no supporting documentation.',
        question: 'What should Keisha do next?',
        options: [
          { text: 'Accept the response — the company has the final say', correct: false, explanation: 'The company\'s response through the CFPB portal is NOT the final say. Keisha has options.' },
          { text: 'Mark the response as "Not satisfied," add a rebuttal explaining the inadequate response with no evidence, file a second CFPB complaint with more detail, and consult an FDCPA/FCRA attorney', correct: true, explanation: 'Correct! Keisha should: 1) Mark "Not satisfied" in the CFPB portal — this flag is tracked and impacts the company\'s complaint resolution statistics, 2) Write a detailed rebuttal noting the company provided no documentation, 3) File a follow-up complaint emphasizing the pattern, 4) Consult an attorney — the company\'s refusal to validate the debt while continuing to report it may violate both the FDCPA (§1692g) and FCRA (§623). Companies that brush off CFPB complaints are more vulnerable in litigation because the CFPB record shows they were warned.' },
          { text: 'File a police report', correct: false, explanation: 'A police report may be relevant if identity theft is involved, but the next best step is escalation through CFPB and legal channels.' },
          { text: 'Delete her CFPB account and start over', correct: false, explanation: 'Don\'t delete the complaint — the history of complaints and responses becomes valuable evidence in any future legal action.' }
        ]
      },
      {
        type: 'content',
        title: 'CFPB Complaint Strategy — Advanced Tactics',
        body: '<strong>Timing Your Complaints:</strong>\n• File CFPB complaints AFTER at least one traditional dispute round. This shows you tried to resolve it directly.\n• Include prior dispute history in your complaint — this demonstrates a pattern.\n\n<strong>Filing Against Multiple Parties:</strong>\n• You can file separate complaints against: the credit bureau (for failure to investigate), the furnisher/collector (for reporting inaccurately), and the original creditor (for failing to correct after notification).\n• Multiple complaints create more pressure and a stronger paper trail.\n\n<strong>Using CFPB Data:</strong>\n• The CFPB\'s complaint database (consumerfinance.gov/data-research/consumer-complaints/) is publicly searchable\n• Search for the company you\'re dealing with to see common complaint patterns\n• If many others have similar complaints, it strengthens your case\n\n<strong>CFPB + Legal Action Combo:</strong>\n• File a CFPB complaint first, then consult an attorney\n• The company\'s CFPB response (or lack thereof) becomes evidence\n• Attorneys love clients who have documented CFPB complaints — it shows the company was on notice',
        visual: { type: 'tip', text: 'Power Move: When a company gives an inadequate CFPB response, screenshot it and include it in your attorney consultation. Many FCRA attorneys say a company\'s dismissive CFPB response is some of the best evidence of willful violation — it proves the company was aware of the issue and chose not to fix it.' }
      },
      {
        type: 'scenario',
        title: 'Scenario: The Multi-Front Attack',
        story: 'Andre has a $4,200 collection on his report that he already paid in full. He has: the payoff receipt, a bank statement, and the collector\'s letter confirming $0 balance. Despite this, the collection still shows as "unpaid" on all three bureau reports after two disputes.',
        question: 'What is the most effective multi-front strategy?',
        options: [
          { text: 'Keep disputing with the bureaus until they get it right', correct: false, explanation: 'Repeating the same approach that failed twice is unlikely to produce different results. Escalation is needed.' },
          { text: 'File three CFPB complaints (one per bureau), one CFPB complaint against the collection agency, send §623 direct dispute letters to the collector, and consult an FCRA attorney', correct: true, explanation: 'Correct! The multi-front attack: 1) Three CFPB complaints against TransUnion, Experian, and Equifax — each failed to correct after disputes with proof, 2) One CFPB complaint against the collection agency for continuing to report a paid debt as unpaid, 3) §623 direct dispute letter to the collector with copies of payoff receipt and bank statement, 4) Attorney consultation — with documented paid debt, prior disputes, and ongoing inaccurate reporting, this is a strong FCRA/FDCPA case. The combined pressure from 4+ regulatory complaints plus the threat of litigation usually produces results within 2-4 weeks.' },
          { text: 'Pay the $4,200 again to get a new receipt', correct: false, explanation: 'Andre already paid. He should never pay the same debt twice. The issue is inaccurate reporting, not an unpaid debt.' },
          { text: 'Wait for it to fall off in 7 years', correct: false, explanation: 'When you have proof of payment and clear law on your side, waiting 7 years is unnecessary and allows continued damage to your credit.' }
        ]
      },
      {
        type: 'content',
        title: 'Key Takeaways',
        body: '<strong>CFPB Strategy Mastery:</strong>\n\n• The CFPB is the most effective complaint channel for credit disputes — 97% company response rate\n• File AFTER at least one traditional dispute round to show you tried\n• Write specific, chronological narratives citing exact dates, amounts, and laws\n• Attach ALL supporting documentation — dispute letters, certified mail receipts, evidence\n• Mark responses "Not satisfied" if they\'re inadequate — this impacts the company\'s stats\n• File separate complaints against each party: bureau + furnisher + collector\n• Companies respond faster to CFPB complaints (15 days) than traditional disputes (30 days)\n• CFPB complaint history becomes powerful evidence for attorney consultations\n• Use the CFPB database to research complaint patterns against specific companies\n• The CFPB + attorney consultation combo is the most powerful escalation available to consumers',
        visual: { type: 'tip', text: 'Pro Tip: When you file a CFPB complaint, you can choose whether to make your narrative public (with personal info removed) or keep it private. Making it public puts additional reputational pressure on the company and helps other consumers with similar issues.' }
      }
    ]
  },
  {
    id: 'debt-negotiation',
    title: 'Debt Negotiation Tactics',
    subtitle: 'Pay-for-delete, settlements & scripts',
    icon: '🤝',
    xp: 150,
    tier: 'intermediate',
    sections: [
      {
        type: 'content',
        title: 'Understanding Your Negotiation Power',
        body: 'Before negotiating any debt, understand the leverage you have:\n\n<strong>Why Creditors and Collectors Negotiate:</strong>\n\n1. <strong>Debt buyers purchase debt for pennies.</strong> Collection agencies typically buy debt portfolios for 4-10 cents on the dollar. A $5,000 debt may have been purchased for $200-$500. They profit on ANYTHING above their purchase price.\n\n2. <strong>The debt ages out.</strong> Collectors know the FCRA 7-year clock is ticking. As the debt gets older, their leverage decreases and the likelihood of collection drops.\n\n3. <strong>Litigation is expensive.</strong> Suing you costs $1,000-$5,000+ in attorney fees and court costs. For smaller debts, it\'s not worth it.\n\n4. <strong>Something is better than nothing.</strong> Creditors would rather collect 40-60% now than risk getting 0% if you file bankruptcy or simply wait out the statute of limitations.\n\n<strong>Your Leverage Points:</strong>\n• You can offer a lump sum (immediate cash is attractive)\n• You can dispute the debt (costing them time and resources)\n• You can file regulatory complaints (costing them reputation)\n• You can wait out the clock (FCRA 7-year limit, SOL for lawsuits)',
        visual: { type: 'cards', items: [
          { title: 'Debt Age', desc: 'Older debts have less leverage for collectors. After 3-4 years, settlement offers drop significantly.', icon: '📅' },
          { title: 'Debt Amount', desc: 'Smaller debts (<$1,000) are rarely worth suing over. Collectors are more flexible.', icon: '💰' },
          { title: 'Your Cash', desc: 'Having cash ready for a lump sum gives you maximum negotiating power.', icon: '💵' },
          { title: 'Documentation', desc: 'If the collector can\'t validate the debt properly, they have zero leverage.', icon: '📋' }
        ]}
      },
      {
        type: 'content',
        title: 'Pay-for-Delete (PFD) Explained',
        body: '<strong>What Is Pay-for-Delete?</strong>\nA pay-for-delete agreement is when you offer to pay a collection account (in full or settled amount) in exchange for the collector REMOVING the account from your credit reports entirely — not just marking it as "paid."\n\n<strong>Why It Matters:</strong>\n• A "paid collection" still damages your score (especially under FICO 8)\n• A deleted collection is as if it never existed\n• FICO 9 and VantageScore 3.0 ignore paid collections, but most lenders still use FICO 8\n\n<strong>Important Reality Check:</strong>\n• PFD is NOT required by law — it\'s a voluntary agreement\n• Large creditors (Chase, Amex, etc.) rarely agree to PFD\n• Collection agencies are MORE likely to agree, especially debt buyers\n• Get the PFD agreement IN WRITING before sending any payment\n• Some collectors verbally agree but don\'t follow through — written agreement is essential\n\n<strong>The Process:</strong>\n1. Send a written PFD offer letter via certified mail\n2. State the amount you\'re willing to pay\n3. Specify the condition: payment in exchange for complete deletion from all three bureaus\n4. Wait for their written agreement before paying\n5. Pay via cashier\'s check or money order (not personal check or debit card)\n6. Verify deletion on all three reports within 30-45 days\n7. If not deleted, follow up with copies of the agreement',
        visual: { type: 'steps', items: [
          { title: 'Send PFD Letter', desc: 'Written offer via certified mail. State your payment amount and the deletion condition.' },
          { title: 'Wait for Written Agreement', desc: 'Do NOT pay until you have their written acceptance of the pay-for-delete terms.' },
          { title: 'Pay Securely', desc: 'Use cashier\'s check or money order. Keep copies of everything.' },
          { title: 'Verify Deletion', desc: 'Check all three credit reports 30-45 days after payment. Dispute if not removed.' },
          { title: 'Escalate if Needed', desc: 'If they don\'t honor the agreement, file CFPB complaint with copies of the PFD agreement.' }
        ]}
      },
      {
        type: 'scenario',
        title: 'Scenario: The Settlement Offer',
        story: 'Marcus has a $3,200 collection from a debt buyer called National Recoveries. The original debt was a credit card from 2021. He has $1,500 in savings. The collection is 3 years old. Marcus calls National Recoveries and they immediately offer a 50% settlement ($1,600) to "resolve the account."',
        question: 'Should Marcus accept the 50% offer?',
        options: [
          { text: 'Yes — 50% is a great deal, pay it right away', correct: false, explanation: '50% is a decent starting offer, but as a 3-year-old debt purchased by a debt buyer, there\'s room to negotiate lower. Also, paying without a deletion agreement means the collection stays on his report as "settled" which still hurts his score.' },
          { text: 'No — Marcus should counter with a lower amount AND require pay-for-delete in writing before sending any payment', correct: true, explanation: 'Correct! Marcus has leverage: 1) The debt is 3 years old and aging, 2) National Recoveries likely bought it for $160-$320 (5-10 cents per dollar), 3) A 3-year-old debt buyer collection suggests they\'ve already tried to collect and failed. Marcus should counter with 25-30% ($800-$960) AND require written pay-for-delete agreement. His script: "I can offer $900 as a lump sum settlement, paid within 7 days, on the condition that you provide written confirmation that the account will be deleted from all three credit bureau reports upon receipt of payment." If they say no, he can negotiate up slightly — but never pay without the deletion agreement.' },
          { text: 'Marcus should ignore them and wait for the debt to expire', correct: false, explanation: 'While waiting is a valid strategy, the collection will continue damaging his credit for 4 more years. If he can settle for a reasonable amount with deletion, it\'s worth considering.' },
          { text: 'He should pay the full $3,200 to show good faith', correct: false, explanation: 'Paying the full amount on a debt purchased for pennies is unnecessary. Debt buyers profit on anything above their purchase price. There\'s no "good faith" benefit in overpaying.' }
        ]
      },
      {
        type: 'content',
        title: 'Negotiation Scripts That Work',
        body: '<strong>Script 1: Initial PFD Letter (Mail)</strong>\n\n"Dear [Collection Agency],\n\nRe: Account #[XXXX]\n\nI am writing regarding the above-referenced account with a reported balance of $[amount]. Without admitting to the validity of this debt, I am prepared to offer a settlement of $[offer amount] as payment in full, contingent upon the following condition:\n\nUpon receipt and clearance of my payment, [Collection Agency] agrees to request deletion of all references to this account from my credit files at Equifax, Experian, and TransUnion within 30 calendar days.\n\nPlease respond in writing to confirm acceptance of these terms. Upon receipt of your written agreement, I will submit payment within 7 business days via certified funds.\n\nSincerely, [Your Name]"\n\n<strong>Script 2: Phone Negotiation</strong>\n"I\'m calling about account #[XXXX]. I\'d like to resolve this today. I can offer $[amount] as a lump sum, paid within 48 hours, if you can agree to delete the account from all three credit reports. Can you put that in writing for me?"\n\n<strong>Key Phrases:</strong>\n• "Without admitting to the validity of this debt" — protects you legally\n• "Contingent upon deletion" — makes payment conditional\n• "Certified funds" — shows you\'re serious and have the money ready\n• "Written agreement" — never trust verbal promises',
        visual: { type: 'tip', text: 'Negotiation Timing Tip: The best time to negotiate is at the end of the month or end of the quarter. Collection agents have quotas and are more likely to accept lower offers to hit their numbers. Also, debts over 2 years old are significantly easier to settle for less — collectors know their collection probability drops each year.' }
      },
      {
        type: 'scenario',
        title: 'Scenario: The Validation-First Strategy',
        story: 'Tanya has a $1,800 medical collection on her report. She\'s not sure if the amount is correct because the original medical bill was complicated with insurance adjustments. She wants to settle, but she also wants to make sure she\'s not paying more than she actually owes.',
        question: 'What should Tanya do before negotiating a settlement?',
        options: [
          { text: 'Just pay whatever they\'re asking — medical debt is always accurate', correct: false, explanation: 'Medical billing errors are extremely common. Up to 80% of medical bills contain errors according to some estimates. Tanya should verify before paying anything.' },
          { text: 'Send a debt validation request first under FDCPA §1692g. If the collector can\'t provide proper documentation showing the correct amount after insurance, Tanya has strong grounds for deletion or a significantly reduced settlement', correct: true, explanation: 'Correct! The validation-first strategy: 1) Send a debt validation request within 30 days of first contact (§1692g), 2) The collector must provide documentation proving the debt amount is correct, 3) Medical debts are notoriously poorly documented during the collection process — insurance adjustments, write-offs, and billing errors frequently get lost in transfers, 4) If they can\'t validate properly, demand deletion, 5) If they DO validate, compare against your insurance EOBs and original bills, 6) Only THEN negotiate, armed with knowledge of the true amount owed. Many medical collections are reduced or deleted entirely through the validation process because collectors can\'t produce proper documentation.' },
          { text: 'Call the original hospital and pay them directly', correct: false, explanation: 'Once the debt has been sold to a collector, the hospital may no longer accept payment. Even if they do, the collection may remain on the credit report. Tanya needs to deal with the collector and get deletion.' },
          { text: 'Ignore it — medical debt doesn\'t affect credit anymore', correct: false, explanation: 'While recent changes removed SOME medical debt from credit reports (paid medical collections and those under $500), unpaid medical collections over $500 that are 12+ months old still appear and affect your score.' }
        ]
      },
      {
        type: 'content',
        title: 'Settlement Percentages by Debt Type',
        body: '<strong>Typical Settlement Ranges (approximate):</strong>\n\n<strong>Credit Card Debt:</strong>\n• Original creditor: 40-60% of balance\n• Debt buyer (1-2 years old): 25-40%\n• Debt buyer (3+ years old): 15-30%\n\n<strong>Medical Debt:</strong>\n• Hospital/provider directly: 30-50% (many have financial hardship programs)\n• Collection agency: 20-40%\n• Debt buyer: 15-30%\n\n<strong>Personal Loans:</strong>\n• Original lender: 50-70%\n• Collection agency: 30-50%\n\n<strong>Auto Deficiency (after repossession):</strong>\n• Original lender: 40-60%\n• Collection agency: 25-45%\n\n<strong>Factors That Lower Settlement Amounts:</strong>\n• Age of the debt (older = cheaper)\n• Your financial hardship (documented unemployment, medical issues)\n• Approaching the statute of limitations\n• Multiple debts with the same collector (bundle deal)\n• Lump sum vs. payment plan (lump sum gets better terms)\n• End of month/quarter timing',
        visual: { type: 'tip', text: 'Warning: Any forgiven debt over $600 may be reported to the IRS as taxable income on Form 1099-C. If you settle a $5,000 debt for $2,000, the forgiven $3,000 could be taxable. Exceptions exist for insolvency (your debts exceed your assets) — consult a tax professional if you settle large amounts.' }
      },
      {
        type: 'content',
        title: 'Key Takeaways',
        body: '<strong>Debt Negotiation Mastery:</strong>\n\n• Always request debt validation BEFORE negotiating — verify the amount and that the collector has the right to collect\n• Pay-for-delete should be your standard condition — never settle without requiring deletion\n• Get EVERYTHING in writing before sending payment\n• Start low — offer 20-30% and negotiate up from there\n• Debt buyers paid 4-10 cents per dollar — they profit on anything above that\n• Lump sum offers always get better terms than payment plans\n• Use cashier\'s checks or money orders — never give collectors access to your bank account\n• Time your offers strategically — end of month and end of quarter are best\n• "Without admitting to the validity of this debt" should be in every communication\n• Keep copies of all agreements and payment confirmation\n• Verify deletion on all three reports within 30-45 days after payment\n• Forgiven debt over $600 may be taxable — plan accordingly',
        visual: { type: 'tip', text: 'Golden Rule: Never pay a collection without a written pay-for-delete agreement. A "paid collection" on your credit report still damages your score under FICO 8 (the most commonly used model). The only payment that helps your score is one that results in complete deletion.' }
      }
    ]
  },
  {
    id: 'medical-debt-rules',
    title: 'Medical Debt Special Rules',
    subtitle: 'HIPAA disputes & new protections',
    icon: '🏥',
    xp: 150,
    tier: 'intermediate',
    sections: [
      {
        type: 'content',
        title: 'Medical Debt — A Different Beast',
        body: 'Medical debt has its own special rules that are different from other types of debt. Recent changes have dramatically improved protections for consumers with medical collections.\n\n<strong>Key Differences from Other Debt:</strong>\n\n1. <strong>You rarely choose medical debt.</strong> Unlike credit card debt, medical expenses are often unexpected and not within your control.\n\n2. <strong>Billing is incredibly complex.</strong> Insurance adjustments, co-pays, deductibles, out-of-network charges, and billing errors make medical debt uniquely confusing.\n\n3. <strong>HIPAA creates special protections.</strong> Your medical information is protected health information (PHI), and collectors have limited rights to discuss it.\n\n4. <strong>Recent law changes favor consumers.</strong> Major changes in 2023 and beyond have reduced the impact of medical debt on credit reports.\n\n5. <strong>Many hospitals have charity care programs.</strong> Nonprofit hospitals are legally required to have financial assistance policies.',
        visual: { type: 'cards', items: [
          { title: '2023 Bureau Changes', desc: 'All three bureaus removed paid medical collections. Collections under $500 are no longer reported.', icon: '📰' },
          { title: 'No Surprises Act', desc: 'Protects against surprise out-of-network billing for emergency care and certain other situations.', icon: '🛡️' },
          { title: 'HIPAA Protections', desc: 'Limits what medical information collectors can access and discuss. Creates dispute leverage.', icon: '🔒' },
          { title: 'Charity Care', desc: 'Nonprofit hospitals must offer financial assistance. Many will reduce or eliminate bills based on income.', icon: '💛' }
        ]}
      },
      {
        type: 'content',
        title: 'Current Medical Debt Credit Reporting Rules',
        body: '<strong>As of 2023, all three bureaus implemented major changes:</strong>\n\n<strong>1. Paid Medical Collections Are Removed</strong>\nOnce a medical collection is paid, it must be removed from your credit report. This is a bureau policy change (not a law), but it\'s enforced across all three.\n\n<strong>2. Collections Under $500 Are Not Reported</strong>\nMedical collections with a balance under $500 are no longer included on credit reports, regardless of payment status.\n\n<strong>3. 12-Month Grace Period</strong>\nNew medical debt cannot appear on your credit report until at least 12 months after the original billing date. This gives you time to resolve insurance disputes and negotiate with providers.\n\n<strong>4. FICO 9 Treats Medical Debt Differently</strong>\nFICO 9 weighs medical collections less heavily than other collections. VantageScore 4.0 also reduces the impact of medical debt.\n\n<strong>What This Means for You:</strong>\n• If you have a paid medical collection on your report — dispute it. It should be removed.\n• If your medical collection is under $500 — dispute it. It shouldn\'t be there.\n• If your medical collection is less than 12 months old — dispute it. It was reported too early.\n• These rules apply to ALL medical collections, not just new ones.',
        visual: { type: 'tip', text: 'Action Item: Right now, check all three of your credit reports for medical collections. If ANY are paid, under $500, or less than 12 months from the original billing date, dispute them immediately. The bureaus are required to remove them under their own policies.' }
      },
      {
        type: 'scenario',
        title: 'Scenario: The Surprise Medical Bill',
        story: 'Angela went to the ER for chest pains. Her in-network hospital treated her, but the anesthesiologist who was called in was out-of-network. Two months later, Angela received a $4,200 bill from the anesthesiologist\'s practice. Her insurance paid the in-network portion, but the out-of-network provider is demanding the remaining $3,100 from Angela.',
        question: 'Does Angela have protection under the No Surprises Act?',
        options: [
          { text: 'No — Angela chose to go to that hospital', correct: false, explanation: 'The No Surprises Act specifically covers emergency services AND situations where an out-of-network provider treats you at an in-network facility without your consent.' },
          { text: 'Yes — the No Surprises Act protects patients from out-of-network billing when they receive emergency care or are treated by out-of-network providers at in-network facilities without their prior consent', correct: true, explanation: 'Correct! The No Surprises Act (effective January 2022) directly covers Angela\'s situation: 1) She received emergency care — emergency services are always protected regardless of network status, 2) The out-of-network anesthesiologist treated her at an in-network facility without her prior consent, 3) Under the Act, Angela can only be charged the in-network cost-sharing amount (copay, coinsurance, deductible), 4) The out-of-network provider must work with her insurance to resolve the balance — they cannot "balance bill" Angela for the difference. Angela should: File a complaint at cms.gov/nosurprises if the provider continues billing her, and notify her insurance company about the surprise bill.' },
          { text: 'Only if Angela has government insurance (Medicare/Medicaid)', correct: false, explanation: 'The No Surprises Act applies to ALL private health insurance plans, not just government insurance. It covers commercial plans through employers and the marketplace.' },
          { text: 'She should just pay it — fighting medical bills is too hard', correct: false, explanation: 'Angela has strong legal protections here. The No Surprises Act was specifically created for situations like this. Fighting it is straightforward.' }
        ]
      },
      {
        type: 'content',
        title: 'The HIPAA Dispute Strategy',
        body: '<strong>How HIPAA Helps with Medical Debt:</strong>\n\nHIPAA (Health Insurance Portability and Accountability Act) protects your medical information. When a medical provider sends your account to collections, HIPAA limits what information the collector can have.\n\n<strong>What Collectors Can Know:</strong>\n• Your name and contact information\n• The amount owed\n• The name of the medical provider\n• The dates of service\n\n<strong>What Collectors Should NOT Have:</strong>\n• Your medical diagnosis or condition\n• Treatment details\n• Medical records\n• Detailed procedure codes (CPT codes)\n\n<strong>The HIPAA Dispute Approach:</strong>\n1. Request debt validation under FDCPA §1692g\n2. Ask the collector to provide an itemized statement showing all charges\n3. If they provide medical details they shouldn\'t have, this may indicate a HIPAA violation by the provider\n4. Dispute any charges that don\'t match your insurance Explanation of Benefits (EOB)\n5. Contact the original provider\'s billing department for an itemized bill\n6. Compare the collector\'s claims against your EOB and the provider\'s records\n\n<strong>Common Medical Billing Errors:</strong>\n• Duplicate charges for the same service\n• Charges for services not received\n• Insurance payments not applied\n• Wrong procedure codes (upcoding)\n• Charges above the negotiated insurance rate',
        visual: { type: 'tip', text: 'Strategy: Request an itemized bill from the original provider AND the collector. Compare them. Medical billing errors are found in up to 80% of bills according to medical billing advocates. If the amounts don\'t match, you have a strong dispute. If the collector has medical details they shouldn\'t, report the HIPAA violation to HHS.gov/hipaa/filing-a-complaint.' }
      },
      {
        type: 'scenario',
        title: 'Scenario: The Charity Care Discovery',
        story: 'Robert has a $12,000 hospital bill from surgery at a nonprofit hospital. He earns $35,000/year and has no insurance. The bill went to collections after 6 months. Robert didn\'t know the hospital was nonprofit or that financial assistance might be available.',
        question: 'What option does Robert have that could eliminate this debt entirely?',
        options: [
          { text: 'File for bankruptcy — it\'s the only way to eliminate $12,000', correct: false, explanation: 'Bankruptcy is a drastic step. Robert has a much simpler option available through the hospital itself.' },
          { text: 'Apply for the hospital\'s financial assistance (charity care) program — nonprofit hospitals are legally required to offer financial assistance, and at Robert\'s income level, he likely qualifies for significant reduction or complete forgiveness', correct: true, explanation: 'Correct! Under IRS regulations (Section 501(r)), nonprofit hospitals must: 1) Have a written financial assistance policy, 2) Make the policy widely available, 3) Not take extraordinary collection actions before making reasonable efforts to determine FAP eligibility. At $35,000/year income, Robert likely qualifies for significant reduction (50-100% discount) under most hospital FAP policies. Even though the bill went to collections, he can: 1) Contact the hospital\'s financial counseling department, 2) Request a Financial Assistance Application, 3) Provide proof of income, 4) If approved, the hospital must recall the debt from collections and adjust the bill. Many hospitals will retroactively apply charity care to bills already in collections.' },
          { text: 'Negotiate a payment plan with the collector', correct: false, explanation: 'While a payment plan is an option, it doesn\'t address the fact that Robert may qualify for the bill to be reduced or eliminated entirely through the hospital\'s financial assistance program.' },
          { text: 'The hospital is required to forgive all debt for uninsured patients', correct: false, explanation: 'Hospitals aren\'t required to forgive all uninsured debt, but nonprofit hospitals must have financial assistance policies based on income. Robert needs to apply and see what he qualifies for.' }
        ]
      },
      {
        type: 'content',
        title: 'Key Takeaways',
        body: '<strong>Medical Debt Strategy Checklist:</strong>\n\n• Check if your medical collection is: paid (should be removed), under $500 (should not be reported), or under 12 months old (shouldn\'t be on your report yet)\n• Always get an itemized bill from the original provider — compare against your insurance EOB\n• Request debt validation from collectors — medical debts are often poorly documented\n• Check if the hospital is nonprofit — apply for financial assistance (charity care) if you qualify\n• The No Surprises Act protects against balance billing from out-of-network providers at in-network facilities and emergency services\n• HIPAA limits what medical information collectors can access — they should not have your diagnosis or treatment details\n• Medical billing errors are extremely common (up to 80%) — always verify charges\n• Negotiate directly with the provider\'s billing department before dealing with collectors\n• Many providers offer interest-free payment plans if you negotiate before the account goes to collections\n• Paid medical collections must be removed from credit reports under current bureau policies\n• File CFPB complaints for medical debt reporting violations — this is one of the highest complaint categories',
        visual: { type: 'tip', text: 'Pro Tip: If you have any medical procedure coming up, ALWAYS get a written cost estimate and verify network status of ALL providers (not just the facility) before treatment. Ask: "Will any out-of-network providers be involved in my care?" This one question can save you thousands in surprise bills.' }
      }
    ]
  }
];
