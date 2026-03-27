import { api, authHeader } from '/common.js';

const $ = id => document.getElementById(id);

const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const stripHtml = s => String(s == null ? '' : s).replace(/<[^>]*>/g, '').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&nbsp;/g, ' ').trim();

let status = {};
let feeds = [];
let selectedArticle = null;
let npSelectedArticle = null;
let activeFeedId = null;
let queuePosts = [];

// ─── Tab switching ────────────────────────────────────────────────────────────
document.getElementById('smTabs').addEventListener('click', e => {
  const btn = e.target.closest('.sm-tab');
  if (!btn) return;
  document.querySelectorAll('.sm-tab').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  const tab = btn.dataset.tab;
  document.querySelectorAll('.sm-section').forEach(s => s.classList.remove('active'));
  $(`tab-${tab}`)?.classList.add('active');
  if (tab !== 'autopilot' && autopilotPollTimer) { clearInterval(autopilotPollTimer); autopilotPollTimer = null; }
  if (tab !== 'leads') stopLeadsPolling();
  if (tab === 'feeds' && feeds.length === 0) loadFeeds();
  if (tab === 'queue') loadQueue();
  if (tab === 'autopilot') initAutopilotTab();
  if (tab === 'leads') initLeadsTab();
  if (tab === 'newpost') initNewPostTab();
  if (tab === 'tradelines') initTradelinesTab();
});

// ─── Init ─────────────────────────────────────────────────────────────────────
async function init() {
  const urlParams = new URLSearchParams(window.location.search);
  if (urlParams.get('connected') === '1') {
    history.replaceState({}, '', '/social');
    showToast('Facebook page connected successfully!', 'green');
  }
  if (urlParams.get('pick_page') === '1') {
    history.replaceState({}, '', '/social');
    showPagePicker();
  }
  if (urlParams.get('error')) {
    const errMap = {
      fb_not_configured: 'Facebook credentials not configured. Add FB_APP_ID and FB_APP_SECRET in Settings.',
      fb_no_code: 'Facebook authorization cancelled.',
      fb_token_failed: 'Failed to get access token from Facebook.',
      no_pages: 'No Facebook pages found on your account. Make sure you manage at least one page.',
      fb_auth_failed: 'Facebook authentication failed. Please try again.',
    };
    showToast(errMap[urlParams.get('error')] || 'An error occurred.', 'red');
    history.replaceState({}, '', '/social');
  }
  await loadStatus();
  loadFeeds();
}

async function loadStatus() {
  try {
    const data = await api('/api/social/status');
    status = data;
    renderConnectTab();
    renderStatusBar();
  } catch (_) {}
}

function renderStatusBar() {
  const el = $('fbConnectionStatus');
  const statsEl = $('smStats');
  if (status.connection) {
    const ts = status.tokenStatus || 'ok';
    const dotColor = ts === 'expired' ? '#f87171' : ts === 'expiring_soon' ? '#fbbf24' : '#34d399';
    el.innerHTML = `<span style="color:${dotColor};font-weight:600;">●</span> <span style="color:#e5e7eb;">${esc(status.connection.pageName)}</span>`;
    statsEl.style.display = 'block';
    const failedTxt = status.failedCount ? ` · <span style="color:#f87171;">${status.failedCount} failed</span>` : '';
    statsEl.innerHTML = `${status.scheduledCount} scheduled · ${status.publishedCount} published${failedTxt}`;
  } else {
    el.innerHTML = `<span style="color:#f87171;font-weight:600;">● Not Connected</span>`;
    statsEl.style.display = 'none';
  }
  renderTokenWarningBanner();
  const redirectUri = `${window.location.origin}/api/social/auth/facebook/callback`;
  const hint = $('redirectUriHint');
  if (hint) hint.textContent = redirectUri;
  const copyBtn = $('copyUriBtn');
  if (copyBtn) {
    copyBtn.onclick = async () => {
      try {
        await navigator.clipboard.writeText(redirectUri);
        copyBtn.textContent = 'Copied!';
        setTimeout(() => { copyBtn.innerHTML = '<svg width="12" height="12" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg> Copy'; }, 2000);
      } catch (_) {}
    };
  }
}

function renderTokenWarningBanner() {
  let banner = $('tokenWarningBanner');
  if (!banner) {
    banner = document.createElement('div');
    banner.id = 'tokenWarningBanner';
    const workspace = document.querySelector('.workspace-inner');
    if (workspace) workspace.insertBefore(banner, workspace.firstChild);
  }
  const ts = status.tokenStatus;
  if (ts === 'expired') {
    banner.style.cssText = 'background:rgba(239,68,68,0.1);border:1px solid rgba(239,68,68,0.3);border-radius:10px;padding:12px 18px;display:flex;align-items:center;gap:12px;margin-bottom:0;';
    banner.innerHTML = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#f87171" stroke-width="2"><circle cx="12" cy="12" r="10"/><path d="M12 8v4"/><circle cx="12" cy="16" r="0.5" fill="#f87171"/></svg><span style="font-size:13px;color:#fca5a5;flex:1;"><strong style="color:#f87171;">Facebook token expired</strong> — Autopilot has paused publishing. <a href="#" id="bannerReconnect" style="color:#f87171;text-decoration:underline;">Reconnect your page</a> to resume.</span>`;
    banner.querySelector('#bannerReconnect')?.addEventListener('click', e => {
      e.preventDefault();
      document.querySelector('[data-tab="connect"]')?.click();
    });
  } else if (ts === 'expiring_soon' && status.connection?.tokenExpiresAt) {
    const days = Math.ceil((new Date(status.connection.tokenExpiresAt) - Date.now()) / (1000*60*60*24));
    banner.style.cssText = 'background:rgba(251,191,36,0.08);border:1px solid rgba(251,191,36,0.2);border-radius:10px;padding:12px 18px;display:flex;align-items:center;gap:12px;margin-bottom:0;';
    banner.innerHTML = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#fbbf24" stroke-width="2"><circle cx="12" cy="12" r="10"/><path d="M12 8v4"/><circle cx="12" cy="16" r="0.5" fill="#fbbf24"/></svg><span style="font-size:13px;color:#fde68a;flex:1;"><strong style="color:#fbbf24;">Facebook token expires in ${days} day${days !== 1 ? 's' : ''}</strong> — Reconnect soon to keep autopilot running without interruption.</span>`;
  } else {
    banner.style.display = 'none';
    return;
  }
  banner.style.display = 'flex';
}

function renderConnectTab() {
  const body = $('connectBody');
  if (status.connection) {
    const conn = status.connection;
    const ts = status.tokenStatus || 'ok';
    const tokenBadgeMap = {
      ok: { color: '#10b981', bg: 'rgba(16,185,129,0.12)', border: 'rgba(16,185,129,0.3)', label: 'Token Valid' },
      expiring_soon: { color: '#fbbf24', bg: 'rgba(251,191,36,0.12)', border: 'rgba(251,191,36,0.3)', label: 'Expiring Soon' },
      expired: { color: '#f87171', bg: 'rgba(239,68,68,0.12)', border: 'rgba(239,68,68,0.3)', label: 'Token Expired' },
    };
    const tb = tokenBadgeMap[ts] || tokenBadgeMap.ok;
    const connBorderColor = ts === 'expired' ? 'rgba(239,68,68,0.3)' : ts === 'expiring_soon' ? 'rgba(251,191,36,0.3)' : 'rgba(16,185,129,0.2)';
    const connBgColor = ts === 'expired' ? 'rgba(239,68,68,0.06)' : ts === 'expiring_soon' ? 'rgba(251,191,36,0.06)' : 'rgba(16,185,129,0.08)';
    const expiryLine = conn.tokenExpiresAt ? `<div style="font-size:11px;color:#6b7280;margin-top:3px;">Token expires: ${new Date(conn.tokenExpiresAt).toLocaleDateString()}</div>` : '';
    const scopesTags = (conn.grantedScopes || []).map(s => `<span style="display:inline-block;background:rgba(99,102,241,0.12);color:#818cf8;padding:1px 7px;border-radius:4px;font-size:10px;font-weight:600;margin:1px;">${esc(s)}</span>`).join('');
    body.innerHTML = `
      <div style="display:flex;align-items:center;gap:16px;background:${connBgColor};border:1px solid ${connBorderColor};border-radius:12px;padding:20px 24px;">
        <div style="width:48px;height:48px;border-radius:50%;background:#1877f2;display:flex;align-items:center;justify-content:center;flex-shrink:0;">
          <svg width="26" height="26" viewBox="0 0 24 24" fill="#fff"><path d="M18 2h-3a5 5 0 0 0-5 5v3H7v4h3v8h4v-8h3l1-4h-4V7a1 1 0 0 1 1-1h3z"/></svg>
        </div>
        <div style="flex:1;min-width:0;">
          <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;">
            <div style="font-size:15px;font-weight:700;color:#e5e7eb;">${esc(conn.pageName)}</div>
            <span style="display:inline-block;padding:2px 9px;border-radius:20px;font-size:10px;font-weight:700;background:${tb.bg};color:${tb.color};border:1px solid ${tb.border};">${tb.label}</span>
          </div>
          <div style="font-size:12px;color:#9ca3af;margin-top:2px;">Page ID: ${esc(conn.pageId)} · Connected ${new Date(conn.connectedAt).toLocaleDateString()}${conn.connectedByUserId ? ` by ${esc(conn.connectedByUserId)}` : ''}</div>
          ${expiryLine}
          ${scopesTags ? `<div style="margin-top:6px;">${scopesTags}</div>` : ''}
        </div>
        <button id="btnDisconnect" type="button" style="background:rgba(239,68,68,0.15);border:1px solid rgba(239,68,68,0.3);color:#f87171;padding:8px 16px;border-radius:8px;font-size:13px;font-weight:600;cursor:pointer;white-space:nowrap;">Disconnect</button>
      </div>
      <p style="font-size:13px;color:#9ca3af;margin-top:12px;">Your page is connected. Autopilot and scheduled posts run on the server 24/7 — you don't need to stay logged in. You can also schedule and publish posts from the <strong style="color:#e5e7eb;">Generate Post</strong> and <strong style="color:#e5e7eb;">Post Queue</strong> tabs.</p>`;
    $('btnDisconnect')?.addEventListener('click', disconnectFacebook);
  } else if (status.fbConfigured) {
    body.innerHTML = `
      <div>
        <p style="font-size:14px;color:#9ca3af;margin-bottom:16px;">Your Meta App credentials are configured. Click below to connect your Facebook Business Page.</p>
        <a href="/api/social/auth/facebook" class="fb-connect-btn">
          <svg viewBox="0 0 24 24"><path d="M18 2h-3a5 5 0 0 0-5 5v3H7v4h3v8h4v-8h3l1-4h-4V7a1 1 0 0 1 1-1h3z"/></svg>
          Connect Facebook Page
        </a>
      </div>`;
  } else {
    body.innerHTML = `
      <div style="background:rgba(251,191,36,0.08);border:1px solid rgba(251,191,36,0.2);border-radius:12px;padding:20px 24px;">
        <div style="display:flex;align-items:center;gap:10px;margin-bottom:10px;">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#fbbf24" stroke-width="2"><circle cx="12" cy="12" r="10"/><path d="M12 8v4"/><circle cx="12" cy="16" r="0.5" fill="#fbbf24"/></svg>
          <span style="font-size:14px;font-weight:700;color:#fbbf24;">Facebook Credentials Not Configured</span>
        </div>
        <p style="font-size:13px;color:#9ca3af;line-height:1.6;">Add <strong style="color:#e5e7eb;">FB_APP_ID</strong> and <strong style="color:#e5e7eb;">FB_APP_SECRET</strong> in <a href="/settings" style="color:#818cf8;text-decoration:underline;">Settings → APIs</a>. Follow the setup guide below. The RSS generator and post queue work without Facebook connected — you'll just need to copy-paste posts manually until you connect.</p>
      </div>`;
  }
}

