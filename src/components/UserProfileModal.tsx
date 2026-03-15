import React from 'react';
import { X, MessageSquare } from 'lucide-react';
import { useStore } from '../store';

export function UserProfileModal({ userId, onClose }: { userId: number, onClose: () => void }) {
  const { users, user: currentUser, setActiveTab } = useStore();
  const user = users.find(u => u.id === userId);

  if (!user) return null;

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-zinc-900 rounded-2xl w-full max-w-sm overflow-hidden shadow-2xl border border-zinc-800">
        <div className="h-24 bg-zinc-800 relative">
          <button 
            onClick={onClose}
            className="absolute top-4 right-4 p-1 bg-black/20 hover:bg-black/40 rounded-full text-white transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>
        
        <div className="px-6 pb-6 relative">
          <img 
            src={user.avatar_url || `https://api.dicebear.com/7.x/avataaars/svg?seed=${user.username}`} 
            alt="avatar" 
            className="w-20 h-20 rounded-full border-4 border-zinc-900 bg-zinc-800 absolute -top-10"
          />
          
          <div className="pt-12">
            <h2 
              className="text-xl font-bold text-white"
              style={{ 
                color: user.color || '#fff',
                textShadow: user.glow ? `0 0 8px ${user.color || '#fff'}` : 'none'
              }}
            >
              {user.displayName || user.username}
            </h2>
            {user.displayName && user.displayName !== user.username && (
              <p className="text-sm text-zinc-400">@{user.username}</p>
            )}
            
            <div className="mt-4 flex gap-2">
              <span className="px-2 py-1 bg-zinc-800 text-zinc-300 text-xs rounded-md font-medium">
                {user.isAdmin ? 'Admin' : 'Member'}
              </span>
            </div>

            <div className="mt-6 pt-6 border-t border-zinc-800">
              <h3 className="text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-2">About Me</h3>
              <p className="text-sm text-zinc-300 whitespace-pre-wrap">
                {user.bio || "This user hasn't added a bio yet."}
              </p>
            </div>

            {currentUser?.id !== user.id && (
              <div className="mt-6">
                <button
                  onClick={() => {
                    setActiveTab(user.id.toString());
                    onClose();
                  }}
                  className="w-full flex items-center justify-center gap-2 bg-orange-600 hover:bg-orange-700 text-white font-medium py-2.5 rounded-lg transition-colors"
                >
                  <MessageSquare className="w-4 h-4" />
                  Send Message
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
