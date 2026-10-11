import { Router } from 'express';
import multer from 'multer';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { v4 as uuidv4 } from 'uuid';
import { AccessToken } from 'livekit-server-sdk';
import { MessageRepo } from '../db/index.js';
import { authGuestMiddleware, requireRoomMember, type AuthenticatedRequest } from '../middleware/auth.js';
import type { Message, MessageAttachment, MessageType } from '../types.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const uploadsDir = path.resolve(__dirname, '../../data/uploads');
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

// Multer storage setup with unique filenames
const storage = multer.diskStorage({
  destination: (_req, _file, cb) => {
    cb(null, uploadsDir);
  },
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    const safeName = `${Date.now()}_${uuidv4().substring(0, 8)}${ext}`;
    cb(null, safeName);
  },
});

// Allow images, videos, audio, pdf, text, docs up to 25MB
const upload = multer({
  storage,
  limits: { fileSize: 25 * 1024 * 1024 }, // 25MB limit
  fileFilter: (_req, file, cb) => {
    const allowedMimes = [
      'image/jpeg',
      'image/png',
      'image/webp',
      'image/gif',
      'image/svg+xml',
      'video/mp4',
      'video/webm',
      'video/quicktime',
      'audio/mpeg',
      'audio/ogg',
      'audio/wav',
      'application/pdf',
      'text/plain',
    ];
    if (allowedMimes.includes(file.mimetype) || file.mimetype.startsWith('image/') || file.mimetype.startsWith('video/')) {
      cb(null, true);
    } else {
      cb(new Error('Unsupported file type'));
    }
  },
});

export const mediaRouter = Router();

// POST /api/rooms/:roomId/uploads - Upload image, video or attachment
mediaRouter.post(
  '/rooms/:roomId/uploads',
  authGuestMiddleware,
  requireRoomMember(),
  upload.single('file'),
  (req: AuthenticatedRequest, res) => {
    try {
      const file = req.file;
      if (!file) {
        res.status(400).json({ error: 'No file uploaded' });
        return;
      }

      const roomId = String(req.params.roomId);
      const guest = req.guest!;
      const caption = (req.body.caption as string) || '';

      let messageType: MessageType = 'file';
      if (file.mimetype.startsWith('image/')) {
        messageType = file.mimetype.includes('gif') ? 'gif' : 'image';
      } else if (file.mimetype.startsWith('video/')) {
        messageType = 'video';
      }

      const messageId = `msg_${uuidv4().replace(/-/g, '')}`;
      const now = new Date().toISOString();

      const message: Message = {
        id: messageId,
        room_id: roomId,
        sender_guest_id: guest.id,
        message_type: messageType,
        content: caption || file.originalname,
        reply_to_message_id: null,
        created_at: now,
        updated_at: null,
        deleted_at: null,
      };

      MessageRepo.create(message);

      const attachmentId = `att_${uuidv4().replace(/-/g, '')}`;
      const attachment: MessageAttachment = {
        id: attachmentId,
        message_id: messageId,
        storage_key: file.filename,
        original_filename: file.originalname,
        content_type: file.mimetype,
        size_bytes: file.size,
        created_at: now,
      };

      MessageRepo.addAttachment(attachment);

      res.status(201).json({
        message: {
          ...message,
          sender_name: guest.display_name,
          sender_avatar: guest.avatar_url,
          attachments: [attachment],
          reactions: [],
        },
      });
    } catch (error) {
      console.error('File upload failed:', error);
      res.status(500).json({ error: 'Failed to process file upload' });
    }
  }
);

// GET /api/attachments/:attachmentId - Download or stream attachment
mediaRouter.get('/attachments/:attachmentId', (req, res) => {
  const attachmentId = String(req.params.attachmentId);
  const attachment = MessageRepo.getAttachment(attachmentId);

  if (!attachment) {
    res.status(404).json({ error: 'Attachment not found' });
    return;
  }

  const filePath = path.join(uploadsDir, attachment.storage_key);
  if (!fs.existsSync(filePath)) {
    res.status(404).json({ error: 'File content missing on server' });
    return;
  }

  res.setHeader('Content-Type', attachment.content_type);
  res.setHeader('Content-Disposition', `inline; filename="${encodeURIComponent(attachment.original_filename)}"`);
  res.setHeader('Cache-Control', 'public, max-age=86400');

  const fileStream = fs.createReadStream(filePath);
  fileStream.pipe(res);
});

// POST /api/rooms/:roomId/media-token - Issue media token for WebRTC / LiveKit
mediaRouter.post('/rooms/:roomId/media-token', authGuestMiddleware, requireRoomMember(), async (req: AuthenticatedRequest, res) => {
  try {
    const roomId = String(req.params.roomId);
    const guest = req.guest!;

    const livekitUrl = process.env.LIVEKIT_URL;
    const livekitApiKey = process.env.LIVEKIT_API_KEY;
    const livekitApiSecret = process.env.LIVEKIT_API_SECRET;

    if (livekitUrl && livekitApiKey && livekitApiSecret) {
      try {
        const at = new AccessToken(livekitApiKey, livekitApiSecret, {
          identity: guest.id,
          name: guest.display_name,
        });

        at.addGrant({
          room: roomId,
          roomJoin: true,
          canPublish: true,
          canSubscribe: true,
        });

        const token = await at.toJwt();
        res.json({
          provider: 'livekit',
          serverUrl: livekitUrl,
          token,
        });
        return;
      } catch (err) {
        console.warn('LiveKit token generation fallback to WebRTC mesh:', err);
      }
    }

    // Default to built-in WebRTC mesh over Socket.io signaling
    res.json({
      provider: 'webrtc_mesh',
      signaling: 'socket.io',
      guestId: guest.id,
      displayName: guest.display_name,
      avatarUrl: guest.avatar_url,
      iceServers: [
        { urls: 'stun:stun.l.google.com:19302' },
        { urls: 'stun:stun1.l.google.com:19302' },
        { urls: 'stun:stun2.l.google.com:19302' },
      ],
    });
  } catch (error) {
    console.error('Failed to create media token:', error);
    res.status(500).json({ error: 'Failed to issue media credentials' });
  }
});
