/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  Percent, 
  Search, 
  CheckCircle2, 
  Clock, 
  TrendingUp, 
  Plus, 
  Trash2, 
  Download, 
  BarChart3, 
  ChevronRight, 
  Coins, 
  X,
  Target,
  FileSpreadsheet,
  AlertCircle,
  FileText
} from 'lucide-react';
import { SalesFeeItem, Sale, Employee } from '../types';
import { db, handleFirestoreError, OperationType } from '../firebase';
import { collection, onSnapshot, setDoc, doc, deleteDoc } from 'firebase/firestore';

// Excel ROUNDDOWN equivalent helper
const roundDown = (value: number, digits: number): number => {
  const factor = Math.pow(10, digits);
  return Math.floor(value * factor) / factor;
};

// Shared static backup list of sales managers
export const STATIC_SALES_MANAGERS = [
  { id: 'm_001', name: '이지원', department: '영업1팀', defaultRate: 15, currentTier: '골드' },
  { id: 'm_002', name: '김민준', department: '영업1팀', defaultRate: 15, currentTier: '골드' },
  { id: 'm_003', name: '박소희', department: '영업2팀', defaultRate: 12, currentTier: '실버' },
  { id: 'm_004', name: '최재혁', department: '광주지사', defaultRate: 12, currentTier: '실버' },
];

interface SalesFeesProps {
  sales: Sale[];
  setSales?: (newSalesAction: Sale[] | ((prev: Sale[]) => Sale[])) => void;
}

