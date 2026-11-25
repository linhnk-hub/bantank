/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useRef } from 'react';
import { AuthManager } from '../core/authManager.ts';
import { AvatarManager, type AvatarCatalogItem } from '../core/avatarManager.ts';
import { PlayerStatsManager } from '../core/playerStatsManager.ts';
import { useLanguage } from '../core/i18n.ts';
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
  Award,
  Shield,
  Sparkles,
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
  const { lang, t } = useLanguage();
  const avatarManager = AvatarManager.getInstance();
  const authManager = AuthManager.getInstance();
  const currentUser = authManager.getCurrentUser();
  const currentUid = user?.uid || currentUser?.uid || '';

  const [displayName, setDisplayName] = useState<string>('');
  const [avatarLoadError, setAvatarLoadError] = useState<boolean>(false);
  const [isSaving, setIsSaving] = useState<boolean>(false);
  const [optimisticAvatar, setOptimisticAvatar] = useState<
    { type: 'google' } | { type: 'catalog'; avatarId: string; url: string | null } | null
  >(null);
  const avatarSelectionSeqRef = useRef<number>(0);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [activeCatalog, setActiveCatalog] = useState<AvatarCatalogItem[]>(() =>
    avatarManager.getCatalogItems(false)
  );
  const playerStatsMgr = PlayerStatsManager.getInstance();
  const [userMeta, setUserMeta] = useState(() => avatarManager.getUserMetadata(currentUid));
  const [playerStats, setPlayerStats] = useState(() =>
    playerStatsMgr.getPlayerStatisticsSnapshot(currentUid)
  );

  useEffect(() => {
    if (user && isOpen) {
      setDisplayName(user.displayName || '');
      setAvatarLoadError(false);
      setOptimisticAvatar(null);
      setErrorMessage(null);
      setSuccessMessage(null);
      avatarManager.observeCatalog();
      if (currentUid) {
        avatarManager.observeUserMetadata(currentUid);
        void playerStatsMgr.refreshCloudUserStatsOnce(currentUid);
      }
      setActiveCatalog(avatarManager.getCatalogItems(false));
      setUserMeta(avatarManager.getUserMetadata(currentUid));
      setPlayerStats(playerStatsMgr.getPlayerStatisticsSnapshot(currentUid));
    }
  }, [user, isOpen, currentUid, avatarManager, playerStatsMgr]);

  useEffect(() => {
    const unsubAvatar = avatarManager.subscribe(() => {
      setActiveCatalog(avatarManager.getCatalogItems(false));
      setUserMeta(avatarManager.getUserMetadata(currentUid));
    });
    const unsubStats = playerStatsMgr.subscribe(() => {
      setPlayerStats(playerStatsMgr.getPlayerStatisticsSnapshot(currentUid));
    });
    return () => {
      unsubAvatar();
      unsubStats();
    };
  }, [avatarManager, playerStatsMgr, currentUid]);

  if (!isOpen || !user) return null;

  const selectedAvatarType = optimisticAvatar
    ? optimisticAvatar.type
    : userMeta?.avatarType || 'google';
  const selectedCatalogId =
    selectedAvatarType === 'catalog'
      ? optimisticAvatar?.type === 'catalog'
        ? optimisticAvatar.avatarId
        : userMeta?.avatarId || null
      : null;
  const isSelectedCatalogActive = Boolean(
    selectedCatalogId && activeCatalog.some((item) => item.avatarId === selectedCatalogId)
  );
  const effectiveAvatarUrl =
    optimisticAvatar?.type === 'google'
      ? user.photoURL || null
      : optimisticAvatar?.type === 'catalog'
        ? optimisticAvatar.url ||
          avatarManager.getEffectivePlayerAvatarUrl({
            uid: currentUid,
            photoURL: user.photoURL,
          })
        : avatarManager.getEffectivePlayerAvatarUrl({
            uid: currentUid,
            photoURL: user.photoURL,
          });

  const handleSelectGoogle = async () => {
    setErrorMessage(null);
    setSuccessMessage(null);
    setAvatarLoadError(false);
    setOptimisticAvatar({ type: 'google' });
    const seq = ++avatarSelectionSeqRef.current;
    const res = await avatarManager.selectGoogleAvatar();
    if (seq !== avatarSelectionSeqRef.current) return;
    if (res.success) {
      setUserMeta(avatarManager.getUserMetadata(currentUid));
      setOptimisticAvatar(null);
      onProfileUpdated?.();
    } else {
      setOptimisticAvatar(null);
      setErrorMessage(res.message || 'Không thể chọn ảnh đại diện.');
    }
  };

  const handleSelectCatalog = async (item: AvatarCatalogItem) => {
    setErrorMessage(null);
    setSuccessMessage(null);
    setAvatarLoadError(false);
    setOptimisticAvatar({
      type: 'catalog',
      avatarId: item.avatarId,
      url: avatarManager.getCatalogItemUrl(item.storagePath),
    });
    const seq = ++avatarSelectionSeqRef.current;
    const res = await avatarManager.selectCatalogAvatar(item.avatarId);
    if (seq !== avatarSelectionSeqRef.current) return;
    if (res.success) {
      setUserMeta(avatarManager.getUserMetadata(currentUid));
      setOptimisticAvatar(null);
      onProfileUpdated?.();
    } else {
      setOptimisticAvatar(null);
      setErrorMessage(res.message || 'Không thể chọn ảnh đại diện.');
    }
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSaving(true);
    setErrorMessage(null);
    setSuccessMessage(null);

    try {
      const trimmed = displayName.trim();
      if (!trimmed) {
        setErrorMessage('Tên hiển thị không được để trống.');
        return;
      }
      const nameRes = await avatarManager.updateDisplayName(trimmed);
      if (!nameRes.success) {
        setErrorMessage(nameRes.message || 'Tên bị trùng trong hệ thống. Vui lòng chọn tên khác.');
        return;
      }
      const res = await authManager.updateUserProfile(
        {
          displayName: trimmed,
          photoURL: user.photoURL || '',
        },
        { skipUniquenessCheck: true }
      );

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
                  onClick={handleSelectGoogle}
                  aria-label="Chọn ảnh đại diện mặc định"
                  className={`relative p-1.5 rounded-xl border-2 transition-colors flex items-center justify-center cursor-pointer ${
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
                      onClick={() => handleSelectCatalog(item)}
                      aria-label="Chọn ảnh đại diện"
                      className={`relative p-1.5 rounded-xl border-2 transition-colors flex items-center justify-center cursor-pointer ${
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

          {/* BTO-PROGRESSION-MODES-V1.4: Hệ thống 17 Cấp bậc Quân hàm, Tiến độ XP & Quy đổi Sao ⭐ (25 XP = 1 Sao) */}
          <div
            data-testid="profile-player-level-card"
            className="p-3.5 rounded-2xl bg-neutral-950/85 border border-amber-500/30 space-y-2.5"
          >
            <div className="flex items-center justify-between gap-2 flex-wrap">
              <div className="flex items-center gap-1.5 font-mono font-extrabold text-xs text-amber-300">
                <Award className="w-4 h-4 text-amber-400 shrink-0" />
                <span>
                  {t('Quân hàm hiện tại:', 'Current Military Rank:')}{' '}
                  {lang === 'en' ? playerStats.rankNameEn : playerStats.rankNameVi}
                </span>
                {playerStats.isMaxRank && (
                  <span
                    data-testid="profile-max-level-badge"
                    className="px-1.5 py-0.5 rounded bg-amber-500 text-black text-[9px] font-black uppercase"
                  >
                    {t('CẤP BẬC TỐI ĐA', 'MAX RANK')}
                  </span>
                )}
              </div>
              <span className="text-[11px] font-mono font-bold tabular-nums text-amber-300">
                {playerStats.xpVerificationStatus === 'VERIFIED'
                  ? `${playerStats.rankProgressPercent}%`
                  : '--%'}
              </span>
            </div>

            <div
              data-testid="profile-level-progress-bar"
              role="progressbar"
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={Math.round(playerStats.rankProgressPercent)}
              className="w-full h-2 rounded-lg bg-neutral-800 border border-neutral-700/80 overflow-hidden"
            >
              <svg viewBox="0 0 100 10" preserveAspectRatio="none" className="w-full h-full block">
                <rect
                  x="0"
                  y="0"
                  width={playerStats.rankProgressPercent}
                  height="10"
                  className={playerStats.isMaxRank ? 'fill-amber-400' : 'fill-sky-400'}
                />
              </svg>
            </div>

            {playerStats.xpVerificationStatus !== 'VERIFIED' ? (
              <div className="text-[11px] font-mono text-neutral-400">
                {t(
                  'Chưa xác minh XP — hệ thống không hiển thị Quân hàm giả định.',
                  'XP unverified — system does not display an assumed Military Rank.'
                )}
              </div>
            ) : playerStats.isMaxRank ? (
              <div className="text-[11px] font-mono tabular-nums text-amber-200 flex items-center justify-between flex-wrap gap-1">
                <span>
                  {t('Tổng XP:', 'Total XP:')} {playerStats.totalXp.toLocaleString('vi-VN')} XP
                </span>
                <span>{t('CẤP BẬC TỐI ĐA (Đại tướng)', 'MAX RANK (General of the Army)')}</span>
              </div>
            ) : (
              <div className="grid grid-cols-3 gap-1.5 text-[10px] font-mono tabular-nums text-neutral-300">
                <div>
                  <span className="text-neutral-500 block">{t('Tổng XP', 'Total XP')}</span>
                  <strong className="text-amber-300">
                    {playerStats.totalXp.toLocaleString('vi-VN')} XP
                  </strong>
                </div>
                <div>
                  <span className="text-neutral-500 block">
                    {lang === 'en'
                      ? playerStats.nextRankNameEn || 'Next Rank'
                      : playerStats.nextRankNameVi || 'Quân hàm kế'}
                  </span>
                  <strong className="text-sky-300">
                    {(playerStats.rankXpNext ?? 0).toLocaleString('vi-VN')} XP
                  </strong>
                </div>
                <div className="text-right">
                  <span className="text-neutral-500 block">Còn thiếu</span>
                  <strong className="text-emerald-300">
                    {(playerStats.rankXpRemaining ?? 0).toLocaleString('vi-VN')} XP
                  </strong>
                </div>
              </div>
            )}

            <div className="grid grid-cols-2 gap-2 pt-2 border-t border-neutral-800/80 text-[10px]">
              <div className="p-2 rounded-lg bg-neutral-900/90 border border-amber-500/25 flex items-center gap-1.5 min-w-0">
                <Sparkles className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                <div className="truncate">
                  <span className="text-neutral-400 block">Số dư Sao ⭐ (25 XP = 1 Sao)</span>
                  <strong className="text-amber-300 font-mono tabular-nums">
                    {playerStats.starBalance.toLocaleString('vi-VN')} ⭐
                  </strong>
                </div>
              </div>
              <div className="p-2 rounded-lg bg-neutral-900/90 border border-sky-500/25 flex items-center gap-1.5 min-w-0">
                <Shield className="w-3.5 h-3.5 text-sky-400 shrink-0" />
                <div className="truncate">
                  <span className="text-neutral-400 block">XP lẻ chưa quy đổi</span>
                  <strong className="text-sky-300 font-mono tabular-nums">
                    {playerStats.unconvertedXp} / 25 XP (Còn {playerStats.xpToNextStar} XP → +1 ⭐)
                  </strong>
                </div>
              </div>
            </div>
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
