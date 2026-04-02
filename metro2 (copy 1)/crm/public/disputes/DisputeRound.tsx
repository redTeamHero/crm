import React, { useState } from 'react';
import type { DisputeRound as DisputeRoundType, DisputeItem, LetterTemplate } from './types.ts';
import { disputeStatusColor, disputeStatusLabel, DISPUTE_STATUS_LABELS } from './utils.ts';

const STATUS_OPTIONS = Object.entries(DISPUTE_STATUS_LABELS).map(([value, { label }]) => ({ value, label }));

interface Props {
  round: DisputeRoundType;
  roundIndex: number;
  templates: LetterTemplate[];
  selectedItems: Set<string>;
  templateOverrides: Record<string, string>;
  isCollapsed: boolean;
  sentTemplates: Set<string>;
  onToggleSelect: (key: string, checked: boolean) => void;
  onSelectAll: (jobId: string, checked: boolean, itemCount: number) => void;
  onToggleCollapse: (jobId: string) => void;
  onStatusChange: (jobId: string, itemIdx: number, item: DisputeItem, newStatus: string) => void;
  onTemplateChange: (key: string, templateId: string) => void;
  onUpdateSentDate: (jobId: string, val: string) => void;
  onUpdateFollowupDays: (jobId: string, val: number) => void;
}

function StatusBadge({ status }: { status: string }) {
  const color = disputeStatusColor(status);
  const label = disputeStatusLabel(status);
  return (
    <span style={{ display: 'inline-block', padding: '2px 8px', borderRadius: 9999, fontSize: 11, fontWeight: 600, background: `${color}22`, color, border: `1px solid ${color}44` }}>
      {label}
    </span>
  );
}

interface ItemRowProps {
  item: DisputeItem;
  itemIdx: number;
  roundJobId: string;
  templates: LetterTemplate[];
  selected: boolean;
  templateOverride: string | undefined;
  sentTemplates: Set<string>;
  onToggleSelect: (key: string, checked: boolean) => void;
  onStatusChange: (newStatus: string) => void;
  onTemplateChange: (templateId: string) => void;
}

