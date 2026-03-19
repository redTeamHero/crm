import { api, authHeader } from '/common.js';

const $ = id => document.getElementById(id);

const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

let status = {};
let feeds = [];
let selectedArticle = null;
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
  if (tab === 'feeds' && feeds.length === 0) loadFeeds();
  if (tab === 'queue') loadQueue();
  if (tab === 'autopilot') initAutopilotTab();
  if (tab === 'leads') initLeadsTab();
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
    el.innerHTML = `<span style="color:#34d399;font-weight:600;">● Connected:</span> <span style="color:#e5e7eb;">${esc(status.connection.pageName)}</span>`;
    statsEl.style.display = 'block';
    statsEl.textContent = `${status.scheduledCount} scheduled · ${status.publishedCount} published`;
  } else {
    el.innerHTML = `<span style="color:#f87171;font-weight:600;">● Not Connected</span>`;
    statsEl.style.display = 'none';
  }
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

function renderConnectTab() {
  const body = $('connectBody');
  if (status.connection) {
    const conn = status.connection;
    const expiryStr = conn.tokenExpiresAt ? `Token expires ${new Date(conn.tokenExpiresAt).toLocaleDateString()}` : '';
    const scopesTags = (conn.grantedScopes || []).map(s => `<span style="display:inline-block;background:rgba(99,102,241,0.12);color:#818cf8;padding:1px 7px;border-radius:4px;font-size:10px;font-weight:600;margin:1px;">${esc(s)}</span>`).join('');
    body.innerHTML = `
      <div style="display:flex;align-items:center;gap:16px;background:rgba(16,185,129,0.08);border:1px solid rgba(16,185,129,0.2);border-radius:12px;padding:20px 24px;">
        <div style="width:48px;height:48px;border-radius:50%;background:#1877f2;display:flex;align-items:center;justify-content:center;flex-shrink:0;">
          <svg width="26" height="26" viewBox="0 0 24 24" fill="#fff"><path d="M18 2h-3a5 5 0 0 0-5 5v3H7v4h3v8h4v-8h3l1-4h-4V7a1 1 0 0 1 1-1h3z"/></svg>
        </div>
        <div style="flex:1;min-width:0;">
          <div style="font-size:15px;font-weight:700;color:#e5e7eb;">${esc(conn.pageName)}</div>
          <div style="font-size:12px;color:#9ca3af;margin-top:2px;">Page ID: ${esc(conn.pageId)} · Connected ${new Date(conn.connectedAt).toLocaleDateString()}${conn.connectedByUserId ? ` by ${esc(conn.connectedByUserId)}` : ''}</div>
          ${expiryStr ? `<div style="font-size:11px;color:#6b7280;margin-top:2px;">${esc(expiryStr)}</div>` : ''}
          ${scopesTags ? `<div style="margin-top:6px;">${scopesTags}</div>` : ''}
        </div>
        <button id="btnDisconnect" type="button" style="background:rgba(239,68,68,0.15);border:1px solid rgba(239,68,68,0.3);color:#f87171;padding:8px 16px;border-radius:8px;font-size:13px;font-weight:600;cursor:pointer;white-space:nowrap;">Disconnect</button>
      </div>
      <p style="font-size:13px;color:#9ca3af;margin-top:12px;">Your page is connected. You can now schedule and publish posts from the <strong style="color:#e5e7eb;">Generate Post</strong> and <strong style="color:#e5e7eb;">Post Queue</strong> tabs, or pull leads and comments from the <strong style="color:#e5e7eb;">Leads &amp; Comments</strong> tab.</p>`;
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
        <div style="font-size:13px;font-weight:600;color:#e5e7eb;margin-bottom:4px;">${esc(item.title)}</div>
        ${item.pubDate ? `<div style="font-size:11px;color:#6b7280;margin-bottom:4px;">${new Date(item.pubDate).toLocaleDateString()}</div>` : ''}
        <div style="font-size:12px;color:#9ca3af;line-height:1.5;">${esc((item.contentSnippet || '').slice(0, 180))}${item.contentSnippet?.length > 180 ? '…' : ''}</div>
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

// ─── Compose ──────────────────────────────────────────────────────────────────
function selectArticleForCompose(article) {
  selectedArticle = article;
  const bar = $('selectedArticleBar');
  bar.style.display = 'flex';
  $('selectedArticleTitle').textContent = article.title;
  $('composeArticleLink').style.display = 'block';
  $('composeArticleUrl').value = article.link || '';
  updatePreviewLink(article.link);
  document.querySelectorAll('.sm-tab').forEach(b => b.classList.remove('active'));
  document.querySelector('[data-tab="compose"]').classList.add('active');
  document.querySelectorAll('.sm-section').forEach(s => s.classList.remove('active'));
  $('tab-compose').classList.add('active');
}

$('btnClearArticle').addEventListener('click', () => {
  selectedArticle = null;
  $('selectedArticleBar').style.display = 'none';
  $('composeArticleLink').style.display = 'none';
  $('composeArticleUrl').value = '';
  updatePreviewLink('');
});

$('composeContent').addEventListener('input', function() {
  updateComposePreview(this.value);
  const len = this.value.length;
  const cc = $('composeCharCount');
  cc.textContent = `${len} / 63,206`;
  cc.className = 'char-count' + (len > 55000 ? ' near' : '') + (len > 63000 ? ' over' : '');
});

$('composeArticleUrl').addEventListener('input', function() { updatePreviewLink(this.value); });

function updateComposePreview(text) {
  const el = $('previewContent');
  el.style.fontStyle = text ? 'normal' : 'italic';
  el.style.color = text ? '#e4e6eb' : '#b0b3b8';
  el.textContent = text || 'Your post will appear here…';
}

function updatePreviewLink(url) {
  const el = $('previewLink');
  if (!url) { el.style.display = 'none'; return; }
  try {
    const u = new URL(url);
    el.style.display = 'flex';
    $('previewLinkDomain').textContent = u.hostname;
    $('previewLinkTitle').textContent = selectedArticle?.title || u.href;
  } catch (_) { el.style.display = 'none'; }
}

$('btnAiGenerate').addEventListener('click', async () => {
  const btn = $('btnAiGenerate');
  const errEl = $('composeErr');
  errEl.style.display = 'none';
  if (!selectedArticle && !$('composeContent').value.trim()) {
    errEl.textContent = 'Please select an article from your RSS feeds first, or write content in the post box.'; errEl.style.display = 'block'; return;
  }
  const article = selectedArticle || { title: 'Credit Repair Tips', contentSnippet: $('composeContent').value.slice(0, 400), link: '' };
  btn.disabled = true; btn.textContent = 'Generating…';
  try {
    const data = await api('/api/social/generate-post', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: article.title, contentSnippet: article.contentSnippet || article.content, link: article.link }),
    });
    if (!data.ok) throw new Error(data.error || 'Generation failed');
    $('composeContent').value = data.content;
    updateComposePreview(data.content);
    const len = data.content.length;
    const cc = $('composeCharCount');
    cc.textContent = `${len} / 63,206`;
    cc.className = 'char-count' + (len > 55000 ? ' near' : '');
    if (article.link) { $('composeArticleLink').style.display = 'block'; $('composeArticleUrl').value = article.link; updatePreviewLink(article.link); }
    showToast('Post generated! Review and edit before scheduling.', 'green');
  } catch (e) {
    errEl.textContent = e.message; errEl.style.display = 'block';
  } finally {
    btn.disabled = false; btn.textContent = 'Generate with AI';
  }
});