async function disconnectFacebook() {
  if (!confirm('Disconnect your Facebook page? Scheduled posts will not be published until you reconnect.')) return;
  try {
    await api('/api/social/disconnect', { method: 'DELETE' });
    await loadStatus();
    showToast('Facebook page disconnected.', 'yellow');
  } catch (e) {
    showToast('Failed to disconnect: ' + e.message, 'red');
  }
}

// ─── RSS Feeds ────────────────────────────────────────────────────────────────
async function loadFeeds() {
  try {
    const data = await api('/api/social/rss-feeds');
    feeds = data.feeds || [];
    renderFeedsList();
    populatePickerSelect();
  } catch (_) {}
}

function renderFeedsList() {
  const el = $('feedsList');
  if (!feeds.length) {
    el.innerHTML = `<div style="text-align:center;padding:32px 0;color:#9ca3af;font-size:13px;">No RSS feeds added yet. Click "+ Add Feed" to get started.<br><br><strong style="color:#e5e7eb;">Suggested feeds to try:</strong><br>
      <div style="margin-top:10px;display:flex;flex-direction:column;gap:6px;align-items:center;">
        <code style="font-size:11px;background:rgba(255,255,255,0.06);padding:3px 10px;border-radius:5px;">https://www.consumerfinance.gov/about-us/newsroom/feed/</code>
        <code style="font-size:11px;background:rgba(255,255,255,0.06);padding:3px 10px;border-radius:5px;">https://feeds.feedburner.com/creditcards/blog</code>
        <code style="font-size:11px;background:rgba(255,255,255,0.06);padding:3px 10px;border-radius:5px;">https://www.ftc.gov/rss/news</code>
      </div>
    </div>`;
    return;
  }
  el.innerHTML = feeds.map(f => `
    <div class="feed-card" data-feed-id="${esc(f.id)}">
      <div style="display:flex;align-items:center;justify-content:space-between;gap:10px;">
        <div style="flex:1;min-width:0;">
          <div style="font-size:13px;font-weight:700;color:#e5e7eb;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${esc(f.name)}</div>
          <div style="font-size:11px;color:#6b7280;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;margin-top:2px;">${esc(f.url)}</div>
          ${f.lastFetched ? `<div style="font-size:11px;color:#6b7280;margin-top:2px;">Last fetched: ${new Date(f.lastFetched).toLocaleString()}</div>` : ''}
        </div>
        <div style="display:flex;gap:8px;flex-shrink:0;">
          <button class="btn-load-feed btn-secondary" data-feed-id="${esc(f.id)}" style="font-size:12px;padding:5px 12px;">View Articles</button>
          <button class="btn-del-feed" data-feed-id="${esc(f.id)}" style="background:rgba(239,68,68,0.12);border:1px solid rgba(239,68,68,0.2);color:#f87171;padding:5px 10px;border-radius:7px;font-size:12px;cursor:pointer;">Remove</button>
        </div>
      </div>
    </div>`).join('');

  el.querySelectorAll('.btn-load-feed').forEach(btn => btn.addEventListener('click', () => loadFeedItems(btn.dataset.feedId)));
  el.querySelectorAll('.btn-del-feed').forEach(btn => btn.addEventListener('click', () => deleteFeed(btn.dataset.feedId)));
}

async function deleteFeed(id) {
  if (!confirm('Remove this RSS feed?')) return;
  await api(`/api/social/rss-feeds/${id}`, { method: 'DELETE' });
  await loadFeeds();
  if (activeFeedId === id) { $('rssItemsSection').style.display = 'none'; activeFeedId = null; }
}

$('btnShowAddFeed').addEventListener('click', () => {
  const box = $('addFeedBox');
  box.style.display = box.style.display === 'none' ? 'block' : 'none';
});

$('btnAddFeed').addEventListener('click', async () => {
  const url = $('addFeedUrl').value.trim();
  const name = $('addFeedName').value.trim();
  const errEl = $('addFeedErr');
  errEl.style.display = 'none';
  if (!url) { errEl.textContent = 'Feed URL is required.'; errEl.style.display = 'block'; return; }
  const btn = $('btnAddFeed');
  btn.disabled = true; btn.textContent = 'Adding…';
  try {
    const data = await api('/api/social/rss-feeds', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ url, name }) });
    if (!data.ok) throw new Error(data.error || 'Failed to add feed');
    $('addFeedUrl').value = '';
    $('addFeedName').value = '';
    $('addFeedBox').style.display = 'none';
    await loadFeeds();
    loadFeedItems(data.feed.id);
  } catch (e) {
    errEl.textContent = e.message; errEl.style.display = 'block';
  } finally {
    btn.disabled = false; btn.textContent = 'Add Feed';
  }
});

async function loadFeedItems(feedId) {
  activeFeedId = feedId;
  const feed = feeds.find(f => f.id === feedId);
  const section = $('rssItemsSection');
  const list = $('rssItemsList');
  const title = $('rssItemsTitle');
  section.style.display = 'block';
  title.textContent = feed ? feed.name : 'Articles';
  list.innerHTML = '<div style="color:#9ca3af;font-size:13px;text-align:center;padding:16px;">Fetching articles…</div>';
  section.scrollIntoView({ behavior: 'smooth', block: 'start' });
  try {
    const data = await api(`/api/social/rss-feeds/${feedId}/items`);
    if (!data.ok) throw new Error(data.error || 'Failed to fetch');
    if (feed) { feed.name = data.feedTitle || feed.name; await loadFeeds(); title.textContent = feed.name; }
    const items = data.items || [];
    if (!items.length) { list.innerHTML = '<div style="color:#9ca3af;font-size:13px;text-align:center;padding:16px;">No articles found in this feed.</div>'; return; }
    list.innerHTML = items.map((item, i) => `
      <div class="rss-item" data-idx="${i}" data-guid="${esc(item.guid || '')}">
        <div style="font-size:13px;font-weight:600;color:#e5e7eb;margin-bottom:4px;">${esc(stripHtml(item.title))}</div>
        ${item.pubDate ? `<div style="font-size:11px;color:#6b7280;margin-bottom:4px;">${new Date(item.pubDate).toLocaleDateString()}</div>` : ''}
        <div style="font-size:12px;color:#9ca3af;line-height:1.5;">${esc(stripHtml((item.contentSnippet || '').slice(0, 180)))}${item.contentSnippet?.length > 180 ? '…' : ''}</div>
        <div style="margin-top:8px;display:flex;gap:8px;">
          <button class="btn-use-article btn-secondary" data-idx="${i}" style="font-size:11px;padding:4px 12px;">Use for Post</button>
          ${item.link ? `<a href="${esc(item.link)}" target="_blank" style="font-size:11px;color:#818cf8;text-decoration:underline;padding:4px 0;">Read →</a>` : ''}
        </div>
      </div>`).join('');
    const itemsData = items;
    list.querySelectorAll('.btn-use-article').forEach(btn => {
      btn.addEventListener('click', () => {
        selectArticleForCompose(itemsData[parseInt(btn.dataset.idx, 10)]);
      });
    });
  } catch (e) {
    list.innerHTML = `<div style="color:#f87171;font-size:13px;text-align:center;padding:16px;">${esc(e.message)}</div>`;
  }
}

$('btnRefreshItems').addEventListener('click', () => { if (activeFeedId) loadFeedItems(activeFeedId); });

// ─── Compose (merged into New Post) ───────────────────────────────────────────
// The Generate Post tab has been merged into New Post. RSS articles picked from
// the Feeds tab now route to the New Post tab via selectArticleForNewPost().
function selectArticleForCompose(article) {
  // Route to New Post tab instead
  window._npArticlePickerMode = false;
  npSelectedArticle = article;
  const titleEl = $('npSelectedArticleTitle');
  const bar = $('npSelectedArticleBar');
  if (titleEl) titleEl.textContent = stripHtml(article.title || '');
  if (bar) bar.style.display = 'flex';
  if (article.link) {
    const urlEl = $('npArticleUrl');
    const row = $('npArticleLinkRow');
    if (urlEl) urlEl.value = article.link;
    if (row) row.style.display = 'block';
  }
  const topicEl = $('npAiTopic');
  if (topicEl) topicEl.value = article.title || '';
  const aiPanel = $('npAiPanel');
  if (aiPanel) aiPanel.style.display = 'block';
  document.querySelectorAll('.sm-tab').forEach(b => b.classList.remove('active'));
  const npTab = document.querySelector('[data-tab="newpost"]');
  if (npTab) npTab.classList.add('active');
  document.querySelectorAll('.sm-section').forEach(s => s.classList.remove('active'));
  const npSec = $('tab-newpost');
  if (npSec) npSec.classList.add('active');
  showToast('Article selected — click Generate to create a post.', 'green');
}

$('btnCloseArticlePicker').addEventListener('click', () => { $('articlePickerOverlay').style.display = 'none'; });
$('articlePickerOverlay').addEventListener('click', e => { if (e.target === $('articlePickerOverlay')) { window._npArticlePickerMode = false; $('articlePickerOverlay').style.display = 'none'; } });

