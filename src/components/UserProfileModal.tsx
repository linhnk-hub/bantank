/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useRef } from 'react';
import { AuthManager, SUPER_ADMIN_EMAIL, isSuperAdminUser } from '../core/authManager.ts';
import { AvatarManager } from '../core/avatarManager.ts';
import { X, User, Image, Lock, CheckCircle2, AlertCircle, Save, Camera, ShieldCheck, Upload } from 'lucide-react';

export interface UserProfileModalProps {
  isOpen: boolean;
  onClose: () => void;
  user: { uid?: string; email: string | null; displayName?: string | null; photoURL?: string | null; } | null;
  onProfileUpdated?: () => void;
}

export const UserProfileModal: React.FC<UserProfileModalProps> = ({ isOpen, onClose, user, onProfileUpdated }) => {
  const avatarManager = AvatarManager.getInstance();
  const authManager = AuthManager.getInstance();
  const [displayName, setDisplayName] = useState<string>('');
  const [photoURL, setPhotoURL] = useState<string>('');
  const [avatarLoadError, setAvatarLoadError] = useState<boolean>(false);
  const [isSaving, setIsSaving] = useState<boolean>(false);
  const [isUploadingFile, setIsUploadingFile] = useState<boolean>(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const currentUser = authManager.getCurrentUser();
  const isSuperAdmin = isSuperAdminUser(currentUser) || Boolean(user?.email && user.email.trim().toLowerCase() === SUPER_ADMIN_EMAIL);

  useEffect(() => {
    if (user && isOpen) {
      setDisplayName(user.displayName || '');
      const effectiveUrl = avatarManager.getEffectivePlayerAvatarUrl({ uid: user.uid || currentUser?.uid, photoURL: user.photoURL });
      setPhotoURL(effectiveUrl || user.photoURL || ''); setAvatarLoadError(false); setErrorMessage(null); setSuccessMessage(null);
    }
  }, [user, isOpen]);

  useEffect(() => { setAvatarLoadError(false); }, [photoURL]);
  if (!isOpen || !user) return null;

  const handleSuperAdminFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]; e.target.value = ''; if (!file) return;
    setErrorMessage(null); setSuccessMessage(null); setIsUploadingFile(true);
    try {
      const res = await avatarManager.uploadAndApplySuperAdminAvatar(file, displayName);
      if (!res.success) setErrorMessage(res.message || 'Không thể tải ảnh đại diện lên.');
      else {
        const nextUrl = res.avatarUrl || avatarManager.getEffectivePlayerAvatarUrl({ uid: user.uid || currentUser?.uid, photoURL: user.photoURL });
        if (nextUrl) { setPhotoURL(nextUrl); setAvatarLoadError(false); }
        setSuccessMessage(res.message || 'Cập nhật thành công!'); onProfileUpdated?.();
      }
    } catch (err: any) { setErrorMessage(err?.message || 'Lỗi hệ thống.'); } finally { setIsUploadingFile(false); }
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault(); setIsSaving(true); setErrorMessage(null); setSuccessMessage(null);
    const trimmedPhoto = photoURL.trim();
    if (trimmedPhoto && !trimmedPhoto.startsWith('http://') && !trimmedPhoto.startsWith('https://') && !trimmedPhoto.startsWith('blob:')) { setIsSaving(false); setErrorMessage('Đường dẫn ảnh đại diện phải bắt đầu bằng http:// hoặc https://'); return; }
    try {
      if (displayName.trim()) await avatarManager.updateDisplayName(displayName.trim()).catch(() => {});
      const res = await authManager.updateUserProfile({ displayName: displayName.trim(), photoURL: trimmedPhoto.startsWith('blob:') ? (user.photoURL || '') : trimmedPhoto });
      if (!res.success) setErrorMessage(res.error || 'Cập nhật thất bại.');
      else { setSuccessMessage('Cập nhật hồ sơ tài khoản thành công!'); if (onProfileUpdated) onProfileUpdated(); setTimeout(() => onClose(), 1200); }
    } catch (err: any) { setErrorMessage(err?.message || 'Lỗi khi cập nhật hồ sơ.'); } finally { setIsSaving(false); }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/85 backdrop-blur-md pt-[max(0.75rem,env(safe-area-inset-top))] sm:pt-10 pb-[max(0.75rem,env(safe-area-inset-bottom))] px-4 font-display">
      <div className="bg-black border-4 border-neo-amber pixel-corners w-full max-w-md shadow-[0_0_30px_rgba(255,184,0,0.3)] flex flex-col max-h-[calc(100dvh-1.5rem)] sm:max-h-[calc(100dvh-3rem)]">
        <div className="flex items-center justify-between border-b-2 border-neo-amber bg-black px-6 py-4 shrink-0">
          <h2 className="font-pixel text-3xl text-neo-amber uppercase">PROFILE UPLINK</h2>
          <button onClick={onClose} className="p-2 border-2 border-gray-700 hover:border-neo-amber text-gray-400 hover:text-neo-amber transition-colors pixel-corners"><X className="w-5 h-5" /></button>
        </div>

        <form onSubmit={handleSave} className="p-6 flex-1 overflow-y-auto space-y-6">
          <div className="flex flex-col items-center justify-center p-6 border-2 border-gray-800 bg-gray-900/50 pixel-corners gap-4">
            <div className="relative w-28 h-28 border-4 border-neo-cyan bg-black pixel-corners flex items-center justify-center shadow-[0_0_15px_rgba(0,240,255,0.4)]">
              {photoURL.trim() && !avatarLoadError ? (
                <img src={photoURL.trim()} alt="Avatar" className="w-full h-full object-cover pixel-corners" onError={() => setAvatarLoadError(true)} />
              ) : (
                <User className="w-12 h-12 text-neo-cyan" />
              )}
            </div>
            {isSuperAdmin && (
              <>
                <input ref={fileInputRef} type="file" accept="image/*" onChange={handleSuperAdminFileUpload} className="hidden" />
                <button type="button" disabled={isUploadingFile || isSaving} onClick={() => fileInputRef.current?.click()} className="btn-arcade-outline px-4 py-2 text-sm !border-neo-cyan !text-neo-cyan">
                  <Upload className="w-4 h-4 inline-block mr-2" />{isUploadingFile ? 'UPLOADING...' : 'UPLOAD LOCAL'}
                </button>
              </>
            )}
          </div>

          {successMessage && <div className="p-3 bg-green-900/40 border-2 border-green-500 text-green-400 font-pixel text-xl pixel-corners flex items-center gap-2"><CheckCircle2 className="w-5 h-5" /> {successMessage}</div>}
          {errorMessage && <div className="p-3 bg-neo-rose/20 border-2 border-neo-rose text-neo-rose font-pixel text-xl pixel-corners flex items-center gap-2"><AlertCircle className="w-5 h-5" /> {errorMessage}</div>}

          <div className="space-y-4">
            <div>
              <label className="block font-pixel text-xl text-neo-amber mb-2">GOOGLE EMAIL (LOCKED)</label>
              <div className="relative">
                <input type="text" readOnly value={user.email || ''} className="w-full px-4 py-3 bg-gray-900 border-2 border-gray-700 text-gray-500 font-pixel text-2xl pixel-corners cursor-not-allowed pr-10" />
                <Lock className="w-5 h-5 text-gray-600 absolute right-4 top-1/2 -translate-y-1/2" />
              </div>
            </div>

            <div>
              <label className="block font-pixel text-xl text-neo-cyan mb-2">CALLSIGN (DISPLAY NAME)</label>
              <input type="text" maxLength={32} value={displayName} onChange={(e) => setDisplayName(e.target.value)} placeholder="ENTER CALLSIGN..." className="w-full px-4 py-3 bg-black border-2 border-gray-700 focus:border-neo-cyan focus:outline-none text-white font-pixel text-2xl pixel-corners uppercase" />
            </div>

            <div>
              <label className="block font-pixel text-xl text-neo-cyan mb-2">AVATAR DATA LINK (URL)</label>
              <input type="url" value={photoURL} onChange={(e) => setPhotoURL(e.target.value)} placeholder="HTTPS://..." className="w-full px-4 py-3 bg-black border-2 border-gray-700 focus:border-neo-cyan focus:outline-none text-white font-pixel text-xl pixel-corners" />
            </div>
          </div>

          <div className="flex gap-4 pt-4 border-t-2 border-gray-800">
            <button type="button" onClick={onClose} disabled={isSaving || isUploadingFile} className="btn-arcade-outline flex-1 py-4 text-xl !border-gray-500 !text-gray-400">CANCEL</button>
            <button type="submit" disabled={isSaving || isUploadingFile} className="btn-arcade flex-[2] py-4 text-2xl flex items-center justify-center gap-2">
              {isSaving ? 'TRANSMITTING...' : <><Save className="w-5 h-5" /> SAVE PROFILE</>}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
