/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  collection,
  deleteDoc,
  doc,
  getDocs,
  limit,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  Timestamp,
  updateDoc,
} from 'firebase/firestore';
import {
  getFirebaseAuth,
  getFirebaseDb,
  handleFirestoreError,
} from './firebaseConfig.ts';
import {
  isAdminUser,
  validatePersonalGmailUser,
} from './authManager.ts';
import { AvatarManager } from './avatarManager.ts';

export type ContactTag = 'FEEDBACK' | 'BUG_REPORT';
export type ContactSeenFilter = 'ALL' | 'UNSEEN' | 'SEEN' | 'HIGHLIGHTED';

export const CONTACT_TITLE_MAX_LENGTH = 150;
export const CONTACT_CONTENT_MAX_LENGTH = 1000;
export const CONTACT_PAGE_SIZE = 5;

export interface ContactMessageRecord {
  messageId: string;
  senderUid: string;
  senderEmail: string;
  senderName: string;
  tag: ContactTag;
  title: string;
  content: string;
  isSeen: boolean;
  isHighlighted: boolean;
  createdAtMs: number;
  updatedAtMs: number;
  seenAtMs: number | null;
}

export interface SubmitContactPayload {
  tag: ContactTag;
  title: string;
  content: string;
}

export interface ContactFilterOptions {
  tagFilter?: 'ALL' | ContactTag;
  statusFilter?: ContactSeenFilter;
  searchText?: string;
}

function parseTimestampMs(raw: unknown): number {
  if (raw instanceof Timestamp) {
    return raw.toMillis();
  }
  if (typeof raw === 'number' && Number.isFinite(raw) && raw > 0) {
    return Math.floor(raw);
  }
  if (raw && typeof (raw as { toMillis?: () => number }).toMillis === 'function') {
    const ms = (raw as { toMillis: () => number }).toMillis();
    if (Number.isFinite(ms) && ms > 0) {
      return Math.floor(ms);
    }
  }
  return 0;
}

function parseOptionalTimestampMs(raw: unknown): number | null {
  const ms = parseTimestampMs(raw);
  return ms > 0 ? ms : null;
}

export function normalizeContactTag(raw: unknown): ContactTag {
  return raw === 'BUG_REPORT' ? 'BUG_REPORT' : 'FEEDBACK';
}

export function getContactTagLabel(tag: ContactTag, lang: 'vi' | 'en' = 'vi'): string {
  if (tag === 'BUG_REPORT') {
    return lang === 'en' ? '[Bug Report]' : '[Báo lỗi]';
  }
  return lang === 'en' ? '[Feedback]' : '[Góp ý]';
}

export function filterAndSearchContactMessages(
  messages: ContactMessageRecord[],
  options: ContactFilterOptions
): ContactMessageRecord[] {
  const tagFilter = options.tagFilter ?? 'ALL';
  const statusFilter = options.statusFilter ?? 'ALL';
  const search = (options.searchText ?? '').trim().toLowerCase();

  return messages.filter((item) => {
    if (tagFilter !== 'ALL' && item.tag !== tagFilter) {
      return false;
    }
    if (statusFilter === 'UNSEEN' && item.isSeen) {
      return false;
    }
    if (statusFilter === 'SEEN' && !item.isSeen) {
      return false;
    }
    if (statusFilter === 'HIGHLIGHTED' && !item.isHighlighted) {
      return false;
    }
    if (search.length > 0) {
      const haystack = `${item.title}\n${item.content}\n${item.senderName}\n${item.senderEmail}`.toLowerCase();
      if (!haystack.includes(search)) {
        return false;
      }
    }
    return true;
  });
}

export function paginateContactMessages(
  messages: ContactMessageRecord[],
  pageIndex: number,
  pageSize: number = CONTACT_PAGE_SIZE
): {
  items: ContactMessageRecord[];
  pageIndex: number;
  totalPages: number;
  totalItems: number;
} {
  const safeSize = Math.max(1, Math.min(CONTACT_PAGE_SIZE, Math.floor(pageSize)));
  const totalItems = messages.length;
  const totalPages = Math.max(1, Math.ceil(totalItems / safeSize));
  const safePageIndex = Math.max(0, Math.min(pageIndex, totalPages - 1));
  const start = safePageIndex * safeSize;
  return {
    items: messages.slice(start, start + safeSize),
    pageIndex: safePageIndex,
    totalPages,
    totalItems,
  };
}

