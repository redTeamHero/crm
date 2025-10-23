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
  negativeItems: Array<{
    creditor?: string;
    severity?: number;
    bureaus?: string[];
    violations?: string[];
    balance?: number;
  }>;
  snapshot: PortalSnapshot;
  portalSettings: PortalSettings;
  timeline: PortalEvent[];
  documents: PortalDocument[];
  reminders: PortalReminder[];
  tracker: PortalTracker;
  invoices: PortalInvoice[];
  messages: PortalMessage[];
};
