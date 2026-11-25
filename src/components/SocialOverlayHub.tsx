/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * M7.8 – SOCIAL OVERLAY HUB (Online Presence Floating Button, Online Players Drawer,
 * Global Chat, Account Search, Friends Modal with 4 Tabs, Private Chat + Block, Public Profile, Friend Toasts)
 */

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Ban,
  Check,
  Clock,
  Globe,
  Info,
  Mail,
  MessageSquare,
  RefreshCw,
  Search,
  Send,
  ShieldAlert,
  ShieldCheck,
  Star,
  UserCheck,
  UserMinus,
  UserPlus,
  Users,
  X,
  Gamepad2,
} from 'lucide-react';
import {
  SocialManager,
  SOCIAL_CONFIG,
  type DeletedFriendRecord,
  type FriendPresenceToastEvent,
  type FriendRequestRecord,
  type FriendshipRecord,
  type GlobalChatMessage,
  type PrivateChatMessage,
  type PublicPlayerProfile,
} from '../core/socialManager.ts';
import type { AuthIdentityLike } from '../core/authManager.ts';
import type { CoopRoomDocument } from '../core/coopOnlineManager.ts';
import { localizeMilitaryRankTitle } from '../core/playerLevelSystem.ts';
import { useLanguage } from '../core/i18n.ts';

interface SocialOverlayHubProps {
  currentUser: AuthIdentityLike | null;
  sessionStatus: string;
  isBattleScreen: boolean;
  isFriendsModalOpen: boolean;
  onCloseFriendsModal: () => void;
  activeLobbyRoom?: CoopRoomDocument | null;
  onPendingFriendRequestsChange?: (count: number) => void;
}

function formatShortTime(ms: number): string {
  try {
    const d = new Date(ms);
    return d.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' });
  } catch {
    return '--:--';
  }
}

function AvatarThumb({
  url,
  name,
  online,
  size = 'md',
}: {
  url: string | null;
  name: string;
  online?: boolean;
  size?: 'sm' | 'md' | 'lg';
}) {
  const dim =
    size === 'sm' ? 'w-8 h-8 text-xs' : size === 'lg' ? 'w-14 h-14 text-lg' : 'w-10 h-10 text-sm';
  const dotDim = size === 'sm' ? 'w-2.5 h-2.5' : 'w-3 h-3';
  const initials = (name || 'C').trim().slice(0, 2).toUpperCase();
  return (
    <div className={`relative shrink-0 ${dim}`}>
      {url ? (
        <img
          src={url}
          alt={name}
          className={`${dim} rounded-md object-cover border border-[#00F0FF]/40 bg-[#050510]`}
        />
      ) : (
        <div
          className={`${dim} rounded-md border border-[#00F0FF]/40 bg-[#0f172a] text-[#00F0FF] font-btn font-black flex items-center justify-center`}
        >
          {initials}
        </div>
      )}
      {typeof online === 'boolean' && (
        <span
          className={`absolute -bottom-0.5 -right-0.5 ${dotDim} rounded-full border-2 border-[#0b0d1e] ${
            online ? 'bg-emerald-400' : 'bg-neutral-500'
          }`}
        />
      )}
    </div>
  );
}

