export type PortalSettings = {
  theme: {
    backgroundColor?: string | null;
    logoUrl?: string | null;
    taglinePrimary?: string | null;
    taglineSecondary?: string | null;
  };
  modules: Record<string, boolean>;
};

export type PortalSnapshot = {
  totalIssues: number;
  summary: Array<{
    creditor: string;
    severity: number;
    bureaus: string[];
    issues: number;
  }>;
};

export type PortalViolation = {
  id?: string | null;
  code?: string | null;
  category?: string | null;
  title?: string | null;
  detail?: string | null;
  severity?: number | null;
  bureaus?: string[];
  bureau?: string | null;
  source?: string | null;
  evidence?: Record<string, unknown> | null;
  tradelineKey?: string | null;
};

export type PortalHeadline = {
  id?: string | null;
  code?: string | null;
  category?: string | null;
  title?: string | null;
  detail?: string | null;
  severity?: number | null;
  bureaus?: string[];
  text?: string | null;
};

export type PortalNegativeItem = {
  index?: number;
  creditor?: string;
  severity?: number;
  bureaus?: string[];
  balance?: number;
  account_numbers?: Record<string, string>;
  metrics?: {
    violationCount?: number;
    maxSeverity?: number;
  };
  headline?: PortalHeadline | null;
  violations?: Array<PortalViolation | string>;
  bureau_details?: Record<string, Record<string, string>>;
};

export type PortalEvent = {
  id: string;
  type: string;
  at: string;
  actor: string | null;
  title: string | null;
  message: string | null;
  stage: string | null;
  link: string | null;
};

export type PortalDocument = {
  id: string;
  name: string;
  uploadedAt: string | null;
  type: string | null;
  size: number | null;
  url: string | null;
};

export type PortalReminder = {
  id: string;
  due: string | null;
  title: string | null;
  note: string | null;
};

export type PortalInvoice = {
  id: string;
  description: string;
  amount: number;
  amountFormatted: string;
  due: string | null;
  createdAt: string | null;
  paid: boolean;
  paidAt: string | null;
  status: string;
  payLink: string | null;
};

export type PortalMessage = {
  id: string;
  at: string;
  actor: string | null;
  message: string;
};

export type PortalTracker = {
  steps: string[];
  completed: Record<string, boolean>;
};

export type PortalPayload = {
  consumer: {
    id: string;
    name: string;
    status?: string | null;
    email?: string | null;
    phone?: string | null;
    createdAt?: string | null;
  };
  creditScore: Record<string, number | string | null> | null;
  negativeItems: PortalNegativeItem[];
  snapshot: PortalSnapshot;
  portalSettings: PortalSettings;
  timeline: PortalEvent[];
  documents: PortalDocument[];
  reminders: PortalReminder[];
  tracker: PortalTracker;
  invoices: PortalInvoice[];
  messages: PortalMessage[];
};
