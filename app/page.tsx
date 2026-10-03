'use client';
import { FormEvent, useState } from 'react';
import { useRouter } from 'next/navigation';

export default function Login() {
  const router = useRouter();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError('');

    const response = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ username, password }),
    });

    if (response.ok) {
      router.push('/admin');
    } else {
      setError('Invalid username or password');
    }

    setBusy(false);
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-gradient-to-br from-slate-100 via-white to-teal-50 p-4">
      <form
        className="w-full max-w-md space-y-5 rounded-3xl border border-slate-200 bg-white p-7 shadow-xl shadow-slate-900/5 sm:p-9"
        onSubmit={submit}
      >
        <div className="flex items-center gap-4">
          <img
            className="h-14 w-14 rounded-2xl object-cover"
            src="/smark-mart-icon.png"
            alt="Smark Mart"
          />
          <div>
            <h1 className="text-2xl font-black tracking-tight text-slate-950">
              Smark Mart
            </h1>
            <p className="mt-1 text-sm font-medium text-teal-700">
              Shop Smart • Live Simple
            </p>
          </div>
        </div>

        <div>
          <h2 className="text-lg font-bold text-slate-800">
            Admin &amp; Dispatch Console
          </h2>
          <p className="mt-1 text-sm text-slate-500">
            Sign in to manage store operations.
          </p>
        </div>

        <label className="block space-y-1.5 text-sm font-semibold text-slate-700">
          Username
          <input
            className="w-full rounded-xl border border-slate-300 px-3.5 py-3 font-normal outline-none transition focus:border-teal-600 focus:ring-4 focus:ring-teal-600/10"
            value={username}
            onChange={(event) => setUsername(event.target.value)}
            autoComplete="username"
          />
        </label>

        <label className="block space-y-1.5 text-sm font-semibold text-slate-700">
          Password
          <input
            className="w-full rounded-xl border border-slate-300 px-3.5 py-3 font-normal outline-none transition focus:border-teal-600 focus:ring-4 focus:ring-teal-600/10"
            type="password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            autoComplete="current-password"
          />
        </label>

        {error && (
          <div
            className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-medium text-red-800"
            role="alert"
          >
            {error}
          </div>
        )}

        <button
          className="w-full rounded-xl bg-teal-700 px-4 py-3 font-bold text-white transition hover:bg-teal-800 disabled:cursor-not-allowed disabled:opacity-55"
          disabled={busy}
        >
          {busy ? 'Signing in…' : 'Sign in'}
        </button>

        <p className="text-center text-xs leading-relaxed text-slate-500">
          App-level admin login. Firebase Authentication is not used for admin.
        </p>
      </form>
    </main>
  );
}
