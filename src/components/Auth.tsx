import React, { useState, useEffect } from 'react';
import { useStore } from '../store';
import { generateKeyPair, exportPublicKey } from '../lib/crypto';
import { loadKeyPair, saveKeyPair } from '../lib/db';
import { Citrus } from 'lucide-react';

export function Auth() {
  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [confirmEmail, setConfirmEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [isSignup, setIsSignup] = useState(false);
  const [isForgotPassword, setIsForgotPassword] = useState(false);
  const [resetToken, setResetToken] = useState('');
  const [registrationOpen, setRegistrationOpen] = useState(true);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const { setUser, setKeyPair } = useStore();

  useEffect(() => {
    fetch('/api/settings')
      .then(res => res.json())
      .then(data => setRegistrationOpen(data.registrationOpen))
      .catch(err => console.error('Failed to fetch settings:', err));
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setMessage('');

    if (isSignup) {
      if (email !== confirmEmail) {
        setError('Emails do not match');
        return;
      }
      if (password !== confirmPassword) {
        setError('Passwords do not match');
        return;
      }
    }

    if (isForgotPassword) {
      // ... (rest of forgot password logic)
      if (resetToken) {
        try {
          const res = await fetch('/api/auth/reset-password', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ token: resetToken, password }),
          });
          const data = await res.json();
          if (!res.ok) throw new Error(data.error || 'Reset failed');
          setMessage('Password reset successful! You can now log in.');
          setIsForgotPassword(false);
          setResetToken('');
        } catch (err: any) {
          setError(err.message);
        }
      } else {
        try {
          const res = await fetch('/api/auth/request-reset', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email }),
          });
          const data = await res.json();
          setMessage(data.message);
          if (data.debugToken) {
            console.log('DEBUG: Reset token is', data.debugToken);
          }
        } catch (err: any) {
          setError(err.message);
        }
      }
      return;
    }

    try {
      let keyPair = await loadKeyPair();
      if (!keyPair) {
        keyPair = await generateKeyPair();
        await saveKeyPair(keyPair);
      }
      setKeyPair(keyPair);
      const publicKey = await exportPublicKey(keyPair.publicKey);

      const res = await fetch('/api/auth/enter', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, email, password, publicKey, isSignup }),
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

        {message && (
          <div className="bg-emerald-500/10 border border-emerald-500/50 text-emerald-400 p-3 rounded-lg mb-6 text-sm">
            {message}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          {!isForgotPassword && (
            <div>
              <label className="block text-sm font-medium text-zinc-400 mb-1">
                {isSignup ? 'Username' : 'Username or Email'}
              </label>
              <input
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-4 py-2.5 text-white focus:outline-none focus:ring-2 focus:ring-orange-500"
                required={!isForgotPassword}
              />
            </div>
          )}

          {(isSignup || isForgotPassword) && (
            <div>
              <label className="block text-sm font-medium text-zinc-400 mb-1">Email</label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-4 py-2.5 text-white focus:outline-none focus:ring-2 focus:ring-orange-500"
                required
              />
            </div>
          )}

          {isSignup && (
            <div>
              <label className="block text-sm font-medium text-zinc-400 mb-1">Confirm Email</label>
              <input
                type="email"
                value={confirmEmail}
                onChange={(e) => setConfirmEmail(e.target.value)}
                className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-4 py-2.5 text-white focus:outline-none focus:ring-2 focus:ring-orange-500"
                required
              />
            </div>
          )}

          {isForgotPassword && resetToken && (
            <div>
              <label className="block text-sm font-medium text-zinc-400 mb-1">Reset Token</label>
              <input
                type="text"
                value={resetToken}
                onChange={(e) => setResetToken(e.target.value)}
                className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-4 py-2.5 text-white focus:outline-none focus:ring-2 focus:ring-orange-500"
                required
              />
            </div>
          )}

          {(!isForgotPassword || resetToken) && (
            <>
              <div>
                <label className="block text-sm font-medium text-zinc-400 mb-1">
                  {isForgotPassword ? 'New Password' : 'Password'}
                </label>
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-4 py-2.5 text-white focus:outline-none focus:ring-2 focus:ring-orange-500"
                  required
                />
              </div>
              {isSignup && (
                <div>
                  <label className="block text-sm font-medium text-zinc-400 mb-1">Confirm Password</label>
                  <input
                    type="password"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-4 py-2.5 text-white focus:outline-none focus:ring-2 focus:ring-orange-500"
                    required
                  />
                </div>
              )}
            </>
          )}
          
          <button
            type="submit"
            className="w-full bg-gradient-to-r from-orange-500 to-amber-500 hover:from-orange-600 hover:to-amber-600 text-white font-medium py-2.5 rounded-lg transition-colors mt-6 shadow-lg shadow-orange-500/20"
          >
            {isForgotPassword ? (resetToken ? 'Reset Password' : 'Send Reset Link') : (isSignup ? 'Create Account' : 'Enter Mango')}
          </button>
        </form>

        <div className="mt-6 flex flex-col gap-2 text-center">
          {!isForgotPassword && (
            <button
              onClick={() => {
                setIsSignup(!isSignup);
                setError('');
                setMessage('');
              }}
              className="text-sm text-zinc-400 hover:text-orange-500 transition-colors"
            >
              {isSignup ? 'Already have an account? Log in' : 'Don\'t have an account? Sign up'}
            </button>
          )}
          
          {!isSignup && (
            <button
              onClick={() => {
                setIsForgotPassword(!isForgotPassword);
                setError('');
                setMessage('');
              }}
              className="text-sm text-zinc-400 hover:text-orange-500 transition-colors"
            >
              {isForgotPassword ? 'Back to login' : 'Forgot password?'}
            </button>
          )}
        </div>

        {!registrationOpen && !isSignup && !isForgotPassword && (
          <p className="mt-4 text-xs text-center text-zinc-500">
            Registration is currently closed.
          </p>
        )}
      </div>
    </div>
  );
}