function populatePickerSelect() {
  const sel = $('pickerFeedSelect');
  if (!sel) return;
  sel.innerHTML = feeds.length ? feeds.map(f => `<option value="${esc(f.id)}">${esc(f.name)}</option>`).join('') : '<option value="">No feeds added yet</option>';
}

$('btnLoadPickerItems').addEventListener('click', async () => {
  const feedId = $('pickerFeedSelect').value;
  if (!feedId) return;
  const btn = $('btnLoadPickerItems');
  btn.disabled = true; btn.textContent = 'Loading…';
  const list = $('pickerItemsList');
  list.innerHTML = '<div style="color:#9ca3af;font-size:13px;padding:10px;">Fetching articles…</div>';
  try {
    const data = await api(`/api/social/rss-feeds/${feedId}/items`);
    const items = data.items || [];
    list.innerHTML = items.map((item, i) => `
      <div class="rss-item" style="cursor:pointer;" data-idx="${i}">
        <div style="font-size:13px;font-weight:600;color:#e5e7eb;margin-bottom:4px;">${esc(stripHtml(item.title))}</div>
        ${item.pubDate ? `<div style="font-size:11px;color:#6b7280;margin-bottom:3px;">${new Date(item.pubDate).toLocaleDateString()}</div>` : ''}
        <div style="font-size:12px;color:#9ca3af;">${esc(stripHtml((item.contentSnippet || '').slice(0, 140)))}…</div>
      </div>`).join('');
    const itemsData = items;
    list.querySelectorAll('.rss-item').forEach(el => {
      el.addEventListener('click', () => {
        selectArticleForCompose(itemsData[parseInt(el.dataset.idx, 10)]);
        $('articlePickerOverlay').style.display = 'none';
      });
    });
  } catch (e) {
    list.innerHTML = `<div style="color:#f87171;font-size:13px;padding:10px;">${esc(e.message)}</div>`;
  } finally {
    btn.disabled = false; btn.textContent = 'Load Articles';
  }
});

// savePost removed — compose tab merged into New Post tab

// ─── Queue ────────────────────────────────────────────────────────────────────
async function loadQueue() {
  try {
    const data = await api('/api/social/queue');
    queuePosts = data.posts || [];
    renderQueue();
  } catch (_) {}
}

function renderQueue() {
  const filter = $('queueFilter').value;
  const el = $('queueList');
  const posts = filter ? queuePosts.filter(p => p.status === filter) : queuePosts;
  if (!posts.length) {
    el.innerHTML = `<div style="text-align:center;padding:32px 0;color:#9ca3af;font-size:13px;">${filter ? `No ${filter} posts.` : 'No posts in queue. Go to Generate Post to create your first post.'}</div>`;
    return;
  }
  el.innerHTML = posts.map(p => `
    <div class="queue-card">
      <div style="display:flex;align-items:flex-start;justify-content:space-between;gap:12px;margin-bottom:10px;">
        <div style="flex:1;min-width:0;">
          <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;margin-bottom:6px;">
            <span class="status-badge status-${p.status}">${p.status}</span>
            ${p.mediaType === 'photo' ? `<span style="display:inline-block;padding:2px 8px;border-radius:20px;font-size:10px;font-weight:700;background:rgba(16,185,129,0.12);color:#34d399;border:1px solid rgba(16,185,129,0.25);">📷 Photo</span>` : ''}
            ${p.mediaType === 'video' ? `<span style="display:inline-block;padding:2px 8px;border-radius:20px;font-size:10px;font-weight:700;background:rgba(139,92,246,0.15);color:#a78bfa;border:1px solid rgba(139,92,246,0.3);">🎬 Video</span>` : ''}
            ${p.scheduledVia === 'facebook' ? `<span style="display:inline-block;padding:2px 8px;border-radius:20px;font-size:10px;font-weight:700;background:rgba(24,119,242,0.12);color:#60a5fa;border:1px solid rgba(24,119,242,0.25);">f Scheduled on FB</span>` : ''}
            ${p.source === 'autopilot' ? `<span style="display:inline-block;padding:2px 8px;border-radius:20px;font-size:10px;font-weight:700;background:rgba(99,102,241,0.15);color:#818cf8;border:1px solid rgba(99,102,241,0.3);">⚡ Autopilot</span>` : ''}
            ${(p.source === 'tradeline' || p.source === 'tradeline_autopilot') ? `<span style="display:inline-block;padding:2px 8px;border-radius:20px;font-size:10px;font-weight:700;background:rgba(16,185,129,0.12);color:#34d399;border:1px solid rgba(16,185,129,0.25);">📈 Tradeline${p.source === 'tradeline_autopilot' ? ' Auto' : ''}</span>` : ''}
            ${p.scheduledAt ? `<span style="font-size:12px;color:#9ca3af;">Scheduled: ${new Date(p.scheduledAt).toLocaleString()}</span>` : ''}
            ${p.publishedAt ? `<span style="font-size:12px;color:#9ca3af;">Published: ${new Date(p.publishedAt).toLocaleString()}</span>` : ''}
            ${p.articleTitle ? `<span style="font-size:11px;color:#6b7280;">From: ${esc(stripHtml(p.articleTitle).slice(0, 40))}…</span>` : ''}
          </div>
          <div style="font-size:13px;color:#e5e7eb;line-height:1.6;max-height:80px;overflow:hidden;text-overflow:ellipsis;">${esc(p.content.slice(0, 300))}${p.content.length > 300 ? '…' : ''}</div>
          ${p.articleUrl ? `<a href="${esc(p.articleUrl)}" target="_blank" style="font-size:11px;color:#818cf8;text-decoration:underline;margin-top:4px;display:inline-block;">${esc(p.articleUrl.slice(0, 60))}…</a>` : ''}
          ${p.error ? `<div style="margin-top:6px;font-size:12px;color:#f87171;">Error: ${esc(p.error)}</div>` : ''}
          ${p.fbPostId ? `<div style="margin-top:4px;font-size:11px;color:#6b7280;">FB Post ID: ${esc(p.fbPostId)}</div>` : ''}
        </div>
        <div style="display:flex;flex-direction:column;gap:6px;flex-shrink:0;">
          ${p.status !== 'published' && p.scheduledVia !== 'facebook' ? `<button class="btn-publish-now btn-secondary" data-id="${esc(p.id)}" style="font-size:11px;padding:4px 10px;white-space:nowrap;">Post Now</button>` : ''}
          ${p.scheduledVia === 'facebook' && p.status === 'scheduled' ? `<span style="font-size:10px;color:#6b7280;white-space:nowrap;">Managed by Facebook</span>` : ''}
          ${p.status === 'draft' || p.status === 'failed' ? `<button class="btn-queue-schedule btn-secondary" data-id="${esc(p.id)}" data-content="${esc(p.content)}" style="font-size:11px;padding:4px 10px;white-space:nowrap;">Edit/Schedule</button>` : ''}
          <button class="btn-del-post" data-id="${esc(p.id)}" style="background:rgba(239,68,68,0.12);border:1px solid rgba(239,68,68,0.2);color:#f87171;padding:4px 10px;border-radius:7px;font-size:11px;cursor:pointer;white-space:nowrap;">Delete</button>
        </div>
      </div>
    </div>`).join('');

  el.querySelectorAll('.btn-publish-now').forEach(btn => btn.addEventListener('click', () => publishQueuePost(btn.dataset.id)));
  el.querySelectorAll('.btn-del-post').forEach(btn => btn.addEventListener('click', () => deleteQueuePost(btn.dataset.id)));
  el.querySelectorAll('.btn-queue-schedule').forEach(btn => btn.addEventListener('click', () => {
    // Open in New Post tab and pre-fill content
    const content = decodeURIComponent(btn.dataset.content || '');
    const npEl = $('npContent');
    if (npEl) {
      npEl.value = content;
      npEl.dispatchEvent(new Event('input'));
    }
    document.querySelectorAll('.sm-tab').forEach(b => b.classList.remove('active'));
    const npTabBtn = document.querySelector('[data-tab="newpost"]');
    if (npTabBtn) npTabBtn.classList.add('active');
    document.querySelectorAll('.sm-section').forEach(s => s.classList.remove('active'));
    const npSec = $('tab-newpost');
    if (npSec) npSec.classList.add('active');
  }));
}

async function publishQueuePost(id) {
  if (!status.connection) {
    showToast('No Facebook page connected. Go to Facebook Connect tab to connect your page.', 'yellow');
    return;
  }
  const btn = document.querySelector(`.btn-publish-now[data-id="${id}"]`);
  if (btn) { btn.disabled = true; btn.textContent = 'Publishing…'; }
  try {
    const data = await api(`/api/social/queue/${id}/publish-now`, { method: 'POST' });
    if (!data.ok) throw new Error(data.error);
    if (data.post.status === 'published') showToast('Published successfully!', 'green');
    else showToast('Publish failed: ' + (data.post.error || 'Unknown error'), 'red');
    await loadQueue();
  } catch (e) {
    showToast('Error: ' + e.message, 'red');
    if (btn) { btn.disabled = false; btn.textContent = 'Post Now'; }
  }
}

async function deleteQueuePost(id) {
  if (!confirm('Delete this post from the queue?')) return;
  await api(`/api/social/queue/${id}`, { method: 'DELETE' });
  await loadQueue();
}

$('queueFilter').addEventListener('change', renderQueue);
$('btnRefreshQueue').addEventListener('click', loadQueue);

// ─── Toast ────────────────────────────────────────────────────────────────────
function showToast(msg, color = 'green') {
  const colorMap = { green: '#10b981', red: '#f87171', yellow: '#fbbf24' };
  const toast = document.createElement('div');
  toast.textContent = msg;
  toast.style.cssText = `position:fixed;bottom:24px;right:24px;background:#1a1b2e;border:1px solid ${colorMap[color]};color:${colorMap[color]};padding:12px 20px;border-radius:10px;font-size:13px;font-weight:600;z-index:99999;box-shadow:0 4px 20px rgba(0,0,0,0.4);max-width:360px;line-height:1.4;`;
  document.body.appendChild(toast);
  setTimeout(() => toast.remove(), 4000);
}

