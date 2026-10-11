import { Router } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { z } from 'zod';
import crypto from 'node:crypto';
import { RoomRepo, RoomMemberRepo, RoomInvitationRepo } from '../db/index.js';
import { authGuestMiddleware, requireRoomMember, type AuthenticatedRequest } from '../middleware/auth.js';
import { createRateLimiter } from '../middleware/rateLimit.js';
import type { Room, RoomMember, RoomInvitation } from '../types.js';

export const roomsRouter = Router();

// Rate limiter for room creation
const createRoomLimiter = createRateLimiter({
  max: 20,
  windowMs: 15 * 60 * 1000,
  message: 'Too many rooms created from this IP, please wait a while.',
});

// Helper to generate human-friendly clean room IDs
function generateRoomId(): string {
  const part1 = Math.random().toString(36).substring(2, 6);
  const part2 = Math.random().toString(36).substring(2, 6);
  return `room-${part1}-${part2}`;
}

// Generate unpredictable secure invite token
function generateInviteToken(): string {
  return crypto.randomBytes(24).toString('hex');
}

const CreateRoomSchema = z.object({
  name: z.string().trim().min(1).max(64),
  description: z.string().trim().max(256).optional(),
  password: z.string().min(1).max(64).optional(),
  waitingRoom: z.boolean().optional(),
  maxParticipants: z.number().int().min(2).max(100).optional(),
});

// POST /api/rooms - Create a room
roomsRouter.post('/', createRoomLimiter, authGuestMiddleware, (req: AuthenticatedRequest, res) => {
  try {
    const parseResult = CreateRoomSchema.safeParse(req.body);
    if (!parseResult.success) {
      res.status(400).json({ error: 'Invalid room configuration', details: parseResult.error.format() });
      return;
    }

    const guest = req.guest!;
    const { name, description, password, waitingRoom, maxParticipants } = parseResult.data;

    const roomId = generateRoomId();
    const now = new Date().toISOString();

    let passwordHash: string | null = null;
    if (password) {
      passwordHash = crypto.createHash('sha256').update(password).digest('hex');
    }

    const room: Room = {
      id: roomId,
      name,
      description: description || null,
      owner_guest_id: guest.id,
      visibility: 'public',
      password_hash: passwordHash,
      waiting_room_enabled: waitingRoom ? 1 : 0,
      is_locked: 0,
      status: 'active',
      max_participants: maxParticipants || 50,
      created_at: now,
      expires_at: null,
      ended_at: null,
    };

    RoomRepo.create(room);

    // Host membership
    const member: RoomMember = {
      id: uuidv4(),
      room_id: roomId,
      guest_id: guest.id,
      role: 'host',
      joined_at: now,
      left_at: null,
      membership_status: 'active',
    };
    RoomMemberRepo.upsert(member);

    // Create initial invitation token
    const inviteToken = generateInviteToken();
    const invitation: RoomInvitation = {
      id: uuidv4(),
      room_id: roomId,
      token: inviteToken,
      token_hash: crypto.createHash('sha256').update(inviteToken).digest('hex'),
      created_by: guest.id,
      created_at: now,
      expires_at: null,
      revoked_at: null,
      max_uses: 0,
      use_count: 0,
    };
    RoomInvitationRepo.create(invitation);

    res.status(201).json({
      room: {
        id: room.id,
        name: room.name,
        description: room.description,
        isLocked: false,
        waitingRoomEnabled: Boolean(room.waiting_room_enabled),
        maxParticipants: room.max_participants,
        createdAt: room.created_at,
        isHost: true,
      },
      inviteToken,
      role: 'host',
    });
  } catch (error) {
    console.error('Error creating room:', error);
    res.status(500).json({ error: 'Failed to create room' });
  }
});

