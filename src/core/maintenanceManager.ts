/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { doc, getDoc, onSnapshot, setDoc, type Unsubscribe } from 'firebase/firestore';
import { getFirebaseDb } from './firebaseConfig.ts';
import { SystemAuditLogger } from './systemAuditLogger.ts';

const SUPER_ADMIN_EMAIL = 'linhnk2013@gmail.com';

export interface SystemMaintenanceConfigDocument {
  isActive: boolean;
  startAtMs: number;
  endAtMs: number;
  message: string;
  updatedAt: number;
  updatedBy: string;
  version: number;
}

const STORAGE_KEY = 'bantank_system_maintenance_config_v1';

export function formatMaintenanceDateTimeVi(timestampMs: number): string {
  if (!Number.isFinite(timestampMs) || timestampMs <= 0) {
    return '--:-- --/--/----';
  }
  const d = new Date(timestampMs);
  const hh = String(d.getHours()).padStart(2, '0');
  const mm = String(d.getMinutes()).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  const mo = String(d.getMonth() + 1).padStart(2, '0');
  const yyyy = d.getFullYear();
  return `${hh}:${mm} ngày ${dd}/${mo}/${yyyy}`;
}

export function buildMaintenanceNoticeMessage(startAtMs: number, endAtMs: number): string {
  const startLabel = formatMaintenanceDateTimeVi(startAtMs);
  const endLabel = formatMaintenanceDateTimeVi(endAtMs);
  return `Hệ thống bảo trì từ ${startLabel} đến ${endLabel}. Vui lòng quay lại game sau thời gian trên`;
}

export class MaintenanceManager {
  private static instance: MaintenanceManager | null = null;
  private config: SystemMaintenanceConfigDocument;
  private listeners: Set<() => void> = new Set();
  private cloudUnsubscribe: Unsubscribe | null = null;
  private boundStorageListener: ((ev: StorageEvent) => void) | null = null;

  private constructor() {
    this.config = this.createDefaultDocument();
    this.loadFromLocalStorage();
    this.installStorageListener();
  }

  public static getInstance(): MaintenanceManager {
    if (!MaintenanceManager.instance) {
      MaintenanceManager.instance = new MaintenanceManager();
    }
    return MaintenanceManager.instance;
  }

  private createDefaultDocument(): SystemMaintenanceConfigDocument {
    const now = Date.now();
    const defaultStart = now;
    const defaultEnd = now + 2 * 60 * 60 * 1000; // +2 hours default
    return {
      isActive: false,
      startAtMs: defaultStart,
      endAtMs: defaultEnd,
      message: buildMaintenanceNoticeMessage(defaultStart, defaultEnd),
      updatedAt: 0,
      updatedBy: SUPER_ADMIN_EMAIL,
      version: 1,
    };
  }

  private installStorageListener(): void {
    try {
      if (typeof window === 'undefined' || typeof window.addEventListener !== 'function') return;
      if (this.boundStorageListener) return;
      this.boundStorageListener = (ev: StorageEvent) => {
        if (ev.key === STORAGE_KEY && ev.newValue) {
          try {
            const parsed = JSON.parse(ev.newValue) as Partial<SystemMaintenanceConfigDocument>;
            this.applySnapshot(parsed, false);
          } catch {
            // Ignore malformed storage event
          }
        }
      };
      window.addEventListener('storage', this.boundStorageListener);
    } catch {
      // Ignore in headless env
    }
  }

  public subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  private notifyListeners(): void {
    this.listeners.forEach((fn) => {
      try {
        fn();
      } catch {
        // Ignore listener error
      }
    });
  }

  private loadFromLocalStorage(): void {
    try {
      if (typeof window === 'undefined' || !window.localStorage) return;
      const raw = window.localStorage.getItem(STORAGE_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw) as Partial<SystemMaintenanceConfigDocument>;
      this.applySnapshot(parsed, false);
    } catch {
      // Ignore storage errors
    }
  }

