import React, { useEffect, useState } from 'react';
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
import { decryptMessage, importSymmetricKey, getKeyFromDB, saveKeyToDB } from './lib/crypto';
import { loadKeyPair } from './lib/db';
import { sounds } from './lib/sounds';

export default function App() {
  const { user, token, users, setUsers, socket, setSocket, addMessage, setMessages, keyPair, setKeyPair, sharedSecrets, mainRoomKey, setMainRoomKey, voiceUsers, setVoiceUsers, setPing, onlineUsers, setOnlineUsers, setVoiceStates, setVoiceState, setVideoStreams, setVideoStream, setStreamViewers, setStreamViewer, inVoice, setInVoice, activeTab, setPeerConnection, peerConnections, setLocalScreenStream } = useStore();
  const [showAdmin, setShowAdmin] = useState(false);
  const [showScreenshare, setShowScreenshare] = useState<{ show: boolean, mode: 'screen' | 'camera', targetUserId?: number }>({ show: false, mode: 'screen' });

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
              decryptedText = await decryptMessage(mainRoomKey, msg.encryptedPayload, msg.iv);
            } else if (msg.to !== 'main') {
              const otherId = msg.from === user.id ? parseInt(msg.to) : msg.from;
              const sharedKey = sharedSecrets[otherId];
              if (sharedKey) {
                decryptedText = await decryptMessage(sharedKey, msg.encryptedPayload, msg.iv);
                if (decryptedText.startsWith('MAIN_KEY:')) {
                  decryptedText = ''; // Skip this message
                }
              }
            }
            if (decryptedText) {
              history.push({
                id: Math.random().toString(36).substring(7),
                from: msg.from,
                to: msg.to,
                text: decryptedText,
                timestamp: msg.timestamp
              });
            }
          }
          setMessages(history);
        }
      } catch (e) {
        console.error('Failed to fetch history:', e);
      }
    };
    fetchHistory();
  }, [token, user, activeTab, mainRoomKey, sharedSecrets]);

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
        decryptedText = await decryptMessage(mainRoomKey, data.encryptedPayload, data.iv);
      } else if (data.to !== 'main') {
        const otherId = data.from === user?.id ? parseInt(data.to) : data.from;
        const sharedKey = sharedSecrets[otherId];
        if (sharedKey) {
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
            const settings = useStore.getState().screenshareSettings;
            let videoConstraints: any = {
              displaySurface: 'monitor',
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
                  video: videoConstraints,
                  audio: true
                })
              : await navigator.mediaDevices.getUserMedia({
                  video: {
                    frameRate: 30,
                    width: { ideal: 1280 },
                    height: { ideal: 720 }
                  },
                  audio: !useStore.getState().inVoice
                });
            
            if (stream) {
              setLocalScreenStream(stream);
              setShowScreenshare({ show: true, mode });
              stream.getVideoTracks()[0].onended = () => {
                setLocalScreenStream(null);
                setShowScreenshare({ show: false, mode: 'screen' });
              };
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
      {showScreenshare.show && <Screenshare mode={showScreenshare.mode} targetUserId={showScreenshare.targetUserId} onClose={() => setShowScreenshare({ show: false, mode: 'screen' })} />}
      <VoiceManager />
      <WebRTCManager />
    </div>
  );
}
