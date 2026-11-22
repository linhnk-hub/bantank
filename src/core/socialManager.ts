/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * M7.8 – UNIFIED SOCIAL SYSTEM (PRESENCE, GLOBAL CHAT, ACCOUNT SEARCH, FRIENDS, PRIVATE CHAT, BLOCK, ADMIN FRIENDS RBAC)
 *
 * Kiến trúc bảo mật & tích hợp:
 * - Tái sử dụng trực tiếp AuthManager + SessionManager (KHÔNG tạo hệ thống Session độc lập).
 * - Không bao giờ lộ email, UID thô hoặc dữ liệu riêng tư trong danh sách Online / Tìm kiếm / Hồ sơ công khai.
 * - Tách bạch hoàn toàn Unfriend và Block; không bao giờ xóa tài khoản hay lịch sử chat khi Unfriend / Block / Admin xóa bạn.
 * - Phân quyền giữ đúng 3 cấp ADMIN / MOD / PLAYER (chỉ ADMIN duy nhất được xóa quan hệ bạn bè kèm Audit Log).
 * - Hỗ trợ Injectable SocialStorageAdapter (FirestoreSocialStorageAdapter cho Production sau khi áp dụng Proposed Rules
 *   & InMemorySocialStorageAdapter cho kiểm thử tự động / graceful fallback khi Production Rules chưa công bố).
 */

import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  limit,
  onSnapshot,
  orderBy,
  query,
  setDoc,
  where,
  type Unsubscribe,
} from 'firebase/firestore';
import { getFirebaseDb } from './firebaseConfig.ts';
import {
  AuthManager,
  getUserDisplayLabel,
  resolveUserRole,
  type AuthIdentityLike,
  type UserRole,
} from './authManager.ts';
import { SessionManager } from './sessionManager.ts';
import { PlayerStatsManager } from './playerStatsManager.ts';
import { SystemAuditLogger } from './systemAuditLogger.ts';
import type { CoopRoomMode } from './coopOnlineManager.ts';

export const SOCIAL_CONFIG = {
  PRESENCE_HEARTBEAT_MS: 30_000,
  PRESENCE_STALE_TIMEOUT_MS: 90_000,
  OFFLINE_TOAST_GRACE_MS: 10_000,
  GLOBAL_CHAT_MAX_LENGTH: 300,
  GLOBAL_CHAT_COOLDOWN_MS: 1_500,
  GLOBAL_CHAT_PAGE_SIZE: 40,
  PRIVATE_CHAT_MAX_LENGTH: 500,
  PRIVATE_CHAT_COOLDOWN_MS: 1_000,
  PRIVATE_CHAT_PAGE_SIZE: 40,
  SEARCH_MIN_INTERVAL_MS: 350,
  SEARCH_MAX_RESULTS: 20,
} as const;

export interface PublicPlayerProfile {
  /** Mã định danh nội bộ dùng cho thao tác kết bạn / chat (KHÔNG hiển thị nguyên dạng UID/email lên UI). */
  uid: string;
  /** Mã công khai ngắn an toàn hiển thị trên UI (ví dụ #BT-7F3A). */
  handleTag: string;
  displayName: string;
  avatarUrl: string | null;
  roleBadge: UserRole;
  rankTitle: string;
  stars: number;
  isOnline: boolean;
  lastSeenMs: number;
}

export interface PresenceRecord {
  uid: string;
  handleTag: string;
  displayName: string;
  avatarUrl: string | null;
  roleBadge: UserRole;
  rankTitle: string;
  stars: number;
  online: boolean;
  lastHeartbeatMs: number;
  sessionId: string | null;
  updatedAtMs: number;
}

export interface GlobalChatMessage {
  id: string;
  clientMsgId: string;
  senderUid: string;
  senderHandleTag: string;
  senderDisplayName: string;
  senderAvatarUrl: string | null;
  senderRoleBadge: UserRole;
  content: string;
  createdAtMs: number;
  status: 'SENT' | 'MODERATED';
}

export interface PrivateChatMessage {
  id: string;
  chatId: string;
  clientMsgId: string;
  senderUid: string;
  senderDisplayName: string;
  senderAvatarUrl: string | null;
  recipientUid: string;
  content: string;
  createdAtMs: number;
}

export interface FriendRequestRecord {
  id: string;
  fromUid: string;
  fromDisplayName: string;
  fromHandleTag: string;
  fromAvatarUrl: string | null;
  toUid: string;
  toDisplayName: string;
  toHandleTag: string;
  toAvatarUrl: string | null;
  status: 'PENDING' | 'ACCEPTED' | 'REJECTED' | 'CANCELLED';
  createdAtMs: number;
  updatedAtMs: number;
}

export interface FriendshipRecord {
  pairId: string;
  userA: string;
  userB: string;
  userADisplayName: string;
  userBDisplayName: string;
  userAHandleTag: string;
  userBHandleTag: string;
  userAAvatarUrl: string | null;
  userBAvatarUrl: string | null;
  createdAtMs: number;
}

export interface DeletedFriendRecord {
  targetUid: string;
  targetDisplayName: string;
  targetHandleTag: string;
  targetAvatarUrl: string | null;
  deletedAtMs: number;
}

export interface BlockRecord {
  id: string; // `${blockerUid}__${blockedUid}`
  blockerUid: string;
  blockedUid: string;
  createdAtMs: number;
}

export interface RoomInviteRecord {
  id: string;
  fromUid: string;
  fromDisplayName: string;
  toUid: string;
  roomCode: string;
  roomMode: CoopRoomMode;
  hasPassword: boolean;
  createdAtMs: number;
  expiresAtMs: number;
}

export interface FriendPresenceToastEvent {
  id: string;
  friendUid: string;
  friendDisplayName: string;
  friendAvatarUrl: string | null;
  status: 'ONLINE' | 'OFFLINE';
  timestampMs: number;
}

export interface SocialActionResult<T = void> {
  success: boolean;
  errorCode?:
    | 'UNAUTHENTICATED'
    | 'SESSION_INACTIVE'
    | 'PERMISSION_DENIED'
    | 'INVALID_INPUT'
    | 'CONTENT_VIOLATION'
    | 'RATE_LIMITED'
    | 'DUPLICATE_MESSAGE'
    | 'SELF_ACTION'
    | 'ALREADY_FRIENDS'
    | 'REQUEST_ALREADY_PENDING'
    | 'NOT_FOUND'
    | 'BLOCKED_BY_RECIPIENT'
    | 'YOU_BLOCKED_USER'
    | 'RULES_NOT_DEPLOYED'
    | 'NETWORK_ERROR';
  message?: string;
  data?: T;
}

export interface AdminPairInspection {
  pairId: string;
  uidA: string;
  uidB: string;
  areFriends: boolean;
  createdAtMs: number | null;
  friendship: FriendshipRecord | null;
}

export interface SocialStorageAdapter {
  readonly isFirestoreBacked: boolean;
  // Presence & Public Profile
  upsertPresenceAndProfile(record: PresenceRecord): Promise<void>;
  markOffline(uid: string, nowMs: number): Promise<void>;
  listPresenceRecords(maxItems: number): Promise<PresenceRecord[]>;
  subscribePresence(
    maxItems: number,
    onUpdate: (records: PresenceRecord[]) => void,
    onError?: (err: unknown) => void
  ): Unsubscribe;
  listPublicProfiles(maxItems: number): Promise<PresenceRecord[]>;
  getPublicProfile(uid: string): Promise<PresenceRecord | null>;

  // Global Chat
  addGlobalMessage(msg: GlobalChatMessage): Promise<void>;
  listGlobalMessages(pageSize: number, beforeMs?: number): Promise<GlobalChatMessage[]>;
  subscribeGlobalMessages(
    pageSize: number,
    onUpdate: (messages: GlobalChatMessage[]) => void,
    onError?: (err: unknown) => void
  ): Unsubscribe;

  // Private Chat
  addPrivateMessage(msg: PrivateChatMessage): Promise<void>;
  listPrivateMessages(
    chatId: string,
    pageSize: number,
    beforeMs?: number
  ): Promise<PrivateChatMessage[]>;
  subscribePrivateMessages(
    chatId: string,
    pageSize: number,
    onUpdate: (messages: PrivateChatMessage[]) => void,
    onError?: (err: unknown) => void
  ): Unsubscribe;

  // Friend Requests & Friendships
  getFriendRequest(id: string): Promise<FriendRequestRecord | null>;
  upsertFriendRequest(req: FriendRequestRecord): Promise<void>;
  deleteFriendRequest(id: string): Promise<void>;
  listFriendRequestsForUser(uid: string): Promise<FriendRequestRecord[]>;

  getFriendship(pairId: string): Promise<FriendshipRecord | null>;
  upsertFriendship(record: FriendshipRecord): Promise<void>;
  deleteFriendship(pairId: string): Promise<void>;
  listFriendshipsForUser(uid: string): Promise<FriendshipRecord[]>;
  listAllFriendships(maxItems: number): Promise<FriendshipRecord[]>;

  // Private Deleted Friends History
  upsertDeletedFriend(ownerUid: string, record: DeletedFriendRecord): Promise<void>;
  deleteDeletedFriend(ownerUid: string, targetUid: string): Promise<void>;
  listDeletedFriends(ownerUid: string): Promise<DeletedFriendRecord[]>;

  // Blocks
  getBlock(blockerUid: string, blockedUid: string): Promise<BlockRecord | null>;
  upsertBlock(record: BlockRecord): Promise<void>;
  deleteBlock(blockerUid: string, blockedUid: string): Promise<void>;
  listBlocksForUser(uid: string): Promise<BlockRecord[]>;

  // Room Invites
  upsertRoomInvite(invite: RoomInviteRecord): Promise<void>;
  listRoomInvitesForUser(uid: string): Promise<RoomInviteRecord[]>;
  deleteRoomInvite(id: string): Promise<void>;
}

const BANNED_CONTENT_PATTERNS: ReadonlyArray<RegExp> = [
  /\b(dm|đm|dcm|đcm|vl|vcl|cc|clmm|cmm|fuck|shit|bitch|asshole)\b/i,
  /(https?:\/\/[^\s]*\.(ru|xyz|top|click|tk)\b)/i,
];

export function buildPairId(uidA: string, uidB: string): string {
  const a = uidA.trim();
  const b = uidB.trim();
  return a < b ? `${a}__${b}` : `${b}__${a}`;
}

