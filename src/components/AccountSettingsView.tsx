import { useEffect, useRef, useState, type ChangeEvent, type FormEvent } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import {
  AlertTriangle,
  Bell,
  Camera,
  Check,
  CheckCircle2,
  Copy,
  Eye,
  EyeOff,
  KeyRound,
  Link2,
  Lock,
  LogIn,
  Mail,
  RefreshCw,
  ShieldCheck,
  SlidersHorizontal,
  Trash2,
  User,
} from 'lucide-react';
import { AVATAR_URL_PATTERN, useAuth } from '../contexts/AuthContext';
import type { ListSource } from '../types';

export type DefaultLandingView = 'demonlist' | 'top10' | 'calendar' | 'changelog' | 'players';

export interface AppPreferences {
  defaultView: DefaultLandingView;
  defaultSource: ListSource;
  compactRows: boolean;
}

const PREFS_STORAGE_KEY = 'apexlist_app_prefs_v1';

export function loadAppPreferences(): AppPreferences {
  try {
    const raw = localStorage.getItem(PREFS_STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<AppPreferences>;
      const validViews: DefaultLandingView[] = ['demonlist', 'top10', 'calendar', 'changelog', 'players'];
      const validSources: ListSource[] = ['all', 'pointercrate', 'aredl'];
      return {
        defaultView: parsed.defaultView && validViews.includes(parsed.defaultView) ? parsed.defaultView : 'demonlist',
        defaultSource: parsed.defaultSource && validSources.includes(parsed.defaultSource) ? parsed.defaultSource : 'all',
        compactRows: Boolean(parsed.compactRows),
      };
    }
  } catch {
    // ignore storage errors
  }
  return {
    defaultView: 'demonlist',
    defaultSource: 'all',
    compactRows: false,
  };
}

export function saveAppPreferences(prefs: AppPreferences): void {
  try {
    localStorage.setItem(PREFS_STORAGE_KEY, JSON.stringify(prefs));
  } catch {
    // ignore storage errors
  }
}

interface AccountSettingsViewProps {
  prefs: AppPreferences;
  onUpdatePrefs: (next: AppPreferences) => void;
  onOpenAlertSettings: () => void;
  onNavigateAuth: (mode: 'login' | 'register') => void;
  onAccountDeleted: () => void;
}

async function compressImageToAvatarDataUrl(file: File): Promise<string> {
  if (!file.type.startsWith('image/')) {
    throw new Error('Please choose a PNG, JPEG, or WebP image file.');
  }
  if (file.size > 5 * 1024 * 1024) {
    throw new Error('Image file must be smaller than 5 MB.');
  }

  const bitmap = await createImageBitmap(file);
  try {
    const size = 128;
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Image processing is unavailable in this browser.');

    const minDim = Math.min(bitmap.width, bitmap.height);
    const sx = (bitmap.width - minDim) / 2;
    const sy = (bitmap.height - minDim) / 2;
    ctx.drawImage(bitmap, sx, sy, minDim, minDim, 0, 0, size, size);

    // Prefer WebP for crisp small size, fallback to JPEG if browser lacks WebP encode
    for (const quality of [0.82, 0.65, 0.45]) {
      const webp = canvas.toDataURL('image/webp', quality);
      if (webp.startsWith('data:image/webp;base64,') && webp.length <= 23900) {
        return webp;
      }
      const jpeg = canvas.toDataURL('image/jpeg', quality);
      if (jpeg.startsWith('data:image/jpeg;base64,') && jpeg.length <= 23900) {
        return jpeg;
      }
    }
    throw new Error('Could not compress image small enough. Try a simpler image or paste an HTTPS URL.');
  } finally {
    bitmap.close();
  }
}

