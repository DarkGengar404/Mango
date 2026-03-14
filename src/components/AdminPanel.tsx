import React, { useState } from 'react';
import { useStore } from '../store';
import { Shield, UserPlus, X } from 'lucide-react';
import { twMerge } from 'tailwind-merge';

export function AdminPanel({ onClose }: { onClose: () => void }) {
  const { token, users } = useStore();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [registrationOpen, setRegistrationOpen] = useState(true);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  React.useEffect(() => {
    fetch('/api/settings')
      .then(res => res.json())
      .then(data => setRegistrationOpen(data.registrationOpen))
      .catch(err => console.error('Failed to fetch settings:', err));
  }, []);

  const toggleRegistration = async () => {
    try {
      const res = await fetch('/api/admin/settings', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ registrationOpen: !registrationOpen })
      });
      if (res.ok) {
        setRegistrationOpen(!registrationOpen);
      }
    } catch (err) {
      console.error('Failed to update settings:', err);
    }
  };

  const handleCreateUser = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSuccess('');

    try {
      const res = await fetch('/api/admin/users', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ username, password })
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

      if (!res.ok) throw new Error(data.error || 'Failed to create user');

      setSuccess(`User ${data.user.username} created successfully.`);
      setUsername('');
      setPassword('');
    } catch (err: any) {
      setError(err.message);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4">
      <div className="bg-zinc-900 border border-zinc-800 rounded-2xl w-full max-w-md shadow-2xl overflow-hidden">
        <div className="p-4 border-b border-zinc-800 flex items-center justify-between bg-zinc-950/50">
          <div className="flex items-center gap-2">
            <Shield className="w-5 h-5 text-orange-400" />
            <h2 className="text-lg font-semibold text-white">Admin Control</h2>
          </div>
          <button onClick={onClose} className="text-zinc-400 hover:text-white transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-6">
          <div className="mb-6 space-y-3">
            <h3 className="text-sm font-medium text-zinc-400 mb-2">System Status</h3>
            <div className="bg-zinc-950 rounded-lg p-3 border border-zinc-800 flex justify-between items-center">
              <span className="text-sm text-zinc-300">Registered Users</span>
              <span className="text-sm font-mono text-orange-400">{users.length} / 10</span>
            </div>
            <div className="bg-zinc-950 rounded-lg p-3 border border-zinc-800 flex justify-between items-center">
              <span className="text-sm text-zinc-300">Public Registration</span>
              <button
                onClick={toggleRegistration}
                className={twMerge(
                  "px-3 py-1 rounded text-xs font-bold uppercase transition-colors",
                  registrationOpen ? "bg-emerald-500/20 text-emerald-400 hover:bg-emerald-500/30" : "bg-red-500/20 text-red-400 hover:bg-red-500/30"
                )}
              >
                {registrationOpen ? 'Open' : 'Closed'}
              </button>
            </div>
          </div>

          <form onSubmit={handleCreateUser} className="space-y-4">
            <h3 className="text-sm font-medium text-zinc-400 mb-2">Create New User</h3>
            
            {error && <div className="text-sm text-red-400 bg-red-400/10 p-2 rounded">{error}</div>}
            {success && <div className="text-sm text-emerald-400 bg-emerald-400/10 p-2 rounded">{success}</div>}

            <div>
              <input
                type="text"
                placeholder="Username"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-4 py-2 text-white focus:outline-none focus:ring-2 focus:ring-orange-500"
                required
              />
            </div>
            <div>
              <input
                type="password"
                placeholder="Password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-4 py-2 text-white focus:outline-none focus:ring-2 focus:ring-orange-500"
                required
              />
            </div>
            
            <button
              type="submit"
              disabled={users.length >= 10}
              className="w-full bg-orange-600 hover:bg-orange-700 disabled:opacity-50 disabled:hover:bg-orange-600 text-white font-medium py-2 rounded-lg transition-colors flex items-center justify-center gap-2"
            >
              <UserPlus className="w-4 h-4" />
              Create Account
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