export const SocialOverlayHub: React.FC<SocialOverlayHubProps> = ({
  currentUser,
  sessionStatus,
  isBattleScreen,
  isFriendsModalOpen,
  onCloseFriendsModal,
  activeLobbyRoom,
  onPendingFriendRequestsChange,
}) => {
  const { lang, t } = useLanguage();
  const social = useMemo(() => SocialManager.getInstance(), []);

  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const [drawerTab, setDrawerTab] = useState<'ONLINE' | 'GLOBAL_CHAT' | 'SEARCH'>('ONLINE');
  const [onlinePlayers, setOnlinePlayers] = useState<PublicPlayerProfile[]>([]);
  const [onlineFilter, setOnlineFilter] = useState('');

  // Search tab state
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<PublicPlayerProfile[]>([]);
  const [searchLoading, setSearchLoading] = useState(false);
  const [searchNotice, setSearchNotice] = useState<string | null>(null);

  // Global chat state
  const [globalMessages, setGlobalMessages] = useState<GlobalChatMessage[]>([]);
  const [globalInput, setGlobalInput] = useState('');
  const [globalError, setGlobalError] = useState<string | null>(null);
  const [lastFailedGlobalText, setLastFailedGlobalText] = useState<string | null>(null);
  const [isSendingGlobal, setIsSendingGlobal] = useState(false);
  const [loadingOlderGlobal, setLoadingOlderGlobal] = useState(false);
  const globalChatEndRef = useRef<HTMLDivElement | null>(null);

  // Friends modal state
  const [friendsTab, setFriendsTab] = useState<'LIST' | 'RECEIVED' | 'SENT' | 'DELETED'>('LIST');
  const [friendsList, setFriendsList] = useState<
    Array<{ friendship: FriendshipRecord; peer: PublicPlayerProfile }>
  >([]);
  const [receivedRequests, setReceivedRequests] = useState<FriendRequestRecord[]>([]);
  const [sentRequests, setSentRequests] = useState<FriendRequestRecord[]>([]);
  const [deletedFriends, setDeletedFriends] = useState<DeletedFriendRecord[]>([]);
  const [deferredFriendRequestIds, setDeferredFriendRequestIds] = useState<string[]>([]);
  const [processingFriendReqId, setProcessingFriendReqId] = useState<string | null>(null);
  const [socialFeedback, setSocialFeedback] = useState<string | null>(null);
  const [unfriendConfirmTarget, setUnfriendConfirmTarget] = useState<PublicPlayerProfile | null>(
    null
  );

  // Private chat state
  const [privateChatPeer, setPrivateChatPeer] = useState<PublicPlayerProfile | null>(null);
  const [privateMessages, setPrivateMessages] = useState<PrivateChatMessage[]>([]);
  const [privateInput, setPrivateInput] = useState('');
  const [privateError, setPrivateError] = useState<string | null>(null);
  const [isSendingPrivate, setIsSendingPrivate] = useState(false);
  const [privateRel, setPrivateRel] = useState<{
    isFriend: boolean;
    pendingDirection: 'NONE' | 'SENT' | 'RECEIVED';
    blockedByMe: boolean;
    blockedByOther: boolean;
  }>({
    isFriend: false,
    pendingDirection: 'NONE',
    blockedByMe: false,
    blockedByOther: false,
  });
  const privateChatEndRef = useRef<HTMLDivElement | null>(null);

  // Public profile modal state
  const [profileModalUser, setProfileModalUser] = useState<PublicPlayerProfile | null>(null);

  // Friend Online/Offline toast stack
  const [toasts, setToasts] = useState<FriendPresenceToastEvent[]>([]);

  // Community manual refresh & unread incoming private message blink tracking (message-ID based, immune to clock skew)
  const [isRefreshingCommunity, setIsRefreshingCommunity] = useState(false);
  const [dismissedRulesBanner, setDismissedRulesBanner] = useState(false);
  const [isShowingChatHistory, setIsShowingChatHistory] = useState(true);
  const hasClearedSearchRef = useRef(false);
  const [unreadSenderUids, setUnreadSenderUids] = useState<string[]>([]);
  const [unreadSenderProfiles, setUnreadSenderProfiles] = useState<
    Record<string, PublicPlayerProfile>
  >({});
  const unreadSenderSet = useMemo(() => new Set(unreadSenderUids), [unreadSenderUids]);
  const lastReadMsgIdByPeerRef = useRef<Record<string, string>>({});
  const seenInitialMsgIdByPeerRef = useRef<Record<string, string>>({});
  const privateChatPeerUidRef = useRef<string | null>(null);
  privateChatPeerUidRef.current = privateChatPeer?.uid ?? null;

  useEffect(() => {
    if (!currentUser?.uid) {
      lastReadMsgIdByPeerRef.current = {};
      seenInitialMsgIdByPeerRef.current = {};
      setUnreadSenderUids([]);
      setUnreadSenderProfiles({});
      setDeferredFriendRequestIds([]);
      return;
    }
    seenInitialMsgIdByPeerRef.current = {};
    try {
      const raw = window.localStorage.getItem(`bto_social_pm_read_ids_${currentUser.uid}`);
      if (raw) {
        const parsed = JSON.parse(raw) as Record<string, string>;
        if (parsed && typeof parsed === 'object') {
          lastReadMsgIdByPeerRef.current = parsed;
        }
      }
    } catch {
      lastReadMsgIdByPeerRef.current = {};
    }
  }, [currentUser?.uid]);

  const markPeerMessagesRead = useCallback(
    (peerUid: string, latestMsgId?: string) => {
      if (!currentUser?.uid || !peerUid) return;
      const msgIdToRecord = latestMsgId || seenInitialMsgIdByPeerRef.current[peerUid];
      if (msgIdToRecord) {
        lastReadMsgIdByPeerRef.current[peerUid] = msgIdToRecord;
        seenInitialMsgIdByPeerRef.current[peerUid] = msgIdToRecord;
        try {
          window.localStorage.setItem(
            `bto_social_pm_read_ids_${currentUser.uid}`,
            JSON.stringify(lastReadMsgIdByPeerRef.current)
          );
        } catch {
          // ignore storage quota
        }
      }
      setUnreadSenderUids((prev) =>
        prev.includes(peerUid) ? prev.filter((id) => id !== peerUid) : prev
      );
    },
    [currentUser?.uid]
  );

  const openPrivateChatWithPeer = useCallback(
    (peer: PublicPlayerProfile) => {
      if (privateChatPeerUidRef.current !== peer.uid) {
        setPrivateMessages([]);
        setPrivateError(null);
      }
      setPrivateChatPeer(peer);
      markPeerMessagesRead(peer.uid);
    },
    [markPeerMessagesRead]
  );

  // Quick lookup sets for Add Friend icon visibility
  const friendUidSet = useMemo(
    () => new Set(friendsList.map((f) => f.peer.uid)),
    [friendsList]
  );
  const pendingUidSet = useMemo(() => {
    const s = new Set<string>();
    sentRequests.forEach((r) => s.add(r.toUid));
    receivedRequests.forEach((r) => s.add(r.fromUid));
    return s;
  }, [sentRequests, receivedRequests]);

  const showTempFeedback = useCallback((msg: string) => {
    setSocialFeedback(msg);
    setTimeout(() => {
      setSocialFeedback((prev) => (prev === msg ? null : prev));
    }, 3500);
  }, []);

  const refreshFriendsData = useCallback(async () => {
    if (!currentUser?.uid) return;
    const [fList, reqSplit, delList] = await Promise.all([
      social.listFriendsForUser(currentUser.uid),
      social.listFriendRequestsSplit(currentUser.uid),
      social.listDeletedFriendsForUser(currentUser.uid),
    ]);
    setFriendsList(fList);
    setReceivedRequests(reqSplit.received);
    setSentRequests(reqSplit.sent);
    setDeletedFriends(delList);
    onPendingFriendRequestsChange?.(reqSplit.received.length);
  }, [currentUser?.uid, social, onPendingFriendRequestsChange]);

  // Subscribe online players, incoming friend requests & friend presence toasts
  useEffect(() => {
    if (!currentUser?.uid || sessionStatus !== 'ACTIVE') {
      setOnlinePlayers([]);
      return;
    }
    const unsubOnline = social.subscribeOnlinePlayers((list) => {
      setOnlinePlayers(list);
    });
    const unsubIncomingReqs = social.subscribeIncomingFriendRequests(currentUser.uid, (reqs) => {
      setReceivedRequests(reqs);
      onPendingFriendRequestsChange?.(reqs.length);
    });
    const unsubFriendships = social.subscribeFriendships(currentUser.uid, () => {
      void refreshFriendsData();
    });
    const unsubToast = social.subscribeFriendToasts((ev) => {
      setToasts((prev) => {
        if (prev.some((x) => x.friendUid === ev.friendUid && x.status === ev.status)) {
          return prev;
        }
        return [ev, ...prev].slice(0, 3);
      });
      setTimeout(() => {
        setToasts((prev) => prev.filter((x) => x.id !== ev.id));
      }, 4500);
    });
    const unsubMut = social.subscribeMutations(() => {
      void refreshFriendsData();
    });
    void refreshFriendsData();
    return () => {
      unsubOnline();
      unsubIncomingReqs();
      unsubFriendships();
      unsubToast();
      unsubMut();
    };
  }, [currentUser?.uid, sessionStatus, social, refreshFriendsData, onPendingFriendRequestsChange]);

  // Refresh friends whenever modal or drawer opens
  useEffect(() => {
    if ((isFriendsModalOpen || isDrawerOpen) && currentUser?.uid) {
      void refreshFriendsData();
    }
  }, [isFriendsModalOpen, isDrawerOpen, currentUser?.uid, refreshFriendsData]);

  // Subscribe Global Chat ONLY when Global Chat tab is actively open (zero idle background listeners)
  useEffect(() => {
    if (!isDrawerOpen || drawerTab !== 'GLOBAL_CHAT' || !currentUser?.uid) return;
    const unsub = social.subscribeGlobalChat((msgs) => {
      setGlobalMessages(msgs);
    });
    return () => unsub();
  }, [isDrawerOpen, drawerTab, currentUser?.uid, social]);

  useEffect(() => {
    if (isDrawerOpen && drawerTab === 'GLOBAL_CHAT') {
      globalChatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [globalMessages.length, isDrawerOpen, drawerTab]);

  // Subscribe Private Chat ONLY when Private Chat modal is open
  const refreshPrivateRelationship = useCallback(async () => {
    if (!currentUser?.uid || !privateChatPeer) return;
    const rel = await social.getRelationshipStatus(currentUser.uid, privateChatPeer.uid);
    setPrivateRel({
      isFriend: rel.isFriend,
      pendingDirection: rel.pendingDirection,
      blockedByMe: rel.blockedByMe,
      blockedByOther: rel.blockedByOther,
    });
  }, [currentUser?.uid, privateChatPeer, social]);

  useEffect(() => {
    if (!currentUser?.uid || !privateChatPeer) return;
    markPeerMessagesRead(privateChatPeer.uid);
    void refreshPrivateRelationship();
    const unsub = social.subscribePrivateChat(currentUser.uid, privateChatPeer.uid, (msgs) => {
      setPrivateMessages(msgs);
      const latestMsg = msgs.length > 0 ? msgs[msgs.length - 1] : null;
      if (latestMsg) {
        social.recordChatHistoryPeerLocally(
          currentUser.uid!,
          {
            uid: privateChatPeer.uid,
            displayName: privateChatPeer.displayName,
            avatarUrl: privateChatPeer.avatarUrl,
          },
          latestMsg.createdAtMs
        );
      }
      markPeerMessagesRead(privateChatPeer.uid, latestMsg?.id);
    });
    return () => unsub();
  }, [currentUser?.uid, privateChatPeer, social, refreshPrivateRelationship, markPeerMessagesRead]);

  useEffect(() => {
    if (privateChatPeer) {
      privateChatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [privateMessages.length, privateChatPeer]);

  // Watch incoming private messages from active online peers, friends & pending requests (message-ID based)
  const watchedPeerKey = useMemo(() => {
    if (!currentUser?.uid || sessionStatus !== 'ACTIVE') return '';
    const ids: string[] = [];
    const seen = new Set<string>();
    const add = (uid: string) => {
      if (!uid || uid === currentUser.uid || seen.has(uid)) return;
      seen.add(uid);
      ids.push(uid);
    };
    friendsList.forEach((f) => add(f.peer.uid));
    onlinePlayers.forEach((p) => add(p.uid));
    receivedRequests.forEach((r) => add(r.fromUid));
    sentRequests.forEach((r) => add(r.toUid));
    return ids.slice(0, 30).join(',');
  }, [currentUser?.uid, sessionStatus, friendsList, onlinePlayers, receivedRequests, sentRequests]);

  useEffect(() => {
    if (!currentUser?.uid || sessionStatus !== 'ACTIVE' || !watchedPeerKey) return;
    const peerUids = watchedPeerKey.split(',').filter(Boolean);
    const unsubs = peerUids.map((peerUid) =>
      social.subscribeLatestPrivateMessage(currentUser.uid!, peerUid, (latestMsg) => {
        if (!latestMsg) {
          seenInitialMsgIdByPeerRef.current[peerUid] = '';
          return;
        }
        const prevSeenId = seenInitialMsgIdByPeerRef.current[peerUid];
        seenInitialMsgIdByPeerRef.current[peerUid] = latestMsg.id;

        social.recordChatHistoryPeerLocally(
          currentUser.uid!,
          {
            uid: peerUid,
            displayName: latestMsg.senderUid === peerUid ? latestMsg.senderDisplayName : undefined,
            avatarUrl: latestMsg.senderUid === peerUid ? latestMsg.senderAvatarUrl : undefined,
          },
          latestMsg.createdAtMs
        );

        if (latestMsg.senderUid !== peerUid) return;

        // Cache sender profile so user can always click & reply even if sender goes offline
        setUnreadSenderProfiles((prev) => {
          const existing = prev[peerUid];
          if (
            existing &&
            existing.displayName === latestMsg.senderDisplayName &&
            existing.avatarUrl === latestMsg.senderAvatarUrl
          ) {
            return prev;
          }
          const shortTag = `#BT-${peerUid.slice(0, 6).toUpperCase()}`;
          return {
            ...prev,
            [peerUid]: {
              uid: peerUid,
              handleTag: existing?.handleTag || shortTag,
              displayName: latestMsg.senderDisplayName || existing?.displayName || 'Chiến binh',
              avatarUrl: latestMsg.senderAvatarUrl ?? existing?.avatarUrl ?? null,
              roleBadge: existing?.roleBadge || 'PLAYER',
              rankTitle: existing?.rankTitle || 'Binh nhì',
              stars: existing?.stars ?? 0,
              isOnline: existing?.isOnline ?? false,
              lastSeenMs: latestMsg.createdAtMs,
            },
          };
        });

        if (privateChatPeerUidRef.current === peerUid) {
          markPeerMessagesRead(peerUid, latestMsg.id);
          return;
        }

        const lastReadId = lastReadMsgIdByPeerRef.current[peerUid];
        if (lastReadId === latestMsg.id) return;

        const isLiveNewArrival = prevSeenId !== undefined && prevSeenId !== latestMsg.id;
        const hasUnreadDeltaFromSaved = Boolean(lastReadId) && lastReadId !== latestMsg.id;
        const isRecentFirstTime =
          !lastReadId && Math.abs(Date.now() - latestMsg.createdAtMs) <= 600_000;

        if (isLiveNewArrival || hasUnreadDeltaFromSaved || isRecentFirstTime) {
          setUnreadSenderUids((prev) => (prev.includes(peerUid) ? prev : [...prev, peerUid]));
        }
      })
    );
    return () => {
      unsubs.forEach((fn) => fn());
    };
  }, [currentUser?.uid, sessionStatus, watchedPeerKey, social, markPeerMessagesRead]);

  // Load ONLY accounts with whom the current user has private 1-on-1 messaging history
  const loadChatHistoryPeers = useCallback(async () => {
    if (!currentUser?.uid) {
      setSearchResults([]);
      setIsShowingChatHistory(true);
      return;
    }
    setSearchLoading(true);
    setSearchNotice(null);
    setIsShowingChatHistory(true);
    try {
      const peers = await social.listChatHistoryPeers(currentUser.uid);
      setSearchResults(peers);
    } finally {
      setSearchLoading(false);
    }
  }, [currentUser?.uid, social]);

  const handleRefreshCommunity = useCallback(async () => {
    if (!currentUser?.uid || isRefreshingCommunity) return;
    setIsRefreshingCommunity(true);
    try {
      await Promise.all([social.refreshPresenceSnapshot(), refreshFriendsData()]);
      if (drawerTab === 'SEARCH') {
        const trimmed = searchQuery.trim();
        if (trimmed.length > 0) {
          const res = await social.searchAccounts(trimmed, Date.now(), true);
          if (res.success && res.data) {
            const kwLower = trimmed.toLowerCase();
            setIsShowingChatHistory(false);
            setSearchResults(
              res.data.filter(
                (acc) =>
                  acc.uid !== currentUser.uid &&
                  acc.displayName.toLowerCase().includes(kwLower)
              )
            );
          }
        } else if (!hasClearedSearchRef.current) {
          await loadChatHistoryPeers();
        }
      }
    } finally {
      setIsRefreshingCommunity(false);
    }
  }, [
    currentUser?.uid,
    isRefreshingCommunity,
    social,
    refreshFriendsData,
    drawerTab,
    searchQuery,
    loadChatHistoryPeers,
  ]);

  // Search handler: empty query ONLY lists accounts with messaging history (never dumps all accounts)
  const handleRunSearch = useCallback(
    async (kw: string) => {
      hasClearedSearchRef.current = false;
      const trimmed = kw.trim();
      if (!trimmed) {
        await loadChatHistoryPeers();
        return;
      }
      setSearchLoading(true);
      setSearchNotice(null);
      setIsShowingChatHistory(false);
      try {
        const res = await social.searchAccounts(trimmed);
        if (!res.success) {
          setSearchNotice(res.message || t('Không thể tìm kiếm lúc này.', 'Search unavailable.'));
        } else {
          const kwLower = trimmed.toLowerCase();
          setSearchResults(
            (res.data ?? []).filter(
              (acc) =>
                acc.uid !== currentUser?.uid &&
                acc.displayName.toLowerCase().includes(kwLower)
            )
          );
        }
      } finally {
        setSearchLoading(false);
      }
    },
    [social, t, currentUser?.uid, loadChatHistoryPeers]
  );

  useEffect(() => {
    if (isDrawerOpen && drawerTab === 'SEARCH' && currentUser?.uid) {
      if (searchQuery.trim().length > 0) {
        void handleRunSearch(searchQuery);
      } else if (!hasClearedSearchRef.current) {
        void loadChatHistoryPeers();
      }
    }
  }, [isDrawerOpen, drawerTab, currentUser?.uid]);

  const handleClearSearch = useCallback(() => {
    hasClearedSearchRef.current = false;
    setSearchQuery('');
    setSearchNotice(null);
    void loadChatHistoryPeers();
  }, [loadChatHistoryPeers]);

  const handleAcceptFriendRequest = useCallback(
    async (requestId: string) => {
      if (!currentUser || processingFriendReqId) return;
      setProcessingFriendReqId(requestId);
      try {
        const res = await social.acceptFriendRequest(currentUser, requestId);
        if (res.success) {
          showTempFeedback(t('Đã chấp nhận lời mời kết bạn.', 'Friend request accepted.'));
          setDeferredFriendRequestIds((prev) => prev.filter((id) => id !== requestId));
          await refreshFriendsData();
        } else {
          showTempFeedback(
            res.message || t('Không thể chấp nhận lời mời kết bạn.', 'Failed to accept friend request.')
          );
        }
      } finally {
        setProcessingFriendReqId(null);
      }
    },
    [currentUser, processingFriendReqId, social, showTempFeedback, t, refreshFriendsData]
  );

  const handleRejectFriendRequest = useCallback(
    async (requestId: string) => {
      if (!currentUser || processingFriendReqId) return;
      setProcessingFriendReqId(requestId);
      try {
        const res = await social.rejectFriendRequest(currentUser, requestId);
        if (res.success) {
          showTempFeedback(t('Đã từ chối lời mời kết bạn.', 'Friend request rejected.'));
          setDeferredFriendRequestIds((prev) => prev.filter((id) => id !== requestId));
          await refreshFriendsData();
        } else {
          showTempFeedback(
            res.message || t('Không thể từ chối lời mời kết bạn.', 'Failed to reject friend request.')
          );
        }
      } finally {
        setProcessingFriendReqId(null);
      }
    },
    [currentUser, processingFriendReqId, social, showTempFeedback, t, refreshFriendsData]
  );

  const handleSendGlobal = async (overrideText?: string) => {
    if (isSendingGlobal) return;
    const textToSend = overrideText ?? globalInput;
    if (!textToSend.trim()) return;
    setGlobalError(null);
    setIsSendingGlobal(true);
    try {
      const res = await social.sendGlobalMessage(currentUser, textToSend);
      if (!res.success) {
        setGlobalError(res.message || t('Gửi tin nhắn thất bại.', 'Failed to send message.'));
        if (res.errorCode === 'NETWORK_ERROR' || res.errorCode === 'PERMISSION_DENIED') {
          setLastFailedGlobalText(textToSend);
        }
        return;
      }
      setGlobalInput('');
      setLastFailedGlobalText(null);
    } finally {
      setIsSendingGlobal(false);
    }
  };

  const handleLoadOlderGlobal = async () => {
    if (!globalMessages.length || loadingOlderGlobal) return;
    setLoadingOlderGlobal(true);
    try {
      const oldest = globalMessages[0].createdAtMs;
      const older = await social.loadOlderGlobalMessages(oldest);
      if (older.length > 0) {
        setGlobalMessages((prev) => {
          const seen = new Set(prev.map((m) => m.id));
          return [...older.filter((m) => !seen.has(m.id)), ...prev];
        });
      }
    } finally {
      setLoadingOlderGlobal(false);
    }
  };

  const handleSendFriendRequest = async (target: PublicPlayerProfile) => {
    const res = await social.sendFriendRequest(currentUser, target);
    showTempFeedback(
      res.message || (res.success ? t('Đã gửi lời mời kết bạn.', 'Friend request sent.') : t('Không thể gửi lời mời.', 'Failed.'))
    );
    await refreshFriendsData();
    if (privateChatPeer?.uid === target.uid) {
      await refreshPrivateRelationship();
    }
  };

  const handleSendPrivate = async () => {
    if (!privateChatPeer || isSendingPrivate) return;
    if (!privateInput.trim()) return;
    setPrivateError(null);
    setIsSendingPrivate(true);
    try {
      const res = await social.sendPrivateMessage(currentUser, privateChatPeer.uid, privateInput);
      if (!res.success) {
        setPrivateError(res.message || t('Không thể gửi tin nhắn.', 'Failed to send message.'));
        await refreshPrivateRelationship();
        return;
      }
      if (res.data?.id) {
        markPeerMessagesRead(privateChatPeer.uid, res.data.id);
      }
      setPrivateInput('');
    } finally {
      setIsSendingPrivate(false);
    }
  };

  const handleToggleBlock = async () => {
    if (!privateChatPeer) return;
    setPrivateError(null);
    const res = privateRel.blockedByMe
      ? await social.unblockUser(currentUser, privateChatPeer.uid)
      : await social.blockUser(currentUser, privateChatPeer.uid);
    if (res.message) showTempFeedback(res.message);
    await refreshPrivateRelationship();
  };

  const handleInviteFriendToRoom = async (peer: PublicPlayerProfile) => {
    if (!activeLobbyRoom) return;
    const res = await social.sendRoomInviteToFriend(
      currentUser,
      peer.uid,
      activeLobbyRoom.roomCode,
      activeLobbyRoom.roomMode ?? 'COOP_ONLINE',
      Boolean(activeLobbyRoom.hasPassword)
    );
    if (res.message) showTempFeedback(res.message);
  };

  if (!currentUser || sessionStatus !== 'ACTIVE') {
    return null;
  }

  // Merge any unread message senders who might be offline so user can always see the blink & open chat
  const mergedCommunityPlayers = (() => {
    const byUid = new Map<string, PublicPlayerProfile>();
    onlinePlayers.forEach((p) => byUid.set(p.uid, p));
    unreadSenderUids.forEach((uid) => {
      if (!byUid.has(uid)) {
        const fromFriend = friendsList.find((f) => f.peer.uid === uid)?.peer;
        const fallbackProfile = unreadSenderProfiles[uid];
        if (fromFriend) {
          byUid.set(uid, fromFriend);
        } else if (fallbackProfile) {
          byUid.set(uid, fallbackProfile);
        }
      }
    });
    return Array.from(byUid.values()).sort((a, b) => {
      const aUnread = unreadSenderSet.has(a.uid) ? 1 : 0;
      const bUnread = unreadSenderSet.has(b.uid) ? 1 : 0;
      if (aUnread !== bUnread) return bUnread - aUnread;
      return 0;
    });
  })();

  const filteredOnlinePlayers = mergedCommunityPlayers.filter((p) => {
    const kw = onlineFilter.trim().toLowerCase();
    if (!kw) return true;
    return p.displayName.toLowerCase().includes(kw);
  });

  const activeFriendReqPopup =
    receivedRequests.find((req) => !deferredFriendRequestIds.includes(req.id)) ?? null;

  const canShowAddFriend = (uid: string) =>
    uid !== currentUser.uid && !friendUidSet.has(uid) && !pendingUidSet.has(uid);

  return (
    <>
      {/* Real-time Incoming Friend Request Popup (Đồng ý / Từ chối / Để sau) */}
      {!isBattleScreen && activeFriendReqPopup && (
        <div
          data-testid="incoming-friend-request-popup"
          className="fixed top-16 left-1/2 -translate-x-1/2 sm:left-auto sm:translate-x-0 sm:right-3 z-[60] w-[calc(100vw-1.5rem)] max-w-[340px] rounded-xl bg-[#0b0d1e]/98 border-2 border-[#FFB800]/80 shadow-[0_0_24px_rgba(255,184,0,0.35)] p-3 space-y-2.5 animate-neo-fade-in"
        >
          <div className="flex items-start gap-2.5">
            <AvatarThumb
              url={activeFriendReqPopup.fromAvatarUrl}
              name={activeFriendReqPopup.fromDisplayName}
              size="sm"
            />
            <p className="text-xs text-[#EAF4FF] leading-snug flex-1">
              {t(
                `Đã nhận được lời mời kết bạn từ "${activeFriendReqPopup.fromDisplayName}"`,
                `Received a friend request from "${activeFriendReqPopup.fromDisplayName}"`
              )}
            </p>
          </div>
          <div className="grid grid-cols-3 gap-1.5">
            <button
              type="button"
              data-testid="incoming-friend-req-accept"
              disabled={processingFriendReqId === activeFriendReqPopup.id}
              onClick={() => void handleAcceptFriendRequest(activeFriendReqPopup.id)}
              className="py-1.5 px-2 rounded-md bg-emerald-500 hover:bg-emerald-400 text-[#050510] font-btn font-black text-[11px] uppercase tracking-wide cursor-pointer disabled:opacity-50"
            >
              {t('Đồng ý', 'Accept')}
            </button>
            <button
              type="button"
              data-testid="incoming-friend-req-reject"
              disabled={processingFriendReqId === activeFriendReqPopup.id}
              onClick={() => void handleRejectFriendRequest(activeFriendReqPopup.id)}
              className="py-1.5 px-2 rounded-md bg-red-600/85 hover:bg-red-500 text-white font-btn font-black text-[11px] uppercase tracking-wide cursor-pointer disabled:opacity-50"
            >
              {t('Từ chối', 'Reject')}
            </button>
            <button
              type="button"
              data-testid="incoming-friend-req-later"
              disabled={processingFriendReqId === activeFriendReqPopup.id}
              onClick={() =>
                setDeferredFriendRequestIds((prev) =>
                  prev.includes(activeFriendReqPopup.id)
                    ? prev
                    : [...prev, activeFriendReqPopup.id]
                )
              }
              className="py-1.5 px-2 rounded-md bg-neutral-800 hover:bg-neutral-700 border border-neutral-600 text-neutral-200 font-btn font-bold text-[11px] uppercase tracking-wide cursor-pointer disabled:opacity-50"
            >
              {t('Để sau', 'Later')}
            </button>
          </div>
        </div>
      )}

      {/* M7.8 Mục VIII: Friend Online/Offline Toast Notifications */}
      {toasts.length > 0 && (
        <div
          data-testid="friend-presence-toasts"
          className={`fixed ${activeFriendReqPopup ? 'top-44' : 'top-16'} right-3 z-50 flex flex-col gap-2 max-w-[290px] pointer-events-none`}
        >
          {toasts.map((toast) => (
            <div
              key={toast.id}
              className="pointer-events-auto flex items-center gap-2.5 px-3 py-2 rounded-lg bg-[#0b0d1e]/95 border border-[#00F0FF]/50 shadow-2xl text-xs animate-neo-fade-in"
            >
              <AvatarThumb
                url={toast.friendAvatarUrl}
                name={toast.friendDisplayName}
                online={toast.status === 'ONLINE'}
                size="sm"
              />
              <div className="min-w-0 flex-1">
                <p className="font-btn font-bold text-[#EAF4FF] truncate">
                  {toast.friendDisplayName}
                </p>
                <p
                  className={`text-[11px] font-semibold ${
                    toast.status === 'ONLINE' ? 'text-emerald-400' : 'text-neutral-400'
                  }`}
                >
                  {toast.status === 'ONLINE'
                    ? t('vừa trực tuyến (Online)', 'is now Online')
                    : t('đã ngoại tuyến (Offline)', 'went Offline')}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setToasts((prev) => prev.filter((x) => x.id !== toast.id))}
                className="text-neutral-400 hover:text-white cursor-pointer"
                aria-label="Close"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Feedback Toast */}
      {socialFeedback && (
        <div className="fixed bottom-16 left-1/2 -translate-x-1/2 z-[70] px-3.5 py-2 rounded-lg bg-[#0b0d1e] border border-[#FFB800]/60 text-[#FFB800] text-xs font-btn font-bold shadow-2xl animate-neo-fade-in flex items-center gap-2 max-w-[90vw]">
          <span>{socialFeedback}</span>
          <button
            type="button"
            onClick={() => setSocialFeedback(null)}
            className="text-amber-300/80 hover:text-white cursor-pointer shrink-0"
            aria-label={t('Đóng', 'Close')}
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* M7.8 Mục III: Compact Floating Online Icon with rising yellow Mail icon when unread private messages arrive */}
      {!isBattleScreen && (
        <button
          type="button"
          data-testid="floating-online-presence-btn"
          onClick={() => setIsDrawerOpen(true)}
          className={`fixed bottom-2.5 right-2.5 sm:bottom-4 sm:right-4 z-40 flex items-center gap-1.5 px-2 py-1 sm:px-2.5 sm:py-1.5 rounded-md bg-[#0b0d1e]/95 hover:bg-[#101833] border text-[#EAF4FF] shadow-[0_0_16px_rgba(0,240,255,0.25)] transition-transform active:scale-95 cursor-pointer ${
            unreadSenderUids.length > 0 && !isDrawerOpen
              ? 'social-online-btn-blink border-2 border-[#FFB800]'
              : 'border-[#00F0FF]/70 hover:border-[#00F0FF]'
          }`}
          title={
            unreadSenderUids.length > 0
              ? t('Có tin nhắn riêng mới! Bấm để mở Cộng đồng', 'New private message! Click to open Community')
              : t('Cộng đồng & Chat chung', 'Community & Global Chat')
          }
        >
          {unreadSenderUids.length > 0 && !isDrawerOpen && (
            <span
              data-testid="floating-online-unread-mail"
              className="absolute -top-4 -right-1 flex items-center justify-center px-1.5 py-0.5 rounded-md bg-[#050510] border border-[#FFB800] text-[#FFB800] shadow-[0_0_12px_rgba(255,184,0,0.85)] social-mail-pop-up pointer-events-none"
            >
              <Mail className="w-3.5 h-3.5 text-[#FFB800]" />
            </span>
          )}
          <span className="relative flex h-2 w-2 shrink-0">
            <span
              className={`animate-ping absolute inline-flex h-full w-full rounded-full opacity-75 ${
                unreadSenderUids.length > 0 && !isDrawerOpen ? 'bg-[#FFB800]' : 'bg-emerald-400'
              }`}
            />
            <span
              className={`relative inline-flex rounded-full h-2 w-2 ${
                unreadSenderUids.length > 0 && !isDrawerOpen ? 'bg-[#FFB800]' : 'bg-emerald-400'
              }`}
            />
          </span>
          <span
            className={`font-btn text-[11px] font-black tracking-wide uppercase leading-none ${
              unreadSenderUids.length > 0 && !isDrawerOpen ? 'text-[#FFB800]' : 'text-[#EAF4FF]'
            }`}
          >
            ONLINE
          </span>
          <span
            data-testid="floating-online-count"
            className="font-hud px-1 py-0.5 rounded bg-emerald-500/20 border border-emerald-400/50 text-emerald-300 text-[10px] font-bold leading-none"
          >
            {Math.max(1, onlinePlayers.length)}
          </span>
        </button>
      )}

      {/* =====================================================================
          COMMUNITY DRAWER (ONLINE PLAYERS, GLOBAL CHAT, SEARCH)
         ===================================================================== */}
      {isDrawerOpen && (
        <div
          className="fixed inset-0 z-[75] bg-[#050510]/85 flex justify-end"
          onClick={() => setIsDrawerOpen(false)}
        >
          <div
            data-testid="social-online-drawer"
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-md h-full bg-[#0b0d1e] border-l-2 border-[#00F0FF]/50 shadow-2xl flex flex-col overflow-hidden animate-neo-fade-in"
          >
            {/* Header */}
            <div className="px-4 py-3 bg-[#050510]/95 border-b border-[#00F0FF]/25 flex items-center justify-between gap-2">
              <div className="flex items-center gap-2 min-w-0">
                <div className="w-8 h-8 rounded-lg bg-[#00F0FF]/15 border border-[#00F0FF]/45 flex items-center justify-center text-[#00F0FF] shrink-0">
                  <Globe className="w-4 h-4" />
                </div>
                <h3 className="font-btn text-sm sm:text-base font-black uppercase tracking-wider text-[#EAF4FF] truncate">
                  {t('Cộng đồng', 'Community')}
                </h3>
                <span className="font-hud text-[11px] px-1.5 py-0.5 rounded bg-emerald-950/70 border border-emerald-500/40 text-emerald-300 font-bold shrink-0">
                  {Math.max(1, onlinePlayers.length)} Online
                </span>
              </div>
              <div className="flex items-center gap-1.5 shrink-0">
                <button
                  type="button"
                  data-testid="social-community-refresh-btn"
                  disabled={isRefreshingCommunity}
                  onClick={() => void handleRefreshCommunity()}
                  className="w-8 h-8 rounded-lg bg-[#0b0d1e] hover:bg-[#00F0FF]/15 border border-[#00F0FF]/45 text-[#00F0FF] flex items-center justify-center cursor-pointer disabled:opacity-50 transition-colors"
                  title={t('Làm mới danh sách', 'Refresh')}
                  aria-label={t('Làm mới', 'Refresh')}
                >
                  <RefreshCw className={`w-4 h-4 ${isRefreshingCommunity ? 'animate-spin' : ''}`} />
                </button>
                <button
                  type="button"
                  onClick={() => setIsDrawerOpen(false)}
                  className="w-8 h-8 rounded-lg bg-neutral-900 hover:bg-neutral-800 border border-neutral-700 text-neutral-300 hover:text-white flex items-center justify-center cursor-pointer transition-colors"
                  aria-label={t('Đóng', 'Close')}
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>

            {/* Tabs */}
            <div className="grid grid-cols-3 bg-[#070917] border-b border-neutral-800 p-1.5 gap-1.5">
              {(
                [
                  { id: 'ONLINE', label: t('Trực tuyến', 'Online'), icon: Users },
                  { id: 'GLOBAL_CHAT', label: t('Chat chung', 'Global Chat'), icon: MessageSquare },
                  { id: 'SEARCH', label: t('Tìm kiếm', 'Search'), icon: Search },
                ] as const
              ).map((tab) => {
                const Icon = tab.icon;
                const active = drawerTab === tab.id;
                return (
                  <button
                    key={tab.id}
                    type="button"
                    onClick={() => setDrawerTab(tab.id)}
                    className={`font-btn py-2 px-2 rounded text-[11px] font-black uppercase tracking-wide flex items-center justify-center gap-1.5 transition-colors cursor-pointer ${
                      active
                        ? 'bg-[#00F0FF] text-[#050510]'
                        : 'bg-[#0b0d1e] text-[#EAF4FF]/75 hover:text-white border border-neutral-800'
                    }`}
                  >
                    <Icon className="w-3.5 h-3.5 shrink-0" />
                    <span className="truncate">{tab.label}</span>
                  </button>
                );
              })}
            </div>

            {social.isRulesPendingDeployment() && !dismissedRulesBanner && (
              <div className="mx-3 mt-2 px-3 py-2 rounded bg-amber-950/60 border border-amber-500/40 text-amber-200 text-[11px] leading-snug flex items-start justify-between gap-2">
                <span>
                  {t(
                    'Chế độ tương thích cục bộ: Firestore Rules M7.8 đang chờ quản trị viên phê duyệt & công bố để đồng bộ thời gian thực liên máy.',
                    'Local compatibility mode: M7.8 Firestore Rules are awaiting administrator approval & deployment for cross-device real-time sync.'
                  )}
                </span>
                <button
                  type="button"
                  onClick={() => setDismissedRulesBanner(true)}
                  className="p-0.5 rounded hover:bg-amber-900/50 text-amber-200 hover:text-white shrink-0 cursor-pointer"
                  aria-label={t('Đóng', 'Close')}
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            )}

            {/* TAB 1: ONLINE PLAYERS */}
            {drawerTab === 'ONLINE' && (
              <div className="flex-1 flex flex-col overflow-hidden p-3 gap-3">
                <div className="relative">
                  <Search className="w-4 h-4 text-neutral-400 absolute left-3 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    value={onlineFilter}
                    onChange={(e) => setOnlineFilter(e.target.value)}
                    placeholder={t('Lọc người chơi đang Online...', 'Filter online players...')}
                    className="w-full pl-9 pr-3 py-2 rounded-lg bg-[#050510] border border-neutral-700 focus:border-[#00F0FF] focus:outline-none text-xs text-white"
                  />
                </div>
                <div className="flex-1 overflow-y-auto space-y-2 pr-1">
                  {filteredOnlinePlayers.length === 0 ? (
                    <p className="text-center text-xs text-neutral-400 py-8">
                      {t('Không tìm thấy người chơi trực tuyến phù hợp.', 'No matching online players.')}
                    </p>
                  ) : (
                    filteredOnlinePlayers.map((player) => {
                      const isMe = player.uid === currentUser.uid;
                      const hasUnread = !isMe && unreadSenderSet.has(player.uid);
                      return (
                        <div
                          key={player.uid}
                          className={`p-2.5 rounded-lg bg-[#050510]/90 border flex items-center justify-between gap-2 transition-colors ${
                            hasUnread
                              ? 'border-[#FFB800]/80 bg-amber-950/20'
                              : 'border-neutral-800 hover:border-[#00F0FF]/40'
                          }`}
                        >
                          <div
                            className={`flex items-center gap-2.5 min-w-0 ${!isMe ? 'cursor-pointer' : ''}`}
                            onClick={() => {
                              if (!isMe) openPrivateChatWithPeer(player);
                            }}
                          >
                            <AvatarThumb
                              url={player.avatarUrl}
                              name={player.displayName}
                              online={player.isOnline}
                            />
                            <div className="min-w-0">
                              <div className="flex items-center gap-1.5">
                                <span
                                  data-testid={hasUnread ? `unread-sender-name-${player.uid}` : undefined}
                                  className={`font-btn text-xs font-bold truncate ${
                                    hasUnread ? 'social-unread-blink text-[#FFB800]' : 'text-[#EAF4FF]'
                                  }`}
                                >
                                  {player.displayName}
                                </span>
                                {!isMe && friendUidSet.has(player.uid) && (
                                  <span
                                    data-testid={`online-friend-icon-${player.uid}`}
                                    title={t('Bạn bè', 'Friend')}
                                    className="inline-flex items-center text-emerald-400 shrink-0"
                                  >
                                    <UserCheck className="w-3.5 h-3.5" />
                                  </span>
                                )}
                                {isMe && (
                                  <span className="text-[10px] px-1.5 py-0.5 rounded bg-[#00F0FF]/15 text-[#00F0FF] font-bold">
                                    {t('Bạn', 'You')}
                                  </span>
                                )}
                                {hasUnread && (
                                  <span className="w-2 h-2 rounded-full bg-[#FFB800] animate-ping shrink-0" />
                                )}
                              </div>
                              <div className="flex items-center gap-2 text-[10px] text-neutral-400">
                                <span className={player.isOnline ? 'text-emerald-400 font-semibold' : 'text-neutral-500'}>
                                  ● {player.isOnline ? 'Online' : 'Offline'}
                                </span>
                              </div>
                            </div>
                          </div>

                          {!isMe && (
                            <div className="flex items-center gap-1 shrink-0">
                              <button
                                type="button"
                                onClick={() => openPrivateChatWithPeer(player)}
                                className={`w-8 h-8 rounded border flex items-center justify-center cursor-pointer ${
                                  hasUnread
                                    ? 'bg-[#FFB800]/20 border-[#FFB800] text-[#FFB800] social-unread-blink'
                                    : 'bg-[#0b0d1e] hover:bg-[#00F0FF]/20 border-[#00F0FF]/40 text-[#00F0FF]'
                                }`}
                                title={t('Chat riêng', 'Private Chat')}
                              >
                                <MessageSquare className="w-3.5 h-3.5" />
                              </button>
                              {canShowAddFriend(player.uid) && (
                                <button
                                  type="button"
                                  onClick={() => void handleSendFriendRequest(player)}
                                  className="w-8 h-8 rounded bg-[#0b0d1e] hover:bg-emerald-500/20 border border-emerald-500/40 text-emerald-300 flex items-center justify-center cursor-pointer"
                                  title={t('Kết bạn', 'Add Friend')}
                                >
                                  <UserPlus className="w-3.5 h-3.5" />
                                </button>
                              )}
                              <button
                                type="button"
                                onClick={() => setProfileModalUser(player)}
                                className="w-8 h-8 rounded bg-[#0b0d1e] hover:bg-amber-500/20 border border-amber-500/40 text-amber-300 flex items-center justify-center cursor-pointer"
                                title={t('Thông tin công khai', 'Public Info')}
                              >
                                <Info className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          )}
                        </div>
                      );
                    })
                  )}
                </div>
              </div>
            )}

            {/* TAB 2: GLOBAL CHAT */}
            {drawerTab === 'GLOBAL_CHAT' && (
              <div className="flex-1 flex flex-col overflow-hidden p-3 gap-2">
                <div className="flex items-center justify-between">
                  <span className="text-[11px] text-neutral-400">
                    {t('Kênh chat chung thời gian thực', 'Real-time global chat channel')}
                  </span>
                  {globalMessages.length >= 20 && (
                    <button
                      type="button"
                      disabled={loadingOlderGlobal}
                      onClick={() => void handleLoadOlderGlobal()}
                      className="text-[11px] text-[#00F0FF] hover:underline font-bold cursor-pointer disabled:opacity-50"
                    >
                      {loadingOlderGlobal
                        ? t('Đang tải...', 'Loading...')
                        : t('Tải tin cũ hơn', 'Load older')}
                    </button>
                  )}
                </div>

                <div className="flex-1 overflow-y-auto space-y-2.5 pr-1 bg-[#050510]/70 rounded-lg p-2.5 border border-neutral-800">
                  {globalMessages.length === 0 ? (
                    <p className="text-center text-xs text-neutral-500 py-10">
                      {t('Chưa có tin nhắn nào. Hãy gửi lời chào!', 'No messages yet. Say hello!')}
                    </p>
                  ) : (
                    globalMessages.map((msg) => {
                      const isMe = msg.senderUid === currentUser.uid;
                      const senderProfile: PublicPlayerProfile = {
                        uid: msg.senderUid,
                        handleTag: msg.senderHandleTag,
                        displayName: msg.senderDisplayName,
                        avatarUrl: msg.senderAvatarUrl,
                        roleBadge: msg.senderRoleBadge,
                        rankTitle: 'Chiến binh',
                        stars: 0,
                        isOnline: onlinePlayers.some((p) => p.uid === msg.senderUid),
                        lastSeenMs: msg.createdAtMs,
                      };
                      return (
                        <div
                          key={msg.id}
                          className={`p-2.5 rounded-lg border ${
                            isMe
                              ? 'bg-[#0b1b2b]/80 border-[#00F0FF]/35'
                              : 'bg-[#0b0d1e]/90 border-neutral-800'
                          }`}
                        >
                          <div className="flex items-center justify-between gap-2 mb-1">
                            <div className="flex items-center gap-2 min-w-0">
                              <AvatarThumb
                                url={msg.senderAvatarUrl}
                                name={msg.senderDisplayName}
                                size="sm"
                              />
                              <div className="min-w-0">
                                <div className="flex items-center gap-1.5">
                                  <span className="font-btn text-xs font-bold text-[#EAF4FF] truncate">
                                    {msg.senderDisplayName}
                                  </span>
                                  {!isMe && friendUidSet.has(msg.senderUid) && (
                                    <span
                                      title={t('Bạn bè', 'Friend')}
                                      className="inline-flex items-center text-emerald-400 shrink-0"
                                    >
                                      <UserCheck className="w-3.5 h-3.5" />
                                    </span>
                                  )}
                                  {msg.senderRoleBadge !== 'PLAYER' && (
                                    <span className="text-[9px] px-1.5 py-0.5 rounded bg-amber-500/20 border border-amber-400/50 text-amber-300 font-black">
                                      {msg.senderRoleBadge}
                                    </span>
                                  )}
                                </div>
                                <span className="text-[10px] text-neutral-500 flex items-center gap-1">
                                  <Clock className="w-2.5 h-2.5" />
                                  {formatShortTime(msg.createdAtMs)}
                                </span>
                              </div>
                            </div>

                            {!isMe && (
                              <div className="flex items-center gap-1 shrink-0">
                                <button
                                  type="button"
                                  onClick={() => openPrivateChatWithPeer(senderProfile)}
                                  className="w-6 h-6 rounded bg-neutral-900 hover:bg-[#00F0FF]/20 text-[#00F0FF] flex items-center justify-center cursor-pointer"
                                  title={t('Chat riêng', 'Private Chat')}
                                >
                                  <MessageSquare className="w-3 h-3" />
                                </button>
                                {canShowAddFriend(msg.senderUid) && (
                                  <button
                                    type="button"
                                    onClick={() => void handleSendFriendRequest(senderProfile)}
                                    className="w-6 h-6 rounded bg-neutral-900 hover:bg-emerald-500/20 text-emerald-400 flex items-center justify-center cursor-pointer"
                                    title={t('Kết bạn', 'Add Friend')}
                                  >
                                    <UserPlus className="w-3 h-3" />
                                  </button>
                                )}
                                <button
                                  type="button"
                                  onClick={() => setProfileModalUser(senderProfile)}
                                  className="w-6 h-6 rounded bg-neutral-900 hover:bg-amber-500/20 text-amber-300 flex items-center justify-center cursor-pointer"
                                  title={t('Thông tin', 'Info')}
                                >
                                  <Info className="w-3 h-3" />
                                </button>
                              </div>
                            )}
                          </div>
                          <p className="text-xs text-[#EAF4FF]/90 break-words leading-relaxed pl-10">
                            {msg.content}
                          </p>
                        </div>
                      );
                    })
                  )}
                  <div ref={globalChatEndRef} />
                </div>

                {globalError && (
                  <div className="px-2.5 py-1.5 rounded bg-red-950/70 border border-red-500/40 text-red-200 text-[11px] flex items-center justify-between gap-2">
                    <span className="flex-1">{globalError}</span>
                    <div className="flex items-center gap-1.5 shrink-0">
                      {lastFailedGlobalText && (
                        <button
                          type="button"
                          onClick={() => void handleSendGlobal(lastFailedGlobalText)}
                          className="px-2 py-0.5 rounded bg-red-500 text-white font-bold text-[10px] cursor-pointer flex items-center gap-1"
                        >
                          <RefreshCw className="w-3 h-3" />
                          {t('Thử lại', 'Retry')}
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => setGlobalError(null)}
                        className="p-0.5 rounded hover:bg-red-900/60 text-red-200 hover:text-white cursor-pointer"
                        aria-label={t('Đóng', 'Close')}
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                )}

                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    void handleSendGlobal();
                  }}
                  className="flex items-center gap-2"
                >
                  <input
                    type="text"
                    maxLength={SOCIAL_CONFIG.GLOBAL_CHAT_MAX_LENGTH}
                    value={globalInput}
                    onChange={(e) => setGlobalInput(e.target.value)}
                    placeholder={t('Nhập tin nhắn chat chung...', 'Type a global message...')}
                    className="flex-1 px-3 py-2 rounded-lg bg-[#050510] border border-neutral-700 focus:border-[#00F0FF] focus:outline-none text-xs text-white"
                  />
                  <button
                    type="submit"
                    disabled={isSendingGlobal || !globalInput.trim()}
                    className="px-3.5 py-2 rounded-lg bg-[#00F0FF] hover:bg-cyan-300 text-[#050510] font-btn font-black text-xs flex items-center gap-1 cursor-pointer shrink-0 disabled:opacity-50"
                  >
                    <Send className="w-3.5 h-3.5" />
                    <span>{t('Gửi', 'Send')}</span>
                  </button>
                </form>
                <div className="text-[10px] text-neutral-500 text-right">
                  {globalInput.length}/{SOCIAL_CONFIG.GLOBAL_CHAT_MAX_LENGTH}
                </div>
              </div>
            )}

            {/* TAB 3: GLOBAL ACCOUNT SEARCH */}
            {drawerTab === 'SEARCH' && (
              <div className="flex-1 flex flex-col overflow-hidden p-3 gap-3">
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    void handleRunSearch(searchQuery);
                  }}
                  className="flex items-center gap-1.5"
                >
                  <div className="relative flex-1 min-w-0">
                    <Search className="w-4 h-4 text-neutral-400 absolute left-3 top-1/2 -translate-y-1/2" />
                    <input
                      type="text"
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      placeholder={t('Tìm theo tên hiển thị...', 'Search by display name...')}
                      className="w-full pl-9 pr-3 py-2 rounded-lg bg-[#050510] border border-neutral-700 focus:border-[#00F0FF] focus:outline-none text-xs text-white"
                    />
                  </div>
                  <button
                    type="submit"
                    disabled={searchLoading}
                    className="px-3 py-2 rounded-lg bg-[#FFB800] hover:bg-amber-400 text-[#050510] font-btn font-black text-xs cursor-pointer shrink-0"
                  >
                    {t('Tìm', 'Find')}
                  </button>
                  <button
                    type="button"
                    data-testid="social-search-clear-btn"
                    onClick={handleClearSearch}
                    disabled={!searchQuery && !searchNotice}
                    className="px-2.5 py-2 rounded-lg bg-neutral-800 hover:bg-neutral-700 border border-neutral-600 text-neutral-200 font-btn font-bold text-xs cursor-pointer shrink-0 disabled:opacity-40"
                    title={t('Xóa từ khóa tìm kiếm', 'Clear search keyword')}
                  >
                    {t('Xóa', 'Clear')}
                  </button>
                </form>

                {isShowingChatHistory && (
                  <div className="flex items-center justify-between text-[11px] font-btn font-bold uppercase tracking-wider text-[#00F0FF]/85 px-1">
                    <span>{t('Lịch sử nhắn tin', 'Messaging History')}</span>
                    <span className="text-neutral-400">{searchResults.length}</span>
                  </div>
                )}

                {searchNotice && (
                  <div className="px-3 py-2 rounded bg-amber-950/60 border border-amber-500/40 text-amber-200 text-xs flex items-center justify-between gap-2">
                    <span>{searchNotice}</span>
                    <button
                      type="button"
                      onClick={() => setSearchNotice(null)}
                      className="p-0.5 rounded hover:bg-amber-900/60 text-amber-200 hover:text-white shrink-0 cursor-pointer"
                      aria-label={t('Đóng', 'Close')}
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>
                )}

                <div className="flex-1 overflow-y-auto space-y-2 pr-1">
                  {searchResults.length === 0 ? (
                    <p className="text-center text-xs text-neutral-400 py-8">
                      {isShowingChatHistory
                        ? t(
                            'Chưa có tài khoản nào trong lịch sử nhắn tin.',
                            'No accounts in your messaging history yet.'
                          )
                        : t('Không tìm thấy tài khoản phù hợp.', 'No matching accounts found.')}
                    </p>
                  ) : (
                    searchResults.map((acc) => {
                      const isMe = acc.uid === currentUser.uid;
                      return (
                        <div
                          key={acc.uid}
                          className="p-2.5 rounded-lg bg-[#050510]/90 border border-neutral-800 flex items-center justify-between gap-2"
                        >
                          <div className="flex items-center gap-2.5 min-w-0">
                            <AvatarThumb
                              url={acc.avatarUrl}
                              name={acc.displayName}
                              online={acc.isOnline}
                            />
                            <div className="min-w-0">
                              <div className="flex items-center gap-1.5">
                                <p className="font-btn text-xs font-bold text-[#EAF4FF] truncate">
                                  {acc.displayName}
                                </p>
                                {!isMe && friendUidSet.has(acc.uid) && (
                                  <span
                                    data-testid={`search-friend-icon-${acc.uid}`}
                                    title={t('Bạn bè', 'Friend')}
                                    className="inline-flex items-center text-emerald-400 shrink-0"
                                  >
                                    <UserCheck className="w-3.5 h-3.5" />
                                  </span>
                                )}
                              </div>
                              <div className="flex items-center gap-2 text-[10px]">
                                <span className={acc.isOnline ? 'text-emerald-400 font-semibold' : 'text-neutral-500'}>
                                  ● {acc.isOnline ? 'Online' : 'Offline'}
                                </span>
                              </div>
                            </div>
                          </div>
                          {!isMe && (
                            <div className="flex items-center gap-1 shrink-0">
                              <button
                                type="button"
                                onClick={() => openPrivateChatWithPeer(acc)}
                                className="w-8 h-8 rounded bg-[#0b0d1e] hover:bg-[#00F0FF]/20 border border-[#00F0FF]/40 text-[#00F0FF] flex items-center justify-center cursor-pointer"
                                title={t('Nhắn tin riêng', 'Private Chat')}
                              >
                                <MessageSquare className="w-3.5 h-3.5" />
                              </button>
                              {canShowAddFriend(acc.uid) && (
                                <button
                                  type="button"
                                  onClick={() => void handleSendFriendRequest(acc)}
                                  className="w-8 h-8 rounded bg-[#0b0d1e] hover:bg-emerald-500/20 border border-emerald-500/40 text-emerald-300 flex items-center justify-center cursor-pointer"
                                  title={t('Kết bạn', 'Add Friend')}
                                >
                                  <UserPlus className="w-3.5 h-3.5" />
                                </button>
                              )}
                              <button
                                type="button"
                                onClick={() => setProfileModalUser(acc)}
                                className="w-8 h-8 rounded bg-[#0b0d1e] hover:bg-amber-500/20 border border-amber-500/40 text-amber-300 flex items-center justify-center cursor-pointer"
                                title={t('Thông tin', 'Info')}
                              >
                                <Info className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          )}
                        </div>
                      );
                    })
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* =====================================================================
          M7.8 MỤC VI: FRIENDS MODAL (UNIFIED MODAL SHELL WITH SETTINGS, INFO, MESSAGES)
         ===================================================================== */}
      {isFriendsModalOpen && (
        <div
          className="fixed inset-0 z-[75] bg-[#050510]/92 flex items-start justify-center pt-[max(0.75rem,env(safe-area-inset-top))] sm:pt-6 pb-[max(0.75rem,env(safe-area-inset-bottom))] px-3 sm:px-4 overflow-y-auto"
          onClick={onCloseFriendsModal}
          role="dialog"
          aria-modal="true"
          aria-labelledby="friends-modal-title"
        >
          <div
            data-testid="friends-modal"
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-2xl max-h-[calc(100dvh-1.5rem)] sm:max-h-[calc(100dvh-3rem)] bg-[#0b0d1e] border-2 border-[#00F0FF]/50 rounded-xl shadow-[0_0_32px_rgba(0,0,0,0.85)] flex flex-col overflow-hidden animate-neo-fade-in"
          >
            <div className="px-4 sm:px-5 py-3 bg-[#050510]/95 border-b border-[#00F0FF]/25 flex items-center justify-between gap-2 shrink-0">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-lg bg-[#00F0FF]/15 border border-[#00F0FF]/45 flex items-center justify-center text-[#00F0FF] shrink-0">
                  <Users className="w-4 h-4" />
                </div>
                <h3
                  id="friends-modal-title"
                  className="font-btn text-sm sm:text-base font-black uppercase tracking-wider text-[#EAF4FF]"
                >
                  {t('Quản lý Bạn bè', 'Friends')}
                </h3>
              </div>
              <button
                type="button"
                onClick={onCloseFriendsModal}
                className="w-8 h-8 rounded-lg bg-neutral-900 hover:bg-neutral-800 border border-neutral-700 text-neutral-300 hover:text-white flex items-center justify-center transition-colors cursor-pointer shrink-0"
                aria-label={t('Đóng', 'Close')}
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* 4 Tabs */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-1.5 p-2 bg-[#070917] border-b border-neutral-800">
              {(
                [
                  { id: 'LIST', label: `${t('Bạn bè', 'Friends')} (${friendsList.length})` },
                  { id: 'RECEIVED', label: `${t('Lời mời nhận', 'Received')} (${receivedRequests.length})` },
                  { id: 'SENT', label: `${t('Lời mời gửi', 'Sent')} (${sentRequests.length})` },
                  { id: 'DELETED', label: `${t('Đã xóa bạn', 'Unfriended')} (${deletedFriends.length})` },
                ] as const
              ).map((tb) => (
                <button
                  key={tb.id}
                  type="button"
                  onClick={() => setFriendsTab(tb.id)}
                  className={`font-btn py-2 px-2 rounded text-[11px] font-black uppercase tracking-wide transition-colors cursor-pointer ${
                    friendsTab === tb.id
                      ? 'bg-[#FFB800] text-[#050510]'
                      : 'bg-[#0b0d1e] text-[#EAF4FF]/80 hover:text-white border border-neutral-800'
                  }`}
                >
                  {tb.label}
                </button>
              ))}
            </div>

            <div className="flex-1 overflow-y-auto p-4 space-y-2.5">
              {/* TAB: FRIENDS LIST */}
              {friendsTab === 'LIST' && (
                <>
                  {friendsList.length === 0 ? (
                    <p className="text-center text-xs text-neutral-400 py-10">
                      {t(
                        'Bạn chưa có bạn bè nào. Hãy mở mục Online để tìm kiếm và kết bạn!',
                        'No friends yet. Open the Online panel to find and add friends!'
                      )}
                    </p>
                  ) : (
                    friendsList.map(({ peer }) => {
                      const hasUnread = unreadSenderSet.has(peer.uid);
                      return (
                      <div
                        key={peer.uid}
                        className={`p-3 rounded-lg bg-[#050510]/90 border flex flex-wrap items-center justify-between gap-2 ${
                          hasUnread ? 'border-[#FFB800]/80 bg-amber-950/20' : 'border-neutral-800'
                        }`}
                      >
                        <div
                          className="flex items-center gap-3 min-w-0 cursor-pointer"
                          onClick={() => openPrivateChatWithPeer(peer)}
                        >
                          <AvatarThumb url={peer.avatarUrl} name={peer.displayName} online={peer.isOnline} />
                          <div className="min-w-0">
                            <p
                              className={`font-btn text-xs sm:text-sm font-bold truncate ${
                                hasUnread ? 'social-unread-blink text-[#FFB800]' : 'text-[#EAF4FF]'
                              }`}
                            >
                              {peer.displayName}
                            </p>
                            <div className="flex items-center gap-2 text-[11px]">
                              <span className={peer.isOnline ? 'text-emerald-400 font-semibold' : 'text-neutral-500'}>
                                ● {peer.isOnline ? 'Online' : 'Offline'}
                              </span>
                            </div>
                          </div>
                        </div>
                        <div className="flex items-center gap-1.5 shrink-0">
                          {activeLobbyRoom && activeLobbyRoom.status === 'WAITING' && peer.isOnline && (
                            <button
                              type="button"
                              onClick={() => void handleInviteFriendToRoom(peer)}
                              className="px-2.5 py-1.5 rounded bg-emerald-600/25 hover:bg-emerald-600/40 border border-emerald-400/50 text-emerald-300 font-btn font-bold text-[11px] flex items-center gap-1 cursor-pointer"
                            >
                              <Gamepad2 className="w-3.5 h-3.5" />
                              <span>{t('Mời vào phòng', 'Invite')}</span>
                            </button>
                          )}
                          <button
                            type="button"
                            onClick={() => openPrivateChatWithPeer(peer)}
                            className={`p-2 rounded border cursor-pointer ${
                              hasUnread
                                ? 'bg-[#FFB800]/20 border-[#FFB800] text-[#FFB800] social-unread-blink'
                                : 'bg-[#0b0d1e] hover:bg-[#00F0FF]/20 border-[#00F0FF]/40 text-[#00F0FF]'
                            }`}
                            title={t('Chat riêng', 'Private Chat')}
                          >
                            <MessageSquare className="w-4 h-4" />
                          </button>
                          <button
                            type="button"
                            onClick={() => setProfileModalUser(peer)}
                            className="p-2 rounded bg-[#0b0d1e] hover:bg-amber-500/20 border border-amber-500/40 text-amber-300 cursor-pointer"
                            title={t('Thông tin', 'Info')}
                          >
                            <Info className="w-4 h-4" />
                          </button>
                          <button
                            type="button"
                            onClick={() => setUnfriendConfirmTarget(peer)}
                            className="p-2 rounded bg-[#0b0d1e] hover:bg-red-500/20 border border-red-500/40 text-red-400 cursor-pointer"
                            title={t('Xóa bạn', 'Unfriend')}
                          >
                            <UserMinus className="w-4 h-4" />
                          </button>
                        </div>
                      </div>
                      );
                    })
                  )}
                </>
              )}

              {/* TAB: RECEIVED REQUESTS */}
              {friendsTab === 'RECEIVED' && (
                <>
                  {receivedRequests.length === 0 ? (
                    <p className="text-center text-xs text-neutral-400 py-10">
                      {t('Không có lời mời kết bạn nào.', 'No pending received requests.')}
                    </p>
                  ) : (
                    receivedRequests.map((req) => (
                      <div
                        key={req.id}
                        className="p-3 rounded-lg bg-[#050510]/90 border border-neutral-800 flex items-center justify-between gap-2"
                      >
                        <div className="flex items-center gap-2.5 min-w-0">
                          <AvatarThumb url={req.fromAvatarUrl} name={req.fromDisplayName} />
                          <div className="min-w-0">
                            <p className="font-btn text-xs sm:text-sm font-bold text-[#EAF4FF] truncate">
                              {req.fromDisplayName}
                            </p>
                          </div>
                        </div>
                        <div className="flex items-center gap-1.5 shrink-0">
                          <button
                            type="button"
                            disabled={processingFriendReqId === req.id}
                            onClick={() => void handleAcceptFriendRequest(req.id)}
                            className="px-3 py-1.5 rounded bg-emerald-500 hover:bg-emerald-400 text-[#050510] font-btn font-black text-xs flex items-center gap-1 cursor-pointer disabled:opacity-50"
                          >
                            <Check className="w-3.5 h-3.5" />
                            <span>{t('Chấp nhận', 'Accept')}</span>
                          </button>
                          <button
                            type="button"
                            disabled={processingFriendReqId === req.id}
                            onClick={() => void handleRejectFriendRequest(req.id)}
                            className="px-3 py-1.5 rounded bg-neutral-800 hover:bg-red-900/60 border border-neutral-700 text-neutral-200 font-btn font-bold text-xs cursor-pointer disabled:opacity-50"
                          >
                            {t('Từ chối', 'Reject')}
                          </button>
                        </div>
                      </div>
                    ))
                  )}
                </>
              )}

              {/* TAB: SENT REQUESTS */}
              {friendsTab === 'SENT' && (
                <>
                  {sentRequests.length === 0 ? (
                    <p className="text-center text-xs text-neutral-400 py-10">
                      {t('Bạn chưa gửi lời mời kết bạn nào đang chờ.', 'No outgoing pending requests.')}
                    </p>
                  ) : (
                    sentRequests.map((req) => (
                      <div
                        key={req.id}
                        className="p-3 rounded-lg bg-[#050510]/90 border border-neutral-800 flex items-center justify-between gap-2"
                      >
                        <div className="flex items-center gap-2.5 min-w-0">
                          <AvatarThumb url={req.toAvatarUrl} name={req.toDisplayName} />
                          <div className="min-w-0">
                            <p className="font-btn text-xs sm:text-sm font-bold text-[#EAF4FF] truncate">
                              {req.toDisplayName}
                            </p>
                            <p className="text-[11px] text-neutral-400">
                              {t('Đang chờ xác nhận', 'Pending')}
                            </p>
                          </div>
                        </div>
                        <button
                          type="button"
                          onClick={async () => {
                            await social.cancelSentFriendRequest(currentUser, req.id);
                            showTempFeedback(t('Đã hủy lời mời kết bạn.', 'Friend request cancelled.'));
                            await refreshFriendsData();
                          }}
                          className="px-3 py-1.5 rounded bg-neutral-800 hover:bg-neutral-700 border border-neutral-700 text-neutral-200 font-btn font-bold text-xs cursor-pointer"
                        >
                          {t('Hủy lời mời', 'Cancel')}
                        </button>
                      </div>
                    ))
                  )}
                </>
              )}

              {/* TAB: DELETED FRIENDS (PRIVATE HISTORY) */}
              {friendsTab === 'DELETED' && (
                <>
                  <p className="text-[11px] text-neutral-400 pb-1">
                    {t(
                      'Danh sách riêng tư chỉ hiển thị với bạn. Bạn có thể gửi lại lời mời kết bạn mới (không tự động khôi phục khi chưa có đồng ý).',
                      'Private history visible only to you. You may send a new friend request (never auto-restores without consent).'
                    )}
                  </p>
                  {deletedFriends.length === 0 ? (
                    <p className="text-center text-xs text-neutral-400 py-8">
                      {t('Chưa có ai trong danh sách đã xóa bạn.', 'No unfriended history.')}
                    </p>
                  ) : (
                    deletedFriends.map((rec) => (
                      <div
                        key={rec.targetUid}
                        className="p-3 rounded-lg bg-[#050510]/90 border border-neutral-800 flex items-center justify-between gap-2"
                      >
                        <div className="flex items-center gap-2.5 min-w-0">
                          <AvatarThumb url={rec.targetAvatarUrl} name={rec.targetDisplayName} />
                          <div className="min-w-0">
                            <p className="font-btn text-xs sm:text-sm font-bold text-[#EAF4FF] truncate">
                              {rec.targetDisplayName}
                            </p>
                          </div>
                        </div>
                        <button
                          type="button"
                          onClick={() =>
                            void handleSendFriendRequest({
                              uid: rec.targetUid,
                              displayName: rec.targetDisplayName,
                              handleTag: rec.targetHandleTag,
                              avatarUrl: rec.targetAvatarUrl,
                              roleBadge: 'PLAYER',
                              rankTitle: 'Binh nhì',
                              stars: 0,
                              isOnline: false,
                              lastSeenMs: rec.deletedAtMs,
                            })
                          }
                          className="px-3 py-1.5 rounded bg-[#00F0FF]/15 hover:bg-[#00F0FF]/25 border border-[#00F0FF]/50 text-[#00F0FF] font-btn font-bold text-xs flex items-center gap-1 cursor-pointer"
                        >
                          <UserPlus className="w-3.5 h-3.5" />
                          <span>{t('Gửi lại lời mời', 'Re-send Invite')}</span>
                        </button>
                      </div>
                    ))
                  )}
                </>
              )}
            </div>

            {/* Unified Footer */}
            <div className="px-4 sm:px-5 py-3 bg-[#050510]/95 border-t border-neutral-800 flex items-center justify-end shrink-0">
              <button
                type="button"
                onClick={onCloseFriendsModal}
                className="font-btn min-h-[42px] px-5 py-2 rounded-lg bg-[#FFB800] hover:bg-amber-400 text-[#050510] font-black text-xs uppercase tracking-wider transition-all shadow active:scale-95 cursor-pointer"
              >
                {t('Đóng', 'Close')}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Unfriend Confirmation Popup (above Friends modal z-[75]) */}
      {unfriendConfirmTarget && (
        <div className="fixed inset-0 z-[90] bg-black/80 flex items-center justify-center p-4">
          <div className="w-full max-w-sm bg-[#0b0d1e] border-2 border-red-500/50 rounded-xl p-5 space-y-4 shadow-2xl">
            <h4 className="font-btn text-sm font-black uppercase text-red-400">
              {t('Xác nhận hủy kết bạn', 'Confirm Unfriend')}
            </h4>
            <p className="text-xs text-[#EAF4FF]/85 leading-relaxed">
              {t(
                `Bạn có chắc chắn muốn hủy kết bạn với ${unfriendConfirmTarget.displayName}? Lịch sử chat riêng vẫn được giữ nguyên và thao tác này KHÔNG tự động chặn (Block) người chơi.`,
                `Are you sure you want to unfriend ${unfriendConfirmTarget.displayName}? Private chat history will be preserved and this will NOT block the player.`
              )}
            </p>
            <div className="flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => setUnfriendConfirmTarget(null)}
                className="px-3.5 py-2 rounded bg-neutral-800 hover:bg-neutral-700 text-neutral-200 font-btn font-bold text-xs cursor-pointer"
              >
                {t('Hủy', 'Cancel')}
              </button>
              <button
                type="button"
                onClick={async () => {
                  const target = unfriendConfirmTarget;
                  setUnfriendConfirmTarget(null);
                  const res = await social.unfriend(currentUser, target.uid);
                  if (res.message) showTempFeedback(res.message);
                  await refreshFriendsData();
                }}
                className="px-3.5 py-2 rounded bg-red-600 hover:bg-red-500 text-white font-btn font-black text-xs cursor-pointer"
              >
                {t('Xác nhận xóa bạn', 'Unfriend')}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* =====================================================================
          M7.8 MỤC VII: PRIVATE CHAT 1-1 MODAL (WITH ADD FRIEND & BLOCK / UNBLOCK)
         ===================================================================== */}
      {privateChatPeer && (
        <div
          className="fixed inset-0 z-[80] bg-[#050510]/88 flex items-center justify-center p-3"
          onClick={() => setPrivateChatPeer(null)}
        >
          <div
            data-testid="private-chat-modal"
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-md h-[76vh] max-h-[600px] bg-[#0b0d1e] border-2 border-[#00F0FF]/55 rounded-xl shadow-2xl flex flex-col overflow-hidden animate-neo-fade-in"
          >
            {/* Header */}
            <div className="px-3.5 py-2.5 bg-[#050510] border-b border-[#00F0FF]/25 flex items-center justify-between gap-2">
              <div className="flex items-center gap-2.5 min-w-0">
                <AvatarThumb
                  url={privateChatPeer.avatarUrl}
                  name={privateChatPeer.displayName}
                  online={onlinePlayers.some((p) => p.uid === privateChatPeer.uid) || privateChatPeer.isOnline}
                />
                <div className="min-w-0">
                  <p className="font-btn text-xs sm:text-sm font-black text-[#EAF4FF] truncate">
                    {privateChatPeer.displayName}
                  </p>
                  <p className="text-[10px] text-neutral-400">
                    {onlinePlayers.some((p) => p.uid === privateChatPeer.uid) ? (
                      <span className="text-emerald-400 font-semibold">● Online</span>
                    ) : (
                      <span>● Offline</span>
                    )}
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-1.5 shrink-0">
                {!privateRel.isFriend && privateRel.pendingDirection === 'NONE' && (
                  <button
                    type="button"
                    onClick={() => void handleSendFriendRequest(privateChatPeer)}
                    className="w-8 h-8 rounded bg-emerald-950/60 hover:bg-emerald-500/25 border border-emerald-500/50 text-emerald-300 flex items-center justify-center cursor-pointer"
                    title={t('Kết bạn', 'Add Friend')}
                  >
                    <UserPlus className="w-4 h-4" />
                  </button>
                )}
                <button
                  type="button"
                  data-testid="private-chat-block-toggle-btn"
                  onClick={() => void handleToggleBlock()}
                  className={`w-8 h-8 rounded border flex items-center justify-center cursor-pointer transition-colors ${
                    privateRel.blockedByMe
                      ? 'bg-emerald-950/70 hover:bg-emerald-500/25 border-emerald-500/50 text-emerald-300'
                      : 'bg-red-950/70 hover:bg-red-500/25 border-red-500/50 text-red-300'
                  }`}
                  aria-label={privateRel.blockedByMe ? t('Bỏ chặn', 'Unblock') : t('Chặn tin nhắn', 'Block')}
                  title={privateRel.blockedByMe ? t('Bỏ chặn', 'Unblock') : t('Chặn tin nhắn', 'Block')}
                >
                  {privateRel.blockedByMe ? (
                    <ShieldCheck className="w-4 h-4" />
                  ) : (
                    <Ban className="w-4 h-4" />
                  )}
                </button>
                <button
                  type="button"
                  onClick={() => setPrivateChatPeer(null)}
                  className="w-8 h-8 rounded bg-neutral-900 hover:bg-neutral-800 border border-neutral-700 text-neutral-300 flex items-center justify-center cursor-pointer"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>

            {/* Messages */}
            <div className="flex-1 overflow-y-auto p-3 space-y-2 bg-[#050510]/80">
              {privateMessages.length === 0 ? (
                <p className="text-center text-xs text-neutral-500 py-10">
                  {t('Bắt đầu cuộc trò chuyện riêng tư.', 'Start your private conversation.')}
                </p>
              ) : (
                privateMessages.map((m) => {
                  const isMine = m.senderUid === currentUser.uid;
                  return (
                    <div key={m.id} className={`flex ${isMine ? 'justify-end' : 'justify-start'}`}>
                      <div
                        className={`max-w-[82%] px-3 py-2 rounded-lg text-xs border ${
                          isMine
                            ? 'bg-[#00F0FF]/15 border-[#00F0FF]/45 text-[#EAF4FF]'
                            : 'bg-[#0b0d1e] border-neutral-700 text-neutral-100'
                        }`}
                      >
                        <p className="break-words leading-relaxed">{m.content}</p>
                        <p className="text-[9px] text-neutral-400 mt-1 text-right">
                          {formatShortTime(m.createdAtMs)}
                        </p>
                      </div>
                    </div>
                  );
                })
              )}
              <div ref={privateChatEndRef} />
            </div>

            {/* Block status banner or error */}
            {(privateRel.blockedByMe || privateRel.blockedByOther || privateError) && (
              <div className="px-3 py-2 bg-red-950/70 border-t border-red-500/40 text-red-200 text-[11px] flex items-center justify-between gap-2">
                <div className="flex items-center gap-1.5 min-w-0">
                  <ShieldAlert className="w-3.5 h-3.5 text-red-400 shrink-0" />
                  <span>
                    {privateError ||
                      (privateRel.blockedByOther
                        ? t('Bạn không thể gửi tin nhắn vì người dùng này đã chặn bạn.', 'You cannot send messages because this user blocked you.')
                        : t('Bạn đang chặn người dùng này. Bỏ chặn để tiếp tục nhắn tin.', 'You blocked this user. Unblock to send messages.'))}
                  </span>
                </div>
                {privateError && (
                  <button
                    type="button"
                    onClick={() => setPrivateError(null)}
                    className="p-0.5 rounded hover:bg-red-900/60 text-red-200 hover:text-white shrink-0 cursor-pointer"
                    aria-label={t('Đóng', 'Close')}
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
            )}

            {/* Input */}
            <form
              onSubmit={(e) => {
                e.preventDefault();
                void handleSendPrivate();
              }}
              className="p-2.5 bg-[#050510] border-t border-neutral-800 flex items-center gap-2"
            >
              <input
                type="text"
                maxLength={SOCIAL_CONFIG.PRIVATE_CHAT_MAX_LENGTH}
                disabled={privateRel.blockedByMe || privateRel.blockedByOther}
                value={privateInput}
                onChange={(e) => setPrivateInput(e.target.value)}
                placeholder={t('Nhập tin nhắn riêng...', 'Type a private message...')}
                className="flex-1 px-3 py-2 rounded-lg bg-[#0b0d1e] border border-neutral-700 focus:border-[#00F0FF] focus:outline-none text-xs text-white disabled:opacity-50"
              />
              <button
                type="submit"
                disabled={isSendingPrivate || !privateInput.trim() || privateRel.blockedByMe || privateRel.blockedByOther}
                className="px-3.5 py-2 rounded-lg bg-[#00F0FF] hover:bg-cyan-300 text-[#050510] font-btn font-black text-xs flex items-center gap-1 cursor-pointer disabled:opacity-40"
              >
                <Send className="w-3.5 h-3.5" />
                <span>{t('Gửi', 'Send')}</span>
              </button>
            </form>
          </div>
        </div>
      )}

      {/* =====================================================================
          PUBLIC PROFILE MODAL (SAFE PUBLIC INFO ONLY — ZERO EMAIL / ZERO RAW UID)
         ===================================================================== */}
      {profileModalUser && (
        <div
          className="fixed inset-0 z-[85] bg-[#050510]/88 flex items-center justify-center p-4"
          onClick={() => setProfileModalUser(null)}
        >
          <div
            data-testid="public-profile-modal"
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-sm bg-[#0b0d1e] border-2 border-[#00F0FF]/55 rounded-xl p-5 space-y-4 shadow-2xl animate-neo-fade-in"
          >
            <div className="flex items-start justify-between">
              <div className="flex items-center gap-3">
                <AvatarThumb
                  url={profileModalUser.avatarUrl}
                  name={profileModalUser.displayName}
                  online={profileModalUser.isOnline}
                  size="lg"
                />
                <div>
                  <h4 className="font-btn text-base font-black text-[#EAF4FF]">
                    {profileModalUser.displayName}
                  </h4>
                  <span
                    className={`inline-block mt-1 text-[10px] font-bold px-2 py-0.5 rounded border ${
                      profileModalUser.isOnline
                        ? 'bg-emerald-950/60 border-emerald-500/40 text-emerald-300'
                        : 'bg-neutral-900 border-neutral-700 text-neutral-400'
                    }`}
                  >
                    {profileModalUser.isOnline ? '● Online' : '● Offline'}
                  </span>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setProfileModalUser(null)}
                className="text-neutral-400 hover:text-white cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="grid grid-cols-2 gap-2.5 text-xs">
              <div className="p-2.5 rounded-lg bg-[#050510] border border-neutral-800">
                <p className="text-[10px] uppercase text-neutral-400 font-bold">
                  {t('Quân hàm', 'Rank')}
                </p>
                <p className="font-btn font-black text-[#FFB800] mt-0.5">
                  {localizeMilitaryRankTitle(profileModalUser.rankTitle, lang)}
                </p>
              </div>
              <div className="p-2.5 rounded-lg bg-[#050510] border border-neutral-800">
                <p className="text-[10px] uppercase text-neutral-400 font-bold">
                  {t('Sao', 'Stars')}
                </p>
                <p className="font-hud font-bold text-[#00F0FF] mt-0.5 flex items-center gap-1">
                  <span>{profileModalUser.stars}</span>
                  <Star className="w-3.5 h-3.5 text-[#FFB800] fill-[#FFB800]" />
                </p>
              </div>
            </div>

            {profileModalUser.uid !== currentUser.uid && (
              <div className="flex items-center gap-2 pt-1">
                <button
                  type="button"
                  onClick={() => {
                    const target = profileModalUser;
                    setProfileModalUser(null);
                    openPrivateChatWithPeer(target);
                  }}
                  className="flex-1 py-2 rounded-lg bg-[#00F0FF] hover:bg-cyan-300 text-[#050510] font-btn font-black text-xs flex items-center justify-center gap-1.5 cursor-pointer"
                >
                  <MessageSquare className="w-3.5 h-3.5" />
                  <span>{t('Nhắn tin', 'Chat')}</span>
                </button>
                {canShowAddFriend(profileModalUser.uid) ? (
                  <button
                    type="button"
                    onClick={() => void handleSendFriendRequest(profileModalUser)}
                    className="flex-1 py-2 rounded-lg bg-emerald-500 hover:bg-emerald-400 text-[#050510] font-btn font-black text-xs flex items-center justify-center gap-1.5 cursor-pointer"
                  >
                    <UserPlus className="w-3.5 h-3.5" />
                    <span>{t('Kết bạn', 'Add Friend')}</span>
                  </button>
                ) : friendUidSet.has(profileModalUser.uid) ? (
                  <span className="flex-1 py-2 rounded-lg bg-emerald-950/60 border border-emerald-500/40 text-emerald-300 font-btn font-bold text-xs flex items-center justify-center gap-1">
                    <UserCheck className="w-3.5 h-3.5" />
                    <span>{t('Đã là bạn bè', 'Friends')}</span>
                  </span>
                ) : null}
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
};
