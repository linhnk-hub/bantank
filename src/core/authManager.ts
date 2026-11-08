/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  GoogleAuthProvider,
  signInWithPopup,
  signOut as fbSignOut,
  onAuthStateChanged,
  getIdToken,
  updateProfile,
  type User,
} from 'firebase/auth';
import { getFirebaseAuth } from './firebaseConfig.ts';

export interface AuthValidationResult {
  isValid: boolean;
  user: User | null;
  errorMessage: string | null;
}

export type AuthStateListener = (user: User | null) => void;

/**
 * Địa chỉ email Super Admin chính thức và duy nhất của hệ thống Bắn Tank Online.
 */
export const SUPER_ADMIN_EMAIL = 'linhnk.online@gmail.com';

export interface ValidatedUserAccount {
  uid: string;
  email: string | null;
  emailVerified: boolean;
  displayName?: string | null;
  photoURL?: string | null;
  providerData?: Array<{ providerId: string }>;
  providerIds?: string[];
}

/**
 * Kiểm tra xem người dùng Firebase hiện tại có phải là Super Admin hợp lệ hay không.
 * Bắt buộc:
 * 1. Đã xác thực Google hợp lệ (validatePersonalGmailUser(user).isValid === true)
 * 2. Email khớp chính xác với SUPER_ADMIN_EMAIL ('linhnk.online@gmail.com')
 */
export function isSuperAdminUser(user: User | ValidatedUserAccount | null | undefined): boolean {
  if (!user) return false;
  const validation = validatePersonalGmailUser(user as User);
  if (!validation.isValid) return false;
  return (user.email || '').trim().toLowerCase() === SUPER_ADMIN_EMAIL;
}

/**
 * Trả về tên hiển thị của người dùng trên giao diện (Header / Banner / Lobby).
 * - Nếu người dùng có displayName hợp lệ: chỉ hiển thị displayName (không kèm email).
 * - Nếu người dùng chưa có displayName: dùng tên mặc định hợp lý (phần tên trước @ của email hoặc "Chiến Binh Tank").
 */
export function getUserDisplayLabel(
  user: { displayName?: string | null; email?: string | null } | null | undefined
): string {
  if (!user) return 'Chiến Binh Tank';
  const trimmedName = (user.displayName || '').trim();
  if (trimmedName.length > 0) {
    return trimmedName;
  }
  const email = (user.email || '').trim();
  if (email.includes('@')) {
    const prefix = email.split('@')[0].trim();
    if (prefix.length > 0) {
      return prefix;
    }
  }
  return 'Chiến Binh Tank';
}

/**
 * Validates whether the given Firebase user is a verified personal Gmail account.
 * Rejects Google Workspace domains, unverified emails, and non-Google providers.
 */
export function validatePersonalGmailUser(user: User | ValidatedUserAccount | null): AuthValidationResult {
  if (!user) {
    return {
      isValid: false,
      user: null,
      errorMessage: 'Chưa có thông tin người dùng đăng nhập.',
    };
  }

  // 1. Must be Google sign-in provider
  const u = user as ValidatedUserAccount;
  const isGoogleProvider = Array.isArray(u.providerData)
    ? u.providerData.some((p) => p.providerId === 'google.com')
    : Array.isArray(u.providerIds)
    ? u.providerIds.includes('google.com')
    : false;
  if (!isGoogleProvider) {
    return {
      isValid: false,
      user: user as User,
      errorMessage: 'Chỉ chấp nhận đăng nhập qua tài khoản Google.',
    };
  }

  // 2. Email must be verified
  if (!user.emailVerified) {
    return {
      isValid: false,
      user: user as User,
      errorMessage: 'Chỉ chấp nhận tài khoản Gmail cá nhân đã xác minh (@gmail.com).',
    };
  }

  // 3. Email must end strictly with @gmail.com or @googlemail.com
  const email = (user.email || '').trim().toLowerCase();
  const gmailRegex = /^[a-zA-Z0-9._%+-]+@(gmail|googlemail)\.com$/;
  if (!gmailRegex.test(email)) {
    return {
      isValid: false,
      user: user as User,
      errorMessage: 'Chỉ chấp nhận tài khoản Gmail cá nhân đã xác minh (@gmail.com).',
    };
  }

  return {
    isValid: true,
    user: user as User,
    errorMessage: null,
  };
}

export type TokenRefreshResult =
  | { status: 'SUCCESS'; token: string }
  | { status: 'NETWORK_ERROR'; error: Error }
  | { status: 'AUTH_INVALID'; error: Error }
  | { status: 'UNCLASSIFIED'; error: Error };

export class AuthManager {
  private static instance: AuthManager;
  private currentUser: User | null = null;
  private listeners: Set<AuthStateListener> = new Set();
  private auth = getFirebaseAuth();

  private constructor() {
    onAuthStateChanged(this.auth, (user) => {
      if (user) {
        this.applyStoredProfileOverride(user);
      }
      this.currentUser = user;
      this.notifyListeners(user);
    });
  }

  public static getInstance(): AuthManager {
    if (!AuthManager.instance) {
      AuthManager.instance = new AuthManager();
    }
    return AuthManager.instance;
  }

  public isSuperAdmin(): boolean {
    return isSuperAdminUser(this.getCurrentUser());
  }

