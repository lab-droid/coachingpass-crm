/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  Award, 
  Search, 
  CheckCircle, 
  Clock, 
  TrendingUp, 
  Plus, 
  Trash2, 
  Download, 
  UserCheck, 
  ChevronRight, 
  Coins, 
  Briefcase,
  AlertCircle,
  X
} from 'lucide-react';
import { Coach, CoachFeeItem, Sale } from '../types';
import { db, handleFirestoreError, OperationType } from '../firebase';
import { collection, onSnapshot, setDoc, doc, deleteDoc } from 'firebase/firestore';
import { COACH_TARIFF_TABLE, CoachTariff } from '../data/coachTariff';

const getUniqueCoachesFromTariff = (): Coach[] => {
  const uniqueNames = Array.from(new Set(COACH_TARIFF_TABLE.map(t => t.coachName)));
  return uniqueNames.map((name, index) => {
    const tariffs = COACH_TARIFF_TABLE.filter(t => t.coachName === name);
    const hasPremium = tariffs.some(t => t.notes === '프리미엄');
    const tier = hasPremium ? 'A' : (tariffs.some(t => t.feeAmount && t.feeAmount >= 70000) ? 'A' : 'B');
    
    return {
      id: `c_tariff_${index + 1}`,
      name,
      email: `${name}@coachingpass.com`,
      phone: `010-5555-${String(1000 + index).substring(1)}`,
      specialty: tariffs.map(t => t.method).join('/') + ' 코칭 전문가',
      tier: tier as 'A' | 'B' | 'C',
      joinedDate: '2025-01-10',
      status: 'active'
    };
  });
};

const DEFAULT_COACHES: Coach[] = getUniqueCoachesFromTariff();

const DEFAULT_COACH_FEES: CoachFeeItem[] = [
  { id: 'cf_001', date: '2026-05-18', coachId: 'c_tariff_21', coachName: '이동현', customerName: '임수진', salesAmount: 1200000, feeRate: 0, calculatedFee: 60000, status: 'completed', payoutDate: '2026-05-25', salesId: '20260518-0001', coachingHours: 1 },
  { id: 'cf_002', date: '2026-06-02', coachId: 'c_tariff_4', coachName: '김은아', customerName: '고현우', salesAmount: 1800000, feeRate: 0, calculatedFee: 120000, status: 'pending', salesId: '20260602-0004', coachingHours: 2 },
  { id: 'cf_003', date: '2026-06-03', coachId: 'c_tariff_10', coachName: '문창준', customerName: '최주원', salesAmount: 900000, feeRate: 40, calculatedFee: 360000, status: 'pending', salesId: '20260603-0005', coachingHours: 1 },
  { id: 'cf_004', date: '2026-06-04', coachId: 'c_tariff_17', coachName: '양희성', customerName: '한지성', salesAmount: 600000, feeRate: 0, calculatedFee: 140000, status: 'completed', payoutDate: '2026-06-05', salesId: '20260604-0010', coachingHours: 2 },
];

interface CoachFeesProps {
  sales: Sale[];
}

