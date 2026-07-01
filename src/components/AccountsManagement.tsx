/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  Users, 
  UserPlus, 
  Key, 
  Trash2, 
  ShieldAlert, 
  Eye, 
  EyeOff, 
  Lock, 
  CheckCircle2, 
  X, 
  Smartphone,
  Check,
  AlertCircle
} from 'lucide-react';
import { Employee, Coach, UserAccount, User } from '../types';
import { db, handleFirestoreError, OperationType, isQuotaExceeded } from '../firebase';
import { collection, onSnapshot, setDoc, doc, deleteDoc, getDocs } from 'firebase/firestore';

interface AccountsManagementProps {
  user: User;
}

export default function AccountsManagement({ user }: AccountsManagementProps) {
  const [accounts, setAccounts] = useState<UserAccount[]>([]);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [coaches, setCoaches] = useState<Coach[]>([]);
  const [showPasswordMap, setShowPasswordMap] = useState<{[key: string]: boolean}>({});
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  // New account form state
  const [selectedStaffType, setSelectedStaffType] = useState<'employee' | 'coach'>('employee');
  const [selectedStaffId, setSelectedStaffId] = useState('');
  const [customRole, setCustomRole] = useState<'admin' | '영업팀' | '코치'>('영업팀');
  const [loginEmail, setLoginEmail] = useState('');
  const [loginPassword, setLoginPassword] = useState('');
  const [accountName, setAccountName] = useState('');

  // Toast helper
  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 3000);
  };

  // 1. Sync accounts from Firestore
  useEffect(() => {
    const cached = localStorage.getItem('cached_user_accounts');
    if (cached) {
      try {
        setAccounts(JSON.parse(cached));
      } catch (e) {
        // ignore
      }
    }

    const unsubscribe = onSnapshot(collection(db, 'user_accounts'), (snapshot) => {
      const dbAccounts = snapshot.docs.map(doc => doc.data() as UserAccount);
      if (dbAccounts.length === 0) {
        const fallbackAcc: UserAccount = {
          id: user?.id || `acc_admin_${Date.now()}`,
          email: user?.email || 'admin@coachingpass.com',
          password: 'password123',
          name: user?.name || '최고관리자',
          role: 'admin',
          status: 'active'
        };
        if (!isQuotaExceeded()) {
          try {
            setDoc(doc(db, 'user_accounts', fallbackAcc.id), fallbackAcc);
          } catch (e) {
            console.error(e);
          }
        }
        setAccounts([fallbackAcc]);
        localStorage.setItem('cached_user_accounts', JSON.stringify([fallbackAcc]));
      } else {
        setAccounts(dbAccounts);
        localStorage.setItem('cached_user_accounts', JSON.stringify(dbAccounts));
      }
    }, (error) => {
      console.error("Firestore user_accounts error:", error);
      if (!cached) {
        const fallbackAcc: UserAccount = {
          id: user?.id || 'acc_default_admin',
          email: user?.email || 'admin@coachingpass.com',
          password: 'password123',
          name: user?.name || '최고관리자',
          role: 'admin',
          status: 'active'
        };
        setAccounts([fallbackAcc]);
      }
      handleFirestoreError(error, OperationType.GET, 'user_accounts', false);
    });

    return () => unsubscribe();
  }, [user]);

  // 2. Sync employees and coaches for selection dropdown
  useEffect(() => {
    const unsubEmployees = onSnapshot(collection(db, 'employees'), (snap) => {
      const dbEmployees = snap.docs.map(d => d.data() as Employee);
      setEmployees(dbEmployees.filter(e => e.status === 'active'));
    });

    const unsubCoaches = onSnapshot(collection(db, 'coaches'), (snap) => {
      const dbCoaches = snap.docs.map(d => d.data() as Coach);
      setCoaches(dbCoaches.filter(c => c.status === 'active'));
    });

    return () => {
      unsubEmployees();
      unsubCoaches();
    };
  }, []);

  // Handle selected staff change to auto-fill name and email
  useEffect(() => {
    if (!selectedStaffId) {
      setAccountName('');
      setLoginEmail('');
      return;
    }

    if (selectedStaffType === 'employee') {
      const emp = employees.find(e => e.id === selectedStaffId);
      if (emp) {
        setAccountName(emp.name);
        setLoginEmail(emp.email);
        // 초기(임시) 비밀번호를 로그인 비밀번호로 자동 설정
        if (emp.initialPassword) setLoginPassword(emp.initialPassword);
        else if (emp.employeeNumber) setLoginPassword(emp.employeeNumber);
        if (emp.role === '영업팀') {
          setCustomRole('영업팀');
        } else if (emp.role === '관리자' || emp.role === '임원') {
          setCustomRole('admin');
        }
      }
    } else {
      const coach = coaches.find(c => c.id === selectedStaffId);
      if (coach) {
        setAccountName(coach.name);
        setLoginEmail(coach.email);
        setCustomRole('코치');
      }
    }
  }, [selectedStaffId, selectedStaffType, employees, coaches]);

  // Handle staff type toggled
  const handleStaffTypeChange = (type: 'employee' | 'coach') => {
    setSelectedStaffType(type);
    setSelectedStaffId('');
    setAccountName('');
    setLoginEmail('');
  };

  // Toggle single password visibility
  const toggleShowPassword = (accountId: string) => {
    setShowPasswordMap(prev => ({
      ...prev,
      [accountId]: !prev[accountId]
    }));
  };

  // Create User Account
  const handleCreateAccount = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!loginEmail || !loginPassword || !accountName) {
      alert("모든 정보를 올바르게 입력해주세요.");
      return;
    }

    const emailTaken = accounts.some(acc => acc.email.toLowerCase() === loginEmail.toLowerCase());
    if (emailTaken) {
      alert("이미 발급된 로그인 ID/이메일 주소입니다.");
      return;
    }

    const accountId = `acc_${Date.now()}`;
    const newAcc: UserAccount = {
      id: accountId,
      email: loginEmail,
      password: loginPassword,
      name: accountName,
      role: customRole,
      employeeId: selectedStaffId || undefined,
      status: 'active'
    };

    if (isQuotaExceeded()) {
      setAccounts(prev => {
        const next = [...prev, newAcc];
        localStorage.setItem('cached_user_accounts', JSON.stringify(next));
        return next;
      });
      setIsModalOpen(false);
      resetForm();
      showToast(`[로컬] ${accountName} 님의 시스템 로그인 계정이 즉시 발급되었습니다.`);
      return;
    }

    try {
      await setDoc(doc(db, 'user_accounts', accountId), newAcc);
      setIsModalOpen(false);
      resetForm();
      showToast(`${accountName} 님의 시스템 로그인 계정이 안전하게 생성되었습니다.`);
    } catch (err: any) {
      console.error("Failed to create user account:", err);
      alert("계정 발급 실패: " + err.message);
    }
  };

  // Reset password of an account directly
  const handleResetPassword = async (accountId: string, currentName: string) => {
    const nextPassword = prompt(`"${currentName}" 님의 새로운 로그인 비밀번호를 입력하십시오:`);
    if (nextPassword === null) return; // cancel
    if (!nextPassword.trim()) {
      alert("비밀번호는 공백일 수 없습니다.");
      return;
    }

    const targetAccount = accounts.find(a => a.id === accountId);
    if (!targetAccount) return;

    const updatedAccount = { ...targetAccount, password: nextPassword.trim() };

    if (isQuotaExceeded()) {
      setAccounts(prev => {
        const next = prev.map(a => a.id === accountId ? updatedAccount : a);
        localStorage.setItem('cached_user_accounts', JSON.stringify(next));
        return next;
      });
      showToast(`[로컬] ${currentName} 님의 비밀번호가 변경되었습니다.`);
      return;
    }

    try {
      await setDoc(doc(db, 'user_accounts', accountId), updatedAccount, { merge: true });
      showToast(`${currentName} 님의 시스템 비밀번호가 원격 갱신되었습니다.`);
    } catch (err: any) {
      console.error(err);
      alert("비밀번호 갱신 실패: " + err.message);
    }
  };

  // Toggle Account Status (Active/Inactive)
  const handleToggleStatus = async (account: UserAccount) => {
    const nextStatus = account.status === 'active' ? 'inactive' : 'active';
    const updatedAccount = { ...account, status: nextStatus };

    if (isQuotaExceeded()) {
      setAccounts(prev => {
        const next = prev.map(a => a.id === account.id ? updatedAccount : a);
        localStorage.setItem('cached_user_accounts', JSON.stringify(next));
        return next;
      });
      showToast(`[로컬] 계정 상태를 ${nextStatus === 'active' ? '활성화' : '비활성화'} 처리했습니다.`);
      return;
    }

    try {
      await setDoc(doc(db, 'user_accounts', account.id), updatedAccount, { merge: true });
      showToast(`${account.name} 님의 계정이 ${nextStatus === 'active' ? '활성화' : '비활성 정지'} 상태로 변경되었습니다.`);
    } catch (err: any) {
      console.error(err);
    }
  };

  // Delete User Account
  const handleDeleteAccount = async (id: string, name: string) => {
    if (confirm(`진짜로 "${name}" 님의 로그인 계정을 영구 폐기(삭제) 하시겠습니까?\n폐기 후에는 해당 ID로 로그인이 제한됩니다.`)) {
      if (isQuotaExceeded()) {
        setAccounts(prev => {
          const next = prev.filter(a => a.id !== id);
          localStorage.setItem('cached_user_accounts', JSON.stringify(next));
          return next;
        });
        showToast(`[로컬] 계정이 파기 완료되었습니다.`);
        return;
      }

      try {
        await deleteDoc(doc(db, 'user_accounts', id));
        showToast(`${name} 님의 계정 데이터가 전산 파기되었습니다.`);
      } catch (err: any) {
        console.error(err);
        alert("계정 삭제 에러: " + err.message);
      }
    }
  };

  // System initialization: set currently logged in user as ONLY admin and delete all other accounts
  const handleInitializeAndSetAdmin = async () => {
    if (!user) {
      alert("현재 로그인 사용자 정보를 불러올 수 없습니다.");
      return;
    }

    const currentEmail = user.email.toLowerCase();
    const confirmed = confirm(
      `[보안 및 계정 일괄 초기화]\n\n현재 로그인된 계정(${user.email})만 최고 관리자(admin)로 지정하고, 그 외의 모든 기존 계정을 일괄 파기(삭제)하시겠습니까?\n\n이 작업은 즉시 Firestore 및 로컬 캐시에 즉각 반영됩니다.`
    );
    if (!confirmed) return;

    const existingSelf = accounts.find(a => a.email.toLowerCase() === currentEmail);
    const selfId = existingSelf?.id || `acc_admin_${Date.now()}`;

    const adminAccount: UserAccount = {
      id: selfId,
      email: user.email,
      password: existingSelf?.password || 'password123',
      name: user.name || user.email.split('@')[0],
      role: 'admin',
      employeeId: user.employeeId || existingSelf?.employeeId || undefined,
      status: 'active'
    };

    const otherAccounts = accounts.filter(a => a.email.toLowerCase() !== currentEmail);

    // Dynamic role update for smooth local state transition
    const savedUserStr = localStorage.getItem('logged_in_user');
    if (savedUserStr) {
      try {
        const parsed = JSON.parse(savedUserStr);
        parsed.role = 'admin';
        localStorage.setItem('logged_in_user', JSON.stringify(parsed));
      } catch (e) {
        // ignore
      }
    }

    if (isQuotaExceeded()) {
      setAccounts([adminAccount]);
      localStorage.setItem('cached_user_accounts', JSON.stringify([adminAccount]));
      showToast(`[로컬 캐시] 현재 로그인 계정(${user.email})만 활성화하고 타 계정은 모두 삭제하였습니다.`);
      return;
    }

    try {
      // Delete other documents
      const deletePromises = otherAccounts.map(acc => deleteDoc(doc(db, 'user_accounts', acc.id)));
      await Promise.all(deletePromises);

      // Set admin document
      await setDoc(doc(db, 'user_accounts', selfId), adminAccount);

      showToast(`보안 업데이트 완료! 현재 로그인 계정(${user.email})이 단독 최고 관리자로 설정되었으며 타 계정은 모두 안전하게 삭제되었습니다.`);
    } catch (err: any) {
      console.error(err);
      alert("계정 초기화 실패: " + err.message);
    }
  };

  // 임직원 연동 계정의 비밀번호를 각자의 초기(임시) 비밀번호로 일괄 동기화
  const handleSyncInitialPasswords = async () => {
    const empById = new Map<string, Employee>(employees.map(e => [e.id, e] as [string, Employee]));
    const pwOf = (id?: string) => {
      const emp = id ? empById.get(id) : undefined;
      return emp?.initialPassword || emp?.employeeNumber;
    };
    const targets = accounts.filter(a => a.employeeId && pwOf(a.employeeId));
    if (targets.length === 0) {
      showToast('초기 비밀번호가 부여된 임직원 연동 계정이 없습니다.');
      return;
    }
    if (!confirm(`${targets.length}개 임직원 계정의 로그인 비밀번호를 각자의 초기(임시) 비밀번호로 일괄 설정하시겠습니까?`)) return;

    if (isQuotaExceeded()) {
      setAccounts(prev => {
        const next = prev.map(a => {
          const pw = pwOf(a.employeeId);
          return pw ? { ...a, password: pw } : a;
        });
        localStorage.setItem('cached_user_accounts', JSON.stringify(next));
        return next;
      });
      showToast(`[로컬] ${targets.length}개 계정 비밀번호를 초기 비밀번호로 설정했습니다.`);
      return;
    }

    try {
      await Promise.all(
        targets.map(a => setDoc(doc(db, 'user_accounts', a.id), { password: pwOf(a.employeeId) }, { merge: true }))
      );
      showToast(`${targets.length}개 임직원 계정의 비밀번호를 초기 비밀번호로 동기화했습니다.`);
    } catch (e: any) {
      console.error(e);
      alert('초기 비밀번호 동기화 실패: ' + (e?.message || e));
    }
  };

  const resetForm = () => {
    setSelectedStaffId('');
    setAccountName('');
    setLoginEmail('');
    setLoginPassword('');
    setCustomRole('영업팀');
  };

  return (
    <div id="accounts_mgmt_page" className="space-y-6 font-sans">
      {/* Toast Alert */}
      <AnimatePresence>
        {toastMessage && (
          <motion.div 
            initial={{ opacity: 0, y: -20, scale: 0.9 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -20, scale: 0.9 }}
            className="fixed top-5 right-5 z-55 bg-slate-900 border border-emerald-500/30 text-white px-5 py-3.5 rounded-xl shadow-2xl flex items-center space-x-2.5 max-w-sm text-xs font-semibold"
          >
            <CheckCircle2 className="h-5 w-5 text-emerald-400 shrink-0 animate-bounce" />
            <span className="flex-1 leading-snug">{toastMessage}</span>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Title block */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 bg-white p-6 sm:p-8 rounded-2xl border border-slate-200/80 shadow-xs">
        <div>
          <div className="flex items-center space-x-2.5">
            <div className="p-2 bg-indigo-50 text-indigo-600 rounded-xl">
              <Key className="h-6 w-6" />
            </div>
            <h1 className="text-xl sm:text-2xl font-black text-slate-900 tracking-tight">계정 생성 및 권한 관리</h1>
          </div>
          <p className="text-slate-500 text-xs sm:text-sm mt-2 font-medium leading-relaxed">
            영업 담당자와 파트너 코치 전용 로그인 ID 및 비밀번호를 발급하고, 권한 등급을 격리 통제합니다.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={handleSyncInitialPasswords}
            className="flex items-center justify-center space-x-2 px-4 py-2.5 sm:px-4.5 sm:py-3 bg-white hover:bg-slate-50 text-slate-700 border border-slate-200 rounded-xl font-bold text-xs sm:text-sm transition-all cursor-pointer"
            title="임직원 연동 계정의 비밀번호를 각자 초기(임시) 비밀번호로 일괄 설정"
          >
            <Key className="h-4 w-4" />
            <span>초기 비밀번호로 동기화</span>
          </button>
          <button
            onClick={() => { resetForm(); setIsModalOpen(true); }}
            className="flex items-center justify-center space-x-2 px-4 py-2.5 sm:px-4.5 sm:py-3 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl font-bold text-xs sm:text-sm transition-all duration-155 transform hover:-translate-y-0.5 cursor-pointer shadow-md shadow-indigo-600/10"
          >
            <UserPlus className="h-4 w-4" />
            <span>신규 로그인 계정 발급</span>
          </button>
        </div>
      </div>

      {/* Info card */}
      <div className="bg-amber-50 border border-amber-200 p-4.5 rounded-xl flex items-start space-x-3 text-xs leading-relaxed text-amber-900">
        <ShieldAlert className="h-5 w-5 text-amber-600 shrink-0 mt-0.5" />
        <div>
          <b className="text-amber-950 block text-sm">⚠️ 역할기반 권한 격리 시스템 (ABAC)</b>
          <p className="mt-1">
            발급된 계정으로 로그인한 <b>영업팀 담당자 및 코치는 본인이 수립한 전표, 매칭된 지표 및 정산 내역만 실시간 로드</b>되어 확인됩니다. 전체 임직원 리스트 조회 권한 및 시스템 셋업 카테고리는 총괄 운영자(admin) 계정으로 보호되어 일반 사용자의 접근이 완벽히 봉쇄됩니다.
          </p>
        </div>
      </div>

      {/* System Admin Reset panel */}
      <div className="bg-slate-900 border border-slate-800 p-5 rounded-2xl text-white shadow-xl flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="space-y-1">
          <div className="flex items-center space-x-2 text-rose-450">
            <ShieldAlert className="h-4.5 w-4.5" />
            <h4 className="font-extrabold text-xs sm:text-sm">시스템 보안 계정 일괄 정비 및 독점 관리자 배치</h4>
          </div>
          <p className="text-slate-300 text-[11px] leading-relaxed font-semibold">
            현재 로그인 상태인 운영자 계정(<strong className="text-emerald-450 font-mono">{user?.email}</strong>)을 제외한 모든 기존 샘플 및 더미 계정을 데이터베이스에서 파기하고, 현재 접속 계정을 유일한 <strong>최상위 시스템 총괄 운영자(admin)</strong>로 승격/고정합니다.
          </p>
        </div>
        <button
          onClick={handleInitializeAndSetAdmin}
          className="flex items-center justify-center space-x-1.5 px-4.5 py-3 bg-gradient-to-r from-rose-600 to-rose-700 hover:from-rose-500 hover:to-rose-600 text-white rounded-xl text-xs font-black transition duration-100 hover:scale-[1.02] transform cursor-pointer shrink-0 shadow-lg shadow-rose-950/40"
        >
          <Lock className="h-3.5 w-3.5" />
          <span>현재 계정을 관리자로 지정 & 타 계정 완전 삭제</span>
        </button>
      </div>

      {/* Main Account Grid Table */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="px-6 py-4.5 border-b border-slate-100 flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <Users className="h-5 w-5 text-slate-400" />
            <h3 className="text-sm font-bold text-slate-800">로그인 부여 계정 현황</h3>
          </div>
          <span className="text-[10px] font-mono font-bold bg-slate-100 text-slate-650 px-2.5 py-1 rounded-full">
            총 {accounts.length}명 관리 중
          </span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left col-span-12 border-collapse">
            <thead>
              <tr className="bg-slate-50/75 text-slate-450 border-b border-slate-100 font-bold text-[10px] uppercase tracking-wider font-sans">
                <th className="py-3 px-6">이름 / 연결 파트</th>
                <th className="py-3 px-6">로그인 이메일 (ID)</th>
                <th className="py-3 px-6">배정 역할</th>
                <th className="py-3 px-6">로그인 비밀번호 (관리자 확인용)</th>
                <th className="py-3 px-6">활성 상태</th>
                <th className="py-3 px-6 text-right">관리 제어</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-xs font-medium text-slate-600">
              {accounts.map((acc) => {
                const isPassVisible = !!showPasswordMap[acc.id];
                return (
                  <tr key={acc.id} className="hover:bg-slate-50/50 transition-colors">
                    {/* Name */}
                    <td className="py-4.5 px-6">
                      <div className="flex items-center space-x-2.5">
                        <div className="h-8 w-8 rounded-full bg-slate-100 flex items-center justify-center font-bold text-slate-700 font-mono text-[11px] border border-slate-200">
                          {acc.name[0]}
                        </div>
                        <div>
                          <span className="font-extrabold text-slate-900 block text-xs">{acc.name}</span>
                          <span className="text-[10px] text-slate-400 block mt-0.5">{acc.employeeId ? `연동 코드: ${acc.employeeId}` : '단독 생성'}</span>
                        </div>
                      </div>
                    </td>

                    {/* Email */}
                    <td className="py-4.5 px-6 font-mono font-bold text-slate-700">
                      {acc.email}
                    </td>

                    {/* Role badge */}
                    <td className="py-4.5 px-6">
                      <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold ${
                        acc.role === 'admin' 
                          ? 'bg-rose-50 text-rose-700 border border-rose-100' 
                          : acc.role === '영업팀' 
                          ? 'bg-emerald-50 text-emerald-700 border border-emerald-100' 
                          : 'bg-indigo-50 text-indigo-700 border border-indigo-100'
                      }`}>
                        {acc.role === 'admin' ? '운영/관리자' : acc.role === '영업팀' ? '영업 담당자' : '파트너 코치'}
                      </span>
                    </td>

                    {/* Password */}
                    <td className="py-4.5 px-6">
                      <div className="flex items-center space-x-2 font-mono font-bold text-slate-650">
                        <span>{isPassVisible ? acc.password : '••••••••'}</span>
                        <button 
                          onClick={() => toggleShowPassword(acc.id)}
                          className="p-1 hover:bg-slate-100 rounded text-slate-400 hover:text-slate-600 cursor-pointer transition-colors"
                        >
                          {isPassVisible ? <EyeOff className="h-3 w-3" /> : <Eye className="h-3 w-3" />}
                        </button>
                      </div>
                    </td>

                    {/* Active/Inactive */}
                    <td className="py-4.5 px-6">
                      <button
                        onClick={() => handleToggleStatus(acc)}
                        className={`inline-flex items-center px-2.5 py-1 rounded-full text-[10px] font-extrabold cursor-pointer transition-colors ${
                          acc.status === 'active'
                            ? 'bg-green-50 text-green-700 hover:bg-green-100/80 border border-green-200'
                            : 'bg-slate-100 text-slate-400 hover:bg-slate-200/60 border border-slate-200'
                        }`}
                      >
                        <span className={`h-1.5 w-1.5 rounded-full mr-1.5 ${acc.status === 'active' ? 'bg-green-500 animate-pulse' : 'bg-slate-400'}`} />
                        {acc.status === 'active' ? '해방(활성)' : '일시정지'}
                      </button>
                    </td>

                    {/* Actions */}
                    <td className="py-4.5 px-6 text-right">
                      <div className="flex items-center justify-end space-x-1.5">
                        <button
                          onClick={() => handleResetPassword(acc.id, acc.name)}
                          className="px-2 py-1 bg-white hover:bg-slate-50 text-[10px] text-slate-600 border border-slate-200 rounded font-bold cursor-pointer transition-colors"
                        >
                          비밀번호 리셋
                        </button>
                        <button
                          onClick={() => handleDeleteAccount(acc.id, acc.name)}
                          disabled={acc.email.toLowerCase() === user.email.toLowerCase()}
                          className="p-1 hover:bg-rose-50 text-slate-400 hover:text-rose-600 border border-transparent hover:border-rose-100 rounded cursor-pointer disabled:opacity-30 disabled:pointer-events-none transition-all"
                          title={acc.email.toLowerCase() === user.email.toLowerCase() ? "본인 계정은 삭제할 수 없습니다" : "계정 데이터 삭제"}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Account Creation Modal Pop */}
      {isModalOpen && (
        <div className="fixed inset-0 bg-slate-950/50 backdrop-blur-xs flex items-center justify-center z-50 p-4">
          <motion.div 
            initial={{ opacity: 0, scale: 0.95, y: 15 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            className="bg-white rounded-2xl border border-slate-250 shadow-2xl w-full max-w-md overflow-hidden relative"
          >
            <div className="px-6 py-4.5 bg-slate-50 border-b border-slate-150 flex items-center justify-between">
              <div className="flex items-center space-x-2">
                <Lock className="h-4.5 w-4.5 text-indigo-600" />
                <h3 className="font-bold text-sm text-slate-800">새 로그인 계정 정보 조율</h3>
              </div>
              <button 
                onClick={() => setIsModalOpen(false)}
                className="p-1.5 hover:bg-slate-200 text-slate-400 hover:text-slate-700 rounded-lg cursor-pointer"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <form onSubmit={handleCreateAccount} className="p-6 space-y-4 text-xs font-semibold text-slate-700">
              {/* Type selector: Employee / Coach */}
              <div>
                <label className="block text-xs font-bold text-slate-800 mb-1.5">임직원 / 파트너 연동 분류</label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => handleStaffTypeChange('employee')}
                    className={`py-2 px-3 border rounded-xl text-center font-bold text-[11px] cursor-pointer transition-colors ${
                      selectedStaffType === 'employee'
                        ? 'bg-indigo-600 text-white border-indigo-600 shadow-sm shadow-indigo-600/10'
                        : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'
                    }`}
                  >
                    본부 임직원 (영업/관리)
                  </button>
                  <button
                    type="button"
                    onClick={() => handleStaffTypeChange('coach')}
                    className={`py-2 px-3 border rounded-xl text-center font-bold text-[11px] cursor-pointer transition-colors ${
                      selectedStaffType === 'coach'
                        ? 'bg-indigo-600 text-white border-indigo-600 shadow-sm shadow-indigo-600/10'
                        : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'
                    }`}
                  >
                    파트너 코치단
                  </button>
                </div>
              </div>

              {/* Selection Dropdown */}
              <div>
                <label className="block text-xs font-bold text-slate-800 mb-1">연동 대상자 선택</label>
                <select
                  value={selectedStaffId}
                  onChange={(e) => setSelectedStaffId(e.target.value)}
                  className="w-full text-xs font-medium bg-white border border-slate-200 rounded-xl px-3 py-2 focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 duration-100"
                  required
                >
                  <option value="">-- 대상자를 선택하십시오 --</option>
                  {selectedStaffType === 'employee' ? (
                    employees.map(emp => (
                      <option key={emp.id} value={emp.id}>
                        {emp.name} ({emp.role} / {emp.department})
                      </option>
                    ))
                  ) : (
                    coaches.map(c => (
                      <option key={c.id} value={c.id}>
                        {c.name} (코치 / 등급: {c.tier})
                      </option>
                    ))
                  )}
                </select>
              </div>

              {/* Display Auto Name */}
              <div className="grid grid-cols-2 gap-3.5">
                <div>
                  <label className="block text-xs font-bold text-slate-800 mb-1">계정 이름 (실명)</label>
                  <input
                    type="text"
                    value={accountName}
                    onChange={(e) => setAccountName(e.target.value)}
                    className="w-full text-xs font-bold bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-slate-500"
                    placeholder="자동 매칭"
                    readOnly
                    required
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-800 mb-1">부여 역할 (등급)</label>
                  <select
                    value={customRole}
                    onChange={(e) => setCustomRole(e.target.value as any)}
                    className="w-full text-xs font-medium bg-white border border-slate-200 rounded-xl px-3 py-2"
                  >
                    <option value="영업팀">영업 담당자 (영업팀)</option>
                    <option value="코치">코치 (코치단)</option>
                    <option value="admin">최고 관리자 (운영진)</option>
                  </select>
                </div>
              </div>

              {/* Login Email (User ID) */}
              <div>
                <label className="block text-xs font-bold text-slate-800 mb-1">로그인 ID (이메일)</label>
                <input
                  type="email"
                  value={loginEmail}
                  onChange={(e) => setLoginEmail(e.target.value)}
                  className="w-full text-xs font-mono bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-slate-600 focus:outline-none"
                  placeholder="name@coachingpass.com"
                  required
                />
                <p className="text-[10px] text-slate-400 mt-1">대상자의 등록 이메일이 로그인 ID로 일차 할당됩니다.</p>
              </div>

              {/* Login Password */}
              <div>
                <label className="block text-xs font-bold text-slate-800 mb-1">로그인 비밀번호</label>
                <input
                  type="text"
                  value={loginPassword}
                  onChange={(e) => setLoginPassword(e.target.value)}
                  className="w-full text-xs font-mono font-bold border border-slate-200 rounded-xl px-3 py-2 focus:ring-2 focus:ring-indigo-505"
                  placeholder="예: CP0001"
                  required
                />
                {selectedStaffType === 'employee' && (
                  <p className="text-[10px] text-indigo-500 mt-1 font-medium">임직원 초기(임시) 비밀번호가 자동 설정됩니다.</p>
                )}
              </div>

              {/* Actions */}
              <div className="pt-3 border-t border-slate-100 flex items-center justify-end space-x-2">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="px-4 py-2 border border-slate-200 rounded-xl text-slate-600 bg-white hover:bg-slate-50 cursor-pointer"
                >
                  취소
                </button>
                <button
                  type="submit"
                  className="px-4.5 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl font-bold cursor-pointer transition-colors flex items-center space-x-1.5"
                >
                  <Check className="h-4 w-4" />
                  <span>로그인 계정 발급 확인</span>
                </button>
              </div>
            </form>
          </motion.div>
        </div>
      )}
    </div>
  );
}
