'use client';

import { signIn } from 'next-auth/react';
import { Activity } from 'lucide-react';
import { useState, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';

function SignInForm() {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const searchParams = useSearchParams();
  const callbackUrl = searchParams.get('callbackUrl') || '/';

  const handleLocalAdminLogin = (e: React.FormEvent) => {
    e.preventDefault();
    signIn('credentials', { username, password, callbackUrl });
  };

  return (
    <form onSubmit={handleLocalAdminLogin} className="space-y-4">
      <div>
        <label className="block text-sm font-medium text-text-secondary mb-1">Username</label>
        <input
          type="text"
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          className="input-field"
          placeholder="admin"
        />
      </div>
      <div>
        <label className="block text-sm font-medium text-text-secondary mb-1">Password</label>
        <input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="input-field"
        />
      </div>
      <button
        type="submit"
        className="w-full btn-primary flex justify-center py-2 px-4 shadow-sm text-sm font-medium"
      >
        Sign In
      </button>
    </form>
  );
}

export default function SignIn() {
  return (
    <div className="min-h-screen bg-background-primary flex flex-col justify-center py-12 sm:px-6 lg:px-8">
      <div className="sm:mx-auto sm:w-full sm:max-w-md">
        <div className="flex justify-center text-brand">
          <Activity className="w-12 h-12 animate-pulse" />
        </div>
        <h2 className="mt-6 text-center text-3xl font-extrabold tracking-tight text-gray-900">
          Sign in to Monserv
        </h2>
        <p className="mt-2 text-center text-xs text-text-secondary uppercase tracking-widest font-semibold">
          Admin Login
        </p>
      </div>

      <div className="mt-8 sm:mx-auto sm:w-full sm:max-w-md">
        <div className="glass-card py-8 px-4 sm:px-10">
          <Suspense fallback={<div className="text-brand text-center font-medium">Loading...</div>}>
            <SignInForm />
          </Suspense>
        </div>
      </div>
    </div>
  );
}