// ─── Page Picker ──────────────────────────────────────────────────────────────
async function showPagePicker() {
  const overlay = $('pagePickerOverlay');
  const list = $('pagePickerList');
  const errEl = $('pagePickerErr');
  overlay.style.display = 'flex';
  list.innerHTML = '<div style="color:#9ca3af;font-size:13px;text-align:center;padding:16px;">Loading your pages…</div>';
  errEl.style.display = 'none';
  try {
    const data = await api('/api/social/pending-pages');
    if (!data.ok) { list.innerHTML = `<div style="color:#f87171;font-size:13px;text-align:center;padding:16px;">${esc(data.error)}<br><br><a href="/api/social/auth/facebook" style="color:#818cf8;text-decoration:underline;">Reconnect Facebook</a></div>`; return; }
    list.innerHTML = data.pages.map(p => `
      <div style="background:rgba(255,255,255,0.04);border:1px solid rgba(255,255,255,0.1);border-radius:10px;padding:14px 16px;display:flex;align-items:center;gap:14px;cursor:pointer;" class="page-picker-card" data-page-id="${esc(p.id)}">
        <div style="width:40px;height:40px;border-radius:50%;background:#1877f2;display:flex;align-items:center;justify-content:center;flex-shrink:0;">
          <svg width="22" height="22" viewBox="0 0 24 24" fill="#fff"><path d="M18 2h-3a5 5 0 0 0-5 5v3H7v4h3v8h4v-8h3l1-4h-4V7a1 1 0 0 1 1-1h3z"/></svg>
        </div>
        <div style="flex:1;min-width:0;">
          <div style="font-size:14px;font-weight:700;color:#e5e7eb;">${esc(p.name)}</div>
          <div style="font-size:11px;color:#9ca3af;">ID: ${esc(p.id)}${p.category ? ' · ' + esc(p.category) : ''}</div>
        </div>
        <button type="button" class="btn-pick-page btn-primary" data-page-id="${esc(p.id)}" style="font-size:13px;padding:7px 16px;white-space:nowrap;">Connect</button>
      </div>`).join('');
    list.querySelectorAll('.btn-pick-page').forEach(btn => btn.addEventListener('click', () => pickPage(btn.dataset.pageId)));
  } catch (e) {
    list.innerHTML = `<div style="color:#f87171;font-size:13px;text-align:center;padding:16px;">${esc(e.message)}</div>`;
  }
}

async function pickPage(pageId) {
  const errEl = $('pagePickerErr');
  errEl.style.display = 'none';
  const btn = document.querySelector(`.btn-pick-page[data-page-id="${pageId}"]`);
  if (btn) { btn.disabled = true; btn.textContent = 'Connecting…'; }
  try {
    const data = await api('/api/social/auth/pick-page', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ pageId }) });
    if (!data.ok) throw new Error(data.error || 'Failed to connect page');
    $('pagePickerOverlay').style.display = 'none';
    await loadStatus();
    showToast(`Connected to "${data.connection?.pageName}"!`, 'green');
  } catch (e) {
    errEl.textContent = e.message; errEl.style.display = 'block';
    if (btn) { btn.disabled = false; btn.textContent = 'Connect'; }
  }
}

$('btnCancelPagePicker').addEventListener('click', () => { $('pagePickerOverlay').style.display = 'none'; });

// ─── Leads & Comments Tab ────────────────────────────────────────────────────
function initLeadsTab() {
  if (!status.connection) {
    $('leadsNoConn').style.display = 'block';
    $('leadsSection').style.display = 'none';
    $('commentsSection').style.display = 'none';
    stopLeadsPolling();
  } else {
    $('leadsNoConn').style.display = 'none';
    $('leadsSection').style.display = 'block';
    $('commentsSection').style.display = 'block';
    startLeadsPolling();
  }
}

$('btnLoadLeads').addEventListener('click', loadLeads);
$('btnLoadComments').addEventListener('click', loadComments);

async function loadLeads() {
  if (!status.connection) { showToast('Connect a Facebook page first.', 'yellow'); return; }
  const btn = $('btnLoadLeads');
  const list = $('leadsList');
  btn.disabled = true; btn.textContent = 'Loading…';
  list.innerHTML = '<div style="color:#9ca3af;font-size:13px;text-align:center;padding:16px;">Fetching lead form submissions…</div>';
  try {
    const data = await api('/api/social/page/leads');
    if (!data.ok) throw new Error(data.error);
    const leads = data.leads || [];
    $('leadsCount').textContent = `${leads.length} lead${leads.length !== 1 ? 's' : ''} · ${data.formCount || 0} form${data.formCount !== 1 ? 's' : ''}`;
    if (!leads.length) {
      const noForms = (data.formCount || 0) === 0;
      const emptyMsg = noForms
        ? 'No lead generation forms found on this page. Create a lead gen ad in Ads Manager to start collecting leads.'
        : `Found ${data.formCount} form${data.formCount !== 1 ? 's' : ''} but no submissions yet. Leads will appear here once people fill out your form.`;
      list.innerHTML = `<div style="color:#9ca3af;font-size:13px;text-align:center;padding:24px 0;">${emptyMsg}</div>`;
      return;
    }
    list.innerHTML = leads.map((lead, i) => `
      <div style="background:rgba(255,255,255,0.03);border:1px solid rgba(255,255,255,0.07);border-radius:8px;padding:12px 14px;margin-bottom:8px;display:flex;align-items:center;gap:12px;flex-wrap:wrap;" data-lead-idx="${i}">
        <div style="flex:1;min-width:0;">
          <div style="font-size:13px;font-weight:600;color:#e5e7eb;">${esc(lead.name || 'Unknown')}</div>
          <div style="font-size:12px;color:#9ca3af;margin-top:2px;">${lead.email ? esc(lead.email) : '<span style="color:#6b7280;">No email</span>'}${lead.phone ? ' · ' + esc(lead.phone) : ''}</div>
          <div style="font-size:11px;color:#6b7280;margin-top:2px;">Form: ${esc(lead.formName)} · ${lead.createdAt ? new Date(lead.createdAt).toLocaleString() : ''}${lead.adId ? ' · Ad ID: ' + esc(lead.adId) : ''}</div>
        </div>
        <button class="btn-add-lead-crm btn-secondary" data-lead-idx="${i}" style="font-size:11px;padding:5px 12px;white-space:nowrap;flex-shrink:0;">+ Add to CRM</button>
      </div>`).join('');
    const leadsCache = leads;
    list.querySelectorAll('.btn-add-lead-crm').forEach(btn2 => btn2.addEventListener('click', () => addLeadToCrm(leadsCache[parseInt(btn2.dataset.leadIdx, 10)], btn2)));
  } catch (e) {
    const msg = e.message || 'Unknown error';
    const isLeadAccess = /lead access|lead_access|permission|OAuthException/i.test(msg) || msg.includes('code 100') || msg.includes('code 10');
    const hint = isLeadAccess
      ? '<div style="color:#fbbf24;font-size:12px;margin-top:8px;">Tip: Go to your Facebook Business Suite → Lead Access Manager and grant this app access to your page\'s leads.</div>'
      : '';
    list.innerHTML = `<div style="color:#f87171;font-size:13px;text-align:center;padding:16px;">${esc(msg)}${hint}</div>`;
  } finally {
    btn.disabled = false; btn.textContent = 'Load Leads';
  }
}

async function loadComments() {
  if (!status.connection) { showToast('Connect a Facebook page first.', 'yellow'); return; }
  const btn = $('btnLoadComments');
  const list = $('commentsList');
  btn.disabled = true; btn.textContent = 'Loading…';
  list.innerHTML = '<div style="color:#9ca3af;font-size:13px;text-align:center;padding:16px;">Fetching page comments…</div>';
  try {
    const data = await api('/api/social/page/comments');
    if (!data.ok) throw new Error(data.error);
    const comments = data.comments || [];
    $('commentsCount').textContent = `${comments.length} comment${comments.length !== 1 ? 's' : ''}`;
    if (!comments.length) {
      list.innerHTML = '<div style="color:#9ca3af;font-size:13px;text-align:center;padding:24px 0;">No comments found on your recent page posts. Once your posts receive comments they will appear here.</div>';
      return;
    }
    list.innerHTML = comments.map((c, i) => `
      <div style="background:rgba(255,255,255,0.03);border:1px solid rgba(255,255,255,0.07);border-radius:8px;padding:12px 14px;margin-bottom:8px;display:flex;align-items:flex-start;gap:12px;flex-wrap:wrap;" data-comment-idx="${i}">
        <div style="flex:1;min-width:0;">
          <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;margin-bottom:4px;">
            <span style="font-size:13px;font-weight:600;color:#e5e7eb;">${esc(c.fromName)}</span>
            <span style="font-size:11px;color:#6b7280;">${c.createdAt ? new Date(c.createdAt).toLocaleString() : ''}</span>
          </div>
          <div style="font-size:13px;color:#d1d5db;line-height:1.5;margin-bottom:4px;">${esc(c.message)}</div>
          ${c.postPreview ? `<div style="font-size:11px;color:#6b7280;border-left:2px solid rgba(255,255,255,0.1);padding-left:8px;margin-top:4px;">On post: ${esc(c.postPreview)}…</div>` : ''}
        </div>
        <button class="btn-add-comment-crm btn-secondary" data-comment-idx="${i}" style="font-size:11px;padding:5px 12px;white-space:nowrap;flex-shrink:0;">+ Add to CRM</button>
      </div>`).join('');
    const commentsCache = comments;
    list.querySelectorAll('.btn-add-comment-crm').forEach(btn2 => btn2.addEventListener('click', () => addCommentToCrm(commentsCache[parseInt(btn2.dataset.commentIdx, 10)], btn2)));
  } catch (e) {
    const msg = e.message || 'Unknown error';
    const isScope = /permission|OAuthException|pages_read_engagement/i.test(msg);
    const hint = isScope
      ? '<div style="color:#fbbf24;font-size:12px;margin-top:8px;">Tip: Your Facebook token may be missing the pages_read_engagement permission. Try disconnecting and reconnecting your page.</div>'
      : '';
    list.innerHTML = `<div style="color:#f87171;font-size:13px;text-align:center;padding:16px;">${esc(msg)}${hint}</div>`;
  } finally {
    btn.disabled = false; btn.textContent = 'Load Comments';
  }
}

