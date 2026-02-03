import type { PortalPayload } from './types';

export const samplePortal: PortalPayload = {
  consumer: {
    id: 'consumer_001',
    name: 'Tiani Berryman',
    email: 'tiani@example.com',
    createdAt: '2024-08-12T10:00:00Z',
  },
  creditScore: {
    Experian: 712,
    Equifax: 705,
    TransUnion: 718,
  },
  negativeItems: [
    {
      index: 1,
      creditor: 'Summit Health',
      severity: 3,
      bureaus: ['Experian', 'Equifax'],
      balance: 1240,
      account_numbers: { primary: '••• 4821' },
      headline: {
        detail: 'Medical collection appears outside the reporting window.',
      },
    },
    {
      index: 2,
      creditor: 'Prime Auto Finance',
      severity: 2,
      bureaus: ['TransUnion'],
      balance: 860,
      account_numbers: { primary: '••• 1934' },
      headline: {
        detail: 'Past-due date reported without a 30-day late payment notice.',
      },
    },
  ],
  snapshot: {
    totalIssues: 2,
    summary: [],
  },
  portalSettings: {
    theme: {},
    modules: {
      messages: true,
      reminders: true,
      documents: true,
      payments: true,
      negativeItems: true,
      ruleDebug: false,
    },
  },
  timeline: [
    {
      id: 'timeline_1',
      type: 'Report uploaded',
      at: '2024-09-12T14:00:00Z',
      actor: 'Advisor',
      title: 'Report uploaded',
      message: 'We received your IdentityIQ report and started the analysis.',
      stage: 'Upload',
      link: null,
    },
    {
      id: 'timeline_2',
      type: 'Findings ready',
      at: '2024-09-14T16:00:00Z',
      actor: 'Advisor',
      title: 'Findings ready',
      message: 'Your dispute strategy is ready for review.',
      stage: 'Review',
      link: null,
    },
  ],
  documents: [
    {
      id: 'doc_1',
      name: 'Driver License',
      uploadedAt: '2024-09-13T12:00:00Z',
      type: 'id',
      size: 234000,
      url: '#',
    },
    {
      id: 'doc_2',
      name: 'Proof of Address',
      uploadedAt: '2024-09-13T12:00:00Z',
      type: 'address',
      size: 310000,
      url: '#',
    },
  ],
  reminders: [
    {
      id: 'reminder_1',
      due: '2024-09-20T10:00:00Z',
      title: 'Confirm your mailing address',
      note: 'We will use this for certified mail.',
    },
  ],
  tracker: {
    steps: ['Report received', 'Findings ready', 'Disputes sent'],
    completed: {
      'Report received': true,
      'Findings ready': true,
      'Disputes sent': false,
    },
  },
  invoices: [
    {
      id: 'invoice_1',
      description: 'Dispute packet delivery',
      amount: 49,
      amountFormatted: '$49.00',
      due: '2024-09-22T10:00:00Z',
      createdAt: '2024-09-12T10:00:00Z',
      paid: false,
      paidAt: null,
      status: 'open',
      payLink: '#',
    },
  ],
  messages: [
    {
      id: 'message_1',
      at: '2024-09-16T09:30:00Z',
      actor: 'Case Manager',
      message: 'Your dispute packet is ready. Review it when you have a moment.',
    },
  ],
};
