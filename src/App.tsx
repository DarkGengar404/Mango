import React, { useEffect, useState } from 'react';
import { useStore } from './store';
import { Auth } from './components/Auth';
import { Sidebar } from './components/Sidebar';
import { RightSidebar } from './components/RightSidebar';
import { Chat } from './components/Chat';
import { AdminPanel } from './components/AdminPanel';
import { Screenshare } from './components/Screenshare';
import { VoiceManager } from './components/VoiceManager';
import { io } from 'socket.io-client';
import { decryptMessage, importSymmetricKey } from './lib/crypto';
import { loadKeyPair } from './lib/db';
import { sounds } from './lib/sounds';

export default function App() {
  const { user, token, users, setUsers, socket, setSocket, addMessage, keyPair, setKeyPair, sharedSecrets, mainRoomKey, setMainRoomKey, voiceUsers, setVoiceUsers, setPing, onlineUsers, setOnlineUsers, setVoiceStates, setVoiceState, setVideoStreams, setVideoStream, setStreamViewers, setStreamViewer, inVoice, setInVoice } = useStore();
  const [showAdmin, setShowAdmin] = useState(false);
  const [showScreenshare, setShowScreenshare] = useState<{ show: boolean, mode: 'screen' | 'camera', targetUserId?: number, stream?: MediaStream }>({ show: false, mode: 'screen' });

  useEffect(() => {
    if (!keyPair) {
      loadKeyPair().then(kp => {
        if (kp) setKeyPair(kp);
      });
    }
  }, [keyPair]);

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
          }
        }
      } catch (e) {
        console.error('Failed to fetch users:', e);
      }
    };
    fetchUsers();

    const socketInstance = io({
      auth: { token }
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
      let decryptedText = '';
      
      // Handle Main Room Key distribution
      if (data.to !== 'main' && data.encryptedPayload && data.iv) {
        const sharedKey = sharedSecrets[data.from];
        if (sharedKey) {
          const text = await decryptMessage(sharedKey, data.encryptedPayload, data.iv);
          if (text.startsWith('MAIN_KEY:')) {
            const keyBase64 = text.split(':')[1];
            const symKey = await importSymmetricKey(keyBase64);
            setMainRoomKey(symKey);
            return; // Don't show this as a message
          } else {
            decryptedText = text;
          }
        }
      } else if (data.to === 'main' && mainRoomKey) {
        decryptedText = await decryptMessage(mainRoomKey, data.encryptedPayload, data.iv);
      } else if (data.to !== 'main') {
        const sharedKey = sharedSecrets[data.from];
        if (sharedKey) {
          decryptedText = await decryptMessage(sharedKey, data.encryptedPayload, data.iv);
        }
      }

      if (decryptedText) {
        addMessage({
          id: Math.random().toString(36).substring(7),
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
      setShowScreenshare({ show: false, mode: 'screen' });
    }
  }, [inVoice]);

  if (!user) {
    return <Auth />;
  }

  return (
    <div className="flex h-screen bg-zinc-950 text-white overflow-hidden">
      <Sidebar 
        onOpenScreenshare={async (mode) => {
          const currentMode = useStore.getState().videoStreams[user?.id || 0];
          
          if (currentMode === mode) {
            // Stop sharing
            setShowScreenshare({ show: false, mode: 'screen' });
            return;
          }

          // Mutual exclusivity: stop previous if exists
          if (currentMode) {
            setShowScreenshare({ show: false, mode: 'screen' });
            // Small delay to ensure cleanup
            await new Promise(r => setTimeout(r, 100));
          }
          
          try {
            const stream = mode === 'screen' 
              ? await navigator.mediaDevices.getDisplayMedia({
                  video: {
                    displaySurface: 'monitor',
                    frameRate: 30,
                    width: { ideal: 1920 },
                    height: { ideal: 1080 }
                  },
                  audio: true
                })
              : await navigator.mediaDevices.getUserMedia({
                  video: {
                    frameRate: 30,
                    width: { ideal: 1280 },
                    height: { ideal: 720 }
                  },
                  audio: true
                });
            
            if (stream) {
              setShowScreenshare({ show: true, mode, stream });
            }
          } catch (e: any) {
            if (e.name !== 'NotAllowedError' && e.name !== 'AbortError') {
              console.error('Failed to get media', e);
            }
          }
        }} 
        onJoinScreenshare={(userId, mode) => {
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
      {showScreenshare.show && <Screenshare mode={showScreenshare.mode} targetUserId={showScreenshare.targetUserId} stream={showScreenshare.stream} onClose={() => setShowScreenshare({ show: false, mode: 'screen' })} />}
      <VoiceManager />
    </div>
  );
}