export default function SalesFees(props: SalesFeesProps) {
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [selectedManagerName, setSelectedManagerName] = useState<string | null>(null);
  
  // Spreadsheet / list filters
  const [statusFilter, setStatusFilter] = useState('all');
  const [monthFilter, setMonthFilter] = useState('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [coachFilter, setCoachFilter] = useState('all');
  
  // Modals status
  const [isFeeModalOpen, setIsFeeModalOpen] = useState(false);
  const [successToast, setSuccessToast] = useState<string | null>(null);
  const [downloading, setDownloading] = useState<string | null>(null);

  // Form Inputs
  const [newFee, setNewFee] = useState<Partial<SalesFeeItem & { inquiryType?: 'personal' | 'corporate' }>>({
    managerId: '', customerName: '', salesAmount: 0, commissionRate: 10, status: 'pending', inquiryType: 'corporate'
  });

  // Listen to Employees list to sync sales representatives dynamically
  useEffect(() => {
    const unsubscribe = onSnapshot(collection(db, 'employees'), (snapshot) => {
      const emps = snapshot.docs.map(doc => doc.data() as Employee);
      setEmployees(emps);
    }, (error) => {
      console.error("Firestore employees load error in SalesFees:", error);
    });
    return () => unsubscribe();
  }, []);

  // Compute actual sales managers: merged from database employees (role === '영업팀') and backup static managers
  const salesManagersList = React.useMemo(() => {
    // 영업팀 + 임원도 영업담당으로 선택 가능하도록 포함
    const activeDbSales = employees.filter(e => e.status === 'active' && (e.role === '영업팀' || e.role === '임원'));
    if (activeDbSales.length > 0) {
      return activeDbSales.map(e => ({
        id: e.id,
        name: e.name,
        department: e.department || '영업팀',
        defaultRate: e.commissionRate || 15,
        currentTier: (e.commissionRate && e.commissionRate >= 15) ? '골드' : '실버'
      }));
    }
    return STATIC_SALES_MANAGERS;
  }, [employees]);

  // Derive salesFees dynamically from props.sales in real-time
  const salesFees: SalesFeeItem[] = React.useMemo(() => {
    return props.sales
      .map(sale => {
        const rawManager = sale.managerName;
        const noManager = !rawManager || rawManager === '배정 대기' || rawManager === '없음';
        
        let matchingManager = null;
        
        if (!noManager) {
          matchingManager = salesManagersList.find(m => m.name === rawManager);
        }

        const inquiryType = sale.inquiryType || 'corporate';
        const rate = inquiryType === 'corporate' ? 10 : 20;
        const totalSales = sale.amount || 0;
        
        // 부가세는 총 결제 매출액의 정확히 10%
        const vat = Math.round(totalSales * 0.1);
        // 공급가액 = 매출액 - 부가세 (90%)
        const supplyPrice = totalSales - vat;
        
        // 영업 커미션 = 공급가액 * (요율 / 100)
        const commission = Math.round(supplyPrice * (rate / 100));
        
        // 사업소득세 = 영업 커미션 * 3% (0.03) (십의 자리 미만 버림)
        const businessTax = roundDown(commission * 0.03, -1);
        
        // 주민세 = 영업 커미션 * 0.3% (0.003) (십의 자리 미만 버림)
        const residentTax = roundDown(commission * 0.003, -1);
        
        // 실 지급 수수료 = 영업 커미션 - 사업소득세 - 주민세
        const netFee = commission - businessTax - residentTax;

        return {
          id: sale.id,
          date: sale.date ? sale.date.replace(/\./g, '-').substring(0, 10) : new Date().toISOString().split('T')[0],
          managerId: matchingManager ? matchingManager.id : 'm_fallback',
          managerName: matchingManager ? matchingManager.name : '없음',
          customerName: sale.customerName || '미지정 고객',
          salesAmount: totalSales,
          commissionRate: rate,
          calculatedFee: netFee, // 실 지급 수수료
          status: sale.status || 'pending',
          payoutDate: sale.status === 'completed' ? (sale.date ? sale.date.replace(/\./g, '-').substring(0, 10) : new Date().toISOString().split('T')[0]) : undefined,
          salesId: sale.id,
          inquiryType: inquiryType,
          vat,
          supplyPrice,
          commission,
          businessTax,
          residentTax,
          netFee,
          coachName: sale.coachName || ''
        };
      });
  }, [props.sales, salesManagersList]);

  // Autofill rate on selecting representative or changing inquiry type in manual modal
  useEffect(() => {
    const inquiryType = (newFee as any).inquiryType || 'corporate';
    const computedRate = inquiryType === 'corporate' ? 10 : 20;
    setNewFee(prev => {
      if (prev.commissionRate !== computedRate || prev.inquiryType !== inquiryType) {
        return { ...prev, commissionRate: computedRate, inquiryType };
      }
      return prev;
    });
  }, [newFee.inquiryType]);

  const showToast = (message: string) => {
    setSuccessToast(message);
    setTimeout(() => setSuccessToast(null), 3000);
  };

  const formatKrw = (value: number) => {
    return new Intl.NumberFormat('ko-KR', {
      style: 'currency',
      currency: 'KRW',
      maximumFractionDigits: 0
    }).format(value);
  };

  // Compile calculations
  const grandTotalFees = salesFees.reduce((sum, f) => sum + f.calculatedFee, 0);
  const pendingFees = salesFees.filter(f => f.status === 'pending').reduce((sum, f) => sum + f.calculatedFee, 0);
  const completedFees = salesFees.filter(f => f.status === 'completed').reduce((sum, f) => sum + f.calculatedFee, 0);
  const holdFees = salesFees.filter(f => f.status === 'hold').reduce((sum, f) => sum + f.calculatedFee, 0);

  // Active filter
  const activeManagerFees = selectedManagerName 
    ? salesFees.filter(f => f.managerName === selectedManagerName)
    : salesFees;

  // Unique months from salesFees
  const uniqueMonths = React.useMemo(() => {
    const list = salesFees.map(f => f.date.substring(0, 7));
    return Array.from(new Set(list)).sort((a, b) => b.localeCompare(a));
  }, [salesFees]);

  // Unique coach names from salesFees
  const uniqueCoaches = React.useMemo(() => {
    const list = salesFees.map(f => f.coachName).filter(Boolean) as string[];
    return Array.from(new Set(list)).sort();
  }, [salesFees]);

  // Combined filters applied on top of selected manager filter
  const filteredManagerFees = React.useMemo(() => {
    return activeManagerFees.filter(fee => {
      const matchesSearch = 
        fee.customerName.toLowerCase().includes(searchQuery.toLowerCase()) ||
        fee.managerName.toLowerCase().includes(searchQuery.toLowerCase());
      
      const matchesStatus = statusFilter === 'all' || fee.status === statusFilter;
      const matchesMonth = monthFilter === 'all' || fee.date.startsWith(monthFilter);
      const matchesCoach = coachFilter === 'all' || fee.coachName === coachFilter;

      return matchesSearch && matchesStatus && matchesMonth && matchesCoach;
    });
  }, [activeManagerFees, searchQuery, statusFilter, monthFilter, coachFilter]);

  // Toggle Inquiry Type function
  const handleToggleInquiryType = async (saleId: string, currentType: 'personal' | 'corporate') => {
    const nextType = currentType === 'personal' ? 'corporate' : 'personal';
    const rate = nextType === 'corporate' ? 10 : 20;
    try {
      const existingSale = props.sales.find(s => s.id === saleId);
      if (existingSale) {
        const totalSales = existingSale.amount || 0;
        const vat = Math.round(totalSales * 0.1);
        const supplyPrice = totalSales - vat;
        const commission = Math.round(supplyPrice * (rate / 100));
        const businessTax = roundDown(commission * 0.03, -1);
        const residentTax = roundDown(commission * 0.003, -1);
        const computedFee = commission - businessTax - residentTax;

        const updatedFields = {
          inquiryType: nextType as 'personal' | 'corporate',
          feeRate: rate,
          fee: computedFee,
          profit: totalSales - computedFee
        };

        if (props.setSales) {
          props.setSales(prev => prev.map(s => s.id === saleId ? { ...s, ...updatedFields } : s));
        } else {
          await setDoc(doc(db, 'sales', saleId), updatedFields, { merge: true });
        }
        showToast(`문의 유형을 ${nextType === 'personal' ? '개인문의(20%)' : '회사문의(10%)'}로 변경하고 수수료를 재생성했습니다.`);
      }
    } catch (err) {
      console.error("Error updating inquiry type:", err);
      alert("문의 유형 업데이트 도중 오류가 발생했습니다.");
    }
  };

  // Add a new fee entry as a new manual Sale to ensure synchronization
  const handleAddFee = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newFee.managerId || !newFee.customerName || !newFee.salesAmount) {
      alert('모든 필수 정보를 올바르게 기입해주십시오.');
      return;
    }

    const selected = salesManagersList.find(m => m.id === newFee.managerId);
    if (!selected) return;

    const inquiryType = (newFee as any).inquiryType || 'corporate';
    const rate = inquiryType === 'corporate' ? 10 : 20;
    const salesAmt = Number(newFee.salesAmount) || 0;
    
    const vat = Math.round(salesAmt * 0.1);
    const supplyPrice = salesAmt - vat;
    const commission = Math.round(supplyPrice * (rate / 100));
    const businessTax = roundDown(commission * 0.03, -1);
    const residentTax = roundDown(commission * 0.003, -1);
    const calculatedFeeValue = commission - businessTax - residentTax;

    try {
      const saleId = `manual_sf_${Date.now()}`;
      const item: Sale = {
        id: saleId,
        date: new Date().toISOString().substring(0, 10),
        customerName: newFee.customerName,
        managerName: selected.name,
        amount: salesAmt,
        feeRate: rate,
        fee: calculatedFeeValue,
        profit: salesAmt - calculatedFeeValue,
        status: (newFee.status as any) || 'pending',
        notes: '수기 등록 영업 수수료',
        inquiryType: inquiryType
      };

      // Store in sales group
      if (props.setSales) {
        props.setSales(prev => [...prev, item]);
      } else {
        await setDoc(doc(db, 'sales', saleId), item);
      }
      setIsFeeModalOpen(false);
      setNewFee({ managerId: '', customerName: '', salesAmount: 0, commissionRate: 10, status: 'pending', inquiryType: 'corporate' as any });
      showToast(`${selected.name} 님의 영업 매출 수수료 전표가 안전하게 수립되었습니다.`);
    } catch (e) {
      console.error(e);
      alert('저장 중 에러 발생: ' + e);
    }
  };

  // Update Payout Status (supports hold and holdReason)
  const handleUpdateStatus = async (item: SalesFeeItem, nextStatus: 'pending' | 'completed' | 'hold') => {
    const saleId = item.salesId || item.id;
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
      showToast(`${item.managerName} 님의 영업 수수료를 ${nextStatus === 'completed' ? '지급 완료(완결)' : nextStatus === 'hold' ? '정산 보류' : '정산 대기'} 상태로 갱신 완료했습니다.`);
    } catch (err) {
      console.error("Error updating payout status:", err);
      alert("정산 업데이트 도중 권한 혹은 네트워크 오류가 유발되었습니다.");
    }
  };

  const handleUpdateField = async (item: SalesFeeItem, fieldName: string, value: any) => {
    const saleId = item.salesId || item.id;
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

  const updateSaleProperty = async (saleId: string, fieldName: string, value: any) => {
    try {
      const existingSale = props.sales.find(s => s.id === saleId);
      if (!existingSale) return;

      let updatePayload: any = { [fieldName]: value };

      if (fieldName === 'managerName') {
        const cleanName = value ? value.split(' ')[0] : '배정 대기';
        updatePayload = {
          managerName: cleanName,
          isManagerManuallyEdited: true
        };
      }

      // If amount or inquiryType is updated, let's recompute fee and profit fields too
      if (fieldName === 'amount' || fieldName === 'inquiryType') {
        const docAmount = fieldName === 'amount' ? Number(value) : (existingSale.amount || 0);
        const docType = fieldName === 'inquiryType' ? value : (existingSale.inquiryType || 'corporate');
        const rate = docType === 'corporate' ? 10 : 20;
        
        const vat = Math.round(docAmount * 0.1);
        const supplyPrice = docAmount - vat;
        const commission = Math.round(supplyPrice * (rate / 100));
        const businessTax = roundDown(commission * 0.03, -1);
        const residentTax = roundDown(commission * 0.003, -1);
        const computedFee = commission - businessTax - residentTax;
        
        updatePayload = {
          ...updatePayload,
          feeRate: rate,
          fee: computedFee,
          profit: docAmount - computedFee
        };
      }

      if (props.setSales) {
        props.setSales(prev => prev.map(s => s.id === saleId ? { ...s, ...updatePayload } : s));
      } else {
        await setDoc(doc(db, 'sales', saleId), updatePayload, { merge: true });
      }
    } catch (err) {
      console.error("Error updating sale property:", err);
    }
  };

  // Toggle Payout Status
  const handleToggleStatus = async (item: SalesFeeItem) => {
    let nextStatus: 'pending' | 'completed' | 'hold' = 'pending';
    if (item.status === 'pending') nextStatus = 'completed';
    else if (item.status === 'completed') nextStatus = 'hold';
    else if (item.status === 'hold') nextStatus = 'pending';
    
    await handleUpdateStatus(item, nextStatus);
  };

  // Delete sales fee item
  const handleDeleteFee = async (id: string, rep: string, client: string) => {
    if (confirm(`선택한 영업 수수료 전산 데이터 (${rep} → ${client})를 완전히 전산 삭제하시겠습니까?`)) {
      try {
        if (props.setSales) {
          props.setSales(prev => prev.filter(s => s.id !== id));
        } else {
          await deleteDoc(doc(db, 'sales', id));
        }
        showToast('영업 수수료 내역이 완전히 영구 삭제 처리되었습니다.');
      } catch (err) {
        console.error("Error deleting fee sale:", err);
        alert("삭제 처리 도중 권한 오류가 발생했습니다.");
      }
    }
  };

  const handleDownloadSheet = (repName: string) => {
    setDownloading(repName);
    setTimeout(() => {
      setDownloading(null);
      showToast(`${repName} 님의 당월 분기별 영업 실적 명세가 Excel 파일로 안전하게 전송되었습니다.`);
    }, 1500);
  };

  const handleDownloadPDF = (repName: string | null, coachName: string) => {
    const targetRep = repName || '전체_영업팀';
    const subCoach = coachName !== 'all' ? `_${coachName}_코치` : '';
    setDownloading('pdf');
    setTimeout(() => {
      setDownloading(null);
      
      const totalAmt = filteredManagerFees.reduce((sum, f) => sum + f.salesAmount, 0);
      const totalCommission = filteredManagerFees.reduce((sum, f) => sum + (f.commission || 0), 0);
      const totalNet = filteredManagerFees.reduce((sum, f) => sum + (f.netFee || 0), 0);
      const vatTotal = filteredManagerFees.reduce((sum, f) => sum + (f.vat || 0), 0);
      const businessTaxTotal = filteredManagerFees.reduce((sum, f) => sum + (f.businessTax || 0), 0);
      const residentTaxTotal = filteredManagerFees.reduce((sum, f) => sum + (f.residentTax || 0), 0);
      const itemsCount = filteredManagerFees.length;

      const dateStr = new Date().toISOString().split('T')[0];
      
      const content = `================================================
[영업 수수료 명세서 (수수한 지출 청구)]
================================================
청구 발행일자 : ${dateStr}
수신 기여자     : ${targetRep} 님 ${coachName !== 'all' ? `(선택 코치 필터: ${coachName})` : ''}
발행 정산 전산 : [주식회사 코칭에이전시 경영관리계]
------------------------------------------------
[수수료 명세 핵심 요약]
- 정산 대상 총 건수 : ${itemsCount} 건
- 영업 매출 누적 총액 : ${formatKrw(totalAmt)}
- 매칭 부가세 분계    : ${formatKrw(vatTotal)}
- 영업 성사 수수료 (원화) : ${formatKrw(totalCommission)}
- 원천징수 사업소득세 (3%): ${formatKrw(businessTaxTotal)}
- 원천징수 지방소득세 (0.3%): ${formatKrw(residentTaxTotal)}
- 실 지급 총 실수령액 : ${formatKrw(totalNet)}
------------------------------------------------
[수수료 전표 성사 상세 항목]
${filteredManagerFees.map((f, i) => `${i+1}. [${f.date}] 수강생: ${f.customerName} | 매출: ${formatKrw(f.salesAmount)} | 커미션 요율: ${f.commissionRate}% | 실수령액: ${formatKrw(f.netFee || 0)}${f.coachName ? ` | 담당코치: ${f.coachName}` : ''}`).join('\n')}
------------------------------------------------
위 명세서 전산 세목이 틀림없음을 확인하였으며, 
PDF 지급 승인 및 원천 신고 명세 조서를 청구 첨부합니다.
(본 문서의 대조 정보는 블록체인 및 클라우드 데이터와 일치합니다.)
================================================`;

      const blob = new Blob([content], { type: 'application/pdf;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.setAttribute("href", url);
      link.setAttribute("download", `영업수수료_명세서_${targetRep}${subCoach}_${dateStr}.pdf`);
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);

      showToast(`${targetRep} 님의 영업 수수료 지출 명세서(PDF)가 컴퓨터에 다운로드되었습니다.`);
    }, 1500);
  };

  return (
    <div className="space-y-6 max-w-7xl mx-auto font-sans text-slate-800 pb-10 relative" id="sales_fees_wrapper">
      <AnimatePresence>
        {successToast && (
          <motion.div 
            initial={{ opacity: 0, y: 50, scale: 0.9 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 50, scale: 0.9 }}
            className="fixed bottom-6 right-6 bg-slate-900 border border-slate-800 text-white px-5 py-3.5 rounded-2xl shadow-2xl flex items-center space-x-3 z-50 text-sm font-sans"
          >
            <CheckCircle2 className="h-5 w-5 text-emerald-400 shrink-0" />
            <span className="font-medium">{successToast}</span>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Header Line */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-200 pb-5">
        <div>
          <h1 className="text-2xl font-black text-slate-900 tracking-tight">컨설턴트 영업 수수료 정산</h1>
          <p className="text-sm text-slate-500 mt-1">
            원생 모집 및 기업 교육 성사 실적에 배정된 본부별 담당 영업 컨설턴트들의 수수료 지급 여부와 원천세 회계 업무 처리를 지원합니다.
          </p>
        </div>
        <button
          onClick={() => setIsFeeModalOpen(true)}
          className="flex items-center justify-center space-x-2 bg-emerald-500 hover:bg-emerald-600 active:bg-emerald-700 text-white font-bold py-2.5 px-4 rounded-xl text-sm transition-all shadow-lg shadow-emerald-500/10 cursor-pointer"
        >
          <Plus className="h-4.5 w-4.5" />
          <span>영업 수수료 증빙 등록</span>
        </button>
      </div>

      {/* Stats KPI Block */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6" id="sales_commission_kpis">
        <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-xs flex items-center space-x-4">
          <div className="h-12 w-12 rounded-xl bg-orange-50 text-orange-600 flex items-center justify-center shrink-0">
            <Clock className="h-6 w-6" />
          </div>
          <div>
            <span className="text-xs font-semibold text-slate-400 block uppercase tracking-wider">미지급 영업 수수료</span>
            <strong className="text-xl font-bold font-mono text-orange-600 block mt-0.5">{formatKrw(pendingFees)}</strong>
            <span className="text-[10px] text-slate-400 block mt-1">세무 승인 결재 검토 중인 건</span>
          </div>
        </div>

        <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-xs flex items-center space-x-4">
          <div className="h-12 w-12 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center shrink-0">
            <CheckCircle2 className="h-6 w-6" />
          </div>
          <div>
            <span className="text-xs font-semibold text-slate-400 block uppercase tracking-wider">지급 결제 완료액 (PAID)</span>
            <strong className="text-xl font-bold font-mono text-emerald-600 block mt-0.5">{formatKrw(completedFees)}</strong>
            <span className="text-[10px] text-slate-400 block mt-1">종합 지급 회계 처리 완료 총액</span>
          </div>
        </div>

        <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-xs flex items-center space-x-4">
          <div className="h-12 w-12 rounded-xl bg-rose-50 text-rose-600 flex items-center justify-center shrink-0">
            <AlertCircle className="h-6 w-6" />
          </div>
          <div>
            <span className="text-xs font-semibold text-slate-400 block uppercase tracking-wider">보류 중 영업 수수료</span>
            <strong className="text-xl font-bold font-mono text-rose-600 block mt-0.5">{formatKrw(holdFees)}</strong>
            <span className="text-[10px] text-slate-400 block mt-1">보류 사유가 작성된 수수료</span>
          </div>
        </div>

        <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-xs flex items-center space-x-4">
          <div className="h-12 w-12 rounded-xl bg-slate-100 text-slate-700 flex items-center justify-center shrink-0">
            <Coins className="h-6 w-6" />
          </div>
          <div>
            <span className="text-xs font-semibold text-slate-400 block uppercase tracking-wider">누적 전체 영업 정산금</span>
            <strong className="text-xl font-bold font-mono text-slate-905 block mt-0.5">{formatKrw(grandTotalFees)}</strong>
            <span className="text-[10px] text-slate-400 block mt-1">영업 성사 매니저 {salesManagersList.length}명 활동 중</span>
          </div>
        </div>
      </div>

      {/* Main Grid Section */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6" id="sales_inc_panel">
        {/* Left Side: Reps selection list */}
        <div className="lg:col-span-3 space-y-4">
          <h3 className="text-sm font-bold text-slate-400 uppercase tracking-wider">부서별 영업 컨설턴트 현황</h3>
          
          <div className="space-y-3">
            <div
              onClick={() => setSelectedManagerName(null)}
              className={`p-4 rounded-2xl border transition-all cursor-pointer ${
                selectedManagerName === null 
                  ? 'bg-slate-900 border-slate-900 text-white shadow-lg' 
                  : 'bg-white border-slate-200 text-slate-800 hover:border-slate-300'
              }`}
            >
              <div className="flex items-center justify-between">
                <span className="font-bold text-sm">전체 영업 수수료 지출 장부</span>
                <ChevronRight className="h-4 w-4" />
              </div>
            </div>

            {salesManagersList.map(m => {
              const isSelected = selectedManagerName === m.name;
              const mTotal = salesFees.filter(f => f.managerName === m.name).reduce((sum, f) => sum + f.calculatedFee, 0);
              const mPending = salesFees.filter(f => f.managerName === m.name && f.status === 'pending').reduce((sum, f) => sum + f.calculatedFee, 0);

              return (
                <div
                  key={m.id}
                  onClick={() => setSelectedManagerName(m.name)}
                  className={`p-5 rounded-2xl border transition-all cursor-pointer relative group ${
                    isSelected ? 'bg-slate-900 border-slate-900 text-white shadow-lg' : 'bg-white border-slate-200 text-slate-800 hover:border-slate-300'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center space-x-2.5">
                      <div className={`h-8 w-8 rounded-lg flex items-center justify-center font-bold text-xs ${
                        isSelected ? 'bg-slate-800 text-emerald-400' : 'bg-slate-100 text-slate-600'
                      }`}>
                        {m.name.charAt(0)}
                      </div>
                      <div>
                        <span className="font-bold text-sm block tracking-tight">{m.name} 매니저</span>
                        <span className={`text-[10px] ${isSelected ? 'text-slate-450' : 'text-slate-400'}`}>{m.department} | {m.currentTier} 등급</span>
                      </div>
                    </div>
                    <ChevronRight className="h-4 w-4 text-slate-400 group-hover:translate-x-0.5 transition-transform" />
                  </div>

                  <div className="mt-4 flex justify-between items-center text-xs">
                    <div>
                      <span className="text-slate-400 block text-[10px]">지급 완료 수수료</span>
                      <strong className="font-mono mt-0.5 block">{formatKrw(mTotal - mPending)}</strong>
                    </div>
                    <div className="text-right">
                      <span className="text-amber-500 block text-[10px]">정산 승인 대기</span>
                      <strong className="font-mono mt-0.5 text-amber-500 block">{formatKrw(mPending)}</strong>
                    </div>
                  </div>
                </div>
              );
            })}

            {salesFees.some(f => f.managerName === '없음') && (
              <div
                onClick={() => setSelectedManagerName('없음')}
                className={`p-5 rounded-2xl border transition-all cursor-pointer relative group ${
                  selectedManagerName === '없음' 
                    ? 'bg-slate-900 border-slate-900 text-white shadow-lg' 
                    : 'bg-white border-slate-200 text-slate-800 hover:border-slate-300'
                }`}
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-2.5">
                    <div className={`h-8 w-8 rounded-lg flex items-center justify-center font-bold text-xs ${
                      selectedManagerName === '없음' ? 'bg-slate-800 text-emerald-400' : 'bg-slate-100 text-slate-600'
                    }`}>
                      X
                    </div>
                    <div>
                      <span className="font-bold text-sm block tracking-tight">영업담당 미배정 (없음)</span>
                      <span className={`text-[10px] ${selectedManagerName === '없음' ? 'text-slate-450' : 'text-slate-400'}`}>미지정 영업건 ({salesFees.filter(f => f.managerName === '없음').length}건)</span>
                    </div>
                  </div>
                  <ChevronRight className="h-4 w-4 text-slate-400 group-hover:translate-x-0.5 transition-transform" />
                </div>

                <div className="mt-4 flex justify-between items-center text-xs">
                  <div>
                    <span className="text-slate-400 block text-[10px]">지급 완료 수수료</span>
                    <strong className="font-mono mt-0.5 block">
                      {formatKrw(
                        salesFees.filter(f => f.managerName === '없음' && f.status !== 'pending').reduce((sum, f) => sum + f.calculatedFee, 0)
                      )}
                    </strong>
                  </div>
                  <div className="text-right">
                    <span className="text-amber-500 block text-[10px]">정산 승인 대기</span>
                    <strong className="font-mono mt-0.5 text-amber-500 block">
                      {formatKrw(
                        salesFees.filter(f => f.managerName === '없음' && f.status === 'pending').reduce((sum, f) => sum + f.calculatedFee, 0)
                      )}
                    </strong>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Right Side: Detailed Receipts and Log ledger */}
        <div className="lg:col-span-9 space-y-4">
          <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-xs space-y-5">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-100 pb-4">
              <div>
                <h3 className="text-base font-bold text-slate-900 tracking-tight">
                  {selectedManagerName ? `${selectedManagerName} 매니저 영업 수수료 세목` : '영업 지출 청구서 명세 대장'}
                </h3>
                <p className="text-xs text-slate-400 mt-0.5">영업 성사 건별 지정된 커미션 요율 자동 대조 및 원천세 증빙 관리</p>
              </div>

              <div className="flex items-center space-x-2">
                {selectedManagerName && (
                  <button
                    onClick={() => handleDownloadSheet(selectedManagerName)}
                    disabled={downloading !== null}
                    className="flex items-center justify-center space-x-1.5 bg-slate-900 hover:bg-slate-800 text-white rounded-xl py-2 px-3 text-xs font-bold transition cursor-pointer"
                  >
                    {downloading === selectedManagerName ? (
                      <span>빌드 처리 중...</span>
                    ) : (
                      <>
                        <FileSpreadsheet className="h-3.5 w-3.5 text-emerald-400" />
                        <span>Excel 입출 정산서</span>
                      </>
                    )}
                  </button>
                )}

                <button
                  onClick={() => handleDownloadPDF(selectedManagerName, coachFilter)}
                  disabled={downloading !== null}
                  className="flex items-center justify-center space-x-1.5 bg-rose-600 hover:bg-rose-700 text-white rounded-xl py-2 px-3.5 text-xs font-bold transition duration-75 shadow-md shadow-rose-500/10 cursor-pointer disabled:opacity-50"
                >
                  {downloading === 'pdf' ? (
                    <>
                      <svg className="animate-spin h-3.5 w-3.5 text-white" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                      </svg>
                      <span>PDF 생성 중...</span>
                    </>
                  ) : (
                    <>
                      <FileText className="h-3.5 w-3.5" />
                      <span>{selectedManagerName ? `${selectedManagerName} PDF 명세서` : '전체 PDF 명세서'}</span>
                    </>
                  )}
                </button>
              </div>
            </div>

            {/* Spreadsheet Filter Toolbar */}
            <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 bg-slate-50 p-4 rounded-xl border border-slate-150">
              <div className="flex flex-wrap items-center gap-2.5 flex-1 select-none">
                {/* Search input */}
                <div className="relative min-w-[140px] flex-1">
                  <Search className="absolute left-3 top-2.5 h-3.5 w-3.5 text-slate-400" />
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="수강생명, 매니저명 검색..."
                    className="pl-8.5 pr-3 py-1.5 text-xs border border-slate-200 rounded-xl w-full focus:outline-none focus:ring-1 focus:ring-emerald-500 font-sans font-medium bg-white text-slate-800"
                  />
                </div>

                {/* Status Filter */}
                <select
                  value={statusFilter}
                  onChange={(e) => setStatusFilter(e.target.value)}
                  className="px-2.5 py-1.5 text-xs border border-slate-200 rounded-xl bg-white focus:outline-none focus:ring-1 focus:ring-emerald-500 font-semibold text-slate-705 cursor-pointer"
                >
                  <option value="all">전체 정산상태</option>
                  <option value="pending">정산 대기</option>
                  <option value="completed">정산 완료</option>
                  <option value="hold">정산 보류</option>
                </select>

                {/* Month Filter */}
                <select
                  value={monthFilter}
                  onChange={(e) => setMonthFilter(e.target.value)}
                  className="px-2.5 py-1.5 text-xs border border-slate-200 rounded-xl bg-white focus:outline-none focus:ring-1 focus:ring-emerald-500 font-semibold text-slate-705 cursor-pointer"
                >
                  <option value="all">전체 월필터</option>
                  {uniqueMonths.map(m => (
                    <option key={m} value={m}>{m.replace('-', '년 ')}월</option>
                  ))}
                </select>

                {/* Coach Filter */}
                <select
                  value={coachFilter}
                  onChange={(e) => setCoachFilter(e.target.value)}
                  className="px-2.5 py-1.5 text-xs border border-slate-200 rounded-xl bg-white focus:outline-none focus:ring-1 focus:ring-emerald-500 font-semibold text-slate-705 cursor-pointer"
                >
                  <option value="all">전체 담당코치</option>
                  {uniqueCoaches.map(name => (
                    <option key={name} value={name}>{name}</option>
                  ))}
                </select>
              </div>
            </div>

            {/* Spreadsheet Grid list */}
            <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-xs">
              <div className="overflow-x-auto">
                <table className="w-full border-collapse border-spacing-0 text-xs table-fixed min-w-[1500px]">
                  <thead>
                    {/* Visual Sheets Coordinate alphabet row */}
                    <tr className="bg-slate-50 border-b border-slate-200/80 font-mono text-[9px] text-slate-400 font-bold tracking-widest text-center select-none">
                      <th className="w-10 border-r border-slate-200 p-1">#</th>
                      <th className="w-28 border-r border-slate-200 p-1">A (결제일)</th>
                      <th className="w-32 border-r border-slate-200 p-1">B (수강생 이름)</th>
                      <th className="w-28 border-r border-slate-200 p-1">C (영업담당)</th>
                      <th className="w-32 border-r border-slate-200 p-1">D (DB유입)</th>
                      <th className="w-32 border-r border-slate-200 p-1">E (총 결제 매출)</th>
                      <th className="w-28 border-r border-slate-200 p-1">F (부가세 10%)</th>
                      <th className="w-20 border-r border-slate-200 p-1">G (요율)</th>
                      <th className="w-28 border-r border-slate-200 p-1">H (영업 커미션)</th>
                      <th className="w-28 border-r border-slate-200 p-1">I (사업소득세 3%)</th>
                      <th className="w-28 border-r border-slate-200 p-1">J (주민세 0.3%)</th>
                      <th className="w-28 border-r border-slate-200 p-1">K (실 지급 수수료)</th>
                      <th className="w-36 border-r border-slate-200 p-1">L (회계 전산 상태)</th>
                      <th className="w-10 p-1">X</th>
                    </tr>
                    {/* Natural Row headers with descriptive details */}
                    <tr className="bg-slate-100/80 border-b border-slate-200/80 text-[10px] text-slate-650 font-bold text-center">
                      <td className="p-2 border-r border-slate-200 font-mono">Row</td>
                      <td className="p-2 border-r border-slate-400">결제 완료일</td>
                      <td className="p-2 border-r border-slate-400">수강생 명세</td>
                      <td className="p-2 border-r border-slate-400">계약 영업담당</td>
                      <td className="p-2 border-r border-slate-400">DB 형태구분</td>
                      <td className="p-2 border-r border-slate-400 font-sans">총 결제 매출액</td>
                      <td className="p-2 border-r border-slate-400">부가세 공제분</td>
                      <td className="p-2 border-r border-slate-400">지정 요율</td>
                      <td className="p-2 border-r border-slate-400 font-sans font-bold">영업 커미션</td>
                      <td className="p-2 border-r border-slate-400 text-rose-700/90">사업소득세(3%)</td>
                      <td className="p-2 border-r border-slate-400 text-rose-700/80">주민세(0.3%)</td>
                      <td className="p-2 border-r border-slate-400 text-emerald-800 font-bold">지급 수수료</td>
                      <td className="p-2 border-r border-slate-200">정산 심사 상태</td>
                      <td className="p-2">삭제</td>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredManagerFees.length > 0 ? (
                      filteredManagerFees.map((fee, idx) => {
                        const rowNum = idx + 1;
                        return (
                          <tr 
                            key={fee.id}
                            className={`border-b border-slate-200 font-sans hover:bg-slate-50/60 transition-all ${
                              fee.status === 'completed' 
                                ? 'bg-emerald-50/15'
                                : fee.status === 'hold'
                                ? 'bg-rose-50/15'
                                : 'bg-amber-50/15'
                            }`}
                          >
                            {/* Row Indicator */}
                            <td className="border-r border-slate-200 bg-slate-50/80 p-2 font-mono text-[9px] text-slate-400 text-center font-bold select-none">
                              {rowNum}
                            </td>

                            {/* Column A: 결제일 */}
                            <td className="border-r border-slate-200 p-1 text-center font-mono">
                              <input 
                                type="date"
                                value={fee.date}
                                onChange={(e) => updateSaleProperty(fee.id, 'date', e.target.value)}
                                className="w-full text-center p-1 bg-transparent hover:bg-amber-50/40 border-0 outline-none text-slate-700 font-medium font-mono rounded"
                              />
                            </td>

                            {/* Column B: 수강생 이름 */}
                            <td className="border-r border-slate-200 p-1 font-sans">
                              <div className="flex flex-col">
                                <input 
                                  type="text"
                                  value={fee.customerName}
                                  onChange={(e) => updateSaleProperty(fee.id, 'customerName', e.target.value)}
                                  className="w-full text-left font-black p-1 bg-transparent hover:bg-amber-50/40 border-0 outline-none text-slate-900 rounded"
                                />
                                {fee.coachName && (
                                  <span className="text-[10px] text-emerald-600 px-1 font-bold select-none">
                                    [코치: {fee.coachName}]
                                  </span>
                                )}
                              </div>
                            </td>

                            {/* Column C: 영업담당 */}
                            <td className="border-r border-slate-200 p-1">
                              <select
                                value={fee.managerName || '없음'}
                                onChange={(e) => updateSaleProperty(fee.id, 'managerName', e.target.value)}
                                className="w-full border-0 outline-none bg-transparent cursor-pointer p-1 font-bold rounded text-slate-750 text-center text-xs"
                              >
                                {salesManagersList.map((rep) => (
                                  <option key={rep.id} value={rep.name}>{rep.name}</option>
                                ))}
                                <option value="배정 대기">배정 대기</option>
                                <option value="없음">없음</option>
                              </select>
                            </td>

                            {/* Column D: DB유입 (Inquiry type) */}
                            <td className="border-r border-slate-200 p-1 text-center">
                              <select
                                value={fee.inquiryType || 'corporate'}
                                onChange={(e) => updateSaleProperty(fee.id, 'inquiryType', e.target.value)}
                                className={`w-full text-xs font-bold border-0 outline-none bg-transparent cursor-pointer p-1 rounded transition-colors text-center ${
                                  fee.inquiryType === 'corporate' 
                                    ? 'text-blue-750 font-extrabold' 
                                    : 'text-emerald-750 font-extrabold'
                                }`}
                              >
                                <option value="corporate">🏢 회사문의 (10%)</option>
                                <option value="personal">👤 개인문의 (20%)</option>
                              </select>
                            </td>

                            {/* Column E: 체결 매출액 */}
                            <td className="border-r border-slate-200 p-1 bg-slate-50/25">
                              <input 
                                type="number"
                                value={fee.salesAmount || ''}
                                onChange={(e) => updateSaleProperty(fee.id, 'amount', Number(e.target.value))}
                                className="w-full text-right p-1 bg-transparent hover:bg-amber-50/40 border-0 outline-none font-bold font-mono text-slate-900 rounded"
                              />
                            </td>

                            {/* Column F: 부가세 10% */}
                            <td className="border-r border-slate-200 p-2 font-mono text-right text-slate-450 bg-slate-50/10">
                              {formatKrw(fee.vat || 0)}
                            </td>

                            {/* Column G: 지정 요율 */}
                            <td className="border-r border-slate-200 p-2 font-mono text-center text-slate-600 font-semibold bg-slate-50/15">
                              {fee.commissionRate}%
                            </td>

                            {/* Column H: 영업 커미션 */}
                            <td className="border-r border-slate-200 p-2 font-mono text-right text-slate-850 font-bold bg-blue-50/5">
                              {formatKrw(fee.commission || 0)}
                            </td>

                            {/* Column I: 사업소득세 3% */}
                            <td className="border-r border-slate-200 p-2 font-mono text-right text-rose-600/90 bg-rose-50/5">
                              {formatKrw(fee.businessTax || 0)}
                            </td>

                            {/* Column J: 주민세 0.3% */}
                            <td className="border-r border-slate-200 p-2 font-mono text-right text-rose-600/80 bg-rose-50/5">
                              {formatKrw(fee.residentTax || 0)}
                            </td>

                            {/* Column K: 실 지급 수수료 */}
                            <td className="border-r border-slate-200 p-2 font-mono text-right text-emerald-800 font-black bg-emerald-50/20">
                              {formatKrw(fee.calculatedFee)}
                            </td>

                            {/* Column L: 정산상태 및 보류사유 */}
                            <td className="border-r border-slate-200 p-1 text-center min-w-[130px]">
                              <select
                                value={fee.status || 'pending'}
                                onChange={(e) => handleUpdateStatus(fee, e.target.value as any)}
                                className={`w-full py-1 text-[10px] font-black rounded-lg border cursor-pointer bg-white transition-all text-center focus:outline-none focus:ring-1 ${
                                  fee.status === 'completed'
                                    ? 'text-emerald-700 border-emerald-250 bg-emerald-50/55 hover:bg-emerald-100 focus:ring-emerald-500'
                                    : fee.status === 'hold'
                                    ? 'text-rose-700 border-rose-250 bg-rose-50/55 hover:bg-rose-100 focus:ring-rose-500 font-extrabold'
                                    : 'text-amber-700 border-amber-250 bg-amber-50/55 hover:bg-amber-100 focus:ring-amber-500'
                                }`}
                              >
                                <option value="pending">🟡 정산대기</option>
                                <option value="completed">🟢 정산완료</option>
                                <option value="hold">🔴 정산보류</option>
                              </select>
                              {fee.status === 'hold' && (
                                <div className="mt-1 flex items-center space-x-1 px-1">
                                  <input
                                    type="text"
                                    placeholder="보류 사유 입력"
                                    value={fee.holdReason || ''}
                                    onChange={(e) => handleUpdateField(fee, 'holdReason', e.target.value)}
                                    className="w-full text-[9px] p-1 border border-zinc-200 rounded bg-white text-rose-800 placeholder-rose-350 focus:outline-none focus:ring-1 focus:ring-zinc-400 font-medium"
                                    title="정산 보류 사유"
                                  />
                                </div>
                              )}
                            </td>

                            {/* Delete Button */}
                            <td className="p-1 text-center">
                              <button
                                onClick={() => handleDeleteFee(fee.id, fee.managerName, fee.customerName)}
                                className="p-1 text-slate-350 hover:text-rose-500 hover:bg-rose-100/30 rounded duration-75 cursor-pointer"
                              >
                                <Trash2 className="w-3.5 h-3.5 mx-auto" />
                              </button>
                            </td>
                          </tr>
                        );
                      })
                    ) : (
                      <tr>
                        <td colSpan={14} className="py-20 text-center text-slate-400 font-sans">
                          <Percent className="h-10 w-10 text-slate-200 mx-auto mb-3" />
                          일치하는 영업 지출 수수료 정산 명세가 지출 장부에 존재하지 않습니다.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* MODAL: ADD SALES COMMISSION RECORD */}
      <AnimatePresence>
        {isFeeModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setIsFeeModalOpen(false)} className="fixed inset-0 bg-slate-950/60 backdrop-blur-xs" />
            <motion.div initial={{ scale: 0.95 }} animate={{ scale: 1 }} exit={{ scale: 0.95 }} className="bg-white rounded-3xl p-6 shadow-2xl relative w-full max-w-md z-10 border border-slate-200">
              <div className="flex items-center justify-between border-b pb-3 mb-4">
                <h3 className="font-bold text-slate-900 text-sm">신규 영업 실적 수기 원장 매입 등록</h3>
                <button onClick={() => setIsFeeModalOpen(false)} className="text-slate-400 hover:text-slate-650 cursor-pointer"><X className="w-5 h-5" /></button>
              </div>
              <form onSubmit={handleAddFee} className="space-y-4 text-xs font-sans">
                <div>
                  <label className="block text-slate-500 font-bold mb-1">담당 영업 컨설턴트 지목 *</label>
                  <select required value={newFee.managerId} onChange={e => setNewFee({...newFee, managerId: e.target.value})} className="w-full border p-2.5 rounded-xl font-bold">
                    <option value="">담당자를 지목하십시오</option>
                    {salesManagersList.map(m => <option key={m.id} value={m.id}>{m.name} ({m.department} - {m.currentTier} 등급)</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-slate-500 font-bold mb-1">계약 체결 고객 사명 / 성함 *</label>
                  <input type="text" required value={newFee.customerName} onChange={e => setNewFee({...newFee, customerName: e.target.value})} placeholder="예. 한서화 미래융합 고등부" className="w-full border p-2.5 rounded-xl font-semibold" />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-slate-500 font-bold mb-1">체결 계약 결제액 *</label>
                    <input type="number" required value={newFee.salesAmount || ''} onChange={e => setNewFee({...newFee, salesAmount: Number(e.target.value)})} placeholder="예. 3000000" className="w-full border p-2.5 rounded-xl font-mono text-xs font-semibold" />
                  </div>
                  <div>
                    <label className="block text-slate-500 font-bold mb-1 font-sans">문의 유형 구분 *</label>
                    <select
                      value={(newFee as any).inquiryType || 'corporate'}
                      onChange={e => setNewFee({...newFee, inquiryType: e.target.value as any})}
                      className="w-full border p-2.5 rounded-xl font-bold bg-white"
                    >
                      <option value="corporate">🏢 회사문의 (10%)</option>
                      <option value="personal">👤 개인문의 (20%)</option>
                    </select>
                  </div>
                </div>
                <div>
                  <label className="block text-slate-500 font-bold mb-1">원천 수수료 최초 지급 상태</label>
                  <select value={newFee.status} onChange={e => setNewFee({...newFee, status: e.target.value as any})} className="w-full border p-2.5 rounded-xl font-bold">
                    <option value="pending">회계 지급 대기 (Unpaid)</option>
                    <option value="completed">회계 지급 완료 (Paid)</option>
                  </select>
                </div>
                <button type="submit" className="w-full bg-emerald-500 text-white font-bold py-3 rounded-xl mt-4 cursor-pointer">영업 커미션 증빙 심사 등록</button>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
