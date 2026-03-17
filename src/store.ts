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
  public_key?: string;
  avatar_url?: string;
  color?: string;
  glow?: boolean;
  bio?: string;
}

interface Message {
  id: string;
  from: number;
  to: string | number;
  text: string;
  timestamp: number;
  system?: boolean;
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
  isKrispEnabled: boolean;
  ping: number;
  speakingUsers: number[];
  selectedInputDevice: string;
  selectedOutputDevice: string;
  inputGain: number; // 0 to 2
  onlineUsers: number[];
  closedDMs: number[];
  voiceStates: Record<number, { muted: boolean, deafened: boolean }>;
  videoStreams: Record<number, 'screen' | 'camera'>;
  streamViewers: Record<number, number[]>; // userId -> viewerIds
  screenshareSettings: { quality: 'source' | '720p' | '1080p', fps: 30 | 60 };
  setScreenshareSettings: (settings: { quality: 'source' | '720p' | '1080p', fps: 30 | 60 }) => void;
  localVolumes: Record<number, number>;
  localMutes: Record<number, boolean>;
  localScreenVolumes: Record<number, number>;
  localScreenMutes: Record<number, boolean>;
  lastViewed: Record<string, number>;
  peerConnections: Record<number, RTCPeerConnection>;
  localStream: MediaStream | null;
  localScreenStream: MediaStream | null;
  remoteVoiceStreams: Record<number, MediaStream>;
  remoteScreenStreams: Record<number, MediaStream>;
  
  userStreamIds: Record<number, { voice?: string, screen?: string }>;
  
  setLocalStream: (stream: MediaStream | null) => void;
  setLocalScreenStream: (stream: MediaStream | null) => void;
  setRemoteVoiceStream: (userId: number, stream: MediaStream | null) => void;
  setRemoteScreenStream: (userId: number, stream: MediaStream | null) => void;
  setPeerConnection: (userId: number, pc: RTCPeerConnection | null) => void;
  setUserStreamIds: (ids: Record<number, { voice?: string, screen?: string }>) => void;
  setUserStreamId: (userId: number, type: 'voice' | 'screen', streamId: string | null) => void;
  setMessages: (messages: Message[]) => void;
  addMessages: (messages: Message[]) => void;
  setLastViewed: (tab: string, timestamp: number) => void;
  setClosedDMs: (userIds: number[]) => void;
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
  setIsKrispEnabled: (val: boolean) => void;
  setPing: (val: number) => void;
  addSpeakingUser: (id: number) => void;
  removeSpeakingUser: (id: number) => void;
  setSelectedInputDevice: (val: string) => void;
  setSelectedOutputDevice: (val: string) => void;
  setInputGain: (val: number) => void;
  setOnlineUsers: (users: number[]) => void;
  setVoiceState: (userId: number, state: { muted: boolean, deafened: boolean }) => void;
  setVoiceStates: (states: Record<number, { muted: boolean, deafened: boolean }>) => void;
  setVideoStreams: (streams: Record<number, 'screen' | 'camera'>) => void;
  setVideoStream: (userId: number, mode: 'screen' | 'camera' | null) => void;
  setStreamViewers: (viewers: Record<number, number[]>) => void;
  setStreamViewer: (streamUserId: number, viewerIds: number[]) => void;
  setLocalVolume: (userId: number, volume: number) => void;
  setLocalMute: (userId: number, muted: boolean) => void;
  setLocalScreenVolume: (userId: number, volume: number) => void;
  setLocalScreenMute: (userId: number, muted: boolean) => void;
}

