export interface DisputeRec {
  creditor: string;
  bureau: string;
  tradelineIndex: number | null;
  itemIndex: number | null;
  recommendedTemplate: string | null;
  letterTarget: 'bureau' | 'collector';
  urgency: 'high' | 'medium' | 'low' | string;
  resolved: boolean;
  reason: string;
  specificDisputeReason: string | null;
  collectorName?: string;
}

export interface CollectorEntry {
  name: string;
  addr1: string;
  addr2: string;
  city?: string;
  state?: string;
  zip?: string;
  templateId: string;
  tradelineIndex: number | null;
  _originalIndex?: number;
}

export interface TargetGroup {
  creditor: string;
  bureaus: string[];
  templates: string[];
  indices: number[];
}

export interface SelMapEntry {
  tradelineIndex: number;
  bureaus: string[];
  templateId: string | null;
  specificDisputeReason: string | null;
}

export interface LetterTemplate {
  id: string;
  name: string;
}

export interface DisputeData {
  rounds?: DisputeRound[];
  activation?: {
    items?: Array<{ creditor: string; bureaus: string[]; violationCount?: number }>;
    recommendations?: DisputeRec[];
  };
  consumerState?: string;
}

export interface DisputeRound {
  jobId: string;
  round?: number;
  status?: string;
  sentAt?: string;
  followUpDate?: string;
  followUpDays?: number;
  questionnaireCompleted?: boolean;
  items?: DisputeItem[];
  letters?: unknown[];
  selections?: SelMapEntry[];
}

export interface DisputeItem {
  creditor?: string;
  bureau?: string;
  status?: string;
  notes?: string;
  followUpDays?: number;
  followUpDate?: string;
  accountNumber?: string;
  specificDisputeReason?: string;
  tradelineIndex?: number | null;
  letterType?: string;
  evidence?: Array<{ name?: string; originalName?: string; url?: string }>;
  recommendation?: DisputeRec & { alternativeTemplates?: string[] };
}

export interface Consumer { id: string; name?: string; email?: string; [key: string]: unknown; }
export interface ConsumersApiResponse { consumers?: Consumer[]; [key: string]: unknown; }
export interface ReportsApiResponse { reports?: Array<{ id: string; [key: string]: unknown }>; [key: string]: unknown; }
export interface LetterRecord { letterType?: string; creditor?: string; bureau?: string; round?: number; jobId?: string; at?: string; [key: string]: unknown; }
export interface LetterHistoryApiResponse { letters?: LetterRecord[]; summaries?: Array<Record<string, unknown>>; [key: string]: unknown; }
export interface CollectorAddress { _src?: string; name?: string; addr1?: string; addr2?: string; city?: string; state?: string; zip?: string; [key: string]: unknown; }
export interface CollectorAddressLibrary { builtIn?: CollectorAddress[]; custom?: CollectorAddress[]; [key: string]: unknown; }
export interface CollectorAddressesApiResponse { addresses?: CollectorAddress[]; [key: string]: unknown; }
export interface RecommendationApiResponse { recommendations?: DisputeRec[]; error?: string; ok?: boolean; [key: string]: unknown; }
export interface JobStatusEntry { status?: string; error?: string; [key: string]: unknown; }
export interface JobStatusApiResponse { job?: JobStatusEntry; status?: string; error?: string; [key: string]: unknown; }
export interface GeneratedLetter { creditor?: string; creditorName?: string; bureau?: string; index?: number; [key: string]: unknown; }
export interface LettersApiResponse { letters?: GeneratedLetter[]; [key: string]: unknown; }
export interface PortalApiResponse { message?: string; ok?: boolean; error?: string; status?: number; [key: string]: unknown; }
export interface PreflightApiResponse { flagged?: CollectorEntry[]; enriched?: CollectorEntry[]; ok?: boolean; error?: string; [key: string]: unknown; }

export interface LetterPreviewState {
  jobId: string;
  letters: GeneratedLetter[];
  roundNum: number;
  portalSent: boolean;
  portalError: string;
}

export interface NextRoundModalState {
  recs: DisputeRec[];
  resolve: (targets: string[] | null) => void;
}

export interface AddrPreflightModalState {
  flagged: CollectorEntry[];
  enrichedAll: CollectorEntry[];
  consumerId: string;
  resolve: (collectors: CollectorEntry[] | null) => void;
}
