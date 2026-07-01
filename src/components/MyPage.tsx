/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { UserCircle, Lock, Eye, EyeOff, ShieldCheck, CheckCircle2, AlertCircle, Mail, BadgeCheck } from 'lucide-react';
import { User, Employee } from '../types';
import { db, writeAuditLog } from '../firebase';
import { collection, getDocs, setDoc, doc } from 'firebase/firestore';

interface MyPageProps {
  user: User;
}

export default function MyPage({ user }: MyPageProps) {
  const [newPw, setNewPw] = useState('');
  const [confirmPw, setConfirmPw] = useState('');
  const [show, setShow] = useState(false);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const roleLabel =
    user.role === 'admin' ? '총괄 운영자' : user.role === '영업팀' ? '영업 담당자' : user.role === '코치' ? '파트너 코치' : '담당자';

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (newPw.length < 6) { setError('비밀번호는 6자 이상이어야 합니다.'); return; }
    if (!/[A-Za-z]/.test(newPw) || !/[0-9]/.test(newPw)) { setError('영문과 숫자를 모두 포함해야 합니다.'); return; }
    if (newPw !== confirmPw) { setError('새 비밀번호가 일치하지 않습니다.'); return; }

    setSaving(true);
    try {
      // 임직원 레코드의 로그인 비밀번호(initialPassword)를 갱신 — 로그인 검증 소스
      let empId = user.employeeId;
      let emps: Employee[] = [];
      try {
        const snap = await getDocs(collection(db, 'employees'));
        emps = snap.docs.map(d => d.data() as Employee);
        if (!empId) {
          const mine = emps.find(e => (e.email || '').toLowerCase() === user.email.toLowerCase());
          empId = mine?.id;
        }
      } catch (err) {
        console.warn('임직원 조회 실패:', err);
      }

      if (!empId) {
        setError('본인 임직원 정보를 찾지 못했습니다. (구글 관리자 계정은 비밀번호 변경이 필요 없습니다)');
        setSaving(false);
        return;
      }

      await setDoc(doc(db, 'employees', empId), { initialPassword: newPw }, { merge: true });

      // 로컬 캐시 동기화
      const cached = localStorage.getItem('cached_employees');
      if (cached) {
        try {
          const arr = JSON.parse(cached) as Employee[];
          localStorage.setItem('cached_employees', JSON.stringify(arr.map(e => e.id === empId ? { ...e, initialPassword: newPw } : e)));
        } catch { /* ignore */ }
      }

      await writeAuditLog({
        action: 'password_change',
        entity: 'employee',
        entityId: empId,
        actor: { id: user.id, name: user.name, email: user.email, role: user.role },
        details: { email: user.email }
      });

      setNewPw('');
      setConfirmPw('');
      setToast('비밀번호가 변경되었습니다. 다음 로그인부터 적용됩니다.');
      setTimeout(() => setToast(null), 4000);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6 max-w-3xl mx-auto font-sans text-slate-800 pb-10">
      <AnimatePresence>
        {toast && (
          <motion.div
            initial={{ opacity: 0, y: 50, scale: 0.9 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 50, scale: 0.9 }}
            className="fixed bottom-6 right-6 bg-slate-900 border border-slate-800 text-white px-5 py-3.5 rounded-2xl shadow-2xl flex items-center space-x-3 z-50 text-sm"
          >
            <CheckCircle2 className="h-5 w-5 text-emerald-400 shrink-0" />
            <span className="font-medium">{toast}</span>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Header */}
      <div className="border-b border-slate-200 pb-5">
        <h1 className="text-2xl font-black text-slate-900 tracking-tight">마이페이지</h1>
        <p className="text-sm text-slate-500 mt-1">내 계정 정보를 확인하고 로그인 비밀번호를 변경합니다.</p>
      </div>

      {/* Profile card */}
      <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-xs">
        <div className="flex items-center space-x-4">
          {user.avatarUrl ? (
            <img src={user.avatarUrl} alt={user.name} className="h-14 w-14 rounded-full border border-slate-200 object-cover" referrerPolicy="no-referrer" />
          ) : (
            <div className="h-14 w-14 rounded-full bg-emerald-500/10 text-emerald-700 flex items-center justify-center ring-1 ring-emerald-500/15">
              <UserCircle className="h-8 w-8" />
            </div>
          )}
          <div>
            <div className="text-lg font-black text-slate-900">{user.name}</div>
            <div className="flex items-center flex-wrap gap-x-4 gap-y-1 mt-1 text-xs text-slate-500">
              <span className="flex items-center space-x-1.5"><Mail className="h-3.5 w-3.5 text-slate-400" /><span className="font-mono">{user.email}</span></span>
              <span className="flex items-center space-x-1.5"><BadgeCheck className="h-3.5 w-3.5 text-slate-400" /><span className="font-bold">{roleLabel}</span></span>
            </div>
          </div>
        </div>
      </div>

      {/* Password change */}
      <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-xs">
        <div className="flex items-center space-x-2 mb-4">
          <div className="p-2 bg-indigo-50 text-indigo-600 rounded-xl"><Lock className="h-5 w-5" /></div>
          <div>
            <h3 className="text-base font-bold text-slate-900">로그인 비밀번호 변경</h3>
            <p className="text-xs text-slate-500 mt-0.5">영문과 숫자를 포함하여 6자 이상으로 설정해 주세요.</p>
          </div>
        </div>

        {error && (
          <div className="mb-4 bg-rose-50 border-l-4 border-rose-500 p-3.5 rounded-lg flex items-start space-x-2 text-left">
            <AlertCircle className="h-4.5 w-4.5 text-rose-500 shrink-0 mt-0.5" />
            <span className="text-[11px] text-rose-800 font-semibold leading-relaxed">{error}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1.5">새 비밀번호</label>
            <div className="relative">
              <Lock className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
              <input
                type={show ? 'text' : 'password'}
                value={newPw}
                onChange={(e) => setNewPw(e.target.value)}
                placeholder="영문+숫자 6자 이상"
                autoComplete="new-password"
                className="w-full pl-10 pr-10 py-2.5 text-xs font-mono font-bold bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:outline-none focus:ring-1 focus:ring-emerald-500"
              />
              <button type="button" onClick={() => setShow(!show)} className="absolute right-3 top-2.5 text-slate-400 hover:text-slate-600 cursor-pointer">
                {show ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1.5">새 비밀번호 확인</label>
            <div className="relative">
              <Lock className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
              <input
                type={show ? 'text' : 'password'}
                value={confirmPw}
                onChange={(e) => setConfirmPw(e.target.value)}
                placeholder="다시 한 번 입력"
                autoComplete="new-password"
                className="w-full pl-10 pr-4 py-2.5 text-xs font-mono font-bold bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:outline-none focus:ring-1 focus:ring-emerald-500"
              />
            </div>
          </div>

          <div className="pt-2 flex items-center justify-end">
            <button
              type="submit"
              disabled={saving}
              className="flex items-center space-x-2 bg-emerald-500 hover:bg-emerald-600 disabled:opacity-60 text-white font-bold py-2.5 px-5 rounded-xl text-xs transition-colors cursor-pointer"
            >
              <ShieldCheck className="h-4 w-4" />
              <span>{saving ? '변경 중...' : '비밀번호 변경'}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
