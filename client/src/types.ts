export interface Guest {
  id: string;
  displayName: string;
  avatarUrl: string;
  createdAt: string;
}

export interface RoomInfo {
  id: string;
  name: string;
  description: string | null;
  isLocked: boolean;
  waitingRoomEnabled: boolean;
  hasPassword?: boolean;
  maxParticipants: number;
  createdAt: string;
  ownerGuestId?: string;
  status?: string;
}

export interface ParticipantMediaState {
  audioEnabled: boolean;
  videoEnabled: boolean;
  screenShareEnabled: boolean;
  isSpeaking: boolean;
}

export interface Participant {
  guestId: string;
  displayName: string;
  avatarUrl: string;
  role: 'host' | 'moderator' | 'participant';
  joinedAt?: string;
  mediaState?: ParticipantMediaState;
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

export interface Message {
  id: string;
  room_id: string;
  sender_guest_id: string;
  message_type: 'text' | 'image' | 'gif' | 'video' | 'file' | 'system';
  content: string;
  reply_to_message_id?: string | null;
  created_at: string;
  updated_at?: string | null;
  deleted_at?: string | null;
  sender_name?: string;
  sender_avatar?: string;
  attachments?: MessageAttachment[];
  reactions?: { emoji: string; count: number; users: string[] }[];
  reply_to?: { id: string; content: string; sender_name: string } | null;
}

export interface WatchSession {
  mediaSource: string;
  playbackStatus: 'playing' | 'paused';
  playbackPosition: number;
  hostId?: string;
  serverUpdatedAt: string;
}
