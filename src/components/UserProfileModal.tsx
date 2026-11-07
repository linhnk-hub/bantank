/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import { AuthManager } from '../core/authManager.ts';
import {
  X,
  User,
  Image,
  Lock,
  CheckCircle2,
  AlertCircle,
  Save,
  Camera,
  ShieldCheck,
} from 'lucide-react';

export interface UserProfileModalProps {
  isOpen: boolean;
  onClose: () => void;
  user: {
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
  const [displayName, setDisplayName] = useState<string>('');
  const [photoURL, setPhotoURL] = useState<string>('');
  const [isSaving, setIsSaving] = useState<boolean>(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  useEffect(() => {
    if (user && isOpen) {
      setDisplayName(user.displayName || '');
      setPhotoURL(user.photoURL || '');
      setErrorMessage(null);
      setSuccessMessage(null);
    }
  }, [user, isOpen]);

  if (!isOpen || !user) return null;

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSaving(true);
    setErrorMessage(null);
    setSuccessMessage(null);

    // Basic URL validation if photoURL provided
    const trimmedPhoto = photoURL.trim();
    if (trimmedPhoto && !trimmedPhoto.startsWith('http://') && !trimmedPhoto.startsWith('https://')) {
      setIsSaving(false);
      setErrorMessage('Đường dẫn ảnh đại diện phải bắt đầu bằng http:// hoặc https://');
      return;
    }

    try {
      const res = await AuthManager.getInstance().updateUserProfile({
        displayName: displayName.trim(),
        photoURL: trimmedPhoto,
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
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-fade-in select-none">
      <div className="relative w-full max-w-md bg-neutral-900 border border-neutral-700/80 rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
        {/* Modal Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-neutral-800 bg-neutral-950/70">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-400">
              <Camera className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-white tracking-wide">
                Cập Nhật Hồ Sơ
              </h2>
              <span className="text-[11px] text-neutral-400 font-mono">
                Thông tin người chơi
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
          {/* Avatar Preview Section */}
          <div className="flex flex-col items-center justify-center pt-1 pb-3">
            <div className="relative w-20 h-20 rounded-full border-2 border-amber-500/50 p-1 bg-neutral-950 overflow-hidden shadow-lg flex items-center justify-center mb-2">
              {photoURL.trim() ? (
                <img
                  src={photoURL.trim()}
                  alt="Avatar Preview"
                  className="w-full h-full rounded-full object-cover"
                  onError={(e) => {
                    // Fallback to placeholder if URL broken
                    e.currentTarget.style.display = 'none';
                  }}
                />
              ) : (
                <div className="w-full h-full rounded-full bg-neutral-800 flex items-center justify-center text-amber-400">
                  <User className="w-10 h-10" />
                </div>
              )}
            </div>
            <span className="text-[11px] text-neutral-400 font-medium">
              Ảnh xem trước (Live Preview)
            </span>
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

          {/* Photo URL Input */}
          <div>
            <label className="block text-xs font-semibold text-neutral-300 mb-1.5 flex items-center gap-1.5">
              <Image className="w-3.5 h-3.5 text-amber-400" />
              <span>Đường dẫn ảnh đại diện (Avatar URL)</span>
            </label>
            <input
              type="url"
              value={photoURL}
              onChange={(e) => setPhotoURL(e.target.value)}
              placeholder="https://i.ibb.co/... hoặc URL ảnh HTTPS trực tiếp"
              className="w-full px-3.5 py-2.5 rounded-xl bg-neutral-800/80 border border-neutral-700 text-white text-xs font-mono focus:outline-none focus:border-amber-500 focus:ring-1 focus:ring-amber-500 transition-all placeholder:text-neutral-500"
            />
            <span className="text-[10px] text-neutral-500 mt-1 block">
              Hỗ trợ ảnh định dạng PNG, JPG, WebP qua đường dẫn mạng hợp lệ.
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