export async function submitContactMessage(
  payload: SubmitContactPayload
): Promise<ContactMessageRecord> {
  const auth = getFirebaseAuth();
  const currentUser = auth.currentUser;
  if (!currentUser) {
    throw new Error('UNAUTHENTICATED_USER');
  }
  const gmailCheck = validatePersonalGmailUser(currentUser);
  if (!gmailCheck.isValid) {
    throw new Error(gmailCheck.errorMessage || 'INVALID_GMAIL_ACCOUNT');
  }

  const cleanTag: ContactTag = payload.tag === 'BUG_REPORT' ? 'BUG_REPORT' : 'FEEDBACK';
  const cleanTitle = (payload.title || '').trim().slice(0, CONTACT_TITLE_MAX_LENGTH);
  const cleanContent = (payload.content || '').trim().slice(0, CONTACT_CONTENT_MAX_LENGTH);

  if (cleanTitle.length === 0) {
    throw new Error('EMPTY_TITLE');
  }
  if (cleanContent.length === 0) {
    throw new Error('EMPTY_CONTENT');
  }

  const email = (currentUser.email || '').trim().toLowerCase();
  const profileMeta = AvatarManager.getInstance().getUserMetadata(currentUser.uid);
  const rawSenderName =
    (profileMeta?.displayName || '').trim() ||
    (currentUser.displayName || '').trim() ||
    email.split('@')[0] ||
    'Player';
  const cleanSenderName = rawSenderName.slice(0, 80);

  const nowMs = Date.now();
  const randSuffix = Math.random().toString(36).replace(/[^a-z0-9]/g, '').slice(0, 8) || 'msg01';
  const messageId = `msg_${nowMs}_${randSuffix}`;
  const path = `contact_messages/${messageId}`;
  const db = getFirebaseDb();

  try {
    await setDoc(doc(db, 'contact_messages', messageId), {
      messageId,
      senderUid: currentUser.uid,
      senderEmail: email,
      senderName: cleanSenderName,
      tag: cleanTag,
      title: cleanTitle,
      content: cleanContent,
      isSeen: false,
      isHighlighted: false,
      seenAt: null,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
  } catch (err) {
    handleFirestoreError(err, 'create', path);
  }

  return {
    messageId,
    senderUid: currentUser.uid,
    senderEmail: email,
    senderName: cleanSenderName,
    tag: cleanTag,
    title: cleanTitle,
    content: cleanContent,
    isSeen: false,
    isHighlighted: false,
    createdAtMs: nowMs,
    updatedAtMs: nowMs,
    seenAtMs: null,
  };
}

export async function fetchContactMessagesForAdmin(): Promise<ContactMessageRecord[]> {
  const auth = getFirebaseAuth();
  const currentUser = auth.currentUser;
  if (!currentUser || !isAdminUser(currentUser)) {
    throw new Error('PERMISSION_DENIED_ADMIN_ONLY');
  }

  const db = getFirebaseDb();
  try {
    const q = query(
      collection(db, 'contact_messages'),
      orderBy('createdAt', 'desc'),
      limit(200)
    );
    const snap = await getDocs(q);
    const items: ContactMessageRecord[] = [];
    snap.forEach((docSnap) => {
      const data = docSnap.data() as Record<string, unknown>;
      items.push({
        messageId: typeof data.messageId === 'string' && data.messageId ? data.messageId : docSnap.id,
        senderUid: typeof data.senderUid === 'string' ? data.senderUid : '',
        senderEmail: typeof data.senderEmail === 'string' ? data.senderEmail : '',
        senderName: typeof data.senderName === 'string' ? data.senderName : 'Player',
        tag: normalizeContactTag(data.tag),
        title: typeof data.title === 'string' ? data.title : '',
        content: typeof data.content === 'string' ? data.content : '',
        isSeen: data.isSeen === true,
        isHighlighted: data.isHighlighted === true,
        createdAtMs: parseTimestampMs(data.createdAt),
        updatedAtMs: parseTimestampMs(data.updatedAt),
        seenAtMs: parseOptionalTimestampMs(data.seenAt),
      });
    });
    return items;
  } catch (err) {
    handleFirestoreError(err, 'list', 'contact_messages');
  }
}

export async function updateContactMessageStatus(
  messageId: string,
  updates: {
    isSeen?: boolean;
    isHighlighted?: boolean;
  }
): Promise<void> {
  const auth = getFirebaseAuth();
  const currentUser = auth.currentUser;
  if (!currentUser || !isAdminUser(currentUser)) {
    throw new Error('PERMISSION_DENIED_ADMIN_ONLY');
  }

  const cleanId = (messageId || '').trim();
  if (!cleanId) {
    throw new Error('INVALID_MESSAGE_ID');
  }

  const payload: Record<string, unknown> = {
    updatedAt: serverTimestamp(),
  };

  if (typeof updates.isSeen === 'boolean') {
    payload.isSeen = updates.isSeen;
    payload.seenAt = updates.isSeen ? serverTimestamp() : null;
  }

  if (typeof updates.isHighlighted === 'boolean') {
    payload.isHighlighted = updates.isHighlighted;
  }

  const db = getFirebaseDb();
  const path = `contact_messages/${cleanId}`;
  try {
    await updateDoc(doc(db, 'contact_messages', cleanId), payload);
  } catch (err) {
    handleFirestoreError(err, 'update', path);
  }
}

export async function deleteContactMessage(messageId: string): Promise<void> {
  const auth = getFirebaseAuth();
  const currentUser = auth.currentUser;
  if (!currentUser || !isAdminUser(currentUser)) {
    throw new Error('PERMISSION_DENIED_ADMIN_ONLY');
  }

  const cleanId = (messageId || '').trim();
  if (!cleanId) {
    throw new Error('INVALID_MESSAGE_ID');
  }

  const db = getFirebaseDb();
  const path = `contact_messages/${cleanId}`;
  try {
    await deleteDoc(doc(db, 'contact_messages', cleanId));
  } catch (err) {
    handleFirestoreError(err, 'delete', path);
  }
}
