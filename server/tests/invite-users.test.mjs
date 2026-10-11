import test from 'node:test';
import assert from 'node:assert';
import { io } from 'socket.io-client';

const BASE_URL = 'http://localhost:3001';

test('ConnectRoom User Invitation Multi-Guest Live Test', async (t) => {
  let hostGuest = null;
  let hostToken = '';
  let guest2 = null;
  let guest2Token = '';
  let guest3 = null;
  let guest3Token = '';

  let createdRoomId = '';
  let inviteToken = '';
  let inviteId = '';

  let hostSocket = null;
  let guest2Socket = null;
  let guest3Socket = null;

  await t.test('1. Setup Host Session & Create Room', async () => {
    // 1. Host creates anonymous session
    const hostRes = await fetch(`${BASE_URL}/api/guest/session`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ displayName: 'Sarah (Host)' }),
    });
    assert.strictEqual(hostRes.status, 201);
    const hostData = await hostRes.json();
    hostGuest = hostData.guest;
    hostToken = hostData.token;

    // 2. Host creates room
    const roomRes = await fetch(`${BASE_URL}/api/rooms`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${hostToken}`,
      },
      body: JSON.stringify({
        name: 'Weekly Design Sync',
        description: 'Anonymous team collaboration session',
      }),
    });
    assert.strictEqual(roomRes.status, 201);
    const roomData = await roomRes.json();
    assert.strictEqual(roomData.role, 'host');
    assert.ok(roomData.inviteToken);
    createdRoomId = roomData.room.id;
    inviteToken = roomData.inviteToken;

    // Connect host socket and join room
    hostSocket = io(BASE_URL, {
      auth: { token: hostToken },
      transports: ['websocket'],
    });
    await new Promise((resolve) => hostSocket.on('connect', resolve));

    const statePromise = new Promise((resolve) => {
      hostSocket.on('room:state', resolve);
    });
    hostSocket.emit('room:join', { roomId: createdRoomId });
    const hostRoomState = await statePromise;
    assert.strictEqual(hostRoomState.room.id, createdRoomId);
  });

  await t.test('2. First Invited User (Guest 2) clicks invite link & joins', async () => {
    // Create session for Guest 2 (visiting invite link)
    const g2Res = await fetch(`${BASE_URL}/api/guest/session`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ displayName: 'David (UI Designer)' }),
    });
    assert.strictEqual(g2Res.status, 201);
    const g2Data = await g2Res.json();
    guest2 = g2Data.guest;
    guest2Token = g2Data.token;

    // Validate invite token (as done by /invite/:token page)
    const valRes = await fetch(`${BASE_URL}/api/rooms/invitations/validate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token: inviteToken }),
    });
    assert.strictEqual(valRes.status, 200);
    const valData = await valRes.json();
    assert.strictEqual(valData.valid, true);
    assert.strictEqual(valData.roomId, createdRoomId);

    // Join room with validated invite token
    const joinRes = await fetch(`${BASE_URL}/api/rooms/${createdRoomId}/join`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${guest2Token}`,
      },
      body: JSON.stringify({ inviteToken }),
    });
    assert.strictEqual(joinRes.status, 200);
    const joinData = await joinRes.json();
    assert.strictEqual(joinData.status, 'active');
    assert.strictEqual(joinData.role, 'participant');

    // Connect Guest 2 socket and join room
    guest2Socket = io(BASE_URL, {
      auth: { token: guest2Token },
      transports: ['websocket'],
    });
    await new Promise((resolve) => guest2Socket.on('connect', resolve));

    // Host should receive notification that Guest 2 joined
    const hostNotifiedPromise = new Promise((resolve) => {
      hostSocket.on('room:participant_joined', (p) => {
        if (p.guestId === guest2.id) resolve(p);
      });
    });

    guest2Socket.emit('room:join', { roomId: createdRoomId });
    const joinedPayload = await hostNotifiedPromise;
    assert.strictEqual(joinedPayload.displayName, 'David (UI Designer)');
    assert.strictEqual(joinedPayload.role, 'participant');
  });

  await t.test('3. Second Invited User (Guest 3) clicks invite link & joins', async () => {
    // Create session for Guest 3
    const g3Res = await fetch(`${BASE_URL}/api/guest/session`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ displayName: 'Elena (Product Lead)' }),
    });
    assert.strictEqual(g3Res.status, 201);
    const g3Data = await g3Res.json();
    guest3 = g3Data.guest;
    guest3Token = g3Data.token;

    // Join room with invite token
    const joinRes = await fetch(`${BASE_URL}/api/rooms/${createdRoomId}/join`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${guest3Token}`,
      },
      body: JSON.stringify({ inviteToken }),
    });
    assert.strictEqual(joinRes.status, 200);

    guest3Socket = io(BASE_URL, {
      auth: { token: guest3Token },
      transports: ['websocket'],
    });
    await new Promise((resolve) => guest3Socket.on('connect', resolve));

    // Both Host and Guest 2 should receive notification that Guest 3 joined
    const hostSeeG3Promise = new Promise((resolve) => {
      hostSocket.on('room:participant_joined', (p) => {
        if (p.guestId === guest3.id) resolve(p);
      });
    });

    const g2SeeG3Promise = new Promise((resolve) => {
      guest2Socket.on('room:participant_joined', (p) => {
        if (p.guestId === guest3.id) resolve(p);
      });
    });

    // Guest 3 should receive initial state showing all 3 participants
    const g3StatePromise = new Promise((resolve) => {
      guest3Socket.on('room:state', resolve);
    });

    guest3Socket.emit('room:join', { roomId: createdRoomId });

    const [notifHost, notifG2, g3State] = await Promise.all([
      hostSeeG3Promise,
      g2SeeG3Promise,
      g3StatePromise,
    ]);

    assert.strictEqual(notifHost.displayName, 'Elena (Product Lead)');
    assert.strictEqual(notifG2.displayName, 'Elena (Product Lead)');
    assert.strictEqual(g3State.participants.length, 3);
  });

  await t.test('4. Real-time Multi-Party Chat between Invited Users and Host', async () => {
    let sentMsgId = '';

    // Guest 2 sends a message: Host and Guest 3 receive it
    const hostRecvMsgPromise = new Promise((resolve) => {
      hostSocket.on('chat:message', (msg) => {
        if (msg.message_type !== 'system') resolve(msg);
      });
    });

    const g3RecvMsgPromise = new Promise((resolve) => {
      guest3Socket.on('chat:message', (msg) => {
        if (msg.message_type !== 'system') resolve(msg);
      });
    });

    guest2Socket.emit('chat:message', {
      roomId: createdRoomId,
      content: 'Hey Sarah! Thanks for the invite link.',
      messageType: 'text',
    });

    const [msgForHost, msgForG3] = await Promise.all([hostRecvMsgPromise, g3RecvMsgPromise]);
    assert.strictEqual(msgForHost.content, 'Hey Sarah! Thanks for the invite link.');
    assert.strictEqual(msgForHost.sender_name, 'David (UI Designer)');
    assert.strictEqual(msgForG3.content, 'Hey Sarah! Thanks for the invite link.');
    sentMsgId = msgForHost.id;

    // Guest 3 adds a reaction to Guest 2 message -> Host receives it
    const reactionPromise = new Promise((resolve) => {
      hostSocket.on('chat:reaction', (reaction) => {
        if (reaction.messageId === sentMsgId) resolve(reaction);
      });
    });

    guest3Socket.emit('chat:reaction', {
      roomId: createdRoomId,
      messageId: sentMsgId,
      emoji: '👋',
    });

    const reactionData = await reactionPromise;
    assert.strictEqual(reactionData.emoji, '👋');
    assert.strictEqual(reactionData.guestId, guest3.id);
  });

  await t.test('5. Host creates a new invitation and revokes the old one', async () => {
    // Host generates a secondary invitation
    const newInviteRes = await fetch(`${BASE_URL}/api/rooms/${createdRoomId}/invitations`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${hostToken}`,
      },
      body: JSON.stringify({}),
    });
    assert.strictEqual(newInviteRes.status, 201);
    const newInviteData = await newInviteRes.json();
    assert.ok(newInviteData.invitation.token);
    const newInviteToken = newInviteData.invitation.token;

    // List invitations
    const listRes = await fetch(`${BASE_URL}/api/rooms/${createdRoomId}/invitations`, {
      headers: { Authorization: `Bearer ${hostToken}` },
    });
    assert.strictEqual(listRes.status, 200);
    const listData = await listRes.json();
    // Find the original invite to revoke
    const originalInvite = listData.invitations.find((inv) => inv.token === inviteToken);
    assert.ok(originalInvite);

    // Revoke the original invitation
    const revokeRes = await fetch(`${BASE_URL}/api/rooms/${createdRoomId}/invitations/${originalInvite.id}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${hostToken}` },
    });
    assert.strictEqual(revokeRes.status, 200);

    // Validate revoked original invitation should fail
    const validateRevoked = await fetch(`${BASE_URL}/api/rooms/invitations/validate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token: inviteToken }),
    });
    assert.strictEqual(validateRevoked.status, 404);

    // Validate new invitation should succeed
    const validateNew = await fetch(`${BASE_URL}/api/rooms/invitations/validate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token: newInviteToken }),
    });
    assert.strictEqual(validateNew.status, 200);
    const validData = await validateNew.json();
    assert.strictEqual(validData.valid, true);
  });

  await t.test('6. Teardown All Sockets', async () => {
    hostSocket.disconnect();
    guest2Socket.disconnect();
    guest3Socket.disconnect();
  });
});
