import { DatabaseSync } from 'node:sqlite';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import type {
  GuestSession,
  Room,
  RoomMember,
  RoomInvitation,
  Message,
  MessageAttachment,
  WatchSession,
} from '../types.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Data directory
const dataDir = path.resolve(__dirname, '../../data');
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

const dbPath = path.join(dataDir, 'connectroom.db');
const db = new DatabaseSync(dbPath);

// Initialize database schema
export function initDb() {
  db.exec(`
    PRAGMA foreign_keys = ON;
    PRAGMA journal_mode = WAL;
    PRAGMA busy_timeout = 5000;
    PRAGMA synchronous = NORMAL;

    CREATE TABLE IF NOT EXISTS guest_sessions (
      id TEXT PRIMARY KEY,
      session_token TEXT UNIQUE NOT NULL,
      display_name TEXT NOT NULL,
      avatar_url TEXT NOT NULL,
      created_at TEXT NOT NULL,
      last_seen_at TEXT NOT NULL,
      expires_at TEXT NOT NULL,
      revoked_at TEXT
    );

    CREATE TABLE IF NOT EXISTS rooms (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      description TEXT,
      owner_guest_id TEXT NOT NULL,
      visibility TEXT DEFAULT 'public',
      password_hash TEXT,
      waiting_room_enabled INTEGER DEFAULT 0,
      is_locked INTEGER DEFAULT 0,
      status TEXT DEFAULT 'active',
      max_participants INTEGER DEFAULT 50,
      created_at TEXT NOT NULL,
      expires_at TEXT,
      ended_at TEXT
    );

    CREATE TABLE IF NOT EXISTS room_members (
      id TEXT PRIMARY KEY,
      room_id TEXT NOT NULL,
      guest_id TEXT NOT NULL,
      role TEXT NOT NULL,
      joined_at TEXT NOT NULL,
      left_at TEXT,
      membership_status TEXT NOT NULL,
      FOREIGN KEY (room_id) REFERENCES rooms(id) ON DELETE CASCADE,
      FOREIGN KEY (guest_id) REFERENCES guest_sessions(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS room_invitations (
      id TEXT PRIMARY KEY,
      room_id TEXT NOT NULL,
      token TEXT UNIQUE NOT NULL,
      token_hash TEXT,
      created_by TEXT NOT NULL,
      created_at TEXT NOT NULL,
      expires_at TEXT,
      revoked_at TEXT,
      max_uses INTEGER DEFAULT 0,
      use_count INTEGER DEFAULT 0,
      FOREIGN KEY (room_id) REFERENCES rooms(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS messages (
      id TEXT PRIMARY KEY,
      room_id TEXT NOT NULL,
      sender_guest_id TEXT NOT NULL,
      message_type TEXT NOT NULL,
      content TEXT NOT NULL,
      reply_to_message_id TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT,
      deleted_at TEXT,
      FOREIGN KEY (room_id) REFERENCES rooms(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS message_attachments (
      id TEXT PRIMARY KEY,
      message_id TEXT NOT NULL,
      storage_key TEXT NOT NULL,
      original_filename TEXT NOT NULL,
      content_type TEXT NOT NULL,
      size_bytes INTEGER NOT NULL,
      created_at TEXT NOT NULL,
      FOREIGN KEY (message_id) REFERENCES messages(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS message_reactions (
      id TEXT PRIMARY KEY,
      message_id TEXT NOT NULL,
      guest_id TEXT NOT NULL,
      emoji TEXT NOT NULL,
      created_at TEXT NOT NULL,
      FOREIGN KEY (message_id) REFERENCES messages(id) ON DELETE CASCADE,
      UNIQUE (message_id, guest_id, emoji)
    );

    CREATE TABLE IF NOT EXISTS watch_sessions (
      id TEXT PRIMARY KEY,
      room_id TEXT UNIQUE NOT NULL,
      host_guest_id TEXT NOT NULL,
      media_source TEXT NOT NULL,
      playback_status TEXT NOT NULL,
      playback_position REAL NOT NULL,
      server_updated_at TEXT NOT NULL,
      created_at TEXT NOT NULL,
      ended_at TEXT,
      FOREIGN KEY (room_id) REFERENCES rooms(id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_members_room ON room_members(room_id, membership_status);
    CREATE INDEX IF NOT EXISTS idx_messages_room ON messages(room_id, created_at);
    CREATE INDEX IF NOT EXISTS idx_invitations_token ON room_invitations(token);
  `);
}