// GET /api/rooms/:roomId - Get room information
roomsRouter.get('/:roomId', authGuestMiddleware, (req: AuthenticatedRequest, res) => {
  const roomId = String(req.params.roomId);
  const room = RoomRepo.findById(roomId);

  if (!room) {
    res.status(404).json({ error: 'Room not found' });
    return;
  }

  if (room.status === 'ended') {
    res.status(410).json({ error: 'This room has ended' });
    return;
  }

  const member = RoomMemberRepo.find(roomId, req.guest!.id);
  const activeMembers = RoomMemberRepo.getActiveMembers(roomId);
  const waitingMembers = member?.role === 'host' ? RoomMemberRepo.getWaitingMembers(roomId) : [];

  res.json({
    room: {
      id: room.id,
      name: room.name,
      description: room.description,
      isLocked: Boolean(room.is_locked),
      waitingRoomEnabled: Boolean(room.waiting_room_enabled),
      hasPassword: Boolean(room.password_hash),
      maxParticipants: room.max_participants,
      createdAt: room.created_at,
      status: room.status,
    },
    membership: member
      ? {
          role: member.role,
          status: member.membership_status,
          joinedAt: member.joined_at,
        }
      : null,
    participants: activeMembers.map((m) => ({
      guestId: m.guest_id,
      displayName: m.display_name,
      avatarUrl: m.avatar_url,
      role: m.role,
      joinedAt: m.joined_at,
    })),
    waitingParticipants: waitingMembers.map((m) => ({
      guestId: m.guest_id,
      displayName: m.display_name,
      avatarUrl: m.avatar_url,
      joinedAt: m.joined_at,
    })),
  });
});

const JoinRoomSchema = z.object({
  password: z.string().optional(),
  inviteToken: z.string().optional(),
});

// POST /api/rooms/:roomId/join - Join room
roomsRouter.post('/:roomId/join', authGuestMiddleware, (req: AuthenticatedRequest, res) => {
  try {
    const roomId = String(req.params.roomId);
    const guest = req.guest!;
    const parseResult = JoinRoomSchema.safeParse(req.body);
    const { password, inviteToken } = parseResult.success ? parseResult.data : {};

    const room = RoomRepo.findById(roomId);
    if (!room) {
      res.status(404).json({ error: 'Room does not exist' });
      return;
    }

    if (room.status === 'ended') {
      res.status(410).json({ error: 'This room has ended' });
      return;
    }

    // Verify invitation token if provided
    if (inviteToken) {
      const invite = RoomInvitationRepo.findByToken(inviteToken);
      if (!invite || invite.room_id !== roomId) {
        res.status(403).json({ error: 'Invalid or expired invitation' });
        return;
      }
      RoomInvitationRepo.incrementUseCount(invite.id);
    }

    // Check password if set
    if (room.password_hash) {
      if (!password) {
        res.status(401).json({ error: 'Password required to enter this room', needsPassword: true });
        return;
      }
      const hash = crypto.createHash('sha256').update(password).digest('hex');
      if (hash !== room.password_hash) {
        res.status(403).json({ error: 'Incorrect room password' });
        return;
      }
    }

    // Existing member check
    const existingMember = RoomMemberRepo.find(roomId, guest.id);
    const isOwner = room.owner_guest_id === guest.id;

    // Check if room is locked
    if (room.is_locked && !isOwner && (!existingMember || existingMember.role !== 'host')) {
      res.status(403).json({ error: 'This room is locked by the host' });
      return;
    }

    // Check participant limit
    const activeMembers = RoomMemberRepo.getActiveMembers(roomId);
    if (activeMembers.length >= room.max_participants && !isOwner) {
      res.status(403).json({ error: 'Room is at maximum capacity' });
      return;
    }

    // Check waiting room policy
    const shouldWait = Boolean(room.waiting_room_enabled) && !isOwner && (!existingMember || existingMember.role !== 'host');
    const role = isOwner ? 'host' : existingMember?.role || 'participant';
    const status = shouldWait ? 'waiting' : 'active';

    const member: RoomMember = {
      id: existingMember?.id || uuidv4(),
      room_id: roomId,
      guest_id: guest.id,
      role,
      joined_at: new Date().toISOString(),
      left_at: null,
      membership_status: status,
    };

    RoomMemberRepo.upsert(member);

    res.json({
      status,
      role,
      room: {
        id: room.id,
        name: room.name,
        description: room.description,
        isLocked: Boolean(room.is_locked),
        waitingRoomEnabled: Boolean(room.waiting_room_enabled),
      },
    });
  } catch (error) {
    console.error('Error joining room:', error);
    res.status(500).json({ error: 'Failed to join room' });
  }
});

// POST /api/rooms/:roomId/leave - Leave room
roomsRouter.post('/:roomId/leave', authGuestMiddleware, (req: AuthenticatedRequest, res) => {
  const roomId = String(req.params.roomId);
  const guest = req.guest!;
  RoomMemberRepo.updateStatus(roomId, guest.id, 'left');
  res.json({ success: true, message: 'Left room' });
});

