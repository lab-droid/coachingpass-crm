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
  X,
  FileText,
  Lock,
  Unlock
} from 'lucide-react';
import { Coach, CoachFeeItem, Sale, User } from '../types';
import { db, handleFirestoreError, OperationType, isQuotaExceeded, writeAuditLog } from '../firebase';
import { collection, onSnapshot, setDoc, doc, deleteDoc, writeBatch } from 'firebase/firestore';
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
  setSales?: (newSalesAction: Sale[] | ((prev: Sale[]) => Sale[])) => void;
  user?: User;
}

let coachesSeedAttempted = false;
let tariffsSeedAttempted = false;

export default function CoachFees(props: CoachFeesProps) {
  const isAdmin = props.user?.role === 'admin';
  const [coaches, setCoaches] = useState<Coach[]>([]);
  const [tariffs, setTariffs] = useState<CoachTariff[]>(COACH_TARIFF_TABLE);
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

  // Real-time Employees and Spreadsheet Filters
  const [employees, setEmployees] = useState<any[]>([]);
  const [ledgerSearchQuery, setLedgerSearchQuery] = useState('');
  const [ledgerCoachFilter, setLedgerCoachFilter] = useState('all');
  const [ledgerStatusFilter, setLedgerStatusFilter] = useState('all');
  const [ledgerManagerFilter, setLedgerManagerFilter] = useState('all');
  const [ledgerMonthFilter, setLedgerMonthFilter] = useState('all');

  // Bulk settlement selection
  const [selectedFeeIds, setSelectedFeeIds] = useState<Set<string>>(new Set());

  // 월 마감(정산 잠금)
  const [lockedMonths, setLockedMonths] = useState<string[]>([]);
  const auditActor = { id: props.user?.id, name: props.user?.name, email: props.user?.email, role: props.user?.role };

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

    const cached = localStorage.getItem('cached_coaches');
    if (cached) {
      try {
        setCoaches(JSON.parse(cached));
      } catch (e) {
        // ignore
      }
    }

    const unsubCoaches = onSnapshot(collection(db, 'coaches'), (snap) => {
      const dbCoaches = snap.docs.map(d => d.data() as Coach);
      if (dbCoaches.length === 0 || dbCoaches.every(c => ['c_001', 'c_002', 'c_003', 'c_004'].includes(c.id))) {
        if (!coachesSeedAttempted && !isQuotaExceeded()) {
          coachesSeedAttempted = true;
          uniqueCoaches.forEach(async c => {
            try {
              await setDoc(doc(db, 'coaches', c.id), c);
            } catch (e) {
              console.error("Failed to seed coach:", c.id, e);
            }
          });
        }
        setCoaches(uniqueCoaches);
        localStorage.setItem('cached_coaches', JSON.stringify(uniqueCoaches));
      } else {
        const filtered = dbCoaches.filter(c => validNames.has(c.name));
        const invalid = dbCoaches.filter(c => !validNames.has(c.name));
        if (!coachesSeedAttempted && !isQuotaExceeded()) {
          coachesSeedAttempted = true;
          invalid.forEach(async c => {
            try {
              await deleteDoc(doc(db, 'coaches', c.id));
            } catch (e) {
              console.error("Failed to delete invalid coach:", c.id, e);
            }
          });
        }
        setCoaches(filtered);
        localStorage.setItem('cached_coaches', JSON.stringify(filtered));
      }
    }, (error) => {
       console.error("Firestore coaches load error:", error);
       if (!cached) {
         setCoaches(uniqueCoaches);
       }
       handleFirestoreError(error, OperationType.GET, 'coaches', false);
     });

    const unsubEmployees = onSnapshot(collection(db, 'employees'), (snap) => {
      const emps = snap.docs.map(d => d.data());
      setEmployees(emps);
    }, (error) => {
      console.error("Firestore employees load error in CoachFees:", error);
    });

    return () => {
      unsubCoaches();
      unsubEmployees();
    };
  }, []);

  // Load coach tariff (요율표) from Firebase, seeding from the static table on first run
  useEffect(() => {
    const cached = localStorage.getItem('cached_coach_tariffs');
    if (cached) {
      try {
        setTariffs(JSON.parse(cached));
      } catch (e) {
        // ignore
      }
    }

    const unsubTariffs = onSnapshot(collection(db, 'coachTariffs'), (snap) => {
      const dbTariffs = snap.docs.map(d => d.data() as CoachTariff);
      if (dbTariffs.length === 0) {
        if (!tariffsSeedAttempted && !isQuotaExceeded()) {
          tariffsSeedAttempted = true;
          COACH_TARIFF_TABLE.forEach(async (t) => {
            try {
              await setDoc(doc(db, 'coachTariffs', t.id), t);
            } catch (e) {
              console.error("Failed to seed tariff:", t.id, e);
            }
          });
        }
        setTariffs(COACH_TARIFF_TABLE);
        localStorage.setItem('cached_coach_tariffs', JSON.stringify(COACH_TARIFF_TABLE));
      } else {
        const sorted = [...dbTariffs].sort((a, b) => a.coachName.localeCompare(b.coachName));
        setTariffs(sorted);
        localStorage.setItem('cached_coach_tariffs', JSON.stringify(sorted));
      }
    }, (error) => {
      console.error("Firestore coachTariffs load error:", error);
      handleFirestoreError(error, OperationType.GET, 'coachTariffs', false);
    });

    return () => unsubTariffs();
  }, []);

  // 월 마감(정산 잠금) 상태 구독
  useEffect(() => {
    const unsub = onSnapshot(doc(db, 'settings', 'settlement_locks'), (snap) => {
      const data = snap.data() as { months?: string[] } | undefined;
      setLockedMonths(Array.isArray(data?.months) ? data!.months! : []);
    }, (error) => {
      console.error("Firestore settlement_locks load error in CoachFees:", error);
    });
    return () => unsub();
  }, []);

  // Autofill tier fee rates or tariff amount
  useEffect(() => {
    if (newFee.coachId) {
      const selected = coaches.find(c => c.id === newFee.coachId);
      if (selected) {
        const method = newFee.coachingMethod || '대면';
        const hours = newFee.coachingHours || 1;
        const salesAmt = newFee.salesAmount || 0;

        // 혼합: 대면/비대면 시간 × 각 요율 합산
        if (method === '혼합') {
          const { faceRate, onlineRate } = getMixedUnitRates(selected.name);
          const fh = newFee.faceHours || 0;
          const oh = newFee.onlineHours || 0;
          setNewFee(prev => ({
            ...prev,
            calculationType: 'tariff',
            feeRate: 0,
            calculatedFee: faceRate * fh + onlineRate * oh
          }));
          return;
        }

        const tariffMatch = tariffs.find(
          t => t.coachName === selected.name && t.method === method
        );

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
  }, [newFee.coachId, newFee.coachingMethod, newFee.coachingHours, newFee.salesAmount, newFee.faceHours, newFee.onlineHours, coaches, tariffs]);

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

  // 혼합 코칭 시간당 단가 조회 (대면/비대면 요율)
  const getMixedUnitRates = (coachName: string) => {
    const faceMatch = tariffs.find(t => t.coachName === coachName && t.method === '대면');
    const onlineMatch = tariffs.find(t => t.coachName === coachName && t.method === '비대면');
    return {
      faceRate: faceMatch?.feeAmount || 0,
      onlineRate: onlineMatch?.feeAmount || 0
    };
  };

  // Calculate coached fee based on criteria (tariff table or tier percentage)
  const calculateFeeForCoach = (coachName: string, salesAmount: number, coachingHours: number, coachingMethod: string = '대면', faceHours: number = 0, onlineHours: number = 0) => {
    const hours = coachingHours || 1;
    const salesAmt = salesAmount || 0;

    // 0. 혼합: 대면/비대면 시간을 각각의 요율로 합산 정산
    if (coachingMethod === '혼합') {
      const { faceRate, onlineRate } = getMixedUnitRates(coachName);
      const mixed = faceRate * (faceHours || 0) + onlineRate * (onlineHours || 0);
      if (mixed > 0) return mixed;
      // 요율이 없으면 아래 일반 로직으로 폴백
    }

    // 1. Try exact coachName and coachingMethod match
    let tariffMatch = tariffs.find(
      t => t.coachName === coachName && t.method === coachingMethod
    );

    // 2. If not found, try matching '통합'
    if (!tariffMatch && coachingMethod !== '통합') {
      tariffMatch = tariffs.find(
        t => t.coachName === coachName && t.method === '통합'
      );
    }

    // 3. If still not found, try any method match for this coach
    if (!tariffMatch) {
      tariffMatch = tariffs.find(
        t => t.coachName === coachName
      );
    }

    if (tariffMatch) {
      if (tariffMatch.feeAmount !== undefined) {
        return tariffMatch.feeAmount * hours;
      } else if (tariffMatch.feePercent !== undefined) {
        return Math.round(salesAmt * (tariffMatch.feePercent / 100));
      }
    }
    
    // Fallback based on coach tier from records
    const selectedCoach = coaches.find(c => c.name === coachName);
    if (selectedCoach) {
      let rate = 15;
      if (selectedCoach.tier === 'A') rate = 20;
      if (selectedCoach.tier === 'B') rate = 15;
      if (selectedCoach.tier === 'C') rate = 10;
      return Math.round(salesAmt * (rate / 100));
    }
    
    return Math.round(salesAmt * 0.15); // Fallback to 15%
  };

  // Derived coachFees from props.sales
  const coachFees: CoachFeeItem[] = React.useMemo(() => {
    return (props.sales || [])
      .filter(sale => sale.coachName && sale.coachName !== '없음' && sale.coachName !== '')
      .map(sale => {
        const matchingCoach = coaches.find(c => c.name === sale.coachName);
        const coachId = matchingCoach ? matchingCoach.id : 'c_fallback';
        
        // Smart fallback / inference for coachingMethod
        let method: '대면' | '비대면' | '통합' | '대입' | '혼합' = sale.coachingMethod || '대면';
        if (!sale.coachingMethod) {
          const svc = (sale.registeredService || '').toLowerCase();
          if (svc.includes('혼합')) {
            method = '혼합';
          } else if (svc.includes('비대면') || svc.includes('온라인') || svc.includes('online')) {
            method = '비대면';
          } else if (svc.includes('대입') || svc.includes('입시')) {
            method = '대입';
          } else if (svc.includes('통합') || svc.includes('종합')) {
            method = '통합';
          }
        }

        const faceHours = sale.faceHours || 0;
        const onlineHours = sale.onlineHours || 0;
        const totalHours = method === '혼합' ? (faceHours + onlineHours) : (sale.coachingHours || 1);

        const hasOverride = sale.coachFeeOverride !== undefined && sale.coachFeeOverride !== null;
        const calculated = hasOverride
          ? (sale.coachFeeOverride as number)
          : calculateFeeForCoach(
              sale.coachName || '없음',
              sale.amount || 0,
              totalHours,
              method,
              faceHours,
              onlineHours
            );

        return {
          id: sale.id,
          date: sale.registrationDate || (sale.date ? sale.date.replace(/\./g, '-').substring(0, 10).trim() : new Date().toISOString().split('T')[0]),
          coachId: coachId,
          coachName: sale.coachName || '임시코치',
          customerName: sale.customerName || '미지정 수강생',
          salesAmount: sale.amount || 0,
          feeRate: 15,
          calculatedFee: calculated,
          status: sale.status || 'pending',
          payoutDate: sale.status === 'completed' ? (sale.registrationDate || sale.date.substring(0, 10)) : undefined,
          salesId: sale.id,
          coachingHours: totalHours,
          coachingMethod: method,
          faceHours,
          onlineHours,
          coachFeeOverride: sale.coachFeeOverride,
          managerName: sale.managerName || ''
        };
      });
  }, [props.sales, coaches, tariffs]);

  // Calculations
  const grandTotalFees = coachFees.reduce((sum, f) => sum + f.calculatedFee, 0);
  const pendingFees = coachFees.filter(f => f.status === 'pending').reduce((sum, f) => sum + f.calculatedFee, 0);
  const completedFees = coachFees.filter(f => f.status === 'completed').reduce((sum, f) => sum + f.calculatedFee, 0);
  const holdFees = coachFees.filter(f => f.status === 'hold').reduce((sum, f) => sum + f.calculatedFee, 0);

  // Unique months from coachFees
  const uniqueMonths = React.useMemo(() => {
    const months = coachFees.map(f => f.date.substring(0, 7));
    return Array.from(new Set(months)).sort((a, b) => b.localeCompare(a));
  }, [coachFees]);

  // Filtered + sorted ledger rows (shared by the table, bulk actions and reports)
  const filteredLedgerFees = React.useMemo(() => {
    return coachFees.filter(fee => {
      const matchesSearch =
        fee.customerName.toLowerCase().includes(ledgerSearchQuery.toLowerCase()) ||
        fee.coachName.toLowerCase().includes(ledgerSearchQuery.toLowerCase()) ||
        (fee.managerName || '').toLowerCase().includes(ledgerSearchQuery.toLowerCase());

      const matchesCoach = ledgerCoachFilter === 'all' || fee.coachName === ledgerCoachFilter;
      const matchesStatus = ledgerStatusFilter === 'all' || fee.status === ledgerStatusFilter;
      const matchesManager = ledgerManagerFilter === 'all' || fee.managerName === ledgerManagerFilter;
      const matchesMonth = ledgerMonthFilter === 'all' || fee.date.startsWith(ledgerMonthFilter);

      return matchesSearch && matchesCoach && matchesStatus && matchesManager && matchesMonth;
    }).sort((a, b) => b.date.localeCompare(a.date)); // 최신 날짜가 위, 오래된 순으로 정렬
  }, [coachFees, ledgerSearchQuery, ledgerCoachFilter, ledgerStatusFilter, ledgerManagerFilter, ledgerMonthFilter]);

  // Whether the ledger is currently narrowed by any filter
  const isLedgerFiltered =
    ledgerSearchQuery.trim() !== '' ||
    ledgerCoachFilter !== 'all' ||
    ledgerStatusFilter !== 'all' ||
    ledgerManagerFilter !== 'all' ||
    ledgerMonthFilter !== 'all';

  const isMonthLocked = (dateStr: string) => lockedMonths.includes((dateStr || '').substring(0, 7));

  // 잠긴(마감된) 월의 데이터 수정을 차단
  const blockedByLock = (dateStr?: string): boolean => {
    if (dateStr && isMonthLocked(dateStr)) {
      alert(`${dateStr.substring(0, 7)}월은 정산 마감(잠금)되어 수정할 수 없습니다. 관리자에게 문의하세요.`);
      return true;
    }
    return false;
  };

  // 월 마감 잠금/해제 (관리자)
  const toggleMonthLock = async (month: string) => {
    if (!isAdmin) {
      alert('월 마감은 관리자만 설정할 수 있습니다.');
      return;
    }
    if (!month || month === 'all') {
      alert('먼저 월 필터에서 특정 월을 선택해 주세요.');
      return;
    }
    const currentlyLocked = lockedMonths.includes(month);
    const next = currentlyLocked ? lockedMonths.filter(m => m !== month) : [...lockedMonths, month];
    try {
      await setDoc(doc(db, 'settings', 'settlement_locks'), { months: next }, { merge: true });
      await writeAuditLog({
        action: currentlyLocked ? 'month_unlock' : 'month_lock',
        entity: 'settlement',
        entityId: month,
        actor: auditActor,
        details: { month }
      });
      showToast(`${month}월 정산이 ${currentlyLocked ? '마감 해제' : '마감(잠금)'}되었습니다.`);
    } catch (e) {
      console.error('month lock toggle failed:', e);
      alert('월 마감 설정 중 오류가 발생했습니다.');
    }
  };

  // Bulk mark a set of fee rows as 정산완료 (settled) — writes to the shared sales records (atomic batch)
  const handleBulkCompleteFees = async (items: CoachFeeItem[], label: string) => {
    const lockedCount = items.filter(i => i.status !== 'completed' && isMonthLocked(i.date)).length;
    const targets = items.filter(i => i.status !== 'completed' && !isMonthLocked(i.date));
    if (targets.length === 0) {
      showToast(lockedCount > 0 ? '대상이 마감(잠금)된 월이라 처리할 수 없습니다.' : '이미 모두 정산완료 상태이거나 대상이 없습니다.');
      return;
    }
    const lockNote = lockedCount > 0 ? ` (마감된 월 ${lockedCount}건 제외)` : '';
    if (!confirm(`${label} ${targets.length}건을 일괄 정산완료 처리하시겠습니까?${lockNote}`)) return;

    const ids = Array.from(new Set(targets.map(i => i.id)));
    try {
      if (props.setSales) {
        const idSet = new Set(ids);
        props.setSales(prev => prev.map(s => idSet.has(s.id) ? { ...s, status: 'completed', holdReason: '' } : s));
      } else {
        const batch = writeBatch(db);
        ids.forEach(id => batch.set(doc(db, 'sales', id), { status: 'completed', holdReason: '' }, { merge: true }));
        await batch.commit();
      }
      await writeAuditLog({
        action: 'bulk_settle',
        entity: 'coach_fee',
        actor: auditActor,
        details: { count: ids.length, scope: label, excludedLocked: lockedCount, saleIds: ids }
      });
      setSelectedFeeIds(new Set());
      showToast(`${targets.length}건이 일괄 정산완료 처리되었습니다.${lockNote}`);
    } catch (e) {
      console.error("Bulk complete failed:", e);
      alert('일괄 정산 처리 중 오류가 발생했습니다.');
    }
  };

  // Checkbox helpers
  const toggleFeeSelection = (id: string) => {
    setSelectedFeeIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const selectedFees = filteredLedgerFees.filter(f => selectedFeeIds.has(f.id));
  const allFilteredSelected = filteredLedgerFees.length > 0 && filteredLedgerFees.every(f => selectedFeeIds.has(f.id));

  const toggleSelectAllFiltered = () => {
    if (allFilteredSelected) {
      setSelectedFeeIds(new Set());
    } else {
      setSelectedFeeIds(new Set(filteredLedgerFees.map(f => f.id)));
    }
  };

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

    if (isQuotaExceeded()) {
      setCoaches(prev => {
        const next = [...prev, item];
        localStorage.setItem('cached_coaches', JSON.stringify(next));
        return next;
      });
      setIsCoachModalOpen(false);
      setNewCoach({ name: '', email: '', phone: '', specialty: '', tier: 'A', status: 'active' });
      showToast(`파트너 코치 ${item.name} 코치가 성공적으로 임명되었습니다 (로컬 저장).`);
      return;
    }

    try {
      await setDoc(doc(db, 'coaches', coachId), item);
      setIsCoachModalOpen(false);
      setNewCoach({ name: '', email: '', phone: '', specialty: '', tier: 'A', status: 'active' });
      showToast(`파트너 코치 ${item.name} 코치가 성공적으로 임명되었습니다.`);
    } catch (err: any) {
      console.error("Failed to create coach:", err);
      alert("코치 등록 도중 에러 발생: " + err.message);
    }
  };

  // Add coaching reward fee item (Directly registers corresponding sales entry)
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
    const method = (newFee.coachingMethod as any) || '대면';
    const isMixed = method === '혼합';
    const faceHours = Number(newFee.faceHours) || 0;
    const onlineHours = Number(newFee.onlineHours) || 0;
    const hours = isMixed ? (faceHours + onlineHours) : (Number(newFee.coachingHours) || 1);

    const calcFee = isTariff
      ? (Number(newFee.calculatedFee) || 0)
      : Math.round(salesAmt * (rate / 100));

    const saleId = `cf_sale_${Date.now()}`;
    const defaultManager = employees.find(emp => emp.role === '영업팀' && emp.status === 'active')?.name || '이지원';

    // Create corresponding sale entry
    const saleItem: Sale = {
      id: saleId,
      date: new Date().toISOString().split('T')[0] + ' 12:00',
      customerName: newFee.customerName,
      managerName: newFee.managerName || defaultManager,
      coachName: selected.name,
      coachingMethod: method,
      amount: salesAmt,
      feeRate: 10,
      fee: Math.round((salesAmt / 1.1) * 0.1),
      profit: salesAmt - Math.round((salesAmt / 1.1) * 0.1),
      status: (newFee.status as any) || 'pending',
      inquiryType: 'corporate',
      coachingHours: hours,
      coachFeeOverride: calcFee,
      registrationDate: new Date().toISOString().split('T')[0],
      registeredService: '1:1 매칭 전문가 코칭 패키지',
      notes: '코치 수수료 탭 수기 매칭 등록',
      ...(isMixed ? { faceHours, onlineHours } : {})
    };

    try {
      if (props.setSales) {
        props.setSales(prev => [...prev, saleItem]);
      } else {
        await setDoc(doc(db, 'sales', saleId), saleItem);
      }
      setIsFeeModalOpen(false);
      setNewFee({ coachId: '', customerName: '', salesAmount: 0, feeRate: 20, status: 'pending', coachingMethod: '대면', calculationType: 'tariff', coachingHours: 1, faceHours: 0, onlineHours: 0, salesId: undefined });
      showToast(`${selected.name} 코치 수당 (${formatKrw(calcFee)}) 및 매출 전표가 연동 계정으로 안전하게 등록되었습니다.`);
    } catch (err) {
      console.error("Failed to add coach fee as sale:", err);
      alert('오류 발생: ' + err);
    }
  };

  // Individual coach status updater (supports hold and reasons)
  const handleUpdateCoachFeeStatus = async (item: CoachFeeItem, nextStatus: 'pending' | 'completed' | 'hold') => {
    if (blockedByLock(item.date)) return;
    const saleId = item.id;
    let holdReason = item.holdReason || '';
    if (nextStatus === 'hold' && !holdReason) {
      const reason = prompt('정산 보류 사유를 입력해 주세요:') || '';
      holdReason = reason;
    }

    try {
      const updatedFields = {
        status: nextStatus,
        holdReason: nextStatus === 'hold' ? holdReason : ''
      };
      if (props.setSales) {
        props.setSales(prev => prev.map(s => s.id === saleId ? { ...s, ...updatedFields } : s));
      } else {
        await setDoc(doc(db, 'sales', saleId), updatedFields, { merge: true });
      }
      await writeAuditLog({
        action: 'settle_status',
        entity: 'coach_fee',
        entityId: saleId,
        actor: auditActor,
        details: { status: nextStatus, coach: item.coachName, customer: item.customerName, fee: item.calculatedFee }
      });
      showToast(`${item.coachName} 코치 정산 상태가 ${nextStatus === 'completed' ? '정산 완료' : nextStatus === 'hold' ? '정산 보류' : '정산 대기'} 상태로 갱신 완료되었습니다.`);
    } catch (e) {
      console.error(e);
    }
  };

  const handleUpdateCoachFeeField = async (item: CoachFeeItem, fieldName: string, value: any) => {
    if (blockedByLock(item.date)) return;
    const saleId = item.id;
    try {
      const updatedFields = {
        [fieldName]: value
      };
      if (props.setSales) {
        props.setSales(prev => prev.map(s => s.id === saleId ? { ...s, ...updatedFields } : s));
      } else {
        await setDoc(doc(db, 'sales', saleId), updatedFields, { merge: true });
      }
    } catch (err) {
      console.error("Error updating field:", err);
    }
  };

  // Status Change (Toggles status in the sales table)
  const handleToggleFeeStatus = async (item: CoachFeeItem) => {
    let nextStatus: 'pending' | 'completed' | 'hold' = 'pending';
    if (item.status === 'pending') nextStatus = 'completed';
    else if (item.status === 'completed') nextStatus = 'hold';
    else if (item.status === 'hold') nextStatus = 'pending';

    await handleUpdateCoachFeeStatus(item, nextStatus);
  };

  // Delete Fee Item (Deletes from sales database)
  const handleDeleteFee = async (id: string, name: string, date?: string) => {
    if (blockedByLock(date)) return;
    if (confirm(`선택한 코치 수수료 전산 기록 (${name})을 완전히 영구 삭제 처리하시겠습니까? (영업/수수료 정산 대장에서 담당코치를 '없음'으로 변경하는 형태로도 연동됩니다)`)) {
      try {
        if (id.startsWith('cf_sale_') || id.startsWith('manual_cf_')) {
          if (props.setSales) {
            props.setSales(prev => prev.filter(s => s.id !== id));
          } else {
            await deleteDoc(doc(db, 'sales', id));
          }
          showToast('코치수수료 탭에서 단독 등록된 정산 전표 및 매출 기록이 완전히 파기되었습니다.');
        } else {
          const updatedFields = {
            coachName: '없음',
            coachingHours: undefined
          };
          if (props.setSales) {
            props.setSales(prev => prev.map(s => s.id === id ? { ...s, ...updatedFields } : s));
          } else {
            await setDoc(doc(db, 'sales', id), updatedFields, { merge: true });
          }
          showToast('매출 정산 대장에서 해당 건의 담당코치 배정이 해제되었습니다.');
        }
        await writeAuditLog({
          action: 'delete',
          entity: 'coach_fee',
          entityId: id,
          actor: auditActor,
          details: { label: name, date }
        });
      } catch (err) {
        console.error("Error deleting coach fee sale:", err);
      }
    }
  };

  // Real PDF report generator for coach fees
  const handleDownloadReport = (coachName: string) => {
    const targetCoach = coachName === 'all' ? '전체_코치팀' : coachName;
    setDownloading(coachName);
    setTimeout(() => {
      setDownloading(null);
      
      const list = coachFees.filter(fee => {
        const matchesSearch = 
          fee.customerName.toLowerCase().includes(ledgerSearchQuery.toLowerCase()) ||
          fee.coachName.toLowerCase().includes(ledgerSearchQuery.toLowerCase()) ||
          (fee.managerName || '').toLowerCase().includes(ledgerSearchQuery.toLowerCase());
          
        const matchesCoach = ledgerCoachFilter === 'all' || fee.coachName === ledgerCoachFilter;
        const matchesStatus = ledgerStatusFilter === 'all' || fee.status === ledgerStatusFilter;
        const matchesManager = ledgerManagerFilter === 'all' || fee.managerName === ledgerManagerFilter;
        const matchesMonth = ledgerMonthFilter === 'all' || fee.date.startsWith(ledgerMonthFilter);

        return matchesSearch && matchesCoach && matchesStatus && matchesManager && matchesMonth;
      });

      const totalHours = list.reduce((sum, f) => sum + (Number(f.coachingHours) || 0), 0);
      const totalFee = list.reduce((sum, f) => sum + (f.calculatedFee || 0), 0);
      const totalSales = list.reduce((sum, f) => sum + (f.salesAmount || 0), 0);
      const itemsCount = list.length;
      const dateStr = new Date().toISOString().split('T')[0];

      const content = `================================================
[수수료 명세서] 코치 지도/자문료 지급 명세서
================================================
명세 정산자문일 : ${dateStr}
수신 협력코치   : ${targetCoach} 님 ${ledgerManagerFilter !== 'all' ? `(영업담당: ${ledgerManagerFilter} 필터)` : ''}
발행 정산 전산  : [주식회사 코칭에이전시 파트너협력 본부]
------------------------------------------------
[지도/자문료 정산 핵심 조서]
- 정산 대상 총 건수 : ${itemsCount} 건
- 담당 지도수업 총 시간 : ${totalHours} 시간
- 학생 결제 연동 매출액 : ${formatKrw(totalSales)}
- 자문 및 강사 수당 (세전): ${formatKrw(totalFee)}
- 세후 실수령 예상액 : 약 ${formatKrw(Math.round(totalFee * 0.967))} (원천징수 3.3% 공제 시)
------------------------------------------------
[코치별 정산 수급 상세 전표]
${list.map((f, i) => `${i+1}. [일시: ${f.date}] 수강생: ${f.customerName} | 수업유형: ${f.coachingMethod || '통합'} | 배정시간: ${f.coachingHours || 0}H | 수업료: ${formatKrw(f.calculatedFee)}`).join('\n')}
------------------------------------------------
위 자문수당 지급 명세 정보가 전산에 의거하여 정당함을 확인하며,
PDF 지급 내역 증빙 조서를 청구 발행합니다.
(본 문서는 전자 데이터 원장을 기초로 생성되었습니다.)
================================================`;

      const blob = new Blob([content], { type: 'application/pdf;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.setAttribute("href", url);
      link.setAttribute("download", `코치수수료_명세서_${targetCoach}_${dateStr}.pdf`);
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);

      showToast(`${targetCoach} 코치 님의 수수료 명세서(PDF)가 컴퓨터에 안전하게 전송되었습니다.`);
    }, 1500);
  };

  // Change individual cells of a row (Propagates back to shared sales database)
  const handleCellChange = async (fee: CoachFeeItem, field: keyof CoachFeeItem, value: any) => {
    if (blockedByLock(fee.date)) return;
    const saleId = fee.id;

    try {
      const existingSale = props.sales.find(s => s.id === saleId);
      if (!existingSale) return;
      
      let updatedFields: Partial<Sale> = {};
      
      if (field === 'coachName') {
        updatedFields.coachName = value;
        // Reset manual override to trigger recalculation of tariff
        updatedFields.coachFeeOverride = null;
      } else if (field === 'coachingMethod') {
        updatedFields.coachingMethod = value as any;
        // Reset manual override to trigger recalculation of tariff
        updatedFields.coachFeeOverride = null;
        // 혼합 전환 시 대면/비대면 시간 초기화 (기존값 없으면 총 시간을 대면으로 배정)
        if (value === '혼합') {
          const fh = existingSale.faceHours ?? existingSale.coachingHours ?? 1;
          const oh = existingSale.onlineHours ?? 0;
          updatedFields.faceHours = fh;
          updatedFields.onlineHours = oh;
          updatedFields.coachingHours = fh + oh;
        }
      } else if (field === 'faceHours' || field === 'onlineHours') {
        const fh = field === 'faceHours' ? (Number(value) || 0) : (existingSale.faceHours || 0);
        const oh = field === 'onlineHours' ? (Number(value) || 0) : (existingSale.onlineHours || 0);
        updatedFields.faceHours = fh;
        updatedFields.onlineHours = oh;
        updatedFields.coachingHours = fh + oh;
        // Reset manual override to trigger recalculation of tariff
        updatedFields.coachFeeOverride = null;
      } else if (field === 'customerName') {
        updatedFields.customerName = value;
      } else if (field === 'date') {
        updatedFields.registrationDate = value;
        updatedFields.date = value + ' 12:00';
      } else if (field === 'managerName') {
        updatedFields.managerName = value;
      } else if (field === 'coachingHours') {
        updatedFields.coachingHours = Number(value) || 1;
        // Reset manual override to trigger recalculation of tariff
        updatedFields.coachFeeOverride = null;
      } else if (field === 'calculatedFee') {
        updatedFields.coachFeeOverride = Number(value);
      } else if (field === 'salesAmount') {
        const amt = Number(value) || 0;
        updatedFields.amount = amt;
        
        // Recalculate salesperson fee if it's there
        const inquiryType = existingSale.inquiryType || 'corporate';
        const rate = inquiryType === 'corporate' ? 10 : 20;
        const baseAmount = amt / 1.1;
        const computedFee = Math.round(baseAmount * (rate / 100));
        updatedFields.fee = computedFee;
        updatedFields.profit = amt - computedFee;
      } else if (field === 'status') {
        updatedFields.status = value as 'pending' | 'completed';
      }
      
      if (Object.keys(updatedFields).length > 0) {
        if (props.setSales) {
          props.setSales(prev => prev.map(s => s.id === saleId ? { ...s, ...updatedFields } : s));
        } else {
          await setDoc(doc(db, 'sales', saleId), updatedFields, { merge: true });
        }
        showToast('스프레드시트 편집 값이 전체 전산에 일방 동기화 및 갱신되었습니다.');
      }
    } catch (e) {
      console.error("Failed to update cell:", e);
    }
  };

  // Create a new direct row in our interactive spreadsheet
  const handleAddNewRow = async () => {
    const saleId = `cf_sale_${Date.now()}`;
    const defaultCoach = coaches[0]?.name || '강경원';
    const defaultManager = employees.find(e => e.role === '영업팀' && e.status === 'active')?.name || '이지원';
    const defaultDate = new Date().toISOString().split('T')[0];
    
    const newSale: Sale = {
      id: saleId,
      date: defaultDate + ' 12:00',
      customerName: '신규 수강생',
      managerName: defaultManager,
      coachName: defaultCoach,
      coachingMethod: '대면',
      amount: 1100000,
      feeRate: 10,
      fee: 100000,
      profit: 1000000,
      status: 'pending',
      inquiryType: 'corporate',
      coachingHours: 1,
      registrationDate: defaultDate,
      registeredService: '1:1 전문가 코칭 매칭',
      notes: '코치 수수료 탭 수기 행 추가'
    };
    
    if (props.setSales) {
      props.setSales(prev => [...prev, newSale]);
    } else {
      await setDoc(doc(db, 'sales', saleId), newSale);
    }
    showToast('새로운 코칭 정산 및 대응 매출 전표가 스프레드시트에 연동 추가되었습니다.');
  };

  // Download entire Coach Fees ledger into Excel spreadsheet format
  const handleDownloadExcel = () => {
    const headers = ['담당코치', '코칭방식', '수강생명', '등록일', '영업담당', '코칭시간', '코칭수수료', '매출액', '정산상태'];
    
    const rows = coachFees.map(f => {
      const manager = f.managerName || '배정 대기';
      const statusStr = f.status === 'completed' ? '정산완료' : '정산대기';
      return [
        `"${f.coachName.replace(/"/g, '""')}"`,
        `"${(f.coachingMethod || '대면').replace(/"/g, '""')}"`,
        `"${f.customerName.replace(/"/g, '""')}"`,
        f.date,
        `"${manager.replace(/"/g, '""')}"`,
        f.coachingHours || 1,
        f.calculatedFee,
        f.salesAmount,
        statusStr
      ];
    });

    const csvContent = "\uFEFF" + [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute("href", url);
    link.setAttribute("download", `코치_지도_수수료_스프레드시트_${new Date().toISOString().split('T')[0]}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    showToast('코칭 정산 스프레드시트가 Excel(.csv) 파일로 완료되었습니다.');
  };

  // Persist a single tariff row to Firestore (omitting empty numeric/text fields)
  const writeTariff = async (t: CoachTariff) => {
    if (isQuotaExceeded()) return; // local cache already updated
    const clean: any = { id: t.id, coachName: t.coachName, method: t.method };
    if (t.feeAmount !== undefined && !Number.isNaN(t.feeAmount)) clean.feeAmount = t.feeAmount;
    if (t.feePercent !== undefined && !Number.isNaN(t.feePercent)) clean.feePercent = t.feePercent;
    if (t.realName) clean.realName = t.realName;
    if (t.notes) clean.notes = t.notes;
    try {
      await setDoc(doc(db, 'coachTariffs', t.id), clean);
    } catch (e) {
      console.error("Failed to save tariff:", t.id, e);
    }
  };

  // Optimistic local edit of a tariff cell (admin only)
  const handleTariffChange = (id: string, field: keyof CoachTariff, value: any) => {
    setTariffs(prev => {
      const next = prev.map(t => {
        if (t.id !== id) return t;
        const updated: CoachTariff = { ...t };
        if (field === 'feeAmount' || field === 'feePercent') {
          (updated as any)[field] = value === '' || value === null ? undefined : Number(value);
        } else {
          (updated as any)[field] = value;
        }
        return updated;
      });
      localStorage.setItem('cached_coach_tariffs', JSON.stringify(next));
      return next;
    });
  };

  // Commit the latest state of a tariff row to Firestore
  const persistTariff = (id: string) => {
    setTariffs(prev => {
      const t = prev.find(x => x.id === id);
      if (t) void writeTariff(t);
      return prev;
    });
  };

  const handleAddTariffRow = async () => {
    const id = `ct_${Date.now()}`;
    const item: CoachTariff = { id, coachName: '신규 코치', method: '통합', feeAmount: 50000 };
    setTariffs(prev => {
      const next = [...prev, item];
      localStorage.setItem('cached_coach_tariffs', JSON.stringify(next));
      return next;
    });
    if (!isQuotaExceeded()) {
      try {
        await setDoc(doc(db, 'coachTariffs', id), item);
      } catch (e) {
        console.error("Failed to add tariff row:", e);
      }
    }
    showToast('신규 요율 항목이 추가되었습니다. 코치명과 수수료를 수정해주세요.');
  };

  const handleDeleteTariff = async (id: string, name: string) => {
    if (!confirm(`요율표에서 '${name}' 항목을 삭제하시겠습니까?`)) return;
    setTariffs(prev => {
      const next = prev.filter(t => t.id !== id);
      localStorage.setItem('cached_coach_tariffs', JSON.stringify(next));
      return next;
    });
    if (!isQuotaExceeded()) {
      try {
        await deleteDoc(doc(db, 'coachTariffs', id));
      } catch (e) {
        console.error("Failed to delete tariff:", e);
      }
    }
    showToast('요율 항목이 삭제되었습니다.');
  };

  // Filtered tariff table
  const filteredTariff = tariffs.filter((item) => {
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
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6" id="coach_kpis">
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
              <div className="h-12 w-12 rounded-xl bg-rose-50 text-rose-600 flex items-center justify-center shrink-0">
                <AlertCircle className="h-6 w-6" />
              </div>
              <div>
                <span className="text-xs font-semibold text-slate-400 block uppercase tracking-wider">보류 중 코치 수수료</span>
                <strong className="text-xl font-bold font-mono text-rose-600 block mt-0.5">{formatKrw(holdFees)}</strong>
                <span className="text-[10px] text-slate-400 block mt-1">보류 사유가 기입된 수수료</span>
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

          {/* Spreadsheet Filter Toolbar */}
          <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-xs space-y-4">
            <div className="flex flex-col lg:flex-row items-stretch lg:items-center justify-between gap-4">
              <div className="flex flex-wrap items-center gap-3">
                {/* Search query */}
                <div className="relative min-w-[200px]">
                  <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
                  <input
                    type="text"
                    value={ledgerSearchQuery}
                    onChange={(e) => setLedgerSearchQuery(e.target.value)}
                    placeholder="수강생명, 코치명, 영업담당 검색..."
                    className="pl-9 pr-4 py-2 text-sm border border-slate-200 rounded-xl w-60 focus:outline-none focus:ring-1 focus:ring-emerald-500 font-sans font-medium"
                  />
                </div>

                {/* Coach Filter */}
                <select
                  value={ledgerCoachFilter}
                  onChange={(e) => setLedgerCoachFilter(e.target.value)}
                  className="px-3 py-2 text-sm border border-slate-200 rounded-xl bg-white focus:outline-none focus:ring-1 focus:ring-emerald-500 font-semibold text-slate-705"
                >
                  <option value="all">전체 담당코치</option>
                  {Array.from(new Set(coachFees.map(f => f.coachName))).sort().map(name => (
                    <option key={name} value={name}>{name}</option>
                  ))}
                </select>

                {/* Manager Filter */}
                <select
                  value={ledgerManagerFilter}
                  onChange={(e) => setLedgerManagerFilter(e.target.value)}
                  className="px-3 py-2 text-sm border border-slate-200 rounded-xl bg-white focus:outline-none focus:ring-1 focus:ring-emerald-500 font-semibold text-slate-705"
                >
                  <option value="all">전체 영업담당</option>
                  {Array.from(new Set(coachFees.map(f => f.managerName || '').filter(Boolean))).sort().map(name => (
                    <option key={name} value={name}>{name}</option>
                  ))}
                </select>

                {/* Status Filter */}
                <select
                  value={ledgerStatusFilter}
                  onChange={(e) => setLedgerStatusFilter(e.target.value)}
                  className="px-3 py-2 text-sm border border-slate-200 rounded-xl bg-white focus:outline-none focus:ring-1 focus:ring-emerald-500 font-semibold text-slate-705"
                >
                  <option value="all">전체 정산상태</option>
                  <option value="pending">정산 대기</option>
                  <option value="completed">정산 완료</option>
                  <option value="hold">정산 보류</option>
                </select>

                {/* Month Filter */}
                <select
                  value={ledgerMonthFilter}
                  onChange={(e) => setLedgerMonthFilter(e.target.value)}
                  className="px-3 py-2 text-sm border border-slate-200 rounded-xl bg-white focus:outline-none focus:ring-1 focus:ring-emerald-500 font-semibold text-slate-705"
                  id="ledger_month_filter"
                >
                  <option value="all">전체 월필터</option>
                  {uniqueMonths.map(m => (
                    <option key={m} value={m}>{m.replace('-', '년 ')}월{lockedMonths.includes(m) ? ' 🔒' : ''}</option>
                  ))}
                </select>

                {/* 월 마감(잠금) 토글 - 특정 월 선택 시 */}
                {ledgerMonthFilter !== 'all' && (
                  isAdmin ? (
                    <button
                      type="button"
                      onClick={() => toggleMonthLock(ledgerMonthFilter)}
                      className={`flex items-center space-x-1.5 px-3 py-2 text-xs font-bold rounded-xl border transition cursor-pointer ${
                        lockedMonths.includes(ledgerMonthFilter)
                          ? 'bg-rose-50 text-rose-700 border-rose-200 hover:bg-rose-100'
                          : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'
                      }`}
                      title="이 월의 정산을 마감/해제합니다 (관리자)"
                    >
                      {lockedMonths.includes(ledgerMonthFilter) ? <Lock className="h-3.5 w-3.5" /> : <Unlock className="h-3.5 w-3.5" />}
                      <span>{lockedMonths.includes(ledgerMonthFilter) ? '마감 해제' : '월 마감'}</span>
                    </button>
                  ) : lockedMonths.includes(ledgerMonthFilter) ? (
                    <span className="flex items-center space-x-1.5 px-3 py-2 text-xs font-bold rounded-xl bg-rose-50 text-rose-700 border border-rose-200">
                      <Lock className="h-3.5 w-3.5" />
                      <span>마감됨</span>
                    </span>
                  ) : null
                )}
              </div>

              {/* Action Buttons */}
              <div className="flex items-center flex-wrap gap-2.5">
                <button
                  type="button"
                  onClick={() => handleBulkCompleteFees(selectedFees, '선택한')}
                  disabled={selectedFees.length === 0}
                  className="flex items-center justify-center space-x-2 bg-emerald-500 hover:bg-emerald-600 text-white font-bold py-2.5 px-4 rounded-xl text-xs transition duration-75 shadow-xs cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  <CheckCircle className="h-4 w-4" />
                  <span>선택 정산완료{selectedFees.length > 0 ? ` (${selectedFees.length})` : ''}</span>
                </button>

                <button
                  type="button"
                  onClick={() => handleBulkCompleteFees(filteredLedgerFees, isLedgerFiltered ? '필터된' : '전체')}
                  disabled={filteredLedgerFees.length === 0}
                  className="flex items-center justify-center space-x-2 bg-teal-600 hover:bg-teal-700 text-white font-bold py-2.5 px-4 rounded-xl text-xs transition duration-75 shadow-xs cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  <CheckCircle className="h-4 w-4" />
                  <span>{isLedgerFiltered ? '필터' : '전체'} 일괄 정산완료 ({filteredLedgerFees.length})</span>
                </button>

                <button
                  type="button"
                  onClick={handleAddNewRow}
                  className="flex items-center justify-center space-x-2 bg-slate-900 hover:bg-slate-800 text-white font-bold py-2.5 px-4 rounded-xl text-xs transition duration-75 shadow-xs cursor-pointer"
                >
                  <Plus className="h-4 w-4" />
                  <span>수수료 행 추가 (+Row)</span>
                </button>

                <button
                  type="button"
                  onClick={handleDownloadExcel}
                  className="flex items-center justify-center space-x-2 bg-emerald-600 hover:bg-emerald-700 text-white font-bold py-2.5 px-4 rounded-xl text-xs transition duration-75 shadow-lg shadow-emerald-500/10 cursor-pointer"
                >
                  <Download className="h-4 w-4" />
                  <span>Excel 다운로드</span>
                </button>

                <button
                  type="button"
                  onClick={() => handleDownloadReport(ledgerCoachFilter)}
                  disabled={downloading !== null}
                  className="flex items-center justify-center space-x-2 bg-rose-600 hover:bg-rose-700 text-white font-bold py-2.5 px-4 rounded-xl text-xs transition duration-75 shadow-lg shadow-rose-500/10 cursor-pointer disabled:opacity-50"
                >
                  {downloading === ledgerCoachFilter ? (
                    <>
                      <svg className="animate-spin h-3.5 w-3.5 text-white" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                      </svg>
                      <span>PDF 생성 중...</span>
                    </>
                  ) : (
                    <>
                      <FileText className="h-4 w-4" />
                      <span>{ledgerCoachFilter === 'all' ? '전체' : ledgerCoachFilter} PDF 명세서</span>
                    </>
                  )}
                </button>
              </div>
            </div>

            {/* Excel-like Interactive Spreadsheet Grid */}
            <div className="border border-slate-200 rounded-2xl overflow-hidden bg-slate-50 relative shadow-xs">
              <div className="overflow-x-auto max-h-[600px]">
                <table className="w-full text-left border-collapse bg-white text-sm">
                  <thead>
                    <tr className="bg-slate-100 text-slate-600 border-b border-slate-200 text-xs font-bold uppercase tracking-wider sticky top-0 z-10">
                      <th className="p-3 border-r border-slate-200 text-center w-10">
                        <input
                          type="checkbox"
                          checked={allFilteredSelected}
                          onChange={toggleSelectAllFiltered}
                          className="h-3.5 w-3.5 accent-emerald-600 cursor-pointer align-middle"
                          title="필터된 전체 선택/해제"
                        />
                      </th>
                      <th className="p-3 border-r border-slate-200 min-w-[130px]">담당코치</th>
                      <th className="p-3 border-r border-slate-200 min-w-[110px]">코칭방식</th>
                      <th className="p-3 border-r border-slate-200 min-w-[140px]">수강생명</th>
                      <th className="p-3 border-r border-slate-200 min-w-[140px] text-center">등록일</th>
                      <th className="p-3 border-r border-slate-200 min-w-[130px]">영업담당</th>
                      <th className="p-3 border-r border-slate-200 min-w-[120px] text-center">코칭시간</th>
                      <th className="p-3 border-r border-slate-200 min-w-[155px] text-right">코칭수수료</th>
                      <th className="p-3 border-r border-slate-200 min-w-[165px] text-right">매출액</th>
                      <th className="p-3 border-r border-slate-200 min-w-[110px] text-center">정산상태</th>
                      <th className="p-3 text-center min-w-[50px]">삭제</th>
                    </tr>
                  </thead>
                  <tbody>
                    {/* Computed helper array for the spreadsheet view */}
                    {(() => {
                      const list = filteredLedgerFees;

                      if (list.length === 0) {
                        return (
                          <tr>
                            <td colSpan={11} className="p-20 text-center text-slate-400 font-sans">
                              <Award className="h-10 w-10 text-slate-300 mx-auto mb-3" />
                              스프레드시트에 일치하는 수수료 정산 데이터가 없습니다.
                            </td>
                          </tr>
                        );
                      }

                      // Dynamic summation
                      const sumSales = list.reduce((s, f) => s + (f.salesAmount || 0), 0);
                      const sumFees = list.reduce((s, f) => s + (f.calculatedFee || 0), 0);
                      const sumHours = list.reduce((s, f) => s + (f.coachingHours || 0), 0);

                      return (
                        <>
                          {list.map((fee) => (
                            <tr key={fee.id} className={`hover:bg-slate-50/50 border-b border-slate-200 duration-75 ${selectedFeeIds.has(fee.id) ? 'bg-emerald-50/40' : ''}`}>
                              {/* 0. 선택 체크박스 */}
                              <td className="p-1 border-r border-slate-200 bg-white text-center">
                                <input
                                  type="checkbox"
                                  checked={selectedFeeIds.has(fee.id)}
                                  onChange={() => toggleFeeSelection(fee.id)}
                                  className="h-3.5 w-3.5 accent-emerald-600 cursor-pointer align-middle"
                                />
                              </td>
                              {/* 1. 담당코치 */}
                              <td className="p-1 border-r border-slate-200 bg-white">
                                <select
                                  value={fee.coachName}
                                  onChange={(e) => handleCellChange(fee, 'coachName', e.target.value)}
                                  className="w-full bg-transparent p-1.5 focus:bg-white focus:outline-none focus:ring-1 focus:ring-emerald-500 rounded font-bold text-slate-800 text-xs"
                                >
                                  {Array.from(new Set(tariffs.map(t => t.coachName))).sort().map(name => (
                                    <option key={name} value={name}>{name}</option>
                                  ))}
                                </select>
                              </td>

                              {/* 1.5 코칭방식 (대면/비대면/통합/대입) */}
                              <td className="p-1 border-r border-slate-200 bg-white">
                                <select
                                  value={fee.coachingMethod || '대면'}
                                  onChange={(e) => handleCellChange(fee, 'coachingMethod', e.target.value)}
                                  className="w-full bg-transparent p-1.5 focus:bg-white focus:outline-none focus:ring-1 focus:ring-emerald-500 rounded font-bold text-slate-800 text-xs"
                                >
                                  <option value="대면">대면</option>
                                  <option value="비대면">비대면</option>
                                  <option value="혼합">혼합</option>
                                  <option value="통합">통합</option>
                                  <option value="대입">대입</option>
                                </select>
                              </td>

                              {/* 2. 수강생명 */}
                              <td className="p-1 border-r border-slate-200 bg-white">
                                <input
                                  type="text"
                                  key={`${fee.id}_student_${fee.customerName}`}
                                  defaultValue={fee.customerName}
                                  onBlur={(e) => handleCellChange(fee, 'customerName', e.target.value)}
                                  className="w-full bg-transparent p-1.5 focus:bg-white focus:outline-none focus:ring-1 focus:ring-emerald-500 rounded font-semibold text-slate-800 text-xs"
                                  placeholder="수강생명 입력"
                                />
                              </td>

                              {/* 3. 등록일 */}
                              <td className="p-1 border-r border-slate-200 text-center bg-white">
                                <input
                                  type="date"
                                  value={fee.date}
                                  onChange={(e) => handleCellChange(fee, 'date', e.target.value)}
                                  className="w-full bg-transparent p-1 text-center font-mono focus:bg-white focus:outline-none focus:ring-1 focus:ring-emerald-500 rounded text-slate-700 text-xs font-semibold"
                                />
                              </td>

                              {/* 4. 영업담당 */}
                              <td className="p-1 border-r border-slate-200 bg-white">
                                <select
                                  value={fee.managerName || ''}
                                  onChange={(e) => handleCellChange(fee, 'managerName', e.target.value)}
                                  className="w-full bg-transparent p-1.5 font-semibold focus:bg-white focus:outline-none focus:ring-1 focus:ring-emerald-500 rounded text-slate-800 text-xs"
                                >
                                  <option value="">배정 대기 (None)</option>
                                  {employees
                                    .filter(e => e.role === '영업팀')
                                    .sort((a, b) => a.name.localeCompare(b.name))
                                    .map(e => (
                                      <option key={e.id || e.name} value={e.name}>{e.name}</option>
                                    ))
                                  }
                                </select>
                              </td>

                              {/* 5. 코칭시간 (혼합 시 대면/비대면 분리 입력) */}
                              <td className="p-1 border-r border-slate-200 text-center bg-white">
                                {fee.coachingMethod === '혼합' ? (
                                  <div className="flex flex-col space-y-1">
                                    <div className="flex items-center space-x-1">
                                      <span className="text-[9px] font-bold text-emerald-600 shrink-0 w-8 text-left">대면</span>
                                      <input
                                        type="number"
                                        min={0}
                                        key={`${fee.id}_fh_${fee.faceHours}`}
                                        defaultValue={fee.faceHours || 0}
                                        onBlur={(e) => handleCellChange(fee, 'faceHours', Number(e.target.value))}
                                        className="w-full bg-transparent p-1 text-center font-mono focus:bg-white focus:outline-none focus:ring-1 focus:ring-emerald-500 rounded font-bold text-slate-805 text-xs"
                                      />
                                    </div>
                                    <div className="flex items-center space-x-1">
                                      <span className="text-[9px] font-bold text-amber-600 shrink-0 w-8 text-left">비대면</span>
                                      <input
                                        type="number"
                                        min={0}
                                        key={`${fee.id}_oh_${fee.onlineHours}`}
                                        defaultValue={fee.onlineHours || 0}
                                        onBlur={(e) => handleCellChange(fee, 'onlineHours', Number(e.target.value))}
                                        className="w-full bg-transparent p-1 text-center font-mono focus:bg-white focus:outline-none focus:ring-1 focus:ring-amber-500 rounded font-bold text-slate-805 text-xs"
                                      />
                                    </div>
                                    <div className="text-[9px] text-slate-400 font-semibold text-center border-t border-slate-100 pt-0.5">
                                      계 {(fee.faceHours || 0) + (fee.onlineHours || 0)}시간
                                    </div>
                                  </div>
                                ) : (
                                  <input
                                    type="number"
                                    min={1}
                                    key={`${fee.id}_hours_${fee.coachingHours}`}
                                    defaultValue={fee.coachingHours || 1}
                                    onBlur={(e) => handleCellChange(fee, 'coachingHours', Number(e.target.value))}
                                    className="w-full bg-transparent p-1 text-center font-mono focus:bg-white focus:outline-none focus:ring-1 focus:ring-emerald-500 rounded font-bold text-slate-805 text-xs"
                                  />
                                )}
                              </td>

                              {/* 6. 코칭수수료 (Calculated automatically, editable manually) */}
                              <td className="p-1 border-r border-slate-200 bg-white">
                                <div className="flex flex-col items-stretch justify-center px-1">
                                  <div className="flex items-center space-x-1 justify-end">
                                    <input
                                      type="number"
                                      key={`${fee.id}_calcfee_${fee.calculatedFee}`}
                                      defaultValue={fee.calculatedFee || 0}
                                      onBlur={(e) => handleCellChange(fee, 'calculatedFee', Number(e.target.value))}
                                      className="text-right w-full bg-transparent p-1 font-mono font-bold text-emerald-600 focus:bg-white focus:outline-none focus:ring-1 focus:ring-emerald-500 rounded text-xs"
                                    />
                                    <span className="text-[10px] text-slate-400 shrink-0 select-none font-sans font-medium">원</span>
                                  </div>
                                  {/* 시간당 단가 정보 표시 */}
                                  {(() => {
                                    if (fee.coachingMethod === '혼합') {
                                      const { faceRate, onlineRate } = getMixedUnitRates(fee.coachName);
                                      return (
                                        <div className="text-[9px] text-slate-400 font-medium text-right pr-4 mt-0.5">
                                          (대면 {formatKrw(faceRate)} / 비대면 {formatKrw(onlineRate)})
                                        </div>
                                      );
                                    }
                                    const match = tariffs.find(
                                      t => t.coachName === fee.coachName && t.method === (fee.coachingMethod || '대면')
                                    );
                                    if (match?.feeAmount) {
                                      return (
                                        <div className="text-[9px] text-slate-400 font-medium text-right pr-4 mt-0.5">
                                          (시간당 {formatKrw(match.feeAmount)})
                                        </div>
                                      );
                                    } else if (match?.feePercent) {
                                      return (
                                        <div className="text-[9px] text-slate-400 font-medium text-right pr-4 mt-0.5">
                                          ({match.feePercent}% 요율 정산)
                                        </div>
                                      );
                                    }
                                    return (
                                      <div className="text-[9px] text-slate-400 font-medium text-right pr-4 mt-0.5">
                                        (등급별 비율 정산)
                                      </div>
                                    );
                                  })()}
                                </div>
                              </td>

                              {/* 7. 매출액 */}
                              <td className="p-1 border-r border-slate-200 bg-white">
                                <div className="flex items-center space-x-1 justify-end">
                                  <input
                                    type="number"
                                    key={`${fee.id}_salesamt_${fee.salesAmount}`}
                                    defaultValue={fee.salesAmount || 0}
                                    onBlur={(e) => handleCellChange(fee, 'salesAmount', Number(e.target.value))}
                                    className="text-right w-28 bg-transparent p-1 font-mono focus:bg-white focus:outline-none focus:ring-1 focus:ring-emerald-500 rounded font-bold text-slate-800 text-xs"
                                  />
                                  <span className="text-[10px] text-slate-400 shrink-0 select-none">원</span>
                                </div>
                              </td>

                              {/* 정산상태 */}
                              <td className="p-1 border-r border-slate-200 text-center bg-white whitespace-nowrap min-w-[130px]">
                                <select
                                  value={fee.status || 'pending'}
                                  onChange={(e) => handleUpdateCoachFeeStatus(fee, e.target.value as any)}
                                  className={`px-2.5 py-1 text-[11px] font-bold rounded-lg border cursor-pointer bg-white transition-all text-center focus:outline-none ${
                                    fee.status === 'completed'
                                      ? 'text-emerald-700 border-emerald-250 bg-emerald-50 hover:bg-emerald-100'
                                      : fee.status === 'hold'
                                      ? 'text-rose-700 border-rose-250 bg-rose-50 hover:bg-rose-100 font-extrabold'
                                      : 'text-amber-700 border-amber-250 bg-amber-50 hover:bg-amber-100'
                                  }`}
                                >
                                  <option value="pending">🟡 정산대기</option>
                                  <option value="completed">🟢 정산완료</option>
                                  <option value="hold">🔴 정산보류</option>
                                </select>
                                {fee.status === 'hold' && (
                                  <div className="mt-1 flex justify-center px-1">
                                    <input
                                      type="text"
                                      placeholder="보류 사유 입력"
                                      value={fee.holdReason || ''}
                                      onChange={(e) => handleUpdateCoachFeeField(fee, 'holdReason', e.target.value)}
                                      className="w-28 text-[10px] p-1 border border-rose-200 bg-rose-50/20 text-rose-850 placeholder-rose-350 rounded focus:outline-none text-center"
                                    />
                                  </div>
                                )}
                              </td>

                              {/* 삭제 */}
                              <td className="p-1 text-center bg-white">
                                <button
                                  type="button"
                                  onClick={() => handleDeleteFee(fee.id, `${fee.coachName} - ${fee.customerName}`, fee.date)}
                                  className="text-slate-300 hover:text-rose-500 duration-70 p-1 rounded hover:bg-rose-50 cursor-pointer"
                                >
                                  <Trash2 className="w-4 h-4 mx-auto" />
                                </button>
                              </td>
                            </tr>
                          ))}

                          {/* Excel-style calculations Summary Footer Row */}
                          <tr className="bg-emerald-50/50 border-t-2 border-emerald-500 font-bold block-table-row text-slate-900 text-xs">
                            <td className="p-3 border-r border-slate-200 text-center text-slate-400">-</td>
                            <td className="p-3 border-r border-slate-200 text-center text-emerald-800 font-bold">계 (Total Sum)</td>
                            <td className="p-3 border-r border-slate-200 text-slate-400 text-center">-</td>
                            <td className="p-3 border-r border-slate-200 text-slate-400 text-center">-</td>
                            <td className="p-3 border-r border-slate-200 text-slate-400 text-center">-</td>
                            <td className="p-3 border-r border-slate-200 text-slate-400 text-center">-</td>
                            <td className="p-3 border-r border-slate-200 text-center font-mono text-slate-805">{sumHours}시간</td>
                            <td className="p-3 border-r border-slate-200 text-right font-mono text-emerald-700">{formatKrw(sumFees)}</td>
                            <td className="p-3 border-r border-slate-200 text-right font-mono text-slate-900">{formatKrw(sumSales)}</td>
                            <td className="p-3 border-r border-slate-200 text-slate-404 text-center">-</td>
                            <td className="p-3 text-slate-404 text-center">-</td>
                          </tr>
                        </>
                      );
                    })()}
                  </tbody>
                </table>
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
                <p className="text-xs text-slate-405 mt-0.5 font-sans">
                  매칭 등록 단가와 원천 징수 정산을 제어하는 코칭 방식별 공식 전산 분류 기준표
                  {isAdmin
                    ? ' — 관리자 권한으로 요율을 직접 수정·추가·삭제할 수 있습니다.'
                    : ' (조회 전용 · 수정은 관리자만 가능)'}
                </p>
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
                {isAdmin && (
                  <button
                    type="button"
                    onClick={handleAddTariffRow}
                    className="flex items-center justify-center space-x-1.5 bg-slate-900 hover:bg-slate-800 text-white font-bold py-2 px-3.5 rounded-xl text-xs transition-all cursor-pointer shadow-xs shrink-0"
                  >
                    <Plus className="h-4 w-4" />
                    <span>요율 항목 추가</span>
                  </button>
                )}
              </div>
            </div>

            <div className="overflow-x-auto border border-slate-200 rounded-2xl">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-200 text-slate-500 font-bold font-sans">
                    <th className="p-3 border-r border-slate-200">코치명</th>
                    <th className="p-3 border-r border-slate-200 text-center">코칭방식</th>
                    <th className="p-3 border-r border-slate-200 text-right">수수료(원)</th>
                    <th className="p-3 border-r border-slate-200 text-right font-sans">수수료(%)</th>
                    <th className="p-3 border-r border-slate-200 text-center">본명</th>
                    <th className={isAdmin ? 'p-3 border-r border-slate-200' : 'p-3'}>비고</th>
                    {isAdmin && <th className="p-3 text-center min-w-[50px]">삭제</th>}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 font-sans">
                  {filteredTariff.length > 0 ? (
                    filteredTariff.map((item) => (
                      isAdmin ? (
                        <tr key={item.id} className="hover:bg-slate-50/70 transition-colors duration-75">
                          {/* 코치명 */}
                          <td className="p-1 border-r border-slate-200">
                            <input
                              type="text"
                              value={item.coachName}
                              onChange={(e) => handleTariffChange(item.id, 'coachName', e.target.value)}
                              onBlur={() => persistTariff(item.id)}
                              className="w-full bg-transparent p-1.5 font-black text-slate-900 text-sm focus:bg-white focus:outline-none focus:ring-1 focus:ring-emerald-500 rounded"
                            />
                          </td>
                          {/* 코칭방식 */}
                          <td className="p-1 border-r border-slate-200 text-center">
                            <select
                              value={item.method}
                              onChange={(e) => { handleTariffChange(item.id, 'method', e.target.value); persistTariff(item.id); }}
                              className="w-full bg-transparent p-1.5 font-bold text-slate-800 text-xs focus:bg-white focus:outline-none focus:ring-1 focus:ring-emerald-500 rounded"
                            >
                              <option value="통합">통합</option>
                              <option value="대면">대면</option>
                              <option value="비대면">비대면</option>
                              <option value="대입">대입</option>
                            </select>
                          </td>
                          {/* 수수료(원) */}
                          <td className="p-1 border-r border-slate-200">
                            <input
                              type="number"
                              value={item.feeAmount ?? ''}
                              onChange={(e) => handleTariffChange(item.id, 'feeAmount', e.target.value)}
                              onBlur={() => persistTariff(item.id)}
                              placeholder="-"
                              className="w-full text-right bg-transparent p-1.5 font-mono font-bold text-slate-700 text-sm focus:bg-white focus:outline-none focus:ring-1 focus:ring-emerald-500 rounded"
                            />
                          </td>
                          {/* 수수료(%) */}
                          <td className="p-1 border-r border-slate-200">
                            <input
                              type="number"
                              value={item.feePercent ?? ''}
                              onChange={(e) => handleTariffChange(item.id, 'feePercent', e.target.value)}
                              onBlur={() => persistTariff(item.id)}
                              placeholder="-"
                              className="w-full text-right bg-transparent p-1.5 font-mono font-bold text-slate-700 text-sm focus:bg-white focus:outline-none focus:ring-1 focus:ring-emerald-500 rounded"
                            />
                          </td>
                          {/* 본명 */}
                          <td className="p-1 border-r border-slate-200 text-center">
                            <input
                              type="text"
                              value={item.realName ?? ''}
                              onChange={(e) => handleTariffChange(item.id, 'realName', e.target.value)}
                              onBlur={() => persistTariff(item.id)}
                              placeholder="-"
                              className="w-full text-center bg-transparent p-1.5 font-bold text-slate-500 text-xs focus:bg-white focus:outline-none focus:ring-1 focus:ring-emerald-500 rounded"
                            />
                          </td>
                          {/* 비고 */}
                          <td className="p-1 border-r border-slate-200">
                            <input
                              type="text"
                              value={item.notes ?? ''}
                              onChange={(e) => handleTariffChange(item.id, 'notes', e.target.value)}
                              onBlur={() => persistTariff(item.id)}
                              placeholder="예. 프리미엄"
                              className="w-full bg-transparent p-1.5 font-semibold text-slate-600 text-xs focus:bg-white focus:outline-none focus:ring-1 focus:ring-emerald-500 rounded"
                            />
                          </td>
                          {/* 삭제 */}
                          <td className="p-1 text-center">
                            <button
                              type="button"
                              onClick={() => handleDeleteTariff(item.id, item.coachName)}
                              className="text-slate-300 hover:text-rose-500 duration-70 p-1 rounded hover:bg-rose-50 cursor-pointer"
                            >
                              <Trash2 className="w-4 h-4 mx-auto" />
                            </button>
                          </td>
                        </tr>
                      ) : (
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
                      )
                    ))
                  ) : (
                    <tr>
                      <td colSpan={isAdmin ? 7 : 6} className="p-10 text-center text-slate-400 font-sans">
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
                      const coachTariffs = tariffs.filter(t => t.coachName === selectedName);
                      const hasPremium = coachTariffs.some(t => t.notes === '프리미엄');
                      const tier = hasPremium ? 'A' : (coachTariffs.some(t => t.feeAmount && t.feeAmount >= 70000) ? 'A' : 'B');

                      setNewCoach({
                        name: selectedName,
                        email: `${selectedName}@coachingpass.com`,
                        phone: newCoach.phone || `010-5555-${String(1000 + Math.floor(Math.random() * 9000)).substring(1)}`,
                        specialty: coachTariffs.map(t => t.method).join('/') + ' 코칭 전문가',
                        tier: tier as any,
                        status: 'active'
                      });
                    }} 
                    className="w-full border p-2.5 rounded-xl font-bold bg-transparent"
                  >
                    <option value="">코칭 요율표 기준 코치 선택</option>
                    {Array.from(new Set(tariffs.map(t => t.coachName))).sort().map(name => (
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
                        // 전표에 저장된 코칭방식을 우선 사용, 없으면 서비스명으로 추론
                        let method: string = foundSale.coachingMethod || '대면';
                        if (!foundSale.coachingMethod) {
                          const svc = (foundSale.registeredService || '').toLowerCase();
                          if (svc.includes('혼합')) {
                            method = '혼합';
                          } else if (svc.includes('비대면') || svc.includes('온라인') || svc.includes('online') || svc.includes('zoom')) {
                            method = '비대면';
                          } else if (svc.includes('대입') || svc.includes('입시') || svc.includes('입학')) {
                            method = '대입';
                          } else if (svc.includes('통합') || svc.includes('종합')) {
                            method = '통합';
                          }
                        }

                        setNewFee(prev => ({
                          ...prev,
                          salesId: foundSale.id,
                          customerName: foundSale.customerName,
                          salesAmount: foundSale.amount,
                          coachingHours: foundSale.coachingHours || 1,
                          faceHours: foundSale.faceHours || 0,
                          onlineHours: foundSale.onlineHours || 0,
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
                    <input type="number" required={newFee.coachingMethod !== '혼합'} disabled={newFee.coachingMethod === '혼합'} min={1} value={newFee.coachingMethod === '혼합' ? ((newFee.faceHours || 0) + (newFee.onlineHours || 0)) : (newFee.coachingHours || 1)} onChange={e => setNewFee({...newFee, coachingHours: Math.max(1, Number(e.target.value))})} className="w-full border p-2.5 rounded-xl font-bold font-mono disabled:bg-slate-100 disabled:text-slate-500" />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-slate-500 font-bold mb-1">코칭방식 *</label>
                    <select required value={newFee.coachingMethod || '대면'} onChange={e => setNewFee({...newFee, coachingMethod: e.target.value})} className="w-full border p-2.5 rounded-xl font-bold bg-transparent">
                      <option value="통합">통합</option>
                      <option value="대면">대면</option>
                      <option value="비대면">비대면</option>
                      <option value="혼합">혼합 (대면+비대면)</option>
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

                {newFee.coachingMethod === '혼합' && (
                  <div className="grid grid-cols-2 gap-3 p-3 rounded-xl bg-slate-50 border border-slate-150">
                    <div>
                      <label className="block text-emerald-600 font-bold mb-1">대면 시간 *</label>
                      <input type="number" min={0} value={newFee.faceHours || 0} onChange={e => setNewFee({...newFee, faceHours: Math.max(0, Number(e.target.value))})} className="w-full border p-2.5 rounded-xl font-bold font-mono" />
                    </div>
                    <div>
                      <label className="block text-amber-600 font-bold mb-1">비대면 시간 *</label>
                      <input type="number" min={0} value={newFee.onlineHours || 0} onChange={e => setNewFee({...newFee, onlineHours: Math.max(0, Number(e.target.value))})} className="w-full border p-2.5 rounded-xl font-bold font-mono" />
                    </div>
                    <p className="col-span-2 text-[10px] text-slate-500 font-medium">
                      대면·비대면 시간에 각 요율을 적용해 수수료가 자동 합산됩니다. (총 {(newFee.faceHours || 0) + (newFee.onlineHours || 0)}시간)
                    </p>
                  </div>
                )}

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
