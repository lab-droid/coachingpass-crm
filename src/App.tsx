/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  INITIAL_SETTINGS, 
  INITIAL_SALES 
} from './data/mockData';
import { Sale, SystemSettings, User } from './types';
import { auth, db, isQuotaExceeded, setQuotaExceeded } from './firebase';
import { onAuthStateChanged, signOut } from 'firebase/auth';
import { collection, onSnapshot, query, setDoc, doc, deleteDoc, getDocs, writeBatch } from 'firebase/firestore';

// Component Imports
import Login from './components/Login';
import Sidebar from './components/Sidebar';
import Dashboard from './components/Dashboard';
import SalesManagement from './components/SalesManagement';
import Settlement from './components/Settlement';
import Analytics from './components/Analytics';
import Settings from './components/Settings';
import CoachFees from './components/CoachFees';
import SalesFees from './components/SalesFees';
import Employees from './components/Employees';
import AccountsManagement from './components/AccountsManagement';

// Excel ROUNDDOWN equivalent helper
const roundDown = (value: number, digits: number): number => {
  const factor = Math.pow(10, digits);
  return Math.floor(value * factor) / factor;
};

// Helper function to compare sale records deeply but selectively, avoiding redundant Firestore writes
function isSaleEqual(a: Sale, b: Sale): boolean {
  if (a.id !== b.id) return false;
  if (a.date !== b.date) return false;
  if (a.customerName !== b.customerName) return false;
  if (a.managerName !== b.managerName) return false;
  if (a.amount !== b.amount) return false;
  if (a.feeRate !== b.feeRate) return false;
  if (a.fee !== b.fee) return false;
  if (a.profit !== b.profit) return false;
  if (a.status !== b.status) return false;
  if ((a.notes || '') !== (b.notes || '')) return false;
  if ((a.inquiryType || 'corporate') !== (b.inquiryType || 'corporate')) return false;
  if (!!a.isManagerManuallyEdited !== !!b.isManagerManuallyEdited) return false;
  
  // imwebData subfield comparison safely
  const aImg = a.imwebData;
  const bImg = b.imwebData;
  if (!!aImg !== !!bImg) return false;
  if (aImg && bImg) {
    if ((aImg.orderer?.name || '') !== (bImg.orderer?.name || '')) return false;
    if ((aImg.orderer?.phone || '') !== (bImg.orderer?.phone || '')) return false;
    if ((aImg.payment?.method || '') !== (bImg.payment?.method || '')) return false;
    if ((aImg.payment?.amount || 0) !== (bImg.payment?.amount || 0)) return false;
    if ((aImg.payment?.status || '') !== (bImg.payment?.status || '')) return false;
    
    const aItems = aImg.items || [];
    const bItems = bImg.items || [];
    if (aItems.length !== bItems.length) return false;
    for (let i = 0; i < aItems.length; i++) {
      if (aItems[i].name !== bItems[i].name) return false;
      if ((aItems[i].status || '') !== (bItems[i].status || '')) return false;
    }
  }

  return true;
}

