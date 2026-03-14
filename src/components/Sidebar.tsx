import React, { useState, useEffect } from 'react';
import { useStore } from '../store';
import { Users, Shield, LogOut, Settings, Mic, Volume2, MicOff, Headphones, PhoneOff, Signal, Monitor, Video, Citrus } from 'lucide-react';
import { clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';
import { UserSettings } from './UserSettings';
import { UserContextMenu } from './UserContextMenu';

function ConnectionTime({ joinedAt }: { joinedAt: number }) {
  const [time, setTime] = useState('00:00:00');

  useEffect(() => {
    const update = () => {
      const diff = Math.floor((Date.now() - joinedAt) / 1000);
      const h = Math.floor(diff / 3600).toString().padStart(2, '0');
      const m = Math.floor((diff % 3600) / 60).toString().padStart(2, '0');
      const s = (diff % 60).toString().padStart(2, '0');
      setTime(`${h}:${m}:${s}`);
    };
    update();
    const interval = setInterval(update, 1000);
    return () => clearInterval(interval);
  }, [joinedAt]);

  return <span className="text-[10px] text-zinc-500 font-mono ml-2">{time}</span>;
}

export function Sidebar({ onOpenScreenshare }: { onOpenScreenshare: (mode: 'screen' | 'camera') => void }) {
  const { user, users, activeTab, setActiveTab, setUser, socket, inVoice, setInVoice, voiceUsers, isMuted, setIsMuted, isDeafened, setIsDeafened, ping, speakingUsers, voiceStates, onlineUsers, messages } = useStore();
  const [showSettings, setShowSettings] = useState(false);
  const [contextMenu, setContextMenu] = useState<{ userId: number, x: number, y: number, isVoice?: boolean } | null>(null);

  const handleUserClick = (e: React.MouseEvent, userId: number, isVoice?: boolean) => {
    e.preventDefault();
    e.stopPropagation();
    if (userId === user?.id) return;
    setContextMenu({ userId, x: e.clientX, y: e.clientY, isVoice });
  };

  const joinVoice = () => {
    if (!inVoice) {
      socket?.emit('join_voice');
      setInVoice(true);
    }
  };

  const leaveVoice = () => {
    if (inVoice) {
      socket?.emit('leave_voice');
      setInVoice(false);
    }
  };

  return (
    <div className="w-64 bg-zinc-950 border-r border-zinc-800 flex flex-col h-screen">
      <div className="p-4 border-b border-zinc-800 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 bg-gradient-to-br from-orange-400 to-amber-600 rounded-lg flex items-center justify-center shadow-lg shadow-orange-500/20">
            <Citrus className="w-5 h-5 text-white" />
          </div>
          <span className="font-bold text-white tracking-tight text-lg">Mango</span>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto py-4">
        <div className="px-3 mb-2">
          <h3 className="text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-2 px-2">Rooms</h3>
          <button
            onClick={() => setActiveTab('main')}
            className={twMerge(
              "w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors",
              activeTab === 'main' ? "bg-zinc-800 text-white" : "text-zinc-400 hover:bg-zinc-800/50 hover:text-zinc-200"
            )}
          >
            <Users className="w-4 h-4" />
            Main Room
          </button>
        </div>

        <div className="px-3 mt-6">
          <h3 className="text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-2 px-2">Voice Channels</h3>
          <button
            onClick={joinVoice}
            className={twMerge(
              "w-full flex items-center justify-between px-3 py-2 rounded-lg text-sm font-medium transition-colors",
              inVoice ? "bg-emerald-500/10 text-emerald-400" : "text-zinc-400 hover:bg-zinc-800/50 hover:text-zinc-200"
            )}
          >
            <div className="flex items-center gap-3">
              <Volume2 className="w-4 h-4" />
              General Voice
            </div>
            {inVoice && <Mic className="w-3 h-3 animate-pulse" />}
          </button>
          
          {/* Voice Users List */}
          {voiceUsers.length > 0 && (
            <div className="mt-1 ml-6 space-y-1">
              {voiceUsers.map(vu => {
                const vUser = users.find(u => u.id === vu.id);
                if (!vUser) return null;
                const isSpeaking = speakingUsers.includes(vu.id) && !voiceStates[vu.id]?.muted;
                return (
                  <div 
                    key={vu.id} 
                    onContextMenu={(e) => handleUserClick(e, vu.id, true)}
                    className="flex items-center justify-between px-2 py-1 text-xs text-zinc-400 hover:bg-zinc-800/50 rounded-md cursor-pointer transition-colors"
                  >
                    <div className="flex items-center gap-2 overflow-hidden">
                      <img src={vUser.avatar_url || `https://api.dicebear.com/7.x/avataaars/svg?seed=${vUser.username}`} className={twMerge("w-5 h-5 rounded-full bg-zinc-800 transition-all shrink-0", isSpeaking ? "ring-2 ring-emerald-500" : "")} />
                      <span 
                        className={twMerge("truncate", isSpeaking ? "text-white" : "")}
                        style={{ color: vUser.color || undefined, textShadow: vUser.glow ? `0 0 8px ${vUser.color || '#fff'}` : 'none' }}
                      >
                        {vUser.displayName || vUser.username}
                      </span>
                      <ConnectionTime joinedAt={vu.joinedAt} />
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      {voiceStates[vu.id]?.deafened && <Headphones className="w-3 h-3 text-red-400" />}
                      {voiceStates[vu.id]?.muted && !voiceStates[vu.id]?.deafened && <MicOff className="w-3 h-3 text-red-400" />}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        <div className="px-3 mt-6">
          <h3 className="text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-2 px-2">Private Messages</h3>
          <div className="space-y-1">
            {users.filter(u => {
              if (u.id === user?.id) return false;
              // Show users we have messages with OR the currently active private chat
              const hasMessages = messages.some(m => m.from === u.id || m.to === u.id.toString());
              const isActive = activeTab === u.id.toString();
              return hasMessages || isActive;
            }).map(u => {
              const isOnline = onlineUsers.includes(u.id);
              return (
                <button
                  key={u.id}
                  onClick={() => setActiveTab(u.id.toString())}
                  onContextMenu={(e) => handleUserClick(e, u.id)}
                  className={twMerge(
                    "w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors group",
                    activeTab === u.id.toString() ? "bg-zinc-800 text-white" : "text-zinc-400 hover:bg-zinc-800/50 hover:text-zinc-200"
                  )}
                >
                  <div className="relative shrink-0">
                    <img 
                      src={u.avatar_url || `https://api.dicebear.com/7.x/avataaars/svg?seed=${u.username}`} 
                      className="w-8 h-8 rounded-full bg-zinc-800" 
                    />
                    <div className={twMerge(
                      "absolute -bottom-0.5 -right-0.5 w-3 h-3 border-2 border-zinc-950 rounded-full",
                      isOnline ? "bg-emerald-500" : "bg-zinc-600"
                    )} />
                  </div>
                  <div className="flex flex-col items-start min-w-0">
                    <span 
                      className="truncate w-full text-left"
                      style={{ 
                        color: u.color || undefined,
                        textShadow: u.glow ? `0 0 8px ${u.color || '#fff'}` : 'none'
                      }}
                    >
                      {u.displayName || u.username}
                    </span>
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {inVoice && (
        <div className="px-3 py-3 bg-zinc-900/50 border-t border-zinc-800/50 flex flex-col gap-2">
          <div className="flex items-center justify-between px-1">
            <div className="flex items-center gap-2 text-emerald-400">
              <Signal className="w-3 h-3" />
              <span className="text-xs font-medium">Voice Connected</span>
            </div>
            <span className={clsx("text-xs font-medium", ping < 50 ? "text-emerald-400" : ping < 150 ? "text-yellow-400" : "text-red-400")}>{ping} ms</span>
          </div>
          <div className="flex items-center justify-between">
            <div className="flex gap-1">
              <button onClick={() => setIsMuted(!isMuted)} className={clsx("p-2 rounded-lg transition-colors", isMuted ? "bg-red-500/20 text-red-400" : "hover:bg-zinc-800 text-zinc-400")}>
                {isMuted ? <MicOff className="w-4 h-4" /> : <Mic className="w-4 h-4" />}
              </button>
              <button onClick={() => setIsDeafened(!isDeafened)} className={clsx("p-2 rounded-lg transition-colors", isDeafened ? "bg-red-500/20 text-red-400" : "hover:bg-zinc-800 text-zinc-400")}>
                {isDeafened ? <Headphones className="w-4 h-4" /> : <Volume2 className="w-4 h-4" />}
              </button>
              <button onClick={() => onOpenScreenshare('screen')} className="p-2 rounded-lg hover:bg-zinc-800 text-zinc-400 transition-colors" title="Share Screen">
                <Monitor className="w-4 h-4" />
              </button>
              <button onClick={() => onOpenScreenshare('camera')} className="p-2 rounded-lg hover:bg-zinc-800 text-zinc-400 transition-colors" title="Share Camera">
                <Video className="w-4 h-4" />
              </button>
            </div>
            <button onClick={leaveVoice} className="p-2 rounded-lg hover:bg-red-500/20 text-red-400 transition-colors">
              <PhoneOff className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

      <div className="p-4 border-t border-zinc-800 bg-zinc-950">
        <div className="flex items-center gap-3 mb-4">
          <img src={user?.avatar_url || `https://api.dicebear.com/7.x/avataaars/svg?seed=${user?.username}`} className="w-10 h-10 rounded-full bg-zinc-800" />
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-white truncate">{user?.displayName || user?.username}</p>
            <p className="text-xs text-zinc-500 truncate">{user?.isAdmin ? 'Administrator' : 'Member'}</p>
          </div>
          <button onClick={() => setShowSettings(true)} className="p-2 text-zinc-400 hover:text-white hover:bg-zinc-800 rounded-lg transition-colors">
            <Settings className="w-4 h-4" />
          </button>
        </div>
        
        <div className="flex gap-2">
          {user?.isAdmin && (
            <button className="flex-1 flex items-center justify-center gap-2 py-2 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 rounded-lg text-xs font-medium transition-colors">
              <Shield className="w-4 h-4" />
              Admin
            </button>
          )}
          <button
            onClick={() => setUser(null, null)}
            className="flex-1 flex items-center justify-center gap-2 py-2 bg-red-500/10 hover:bg-red-500/20 text-red-400 rounded-lg text-xs font-medium transition-colors"
          >
            <LogOut className="w-4 h-4" />
            Logout
          </button>
        </div>
      </div>
      {showSettings && <UserSettings onClose={() => setShowSettings(false)} />}
      
      {contextMenu && (
        <UserContextMenu 
          userId={contextMenu.userId} 
          position={{ x: contextMenu.x, y: contextMenu.y }} 
          isVoiceContext={contextMenu.isVoice}
          onClose={() => setContextMenu(null)} 
        />
      )}
    </div>
  );
}