// Guest Session operations
export const GuestSessionRepo = {
  create(session: GuestSession): GuestSession {
    const stmt = db.prepare(`
      INSERT INTO guest_sessions (id, session_token, display_name, avatar_url, created_at, last_seen_at, expires_at, revoked_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `);
    stmt.run(
      session.id,
      session.session_token,
      session.display_name,
      session.avatar_url,
      session.created_at,
      session.last_seen_at,
      session.expires_at,
      session.revoked_at
    );
    return session;
  },

  findByToken(token: string): GuestSession | null {
    const stmt = db.prepare('SELECT * FROM guest_sessions WHERE session_token = ? AND revoked_at IS NULL');
    const result = stmt.get(token) as unknown as GuestSession | undefined;
    return result || null;
  },

  findById(id: string): GuestSession | null {
    const stmt = db.prepare('SELECT * FROM guest_sessions WHERE id = ?');
    const result = stmt.get(id) as unknown as GuestSession | undefined;
    return result || null;
  },

  updateProfile(id: string, displayName: string, avatarUrl: string): boolean {
    const stmt = db.prepare('UPDATE guest_sessions SET display_name = ?, avatar_url = ?, last_seen_at = ? WHERE id = ?');
    stmt.run(displayName, avatarUrl, new Date().toISOString(), id);
    return true;
  },

  touchLastSeen(id: string): void {
    const stmt = db.prepare('UPDATE guest_sessions SET last_seen_at = ? WHERE id = ?');
    stmt.run(new Date().toISOString(), id);
  },
};

