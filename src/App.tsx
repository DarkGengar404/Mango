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

export default function App() {
  const { user, token, users, setUsers, socket, setSocket, addMessage, keyPair, sharedSecrets, mainRoomKey, setMainRoomKey, voiceUsers, setVoiceUsers, setPing, onlineUsers, setOnlineUsers, setVoiceStates, setVoiceState } = useStore();
  const [showAdmin, setShowAdmin] = useState(false);
  const [showScreenshare, setShowScreenshare] = useState<{ show: boolean, mode: 'screen' | 'camera' }>({ show: false, mode: 'screen' });

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

  if (!user) {
    return <Auth />;
  }

  return (
    <div className="flex h-screen bg-zinc-950 text-white overflow-hidden">
      <Sidebar onOpenScreenshare={(mode) => setShowScreenshare({ show: true, mode })} />
      <div className="flex-1 flex flex-col relative">
        <Chat />
      </div>
      <RightSidebar />
      
      {user.isAdmin && (
        <button
          onClick={() => setShowAdmin(true)}
          className="fixed bottom-4 left-4 bg-orange-600 hover:bg-orange-700 text-white px-4 py-2 rounded-lg text-sm font-medium shadow-lg transition-colors z-40"
        >
          Admin Panel
        </button>
      )}

      {showAdmin && <AdminPanel onClose={() => setShowAdmin(false)} />}
      {showScreenshare.show && <Screenshare mode={showScreenshare.mode} onClose={() => setShowScreenshare({ show: false, mode: 'screen' })} />}
      <VoiceManager />
    </div>
  );
}
