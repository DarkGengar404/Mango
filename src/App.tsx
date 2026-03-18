import React, { useEffect, useState, useRef, useCallback } from 'react';
import { useStore } from './store';
import { Auth } from './components/Auth';
import { Sidebar } from './components/Sidebar';
import { RightSidebar } from './components/RightSidebar';
import { Chat } from './components/Chat';
import { AdminPanel } from './components/AdminPanel';
import { Screenshare } from './components/Screenshare';
import { VoiceManager } from './components/VoiceManager';
import { WebRTCManager } from './components/WebRTCManager';
import { io } from 'socket.io-client';
import { decryptMessage, importSymmetricKey, getKeyFromDB, saveKeyToDB, deriveSharedSecret, importPublicKey } from './lib/crypto';
import { loadKeyPair } from './lib/db';
import { sounds } from './lib/sounds';

export default function App() {
  const { user, setUser, token, users, setUsers, socket, setSocket, addMessage, setMessages, addMessages, keyPair, setKeyPair, sharedSecrets, mainRoomKey, setMainRoomKey, voiceUsers, setVoiceUsers, setPing, onlineUsers, setOnlineUsers, setVoiceStates, setVoiceState, setVideoStreams, setVideoStream, setStreamViewers, setStreamViewer, inVoice, setInVoice, activeTab, setPeerConnection, peerConnections, setLocalScreenStream, localScreenStream, screenshareSettings, addSpeakingUser, removeSpeakingUser, setUserStreamIds, setUserStreamId, facingMode } = useStore();
  const [showAdmin, setShowAdmin] = useState(false);
  const [showScreenshare, setShowScreenshare] = useState<{ show: boolean, mode: 'screen' | 'camera', targetUserId?: number }>({ show: false, mode: 'screen' });

  const isUnsecure = !window.isSecureContext && window.location.protocol !== 'https:';

  useEffect(() => {
    const restoreSession = async () => {
      const storedToken = localStorage.getItem('mango_token');
      if (storedToken) {
        try {
          const kp = await loadKeyPair();
          if (kp) {
            setKeyPair(kp);
            useStore.getState().setToken(storedToken);
          }
        } catch (e) {
          console.error('Failed to restore session keys', e);
        }
      }
    };
    restoreSession();
  }, []);

  if (isUnsecure) {
    return (
      <div className="fixed inset-0 z-[9999] bg-slate-950 flex items-center justify-center p-6 text-center">
        <div className="max-w-md space-y-4">
          <div className="w-16 h-16 bg-red-500/20 text-red-500 rounded-full flex items-center justify-center mx-auto mb-4">
            <svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z"/><path d="M12 9v4"/><path d="M12 17h.01"/></svg>
          </div>
          <h1 className="text-2xl font-bold text-white">Browser Security Block</h1>
          <p className="text-slate-400">
            To use Voice, Video, and Encryption on this IP, you must whitelist this address in your browser flags:
          </p>
          <div className="bg-slate-900 p-3 rounded font-mono text-sm text-emerald-400 break-all">
            chrome://flags/#unsafely-treat-insecure-origin-as-secure
          </div>
          <p className="text-xs text-slate-500">
            Add <span className="text-slate-300">{window.location.origin}</span> to the list and restart your browser.
          </p>
        </div>
      </div>
    );
  }

  useEffect(() => {
    if (!keyPair) {
      loadKeyPair().then(kp => {
        if (kp) setKeyPair(kp);
      });
    }
    if (!mainRoomKey) {
      getKeyFromDB('mainRoomKey').then(async (keyData) => {
        if (keyData) {
          try {
            if (typeof keyData === 'string') {
              const key = await importSymmetricKey(keyData);
              setMainRoomKey(key);
            } else if (typeof keyData === 'object' && keyData.type === 'secret') {
              setMainRoomKey(keyData);
            }
          } catch (e) {
            console.error('Failed to import main room key', e);
          }
        }
      });
    }
  }, [keyPair, mainRoomKey]);

  useEffect(() => {
    if (!token || !user) return;

    const fetchHistory = async () => {
      try {
        const res = await fetch(`/api/messages?to=${activeTab}`, {
          headers: { Authorization: `Bearer ${token}` }
        });
        if (res.ok) {
          const data = await res.json();
          const history: any[] = [];
          for (const msg of data) {
            let decryptedText = '';
            if (msg.to === 'main' && mainRoomKey) {
              try {
                decryptedText = await decryptMessage(mainRoomKey, msg.encryptedPayload, msg.iv);
              } catch (e) {
                console.error('[Chat] Failed to decrypt main room history message', e);
              }
            } else if (msg.to !== 'main') {
              const otherId = msg.from === user.id ? parseInt(msg.to) : msg.from;
              let sharedKey = sharedSecrets[otherId];
              
              if (!sharedKey && keyPair) {
                const otherUser = useStore.getState().users.find(u => u.id === otherId);
                const pubKeyStr = otherUser?.public_key || otherUser?.publicKey;
                if (pubKeyStr) {
                  try {
                    const pubKey = await importPublicKey(pubKeyStr);
                    sharedKey = await deriveSharedSecret(keyPair.privateKey, pubKey);
                    useStore.getState().setSharedSecret(otherId, sharedKey);
                  } catch (e) {
                    console.error(`[Chat] Failed to derive key for user ${otherId}`, e);
                  }
                }
              }

              if (sharedKey) {
                try {
                  decryptedText = await decryptMessage(sharedKey, msg.encryptedPayload, msg.iv);
                  if (decryptedText.startsWith('MAIN_KEY:')) {
                    decryptedText = ''; // Skip this message
                  }
                } catch (e) {
                  console.error(`[Chat] Failed to decrypt DM history from ${otherId}`, e);
                }
              } else {
                console.warn(`[Chat] No shared key for user ${otherId}. Shared secrets:`, Object.keys(sharedSecrets));
              }
            }
            if (decryptedText) {
              history.push({
                id: msg.id.toString(),
                from: msg.from,
                to: msg.to,
                text: decryptedText,
                timestamp: msg.timestamp
              });
            }
          }
          addMessages(history);
        }
      } catch (e) {
        console.error('Failed to fetch history:', e);
      }
    };
    fetchHistory();
  }, [token, user, activeTab, mainRoomKey, sharedSecrets]);

  useEffect(() => {
    const handleBeforeUnload = () => {
      if (useStore.getState().inVoice) {
        useStore.getState().leaveVoice();
      }
    };
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, []);

  useEffect(() => {
    if (!token || user) return;

    const fetchMe = async () => {
      try {
        const res = await fetch('/api/users/me', {
          headers: { Authorization: `Bearer ${token}` }
        });
        if (res.ok) {
          const data = await res.json();
          setUser(data, token);
        } else {
          setUser(null, null);
        }
      } catch (e) {
        console.error('Failed to fetch me:', e);
      }
    };
    fetchMe();
  }, [token]);

  useEffect(() => {
    if (!token || !user) return;

    const fetchUsers = async () => {
      try {
        const res = await fetch('/api/users', {
          headers: { Authorization: `Bearer ${token}` }
        });
        if (res.ok) {
          const contentType = res.headers.get('content-type');
          if (contentType && contentType.includes('application/json')) {
            const data = await res.json();
            setUsers(data);
            
            // Check if current user still exists in the database
            if (user && !data.find((u: any) => u.id === user.id)) {
              console.log('User no longer exists in database, logging out...');
              setUser(null, null);
            }
          }
        } else if (res.status === 401) {
          setUser(null, null);
        }
      } catch (e) {
        console.error('Failed to fetch users:', e);
      }
    };
    fetchUsers();

    const socketInstance = io({
      auth: { token },
      reconnection: true,
      reconnectionAttempts: Infinity,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 5000,
      timeout: 20000,
      transports: ['websocket', 'polling'],
    });

    socketInstance.on('connect', () => {
      console.log('Connected to server');
      fetchUsers();
      // Sync voice state if we think we are in voice
      if (useStore.getState().inVoice) {
        socketInstance.emit('join_voice');
      }
    });

    socketInstance.on('connect_error', (err) => {
      console.error('Socket connection error:', err.message);
      if (err.message === 'User no longer exists' || err.message === 'Authentication error') {
        setUser(null, null);
      }
    });

    socketInstance.on('disconnect', (reason) => {
      console.log('Socket disconnected:', reason);
      if (reason === 'io server disconnect') {
        // the disconnection was initiated by the server, you need to reconnect manually
        socketInstance.connect();
      }
    });

    socketInstance.on('users_updated', () => {
      fetchUsers();
    });

    const pingInterval = setInterval(() => {
      const start = Date.now();
      socketInstance.emit('ping', () => {
        setPing(Date.now() - start);
      });
    }, 2000);

    socketInstance.on('voice_users', (users: { id: number, joinedAt: number }[]) => {
      setVoiceUsers(users);
    });

    socketInstance.on('online_users', (users: number[]) => {
      setOnlineUsers(users);
    });

    socketInstance.on('voice_states', (statesArr: [number, { muted: boolean, deafened: boolean }][]) => {
      const states: Record<number, { muted: boolean, deafened: boolean }> = {};
      for (const [id, state] of statesArr) {
        states[id] = state;
      }
      setVoiceStates(states);
    });

    socketInstance.on('voice_state_update', (data: { userId: number, state: { muted: boolean, deafened: boolean } }) => {
      setVoiceState(data.userId, data.state);
    });

    socketInstance.on('user_speaking', (data: { userId: number, isSpeaking: boolean }) => {
      if (data.isSpeaking) {
        addSpeakingUser(data.userId);
      } else {
        removeSpeakingUser(data.userId);
      }
    });

    socketInstance.on('video_streams', (streamsArr: [number, 'screen' | 'camera'][]) => {
      const streams: Record<number, 'screen' | 'camera'> = {};
      for (const [id, mode] of streamsArr) {
        streams[id] = mode;
      }
      setVideoStreams(streams);
    });

    socketInstance.on('video_stream_update', (data: { userId: number, mode: 'screen' | 'camera' | null }) => {
      setVideoStream(data.userId, data.mode);
    });

    socketInstance.on('stream_ids', (idsArr: [number, { voice?: string, screen?: string }][]) => {
      const ids: Record<number, { voice?: string, screen?: string }> = {};
      for (const [id, idObj] of idsArr) {
        ids[id] = idObj;
      }
      setUserStreamIds(ids);
    });

    socketInstance.on('stream_viewers', (viewersArr: [number, number[]][]) => {
      const viewers: Record<number, number[]> = {};
      for (const [id, ids] of viewersArr) {
        viewers[id] = ids;
      }
      setStreamViewers(viewers);
    });

    socketInstance.on('stream_viewers_update', (data: { streamUserId: number, viewerIds: number[] }) => {
      setStreamViewer(data.streamUserId, data.viewerIds);
    });

    socketInstance.on('broadcast_sound', (data: { userId: number, soundType: string }) => {
      switch (data.soundType) {
        case 'join_voice': sounds.playJoin(); break;
        case 'leave_voice': sounds.playLeave(); break;
        case 'start_share': sounds.playStartShare(); break;
        case 'stop_share': sounds.playStopShare(); break;
        case 'join_stream': sounds.playJoinStream(); break;
        case 'leave_stream': sounds.playLeaveStream(); break;
      }
    });

    socketInstance.on('webrtc_signal', (data: { from: number, signal: any, type: string }) => {
      // This will be handled by components that manage peer connections
      window.dispatchEvent(new CustomEvent('webrtc_signal', { detail: data }));
    });

    socketInstance.on('disconnect', () => {
      setInVoice(false);
      setShowScreenshare({ show: false, mode: 'screen' });
    });

    setSocket(socketInstance);

    return () => {
      clearInterval(pingInterval);
      socketInstance.disconnect();
      setSocket(null);
    };
  }, [token, user]);

  useEffect(() => {
    if (!socket || !keyPair) return;

    const handleMessage = async (data: any) => {
      if (data.system) {
        addMessage({
          id: Math.random().toString(36).substring(7),
          from: data.from,
          to: data.to,
          text: data.text,
          timestamp: data.timestamp,
          system: true
        });
        return;
      }

      let decryptedText = '';
      
      if (data.to === 'main' && mainRoomKey) {
        try {
          decryptedText = await decryptMessage(mainRoomKey, data.encryptedPayload, data.iv);
        } catch (e) {
          console.error('[Chat] Failed to decrypt main room message', e);
        }
      } else if (data.to !== 'main') {
        const otherId = data.from === user?.id ? parseInt(data.to) : data.from;
        const otherUser = useStore.getState().users.find(u => u.id === otherId);
        const pubKeyStr = otherUser?.public_key || otherUser?.publicKey;
        
        let sharedKey = pubKeyStr ? sharedSecrets[pubKeyStr] : null;
        
        if (!sharedKey && keyPair && pubKeyStr) {
          try {
            const pubKey = await importPublicKey(pubKeyStr);
            sharedKey = await deriveSharedSecret(keyPair.privateKey, pubKey);
            useStore.getState().setSharedSecret(pubKeyStr, sharedKey);
          } catch (e) {
            console.error(`[Chat] Failed to derive key for user ${otherId}`, e);
          }
        }

        if (sharedKey) {
          try {
            const text = await decryptMessage(sharedKey, data.encryptedPayload, data.iv);
            if (text.startsWith('MAIN_KEY:')) {
              const keyBase64 = text.split(':')[1];
              const symKey = await importSymmetricKey(keyBase64);
              setMainRoomKey(symKey);
              await saveKeyToDB('mainRoomKey', keyBase64);
              return; // Don't show this as a message
            } else {
              decryptedText = text;
            }
          } catch (e) {
            console.error(`[Chat] Failed to decrypt DM from ${otherId}`, e);
          }
        }
      }

      if (decryptedText) {
        addMessage({
          id: data.id ? data.id.toString() : Math.random().toString(36).substring(7),
          from: data.from,
          to: data.to,
          text: decryptedText,
          timestamp: data.timestamp
        });
      }
    };

    socket.on('message', handleMessage);
    return () => {
      socket.off('message', handleMessage);
    };
  }, [socket, keyPair, sharedSecrets, mainRoomKey]);

  useEffect(() => {
    if (!inVoice && showScreenshare.show && !showScreenshare.targetUserId) {
      // If we were sharing our own screen/camera and left voice, stop it
      const stream = useStore.getState().localScreenStream;
      const currentSocket = useStore.getState().socket;
      if (stream) {
        stream.getTracks().forEach(t => t.stop());
        setLocalScreenStream(null);
        currentSocket?.emit('set_stream_id', { type: 'screen', streamId: null });
      }
      setShowScreenshare({ show: false, mode: 'screen' });
    }
  }, [inVoice]);

  useEffect(() => {
    if (!localScreenStream) return;
    
    const videoTrack = localScreenStream.getVideoTracks()[0];
    if (videoTrack) {
      const constraints: MediaTrackConstraints = {};
      if (screenshareSettings.quality === '1080p') {
        constraints.width = { ideal: 1920 };
        constraints.height = { ideal: 1080 };
      } else if (screenshareSettings.quality === '720p') {
        constraints.width = { ideal: 1280 };
        constraints.height = { ideal: 720 };
      }
      constraints.frameRate = screenshareSettings.fps;
      videoTrack.applyConstraints(constraints).catch(console.error);
    }
  }, [screenshareSettings, localScreenStream]);

  const onOpenScreenshare = useCallback(async (mode: 'screen' | 'camera', forceRestart = false) => {
    const currentMode = useStore.getState().videoStreams[user?.id || 0];
    
    if (!forceRestart && currentMode === mode && showScreenshare.show && !showScreenshare.targetUserId) {
      // Stop sharing
      if (localScreenStream) {
        localScreenStream.getTracks().forEach(t => t.stop());
        setLocalScreenStream(null);
        socket?.emit('set_stream_id', { type: 'screen', streamId: null });
      }
      setShowScreenshare({ show: false, mode: 'screen' });
      return;
    }

    // Mutual exclusivity: stop previous if exists
    if (currentMode || forceRestart) {
      if (localScreenStream) {
        localScreenStream.getTracks().forEach(t => t.stop());
        setLocalScreenStream(null);
        socket?.emit('set_stream_id', { type: 'screen', streamId: null });
      }
      setShowScreenshare({ show: false, mode: 'screen' });
      // Small delay to ensure cleanup
      await new Promise(r => setTimeout(r, 100));
    }
    
    try {
      const settings = useStore.getState().screenshareSettings;
      let videoConstraints: any = {
        displaySurface: 'window',
        frameRate: settings.fps
      };
      
      if (settings.quality === '1080p') {
        videoConstraints.width = { ideal: 1920 };
        videoConstraints.height = { ideal: 1080 };
      } else if (settings.quality === '720p') {
        videoConstraints.width = { ideal: 1280 };
        videoConstraints.height = { ideal: 720 };
      }
      // If 'source', we don't specify width/height constraints

      const stream = mode === 'screen' 
        ? await navigator.mediaDevices.getDisplayMedia({
            video: {
              ...videoConstraints,
              displaySurface: 'window'
            },
            audio: {
              echoCancellation: false,
              noiseSuppression: false,
              autoGainControl: false,
              suppressLocalAudioPlayback: false,
              systemAudio: 'include'
            } as any,
            surfaceSwitching: 'include',
            selfBrowserSurface: 'exclude'
          } as any)
        : await navigator.mediaDevices.getUserMedia({
            video: {
              facingMode: useStore.getState().facingMode,
              frameRate: 30,
              width: { ideal: 1280 },
              height: { ideal: 720 }
            },
            audio: !useStore.getState().inVoice ? {
              echoCancellation: true,
              noiseSuppression: true,
              autoGainControl: true
            } : false
          });
      
      if (stream) {
        setLocalScreenStream(stream);
        socket?.emit('set_stream_id', { type: 'screen', streamId: stream.id });
        setShowScreenshare({ show: true, mode });
        stream.getVideoTracks()[0].onended = () => {
          setLocalScreenStream(null);
          socket?.emit('set_stream_id', { type: 'screen', streamId: null });
          setShowScreenshare({ show: false, mode: 'screen' });
        };
      }
    } catch (e: any) {
      console.error('Failed to get media', e);
      let errorMsg = 'Failed to access media device.';
      if (e.name === 'NotAllowedError') {
        errorMsg = 'Permission denied. Please allow access to your camera/microphone/screen.';
      } else if (e.name === 'NotFoundError') {
        errorMsg = 'No media device found.';
      } else if (e.name === 'NotReadableError') {
        errorMsg = 'Media device is already in use by another application.';
      }
      // TODO: Implement a custom toast notification instead of alert
      console.error(errorMsg);
    }
  }, [user, socket, showScreenshare, setLocalScreenStream, localScreenStream]);

  useEffect(() => {
    const currentMode = useStore.getState().videoStreams[user?.id || 0];
    if (currentMode === 'camera' && showScreenshare.show && !showScreenshare.targetUserId) {
      // Restart camera with new facingMode
      onOpenScreenshare('camera', true);
    }
  }, [facingMode, onOpenScreenshare]);

  if (!user) {
    return <Auth />;
  }

  return (
    <div className="flex h-screen bg-slate-950 text-white overflow-hidden">
      <Sidebar 
        onOpenScreenshare={onOpenScreenshare} 
        onJoinScreenshare={(userId, mode) => {
          if (!useStore.getState().inVoice) {
            socket?.emit('join_voice');
            socket?.emit('play_sound', 'join_voice');
            sounds.playJoin();
            setInVoice(true);
          }
          if (showScreenshare.show && showScreenshare.targetUserId === userId) {
            setShowScreenshare({ show: false, mode: 'screen' });
          } else {
            setShowScreenshare({ show: true, mode, targetUserId: userId });
          }
        }}
      />
      <div className="flex-1 flex flex-col relative">
        <Chat />
      </div>
      <RightSidebar 
        onJoinScreenshare={(userId, mode) => {
          if (!useStore.getState().inVoice) {
            socket?.emit('join_voice');
            socket?.emit('play_sound', 'join_voice');
            sounds.playJoin();
            setInVoice(true);
          }
          if (showScreenshare.show && showScreenshare.targetUserId === userId) {
            setShowScreenshare({ show: false, mode: 'screen' });
          } else {
            setShowScreenshare({ show: true, mode, targetUserId: userId });
          }
        }}
      />
      
      {user.isAdmin && (
        <button
          onClick={() => setShowAdmin(true)}
          className="fixed bottom-4 left-4 bg-orange-600 hover:bg-orange-700 text-white px-4 py-2 rounded-lg text-sm font-medium shadow-lg transition-colors z-40"
        >
          Admin Panel
        </button>
      )}

      {showAdmin && <AdminPanel onClose={() => setShowAdmin(false)} />}
      {showScreenshare.show && <Screenshare mode={showScreenshare.mode} targetUserId={showScreenshare.targetUserId} onClose={() => {
        if (!showScreenshare.targetUserId && localScreenStream) {
          localScreenStream.getTracks().forEach(t => t.stop());
          setLocalScreenStream(null);
          socket?.emit('set_stream_id', { type: 'screen', streamId: null });
        }
        setShowScreenshare({ show: false, mode: 'screen' });
      }} />}
      <VoiceManager />
      <WebRTCManager />
    </div>
  );
}
