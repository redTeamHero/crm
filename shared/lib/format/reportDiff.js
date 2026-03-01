const ALL_BUREAUS = ["TransUnion", "Experian", "Equifax"];

const COMPARE_FIELDS = [
  "account_status",
  "payment_status",
  "balance",
  "past_due",
  "credit_limit",
  "high_credit",
  "date_opened",
  "last_reported",
  "date_last_payment",
  "date_closed",
  "account_type",
  "responsibility",
];

function normalizeAcctNumber(raw) {
  if (!raw) return "";
  let v = String(raw).trim().toUpperCase().replace(/[*]+$/g, "");
  const m = v.match(/^[A-Z]+0{4,}(\d+)$/);
  if (m) return m[1];
  return v;
}

function tradelineFingerprint(tl, idx) {
  const creditor = (tl.meta?.creditor || "").trim().toUpperCase();
  const per = tl.per_bureau || {};
  const accts = new Set();
  for (const b of ALL_BUREAUS) {
    const acct = per[b]?.account_number;
    if (acct) accts.add(normalizeAcctNumber(acct));
  }
  const acctKey = [...accts].sort().join(",");
  if (acctKey) {
    return { creditor, acctKey, key: `${creditor}|${acctKey}` };
  }
  const fallbackParts = [creditor];
  for (const b of ALL_BUREAUS) {
    const d = per[b];
    if (!d) continue;
    if (d.date_opened) fallbackParts.push(d.date_opened);
    if (d.account_type) fallbackParts.push(String(d.account_type).trim().toUpperCase());
    break;
  }
  const fallbackKey = fallbackParts.length > 1 ? fallbackParts.join("|") : `__idx_${idx}`;
  return { creditor, acctKey: "", key: fallbackKey };
}

function buildTradelineMap(tradelines) {
  const map = new Map();
  (tradelines || []).forEach((tl, idx) => {
    const fp = tradelineFingerprint(tl, idx);
    if (!fp.key) return;
    if (!map.has(fp.key)) {
      map.set(fp.key, { tl, idx, fp });
    }
  });
  return map;
}

function diffBureauFields(oldBureau, newBureau, bureau) {
  const changes = [];
  for (const field of COMPARE_FIELDS) {
    const oldVal = oldBureau?.[field] ?? null;
    const newVal = newBureau?.[field] ?? null;
    const oldStr = oldVal === null || oldVal === undefined ? "" : String(oldVal).trim();
    const newStr = newVal === null || newVal === undefined ? "" : String(newVal).trim();
    if (oldStr !== newStr && (oldStr || newStr)) {
      changes.push({ field, bureau, oldValue: oldStr || "(empty)", newValue: newStr || "(empty)" });
    }
  }
  return changes;
}

function summarizeTradeline(tl, idx) {
  const per = tl.per_bureau || {};
  const bureaus = ALL_BUREAUS.filter(b => per[b] && Object.keys(per[b]).length > 0);
  const accountNumbers = {};
  for (const b of bureaus) {
    if (per[b]?.account_number) accountNumbers[b] = per[b].account_number;
  }
  return {
    index: idx,
    creditor: tl.meta?.creditor || "Unknown",
    bureaus,
    accountNumbers,
    violationCount: (tl.violations || []).length,
  };
}

export function diffReports(oldReportData, newReportData) {
  const oldTradelines = oldReportData?.tradelines || [];
  const newTradelines = newReportData?.tradelines || [];

  const oldMap = buildTradelineMap(oldTradelines);
  const newMap = buildTradelineMap(newTradelines);

  const deleted = [];
  const added = [];
  const changed = [];

  for (const [key, oldEntry] of oldMap) {
    if (!newMap.has(key)) {
      const oldPer = oldEntry.tl.per_bureau || {};
      const oldBureaus = ALL_BUREAUS.filter(b => oldPer[b] && Object.keys(oldPer[b]).length > 0);
      deleted.push({
        ...summarizeTradeline(oldEntry.tl, oldEntry.idx),
        removedFromBureaus: oldBureaus,
      });
    } else {
      const newEntry = newMap.get(key);
      const oldPer = oldEntry.tl.per_bureau || {};
      const newPer = newEntry.tl.per_bureau || {};

      const fieldChanges = [];
      const bureausRemoved = [];
      const bureausAdded = [];

      for (const b of ALL_BUREAUS) {
        const hadOld = oldPer[b] && Object.keys(oldPer[b]).length > 0;
        const hasNew = newPer[b] && Object.keys(newPer[b]).length > 0;
        if (hadOld && !hasNew) {
          bureausRemoved.push(b);
        } else if (!hadOld && hasNew) {
          bureausAdded.push(b);
        }
        if (hadOld && hasNew) {
          fieldChanges.push(...diffBureauFields(oldPer[b], newPer[b], b));
        }
      }

      if (fieldChanges.length > 0 || bureausRemoved.length > 0 || bureausAdded.length > 0) {
        changed.push({
          ...summarizeTradeline(newEntry.tl, newEntry.idx),
          fieldChanges,
          bureausRemoved,
          bureausAdded,
          oldViolationCount: (oldEntry.tl.violations || []).length,
          newViolationCount: (newEntry.tl.violations || []).length,
        });
      }
    }
  }

  for (const [key, newEntry] of newMap) {
    if (!oldMap.has(key)) {
      const newPer = newEntry.tl.per_bureau || {};
      const newBureaus = ALL_BUREAUS.filter(b => newPer[b] && Object.keys(newPer[b]).length > 0);
      added.push({
        ...summarizeTradeline(newEntry.tl, newEntry.idx),
        addedOnBureaus: newBureaus,
      });
    }
  }

  deleted.sort((a, b) => (a.creditor || "").localeCompare(b.creditor || ""));
  added.sort((a, b) => (a.creditor || "").localeCompare(b.creditor || ""));
  changed.sort((a, b) => (b.fieldChanges?.length || 0) - (a.fieldChanges?.length || 0));

  return {
    deleted,
    added,
    changed,
    summary: {
      deletedCount: deleted.length,
      addedCount: added.length,
      changedCount: changed.length,
      previousTradelineCount: oldTradelines.length,
      currentTradelineCount: newTradelines.length,
    },
    comparedAt: new Date().toISOString(),
  };
}
