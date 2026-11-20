import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import {
  EmailAuthProvider,
  GoogleAuthProvider,
  createUserWithEmailAndPassword,
  deleteUser,
  onAuthStateChanged,
  reauthenticateWithCredential,
  reauthenticateWithPopup,
  reload,
  sendEmailVerification,
  sendPasswordResetEmail,
  signInWithEmailAndPassword,
  signInWithPopup,
  signOut,
  updatePassword,
  updateProfile,
  type User,
} from 'firebase/auth';
import { deleteDoc, doc, getDoc, serverTimestamp, setDoc, updateDoc } from 'firebase/firestore';
import { auth, db, handleFirestoreError, OperationType } from '../firebase';
import type { NotificationSettings } from '../types';
import { loadNotificationSettings, saveNotificationSettings } from '../utils/notifications';

const UID_PATTERN = /^[a-zA-Z0-9_\-]+$/;
const DISPLAY_NAME_MAX_LEN = 40;
export const AVATAR_URL_PATTERN =
  /^(|https:\/\/.+|data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+)$/;

export interface UserProfileData {
  uid: string;
  displayName: string;
  avatarUrl: string;
  role: 'member';
  browserEnabled: boolean;
  soundEnabled: boolean;
  notifyPlaced: boolean;
  notifyUpdated: boolean;
  notifyTop10Victor: boolean;
  sourcePointercrate: boolean;
  sourceAredl: boolean;
}

interface AuthContextValue {
  user: User | null;
  authReady: boolean;
  profile: UserProfileData | null;
  syncingProfile: boolean;
  signInWithEmail: (email: string, password: string) => Promise<void>;
  registerWithEmail: (displayName: string, email: string, password: string) => Promise<{ verificationSent: boolean }>;
  sendResetEmail: (email: string) => Promise<void>;
  signInWithGoogle: () => Promise<void>;
  resendVerificationEmail: () => Promise<void>;
  refreshVerificationStatus: () => Promise<boolean>;
  signOutUser: () => Promise<void>;
  syncSettingsToCloud: (settings: NotificationSettings) => Promise<void>;
  updateAccountProfile: (updates: { displayName: string; avatarUrl: string }) => Promise<void>;
  changeUserPassword: (currentPassword: string, newPassword: string) => Promise<void>;
  deleteAccount: (currentPassword?: string) => Promise<void>;
  onSettingsLoadedFromCloud: (cb: (settings: NotificationSettings) => void) => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

function sanitizeDisplayName(raw: string, fallbackEmail?: string | null): string {
  const cleaned = raw.trim().replace(/\s+/g, ' ').slice(0, DISPLAY_NAME_MAX_LEN);
  if (cleaned.length >= 1) return cleaned;
  const prefix = (fallbackEmail ?? 'Player').split('@')[0]?.trim().slice(0, DISPLAY_NAME_MAX_LEN);
  return prefix && prefix.length >= 1 ? prefix : 'Player';
}

export function sanitizeAvatarUrl(raw: string | null | undefined): string {
  if (!raw) return '';
  const trimmed = raw.trim();
  if (trimmed.length > 24000) return '';
  return AVATAR_URL_PATTERN.test(trimmed) ? trimmed : '';
}

export function mapAuthErrorMessage(err: unknown): string {
  const code = typeof err === 'object' && err !== null && 'code' in err ? String((err as { code: string }).code) : '';
  switch (code) {
    case 'auth/invalid-email':
      return 'Please enter a valid email address.';
    case 'auth/user-disabled':
      return 'This account has been disabled.';
    case 'auth/user-not-found':
    case 'auth/wrong-password':
    case 'auth/invalid-credential':
      return 'Invalid email or password. Please verify your current credentials and try again.';
    case 'auth/email-already-in-use':
      return 'An account with this email already exists. Try signing in or resetting your password.';
    case 'auth/weak-password':
      return 'Password is too weak. Use at least 8 characters with letters and numbers.';
    case 'auth/requires-recent-login':
      return 'For your security, please enter your current password or re-authenticate before continuing.';
    case 'auth/too-many-requests':
      return 'Too many attempts detected. Please wait a few minutes before trying again.';
    case 'auth/network-request-failed':
      return 'Network error while contacting authentication servers. Please try again.';
    case 'auth/popup-closed-by-user':
      return 'Sign-in popup was closed before completing.';
    case 'auth/popup-blocked':
      return 'Sign-in popup was blocked by your browser. Please allow popups for this site.';
    case 'auth/operation-not-allowed':
      return 'Email/Password sign-in is not yet enabled in Firebase Console (Authentication → Sign-in method → Email/Password). You can enable it there or use Google Sign-In.';
    default:
      if (err instanceof Error && err.message) {
        return err.message.replace(/^Firebase:\s*/i, '').replace(/\s*\(auth\/[^)]+\)\.?/i, '');
      }
      return 'Authentication request failed. Please try again.';
  }
}