async function addLeadToCrm(lead, btn) {
  btn.disabled = true; btn.textContent = 'Adding…';
  try {
    const body = { name: lead.name || 'Facebook Lead', email: lead.email || '', phone: lead.phone || '', source: 'Facebook Page', sourcePostId: lead.adId || '' };
    const data = await api('/api/consumers', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    if (!data.ok && !data.id) throw new Error(data.error || 'Failed to add to CRM');
    btn.textContent = '✓ Added';
    btn.style.color = '#10b981';
    btn.style.borderColor = '#10b981';
    showToast(`"${lead.name || 'Lead'}" added to CRM pipeline!`, 'green');
  } catch (e) {
    btn.disabled = false; btn.textContent = '+ Add to CRM';
    showToast('Failed to add: ' + e.message, 'red');
  }
}

async function addCommentToCrm(comment, btn) {
  btn.disabled = true; btn.textContent = 'Adding…';
  try {
    const body = { name: comment.fromName || 'Facebook User', source: 'Facebook Page Comment', sourcePostId: comment.postId || '' };
    const data = await api('/api/consumers', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    if (!data.ok && !data.id) throw new Error(data.error || 'Failed to add to CRM');
    btn.textContent = '✓ Added';
    btn.style.color = '#10b981';
    btn.style.borderColor = '#10b981';
    showToast(`"${comment.fromName}" added to CRM pipeline!`, 'green');
  } catch (e) {
    btn.disabled = false; btn.textContent = '+ Add to CRM';
    showToast('Failed to add: ' + e.message, 'red');
  }
}

// ─── Autopilot ────────────────────────────────────────────────────────────────
let autopilotData = null;
let autopilotPollTimer = null;
let selectedFeedIds = 'all';

function formatCountdown(isoDate) {
  if (!isoDate) return '';
  const diff = new Date(isoDate) - Date.now();
  if (diff <= 0) return 'Any moment now';
  const h = Math.floor(diff / 3600000);
  const m = Math.floor((diff % 3600000) / 60000);
  if (h > 0) return `in ${h}h ${m}m`;
  return `in ${m}m`;
}

async function loadAutopilot() {
  try {
    const data = await api('/api/social/autopilot');
    if (!data.ok) return;
    autopilotData = data;
    renderAutopilot(data);
  } catch (_) {}
}

function renderAutopilot(data) {
  const ap = data.autopilot || {};
  const enabled = !!ap.enabled;

  const toggle = $('autopilotToggle');
  const track = $('autopilotTrack');
  const thumb = $('autopilotThumb');
  const label = $('autopilotToggleLabel');
  if (toggle) toggle.checked = enabled;
  if (track) track.style.background = enabled ? '#6366f1' : '#374151';
  if (thumb) thumb.style.transform = enabled ? 'translateX(20px)' : 'translateX(0)';
  if (label) label.textContent = enabled ? 'Enabled' : 'Disabled';

  const ts = data.tokenStatus || 'ok';
  const dot = $('autopilotStatusDot');
  const lbl = $('autopilotStatusLabel');
  const sub = $('autopilotStatusSub');
  const dotColor = !enabled ? '#6b7280' : ts === 'expired' ? '#f87171' : ts === 'expiring_soon' ? '#fbbf24' : '#10b981';
  if (dot) dot.style.background = dotColor;
  if (lbl) {
    if (!enabled) lbl.textContent = 'Autopilot Paused';
    else if (ts === 'expired') lbl.textContent = 'Autopilot Paused — Token Expired';
    else lbl.textContent = 'Autopilot Active · Runs 24/7 on server';
  }
  if (sub) {
    if (!enabled) { sub.textContent = 'Enable autopilot to start posting new articles automatically. You don\'t need to stay logged in — it runs on the server.'; }
    else if (ts === 'expired') { sub.innerHTML = 'Facebook token has expired. <a href="#" class="ap-reconnect-link" style="color:#f87171;text-decoration:underline;">Reconnect your page</a> to resume.'; sub.querySelector('.ap-reconnect-link')?.addEventListener('click', e => { e.preventDefault(); document.querySelector('[data-tab="connect"]')?.click(); }); }
    else if (ts === 'expiring_soon' && data.connection?.tokenExpiresAt) { const days = Math.ceil((new Date(data.connection.tokenExpiresAt) - Date.now()) / (1000*60*60*24)); sub.textContent = `Next check: ${formatCountdown(ap.nextRunAt)} · Token expires in ${days}d — reconnect soon`; }
    else if (ap.nextRunAt) { sub.textContent = `Next check: ${formatCountdown(ap.nextRunAt)} · Last run: ${ap.lastRunAt ? new Date(ap.lastRunAt).toLocaleString() : 'Never'}`; }
    else sub.textContent = 'Starting soon…';
  }
  const postsEl = $('autopilotPostsToday');
  if (postsEl) postsEl.textContent = data.postsToday ?? '0';

  selectedFeedIds = ap.feedIds === 'all' ? 'all' : (ap.feedIds || 'all');
  const cbList = $('feedCheckboxList');
  const selNote = $('feedSelectionNote');
  const allFeeds = data.feeds || [];
  if (typeof selectedFeedIds === 'string' && selectedFeedIds === 'all') {
    if (cbList) cbList.style.display = 'none';
    if (selNote) selNote.textContent = `Autopilot will rotate through all ${allFeeds.length || 0} RSS feed(s).`;
  } else {
    if (cbList) {
      cbList.style.display = 'flex';
      cbList.innerHTML = allFeeds.map(f => `
        <label style="display:flex;align-items:center;gap:8px;font-size:13px;color:#d1d5db;cursor:pointer;">
          <input type="checkbox" class="feed-cb" data-feed-id="${esc(f.id)}" ${(selectedFeedIds || []).includes(f.id) ? 'checked' : ''} style="accent-color:#818cf8;">
          ${esc(f.name)}
        </label>`).join('');
    }
    if (selNote) selNote.textContent = `${(selectedFeedIds || []).length} of ${allFeeds.length} feed(s) selected.`;
  }

  renderAutopilotHistory(ap.history || []);
  renderTlAutopilot(data);
}

function renderAutopilotHistory(history) {
  const el = $('autopilotHistory');
  if (!el) return;
  if (!history.length) {
    el.innerHTML = '<div style="font-size:13px;color:#9ca3af;text-align:center;padding:20px 0;">No auto-posts yet. Enable Autopilot and save to get started.</div>';
    return;
  }
  const statusColors = { success: '#10b981', skipped: '#fbbf24', error: '#f87171' };
  el.innerHTML = `<div style="display:flex;flex-direction:column;gap:8px;">${history.slice(0, 10).map(h => {
    const color = statusColors[h.status] || '#6b7280';
    let badge = h.status === 'error' ? 'Error' : h.status === 'skipped' ? 'Skipped' : 'Queued';
    if (h.firstRun) badge += ' · Seeded';
    let title = h.reason ? esc(h.reason) : (h.articleTitle ? esc(stripHtml(h.articleTitle)) : 'No article');
    if (h.newRemaining > 0) title += ` <span style="color:#818cf8;font-size:11px;">(${h.newRemaining} more next cycles)</span>`;
    return `<div style="background:rgba(255,255,255,0.03);border:1px solid rgba(255,255,255,0.07);border-radius:8px;padding:10px 14px;display:flex;align-items:center;gap:12px;flex-wrap:wrap;">
      <div style="width:8px;height:8px;border-radius:50%;background:${color};flex-shrink:0;"></div>
      <div style="flex:1;min-width:0;">
        <div style="font-size:13px;color:#e5e7eb;font-weight:500;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${title}</div>
        <div style="font-size:11px;color:#6b7280;margin-top:2px;">${new Date(h.runAt).toLocaleString()}</div>
      </div>
      <span style="display:inline-block;padding:2px 9px;border-radius:20px;font-size:11px;font-weight:700;background:${color}22;color:${color};">${badge}</span>
    </div>`;
  }).join('')}</div>`;
}

function initAutopilotTab() {
  loadAutopilot();
  if (autopilotPollTimer) clearInterval(autopilotPollTimer);
  autopilotPollTimer = setInterval(loadAutopilot, 30_000);

  const toggle = $('autopilotToggle');
  if (toggle && !toggle._apBound) {
    toggle._apBound = true;
    toggle.addEventListener('change', () => {
      const track = $('autopilotTrack');
      const thumb = $('autopilotThumb');
      const label = $('autopilotToggleLabel');
      const on = toggle.checked;
      if (track) track.style.background = on ? '#6366f1' : '#374151';
      if (thumb) thumb.style.transform = on ? 'translateX(20px)' : 'translateX(0)';
      if (label) label.textContent = on ? 'Enabled' : 'Disabled';
    });
  }

  const btnAll = $('btnFeedAll');
  const btnCustom = $('btnFeedCustom');
  if (btnAll && !btnAll._apBound) {
    btnAll._apBound = true;
    btnAll.addEventListener('click', () => {
      selectedFeedIds = 'all';
      const cbList = $('feedCheckboxList');
      const selNote = $('feedSelectionNote');
      if (cbList) cbList.style.display = 'none';
      if (selNote) selNote.textContent = `Autopilot will rotate through all RSS feeds.`;
    });
  }
  if (btnCustom && !btnCustom._apBound) {
    btnCustom._apBound = true;
    btnCustom.addEventListener('click', () => {
      const allFeeds = autopilotData?.feeds || [];
      if (!allFeeds.length) { showToast('No RSS feeds added yet. Go to the RSS Feeds tab first.', 'yellow'); return; }
      selectedFeedIds = Array.isArray(selectedFeedIds) ? selectedFeedIds : allFeeds.map(f => f.id);
      const cbList = $('feedCheckboxList');
      const selNote = $('feedSelectionNote');
      if (cbList) {
        cbList.style.display = 'flex';
        cbList.innerHTML = allFeeds.map(f => `
          <label style="display:flex;align-items:center;gap:8px;font-size:13px;color:#d1d5db;cursor:pointer;">
            <input type="checkbox" class="feed-cb" data-feed-id="${esc(f.id)}" ${selectedFeedIds.includes(f.id) ? 'checked' : ''} style="accent-color:#818cf8;">
            ${esc(f.name)}
          </label>`).join('');
      }
      if (selNote) selNote.textContent = `${selectedFeedIds.length} of ${allFeeds.length} feed(s) selected.`;
    });
  }

  const btnSave = $('btnSaveAutopilot');
  if (btnSave && !btnSave._apBound) {
    btnSave._apBound = true;
    btnSave.addEventListener('click', saveAutopilotSettings);
  }

  const btnRun = $('btnRunNow');
  if (btnRun && !btnRun._apBound) {
    btnRun._apBound = true;
    btnRun.addEventListener('click', runNow);
  }
}

async function saveAutopilotSettings() {
  const btn = $('btnSaveAutopilot');
  if (btn) { btn.disabled = true; btn.textContent = 'Saving…'; }
  try {
    const enabled = $('autopilotToggle')?.checked ?? false;
    let feedIds = selectedFeedIds;
    if (feedIds !== 'all') {
      feedIds = [...document.querySelectorAll('.feed-cb:checked')].map(cb => cb.dataset.feedId);
      if (!feedIds.length) feedIds = 'all';
    }
    const data = await api('/api/social/autopilot', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ enabled, feedIds }) });
    if (!data.ok) throw new Error(data.error || 'Save failed');
    showToast(enabled ? 'Autopilot enabled! Posts will be generated automatically.' : 'Autopilot disabled.', enabled ? 'green' : 'yellow');
    await loadAutopilot();
  } catch (e) {
    showToast('Failed to save: ' + e.message, 'red');
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = 'Save Settings'; }
  }
}

