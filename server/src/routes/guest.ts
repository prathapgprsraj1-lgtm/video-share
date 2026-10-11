import { Router } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { z } from 'zod';
import { GuestSessionRepo } from '../db/index.js';
import { authGuestMiddleware, type AuthenticatedRequest } from '../middleware/auth.js';
import type { GuestSession } from '../types.js';

export const guestRouter = Router();

// Helper to generate cheerful anonymous names
function generateFriendlyGuestName(): string {
  const num = Math.floor(1000 + Math.random() * 9000);
  return `Guest-${num}`;
}

// Generate a deterministic SVG or dicebear avatar based on guest ID
function generateDefaultAvatar(id: string): string {
  const colors = ['6366f1', '8b5cf6', 'ec4899', '14b8a6', 'f59e0b', '3b82f6', '10b981'];
  const hash = id.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0);
  const color = colors[hash % colors.length];
  return `https://api.dicebear.com/7.x/bottts/svg?seed=${id}&backgroundColor=${color}`;
}

const CreateSessionSchema = z.object({
  displayName: z.string().trim().min(1).max(32).optional(),
  avatarUrl: z.string().url().optional(),
});

// POST /api/guest/session - Create or resume anonymous guest session
guestRouter.post('/session', (req, res) => {
  try {
    const parseResult = CreateSessionSchema.safeParse(req.body);
    if (!parseResult.success) {
      res.status(400).json({ error: 'Invalid session data', details: parseResult.error.format() });
      return;
    }

    const { displayName, avatarUrl } = parseResult.data;
    const guestId = `guest_${uuidv4().replace(/-/g, '').substring(0, 16)}`;
    const sessionToken = `cr_token_${uuidv4().replace(/-/g, '')}`;
    const now = new Date();
    const expiresAt = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000); // 7 days

    const session: GuestSession = {
      id: guestId,
      session_token: sessionToken,
      display_name: displayName || generateFriendlyGuestName(),
      avatar_url: avatarUrl || generateDefaultAvatar(guestId),
      created_at: now.toISOString(),
      last_seen_at: now.toISOString(),
      expires_at: expiresAt.toISOString(),
      revoked_at: null,
    };

    GuestSessionRepo.create(session);

    // Set secure cookie
    res.cookie('connectroom_token', sessionToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 7 * 24 * 60 * 60 * 1000,
    });

    res.status(201).json({
      guest: {
        id: session.id,
        displayName: session.display_name,
        avatarUrl: session.avatar_url,
        createdAt: session.created_at,
      },
      token: sessionToken,
    });
  } catch (error) {
    console.error('Failed to create guest session:', error);
    res.status(500).json({ error: 'Failed to create guest session' });
  }
});

// GET /api/guest/session - Get current guest profile
guestRouter.get('/session', authGuestMiddleware, (req: AuthenticatedRequest, res) => {
  const guest = req.guest!;
  res.json({
    guest: {
      id: guest.id,
      displayName: guest.display_name,
      avatarUrl: guest.avatar_url,
      createdAt: guest.created_at,
      lastSeenAt: guest.last_seen_at,
    },
  });
});

const UpdateProfileSchema = z.object({
  displayName: z.string().trim().min(1).max(32).optional(),
  avatarUrl: z.string().url().optional(),
});

// PATCH /api/guest/profile - Update display name or avatar
guestRouter.patch('/profile', authGuestMiddleware, (req: AuthenticatedRequest, res) => {
  try {
    const parseResult = UpdateProfileSchema.safeParse(req.body);
    if (!parseResult.success) {
      res.status(400).json({ error: 'Invalid profile data', details: parseResult.error.format() });
      return;
    }

    const guest = req.guest!;
    const newName = parseResult.data.displayName || guest.display_name;
    const newAvatar = parseResult.data.avatarUrl || guest.avatar_url;

    GuestSessionRepo.updateProfile(guest.id, newName, newAvatar);

    res.json({
      guest: {
        id: guest.id,
        displayName: newName,
        avatarUrl: newAvatar,
      },
    });
  } catch (error) {
    console.error('Failed to update profile:', error);
    res.status(500).json({ error: 'Failed to update profile' });
  }
});

// POST /api/guest/session/leave - Clear session
guestRouter.post('/session/leave', (req, res) => {
  res.clearCookie('connectroom_token');
  res.json({ success: true, message: 'Session cleared' });
});