export function AuthProvider({
  children,
  onCloudSettingsSync,
}: {
  children: ReactNode;
  onCloudSettingsSync?: (settings: NotificationSettings) => void;
}) {
  const [user, setUser] = useState<User | null>(null);
  const [authReady, setAuthReady] = useState(false);
  const [profile, setProfile] = useState<UserProfileData | null>(null);
  const [syncingProfile, setSyncingProfile] = useState(false);
  const [, setStateTick] = useState(0);
  const cloudSettingsCallbackRef = useRef<((s: NotificationSettings) => void) | null>(null);
  const onCloudSettingsSyncRef = useRef(onCloudSettingsSync);
  onCloudSettingsSyncRef.current = onCloudSettingsSync;

  const ensureAndLoadProfile = useCallback(async (firebaseUser: User) => {
    if (!firebaseUser.emailVerified || !UID_PATTERN.test(firebaseUser.uid)) {
      setProfile(null);
      return;
    }

    const path = `users/${firebaseUser.uid}`;
    const ref = doc(db, 'users', firebaseUser.uid);
    setSyncingProfile(true);
    try {
      const tokenRes = await firebaseUser.getIdTokenResult();
      if (!tokenRes.claims.email_verified) {
        await firebaseUser.getIdToken(true);
      }

      if (!auth.currentUser || auth.currentUser.uid !== firebaseUser.uid) {
        return;
      }

      const snap = await getDoc(ref);
      if (!auth.currentUser || auth.currentUser.uid !== firebaseUser.uid) {
        return;
      }

      if (snap.exists()) {
        const data = snap.data() as Partial<UserProfileData>;
        const loaded: UserProfileData = {
          uid: firebaseUser.uid,
          displayName: sanitizeDisplayName(
            typeof data.displayName === 'string' ? data.displayName : firebaseUser.displayName ?? '',
            firebaseUser.email
          ),
          avatarUrl: sanitizeAvatarUrl(
            typeof data.avatarUrl === 'string' ? data.avatarUrl : firebaseUser.photoURL
          ),
          role: 'member',
          browserEnabled: Boolean(data.browserEnabled),
          soundEnabled: data.soundEnabled !== undefined ? Boolean(data.soundEnabled) : true,
          notifyPlaced: data.notifyPlaced !== undefined ? Boolean(data.notifyPlaced) : true,
          notifyUpdated: data.notifyUpdated !== undefined ? Boolean(data.notifyUpdated) : true,
          notifyTop10Victor: data.notifyTop10Victor !== undefined ? Boolean(data.notifyTop10Victor) : true,
          sourcePointercrate: data.sourcePointercrate !== undefined ? Boolean(data.sourcePointercrate) : true,
          sourceAredl: data.sourceAredl !== undefined ? Boolean(data.sourceAredl) : true,
        };
        setProfile(loaded);

        const settingsFromCloud: NotificationSettings = {
          browserEnabled: loaded.browserEnabled,
          soundEnabled: loaded.soundEnabled,
          notifyPlaced: loaded.notifyPlaced,
          notifyUpdated: loaded.notifyUpdated,
          notifyTop10Victor: loaded.notifyTop10Victor,
          sources: {
            pointercrate: loaded.sourcePointercrate,
            aredl: loaded.sourceAredl,
          },
        };
        saveNotificationSettings(settingsFromCloud);
        onCloudSettingsSyncRef.current?.(settingsFromCloud);
        cloudSettingsCallbackRef.current?.(settingsFromCloud);
      } else {
        const local = loadNotificationSettings();
        const initialName = sanitizeDisplayName(firebaseUser.displayName ?? '', firebaseUser.email);
        const initialAvatar = sanitizeAvatarUrl(firebaseUser.photoURL);
        const payload = {
          uid: firebaseUser.uid,
          displayName: initialName,
          avatarUrl: initialAvatar,
          role: 'member' as const,
          browserEnabled: Boolean(local.browserEnabled),
          soundEnabled: Boolean(local.soundEnabled),
          notifyPlaced: Boolean(local.notifyPlaced),
          notifyUpdated: Boolean(local.notifyUpdated),
          notifyTop10Victor: Boolean(local.notifyTop10Victor),
          sourcePointercrate: Boolean(local.sources.pointercrate),
          sourceAredl: Boolean(local.sources.aredl),
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        };
        try {
          await setDoc(ref, payload);
        } catch (writeErr) {
          if (!auth.currentUser || auth.currentUser.uid !== firebaseUser.uid) {
            return;
          }
          handleFirestoreError(writeErr, OperationType.CREATE, path);
        }
        setProfile({
          uid: payload.uid,
          displayName: payload.displayName,
          avatarUrl: payload.avatarUrl,
          role: payload.role,
          browserEnabled: payload.browserEnabled,
          soundEnabled: payload.soundEnabled,
          notifyPlaced: payload.notifyPlaced,
          notifyUpdated: payload.notifyUpdated,
          notifyTop10Victor: payload.notifyTop10Victor,
          sourcePointercrate: payload.sourcePointercrate,
          sourceAredl: payload.sourceAredl,
        });
      }
    } catch (err) {
      if (!auth.currentUser || auth.currentUser.uid !== firebaseUser.uid) {
        return;
      }
      if (err instanceof Error && err.message.startsWith('{"error":')) {
        throw err;
      }
      handleFirestoreError(err, OperationType.GET, path);
    } finally {
      setSyncingProfile(false);
    }
  }, []);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (nextUser) => {
      setUser(nextUser);
      setAuthReady(true);
      if (nextUser && nextUser.emailVerified) {
        void ensureAndLoadProfile(nextUser).catch((err) => {
          console.error('Failed loading verified user profile:', err);
        });
      } else {
        setProfile(null);
      }
    });
    return () => unsub();
  }, [ensureAndLoadProfile]);

  const signInWithEmail = useCallback(async (email: string, password: string) => {
    try {
      await signInWithEmailAndPassword(auth, email.trim(), password);
    } catch (err) {
      throw new Error(mapAuthErrorMessage(err));
    }
  }, []);

  const registerWithEmail = useCallback(async (displayName: string, email: string, password: string) => {
    const safeName = sanitizeDisplayName(displayName, email);
    try {
      const cred = await createUserWithEmailAndPassword(auth, email.trim(), password);
      await updateProfile(cred.user, { displayName: safeName });
      let verificationSent = false;
      try {
        await sendEmailVerification(cred.user);
        verificationSent = true;
      } catch {
        verificationSent = false;
      }
      setUser(auth.currentUser);
      return { verificationSent };
    } catch (err) {
      throw new Error(mapAuthErrorMessage(err));
    }
  }, []);

  const sendResetEmail = useCallback(async (email: string) => {
    try {
      await sendPasswordResetEmail(auth, email.trim());
    } catch (err) {
      throw new Error(mapAuthErrorMessage(err));
    }
  }, []);

  const signInWithGoogle = useCallback(async () => {
    try {
      const provider = new GoogleAuthProvider();
      provider.setCustomParameters({ prompt: 'select_account' });
      await signInWithPopup(auth, provider);
    } catch (err) {
      throw new Error(mapAuthErrorMessage(err));
    }
  }, []);

  const resendVerificationEmail = useCallback(async () => {
    if (!auth.currentUser) {
      throw new Error('Sign in first to resend a verification email.');
    }
    try {
      await sendEmailVerification(auth.currentUser);
    } catch (err) {
      throw new Error(mapAuthErrorMessage(err));
    }
  }, []);

  const refreshVerificationStatus = useCallback(async () => {
    if (!auth.currentUser) return false;
    await reload(auth.currentUser);
    const refreshed = auth.currentUser;
    if (refreshed?.emailVerified) {
      await refreshed.getIdToken(true);
    }
    setUser(refreshed);
    setStateTick((n) => n + 1);
    if (refreshed?.emailVerified) {
      await ensureAndLoadProfile(refreshed);
      return true;
    }
    return false;
  }, [ensureAndLoadProfile]);

  const signOutUser = useCallback(async () => {
    await signOut(auth);
    setProfile(null);
  }, []);

  const syncSettingsToCloud = useCallback(
    async (settings: NotificationSettings) => {
      const current = auth.currentUser;
      if (!current || !current.emailVerified || !UID_PATTERN.test(current.uid)) return;
      const path = `users/${current.uid}`;
      const ref = doc(db, 'users', current.uid);
      try {
        const tokenRes = await current.getIdTokenResult();
        if (!tokenRes.claims.email_verified) {
          await current.getIdToken(true);
        }
        const snap = await getDoc(ref);
        if (!snap.exists()) {
          await ensureAndLoadProfile(current);
          return;
        }
        const existingData = snap.data() as Partial<UserProfileData>;
        await updateDoc(ref, {
          avatarUrl: sanitizeAvatarUrl(
            typeof existingData.avatarUrl === 'string' ? existingData.avatarUrl : current.photoURL
          ),
          browserEnabled: Boolean(settings.browserEnabled),
          soundEnabled: Boolean(settings.soundEnabled),
          notifyPlaced: Boolean(settings.notifyPlaced),
          notifyUpdated: Boolean(settings.notifyUpdated),
          notifyTop10Victor: Boolean(settings.notifyTop10Victor),
          sourcePointercrate: Boolean(settings.sources.pointercrate),
          sourceAredl: Boolean(settings.sources.aredl),
          updatedAt: serverTimestamp(),
        });
      } catch (err) {
        if (!auth.currentUser || auth.currentUser.uid !== current.uid) {
          return;
        }
        handleFirestoreError(err, OperationType.UPDATE, path);
      }
    },
    [ensureAndLoadProfile]
  );

  const updateAccountProfile = useCallback(
    async (updates: { displayName: string; avatarUrl: string }) => {
      const current = auth.currentUser;
      if (!current || !UID_PATTERN.test(current.uid)) {
        throw new Error('You must be signed in to update your profile.');
      }
      const nextName = sanitizeDisplayName(updates.displayName, current.email);
      const nextAvatar = sanitizeAvatarUrl(updates.avatarUrl);
      if (updates.avatarUrl.trim() !== '' && nextAvatar === '') {
        throw new Error('Invalid image format. Use an HTTPS image URL or upload a PNG/JPEG/WebP photo.');
      }

      try {
        await updateProfile(current, {
          displayName: nextName,
          photoURL: nextAvatar.startsWith('https://') ? nextAvatar : current.photoURL?.startsWith('https://') && nextAvatar === '' ? '' : undefined,
        });
      } catch (err) {
        throw new Error(mapAuthErrorMessage(err));
      }

      if (current.emailVerified) {
        const path = `users/${current.uid}`;
        const ref = doc(db, 'users', current.uid);
        try {
          const tokenRes = await current.getIdTokenResult();
          if (!tokenRes.claims.email_verified) {
            await current.getIdToken(true);
          }
          const snap = await getDoc(ref);
          if (!snap.exists()) {
            const local = loadNotificationSettings();
            await setDoc(ref, {
              uid: current.uid,
              displayName: nextName,
              avatarUrl: nextAvatar,
              role: 'member',
              browserEnabled: Boolean(local.browserEnabled),
              soundEnabled: Boolean(local.soundEnabled),
              notifyPlaced: Boolean(local.notifyPlaced),
              notifyUpdated: Boolean(local.notifyUpdated),
              notifyTop10Victor: Boolean(local.notifyTop10Victor),
              sourcePointercrate: Boolean(local.sources.pointercrate),
              sourceAredl: Boolean(local.sources.aredl),
              createdAt: serverTimestamp(),
              updatedAt: serverTimestamp(),
            });
          } else {
            await updateDoc(ref, {
              displayName: nextName,
              avatarUrl: nextAvatar,
              updatedAt: serverTimestamp(),
            });
          }
        } catch (err) {
          handleFirestoreError(err, OperationType.UPDATE, path);
        }
      }

      setProfile((prev) =>
        prev
          ? { ...prev, displayName: nextName, avatarUrl: nextAvatar }
          : {
              uid: current.uid,
              displayName: nextName,
              avatarUrl: nextAvatar,
              role: 'member',
              ...(() => {
                const local = loadNotificationSettings();
                return {
                  browserEnabled: local.browserEnabled,
                  soundEnabled: local.soundEnabled,
                  notifyPlaced: local.notifyPlaced,
                  notifyUpdated: local.notifyUpdated,
                  notifyTop10Victor: local.notifyTop10Victor,
                  sourcePointercrate: local.sources.pointercrate,
                  sourceAredl: local.sources.aredl,
                };
              })(),
            }
      );
      setUser(auth.currentUser);
      setStateTick((n) => n + 1);
    },
    []
  );

  const changeUserPassword = useCallback(async (currentPassword: string, newPassword: string) => {
    const current = auth.currentUser;
    if (!current || !current.email) {
      throw new Error('You must be signed in with an email account to change your password.');
    }
    const hasPasswordProvider = current.providerData.some((p) => p.providerId === 'password');
    if (!hasPasswordProvider) {
      throw new Error('This account uses Google Sign-In and does not have a password to change.');
    }
    try {
      const credential = EmailAuthProvider.credential(current.email, currentPassword);
      await reauthenticateWithCredential(current, credential);
      await updatePassword(current, newPassword);
    } catch (err) {
      throw new Error(mapAuthErrorMessage(err));
    }
  }, []);

  const deleteAccount = useCallback(async (currentPassword?: string) => {
    const current = auth.currentUser;
    if (!current) {
      throw new Error('You must be signed in to delete your account.');
    }
    const hasPasswordProvider = current.providerData.some((p) => p.providerId === 'password');
    const hasGoogleProvider = current.providerData.some((p) => p.providerId === 'google.com');

    try {
      if (hasPasswordProvider) {
        if (!current.email || !currentPassword) {
          throw new Error('Please enter your current password to confirm account deletion.');
        }
        const credential = EmailAuthProvider.credential(current.email, currentPassword);
        await reauthenticateWithCredential(current, credential);
      } else if (hasGoogleProvider) {
        const provider = new GoogleAuthProvider();
        await reauthenticateWithPopup(current, provider);
      }
    } catch (err) {
      throw new Error(mapAuthErrorMessage(err));
    }

    if (current.emailVerified && UID_PATTERN.test(current.uid)) {
      const path = `users/${current.uid}`;
      try {
        await deleteDoc(doc(db, 'users', current.uid));
      } catch (err) {
        handleFirestoreError(err, OperationType.DELETE, path);
      }
    }

    try {
      await deleteUser(current);
      setProfile(null);
      setUser(null);
      setStateTick((n) => n + 1);
    } catch (err) {
      throw new Error(mapAuthErrorMessage(err));
    }
  }, []);

  const onSettingsLoadedFromCloud = useCallback((cb: (settings: NotificationSettings) => void) => {
    cloudSettingsCallbackRef.current = cb;
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({
      user,
      authReady,
      profile,
      syncingProfile,
      signInWithEmail,
      registerWithEmail,
      sendResetEmail,
      signInWithGoogle,
      resendVerificationEmail,
      refreshVerificationStatus,
      signOutUser,
      syncSettingsToCloud,
      updateAccountProfile,
      changeUserPassword,
      deleteAccount,
      onSettingsLoadedFromCloud,
    }),
    [
      user,
      authReady,
      profile,
      syncingProfile,
      signInWithEmail,
      registerWithEmail,
      sendResetEmail,
      signInWithGoogle,
      resendVerificationEmail,
      refreshVerificationStatus,
      signOutUser,
      syncSettingsToCloud,
      updateAccountProfile,
      changeUserPassword,
      deleteAccount,
      onSettingsLoadedFromCloud,
    ]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider');
  return ctx;
}