// POST /api/rooms/:roomId/end - Host ends room for all
roomsRouter.post('/:roomId/end', authGuestMiddleware, requireRoomMember(['host']), (req: AuthenticatedRequest, res) => {
  const roomId = String(req.params.roomId);
  RoomRepo.end(roomId);
  res.json({ success: true, message: 'Room has been ended' });
});

// POST /api/rooms/:roomId/lock - Host locks/unlocks room
roomsRouter.post('/:roomId/lock', authGuestMiddleware, requireRoomMember(['host']), (req: AuthenticatedRequest, res) => {
  const roomId = String(req.params.roomId);
  const { locked } = req.body;
  RoomRepo.update(roomId, { is_locked: locked ? 1 : 0 });
  res.json({ success: true, isLocked: Boolean(locked) });
});

// POST /api/rooms/:roomId/approve - Host approves/rejects waiting participant
roomsRouter.post('/:roomId/approve', authGuestMiddleware, requireRoomMember(['host']), (req: AuthenticatedRequest, res) => {
  const roomId = String(req.params.roomId);
  const { targetGuestId, approve } = req.body;

  if (!targetGuestId) {
    res.status(400).json({ error: 'targetGuestId is required' });
    return;
  }

  const newStatus = approve ? 'active' : 'kicked';
  RoomMemberRepo.updateStatus(roomId, targetGuestId, newStatus);

  res.json({ success: true, targetGuestId, status: newStatus });
});

// POST /api/rooms/:roomId/kick - Host kicks participant
roomsRouter.post('/:roomId/kick', authGuestMiddleware, requireRoomMember(['host']), (req: AuthenticatedRequest, res) => {
  const roomId = String(req.params.roomId);
  const { targetGuestId } = req.body;

  if (!targetGuestId) {
    res.status(400).json({ error: 'targetGuestId is required' });
    return;
  }

  if (targetGuestId === req.guest!.id) {
    res.status(400).json({ error: 'Host cannot kick themselves' });
    return;
  }

  RoomMemberRepo.updateStatus(roomId, targetGuestId, 'kicked');
  res.json({ success: true, kicked: targetGuestId });
});

// Invitations API
// POST /api/rooms/:roomId/invitations - Create new invite
roomsRouter.post('/:roomId/invitations', authGuestMiddleware, requireRoomMember(['host']), (req: AuthenticatedRequest, res) => {
  const roomId = String(req.params.roomId);
  const guest = req.guest!;
  const token = generateInviteToken();

  const invite: RoomInvitation = {
    id: uuidv4(),
    room_id: roomId,
    token,
    token_hash: crypto.createHash('sha256').update(token).digest('hex'),
    created_by: guest.id,
    created_at: new Date().toISOString(),
    expires_at: null,
    revoked_at: null,
    max_uses: 0,
    use_count: 0,
  };

  RoomInvitationRepo.create(invite);
  res.status(201).json({ inviteToken: token, id: invite.id, invitation: invite });
});

// GET /api/rooms/:roomId/invitations - List room invitations
roomsRouter.get('/:roomId/invitations', authGuestMiddleware, requireRoomMember(['host']), (req: AuthenticatedRequest, res) => {
  const roomId = String(req.params.roomId);
  const invitations = RoomInvitationRepo.getForRoom(roomId);
  res.json({ invitations });
});

// DELETE /api/rooms/:roomId/invitations/:inviteId - Revoke invitation
roomsRouter.delete('/:roomId/invitations/:inviteId', authGuestMiddleware, requireRoomMember(['host']), (req: AuthenticatedRequest, res) => {
  const inviteId = String(req.params.inviteId);
  RoomInvitationRepo.revoke(inviteId);
  res.json({ success: true, revokedId: inviteId });
});

// POST /api/invitations/validate - Validate an invitation token
roomsRouter.post('/invitations/validate', (req, res) => {
  const { token } = req.body;
  if (!token) {
    res.status(400).json({ error: 'Token is required' });
    return;
  }

  const invite = RoomInvitationRepo.findByToken(token);
  if (!invite) {
    res.status(404).json({ error: 'Invalid or revoked invitation' });
    return;
  }

  const room = RoomRepo.findById(invite.room_id);
  if (!room || room.status === 'ended') {
    res.status(410).json({ error: 'Room has expired or been ended' });
    return;
  }

  res.json({
    valid: true,
    roomId: room.id,
    roomName: room.name,
    isLocked: Boolean(room.is_locked),
    hasPassword: Boolean(room.password_hash),
    waitingRoomEnabled: Boolean(room.waiting_room_enabled),
  });
});
