'use client';
import AuthNotice from './AuthNotice';
import BrandMark from '@/components/BrandMark';

import { useState } from 'react';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { browserAuth } from '@/lib/supabase/client';
export default function AuthForm({ mode }: { mode: string }) {
  const search = useSearchParams(),
    [message, setMessage] = useState(''),
    [messageKind, setMessageKind] = useState<'success' | 'error' | 'info'>('success'),
    [busy, setBusy] = useState(false),
    [qr, setQr] = useState(''),
    [factor, setFactor] = useState('');
  const ready = Boolean(
    process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
  );
  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setMessage('');
    setMessageKind(mode === 'mfa' ? 'info' : 'success');
    try {
      if (!ready) throw new Error('Add Supabase credentials to .env to enable authentication.');
      const f = new FormData(e.currentTarget),
        client = browserAuth(),
        email = String(f.get('email') || ''),
        password = String(f.get('password') || '');
      let error: any;
      if (mode === 'register') {
        ({ error } = await client.auth.signUp({
          email,
          password,
          options: {
            data: {
              full_name: String(f.get('full_name')),
              preferred_role: search.get('role') || 'farmer',
            },
            emailRedirectTo: location.origin + '/auth/callback',
          },
        }));
        if (!error)
          setMessage(
            'Check your email to verify your account, then sign in and create your organization.',
          );
      } else if (mode === 'recover') {
        ({ error } = await client.auth.resetPasswordForEmail(email, {
          redirectTo: location.origin + '/auth/callback?next=/auth/reset',
        }));
        if (!error) setMessage('If the account exists, a recovery link has been sent.');
      } else if (mode === 'reset') {
        ({ error } = await client.auth.updateUser({ password }));
        if (!error) setMessage('Password updated. You can return to your workspace.');
      } else if (mode === 'mfa') {
        let fid = factor;
        if (!fid) {
          const { data: fs, error: fe } = await client.auth.mfa.listFactors();
          if (fe) throw fe;
          const existing = fs.totp.find((x) => x.status === 'verified');
          if (existing) {
            setFactor(existing.id);
            setMessage('Enter the code from your authenticator.');
            return;
          }
          const { data, error: ee } = await client.auth.mfa.enroll({
            factorType: 'totp',
            friendlyName: 'HarvestOS administrator',
          });
          if (ee) throw ee;
          setQr(data.totp.qr_code);
          setFactor(data.id);
          setMessage('Scan this QR code with your authenticator, then enter its six-digit code.');
          return;
        }
        ({ error } = await client.auth.mfa.challengeAndVerify({
          factorId: fid,
          code: String(f.get('code')),
        }));
        if (!error) location.assign('/workspace/super-admin');
      } else {
        ({ error } = await client.auth.signInWithPassword({ email, password }));
        if (!error) location.assign('/workspace/farmer');
      }
      if (error) throw error;
    } catch (err) {
      setMessageKind('error');
      setMessage(err instanceof Error ? err.message : 'Unable to complete authentication.');
    } finally {
      setBusy(false);
    }
  }
  return (
    <main id="main" className="auth-page">
      <aside>
        <Link className="brand" href="/">
          <BrandMark />
          HarvestOS
        </Link>
        <div>
          <span className="eyebrow">GROW BETTER CONNECTIONS</span>
          <h1>
            Good harvests.
            <br />
            Better possibilities.
          </h1>
          <p>
            One place to coordinate the people, produce and decisions that move agriculture forward.
          </p>
        </div>
        <small>Plateau State, Nigeria</small>
      </aside>
      <section>
        <Link href="/">Back to HarvestOS</Link>
        <h2>
          {{
            register: 'Create your account',
            recover: 'Recover your account',
            reset: 'Choose a new password',
            mfa: 'Secure administrator access',
          }[mode] || 'Welcome back'}
        </h2>
        <p>
          {mode === 'register'
            ? 'Start with your identity. Add an organization after verification.'
            : 'Sign in to your shared operations workspace.'}
        </p>
        {!ready && (
          <div className="notice">
            Local preview: authentication activates when you add your Supabase credentials.
          </div>
        )}
        <form onSubmit={submit}>
          {mode === 'register' && (
            <label>
              Full name
              <input name="full_name" required autoComplete="name" />
            </label>
          )}
          {!['reset', 'mfa'].includes(mode) && (
            <label>
              Email address
              <input name="email" type="email" required autoComplete="email" />
            </label>
          )}
          {!['recover', 'mfa'].includes(mode) && (
            <label>
              Password
              <input
                name="password"
                type="password"
                minLength={12}
                required
                autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
              />
              <small>Use at least 12 characters.</small>
            </label>
          )}
          {mode === 'mfa' && (
            <>
              {qr && <img className="qr" src={qr} alt="Authenticator enrollment QR code" />}
              {factor && (
                <label>
                  Authenticator code
                  <input
                    name="code"
                    inputMode="numeric"
                    pattern="[0-9]{6}"
                    required
                    autoComplete="one-time-code"
                  />
                </label>
              )}
            </>
          )}
          <button disabled={busy} className="button">
            {busy
              ? 'Working…'
              : mode === 'mfa'
                ? factor
                  ? 'Verify code'
                  : 'Set up or verify MFA'
                : mode === 'register'
                  ? 'Create account'
                  : mode === 'recover'
                    ? 'Send recovery link'
                    : mode === 'reset'
                      ? 'Update password'
                      : 'Sign in'}
          </button>
          <AuthNotice message={message} kind={messageKind} mode={mode} />
        </form>
        <div className="auth-links">
          <Link href="/auth/register">Create an account</Link>
          <Link href="/auth/recover">Forgot password?</Link>
          <Link href="/auth/mfa">Administrator MFA</Link>
          <Link href="/workspace/operations">Explore local preview</Link>
        </div>
      </section>
    </main>
  );
}