async function runNow() {
  const btn = $('btnRunNow');
  if (btn) { btn.disabled = true; btn.textContent = 'Generating…'; }
  try {
    const data = await api('/api/social/autopilot/run-now', { method: 'POST' });
    if (!data.ok) throw new Error(data.error || 'Run failed');
    if (data.skipped) { showToast('Skipped: ' + data.reason, 'yellow'); }
    else { showToast('Post generated and added to queue!', 'green'); }
    await loadAutopilot();
  } catch (e) {
    showToast('Failed: ' + e.message, 'red');
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = 'Run Now'; }
  }
}

// ─── New Post Composer ────────────────────────────────────────────────────────
let npAiPanelOpen = false;
let npSelectedMediaType = 'none';

function initNewPostTab() {
  const noConn = $('npNoConn');
  if (noConn) noConn.style.display = status.connection ? 'none' : 'block';
}

$('btnNpAiToggle').addEventListener('click', () => {
  npAiPanelOpen = !npAiPanelOpen;
  const panel = $('npAiPanel');
  const btn = $('btnNpAiToggle');
  panel.style.display = npAiPanelOpen ? 'block' : 'none';
  btn.textContent = npAiPanelOpen ? '✕ Close' : '✦ Write with AI';
  if (npAiPanelOpen) $('npAiTopic').focus();
});

$('btnNpAiRun').addEventListener('click', async () => {
  const topic = $('npAiTopic').value.trim();
  const tone = $('npAiTone').value;
  const errEl = $('npAiErr');
  const btn = $('btnNpAiRun');
  errEl.style.display = 'none';
  if (!topic) { errEl.textContent = 'Please enter a topic.'; errEl.style.display = 'block'; return; }
  btn.disabled = true; btn.textContent = 'Generating…';
  try {
    const data = await api('/api/social/post/generate-content', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ topic, tone }),
    });
    if (!data.ok) throw new Error(data.error || 'Generation failed');
    $('npContent').value = data.content;
    updateNpCharCount(data.content.length);
    $('btnNpAiToggle').click();
    showToast('Content generated! Review and edit before publishing.', 'green');
  } catch (e) {
    errEl.textContent = e.message; errEl.style.display = 'block';
  } finally {
    btn.disabled = false; btn.textContent = 'Generate';
  }
});

$('npAiTopic').addEventListener('keydown', e => { if (e.key === 'Enter') $('btnNpAiRun').click(); });

$('npContent').addEventListener('input', function() { updateNpCharCount(this.value.length); });

function updateNpCharCount(len) {
  const cc = $('npCharCount');
  cc.textContent = `${len} / 63,206`;
  cc.className = 'char-count' + (len > 55000 ? ' near' : '') + (len > 63000 ? ' over' : '');
}

function updateNpMediaPicker(val) {
  npSelectedMediaType = val;
  $('npPhotoUpload').style.display = val === 'photo' ? 'block' : 'none';
  $('npVideoUpload').style.display = val === 'video' ? 'block' : 'none';
}

document.querySelectorAll('[name="npMediaType"]').forEach(radio => {
  radio.addEventListener('change', () => updateNpMediaPicker(radio.value));
  radio.addEventListener('click',  () => updateNpMediaPicker(radio.value));
});

$('npPhotoFile').addEventListener('change', function() {
  const file = this.files[0];
  const nameEl = $('npPhotoName');
  const preview = $('npPhotoPreview');
  const img = $('npPhotoImg');
  if (file) {
    nameEl.textContent = file.name;
    const url = URL.createObjectURL(file);
    img.src = url;
    preview.style.display = 'block';
  } else {
    nameEl.textContent = '';
    preview.style.display = 'none';
  }
});

$('npVideoFile').addEventListener('change', function() {
  const file = this.files[0];
  const nameEl = $('npVideoName');
  if (file) { nameEl.textContent = file.name; }
  else { nameEl.textContent = ''; }
});

async function submitNewPost(opts = {}) {
  const content = $('npContent').value.trim();
  const errEl = $('npErr');
  const msgEl = $('npMsg');
  errEl.style.display = 'none';
  msgEl.style.display = 'none';
  if (!content) { errEl.textContent = 'Post content cannot be empty.'; errEl.style.display = 'block'; return; }

  const schedValue = $('npSchedule').value;
  let scheduledAt = schedValue ? new Date(schedValue).toISOString() : null;
  if (opts.schedule && !scheduledAt) { errEl.textContent = 'Please set a schedule date and time first.'; errEl.style.display = 'block'; return; }
  if (!opts.schedule) scheduledAt = null;

  const btnPublish = $('btnNpPublish');
  const btnSchedule = $('btnNpSchedule');
  const btnDraft = $('btnNpDraft');
  [btnPublish, btnSchedule, btnDraft].forEach(b => { b.disabled = true; });
  btnPublish.textContent = 'Posting…';

  try {
    if (npSelectedMediaType === 'photo') {
      const file = $('npPhotoFile').files[0];
      if (!file) { errEl.textContent = 'Please select an image file.'; errEl.style.display = 'block'; return; }
      if (!status.connection) { errEl.textContent = 'A connected Facebook page is required to publish photos.'; errEl.style.display = 'block'; return; }
      const fd = new FormData();
      fd.append('photo', file);
      fd.append('caption', content);
      if (scheduledAt) { fd.append('scheduledAt', scheduledAt); fd.append('publishNow', 'false'); }
      const data = await fetch('/api/social/post/photo', { method: 'POST', headers: authHeader(), body: fd }).then(r => r.json());
      if (!data.ok) throw new Error(data.error || 'Photo upload failed');
      resetNewPostForm();
      msgEl.style.color = '#10b981';
      msgEl.textContent = scheduledAt ? `Photo scheduled for ${new Date(scheduledAt).toLocaleString()}` : 'Photo published to Facebook!';
      msgEl.style.display = 'block';
      setTimeout(() => { msgEl.style.display = 'none'; }, 5000);
      showToast('Photo published to Facebook!', 'green');
    } else if (npSelectedMediaType === 'video') {
      const file = $('npVideoFile').files[0];
      if (!file) { errEl.textContent = 'Please select a video file.'; errEl.style.display = 'block'; return; }
      if (!status.connection) { errEl.textContent = 'A connected Facebook page is required to publish videos.'; errEl.style.display = 'block'; return; }
      const fd = new FormData();
      fd.append('video', file);
      fd.append('description', content);
      fd.append('title', $('npVideoTitle').value.trim() || '');
      if (scheduledAt) { fd.append('scheduledAt', scheduledAt); fd.append('publishNow', 'false'); }
      const data = await fetch('/api/social/post/video', { method: 'POST', headers: authHeader(), body: fd }).then(r => r.json());
      if (!data.ok) throw new Error(data.error || 'Video upload failed');
      resetNewPostForm();
      msgEl.style.color = '#10b981';
      msgEl.textContent = scheduledAt ? `Video scheduled for ${new Date(scheduledAt).toLocaleString()}` : 'Video published to Facebook!';
      msgEl.style.display = 'block';
      setTimeout(() => { msgEl.style.display = 'none'; }, 5000);
      showToast('Video published to Facebook!', 'green');
    } else {
      const data = await api('/api/social/queue', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content, scheduledAt, publishNow: opts.publishNow || false }),
      });
      if (!data.ok) throw new Error(data.error || 'Failed to save');
      resetNewPostForm();
      if (opts.publishNow) {
        if (data.post.status === 'published') { msgEl.style.color = '#10b981'; msgEl.textContent = 'Post published to Facebook!'; }
        else if (data.post.status === 'failed') { msgEl.style.color = '#f87171'; msgEl.textContent = `Publish failed: ${data.post.error || 'Unknown error'}`; }
        else { msgEl.style.color = '#fbbf24'; msgEl.textContent = 'Post saved. No Facebook page connected yet.'; }
      } else if (opts.schedule) {
        msgEl.style.color = '#818cf8'; msgEl.textContent = `Scheduled for ${new Date(scheduledAt).toLocaleString()}`;
      } else {
        msgEl.style.color = '#9ca3af'; msgEl.textContent = 'Saved as draft.';
      }
      msgEl.style.display = 'block';
      setTimeout(() => { msgEl.style.display = 'none'; }, 5000);
    }
  } catch (e) {
    errEl.textContent = e.message; errEl.style.display = 'block';
  } finally {
    [btnPublish, btnSchedule, btnDraft].forEach(b => { b.disabled = false; });
    btnPublish.textContent = 'Publish Now';
  }
}

function resetNewPostForm() {
  $('npContent').value = '';
  updateNpCharCount(0);
  $('npSchedule').value = '';
  $('npPhotoFile').value = '';
  $('npVideoFile').value = '';
  $('npVideoTitle').value = '';
  $('npPhotoName').textContent = '';
  $('npVideoName').textContent = '';
  $('npPhotoPreview').style.display = 'none';
  npSelectedMediaType = 'none';
  document.querySelector('[name="npMediaType"][value="none"]').checked = true;
  $('npPhotoUpload').style.display = 'none';
  $('npVideoUpload').style.display = 'none';
}

$('btnNpPublish').addEventListener('click', () => submitNewPost({ publishNow: true }));
$('btnNpSchedule').addEventListener('click', () => submitNewPost({ schedule: true }));
$('btnNpDraft').addEventListener('click', () => submitNewPost({ draft: true }));

// ─── Tradelines Tab ────────────────────────────────────────────────────────────
let tlSelectedIds = new Set();
let tlCurrentTradelines = [];
let tlCurrentPage = 1;
let tlCurrentRange = '';
let tlTotalPages = 1;

