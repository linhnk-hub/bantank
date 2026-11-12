/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { initializeApp, getApps, type FirebaseApp } from 'firebase/app';
import {
  getAuth,
  setPersistence,
  browserLocalPersistence,
  type Auth,
} from 'firebase/auth';
import { getFirestore, type Firestore } from 'firebase/firestore';
import { getStorage, type FirebaseStorage } from 'firebase/storage';

export const firebaseConfig = {
  apiKey: "AIzaSyCDYsQ0hZfMEoV7-9KlD6gfgHxjFICGW_g",
  authDomain: "bantank-bd525.firebaseapp.com",
  projectId: "bantank-bd525",
  storageBucket: "bantank-bd525.firebasestorage.app",
  messagingSenderId: "363795209668",
  appId: "1:363795209668:web:8db2596399b7a7799e1891",
  measurementId: "G-5FXJ8TZG6R"
};

let appInstance: FirebaseApp;
let authInstance: Auth;
let dbInstance: Firestore;
let storageInstance: FirebaseStorage;

export function getFirebaseApp(): FirebaseApp {
  if (!appInstance) {
    const existing = getApps();
    if (existing.length > 0) {
      appInstance = existing[0];
    } else {
      appInstance = initializeApp(firebaseConfig);
    }
  }
  return appInstance;
}

export function getFirebaseAuth(): Auth {
  if (!authInstance) {
    authInstance = getAuth(getFirebaseApp());
    if (typeof window !== 'undefined') {
      void setPersistence(authInstance, browserLocalPersistence).catch(() => {
        // Ignore if environment does not support IndexedDB persistence
      });
    }
  }
  return authInstance;
}

export function getFirebaseDb(): Firestore {
  if (!dbInstance) {
    // Zero-offline: direct network Firestore instance
    dbInstance = getFirestore(getFirebaseApp(), '(default)');
  }
  return dbInstance;
}

export function getFirebaseStorage(): FirebaseStorage {
  if (!storageInstance) {
    storageInstance = getStorage(
      getFirebaseApp(),
      `gs://${firebaseConfig.storageBucket}`
    );
  }
  return storageInstance;
}

export interface FirestoreErrorInfo {
  error: string;
  operationType: 'create' | 'update' | 'delete' | 'get' | 'list' | 'write';
  path: string | null;
  authInfo: {
    userId?: string | null;
    email?: string | null;
    emailVerified?: boolean | null;
  };
}

export function handleFirestoreError(
  error: unknown,
  operationType: FirestoreErrorInfo['operationType'],
  path: string | null
): never {
  const auth = getFirebaseAuth();
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    operationType,
    path,
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
    },
  };
  const stringified = JSON.stringify(errInfo);
  console.error('[Firestore Error]:', stringified);
  throw new Error(stringified);
}