export default function CoachFees(props: CoachFeesProps) {
  const [coaches, setCoaches] = useState<Coach[]>([]);
  const [coachFees, setCoachFees] = useState<CoachFeeItem[]>([]);
  const [selectedCoachId, setSelectedCoachId] = useState<string | null>(null);
  
  // Custom subtabs and rate filter states
  const [activeSubTab, setActiveSubTab] = useState<'ledger' | 'rates'>('ledger');
  const [rateSearchQuery, setRateSearchQuery] = useState('');
  const [rateMethodFilter, setRateMethodFilter] = useState<'all' | '통합' | '대면' | '비대면' | '대입'>('all');

  // Modals state
  const [isCoachModalOpen, setIsCoachModalOpen] = useState(false);
  const [isFeeModalOpen, setIsFeeModalOpen] = useState(false);
  const [successToast, setSuccessToast] = useState<string | null>(null);
  const [downloading, setDownloading] = useState<string | null>(null);

  // New item inputs
  const [newCoach, setNewCoach] = useState<Partial<Coach>>({
    name: '', email: '', phone: '', specialty: '', tier: 'A', status: 'active'
  });
  const [newFee, setNewFee] = useState<Partial<CoachFeeItem & { coachingMethod?: string; calculationType?: 'tariff' | 'percent'; coachingHours?: number }>>({
    coachId: '', customerName: '', salesAmount: 0, feeRate: 20, status: 'pending', coachingMethod: '대면', calculationType: 'tariff', coachingHours: 1
  });

  // Load from Firebase
  useEffect(() => {
    const uniqueCoaches = getUniqueCoachesFromTariff();
    const validNames = new Set(COACH_TARIFF_TABLE.map(t => t.coachName));

    const unsubCoaches = onSnapshot(collection(db, 'coaches'), (snap) => {
      const dbCoaches = snap.docs.map(d => d.data() as Coach);
      if (dbCoaches.length === 0 || dbCoaches.every(c => ['c_001', 'c_002', 'c_003', 'c_004'].includes(c.id))) {
        uniqueCoaches.forEach(async c => await setDoc(doc(db, 'coaches', c.id), c));
        setCoaches(uniqueCoaches);
      } else {
        const filtered = dbCoaches.filter(c => validNames.has(c.name));
        const invalid = dbCoaches.filter(c => !validNames.has(c.name));
        invalid.forEach(async c => {
          try {
            await deleteDoc(doc(db, 'coaches', c.id));
          } catch (e) {
            console.error("Failed to delete invalid coach:", c.id, e);
          }
        });
        setCoaches(filtered);
      }
    }, (error) => {
      console.error("Firestore coaches load error:", error);
      setCoaches(uniqueCoaches);
      handleFirestoreError(error, OperationType.GET, 'coaches');
    });

    const unsubFees = onSnapshot(collection(db, 'coach_fees'), (snap) => {
      const dbFees = snap.docs.map(d => d.data() as CoachFeeItem);
      if (dbFees.length === 0) {
        const validDefaultFees = DEFAULT_COACH_FEES.filter(f => validNames.has(f.coachName));
        validDefaultFees.forEach(async f => await setDoc(doc(db, 'coach_fees', f.id), f));
        setCoachFees(validDefaultFees);
      } else {
        const filtered = dbFees.filter(f => validNames.has(f.coachName));
        const invalid = dbFees.filter(f => !validNames.has(f.coachName));
        invalid.forEach(async f => {
          try {
            await deleteDoc(doc(db, 'coach_fees', f.id));
          } catch (e) {
            console.error("Failed to delete invalid coach fee:", f.id, e);
          }
        });
        setCoachFees(filtered);
      }
    }, (error) => {
      console.error("Firestore coach_fees load error:", error);
      const validDefaultFees = DEFAULT_COACH_FEES.filter(f => validNames.has(f.coachName));
      setCoachFees(validDefaultFees);
      handleFirestoreError(error, OperationType.GET, 'coach_fees');
    });

    return () => {
      unsubCoaches();
      unsubFees();
    };
  }, []);

  // Autofill tier fee rates or tariff amount
  useEffect(() => {
    if (newFee.coachId) {
      const selected = coaches.find(c => c.id === newFee.coachId);
      if (selected) {
        const method = newFee.coachingMethod || '대면';
        const tariffMatch = COACH_TARIFF_TABLE.find(
          t => t.coachName === selected.name && t.method === method
        );
        const hours = newFee.coachingHours || 1;
        const salesAmt = newFee.salesAmount || 0;

        if (tariffMatch) {
          if (tariffMatch.feeAmount !== undefined) {
            setNewFee(prev => ({
              ...prev,
              calculationType: 'tariff',
              calculatedFee: tariffMatch.feeAmount * hours,
              feeRate: 0
            }));
          } else if (tariffMatch.feePercent !== undefined) {
            setNewFee(prev => ({
              ...prev,
              calculationType: 'percent',
              feeRate: tariffMatch.feePercent,
              calculatedFee: Math.round(salesAmt * (tariffMatch.feePercent / 100))
            }));
          }
        } else {
          let rate = 15;
          if (selected.tier === 'A') rate = 20;
          if (selected.tier === 'B') rate = 15;
          if (selected.tier === 'C') rate = 10;
          setNewFee(prev => ({
            ...prev,
            calculationType: 'percent',
            feeRate: rate,
            calculatedFee: Math.round(salesAmt * (rate / 100))
          }));
        }
      }
    }
  }, [newFee.coachId, newFee.coachingMethod, newFee.coachingHours, newFee.salesAmount, coaches]);

  const showToast = (msg: string) => {
    setSuccessToast(msg);
    setTimeout(() => setSuccessToast(null), 3000);
  };

  const formatKrw = (value: number) => {
    return new Intl.NumberFormat('ko-KR', {
      style: 'currency',
      currency: 'KRW',
      maximumFractionDigits: 0,
    }).format(value);
  };

  // Calculations
  const grandTotalFees = coachFees.reduce((sum, f) => sum + f.calculatedFee, 0);
  const pendingFees = coachFees.filter(f => f.status === 'pending').reduce((sum, f) => sum + f.calculatedFee, 0);
  const completedFees = coachFees.filter(f => f.status === 'completed').reduce((sum, f) => sum + f.calculatedFee, 0);

  // Active filter for coach list detail view
  const activeCoach = selectedCoachId ? coaches.find(c => c.id === selectedCoachId) : null;
  const activeCoachFees = selectedCoachId 
    ? coachFees.filter(f => f.coachId === selectedCoachId)
    : coachFees;

  // Add coach
  const handleAddCoach = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newCoach.name || !newCoach.email) {
      alert('필수 사항을 입력해주세요.');
      return;
    }
    const coachId = `c_${Date.now()}`;
    const item: Coach = {
      id: coachId,
      name: newCoach.name,
      email: newCoach.email,
      phone: newCoach.phone || '',
      specialty: newCoach.specialty || '경영/마케팅 리서치',
      tier: (newCoach.tier as any) || 'B',
      joinedDate: new Date().toISOString().split('T')[0],
      status: 'active'
    };
    await setDoc(doc(db, 'coaches', coachId), item);
    setIsCoachModalOpen(false);
    setNewCoach({ name: '', email: '', phone: '', specialty: '', tier: 'A', status: 'active' });
    showToast(`파트너 코비 ${item.name} 코치가 성공적으로 임명되었습니다.`);
  };

  // Add coaching reward fee item
  const handleAddFee = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newFee.coachId || !newFee.customerName) {
      alert('필수 항목을 정확하게 입력해주세요.');
      return;
    }
    const selected = coaches.find(c => c.id === newFee.coachId);
    if (!selected) return;

    const isTariff = newFee.calculationType === 'tariff';
    const rate = isTariff ? 0 : (Number(newFee.feeRate) || 15);
    const salesAmt = Number(newFee.salesAmount) || 0;
    const hours = Number(newFee.coachingHours) || 1;
    
    const calcFee = isTariff 
      ? (Number(newFee.calculatedFee) || 0)
      : Math.round(salesAmt * (rate / 100));

    const feeId = `cf_${Date.now()}`;
    const item: CoachFeeItem = {
      id: feeId,
      date: new Date().toISOString().split('T')[0],
      coachId: selected.id,
      coachName: selected.name,
      customerName: newFee.customerName,
      salesAmount: salesAmt,
      feeRate: rate,
      calculatedFee: calcFee,
      status: (newFee.status as any) || 'pending',
      payoutDate: newFee.status === 'completed' ? new Date().toISOString().split('T')[0] : undefined,
      salesId: newFee.salesId || undefined,
      coachingHours: hours
    };

    await setDoc(doc(db, 'coach_fees', feeId), item);
    setIsFeeModalOpen(false);
    setNewFee({ coachId: '', customerName: '', salesAmount: 0, feeRate: 20, status: 'pending', coachingMethod: '대면', calculationType: 'tariff', coachingHours: 1, salesId: undefined });
    showToast(`${selected.name} 코치 수당 (${formatKrw(calcFee)})이 안전하게 매칭 등록되었습니다.`);
  };

  // Status Change
  const handleToggleFeeStatus = async (item: CoachFeeItem) => {
    const isCompleted = item.status === 'completed';
    const updated: CoachFeeItem = {
      ...item,
      status: isCompleted ? 'pending' : 'completed',
      payoutDate: isCompleted ? undefined : new Date().toISOString().split('T')[0]
    };
    await setDoc(doc(db, 'coach_fees', item.id), updated);
    showToast(`${item.coachName} 코치의 수당 정산 상태가 ${isCompleted ? '정산 대기' : '정산 완료'} 건으로 변경되었습니다.`);
  };

  // Delete Fee Item
  const handleDeleteFee = async (id: string, name: string) => {
    if (confirm(`선택한 코치 수수료 전산 기록 (${name})을 전산에서 영구 삭제 처리하시겠습니까?`)) {
      await deleteDoc(doc(db, 'coach_fees', id));
      showToast('코칭 정산 정보가 파기되었습니다.');
    }
  };

  // Simulate report download
  const handleDownloadReport = (coachName: string) => {
    setDownloading(coachName);
    setTimeout(() => {
      setDownloading(null);
      showToast(`${coachName} 코치의 당월 세무 원천징수 지급 조서가 다운로드 완료되었습니다.`);
    }, 1500);
  };

  // Filtered tariff table
  const filteredTariff = COACH_TARIFF_TABLE.filter((item) => {
    const matchesSearch = 
      item.coachName.toLowerCase().includes(rateSearchQuery.toLowerCase()) || 
      (item.realName && item.realName.toLowerCase().includes(rateSearchQuery.toLowerCase()));
    
    const matchesMethod = 
      rateMethodFilter === 'all' || item.method === rateMethodFilter;

    return matchesSearch && matchesMethod;
  });

  return (
    <div className="space-y-6 max-w-7xl mx-auto font-sans text-slate-800 pb-10 relative" id="coach_fees_wrapper">
      <AnimatePresence>
        {successToast && (
          <motion.div 
            initial={{ opacity: 0, y: 50, scale: 0.9 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 50, scale: 0.9 }}
            className="fixed bottom-6 right-6 bg-slate-900 border border-slate-800 text-white px-5 py-3.5 rounded-2xl shadow-2xl flex items-center space-x-3 z-50 text-sm font-sans"
          >
            <CheckCircle className="h-5 w-5 text-emerald-400 shrink-0" />
            <span className="font-medium">{successToast}</span>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Header Panel */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-200 pb-5">
        <div>
          <h1 className="text-2xl font-black text-slate-900 tracking-tight">코치 지도 수수료 관리</h1>
          <p className="text-sm text-slate-500 mt-1">
            소속 전문 코치진에게 지급할 학습/진로/전략 컨설팅 수수료 정산을 원천징수율 및 등급(Tier)에 따라 자동 정산 처리합니다.
          </p>
        </div>
        <div className="flex items-center space-x-2">
          <button
            onClick={() => setIsCoachModalOpen(true)}
            className="flex items-center justify-center space-x-2 bg-slate-900 hover:bg-slate-800 text-white font-bold py-2.5 px-4 rounded-xl text-sm transition-all cursor-pointer shadow-xs"
          >
            <UserCheck className="h-4.5 w-4.5" />
            <span>신규 코치 등록</span>
          </button>
          
          <button
            onClick={() => setIsFeeModalOpen(true)}
            className="flex items-center justify-center space-x-2 bg-emerald-500 hover:bg-emerald-600 text-white font-bold py-2.5 px-4 rounded-xl text-sm transition-all cursor-pointer shadow-lg shadow-emerald-500/10"
          >
            <Plus className="h-4.5 w-4.5" />
            <span>수수료 매칭 등록</span>
          </button>
        </div>
      </div>

      {/* Sub Navigation Tabs */}
      <div className="flex border-b border-slate-200" id="coach_fees_subtabs">
        <button
          onClick={() => setActiveSubTab('ledger')}
          className={`px-5 py-3 font-bold text-sm border-b-2 transition-all cursor-pointer ${
            activeSubTab === 'ledger'
              ? 'border-emerald-500 text-emerald-600'
              : 'border-transparent text-slate-500 hover:text-slate-800'
          }`}
        >
          수수료 정산 및 지급 대장
        </button>
        <button
          onClick={() => setActiveSubTab('rates')}
          className={`px-5 py-3 font-bold text-sm border-b-2 transition-all cursor-pointer flex items-center space-x-2 ${
            activeSubTab === 'rates'
              ? 'border-emerald-500 text-emerald-600'
              : 'border-transparent text-slate-500 hover:text-slate-800'
          }`}
        >
          <span>코칭 방식별 수수료 요율표</span>
          <span className="text-[10px] bg-emerald-100 text-emerald-800 px-1.5 py-0.5 rounded-full font-bold">전산동기</span>
        </button>
      </div>

      {activeSubTab === 'ledger' ? (
        <>
          {/* KPI Stats Panel */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6" id="coach_kpis">
            <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-xs flex items-center space-x-4">
              <div className="h-12 w-12 rounded-xl bg-amber-50 text-amber-600 flex items-center justify-center shrink-0">
                <Clock className="h-6 w-6" />
              </div>
              <div>
                <span className="text-xs font-semibold text-slate-400 block uppercase tracking-wider">지급 대기 코치 수수료</span>
                <strong className="text-xl font-bold font-mono text-amber-600 block mt-0.5">{formatKrw(pendingFees)}</strong>
                <span className="text-[10px] text-slate-400 block mt-1">강의 조서 등록 후 회계 검수 대기건</span>
              </div>
            </div>

            <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-xs flex items-center space-x-4">
              <div className="h-12 w-12 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center shrink-0">
                <CheckCircle className="h-6 w-6" />
              </div>
              <div>
                <span className="text-xs font-semibold text-slate-400 block uppercase tracking-wider">지급 승인 완료 (Paid)</span>
                <strong className="text-xl font-bold font-mono text-emerald-600 block mt-0.5">{formatKrw(completedFees)}</strong>
                <span className="text-[10px] text-slate-400 block mt-1">원천 정산 완료 및 실 지급 처리 완료</span>
              </div>
            </div>

            <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-xs flex items-center space-x-4">
              <div className="h-12 w-12 rounded-xl bg-slate-100 text-slate-700 flex items-center justify-center shrink-0">
                <Coins className="h-6 w-6" />
              </div>
              <div>
                <span className="text-xs font-semibold text-slate-400 block uppercase tracking-wider">누적 정산금 규모 (Total)</span>
                <strong className="text-xl font-bold font-mono text-slate-905 block mt-0.5">{formatKrw(grandTotalFees)}</strong>
                <span className="text-[10px] text-slate-400 block mt-1">활동 중인 전체 전문 파트너 코치 {coaches.length}명</span>
              </div>
            </div>
          </div>

          {/* Two Column Layout: Coahces List (Left) , Detailed matching commissions (Right) */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6" id="coach_settlement_grid">
            
            {/* Left Column: Coaches cards */}
            <div className="lg:col-span-4 space-y-4">
              <h3 className="text-sm font-bold text-slate-400 uppercase tracking-wider">전문가 코치 라인업</h3>
              <div className="space-y-3">
                <div 
                  onClick={() => setSelectedCoachId(null)}
                  className={`p-4 rounded-2xl border transition-all cursor-pointer font-sans ${
                    selectedCoachId === null 
                      ? 'bg-slate-900 border-slate-900 text-white shadow-lg' 
                      : 'bg-white border-slate-200 text-slate-800 hover:border-slate-300'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-sm">전체 파트너 코치 수수료 보기</span>
                    <ChevronRight className="h-4 w-4" />
                  </div>
                </div>

                {coaches.map(c => {
                  const isSelected = selectedCoachId === c.id;
                  const coachTotal = coachFees.filter(f => f.coachId === c.id).reduce((sum, f) => sum + f.calculatedFee, 0);
                  const coachPending = coachFees.filter(f => f.coachId === c.id && f.status === 'pending').reduce((sum, f) => sum + f.calculatedFee, 0);

                  return (
                    <div
                      key={c.id}
                      onClick={() => setSelectedCoachId(c.id)}
                      className={`
                        p-5 rounded-2xl border transition-all cursor-pointer relative overflow-hidden group
                        ${isSelected 
                          ? 'bg-slate-900 border-slate-900 text-white shadow-lg' 
                          : 'bg-white border-slate-200 text-slate-800 hover:border-slate-300'
                        }
                      `}
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex items-center space-x-2.5">
                          <div className={`h-8 w-8 rounded-lg flex items-center justify-center font-bold text-xs ${
                            isSelected ? 'bg-slate-800 text-emerald-400' : 'bg-slate-50 text-slate-500'
                          }`}>
                            T{c.tier}
                          </div>
                          <div>
                            <span className="font-bold text-sm tracking-tight block">{c.name}</span>
                            <span className={`text-[10px] ${isSelected ? 'text-slate-400' : 'text-slate-400'}`}>{c.specialty}</span>
                          </div>
                        </div>
                        <ChevronRight className="h-4 w-4 text-slate-400 group-hover:translate-x-0.5 transition-transform" />
                      </div>

                      <div className="mt-4 flex justify-between items-center text-xs">
                        <div>
                          <span className="text-slate-400 block text-[10px]">지급 완료 수당</span>
                          <strong className="font-mono mt-0.5 block">{formatKrw(coachTotal - coachPending)}</strong>
                        </div>
                        <div className="text-right">
                          <span className="text-amber-500 block text-[10px]">승인 대기 수당</span>
                          <strong className="font-mono mt-0.5 text-amber-500 block">{formatKrw(coachPending)}</strong>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Right Column: Matched commissions ledger */}
            <div className="lg:col-span-8 space-y-4">
              <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-xs space-y-5">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-100 pb-4">
                  <div>
                    <h3 className="text-base font-bold text-slate-900 tracking-tight">
                      {activeCoach ? `${activeCoach.name} 코치 수수료 지급 대장` : '전체 코치 지출 수수료 정산장'}
                    </h3>
                    <p className="text-xs text-slate-400 mt-0.5">매입 계약 건에 대한 코칭 지도료 매칭 목록 및 정산 상태 관리</p>
                  </div>
                  
                  {activeCoach && (
                    <button
                      onClick={() => handleDownloadReport(activeCoach.name)}
                      disabled={downloading !== null}
                      className="flex items-center justify-center space-x-1.5 bg-slate-900 hover:bg-slate-800 text-white rounded-xl py-2 px-3 text-xs font-bold transition"
                    >
                      {downloading === activeCoach.name ? (
                        <span>전표 생성중...</span>
                      ) : (
                        <>
                          <Download className="h-3.5 w-3.5" />
                          <span>원천전표 (조서)</span>
                        </>
                      )}
                    </button>
                  )}
                </div>

                {/* List */}
                <div className="space-y-3 max-h-[500px] overflow-y-auto pr-1">
                  {activeCoachFees.length > 0 ? (
                    activeCoachFees.map((fee) => (
                      <div 
                        key={fee.id}
                        className="p-4 rounded-xl border border-slate-150 bg-slate-50/50 hover:bg-slate-50 duration-75 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs"
                      >
                        <div>
                          <div className="flex items-center space-x-2">
                            <span className="font-mono text-slate-400 font-bold">{fee.date}</span>
                            <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-emerald-50 text-emerald-700 border border-emerald-100">코칭수당</span>
                            {fee.salesId && (
                              <span className="text-[10px] bg-slate-100 text-slate-600 px-1.5 py-0.5 rounded-md font-bold flex items-center space-x-0.5">
                                <span>🔗 전표연계</span>
                              </span>
                            )}
                          </div>
                          <h4 className="font-black text-slate-950 text-sm mt-1">{fee.coachName} <span className="text-xs font-normal text-slate-500">→ 대상원생: {fee.customerName}</span></h4>
                          <div className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-1 text-slate-500 font-medium">
                            <span>원생매출: <strong className="font-mono text-slate-750 font-bold">{formatKrw(fee.salesAmount)}</strong></span>
                            <span>코칭시간: <strong className="font-mono text-slate-750 font-bold">{fee.coachingHours || 1}시간</strong></span>
                            <span>요율수립: <strong className="font-mono text-emerald-600 font-bold">{fee.feeRate > 0 ? `${fee.feeRate}% 비례` : '고정요율제'}</strong></span>
                          </div>
                        </div>

                        <div className="flex items-center justify-between sm:justify-end gap-3 border-t border-slate-200/50 sm:border-0 pt-2 sm:pt-0">
                          <div className="text-right">
                            <span className="text-slate-400 block text-[10px]">수당 정액</span>
                            <strong className="text-slate-950 font-mono font-bold text-sm block">{formatKrw(fee.calculatedFee)}</strong>
                          </div>

                          <div className="flex items-center space-x-1.5">
                            <button
                              onClick={() => handleToggleFeeStatus(fee)}
                              className={`
                                px-3 py-1.5 rounded-lg border font-bold duration-100 flex items-center space-x-1 cursor-pointer text-[11px]
                                ${fee.status === 'completed'
                                  ? 'bg-emerald-50 text-emerald-700 border-emerald-100 hover:bg-emerald-100'
                                  : 'bg-amber-50 text-amber-700 border-amber-100 hover:bg-amber-100'
                                }
                              `}
                            >
                              {fee.status === 'completed' ? (
                                <>
                                  <CheckCircle className="w-3.5 h-3.5 text-emerald-600" />
                                  <span>회계승인완료</span>
                                </>
                              ) : (
                                <>
                                  <Clock className="w-3.5 h-3.5 text-amber-500" />
                                  <span>정산 대기</span>
                                </>
                              )}
                            </button>
                            
                            <button
                              onClick={() => handleDeleteFee(fee.id, fee.coachName + ' - ' + fee.customerName)}
                              className="p-1 text-slate-350 hover:text-rose-500 hover:bg-rose-50/50 rounded-lg cursor-pointer"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </div>
                        </div>
                      </div>
                    ))
                  ) : (
                    <div className="py-20 text-center text-slate-400 font-sans border border-dashed border-slate-200 rounded-2xl bg-slate-50">
                      <Award className="h-10 w-10 text-slate-200 mx-auto mb-3" />
                      동 매칭 정보에 부합하는 지급 수수료 지급 대장이 전산상에 없습니다.
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        </>
      ) : (
        <div className="space-y-4" id="rates_tariff_panel">
          <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-xs">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-100 pb-4 mb-5">
              <div>
                <h3 className="text-base font-bold text-slate-900 tracking-tight">코치별 수수료 기준 요율 조서</h3>
                <p className="text-xs text-slate-405 mt-0.5 font-sans">매칭 등록 단가와 원천 징수 정산을 제어하는 코칭 방식별 공식 전산 분류 기준표 (이미지 표 완벽 반영)</p>
              </div>
              <div className="flex flex-wrap items-center gap-3">
                <div className="relative">
                  <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
                  <input
                    type="text"
                    value={rateSearchQuery}
                    onChange={(e) => setRateSearchQuery(e.target.value)}
                    placeholder="코치명 또는 본명 검색..."
                    className="pl-9 pr-4 py-2 text-xs border border-slate-200 rounded-xl w-48 focus:outline-none focus:ring-1 focus:ring-emerald-500 font-sans"
                  />
                </div>
                <select
                  value={rateMethodFilter}
                  onChange={(e: any) => setRateMethodFilter(e.target.value)}
                  className="border border-slate-200 text-xs rounded-xl py-2 px-3 focus:outline-none focus:ring-1 focus:ring-emerald-500 font-medium font-sans bg-transparent cursor-pointer"
                >
                  <option value="all">모든 코칭방식</option>
                  <option value="통합">통합</option>
                  <option value="대면">대면</option>
                  <option value="비대면">비대면</option>
                  <option value="대입">대입</option>
                </select>
              </div>
            </div>

            <div className="overflow-x-auto border border-slate-200 rounded-2xl">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-200 text-slate-500 font-bold font-sans">
                    <th className="p-3 border-r border-slate-200">코치명</th>
                    <th className="p-3 border-r border-slate-200 text-center">코칭방식</th>
                    <th className="p-3 border-r border-slate-200 text-right">수수료($)</th>
                    <th className="p-3 border-r border-slate-200 text-right font-sans">수수료(%)</th>
                    <th className="p-3 border-r border-slate-200 text-center">본명</th>
                    <th className="p-3">비고</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 font-sans">
                  {filteredTariff.length > 0 ? (
                    filteredTariff.map((item) => (
                      <tr key={item.id} className="hover:bg-slate-50/70 transition-colors duration-75">
                        <td className="p-3 font-black text-slate-900 border-r border-slate-200 text-sm whitespace-nowrap">{item.coachName}</td>
                        <td className="p-3 border-r border-slate-200 text-center whitespace-nowrap">
                          <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                            item.method === '통합' ? 'bg-indigo-50 text-indigo-700 border border-indigo-100/50' :
                            item.method === '대면' ? 'bg-emerald-50 text-emerald-700 border border-emerald-100/50' :
                            item.method === '비대면' ? 'bg-amber-50 text-amber-700 border border-amber-100/50' :
                            'bg-violet-50 text-violet-700 border border-violet-100/50'
                          }`}>
                            {item.method}
                          </span>
                        </td>
                        <td className="p-3 border-r border-slate-200 text-right font-mono font-bold text-slate-700 text-sm whitespace-nowrap">
                          {item.feeAmount !== undefined ? formatKrw(item.feeAmount) : '-'}
                        </td>
                        <td className="p-3 border-r border-slate-200 text-right font-mono font-bold text-slate-700 text-sm whitespace-nowrap">
                          {item.feePercent !== undefined ? `${item.feePercent}%` : '-'}
                        </td>
                        <td className="p-3 border-r border-slate-200 text-center text-slate-500 font-bold whitespace-nowrap">
                          {item.realName || '-'}
                        </td>
                        <td className="p-3 font-semibold text-slate-400">
                          {item.notes ? (
                            <span className="px-1.5 py-0.5 rounded bg-rose-50 text-rose-600 font-black text-[10px] border border-rose-100/50">
                              {item.notes}
                            </span>
                          ) : '-'}
                        </td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td colSpan={6} className="p-10 text-center text-slate-400 font-sans">
                        조회된 코칭 방식 요율 테이블 항목이 전산상에 존재하지 않습니다.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* MODAL: ADD COACH */}
      <AnimatePresence>
        {isCoachModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setIsCoachModalOpen(false)} className="fixed inset-0 bg-slate-950/60 backdrop-blur-xs" />
            <motion.div initial={{ scale: 0.95 }} animate={{ scale: 1 }} exit={{ scale: 0.95 }} className="bg-white rounded-3xl p-6 shadow-2xl relative w-full max-w-md z-10 border border-slate-200">
              <div className="flex items-center justify-between border-b pb-3 mb-4">
                <h3 className="font-bold text-slate-900 text-sm">신규 보직 코칭 전문가 임명</h3>
                <button onClick={() => setIsCoachModalOpen(false)} className="text-slate-400 hover:text-slate-650 cursor-pointer"><X className="w-5 h-5" /></button>
              </div>
              <form onSubmit={handleAddCoach} className="space-y-4 text-xs">
                <div>
                  <label className="block text-slate-500 font-bold mb-1">성명 *</label>
                  <select 
                    required 
                    value={newCoach.name || ''} 
                    onChange={e => {
                      const selectedName = e.target.value;
                      if (!selectedName) {
                        setNewCoach({ name: '', email: '', phone: '', specialty: '', tier: 'A', status: 'active' });
                        return;
                      }
                      const tariffs = COACH_TARIFF_TABLE.filter(t => t.coachName === selectedName);
                      const hasPremium = tariffs.some(t => t.notes === '프리미엄');
                      const tier = hasPremium ? 'A' : (tariffs.some(t => t.feeAmount && t.feeAmount >= 70000) ? 'A' : 'B');
                      
                      setNewCoach({
                        name: selectedName,
                        email: `${selectedName}@coachingpass.com`,
                        phone: newCoach.phone || `010-5555-${String(1000 + Math.floor(Math.random() * 9000)).substring(1)}`,
                        specialty: tariffs.map(t => t.method).join('/') + ' 코칭 전문가',
                        tier: tier as any,
                        status: 'active'
                      });
                    }} 
                    className="w-full border p-2.5 rounded-xl font-bold bg-transparent"
                  >
                    <option value="">코칭 요율표 기준 코치 선택</option>
                    {Array.from(new Set(COACH_TARIFF_TABLE.map(t => t.coachName))).sort().map(name => (
                      <option key={name} value={name}>{name}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-slate-500 font-bold mb-1">이메일 *</label>
                  <input type="email" required value={newCoach.email} onChange={e => setNewCoach({...newCoach, email: e.target.value})} placeholder="abc@coachingpass.com" className="w-full border p-2.5 rounded-xl text-xs font-semibold" />
                </div>
                <div>
                  <label className="block text-slate-500 font-bold mb-1">연락처</label>
                  <input type="text" value={newCoach.phone} onChange={e => setNewCoach({...newCoach, phone: e.target.value})} placeholder="010-1111-2222" className="w-full border p-2.5 rounded-xl text-xs font-mono" />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-slate-500 font-bold mb-1">매칭 코칭 전문 분야</label>
                    <input type="text" value={newCoach.specialty} onChange={e => setNewCoach({...newCoach, specialty: e.target.value})} placeholder="예. 초등 대입 면접" className="w-full border p-2.5 rounded-xl text-xs font-semibold" />
                  </div>
                  <div>
                    <label className="block text-slate-500 font-bold mb-1">수당 및 수수료 등급 (Tier)</label>
                    <select value={newCoach.tier} onChange={e => setNewCoach({...newCoach, tier: e.target.value as any})} className="w-full border p-2.5 rounded-xl font-bold">
                      <option value="A">티어 A (20% 수당율)</option>
                      <option value="B">티어 B (15% 수당율)</option>
                      <option value="C">티어 C (10% 수당율)</option>
                    </select>
                  </div>
                </div>
                <button type="submit" className="w-full bg-slate-900 border text-white font-bold py-3 rounded-xl mt-4 cursor-pointer">전문 파트너 코치 등록</button>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* MODAL: ADD COACH FEE */}
      <AnimatePresence>
        {isFeeModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setIsFeeModalOpen(false)} className="fixed inset-0 bg-slate-950/60 backdrop-blur-xs" />
            <motion.div initial={{ scale: 0.95 }} animate={{ scale: 1 }} exit={{ scale: 0.95 }} className="bg-white rounded-3xl p-6 shadow-2xl relative w-full max-w-md z-10 border border-slate-200">
              <div className="flex items-center justify-between border-b pb-3 mb-4">
                <h3 className="font-bold text-slate-900 text-sm">컨설팅 매출 코치 수수료 매칭 등록</h3>
                <button onClick={() => setIsFeeModalOpen(false)} className="text-slate-400 hover:text-slate-650 cursor-pointer"><X className="w-5 h-5" /></button>
              </div>
              <form onSubmit={handleAddFee} className="space-y-4 text-xs font-sans">
                <div>
                  <label className="block text-slate-500 font-bold mb-1">🧾 수강생 매출 전표 연동 (선택사항)</label>
                  <select 
                    value={newFee.salesId || ''} 
                    onChange={e => {
                      const saleId = e.target.value;
                      if (!saleId) {
                        setNewFee(prev => ({
                          ...prev,
                          salesId: undefined,
                          customerName: '',
                          salesAmount: 0,
                          coachingHours: 1
                        }));
                        return;
                      }
                      const foundSale = props.sales.find(s => s.id === saleId);
                      if (foundSale) {
                        const matchedCoach = coaches.find(c => c.name === foundSale.coachName);
                        let method = '대면';
                        const svc = (foundSale.registeredService || '').toLowerCase();
                        if (svc.includes('비대면') || svc.includes('온라인') || svc.includes('online') || svc.includes('zoom')) {
                          method = '비대면';
                        } else if (svc.includes('대입') || svc.includes('입시') || svc.includes('입학')) {
                          method = '대입';
                        } else if (svc.includes('통합') || svc.includes('종합')) {
                          method = '통합';
                        }

                        setNewFee(prev => ({
                          ...prev,
                          salesId: foundSale.id,
                          customerName: foundSale.customerName,
                          salesAmount: foundSale.amount,
                          coachingHours: foundSale.coachingHours || 1,
                          coachId: matchedCoach ? matchedCoach.id : prev.coachId,
                          coachingMethod: method
                        }));
                      }
                    }} 
                    className="w-full border p-2.5 rounded-xl font-bold bg-slate-50 hover:bg-slate-100 cursor-pointer"
                  >
                    <option value="">전표를 연동하지 않고 직접 작성</option>
                    {(props.sales || [])
                      .filter(s => (s.amount || 0) > 0)
                      .map(s => (
                        <option key={s.id} value={s.id}>
                          [{s.registrationDate || s.date?.substring(0, 10)}] {s.customerName} - {formatKrw(s.amount)} ({s.coachName || '코치 미정'})
                        </option>
                      ))
                    }
                  </select>
                </div>
                <div>
                  <label className="block text-slate-500 font-bold mb-1">대상 지정 코치 파트너 *</label>
                  <select required value={newFee.coachId} onChange={e => setNewFee({...newFee, coachId: e.target.value})} className="w-full border p-2.5 rounded-xl font-bold bg-transparent">
                    <option value="">코치를 지정해주세요</option>
                    {coaches.map(c => <option key={c.id} value={c.id}>{c.name} (T{c.tier} 등급)</option>)}
                  </select>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-slate-500 font-bold mb-1">대상 원생/학생 성명 *</label>
                    <input type="text" required value={newFee.customerName} onChange={e => setNewFee({...newFee, customerName: e.target.value})} placeholder="예. 최정규" className="w-full border p-2.5 rounded-xl font-semibold" />
                  </div>
                  <div>
                    <label className="block text-slate-500 font-bold mb-1">코칭 시간 (회차/시간) *</label>
                    <input type="number" required min={1} value={newFee.coachingHours || 1} onChange={e => setNewFee({...newFee, coachingHours: Math.max(1, Number(e.target.value))})} className="w-full border p-2.5 rounded-xl font-bold font-mono" />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-slate-500 font-bold mb-1">코칭방식 *</label>
                    <select required value={newFee.coachingMethod || '대면'} onChange={e => setNewFee({...newFee, coachingMethod: e.target.value})} className="w-full border p-2.5 rounded-xl font-bold bg-transparent">
                      <option value="통합">통합</option>
                      <option value="대면">대면</option>
                      <option value="비대면">비대면</option>
                      <option value="대입">대입</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-slate-500 font-bold mb-1">수수료 정산방식 *</label>
                    <select required value={newFee.calculationType || 'tariff'} onChange={e => setNewFee({...newFee, calculationType: e.target.value as any})} className="w-full border p-2.5 rounded-xl font-bold bg-transparent">
                      <option value="tariff">지정 고정 수수료 (표 기준)</option>
                      <option value="percent">수수료율 (%) 비례</option>
                    </select>
                  </div>
                </div>

                {newFee.calculationType === 'tariff' ? (
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-slate-500 font-bold mb-1">체결 수납 원생 매출액</label>
                      <input type="number" value={newFee.salesAmount || ''} onChange={e => setNewFee({...newFee, salesAmount: Number(e.target.value)})} placeholder="예. 1000000" className="w-full border p-2.5 rounded-xl font-mono text-xs font-semibold" />
                    </div>
                    <div>
                      <label className="block text-slate-500 font-bold mb-1">고정 수수료 (원/합계) *</label>
                      <input type="number" required value={newFee.calculatedFee || ''} onChange={e => setNewFee({...newFee, calculatedFee: Number(e.target.value)})} placeholder="예. 60000" className="w-full border p-2.5 rounded-xl font-mono text-xs font-bold text-emerald-600 bg-emerald-50/30" />
                    </div>
                  </div>
                ) : (
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-slate-500 font-bold mb-1">체결 수납 원생 매출액 *</label>
                      <input type="number" required value={newFee.salesAmount || ''} onChange={e => setNewFee({...newFee, salesAmount: Number(e.target.value)})} placeholder="예. 1000000" className="w-full border p-2.5 rounded-xl font-mono text-xs font-semibold" />
                    </div>
                    <div>
                      <label className="block text-slate-500 font-bold mb-1">수수료율 (%) *</label>
                      <input type="number" required value={newFee.feeRate || ''} onChange={e => setNewFee({...newFee, feeRate: Number(e.target.value)})} placeholder="예. 20" className="w-full border p-2.5 rounded-xl font-mono text-xs font-semibold hover:bg-white" />
                    </div>
                  </div>
                )}
                <div>
                  <label className="block text-slate-500 font-bold mb-1">최초 수당 지급 상태</label>
                  <select value={newFee.status} onChange={e => setNewFee({...newFee, status: e.target.value as any})} className="w-full border p-2.5 rounded-xl font-bold">
                    <option value="pending">정산 대기 중 (Unpaid)</option>
                    <option value="completed">정산 지급 완료 (Paid)</option>
                  </select>
                </div>
                <button type="submit" className="w-full bg-emerald-500 text-white font-bold py-3 rounded-xl mt-4 cursor-pointer">수수료 매칭 전산 등록</button>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
