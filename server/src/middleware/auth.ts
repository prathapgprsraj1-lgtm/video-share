import type { Request, Response, NextFunction } from 'express';
import { GuestSessionRepo, RoomMemberRepo, RoomRepo } from '../db/index.js';
import type { GuestSession, RoomMember, Room } from '../types.js';

export interface AuthenticatedRequest extends Request {
  guest?: GuestSession;
  roomMember?: RoomMember;
  room?: Room;
}

export function authGuestMiddleware(req: AuthenticatedRequest, res: Response, next: NextFunction): void {
  const authHeader = req.headers.authorization;
  const tokenFromHeader = authHeader?.startsWith('Bearer ') ? authHeader.substring(7) : null;
  const tokenFromCookie = req.cookies?.connectroom_token;
  const tokenFromCustomHeader = req.headers['x-guest-token'] as string | undefined;

  const token = tokenFromHeader || tokenFromCookie || tokenFromCustomHeader;

  if (!token) {
    res.status(401).json({ error: 'No guest session provided' });
    return;
  }

  const session = GuestSessionRepo.findByToken(token);
  if (!session) {
    res.status(401).json({ error: 'Invalid or expired guest session' });
    return;
  }

  GuestSessionRepo.touchLastSeen(session.id);
  req.guest = session;
  next();
}

export function optionalGuestMiddleware(req: AuthenticatedRequest, res: Response, next: NextFunction): void {
  const authHeader = req.headers.authorization;
  const tokenFromHeader = authHeader?.startsWith('Bearer ') ? authHeader.substring(7) : null;
  const tokenFromCookie = req.cookies?.connectroom_token;
  const tokenFromCustomHeader = req.headers['x-guest-token'] as string | undefined;

  const token = tokenFromHeader || tokenFromCookie || tokenFromCustomHeader;

  if (token) {
    const session = GuestSessionRepo.findByToken(token);
    if (session) {
      GuestSessionRepo.touchLastSeen(session.id);
      req.guest = session;
    }
  }
  next();
}

export function requireRoomMember(allowedRoles?: Array<'host' | 'moderator' | 'participant'>) {
  return (req: AuthenticatedRequest, res: Response, next: NextFunction): void => {
    if (!req.guest) {
      res.status(401).json({ error: 'Unauthorized: Guest session required' });
      return;
    }

    const roomId = req.params.roomId || req.body.roomId;
    if (!roomId) {
      res.status(400).json({ error: 'Room ID is required' });
      return;
    }

    const room = RoomRepo.findById(roomId);
    if (!room) {
      res.status(404).json({ error: 'Room not found' });
      return;
    }

    if (room.status === 'ended') {
      res.status(410).json({ error: 'This room has already ended' });
      return;
    }

    const member = RoomMemberRepo.find(roomId, req.guest.id);
    if (!member || member.membership_status !== 'active') {
      res.status(403).json({ error: 'You are not an active member of this room' });
      return;
    }

    if (allowedRoles && !allowedRoles.includes(member.role)) {
      res.status(403).json({ error: `Action requires one of the following roles: ${allowedRoles.join(', ')}` });
      return;
    }

    req.room = room;
    req.roomMember = member;
    next();
  };
}
