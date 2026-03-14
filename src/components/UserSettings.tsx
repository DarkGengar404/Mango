import React, { useState, useEffect } from 'react';
import { useStore } from '../store';
import { X, User, Mic, Volume2, Sliders } from 'lucide-react';
import { twMerge } from 'tailwind-merge';

export function UserSettings({ onClose }: { onClose: () => void }) {
  const { user, token, selectedInputDevice, selectedOutputDevice, setSelectedInputDevice, setSelectedOutputDevice, noiseSuppressionLevel, setNoiseSuppressionLevel, inputGain, setInputGain } = useStore();
  const [activeTab, setActiveTab] = useState<'profile' | 'voice'>('profile');
  const [displayName, setDisplayName] = useState(user?.displayName || user?.username || '');
  const [avatarUrl, setAvatarUrl] = useState(user?.avatar_url || '');
  const [color, setColor] = useState(user?.color || '#ffffff');
  const [glow, setGlow] = useState(user?.glow || false);
  const [devices, setDevices] = useState<MediaDeviceInfo[]>([]);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  useEffect(() => {
    navigator.mediaDevices.enumerateDevices().then(setDevices).catch(console.error);
  }, []);

  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSuccess('');

    try {
      const res = await fetch('/api/users/me', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ display_name: displayName, avatar_url: avatarUrl, color, glow })
      });

      const contentType = res.headers.get('content-type');
      if (!contentType || !contentType.includes('application/json')) {
        throw new Error(`Server returned an invalid response (${res.status} ${res.statusText}). Please try again.`);
      }

      let data;
      try {
        data = await res.json();
      } catch (e) {
        throw new Error('Failed to parse server response. Please try again.');
      }

      if (!res.ok) {
        throw new Error(data.error || 'Failed to update profile');
      }

      // Update local store
      useStore.setState((state) => ({
        user: state.user ? {
          ...state.user,
          displayName,
          avatar_url: avatarUrl,
          color,
          glow
        } : null
      }));

      setSuccess('Profile updated successfully!');
    } catch (err: any) {
      setError(err.message);
    }
  };

  const audioInputs = devices.filter(d => d.kind === 'audioinput');
  const audioOutputs = devices.filter(d => d.kind === 'audiooutput');

  return (
    <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4">
      <div className="bg-zinc-900 rounded-2xl w-full max-w-2xl flex overflow-hidden shadow-2xl border border-zinc-800 h-[500px]">
        
        {/* Sidebar */}
        <div className="w-48 bg-zinc-950 p-4 border-r border-zinc-800 flex flex-col gap-2">
          <h2 className="text-xs font-bold text-zinc-500 uppercase tracking-wider mb-2 px-2">Settings</h2>
          <button
            onClick={() => setActiveTab('profile')}
            className={twMerge("flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors text-left", activeTab === 'profile' ? "bg-zinc-800 text-white" : "text-zinc-400 hover:bg-zinc-800/50 hover:text-zinc-200")}
          >
            <User className="w-4 h-4" />
            Profile
          </button>
          <button
            onClick={() => setActiveTab('voice')}
            className={twMerge("flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors text-left", activeTab === 'voice' ? "bg-zinc-800 text-white" : "text-zinc-400 hover:bg-zinc-800/50 hover:text-zinc-200")}
          >
            <Mic className="w-4 h-4" />
            Voice & Video
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 flex flex-col relative">
          <button onClick={onClose} className="absolute top-4 right-4 p-2 text-zinc-400 hover:text-white hover:bg-zinc-800 rounded-full transition-colors">
            <X className="w-5 h-5" />
          </button>

          <div className="p-8 flex-1 overflow-y-auto">
            {activeTab === 'profile' && (
              <div className="max-w-md">
                <h3 className="text-xl font-bold text-white mb-6">My Profile</h3>
                
                {error && <div className="bg-red-500/10 border border-red-500/50 text-red-400 p-3 rounded-lg mb-6 text-sm">{error}</div>}
                {success && <div className="bg-emerald-500/10 border border-emerald-500/50 text-emerald-400 p-3 rounded-lg mb-6 text-sm">{success}</div>}

                <form onSubmit={handleSaveProfile} className="space-y-6">
                  <div>
                    <label className="block text-sm font-medium text-zinc-400 mb-2">Display Name</label>
                    <input
                      type="text"
                      value={displayName}
                      onChange={(e) => setDisplayName(e.target.value)}
                      className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-4 py-2.5 text-white focus:outline-none focus:ring-2 focus:ring-orange-500"
                      required
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-zinc-400 mb-2">Avatar URL (Optional)</label>
                    <input
                      type="url"
                      value={avatarUrl}
                      onChange={(e) => setAvatarUrl(e.target.value)}
                      placeholder="https://example.com/avatar.png"
                      className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-4 py-2.5 text-white focus:outline-none focus:ring-2 focus:ring-orange-500"
                    />
                  </div>
                  
                  <div className="flex gap-6">
                    <div className="flex-1">
                      <label className="block text-sm font-medium text-zinc-400 mb-2">Username Color</label>
                      <div className="flex items-center gap-3">
                        <input
                          type="color"
                          value={color}
                          onChange={(e) => setColor(e.target.value)}
                          className="w-10 h-10 rounded cursor-pointer bg-zinc-950 border border-zinc-800"
                        />
                        <input
                          type="text"
                          value={color}
                          onChange={(e) => setColor(e.target.value)}
                          className="flex-1 bg-zinc-950 border border-zinc-800 rounded-lg px-4 py-2 text-white focus:outline-none focus:ring-2 focus:ring-orange-500 font-mono text-sm uppercase"
                        />
                      </div>
                    </div>
                    
                    <div className="flex items-center gap-3 pt-7">
                      <label className="relative inline-flex items-center cursor-pointer">
                        <input 
                          type="checkbox" 
                          checked={glow}
                          onChange={(e) => setGlow(e.target.checked)}
                          className="sr-only peer" 
                        />
                        <div className="w-11 h-6 bg-zinc-800 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-zinc-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-orange-600"></div>
                        <span className="ml-3 text-sm font-medium text-zinc-400">Glow Effect</span>
                      </label>
                    </div>
                  </div>

                  <div className="p-4 bg-zinc-950 rounded-lg border border-zinc-800">
                    <p className="text-xs text-zinc-500 mb-2 uppercase tracking-wider font-semibold">Preview</p>
                    <span 
                      className="font-medium text-[15px]" 
                      style={{ 
                        color: color,
                        textShadow: glow ? `0 0 8px ${color}` : 'none'
                      }}
                    >
                      {displayName || 'Display Name'}
                    </span>
                  </div>

                  <button type="submit" className="bg-orange-600 hover:bg-orange-700 text-white font-medium py-2 px-6 rounded-lg transition-colors">
                    Save Changes
                  </button>
                </form>
              </div>
            )}

            {activeTab === 'voice' && (
              <div className="max-w-md">
                <h3 className="text-xl font-bold text-white mb-6">Voice Settings</h3>
                
                <div className="space-y-6">
                  <div>
                    <label className="block text-sm font-medium text-zinc-400 mb-2 flex items-center gap-2">
                      <Mic className="w-4 h-4" /> Input Device
                    </label>
                    <select
                      value={selectedInputDevice}
                      onChange={(e) => setSelectedInputDevice(e.target.value)}
                      className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-4 py-2.5 text-white focus:outline-none focus:ring-2 focus:ring-orange-500"
                    >
                      <option value="">Default</option>
                      {audioInputs.map(d => (
                        <option key={d.deviceId} value={d.deviceId}>{d.label || `Microphone ${d.deviceId.slice(0, 5)}`}</option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-zinc-400 mb-2 flex items-center gap-2">
                      <Volume2 className="w-4 h-4" /> Output Device
                    </label>
                    <select
                      value={selectedOutputDevice}
                      onChange={(e) => setSelectedOutputDevice(e.target.value)}
                      className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-4 py-2.5 text-white focus:outline-none focus:ring-2 focus:ring-orange-500"
                    >
                      <option value="">Default</option>
                      {audioOutputs.map(d => (
                        <option key={d.deviceId} value={d.deviceId}>{d.label || `Speaker ${d.deviceId.slice(0, 5)}`}</option>
                      ))}
                    </select>
                  </div>

                  <div className="space-y-4 pt-4 border-t border-zinc-800">
                    <h4 className="text-sm font-semibold text-zinc-300 flex items-center gap-2">
                      <Sliders className="w-4 h-4" /> Audio Processing
                    </h4>
                    
                    <div>
                      <div className="flex items-center justify-between mb-2">
                        <label className="text-sm text-zinc-400">Input Gain</label>
                        <span className="text-xs text-zinc-500">{Math.round(inputGain * 100)}%</span>
                      </div>
                      <input 
                        type="range" 
                        min="0" 
                        max="2" 
                        step="0.01" 
                        value={inputGain}
                        onChange={(e) => setInputGain(parseFloat(e.target.value))}
                        className="w-full accent-orange-500"
                      />
                    </div>

                    <div>
                      <div className="flex items-center justify-between mb-2">
                        <label className="text-sm text-zinc-400">Noise Suppression Level</label>
                        <span className="text-xs text-zinc-500">{noiseSuppressionLevel}%</span>
                      </div>
                      <input 
                        type="range" 
                        min="0" 
                        max="100" 
                        step="1" 
                        value={noiseSuppressionLevel}
                        onChange={(e) => setNoiseSuppressionLevel(parseInt(e.target.value))}
                        className="w-full accent-orange-500"
                      />
                    </div>
                  </div>

                  <div className="pt-4 border-t border-zinc-800">
                    <p className="text-sm text-zinc-400">
                      Echo cancellation and automatic gain control are permanently enabled for the best voice quality.
                    </p>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