function tlUpdateSelectedCount() {
  const row = $('tlGenerateRow');
  const countEl = $('tlSelectedCount');
  const n = tlSelectedIds.size;
  if (n > 0) {
    row.style.display = 'flex';
    countEl.textContent = `${n} tradeline${n !== 1 ? 's' : ''} selected`;
  } else {
    row.style.display = 'none';
    countEl.textContent = '';
  }
}

function tlRenderCards(tradelines, append = false) {
  const grid = $('tlCards');
  if (!append) grid.innerHTML = '';
  if (!tradelines.length && !append) {
    $('tlCardGrid').style.display = 'none';
    $('tlEmpty').style.display = 'block';
    return;
  }
  $('tlCardGrid').style.display = 'block';
  $('tlEmpty').style.display = 'none';
  tradelines.forEach(t => {
    const id = `tl_${t.bank || 'x'}_${t.limit || 0}_${t.price || 0}`.replace(/\s+/g, '_');
    const card = document.createElement('label');
    card.style.cssText = 'display:flex;flex-direction:column;gap:6px;background:rgba(255,255,255,0.04);border:1px solid rgba(255,255,255,0.08);border-radius:10px;padding:12px 14px;cursor:pointer;transition:border-color 0.15s;';
    card.innerHTML = `
      <div style="display:flex;align-items:flex-start;gap:8px;">
        <input type="checkbox" class="tl-card-cb" data-idx="${tlCurrentTradelines.length}" style="accent-color:#818cf8;margin-top:3px;flex-shrink:0;">
        <div style="flex:1;min-width:0;">
          <div style="font-size:13px;font-weight:700;color:#e5e7eb;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${esc(t.bank || 'Unknown Bank')}</div>
          ${t.limit ? `<div style="font-size:12px;color:#34d399;margin-top:2px;">💳 $${Number(t.limit).toLocaleString()} limit</div>` : ''}
          ${t.price != null ? `<div style="font-size:12px;color:#d4a853;margin-top:1px;">💰 $${t.price}</div>` : ''}
          ${t.age ? `<div style="font-size:11px;color:#818cf8;margin-top:1px;">📅 ${esc(String(t.age))}</div>` : ''}
          ${t.availability ? `<div style="font-size:11px;color:#60a5fa;margin-top:1px;">👥 ${esc(String(t.availability))}</div>` : ''}
          ${t.statement ? `<div style="font-size:11px;color:#6b7280;margin-top:1px;">Statement: ${esc(t.statement)}</div>` : ''}
        </div>
      </div>`;
    tlCurrentTradelines.push(t);
    const cb = card.querySelector('.tl-card-cb');
    const cbIdx = tlCurrentTradelines.length - 1;
    cb.addEventListener('change', () => {
      const key = `${cbIdx}`;
      if (cb.checked) { tlSelectedIds.add(key); card.style.borderColor = '#818cf8'; }
      else { tlSelectedIds.delete(key); card.style.borderColor = 'rgba(255,255,255,0.08)'; }
      tlUpdateSelectedCount();
    });
    grid.appendChild(card);
  });
}

async function loadTlRanges() {
  try {
    const data = await api('/api/tradelines');
    if (!data.ok) return;
    const sel = $('tlRangeSelect');
    const ranges = data.ranges || [];
    sel.innerHTML = '<option value="">— Select a price range —</option>' +
      ranges.map(r => `<option value="${esc(r.id)}">${esc(r.label || r.id)}</option>`).join('');
  } catch (_) {}
}

async function loadTlRange(rangeId, page = 1) {
  if (!rangeId) return;
  tlCurrentRange = rangeId;
  tlCurrentPage = page;
  if (page === 1) { tlCurrentTradelines = []; tlSelectedIds.clear(); tlUpdateSelectedCount(); }
  $('tlLoading').style.display = 'block';
  $('tlEmpty').style.display = 'none';
  $('tlCardGrid').style.display = page === 1 ? 'none' : $('tlCardGrid').style.display;
  const btn = $('btnLoadTradelines');
  btn.disabled = true; btn.textContent = 'Loading…';
  try {
    const bank = ($('tlBankFilter')?.value || '').trim();
    const sort = $('tlSortSelect')?.value || '';
    let url = `/api/tradelines?range=${encodeURIComponent(rangeId)}&page=${page}&perPage=20`;
    if (bank) url += `&bank=${encodeURIComponent(bank)}`;
    if (sort) url += `&sort=${encodeURIComponent(sort)}`;
    const data = await api(url);
    if (!data.ok) throw new Error(data.error || 'Failed to load');
    const tradelines = data.tradelines || [];
    tlTotalPages = data.totalPages || 1;
    const title = $('tlGridTitle');
    const bankLabel = bank ? ` · ${bank}` : '';
    title.textContent = `${data.totalItems || tradelines.length} tradelines in ${data.range?.label || rangeId}${bankLabel}`;

    // Populate bank filter dropdown (only on page 1 to avoid resetting user's choice)
    if (page === 1 && data.banks && $('tlBankFilter')) {
      const sel = $('tlBankFilter');
      const cur = sel.value;
      sel.innerHTML = '<option value="">All banks</option>' +
        (data.banks || []).map(b => `<option value="${esc(b.bank)}">${esc(b.bank)} (${b.count})</option>`).join('');
      sel.value = cur; // restore selection if still valid
    }

    tlRenderCards(tradelines, page > 1);
    const moreRow = $('tlLoadMore');
    moreRow.style.display = tlCurrentPage < tlTotalPages ? 'block' : 'none';
  } catch (e) {
    $('tlEmpty').textContent = e.message;
    $('tlEmpty').style.display = 'block';
    $('tlCardGrid').style.display = 'none';
  } finally {
    $('tlLoading').style.display = 'none';
    btn.disabled = false; btn.textContent = 'Load';
  }
}

function initTradelinesTab() {
  if (!$('tlRangeSelect').options.length || $('tlRangeSelect').options.length <= 1) loadTlRanges();
}

$('btnLoadTradelines').addEventListener('click', () => {
  const rangeId = $('tlRangeSelect').value;
  if (!rangeId) { showToast('Select a price range first.', 'yellow'); return; }
  loadTlRange(rangeId, 1);
});

$('tlRangeSelect').addEventListener('change', () => {
  const rangeId = $('tlRangeSelect').value;
  if (rangeId) loadTlRange(rangeId, 1);
});

$('btnTlSelectAll').addEventListener('click', () => {
  $('tlCards').querySelectorAll('.tl-card-cb').forEach((cb, i) => {
    cb.checked = true;
    tlSelectedIds.add(String(i));
    cb.closest('label').style.borderColor = '#818cf8';
  });
  tlUpdateSelectedCount();
});

$('btnTlClearSel').addEventListener('click', () => {
  $('tlCards').querySelectorAll('.tl-card-cb').forEach(cb => {
    cb.checked = false;
    cb.closest('label').style.borderColor = 'rgba(255,255,255,0.08)';
  });
  tlSelectedIds.clear();
  tlUpdateSelectedCount();
});

$('btnTlMore').addEventListener('click', () => {
  if (tlCurrentPage < tlTotalPages) loadTlRange(tlCurrentRange, tlCurrentPage + 1);
});

$('btnTlGenerate').addEventListener('click', async () => {
  const errEl = $('tlGenErr');
  errEl.style.display = 'none';
  const selected = [...tlSelectedIds].map(idx => tlCurrentTradelines[parseInt(idx, 10)]).filter(Boolean);
  if (!selected.length) { errEl.textContent = 'Select at least one tradeline first.'; errEl.style.display = 'block'; return; }
  const btn = $('btnTlGenerate');
  btn.disabled = true; btn.textContent = 'Generating…';
  try {
    const data = await api('/api/social/generate-tradeline-post', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ tradelines: selected }),
    });
    if (!data.ok) throw new Error(data.error || 'Generation failed');
    $('tlPostContent').value = data.content;
    const len = data.content.length;
    const cc = $('tlCharCount');
    cc.textContent = `${len} / 63,206`;
    cc.className = 'char-count' + (len > 55000 ? ' near' : '');
    $('tlPostEditor').style.display = 'block';
    $('tlPostEditor').scrollIntoView({ behavior: 'smooth', block: 'start' });
    showToast('Tradeline post generated!', 'green');
  } catch (e) {
    errEl.textContent = e.message; errEl.style.display = 'block';
  } finally {
    btn.disabled = false; btn.textContent = '✦ Generate with AI';
  }
});

$('tlPostContent').addEventListener('input', function() {
  const len = this.value.length;
  const cc = $('tlCharCount');
  cc.textContent = `${len} / 63,206`;
  cc.className = 'char-count' + (len > 55000 ? ' near' : '') + (len > 63000 ? ' over' : '');
});

async function submitTlPost(opts = {}) {
  const content = $('tlPostContent').value.trim();
  const errEl = $('tlSaveErr');
  const msgEl = $('tlSaveMsg');
  errEl.style.display = 'none'; msgEl.style.display = 'none';
  if (!content) { errEl.textContent = 'Post content is empty.'; errEl.style.display = 'block'; return; }
  const schedValue = $('tlScheduleInput').value;
  let scheduledAt = schedValue ? new Date(schedValue).toISOString() : null;
  if (opts.schedule && !scheduledAt) { errEl.textContent = 'Set a date and time to schedule.'; errEl.style.display = 'block'; return; }
  if (!opts.schedule) scheduledAt = null;
  const btnP = $('btnTlPublish'); const btnS = $('btnTlSchedule'); const btnD = $('btnTlDraft');
  [btnP, btnS, btnD].forEach(b => { b.disabled = true; });
  try {
    const data = await api('/api/social/queue', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content, scheduledAt, publishNow: opts.publishNow || false, source: 'tradeline', articleTitle: 'Tradeline Marketing Post' }),
    });
    if (!data.ok) throw new Error(data.error || 'Failed to save');
    if (opts.publishNow) {
      if (data.post.status === 'published') { msgEl.style.color = '#10b981'; msgEl.textContent = 'Published to Facebook!'; }
      else if (data.post.status === 'failed') { msgEl.style.color = '#f87171'; msgEl.textContent = `Publish failed: ${data.post.error || 'Unknown error'}`; }
      else { msgEl.style.color = '#fbbf24'; msgEl.textContent = 'Saved. No Facebook page connected yet.'; }
    } else if (opts.schedule) {
      msgEl.style.color = '#818cf8'; msgEl.textContent = `Scheduled for ${new Date(scheduledAt).toLocaleString()}`;
    } else {
      msgEl.style.color = '#9ca3af'; msgEl.textContent = 'Saved as draft.';
    }
    msgEl.style.display = 'block';
    setTimeout(() => { msgEl.style.display = 'none'; }, 5000);
    $('tlPostContent').value = ''; $('tlScheduleInput').value = '';
    $('tlCharCount').textContent = '0 / 63,206'; $('tlPostEditor').style.display = 'none';
    tlSelectedIds.clear(); $('tlCards').querySelectorAll('.tl-card-cb').forEach(cb => { cb.checked = false; cb.closest('label').style.borderColor = 'rgba(255,255,255,0.08)'; });
    tlUpdateSelectedCount();
  } catch (e) {
    errEl.textContent = e.message; errEl.style.display = 'block';
  } finally {
    [btnP, btnS, btnD].forEach(b => { b.disabled = false; });
    btnP.textContent = 'Publish Now'; btnS.textContent = 'Schedule'; btnD.textContent = 'Save Draft';
  }
}