export function buildHandleTag(uid: string): string {
  let h = 2166136261;
  for (let i = 0; i < uid.length; i++) {
    h ^= uid.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  const code = ((h >>> 0) % 0xffff).toString(16).toUpperCase().padStart(4, '0');
  return `#BT-${code}`;
}

export function isPresenceRecordOnline(
  record: Pick<PresenceRecord, 'online' | 'lastHeartbeatMs'>,
  nowMs: number = Date.now()
): boolean {
  if (!record.online) return false;
  if (!Number.isFinite(record.lastHeartbeatMs) || record.lastHeartbeatMs <= 0) return false;
  return nowMs - record.lastHeartbeatMs <= SOCIAL_CONFIG.PRESENCE_STALE_TIMEOUT_MS;
}

export function toSafePublicProfile(
  record: PresenceRecord,
  nowMs: number = Date.now()
): PublicPlayerProfile {
  return {
    uid: record.uid,
    handleTag: record.handleTag || buildHandleTag(record.uid),
    displayName: (record.displayName || 'Commander').trim().slice(0, 40) || 'Commander',
    avatarUrl: record.avatarUrl || null,
    roleBadge: record.roleBadge === 'ADMIN' || record.roleBadge === 'MOD' ? record.roleBadge : 'PLAYER',
    rankTitle: record.rankTitle || 'Binh nhì',
    stars: Number.isFinite(record.stars) ? Math.max(0, Math.floor(record.stars)) : 0,
    isOnline: isPresenceRecordOnline(record, nowMs),
    lastSeenMs: record.lastHeartbeatMs || record.updatedAtMs || 0,
  };
}

export function validateChatContent(
  rawText: string,
  maxLength: number
): { valid: boolean; cleaned: string; errorCode?: 'INVALID_INPUT' | 'CONTENT_VIOLATION'; message?: string } {
  const cleaned = rawText.replace(/\s+/g, ' ').trim();
  if (!cleaned) {
    return {
      valid: false,
      cleaned: '',
      errorCode: 'INVALID_INPUT',
      message: 'Nội dung tin nhắn không được để trống.',
    };
  }
  if (cleaned.length > maxLength) {
    return {
      valid: false,
      cleaned,
      errorCode: 'INVALID_INPUT',
      message: `Tin nhắn vượt quá giới hạn tối đa ${maxLength} ký tự.`,
    };
  }
  for (const pattern of BANNED_CONTENT_PATTERNS) {
    if (pattern.test(cleaned)) {
      return {
        valid: false,
        cleaned,
        errorCode: 'CONTENT_VIOLATION',
        message: 'Tin nhắn chứa từ ngữ hoặc liên kết vi phạm quy tắc cộng đồng và đã bị chặn.',
      };
    }
  }
  return { valid: true, cleaned };
}

function isFirestorePermissionError(err: unknown): boolean {
  const code = String((err as { code?: string })?.code ?? '').toLowerCase();
  const msg = String((err as { message?: string })?.message ?? '').toLowerCase();
  return code.includes('permission-denied') || msg.includes('missing or insufficient permissions');
}

/**
 * In-memory deterministic storage adapter (dùng cho kiểm thử tự động và fallback cục bộ an toàn).
 */
export class InMemorySocialStorageAdapter implements SocialStorageAdapter {
  public readonly isFirestoreBacked = false;
  private presenceMap = new Map<string, PresenceRecord>();
  private globalMessages: GlobalChatMessage[] = [];
  private privateMessages = new Map<string, PrivateChatMessage[]>();
  private friendRequests = new Map<string, FriendRequestRecord>();
  private friendships = new Map<string, FriendshipRecord>();
  private deletedFriends = new Map<string, Map<string, DeletedFriendRecord>>();
  private blocks = new Map<string, BlockRecord>();
  private roomInvites = new Map<string, RoomInviteRecord>();

  private presenceSubs = new Set<(records: PresenceRecord[]) => void>();
  private globalChatSubs = new Set<(msgs: GlobalChatMessage[]) => void>();
  private privateChatSubs = new Map<string, Set<(msgs: PrivateChatMessage[]) => void>>();

  private emitPresence(): void {
    const list = Array.from(this.presenceMap.values());
    for (const cb of this.presenceSubs) cb(list);
  }

  private emitGlobalChat(): void {
    const sorted = [...this.globalMessages].sort((a, b) => a.createdAtMs - b.createdAtMs);
    for (const cb of this.globalChatSubs) cb(sorted);
  }

  private emitPrivateChat(chatId: string): void {
    const subs = this.privateChatSubs.get(chatId);
    if (!subs) return;
    const sorted = [...(this.privateMessages.get(chatId) ?? [])].sort(
      (a, b) => a.createdAtMs - b.createdAtMs
    );
    for (const cb of subs) cb(sorted);
  }

  public async upsertPresenceAndProfile(record: PresenceRecord): Promise<void> {
    this.presenceMap.set(record.uid, { ...record });
    this.emitPresence();
  }

  public async markOffline(uid: string, nowMs: number): Promise<void> {
    const existing = this.presenceMap.get(uid);
    if (existing) {
      this.presenceMap.set(uid, {
        ...existing,
        online: false,
        sessionId: null,
        updatedAtMs: nowMs,
      });
      this.emitPresence();
    }
  }

  public async listPresenceRecords(maxItems: number): Promise<PresenceRecord[]> {
    return Array.from(this.presenceMap.values())
      .sort((a, b) => b.lastHeartbeatMs - a.lastHeartbeatMs)
      .slice(0, maxItems)
      .map((r) => ({ ...r }));
  }

  public subscribePresence(
    maxItems: number,
    onUpdate: (records: PresenceRecord[]) => void
  ): Unsubscribe {
    const wrapped = (all: PresenceRecord[]) => {
      onUpdate(
        [...all]
          .sort((a, b) => b.lastHeartbeatMs - a.lastHeartbeatMs)
          .slice(0, maxItems)
          .map((r) => ({ ...r }))
      );
    };
    this.presenceSubs.add(wrapped);
    wrapped(Array.from(this.presenceMap.values()));
    return () => {
      this.presenceSubs.delete(wrapped);
    };
  }

  public async listPublicProfiles(maxItems: number): Promise<PresenceRecord[]> {
    return this.listPresenceRecords(maxItems);
  }

  public async getPublicProfile(uid: string): Promise<PresenceRecord | null> {
    const r = this.presenceMap.get(uid);
    return r ? { ...r } : null;
  }

  public async addGlobalMessage(msg: GlobalChatMessage): Promise<void> {
    if (this.globalMessages.some((m) => m.clientMsgId === msg.clientMsgId)) {
      return;
    }
    this.globalMessages.push({ ...msg });
    this.emitGlobalChat();
  }

  public async listGlobalMessages(
    pageSize: number,
    beforeMs?: number
  ): Promise<GlobalChatMessage[]> {
    const filtered = this.globalMessages
      .filter((m) => (typeof beforeMs === 'number' ? m.createdAtMs < beforeMs : true))
      .sort((a, b) => b.createdAtMs - a.createdAtMs)
      .slice(0, pageSize)
      .reverse();
    return filtered.map((m) => ({ ...m }));
  }

  public subscribeGlobalMessages(
    pageSize: number,
    onUpdate: (messages: GlobalChatMessage[]) => void
  ): Unsubscribe {
    const wrapped = (all: GlobalChatMessage[]) => {
      onUpdate(all.slice(-pageSize).map((m) => ({ ...m })));
    };
    this.globalChatSubs.add(wrapped);
    wrapped([...this.globalMessages].sort((a, b) => a.createdAtMs - b.createdAtMs));
    return () => {
      this.globalChatSubs.delete(wrapped);
    };
  }

  public async addPrivateMessage(msg: PrivateChatMessage): Promise<void> {
    const arr = this.privateMessages.get(msg.chatId) ?? [];
    if (arr.some((m) => m.clientMsgId === msg.clientMsgId)) {
      return;
    }
    arr.push({ ...msg });
    this.privateMessages.set(msg.chatId, arr);
    this.emitPrivateChat(msg.chatId);
  }

  public async listPrivateMessages(
    chatId: string,
    pageSize: number,
    beforeMs?: number
  ): Promise<PrivateChatMessage[]> {
    const arr = this.privateMessages.get(chatId) ?? [];
    return arr
      .filter((m) => (typeof beforeMs === 'number' ? m.createdAtMs < beforeMs : true))
      .sort((a, b) => b.createdAtMs - a.createdAtMs)
      .slice(0, pageSize)
      .reverse()
      .map((m) => ({ ...m }));
  }

  public subscribePrivateMessages(
    chatId: string,
    pageSize: number,
    onUpdate: (messages: PrivateChatMessage[]) => void
  ): Unsubscribe {
    let subs = this.privateChatSubs.get(chatId);
    if (!subs) {
      subs = new Set();
      this.privateChatSubs.set(chatId, subs);
    }
    const wrapped = (all: PrivateChatMessage[]) => {
      onUpdate(all.slice(-pageSize).map((m) => ({ ...m })));
    };
    subs.add(wrapped);
    wrapped(
      [...(this.privateMessages.get(chatId) ?? [])].sort((a, b) => a.createdAtMs - b.createdAtMs)
    );
    return () => {
      subs?.delete(wrapped);
    };
  }

  public async getFriendRequest(id: string): Promise<FriendRequestRecord | null> {
    const r = this.friendRequests.get(id);
    return r ? { ...r } : null;
  }

  public async upsertFriendRequest(req: FriendRequestRecord): Promise<void> {
    this.friendRequests.set(req.id, { ...req });
  }

  public async deleteFriendRequest(id: string): Promise<void> {
    this.friendRequests.delete(id);
  }

  public async listFriendRequestsForUser(uid: string): Promise<FriendRequestRecord[]> {
    return Array.from(this.friendRequests.values())
      .filter((r) => r.status === 'PENDING' && (r.fromUid === uid || r.toUid === uid))
      .sort((a, b) => b.createdAtMs - a.createdAtMs)
      .map((r) => ({ ...r }));
  }

  public async getFriendship(pairId: string): Promise<FriendshipRecord | null> {
    const r = this.friendships.get(pairId);
    return r ? { ...r } : null;
  }

  public async upsertFriendship(record: FriendshipRecord): Promise<void> {
    this.friendships.set(record.pairId, { ...record });
  }

  public async deleteFriendship(pairId: string): Promise<void> {
    this.friendships.delete(pairId);
  }

  public async listFriendshipsForUser(uid: string): Promise<FriendshipRecord[]> {
    return Array.from(this.friendships.values())
      .filter((f) => f.userA === uid || f.userB === uid)
      .sort((a, b) => b.createdAtMs - a.createdAtMs)
      .map((f) => ({ ...f }));
  }

  public async listAllFriendships(maxItems: number): Promise<FriendshipRecord[]> {
    return Array.from(this.friendships.values())
      .sort((a, b) => b.createdAtMs - a.createdAtMs)
      .slice(0, maxItems)
      .map((f) => ({ ...f }));
  }

  public async upsertDeletedFriend(ownerUid: string, record: DeletedFriendRecord): Promise<void> {
    let map = this.deletedFriends.get(ownerUid);
    if (!map) {
      map = new Map();
      this.deletedFriends.set(ownerUid, map);
    }
    map.set(record.targetUid, { ...record });
  }

  public async deleteDeletedFriend(ownerUid: string, targetUid: string): Promise<void> {
    this.deletedFriends.get(ownerUid)?.delete(targetUid);
  }

  public async listDeletedFriends(ownerUid: string): Promise<DeletedFriendRecord[]> {
    const map = this.deletedFriends.get(ownerUid);
    if (!map) return [];
    return Array.from(map.values())
      .sort((a, b) => b.deletedAtMs - a.deletedAtMs)
      .map((r) => ({ ...r }));
  }

  public async getBlock(blockerUid: string, blockedUid: string): Promise<BlockRecord | null> {
    const b = this.blocks.get(`${blockerUid}__${blockedUid}`);
    return b ? { ...b } : null;
  }

  public async upsertBlock(record: BlockRecord): Promise<void> {
    this.blocks.set(record.id, { ...record });
  }

  public async deleteBlock(blockerUid: string, blockedUid: string): Promise<void> {
    this.blocks.delete(`${blockerUid}__${blockedUid}`);
  }

  public async listBlocksForUser(uid: string): Promise<BlockRecord[]> {
    return Array.from(this.blocks.values())
      .filter((b) => b.blockerUid === uid || b.blockedUid === uid)
      .map((b) => ({ ...b }));
  }

  public async upsertRoomInvite(invite: RoomInviteRecord): Promise<void> {
    this.roomInvites.set(invite.id, { ...invite });
  }

  public async listRoomInvitesForUser(uid: string): Promise<RoomInviteRecord[]> {
    const now = Date.now();
    return Array.from(this.roomInvites.values())
      .filter((inv) => inv.toUid === uid && inv.expiresAtMs > now)
      .sort((a, b) => b.createdAtMs - a.createdAtMs)
      .map((inv) => ({ ...inv }));
  }

  public async deleteRoomInvite(id: string): Promise<void> {
    this.roomInvites.delete(id);
  }
}

/**
 * Firestore adapter tương thích hoàn toàn với Proposed Rules M7.8 (PROPOSED_FIRESTORE_RULES_M7_8.md).
 * Nếu Production Firestore Rules chưa công bố các collection mới, adapter tự động nhận diện
 * permission-denied để không gây crash ứng dụng và thông báo rõ ràng trạng thái chờ Rules.
 */
export class FirestoreSocialStorageAdapter implements SocialStorageAdapter {
  public readonly isFirestoreBacked = true;
  private fallback = new InMemorySocialStorageAdapter();
  private rulesDenied = false;

  public isRulesPendingDeployment(): boolean {
    return this.rulesDenied;
  }

  private getDbOrNull() {
    try {
      return getFirebaseDb();
    } catch {
      return null;
    }
  }

  private handleErr(err: unknown): boolean {
    if (isFirestorePermissionError(err)) {
      this.rulesDenied = true;
      return true;
    }
    return false;
  }

  public async upsertPresenceAndProfile(record: PresenceRecord): Promise<void> {
    await this.fallback.upsertPresenceAndProfile(record);
    const db = this.getDbOrNull();
    if (!db) return;
    try {
      await setDoc(doc(db, 'user_presence', record.uid), record, { merge: true });
      await setDoc(
        doc(db, 'public_profiles', record.uid),
        {
          uid: record.uid,
          handleTag: record.handleTag,
          displayName: record.displayName,
          displayNameLower: record.displayName.toLowerCase(),
          avatarUrl: record.avatarUrl,
          roleBadge: record.roleBadge,
          rankTitle: record.rankTitle,
          stars: record.stars,
          online: record.online,
          lastHeartbeatMs: record.lastHeartbeatMs,
          updatedAtMs: record.updatedAtMs,
        },
        { merge: true }
      );
      this.rulesDenied = false;
    } catch (err) {
      this.handleErr(err);
    }
  }

  public async markOffline(uid: string, nowMs: number): Promise<void> {
    await this.fallback.markOffline(uid, nowMs);
    const db = this.getDbOrNull();
    if (!db) return;
    try {
      await setDoc(
        doc(db, 'user_presence', uid),
        { online: false, sessionId: null, updatedAtMs: nowMs },
        { merge: true }
      );
      await setDoc(
        doc(db, 'public_profiles', uid),
        { online: false, updatedAtMs: nowMs },
        { merge: true }
      );
    } catch (err) {
      this.handleErr(err);
    }
  }

  public async listPresenceRecords(maxItems: number): Promise<PresenceRecord[]> {
    const db = this.getDbOrNull();
    if (!db) return this.fallback.listPresenceRecords(maxItems);
    try {
      const snap = await getDocs(
        query(collection(db, 'user_presence'), orderBy('lastHeartbeatMs', 'desc'), limit(maxItems))
      );
      const rows = snap.docs.map((d) => d.data() as PresenceRecord);
      this.rulesDenied = false;
      return rows;
    } catch (err) {
      this.handleErr(err);
      return this.fallback.listPresenceRecords(maxItems);
    }
  }

  public subscribePresence(
    maxItems: number,
    onUpdate: (records: PresenceRecord[]) => void,
    onError?: (err: unknown) => void
  ): Unsubscribe {
    const db = this.getDbOrNull();
    if (!db) {
      return this.fallback.subscribePresence(maxItems, onUpdate);
    }
    const q = query(
      collection(db, 'user_presence'),
      orderBy('lastHeartbeatMs', 'desc'),
      limit(maxItems)
    );
    let fallbackUnsub: Unsubscribe | null = null;
    const unsub = onSnapshot(
      q,
      (snap) => {
        this.rulesDenied = false;
        onUpdate(snap.docs.map((d) => d.data() as PresenceRecord));
      },
      (err) => {
        if (this.handleErr(err)) {
          fallbackUnsub = this.fallback.subscribePresence(maxItems, onUpdate);
        }
        onError?.(err);
      }
    );
    return () => {
      unsub();
      fallbackUnsub?.();
    };
  }

  public async listPublicProfiles(maxItems: number): Promise<PresenceRecord[]> {
    const db = this.getDbOrNull();
    if (!db) return this.fallback.listPublicProfiles(maxItems);
    try {
      const snap = await getDocs(
        query(collection(db, 'public_profiles'), orderBy('updatedAtMs', 'desc'), limit(maxItems))
      );
      this.rulesDenied = false;
      return snap.docs.map((d) => d.data() as PresenceRecord);
    } catch (err) {
      this.handleErr(err);
      return this.fallback.listPublicProfiles(maxItems);
    }
  }

  public async getPublicProfile(uid: string): Promise<PresenceRecord | null> {
    const db = this.getDbOrNull();
    if (!db) return this.fallback.getPublicProfile(uid);
    try {
      const snap = await getDoc(doc(db, 'public_profiles', uid));
      this.rulesDenied = false;
      return snap.exists() ? (snap.data() as PresenceRecord) : null;
    } catch (err) {
      this.handleErr(err);
      return this.fallback.getPublicProfile(uid);
    }
  }

  public async addGlobalMessage(msg: GlobalChatMessage): Promise<void> {
    await this.fallback.addGlobalMessage(msg);
    const db = this.getDbOrNull();
    if (!db) return;
    try {
      await setDoc(doc(db, 'global_chat_messages', msg.id), msg);
      this.rulesDenied = false;
    } catch (err) {
      if (!this.handleErr(err)) {
        throw err;
      }
    }
  }

  public async listGlobalMessages(
    pageSize: number,
    beforeMs?: number
  ): Promise<GlobalChatMessage[]> {
    const db = this.getDbOrNull();
    if (!db) return this.fallback.listGlobalMessages(pageSize, beforeMs);
    try {
      const q =
        typeof beforeMs === 'number'
          ? query(
              collection(db, 'global_chat_messages'),
              where('createdAtMs', '<', beforeMs),
              orderBy('createdAtMs', 'desc'),
              limit(pageSize)
            )
          : query(
              collection(db, 'global_chat_messages'),
              orderBy('createdAtMs', 'desc'),
              limit(pageSize)
            );
      const snap = await getDocs(q);
      this.rulesDenied = false;
      return snap.docs.map((d) => d.data() as GlobalChatMessage).reverse();
    } catch (err) {
      this.handleErr(err);
      return this.fallback.listGlobalMessages(pageSize, beforeMs);
    }
  }

  public subscribeGlobalMessages(
    pageSize: number,
    onUpdate: (messages: GlobalChatMessage[]) => void,
    onError?: (err: unknown) => void
  ): Unsubscribe {
    const db = this.getDbOrNull();
    if (!db) return this.fallback.subscribeGlobalMessages(pageSize, onUpdate);
    const q = query(
      collection(db, 'global_chat_messages'),
      orderBy('createdAtMs', 'desc'),
      limit(pageSize)
    );
    let fallbackUnsub: Unsubscribe | null = null;
    const unsub = onSnapshot(
      q,
      (snap) => {
        this.rulesDenied = false;
        onUpdate(snap.docs.map((d) => d.data() as GlobalChatMessage).reverse());
      },
      (err) => {
        if (this.handleErr(err)) {
          fallbackUnsub = this.fallback.subscribeGlobalMessages(pageSize, onUpdate);
        }
        onError?.(err);
      }
    );
    return () => {
      unsub();
      fallbackUnsub?.();
    };
  }

  public async addPrivateMessage(msg: PrivateChatMessage): Promise<void> {
    await this.fallback.addPrivateMessage(msg);
    const db = this.getDbOrNull();
    if (!db) return;
    try {
      await setDoc(doc(db, 'private_chats', msg.chatId, 'messages', msg.id), msg);
      this.rulesDenied = false;
    } catch (err) {
      if (!this.handleErr(err)) {
        throw err;
      }
    }
  }

  public async listPrivateMessages(
    chatId: string,
    pageSize: number,
    beforeMs?: number
  ): Promise<PrivateChatMessage[]> {
    const db = this.getDbOrNull();
    if (!db) return this.fallback.listPrivateMessages(chatId, pageSize, beforeMs);
    try {
      const col = collection(db, 'private_chats', chatId, 'messages');
      const q =
        typeof beforeMs === 'number'
          ? query(col, where('createdAtMs', '<', beforeMs), orderBy('createdAtMs', 'desc'), limit(pageSize))
          : query(col, orderBy('createdAtMs', 'desc'), limit(pageSize));
      const snap = await getDocs(q);
      this.rulesDenied = false;
      return snap.docs.map((d) => d.data() as PrivateChatMessage).reverse();
    } catch (err) {
      this.handleErr(err);
      return this.fallback.listPrivateMessages(chatId, pageSize, beforeMs);
    }
  }

  public subscribePrivateMessages(
    chatId: string,
    pageSize: number,
    onUpdate: (messages: PrivateChatMessage[]) => void,
    onError?: (err: unknown) => void
  ): Unsubscribe {
    const db = this.getDbOrNull();
    if (!db) return this.fallback.subscribePrivateMessages(chatId, pageSize, onUpdate);
    const q = query(
      collection(db, 'private_chats', chatId, 'messages'),
      orderBy('createdAtMs', 'desc'),
      limit(pageSize)
    );
    let fallbackUnsub: Unsubscribe | null = null;
    const unsub = onSnapshot(
      q,
      (snap) => {
        this.rulesDenied = false;
        onUpdate(snap.docs.map((d) => d.data() as PrivateChatMessage).reverse());
      },
      (err) => {
        if (this.handleErr(err)) {
          fallbackUnsub = this.fallback.subscribePrivateMessages(chatId, pageSize, onUpdate);
        }
        onError?.(err);
      }
    );
    return () => {
      unsub();
      fallbackUnsub?.();
    };
  }

  public async getFriendRequest(id: string): Promise<FriendRequestRecord | null> {
    const db = this.getDbOrNull();
    if (!db) return this.fallback.getFriendRequest(id);
    try {
      const snap = await getDoc(doc(db, 'friend_requests', id));
      return snap.exists() ? (snap.data() as FriendRequestRecord) : null;
    } catch (err) {
      this.handleErr(err);
      return this.fallback.getFriendRequest(id);
    }
  }

  public async upsertFriendRequest(req: FriendRequestRecord): Promise<void> {
    await this.fallback.upsertFriendRequest(req);
    const db = this.getDbOrNull();
    if (!db) return;
    try {
      await setDoc(doc(db, 'friend_requests', req.id), req, { merge: true });
      this.rulesDenied = false;
    } catch (err) {
      this.handleErr(err);
    }
  }

  public async deleteFriendRequest(id: string): Promise<void> {
    await this.fallback.deleteFriendRequest(id);
    const db = this.getDbOrNull();
    if (!db) return;
    try {
      await deleteDoc(doc(db, 'friend_requests', id));
    } catch (err) {
      this.handleErr(err);
    }
  }

  public async listFriendRequestsForUser(uid: string): Promise<FriendRequestRecord[]> {
    const db = this.getDbOrNull();
    if (!db) return this.fallback.listFriendRequestsForUser(uid);
    try {
      const [sentSnap, recvSnap] = await Promise.all([
        getDocs(
          query(
            collection(db, 'friend_requests'),
            where('fromUid', '==', uid),
            where('status', '==', 'PENDING'),
            limit(50)
          )
        ),
        getDocs(
          query(
            collection(db, 'friend_requests'),
            where('toUid', '==', uid),
            where('status', '==', 'PENDING'),
            limit(50)
          )
        ),
      ]);
      const merged = new Map<string, FriendRequestRecord>();
      sentSnap.docs.forEach((d) => merged.set(d.id, d.data() as FriendRequestRecord));
      recvSnap.docs.forEach((d) => merged.set(d.id, d.data() as FriendRequestRecord));
      this.rulesDenied = false;
      return Array.from(merged.values()).sort((a, b) => b.createdAtMs - a.createdAtMs);
    } catch (err) {
      this.handleErr(err);
      return this.fallback.listFriendRequestsForUser(uid);
    }
  }

  public async getFriendship(pairId: string): Promise<FriendshipRecord | null> {
    const db = this.getDbOrNull();
    if (!db) return this.fallback.getFriendship(pairId);
    try {
      const snap = await getDoc(doc(db, 'friendships', pairId));
      return snap.exists() ? (snap.data() as FriendshipRecord) : null;
    } catch (err) {
      this.handleErr(err);
      return this.fallback.getFriendship(pairId);
    }
  }

  public async upsertFriendship(record: FriendshipRecord): Promise<void> {
    await this.fallback.upsertFriendship(record);
    const db = this.getDbOrNull();
    if (!db) return;
    try {
      await setDoc(doc(db, 'friendships', record.pairId), record);
      this.rulesDenied = false;
    } catch (err) {
      this.handleErr(err);
    }
  }

  public async deleteFriendship(pairId: string): Promise<void> {
    await this.fallback.deleteFriendship(pairId);
    const db = this.getDbOrNull();
    if (!db) return;
    try {
      await deleteDoc(doc(db, 'friendships', pairId));
    } catch (err) {
      this.handleErr(err);
    }
  }

  public async listFriendshipsForUser(uid: string): Promise<FriendshipRecord[]> {
    const db = this.getDbOrNull();
    if (!db) return this.fallback.listFriendshipsForUser(uid);
    try {
      const [snapA, snapB] = await Promise.all([
        getDocs(query(collection(db, 'friendships'), where('userA', '==', uid), limit(100))),
        getDocs(query(collection(db, 'friendships'), where('userB', '==', uid), limit(100))),
      ]);
      const merged = new Map<string, FriendshipRecord>();
      snapA.docs.forEach((d) => merged.set(d.id, d.data() as FriendshipRecord));
      snapB.docs.forEach((d) => merged.set(d.id, d.data() as FriendshipRecord));
      this.rulesDenied = false;
      return Array.from(merged.values()).sort((a, b) => b.createdAtMs - a.createdAtMs);
    } catch (err) {
      this.handleErr(err);
      return this.fallback.listFriendshipsForUser(uid);
    }
  }

  public async listAllFriendships(maxItems: number): Promise<FriendshipRecord[]> {
    const db = this.getDbOrNull();
    if (!db) return this.fallback.listAllFriendships(maxItems);
    try {
      const snap = await getDocs(
        query(collection(db, 'friendships'), orderBy('createdAtMs', 'desc'), limit(maxItems))
      );
      this.rulesDenied = false;
      return snap.docs.map((d) => d.data() as FriendshipRecord);
    } catch (err) {
      this.handleErr(err);
      return this.fallback.listAllFriendships(maxItems);
    }
  }

  public async upsertDeletedFriend(ownerUid: string, record: DeletedFriendRecord): Promise<void> {
    await this.fallback.upsertDeletedFriend(ownerUid, record);
    const db = this.getDbOrNull();
    if (!db) return;
    try {
      await setDoc(doc(db, 'users', ownerUid, 'deleted_friends', record.targetUid), record);
    } catch (err) {
      this.handleErr(err);
    }
  }

  public async deleteDeletedFriend(ownerUid: string, targetUid: string): Promise<void> {
    await this.fallback.deleteDeletedFriend(ownerUid, targetUid);
    const db = this.getDbOrNull();
    if (!db) return;
    try {
      await deleteDoc(doc(db, 'users', ownerUid, 'deleted_friends', targetUid));
    } catch (err) {
      this.handleErr(err);
    }
  }

  public async listDeletedFriends(ownerUid: string): Promise<DeletedFriendRecord[]> {
    const db = this.getDbOrNull();
    if (!db) return this.fallback.listDeletedFriends(ownerUid);
    try {
      const snap = await getDocs(
        query(
          collection(db, 'users', ownerUid, 'deleted_friends'),
          orderBy('deletedAtMs', 'desc'),
          limit(100)
        )
      );
      return snap.docs.map((d) => d.data() as DeletedFriendRecord);
    } catch (err) {
      this.handleErr(err);
      return this.fallback.listDeletedFriends(ownerUid);
    }
  }

  public async getBlock(blockerUid: string, blockedUid: string): Promise<BlockRecord | null> {
    const db = this.getDbOrNull();
    if (!db) return this.fallback.getBlock(blockerUid, blockedUid);
    try {
      const snap = await getDoc(doc(db, 'user_blocks', `${blockerUid}__${blockedUid}`));
      return snap.exists() ? (snap.data() as BlockRecord) : null;
    } catch (err) {
      this.handleErr(err);
      return this.fallback.getBlock(blockerUid, blockedUid);
    }
  }

  public async upsertBlock(record: BlockRecord): Promise<void> {
    await this.fallback.upsertBlock(record);
    const db = this.getDbOrNull();
    if (!db) return;
    try {
      await setDoc(doc(db, 'user_blocks', record.id), record);
    } catch (err) {
      this.handleErr(err);
    }
  }

  public async deleteBlock(blockerUid: string, blockedUid: string): Promise<void> {
    await this.fallback.deleteBlock(blockerUid, blockedUid);
    const db = this.getDbOrNull();
    if (!db) return;
    try {
      await deleteDoc(doc(db, 'user_blocks', `${blockerUid}__${blockedUid}`));
    } catch (err) {
      this.handleErr(err);
    }
  }

  public async listBlocksForUser(uid: string): Promise<BlockRecord[]> {
    const db = this.getDbOrNull();
    if (!db) return this.fallback.listBlocksForUser(uid);
    try {
      const [snapA, snapB] = await Promise.all([
        getDocs(query(collection(db, 'user_blocks'), where('blockerUid', '==', uid), limit(100))),
        getDocs(query(collection(db, 'user_blocks'), where('blockedUid', '==', uid), limit(100))),
      ]);
      const merged = new Map<string, BlockRecord>();
      snapA.docs.forEach((d) => merged.set(d.id, d.data() as BlockRecord));
      snapB.docs.forEach((d) => merged.set(d.id, d.data() as BlockRecord));
      return Array.from(merged.values());
    } catch (err) {
      this.handleErr(err);
      return this.fallback.listBlocksForUser(uid);
    }
  }

  public async upsertRoomInvite(invite: RoomInviteRecord): Promise<void> {
    await this.fallback.upsertRoomInvite(invite);
    const db = this.getDbOrNull();
    if (!db) return;
    try {
      await setDoc(doc(db, 'room_invites', invite.id), invite);
    } catch (err) {
      this.handleErr(err);
    }
  }

  public async listRoomInvitesForUser(uid: string): Promise<RoomInviteRecord[]> {
    const db = this.getDbOrNull();
    if (!db) return this.fallback.listRoomInvitesForUser(uid);
    try {
      const snap = await getDocs(
        query(collection(db, 'room_invites'), where('toUid', '==', uid), limit(20))
      );
      const now = Date.now();
      return snap.docs
        .map((d) => d.data() as RoomInviteRecord)
        .filter((inv) => inv.expiresAtMs > now);
    } catch (err) {
      this.handleErr(err);
      return this.fallback.listRoomInvitesForUser(uid);
    }
  }

  public async deleteRoomInvite(id: string): Promise<void> {
    await this.fallback.deleteRoomInvite(id);
    const db = this.getDbOrNull();
    if (!db) return;
    try {
      await deleteDoc(doc(db, 'room_invites', id));
    } catch (err) {
      this.handleErr(err);
    }
  }
}

export class SocialManager {
  private static instance: SocialManager | null = null;
  private adapter: SocialStorageAdapter;
  private heartbeatTimer: ReturnType<typeof setInterval> | null = null;
  private presenceUnsub: Unsubscribe | null = null;
  private activeUid: string | null = null;
  private cachedPresence: PresenceRecord[] = [];
  private cachedFriendUids = new Set<string>();
  private lastKnownFriendOnline = new Map<string, boolean>();
  private pendingOfflineTimers = new Map<string, ReturnType<typeof setTimeout>>();

  private lastGlobalMsgSentAt = 0;
  private lastPrivateMsgSentAt = new Map<string, number>();
  private lastSearchAt = 0;
  private sentClientMsgIds = new Set<string>();

  private presenceChangeListeners = new Set<(onlineProfiles: PublicPlayerProfile[]) => void>();
  private toastListeners = new Set<(event: FriendPresenceToastEvent) => void>();
  private socialMutationListeners = new Set<() => void>();

  constructor(adapter?: SocialStorageAdapter) {
    this.adapter = adapter ?? new FirestoreSocialStorageAdapter();
  }

  public static getInstance(): SocialManager {
    if (!SocialManager.instance) {
      SocialManager.instance = new SocialManager();
    }
    return SocialManager.instance;
  }

  public isRulesPendingDeployment(): boolean {
    if (this.adapter instanceof FirestoreSocialStorageAdapter) {
      return this.adapter.isRulesPendingDeployment();
    }
    return false;
  }

  private emitMutation(): void {
    for (const cb of this.socialMutationListeners) cb();
  }

  public subscribeMutations(cb: () => void): () => void {
    this.socialMutationListeners.add(cb);
    return () => {
      this.socialMutationListeners.delete(cb);
    };
  }

  public subscribeFriendToasts(cb: (event: FriendPresenceToastEvent) => void): () => void {
    this.toastListeners.add(cb);
    return () => {
      this.toastListeners.delete(cb);
    };
  }

  public subscribeOnlinePlayers(cb: (players: PublicPlayerProfile[]) => void): () => void {
    this.presenceChangeListeners.add(cb);
    cb(this.getOnlinePlayersSnapshot());
    return () => {
      this.presenceChangeListeners.delete(cb);
    };
  }

  public getOnlinePlayersSnapshot(nowMs: number = Date.now()): PublicPlayerProfile[] {
    return this.cachedPresence
      .filter((r) => isPresenceRecordOnline(r, nowMs))
      .map((r) => toSafePublicProfile(r, nowMs));
  }

  public getOnlineCount(nowMs: number = Date.now()): number {
    return this.getOnlinePlayersSnapshot(nowMs).length;
  }

  public async refreshPresenceSnapshot(nowMs: number = Date.now()): Promise<PublicPlayerProfile[]> {
    const records = await this.adapter.listPresenceRecords(100);
    this.handlePresenceBatchUpdate(records, nowMs);
    return this.getOnlinePlayersSnapshot(nowMs);
  }

  private buildPresenceRecordForUser(
    user: AuthIdentityLike,
    sessionId: string | null,
    nowMs: number
  ): PresenceRecord {
    const uid = user.uid || '';
    const avatarUrl = user.photoURL || null;
    const stats = uid ? PlayerStatsManager.getInstance().getPlayerStatisticsSnapshot(uid) : null;
    return {
      uid,
      handleTag: buildHandleTag(uid),
      displayName: getUserDisplayLabel(user as any) || 'Commander',
      avatarUrl,
      roleBadge: resolveUserRole(user),
      rankTitle: stats?.rankNameVi || 'Binh nhì',
      stars: stats?.starBalance ?? 0,
      online: true,
      lastHeartbeatMs: nowMs,
      sessionId,
      updatedAtMs: nowMs,
    };
  }

  /**
   * M7.8 Mục III: Khởi chạy Presence gắn liền SessionManager hiện có (KHÔNG tạo Session độc lập).
   */
  public async startPresenceForSession(
    user: AuthIdentityLike | null,
    sessionStatus: string,
    sessionId: string | null,
    nowMs: number = Date.now()
  ): Promise<void> {
    if (!user || !user.uid || sessionStatus !== 'ACTIVE') {
      await this.stopPresence(nowMs);
      return;
    }

    const switchingUser = this.activeUid !== user.uid;
    this.activeUid = user.uid;

    const record = this.buildPresenceRecordForUser(user, sessionId, nowMs);
    await this.adapter.upsertPresenceAndProfile(record);

    // Refresh confirmed friends set for Friend Online/Offline toast notifications
    try {
      const friends = await this.adapter.listFriendshipsForUser(user.uid);
      this.cachedFriendUids = new Set(
        friends.map((f) => (f.userA === user.uid ? f.userB : f.userA))
      );
    } catch {
      // ignore
    }

    if (!this.presenceUnsub || switchingUser) {
      this.presenceUnsub?.();
      this.presenceUnsub = this.adapter.subscribePresence(100, (records) => {
        this.handlePresenceBatchUpdate(records, Date.now());
      });
    }

    if (!this.heartbeatTimer) {
      this.heartbeatTimer = setInterval(() => {
        if (typeof document !== 'undefined' && document.visibilityState === 'hidden') {
          return;
        }
        const liveUser = AuthManager.getInstance().getCurrentUser();
        const snap = SessionManager.getInstance().getSnapshot();
        if (!liveUser || !liveUser.uid || snap.status !== 'ACTIVE') {
          void this.stopPresence(Date.now());
          return;
        }
        const beat = this.buildPresenceRecordForUser(liveUser, snap.sessionId, Date.now());
        void this.adapter.upsertPresenceAndProfile(beat);
      }, SOCIAL_CONFIG.PRESENCE_HEARTBEAT_MS);
    }
  }

  public async stopPresence(nowMs: number = Date.now()): Promise<void> {
    const uid = this.activeUid;
    this.activeUid = null;
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
    if (this.presenceUnsub) {
      this.presenceUnsub();
      this.presenceUnsub = null;
    }
    for (const timer of this.pendingOfflineTimers.values()) {
      clearTimeout(timer);
    }
    this.pendingOfflineTimers.clear();
    this.lastKnownFriendOnline.clear();

    if (uid) {
      await this.adapter.markOffline(uid, nowMs);
    }
  }

  /**
   * Đẩy heartbeat thủ công (dùng cho kiểm thử timeout/reconnect hoặc gọi trực tiếp).
   */
  public async publishPresenceHeartbeat(
    actor: AuthIdentityLike,
    targetUid: string,
    sessionId: string | null,
    nowMs: number = Date.now()
  ): Promise<SocialActionResult> {
    if (!actor.uid) {
      return { success: false, errorCode: 'UNAUTHENTICATED', message: 'Chưa đăng nhập.' };
    }
    if (actor.uid !== targetUid) {
      return {
        success: false,
        errorCode: 'PERMISSION_DENIED',
        message: 'Không được phép chỉnh sửa trạng thái Online của người chơi khác.',
      };
    }
    const rec = this.buildPresenceRecordForUser(actor, sessionId, nowMs);
    await this.adapter.upsertPresenceAndProfile(rec);
    return { success: true };
  }

  private handlePresenceBatchUpdate(records: PresenceRecord[], nowMs: number): void {
    this.cachedPresence = records;
    const onlineProfiles = this.getOnlinePlayersSnapshot(nowMs);
    for (const cb of this.presenceChangeListeners) {
      cb(onlineProfiles);
    }

    // M7.8 Mục VIII: Thông báo bạn bè Online/Offline (chỉ bạn bè đã xác nhận, chống spam bằng debounce)
    if (!this.activeUid) return;
    const byUid = new Map<string, PresenceRecord>();
    for (const r of records) byUid.set(r.uid, r);

    for (const friendUid of this.cachedFriendUids) {
      const rec = byUid.get(friendUid);
      const isNowOnline = rec ? isPresenceRecordOnline(rec, nowMs) : false;
      const prevKnown = this.lastKnownFriendOnline.get(friendUid);

      if (prevKnown === undefined) {
        this.lastKnownFriendOnline.set(friendUid, isNowOnline);
        continue;
      }

      if (isNowOnline && !prevKnown) {
        const pendingOff = this.pendingOfflineTimers.get(friendUid);
        if (pendingOff) {
          clearTimeout(pendingOff);
          this.pendingOfflineTimers.delete(friendUid);
        }
        this.lastKnownFriendOnline.set(friendUid, true);
        this.emitFriendToast({
          id: `toast_${friendUid}_on_${nowMs}`,
          friendUid,
          friendDisplayName: rec?.displayName || 'Bạn bè',
          friendAvatarUrl: rec?.avatarUrl || null,
          status: 'ONLINE',
          timestampMs: nowMs,
        });
      } else if (!isNowOnline && prevKnown) {
        if (!this.pendingOfflineTimers.has(friendUid)) {
          const timer = setTimeout(() => {
            this.pendingOfflineTimers.delete(friendUid);
            const latest = this.cachedPresence.find((p) => p.uid === friendUid);
            const stillOffline = !latest || !isPresenceRecordOnline(latest, Date.now());
            if (stillOffline && this.lastKnownFriendOnline.get(friendUid) === true) {
              this.lastKnownFriendOnline.set(friendUid, false);
              this.emitFriendToast({
                id: `toast_${friendUid}_off_${Date.now()}`,
                friendUid,
                friendDisplayName: latest?.displayName || rec?.displayName || 'Bạn bè',
                friendAvatarUrl: latest?.avatarUrl || rec?.avatarUrl || null,
                status: 'OFFLINE',
                timestampMs: Date.now(),
              });
            }
          }, SOCIAL_CONFIG.OFFLINE_TOAST_GRACE_MS);
          this.pendingOfflineTimers.set(friendUid, timer);
        }
      }
    }
  }

  private emitFriendToast(event: FriendPresenceToastEvent): void {
    for (const cb of this.toastListeners) cb(event);
  }

  /**
   * M7.8 Mục V: Tìm kiếm tài khoản toàn hệ thống (Online & Offline), chỉ trả về dữ liệu công khai an toàn.
   */
  public async searchAccounts(
    rawQuery: string,
    nowMs: number = Date.now(),
    bypassRateLimit: boolean = false
  ): Promise<SocialActionResult<PublicPlayerProfile[]>> {
    if (!bypassRateLimit && nowMs - this.lastSearchAt < SOCIAL_CONFIG.SEARCH_MIN_INTERVAL_MS) {
      return {
        success: false,
        errorCode: 'RATE_LIMITED',
        message: 'Thao tác tìm kiếm quá nhanh. Vui lòng thử lại sau giây lát.',
      };
    }
    this.lastSearchAt = nowMs;

    const keyword = rawQuery.trim().toLowerCase();
    const all = await this.adapter.listPublicProfiles(120);
    const filtered = all
      .filter((r) => {
        if (!keyword) return true;
        return (
          r.displayName.toLowerCase().includes(keyword) ||
          (r.handleTag || buildHandleTag(r.uid)).toLowerCase().includes(keyword)
        );
      })
      .slice(0, SOCIAL_CONFIG.SEARCH_MAX_RESULTS)
      .map((r) => toSafePublicProfile(r, nowMs));

    return { success: true, data: filtered };
  }

  public async getPublicProfile(
    targetUid: string,
    nowMs: number = Date.now()
  ): Promise<PublicPlayerProfile | null> {
    const rec = await this.adapter.getPublicProfile(targetUid);
    return rec ? toSafePublicProfile(rec, nowMs) : null;
  }

  /**
   * M7.8 Mục IV: Chat chung toàn hệ thống (real-time + anti-spam + dedupe + pagination + moderation).
   */
  public subscribeGlobalChat(
    onUpdate: (messages: GlobalChatMessage[]) => void
  ): Unsubscribe {
    return this.adapter.subscribeGlobalMessages(SOCIAL_CONFIG.GLOBAL_CHAT_PAGE_SIZE, onUpdate);
  }

  public async loadOlderGlobalMessages(beforeMs: number): Promise<GlobalChatMessage[]> {
    return this.adapter.listGlobalMessages(30, beforeMs);
  }

  public async sendGlobalMessage(
    sender: AuthIdentityLike | null,
    rawContent: string,
    options?: { clientMsgId?: string; nowMs?: number }
  ): Promise<SocialActionResult<GlobalChatMessage>> {
    const nowMs = options?.nowMs ?? Date.now();
    if (!sender || !sender.uid) {
      return {
        success: false,
        errorCode: 'UNAUTHENTICATED',
        message: 'Vui lòng đăng nhập để tham gia Chat chung.',
      };
    }
    const validation = validateChatContent(rawContent, SOCIAL_CONFIG.GLOBAL_CHAT_MAX_LENGTH);
    if (!validation.valid) {
      return {
        success: false,
        errorCode: validation.errorCode,
        message: validation.message,
      };
    }
    if (nowMs - this.lastGlobalMsgSentAt < SOCIAL_CONFIG.GLOBAL_CHAT_COOLDOWN_MS) {
      return {
        success: false,
        errorCode: 'RATE_LIMITED',
        message: 'Bạn đang gửi tin nhắn quá nhanh. Vui lòng chờ 1–2 giây.',
      };
    }

    const clientMsgId = options?.clientMsgId || `g_${sender.uid}_${nowMs}_${Math.random().toString(36).slice(2, 7)}`;
    if (this.sentClientMsgIds.has(clientMsgId)) {
      return {
        success: false,
        errorCode: 'DUPLICATE_MESSAGE',
        message: 'Tin nhắn trùng lặp đã được bỏ qua.',
      };
    }

    const msg: GlobalChatMessage = {
      id: clientMsgId,
      clientMsgId,
      senderUid: sender.uid,
      senderHandleTag: buildHandleTag(sender.uid),
      senderDisplayName: getUserDisplayLabel(sender as any) || 'Commander',
      senderAvatarUrl: sender.photoURL || null,
      senderRoleBadge: resolveUserRole(sender),
      content: validation.cleaned,
      createdAtMs: nowMs,
      status: 'SENT',
    };

    try {
      await this.adapter.addGlobalMessage(msg);
      this.lastGlobalMsgSentAt = nowMs;
      this.sentClientMsgIds.add(clientMsgId);
      if (this.sentClientMsgIds.size > 200) {
        const first = this.sentClientMsgIds.values().next().value;
        if (first) this.sentClientMsgIds.delete(first);
      }
      return { success: true, data: msg };
    } catch (err: any) {
      return {
        success: false,
        errorCode: 'NETWORK_ERROR',
        message: err?.message || 'Không thể gửi tin nhắn do lỗi mạng. Bạn có thể thử gửi lại.',
      };
    }
  }

  /**
   * M7.8 Mục VI: Hệ thống Bạn bè (Gửi lời mời, Chấp nhận, Từ chối, Hủy, Chống trùng lặp mời song song, Xóa bạn & Danh sách đã xóa bạn).
   */
  public async getRelationshipStatus(
    myUid: string,
    otherUid: string
  ): Promise<{
    isFriend: boolean;
    pendingDirection: 'NONE' | 'SENT' | 'RECEIVED';
    pendingRequestId: string | null;
    blockedByMe: boolean;
    blockedByOther: boolean;
  }> {
    if (!myUid || !otherUid || myUid === otherUid) {
      return {
        isFriend: false,
        pendingDirection: 'NONE',
        pendingRequestId: null,
        blockedByMe: false,
        blockedByOther: false,
      };
    }
    const pairId = buildPairId(myUid, otherUid);
    const [friendship, sentReq, recvReq, blockMe, blockOther] = await Promise.all([
      this.adapter.getFriendship(pairId),
      this.adapter.getFriendRequest(`${myUid}__${otherUid}`),
      this.adapter.getFriendRequest(`${otherUid}__${myUid}`),
      this.adapter.getBlock(myUid, otherUid),
      this.adapter.getBlock(otherUid, myUid),
    ]);

    let pendingDirection: 'NONE' | 'SENT' | 'RECEIVED' = 'NONE';
    let pendingRequestId: string | null = null;
    if (sentReq && sentReq.status === 'PENDING') {
      pendingDirection = 'SENT';
      pendingRequestId = sentReq.id;
    } else if (recvReq && recvReq.status === 'PENDING') {
      pendingDirection = 'RECEIVED';
      pendingRequestId = recvReq.id;
    }

    return {
      isFriend: Boolean(friendship),
      pendingDirection,
      pendingRequestId,
      blockedByMe: Boolean(blockMe),
      blockedByOther: Boolean(blockOther),
    };
  }

  public async sendFriendRequest(
    sender: AuthIdentityLike | null,
    target: Pick<PublicPlayerProfile, 'uid' | 'displayName' | 'handleTag' | 'avatarUrl'>,
    nowMs: number = Date.now()
  ): Promise<SocialActionResult<{ autoAccepted: boolean }>> {
    if (!sender || !sender.uid) {
      return { success: false, errorCode: 'UNAUTHENTICATED', message: 'Vui lòng đăng nhập để kết bạn.' };
    }
    if (sender.uid === target.uid) {
      return { success: false, errorCode: 'SELF_ACTION', message: 'Không thể tự gửi lời mời kết bạn cho chính mình.' };
    }

    const pairId = buildPairId(sender.uid, target.uid);
    const existingFriend = await this.adapter.getFriendship(pairId);
    if (existingFriend) {
      return { success: false, errorCode: 'ALREADY_FRIENDS', message: 'Hai người đã là bạn bè.' };
    }

    const reverseId = `${target.uid}__${sender.uid}`;
    const reverseReq = await this.adapter.getFriendRequest(reverseId);
    if (reverseReq && reverseReq.status === 'PENDING') {
      // Xử lý an toàn gửi lời mời song song cùng lúc từ 2 phía -> hợp nhất thành 1 quan hệ bạn bè duy nhất!
      const acceptRes = await this.acceptFriendRequest(sender, reverseId, nowMs);
      if (acceptRes.success) {
        return {
          success: true,
          message: `${target.displayName} cũng đã gửi lời mời cho bạn — hai bạn đã trở thành bạn bè!`,
          data: { autoAccepted: true },
        };
      }
      return { success: false, errorCode: acceptRes.errorCode, message: acceptRes.message };
    }

    const reqId = `${sender.uid}__${target.uid}`;
    const existingReq = await this.adapter.getFriendRequest(reqId);
    if (existingReq && existingReq.status === 'PENDING') {
      return {
        success: false,
        errorCode: 'REQUEST_ALREADY_PENDING',
        message: 'Bạn đã gửi lời mời kết bạn cho người chơi này.',
      };
    }

    const senderDisplayName = getUserDisplayLabel(sender as any) || 'Commander';
    const senderAvatarUrl = sender.photoURL || null;

    const req: FriendRequestRecord = {
      id: reqId,
      fromUid: sender.uid,
      fromDisplayName: senderDisplayName,
      fromHandleTag: buildHandleTag(sender.uid),
      fromAvatarUrl: senderAvatarUrl,
      toUid: target.uid,
      toDisplayName: target.displayName || 'Commander',
      toHandleTag: target.handleTag || buildHandleTag(target.uid),
      toAvatarUrl: target.avatarUrl || null,
      status: 'PENDING',
      createdAtMs: nowMs,
      updatedAtMs: nowMs,
    };

    await this.adapter.upsertFriendRequest(req);
    this.emitMutation();
    return {
      success: true,
      message: `Đã gửi lời mời kết bạn tới ${target.displayName}.`,
      data: { autoAccepted: false },
    };
  }

  public async acceptFriendRequest(
    actor: AuthIdentityLike | null,
    requestId: string,
    nowMs: number = Date.now()
  ): Promise<SocialActionResult<FriendshipRecord>> {
    if (!actor || !actor.uid) {
      return { success: false, errorCode: 'UNAUTHENTICATED', message: 'Vui lòng đăng nhập.' };
    }
    const req = await this.adapter.getFriendRequest(requestId);
    if (!req || req.status !== 'PENDING') {
      return { success: false, errorCode: 'NOT_FOUND', message: 'Lời mời kết bạn không còn tồn tại.' };
    }
    if (req.toUid !== actor.uid) {
      return { success: false, errorCode: 'PERMISSION_DENIED', message: 'Bạn không có quyền chấp nhận lời mời này.' };
    }

    const pairId = buildPairId(req.fromUid, req.toUid);
    const isFromA = req.fromUid < req.toUid;
    const friendship: FriendshipRecord = {
      pairId,
      userA: isFromA ? req.fromUid : req.toUid,
      userB: isFromA ? req.toUid : req.fromUid,
      userADisplayName: isFromA ? req.fromDisplayName : req.toDisplayName,
      userBDisplayName: isFromA ? req.toDisplayName : req.fromDisplayName,
      userAHandleTag: isFromA ? req.fromHandleTag : req.toHandleTag,
      userBHandleTag: isFromA ? req.toHandleTag : req.fromHandleTag,
      userAAvatarUrl: isFromA ? req.fromAvatarUrl : req.toAvatarUrl,
      userBAvatarUrl: isFromA ? req.toAvatarUrl : req.fromAvatarUrl,
      createdAtMs: nowMs,
    };

    await this.adapter.upsertFriendship(friendship);
    await this.adapter.deleteFriendRequest(requestId);
    // Xóa luôn lời mời chiều ngược lại nếu tồn tại để chống trùng lặp
    await this.adapter.deleteFriendRequest(`${req.toUid}__${req.fromUid}`);
    // Xóa khỏi danh sách đã xóa bạn nếu trước đây từng hủy kết bạn
    await this.adapter.deleteDeletedFriend(actor.uid, req.fromUid);
    await this.adapter.deleteDeletedFriend(req.fromUid, actor.uid);

    if (this.activeUid === actor.uid) {
      this.cachedFriendUids.add(req.fromUid);
    }
    this.emitMutation();
    return { success: true, data: friendship };
  }

  public async rejectFriendRequest(
    actor: AuthIdentityLike | null,
    requestId: string
  ): Promise<SocialActionResult> {
    if (!actor || !actor.uid) {
      return { success: false, errorCode: 'UNAUTHENTICATED', message: 'Vui lòng đăng nhập.' };
    }
    const req = await this.adapter.getFriendRequest(requestId);
    if (!req) {
      return { success: false, errorCode: 'NOT_FOUND', message: 'Lời mời không tồn tại.' };
    }
    if (req.toUid !== actor.uid) {
      return { success: false, errorCode: 'PERMISSION_DENIED', message: 'Không có quyền từ chối lời mời này.' };
    }
    await this.adapter.deleteFriendRequest(requestId);
    this.emitMutation();
    return { success: true };
  }

  public async cancelSentFriendRequest(
    actor: AuthIdentityLike | null,
    requestId: string
  ): Promise<SocialActionResult> {
    if (!actor || !actor.uid) {
      return { success: false, errorCode: 'UNAUTHENTICATED', message: 'Vui lòng đăng nhập.' };
    }
    const req = await this.adapter.getFriendRequest(requestId);
    if (!req) {
      return { success: false, errorCode: 'NOT_FOUND', message: 'Lời mời không tồn tại.' };
    }
    if (req.fromUid !== actor.uid) {
      return { success: false, errorCode: 'PERMISSION_DENIED', message: 'Không có quyền hủy lời mời này.' };
    }
    await this.adapter.deleteFriendRequest(requestId);
    this.emitMutation();
    return { success: true };
  }

  /**
   * Hủy kết bạn (Unfriend):
   * - Cập nhật nhất quán cả 2 phía bằng cách gỡ bản ghi friendship chuẩn hóa `pairId`.
   * - Lưu vào Danh sách đã xóa bạn riêng tư của người thực hiện (KHÔNG công khai).
   * - KHÔNG xóa tài khoản, KHÔNG xóa lịch sử chat, KHÔNG tự động Block.
   */
  public async unfriend(
    actor: AuthIdentityLike | null,
    friendUid: string,
    nowMs: number = Date.now()
  ): Promise<SocialActionResult> {
    if (!actor || !actor.uid) {
      return { success: false, errorCode: 'UNAUTHENTICATED', message: 'Vui lòng đăng nhập.' };
    }
    const pairId = buildPairId(actor.uid, friendUid);
    const existing = await this.adapter.getFriendship(pairId);
    if (!existing) {
      return { success: false, errorCode: 'NOT_FOUND', message: 'Hai người hiện không phải bạn bè.' };
    }

    const isActorA = existing.userA === actor.uid;
    const deletedRecord: DeletedFriendRecord = {
      targetUid: friendUid,
      targetDisplayName: isActorA ? existing.userBDisplayName : existing.userADisplayName,
      targetHandleTag: isActorA ? existing.userBHandleTag : existing.userAHandleTag,
      targetAvatarUrl: isActorA ? existing.userBAvatarUrl : existing.userAAvatarUrl,
      deletedAtMs: nowMs,
    };

    await this.adapter.deleteFriendship(pairId);
    await this.adapter.upsertDeletedFriend(actor.uid, deletedRecord);

    if (this.activeUid === actor.uid) {
      this.cachedFriendUids.delete(friendUid);
      this.lastKnownFriendOnline.delete(friendUid);
    }
    this.emitMutation();
    return { success: true, message: 'Đã hủy kết bạn. Lịch sử trò chuyện vẫn được giữ nguyên.' };
  }

  public async listFriendsForUser(
    uid: string,
    nowMs: number = Date.now()
  ): Promise<Array<{ friendship: FriendshipRecord; peer: PublicPlayerProfile }>> {
    const [friendships, presenceList] = await Promise.all([
      this.adapter.listFriendshipsForUser(uid),
      this.adapter.listPresenceRecords(120),
    ]);
    const presenceByUid = new Map<string, PresenceRecord>();
    for (const p of presenceList) presenceByUid.set(p.uid, p);

    if (this.activeUid === uid) {
      this.cachedFriendUids = new Set(
        friendships.map((f) => (f.userA === uid ? f.userB : f.userA))
      );
    }

    return friendships.map((f) => {
      const isA = f.userA === uid;
      const peerUid = isA ? f.userB : f.userA;
      const liveRec = presenceByUid.get(peerUid);
      const peer: PublicPlayerProfile = liveRec
        ? toSafePublicProfile(liveRec, nowMs)
        : {
            uid: peerUid,
            handleTag: isA ? f.userBHandleTag : f.userAHandleTag,
            displayName: isA ? f.userBDisplayName : f.userADisplayName,
            avatarUrl: isA ? f.userBAvatarUrl : f.userAAvatarUrl,
            roleBadge: 'PLAYER',
            rankTitle: 'Binh nhì',
            stars: 0,
            isOnline: false,
            lastSeenMs: f.createdAtMs,
          };
      return { friendship: f, peer };
    });
  }

  public async listFriendRequestsSplit(uid: string): Promise<{
    received: FriendRequestRecord[];
    sent: FriendRequestRecord[];
  }> {
    const all = await this.adapter.listFriendRequestsForUser(uid);
    return {
      received: all.filter((r) => r.toUid === uid && r.status === 'PENDING'),
      sent: all.filter((r) => r.fromUid === uid && r.status === 'PENDING'),
    };
  }

  public async listDeletedFriendsForUser(uid: string): Promise<DeletedFriendRecord[]> {
    return this.adapter.listDeletedFriends(uid);
  }

  /**
   * M7.8 Mục VII: Chat riêng 1-1 & Block / Unblock độc lập với Unfriend.
   */
  public subscribePrivateChat(
    myUid: string,
    peerUid: string,
    onUpdate: (messages: PrivateChatMessage[]) => void
  ): Unsubscribe {
    const chatId = buildPairId(myUid, peerUid);
    return this.adapter.subscribePrivateMessages(
      chatId,
      SOCIAL_CONFIG.PRIVATE_CHAT_PAGE_SIZE,
      onUpdate
    );
  }

  public subscribeLatestPrivateMessage(
    myUid: string,
    peerUid: string,
    onLatest: (latestMsg: PrivateChatMessage | null) => void
  ): Unsubscribe {
    const chatId = buildPairId(myUid, peerUid);
    return this.adapter.subscribePrivateMessages(chatId, 1, (msgs) => {
      onLatest(msgs.length > 0 ? msgs[msgs.length - 1] : null);
    });
  }

  public async loadOlderPrivateMessages(
    myUid: string,
    peerUid: string,
    beforeMs: number
  ): Promise<PrivateChatMessage[]> {
    const chatId = buildPairId(myUid, peerUid);
    return this.adapter.listPrivateMessages(chatId, 30, beforeMs);
  }

  public async sendPrivateMessage(
    sender: AuthIdentityLike | null,
    recipientUid: string,
    rawContent: string,
    options?: { clientMsgId?: string; nowMs?: number }
  ): Promise<SocialActionResult<PrivateChatMessage>> {
    const nowMs = options?.nowMs ?? Date.now();
    if (!sender || !sender.uid) {
      return { success: false, errorCode: 'UNAUTHENTICATED', message: 'Vui lòng đăng nhập để nhắn tin.' };
    }
    if (sender.uid === recipientUid) {
      return { success: false, errorCode: 'SELF_ACTION', message: 'Không thể gửi tin nhắn riêng cho chính mình.' };
    }

    // Kiểm tra trạng thái Block hai chiều
    const [blockedByRecipient, blockedBySender] = await Promise.all([
      this.adapter.getBlock(recipientUid, sender.uid),
      this.adapter.getBlock(sender.uid, recipientUid),
    ]);
    if (blockedByRecipient) {
      return {
        success: false,
        errorCode: 'BLOCKED_BY_RECIPIENT',
        message: 'Bạn không thể gửi tin nhắn vì người dùng này đã chặn bạn.',
      };
    }
    if (blockedBySender) {
      return {
        success: false,
        errorCode: 'YOU_BLOCKED_USER',
        message: 'Bạn đang chặn người dùng này. Hãy bỏ chặn (Unblock) để tiếp tục nhắn tin.',
      };
    }

    const validation = validateChatContent(rawContent, SOCIAL_CONFIG.PRIVATE_CHAT_MAX_LENGTH);
    if (!validation.valid) {
      return {
        success: false,
        errorCode: validation.errorCode,
        message: validation.message,
      };
    }

    const lastSent = this.lastPrivateMsgSentAt.get(recipientUid) ?? 0;
    if (nowMs - lastSent < SOCIAL_CONFIG.PRIVATE_CHAT_COOLDOWN_MS) {
      return {
        success: false,
        errorCode: 'RATE_LIMITED',
        message: 'Bạn đang gửi tin nhắn quá nhanh. Vui lòng đợi 1 giây.',
      };
    }

    const chatId = buildPairId(sender.uid, recipientUid);
    const clientMsgId =
      options?.clientMsgId ||
      `p_${sender.uid}_${nowMs}_${Math.random().toString(36).slice(2, 7)}`;

    if (this.sentClientMsgIds.has(clientMsgId)) {
      return {
        success: false,
        errorCode: 'DUPLICATE_MESSAGE',
        message: 'Tin nhắn trùng lặp đã được bỏ qua.',
      };
    }

    const msg: PrivateChatMessage = {
      id: clientMsgId,
      chatId,
      clientMsgId,
      senderUid: sender.uid,
      senderDisplayName: getUserDisplayLabel(sender as any) || 'Commander',
      senderAvatarUrl: sender.photoURL || null,
      recipientUid,
      content: validation.cleaned,
      createdAtMs: nowMs,
    };

    try {
      await this.adapter.addPrivateMessage(msg);
      this.lastPrivateMsgSentAt.set(recipientUid, nowMs);
      this.sentClientMsgIds.add(clientMsgId);
      return { success: true, data: msg };
    } catch (err: any) {
      return {
        success: false,
        errorCode: 'NETWORK_ERROR',
        message: err?.message || 'Lỗi mạng khi gửi tin nhắn riêng.',
      };
    }
  }

  /**
   * Block người dùng:
   * - Ngăn người bị Block gửi tin nhắn riêng cho người Block.
   * - KHÔNG xóa lịch sử chat, KHÔNG tự động hủy kết bạn (tách bạch rõ với Unfriend).
   */
  public async blockUser(
    actor: AuthIdentityLike | null,
    targetUid: string,
    nowMs: number = Date.now()
  ): Promise<SocialActionResult> {
    if (!actor || !actor.uid) {
      return { success: false, errorCode: 'UNAUTHENTICATED', message: 'Vui lòng đăng nhập.' };
    }
    if (actor.uid === targetUid) {
      return { success: false, errorCode: 'SELF_ACTION', message: 'Không thể tự chặn chính mình.' };
    }
    const rec: BlockRecord = {
      id: `${actor.uid}__${targetUid}`,
      blockerUid: actor.uid,
      blockedUid: targetUid,
      createdAtMs: nowMs,
    };
    await this.adapter.upsertBlock(rec);
    this.emitMutation();
    return { success: true, message: 'Đã chặn người dùng. Họ sẽ không thể gửi tin nhắn riêng cho bạn.' };
  }

  public async unblockUser(
    actor: AuthIdentityLike | null,
    targetUid: string
  ): Promise<SocialActionResult> {
    if (!actor || !actor.uid) {
      return { success: false, errorCode: 'UNAUTHENTICATED', message: 'Vui lòng đăng nhập.' };
    }
    await this.adapter.deleteBlock(actor.uid, targetUid);
    this.emitMutation();
    return { success: true, message: 'Đã bỏ chặn người dùng.' };
  }

  /**
   * Mời bạn bè vào phòng chơi CO-OP ONLINE hoặc VS ONLINE đang hoạt động.
   */
  public async sendRoomInviteToFriend(
    sender: AuthIdentityLike | null,
    friendUid: string,
    roomCode: string,
    roomMode: CoopRoomMode,
    hasPassword: boolean,
    nowMs: number = Date.now()
  ): Promise<SocialActionResult<RoomInviteRecord>> {
    if (!sender || !sender.uid) {
      return { success: false, errorCode: 'UNAUTHENTICATED', message: 'Vui lòng đăng nhập.' };
    }
    const pairId = buildPairId(sender.uid, friendUid);
    const friendship = await this.adapter.getFriendship(pairId);
    if (!friendship) {
      return { success: false, errorCode: 'PERMISSION_DENIED', message: 'Chỉ có thể mời người chơi trong danh sách bạn bè.' };
    }
    const invite: RoomInviteRecord = {
      id: `inv_${roomCode}_${sender.uid}_${friendUid}`,
      fromUid: sender.uid,
      fromDisplayName: getUserDisplayLabel(sender as any) || 'Commander',
      toUid: friendUid,
      roomCode,
      roomMode,
      hasPassword,
      createdAtMs: nowMs,
      expiresAtMs: nowMs + 10 * 60 * 1000,
    };
    await this.adapter.upsertRoomInvite(invite);
    return { success: true, data: invite, message: `Đã gửi lời mời vào phòng ${roomCode}.` };
  }

  public async listRoomInvitesForUser(uid: string): Promise<RoomInviteRecord[]> {
    return this.adapter.listRoomInvitesForUser(uid);
  }

  public async dismissRoomInvite(id: string): Promise<void> {
    await this.adapter.deleteRoomInvite(id);
  }

  // ===========================================================================
  // M7.8 MỤC IX: QUẢN LÝ BẠN BÈ TRONG CÀI ĐẶT ADMIN (RBAC 3 CẤP: ADMIN / MOD / PLAYER)
  // ===========================================================================

  public async adminListAllFriendships(
    actor: AuthIdentityLike | null,
    maxItems: number = 200
  ): Promise<SocialActionResult<FriendshipRecord[]>> {
    const role = resolveUserRole(actor);
    if (role !== 'ADMIN' && role !== 'MOD') {
      return {
        success: false,
        errorCode: 'PERMISSION_DENIED',
        message: 'Chỉ ADMIN hoặc MOD mới có quyền xem quản lý bạn bè toàn hệ thống.',
      };
    }
    const list = await this.adapter.listAllFriendships(maxItems);
    return { success: true, data: list };
  }

  public async adminSearchFriendships(
    actor: AuthIdentityLike | null,
    keyword: string
  ): Promise<SocialActionResult<FriendshipRecord[]>> {
    const allRes = await this.adminListAllFriendships(actor, 200);
    if (!allRes.success || !allRes.data) return allRes;
    const kw = keyword.trim().toLowerCase();
    if (!kw) return allRes;
    const filtered = allRes.data.filter(
      (f) =>
        f.userADisplayName.toLowerCase().includes(kw) ||
        f.userBDisplayName.toLowerCase().includes(kw) ||
        f.userAHandleTag.toLowerCase().includes(kw) ||
        f.userBHandleTag.toLowerCase().includes(kw) ||
        f.pairId.toLowerCase().includes(kw)
    );
    return { success: true, data: filtered };
  }

  public async adminInspectPair(
    actor: AuthIdentityLike | null,
    uidA: string,
    uidB: string
  ): Promise<SocialActionResult<AdminPairInspection>> {
    const role = resolveUserRole(actor);
    if (role !== 'ADMIN' && role !== 'MOD') {
      return {
        success: false,
        errorCode: 'PERMISSION_DENIED',
        message: 'Không đủ quyền kiểm tra cặp tài khoản.',
      };
    }
    const pairId = buildPairId(uidA, uidB);
    const friendship = await this.adapter.getFriendship(pairId);
    return {
      success: true,
      data: {
        pairId,
        uidA,
        uidB,
        areFriends: Boolean(friendship),
        createdAtMs: friendship?.createdAtMs ?? null,
        friendship,
      },
    };
  }

  /**
   * Xóa quan hệ bạn bè (CHỈ ADMIN duy nhất — MOD và PLAYER bị từ chối tuyệt đối):
   * - Xóa nhất quán cả 2 phía (xóa canonical friendship document).
   * - KHÔNG xóa tài khoản, KHÔNG xóa lịch sử chat, KHÔNG tự động Block.
   * - Ghi Audit Log vĩnh viễn vào SystemAuditLogger.
   */
  public async adminDeleteFriendship(
    actor: AuthIdentityLike | null,
    uidA: string,
    uidB: string,
    reason: string = 'Quản trị viên gỡ quan hệ bạn bè theo yêu cầu vận hành'
  ): Promise<SocialActionResult> {
    if (resolveUserRole(actor) !== 'ADMIN') {
      SystemAuditLogger.getInstance().recordEvent({
        severity: 'WARNING',
        category: 'SECURITY_PERMISSION_DENIED',
        eventType: 'ADMIN_DELETE_FRIENDSHIP_DENIED',
        message: `Từ chối thao tác xóa quan hệ bạn bè từ tài khoản không phải ADMIN (vai trò: ${resolveUserRole(actor)}).`,
        uid: actor?.uid ?? null,
        userEmail: actor?.email ?? null,
        source: 'SocialManager.adminDeleteFriendship',
        outcome: 'FAILURE',
      });
      return {
        success: false,
        errorCode: 'PERMISSION_DENIED',
        message: 'Chỉ tài khoản ADMIN duy nhất mới có quyền xóa quan hệ bạn bè.',
      };
    }

    const pairId = buildPairId(uidA, uidB);
    const existing = await this.adapter.getFriendship(pairId);
    if (!existing) {
      return {
        success: false,
        errorCode: 'NOT_FOUND',
        message: 'Không tìm thấy quan hệ bạn bè giữa 2 tài khoản này.',
      };
    }

    await this.adapter.deleteFriendship(pairId);
    SystemAuditLogger.getInstance().recordEvent({
      severity: 'WARNING',
      category: 'ADMIN_MOD_ACTION',
      eventType: 'ADMIN_DELETE_FRIENDSHIP',
      message: `ADMIN đã xóa quan hệ bạn bè giữa ${existing.userADisplayName} (${existing.userAHandleTag}) và ${existing.userBDisplayName} (${existing.userBHandleTag}). Lý do: ${reason}`,
      uid: actor?.uid ?? null,
      userEmail: actor?.email ?? null,
      source: 'SocialManager.adminDeleteFriendship',
      outcome: 'SUCCESS',
      metadata: {
        pairId,
        userA: existing.userA,
        userB: existing.userB,
        createdAtMs: existing.createdAtMs,
        reason,
      },
    });
    this.emitMutation();
    return {
      success: true,
      message: `Đã xóa quan hệ bạn bè giữa ${existing.userADisplayName} và ${existing.userBDisplayName}. Tài khoản và lịch sử chat không bị ảnh hưởng.`,
    };
  }
}