function ItemRow({ item, itemIdx, roundJobId, templates, selected, templateOverride, sentTemplates, onToggleSelect, onStatusChange, onTemplateChange }: ItemRowProps) {
  const [expanded, setExpanded] = useState(false);
  const selKey = `${roundJobId}__${itemIdx}`;
  const status = item.status || 'awaiting';
  const statusColor = disputeStatusColor(status);

  const rec = item.recommendation;
  const recTemplates: string[] = rec?.alternativeTemplates || (rec?.recommendedTemplate ? [rec.recommendedTemplate] : []);
  const sentKey = `${item.creditor || ''}__${item.bureau || ''}`;
  const sentBefore = sentTemplates.has(sentKey);

  return (
    <div className="dispute-item-row" style={{ background: selected ? 'rgba(212,168,83,0.1)' : 'rgba(255,255,255,0.03)', borderRadius: 6, marginBottom: 2, transition: 'background 0.15s' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 10px', cursor: 'pointer' }}
        onClick={() => setExpanded(e => !e)}>
        <label style={{ flexShrink: 0 }} onClick={e => e.stopPropagation()}>
          <input type="checkbox" className="dispute-item-check" checked={selected}
            onChange={e => onToggleSelect(selKey, e.target.checked)}
            style={{ accentColor: '#d4a853', width: 14, height: 14, cursor: 'pointer' }} />
        </label>
        <span style={{ flex: '0 0 auto', width: 22, fontSize: 12, color: '#555', userSelect: 'none' }}>{expanded ? '▲' : '▼'}</span>
        <div style={{ flex: 1, minWidth: 0, overflow: 'hidden' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
            <span style={{ fontWeight: 600, color: '#e5e7eb', fontSize: 13 }}>{item.creditor || 'Unknown'}</span>
            {item.bureau && <span style={{ fontSize: 11, color: '#9ca3af', background: 'rgba(255,255,255,0.05)', padding: '1px 6px', borderRadius: 4 }}>{item.bureau}</span>}
            <StatusBadge status={status} />
            {sentBefore && <span style={{ fontSize: 10, color: '#d4a853', background: 'rgba(212,168,83,0.1)', border: '1px solid rgba(212,168,83,0.3)', borderRadius: 4, padding: '1px 5px' }}>Sent</span>}
            {rec && !rec.resolved && <span style={{ fontSize: 10, color: '#60a5fa', background: 'rgba(96,165,250,0.1)', border: '1px solid rgba(96,165,250,0.25)', borderRadius: 4, padding: '1px 5px' }}>Rec</span>}
          </div>
          {item.specificDisputeReason && <div style={{ fontSize: 10, color: '#6b7280', marginTop: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.specificDisputeReason}</div>}
        </div>
        <div style={{ flexShrink: 0 }} onClick={e => e.stopPropagation()}>
          <select value="" onChange={e => { if (e.target.value) { onStatusChange(e.target.value); (e.target as HTMLSelectElement).value = ''; } }}
            style={{ fontSize: 10, padding: '2px 4px', background: '#111', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 5, color: '#aaa', cursor: 'pointer' }}>
            <option value="">Set status…</option>
            {STATUS_OPTIONS.map(({ value, label }) => <option key={value} value={value}>{label}</option>)}
          </select>
        </div>
      </div>

      {expanded && (
        <div style={{ padding: '4px 10px 10px 46px', display: 'flex', flexDirection: 'column', gap: 6 }}>
          {item.accountNumber && <div style={{ fontSize: 11, color: '#6b7280' }}>Account: {item.accountNumber}</div>}
          {item.notes && <div style={{ fontSize: 11, color: '#9ca3af', fontStyle: 'italic' }}>{item.notes}</div>}
          {item.letterType && <div style={{ fontSize: 11, color: '#aaa' }}>Letter type: <span style={{ color: '#d4a853' }}>{item.letterType}</span></div>}

          {rec && !rec.resolved && (
            <div style={{ padding: '6px 10px', background: 'rgba(96,165,250,0.05)', border: '1px solid rgba(96,165,250,0.15)', borderRadius: 6 }}>
              <div style={{ fontSize: 11, fontWeight: 600, color: '#60a5fa', marginBottom: 3 }}>AI Recommendation</div>
              <div style={{ fontSize: 11, color: '#aaa' }}>{rec.reason}</div>
              {rec.specificDisputeReason && <div style={{ fontSize: 11, color: '#888', marginTop: 2 }}>Dispute reason: {rec.specificDisputeReason}</div>}
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 6, flexWrap: 'wrap' }}>
                <span style={{ fontSize: 10, color: '#6b7280' }}>Template:</span>
                {templates.length > 0 ? (
                  <select value={templateOverride || rec.recommendedTemplate || ''} onChange={e => onTemplateChange(e.target.value)}
                    style={{ fontSize: 11, padding: '2px 5px', background: '#111', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 5, color: '#e5e5e5' }}>
                    <option value="">Auto</option>
                    {templates.map(t => (
                      <option key={t.id} value={t.id}
                        style={recTemplates.includes(t.id) ? { background: 'rgba(96,165,250,0.15)' } : undefined}>
                        {t.name}{recTemplates.includes(t.id) ? ' ★' : ''}
                      </option>
                    ))}
                  </select>
                ) : (
                  <span style={{ fontSize: 11, color: '#d4a853' }}>{rec.recommendedTemplate || 'Auto'}</span>
                )}
                <span style={{ fontSize: 10, color: '#888' }}>Target: {rec.letterTarget === 'collector' ? '📬 Collector' : '🏛 Bureaus'}</span>
              </div>
            </div>
          )}

          {item.evidence && item.evidence.length > 0 && (
            <div>
              <div style={{ fontSize: 11, fontWeight: 600, color: '#9ca3af', marginBottom: 3 }}>Evidence</div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                {item.evidence.map((ev, ei) => {
                  const name = ev.originalName || ev.name || `File ${ei + 1}`;
                  return (
                    <a key={ei} href={ev.url || '#'} target="_blank" rel="noreferrer"
                      style={{ fontSize: 10, color: '#60a5fa', background: 'rgba(96,165,250,0.08)', border: '1px solid rgba(96,165,250,0.15)', borderRadius: 4, padding: '2px 6px', textDecoration: 'none' }}>
                      📎 {name}
                    </a>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export function DisputeRound({ round, roundIndex, templates, selectedItems, templateOverrides, isCollapsed, sentTemplates, onToggleSelect, onSelectAll, onToggleCollapse, onStatusChange, onTemplateChange, onUpdateSentDate, onUpdateFollowupDays }: Props) {
  const items = round.items || [];
  const letters = round.letters || [];
  const jobId = round.jobId;
  const [editSentDate, setEditSentDate] = useState(false);
  const [sentDateVal, setSentDateVal] = useState(round.sentAt ? round.sentAt.slice(0, 10) : '');
  const [editFollowup, setEditFollowup] = useState(false);
  const [followupVal, setFollowupVal] = useState(String(round.followUpDays ?? 30));

  const allSelected = items.length > 0 && items.every((_, i) => selectedItems.has(`${jobId}__${i}`));
  const someSelected = items.some((_, i) => selectedItems.has(`${jobId}__${i}`));
  const selectedCount = items.filter((_, i) => selectedItems.has(`${jobId}__${i}`)).length;

  const roundNum = round.round ?? (roundIndex + 1);
  const sentDate = round.sentAt ? new Date(round.sentAt).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' }) : 'Unknown';
  const followUpDate = round.followUpDate ? new Date(round.followUpDate).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' }) : null;

  const isResolved = round.status === 'resolved';
  const hasPendingItems = items.some(it => !it.status || it.status === 'awaiting' || it.status === 'awaiting_response');

  async function saveSentDate() {
    setEditSentDate(false);
    await onUpdateSentDate(jobId, sentDateVal);
  }

  async function saveFollowup() {
    setEditFollowup(false);
    const days = parseInt(followupVal, 10);
    if (!isNaN(days) && days > 0) await onUpdateFollowupDays(jobId, days);
  }

  return (
    <div className="glass card" style={{ marginBottom: 12, border: isResolved ? '1px solid rgba(74,222,128,0.15)' : '1px solid rgba(212,168,83,0.18)', borderRadius: 10, overflow: 'hidden' }}>
      {/* Round header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 14px', cursor: 'pointer', userSelect: 'none', background: isResolved ? 'rgba(74,222,128,0.04)' : 'rgba(212,168,83,0.04)' }}
        onClick={() => onToggleCollapse(jobId)}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <label onClick={e => e.stopPropagation()} style={{ display: 'flex', alignItems: 'center' }}>
            <input type="checkbox" className="dispute-select-all"
              checked={allSelected}
              ref={el => { if (el) el.indeterminate = someSelected && !allSelected; }}
              onChange={e => { e.stopPropagation(); onSelectAll(jobId, e.target.checked, items.length); }}
              style={{ accentColor: '#d4a853', width: 13, height: 13 }} />
          </label>
          <span style={{ fontWeight: 700, color: isResolved ? '#4ade80' : '#d4a853', fontSize: 14 }}>
            {isResolved ? '✅' : `📋`} Round {roundNum}
          </span>
          {selectedCount > 0 && <span style={{ fontSize: 10, color: '#d4a853', background: 'rgba(212,168,83,0.15)', padding: '1px 6px', borderRadius: 9, border: '1px solid rgba(212,168,83,0.3)' }}>{selectedCount} selected</span>}
          {isResolved && <span style={{ fontSize: 10, color: '#4ade80', background: 'rgba(74,222,128,0.1)', padding: '1px 6px', borderRadius: 9, border: '1px solid rgba(74,222,128,0.25)' }}>Resolved</span>}
          {hasPendingItems && !isResolved && <span style={{ fontSize: 10, color: '#d4a853', background: 'rgba(212,168,83,0.08)', padding: '1px 6px', borderRadius: 9, border: '1px solid rgba(212,168,83,0.2)' }}>Pending</span>}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{ fontSize: 11, color: '#6b7280' }}>{items.length} item{items.length !== 1 ? 's' : ''}</span>
          {letters.length > 0 && <span style={{ fontSize: 11, color: '#4ade80' }}>✓ {letters.length} letter{letters.length !== 1 ? 's' : ''}</span>}
          <span style={{ color: '#555', fontSize: 12 }}>{isCollapsed ? '▼' : '▲'}</span>
        </div>
      </div>

      {!isCollapsed && (
        <div style={{ padding: '10px 14px' }}>
          {/* Round meta */}
          <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', marginBottom: 10, alignItems: 'center' }}>
            <div style={{ fontSize: 12, color: '#888', display: 'flex', alignItems: 'center', gap: 6 }}>
              📅 Sent:&nbsp;
              {editSentDate ? (
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                  <input type="date" value={sentDateVal} onChange={e => setSentDateVal(e.target.value)}
                    style={{ fontSize: 11, background: '#111', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 4, color: '#e5e5e5', padding: '2px 6px' }} />
                  <button onClick={saveSentDate} style={{ fontSize: 10, padding: '2px 8px', background: 'rgba(212,168,83,0.15)', border: '1px solid rgba(212,168,83,0.3)', borderRadius: 4, color: '#d4a853', cursor: 'pointer' }}>Save</button>
                  <button onClick={() => setEditSentDate(false)} style={{ fontSize: 10, padding: '2px 6px', background: 'transparent', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 4, color: '#888', cursor: 'pointer' }}>×</button>
                </span>
              ) : (
                <span style={{ color: '#d4a853' }}>{sentDate}&nbsp;
                  <button onClick={() => setEditSentDate(true)} style={{ fontSize: 9, padding: '1px 5px', background: 'transparent', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 3, color: '#555', cursor: 'pointer' }}>edit</button>
                </span>
              )}
            </div>

            <div style={{ fontSize: 12, color: '#888', display: 'flex', alignItems: 'center', gap: 6 }}>
              ⏰ Follow-up:&nbsp;
              {editFollowup ? (
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                  <input type="number" min={1} max={365} value={followupVal} onChange={e => setFollowupVal(e.target.value)}
                    style={{ width: 60, fontSize: 11, background: '#111', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 4, color: '#e5e5e5', padding: '2px 6px' }} />
                  <span style={{ fontSize: 10, color: '#888' }}>days</span>
                  <button onClick={saveFollowup} style={{ fontSize: 10, padding: '2px 8px', background: 'rgba(212,168,83,0.15)', border: '1px solid rgba(212,168,83,0.3)', borderRadius: 4, color: '#d4a853', cursor: 'pointer' }}>Save</button>
                  <button onClick={() => setEditFollowup(false)} style={{ fontSize: 10, padding: '2px 6px', background: 'transparent', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 4, color: '#888', cursor: 'pointer' }}>×</button>
                </span>
              ) : (
                <span>
                  {followUpDate ? <span style={{ color: '#d4a853' }}>{followUpDate}</span> : <span style={{ color: '#666' }}>—</span>}
                  &nbsp;({round.followUpDays ?? 30} days)&nbsp;
                  <button onClick={() => setEditFollowup(true)} style={{ fontSize: 9, padding: '1px 5px', background: 'transparent', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 3, color: '#555', cursor: 'pointer' }}>edit</button>
                </span>
              )}
            </div>
          </div>

          {/* Items */}
          {items.length === 0 ? (
            <div style={{ fontSize: 12, color: '#6b7280', padding: '8px 0' }}>No dispute items in this round.</div>
          ) : (
            <div>
              {items.map((item, itemIdx) => {
                const key = `${jobId}__${itemIdx}`;
                return (
                  <ItemRow
                    key={itemIdx}
                    item={item}
                    itemIdx={itemIdx}
                    roundJobId={jobId}
                    templates={templates}
                    selected={selectedItems.has(key)}
                    templateOverride={templateOverrides[key]}
                    sentTemplates={sentTemplates}
                    onToggleSelect={onToggleSelect}
                    onStatusChange={newStatus => onStatusChange(jobId, itemIdx, item, newStatus)}
                    onTemplateChange={tplId => onTemplateChange(key, tplId)}
                  />
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