$('btnTlPublish').addEventListener('click', () => submitTlPost({ publishNow: true }));
$('btnTlSchedule').addEventListener('click', () => submitTlPost({ schedule: true }));
$('btnTlDraft').addEventListener('click', () => submitTlPost({}));

// ─── Tradeline Autopilot UI ────────────────────────────────────────────────────
function renderTlAutopilot(data) {
  const ta = (data.autopilot || {}).tradelineAutopilot || {};
  const enabled = !!ta.enabled;
  const toggle = $('tlApToggle');
  const track = $('tlApTrack');
  const thumb = $('tlApThumb');
  const label = $('tlApToggleLabel');
  if (toggle) toggle.checked = enabled;
  if (track) track.style.background = enabled ? '#10b981' : '#374151';
  if (thumb) thumb.style.transform = enabled ? 'translateX(20px)' : 'translateX(0)';
  if (label) label.textContent = enabled ? 'Enabled' : 'Disabled';

  const freq = $('tlApFreq');
  const hourFrom = $('tlApHourFrom');
  const hourTo = $('tlApHourTo');
  const day = $('tlApDay');
  if (freq && ta.postsPerWeek != null) freq.value = String(ta.postsPerWeek);
  if (hourFrom && ta.hourFrom != null) hourFrom.value = String(ta.hourFrom);
  else if (hourFrom && ta.preferredHour != null) hourFrom.value = String(ta.preferredHour);
  if (hourTo && ta.hourTo != null) hourTo.value = String(ta.hourTo);
  if (day && ta.preferredDay != null) day.value = String(ta.preferredDay);

  const dot = $('tlApStatusDot');
  const lbl = $('tlApStatusLabel');
  const sub = $('tlApStatusSub');
  if (dot) dot.style.background = enabled ? '#10b981' : '#6b7280';
  if (lbl) lbl.textContent = enabled ? '📈 Tradeline Autopilot Active' : 'Tradeline Autopilot Paused';
  if (sub) {
    if (!enabled) { sub.textContent = 'Enable to auto-post tradeline inventory on a recurring schedule.'; }
    else if (ta.nextRunAt) {
      const diff = new Date(ta.nextRunAt) - Date.now();
      let countdown = '';
      if (diff > 0) { const h = Math.floor(diff/3600000); const m = Math.floor((diff%3600000)/60000); countdown = h > 0 ? ` · Next post in ${h}h ${m}m` : ` · Next post in ${m}m`; }
      const lastInfo = ta.lastPostedAt ? ` · Last posted: ${new Date(ta.lastPostedAt).toLocaleString()}` : '';
      sub.textContent = `${ta.postsPerWeek || 3}x/week${countdown}${lastInfo}`;
    } else { sub.textContent = 'Starting soon…'; }
  }
}

const tlApToggle = $('tlApToggle');
if (tlApToggle && !tlApToggle._tlBound) {
  tlApToggle._tlBound = true;
  tlApToggle.addEventListener('change', () => {
    const on = tlApToggle.checked;
    $('tlApTrack').style.background = on ? '#10b981' : '#374151';
    $('tlApThumb').style.transform = on ? 'translateX(20px)' : 'translateX(0)';
    $('tlApToggleLabel').textContent = on ? 'Enabled' : 'Disabled';
  });
}

const btnSaveTlAp = $('btnSaveTlAutopilot');
if (btnSaveTlAp && !btnSaveTlAp._tlBound) {
  btnSaveTlAp._tlBound = true;
  btnSaveTlAp.addEventListener('click', async () => {
    btnSaveTlAp.disabled = true; btnSaveTlAp.textContent = 'Saving…';
    try {
      const enabled = $('tlApToggle').checked;
      const postsPerWeek = Math.max(1, parseInt($('tlApFreq').value, 10) || 3);
      const hourFrom = parseInt($('tlApHourFrom').value, 10) || 10;
      const hourTo = parseInt($('tlApHourTo').value, 10) || 14;
      const preferredDay = parseInt($('tlApDay')?.value ?? '-1', 10);
      const data = await api('/api/social/autopilot', {
        method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tradelineAutopilot: { enabled, postsPerWeek, hourFrom, hourTo, preferredDay } }),
      });
      if (!data.ok) throw new Error(data.error || 'Save failed');
      renderTlAutopilot(data);
      showToast(enabled ? 'Tradeline autopilot enabled!' : 'Tradeline autopilot disabled.', enabled ? 'green' : 'yellow');
    } catch (e) {
      showToast('Failed: ' + e.message, 'red');
    } finally {
      btnSaveTlAp.disabled = false; btnSaveTlAp.textContent = 'Save Tradeline Autopilot';
    }
  });
}

const btnTlApRunNow = $('btnTlApRunNow');
if (btnTlApRunNow && !btnTlApRunNow._tlBound) {
  btnTlApRunNow._tlBound = true;
  btnTlApRunNow.addEventListener('click', async () => {
    btnTlApRunNow.disabled = true; btnTlApRunNow.textContent = 'Generating…';
    try {
      const data = await api('/api/social/autopilot/run-tradeline', { method: 'POST' });
      if (!data.ok) throw new Error(data.error || 'Run failed');
      showToast('Tradeline post generated and added to queue!', 'green');
      await loadAutopilot();
    } catch (e) {
      showToast('Failed: ' + e.message, 'red');
    } finally {
      btnTlApRunNow.disabled = false; btnTlApRunNow.textContent = 'Post One Now';
    }
  });
}

// ── Apply Best Times ───────────────────────────────────────────────────────
const btnApplyBestTimes = $('btnApplyBestTimes');
if (btnApplyBestTimes && !btnApplyBestTimes._bound) {
  btnApplyBestTimes._bound = true;
  btnApplyBestTimes.addEventListener('click', () => {
    const freq = $('tlApFreq');
    const hourFrom = $('tlApHourFrom');
    const hourTo = $('tlApHourTo');
    const day = $('tlApDay');
    if (freq) freq.value = '5';
    if (hourFrom) hourFrom.value = '10';
    if (hourTo) hourTo.value = '14';
    if (day) day.value = '3'; // Wednesday
    showToast('Best times applied — Wed, 10AM–2PM, 5x/week. Save to confirm.', 'green');
  });
}

// ── New Post RSS Article Picker ────────────────────────────────────────────
// Clicking "Pick Article" in New Post opens the shared article picker overlay.
// Selecting an item calls selectArticleForCompose() which now routes to New Post.
const btnNpPickArticle = $('btnNpPickArticle');
if (btnNpPickArticle && !btnNpPickArticle._bound) {
  btnNpPickArticle._bound = true;
  btnNpPickArticle.addEventListener('click', () => {
    populatePickerSelect();
    $('articlePickerOverlay').style.display = 'flex';
  });
}
const btnNpClearArticle = $('btnNpClearArticle');
if (btnNpClearArticle && !btnNpClearArticle._bound) {
  btnNpClearArticle._bound = true;
  btnNpClearArticle.addEventListener('click', () => {
    npSelectedArticle = null;
    $('npSelectedArticleBar').style.display = 'none';
    $('npArticleLinkRow').style.display = 'none';
    $('npArticleUrl').value = '';
  });
}

// ── Bank filter & sort change handlers ────────────────────────────────────
const tlBankFilter = $('tlBankFilter');
const tlSortSelect = $('tlSortSelect');
if (tlBankFilter && !tlBankFilter._bound) {
  tlBankFilter._bound = true;
  tlBankFilter.addEventListener('change', () => {
    const rangeId = $('tlRangeSelect').value;
    if (rangeId) loadTlRange(rangeId, 1);
  });
}
if (tlSortSelect && !tlSortSelect._bound) {
  tlSortSelect._bound = true;
  tlSortSelect.addEventListener('change', () => {
    const rangeId = $('tlRangeSelect').value;
    if (rangeId) loadTlRange(rangeId, 1);
  });
}

// ── Leads & Comments auto-polling ─────────────────────────────────────────
let leadsPollingInterval = null;
const LEADS_POLL_MS = 45000;

function startLeadsPolling() {
  if (leadsPollingInterval) return;
  if (!status.connection) return;
  const dot = $('leadsRefreshDot');
  const lbl = $('leadsRefreshLabel');
  let tick = 0;
  const updateBadge = () => {
    const secs = Math.round((LEADS_POLL_MS - (tick % LEADS_POLL_MS)) / 1000);
    if (dot) dot.style.background = '#10b981';
    if (lbl) lbl.textContent = `Auto-refreshing · next in ${secs}s`;
  };
  updateBadge();
  const ticker = setInterval(updateBadge, 5000);
  leadsPollingInterval = setInterval(async () => {
    updateBadge();
    try { await loadLeads(); } catch (_) {}
    try { await loadComments(); } catch (_) {}
  }, LEADS_POLL_MS);
  leadsPollingInterval._ticker = ticker;
}

function stopLeadsPolling() {
  if (leadsPollingInterval) {
    clearInterval(leadsPollingInterval);
    if (leadsPollingInterval._ticker) clearInterval(leadsPollingInterval._ticker);
    leadsPollingInterval = null;
  }
  const dot = $('leadsRefreshDot');
  const lbl = $('leadsRefreshLabel');
  if (dot) dot.style.background = '#6b7280';
  if (lbl) lbl.textContent = 'Auto-refresh paused';
}

init();
