import React, { useState, useRef, useEffect } from 'react';
import { useStore } from '../store';
import { MessageSquare, MicOff, Volume2, User as UserIcon } from 'lucide-react';
import { twMerge } from 'tailwind-merge';

export function UserContextMenu({ userId, onClose, position, isVoiceContext, isScreenContext, onOpenProfile }: { userId: number, onClose: () => void, position: { x: number, y: number }, isVoiceContext?: boolean, isScreenContext?: boolean, onOpenProfile?: () => void }) {
  const { users, setActiveTab, localMutes, setLocalMute, localVolumes, setLocalVolume, localScreenVolumes, setLocalScreenVolume, localScreenMutes, setLocalScreenMute, user: currentUser } = useStore();
  const menuRef = useRef<HTMLDivElement>(null);
  
  const user = users.find(u => u.id === userId);
  const isMuted = localMutes[userId] || false;
  const volume = localVolumes[userId] ?? 1;

  const isScreenMuted = localScreenMutes[userId] || false;
  const screenVolume = localScreenVolumes[userId] ?? 1;

  const [adjustedPosition, setAdjustedPosition] = useState(position);

  useEffect(() => {
    if (menuRef.current) {
      const rect = menuRef.current.getBoundingClientRect();
      const newPos = { ...position };
      
      // Ensure the menu stays within the viewport
      if (position.x + rect.width > window.innerWidth) {
        newPos.x = window.innerWidth - rect.width - 10;
      }
      if (position.y + rect.height > window.innerHeight) {
        newPos.y = window.innerHeight - rect.height - 10;
      }
      
      setAdjustedPosition(newPos);
    }
  }, [position]);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        onClose();
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [onClose]);

  if (!user) return null;

  return (
    <div 
      ref={menuRef}
      className="fixed z-50 w-56 bg-zinc-900 border border-zinc-800 rounded-lg shadow-xl overflow-hidden"
      style={{ top: adjustedPosition.y, left: adjustedPosition.x }}
    >
      <div className="p-3 border-b border-zinc-800 bg-zinc-950/50">
        <div className="flex items-center gap-3">
          <img src={user.avatar_url || `https://api.dicebear.com/7.x/avataaars/svg?seed=${user.username}`} className="w-10 h-10 rounded-full bg-zinc-800" />
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <p className="text-sm font-medium text-white truncate" style={{
                color: user.color || '#fff',
                textShadow: user.glow ? `0 0 8px ${user.color || '#fff'}` : 'none'
              }}>{user.displayName || user.username}</p>
            </div>
            <p className="text-xs text-zinc-500 truncate">{user.isAdmin ? 'Admin' : 'Member'}</p>
          </div>
        </div>
      </div>

      <div className="p-1">
        {currentUser?.id !== userId && (
          <button 
            onClick={() => {
              setActiveTab(userId.toString());
              onClose();
            }}
            className="w-full flex items-center gap-3 px-3 py-2 text-sm text-zinc-300 hover:text-white hover:bg-orange-600 rounded-md transition-colors"
          >
            <MessageSquare className="w-4 h-4" />
            Message
          </button>
        )}
        
        <button 
          onClick={() => {
            if (onOpenProfile) onOpenProfile();
            onClose();
          }}
          className="w-full flex items-center gap-3 px-3 py-2 text-sm text-zinc-300 hover:text-white hover:bg-zinc-800 rounded-md transition-colors"
        >
          <UserIcon className="w-4 h-4" />
          Profile
        </button>
        
        {isVoiceContext && currentUser?.id !== userId && (
          <>
            <div className="my-1 border-t border-zinc-800"></div>
            
            <button 
              onClick={() => setLocalMute(userId, !isMuted)}
              className="w-full flex items-center justify-between px-3 py-2 text-sm text-zinc-300 hover:text-white hover:bg-zinc-800 rounded-md transition-colors"
            >
              <div className="flex items-center gap-3">
                <MicOff className="w-4 h-4" />
                Mute
              </div>
              <div className={twMerge("w-8 h-4 rounded-full transition-colors relative", isMuted ? "bg-emerald-500" : "bg-zinc-700")}>
                <div className={twMerge("absolute top-0.5 w-3 h-3 bg-white rounded-full transition-all", isMuted ? "left-4.5" : "left-0.5")}></div>
              </div>
            </button>

            <div className="px-3 py-2">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-medium text-zinc-400">User Volume</span>
                <span className="text-xs text-zinc-500">{Math.round(volume * 100)}%</span>
              </div>
              <input 
                type="range" 
                min="0" 
                max="2" 
                step="0.01" 
                value={volume}
                onChange={(e) => {
                  const val = parseFloat(e.target.value);
                  if (!isNaN(val)) {
                    setLocalVolume(userId, val);
                  }
                }}
                className="w-full accent-orange-500"
              />
            </div>
          </>
        )}

        {isScreenContext && currentUser?.id !== userId && (
          <>
            <div className="my-1 border-t border-zinc-800"></div>
            
            <button 
              onClick={() => setLocalScreenMute(userId, !isScreenMuted)}
              className="w-full flex items-center justify-between px-3 py-2 text-sm text-zinc-300 hover:text-white hover:bg-zinc-800 rounded-md transition-colors"
            >
              <div className="flex items-center gap-3">
                <Volume2 className="w-4 h-4" />
                Mute Stream
              </div>
              <div className={twMerge("w-8 h-4 rounded-full transition-colors relative", isScreenMuted ? "bg-emerald-500" : "bg-zinc-700")}>
                <div className={twMerge("absolute top-0.5 w-3 h-3 bg-white rounded-full transition-all", isScreenMuted ? "left-4.5" : "left-0.5")}></div>
              </div>
            </button>

            <div className="px-3 py-2">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-medium text-zinc-400">Stream Volume</span>
                <span className="text-xs text-zinc-500">{Math.round(screenVolume * 100)}%</span>
              </div>
              <input 
                type="range" 
                min="0" 
                max="1" 
                step="0.01" 
                value={screenVolume}
                onChange={(e) => {
                  const val = parseFloat(e.target.value);
                  if (!isNaN(val)) {
                    setLocalScreenVolume(userId, val);
                  }
                }}
                className="w-full accent-orange-500"
              />
            </div>
          </>
        )}
      </div>
    </div>
  );
}
