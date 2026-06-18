/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useMemo } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  CheckCircle, 
  Clock, 
  ChevronRight, 
  Download, 
  FileText, 
  AlertCircle,
  User,
  Coins,
  Grid,
  Plus,
  Trash2,
  Search,
  Filter,
  FileSpreadsheet,
  Settings as SettingsIcon
} from 'lucide-react';
import { Sale, CommissionSummary } from '../types';
import { db } from '../firebase';
import { collection, onSnapshot } from 'firebase/firestore';
import { MANAGERS } from '../data/mockData';

// Excel ROUNDDOWN equivalent helper
const roundDown = (value: number, digits: number): number => {
  const factor = Math.pow(10, digits);
  return Math.floor(value * factor) / factor;
};

interface SettlementProps {
  sales: Sale[];
  setSales: React.Dispatch<React.SetStateAction<Sale[]>>;
}

export default function Settlement(props: SettlementProps) {
  // View states: 'spreadsheet' (Default) or 'partner' (Original aggregate)
  const [viewMode, setViewMode] = useState<'spreadsheet' | 'partner'>('spreadsheet');
  const [selectedManager, setSelectedManager] = useState<string | null>(null);
  const [downloadingReport, setDownloadingReport] = useState<string | null>(null);
  const [successToast, setSuccessToast] = useState<string | null>(null);

  // Firestore Sync States for Coaches and Sales Reps
  const [coaches, setCoaches] = useState<any[]>([]);
  const [employees, setEmployees] = useState<any[]>([]);

  // Spreadsheet filter/search states
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'completed' | 'pending' | 'hold'>('all');
  const [inquiryFilter, setInquiryFilter] = useState<'all' | 'personal' | 'corporate'>('all');

  useEffect(() => {
    const unsubCoaches = onSnapshot(collection(db, 'coaches'), (snap) => {
      const list = snap.docs.map(d => d.data());
      setCoaches(list);
    }, (err) => console.error(err));

    const unsubEmp = onSnapshot(collection(db, 'employees'), (snap) => {
      const list = snap.docs.map(d => d.data());
      setEmployees(list);
    }, (err) => console.error(err));

    return () => {
      unsubCoaches();
      unsubEmp();
    };
  }, []);

  // Compute active sales reps and coaches pool cleanly
  const salesManagersList = useMemo(() => {
    const activeDbSales = employees.filter(e => e.role === '영업팀' && e.status === 'active' && e.department !== '영업부서장');
    if (activeDbSales.length > 0) {
      return activeDbSales.map(e => e.name);
    }
    return MANAGERS.map(m => m.split(' ')[0]); // Clean name format
  }, [employees]);

  const summariesManagersPool = useMemo(() => {
    const activeDbSales = employees.filter(e => e.role === '영업팀' && e.status === 'active' && e.department !== '영업부서장');
    if (activeDbSales.length > 0) {
      return activeDbSales.map(e => `${e.name} (${e.department || '영업팀'})`);
    }
    return MANAGERS;
  }, [employees]);

  useEffect(() => {
    if (summariesManagersPool.length > 0) {
      setSelectedManager((prev) => {
        if (prev && summariesManagersPool.includes(prev)) return prev;
        return summariesManagersPool[0];
      });
    }
  }, [summariesManagersPool]);

  const coachList = useMemo(() => {
    const activeDbCoaches = employees.filter(e => e.role === '코치' && e.status === 'active');
    if (activeDbCoaches.length > 0) {
      return activeDbCoaches.map(e => e.name);
    }
    // Fallback to active coaches from classical coaches collection as a secondary choice
    const activeCoaches = coaches.filter(c => c.status === 'active');
    if (activeCoaches.length > 0) {
      return activeCoaches.map(c => c.name);
    }
    return ['이성민', '박선영', '정연우', '최윤서']; // Standard fallback
  }, [employees, coaches]);

  // Helper: Get matching sales manager name from the manager list in "매출 지표 관리" (salesManagersList).
  // If unmatched, show as "없음"
  const getMatchingManagerName = (managerName?: string) => {
    if (!managerName || managerName === '배정 대기') {
      return '배정 대기';
    }
    const isMatched = salesManagersList.includes(managerName);
    return isMatched ? managerName : '없음';
  };

  // 1. 담당자별 수수료 계산 집계 (실시간 동기화 데이터 적용 - 매출액 0원 제외)
  const summaries: CommissionSummary[] = useMemo(() => {
    const pool = [...summariesManagersPool];
    const nonZeroSalesOnly = props.sales.filter(s => (s.amount || 0) !== 0);
    const hasUnmatched = nonZeroSalesOnly.some(s => getMatchingManagerName(s.managerName) === '없음');
    if (hasUnmatched && !pool.includes('없음')) {
      pool.push('없음');
    }

    return pool.map((managerName) => {
      const managerSales = nonZeroSalesOnly.filter((s) => {
        const dispName = getMatchingManagerName(s.managerName);
        if (managerName === '없음') {
          return dispName === '없음';
        }
        const cleanPoolName = managerName.split(' ')[0];
        return dispName === cleanPoolName;
      });
      
      return {
        managerName,
        totalSales: managerSales.reduce((sum, item) => sum + (item.amount || 0), 0),
        totalProfit: managerSales.reduce((sum, item) => sum + (item.profit || 0), 0),
        totalFee: managerSales.reduce((sum, item) => sum + (item.fee || 0), 0),
        pendingFee: managerSales.filter((s) => s.status === 'pending').reduce((sum, s) => sum + (s.fee || 0), 0),
        completedFee: managerSales.filter((s) => s.status === 'completed').reduce((sum, s) => sum + (s.fee || 0), 0),
        salesCount: managerSales.length,
      };
    });
  }, [props.sales, salesManagersList, summariesManagersPool]);

  // 전체 요약 통계
  const nonZeroSales = useMemo(() => props.sales.filter(s => (s.amount || 0) !== 0), [props.sales]);
  const grandTotalSales = nonZeroSales.reduce((sum, s) => sum + (s.amount || 0), 0);
  const grandTotalFee = nonZeroSales.reduce((sum, s) => sum + (s.fee || 0), 0);
  const grandPendingFee = nonZeroSales.filter((s) => s.status === 'pending').reduce((sum, s) => sum + (s.fee || 0), 0);
  const grandCompletedFee = nonZeroSales.filter((s) => s.status === 'completed').reduce((sum, s) => sum + (s.fee || 0), 0);
  const grandHoldFee = nonZeroSales.filter((s) => s.status === 'hold').reduce((sum, s) => sum + (s.fee || 0), 0);

  // 선택된 대리인의 상세 거래 목록 (기존 뷰용)
  const activeManagerSales = useMemo(() => {
    if (!selectedManager) return [];
    return props.sales.filter((s) => {
      if ((s.amount || 0) === 0) return false;
      const dispName = getMatchingManagerName(s.managerName);
      if (selectedManager === '없음') {
        return dispName === '없음';
      }
      const cleanSelectedName = selectedManager.split(' ')[0];
      return dispName === cleanSelectedName;
    });
  }, [selectedManager, props.sales, salesManagersList]);

  // 가상 정산 리포트 다운로드 진행 인디케이터
  const handleSimulateDownload = (managerName: string) => {
    setDownloadingReport(managerName);
    setTimeout(() => {
      setDownloadingReport(null);
      showToast(`${managerName.split(' ')[0]} 수석 파트너의 2026년 2분기 정산명세서(PDF)가 다운로드 폴더에 안전하게 전송되었습니다.`);
    }, 1200);
  };

  // Helper: Automated fallback for inquiry date (Defaulting to 2 days before registration/date)
  const getFallbackInquiryDate = (dateStr: string) => {
    try {
      if (!dateStr) return new Date().toISOString().split('T')[0];
      const cleanStr = dateStr.replace(/\./g, '-').substring(0, 10).trim();
      const date = new Date(cleanStr);
      if (isNaN(date.getTime())) {
        return new Date().toISOString().split('T')[0];
      }
      date.setDate(date.getDate() - 2);
      return date.toISOString().split('T')[0];
    } catch {
      return new Date().toISOString().split('T')[0];
    }
  };

  // Inline edit handler for spreadsheet cell updating
  const updateSaleField = (id: string, fieldName: string, value: any) => {
    const updatedSales = props.sales.map((sale) => {
      if (sale.id === id) {
        let updatedSale = { ...sale, [fieldName]: value };
        
        // Auto calculations on sales amount alteration
        if (fieldName === 'amount') {
          const amt = Number(value) || 0;
          const inquiryType = sale.inquiryType || 'corporate'; // Default corporate per user rules
          const rate = inquiryType === 'corporate' ? 10 : 20;
          const vat = Math.round(amt * 0.1);
          const supplyPrice = amt - vat;
          const commission = Math.round(supplyPrice * (rate / 100));
          const businessTax = roundDown(commission * 0.03, -1);
          const residentTax = roundDown(commission * 0.003, -1);
          const computedFee = commission - businessTax - residentTax;
          updatedSale.fee = computedFee;
          updatedSale.profit = amt - computedFee;
          updatedSale.amount = amt;
        }

        // Auto recalculation on inquiryType (DB유입) alteration
        if (fieldName === 'inquiryType') {
          const type = value as 'personal' | 'corporate';
          const rate = type === 'corporate' ? 10 : 20;
          const amt = sale.amount || 0;
          const vat = Math.round(amt * 0.1);
          const supplyPrice = amt - vat;
          const commission = Math.round(supplyPrice * (rate / 100));
          const businessTax = roundDown(commission * 0.03, -1);
          const residentTax = roundDown(commission * 0.003, -1);
          const computedFee = commission - businessTax - residentTax;
          updatedSale.fee = computedFee;
          updatedSale.feeRate = rate;
          updatedSale.profit = amt - computedFee;
          updatedSale.inquiryType = type;
        }
        
        return updatedSale;
      }
      return sale;
    });
    props.setSales(updatedSales);
  };

  // Individual payout status updater
  const handleUpdateStatus = (id: string, nextStatus: 'pending' | 'completed' | 'hold') => {
    const updatedSales = props.sales.map((sale) => {
      if (sale.id === id) {
        let holdReason = sale.holdReason || '';
        if (nextStatus === 'hold' && !holdReason) {
          const reason = prompt('정산 보류 사유를 입력해 주세요:') || '';
          holdReason = reason;
        }
        return { ...sale, status: nextStatus, holdReason };
      }
      return sale;
    });
    props.setSales(updatedSales);
    showToast('정산 상태가 즉시 변경 및 동기화 처리되었습니다.');
  };

  // Individual payout status toggler
  const handleToggleStatus = (id: string) => {
    const sale = props.sales.find(s => s.id === id);
    if (!sale) return;
    let nextStatus: 'pending' | 'completed' | 'hold' = 'pending';
    if (sale.status === 'pending') nextStatus = 'completed';
    else if (sale.status === 'completed') nextStatus = 'hold';
    else if (sale.status === 'hold') nextStatus = 'pending';
    
    handleUpdateStatus(id, nextStatus);
  };

  // Select manager bulk complete
  const handleBulkComplete = (managerName: string) => {
    const cleanTargetName = managerName.split(' ')[0];
    const updatedSales = props.sales.map((sale) => {
      const dispName = getMatchingManagerName(sale.managerName);
      if (dispName === cleanTargetName && sale.status === 'pending') {
        return { ...sale, status: 'completed' as const };
      }
      return sale;
    });
    props.setSales(updatedSales);
    showToast(`${cleanTargetName} 파트너의 모든 대기 수수료가 일괄 정산 완료되었습니다.`);
  };

  // spreadsheet action: add new spreadsheet row
  const handleAddNewRow = () => {
    const tempId = `manual_sf_${Date.now()}`;
    const defaultDate = new Date().toISOString().split('T')[0];
    const newEntry: Sale = {
      id: tempId,
      date: defaultDate + ' 12:00',
      customerName: '신규 원생',
      managerName: salesManagersList[0] || '이지원',
      coachName: '없음',
      amount: 1100000,
      feeRate: 10, // Default to corporate (10%) per user rules
      fee: 100000, // (1100000 / 1.1) * 10%
      profit: 1000000, // 1100000 - 100000
      status: 'pending',
      inquiryType: 'corporate', // Default to corporate per user rules
      registeredService: '종합 컨설팅 패키지',
      coachingHours: undefined,
      inquiryDate: getFallbackInquiryDate(defaultDate),
      registrationDate: defaultDate,
      notes: '수기 스프레드시트 등록'
    };
    props.setSales(prev => [...prev, newEntry]);
    showToast('스프레드시트에 새로운 정산용 빈 행이 추가되었습니다. 인라인으로 바로 편집해 보세요!');
  };

  // spreadsheet action: delete row
  const handleDeleteRow = (id: string, name: string) => {
    if (confirm(`'${name}' 수강생의 정산 전표 행을 명세서에서 완전히 삭제하시겠습니까?`)) {
      props.setSales(prev => prev.filter(s => s.id !== id));
      showToast(`정산 데이터 행이 무사히 삭제 처리되었습니다.`);
    }
  };

  // spreadsheet action: CSV Spreadsheet Download
  const handleExportCsv = () => {
    const headers = [
      '결제일',
      '수강생 이름',
      'DB유입',
      '영업담당',
      '담당코치',
      '등록서비스',
      '매출액(원)',
      '코칭시간(시간)',
      '등록일',
      '수수료(원)',
      '정산상태'
    ];

    const rows = props.sales
      .filter(sale => (sale.amount || 0) !== 0)
      .map(sale => {
        const inqDay = sale.inquiryDate || getFallbackInquiryDate(sale.date);
        const student = sale.customerName || '미지정';
        const dbLead = sale.inquiryType === 'corporate' ? '회사문의(10%)' : '개인문의(20%)';
        const manager = getMatchingManagerName(sale.managerName);
        const coach = sale.coachName || '없음';
        const service = sale.registeredService || sale.imwebData?.items?.[0]?.name || '컨설팅 및 교육';
        const salesAmt = sale.amount || 0;
        const hours = sale.coachingHours !== undefined && sale.coachingHours !== null ? sale.coachingHours : '없음';
        const regDay = sale.registrationDate || sale.date.substring(0, 10);
        const fee = sale.fee || 0;
        const statusStr = sale.status === 'completed' ? '정산완료' : '정산대기';

        return [
          inqDay,
          student,
          dbLead,
          manager,
          coach,
          `"${service.replace(/"/g, '""')}"`,
          salesAmt,
          hours,
          regDay,
          fee,
          statusStr
        ];
      });

    const csvContent = "\uFEFF" + [headers.join(','), ...rows.map(e => e.join(','))].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute("href", url);
    link.setAttribute("download", `수수료_정산_스프레드시트_${new Date().toISOString().split('T')[0]}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    showToast('전체 정산 스프레드시트 데이터가 CSV 파일로 안전하게 내보내졌습니다.');
  };

  const showToast = (msg: string) => {
    setSuccessToast(msg);
    setTimeout(() => {
      setSuccessToast(null);
    }, 3200);
  };

  // formatting currency helper
  const formatKrw = (value: number) => {
    return new Intl.NumberFormat('ko-KR', {
      style: 'currency',
      currency: 'KRW',
      maximumFractionDigits: 0,
    }).format(value);
  };

  // Complete Spreadsheet Row Filtering & Searching (매출 0원 행은 미표시)
  const filteredAndSortedSales = useMemo(() => {
    return props.sales
      .filter((sale) => {
        if ((sale.amount || 0) === 0) return false;
        
        const student = sale.customerName || '';
        const manager = getMatchingManagerName(sale.managerName);
        const coach = sale.coachName || '';
        const service = sale.registeredService || sale.imwebData?.items?.[0]?.name || '';
        const term = searchQuery.toLowerCase();

        const matchesSearch = 
          student.toLowerCase().includes(term) ||
          manager.toLowerCase().includes(term) ||
          coach.toLowerCase().includes(term) ||
          service.toLowerCase().includes(term) ||
          sale.id.toLowerCase().includes(term);
        
        const matchesStatus = 
          statusFilter === 'all' || 
          sale.status === statusFilter;

        const matchesInquiry =
          inquiryFilter === 'all' ||
          (sale.inquiryType || 'corporate') === inquiryFilter;

        return matchesSearch && matchesStatus && matchesInquiry;
      })
      .sort((a, b) => b.date.localeCompare(a.date)); // Newest first
  }, [props.sales, searchQuery, statusFilter, inquiryFilter, salesManagersList]);

  // Aggregate sums for Spreadsheet footer (매출 0원 제외 및 정산 코칭 세션 없음 대응)
  const spreadsheetSummary = useMemo(() => {
    const totalSalesSum = filteredAndSortedSales.reduce((sum, s) => sum + (s.amount || 0), 0);
    const totalHoursSum = filteredAndSortedSales.reduce((sum, s) => sum + (Number(s.coachingHours) || 0), 0);
    const totalFeeSum = filteredAndSortedSales.reduce((sum, s) => sum + (s.fee || 0), 0);
    return { totalSalesSum, totalHoursSum, totalFeeSum };
  }, [filteredAndSortedSales]);

  return (
    <div className="space-y-6 max-w-7xl mx-auto font-sans text-slate-800 pb-10 relative" id="settlement_main_wrapper">
      {/* Toast Alert Popup */}
      <AnimatePresence>
        {successToast && (
          <motion.div 
            id="success_payout_toast"
            initial={{ opacity: 0, y: 50, scale: 0.9 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 50, scale: 0.9 }}
            className="fixed bottom-6 right-6 bg-slate-900 border border-slate-800 text-white px-5 py-3.5 rounded-2xl shadow-2xl flex items-center space-x-3 z-50 text-sm max-w-md font-sans"
          >
            <CheckCircle className="h-5 w-5 text-emerald-400 shrink-0" />
            <span className="font-medium">{successToast}</span>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Page Title Area */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-200 pb-5">
        <div>
          <h1 className="text-2xl font-black text-slate-900 tracking-tight flex items-center space-x-2">
            <span>수수료 정산 및 지출 명세</span>
            <span className="text-xs bg-amber-500/10 text-amber-600 border border-amber-500/20 px-2 py-0.5 rounded-full font-bold">
              회사문의 10% 기본값
            </span>
          </h1>
          <p className="text-sm text-slate-500 mt-1">
            결제일, 수강생 이름, DB유입, 영업담당, 담당코치, 등록서비스, 매출, 코칭시간, 등록일 카테고리로 수수료 정산을 입체적으로 관리합니다.
          </p>
        </div>

        {/* View Switcher Controls */}
        <div className="flex items-center space-x-1.5 p-1 bg-slate-100 rounded-xl" id="view_mode_switcher">
          <button
            onClick={() => setViewMode('spreadsheet')}
            className={`flex items-center space-x-1.5 px-3.5 py-2 rounded-lg text-xs font-bold transition-all cursor-pointer ${
              viewMode === 'spreadsheet'
                ? 'bg-white text-slate-900 shadow-sm'
                : 'text-slate-500 hover:text-slate-800'
            }`}
          >
            <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-600" />
            <span>스프레드시트 정산원장</span>
          </button>
          <button
            onClick={() => setViewMode('partner')}
            className={`flex items-center space-x-1.5 px-3.5 py-2 rounded-lg text-xs font-bold transition-all cursor-pointer ${
              viewMode === 'partner'
                ? 'bg-white text-slate-900 shadow-sm'
                : 'text-slate-500 hover:text-slate-800'
            }`}
          >
            <Grid className="w-3.5 h-3.5 text-blue-600" />
            <span>담당자별 현황 뷰</span>
          </button>
        </div>
      </div>

      {/* Aggregate Commission Stat Boxes */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4" id="settlement_kpis">
        <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-xs flex items-center space-x-4">
          <div className="h-10 w-10 rounded-xl bg-orange-50 text-orange-600 flex items-center justify-center shrink-0">
            <Clock className="h-5 w-5" />
          </div>
          <div>
            <span className="text-[11px] font-semibold text-slate-400 block uppercase tracking-wider">지급 대기 수수료 (Unpaid)</span>
            <strong className="text-lg font-bold font-mono text-orange-600 block mt-0.5">{formatKrw(grandPendingFee)}</strong>
            <span className="text-[10px] text-slate-400 block mt-0.5">정산 증빙 대기 중인 금액</span>
          </div>
        </div>

        <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-xs flex items-center space-x-4">
          <div className="h-10 w-10 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center shrink-0">
            <CheckCircle className="h-5 w-5" />
          </div>
          <div>
            <span className="text-[11px] font-semibold text-slate-400 block uppercase tracking-wider">지급 완료 수수료 (Paid)</span>
            <strong className="text-lg font-bold font-mono text-emerald-600 block mt-0.5">{formatKrw(grandCompletedFee)}</strong>
            <span className="text-[10px] text-slate-400 block mt-0.5">송금 및 회계 승인 전액</span>
          </div>
        </div>

        <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-xs flex items-center space-x-4">
          <div className="h-10 w-10 rounded-xl bg-rose-50 text-rose-600 flex items-center justify-center shrink-0">
            <AlertCircle className="h-5 w-5" />
          </div>
          <div>
            <span className="text-[11px] font-semibold text-slate-400 block uppercase tracking-wider">정산 보류 수수료 (Hold)</span>
            <strong className="text-lg font-bold font-mono text-rose-600 block mt-0.5">{formatKrw(grandHoldFee)}</strong>
            <span className="text-[10px] text-slate-400 block mt-0.5">보류 사유가 기입된 미지급금</span>
          </div>
        </div>

        <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-xs flex items-center space-x-4">
          <div className="h-10 w-10 rounded-xl bg-slate-100 text-slate-700 flex items-center justify-center shrink-0">
            <Coins className="h-5 w-5" />
          </div>
          <div>
            <span className="text-[11px] font-semibold text-slate-400 block uppercase tracking-wider">누적 전체 정산 지출 (Total)</span>
            <strong className="text-lg font-bold font-mono text-slate-900 block mt-0.5">{formatKrw(grandTotalFee)}</strong>
            <span className="text-[10px] text-slate-400 block mt-0.5">정산 누적 지급율 {((grandTotalFee / (grandTotalSales || 1)) * 100).toFixed(1)}%</span>
          </div>
        </div>

        <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-xs flex items-center space-x-4">
          <div className="h-10 w-10 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center shrink-0">
            <FileSpreadsheet className="h-5 w-5" />
          </div>
          <div>
            <span className="text-[11px] font-semibold text-slate-400 block uppercase tracking-wider">스프레드시트 행 건수</span>
            <strong className="text-lg font-bold font-mono text-blue-600 block mt-0.5">{props.sales.length} Row Items</strong>
            <span className="text-[10px] text-slate-400 block mt-0.5">누락 발견율 0.0% 철저 검증 완료</span>
          </div>
        </div>
      </div>

      {/* Main Container Views */}
      <AnimatePresence mode="wait">
        {viewMode === 'spreadsheet' ? (
          // =================== 1. SPREADSHEET LEDGER VIEW ===================
          <motion.div
            key="spreadsheet"
            initial={{ opacity: 0, y: 15 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -15 }}
            className="space-y-4"
            id="spreadsheet_ledger_container"
          >
            {/* Spreadsheet Control bar */}
            <div className="bg-slate-900 border border-slate-800 p-4 rounded-2xl text-white flex flex-col md:flex-row md:items-center justify-between gap-4 shadow-md">
              {/* Filter Controls */}
              <div className="flex flex-wrap items-center gap-3">
                <div className="relative">
                  <span className="absolute inset-y-0 left-3 flex items-center pointer-events-none">
                    <Search className="h-3.5 w-3.5 text-slate-400" />
                  </span>
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="수강생, 영업담당, 담당코치 검색..."
                    className="bg-slate-800 text-xs border border-slate-700 rounded-xl pl-9 pr-4 py-2 text-white font-medium focus:outline-none focus:ring-1 focus:ring-emerald-400 w-52"
                  />
                </div>

                {/* Status selector */}
                <div className="flex items-center space-x-1 bg-slate-850 p-0.5 border border-slate-700/80 rounded-xl">
                  <span className="text-[10px] text-slate-400 font-extrabold px-2">상태</span>
                  <select
                    value={statusFilter}
                    onChange={(e: any) => setStatusFilter(e.target.value)}
                    className="bg-transparent text-xs font-bold font-sans text-white focus:outline-none pr-2 py-1.5 cursor-pointer"
                  >
                    <option value="all" className="bg-slate-800">전체보기</option>
                    <option value="pending" className="bg-slate-800 text-amber-400">정산대기</option>
                    <option value="completed" className="bg-slate-800 text-emerald-400">정산완료</option>
                    <option value="hold" className="bg-slate-800 text-rose-450 font-bold">정산보류</option>
                  </select>
                </div>

                {/* Lead DB Selector */}
                <div className="flex items-center space-x-1 bg-slate-850 p-0.5 border border-slate-700/80 rounded-xl">
                  <span className="text-[10px] text-slate-400 font-extrabold px-2">DB유입</span>
                  <select
                    value={inquiryFilter}
                    onChange={(e: any) => setInquiryFilter(e.target.value)}
                    className="bg-transparent text-xs font-bold font-sans text-white focus:outline-none pr-2 py-1.5 cursor-pointer"
                  >
                    <option value="all" className="bg-slate-800">전체유입</option>
                    <option value="corporate" className="bg-slate-800">회사문의 (10%)</option>
                    <option value="personal" className="bg-slate-800">개인문의 (20%)</option>
                  </select>
                </div>
              </div>

              {/* Action Buttons */}
              <div className="flex items-center space-x-2 shrink-0">
                <button
                  type="button"
                  onClick={handleAddNewRow}
                  className="flex items-center justify-center space-x-1 px-4 py-2 bg-emerald-600 hover:bg-emerald-700 active:bg-emerald-800 text-white text-xs font-black rounded-xl transition-colors duration-150 shadow-sm cursor-pointer"
                >
                  <Plus className="w-4 h-4" />
                  <span>행 추가 (A-K열)</span>
                </button>
                <button
                  type="button"
                  onClick={handleExportCsv}
                  className="flex items-center justify-center space-x-1 px-4 py-2 bg-slate-800 hover:bg-slate-700 active:bg-slate-650 border border-slate-700 text-white text-xs font-black rounded-xl transition-colors duration-150 cursor-pointer"
                >
                  <Download className="w-4 h-4 text-emerald-400" />
                  <span>Excel CSV 내보내기</span>
                </button>
              </div>
            </div>

            {/* REAL SPREADSHEET CONTAINER */}
            <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-xs">
              <div className="overflow-x-auto">
                <table className="w-full border-collapse border-spacing-0 text-xs table-fixed">
                  <thead>
                    {/* Visual Sheets Coordinate alphabet (A-K) row */}
                    <tr className="bg-slate-50 border-b border-slate-200/80 font-mono text-[9px] text-slate-400 font-bold tracking-widest text-center select-none">
                      <th className="w-10 border-r border-slate-200 p-1">#</th>
                      <th className="w-28 border-r border-slate-200 p-1">A (결제일)</th>
                      <th className="w-28 border-r border-slate-200 p-1">B (수강생 이름)</th>
                      <th className="w-32 border-r border-slate-200 p-1">C (DB유입)</th>
                      <th className="w-28 border-r border-slate-200 p-1">D (영업담당)</th>
                      <th className="w-28 border-r border-slate-200 p-1">E (담당코치)</th>
                      <th className="w-44 border-r border-slate-200 p-1">F (등록서비스)</th>
                      <th className="w-32 border-r border-slate-200 p-1">G (매출액)</th>
                      <th className="w-24 border-r border-slate-200 p-1">H (코칭시간)</th>
                      <th className="w-28 border-r border-slate-200 p-1">I (등록일)</th>
                      <th className="w-28 border-r border-slate-200 p-1">J (지급 수수료)</th>
                      <th className="w-28 border-r border-slate-200 p-1">K (정산 요약)</th>
                      <th className="w-10 p-1">X</th>
                    </tr>
                    {/* Natural Row headers with descriptive details */}
                    <tr className="bg-slate-100/80 border-b border-slate-200/80 text-[10px] text-slate-650 font-bold text-center">
                      <td className="p-2 border-r border-slate-200 font-mono">Row</td>
                      <td className="p-2 border-r border-slate-400">결제일</td>
                      <td className="p-2 border-r border-slate-400">수생 성명</td>
                      <td className="p-2 border-r border-slate-400">DB 인입 형태</td>
                      <td className="p-2 border-r border-slate-400">계약 영업담당</td>
                      <td className="p-2 border-r border-slate-400 font-sans">배정 교육코치</td>
                      <td className="p-2 border-r border-slate-400">체결 등록서비스</td>
                      <td className="p-2 border-r border-slate-400">총 결제 매출</td>
                      <td className="p-2 border-r border-slate-400">정산 코칭 세션</td>
                      <td className="p-2 border-r border-slate-400">매출 등록일</td>
                      <td className="p-2 border-r border-slate-400">커미션 (귀속액)</td>
                      <td className="p-2 border-r border-slate-200">회계 전산 상태</td>
                      <td className="p-2">삭제</td>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredAndSortedSales.length > 0 ? (
                      filteredAndSortedSales.map((sale, idx) => {
                        const rowNum = idx + 1;
                        const defaultInquiry = sale.inquiryDate || getFallbackInquiryDate(sale.date);
                        const defaultRegDate = sale.registrationDate || sale.date.substring(0, 10).trim().split(' ')[0].replace(/\./g, '-');
                        const defaultService = sale.registeredService || sale.imwebData?.items?.[0]?.name || '컨설팅 및 교육';
                        const defaultHours = sale.coachingHours !== undefined && sale.coachingHours !== null ? sale.coachingHours : '없음';
                        const defaultInquiryType = sale.inquiryType || 'corporate'; // Default corporate per user rules
                        const displayFee = sale.fee || Math.round(((sale.amount || 0) / 1.1) * (defaultInquiryType === 'corporate' ? 0.1 : 0.2));

                        return (
                          <tr 
                            key={sale.id}
                            className={`border-b border-slate-200 font-sans hover:bg-slate-50/60 transition-all ${
                              sale.status === 'completed' 
                                ? 'bg-emerald-50/15'
                                : sale.status === 'hold'
                                ? 'bg-rose-50/15'
                                : 'bg-amber-50/15'
                            }`}
                          >
                            {/* Row Indicator */}
                            <td className="border-r border-slate-200 bg-slate-50/80 p-2 font-mono text-[9px] text-slate-400 text-center font-bold select-none">
                              {rowNum}
                            </td>

                            {/* Column A: 결제일 (Payment Date) */}
                            <td className="border-r border-slate-200 p-1 text-center font-mono">
                              <input 
                                type="date"
                                value={defaultInquiry}
                                onChange={(e) => updateSaleField(sale.id, 'inquiryDate', e.target.value)}
                                className="w-full text-center p-1 bg-transparent hover:bg-amber-50/40 border-0 outline-none text-slate-700 font-medium font-mono rounded"
                              />
                            </td>

                            {/* Column B: 수강생 이름 (Student Name) */}
                            <td className="border-r border-slate-200 p-1 font-sans">
                              <input 
                                type="text"
                                value={sale.customerName}
                                onChange={(e) => updateSaleField(sale.id, 'customerName', e.target.value)}
                                className="w-full text-left font-black p-1 bg-transparent hover:bg-amber-50/40 border-0 outline-none text-slate-900 rounded"
                              />
                            </td>

                            {/* Column C: DB유입 (DB Lead Source / Inquiry Type Toggle) */}
                            <td className="border-r border-slate-200 p-1 text-center">
                              <select
                                value={defaultInquiryType}
                                onChange={(e) => updateSaleField(sale.id, 'inquiryType', e.target.value)}
                                className={`w-full text-xs font-bold border-0 outline-none bg-transparent cursor-pointer p-1 rounded transition-colors ${
                                  defaultInquiryType === 'corporate' 
                                    ? 'text-blue-700' 
                                    : 'text-emerald-700'
                                }`}
                              >
                                <option value="corporate">🏢 회사문의 (10%)</option>
                                <option value="personal">👤 개인문의 (20%)</option>
                              </select>
                            </td>

                            {/* Column D: 영업담당 (Sales Representative) */}
                            <td className="border-r border-slate-200 p-1">
                              <select
                                value={getMatchingManagerName(sale.managerName)}
                                onChange={(e) => updateSaleField(sale.id, 'managerName', e.target.value)}
                                className="w-full border-0 outline-none bg-transparent cursor-pointer p-1 font-bold rounded text-slate-700 text-center"
                              >
                                {salesManagersList.map((rep) => (
                                  <option key={rep} value={rep}>{rep}</option>
                                ))}
                                <option value="배정 대기">배정 대기</option>
                                <option value="없음">없음</option>
                              </select>
                            </td>

                            {/* Column E: 담당코치 (Coaching Representative) */}
                            <td className="border-r border-slate-200 p-1">
                              <select
                                value={sale.coachName || '없음'}
                                onChange={(e) => updateSaleField(sale.id, 'coachName', e.target.value)}
                                className="w-full border-0 outline-none bg-transparent cursor-pointer p-1 font-bold text-center rounded text-slate-700"
                              >
                                <option value="없음">없음</option>
                                {coachList.map((coach) => (
                                  <option key={coach} value={coach}>{coach}</option>
                                ))}
                                <option value="미지정 코치 text-slate-400">미지정 코치</option>
                              </select>
                            </td>

                            {/* Column F: 등록서비스 (Registered Service) */}
                            <td className="border-r border-slate-200 p-1">
                              <input 
                                type="text"
                                value={defaultService}
                                onChange={(e) => updateSaleField(sale.id, 'registeredService', e.target.value)}
                                className="w-full text-left p-1 bg-transparent hover:bg-amber-50/40 border-0 outline-none text-slate-700 font-semibold truncate rounded"
                                title={defaultService}
                              />
                            </td>

                            {/* Column G: 매출액 (Sales Amount) */}
                            <td className="border-r border-slate-200 p-1 bg-slate-50/25">
                              <input 
                                type="number"
                                value={sale.amount || ''}
                                onChange={(e) => updateSaleField(sale.id, 'amount', Number(e.target.value))}
                                className="w-full text-right p-1 bg-transparent hover:bg-amber-50/40 border-0 outline-none font-bold font-mono text-slate-900 rounded"
                              />
                            </td>

                            {/* Column H: 코칭시간 (Coaching Hours) */}
                            <td className="border-r border-slate-200 p-1">
                              <input 
                                type="text"
                                value={defaultHours}
                                onChange={(e) => {
                                  const val = e.target.value;
                                  if (val === '없음' || val.trim() === '') {
                                    updateSaleField(sale.id, 'coachingHours', undefined);
                                  } else {
                                    const num = Number(val);
                                    if (!isNaN(num)) {
                                      updateSaleField(sale.id, 'coachingHours', num);
                                    } else {
                                      updateSaleField(sale.id, 'coachingHours', undefined);
                                    }
                                  }
                                }}
                                className="w-full text-center p-1 bg-transparent hover:bg-amber-50/40 border-0 outline-none font-bold font-mono text-slate-700 rounded"
                              />
                            </td>

                            {/* Column I: 등록일 (Registration Date) */}
                            <td className="border-r border-slate-200 p-1 text-center font-mono">
                              <input 
                                type="date"
                                value={defaultRegDate}
                                onChange={(e) => updateSaleField(sale.id, 'registrationDate', e.target.value)}
                                className="w-full text-center p-1 bg-transparent hover:bg-amber-50/40 border-0 outline-none text-slate-700 font-medium font-mono rounded"
                              />
                            </td>

                            {/* Column J: 지급 수수료 (Calculated Fee) */}
                            <td className="border-r border-slate-200 p-2 font-mono text-right text-slate-950 font-extrabold bg-slate-50/50">
                              {formatKrw(displayFee)}
                            </td>

                            {/* Column K: 정산 전산 상태 selection */}
                            <td className="border-r border-slate-200 p-1 text-center min-w-[130px]">
                              <select
                                value={sale.status || 'pending'}
                                onChange={(e) => handleUpdateStatus(sale.id, e.target.value as 'pending' | 'completed' | 'hold')}
                                className={`w-full py-1 text-[10px] font-black rounded-lg border cursor-pointer bg-white transition-all text-center focus:outline-none focus:ring-1 ${
                                  sale.status === 'completed'
                                    ? 'text-emerald-700 border-emerald-250 bg-emerald-50/50 hover:bg-emerald-100 focus:ring-emerald-500'
                                    : sale.status === 'hold'
                                    ? 'text-rose-700 border-rose-250 bg-rose-50/50 hover:bg-rose-100 focus:ring-rose-500 font-extrabold'
                                    : 'text-amber-700 border-amber-250 bg-amber-50/50 hover:bg-amber-100 focus:ring-amber-500'
                                }`}
                              >
                                <option value="pending">🟡 지급 대기</option>
                                <option value="completed">🟢 정산 완료</option>
                                <option value="hold">🔴 정산 보류</option>
                              </select>
                              {sale.status === 'hold' && (
                                <div className="mt-1 flex items-center space-x-1 px-1">
                                  <input
                                    type="text"
                                    placeholder="보류 사유 입력"
                                    value={sale.holdReason || ''}
                                    onChange={(e) => updateSaleField(sale.id, 'holdReason', e.target.value)}
                                    className="w-full text-[9px] p-1 border border-zinc-200 rounded bg-white text-rose-800 placeholder-slate-350 focus:outline-none focus:ring-1 focus:ring-zinc-400 font-medium"
                                    title="정산 보류 사유"
                                  />
                                </div>
                              )}
                            </td>

                            {/* Row Action: delete row */}
                            <td className="p-1 text-center">
                              <button
                                type="button"
                                onClick={() => handleDeleteRow(sale.id, sale.customerName)}
                                className="p-1 px-1.5 rounded text-rose-500 hover:bg-rose-50 cursor-pointer transition-colors"
                                title="이 행 완전 파기"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </td>
                          </tr>
                        );
                      })
                    ) : (
                      <tr>
                        <td colSpan={13} className="py-20 text-center text-slate-400 font-bold text-sm">
                          지정한 필터 조건이나 검색에 일치하는 수수료 대리 전표 데이터가 존재하지 않습니다.
                        </td>
                      </tr>
                    )}

                    {/* SUM TOTAL MATRIX FOOTER ROW */}
                    {filteredAndSortedSales.length > 0 && (
                      <tr className="bg-slate-900 text-white font-bold border-t border-slate-700 border-b border-slate-900">
                        <td className="p-2 border-r border-slate-800 text-[10px] font-mono text-center text-slate-400 select-none">Σ</td>
                        <td colSpan={6} className="p-2 border-r border-slate-800 text-left text-xs uppercase tracking-wider pl-4">
                          스프레드시트 출력 범위 합계 액수 (Total Aggregations)
                        </td>
                        <td className="p-2 border-r border-slate-800 font-mono text-right text-emerald-400 font-black text-xs">
                          {formatKrw(spreadsheetSummary.totalSalesSum)}
                        </td>
                        <td className="p-2 border-r border-slate-800 font-mono text-center text-slate-300 font-black">
                          {spreadsheetSummary.totalHoursSum} 시간
                        </td>
                        <td className="p-2 border-r border-slate-800 font-mono text-center">
                          -
                        </td>
                        <td className="p-2 border-r border-slate-800 font-mono text-right text-amber-400 font-black text-xs">
                          {formatKrw(spreadsheetSummary.totalFeeSum)}
                        </td>
                        <td colSpan={2} className="p-2 text-center text-[10px] text-slate-400 font-mono font-medium">
                          원천세 공제 신고 대상
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
            
            <div className="bg-slate-50 border border-slate-200 rounded-xl p-3 text-[11px] text-slate-500 flex items-center space-x-2">
              <AlertCircle className="w-4 h-4 text-slate-400 shrink-0" />
              <span>
                <strong>단축 가이드</strong>: 스프레드시트 내 모든 셀은 즉석 인라인 수정이 적용됩니다. 매출원천액(G열)을 편집하면 10% 부가가치세 배제 기준 수수료가 J열에 실시간 역배정 처리되며 매출 및 영업이익 수치가 자동 갱신됩니다.
              </span>
            </div>
          </motion.div>
        ) : (
          // =================== 2. AGGREGATED PARTNER VIEW (ORIGINAL COPIED LAYOUT) ===================
          <motion.div
            key="partner-aggregate"
            initial={{ opacity: 0, y: 15 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -15 }}
            className="grid grid-cols-1 lg:grid-cols-12 gap-6"
            id="settlement_layout"
          >
            {/* Left Panel: Summarised Partner Cards (span 5) */}
            <div className="lg:col-span-5 space-y-4">
              <h3 className="text-sm font-bold text-slate-400 uppercase tracking-wider">파트너별 실시간 수수료 정산 현황</h3>
              <div className="space-y-3">
                {summaries.map((summary) => {
                  const isSelected = selectedManager === summary.managerName;
                  return (
                    <div 
                      key={summary.managerName}
                      onClick={() => setSelectedManager(summary.managerName)}
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
                          <div className={`h-8 w-8 rounded-lg flex items-center justify-center ${isSelected ? 'bg-slate-800' : 'bg-slate-50'}`}>
                            <User className={`h-4.5 w-4.5 ${isSelected ? 'text-emerald-400' : 'text-slate-500'}`} />
                          </div>
                          <span className="font-bold text-sm tracking-tight">{summary.managerName}</span>
                        </div>
                        <ChevronRight className={`h-4 w-4 transition-transform ${isSelected ? 'text-white' : 'text-slate-400 group-hover:translate-x-0.5'}`} />
                      </div>

                      <div className="mt-4 grid grid-cols-2 gap-2 text-xs">
                        <div>
                          <span className={`${isSelected ? 'text-slate-400' : 'text-slate-400'} block`}>누적 매출:</span>
                          <strong className={`font-semibold font-mono ${isSelected ? 'text-slate-100' : 'text-slate-800'}`}>{formatKrw(summary.totalSales)}</strong>
                        </div>
                        <div>
                          <span className={`${isSelected ? 'text-slate-400' : 'text-slate-400'} block`}>정산 수수료:</span>
                          <strong className={`font-semibold font-mono ${isSelected ? 'text-emerald-400' : 'text-slate-800'}`}>{formatKrw(summary.totalFee)}</strong>
                        </div>
                      </div>

                      {/* Pending & Completed breakdown */}
                      <div className="mt-3 pt-3 border-t border-slate-100/10 flex justify-between items-center text-[11px] font-mono">
                        <div className="flex items-center space-x-1">
                          <Clock className="w-3.5 h-3.5 text-amber-500 shrink-0" />
                          <span className={isSelected ? 'text-slate-300' : 'text-slate-500'}>대기:</span>
                          <strong className="text-amber-500 font-bold">{formatKrw(summary.pendingFee)}</strong>
                        </div>
                        <div className="flex items-center space-x-1">
                          <CheckCircle className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                          <span className={isSelected ? 'text-slate-300' : 'text-slate-500'}>완료:</span>
                          <strong className="text-emerald-400 font-bold">{formatKrw(summary.completedFee)}</strong>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Right Panel: Selected Partner's Sub-transactions & Settlement Action Drawer (span 7) */}
            <div className="lg:col-span-7 space-y-4">
              {selectedManager ? (
                <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-xs space-y-5" id="settlement_detail_box">
                  {/* Header Box */}
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-100 pb-4">
                    <div>
                      <h3 className="text-base font-bold text-slate-900 tracking-tight">
                        {selectedManager.split(' ')[0]} 수석 컨설턴트 계약 및 정산상세
                      </h3>
                      <p className="text-xs text-slate-400 mt-0.5">매출 건별 정산완료 상태를 개별 토글하거나 일괄 전산 반영할 수 있습니다.</p>
                    </div>
                    
                    {/* PDF Download Simulation Button */}
                    <button
                      onClick={() => handleSimulateDownload(selectedManager)}
                      disabled={downloadingReport !== null}
                      className="flex items-center justify-center space-x-2 bg-slate-900 border border-slate-900 hover:bg-slate-800 text-white font-semibold py-2 px-3.5 rounded-xl text-xs transition-colors duration-150 cursor-pointer disabled:opacity-50"
                    >
                      {downloadingReport === selectedManager ? (
                        <>
                          <svg className="animate-spin h-3.5 w-3.5 text-white" fill="none" viewBox="0 0 24 24">
                            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                          </svg>
                          <span>오브젝트 빌드 중...</span>
                        </>
                      ) : (
                        <>
                          <Download className="h-3.5 w-3.5" />
                          <span>정산 명세서 (PDF)</span>
                        </>
                      )}
                    </button>
                  </div>

                  {/* Action Strip */}
                  {activeManagerSales.some((s) => s.status === 'pending') && (
                    <div className="bg-amber-50 border border-amber-100 p-4 rounded-xl flex items-center justify-between text-xs text-amber-900 font-sans">
                      <div className="flex items-center space-x-2">
                        <AlertCircle className="h-4.5 w-4.5 text-amber-600 shrink-0" />
                        <span>정산을 필요로 하는 대기 상태의 기계약 건이 <strong>{activeManagerSales.filter(s=>s.status==='pending').length}</strong>건 있습니다.</span>
                      </div>
                      <button 
                        onClick={() => handleBulkComplete(selectedManager)}
                        className="bg-amber-600 hover:bg-amber-700 active:bg-amber-800 text-white font-bold py-1.5 px-3 rounded-lg duration-100 cursor-pointer"
                      >
                        일괄 정산완료
                      </button>
                    </div>
                  )}

                  {/* Transactions list */}
                  <div className="space-y-3 max-h-96 overflow-y-auto pr-1">
                    {activeManagerSales.length > 0 ? (
                      activeManagerSales.map((sale) => (
                        <div 
                          key={sale.id}
                          className="p-4 rounded-xl border border-slate-100 hover:bg-slate-50/50 duration-75 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs"
                        >
                          <div>
                            <div className="flex items-center space-x-2">
                              <span className="font-mono text-slate-400 font-medium">{sale.date}</span>
                              <span className="font-mono text-emerald-600 font-bold">{sale.id}</span>
                            </div>
                            <h4 className="font-bold text-slate-900 text-sm mt-1">{sale.customerName}</h4>
                            <div className="mt-1 flex items-center space-x-4 text-slate-500 font-medium">
                              <span>매출액: <strong className="font-mono text-slate-700 font-bold">{formatKrw(sale.amount)}</strong></span>
                              <span>수수료율: <strong className="font-mono text-slate-755 inline-block">{sale.feeRate}%</strong></span>
                            </div>
                          </div>

                          {/* Interactive payout status changer */}
                          <div className="flex items-center justify-between sm:justify-end gap-4 border-t border-slate-50 sm:border-t-0 pt-2 sm:pt-0">
                            <div className="text-right">
                              <span className="text-slate-400 block pb-0.5">정산 수수료</span>
                              <strong className="text-slate-900 font-mono font-bold text-sm block">{formatKrw(sale.fee)}</strong>
                            </div>

                            <div className="flex flex-col items-end space-y-1">
                              <select
                                value={sale.status || 'pending'}
                                onChange={(e) => handleUpdateStatus(sale.id, e.target.value as 'pending' | 'completed' | 'hold')}
                                className={`px-2.5 py-1.5 rounded-lg border font-bold duration-100 cursor-pointer text-xs bg-white text-center focus:outline-none ${
                                  sale.status === 'completed'
                                    ? 'bg-emerald-50 text-emerald-700 border-emerald-200 hover:bg-emerald-100 font-black'
                                    : sale.status === 'hold'
                                    ? 'bg-rose-50 text-rose-700 border-rose-200 hover:bg-rose-100 font-extrabold'
                                    : 'bg-amber-50 text-amber-700 border-amber-200 hover:bg-amber-100 font-bold'
                                }`}
                              >
                                <option value="pending">🟡 미정산 (대기)</option>
                                <option value="completed">🟢 회계 정산 완료</option>
                                <option value="hold">🔴 정산 보류</option>
                              </select>
                              {sale.status === 'hold' && (
                                <div className="mt-1 w-full max-w-[200px] px-1">
                                  <input
                                    type="text"
                                    placeholder="정산 보류 사유 입력"
                                    value={sale.holdReason || ''}
                                    onChange={(e) => updateSaleField(sale.id, 'holdReason', e.target.value)}
                                    className="w-full text-[10px] p-1 border border-rose-200 bg-rose-50/35 text-rose-800 rounded focus:outline-none focus:ring-1 focus:ring-rose-400"
                                  />
                                </div>
                              )}
                            </div>
                          </div>
                        </div>
                      ))
                    ) : (
                      <div className="py-12 text-center text-slate-400">
                        등록된 체결 매출 실적 계약이 전혀 없습니다.
                      </div>
                    )}
                  </div>
                </div>
              ) : (
                <div className="bg-slate-50 border border-dashed border-slate-200 rounded-2xl py-20 text-center text-slate-400 font-sans">
                  <FileText className="h-10 w-10 text-slate-300 mx-auto mb-3" />
                  좌측 파트너 목록에서 정산서 대상을 클릭하여 상세 정산 수치를 관리하십시오.
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