export function AccountSettingsView({
  prefs,
  onUpdatePrefs,
  onOpenAlertSettings,
  onNavigateAuth,
  onAccountDeleted,
}: AccountSettingsViewProps) {
  const {
    user,
    profile,
    resendVerificationEmail,
    refreshVerificationStatus,
    updateAccountProfile,
    changeUserPassword,
    deleteAccount,
  } = useAuth();

  const fileInputRef = useRef<HTMLInputElement | null>(null);

  // Profile form
  const [displayName, setDisplayName] = useState('');
  const [avatarUrl, setAvatarUrl] = useState('');
  const [showUrlInput, setShowUrlInput] = useState(false);
  const [profileBusy, setProfileBusy] = useState(false);
  const [profileError, setProfileError] = useState<string | null>(null);
  const [profileSuccess, setProfileSuccess] = useState<string | null>(null);

  // Email verification banner
  const [verifyBusy, setVerifyBusy] = useState(false);
  const [verifyFeedback, setVerifyFeedback] = useState<string | null>(null);
  const [copiedUid, setCopiedUid] = useState(false);

  // Password change form
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmNewPassword, setConfirmNewPassword] = useState('');
  const [showCurrentPw, setShowCurrentPw] = useState(false);
  const [showNewPw, setShowNewPw] = useState(false);
  const [pwBusy, setPwBusy] = useState(false);
  const [pwError, setPwError] = useState<string | null>(null);
  const [pwSuccess, setPwSuccess] = useState<string | null>(null);

  // Delete account state
  const [deleteModalOpen, setDeleteModalOpen] = useState(false);
  const [deleteConfirmText, setDeleteConfirmText] = useState('');
  const [deletePassword, setDeletePassword] = useState('');
  const [deleteBusy, setDeleteBusy] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  useEffect(() => {
    setDisplayName(profile?.displayName || user?.displayName || '');
    setAvatarUrl(profile?.avatarUrl || (user?.photoURL?.startsWith('https://') ? user.photoURL : '') || '');
  }, [profile?.displayName, profile?.avatarUrl, user?.displayName, user?.photoURL]);

  const hasPasswordProvider = Boolean(user?.providerData.some((p) => p.providerId === 'password'));
  const hasGoogleProvider = Boolean(user?.providerData.some((p) => p.providerId === 'google.com'));

  const pwHasLen = newPassword.length >= 8;
  const pwHasLetter = /[a-zA-Z]/.test(newPassword);
  const pwHasNumber = /\d/.test(newPassword);
  const pwDifferent = currentPassword.length > 0 && newPassword !== currentPassword;
  const pwMatches = newPassword.length > 0 && newPassword === confirmNewPassword;

  const handleAvatarFileChange = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setProfileError(null);
    setProfileSuccess(null);
    try {
      const dataUrl = await compressImageToAvatarDataUrl(file);
      setAvatarUrl(dataUrl);
      setProfileSuccess('Photo ready — click Save Profile to apply.');
    } catch (err) {
      setProfileError(err instanceof Error ? err.message : 'Unable to process image.');
    }
  };

  const handleSaveProfile = async (e: FormEvent) => {
    e.preventDefault();
    setProfileError(null);
    setProfileSuccess(null);

    const trimmedName = displayName.trim();
    if (trimmedName.length < 1 || trimmedName.length > 40) {
      setProfileError('Display name must be between 1 and 40 characters.');
      return;
    }
    const trimmedAvatar = avatarUrl.trim();
    if (trimmedAvatar && !AVATAR_URL_PATTERN.test(trimmedAvatar)) {
      setProfileError('Profile image URL must start with https:// or be an uploaded photo.');
      return;
    }

    setProfileBusy(true);
    try {
      await updateAccountProfile({ displayName: trimmedName, avatarUrl: trimmedAvatar });
      setProfileSuccess(
        user?.emailVerified
          ? 'Profile updated and synced to your account.'
          : 'Display name updated. Verify your email to sync profile photos across devices.'
      );
    } catch (err) {
      setProfileError(err instanceof Error ? err.message : 'Failed to save profile.');
    } finally {
      setProfileBusy(false);
    }
  };

  const handleChangePassword = async (e: FormEvent) => {
    e.preventDefault();
    setPwError(null);
    setPwSuccess(null);

    if (!currentPassword) {
      setPwError('Please enter your current password first.');
      return;
    }
    if (!pwHasLen || !pwHasLetter || !pwHasNumber) {
      setPwError('New password must be at least 8 characters and include both letters and numbers.');
      return;
    }
    if (newPassword === currentPassword) {
      setPwError('New password must be different from your current password.');
      return;
    }
    if (!pwMatches) {
      setPwError('New passwords do not match.');
      return;
    }

    setPwBusy(true);
    try {
      await changeUserPassword(currentPassword, newPassword);
      setCurrentPassword('');
      setNewPassword('');
      setConfirmNewPassword('');
      setPwSuccess('Password updated securely.');
    } catch (err) {
      setPwError(err instanceof Error ? err.message : 'Unable to change password.');
    } finally {
      setPwBusy(false);
    }
  };

  const handleDeleteAccount = async (e: FormEvent) => {
    e.preventDefault();
    setDeleteError(null);

    if (deleteConfirmText.trim().toUpperCase() !== 'DELETE') {
      setDeleteError('Type DELETE to confirm permanent account deletion.');
      return;
    }
    if (hasPasswordProvider && !deletePassword) {
      setDeleteError('Enter your current password to verify your identity.');
      return;
    }

    setDeleteBusy(true);
    try {
      await deleteAccount(deletePassword || undefined);
      setDeleteModalOpen(false);
      onAccountDeleted();
    } catch (err) {
      setDeleteError(err instanceof Error ? err.message : 'Could not delete account.');
    } finally {
      setDeleteBusy(false);
    }
  };

  const handleCopyUid = async () => {
    if (!user?.uid) return;
    try {
      await navigator.clipboard.writeText(user.uid);
      setCopiedUid(true);
      setTimeout(() => setCopiedUid(false), 1800);
    } catch {
      // ignore clipboard denial
    }
  };

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      {/* Unauthenticated Guest Callout */}
      {!user && (
        <section className="flex flex-col justify-between gap-4 rounded-2xl border border-white/[0.08] bg-[#10131C] p-6 sm:flex-row sm:items-center">
          <div>
            <h2 className="font-display text-lg font-semibold text-white">Sign in to manage your account</h2>
            <p className="mt-1 text-xs leading-relaxed text-slate-400">
              Sign in or register to customize your avatar, change your password, and cloud-sync your alert settings.
            </p>
          </div>
          <div className="flex items-center gap-2.5 shrink-0">
            <motion.button
              type="button"
              whileTap={{ scale: 0.97 }}
              onClick={() => onNavigateAuth('login')}
              className="inline-flex h-9 items-center gap-2 rounded-lg bg-rose-600 px-4 text-xs font-semibold text-white transition-colors hover:bg-rose-500 whitespace-nowrap"
            >
              <LogIn className="h-3.5 w-3.5" />
              Sign In
            </motion.button>
            <motion.button
              type="button"
              whileTap={{ scale: 0.97 }}
              onClick={() => onNavigateAuth('register')}
              className="inline-flex h-9 items-center gap-2 rounded-lg border border-white/[0.1] bg-[#161B28] px-4 text-xs font-semibold text-slate-200 transition-colors hover:bg-[#1E2536] whitespace-nowrap"
            >
              Create Account
            </motion.button>
          </div>
        </section>
      )}

      {/* Authenticated Account Sections */}
      {user && (
        <>
          {/* Verification Alert Banner */}
          {!user.emailVerified && (
            <section className="flex flex-col justify-between gap-4 rounded-2xl border border-amber-500/30 bg-amber-500/10 p-5 sm:flex-row sm:items-center">
              <div className="space-y-1">
                <div className="flex items-center gap-2 text-sm font-semibold text-amber-200">
                  <Mail className="h-4 w-4 text-amber-400" />
                  <span>Verify your email address ({user.email})</span>
                </div>
                <p className="text-xs text-amber-200/80">
                  Verify your inbox link to unlock cloud profile photo & alert preference syncing across devices.
                </p>
                {verifyFeedback && <p className="text-xs font-medium text-white">{verifyFeedback}</p>}
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <button
                  type="button"
                  disabled={verifyBusy}
                  onClick={async () => {
                    setVerifyBusy(true);
                    setVerifyFeedback(null);
                    try {
                      await resendVerificationEmail();
                      setVerifyFeedback('Verification email sent!');
                    } catch (err) {
                      setVerifyFeedback(err instanceof Error ? err.message : 'Failed to resend.');
                    } finally {
                      setVerifyBusy(false);
                    }
                  }}
                  className="rounded-lg border border-amber-400/30 bg-black/30 px-3 py-2 text-xs font-semibold text-amber-100 hover:bg-black/50 disabled:opacity-60 whitespace-nowrap"
                >
                  Resend Email
                </button>
                <button
                  type="button"
                  disabled={verifyBusy}
                  onClick={async () => {
                    setVerifyBusy(true);
                    setVerifyFeedback(null);
                    try {
                      const ok = await refreshVerificationStatus();
                      setVerifyFeedback(ok ? 'Verified!' : 'Not verified yet — check your inbox.');
                    } finally {
                      setVerifyBusy(false);
                    }
                  }}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-amber-500 px-3 py-2 text-xs font-semibold text-slate-950 hover:bg-amber-400 disabled:opacity-60 whitespace-nowrap"
                >
                  <RefreshCw className={`h-3.5 w-3.5 ${verifyBusy ? 'animate-spin' : ''}`} />
                  I Verified
                </button>
              </div>
            </section>
          )}

          {/* Profile & Avatar Card */}
          <section className="rounded-2xl border border-white/[0.08] bg-[#10131C] p-6">
            <div className="flex items-center justify-between border-b border-white/[0.06] pb-4">
              <div>
                <h2 className="font-display text-base font-semibold text-white">Profile & Avatar</h2>
                <p className="mt-0.5 text-xs text-slate-400">
                  Update your player name and profile picture shown in your account panel.
                </p>
              </div>
              {user.emailVerified && (
                <span className="inline-flex items-center gap-1.5 text-xs font-medium text-emerald-400">
                  <ShieldCheck className="h-3.5 w-3.5" />
                  Verified
                </span>
              )}
            </div>

            <form onSubmit={(e) => void handleSaveProfile(e)} className="mt-5 space-y-5">
              {/* Avatar Row */}
              <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
                <div className="relative flex h-20 w-20 shrink-0 items-center justify-center overflow-hidden rounded-2xl border border-white/[0.1] bg-[#151A28]">
                  {avatarUrl ? (
                    <img
                      src={avatarUrl}
                      alt={displayName || 'Profile picture'}
                      className="h-full w-full object-cover"
                    />
                  ) : (
                    <span className="font-display text-2xl font-bold text-rose-400">
                      {(displayName || user.email || 'P').slice(0, 1).toUpperCase()}
                    </span>
                  )}
                </div>

                <div className="space-y-2.5">
                  <div className="flex flex-wrap items-center gap-2">
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept="image/png,image/jpeg,image/webp"
                      onChange={(e) => void handleAvatarFileChange(e)}
                      className="hidden"
                    />
                    <motion.button
                      type="button"
                      whileTap={{ scale: 0.97 }}
                      onClick={() => fileInputRef.current?.click()}
                      className="inline-flex items-center gap-2 rounded-lg border border-white/[0.1] bg-[#161B28] px-3.5 py-2 text-xs font-semibold text-slate-100 transition-colors hover:bg-[#1E2536] whitespace-nowrap"
                    >
                      <Camera className="h-3.5 w-3.5 text-rose-400" />
                      Upload Photo
                    </motion.button>
                    <button
                      type="button"
                      onClick={() => setShowUrlInput((v) => !v)}
                      className="inline-flex items-center gap-1.5 rounded-lg border border-white/[0.08] bg-[#121622] px-3 py-2 text-xs font-medium text-slate-300 transition-colors hover:bg-[#191F30] whitespace-nowrap"
                    >
                      <Link2 className="h-3.5 w-3.5" />
                      {showUrlInput ? 'Hide URL' : 'Use Image URL'}
                    </button>
                    {avatarUrl && (
                      <button
                        type="button"
                        onClick={() => {
                          setAvatarUrl('');
                          setProfileSuccess('Photo cleared — click Save Profile to confirm.');
                        }}
                        className="rounded-lg px-2.5 py-2 text-xs font-medium text-slate-400 transition-colors hover:text-rose-400"
                      >
                        Remove
                      </button>
                    )}
                  </div>
                  <p className="text-[11px] text-slate-500">
                    PNG, JPG, or WebP. Uploaded photos are cropped to 128×128 automatically.
                  </p>
                </div>
              </div>

              {showUrlInput && (
                <div>
                  <label htmlFor="avatar-url-input" className="block text-xs font-medium text-slate-300">
                    HTTPS Image URL
                  </label>
                  <input
                    id="avatar-url-input"
                    type="url"
                    maxLength={500}
                    value={avatarUrl.startsWith('data:') ? '' : avatarUrl}
                    onChange={(e) => setAvatarUrl(e.target.value)}
                    placeholder="https://example.com/avatar.png"
                    className="mt-1.5 h-10 w-full rounded-lg border border-white/[0.08] bg-[#0B0E15] px-3 text-sm text-slate-100 placeholder:text-slate-600 focus:border-rose-500/60 focus:outline-none"
                  />
                </div>
              )}

              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <label htmlFor="settings-display-name" className="block text-xs font-medium text-slate-300">
                    Player / Display Name
                  </label>
                  <div className="relative mt-1.5">
                    <User className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
                    <input
                      id="settings-display-name"
                      type="text"
                      required
                      minLength={1}
                      maxLength={40}
                      value={displayName}
                      onChange={(e) => setDisplayName(e.target.value)}
                      className="h-10 w-full rounded-lg border border-white/[0.08] bg-[#0B0E15] pl-9 pr-3 text-sm text-slate-100 focus:border-rose-500/60 focus:outline-none"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-300">Account Email</label>
                  <div className="mt-1.5 flex h-10 items-center justify-between rounded-lg border border-white/[0.06] bg-[#0B0E15]/60 px-3 text-sm text-slate-400">
                    <span className="truncate">{user.email ?? 'Signed in'}</span>
                    <span className="ml-2 shrink-0 text-[11px] font-medium text-slate-500">
                      {hasGoogleProvider && hasPasswordProvider
                        ? 'Email + Google'
                        : hasGoogleProvider
                        ? 'Google'
                        : 'Email'}
                    </span>
                  </div>
                </div>
              </div>

              <div className="flex flex-wrap items-center justify-between gap-3 border-t border-white/[0.06] pt-4">
                <button
                  type="button"
                  onClick={() => void handleCopyUid()}
                  className="inline-flex items-center gap-1.5 font-mono text-[11px] text-slate-400 transition-colors hover:text-slate-200"
                  title="Copy User ID"
                >
                  {copiedUid ? <Check className="h-3.5 w-3.5 text-emerald-400" /> : <Copy className="h-3.5 w-3.5" />}
                  <span>UID: {user.uid.slice(0, 12)}...</span>
                </button>

                <motion.button
                  type="submit"
                  whileTap={{ scale: 0.97 }}
                  disabled={profileBusy}
                  className="inline-flex h-9 items-center gap-2 rounded-lg bg-rose-600 px-4 text-xs font-semibold text-white transition-colors hover:bg-rose-500 disabled:opacity-60"
                >
                  {profileBusy ? 'Saving...' : 'Save Profile'}
                </motion.button>
              </div>

              {profileError && (
                <p className="rounded-lg border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-xs text-rose-200">
                  {profileError}
                </p>
              )}
              {profileSuccess && (
                <p className="flex items-center gap-2 rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-xs text-emerald-200">
                  <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-400" />
                  <span>{profileSuccess}</span>
                </p>
              )}
            </form>
          </section>

          {/* Security / Change Password Card */}
          <section className="rounded-2xl border border-white/[0.08] bg-[#10131C] p-6">
            <div className="border-b border-white/[0.06] pb-4">
              <div className="flex items-center gap-2">
                <KeyRound className="h-4 w-4 text-rose-400" />
                <h2 className="font-display text-base font-semibold text-white">Change Password</h2>
              </div>
              <p className="mt-0.5 text-xs text-slate-400">
                Verify your current password before setting a new one.
              </p>
            </div>

            {hasPasswordProvider ? (
              <form onSubmit={(e) => void handleChangePassword(e)} className="mt-5 space-y-4">
                <div>
                  <label htmlFor="pw-current" className="block text-xs font-medium text-slate-300">
                    Current Password
                  </label>
                  <div className="relative mt-1.5">
                    <Lock className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
                    <input
                      id="pw-current"
                      type={showCurrentPw ? 'text' : 'password'}
                      required
                      maxLength={128}
                      autoComplete="current-password"
                      value={currentPassword}
                      onChange={(e) => setCurrentPassword(e.target.value)}
                      placeholder="Enter your existing password"
                      className="h-10 w-full rounded-lg border border-white/[0.08] bg-[#0B0E15] pl-9 pr-10 text-sm text-slate-100 placeholder:text-slate-600 focus:border-rose-500/60 focus:outline-none"
                    />
                    <button
                      type="button"
                      onClick={() => setShowCurrentPw((v) => !v)}
                      className="absolute right-2.5 top-1/2 flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded text-slate-400 hover:text-white"
                      aria-label={showCurrentPw ? 'Hide current password' : 'Show current password'}
                    >
                      {showCurrentPw ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                  </div>
                </div>

                <div className="grid gap-4 sm:grid-cols-2">
                  <div>
                    <label htmlFor="pw-new" className="block text-xs font-medium text-slate-300">
                      New Password
                    </label>
                    <div className="relative mt-1.5">
                      <Lock className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
                      <input
                        id="pw-new"
                        type={showNewPw ? 'text' : 'password'}
                        required
                        minLength={8}
                        maxLength={128}
                        autoComplete="new-password"
                        value={newPassword}
                        onChange={(e) => setNewPassword(e.target.value)}
                        placeholder="Minimum 8 characters"
                        className="h-10 w-full rounded-lg border border-white/[0.08] bg-[#0B0E15] pl-9 pr-10 text-sm text-slate-100 placeholder:text-slate-600 focus:border-rose-500/60 focus:outline-none"
                      />
                      <button
                        type="button"
                        onClick={() => setShowNewPw((v) => !v)}
                        className="absolute right-2.5 top-1/2 flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded text-slate-400 hover:text-white"
                        aria-label={showNewPw ? 'Hide new password' : 'Show new password'}
                      >
                        {showNewPw ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                      </button>
                    </div>
                  </div>

                  <div>
                    <label htmlFor="pw-confirm" className="block text-xs font-medium text-slate-300">
                      Confirm New Password
                    </label>
                    <div className="relative mt-1.5">
                      <Lock className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
                      <input
                        id="pw-confirm"
                        type={showNewPw ? 'text' : 'password'}
                        required
                        maxLength={128}
                        autoComplete="new-password"
                        value={confirmNewPassword}
                        onChange={(e) => setConfirmNewPassword(e.target.value)}
                        placeholder="Re-enter new password"
                        className="h-10 w-full rounded-lg border border-white/[0.08] bg-[#0B0E15] pl-9 pr-3 text-sm text-slate-100 placeholder:text-slate-600 focus:border-rose-500/60 focus:outline-none"
                      />
                    </div>
                  </div>
                </div>

                <div className="flex flex-wrap gap-4 text-[11px]">
                  <span className={pwHasLen ? 'text-emerald-400' : 'text-slate-500'}>8+ characters</span>
                  <span className={pwHasLetter ? 'text-emerald-400' : 'text-slate-500'}>Letter</span>
                  <span className={pwHasNumber ? 'text-emerald-400' : 'text-slate-500'}>Number</span>
                  <span className={pwDifferent ? 'text-emerald-400' : 'text-slate-500'}>Differs from current</span>
                  <span className={pwMatches ? 'text-emerald-400' : 'text-slate-500'}>Passwords match</span>
                </div>

                {pwError && (
                  <p className="rounded-lg border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-xs text-rose-200">
                    {pwError}
                  </p>
                )}
                {pwSuccess && (
                  <p className="flex items-center gap-2 rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-xs text-emerald-200">
                    <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-400" />
                    <span>{pwSuccess}</span>
                  </p>
                )}

                <div className="flex justify-end">
                  <motion.button
                    type="submit"
                    whileTap={{ scale: 0.97 }}
                    disabled={pwBusy}
                    className="inline-flex h-9 items-center gap-2 rounded-lg border border-white/[0.1] bg-[#161B28] px-4 text-xs font-semibold text-white transition-colors hover:bg-[#1E2536] disabled:opacity-60"
                  >
                    {pwBusy ? 'Updating Password...' : 'Update Password'}
                  </motion.button>
                </div>
              </form>
            ) : (
              <p className="mt-4 text-xs leading-relaxed text-slate-400">
                You signed in using Google. Password management is handled securely through your Google Account.
              </p>
            )}
          </section>
        </>
      )}

      {/* Quality of Life Preferences Card (Works for both Signed-In & Guests) */}
      <section className="rounded-2xl border border-white/[0.08] bg-[#10131C] p-6">
        <div className="flex items-center justify-between border-b border-white/[0.06] pb-4">
          <div className="flex items-center gap-2">
            <SlidersHorizontal className="h-4 w-4 text-rose-400" />
            <div>
              <h2 className="font-display text-base font-semibold text-white">Workspace & Quality of Life</h2>
              <p className="mt-0.5 text-xs text-slate-400">
                Customize your default startup view, leaderboard source, and table density.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onOpenAlertSettings}
            className="inline-flex items-center gap-1.5 rounded-lg border border-white/[0.1] bg-[#151A28] px-3 py-1.5 text-xs font-medium text-slate-200 hover:bg-[#1D2436] whitespace-nowrap"
          >
            <Bell className="h-3.5 w-3.5 text-rose-400" />
            Alert Settings
          </button>
        </div>

        <div className="mt-5 grid gap-4 sm:grid-cols-2">
          <div>
            <label htmlFor="pref-default-view" className="block text-xs font-medium text-slate-300">
              Default Startup Tab
            </label>
            <select
              id="pref-default-view"
              value={prefs.defaultView}
              onChange={(e) =>
                onUpdatePrefs({ ...prefs, defaultView: e.target.value as DefaultLandingView })
              }
              className="mt-1.5 h-10 w-full rounded-lg border border-white/[0.08] bg-[#0B0E15] px-3 text-sm text-slate-100 focus:border-rose-500/60 focus:outline-none"
            >
              <option value="demonlist">Demonlist</option>
              <option value="top10">Top 10 Watch</option>
              <option value="calendar">Calendar</option>
              <option value="changelog">Live Changelog</option>
              <option value="players">Player Rankings</option>
            </select>
          </div>

          <div>
            <label htmlFor="pref-default-source" className="block text-xs font-medium text-slate-300">
              Default Demonlist Source
            </label>
            <select
              id="pref-default-source"
              value={prefs.defaultSource}
              onChange={(e) =>
                onUpdatePrefs({ ...prefs, defaultSource: e.target.value as ListSource })
              }
              className="mt-1.5 h-10 w-full rounded-lg border border-white/[0.08] bg-[#0B0E15] px-3 text-sm text-slate-100 focus:border-rose-500/60 focus:outline-none"
            >
              <option value="all">Unified (Pointercrate + AREDL)</option>
              <option value="pointercrate">Pointercrate Classic Top 150</option>
              <option value="aredl">AREDL Extremes</option>
            </select>
          </div>
        </div>

        <div className="mt-4 flex items-center justify-between rounded-xl border border-white/[0.06] bg-[#0B0E15]/60 px-4 py-3">
          <div>
            <div className="text-sm font-medium text-white">Compact Demonlist Rows</div>
            <div className="text-xs text-slate-400">
              Tighter vertical row padding so more levels fit on screen at once.
            </div>
          </div>
          <button
            type="button"
            role="switch"
            aria-checked={prefs.compactRows}
            onClick={() => onUpdatePrefs({ ...prefs, compactRows: !prefs.compactRows })}
            className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer items-center rounded-full border px-0.5 transition-colors ${
              prefs.compactRows
                ? 'justify-end border-rose-500/60 bg-rose-600'
                : 'justify-start border-white/10 bg-[#1B2030]'
            }`}
          >
            <motion.span
              layout
              transition={{ type: 'spring', stiffness: 500, damping: 32 }}
              className="pointer-events-none inline-block h-5 w-5 rounded-full bg-white shadow"
            />
          </button>
        </div>
      </section>

      {/* Danger Zone: Delete Account */}
      {user && (
        <section className="rounded-2xl border border-rose-500/25 bg-rose-950/15 p-6">
          <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
            <div>
              <div className="flex items-center gap-2 text-sm font-semibold text-rose-300">
                <AlertTriangle className="h-4 w-4 text-rose-400" />
                <span>Delete Account</span>
              </div>
              <p className="mt-1 text-xs leading-relaxed text-slate-400">
                Permanently remove your ApexList account, profile photo, and saved cloud alert settings. This cannot be undone.
              </p>
            </div>
            <motion.button
              type="button"
              whileTap={{ scale: 0.97 }}
              onClick={() => {
                setDeleteConfirmText('');
                setDeletePassword('');
                setDeleteError(null);
                setDeleteModalOpen(true);
              }}
              className="inline-flex h-9 shrink-0 items-center gap-2 rounded-lg border border-rose-500/40 bg-rose-600/20 px-4 text-xs font-semibold text-rose-200 transition-colors hover:bg-rose-600 hover:text-white whitespace-nowrap"
            >
              <Trash2 className="h-3.5 w-3.5" />
              Delete Account
            </motion.button>
          </div>
        </section>
      )}

      {/* Delete Confirmation Modal */}
      <AnimatePresence>
        {deleteModalOpen && user && (
          <motion.div
            key="delete-account-backdrop"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.18 }}
            onClick={() => !deleteBusy && setDeleteModalOpen(false)}
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4 backdrop-blur-sm"
          >
            <motion.div
              key="delete-account-dialog"
              initial={{ opacity: 0, scale: 0.96, y: 8 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.96, y: 8 }}
              transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
              onClick={(e) => e.stopPropagation()}
              className="w-full max-w-md rounded-2xl border border-rose-500/30 bg-[#10131C] p-6 shadow-2xl"
              role="dialog"
              aria-label="Confirm account deletion"
            >
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-rose-500/15 text-rose-400">
                <Trash2 className="h-5 w-5" />
              </div>
              <h3 className="mt-4 font-display text-lg font-bold text-white">Permanently delete account?</h3>
              <p className="mt-1 text-xs leading-relaxed text-slate-400">
                This will permanently delete <span className="font-medium text-slate-200">{user.email}</span> and erase all stored preferences.
              </p>

              <form onSubmit={(e) => void handleDeleteAccount(e)} className="mt-5 space-y-4">
                {hasPasswordProvider && (
                  <div>
                    <label htmlFor="delete-pw" className="block text-xs font-medium text-slate-300">
                      Enter your current password
                    </label>
                    <input
                      id="delete-pw"
                      type="password"
                      required
                      value={deletePassword}
                      onChange={(e) => setDeletePassword(e.target.value)}
                      placeholder="Current password"
                      className="mt-1.5 h-10 w-full rounded-lg border border-white/[0.08] bg-[#0B0E15] px-3 text-sm text-slate-100 placeholder:text-slate-600 focus:border-rose-500/60 focus:outline-none"
                    />
                  </div>
                )}

                <div>
                  <label htmlFor="delete-confirm" className="block text-xs font-medium text-slate-300">
                    Type <span className="font-mono font-bold text-rose-400">DELETE</span> to confirm
                  </label>
                  <input
                    id="delete-confirm"
                    type="text"
                    required
                    value={deleteConfirmText}
                    onChange={(e) => setDeleteConfirmText(e.target.value)}
                    placeholder="DELETE"
                    className="mt-1.5 h-10 w-full rounded-lg border border-white/[0.08] bg-[#0B0E15] px-3 font-mono text-sm text-slate-100 placeholder:text-slate-600 focus:border-rose-500/60 focus:outline-none"
                  />
                </div>

                {deleteError && (
                  <p className="rounded-lg border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-xs text-rose-200">
                    {deleteError}
                  </p>
                )}

                <div className="flex items-center justify-end gap-2.5 pt-2">
                  <button
                    type="button"
                    disabled={deleteBusy}
                    onClick={() => setDeleteModalOpen(false)}
                    className="h-9 rounded-lg border border-white/[0.1] bg-[#161B28] px-4 text-xs font-medium text-slate-200 hover:bg-[#1E2536] disabled:opacity-60"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={deleteBusy}
                    className="h-9 rounded-lg bg-rose-600 px-4 text-xs font-semibold text-white hover:bg-rose-500 disabled:opacity-60"
                  >
                    {deleteBusy ? 'Deleting...' : hasGoogleProvider && !hasPasswordProvider ? 'Verify with Google & Delete' : 'Delete Forever'}
                  </button>
                </div>
              </form>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
