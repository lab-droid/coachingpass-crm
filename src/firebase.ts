import { initializeApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { getFirestore, addDoc, collection } from 'firebase/firestore';
import firebaseConfig from '../firebase-applet-config.json';

const app = initializeApp(firebaseConfig);
export const db = getFirestore(app, firebaseConfig.firestoreDatabaseId);
export const auth = getAuth(app);

export interface AuditActor {
  id?: string;
  name?: string;
  email?: string;
  role?: string;
}

export interface AuditLogEntry {
  action: string;      // 예: 'settle', 'bulk_settle', 'delete', 'month_lock', 'month_unlock'
  entity: string;      // 예: 'coach_fee', 'sales_fee', 'sale', 'settlement'
  entityId?: string;
  actor?: AuditActor;
  details?: Record<string, any>;
}

// 정산/삭제 등 금전에 영향을 주는 조작에 대한 감사 로그를 남긴다.
// 실패해도 앱 흐름을 막지 않는다(로그는 best-effort).
export async function writeAuditLog(entry: AuditLogEntry): Promise<void> {
  try {
    if (isQuotaExceeded()) return;
    await addDoc(collection(db, 'audit_logs'), {
      ...entry,
      at: new Date().toISOString(),
      actorUid: auth.currentUser?.uid || null
    });
  } catch (e) {
    console.warn('audit log write failed (non-blocking):', e);
  }
}

export enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

export interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId?: string | null;
    email?: string | null;
    emailVerified?: boolean | null;
    isAnonymous?: boolean | null;
    tenantId?: string | null;
    providerInfo?: {
      providerId?: string | null;
      email?: string | null;
    }[];
  }
}

export function isQuotaExceeded(): boolean {
  return localStorage.getItem('firestore_quota_exceeded') === 'true';
}

export function setQuotaExceeded(exceeded: boolean) {
  if (exceeded) {
    localStorage.setItem('firestore_quota_exceeded', 'true');
  } else {
    localStorage.removeItem('firestore_quota_exceeded');
  }
  window.dispatchEvent(new Event('firestore_quota_status_changed'));
}

export function handleFirestoreError(error: unknown, operationType: OperationType, path: string | null, shouldThrow: boolean = true) {
  const errStr = error instanceof Error ? error.message : String(error);
  const isQuota = (error as any)?.code === 'resource-exhausted' || errStr.includes('Quota') || errStr.includes('resource-exhausted') || errStr.includes('quota');
  if (isQuota) {
    setQuotaExceeded(true);
  }

  const errInfo: FirestoreErrorInfo = {
    error: errStr,
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
      isAnonymous: auth.currentUser?.isAnonymous,
      tenantId: auth.currentUser?.tenantId,
      providerInfo: auth.currentUser?.providerData?.map(provider => ({
        providerId: provider.providerId,
        email: provider.email,
      })) || []
    },
    operationType,
    path
  };
  console.error('Firestore Error: ', JSON.stringify(errInfo));
  if (shouldThrow) {
    throw new Error(JSON.stringify(errInfo));
  }
}