  private saveToLocalStorage(): void {
    try {
      if (typeof window === 'undefined' || !window.localStorage) return;
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(this.config));
    } catch {
      // Ignore storage errors
    }
  }

  private applySnapshot(
    raw: Partial<SystemMaintenanceConfigDocument> | null | undefined,
    persistLocal = true
  ): boolean {
    if (!raw || typeof raw !== 'object') return false;
    const incomingVer = typeof raw.version === 'number' && raw.version >= 1 ? Math.floor(raw.version) : 1;
    const incomingUpdatedAt = typeof raw.updatedAt === 'number' ? raw.updatedAt : 0;

    if (
      this.config.updatedAt > 0 &&
      incomingVer < this.config.version &&
      incomingUpdatedAt < this.config.updatedAt
    ) {
      return false;
    }

    const startAtMs =
      typeof raw.startAtMs === 'number' && Number.isFinite(raw.startAtMs) && raw.startAtMs > 0
        ? Math.floor(raw.startAtMs)
        : this.config.startAtMs;
    const endAtMs =
      typeof raw.endAtMs === 'number' && Number.isFinite(raw.endAtMs) && raw.endAtMs >= startAtMs
        ? Math.floor(raw.endAtMs)
        : Math.max(startAtMs + 60_000, this.config.endAtMs);
    const isActive = Boolean(raw.isActive);
    const message =
      typeof raw.message === 'string' && raw.message.trim().length > 0
        ? raw.message.trim()
        : buildMaintenanceNoticeMessage(startAtMs, endAtMs);

    this.config = {
      isActive,
      startAtMs,
      endAtMs,
      message,
      updatedAt: incomingUpdatedAt || Date.now(),
      updatedBy:
        typeof raw.updatedBy === 'string' && raw.updatedBy.trim()
          ? raw.updatedBy.trim().toLowerCase()
          : SUPER_ADMIN_EMAIL,
      version: Math.max(1, incomingVer),
    };

    if (persistLocal) {
      this.saveToLocalStorage();
    }
    this.notifyListeners();
    return true;
  }

  public startCloudSync(): void {
    if (this.cloudUnsubscribe) return;
    try {
      const db = getFirebaseDb();
      if (!db) return;
      const docRef = doc(db, 'system_config', 'maintenance');
      this.cloudUnsubscribe = onSnapshot(
        docRef,
        (snap) => {
          if (!snap.exists()) return;
          this.applySnapshot(snap.data() as Partial<SystemMaintenanceConfigDocument>, true);
        },
        () => {
          // Ignore snapshot read error
        }
      );
    } catch {
      // Ignore init error
    }
  }

  public stopCloudSync(): void {
    if (this.cloudUnsubscribe) {
      this.cloudUnsubscribe();
      this.cloudUnsubscribe = null;
    }
  }

  public getConfig(): SystemMaintenanceConfigDocument {
    return { ...this.config };
  }

  public isMaintenanceActive(): boolean {
    return Boolean(this.config.isActive);
  }

  public getFormattedNoticeMessage(): string {
    return buildMaintenanceNoticeMessage(this.config.startAtMs, this.config.endAtMs);
  }

  public async activateMaintenance(params: {
    startAtMs: number;
    endAtMs: number;
    actorRole: string;
    actorEmail: string;
  }): Promise<{
    success: boolean;
    config: SystemMaintenanceConfigDocument;
    syncedToCloud: boolean;
    message: string;
  }> {
    const cleanEmail = (params.actorEmail || '').trim().toLowerCase();
    if (params.actorRole !== 'ADMIN' && cleanEmail !== SUPER_ADMIN_EMAIL) {
      return {
        success: false,
        config: this.getConfig(),
        syncedToCloud: false,
        message: 'Chỉ tài khoản Admin mới có quyền kích hoạt chế độ Bảo trì hệ thống.',
      };
    }

    if (
      !Number.isFinite(params.startAtMs) ||
      !Number.isFinite(params.endAtMs) ||
      params.startAtMs <= 0 ||
      params.endAtMs <= params.startAtMs
    ) {
      return {
        success: false,
        config: this.getConfig(),
        syncedToCloud: false,
        message: 'Thời gian kết thúc bảo trì phải lớn hơn thời gian bắt đầu bảo trì.',
      };
    }

    const startAtMs = Math.floor(params.startAtMs);
    const endAtMs = Math.floor(params.endAtMs);
    const noticeMsg = buildMaintenanceNoticeMessage(startAtMs, endAtMs);
    let nextVersion = this.config.version + 1;
    const nowMs = Date.now();

    const nextDoc: SystemMaintenanceConfigDocument = {
      isActive: true,
      startAtMs,
      endAtMs,
      message: noticeMsg,
      updatedAt: nowMs,
      updatedBy: SUPER_ADMIN_EMAIL,
      version: nextVersion,
    };

    this.config = nextDoc;
    this.saveToLocalStorage();
    this.notifyListeners();

    let syncedToCloud = false;
    try {
      const db = getFirebaseDb();
      if (db) {
        const docRef = doc(db, 'system_config', 'maintenance');
        try {
          const remoteSnap = await getDoc(docRef);
          if (remoteSnap.exists()) {
            const rVer = Number((remoteSnap.data() as { version?: number }).version || 0);
            if (rVer >= nextVersion) {
              nextVersion = rVer + 1;
              nextDoc.version = nextVersion;
              this.config.version = nextVersion;
              this.saveToLocalStorage();
            }
          }
        } catch {
          // Proceed with local version
        }
        await setDoc(docRef, nextDoc);
        syncedToCloud = true;
      }
    } catch {
      syncedToCloud = false;
    }

    SystemAuditLogger.getInstance().recordEvent({
      severity: 'WARNING',
      category: 'ADMIN_MOD_ACTION',
      eventType: 'SYSTEM_DIAGNOSTIC',
      message: `Kích hoạt bảo trì hệ thống: ${noticeMsg}`,
      userEmail: SUPER_ADMIN_EMAIL,
      source: 'MaintenanceManager.activateMaintenance',
      outcome: 'SUCCESS',
      skipDeduplication: true,
      metadata: {
        startAtMs,
        endAtMs,
        version: nextDoc.version,
        syncedToCloud,
      },
    });

    return {
      success: true,
      config: this.getConfig(),
      syncedToCloud,
      message: `Đã kích hoạt Bảo trì hệ thống thành công! Toàn bộ phiên người chơi đang hoạt động sẽ được tự động đăng xuất và thông báo: "${noticeMsg}".`,
    };
  }

  public async endMaintenance(params: {
    actorRole: string;
    actorEmail: string;
  }): Promise<{
    success: boolean;
    config: SystemMaintenanceConfigDocument;
    syncedToCloud: boolean;
    message: string;
  }> {
    const cleanEmail = (params.actorEmail || '').trim().toLowerCase();
    if (params.actorRole !== 'ADMIN' && cleanEmail !== SUPER_ADMIN_EMAIL) {
      return {
        success: false,
        config: this.getConfig(),
        syncedToCloud: false,
        message: 'Chỉ tài khoản Admin mới có quyền kết thúc Bảo trì hệ thống.',
      };
    }

    let nextVersion = this.config.version + 1;
    const nowMs = Date.now();
    const nextDoc: SystemMaintenanceConfigDocument = {
      ...this.config,
      isActive: false,
      updatedAt: nowMs,
      updatedBy: SUPER_ADMIN_EMAIL,
      version: nextVersion,
    };

    this.config = nextDoc;
    this.saveToLocalStorage();
    this.notifyListeners();

    let syncedToCloud = false;
    try {
      const db = getFirebaseDb();
      if (db) {
        const docRef = doc(db, 'system_config', 'maintenance');
        try {
          const remoteSnap = await getDoc(docRef);
          if (remoteSnap.exists()) {
            const rVer = Number((remoteSnap.data() as { version?: number }).version || 0);
            if (rVer >= nextVersion) {
              nextVersion = rVer + 1;
              nextDoc.version = nextVersion;
              this.config.version = nextVersion;
              this.saveToLocalStorage();
            }
          }
        } catch {
          // Proceed
        }
        await setDoc(docRef, nextDoc);
        syncedToCloud = true;
      }
    } catch {
      syncedToCloud = false;
    }

    SystemAuditLogger.getInstance().recordEvent({
      severity: 'INFO',
      category: 'ADMIN_MOD_ACTION',
      eventType: 'SYSTEM_DIAGNOSTIC',
      message: 'Kết thúc chế độ bảo trì hệ thống — Mở lại Đăng nhập & Chơi thử.',
      userEmail: SUPER_ADMIN_EMAIL,
      source: 'MaintenanceManager.endMaintenance',
      outcome: 'SUCCESS',
      skipDeduplication: true,
      metadata: {
        version: nextDoc.version,
        syncedToCloud,
      },
    });

    return {
      success: true,
      config: this.getConfig(),
      syncedToCloud,
      message: 'Đã kết thúc chế độ Bảo trì hệ thống! Người chơi hiện có thể Đăng nhập và Chơi thử bình thường.',
    };
  }

  public resetForTesting(): void {
    this.config = this.createDefaultDocument();
    try {
      if (typeof window !== 'undefined' && window.localStorage) {
        window.localStorage.removeItem(STORAGE_KEY);
      }
    } catch {
      // Ignore
    }
    this.notifyListeners();
  }
}
