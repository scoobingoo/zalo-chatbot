// =============================================
// ZaloFlow Studio — Logic điều khiển trang Livechat & CRM chuẩn Smax.ai
// =============================================
(() => {
'use strict';

// ============ Trạng thái ứng dụng (State) ============
let me = null;
let zaloStatus = null;
let threads = [];
let currentThread = null;
let oldestMsgId = 0;
let pendingImageBase64 = null;
let filterType = '';
let filterTag = '';
let searchTimer = null;
let qrPollTimer = null;
let currentLoginId = null;
let aiSummary = null;      // Trạng thái AI tổng hợp theo từng hội thoại
let aiThreadState = null;  // Trạng thái AI chi tiết của hội thoại đang mở
let quickReplies = [];     // Danh sách mẫu câu trả lời nhanh

const $ = (id) => document.getElementById(id);

// ============ Quản lý Giao diện Sáng / Tối (Theme) ============
function initTheme() {
    const saved = localStorage.getItem('zf_theme') || 'light';
    document.documentElement.setAttribute('data-theme', saved);
    const btn = $('btnTheme');
    if (btn) btn.textContent = saved === 'dark' ? '☀️' : '🌙';
}

function toggleTheme() {
    const current = document.documentElement.getAttribute('data-theme') === 'dark' ? 'dark' : 'light';
    const next = current === 'dark' ? 'light' : 'dark';
    document.documentElement.setAttribute('data-theme', next);
    localStorage.setItem('zf_theme', next);
    const btn = $('btnTheme');
    if (btn) btn.textContent = next === 'dark' ? '☀️' : '🌙';
}

// ============ Các hàm tiện ích (Helpers) ============
async function api(path, options = {}) {
    const res = await fetch(path, {
        headers: { 'Content-Type': 'application/json' },
        ...options,
    });
    if (res.status === 401) {
        location.href = '/login.html';
        throw new Error('unauthorized');
    }
    return res.json();
}

function toast(msg) {
    const el = $('toast');
    if (!el) return;
    el.textContent = msg;
    el.classList.add('show');
    setTimeout(() => el.classList.remove('show'), 2600);
}

function esc(str) {
    const div = document.createElement('div');
    div.textContent = str ?? '';
    return div.innerHTML;
}

function timeShort(ts) {
    if (!ts) return '';
    const d = new Date(Number(ts));
    const now = new Date();
    if (d.toDateString() === now.toDateString()) {
        return d.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' });
    }
    return d.toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit' });
}

function timeFull(ts) {
    if (!ts) return '';
    const d = new Date(Number(ts));
    const now = new Date();
    const timeStr = d.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' });
    if (d.toDateString() === now.toDateString()) return timeStr;
    return `${timeStr} ${d.toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit' })}`;
}

// Khởi tạo chữ cái viết tắt của tên khách hàng
function getInitials(name, type) {
    const clean = String(name || '').trim();
    if (!clean || clean.startsWith('(')) return type === 'group' ? '👥' : '👤';
    const parts = clean.split(/\s+/);
    if (parts.length >= 2) {
        return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
    }
    return clean.slice(0, 2).toUpperCase();
}

// Tạo HTML avatar an toàn (không lồng nháy kép trong onerror để tránh lỗi vỡ thuộc tính HTML)
function avatarHtml(t, withZaloBadge = false) {
    const fallbackText = esc(getInitials(t?.name, t?.type));
    const badge = withZaloBadge ? `<span class="avatar-zalo-badge" title="Zalo">Z</span>` : '';
    if (t && t.avatar_url) {
        return `<div class="avatar-box"><img class="avatar" src="${esc(t.avatar_url)}" alt="" onerror="this.style.display='none';if(this.nextElementSibling)this.nextElementSibling.style.display='flex'"><div class="avatar" style="display:none">${fallbackText}</div>${badge}</div>`;
    }
    return `<div class="avatar-box"><div class="avatar">${fallbackText}</div>${badge}</div>`;
}

// Tạo mini avatar cạnh bong bóng tin nhắn
function miniAvatarHtml(m) {
    if (m.direction === 'out') {
        const selfAva = zaloStatus?.avatar_url;
        const selfName = zaloStatus?.display_name || 'Tôi';
        const init = esc(getInitials(selfName, 'user'));
        if (selfAva) {
            return `<img class="msg-mini-avatar" src="${esc(selfAva)}" alt="" onerror="this.style.display='none'">`;
        }
        return `<div class="msg-mini-avatar" title="${esc(selfName)}">${init}</div>`;
    }
    const senderAva = currentThread?.avatar_url;
    const senderName = m.sender_name || currentThread?.name || 'KH';
    const init = esc(getInitials(senderName, currentThread?.type));
    if (senderAva && currentThread?.type !== 'group') {
        return `<img class="msg-mini-avatar" src="${esc(senderAva)}" alt="" onerror="this.style.display='none'">`;
    }
    return `<div class="msg-mini-avatar" title="${esc(senderName)}">${init}</div>`;
}

// ============ Hiển thị Trạng thái Kênh & Thống kê ============
function renderChannelStatus() {
    const z = zaloStatus || {};
    const chip = $('channelChip');
    if (chip) {
        if (z.zalo_id || z.display_name) {
            chip.style.display = 'flex';
            if ($('channelName')) $('channelName').textContent = z.display_name || z.zalo_id;
            if ($('channelAvatar')) {
                $('channelAvatar').src = z.avatar_url || '';
                $('channelAvatar').style.display = z.avatar_url ? 'block' : 'none';
            }
        } else {
            chip.style.display = 'none';
        }
    }
    if ($('crmChannelName')) {
        $('crmChannelName').textContent = z.display_name || z.zalo_id || 'Chưa kết nối';
    }
    if ($('crmChannelAvatar')) {
        $('crmChannelAvatar').src = z.avatar_url || '';
        $('crmChannelAvatar').style.display = z.avatar_url ? 'block' : 'none';
    }
    if ($('statusDot')) $('statusDot').className = 'status-dot' + (z.connected ? ' on' : '');
    if ($('bannerDisconnected')) $('bannerDisconnected').style.display = z.connected ? 'none' : 'flex';
}

async function loadWorkspaceStats() {
    try {
        const json = await api('/app/stats');
        if (!json.success) return;
        const d = json.data;
        if ($('statThreads')) $('statThreads').textContent = d.total_threads || 0;
        if ($('statMessages')) $('statMessages').textContent = d.total_messages || 0;
        if ($('statAiReplies')) $('statAiReplies').textContent = d.ai_messages || 0;
    } catch { /* bỏ qua lỗi mạng tạm thời */ }
}

// ============ Danh sách Hội thoại ============
async function loadThreads() {
    const search = $('searchInput') ? $('searchInput').value.trim() : '';
    const qs = new URLSearchParams({
        search,
        type: filterType,
        tag: filterTag,
    });
    const json = await api(`/app/threads?${qs}`);
    if (!json.success) return;
    threads = json.data.threads;
    aiSummary = json.data.ai || null;
    renderThreads();
    loadWorkspaceStats();
}

// Biểu tượng trạng thái AI cho từng hội thoại
function aiIconFor(t) {
    if (!aiSummary || !aiSummary.enabled) return '';
    const o = aiSummary.overrides?.[t.thread_id];
    if (o?.needs_human) return '<span class="ai-mark" title="Cần người hỗ trợ">🙋</span>';
    if (o?.ai_enabled === 0) return '';
    if (o?.paused) return '<span class="ai-mark" title="AI tạm dừng (người thật đang trả lời)">⏸️</span>';
    if (o?.ai_enabled === 1) return '<span class="ai-mark" title="AI đang bật">🤖</span>';
    let on = false;
    if (t.type === 'group') on = aiSummary.group_mode !== 'off' && (!aiSummary.group_whitelist?.length || aiSummary.group_whitelist.includes(t.thread_id));
    else on = aiSummary.dm_mode === 'all' || (aiSummary.dm_mode === 'contacts' && t.is_contact) || (aiSummary.dm_mode === 'non_contacts' && !t.is_contact);
    return on ? '<span class="ai-mark" title="AI đang bật">🤖</span>' : '';
}

// Hiển thị các thẻ phân loại CRM trên từng dòng hội thoại
function renderThreadTagPills(tagsStr) {
    if (!tagsStr) return '';
    return tagsStr
        .split(',')
        .map(s => s.trim())
        .filter(Boolean)
        .slice(0, 2)
        .map(tag => `<span class="crm-tag-mini">${esc(tag)}</span>`)
        .join('');
}

function renderThreads() {
    const list = $('threadList');
    if (!list) return;
    if (threads.length === 0) {
        list.innerHTML = '<div class="empty-note">Không tìm thấy hội thoại phù hợp.<br>Bấm nút 🔄 trên thanh tìm kiếm để đồng bộ danh bạ &amp; lịch sử từ Zalo.</div>';
        return;
    }
    list.innerHTML = threads.map(t => {
        const displayName = t.name || (t.type === 'group' ? `Nhóm ${t.thread_id.slice(-4)}` : `Khách ${t.thread_id.slice(-4)}`);
        const previewText = t.last_message || (t.notes ? '📝 ' + t.notes : 'Chưa có tin nhắn');
        const outArrow = t.last_direction === 'out' ? '<span class="out-arrow">↩</span>' : '';
        return `
        <div class="thread-item ${currentThread?.thread_id === t.thread_id ? 'active' : ''}" data-id="${esc(t.thread_id)}">
            ${avatarHtml(t, true)}
            <div class="thread-info">
                <div class="thread-name">
                    <span class="name-text">${esc(displayName)}</span>
                    ${t.type === 'group' ? '<span class="badge-type group">NHÓM</span>' : ''}
                    ${renderThreadTagPills(t.tags)}
                </div>
                <div class="thread-preview">${outArrow}<span>${esc(previewText)}</span></div>
            </div>
            <div class="thread-meta">
                <div class="thread-time">${timeShort(t.last_message_at)}</div>
                <div class="thread-icons">
                    ${t.phone ? `<span class="phone-ind" title="SĐT: ${esc(t.phone)}">📞</span>` : ''}
                    ${aiIconFor(t)}
                    ${t.unread_count > 0 ? `<span class="unread-badge">${t.unread_count}</span>` : ''}
                </div>
            </div>
        </div>`;
    }).join('');

    list.querySelectorAll('.thread-item').forEach(el => {
        el.addEventListener('click', () => openThread(el.dataset.id));
    });
}

// ============ Mở Hội thoại & Hiển thị Hồ sơ CRM ============
async function openThread(threadId) {
    const json = await api(`/app/messages/${encodeURIComponent(threadId)}`);
    if (!json.success) return;

    currentThread = json.data.thread || { thread_id: threadId, type: 'user', name: '', phone: '', tags: '', notes: '' };
    const msgs = json.data.messages;
    oldestMsgId = msgs.length > 0 ? msgs[0].id : 0;

    $('chatPlaceholder').style.display = 'none';
    $('chatContent').style.display = 'flex';
    $('app').classList.add('chat-open');

    const displayName = currentThread.name || (currentThread.type === 'group' ? `Nhóm ${currentThread.thread_id}` : `Khách ${currentThread.thread_id}`);
    $('chatTitle').textContent = displayName;
    $('chatThreadId').textContent = currentThread.thread_id;
    const badge = $('chatTypeBadge');
    if (badge) {
        badge.textContent = currentThread.type === 'group' ? 'NHÓM' : 'ZALO';
        badge.className = 'badge-type ' + currentThread.type;
    }
    if ($('chatAvatarWrap')) {
        $('chatAvatarWrap').innerHTML = avatarHtml(currentThread, false);
    }
    loadAiChip(threadId);
    fillCrmPanel(currentThread);
    renderComposerTags();

    const body = $('chatBody');
    body.innerHTML = (msgs.length >= 50 ? '<div class="load-more"><button class="btn btn-light btn-sm" id="btnLoadMore">Tải tin nhắn cũ hơn</button></div>' : '')
        + msgs.map(renderMessage).join('');
    bindLoadMore();
    body.scrollTop = body.scrollHeight;

    // Đánh dấu đã đọc
    api(`/app/threads/${encodeURIComponent(threadId)}/read`, { method: 'POST' }).then(loadThreads);
}

// Điền dữ liệu vào cột CRM chuẩn Smax.ai bên phải
function fillCrmPanel(thread) {
    if (!$('crmPanel')) return;
    $('crmPanel').classList.remove('hidden');
    if ($('crmAvatarWrap')) {
        $('crmAvatarWrap').innerHTML = avatarHtml(thread, false);
    }
    const displayName = thread.name || '(Chưa cập nhật tên)';
    if ($('crmName')) $('crmName').textContent = displayName;
    if ($('crmMetaId')) $('crmMetaId').textContent = `UID: ${thread.thread_id}`;
    if ($('crmNameInput')) $('crmNameInput').value = thread.name || '';
    if ($('crmPhoneInput')) $('crmPhoneInput').value = thread.phone || '';
    if ($('crmTagsInput')) $('crmTagsInput').value = thread.tags || '';
    if ($('crmNotesInput')) $('crmNotesInput').value = thread.notes || '';
    syncCrmPresetButtons();
}

// Hiển thị danh sách thẻ Tag ngay phía trên ô nhập tin nhắn (chuẩn Smax.ai)
function renderComposerTags() {
    const wrap = $('composerTagsList');
    if (!wrap || !currentThread) return;
    const tags = (currentThread.tags || '')
        .split(',')
        .map(s => s.trim())
        .filter(Boolean);
    wrap.innerHTML = tags.map(tag => `
        <span class="composer-tag-pill">
            <span>${esc(tag)}</span>
            <button type="button" data-rm-tag="${esc(tag)}" title="Gỡ thẻ">✕</button>
        </span>
    `).join('');
    wrap.querySelectorAll('button[data-rm-tag]').forEach(btn => {
        btn.addEventListener('click', () => toggleTagAndSave(btn.dataset.rmTag));
    });
}

async function toggleTagAndSave(tag) {
    if (!currentThread) return;
    const current = ($('crmTagsInput')?.value || currentThread.tags || '')
        .split(',')
        .map(x => x.trim())
        .filter(Boolean);
    const idx = current.findIndex(x => x.toLowerCase() === tag.toLowerCase());
    if (idx >= 0) current.splice(idx, 1);
    else current.push(tag);
    if ($('crmTagsInput')) $('crmTagsInput').value = current.join(', ');
    await saveCurrentCrm();
}

function syncCrmPresetButtons() {
    const currentSet = new Set(
        ($('crmTagsInput')?.value || '')
            .split(',')
            .map(x => x.trim().toLowerCase())
            .filter(Boolean)
    );
    document.querySelectorAll('#crmTagPresets .crm-tag-btn').forEach(btn => {
        btn.classList.toggle('selected', currentSet.has(btn.dataset.tag.toLowerCase()));
    });
}

async function saveCurrentCrm() {
    if (!currentThread) return;
    const name = $('crmNameInput') ? $('crmNameInput').value.trim() : currentThread.name;
    const phone = $('crmPhoneInput') ? $('crmPhoneInput').value.trim() : currentThread.phone;
    const tags = $('crmTagsInput') ? $('crmTagsInput').value.trim() : '';
    const notes = $('crmNotesInput') ? $('crmNotesInput').value.trim() : '';
    const json = await api(`/app/threads/${encodeURIComponent(currentThread.thread_id)}/crm`, {
        method: 'PATCH',
        body: JSON.stringify({ name, phone, tags, notes }),
    });
    if (json.success) {
        currentThread = json.data.thread;
        if ($('chatTitle')) $('chatTitle').textContent = currentThread.name || currentThread.thread_id;
        if ($('crmName')) $('crmName').textContent = currentThread.name || '(Chưa cập nhật tên)';
        syncCrmPresetButtons();
        renderComposerTags();
        toast('💾 Đã lưu hồ sơ khách hàng');
        loadThreads();
    } else {
        toast('❌ ' + (json.error?.message || 'Lỗi lưu CRM'));
    }
}

// ============ Mẫu tin nhắn trả lời nhanh (Quick Replies) ============
async function loadQuickReplies() {
    try {
        const json = await api('/app/quick-replies');
        if (!json.success) return;
        quickReplies = json.data.quick_replies || [];
        renderQuickReplies();
    } catch { /* bỏ qua */ }
}

function renderQuickReplies() {
    const wrap = $('quickReplyList');
    if (!wrap) return;
    wrap.innerHTML = quickReplies.map(q => `
        <button type="button" class="quick-pill" data-content="${esc(q.content)}" title="${esc(q.content)}">
            <code>/${esc(q.shortcut)}</code>${esc(q.title)}
        </button>
    `).join('');
    wrap.querySelectorAll('.quick-pill').forEach(btn => {
        btn.addEventListener('click', () => {
            const input = $('msgInput');
            input.value = btn.dataset.content;
            input.focus();
            input.dispatchEvent(new Event('input'));
        });
    });
}

function bindLoadMore() {
    const btn = $('btnLoadMore');
    if (btn) btn.addEventListener('click', loadOlderMessages);
}

async function loadOlderMessages() {
    if (!currentThread || !oldestMsgId) return;
    const json = await api(`/app/messages/${encodeURIComponent(currentThread.thread_id)}?before_id=${oldestMsgId}`);
    if (!json.success || json.data.messages.length === 0) {
        const btn = $('btnLoadMore');
        if (btn) btn.parentElement.remove();
        return;
    }
    const msgs = json.data.messages;
    oldestMsgId = msgs[0].id;
    const body = $('chatBody');
    const prevHeight = body.scrollHeight;
    const loadMoreEl = body.querySelector('.load-more');
    const html = msgs.map(renderMessage).join('');
    if (loadMoreEl) loadMoreEl.insertAdjacentHTML('afterend', html);
    else body.insertAdjacentHTML('afterbegin', html);
    body.scrollTop = body.scrollHeight - prevHeight;
}

// ============ Hiển thị 1 Tin nhắn chuẩn Smax.ai (Nhỏ gọn, không thừa khoảng trắng) ============
function renderMessage(m) {
    let inner = '';
    if (m.content_type === 'text') {
        inner = `<div class="msg-text">${esc(m.content)}</div>`;
    } else if (m.content_type === 'photo' || m.content_type === 'webchat') {
        let obj = {};
        try { obj = JSON.parse(m.content); } catch { /* giữ obj rỗng */ }
        const src = obj.href || obj.thumb || obj.oriUrl || '';
        const caption = obj.caption || obj.title || '';
        if (src) {
            inner = `<img class="msg-img" src="${esc(src)}" loading="lazy" onclick="window.open('${esc(src)}')">`
                + (caption ? `<div class="msg-text">${esc(caption)}</div>` : '');
        } else {
            inner = `<span class="msg-special">[Hình ảnh]</span>`;
        }
    } else if (m.content_type === 'sticker') {
        inner = `<span class="msg-special">[Sticker]</span>`;
    } else {
        let obj = {};
        try { obj = JSON.parse(m.content); } catch { /* giữ obj rỗng */ }
        const label = { voice: '[Voice]', video: '[Video]', file: '[File: ' + (obj.title || '') + ']' }[m.content_type] || `[${m.content_type}]`;
        inner = obj.href
            ? `<a href="${esc(obj.href)}" target="_blank" class="msg-special">${esc(label)} ⬇</a>`
            : `<span class="msg-special">${esc(label)}</span>`;
    }

    const senderLine = (m.direction === 'in' && currentThread?.type === 'group' && m.sender_name)
        ? `<div class="msg-sender">${esc(m.sender_name)}</div>` : '';

    return `<div class="msg-row ${m.direction}" data-mid="${m.id}">`
        + `<div class="msg-meta-top">${timeFull(m.sent_at)}${sourceLabel(m)}</div>`
        + `<div class="msg-line">${miniAvatarHtml(m)}<div class="msg-bubble">${senderLine}${inner}</div></div>`
        + `</div>`;
}

function sourceLabel(m) {
    if (m.direction !== 'out') return '';
    if (m.source === 'ai') return ' · <span class="src-ai">🤖 AI</span>';
    if (m.source === 'api') return ' · API';
    if (m.source === 'mcp') return ' · MCP';
    if (m.source === 'app') return ' · Zalo App';
    if (m.source === 'web') return ` · ${esc(me?.username || 'Web')}`;
    return '';
}

// ============ Trợ lý AI — Chip trạng thái trong Header Chat ============
const AI_CHIP_LABEL = { on: 'AI: Bật', off: 'AI: Tắt', paused: 'AI: Tạm dừng', needs_human: 'AI: Cần người' };
function renderAiChip() {
    const chip = $('aiChip');
    if (!chip) return;
    if (!currentThread || !aiThreadState) { chip.style.display = 'none'; return; }
    const st = aiThreadState;
    chip.style.display = 'inline-flex';
    chip.className = 'ai-chip ' + st.effective;
    let label = AI_CHIP_LABEL[st.effective] || 'AI';
    if (st.effective === 'paused' && st.paused_remaining_s > 0) label += ` (${Math.ceil(st.paused_remaining_s / 60)}p)`;
    $('aiChipLabel').textContent = label;
    const reasons = {
        master_off: 'Công tắc tổng đang tắt (trang AI Studio).', thread_off: 'Đã tắt riêng cho hội thoại này.',
        needs_human: 'AI đã chuyển cho nhân viên — bấm "Tiếp tục ngay" để AI trả lời lại.', paused: 'Người thật vừa trả lời nên AI tạm dừng.',
        thread_on: 'Bật riêng cho hội thoại này.', group_rule: 'Theo cấu hình nhóm (đang tắt / không trong danh sách).',
        group_mention: 'Theo cấu hình nhóm: chỉ trả lời khi được tag hoặc reply vào tin của bot.', group_all: 'Theo cấu hình nhóm: trả lời mọi tin.',
        dm_rule: 'Theo cấu hình cá nhân (không thuộc nhóm khách được trả lời).', dm_all: 'Theo cấu hình cá nhân.',
    };
    $('aiMenuInfo').textContent = reasons[st.reason] || '';
}
async function loadAiChip(threadId) {
    aiThreadState = null;
    renderAiChip();
    try {
        const json = await api(`/app/ai/threads/${encodeURIComponent(threadId)}/state`);
        if (json.success && currentThread?.thread_id === threadId) { aiThreadState = json.data; renderAiChip(); }
    } catch (e) { /* bỏ qua */ }
}
async function aiChipAction(act) {
    if (!currentThread) return;
    const tid = encodeURIComponent(currentThread.thread_id);
    let json;
    if (act === 'reset') json = await api(`/app/ai/threads/${tid}/reset`, { method: 'POST' });
    else {
        const body = act === 'on' ? { ai_enabled: true, resume: true } : act === 'off' ? { ai_enabled: false } : act === 'auto' ? { ai_enabled: null } : { resume: true };
        json = await api(`/app/ai/threads/${tid}/state`, { method: 'PUT', body: JSON.stringify(body) });
    }
    if (json?.success) {
        aiThreadState = json.data;
        renderAiChip();
        toast(act === 'reset' ? '🔄 Đã làm mới hội thoại AI' : '✅ Đã cập nhật trạng thái AI');
        loadThreads();
    } else toast('❌ ' + (json?.error?.message || 'Lỗi'));
}

function appendMessage(m) {
    const body = $('chatBody');
    body.insertAdjacentHTML('beforeend', renderMessage(m));
    body.scrollTop = body.scrollHeight;
}

// ============ Gửi Tin nhắn ============
async function sendCurrent() {
    if (!currentThread) return;
    const input = $('msgInput');
    const text = input.value.trim();
    if (!text && !pendingImageBase64) return;

    const btn = $('btnSend');
    btn.disabled = true;
    try {
        const json = await api('/app/send', {
            method: 'POST',
            body: JSON.stringify({
                thread_id: currentThread.thread_id,
                message: text || undefined,
                image_base64: pendingImageBase64 || undefined,
            }),
        });
        if (json.success) {
            input.value = '';
            input.style.height = 'auto';
            clearImagePreview();
            if (json.data.message_row && !document.querySelector(`[data-mid="${json.data.message_row.id}"]`)) {
                appendMessage(json.data.message_row);
            }
            loadThreads();
        } else {
            toast('❌ ' + (json.error?.message || 'Gửi thất bại'));
            if (json.error?.code === 'SESSION_EXPIRED' || json.error?.code === 'NOT_CONNECTED') refreshStatus();
        }
    } catch (e) {
        toast('❌ Lỗi kết nối máy chủ');
    }
    btn.disabled = false;
    input.focus();
}

function clearImagePreview() {
    pendingImageBase64 = null;
    $('imgPreview').style.display = 'none';
    $('fileInput').value = '';
}

// ============ Đồng bộ Danh bạ & Lịch sử Tin nhắn ============
async function triggerSyncZalo() {
    toast('🔄 Đang đồng bộ danh bạ, hồ sơ & lịch sử tin nhắn từ Zalo...');
    const json = await api('/app/zalo/sync', { method: 'POST' });
    if (json.success) {
        toast(`✅ Đã đồng bộ ${json.data.friends} bạn bè, ${json.data.groups} nhóm — đang tải tin nhắn cũ...`);
        loadThreads();
        loadWorkspaceStats();
    } else {
        toast('❌ ' + (json.error?.message || 'Lỗi đồng bộ'));
    }
}

// ============ Kết nối QR Zalo ============
async function openQrModal() {
    $('qrModal').style.display = 'flex';
    $('qrWrap').innerHTML = '<span>Đang tạo QR...</span>';
    $('qrStatus').textContent = 'Đang khởi tạo...';

    const json = await api('/app/zalo/qr', { method: 'POST' });
    if (!json.success) {
        $('qrStatus').textContent = '❌ ' + (json.error?.message || 'Lỗi tạo QR');
        return;
    }
    currentLoginId = json.data.login_id;

    setTimeout(() => {
        $('qrWrap').innerHTML = `<img src="/app/zalo/qr-image/${currentLoginId}?t=${Date.now()}" onerror="setTimeout(()=>{this.src='/app/zalo/qr-image/${currentLoginId}?t='+Date.now()},1500)">`;
    }, 1500);

    clearInterval(qrPollTimer);
    qrPollTimer = setInterval(async () => {
        try {
            const st = await api(`/app/zalo/qr-status/${currentLoginId}`);
            if (!st.success) {
                $('qrStatus').textContent = '❌ ' + (st.error?.message || 'Thất bại');
                clearInterval(qrPollTimer);
                return;
            }
            const s = st.data.status;
            const labels = { waiting: 'Chờ quét mã...', scanned: '✅ Đã quét — vui lòng tích "Đồng bộ tin nhắn" và xác nhận trên ĐT', success: '🎉 Kết nối thành công!' };
            $('qrStatus').textContent = labels[s] || s;
            if (s === 'success') {
                clearInterval(qrPollTimer);
                zaloStatus = st.data.zalo;
                renderChannelStatus();
                setTimeout(() => { $('qrModal').style.display = 'none'; loadThreads(); }, 1200);
                toast('✅ Kênh Zalo đã kết nối!');
            }
        } catch (e) { /* tiếp tục chờ */ }
    }, 2000);
}

function closeQrModal() {
    $('qrModal').style.display = 'none';
    clearInterval(qrPollTimer);
}

// ============ Kết nối Thời gian thực (SSE) ============
function connectSSE() {
    const es = new EventSource('/app/events');
    es.addEventListener('message', (e) => {
        const { message } = JSON.parse(e.data);
        if (currentThread && message.thread_id === currentThread.thread_id) {
            if (!document.querySelector(`[data-mid="${message.id}"]`)) appendMessage(message);
            api(`/app/threads/${encodeURIComponent(message.thread_id)}/read`, { method: 'POST' });
        }
        loadThreads();
    });
    es.addEventListener('status', (e) => {
        zaloStatus = JSON.parse(e.data);
        renderChannelStatus();
    });
    es.addEventListener('threads_updated', () => {
        loadThreads();
        if (currentThread) {
            const updated = threads.find(t => t.thread_id === currentThread.thread_id);
            if (updated && updated.name && updated.name !== currentThread.name) {
                currentThread = { ...currentThread, ...updated };
                if ($('chatTitle')) $('chatTitle').textContent = currentThread.name;
                fillCrmPanel(currentThread);
            }
        }
    });
    es.addEventListener('history_synced', (e) => {
        try {
            const data = JSON.parse(e.data || '{}');
            loadThreads();
            if (currentThread) {
                openThread(currentThread.thread_id);
            }
            if (data.imported > 0) {
                const label = data.type === 'group' ? 'Nhóm' : 'Cá nhân';
                toast(`📥 Đã đồng bộ thêm ${data.imported} tin nhắn lịch sử (${label})`);
            }
        } catch (err) { /* bỏ qua */ }
    });
    es.addEventListener('ai_state', (e) => {
        const { thread_id, state } = JSON.parse(e.data);
        if (currentThread && thread_id === currentThread.thread_id) { aiThreadState = state; renderAiChip(); }
        loadThreads();
    });
    es.addEventListener('ai_handoff', (e) => {
        const { thread_id } = JSON.parse(e.data);
        const t = threads.find(x => x.thread_id === thread_id);
        toast(`🙋 AI chuyển cho nhân viên: ${t?.name || thread_id}`);
        loadThreads();
    });
    es.addEventListener('ai_error', (e) => {
        const { message } = JSON.parse(e.data);
        toast('⚠️ Trợ lý AI lỗi: ' + String(message || '').slice(0, 120));
    });
    es.onerror = () => {
        es.close();
        setTimeout(connectSSE, 5000);
    };
}

async function refreshStatus() {
    const json = await api('/app/me');
    if (json.success) {
        me = json.data.user;
        zaloStatus = json.data.zalo;
        if ($('brandName') && json.data.app_name) {
            $('brandName').textContent = json.data.app_name;
        }
        document.title = (json.data.app_name || 'ZaloFlow Studio') + ' — Workspace';
        renderChannelStatus();
    }
}

// ============ Gắn kết Sự kiện Giao diện (Events) ============
function bindEvents() {
    if ($('btnTheme')) $('btnTheme').addEventListener('click', toggleTheme);

    if ($('btnLogout')) {
        $('btnLogout').addEventListener('click', async () => {
            await api('/app/logout', { method: 'POST' });
            location.href = '/login.html';
        });
    }
    if ($('btnConnect')) $('btnConnect').addEventListener('click', openQrModal);
    if ($('btnRailQr')) $('btnRailQr').addEventListener('click', openQrModal);
    if ($('btnReQr')) $('btnReQr').addEventListener('click', openQrModal);
    if ($('btnCloseQr')) $('btnCloseQr').addEventListener('click', closeQrModal);

    if ($('btnSync')) $('btnSync').addEventListener('click', triggerSyncZalo);
    if ($('btnSyncChat')) $('btnSyncChat').addEventListener('click', triggerSyncZalo);

    if ($('searchInput')) {
        $('searchInput').addEventListener('input', () => {
            clearTimeout(searchTimer);
            searchTimer = setTimeout(loadThreads, 240);
        });
    }

    document.querySelectorAll('.filter-tabs button').forEach(btn => {
        btn.addEventListener('click', () => {
            document.querySelectorAll('.filter-tabs button').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            filterType = btn.dataset.type;
            loadThreads();
        });
    });

    // Lọc theo nhãn CRM
    document.querySelectorAll('#tagFilterBar .tag-chip-filter').forEach(btn => {
        btn.addEventListener('click', () => {
            document.querySelectorAll('#tagFilterBar .tag-chip-filter').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            filterTag = btn.dataset.tag || '';
            loadThreads();
        });
    });

    // Ẩn/hiện cột CRM bên phải
    if ($('btnToggleCrm')) {
        $('btnToggleCrm').addEventListener('click', () => {
            $('crmPanel').classList.toggle('hidden');
        });
    }

    // Chọn nhanh nhãn CRM ở cột phải
    document.querySelectorAll('#crmTagPresets .crm-tag-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            toggleTagAndSave(btn.dataset.tag);
        });
    });

    // Chọn nhanh nhãn CRM trên thanh composer chuẩn Smax.ai
    document.querySelectorAll('#composerQuickTags .quick-tag-add').forEach(btn => {
        btn.addEventListener('click', () => {
            toggleTagAndSave(btn.dataset.tag);
        });
    });

    if ($('crmTagsInput')) $('crmTagsInput').addEventListener('input', syncCrmPresetButtons);
    if ($('btnSaveCrm')) $('btnSaveCrm').addEventListener('click', saveCurrentCrm);

    // Tạo mẫu câu trả lời nhanh mới
    if ($('btnAddQuickReply')) {
        $('btnAddQuickReply').addEventListener('click', async () => {
            const shortcut = $('qrShortcut').value.trim().replace(/^\//, '');
            const title = $('qrTitle').value.trim();
            const content = $('qrContent').value.trim();
            if (!shortcut || !title || !content) {
                toast('⚠️ Vui lòng nhập đủ phím tắt, tiêu đề và nội dung');
                return;
            }
            const json = await api('/app/quick-replies', {
                method: 'POST',
                body: JSON.stringify({ shortcut, title, content }),
            });
            if (json.success) {
                quickReplies = json.data.quick_replies || [];
                renderQuickReplies();
                $('qrShortcut').value = '';
                $('qrTitle').value = '';
                $('qrContent').value = '';
                toast('⚡ Đã lưu mẫu câu nhanh /' + shortcut);
            } else {
                toast('❌ ' + (json.error?.message || 'Lỗi lưu mẫu câu'));
            }
        });
    }

    const msgInput = $('msgInput');
    if (msgInput) {
        msgInput.addEventListener('keydown', (e) => {
            // Mở rộng phím tắt /shortcut khi nhấn phím Space hoặc Tab
            if ((e.key === ' ' || e.key === 'Tab') && msgInput.value.startsWith('/')) {
                const code = msgInput.value.slice(1).trim().toLowerCase();
                const found = quickReplies.find(q => q.shortcut === code);
                if (found) {
                    e.preventDefault();
                    msgInput.value = found.content;
                    msgInput.dispatchEvent(new Event('input'));
                    return;
                }
            }
            if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                sendCurrent();
            }
        });
        msgInput.addEventListener('input', () => {
            msgInput.style.height = 'auto';
            msgInput.style.height = Math.min(msgInput.scrollHeight, 110) + 'px';
        });

        // Hỗ trợ dán ảnh trực tiếp từ Clipboard vào khung soạn thảo
        msgInput.addEventListener('paste', (e) => {
            const items = e.clipboardData?.items || [];
            for (const item of items) {
                if (item.type.startsWith('image/')) {
                    const file = item.getAsFile();
                    const reader = new FileReader();
                    reader.onload = () => {
                        pendingImageBase64 = reader.result;
                        $('imgPreviewEl').src = reader.result;
                        $('imgPreview').style.display = 'flex';
                    };
                    reader.readAsDataURL(file);
                    e.preventDefault();
                    break;
                }
            }
        });
    }

    if ($('btnSend')) $('btnSend').addEventListener('click', sendCurrent);
    if ($('btnAttach')) $('btnAttach').addEventListener('click', () => $('fileInput').click());
    if ($('fileInput')) {
        $('fileInput').addEventListener('change', () => {
            const file = $('fileInput').files[0];
            if (!file) return;
            if (file.size > 8 * 1024 * 1024) { toast('❌ Ảnh tối đa 8MB'); return; }
            const reader = new FileReader();
            reader.onload = () => {
                pendingImageBase64 = reader.result;
                $('imgPreviewEl').src = reader.result;
                $('imgPreview').style.display = 'flex';
            };
            reader.readAsDataURL(file);
        });
    }
    if ($('btnRemoveImg')) $('btnRemoveImg').addEventListener('click', clearImagePreview);

    if ($('btnCopyId')) {
        $('btnCopyId').addEventListener('click', () => {
            if (currentThread) {
                navigator.clipboard.writeText(currentThread.thread_id);
                toast('📋 Đã sao chép ID: ' + currentThread.thread_id);
            }
        });
    }
    if ($('btnBack')) $('btnBack').addEventListener('click', () => $('app').classList.remove('chat-open'));

    // Chip AI + Menu
    if ($('aiChip')) {
        $('aiChip').addEventListener('click', (e) => {
            e.stopPropagation();
            const menu = $('aiMenu');
            const open = menu.style.display !== 'none';
            menu.style.display = open ? 'none' : 'block';
            if (!open) { menu.style.top = ($('aiChip').offsetTop + $('aiChip').offsetHeight + 4) + 'px'; menu.style.right = '12px'; }
        });
    }
    if ($('aiMenu')) {
        $('aiMenu').querySelectorAll('button[data-act]').forEach(b => b.addEventListener('click', () => {
            $('aiMenu').style.display = 'none';
            aiChipAction(b.dataset.act);
        }));
        document.addEventListener('click', (e) => { if (!$('aiMenu').contains(e.target)) $('aiMenu').style.display = 'none'; });
    }
}

// ============ Khởi chạy Ứng dụng ============
(async function init() {
    initTheme();
    try {
        await refreshStatus();
    } catch (e) { return; }
    bindEvents();
    await Promise.all([loadThreads(), loadQuickReplies()]);
    connectSSE();
    setInterval(refreshStatus, 60000);
})();

})();
