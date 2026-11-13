/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import { AuthManager } from '../core/authManager.ts';
import { AvatarManager, type AvatarCatalogItem } from '../core/avatarManager.ts';
import {
  X,
  User,
  Lock,
  Check,
  CheckCircle2,
  AlertCircle,
  Save,
  Camera,
  ShieldCheck,
  Image as ImageIcon,
  RefreshCw,
} from 'lucide-react';

export interface UserProfileModalProps {
  isOpen: boolean;
  onClose: () => void;
  user: {
    uid?: string;
    email: string | null;
    displayName?: string | null;
    photoURL?: string | null;
  } | null;
  onProfileUpdated?: () => void;
}

export const UserProfileModal: React.FC<UserProfileModalProps> = ({
  isOpen,
  onClose,
  user,
  onProfileUpdated,
}) => {
  const avatarManager = AvatarManager.getInstance();
  const authManager = AuthManager.getInstance();
  const currentUser = authManager.getCurrentUser();
  const currentUid = user?.uid || currentUser?.uid || '';

  const [displayName, setDisplayName] = useState<string>('');
  const [avatarLoadError, setAvatarLoadError] = useState<boolean>(false);
  const [isSaving, setIsSaving] = useState<boolean>(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [activeCatalog, setActiveCatalog] = useState<AvatarCatalogItem[]>(() =>
    avatarManager.getCatalogItems(false)
  );
  const [userMeta, setUserMeta] = useState(() => avatarManager.getUserMetadata(currentUid));

  useEffect(() => {
    if (user && isOpen) {
      setDisplayName(user.displayName || '');
      setAvatarLoadError(false);
      setErrorMessage(null);
      setSuccessMessage(null);
      avatarManager.observeCatalog();
      if (currentUid) {
        avatarManager.observeUserMetadata(currentUid);
      }
      setActiveCatalog(avatarManager.getCatalogItems(false));
      setUserMeta(avatarManager.getUserMetadata(currentUid));
    }
  }, [user, isOpen, currentUid, avatarManager]);

  useEffect(() => {
    const unsub = avatarManager.subscribe(() => {
      setActiveCatalog(avatarManager.getCatalogItems(false));
      setUserMeta(avatarManager.getUserMetadata(currentUid));
    });
    return () => unsub();
  }, [avatarManager, currentUid]);

  if (!isOpen || !user) return null;

  const effectiveAvatarUrl = avatarManager.getEffectivePlayerAvatarUrl({
    uid: currentUid,
    photoURL: user.photoURL,
  });

  const selectedAvatarType = userMeta?.avatarType || 'google';
  const selectedCatalogId =
    selectedAvatarType === 'catalog' ? userMeta?.avatarId || null : null;
  const isSelectedCatalogActive = Boolean(
    selectedCatalogId && activeCatalog.some((item) => item.avatarId === selectedCatalogId)
  );

  const handleSelectGoogle = async () => {
    setErrorMessage(null);
    setSuccessMessage(null);
    setIsSaving(true);
    try {
      const res = await avatarManager.selectGoogleAvatar();
      if (res.success) {
        setAvatarLoadError(false);
        onProfileUpdated?.();
      } else {
        setErrorMessage(res.message || 'Không thể chọn ảnh đại diện.');
      }
    } finally {
      setIsSaving(false);
    }
  };

  const handleSelectCatalog = async (item: AvatarCatalogItem) => {
    setErrorMessage(null);
    setSuccessMessage(null);
    setIsSaving(true);
    try {
      const res = await avatarManager.selectCatalogAvatar(item.avatarId);
      if (res.success) {
        setAvatarLoadError(false);
        onProfileUpdated?.();
      } else {
        setErrorMessage(res.message || 'Không thể chọn ảnh đại diện.');
      }
    } finally {
      setIsSaving(false);
    }
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSaving(true);
    setErrorMessage(null);
    setSuccessMessage(null);

    try {
      if (displayName.trim()) {
        await avatarManager.updateDisplayName(displayName.trim()).catch(() => {});
      }
      const res = await authManager.updateUserProfile({
        displayName: displayName.trim(),
        photoURL: user.photoURL || '',
      });

      if (!res.success) {
        setErrorMessage(res.error || 'Cập nhật thất bại. Vui lòng thử lại.');
      } else {
        setSuccessMessage('Cập nhật hồ sơ tài khoản thành công!');
        if (onProfileUpdated) {
          onProfileUpdated();
        }
        setTimeout(() => {
          onClose();
        }, 1200);
      }
    } catch (err: any) {
      setErrorMessage(err?.message || 'Lỗi khi cập nhật hồ sơ.');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[70] flex items-start justify-center overflow-y-auto pt-[max(0.75rem,env(safe-area-inset-top))] sm:pt-6 pb-[max(0.75rem,env(safe-area-inset-bottom))] px-4 bg-black/80 backdrop-blur-sm animate-fade-in select-none">
      <div className="relative w-full max-w-md bg-neutral-900 border border-neutral-700/80 rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[calc(100dvh-1.5rem)] sm:max-h-[calc(100dvh-3rem)]">
        {/* Modal Header */}
        <div className="sticky top-0 z-20 flex items-center justify-between px-5 py-4 border-b border-neutral-800 bg-neutral-950/95 backdrop-blur-md">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-400">
              <Camera className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-white tracking-wide">
                Cập Nhật Hồ Sơ &amp; Avatar
              </h2>
              <span className="text-[11px] text-neutral-400 font-mono">
                Thông tin người chơi đồng bộ toàn hệ thống
              </span>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg text-neutral-400 hover:text-white hover:bg-neutral-800 transition-colors cursor-pointer"
            title="Đóng"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Body / Form */}
        <form onSubmit={handleSave} className="p-5 flex-1 overflow-y-auto space-y-4">
          {/* Avatar Preview & Image-Only Grid (No Upload Button, No Technical Metadata) */}
          <div className="flex flex-col items-center justify-center p-4 rounded-2xl bg-neutral-950/70 border border-amber-500/30 gap-3 shadow-inner">
            <div className="relative w-24 h-24 rounded-full border-2 border-amber-400 p-1 bg-neutral-950 overflow-hidden shadow-xl ring-4 ring-amber-500/15 flex items-center justify-center">
              {effectiveAvatarUrl && !avatarLoadError ? (
                <img
                  src={effectiveAvatarUrl}
                  alt="Avatar"
                  className="w-full h-full rounded-full object-cover"
                  onError={() => {
                    setAvatarLoadError(true);
                  }}
                />
              ) : (
                <div className="w-full h-full rounded-full bg-neutral-800 flex items-center justify-center text-amber-400">
                  <User className="w-11 h-11" />
                </div>
              )}
              <span className="absolute bottom-1 right-1 w-5 h-5 rounded-full bg-emerald-500 border-2 border-neutral-950 flex items-center justify-center text-black shadow">
                <CheckCircle2 className="w-3.5 h-3.5" />
              </span>
            </div>

            {activeCatalog.length > 0 && (
              <div className="grid grid-cols-4 gap-2.5 w-full justify-items-center pt-1">
                <button
                  type="button"
                  disabled={isSaving}
                  onClick={handleSelectGoogle}
                  aria-label="Chọn ảnh đại diện mặc định"
                  className={`relative p-1.5 rounded-xl border-2 transition-all flex items-center justify-center cursor-pointer ${
                    selectedAvatarType === 'google' || !isSelectedCatalogActive
                      ? 'border-amber-500 bg-amber-950/40'
                      : 'border-neutral-800 bg-neutral-900 hover:border-amber-500/50'
                  }`}
                >
                  {(selectedAvatarType === 'google' || !isSelectedCatalogActive) && (
                    <span className="absolute top-1 right-1 w-3.5 h-3.5 rounded-full bg-amber-500 text-black flex items-center justify-center z-10">
                      <Check className="w-2.5 h-2.5 stroke-[3]" />
                    </span>
                  )}
                  <div className="w-12 h-12 rounded-full overflow-hidden bg-neutral-800 flex items-center justify-center">
                    {user.photoURL ? (
                      <img src={user.photoURL} alt="Avatar" className="w-full h-full object-cover" />
                    ) : (
                      <User className="w-6 h-6 text-amber-400" />
                    )}
                  </div>
                </button>

                {activeCatalog.map((item) => {
                  const itemUrl = avatarManager.getCatalogItemUrl(item.storagePath);
                  const isLoadingUrl = avatarManager.isCatalogItemUrlLoading(item.storagePath);
                  const isSelected =
                    selectedAvatarType === 'catalog' && selectedCatalogId === item.avatarId;

                  return (
                    <button
                      key={item.avatarId}
                      type="button"
                      disabled={isSaving}
                      onClick={() => handleSelectCatalog(item)}
                      aria-label="Chọn ảnh đại diện"
                      className={`relative p-1.5 rounded-xl border-2 transition-all flex items-center justify-center cursor-pointer ${
                        isSelected
                          ? 'border-emerald-500 bg-emerald-950/40'
                          : 'border-neutral-800 bg-neutral-900 hover:border-emerald-500/50'
                      }`}
                    >
                      {isSelected && (
                        <span className="absolute top-1 right-1 w-3.5 h-3.5 rounded-full bg-emerald-500 text-black flex items-center justify-center z-10">
                          <Check className="w-2.5 h-2.5 stroke-[3]" />
                        </span>
                      )}
                      <div className="w-12 h-12 rounded-full overflow-hidden bg-neutral-800 flex items-center justify-center">
                        {itemUrl ? (
                          <img src={itemUrl} alt="Avatar" className="w-full h-full object-cover" />
                        ) : isLoadingUrl ? (
                          <RefreshCw className="w-4 h-4 text-amber-400 animate-spin" />
                        ) : (
                          <ImageIcon className="w-5 h-5 text-neutral-500" />
                        )}
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          {/* Feedback messages */}
          {successMessage && (
            <div className="p-3 rounded-xl bg-emerald-950/90 border border-emerald-800 text-emerald-200 text-xs flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
              <span>{successMessage}</span>
            </div>
          )}

          {errorMessage && (
            <div className="p-3 rounded-xl bg-rose-950/90 border border-rose-800 text-rose-200 text-xs flex items-center gap-2">
              <AlertCircle className="w-4 h-4 text-rose-400 shrink-0" />
              <span>{errorMessage}</span>
            </div>
          )}

          {/* Read-only Google Email */}
          <div>
            <label className="block text-xs font-semibold text-neutral-300 mb-1.5 flex items-center justify-between">
              <span>Email tài khoản Google</span>
              <span className="inline-flex items-center gap-1 text-[10px] text-emerald-400 font-mono">
                <ShieldCheck className="w-3 h-3" /> Đã xác thực
              </span>
            </label>
            <div className="relative">
              <input
                type="text"
                readOnly
                value={user.email || ''}
                className="w-full px-3.5 py-2.5 rounded-xl bg-neutral-950/90 border border-neutral-800 text-neutral-400 text-xs font-mono cursor-not-allowed select-all pr-8"
              />
              <Lock className="w-3.5 h-3.5 text-neutral-500 absolute right-3 top-1/2 -translate-y-1/2" />
            </div>
            <span className="text-[10px] text-neutral-500 mt-1 block">
              Email Google là định danh chính thức của tài khoản, không thể thay đổi.
            </span>
          </div>

          {/* Display Name Input */}
          <div>
            <label className="block text-xs font-semibold text-neutral-300 mb-1.5">
              Tên hiển thị người chơi (Display Name)
            </label>
            <div className="relative">
              <input
                type="text"
                maxLength={32}
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                placeholder="Nhập biệt danh của bạn (VD: Chiến Tướng Tank)"
                className="w-full px-3.5 py-2.5 rounded-xl bg-neutral-800/80 border border-neutral-700 text-white text-xs focus:outline-none focus:border-amber-500 focus:ring-1 focus:ring-amber-500 transition-all placeholder:text-neutral-500"
              />
            </div>
            <span className="text-[10px] text-neutral-500 mt-1 block">
              Tối đa 32 ký tự. Tên này sẽ xuất hiện trên bảng thành tích và giao diện.
            </span>
          </div>

          {/* Action Buttons */}
          <div className="flex items-center gap-2 pt-3 border-t border-neutral-800">
            <button
              type="button"
              onClick={onClose}
              disabled={isSaving}
              className="w-1/3 py-2.5 px-4 rounded-xl bg-neutral-800 hover:bg-neutral-700 text-neutral-300 font-semibold text-xs border border-neutral-700 transition-all active:scale-95 cursor-pointer disabled:opacity-50"
            >
              HỦY
            </button>
            <button
              type="submit"
              disabled={isSaving}
              className="w-2/3 py-2.5 px-4 rounded-xl bg-amber-500 hover:bg-amber-400 text-black font-extrabold text-xs shadow-lg shadow-amber-500/20 transition-all active:scale-95 flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-50"
            >
              {isSaving ? (
                <div className="w-4 h-4 border-2 border-black border-t-transparent rounded-full animate-spin" />
              ) : (
                <>
                  <Save className="w-3.5 h-3.5" />
                  <span>LƯU HỒ SƠ</span>
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
