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
import { auth, db } from './firebase';
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

export default function App() {
  const [user, setUser] = useState<User | null>(null);
  const [sales, setSales] = useState<Sale[]>([]);
  const [settings, setSettings] = useState<SystemSettings>(INITIAL_SETTINGS);
  const [activeTab, setActiveTab] = useState('dashboard');
  const [isAppLoading, setIsAppLoading] = useState(true);

  // Firestore DB sync effect (State updates ONLY)
  useEffect(() => {
    if (!user) return; // Wait until authed before querying

    const q = query(collection(db, 'sales'));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const salesData = snapshot.docs.map(doc => doc.data() as Sale);
      setSales(salesData);
    }, (error) => {
      console.error("Firestore sales subscription error:", error);
    });

    return () => unsubscribe();
  }, [user]);

  // One-time Automated migration effect on Auth Success
  useEffect(() => {
    if (!user) return;

    let isMounted = true;
    const runMigration = async () => {
      try {
        const querySnapshot = await getDocs(query(collection(db, 'sales')));
        const batch = writeBatch(db);
        let hasUpdates = false;

        querySnapshot.forEach((docSnap) => {
          const sale = docSnap.data() as Sale;
          if (sale.inquiryType !== 'corporate') {
            const updatedSale = { ...sale };
            updatedSale.inquiryType = 'corporate';
            updatedSale.feeRate = 10;
            const baseAmount = (sale.amount || 0) / 1.1;
            const computedFee = Math.round(baseAmount * 0.1);
            updatedSale.fee = computedFee;
            updatedSale.profit = (sale.amount || 0) - computedFee;

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
    const unsubscribe = onAuthStateChanged(auth, (firebaseUser) => {
      if (firebaseUser) {
        // Logged in
        setUser({
          id: firebaseUser.uid,
          email: firebaseUser.email || '',
          name: firebaseUser.displayName || firebaseUser.email?.split('@')[0] || 'Unknown',
          role: 'admin', // Ideally fetch from a users collection
          avatarUrl: firebaseUser.photoURL || undefined
        });
      } else {
        // Logged out
        setUser(null);
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
    // Auth state observer will update user state automatically.
  };

  const handleLogout = async () => {
    await signOut(auth);
    localStorage.removeItem('logged_in_user');
    setActiveTab('dashboard');
  };

  const handleSetSales = async (newSalesAction: Sale[] | ((prev: Sale[]) => Sale[])) => {
    setSales(prev => {
      const newSales = typeof newSalesAction === 'function' ? newSalesAction(prev) : newSalesAction;
      
      // Perform save operations asynchronously in background without blocking state transitions
      (async () => {
        try {
          if (newSales.length === 0) {
            const deletePromises = prev.map(sale => deleteDoc(doc(db, "sales", sale.id)));
            await Promise.all(deletePromises);
          } else {
            // Find which sales are new or modified compared to the active 'prev' state
            const changedSales = newSales.filter(ns => {
              const existing = prev.find(os => os.id === ns.id);
              if (!existing) return true;
              return JSON.stringify(ns) !== JSON.stringify(existing);
            });

            if (changedSales.length > 0) {
              const savePromises = changedSales.map(sale => 
                setDoc(doc(db, "sales", sale.id), sale, { merge: true })
              );
              await Promise.all(savePromises);
            }
          }
        } catch (error) {
          console.error("Error saving sales to Firestore:", error);
        }
      })();

      return newSales;
    });
  };

  const renderContent = () => {
    switch (activeTab) {
      case 'dashboard':
        return <Dashboard sales={sales} settings={settings} user={user!} />;
      case 'sales':
        return <SalesManagement sales={sales} setSales={handleSetSales} settings={settings} />;
      case 'settlement':
        return <Settlement sales={sales} setSales={handleSetSales} />;
      case 'coach_fees':
        return <CoachFees sales={sales} />;
      case 'sales_fees':
        return <SalesFees sales={sales} />;
      case 'employees':
        return <Employees user={user!} />;
      case 'analytics':
        return <Analytics sales={sales} settings={settings} />;
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
        return <Dashboard sales={sales} settings={settings} user={user!} />;
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

