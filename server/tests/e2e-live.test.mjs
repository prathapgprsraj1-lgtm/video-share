import test from 'node:test';
import assert from 'node:assert';
import { io } from 'socket.io-client';

const BASE_URL = 'http://localhost:3001';

test('ConnectRoom End-to-End Live System Test', async (t) => {
  let hostGuest = null;
  let hostToken = '';
  let participantGuest = null;
  let participantToken = '';
  let createdRoom = null;
  let inviteToken = '';
  let hostSocket = null;
  let participantSocket = null;

  await t.test('1. Backend Health Check', async () => {
    const res = await fetch(`${BASE_URL}/api/health`);
    assert.strictEqual(res.status, 200);
    const data = await res.json();
    assert.strictEqual(data.status, 'ok');
    assert.strictEqual(data.service, 'ConnectRoom Backend');
  });

  await t.test('2. Frontend Static Asset Serving', async () => {
    const res = await fetch(`${BASE_URL}/`);
    assert.strictEqual(res.status, 200);
    const html = await res.text();
    assert.ok(html.includes('<!doctype html>') || html.includes('<!DOCTYPE html>'));
    assert.ok(html.includes('ConnectRoom'));
  });

  await t.test('3. Anonymous Guest Creation for Host', async () => {
    const res = await fetch(`${BASE_URL}/api/guest/session`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ displayName: 'Host Commander' }),
    });
    assert.strictEqual(res.status, 201);
    const data = await res.json();
    assert.ok(data.token);
    assert.strictEqual(data.guest.displayName, 'Host Commander');
    hostGuest = data.guest;
    hostToken = data.token;
  });

  await t.test('4. Anonymous Guest Creation for Participant', async () => {
    const res = await fetch(`${BASE_URL}/api/guest/session`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ displayName: 'Explorer Guest' }),
    });
    assert.strictEqual(res.status, 201);
    const data = await res.json();
    assert.ok(data.token);
    assert.strictEqual(data.guest.displayName, 'Explorer Guest');
    participantGuest = data.guest;
    participantToken = data.token;
  });

  await t.test('5. Host creates a communication room', async () => {
    const res = await fetch(`${BASE_URL}/api/rooms`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${hostToken}`,
      },
      body: JSON.stringify({
        name: 'Operation Alpha Room',
        description: 'Anonymous end-to-end sync room',
      }),
    });
    assert.strictEqual(res.status, 201);
    const data = await res.json();
    assert.strictEqual(data.room.name, 'Operation Alpha Room');
    assert.strictEqual(data.role, 'host');
    assert.ok(data.inviteToken);
    createdRoom = data.room;
    inviteToken = data.inviteToken;
  });

  await t.test('6. Validate Invitation Token', async () => {
    const res = await fetch(`${BASE_URL}/api/rooms/invitations/validate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token: inviteToken }),
    });
    assert.strictEqual(res.status, 200);
    const data = await res.json();
    assert.strictEqual(data.valid, true);
    assert.strictEqual(data.roomId, createdRoom.id);
  });

  await t.test('7. Participant joins room via invitation', async () => {
    const res = await fetch(`${BASE_URL}/api/rooms/${createdRoom.id}/join`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${participantToken}`,
      },
      body: JSON.stringify({ inviteToken }),
    });
    assert.strictEqual(res.status, 200);
    const data = await res.json();
    assert.strictEqual(data.status, 'active');
    assert.strictEqual(data.role, 'participant');
  });

  await t.test('8. Real-time Socket.IO Connection & Room Join', async () => {
    // Connect host socket
    hostSocket = io(BASE_URL, {
      auth: { token: hostToken },
      transports: ['websocket'],
    });

    // Connect participant socket
    participantSocket = io(BASE_URL, {
      auth: { token: participantToken },
      transports: ['websocket'],
    });

    await Promise.all([
      new Promise((resolve) => hostSocket.on('connect', resolve)),
      new Promise((resolve) => participantSocket.on('connect', resolve)),
    ]);

    assert.ok(hostSocket.connected);
    assert.ok(participantSocket.connected);

    // Host joins room
    const hostJoinPromise = new Promise((resolve) => {
      hostSocket.emit('room:join', { roomId: createdRoom.id });
      hostSocket.on('room:state', (payload) => {
        resolve(payload);
      });
    });

    const hostState = await hostJoinPromise;
    assert.strictEqual(hostState.room.id, createdRoom.id);

    // Participant joins room, host receives room:participant_joined
    const memberJoinedPromise = new Promise((resolve) => {
      hostSocket.on('room:participant_joined', (member) => {
        resolve(member);
      });
    });

    participantSocket.emit('room:join', { roomId: createdRoom.id });
    const joinedMember = await memberJoinedPromise;
    assert.strictEqual(joinedMember.displayName, 'Explorer Guest');
  });

  await t.test('9. Real-time Chat Messaging & Socket Broadcasting', async () => {
    const chatReceivedPromise = new Promise((resolve) => {
      participantSocket.on('chat:message', (msg) => {
        // filter out system join messages
        if (msg.message_type !== 'system') {
          resolve(msg);
        }
      });
    });

    // Host sends message via socket
    hostSocket.emit('chat:message', {
      roomId: createdRoom.id,
      content: 'Mission control to Explorer: real-time signaling active!',
      messageType: 'text',
    });

    const receivedMsg = await chatReceivedPromise;
    assert.strictEqual(receivedMsg.content, 'Mission control to Explorer: real-time signaling active!');
    assert.strictEqual(receivedMsg.sender_name, 'Host Commander');
  });

  await t.test('10. WebRTC Peer-to-Peer Signaling Handshake', async () => {
    // Participant sends offer to host
    const offerReceivedPromise = new Promise((resolve) => {
      hostSocket.on('signal:offer', (payload) => {
        resolve(payload);
      });
    });

    participantSocket.emit('signal:offer', {
      roomId: createdRoom.id,
      toGuestId: hostGuest.id,
      offer: { type: 'offer', sdp: 'v=0\r\no=- 12345 2 IN IP4 127.0.0.1\r\ns=ConnectRoom-Test\r\n' },
    });

    const offerPayload = await offerReceivedPromise;
    assert.strictEqual(offerPayload.fromGuestId, participantGuest.id);
    assert.strictEqual(offerPayload.offer.type, 'offer');

    // Host responds with answer
    const answerReceivedPromise = new Promise((resolve) => {
      participantSocket.on('signal:answer', (payload) => {
        resolve(payload);
      });
    });

    hostSocket.emit('signal:answer', {
      roomId: createdRoom.id,
      toGuestId: participantGuest.id,
      answer: { type: 'answer', sdp: 'v=0\r\no=- 54321 2 IN IP4 127.0.0.1\r\ns=ConnectRoom-Test\r\n' },
    });

    const answerPayload = await answerReceivedPromise;
    assert.strictEqual(answerPayload.fromGuestId, hostGuest.id);
    assert.strictEqual(answerPayload.answer.type, 'answer');

    // ICE Candidate exchange
    const iceCandidatePromise = new Promise((resolve) => {
      hostSocket.on('signal:ice', (payload) => {
        resolve(payload);
      });
    });

    participantSocket.emit('signal:ice', {
      roomId: createdRoom.id,
      toGuestId: hostGuest.id,
      candidate: { candidate: 'candidate:1 1 UDP 2130706431 127.0.0.1 50000 typ host', sdpMid: '0', sdpMLineIndex: 0 },
    });

    const candidatePayload = await iceCandidatePromise;
    assert.strictEqual(candidatePayload.fromGuestId, participantGuest.id);
    assert.ok(candidatePayload.candidate.candidate.includes('127.0.0.1'));
  });

  await t.test('11. Host Moderation: Force Mute Participant', async () => {
    const forceMutePromise = new Promise((resolve) => {
      participantSocket.on('room:force_mute', () => {
        resolve(true);
      });
    });

    hostSocket.emit('room:moderation', {
      roomId: createdRoom.id,
      action: 'mute',
      targetGuestId: participantGuest.id,
    });

    const isMuted = await forceMutePromise;
    assert.strictEqual(isMuted, true);
  });

  await t.test('12. Host Moderation: Lock Room', async () => {
    const lockStatePromise = new Promise((resolve) => {
      participantSocket.on('room:lock_state', (payload) => {
        resolve(payload);
      });
    });

    hostSocket.emit('room:moderation', {
      roomId: createdRoom.id,
      action: 'lock',
    });

    const lockState = await lockStatePromise;
    assert.strictEqual(lockState.isLocked, true);
  });

  await t.test('13. Clean Disconnect & Teardown', async () => {
    const memberLeftPromise = new Promise((resolve) => {
      hostSocket.on('room:participant_left', (payload) => {
        resolve(payload);
      });
    });

    participantSocket.emit('room:leave', { roomId: createdRoom.id });
    const leftPayload = await memberLeftPromise;
    assert.strictEqual(leftPayload.guestId, participantGuest.id);

    participantSocket.disconnect();
    hostSocket.disconnect();
  });
});