export const useStore = create<AppState>((set) => ({
  user: JSON.parse(localStorage.getItem('mango_user') || 'null'),
  token: localStorage.getItem('mango_token'),
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
  isKrispEnabled: localStorage.getItem('mango_krisp_enabled') === 'true',
  ping: 0,
  speakingUsers: [],
  selectedInputDevice: localStorage.getItem('mango_input_device') || '',
  selectedOutputDevice: localStorage.getItem('mango_output_device') || '',
  inputGain: parseFloat(localStorage.getItem('mango_input_gain') || '1'),
  onlineUsers: [],
  closedDMs: JSON.parse(localStorage.getItem('closedDMs') || '[]'),
  voiceStates: {},
  videoStreams: {},
  streamViewers: {},
  screenshareSettings: { quality: 'source', fps: 30 },
  setScreenshareSettings: (screenshareSettings) => set({ screenshareSettings }),
  localVolumes: {},
  localMutes: {},
  localScreenVolumes: {},
  localScreenMutes: {},
  lastViewed: {},
  peerConnections: {},
  localStream: null,
  localScreenStream: null,
  remoteVoiceStreams: {},
  remoteScreenStreams: {},

  userStreamIds: {},
  setLocalStream: (localStream) => set({ localStream }),
  setLocalScreenStream: (localScreenStream) => set({ localScreenStream }),
  setRemoteVoiceStream: (userId, stream) => set((s) => {
    const newStreams = { ...s.remoteVoiceStreams };
    if (stream) newStreams[userId] = stream;
    else delete newStreams[userId];
    return { remoteVoiceStreams: newStreams };
  }),
  setRemoteScreenStream: (userId, stream) => set((s) => {
    const newStreams = { ...s.remoteScreenStreams };
    if (stream) newStreams[userId] = stream;
    else delete newStreams[userId];
    return { remoteScreenStreams: newStreams };
  }),
  setPeerConnection: (userId, pc) => set((s) => {
    const newPCs = { ...s.peerConnections };
    if (pc) newPCs[userId] = pc;
    else delete newPCs[userId];
    return { peerConnections: newPCs };
  }),
  setMessages: (messages) => set({ messages }),
  addMessages: (messages) => set((state) => {
    const existingIds = new Set(state.messages.map(m => m.id));
    const newMessages = messages.filter(m => !existingIds.has(m.id));
    const allMessages = [...state.messages, ...newMessages];
    allMessages.sort((a, b) => a.timestamp - b.timestamp);
    return { messages: allMessages };
  }),
  setLastViewed: (tab, timestamp) => set((s) => ({ lastViewed: { ...s.lastViewed, [tab]: timestamp } })),
  setClosedDMs: (closedDMs) => {
    localStorage.setItem('closedDMs', JSON.stringify(closedDMs));
    set({ closedDMs });
  },
  setUser: (user, token) => {
    if (user) localStorage.setItem('mango_user', JSON.stringify(user));
    else localStorage.removeItem('mango_user');
    if (token) localStorage.setItem('mango_token', token);
    else localStorage.removeItem('mango_token');
    set({ user, token });
  },
  setUsers: (users) => set({ users: users.map(u => ({ ...u, isAdmin: !!u.is_admin, displayName: u.display_name || u.displayName || u.username, color: u.color, glow: !!u.glow, bio: u.bio })) }),
  addMessage: (msg) => set((state) => {
    const isDM = msg.to !== 'main';
    const otherUserId = msg.from === state.user?.id ? parseInt(msg.to as string) : msg.from;
    const closedDMs = isDM ? state.closedDMs.filter(id => id !== otherUserId) : state.closedDMs;
    if (isDM && state.closedDMs.includes(otherUserId)) {
      localStorage.setItem('closedDMs', JSON.stringify(closedDMs));
    }
    return { messages: [...state.messages, msg], closedDMs };
  }),
  setActiveTab: (activeTab) => set((state) => {
    const isDM = activeTab !== 'main';
    const dmId = isDM ? parseInt(activeTab) : null;
    const closedDMs = isDM ? state.closedDMs.filter(id => id !== dmId) : state.closedDMs;
    if (isDM && state.closedDMs.includes(dmId!)) {
      localStorage.setItem('closedDMs', JSON.stringify(closedDMs));
    }
    return { 
      activeTab, 
      lastViewed: { ...state.lastViewed, [activeTab]: Date.now() },
      closedDMs
    };
  }),
  setSocket: (socket) => set({ socket }),
  setKeyPair: (keyPair) => set({ keyPair }),
  setSharedSecret: (userId, key) => set((state) => ({ sharedSecrets: { ...state.sharedSecrets, [userId]: key } })),
  setMainRoomKey: (mainRoomKey) => set({ mainRoomKey }),
  setVoiceUsers: (voiceUsers) => set({ voiceUsers }),
  setInVoice: (inVoice) => set({ inVoice }),
  setIsMuted: (isMuted) => set({ isMuted }),
  setIsDeafened: (isDeafened) => set({ isDeafened }),
  setIsKrispEnabled: (isKrispEnabled) => {
    localStorage.setItem('mango_krisp_enabled', isKrispEnabled.toString());
    set({ isKrispEnabled });
  },
  setPing: (ping) => set({ ping }),
  addSpeakingUser: (id) => set((state) => ({ speakingUsers: state.speakingUsers.includes(id) ? state.speakingUsers : [...state.speakingUsers, id] })),
  removeSpeakingUser: (id) => set((state) => ({ speakingUsers: state.speakingUsers.filter(u => u !== id) })),
  setSelectedInputDevice: (selectedInputDevice) => {
    localStorage.setItem('mango_input_device', selectedInputDevice);
    set({ selectedInputDevice });
  },
  setSelectedOutputDevice: (selectedOutputDevice) => {
    localStorage.setItem('mango_output_device', selectedOutputDevice);
    set({ selectedOutputDevice });
  },
  setInputGain: (inputGain) => {
    localStorage.setItem('mango_input_gain', inputGain.toString());
    set({ inputGain });
  },
  setOnlineUsers: (onlineUsers) => set({ onlineUsers }),
  setVoiceState: (userId, state) => set((s) => ({ voiceStates: { ...s.voiceStates, [userId]: state } })),
  setVoiceStates: (voiceStates) => set({ voiceStates }),
  setVideoStreams: (streams) => set({ videoStreams: streams }),
  setVideoStream: (userId, mode) => set((s) => {
    const newStreams = { ...s.videoStreams };
    const newViewers = { ...s.streamViewers };
    if (mode) {
      newStreams[userId] = mode;
    } else {
      delete newStreams[userId];
      delete newViewers[userId];
    }
    return { videoStreams: newStreams, streamViewers: newViewers };
  }),
  setStreamViewers: (streamViewers) => set({ streamViewers }),
  setStreamViewer: (streamUserId, viewerIds) => set((s) => ({
    streamViewers: { ...s.streamViewers, [streamUserId]: viewerIds }
  })),
  setLocalVolume: (userId, volume) => set((s) => ({ localVolumes: { ...s.localVolumes, [userId]: volume } })),
  setLocalMute: (userId, muted) => set((s) => ({ localMutes: { ...s.localMutes, [userId]: muted } })),
  setLocalScreenVolume: (userId, volume) => set((s) => ({ localScreenVolumes: { ...s.localScreenVolumes, [userId]: volume } })),
  setLocalScreenMute: (userId, muted) => set((s) => ({ localScreenMutes: { ...s.localScreenMutes, [userId]: muted } })),
  setUserStreamIds: (ids: Record<number, { voice?: string, screen?: string }>) => set({ userStreamIds: ids }),
  setUserStreamId: (userId: number, type: 'voice' | 'screen', streamId: string | null) => set((s) => {
    const newIds = { ...s.userStreamIds };
    if (!newIds[userId]) newIds[userId] = {};
    if (streamId) newIds[userId][type] = streamId;
    else delete newIds[userId][type];
    return { userStreamIds: newIds };
  }),
}));
