import type { Guest, RoomInfo, Message, Participant } from '../types';

const API_BASE = '/api';

function getAuthHeaders(token?: string | null): Record<string, string> {
  const currentToken = token || localStorage.getItem('connectroom_token');
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };
  if (currentToken) {
    headers['Authorization'] = `Bearer ${currentToken}`;
  }
  return headers;
}

export const api = {
  // Guest Session
  async createSession(displayName?: string, avatarUrl?: string): Promise<{ guest: Guest; token: string }> {
    const res = await fetch(`${API_BASE}/guest/session`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ displayName, avatarUrl }),
    });
    if (!res.ok) throw new Error('Failed to create guest session');
    return res.json();
  },

  async getSession(token?: string): Promise<{ guest: Guest }> {
    const res = await fetch(`${API_BASE}/guest/session`, {
      headers: getAuthHeaders(token),
    });
    if (!res.ok) throw new Error('Failed to retrieve guest session');
    return res.json();
  },

  async updateProfile(displayName: string, avatarUrl?: string): Promise<{ guest: Guest }> {
    const res = await fetch(`${API_BASE}/guest/profile`, {
      method: 'PATCH',
      headers: getAuthHeaders(),
      body: JSON.stringify({ displayName, avatarUrl }),
    });
    if (!res.ok) throw new Error('Failed to update profile');
    return res.json();
  },

  // Rooms
  async createRoom(data: {
    name: string;
    description?: string;
    password?: string;
    waitingRoom?: boolean;
    maxParticipants?: number;
  }): Promise<{ room: RoomInfo; inviteToken: string; role: string }> {
    const res = await fetch(`${API_BASE}/rooms`, {
      method: 'POST',
      headers: getAuthHeaders(),
      body: JSON.stringify(data),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || 'Failed to create room');
    }
    return res.json();
  },

  async getRoom(roomId: string): Promise<{
    room: RoomInfo;
    membership: { role: string; status: string } | null;
    participants: Participant[];
    waitingParticipants: Participant[];
  }> {
    const res = await fetch(`${API_BASE}/rooms/${roomId}`, {
      headers: getAuthHeaders(),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || 'Failed to fetch room');
    }
    return res.json();
  },

  async joinRoom(
    roomId: string,
    data?: { password?: string; inviteToken?: string }
  ): Promise<{ status: string; role: string; room: RoomInfo }> {
    const res = await fetch(`${API_BASE}/rooms/${roomId}/join`, {
      method: 'POST',
      headers: getAuthHeaders(),
      body: JSON.stringify(data || {}),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || 'Failed to join room');
    }
    return res.json();
  },

  async leaveRoom(roomId: string): Promise<void> {
    await fetch(`${API_BASE}/rooms/${roomId}/leave`, {
      method: 'POST',
      headers: getAuthHeaders(),
    });
  },

  async endRoom(roomId: string): Promise<void> {
    const res = await fetch(`${API_BASE}/rooms/${roomId}/end`, {
      method: 'POST',
      headers: getAuthHeaders(),
    });
    if (!res.ok) throw new Error('Failed to end room');
  },

  async lockRoom(roomId: string, locked: boolean): Promise<void> {
    const res = await fetch(`${API_BASE}/rooms/${roomId}/lock`, {
      method: 'POST',
      headers: getAuthHeaders(),
      body: JSON.stringify({ locked }),
    });
    if (!res.ok) throw new Error('Failed to lock room');
  },

  async approveWaitingGuest(roomId: string, targetGuestId: string, approve: boolean): Promise<void> {
    const res = await fetch(`${API_BASE}/rooms/${roomId}/approve`, {
      method: 'POST',
      headers: getAuthHeaders(),
      body: JSON.stringify({ targetGuestId, approve }),
    });
    if (!res.ok) throw new Error('Failed to approve guest');
  },

  async kickParticipant(roomId: string, targetGuestId: string): Promise<void> {
    const res = await fetch(`${API_BASE}/rooms/${roomId}/kick`, {
      method: 'POST',
      headers: getAuthHeaders(),
      body: JSON.stringify({ targetGuestId }),
    });
    if (!res.ok) throw new Error('Failed to kick participant');
  },

  // Invitations
  async createInvitation(roomId: string): Promise<{ inviteToken: string; id: string }> {
    const res = await fetch(`${API_BASE}/rooms/${roomId}/invitations`, {
      method: 'POST',
      headers: getAuthHeaders(),
    });
    if (!res.ok) throw new Error('Failed to create invitation');
    return res.json();
  },

  async validateInvitation(token: string): Promise<{
    valid: boolean;
    roomId: string;
    roomName: string;
    isLocked: boolean;
    hasPassword: boolean;
    waitingRoomEnabled: boolean;
  }> {
    const res = await fetch(`${API_BASE}/invitations/validate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token }),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || 'Invalid invitation');
    }
    return res.json();
  },

  // Messages
  async getMessages(roomId: string, limit = 50, offset = 0): Promise<{ messages: Message[] }> {
    const res = await fetch(`${API_BASE}/rooms/${roomId}/messages?limit=${limit}&offset=${offset}`, {
      headers: getAuthHeaders(),
    });
    if (!res.ok) throw new Error('Failed to fetch messages');
    return res.json();
  },

  async sendMessage(roomId: string, data: { content: string; messageType?: string; replyToMessageId?: string }): Promise<{ message: Message }> {
    const res = await fetch(`${API_BASE}/rooms/${roomId}/messages`, {
      method: 'POST',
      headers: getAuthHeaders(),
      body: JSON.stringify(data),
    });
    if (!res.ok) throw new Error('Failed to send message');
    return res.json();
  },

  async editMessage(messageId: string, content: string): Promise<void> {
    const res = await fetch(`${API_BASE}/messages/${messageId}`, {
      method: 'PATCH',
      headers: getAuthHeaders(),
      body: JSON.stringify({ content }),
    });
    if (!res.ok) throw new Error('Failed to edit message');
  },

  async deleteMessage(messageId: string): Promise<void> {
    const res = await fetch(`${API_BASE}/messages/${messageId}`, {
      method: 'DELETE',
      headers: getAuthHeaders(),
    });
    if (!res.ok) throw new Error('Failed to delete message');
  },

  async toggleReaction(messageId: string, emoji: string): Promise<void> {
    const res = await fetch(`${API_BASE}/messages/${messageId}/reactions`, {
      method: 'POST',
      headers: getAuthHeaders(),
      body: JSON.stringify({ emoji }),
    });
    if (!res.ok) throw new Error('Failed to react to message');
  },

  // Uploads
  async uploadFile(roomId: string, file: File, caption?: string): Promise<{ message: Message }> {
    const formData = new FormData();
    formData.append('file', file);
    if (caption) formData.append('caption', caption);

    const token = localStorage.getItem('connectroom_token');
    const headers: Record<string, string> = {};
    if (token) headers['Authorization'] = `Bearer ${token}`;

    const res = await fetch(`${API_BASE}/rooms/${roomId}/uploads`, {
      method: 'POST',
      headers,
      body: formData,
    });
    if (!res.ok) throw new Error('Failed to upload file');
    return res.json();
  },
};
