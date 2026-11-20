import { useEffect, useState, type FormEvent } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import {
  ArrowLeft,
  CheckCircle2,
  Eye,
  EyeOff,
  KeyRound,
  Lock,
  LogIn,
  Mail,
  ShieldCheck,
  User,
  UserPlus,
} from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';

export type AuthPageMode = 'login' | 'register' | 'forgot';

interface AuthPagesProps {
  mode: AuthPageMode;
  onSwitchMode: (mode: AuthPageMode) => void;
  onSuccess: () => void;
  onBackToList: () => void;
}

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function AuthPages({ mode, onSwitchMode, onSuccess, onBackToList }: AuthPagesProps) {
  const { signInWithEmail, registerWithEmail, sendResetEmail, signInWithGoogle } = useAuth();

  const [displayName, setDisplayName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  const [submitting, setSubmitting] = useState(false);
  const [googleSubmitting, setGoogleSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  useEffect(() => {
    setErrorMsg(null);
    setSuccessMsg(null);
    setPassword('');
    setConfirmPassword('');
    setShowPassword(false);
    setShowConfirmPassword(false);
  }, [mode]);

  const hasMinLen = password.length >= 8;
  const hasLetter = /[a-zA-Z]/.test(password);
  const hasNumber = /\d/.test(password);
  const passwordsMatch = password.length > 0 && password === confirmPassword;

  const handleLogin = async (e: FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    setSuccessMsg(null);

    const trimmedEmail = email.trim();
    if (!EMAIL_REGEX.test(trimmedEmail)) {
      setErrorMsg('Please enter a valid email address.');
      return;
    }
    if (password.length < 1) {
      setErrorMsg('Please enter your password.');
      return;
    }

    setSubmitting(true);
    try {
      await signInWithEmail(trimmedEmail, password);
      onSuccess();
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Unable to sign in.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleRegister = async (e: FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    setSuccessMsg(null);

    const trimmedName = displayName.trim();
    const trimmedEmail = email.trim();

    if (trimmedName.length < 2 || trimmedName.length > 40) {
      setErrorMsg('Display name must be between 2 and 40 characters.');
      return;
    }
    if (!EMAIL_REGEX.test(trimmedEmail) || trimmedEmail.length > 120) {
      setErrorMsg('Please enter a valid email address.');
      return;
    }
    if (!hasMinLen || !hasLetter || !hasNumber) {
      setErrorMsg('Password must be at least 8 characters and include both letters and numbers.');
      return;
    }
    if (!passwordsMatch) {
      setErrorMsg('Passwords do not match.');
      return;
    }

    setSubmitting(true);
    try {
      const result = await registerWithEmail(trimmedName, trimmedEmail, password);
      if (result.verificationSent) {
        setSuccessMsg(
          `Account created! We sent a verification link to ${trimmedEmail}. Verify your email to sync your alert settings across devices.`
        );
      } else {
        setSuccessMsg('Account created! You are now signed in.');
      }
      setTimeout(() => {
        onSuccess();
      }, 1400);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Unable to create account.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleForgot = async (e: FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    setSuccessMsg(null);

    const trimmedEmail = email.trim();
    if (!EMAIL_REGEX.test(trimmedEmail)) {
      setErrorMsg('Please enter the email address associated with your account.');
      return;
    }

    setSubmitting(true);
    try {
      await sendResetEmail(trimmedEmail);
      setSuccessMsg(
        `If an account exists for ${trimmedEmail}, a password reset email has been dispatched. Check your inbox and spam folder.`
      );
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Could not send reset email.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleGoogleSignIn = async () => {
    setErrorMsg(null);
    setSuccessMsg(null);
    setGoogleSubmitting(true);
    try {
      await signInWithGoogle();
      onSuccess();
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Google Sign-In failed.');
    } finally {
      setGoogleSubmitting(false);
    }
  };

  return (
    <div className="mx-auto flex w-full max-w-md flex-col py-4 sm:py-8">
      <div className="mb-5 flex items-center justify-between">
        <motion.button
          type="button"
          whileTap={{ scale: 0.97 }}
          onClick={onBackToList}
          className="inline-flex items-center gap-2 rounded-lg border border-white/[0.08] bg-[#10131C] px-3 py-1.5 text-xs font-medium text-slate-300 transition-colors hover:bg-[#171C29] hover:text-white"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          Back to Demonlist
        </motion.button>

        <div className="inline-flex items-center gap-1.5 text-xs font-medium text-emerald-400">
          <ShieldCheck className="h-3.5 w-3.5" />
          <span>Encrypted Auth</span>
        </div>
      </div>

      {/* Mode Switcher Tabs */}
      <div className="mb-5 grid grid-cols-3 gap-1 rounded-xl border border-white/[0.08] bg-[#10131C] p-1">
        {(
          [
            { id: 'login', label: 'Sign In' },
            { id: 'register', label: 'Register' },
            { id: 'forgot', label: 'Reset' },
          ] as const
        ).map((tab) => {
          const active = mode === tab.id;
          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => onSwitchMode(tab.id)}
              className={`relative rounded-lg px-3 py-2 text-xs font-semibold transition-colors whitespace-nowrap ${
                active ? 'text-white' : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              {active && (
                <motion.span
                  layoutId="auth-mode-pill"
                  transition={{ type: 'spring', stiffness: 460, damping: 36 }}
                  className="absolute inset-0 rounded-lg bg-[#1A2031]"
                />
              )}
              <span className="relative z-10">{tab.label}</span>
            </button>
          );
        })}
      </div>

      <div className="overflow-hidden rounded-2xl border border-white/[0.08] bg-[#10131C] p-6 shadow-2xl sm:p-7">
        <AnimatePresence mode="wait">
          <motion.div
            key={mode}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            transition={{ duration: 0.18, ease: [0.16, 1, 0.3, 1] }}
          >
            {/* Header */}
            <div className="mb-6">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-rose-500/15 text-rose-400">
                {mode === 'login' ? (
                  <LogIn className="h-5 w-5" />
                ) : mode === 'register' ? (
                  <UserPlus className="h-5 w-5" />
                ) : (
                  <KeyRound className="h-5 w-5" />
                )}
              </div>
              <h2 className="mt-4 font-display text-xl font-bold tracking-tight text-white">
                {mode === 'login'
                  ? 'Sign in to ApexList'
                  : mode === 'register'
                  ? 'Create your ApexList account'
                  : 'Reset your password'}
              </h2>
              <p className="mt-1 text-xs leading-relaxed text-slate-400">
                {mode === 'login'
                  ? 'Access your account to sync alert preferences and custom demon tracking.'
                  : mode === 'register'
                  ? 'Register with email verification to protect your account and save alert rules.'
                  : 'Enter your account email and we will send a secure password reset link.'}
              </p>
            </div>

            {/* Alert Banner */}
            <AnimatePresence>
              {errorMsg && (
                <motion.div
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: 'auto' }}
                  exit={{ opacity: 0, height: 0 }}
                  className="mb-4 overflow-hidden rounded-xl border border-rose-500/30 bg-rose-500/10 px-3.5 py-2.5 text-xs leading-relaxed text-rose-200"
                  role="alert"
                >
                  {errorMsg}
                </motion.div>
              )}
              {successMsg && (
                <motion.div
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: 'auto' }}
                  exit={{ opacity: 0, height: 0 }}
                  className="mb-4 overflow-hidden rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-3.5 py-2.5 text-xs leading-relaxed text-emerald-200"
                  role="status"
                >
                  <div className="flex items-start gap-2">
                    <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-400" />
                    <span>{successMsg}</span>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>

            {/* LOGIN FORM */}
            {mode === 'login' && (
              <form onSubmit={(e) => void handleLogin(e)} className="space-y-4">
                <div>
                  <label htmlFor="login-email" className="block text-xs font-medium text-slate-300">
                    Email address
                  </label>
                  <div className="relative mt-1.5">
                    <Mail className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
                    <input
                      id="login-email"
                      type="email"
                      required
                      maxLength={120}
                      autoComplete="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="player@example.com"
                      className="h-10 w-full rounded-lg border border-white/[0.08] bg-[#0B0E15] pl-9 pr-3 text-sm text-slate-100 placeholder:text-slate-600 focus:border-rose-500/60 focus:outline-none"
                    />
                  </div>
                </div>

                <div>
                  <div className="flex items-center justify-between">
                    <label htmlFor="login-password" className="block text-xs font-medium text-slate-300">
                      Password
                    </label>
                    <button
                      type="button"
                      onClick={() => onSwitchMode('forgot')}
                      className="text-xs font-medium text-rose-400 hover:text-rose-300"
                    >
                      Forgot password?
                    </button>
                  </div>
                  <div className="relative mt-1.5">
                    <Lock className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
                    <input
                      id="login-password"
                      type={showPassword ? 'text' : 'password'}
                      required
                      maxLength={128}
                      autoComplete="current-password"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder="Enter your password"
                      className="h-10 w-full rounded-lg border border-white/[0.08] bg-[#0B0E15] pl-9 pr-10 text-sm text-slate-100 placeholder:text-slate-600 focus:border-rose-500/60 focus:outline-none"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword((v) => !v)}
                      className="absolute right-2.5 top-1/2 flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded text-slate-400 hover:text-white"
                      aria-label={showPassword ? 'Hide password' : 'Show password'}
                    >
                      {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                  </div>
                </div>

                <motion.button
                  type="submit"
                  whileTap={{ scale: 0.98 }}
                  disabled={submitting || googleSubmitting}
                  className="flex h-10 w-full items-center justify-center gap-2 rounded-lg bg-rose-600 text-sm font-semibold text-white transition-colors hover:bg-rose-500 disabled:opacity-60"
                >
                  <LogIn className="h-4 w-4" />
                  <span>{submitting ? 'Signing in...' : 'Sign In'}</span>
                </motion.button>
              </form>
            )}

            {/* REGISTER FORM */}
            {mode === 'register' && (
              <form onSubmit={(e) => void handleRegister(e)} className="space-y-4">
                <div>
                  <label htmlFor="reg-name" className="block text-xs font-medium text-slate-300">
                    Player / Display Name
                  </label>
                  <div className="relative mt-1.5">
                    <User className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
                    <input
                      id="reg-name"
                      type="text"
                      required
                      minLength={2}
                      maxLength={40}
                      autoComplete="nickname"
                      value={displayName}
                      onChange={(e) => setDisplayName(e.target.value)}
                      placeholder="e.g. Zoink"
                      className="h-10 w-full rounded-lg border border-white/[0.08] bg-[#0B0E15] pl-9 pr-3 text-sm text-slate-100 placeholder:text-slate-600 focus:border-rose-500/60 focus:outline-none"
                    />
                  </div>
                </div>

                <div>
                  <label htmlFor="reg-email" className="block text-xs font-medium text-slate-300">
                    Email address
                  </label>
                  <div className="relative mt-1.5">
                    <Mail className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
                    <input
                      id="reg-email"
                      type="email"
                      required
                      maxLength={120}
                      autoComplete="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="player@example.com"
                      className="h-10 w-full rounded-lg border border-white/[0.08] bg-[#0B0E15] pl-9 pr-3 text-sm text-slate-100 placeholder:text-slate-600 focus:border-rose-500/60 focus:outline-none"
                    />
                  </div>
                </div>

                <div>
                  <label htmlFor="reg-password" className="block text-xs font-medium text-slate-300">
                    Password
                  </label>
                  <div className="relative mt-1.5">
                    <Lock className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
                    <input
                      id="reg-password"
                      type={showPassword ? 'text' : 'password'}
                      required
                      minLength={8}
                      maxLength={128}
                      autoComplete="new-password"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder="Minimum 8 characters"
                      className="h-10 w-full rounded-lg border border-white/[0.08] bg-[#0B0E15] pl-9 pr-10 text-sm text-slate-100 placeholder:text-slate-600 focus:border-rose-500/60 focus:outline-none"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword((v) => !v)}
                      className="absolute right-2.5 top-1/2 flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded text-slate-400 hover:text-white"
                      aria-label={showPassword ? 'Hide password' : 'Show password'}
                    >
                      {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                  </div>

                  {/* Password Requirements Checklist */}
                  <div className="mt-2 grid grid-cols-3 gap-2 text-[11px]">
                    <span className={hasMinLen ? 'text-emerald-400' : 'text-slate-500'}>8+ chars</span>
                    <span className={hasLetter ? 'text-emerald-400' : 'text-slate-500'}>Includes letter</span>
                    <span className={hasNumber ? 'text-emerald-400' : 'text-slate-500'}>Includes number</span>
                  </div>
                </div>

                <div>
                  <label htmlFor="reg-confirm" className="block text-xs font-medium text-slate-300">
                    Confirm password
                  </label>
                  <div className="relative mt-1.5">
                    <Lock className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
                    <input
                      id="reg-confirm"
                      type={showConfirmPassword ? 'text' : 'password'}
                      required
                      maxLength={128}
                      autoComplete="new-password"
                      value={confirmPassword}
                      onChange={(e) => setConfirmPassword(e.target.value)}
                      placeholder="Re-enter your password"
                      className="h-10 w-full rounded-lg border border-white/[0.08] bg-[#0B0E15] pl-9 pr-10 text-sm text-slate-100 placeholder:text-slate-600 focus:border-rose-500/60 focus:outline-none"
                    />
                    <button
                      type="button"
                      onClick={() => setShowConfirmPassword((v) => !v)}
                      className="absolute right-2.5 top-1/2 flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded text-slate-400 hover:text-white"
                      aria-label={showConfirmPassword ? 'Hide password' : 'Show password'}
                    >
                      {showConfirmPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                  </div>
                </div>

                <motion.button
                  type="submit"
                  whileTap={{ scale: 0.98 }}
                  disabled={submitting || googleSubmitting}
                  className="flex h-10 w-full items-center justify-center gap-2 rounded-lg bg-rose-600 text-sm font-semibold text-white transition-colors hover:bg-rose-500 disabled:opacity-60"
                >
                  <UserPlus className="h-4 w-4" />
                  <span>{submitting ? 'Creating account...' : 'Create Account'}</span>
                </motion.button>
              </form>
            )}

            {/* FORGOT PASSWORD FORM */}
            {mode === 'forgot' && (
              <form onSubmit={(e) => void handleForgot(e)} className="space-y-4">
                <div>
                  <label htmlFor="forgot-email" className="block text-xs font-medium text-slate-300">
                    Account email address
                  </label>
                  <div className="relative mt-1.5">
                    <Mail className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
                    <input
                      id="forgot-email"
                      type="email"
                      required
                      maxLength={120}
                      autoComplete="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="player@example.com"
                      className="h-10 w-full rounded-lg border border-white/[0.08] bg-[#0B0E15] pl-9 pr-3 text-sm text-slate-100 placeholder:text-slate-600 focus:border-rose-500/60 focus:outline-none"
                    />
                  </div>
                </div>

                <motion.button
                  type="submit"
                  whileTap={{ scale: 0.98 }}
                  disabled={submitting}
                  className="flex h-10 w-full items-center justify-center gap-2 rounded-lg bg-rose-600 text-sm font-semibold text-white transition-colors hover:bg-rose-500 disabled:opacity-60"
                >
                  <KeyRound className="h-4 w-4" />
                  <span>{submitting ? 'Sending link...' : 'Send Reset Link'}</span>
                </motion.button>
              </form>
            )}

            {/* Google OAuth Alternative on Login & Register */}
            {mode !== 'forgot' && (
              <>
                <div className="my-5 flex items-center gap-3">
                  <div className="h-px flex-1 bg-white/[0.08]" />
                  <span className="text-[11px] font-medium uppercase tracking-wider text-slate-500">or</span>
                  <div className="h-px flex-1 bg-white/[0.08]" />
                </div>

                <motion.button
                  type="button"
                  whileTap={{ scale: 0.98 }}
                  disabled={submitting || googleSubmitting}
                  onClick={() => void handleGoogleSignIn()}
                  className="flex h-10 w-full items-center justify-center gap-2.5 rounded-lg border border-white/[0.1] bg-[#141925] text-xs font-semibold text-slate-100 transition-colors hover:bg-[#1B2233] disabled:opacity-60"
                >
                  <svg className="h-4 w-4" viewBox="0 0 24 24" aria-hidden="true">
                    <path
                      fill="#EA4335"
                      d="M12 10.2v3.9h5.4c-.2 1.3-1.5 3.8-5.4 3.8-3.3 0-6-2.7-6-6s2.7-6 6-6c1.9 0 3.1.8 3.8 1.5l2.6-2.5C16.7 3.3 14.6 2.4 12 2.4 6.7 2.4 2.4 6.7 2.4 12s4.3 9.6 9.6 9.6c5.5 0 9.2-3.9 9.2-9.4 0-.6-.1-1.1-.2-1.6H12z"
                    />
                  </svg>
                  <span>{googleSubmitting ? 'Connecting...' : 'Continue with Google'}</span>
                </motion.button>
              </>
            )}

            {/* Footer Switch Link */}
            <div className="mt-6 border-t border-white/[0.06] pt-4 text-center text-xs text-slate-400">
              {mode === 'login' && (
                <span>
                  New to ApexList?{' '}
                  <button
                    type="button"
                    onClick={() => onSwitchMode('register')}
                    className="font-semibold text-rose-400 hover:text-rose-300"
                  >
                    Create an account
                  </button>
                </span>
              )}
              {mode === 'register' && (
                <span>
                  Already have an account?{' '}
                  <button
                    type="button"
                    onClick={() => onSwitchMode('login')}
                    className="font-semibold text-rose-400 hover:text-rose-300"
                  >
                    Sign in
                  </button>
                </span>
              )}
              {mode === 'forgot' && (
                <span>
                  Remembered your password?{' '}
                  <button
                    type="button"
                    onClick={() => onSwitchMode('login')}
                    className="font-semibold text-rose-400 hover:text-rose-300"
                  >
                    Back to Sign In
                  </button>
                </span>
              )}
            </div>
          </motion.div>
        </AnimatePresence>
      </div>
    </div>
  );
}
