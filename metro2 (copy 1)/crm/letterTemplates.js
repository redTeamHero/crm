export const LETTER_TEMPLATES = [
  {
    id: 'bankruptcy-misreporting',
    name: 'Bankruptcy Misreporting Letter',
    english: `[Your Name]\n[Address] • [City, State ZIP] • [Phone] • [Email]\n[Date]\n\n[Credit Bureau or Creditor Name]\n[Address] • [City, State ZIP]\n\nRe: Bankruptcy Misreporting – Account #[Account Number]\n\nTo Whom It May Concern:\n\nI obtained a bankruptcy discharge on [Discharge Date], yet this account still shows an outstanding balance. Under the Fair Credit Reporting Act (15 U.S.C. §1681), reporting a discharged debt as active is inaccurate and misleading. Please update the tradeline to reflect the discharge and a zero balance, or delete the entry within 30 days.\n\nI’ve enclosed a copy of the discharge for verification. Please send me written confirmation of the correction.\n\nThank you for your prompt attention.\n\nSincerely,\n[Your Name]`
  },
  {
    id: 'obsolete-debt',
    name: 'Obsolete Debt Letter',
    english: `[Your Name]\n[Address] • [City, State ZIP] • [Phone] • [Email]\n[Date]\n\n[Credit Bureau Name]\n[Address] • [City, State ZIP]\n\nRe: Obsolete Debt – Account #[Account Number]\n\nTo Whom It May Concern:\n\nYour report lists the above account, which first became delinquent in [Month, Year]. Because more than seven years have passed, this debt is obsolete under the FCRA (15 U.S.C. §1681c). Please remove the entry and send written confirmation.\n\nRegards,\n[Your Name]`
  },
  {
    id: 'second-round-dispute',
    name: 'Second Round Dispute (Escalation)',
    english: `[Your Name]\n[Address] • [City, State ZIP] • [Phone] • [Email]\n[Date]\n\n[Credit Bureau Name]\n[Address] • [City, State ZIP]\n\nRe: Second Dispute – Account #[Account Number]\n\nDear [Bureau],\n\nI previously disputed this account on [Date]. Your response repeated the same information without a proper reinvestigation, violating 15 U.S.C. §1681i. Please conduct a thorough investigation, provide the method of verification, and correct or delete the item within 15 days.\n\nPlease respond in writing.\n\nSincerely,\n[Your Name]`
  },
  {
    id: 'ag-cfpb-escalation',
    name: 'Attorney General / CFPB Escalation Draft',
    english: `[Your Name]\n[Address] • [City, State ZIP] • [Phone] • [Email]\n[Date]\n\n[Credit Bureau or Creditor Name]\n[Address] • [City, State ZIP]\n\nRe: Final Notice Before Regulatory Complaint – Account #[Account Number]\n\nTo Whom It May Concern:\n\nDespite prior disputes dated [Dates], the inaccurate reporting of the above account persists. Under FCRA and FDCPA provisions, you must ensure accuracy and furnish proper verification. If I do not receive a satisfactory response within 15 days, I will file formal complaints with the Consumer Financial Protection Bureau and my State Attorney General.\n\nI prefer to resolve this matter directly. Please send written confirmation of the correction.\n\nRegards,\n[Your Name]`
  },
  {
    id: '623-direct-dispute',
    name: '623 Direct Dispute Letter (FCRA §623)',
    english: `[Your Name]\n[Address] • [City, State ZIP] • [Phone] • [Email]\n[Date]\n\n[Creditor or Debt Collector Name]\n[Address] • [City, State ZIP]\n\nRe: Direct Dispute – Account #[Account Number]\n\nTo Whom It May Concern:\n\nUnder FCRA §623(a)(8), I dispute the accuracy of the above account. The reported [specific inaccuracy] is incorrect. Please investigate, correct, or delete the information, and notify the credit bureaus within 30 days.\n\nEnclosed are copies of supporting documents.\n\nSincerely,\n[Your Name]`
  },
  {
    id: '611-general-dispute',
    name: '611 Dispute Letter (General Inaccuracy Dispute)',
    english: `[Your Name]\n[Address] • [City, State ZIP] • [Phone] • [Email]\n[Date]\n\n[Credit Bureau Name]\n[Address] • [City, State ZIP]\n\nRe: Dispute of Inaccurate Information – Account #[Account Number]\n\nTo Whom It May Concern:\n\nI dispute the accuracy of the above account. The report shows [describe error], which is unverified and misleading. Under FCRA §611, please investigate, correct, or delete this entry within 30 days and send me written confirmation.\n\nThank you,\n[Your Name]`
  },
  {
    id: 'method-of-verification',
    name: 'Method of Verification (MOV) Letter – FCRA §611(a)(7)',
    english: `[Your Name]\n[Address] • [City, State ZIP] • [Phone] • [Email]\n[Date]\n\n[Credit Bureau Name]\n[Address] • [City, State ZIP]\n\nRe: Request for Method of Verification – Account #[Account Number]\n\nDear [Bureau],\n\nYour recent response claims the disputed account was verified. Under FCRA §611(a)(7), please provide the method of verification, including the name and contact information of the entity you relied on. If you cannot supply this within 15 days, delete the entry and send confirmation.\n\nSincerely,\n[Your Name]`
  },
  {
    id: 'reinsertion-dispute',
    name: 'Reinsertion Dispute Letter – FCRA §611(a)(5)(B)',
    english: `[Your Name]\n[Address] • [City, State ZIP] • [Phone] • [Email]\n[Date]\n\n[Credit Bureau Name]\n[Address] • [City, State ZIP]\n\nRe: Unauthorized Reinsertion – Account #[Account Number]\n\nTo Whom It May Concern:\n\nThis account was previously deleted but has reappeared without the required notice. Under FCRA §611(a)(5)(B), you must provide written notice within 5 days of reinsertion. Please delete the entry again and confirm in writing.\n\nRegards,\n[Your Name]`
  },
  {
    id: '609-disclosure',
    name: '609 Letter (Right to Disclosure)',
    english: `[Your Name]\n[Address] • [City, State ZIP] • [Phone] • [Email]\n[Date]\n\n[Credit Bureau Name]\n[Address] • [City, State ZIP]\n\nRe: Request for Disclosure – FCRA §609\n\nTo Whom It May Concern:\n\nUnder FCRA §609(a), I request a complete copy of my credit file, including all information sources and account details, particularly for the following accounts: [List Accounts]. Please provide these disclosures and any documentation used to verify the accounts.\n\nThank you,\n[Your Name]`
  },
  {
    id: 'personal-info-update',
    name: 'Personal Information Update Letter',
    english: `[Your Name]\n[Address] • [City, State ZIP] • [Phone] • [Email]\n[Date]\n\n[Credit Bureau Name]\n[Address] • [City, State ZIP]\n\nRe: Personal Information Update\n\nDear [Bureau],\n\nMy credit report lists incorrect personal information. Please remove/update the following:\n\n• Incorrect Address(es): [List]\n• Misspelled Name(s): [List]\n• Outdated Employer(s): [List]\n\nEnclosed are copies of my government ID and a utility bill verifying correct information. Kindly update your records and send confirmation.\n\nSincerely,\n[Your Name]`
  },
  {
    id: 'debt-validation',
    name: 'Debt Validation Letter (FDCPA §809)',
    english: `[Your Name]\n[Address] • [City, State ZIP] • [Phone] • [Email]\n[Date]\n\n[Debt Collector Name]\n[Address] • [City, State ZIP]\n\nRe: Debt Validation Request – Account #[Account Number]\n\nTo Whom It May Concern:\n\nUnder FDCPA §809, I request validation of the alleged debt. Please provide:\n\n1. Proof that you are authorized to collect.\n2. Full account statements and charge history.\n3. The name and address of the original creditor.\n\nCease collection activity until you provide this information. If you cannot validate, please delete any references to this debt and notify the credit bureaus.\n\nSincerely,\n[Your Name]`
  },
  {
    id: 'cease-and-desist',
    name: 'Cease & Desist Letter (FDCPA §805(c))',
    english: `[Your Name]\n[Address] • [City, State ZIP] • [Phone] • [Email]\n[Date]\n\n[Debt Collector Name]\n[Address] • [City, State ZIP]\n\nRe: Cease and Desist – Account #[Account Number]\n\nTo Whom It May Concern:\n\nUnder FDCPA §805(c), I demand that you cease all telephone calls and collection activities regarding the above account. Any further contact must be in writing. Failure to comply may result in legal action.\n\nPlease confirm receipt.\n\nSincerely,\n[Your Name]`
  },
  {
    id: 'arbitration-election',
    name: 'Arbitration Election Letter',
    english: `[Your Name]\n[Address] • [City, State ZIP] • [Phone] • [Email]\n[Date]\n\n[Creditor or Debt Collector Name]\n[Address] • [City, State ZIP]\n\nRe: Election of Arbitration – Account #[Account Number]\n\nTo Whom It May Concern:\n\nPursuant to the arbitration clause in our agreement, I elect to resolve this matter through binding arbitration with [Arbitration Forum, e.g., AAA or JAMS]. Please provide the necessary instructions or cease collection efforts pending arbitration.\n\nI request all future communications be in writing.\n\nRegards,\n[Your Name]`
  }
];

export default LETTER_TEMPLATES;
