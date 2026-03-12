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
  if (tab === 'feeds' && feeds.length === 0) loadFeeds();
  if (tab === 'queue') loadQueue();
});

// ─── Init ─────────────────────────────────────────────────────────────────────
async function init() {
  const urlParams = new URLSearchParams(window.location.search);
  if (urlParams.get('connected') === '1') {
    history.replaceState({}, '', '/social');
    showToast('Facebook page connected successfully!', 'green');
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
  const hint = $('redirectUriHint');
  if (hint) hint.textContent = `${window.location.origin}/api/social/auth/facebook/callback`;
}

function renderConnectTab() {
  const body = $('connectBody');
  if (status.connection) {
    body.innerHTML = `
      <div style="display:flex;align-items:center;gap:16px;background:rgba(16,185,129,0.08);border:1px solid rgba(16,185,129,0.2);border-radius:12px;padding:20px 24px;">
        <div style="width:48px;height:48px;border-radius:50%;background:#1877f2;display:flex;align-items:center;justify-content:center;">
          <svg width="26" height="26" viewBox="0 0 24 24" fill="#fff"><path d="M18 2h-3a5 5 0 0 0-5 5v3H7v4h3v8h4v-8h3l1-4h-4V7a1 1 0 0 1 1-1h3z"/></svg>
        </div>
        <div style="flex:1;">
          <div style="font-size:15px;font-weight:700;color:#e5e7eb;">${esc(status.connection.pageName)}</div>
          <div style="font-size:12px;color:#9ca3af;">Page ID: ${esc(status.connection.pageId)} · Connected ${new Date(status.connection.connectedAt).toLocaleDateString()}</div>
        </div>
        <button id="btnDisconnect" type="button" style="background:rgba(239,68,68,0.15);border:1px solid rgba(239,68,68,0.3);color:#f87171;padding:8px 16px;border-radius:8px;font-size:13px;font-weight:600;cursor:pointer;">Disconnect</button>
      </div>
      <p style="font-size:13px;color:#9ca3af;margin-top:12px;">Your page is connected. You can now schedule and publish posts from the <strong style="color:#e5e7eb;">Generate Post</strong> and <strong style="color:#e5e7eb;">Post Queue</strong> tabs.</p>`;
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

init();
