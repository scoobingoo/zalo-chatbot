// =============================================
// Kiểm thử tích hợp cho các tính năng CRM, Quick Replies và Thống kê (Stats)
// Sử dụng cơ sở dữ liệu SQLite tạm thời trên ổ cứng (os.tmpdir)
// =============================================
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');
const express = require('express');
const cookieParser = require('cookie-parser');
const bcrypt = require('bcryptjs');

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'zalo-crm-test-'));
process.env.DB_PATH = path.join(dir, 'test.db');
process.env.AI_SECRET_KEY = Buffer.alloc(32, 7).toString('base64');

const store = require('../src/db');
const password = crypto.randomBytes(12).toString('hex');
store.users.create('crm-admin', bcrypt.hashSync(password, 4), 'CRM Admin');

let origin, http, cookie;

// Hàm trợ giúp gọi HTTP API kèm cookie xác thực
const api = async (method, p, body) => {
    const res = await fetch(origin + p, {
        method,
        headers: { 'Content-Type': 'application/json', Cookie: cookie || '' },
        body: body ? JSON.stringify(body) : undefined,
    });
    return { status: res.status, json: await res.json().catch(() => null) };
};

before(async () => {
    const app = express();
    app.use(express.json({ limit: '2mb' }));
    app.use(cookieParser());
    app.use('/app', require('../src/routes/web'));
    http = app.listen(0, '127.0.0.1');
    await new Promise(r => http.once('listening', r));
    origin = `http://127.0.0.1:${http.address().port}`;

    // Đăng nhập để lấy cookie phiên làm việc
    const login = await fetch(origin + '/app/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: 'crm-admin', password }),
    });
    assert.equal(login.status, 200);
    cookie = login.headers.get('set-cookie').split(';')[0];
});

after(() => {
    http.close();
});

test('CRM: gắn thẻ (tags) và lưu ghi chú (notes) cho hội thoại', async () => {
    // Tạo dữ liệu hội thoại mẫu
    store.threads.upsertContact({
        threadId: 'u_1001',
        type: 'user',
        name: 'Trần Minh Quân',
        avatarUrl: '',
        phone: '0901234567',
    });

    // Cập nhật tags và notes qua PATCH /app/threads/:id/crm
    const patchRes = await api('PATCH', '/app/threads/u_1001/crm', {
        tags: 'VIP, Lead',
        notes: 'Khách quan tâm gói Enterprise, hẹn gọi lại chiều thứ 6.',
    });
    assert.equal(patchRes.status, 200);
    assert.equal(patchRes.json.data.thread.tags, 'VIP, Lead');
    assert.equal(patchRes.json.data.thread.notes, 'Khách quan tâm gói Enterprise, hẹn gọi lại chiều thứ 6.');

    // Tìm kiếm hội thoại theo tag
    const listByTag = await api('GET', '/app/threads?tag=VIP');
    assert.equal(listByTag.status, 200);
    assert.equal(listByTag.json.data.threads.length, 1);
    assert.equal(listByTag.json.data.threads[0].thread_id, 'u_1001');
});

test('Quick Replies: đọc danh sách mặc định, thêm mới và xóa mẫu câu', async () => {
    // Kiểm tra 4 mẫu câu được seed tự động
    const initial = await api('GET', '/app/quick-replies');
    assert.equal(initial.status, 200);
    assert.ok(initial.json.data.quick_replies.length >= 4);

    // Thêm mẫu câu mới
    const created = await api('POST', '/app/quick-replies', {
        shortcut: 'stk',
        title: 'Thông tin chuyển khoản',
        content: 'Vietcombank - 0123456789 - NGUYEN VAN A',
    });
    assert.equal(created.status, 200);
    const stkItem = created.json.data.quick_replies.find(q => q.shortcut === 'stk');
    assert.ok(stkItem);
    assert.equal(stkItem.title, 'Thông tin chuyển khoản');

    // Xóa mẫu câu vừa tạo
    const deleted = await api('DELETE', `/app/quick-replies/${stkItem.id}`);
    assert.equal(deleted.status, 200);
    assert.ok(!deleted.json.data.quick_replies.some(q => q.shortcut === 'stk'));
});

test('Analytics: lấy thống kê tổng quan qua GET /app/stats', async () => {
    store.messages.insert({
        msgId: 'm_1',
        threadId: 'u_1001',
        direction: 'in',
        source: 'zalo',
        senderId: 'u_1001',
        senderName: 'Trần Minh Quân',
        content: 'Chào shop, tư vấn giúp mình nhé!',
        contentType: 'text',
        sentAt: Date.now() - 5000,
    });
    store.messages.insert({
        msgId: 'm_2',
        threadId: 'u_1001',
        direction: 'out',
        source: 'ai',
        senderId: 'self',
        senderName: 'AI',
        content: 'Dạ chào anh Quân, em có thể giúp gì cho anh ạ?',
        contentType: 'text',
        sentAt: Date.now(),
    });

    const statsRes = await api('GET', '/app/stats');
    assert.equal(statsRes.status, 200);
    assert.equal(statsRes.json.data.total_threads, 1);
    assert.equal(statsRes.json.data.total_messages, 2);
    assert.equal(statsRes.json.data.messages_in, 1);
    assert.equal(statsRes.json.data.messages_out, 1);
    assert.equal(statsRes.json.data.ai_messages, 1);
});

test('History Sync: đồng bộ tin nhắn cũ không ghi đè preview mới hơn và sắp xếp đúng theo sent_at', async () => {
    const now = Date.now();
    store.threads.ensureExists('u_stranger', 'user', '');

    // Tin nhắn mới nhất được ghi nhận trước
    store.messages.insert({
        msgId: 'hist_new',
        threadId: 'u_stranger',
        direction: 'in',
        source: 'zalo',
        senderId: 'u_stranger',
        senderName: 'Khách Mới',
        content: 'Tin nhắn mới nhất',
        contentType: 'text',
        sentAt: now,
    });
    store.threads.updateLastMessage('u_stranger', 'Tin nhắn mới nhất', now, 'in', true);

    // Tin nhắn lịch sử cũ hơn được đồng bộ về sau (ID lớn hơn nhưng sent_at nhỏ hơn)
    store.messages.insert({
        msgId: 'hist_old',
        threadId: 'u_stranger',
        direction: 'out',
        source: 'app',
        senderId: 'self',
        senderName: 'Tôi',
        content: 'Tin nhắn từ hôm qua',
        contentType: 'text',
        sentAt: now - 86400000,
    });
    store.threads.updateLastMessage('u_stranger', 'Tin nhắn từ hôm qua', now - 86400000, 'out', false);

    // Làm giàu thông tin profile cho người lạ chưa có tên
    store.threads.updateProfileIfMissing({
        threadId: 'u_stranger',
        name: 'Nguyễn Văn Lạ',
        avatarUrl: 'https://example.com/avt.jpg',
    });

    const thread = store.threads.get('u_stranger');
    assert.equal(thread.last_message, 'Tin nhắn mới nhất');
    assert.equal(thread.last_message_at, now);
    assert.equal(thread.unread_count, 1);
    assert.equal(thread.name, 'Nguyễn Văn Lạ');

    // Kiểm tra danh sách tin nhắn trả về theo đúng thứ tự thời gian (cũ → mới)
    const msgList = store.messages.listByThread('u_stranger', 0, 50);
    assert.equal(msgList.length, 2);
    assert.equal(msgList[0].msg_id, 'hist_old');
    assert.equal(msgList[1].msg_id, 'hist_new');
});

