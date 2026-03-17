import React, { useState, useEffect } from 'react';
import { useStore } from '../store';
import { X, Users, Shield, LogOut, Settings, Mic, Volume2, MicOff, Headphones, PhoneOff, Signal, Monitor, Video, Zap } from 'lucide-react';
import { clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';
import { UserSettings } from './UserSettings';
import { UserContextMenu } from './UserContextMenu';
import { UserProfileModal } from './UserProfileModal';
import { sounds } from '../lib/sounds';

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

export function Sidebar({ onOpenScreenshare, onJoinScreenshare }: { onOpenScreenshare: (mode: 'screen' | 'camera') => void, onJoinScreenshare: (userId: number, mode: 'screen' | 'camera') => void }) {
  const { user, users, activeTab, setActiveTab, setUser, socket, inVoice, setInVoice, voiceUsers, isMuted, setIsMuted, isDeafened, setIsDeafened, isKrispEnabled, setIsKrispEnabled, ping, speakingUsers, voiceStates, onlineUsers, messages, closedDMs, setClosedDMs, lastViewed, setLastViewed, videoStreams } = useStore();
  const [showSettings, setShowSettings] = useState(false);
  const [contextMenu, setContextMenu] = useState<{ userId: number, x: number, y: number, isVoice?: boolean } | null>(null);
  const [profileModalUserId, setProfileModalUserId] = useState<number | null>(null);

  const handleUserClick = (e: React.MouseEvent, userId: number, isVoice?: boolean) => {
    e.preventDefault();
    e.stopPropagation();
    setContextMenu({ userId, x: e.clientX, y: e.clientY, isVoice });
  };

  const joinVoice = () => {
    if (!inVoice) {
      socket?.emit('join_voice');
      socket?.emit('play_sound', 'join_voice');
      sounds.playJoin();
      setInVoice(true);
    }
  };

  const leaveVoice = () => {
    if (inVoice) {
      socket?.emit('leave_voice');
      socket?.emit('play_sound', 'leave_voice');
      sounds.playLeave();
      setInVoice(false);
    }
  };

  // Ensure we leave voice on unmount
  useEffect(() => {
    return () => {
      if (inVoice) {
        socket?.emit('leave_voice');
      }
    };
  }, [inVoice, socket]);

  const dmUsers = React.useMemo(() => {
    if (!user) return [];
    const userIdStr = user.id.toString();
    return users.filter(u => {
      if (u.id === user.id) return false;
      if (closedDMs.includes(u.id)) return false;
      const uIdStr = u.id.toString();
      const hasMessages = messages.some(m => m.to !== 'main' && ((m.from === u.id && m.to.toString() === userIdStr) || (m.from === user.id && m.to.toString() === uIdStr)));
      const isActive = activeTab === uIdStr;
      return hasMessages || isActive;
    }).sort((a, b) => {
      const aIdStr = a.id.toString();
      const bIdStr = b.id.toString();
      const aMsgs = messages.filter(m => m.to !== 'main' && ((m.from === a.id && m.to.toString() === userIdStr) || (m.from === user.id && m.to.toString() === aIdStr)));
      const bMsgs = messages.filter(m => m.to !== 'main' && ((m.from === b.id && m.to.toString() === userIdStr) || (m.from === user.id && m.to.toString() === bIdStr)));
      const aLatest = aMsgs.length > 0 ? aMsgs[aMsgs.length - 1].timestamp : 0;
      const bLatest = bMsgs.length > 0 ? bMsgs[bMsgs.length - 1].timestamp : 0;
      return bLatest - aLatest;
    });
  }, [users, user, closedDMs, messages, activeTab]);

  return (
    <div className="w-64 bg-slate-950 border-r border-slate-800 flex flex-col h-screen">
      <div className="p-4 border-b border-slate-800 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 bg-gradient-to-br from-cyan-400 to-fuchsia-600 rounded-lg flex items-center justify-center shadow-lg shadow-fuchsia-500/20">
            <Zap className="w-5 h-5 text-white" />
          </div>
          <span className="font-bold text-white tracking-tight text-lg">Aurora</span>
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
              inVoice ? "bg-indigo-500/10 text-indigo-400" : "text-zinc-400 hover:bg-zinc-800/50 hover:text-zinc-200"
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
                const isSpeaking = (speakingUsers || []).includes(vu.id) && !(voiceStates[vu.id]?.muted);
                const userStream = videoStreams[vu.id];
                return (
                  <div 
                    key={vu.id} 
                    onContextMenu={(e) => handleUserClick(e, vu.id, true)}
                    className="flex items-center justify-between px-2 py-1 text-xs text-zinc-400 hover:bg-zinc-800/50 rounded-md cursor-pointer transition-colors"
                  >
                    <div className="flex items-center gap-2 overflow-hidden">
                      <img 
                        src={vUser.avatar_url || `https://api.dicebear.com/7.x/avataaars/svg?seed=${vUser.username}`} 
                        className={twMerge(
                          "w-5 h-5 rounded-full bg-zinc-800 transition-all shrink-0", 
                          isSpeaking ? "ring-2 ring-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.4)]" : ""
                        )} 
                        referrerPolicy="no-referrer"
                      />
                      <span 
                        className={twMerge("truncate transition-colors", isSpeaking ? "text-emerald-400 font-medium" : "")}
                        style={{ color: vUser.color || undefined, textShadow: vUser.glow ? `0 0 8px ${vUser.color || '#fff'}` : 'none' }}
                      >
                        {vUser.displayName || vUser.username}
                      </span>
                      <ConnectionTime joinedAt={vu.joinedAt} />
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      {userStream && vu.id !== user?.id && (
                        <button 
                          onClick={(e) => {
                            e.stopPropagation();
                            onJoinScreenshare(vu.id, userStream);
                          }}
                          className="p-1 hover:bg-zinc-700 rounded text-emerald-400"
                          title={`Watch ${userStream === 'screen' ? 'Stream' : 'Camera'}`}
                        >
                          {userStream === 'screen' ? <Monitor className="w-3 h-3" /> : <Video className="w-3 h-3" />}
                        </button>
                      )}
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
          <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2 px-2">Private Messages</h3>
          <div className="space-y-1">
            {dmUsers.map(u => {
            const isOnline = onlineUsers.includes(u.id);
            const userIdStr = user?.id.toString() || '';
            const uIdStr = u.id.toString();
            const uMsgs = messages.filter(m => m.to !== 'main' && ((m.from === u.id && m.to.toString() === userIdStr) || (m.from === user?.id && m.to.toString() === uIdStr)));
            const lastViewedTime = lastViewed[uIdStr] || 0;
            const unreadCount = uMsgs.filter(m => m.from === u.id && m.timestamp > lastViewedTime).length;
            
            return (
              <div key={u.id} className="relative group">
                <button
                  onClick={() => {
                    setActiveTab(u.id.toString());
                    setLastViewed(u.id.toString(), Date.now());
                  }}
                  onContextMenu={(e) => handleUserClick(e, u.id)}
                  className={twMerge(
                    "w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors",
                    activeTab === u.id.toString() ? "bg-slate-800 text-white" : "text-slate-400 hover:bg-slate-800/50 hover:text-slate-200"
                  )}
                >
                  <div className="relative shrink-0">
                    <img 
                      src={u.avatar_url || `https://api.dicebear.com/7.x/avataaars/svg?seed=${u.username}`} 
                      className="w-8 h-8 rounded-full bg-slate-800" 
                    />
                    <div className={twMerge(
                      "absolute -bottom-0.5 -right-0.5 w-3 h-3 border-2 border-slate-950 rounded-full",
                      isOnline ? "bg-indigo-500" : "bg-slate-600"
                    )} />
                  </div>
                  <div className="flex flex-col items-start min-w-0 flex-1">
                    <span 
                      className={twMerge("truncate w-full text-left", unreadCount > 0 && activeTab !== u.id.toString() ? "font-bold text-white" : "")}
                      style={{ 
                        color: u.color || undefined,
                        textShadow: u.glow ? `0 0 8px ${u.color || '#fff'}` : 'none'
                      }}
                    >
                      {u.displayName || u.username}
                    </span>
                  </div>
                  {unreadCount > 0 && activeTab !== u.id.toString() && (
                    <div className="bg-indigo-500 text-white text-[10px] font-bold px-1.5 py-0.5 rounded-full min-w-[1.25rem] text-center">
                      {unreadCount > 99 ? '99+' : unreadCount}
                    </div>
                  )}
                </button>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    setClosedDMs([...closedDMs, u.id]);
                    if (activeTab === u.id.toString()) {
                      setActiveTab('main');
                    }
                  }}
                  className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-slate-500 hover:text-slate-300 hover:bg-slate-700 rounded opacity-0 group-hover:opacity-100 transition-opacity"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            );
          })}
        </div>
      </div>
      </div>
      
      {inVoice && (
        <div className="px-3 py-3 bg-slate-900/50 border-t border-slate-800/50 flex flex-col gap-2">
          <div className="flex items-center justify-between px-1">
            <div className="flex items-center gap-2 text-indigo-400">
              <Signal className="w-3 h-3" />
              <span className="text-xs font-medium">Voice Connected</span>
            </div>
            <span className={clsx("text-xs font-medium", ping < 50 ? "text-indigo-400" : ping < 150 ? "text-yellow-400" : "text-red-400")}>{ping} ms</span>
          </div>
          <div className="flex items-center justify-between">
            <div className="flex gap-1">
              <button onClick={() => setIsMuted(!isMuted)} className={clsx("p-2 rounded-lg transition-colors", isMuted ? "bg-red-500/20 text-red-400" : "hover:bg-slate-800 text-slate-400")} title={isMuted ? "Unmute" : "Mute"}>
                {isMuted ? <MicOff className="w-4 h-4" /> : <Mic className="w-4 h-4" />}
              </button>
              <button onClick={() => setIsDeafened(!isDeafened)} className={clsx("p-2 rounded-lg transition-colors", isDeafened ? "bg-red-500/20 text-red-400" : "hover:bg-slate-800 text-slate-400")} title={isDeafened ? "Undeafen" : "Deafen"}>
                {isDeafened ? <Headphones className="w-4 h-4" /> : <Volume2 className="w-4 h-4" />}
              </button>
              <button 
                onClick={() => setIsKrispEnabled(!isKrispEnabled)} 
                className={clsx(
                  "p-2 rounded-lg transition-colors", 
                  isKrispEnabled ? "bg-emerald-500/20 text-emerald-400" : "hover:bg-slate-800 text-slate-400"
                )}
                title={isKrispEnabled ? "Disable Krisp Noise Suppression" : "Enable Krisp Noise Suppression"}
              >
                <Zap className={clsx("w-4 h-4", isKrispEnabled && "fill-emerald-400/20")} />
              </button>
              <button 
                onClick={() => useStore.getState().refreshAudio()} 
                className="p-2 rounded-lg hover:bg-slate-800 text-slate-400 transition-colors"
                title="Fix Audio (Reset Connection)"
              >
                <Signal className="w-4 h-4" />
              </button>
              <button 
                onClick={() => onOpenScreenshare('screen')} 
                className={clsx(
                  "p-2 rounded-lg transition-colors", 
                  videoStreams[user?.id || 0] === 'screen' ? "bg-red-500 text-white" : "hover:bg-slate-800 text-slate-400"
                )} 
                title={videoStreams[user?.id || 0] === 'screen' ? "Stop Sharing" : "Share Screen"}
              >
                {videoStreams[user?.id || 0] === 'screen' ? <X className="w-4 h-4" /> : <Monitor className="w-4 h-4" />}
              </button>
              <button 
                onClick={() => onOpenScreenshare('camera')} 
                className={clsx(
                  "p-2 rounded-lg transition-colors", 
                  videoStreams[user?.id || 0] === 'camera' ? "bg-red-500 text-white" : "hover:bg-slate-800 text-slate-400"
                )} 
                title={videoStreams[user?.id || 0] === 'camera' ? "Stop Sharing" : "Share Camera"}
              >
                {videoStreams[user?.id || 0] === 'camera' ? <X className="w-4 h-4" /> : <Video className="w-4 h-4" />}
              </button>
            </div>
            <button onClick={leaveVoice} className="p-2 rounded-lg hover:bg-red-500/20 text-red-400 transition-colors" title="Disconnect">
              <PhoneOff className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

      <div className="p-4 border-t border-slate-800 bg-slate-950">
        <div className="flex items-center gap-3 mb-4">
          <img src={user?.avatar_url || `https://api.dicebear.com/7.x/avataaars/svg?seed=${user?.username}`} className="w-10 h-10 rounded-full bg-slate-800" />
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-white truncate">{user?.displayName || user?.username}</p>
            <p className="text-xs text-slate-500 truncate">{user?.isAdmin ? 'Administrator' : 'Member'}</p>
          </div>
          <button onClick={() => setShowSettings(true)} className="p-2 text-slate-400 hover:text-white hover:bg-slate-800 rounded-lg transition-colors">
            <Settings className="w-4 h-4" />
          </button>
        </div>
        
        <div className="flex gap-2">
          {user?.isAdmin && (
            <button className="flex-1 flex items-center justify-center gap-2 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg text-xs font-medium transition-colors">
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
          onOpenProfile={() => setProfileModalUserId(contextMenu.userId)}
          onClose={() => setContextMenu(null)} 
        />
      )}

      {profileModalUserId && (
        <UserProfileModal 
          userId={profileModalUserId} 
          onClose={() => setProfileModalUserId(null)} 
        />
      )}
    </div>
  );
}
