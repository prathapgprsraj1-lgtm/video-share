import test from 'node:test';
import assert from 'node:assert';
import http from 'node:http';
import express from 'express';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import { initDb, GuestSessionRepo, RoomRepo, RoomMemberRepo, RoomInvitationRepo, MessageRepo } from '../dist/db/index.js';
import { guestRouter } from '../dist/routes/guest.js';
import { roomsRouter } from '../dist/routes/rooms.js';
import { messagesRouter } from '../dist/routes/messages.js';

test('ConnectRoom Backend Integration Tests', async (t) => {
  initDb();

  const app = express();
  app.use(cors());
  app.use(cookieParser());
  app.use(express.json());
  app.use('/api/guest', guestRouter);
  app.use('/api/rooms', roomsRouter);
  app.use('/api', messagesRouter);

  const server = http.createServer(app);
  await new Promise((resolve) => server.listen(0, resolve));
  const port = server.address().port;
  const baseUrl = `http://localhost:${port}`;

  let guest1Token = '';
  let guest1Id = '';
  let guest2Token = '';
  let guest2Id = '';
  let createdRoomId = '';
  let inviteToken = '';
  let messageId = '';

  await t.test('1. Create anonymous guest session for Guest 1', async () => {
    const res = await fetch(`${baseUrl}/api/guest/session`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ displayName: 'Alice' }),
    });
    assert.strictEqual(res.status, 201);
    const data = await res.json();
    assert.ok(data.token);
    assert.strictEqual(data.guest.displayName, 'Alice');
    assert.ok(data.guest.id.startsWith('guest_'));
    guest1Token = data.token;
    guest1Id = data.guest.id;
  });

  await t.test('2. Create anonymous guest session for Guest 2 (auto-generated name)', async () => {
    const res = await fetch(`${baseUrl}/api/guest/session`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    });
    assert.strictEqual(res.status, 201);
    const data = await res.json();
    assert.ok(data.token);
    assert.ok(data.guest.displayName.startsWith('Guest-'));
    guest2Token = data.token;
    guest2Id = data.guest.id;
  });

  await t.test('3. Update Guest 1 profile display name', async () => {
    const res = await fetch(`${baseUrl}/api/guest/profile`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${guest1Token}`,
      },
      body: JSON.stringify({ displayName: 'Alice Super' }),
    });
    assert.strictEqual(res.status, 200);
    const data = await res.json();
    assert.strictEqual(data.guest.displayName, 'Alice Super');
  });

  await t.test('4. Guest 1 creates a new room', async () => {
    const res = await fetch(`${baseUrl}/api/rooms`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${guest1Token}`,
      },
      body: JSON.stringify({
        name: 'Design Sync Room',
        description: 'Anonymous meeting for UI review',
      }),
    });
    assert.strictEqual(res.status, 201);
    const data = await res.json();
    assert.ok(data.room.id);
    assert.strictEqual(data.room.name, 'Design Sync Room');
    assert.strictEqual(data.role, 'host');
    assert.ok(data.inviteToken);
    createdRoomId = data.room.id;
    inviteToken = data.inviteToken;
  });

  await t.test('5. Validate invitation token', async () => {
    const res = await fetch(`${baseUrl}/api/rooms/invitations/validate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token: inviteToken }),
    });
    assert.strictEqual(res.status, 200);
    const data = await res.json();
    assert.strictEqual(data.valid, true);
    assert.strictEqual(data.roomId, createdRoomId);
  });

  await t.test('6. Guest 2 joins the room via invitation', async () => {
    const res = await fetch(`${baseUrl}/api/rooms/${createdRoomId}/join`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${guest2Token}`,
      },
      body: JSON.stringify({ inviteToken }),
    });
    assert.strictEqual(res.status, 200);
    const data = await res.json();
    assert.strictEqual(data.status, 'active');
    assert.strictEqual(data.role, 'participant');
  });

  await t.test('7. Guest 1 posts a message in the room', async () => {
    const res = await fetch(`${baseUrl}/api/rooms/${createdRoomId}/messages`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${guest1Token}`,
      },
      body: JSON.stringify({
        content: 'Welcome to ConnectRoom!',
        messageType: 'text',
      }),
    });
    assert.strictEqual(res.status, 201);
    const data = await res.json();
    assert.strictEqual(data.message.content, 'Welcome to ConnectRoom!');
    assert.strictEqual(data.message.sender_name, 'Alice Super');
    messageId = data.message.id;
  });

  await t.test('8. Guest 2 reacts to Guest 1 message', async () => {
    const res = await fetch(`${baseUrl}/api/messages/${messageId}/reactions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${guest2Token}`,
      },
      body: JSON.stringify({ emoji: '🔥' }),
    });
    assert.strictEqual(res.status, 200);
    const data = await res.json();
    assert.strictEqual(data.action, 'added');
  });

  await t.test('9. Retrieve room messages and check reactions', async () => {
    const res = await fetch(`${baseUrl}/api/rooms/${createdRoomId}/messages`, {
      headers: {
        Authorization: `Bearer ${guest2Token}`,
      },
    });
    assert.strictEqual(res.status, 200);
    const data = await res.json();
    assert.ok(data.messages.length >= 1);
    const msg = data.messages.find((m) => m.id === messageId);
    assert.ok(msg);
    assert.strictEqual(msg.reactions[0].emoji, '🔥');
    assert.strictEqual(msg.reactions[0].count, 1);
  });

  server.close();
});
