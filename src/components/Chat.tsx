import React, { useState, useEffect, useRef } from 'react';
import { useStore } from '../store';
import { encryptMessage, decryptMessage, importPublicKey, deriveSharedSecret, exportSymmetricKey, importSymmetricKey, generateSymmetricKey, saveKeyToDB, getKeyFromDB } from '../lib/crypto';
import { Send, Users, Shield, Monitor, Mic, Video, Citrus } from 'lucide-react';
import { clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';
import { UserContextMenu } from './UserContextMenu';
import { UserProfileModal } from './UserProfileModal';

export function Chat() {
  const { user, token, users, messages, activeTab, socket, keyPair, sharedSecrets, mainRoomKey, setSharedSecret, setMainRoomKey, setActiveTab, addMessage } = useStore();
  const [input, setInput] = useState('');
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const [contextMenu, setContextMenu] = useState<{ userId: number, x: number, y: number } | null>(null);
  const [profileModalUserId, setProfileModalUserId] = useState<number | null>(null);

  const handleUserClick = (e: React.MouseEvent, userId: number) => {
    e.preventDefault();
    e.stopPropagation();
    if (userId === user?.id) return;
    setContextMenu({ userId, x: e.clientX, y: e.clientY });
  };

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, activeTab]);

  // Derive shared secrets for all users
  const derivedPublicKeys = useRef<Record<number, string>>({});
  const sentMainKeyTo = useRef<Set<number>>(new Set());

  useEffect(() => {
    if (!keyPair || !users.length) return;

    const deriveKeys = async () => {
      for (const u of users) {
        const pubKeyStr = u.public_key || u.publicKey;
        if (u.id === user?.id || !pubKeyStr) continue;
        
        // Skip if we already derived the key for THIS specific public key string
        if (sharedSecrets[u.id] && derivedPublicKeys.current[u.id] === pubKeyStr) continue;

        try {
          const pubKey = await importPublicKey(pubKeyStr);
          const shared = await deriveSharedSecret(keyPair.privateKey, pubKey);
          setSharedSecret(u.id, shared);
          derivedPublicKeys.current[u.id] = pubKeyStr;
          // If the key changed, we need to resend the main key
          sentMainKeyTo.current.delete(u.id);
        } catch (e) {
          console.error('Failed to derive key for user', u.id, e);
        }
      }
    };
    deriveKeys();
  }, [users, keyPair, user, sharedSecrets, setSharedSecret]);

  // Admin setup and distribution of main room key
  useEffect(() => {
    if (!user?.isAdmin || !keyPair || !socket || users.length === 0) return;

    const distributeKey = async () => {
      let symKey = mainRoomKey;
      if (!symKey) {
        // Try to load from IndexedDB first for persistence
        try {
          const keyData = await getKeyFromDB('mainRoomKey');
          if (keyData) {
            if (typeof keyData === 'string') {
              symKey = await importSymmetricKey(keyData);
            } else if (typeof keyData === 'object' && keyData.type === 'secret') {
              symKey = keyData;
            }
            if (symKey) setMainRoomKey(symKey);
          }
        } catch (e) {
          console.error('Failed to load main key from DB', e);
        }
      }

      if (!symKey) {
        symKey = await generateSymmetricKey();
        setMainRoomKey(symKey);
        await saveKeyToDB('mainRoomKey', symKey);
      }
      
      const exportedSymKey = await exportSymmetricKey(symKey);

      for (const u of users) {
        if (u.id === user.id || !sharedSecrets[u.id] || sentMainKeyTo.current.has(u.id)) continue;
        try {
          const { encryptedPayload, iv } = await encryptMessage(sharedSecrets[u.id], `MAIN_KEY:${exportedSymKey}`);
          socket.emit('message', { to: u.id, encryptedPayload, iv });
          sentMainKeyTo.current.add(u.id);
        } catch (e) {
          console.error('Failed to send main key to user', u.id, e);
        }
      }
    };
    distributeKey();
  }, [user, keyPair, mainRoomKey, users, sharedSecrets, socket, setMainRoomKey]);

  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || !socket || !keyPair) return;

    let keyToUse: CryptoKey | null = null;

    if (activeTab === 'main') {
      keyToUse = mainRoomKey;
    } else {
      keyToUse = sharedSecrets[parseInt(activeTab)];
    }

    if (!keyToUse) {
      return; // UI handles this state
    }

    try {
      const { encryptedPayload, iv } = await encryptMessage(keyToUse, input);
      socket.emit('message', { to: activeTab, encryptedPayload, iv });
      setInput('');
    } catch (e) {
      console.error('Failed to encrypt message', e);
    }
  };

  const filteredMessages = messages.filter(m => {
    if (activeTab === 'main') return m.to === 'main';
    return m.to !== 'main' && (
      (m.from === parseInt(activeTab) && m.to.toString() === user?.id.toString()) ||
      (m.from === user?.id && m.to.toString() === activeTab)
    );
  });

  const currentKey = activeTab === 'main' ? mainRoomKey : sharedSecrets[parseInt(activeTab)];
  const isKeyReady = !!currentKey;

  return (
    <div className="flex-1 flex flex-col bg-slate-900">
      {/* Header */}
      <div className="h-16 border-b border-slate-800 flex items-center px-6 justify-between bg-slate-950/50">
        <div className="flex items-center gap-3">
          {activeTab === 'main' ? (
            <Users className="w-5 h-5 text-slate-400" />
          ) : (
            <Shield className="w-5 h-5 text-cyan-400" />
          )}
          <h2 className="text-lg font-semibold text-white">
            {activeTab === 'main' ? 'Main Room' : users.find(u => u.id.toString() === activeTab)?.displayName || users.find(u => u.id.toString() === activeTab)?.username}
          </h2>
          <span className={twMerge(
            "text-xs font-mono px-2 py-1 rounded ml-2 transition-colors",
            isKeyReady ? "text-emerald-400 bg-emerald-500/10 border border-emerald-500/20" : "text-amber-400 bg-amber-500/10 border border-amber-500/20"
          )}>
            {isKeyReady ? 'AES-GCM 256' : 'Waiting for Keys...'}
          </span>
        </div>
      </div>

      {/* Messages Area */}
      <div className="flex-1 overflow-y-auto p-6 space-y-4">
        {!isKeyReady && (
          <div className="flex flex-col items-center justify-center h-full text-center space-y-4 opacity-60">
            <div className="w-12 h-12 bg-amber-500/20 rounded-full flex items-center justify-center animate-pulse">
              <Shield className="w-6 h-6 text-amber-500" />
            </div>
            <div className="max-w-xs">
              <p className="text-white font-medium mb-1">Establishing Secure Connection</p>
              <p className="text-xs text-zinc-400">
                {activeTab === 'main' 
                  ? "Waiting for an administrator to distribute the room's encryption keys."
                  : "Deriving a shared secret with this user. They must be online to complete the handshake."}
              </p>
            </div>
          </div>
        )}
        {isKeyReady && filteredMessages.length === 0 && (
          <div className="flex flex-col items-center justify-center h-full text-center opacity-40">
            <Citrus className="w-12 h-12 mb-4 text-zinc-600" />
            <p className="text-sm">No messages yet. Start the conversation!</p>
          </div>
        )}
        {isKeyReady && filteredMessages.map((msg: any, i) => {
          if (msg.system) {
            return (
              <div key={i} className="flex justify-center">
                <span className="text-xs font-mono text-zinc-500 bg-zinc-800/50 px-3 py-1 rounded-full border border-zinc-800/50">
                  {msg.text}
                </span>
              </div>
            );
          }

          const isMe = msg.from === user?.id;
          const sender = users.find(u => u.id === msg.from);
          const senderName = isMe ? (user?.displayName || user?.username) : (sender?.displayName || sender?.username || 'Unknown');
          const avatarUrl = isMe ? user?.avatar_url : sender?.avatar_url;
          const color = isMe ? user?.color : sender?.color;
          const glow = isMe ? user?.glow : sender?.glow;
          
          return (
            <div key={i} className="flex gap-4 hover:bg-zinc-800/30 p-2 -mx-2 rounded-lg transition-colors group">
              <img 
                src={avatarUrl || `https://api.dicebear.com/7.x/avataaars/svg?seed=${senderName}`} 
                alt="avatar" 
                className="w-10 h-10 rounded-full bg-zinc-800 shrink-0 mt-0.5" 
              />
              <div className="flex flex-col min-w-0">
                <div className="flex flex-col mb-1">
                  <span 
                    className={clsx("font-medium text-[15px]", msg.from !== user?.id && "cursor-pointer hover:underline")}
                    onClick={() => msg.from !== user?.id && setActiveTab(msg.from.toString())}
                    onContextMenu={(e) => msg.from !== user?.id && handleUserClick(e, msg.from)}
                    style={{ 
                      color: color || '#ffffff',
                      textShadow: glow ? `0 0 8px ${color || '#ffffff'}` : 'none'
                    }}
                  >
                    {senderName}
                  </span>
                  <span className="text-[10px] text-zinc-500 leading-tight">
                    {new Date(msg.timestamp).toLocaleDateString()} {new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  </span>
                </div>
                <div className="text-zinc-200 break-words leading-relaxed">
                  {msg.text}
                </div>
              </div>
            </div>
          );
        })}
        <div ref={messagesEndRef} />
      </div>

      {contextMenu && (
        <UserContextMenu 
          userId={contextMenu.userId} 
          position={{ x: contextMenu.x, y: contextMenu.y }} 
          onClose={() => setContextMenu(null)} 
          onOpenProfile={() => {
            setProfileModalUserId(contextMenu.userId);
            setContextMenu(null);
          }}
        />
      )}

      {profileModalUserId && (
        <UserProfileModal 
          userId={profileModalUserId} 
          onClose={() => setProfileModalUserId(null)} 
        />
      )}

      {/* Input Area */}
      <div className="p-4 bg-zinc-950/50 border-t border-zinc-800">
        <form onSubmit={handleSend} className="flex gap-2">
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            disabled={!isKeyReady}
            placeholder={isKeyReady ? `Message ${activeTab === 'main' ? 'Main Room' : 'Private'}...` : 'Waiting for encryption keys...'}
            className="flex-1 bg-zinc-900 border border-zinc-800 rounded-xl px-4 py-3 text-white focus:outline-none focus:ring-2 focus:ring-orange-500/50 placeholder:text-zinc-600 disabled:opacity-50 disabled:cursor-not-allowed"
          />
          <button
            type="submit"
            disabled={!input.trim() || !isKeyReady}
            className="bg-orange-600 hover:bg-orange-700 disabled:opacity-50 disabled:hover:bg-orange-600 text-white p-3 rounded-xl transition-colors flex items-center justify-center"
          >
            <Send className="w-5 h-5" />
          </button>
        </form>
      </div>
    </div>
  );
}