$('btnPickArticle').addEventListener('click', () => {
  populatePickerSelect();
  $('articlePickerOverlay').style.display = 'flex';
});
$('btnCloseArticlePicker').addEventListener('click', () => { $('articlePickerOverlay').style.display = 'none'; });
$('articlePickerOverlay').addEventListener('click', e => { if (e.target === $('articlePickerOverlay')) $('articlePickerOverlay').style.display = 'none'; });

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
        <div style="font-size:13px;font-weight:600;color:#e5e7eb;margin-bottom:4px;">${esc(item.title)}</div>
        ${item.pubDate ? `<div style="font-size:11px;color:#6b7280;margin-bottom:3px;">${new Date(item.pubDate).toLocaleDateString()}</div>` : ''}
        <div style="font-size:12px;color:#9ca3af;">${esc((item.contentSnippet || '').slice(0, 140))}…</div>
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

async function savePost(opts = {}) {
  const content = $('composeContent').value.trim();
  const errEl = $('composeErr');
  errEl.style.display = 'none';
  if (!content) { errEl.textContent = 'Post content cannot be empty.'; errEl.style.display = 'block'; return; }
  const schedValue = $('composeSchedule').value;
  let scheduledAt = null;
  if (schedValue) { scheduledAt = new Date(schedValue).toISOString(); }
  if (opts.schedule && !scheduledAt) { errEl.textContent = 'Please set a schedule date and time first.'; errEl.style.display = 'block'; return; }
  if (!opts.schedule) scheduledAt = null;
  const articleUrl = $('composeArticleUrl').value.trim() || null;
  const msg = $('composeSaveMsg');
  msg.style.display = 'none';
  try {
    const data = await api('/api/social/queue', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content, articleUrl, articleTitle: selectedArticle?.title || null, scheduledAt, publishNow: opts.publishNow || false }),
    });
    if (!data.ok) throw new Error(data.error || 'Failed to save');
    $('composeContent').value = '';
    updateComposePreview('');
    $('composeSchedule').value = '';
    $('composeCharCount').textContent = '0 / 63,206';
    $('composeCharCount').className = 'char-count';
    $('btnClearArticle').click();
    if (opts.publishNow) {
      if (data.post.status === 'published') { msg.textContent = 'Post published to Facebook!'; msg.style.color = '#10b981'; }
      else if (data.post.status === 'failed') { msg.textContent = `Publish failed: ${data.post.error || 'Unknown error'}`; msg.style.color = '#f87171'; }
      else { msg.textContent = 'Post saved. No Facebook page connected yet.'; msg.style.color = '#fbbf24'; }
    } else if (opts.schedule) {
      msg.textContent = `Scheduled for ${new Date(scheduledAt).toLocaleString()}`;  msg.style.color = '#818cf8';
    } else {
      msg.textContent = 'Saved as draft.'; msg.style.color = '#9ca3af';
    }
    msg.style.display = 'block';
    setTimeout(() => { msg.style.display = 'none'; }, 4000);
  } catch (e) {
    errEl.textContent = e.message; errEl.style.display = 'block';
  }
}