  private getProfileStorageKey(user: { uid?: string; email?: string | null }): string {
    return `bantank_profile_${user.uid || user.email || 'default'}`;
  }

  private applyStoredProfileOverride(user: User): void {
    try {
      if (typeof window !== 'undefined' && window.localStorage) {
        const raw = window.localStorage.getItem(this.getProfileStorageKey(user));
        if (raw) {
          const parsed = JSON.parse(raw);
          if (typeof parsed.displayName === 'string' && parsed.displayName.trim().length > 0) {
            (user as any).displayName = parsed.displayName.trim();
          }
          if (typeof parsed.photoURL === 'string') {
            (user as any).photoURL = parsed.photoURL.trim();
          }
        }
      }
    } catch {
      // Ignore storage errors
    }
  }

  public subscribe(listener: AuthStateListener): () => void {
    this.listeners.add(listener);
    if (this.currentUser) {
      this.applyStoredProfileOverride(this.currentUser);
    }
    listener(this.currentUser);
    return () => {
      this.listeners.delete(listener);
    };
  }

  private notifyListeners(user: User | null): void {
    this.listeners.forEach((fn) => {
      try {
        fn(user);
      } catch (e) {
        console.error('[AuthManager] listener error:', e);
      }
    });
  }

  public getCurrentUser(): User | null {
    const user = this.auth.currentUser || this.currentUser;
    if (user) {
      this.applyStoredProfileOverride(user);
    }
    return user;
  }

  /**
   * Signs in using GoogleAuthProvider popup.
   * Enforces strict personal Gmail validation; immediately signs out if invalid.
   */
  public async signInWithGoogle(): Promise<AuthValidationResult> {
    const provider = new GoogleAuthProvider();
    provider.setCustomParameters({ prompt: 'select_account' });

    try {
      const result = await signInWithPopup(this.auth, provider);
      const validation = validatePersonalGmailUser(result.user);

      if (!validation.isValid) {
        // Disallowed account: sign out immediately
        await this.signOut();
        return {
          isValid: false,
          user: null,
          errorMessage: validation.errorMessage,
        };
      }

      this.applyStoredProfileOverride(result.user);
      this.currentUser = result.user;
      return validation;
    } catch (error: any) {
      return {
        isValid: false,
        user: null,
        errorMessage: error?.message || 'Đăng nhập Google thất bại.',
      };
    }
  }

  /**
   * Silent ID Token refresh using getIdToken(user, true).
   * Classifies network errors vs terminal auth invalidation without guessing.
   */
  public async refreshIdToken(): Promise<TokenRefreshResult> {
    const user = this.getCurrentUser();
    if (!user) {
      return {
        status: 'AUTH_INVALID',
        error: new Error('Không có thông tin người dùng để làm mới xác thực.'),
      };
    }

    try {
      const token = await getIdToken(user, true);
      return { status: 'SUCCESS', token };
    } catch (err: any) {
      const code = err?.code || '';
      const msg = err?.message || String(err);

      // Network errors
      if (
        code.includes('network-request-failed') ||
        code.includes('timeout') ||
        (typeof navigator !== 'undefined' && !navigator.onLine)
      ) {
        return { status: 'NETWORK_ERROR', error: err instanceof Error ? err : new Error(msg) };
      }

      // Terminal auth invalidation
      if (
        code.includes('user-disabled') ||
        code.includes('user-token-expired') ||
        code.includes('invalid-user-token') ||
        code.includes('user-not-found')
      ) {
        return { status: 'AUTH_INVALID', error: err instanceof Error ? err : new Error(msg) };
      }

      return { status: 'UNCLASSIFIED', error: err instanceof Error ? err : new Error(msg) };
    }
  }

  /**
   * Updates user profile (displayName and photoURL) via Firebase Authentication.
   * Strictly preserves email, UID, tokens, and Firestore security rules.
   */
  public async updateUserProfile(profile: { displayName?: string; photoURL?: string }): Promise<{ success: boolean; error?: string }> {
    const user = this.getCurrentUser();
    if (!user) {
      return { success: false, error: 'Chưa đăng nhập.' };
    }
    const nextDisplayName =
      profile.displayName !== undefined ? profile.displayName.trim() : (user.displayName || '');
    const nextPhotoURL =
      profile.photoURL !== undefined ? profile.photoURL.trim() : (user.photoURL || '');

    try {
      if (typeof updateProfile === 'function' && this.auth?.currentUser) {
        await updateProfile(user, {
          displayName: nextDisplayName,
          photoURL: nextPhotoURL,
        });
      }
      (user as any).displayName = nextDisplayName;
      (user as any).photoURL = nextPhotoURL;

      try {
        if (typeof window !== 'undefined' && window.localStorage) {
          window.localStorage.setItem(
            this.getProfileStorageKey(user),
            JSON.stringify({
              displayName: nextDisplayName,
              photoURL: nextPhotoURL,
            })
          );
        }
      } catch {
        // Ignore storage write errors
      }

      this.currentUser = this.auth?.currentUser || user;
      this.notifyListeners(this.currentUser);
      return { success: true };
    } catch (err: any) {
      return { success: false, error: err?.message || 'Cập nhật hồ sơ thất bại.' };
    }
  }

  public async signOut(): Promise<void> {
    try {
      await fbSignOut(this.auth);
    } catch (e) {
      console.warn('[AuthManager] signOut error:', e);
    }
    this.currentUser = null;
  }
}
