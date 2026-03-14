import React, { useState } from 'react';
import { useStore } from '../store';
import { twMerge } from 'tailwind-merge';
import { UserContextMenu } from './UserContextMenu';

export function RightSidebar() {
  const { user, users, onlineUsers, setActiveTab } = useStore();
  const [contextMenu, setContextMenu] = useState<{ x: number, y: number, userId: number } | null>(null);

  const online = users.filter(u => onlineUsers.includes(u.id));
  const offline = users.filter(u => !onlineUsers.includes(u.id));

  const handleUserClick = (e: React.MouseEvent, userId: number) => {
    e.preventDefault();
    setContextMenu({ x: e.clientX, y: e.clientY, userId });
  };

  return (
    <div className="w-64 bg-zinc-950 border-l border-zinc-800 flex flex-col h-screen overflow-y-auto py-4">
      <div className="px-3 mb-6">
        <h3 className="text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-2 px-2">
          Online — {online.length}
        </h3>
        <div className="space-y-1">
          {online.map(u => (
            <div 
              key={u.id} 
              onClick={() => setActiveTab(u.id.toString())}
              onContextMenu={(e) => handleUserClick(e, u.id)}
              className="flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors hover:bg-zinc-800/50 cursor-pointer"
            >
              <div className="relative shrink-0">
                <img src={u.avatar_url || `https://api.dicebear.com/7.x/avataaars/svg?seed=${u.username}`} className="w-8 h-8 rounded-full bg-zinc-800" />
                <div className="absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full border-2 border-zinc-950 bg-emerald-500"></div>
              </div>
              <div className="flex flex-col min-w-0">
                <span 
                  className="truncate"
                  style={{ color: u.color || undefined, textShadow: u.glow ? `0 0 8px ${u.color || '#fff'}` : 'none' }}
                >
                  {u.displayName || u.username}
                </span>
                {u.displayName && u.displayName !== u.username && (
                  <span className="text-[10px] text-zinc-600 truncate">
                    @{u.username}
                  </span>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="px-3">
        <h3 className="text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-2 px-2">
          Offline — {offline.length}
        </h3>
        <div className="space-y-1">
          {offline.map(u => (
            <div 
              key={u.id} 
              onClick={() => setActiveTab(u.id.toString())}
              onContextMenu={(e) => handleUserClick(e, u.id)}
              className="flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors hover:bg-zinc-800/50 cursor-pointer opacity-50"
            >
              <div className="relative shrink-0">
                <img src={u.avatar_url || `https://api.dicebear.com/7.x/avataaars/svg?seed=${u.username}`} className="w-8 h-8 rounded-full bg-zinc-800" />
                <div className="absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full border-2 border-zinc-950 bg-zinc-500"></div>
              </div>
              <div className="flex flex-col min-w-0">
                <span 
                  className="truncate"
                  style={{ color: u.color || undefined, textShadow: u.glow ? `0 0 8px ${u.color || '#fff'}` : 'none' }}
                >
                  {u.displayName || u.username}
                </span>
                {u.displayName && u.displayName !== u.username && (
                  <span className="text-[10px] text-zinc-600 truncate">
                    @{u.username}
                  </span>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>

      {contextMenu && (
        <UserContextMenu
          position={{ x: contextMenu.x, y: contextMenu.y }}
          userId={contextMenu.userId}
          onClose={() => setContextMenu(null)}
        />
      )}
    </div>
  );
}