$('btnSaveDraft').addEventListener('click', () => savePost({ draft: true }));
$('btnSchedulePost').addEventListener('click', () => savePost({ schedule: true }));
$('btnPublishNowCompose').addEventListener('click', () => savePost({ publishNow: true }));

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
            ${p.source === 'autopilot' ? `<span style="display:inline-block;padding:2px 8px;border-radius:20px;font-size:10px;font-weight:700;background:rgba(99,102,241,0.15);color:#818cf8;border:1px solid rgba(99,102,241,0.3);">⚡ Autopilot</span>` : ''}
            ${p.scheduledAt ? `<span style="font-size:12px;color:#9ca3af;">Scheduled: ${new Date(p.scheduledAt).toLocaleString()}</span>` : ''}
            ${p.publishedAt ? `<span style="font-size:12px;color:#9ca3af;">Published: ${new Date(p.publishedAt).toLocaleString()}</span>` : ''}
            ${p.articleTitle ? `<span style="font-size:11px;color:#6b7280;">From: ${esc(p.articleTitle.slice(0, 40))}…</span>` : ''}
          </div>
          <div style="font-size:13px;color:#e5e7eb;line-height:1.6;max-height:80px;overflow:hidden;text-overflow:ellipsis;">${esc(p.content.slice(0, 300))}${p.content.length > 300 ? '…' : ''}</div>
          ${p.articleUrl ? `<a href="${esc(p.articleUrl)}" target="_blank" style="font-size:11px;color:#818cf8;text-decoration:underline;margin-top:4px;display:inline-block;">${esc(p.articleUrl.slice(0, 60))}…</a>` : ''}
          ${p.error ? `<div style="margin-top:6px;font-size:12px;color:#f87171;">Error: ${esc(p.error)}</div>` : ''}
          ${p.fbPostId ? `<div style="margin-top:4px;font-size:11px;color:#6b7280;">FB Post ID: ${esc(p.fbPostId)}</div>` : ''}
        </div>
        <div style="display:flex;flex-direction:column;gap:6px;flex-shrink:0;">
          ${p.status !== 'published' ? `<button class="btn-publish-now btn-secondary" data-id="${esc(p.id)}" style="font-size:11px;padding:4px 10px;white-space:nowrap;">Post Now</button>` : ''}
          ${p.status === 'draft' || p.status === 'failed' ? `<button class="btn-queue-schedule btn-secondary" data-id="${esc(p.id)}" data-content="${esc(p.content)}" style="font-size:11px;padding:4px 10px;white-space:nowrap;">Edit/Schedule</button>` : ''}
          <button class="btn-del-post" data-id="${esc(p.id)}" style="background:rgba(239,68,68,0.12);border:1px solid rgba(239,68,68,0.2);color:#f87171;padding:4px 10px;border-radius:7px;font-size:11px;cursor:pointer;white-space:nowrap;">Delete</button>
        </div>
      </div>
    </div>`).join('');

  el.querySelectorAll('.btn-publish-now').forEach(btn => btn.addEventListener('click', () => publishQueuePost(btn.dataset.id)));
  el.querySelectorAll('.btn-del-post').forEach(btn => btn.addEventListener('click', () => deleteQueuePost(btn.dataset.id)));
  el.querySelectorAll('.btn-queue-schedule').forEach(btn => btn.addEventListener('click', () => {
    $('composeContent').value = decodeURIComponent(btn.dataset.content || '');
    updateComposePreview($('composeContent').value);
    document.querySelectorAll('.sm-tab').forEach(b => b.classList.remove('active'));
    document.querySelector('[data-tab="compose"]').classList.add('active');
    document.querySelectorAll('.sm-section').forEach(s => s.classList.remove('active'));
    $('tab-compose').classList.add('active');
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
  } else {
    $('leadsNoConn').style.display = 'none';
    $('leadsSection').style.display = 'block';
    $('commentsSection').style.display = 'block';
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
      list.innerHTML = '<div style="color:#9ca3af;font-size:13px;text-align:center;padding:24px 0;">No lead form submissions found. Make sure your page has active lead generation forms with submissions.</div>';
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
    list.innerHTML = `<div style="color:#f87171;font-size:13px;text-align:center;padding:16px;">${esc(e.message)}</div>`;
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
      list.innerHTML = '<div style="color:#9ca3af;font-size:13px;text-align:center;padding:24px 0;">No recent comments found on your page posts.</div>';
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
    list.innerHTML = `<div style="color:#f87171;font-size:13px;text-align:center;padding:16px;">${esc(e.message)}</div>`;
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
let selectedPpd = 1;

const ppdHints = { 1: 'One post every 24 hours', 2: 'One post every 12 hours', 3: 'One post every 8 hours', 4: 'One post every 6 hours' };

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

  const dot = $('autopilotStatusDot');
  const lbl = $('autopilotStatusLabel');
  const sub = $('autopilotStatusSub');
  if (dot) dot.style.background = enabled ? '#10b981' : '#6b7280';
  if (lbl) lbl.textContent = enabled ? 'Autopilot Active' : 'Autopilot Paused';
  if (sub) {
    if (enabled && ap.nextRunAt) sub.textContent = `Next post: ${formatCountdown(ap.nextRunAt)} · Last run: ${ap.lastRunAt ? new Date(ap.lastRunAt).toLocaleString() : 'Never'}`;
    else if (enabled) sub.textContent = 'Starting soon…';
    else sub.textContent = 'Enable autopilot to start generating posts automatically.';
  }
  const postsEl = $('autopilotPostsToday');
  if (postsEl) postsEl.textContent = data.postsToday ?? '0';

  selectedPpd = ap.postsPerDay || 1;
  document.querySelectorAll('.ppd-btn').forEach(b => {
    const active = Number(b.dataset.ppd) === selectedPpd;
    b.style.background = active ? 'rgba(99,102,241,0.15)' : 'transparent';
    b.style.borderColor = active ? 'rgba(99,102,241,0.4)' : 'rgba(255,255,255,0.08)';
    b.style.color = active ? '#818cf8' : '#9ca3af';
  });
  const hintEl = $('postsPerDayHint');
  if (hintEl) hintEl.textContent = ppdHints[selectedPpd] || '';

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
}

function renderAutopilotHistory(history) {
  const el = $('autopilotHistory');
  if (!el) return;
  if (!history.length) {
    el.innerHTML = '<div style="font-size:13px;color:#9ca3af;text-align:center;padding:20px 0;">No auto-posts yet. Enable Autopilot and save to get started.</div>';
    return;
  }
  const statusColors = { success: '#10b981', skipped: '#fbbf24', error: '#f87171' };
  const statusLabels = { success: 'Queued', skipped: 'Skipped', error: 'Error' };
  el.innerHTML = `<div style="display:flex;flex-direction:column;gap:8px;">${history.slice(0, 10).map(h => `
    <div style="background:rgba(255,255,255,0.03);border:1px solid rgba(255,255,255,0.07);border-radius:8px;padding:10px 14px;display:flex;align-items:center;gap:12px;flex-wrap:wrap;">
      <div style="width:8px;height:8px;border-radius:50%;background:${statusColors[h.status] || '#6b7280'};flex-shrink:0;"></div>
      <div style="flex:1;min-width:0;">
        <div style="font-size:13px;color:#e5e7eb;font-weight:500;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${h.articleTitle ? esc(h.articleTitle) : (h.reason ? esc(h.reason) : 'No article')}</div>
        <div style="font-size:11px;color:#6b7280;margin-top:2px;">${new Date(h.runAt).toLocaleString()}</div>
      </div>
      <span style="display:inline-block;padding:2px 9px;border-radius:20px;font-size:11px;font-weight:700;background:${statusColors[h.status]}22;color:${statusColors[h.status] || '#9ca3af'};">${statusLabels[h.status] || h.status}</span>
    </div>`).join('')}</div>`;
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

  document.querySelectorAll('.ppd-btn').forEach(btn => {
    if (!btn._apBound) {
      btn._apBound = true;
      btn.addEventListener('click', () => {
        selectedPpd = Number(btn.dataset.ppd);
        document.querySelectorAll('.ppd-btn').forEach(b => {
          const active = Number(b.dataset.ppd) === selectedPpd;
          b.style.background = active ? 'rgba(99,102,241,0.15)' : 'transparent';
          b.style.borderColor = active ? 'rgba(99,102,241,0.4)' : 'rgba(255,255,255,0.08)';
          b.style.color = active ? '#818cf8' : '#9ca3af';
        });
        const hintEl = $('postsPerDayHint');
        if (hintEl) hintEl.textContent = ppdHints[selectedPpd] || '';
      });
    }
  });

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
    const data = await api('/api/social/autopilot', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ enabled, postsPerDay: selectedPpd, feedIds }) });
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

init();
