import React, { useState } from 'react';
import { useStore } from '../store';
import { generateKeyPair, exportPublicKey } from '../lib/crypto';
import { Citrus } from 'lucide-react';

export function Auth() {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [isSignup, setIsSignup] = useState(false);
  const [registrationOpen, setRegistrationOpen] = useState(true);
  const [error, setError] = useState('');
  const { setUser, setKeyPair } = useStore();

  React.useEffect(() => {
    fetch('/api/settings')
      .then(res => res.json())
      .then(data => setRegistrationOpen(data.registrationOpen))
      .catch(err => console.error('Failed to fetch settings:', err));
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    try {
      const keyPair = await generateKeyPair();
      setKeyPair(keyPair);
      const publicKey = await exportPublicKey(keyPair.publicKey);

      const res = await fetch('/api/auth/enter', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password, publicKey, isSignup }),
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

      if (!res.ok) throw new Error(data.error || 'Authentication failed');

      setUser(data.user, data.token);
    } catch (err: any) {
      setError(err.message);
    }
  };

  return (
    <div className="min-h-screen bg-zinc-950 flex items-center justify-center p-4">
      <div className="w-full max-w-md bg-zinc-900 rounded-2xl shadow-2xl border border-zinc-800 p-8">
        <div className="flex justify-center mb-6">
          <div className="w-16 h-16 bg-orange-500/20 rounded-full flex items-center justify-center">
            <Citrus className="w-8 h-8 text-orange-500" />
          </div>
        </div>
        
        <h2 className="text-3xl font-bold text-white text-center mb-8 tracking-tight">
          Mango
        </h2>

        {error && (
          <div className="bg-red-500/10 border border-red-500/50 text-red-400 p-3 rounded-lg mb-6 text-sm">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-zinc-400 mb-1">Username</label>
            <input
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-4 py-2.5 text-white focus:outline-none focus:ring-2 focus:ring-orange-500"
              required
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-zinc-400 mb-1">Password</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-4 py-2.5 text-white focus:outline-none focus:ring-2 focus:ring-orange-500"
              required
            />
          </div>
          
          <button
            type="submit"
            className="w-full bg-gradient-to-r from-orange-500 to-amber-500 hover:from-orange-600 hover:to-amber-600 text-white font-medium py-2.5 rounded-lg transition-colors mt-6 shadow-lg shadow-orange-500/20"
          >
            {isSignup ? 'Create Account' : 'Enter Mango'}
          </button>
        </form>

        <div className="mt-6 text-center">
          <button
            onClick={() => setIsSignup(!isSignup)}
            className="text-sm text-zinc-400 hover:text-orange-500 transition-colors"
          >
            {isSignup ? 'Already have an account? Log in' : 'Don\'t have an account? Sign up'}
          </button>
        </div>

        {!registrationOpen && !isSignup && (
          <p className="mt-4 text-xs text-center text-zinc-500">
            Registration is currently closed.
          </p>
        )}
      </div>
    </div>
  );
}