// Room operations
export const RoomRepo = {
  create(room: Room): Room {
    const stmt = db.prepare(`
      INSERT INTO rooms (id, name, description, owner_guest_id, visibility, password_hash, waiting_room_enabled, is_locked, status, max_participants, created_at, expires_at, ended_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    stmt.run(
      room.id,
      room.name,
      room.description,
      room.owner_guest_id,
      room.visibility,
      room.password_hash,
      room.waiting_room_enabled,
      room.is_locked,
      room.status,
      room.max_participants,
      room.created_at,
      room.expires_at,
      room.ended_at
    );
    return room;
  },

  findById(id: string): Room | null {
    const stmt = db.prepare('SELECT * FROM rooms WHERE id = ?');
    const result = stmt.get(id) as unknown as Room | undefined;
    return result || null;
  },

  update(id: string, updates: Partial<Room>): boolean {
    const fields = Object.keys(updates);
    if (fields.length === 0) return true;
    const setClause = fields.map((f) => `${f} = ?`).join(', ');
    const values = fields.map((f) => (updates as any)[f]);
    values.push(id);
    const stmt = db.prepare(`UPDATE rooms SET ${setClause} WHERE id = ?`);
    stmt.run(...values);
    return true;
  },

  end(id: string): boolean {
    const stmt = db.prepare("UPDATE rooms SET status = 'ended', ended_at = ? WHERE id = ?");
    stmt.run(new Date().toISOString(), id);
    return true;
  },
};

// Room Member operations
export const RoomMemberRepo = {
  upsert(member: RoomMember): RoomMember {
    const existing = db.prepare('SELECT id FROM room_members WHERE room_id = ? AND guest_id = ?').get(member.room_id, member.guest_id) as { id: string } | undefined;
    if (existing) {
      db.prepare(`
        UPDATE room_members
        SET role = ?, joined_at = ?, left_at = NULL, membership_status = ?
        WHERE id = ?
      `).run(member.role, member.joined_at, member.membership_status, existing.id);
      return { ...member, id: existing.id };
    }

    const stmt = db.prepare(`
      INSERT INTO room_members (id, room_id, guest_id, role, joined_at, left_at, membership_status)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `);
    stmt.run(
      member.id,
      member.room_id,
      member.guest_id,
      member.role,
      member.joined_at,
      member.left_at,
      member.membership_status
    );
    return member;
  },

  find(roomId: string, guestId: string): RoomMember | null {
    const stmt = db.prepare(`
      SELECT rm.*, gs.display_name, gs.avatar_url
      FROM room_members rm
      JOIN guest_sessions gs ON rm.guest_id = gs.id
      WHERE rm.room_id = ? AND rm.guest_id = ?
    `);
    const result = stmt.get(roomId, guestId) as unknown as (RoomMember & { display_name: string; avatar_url: string }) | undefined;
    return result || null;
  },

  getActiveMembers(roomId: string): (RoomMember & { display_name: string; avatar_url: string })[] {
    const stmt = db.prepare(`
      SELECT rm.*, gs.display_name, gs.avatar_url
      FROM room_members rm
      JOIN guest_sessions gs ON rm.guest_id = gs.id
      WHERE rm.room_id = ? AND rm.membership_status = 'active'
    `);
    return stmt.all(roomId) as unknown as (RoomMember & { display_name: string; avatar_url: string })[];
  },

  getWaitingMembers(roomId: string): (RoomMember & { display_name: string; avatar_url: string })[] {
    const stmt = db.prepare(`
      SELECT rm.*, gs.display_name, gs.avatar_url
      FROM room_members rm
      JOIN guest_sessions gs ON rm.guest_id = gs.id
      WHERE rm.room_id = ? AND rm.membership_status = 'waiting'
    `);
    return stmt.all(roomId) as unknown as (RoomMember & { display_name: string; avatar_url: string })[];
  },

  updateStatus(roomId: string, guestId: string, status: RoomMember['membership_status']): boolean {
    const leftAt = status === 'left' || status === 'kicked' ? new Date().toISOString() : null;
    const stmt = db.prepare('UPDATE room_members SET membership_status = ?, left_at = ? WHERE room_id = ? AND guest_id = ?');
    stmt.run(status, leftAt, roomId, guestId);
    return true;
  },

  updateRole(roomId: string, guestId: string, role: RoomMember['role']): boolean {
    const stmt = db.prepare('UPDATE room_members SET role = ? WHERE room_id = ? AND guest_id = ?');
    stmt.run(role, roomId, guestId);
    return true;
  },
};

// Invitations
export const RoomInvitationRepo = {
  create(invite: RoomInvitation): RoomInvitation {
    const stmt = db.prepare(`
      INSERT INTO room_invitations (id, room_id, token, token_hash, created_by, created_at, expires_at, revoked_at, max_uses, use_count)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    stmt.run(
      invite.id,
      invite.room_id,
      invite.token,
      invite.token_hash,
      invite.created_by,
      invite.created_at,
      invite.expires_at,
      invite.revoked_at,
      invite.max_uses,
      invite.use_count
    );
    return invite;
  },

  findByToken(token: string): RoomInvitation | null {
    const stmt = db.prepare('SELECT * FROM room_invitations WHERE token = ? AND revoked_at IS NULL');
    const result = stmt.get(token) as unknown as RoomInvitation | undefined;
    return result || null;
  },

  getForRoom(roomId: string): RoomInvitation[] {
    const stmt = db.prepare('SELECT * FROM room_invitations WHERE room_id = ? AND revoked_at IS NULL ORDER BY created_at DESC');
    return stmt.all(roomId) as unknown as RoomInvitation[];
  },

  incrementUseCount(id: string): void {
    const stmt = db.prepare('UPDATE room_invitations SET use_count = use_count + 1 WHERE id = ?');
    stmt.run(id);
  },

  revoke(id: string): boolean {
    const stmt = db.prepare('UPDATE room_invitations SET revoked_at = ? WHERE id = ?');
    stmt.run(new Date().toISOString(), id);
    return true;
  },
};

// Messages
export const MessageRepo = {
  create(msg: Message): Message {
    const stmt = db.prepare(`
      INSERT INTO messages (id, room_id, sender_guest_id, message_type, content, reply_to_message_id, created_at, updated_at, deleted_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    stmt.run(
      msg.id,
      msg.room_id,
      msg.sender_guest_id,
      msg.message_type,
      msg.content,
      msg.reply_to_message_id,
      msg.created_at,
      msg.updated_at,
      msg.deleted_at
    );
    return msg;
  },

  findById(id: string): Message | null {
    const stmt = db.prepare('SELECT * FROM messages WHERE id = ?');
    const result = stmt.get(id) as unknown as Message | undefined;
    return result || null;
  },

  getRoomMessages(roomId: string, limit = 100, offset = 0): Message[] {
    const stmt = db.prepare(`
      SELECT m.*, gs.display_name as sender_name, gs.avatar_url as sender_avatar
      FROM messages m
      JOIN guest_sessions gs ON m.sender_guest_id = gs.id
      WHERE m.room_id = ?
      ORDER BY m.created_at ASC
      LIMIT ? OFFSET ?
    `);
    const rawMessages = stmt.all(roomId, limit, offset) as unknown as (Message & { sender_name: string; sender_avatar: string })[];

    return rawMessages.map((msg) => {
      // Fetch attachments
      const attachStmt = db.prepare('SELECT * FROM message_attachments WHERE message_id = ?');
      const attachments = attachStmt.all(msg.id) as unknown as MessageAttachment[];

      // Fetch reactions
      const reactStmt = db.prepare('SELECT emoji, guest_id FROM message_reactions WHERE message_id = ?');
      const rawReactions = reactStmt.all(msg.id) as unknown as { emoji: string; guest_id: string }[];
      const reactionMap = new Map<string, string[]>();
      for (const r of rawReactions) {
        if (!reactionMap.has(r.emoji)) reactionMap.set(r.emoji, []);
        reactionMap.get(r.emoji)!.push(r.guest_id);
      }
      const reactions = Array.from(reactionMap.entries()).map(([emoji, users]) => ({
        emoji,
        count: users.length,
        users,
      }));

      // Reply-to details if present
      let reply_to = null;
      if (msg.reply_to_message_id) {
        const replyStmt = db.prepare(`
          SELECT m.id, m.content, gs.display_name as sender_name
          FROM messages m
          JOIN guest_sessions gs ON m.sender_guest_id = gs.id
          WHERE m.id = ?
        `);
        reply_to = replyStmt.get(msg.reply_to_message_id) as unknown as any;
      }

      return {
        ...msg,
        attachments,
        reactions,
        reply_to,
      };
    });
  },

  updateContent(id: string, content: string): boolean {
    const stmt = db.prepare('UPDATE messages SET content = ?, updated_at = ? WHERE id = ?');
    stmt.run(content, new Date().toISOString(), id);
    return true;
  },

  softDelete(id: string): boolean {
    const stmt = db.prepare("UPDATE messages SET deleted_at = ?, content = '[Message deleted]' WHERE id = ?");
    stmt.run(new Date().toISOString(), id);
    return true;
  },

  addAttachment(att: MessageAttachment): MessageAttachment {
    const stmt = db.prepare(`
      INSERT INTO message_attachments (id, message_id, storage_key, original_filename, content_type, size_bytes, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `);
    stmt.run(att.id, att.message_id, att.storage_key, att.original_filename, att.content_type, att.size_bytes, att.created_at);
    return att;
  },

  getAttachment(id: string): MessageAttachment | null {
    const stmt = db.prepare('SELECT * FROM message_attachments WHERE id = ?');
    const result = stmt.get(id) as unknown as MessageAttachment | undefined;
    return result || null;
  },

  toggleReaction(messageId: string, guestId: string, emoji: string): { action: 'added' | 'removed' } {
    const existing = db.prepare('SELECT id FROM message_reactions WHERE message_id = ? AND guest_id = ? AND emoji = ?').get(messageId, guestId, emoji);
    if (existing) {
      db.prepare('DELETE FROM message_reactions WHERE message_id = ? AND guest_id = ? AND emoji = ?').run(messageId, guestId, emoji);
      return { action: 'removed' };
    } else {
      const id = `${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
      db.prepare('INSERT INTO message_reactions (id, message_id, guest_id, emoji, created_at) VALUES (?, ?, ?, ?, ?)').run(id, messageId, guestId, emoji, new Date().toISOString());
      return { action: 'added' };
    }
  },
};

// Watch Sessions
export const WatchSessionRepo = {
  get(roomId: string): WatchSession | null {
    const stmt = db.prepare('SELECT * FROM watch_sessions WHERE room_id = ? AND ended_at IS NULL');
    const result = stmt.get(roomId) as unknown as WatchSession | undefined;
    return result || null;
  },

  upsert(session: WatchSession): WatchSession {
    const existing = db.prepare('SELECT id FROM watch_sessions WHERE room_id = ?').get(session.room_id) as { id: string } | undefined;
    if (existing) {
      db.prepare(`
        UPDATE watch_sessions
        SET host_guest_id = ?, media_source = ?, playback_status = ?, playback_position = ?, server_updated_at = ?, ended_at = NULL
        WHERE id = ?
      `).run(session.host_guest_id, session.media_source, session.playback_status, session.playback_position, session.server_updated_at, existing.id);
      return { ...session, id: existing.id };
    }

    const stmt = db.prepare(`
      INSERT INTO watch_sessions (id, room_id, host_guest_id, media_source, playback_status, playback_position, server_updated_at, created_at, ended_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    stmt.run(
      session.id,
      session.room_id,
      session.host_guest_id,
      session.media_source,
      session.playback_status,
      session.playback_position,
      session.server_updated_at,
      session.created_at,
      session.ended_at
    );
    return session;
  },

  end(roomId: string): boolean {
    const stmt = db.prepare('UPDATE watch_sessions SET ended_at = ? WHERE room_id = ? AND ended_at IS NULL');
    stmt.run(new Date().toISOString(), roomId);
    return true;
  },
};
