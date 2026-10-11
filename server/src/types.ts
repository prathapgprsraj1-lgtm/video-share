export type Role = 'host' | 'moderator' | 'participant';

export type MembershipStatus = 'active' | 'waiting' | 'left' | 'kicked';

export type MessageType = 'text' | 'image' | 'gif' | 'video' | 'file' | 'system';

export interface GuestSession {
  id: string;
  session_token: string;
  display_name: string;
  avatar_url: string;
  created_at: string;
  last_seen_at: string;
  expires_at: string;
  revoked_at: string | null;
}

export interface Room {
  id: string;
  name: string;
  description: string | null;
  owner_guest_id: string;
  visibility: string;
  password_hash: string | null;
  waiting_room_enabled: number;
  is_locked: number;
  status: string;
  max_participants: number;
  created_at: string;
  expires_at: string | null;
  ended_at: string | null;
}

export interface RoomMember {
  id: string;
  room_id: string;
  guest_id: string;
  role: Role;
  joined_at: string;
  left_at: string | null;
  membership_status: MembershipStatus;
  display_name?: string;
  avatar_url?: string;
}

export interface RoomInvitation {
  id: string;
  room_id: string;
  token: string;
  token_hash: string | null;
  created_by: string;
  created_at: string;
  expires_at: string | null;
  revoked_at: string | null;
  max_uses: number;
  use_count: number;
}

export interface MessageAttachment {
  id: string;
  message_id: string;
  storage_key: string;
  original_filename: string;
  content_type: string;
  size_bytes: number;
  created_at: string;
}

export interface MessageReaction {
  id: string;
  message_id: string;
  guest_id: string;
  emoji: string;
  created_at: string;
}

export interface Message {
  id: string;
  room_id: string;
  sender_guest_id: string;
  message_type: MessageType;
  content: string;
  reply_to_message_id: string | null;
  created_at: string;
  updated_at: string | null;
  deleted_at: string | null;
  sender_name?: string;
  sender_avatar?: string;
  attachments?: MessageAttachment[];
  reactions?: { emoji: string; count: number; users: string[] }[];
  reply_to?: { id: string; content: string; sender_name: string } | null;
}

export interface WatchSession {
  id: string;
  room_id: string;
  host_guest_id: string;
  media_source: string;
  playback_status: 'playing' | 'paused';
  playback_position: number;
  server_updated_at: string;
  created_at: string;
  ended_at: string | null;
}

export interface ParticipantMediaState {
  audioEnabled: boolean;
  videoEnabled: boolean;
  screenShareEnabled: boolean;
  isSpeaking: boolean;
}