export default function App() {
  const [user, setUser] = useState<User | null>(null);
  const [sales, setSales] = useState<Sale[]>([]);
  const [settings, setSettings] = useState<SystemSettings>(INITIAL_SETTINGS);
  const [activeTab, setActiveTab] = useState('dashboard');
  const [isAppLoading, setIsAppLoading] = useState(true);
  const [isFirestoreQuotaExceeded, setIsFirestoreQuotaExceeded] = useState(() => isQuotaExceeded());

  // Listen for changes in firestore quota status
  useEffect(() => {
    const handleQuotaStatusChange = () => {
      setIsFirestoreQuotaExceeded(isQuotaExceeded());
    };
    window.addEventListener('firestore_quota_status_changed', handleQuotaStatusChange);
    return () => {
      window.removeEventListener('firestore_quota_status_changed', handleQuotaStatusChange);
    };
  }, []);

  // Firestore DB sync effect (State updates ONLY)
  useEffect(() => {
    if (!user) return; // Wait until authed before querying

    const q = query(collection(db, 'sales'));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const salesData = snapshot.docs.map(doc => doc.data() as Sale);
      if (salesData.length > 0) {
        setSales(salesData);
        localStorage.setItem('cached_sales', JSON.stringify(salesData));
      } else {
        // Fallback to local cache if Firestore returned empty or failed
        const cached = localStorage.getItem('cached_sales');
        if (cached) {
          try {
            setSales(JSON.parse(cached));
          } catch (e) {
            setSales(INITIAL_SALES);
          }
        } else {
          setSales(INITIAL_SALES);
        }
      }
    }, (error: any) => {
      console.error("Firestore sales subscription error:", error);
      const isQuota = error?.code === 'resource-exhausted' || error?.message?.includes('Quota') || error?.message?.includes('resource-exhausted');
      if (isQuota) {
        setIsFirestoreQuotaExceeded(true);
      }
      
      const cached = localStorage.getItem('cached_sales');
      if (cached) {
        try {
          setSales(JSON.parse(cached));
        } catch (e) {
          setSales(INITIAL_SALES);
        }
      } else {
        setSales(INITIAL_SALES);
      }
    });

    return () => unsubscribe();
  }, [user]);

  // One-time Automated migration effect on Auth Success
  useEffect(() => {
    if (!user) return;
    if (isQuotaExceeded()) {
      console.log("Database sync/migration bypassed: Quota is fully exceeded.");
      return;
    }

    let isMounted = true;
    const runMigration = async () => {
      try {
        const querySnapshot = await getDocs(query(collection(db, 'sales')));
        const batch = writeBatch(db);
        let hasUpdates = false;

        querySnapshot.forEach((docSnap) => {
          const sale = docSnap.data() as Sale;
          let changed = false;
          let updatedSale = { ...sale };

          if (sale.inquiryType !== 'corporate') {
            updatedSale.inquiryType = 'corporate';
            updatedSale.feeRate = 10;
            const amt = sale.amount || 0;
            const vat = Math.round(amt * 0.1);
            const supplyPrice = amt - vat;
            const commission = Math.round(supplyPrice * 0.1);
            const businessTax = roundDown(commission * 0.03, -1);
            const residentTax = roundDown(commission * 0.003, -1);
            const computedFee = commission - businessTax - residentTax;
            updatedSale.fee = computedFee;
            updatedSale.profit = amt - computedFee;
            changed = true;
          }

          // Reset status starting on or after 2026-06-01 to pending
          const saleDateStr = updatedSale.date || '';
          if (saleDateStr >= '2026-06-01' && updatedSale.status !== 'pending' && updatedSale.status !== 'hold') {
            updatedSale.status = 'pending';
            changed = true;
          }

          if (changed) {
            batch.set(doc(db, "sales", sale.id), updatedSale, { merge: true });
            hasUpdates = true;
          }
        });

        if (hasUpdates && isMounted) {
          await batch.commit();
          console.log("Automated migration: sales records migrated successfully to default 'corporate' type.");
        }
      } catch (err) {
        console.error("Migration error:", err);
      }
    };

    runMigration();
    return () => {
      isMounted = false;
    };
  }, [user]);

  // Auth and general setup effect
  useEffect(() => {
    // Check local storage for custom ID/password logged in user
    const savedUser = localStorage.getItem('logged_in_user');
    let customUserActive = false;
    if (savedUser) {
      try {
        const parsed = JSON.parse(savedUser) as User;
        setUser(parsed);
        customUserActive = true;
      } catch (e) {
        // ignore
      }
    }

    const unsubscribe = onAuthStateChanged(auth, (firebaseUser) => {
      if (firebaseUser) {
        // Logged in via Google SSO
        const loggedInUser: User = {
          id: firebaseUser.uid,
          email: firebaseUser.email || '',
          name: firebaseUser.displayName || firebaseUser.email?.split('@')[0] || 'Unknown',
          role: 'admin',
          avatarUrl: firebaseUser.photoURL || undefined
        };
        setUser(loggedInUser);
        localStorage.setItem('logged_in_user', JSON.stringify(loggedInUser));
      } else {
        // Logged out
        if (!customUserActive) {
          const recheckSaved = localStorage.getItem('logged_in_user');
          if (!recheckSaved) {
            setUser(null);
          }
        }
      }
      setIsAppLoading(false);
    });

    // Handle system settings from local Storage (can move to Firestore if needed)
    try {
      const storedSettings = localStorage.getItem('system_settings');
      if (storedSettings) {
        const parsed = JSON.parse(storedSettings);
        if (parsed.companyName === 'Coaching Pass' || !parsed.companyName) {
          parsed.companyName = '코칭패스 CRM';
          localStorage.setItem('system_settings', JSON.stringify(parsed));
        }
        setSettings(parsed);
      } else {
        setSettings(INITIAL_SETTINGS);
        localStorage.setItem('system_settings', JSON.stringify(INITIAL_SETTINGS));
      }
    } catch (e) {
      console.error('Failed to load system settings:', e);
    }

    return () => unsubscribe();
  }, []);

  const handleLoginSuccess = (loggedInUser: User) => {
    setUser(loggedInUser);
  };

  const handleLogout = async () => {
    await signOut(auth);
    localStorage.removeItem('logged_in_user');
    setActiveTab('dashboard');
  };

  const handleSetSales = async (newSalesAction: Sale[] | ((prev: Sale[]) => Sale[])) => {
    setSales(prev => {
      const newSales = typeof newSalesAction === 'function' ? newSalesAction(prev) : newSalesAction;
      
      // Save locally to localStorage immediately for bulletproof offline-first experience
      localStorage.setItem('cached_sales', JSON.stringify(newSales));
      
      // Perform save operations asynchronously in background without blocking state transitions
      (async () => {
        try {
          if (isQuotaExceeded()) {
            console.log("Database sync bypassed: Quota is exceeded. Safely stored in localStorage.");
            return;
          }
          if (newSales.length === 0) {
            const deletePromises = prev.map(sale => deleteDoc(doc(db, "sales", sale.id)));
            await Promise.all(deletePromises);
          } else {
            // 1. Delete records from Firestore that exist in prev but are missing in newSales (breaks any infinite loops)
            const deletedSales = prev.filter(ps => !newSales.some(ns => ns.id === ps.id));
            if (deletedSales.length > 0) {
              const deletePromises = deletedSales.map(sale => deleteDoc(doc(db, "sales", sale.id)));
              await Promise.all(deletePromises);
              console.log(`Database sync: Deleted ${deletedSales.length} legacy/removed sales records.`);
            }

            // 2. Find which sales are new or modified compared to the active 'prev' state using precise isSaleEqual
            const changedSales = newSales.filter(ns => {
              const existing = prev.find(os => os.id === ns.id);
              if (!existing) return true;
              return !isSaleEqual(ns, existing);
            });

            if (changedSales.length > 0) {
              const savePromises = changedSales.map(sale => 
                setDoc(doc(db, "sales", sale.id), sale, { merge: true })
              );
              await Promise.all(savePromises);
              console.log(`Database sync: Successfully updated/set ${changedSales.length} modified sales records.`);
            }
          }
        } catch (error: any) {
          console.error("Error saving sales to Firestore:", error);
          const isQuota = error?.code === 'resource-exhausted' || error?.message?.includes('Quota') || error?.message?.includes('resource-exhausted') || error?.message?.includes('quota');
          if (isQuota) {
            setQuotaExceeded(true);
          }
        }
      })();

      return newSales;
    });
  };

  const renderContent = () => {
    // Role matching filter for secure workspace segregation
    const getFilteredSales = () => {
      if (!user) return [];
      if (user.role === 'admin' || user.role === 'manager') {
        return sales;
      }
      if (user.role === '영업팀') {
        return sales.filter(s => s.managerName === user.name);
      }
      if (user.role === '코치') {
        return sales.filter(s => s.coachName === user.name);
      }
      return sales;
    };

    const visibleSales = getFilteredSales();

    switch (activeTab) {
      case 'dashboard':
        return <Dashboard sales={visibleSales} settings={settings} user={user!} />;
      case 'sales':
        return <SalesManagement sales={sales} setSales={handleSetSales} settings={settings} user={user!} />;
      case 'settlement':
        return <Settlement sales={visibleSales} setSales={handleSetSales} />;
      case 'coach_fees':
        return <CoachFees sales={visibleSales} />;
      case 'sales_fees':
        return <SalesFees sales={visibleSales} />;
      case 'employees':
        return <Employees user={user!} />;
      case 'analytics':
        return <Analytics sales={visibleSales} settings={settings} />;
      case 'accounts':
        return <AccountsManagement user={user!} />;
      case 'settings':
        return (
          <Settings 
            settings={settings} 
            setSettings={setSettings} 
            user={user!} 
            setUser={setUser} 
          />
        );
      default:
        return <Dashboard sales={visibleSales} settings={settings} user={user!} />;
    }
  };

  if (isAppLoading) {
    return (
      <div className="min-h-screen bg-slate-900 flex flex-col items-center justify-center font-sans">
        <div className="flex flex-col items-center space-y-4">
          <svg className="animate-spin h-10 w-10 text-emerald-500" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
          </svg>
          <span className="text-slate-350 text-sm font-semibold tracking-wide">코칭패스 CRM 데이터베이스 검증 중...</span>
        </div>
      </div>
    );
  }

  if (!user) {
    return <Login onLoginSuccess={handleLoginSuccess} />;
  }

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col lg:flex-row font-sans" id="crm_app_workspace">
      {/* Dynamic Nav Sidebar Column */}
      <Sidebar 
        activeTab={activeTab} 
        setActiveTab={setActiveTab} 
        user={user} 
        onLogout={handleLogout}
        companyName={settings.companyName}
      />

      {/* Main Board Column */}
      <main className="flex-1 overflow-y-auto px-4 py-6 sm:p-8" id="crm_viewport_main">
        {isFirestoreQuotaExceeded && (
          <div className="mb-6 bg-amber-50 text-amber-805 border-l-4 border-amber-500 p-4 rounded-r-xl shadow-sm text-xs font-medium flex items-center justify-between">
            <div className="flex items-center space-x-2.5">
              <span className="text-[15px]">⚠️</span>
              <div>
                <p className="font-extrabold text-slate-900 text-sm">구글 파이어토어(Firestore) 일일 쓰기 할당량 소진</p>
                <p className="text-slate-650 mt-1">오늘 무료 Cloud DB의 수정/등록 횟수가 가득 찼습니다. 하지만 걱정 마세요! 새로운 작업 분량은 <b>브라우저 로컬 저장소(localStorage)에 즉시 누적 안전 저장</b>되어, 서비스 이탈 전까지 실시간 정산 및 지출 내역에서 100% 정상 작동합니다.</p>
              </div>
            </div>
            <button 
              onClick={() => setIsFirestoreQuotaExceeded(false)}
              className="ml-4 px-2 py-1 text-[10px] hover:bg-amber-100 bg-white border border-amber-300 rounded font-semibold text-slate-700 transition-all shrink-0 cursor-pointer"
            >
              알림 닫기
            </button>
          </div>
        )}

        <AnimatePresence mode="wait">
          <motion.div
            key={activeTab}
            initial={{ opacity: 0, y: 15 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -15 }}
            transition={{ duration: 0.25 }}
            className="w-full"
          >
            {renderContent()}
          </motion.div>
        </AnimatePresence>
      </main>
    </div>
  );
}

