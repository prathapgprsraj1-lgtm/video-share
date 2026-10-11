import { Router } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { z } from 'zod';
import { MessageRepo, RoomMemberRepo } from '../db/index.js';
import { authGuestMiddleware, requireRoomMember, type AuthenticatedRequest } from '../middleware/auth.js';
import { createRateLimiter } from '../middleware/rateLimit.js';
import type { Message, MessageType } from '../types.js';

export const messagesRouter = Router();

const messageSendLimiter = createRateLimiter({
  max: 60,
  windowMs: 60 * 1000,
  message: 'Slow down! You are sending messages too quickly.',
});

// GET /api/rooms/:roomId/messages - Get room messages
messagesRouter.get('/rooms/:roomId/messages', authGuestMiddleware, requireRoomMember(), (req: AuthenticatedRequest, res) => {
  const roomId = String(req.params.roomId);
  const limit = Math.min(Number(req.query.limit) || 50, 100);
  const offset = Number(req.query.offset) || 0;

  const messages = MessageRepo.getRoomMessages(roomId, limit, offset);
  res.json({ messages });
});

const CreateMessageSchema = z.object({
  content: z.string().trim().min(1).max(4000),
  messageType: z.enum(['text', 'image', 'gif', 'video', 'file', 'system']).default('text'),
  replyToMessageId: z.string().optional(),
});

// POST /api/rooms/:roomId/messages - Post a new message
messagesRouter.post('/rooms/:roomId/messages', messageSendLimiter, authGuestMiddleware, requireRoomMember(), (req: AuthenticatedRequest, res) => {
  try {
    const roomId = String(req.params.roomId);
    const guest = req.guest!;
    const parseResult = CreateMessageSchema.safeParse(req.body);

    if (!parseResult.success) {
      res.status(400).json({ error: 'Invalid message', details: parseResult.error.format() });
      return;
    }

    const { content, messageType, replyToMessageId } = parseResult.data;
    const messageId = `msg_${uuidv4().replace(/-/g, '')}`;
    const now = new Date().toISOString();

    const message: Message = {
      id: messageId,
      room_id: roomId,
      sender_guest_id: guest.id,
      message_type: messageType as MessageType,
      content,
      reply_to_message_id: replyToMessageId || null,
      created_at: now,
      updated_at: null,
      deleted_at: null,
    };

    MessageRepo.create(message);

    // Fetch reply info if applicable
    let reply_to = null;
    if (replyToMessageId) {
      const parent = MessageRepo.findById(replyToMessageId);
      if (parent) {
        reply_to = {
          id: parent.id,
          content: parent.content,
          sender_name: parent.sender_name || 'Guest',
        };
      }
    }

    res.status(201).json({
      message: {
        ...message,
        sender_name: guest.display_name,
        sender_avatar: guest.avatar_url,
        reply_to,
        reactions: [],
        attachments: [],
      },
    });
  } catch (error) {
    console.error('Error posting message:', error);
    res.status(500).json({ error: 'Failed to post message' });
  }
});

// PATCH /api/messages/:messageId - Edit own message
messagesRouter.patch('/messages/:messageId', authGuestMiddleware, (req: AuthenticatedRequest, res) => {
  const messageId = String(req.params.messageId);
  const { content } = req.body;

  if (!content || typeof content !== 'string' || content.trim().length === 0) {
    res.status(400).json({ error: 'Valid content required' });
    return;
  }

  const message = MessageRepo.findById(messageId);
  if (!message) {
    res.status(404).json({ error: 'Message not found' });
    return;
  }

  if (message.sender_guest_id !== req.guest!.id) {
    res.status(403).json({ error: 'You can only edit your own messages' });
    return;
  }

  MessageRepo.updateContent(messageId, content.trim());
  res.json({ success: true, messageId, content: content.trim() });
});

// DELETE /api/messages/:messageId - Delete message
messagesRouter.delete('/messages/:messageId', authGuestMiddleware, (req: AuthenticatedRequest, res) => {
  const messageId = String(req.params.messageId);
  const message = MessageRepo.findById(messageId);

  if (!message) {
    res.status(404).json({ error: 'Message not found' });
    return;
  }

  const guest = req.guest!;
  const isSender = message.sender_guest_id === guest.id;
  const membership = RoomMemberRepo.find(message.room_id, guest.id);
  const isHost = membership?.role === 'host';

  if (!isSender && !isHost) {
    res.status(403).json({ error: 'Unauthorized to delete this message' });
    return;
  }

  MessageRepo.softDelete(messageId);
  res.json({ success: true, messageId });
});

// POST /api/messages/:messageId/reactions - Toggle reaction
messagesRouter.post('/messages/:messageId/reactions', authGuestMiddleware, (req: AuthenticatedRequest, res) => {
  const messageId = String(req.params.messageId);
  const { emoji } = req.body;

  if (!emoji || typeof emoji !== 'string') {
    res.status(400).json({ error: 'Emoji is required' });
    return;
  }

  const message = MessageRepo.findById(messageId);
  if (!message) {
    res.status(404).json({ error: 'Message not found' });
    return;
  }

  const result = MessageRepo.toggleReaction(messageId, req.guest!.id, emoji);
  res.json({ success: true, ...result, emoji, messageId });
});
