import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';
import type { Guest } from '../types';
import { api } from '../services/api';

interface GuestContextType {
  guest: Guest | null;
  token: string | null;
  isLoading: boolean;
  updateProfile: (displayName: string, avatarUrl?: string) => Promise<void>;
  createGuest: (displayName?: string) => Promise<void>;
}

const GuestContext = createContext<GuestContextType | undefined>(undefined);

export const GuestProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [guest, setGuest] = useState<Guest | null>(null);
  const [token, setToken] = useState<string | null>(() => localStorage.getItem('connectroom_token'));
  const [isLoading, setIsLoading] = useState(true);

  const initSession = useCallback(async () => {
    setIsLoading(true);
    const existingToken = localStorage.getItem('connectroom_token');

    if (existingToken) {
      try {
        const { guest } = await api.getSession(existingToken);
        setGuest(guest);
        setIsLoading(false);
        return;
      } catch (err) {
        console.warn('Existing session invalid or expired, creating new anonymous session:', err);
        localStorage.removeItem('connectroom_token');
      }
    }

    // Auto-create anonymous guest session
    try {
      const res = await api.createSession();
      localStorage.setItem('connectroom_token', res.token);
      setToken(res.token);
      setGuest(res.guest);
    } catch (err) {
      console.error('Failed to initialize anonymous guest session:', err);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    initSession();
  }, [initSession]);

  const updateProfile = async (displayName: string, avatarUrl?: string) => {
    const res = await api.updateProfile(displayName, avatarUrl);
    setGuest(res.guest);
  };

  const createGuest = async (displayName?: string) => {
    const res = await api.createSession(displayName);
    localStorage.setItem('connectroom_token', res.token);
    setToken(res.token);
    setGuest(res.guest);
  };

  return (
    <GuestContext.Provider value={{ guest, token, isLoading, updateProfile, createGuest }}>
      {children}
    </GuestContext.Provider>
  );
};

export function useGuest() {
  const ctx = useContext(GuestContext);
  if (!ctx) throw new Error('useGuest must be used within GuestProvider');
  return ctx;
}
