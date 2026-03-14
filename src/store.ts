import { create } from 'zustand';
import { Socket } from 'socket.io-client';

interface User {
  id: number;
  username: string;
  displayName?: string;
  display_name?: string;
  isAdmin: boolean;
  is_admin?: boolean;
  publicKey?: string;
  avatar_url?: string;
  color?: string;
  glow?: boolean;
}

interface Message {
  id: string;
  from: number;
  to: string | number;
  text: string;
  timestamp: number;
}

interface VoiceUser {
  id: number;
  joinedAt: number;
}

interface AppState {
  user: User | null;
  token: string | null;
  users: User[];
  messages: Message[];
  activeTab: string; // 'main' or userId
  socket: Socket | null;
  keyPair: CryptoKeyPair | null;
  sharedSecrets: Record<number, CryptoKey>; // userId -> AES-GCM key
  mainRoomKey: CryptoKey | null;
  voiceUsers: VoiceUser[];
  inVoice: boolean;
  isMuted: boolean;
  isDeafened: boolean;
  ping: number;
  speakingUsers: number[];
  selectedInputDevice: string;
  selectedOutputDevice: string;
  noiseSuppressionLevel: number; // 0 to 100
  inputGain: number; // 0 to 2
  onlineUsers: number[];
  voiceStates: Record<number, { muted: boolean, deafened: boolean }>;
  localVolumes: Record<number, number>;
  localMutes: Record<number, boolean>;
  
  setUser: (user: User | null, token: string | null) => void;
  setUsers: (users: User[]) => void;
  addMessage: (msg: Message) => void;
  setActiveTab: (tab: string) => void;
  setSocket: (socket: Socket | null) => void;
  setKeyPair: (keyPair: CryptoKeyPair | null) => void;
  setSharedSecret: (userId: number, key: CryptoKey) => void;
  setMainRoomKey: (key: CryptoKey) => void;
  setVoiceUsers: (users: VoiceUser[]) => void;
  setInVoice: (inVoice: boolean) => void;
  setIsMuted: (val: boolean) => void;
  setIsDeafened: (val: boolean) => void;
  setPing: (val: number) => void;
  addSpeakingUser: (id: number) => void;
  removeSpeakingUser: (id: number) => void;
  setSelectedInputDevice: (val: string) => void;
  setSelectedOutputDevice: (val: string) => void;
  setNoiseSuppressionLevel: (val: number) => void;
  setInputGain: (val: number) => void;
  setOnlineUsers: (users: number[]) => void;
  setVoiceState: (userId: number, state: { muted: boolean, deafened: boolean }) => void;
  setVoiceStates: (states: Record<number, { muted: boolean, deafened: boolean }>) => void;
  setLocalVolume: (userId: number, volume: number) => void;
  setLocalMute: (userId: number, muted: boolean) => void;
}

export const useStore = create<AppState>((set) => ({
  user: null,
  token: null,
  users: [],
  messages: [],
  activeTab: 'main',
  socket: null,
  keyPair: null,
  sharedSecrets: {},
  mainRoomKey: null,
  voiceUsers: [],
  inVoice: false,
  isMuted: false,
  isDeafened: false,
  ping: 0,
  speakingUsers: [],
  selectedInputDevice: '',
  selectedOutputDevice: '',
  noiseSuppressionLevel: 50,
  inputGain: 1,
  onlineUsers: [],
  voiceStates: {},
  localVolumes: {},
  localMutes: {},

  setUser: (user, token) => set({ user, token }),
  setUsers: (users) => set({ users: users.map(u => ({ ...u, isAdmin: !!u.is_admin, displayName: u.display_name || u.displayName || u.username, color: u.color, glow: !!u.glow })) }),
  addMessage: (msg) => set((state) => ({ messages: [...state.messages, msg] })),
  setActiveTab: (activeTab) => set({ activeTab }),
  setSocket: (socket) => set({ socket }),
  setKeyPair: (keyPair) => set({ keyPair }),
  setSharedSecret: (userId, key) => set((state) => ({ sharedSecrets: { ...state.sharedSecrets, [userId]: key } })),
  setMainRoomKey: (mainRoomKey) => set({ mainRoomKey }),
  setVoiceUsers: (voiceUsers) => set({ voiceUsers }),
  setInVoice: (inVoice) => set({ inVoice }),
  setIsMuted: (isMuted) => set({ isMuted }),
  setIsDeafened: (isDeafened) => set({ isDeafened }),
  setPing: (ping) => set({ ping }),
  addSpeakingUser: (id) => set((state) => ({ speakingUsers: state.speakingUsers.includes(id) ? state.speakingUsers : [...state.speakingUsers, id] })),
  removeSpeakingUser: (id) => set((state) => ({ speakingUsers: state.speakingUsers.filter(u => u !== id) })),
  setSelectedInputDevice: (selectedInputDevice) => set({ selectedInputDevice }),
  setSelectedOutputDevice: (selectedOutputDevice) => set({ selectedOutputDevice }),
  setNoiseSuppressionLevel: (noiseSuppressionLevel) => set({ noiseSuppressionLevel }),
  setInputGain: (inputGain) => set({ inputGain }),
  setOnlineUsers: (onlineUsers) => set({ onlineUsers }),
  setVoiceState: (userId, state) => set((s) => ({ voiceStates: { ...s.voiceStates, [userId]: state } })),
  setVoiceStates: (voiceStates) => set({ voiceStates }),
  setLocalVolume: (userId, volume) => set((s) => ({ localVolumes: { ...s.localVolumes, [userId]: volume } })),
  setLocalMute: (userId, muted) => set((s) => ({ localMutes: { ...s.localMutes, [userId]: muted } })),
}));
