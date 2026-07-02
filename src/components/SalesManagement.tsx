/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import { motion } from 'motion/react';
import { 
  Search, 
  Trash2, 
  Check, 
  X,
  ChevronDown, 
  AlertCircle,
  RefreshCw,
  DownloadCloud
} from 'lucide-react';
import { Sale, SystemSettings, User } from '../types';
import { getInquiryRate, INQUIRY_OPTIONS } from '../utils/inquiry';
import { db } from '../firebase';
import { collection, onSnapshot } from 'firebase/firestore';
import { STATIC_SALES_MANAGERS } from './SalesFees';
import { syncImwebOrders } from '../services/imwebSync';

// Excel ROUNDDOWN equivalent helper
const roundDown = (value: number, digits: number): number => {
  const factor = Math.pow(10, digits);
  return Math.floor(value * factor) / factor;
};

interface SalesManagementProps {
  sales: Sale[];
  setSales: React.Dispatch<React.SetStateAction<Sale[]>>;
  settings: SystemSettings;
  user: User;
}

export default function SalesManagement(props: SalesManagementProps) {
  const [searchTerm, setSearchTerm] = useState('');
  const [managerFilter, setManagerFilter] = useState('');
  const [startDateFilter, setStartDateFilter] = useState('');
  const [endDateFilter, setEndDateFilter] = useState('');
  const [sortBy, setSortBy] = useState<'date-desc' | 'date-asc' | 'amount-desc' | 'amount-asc'>('date-desc');

  const [expandedRow, setExpandedRow] = useState<string | null>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const ITEMS_PER_PAGE = 20;

  const [editingSaleId, setEditingSaleId] = useState<string | null>(null);
  const [tempManagerName, setTempManagerName] = useState('');
  const [employees, setEmployees] = useState<any[]>([]);

  // Fetch employees list in real-time
  React.useEffect(() => {
    const unsubscribe = onSnapshot(collection(db, 'employees'), (snapshot) => {
      const emps = snapshot.docs.map(doc => doc.data());
      setEmployees(emps);
    }, (error) => {
      console.error("Firestore employees load error in SalesManagement:", error);
    });
    return () => unsubscribe();
  }, []);

  // Compute active sales managers pool dynamically (role === '영업팀')
  const salesManagers = React.useMemo(() => {
    // 영업팀(영업부서장 제외) + 임원도 영업담당으로 지정 가능하도록 포함
    const activeDbSales = employees.filter(e => e.status === 'active' && ((e.role === '영업팀' && e.department !== '영업부서장') || e.role === '임원'));
    if (activeDbSales.length > 0) {
      return activeDbSales.map(e => e.name);
    }
    return STATIC_SALES_MANAGERS.map(m => m.name);
  }, [employees]);

  const handleToggleInquiryType = (saleId: string, currentType: string) => {
    const nextType: 'personal' | 'corporate' = currentType.startsWith('corporate') ? 'personal' : 'corporate';
    props.setSales(prev => prev.map(s => {
      if (s.id === saleId) {
        const rate = getInquiryRate(nextType);
        const amt = s.amount || 0;
        const vat = Math.round(amt * 0.1);
        const supplyPrice = amt - vat;
        const commission = Math.round(supplyPrice * (rate / 100));
        const businessTax = roundDown(commission * 0.03, -1);
        const residentTax = roundDown(commission * 0.003, -1);
        const computedFee = commission - businessTax - residentTax;
        return {
          ...s,
          inquiryType: nextType,
          feeRate: rate,
          fee: computedFee,
          profit: amt - computedFee
        };
      }
      return s;
    }));
  };

  const handleSaveManagerName = (saleId: string, newName: string) => {
    const trimmedName = newName.trim() || '배정 대기';
    const updatedSales = props.sales.map(s => {
      if (s.id === saleId) {
        const inquiryType = s.inquiryType || 'corporate';
        const rate = getInquiryRate(inquiryType);
        const amt = s.amount || 0;
        const vat = Math.round(amt * 0.1);
        const supplyPrice = amt - vat;
        const commission = Math.round(supplyPrice * (rate / 100));
        const businessTax = roundDown(commission * 0.03, -1);
        const residentTax = roundDown(commission * 0.003, -1);
        const computedFee = commission - businessTax - residentTax;
        return {
          ...s,
          managerName: trimmedName,
          isManagerManuallyEdited: true,
          feeRate: rate,
          fee: computedFee,
          profit: amt - computedFee
        };
      }
      return s;
    });
    props.setSales(updatedSales);
    setEditingSaleId(null);
    setSyncMessage({ type: 'success', text: '담당자가 성공적으로 수정되었습니다.' });
    setTimeout(() => setSyncMessage(null), 3000);
  };

  React.useEffect(() => {
    setCurrentPage(1);
  }, [searchTerm, managerFilter, startDateFilter, endDateFilter, sortBy]);

  const [isSyncingImweb, setIsSyncingImweb] = useState(false);
  const [syncMessage, setSyncMessage] = useState<{ type: 'success' | 'error' | 'info'; text: string } | null>(null);

  // 과거 CRM용 더미 데이터가 있으면 필터링/삭제 (단, 수기 수수료 등록 세일은 유지)
  React.useEffect(() => {
    const legacySalesExist = props.sales.some(s => !s.imwebData && !s.id.startsWith('manual_sf_') && s.notes !== '수기 등록 영업 수수료');
    if (legacySalesExist) {
      const validSales = props.sales.filter(s => !!s.imwebData || s.id.startsWith('manual_sf_') || s.notes === '수기 등록 영업 수수료');
      props.setSales(validSales);
    }
  }, [props.sales, props.setSales]);

  // 자동 동기화는 App 레벨(useImwebAutoSync)에서 탭과 무관하게 전역으로 수행된다.
  // 따라서 이 화면에서는 마운트/폴링 자동 동기화를 두지 않고, 즉시 갱신이 필요하면
  // 상단의 "아임웹 최신 주문 동기화" 버튼(수동)을 사용한다.

  // 정렬 및 필터 가공
  const filteredSales = props.sales
    .filter((sale) => {
      // Role segregation: 임원(admin)/manager 외에는 본인 담당 건만 표시
      if (props.user && props.user.role !== 'admin' && props.user.role !== 'manager') {
        const myName = (props.user.name || '').trim().toLowerCase();
        if (props.user.role === '영업팀') {
          if ((sale.managerName || '').trim().toLowerCase() !== myName) return false;
        } else if (props.user.role === '코치') {
          if ((sale.coachName || '').trim().toLowerCase() !== myName) return false;
        } else {
          return false; // 알 수 없는 역할은 비공개
        }
      }

      const matchesSearch = 
        sale.customerName.toLowerCase().includes(searchTerm.toLowerCase()) ||
        sale.id.toLowerCase().includes(searchTerm.toLowerCase());
      
      const matchesManager = managerFilter === '' || sale.managerName.toLowerCase().includes(managerFilter.toLowerCase());
      
      let matchesDate = true;
      if (startDateFilter || endDateFilter) {
        const saleDay = sale.date.replace(/\./g, '-').substring(0, 10);
        const matchesStart = !startDateFilter || saleDay >= startDateFilter;
        const matchesEnd = !endDateFilter || saleDay <= endDateFilter;
        matchesDate = matchesStart && matchesEnd;
      }
      
      return matchesSearch && matchesManager && matchesDate;
    })
    .sort((a, b) => {
      switch (sortBy) {
        case 'date-desc':
          return b.date.localeCompare(a.date);
        case 'date-asc':
          return a.date.localeCompare(b.date);
        case 'amount-desc':
          return b.amount - a.amount;
        case 'amount-asc':
          return a.amount - b.amount;
        default:
          return 0;
      }
    });

  const totalPages = Math.ceil(filteredSales.length / ITEMS_PER_PAGE);
  const paginatedSales = filteredSales.slice((currentPage - 1) * ITEMS_PER_PAGE, currentPage * ITEMS_PER_PAGE);

  // 아임웹 주문 동기화 핸들러 (수동 버튼). 실제 동기화 로직은 공용 서비스(syncImwebOrders)에
  // 위임하고, 이 화면에서는 진행/결과 메시지만 표시한다.
  const handleSyncImwebOrders = async () => {
    try {
      setIsSyncingImweb(true);
      setSyncMessage({ type: 'info', text: '주문 내역을 동기화하는 중...' });

      const result = await syncImwebOrders(props.sales, (text) => {
        setSyncMessage({ type: 'info', text });
      });

      if (result.error) {
        setSyncMessage({ type: 'error', text: `아임웹 연동 실패: ${result.error}` });
        setTimeout(() => setSyncMessage(null), 8000);
        return;
      }

      if (result.syncedCount > 0) {
        props.setSales(result.sales);
        setSyncMessage({ type: 'success', text: `${result.syncedCount}건의 아임웹 주문이 연동되었습니다.` });
      } else {
        setSyncMessage({ type: 'info', text: '새로 연동할 주문 내역이 없습니다 (모두 최신 상태).' });
      }
    } catch (err) {
      console.error(err);
      setSyncMessage({ type: 'error', text: '서버 연결 중 오류가 발생했습니다.' });
    } finally {
      setTimeout(() => setSyncMessage(null), 5000);
      setIsSyncingImweb(false);
    }
  };

  // 내역 초기화 핸들러
  const handleClearSales = async () => {
    if (window.confirm('모든 주문 내역을 초기화하시겠습니까? (이 작업은 Firebase에서도 삭제합니다.)')) {
      try {
        // We only clear UI via props.setSales, but realistically we need to tell App.tsx effectively,
        // or just delete directly using firebase
        props.setSales([]);
        setSyncMessage({ type: 'success', text: '주문 내역이 모두 초기화되고 있습니다.' });
        
        // Notify parent to delete if it supports it, or handle it in App.tsx
        setTimeout(() => setSyncMessage(null), 3000);
      } catch (err) {
        console.error(err);
      }
    }
  };

  // 원화 가독성을 위한 함수
  const formatKrw = (value: number) => {
    return new Intl.NumberFormat('ko-KR', {
      style: 'currency',
      currency: 'KRW',
      maximumFractionDigits: 0,
    }).format(value);
  };

  return (
    <div className="space-y-6 max-w-7xl mx-auto font-sans text-slate-800 pb-10" id="sales_mgmt_wrapper">
      {/* Upper Title Area */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-200 pb-5">
        <div>
          <h1 className="text-2xl font-black text-slate-900 tracking-tight">아임웹 주문 연동</h1>
          <p className="text-sm text-slate-500 mt-1">
            아임웹의 쇼핑 주문 내역을 시스템에 실시간으로 연동하여 관리합니다.
          </p>
          {syncMessage && (
            <div className={`mt-3 inline-flex items-center px-3 py-1.5 rounded-lg text-xs font-bold space-x-1.5 ${
              syncMessage.type === 'success' ? 'bg-emerald-50 text-emerald-700' :
              syncMessage.type === 'error' ? 'bg-red-50 text-red-700' :
              'bg-blue-50 text-blue-700'
            }`}>
              {syncMessage.type === 'success' && <Check className="h-4 w-4" />}
              {syncMessage.type === 'error' && <AlertCircle className="h-4 w-4" />}
              {syncMessage.type === 'info' && <RefreshCw className="h-4 w-4" />}
              <span>{syncMessage.text}</span>
            </div>
          )}
        </div>
        
        <div className="flex items-center space-x-3 self-start sm:self-auto">
          <button
            onClick={handleClearSales}
            className="flex items-center justify-center space-x-2 bg-white hover:bg-slate-50 border border-slate-200 text-slate-700 font-bold py-3 px-4 rounded-xl shadow-xs transition-colors duration-150 cursor-pointer"
          >
            <Trash2 className="h-5 w-5 text-slate-400" />
            <span>내역 초기화</span>
          </button>
          <button
            onClick={handleSyncImwebOrders}
            disabled={isSyncingImweb}
            className="flex items-center justify-center space-x-2 bg-emerald-500 hover:bg-emerald-600 active:bg-emerald-700 text-white font-bold py-3 px-5 rounded-xl shadow-md shadow-emerald-500/10 transition-colors duration-150 cursor-pointer disabled:opacity-50"
          >
            {isSyncingImweb ? (
              <RefreshCw className="h-5 w-5 animate-spin text-emerald-100" />
            ) : (
              <DownloadCloud className="h-5 w-5" />
            )}
            <span>아임웹 최신 주문 동기화</span>
          </button>
        </div>
      </div>

      {/* Main Container */}
      <div className="bg-white border border-slate-200 shadow-sm rounded-sm" id="sales_table_container">
        
        {/* Top Header of Table Container (Filters) */}
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center px-4 py-3 border-b border-slate-200 gap-4">
          <div className="flex items-center space-x-2 font-bold text-lg text-slate-800">
            <span>주문 내역</span>
            <span className="bg-slate-200 text-slate-600 px-2 py-0.5 rounded-full text-sm font-semibold select-none">{filteredSales.length}</span>
          </div>
          <div className="flex flex-wrap items-center gap-2 w-full md:w-auto">
            {/* Manager Filter */}
            <div className="relative w-full sm:w-auto">
              <input
                type="text"
                placeholder="담당자 검색"
                value={managerFilter}
                onChange={(e) => setManagerFilter(e.target.value)}
                className="block w-full sm:w-32 px-3 py-1.5 bg-white border border-slate-300 rounded text-sm text-slate-800 focus:outline-none focus:border-slate-500 transition-colors placeholder:text-slate-400"
              />
            </div>
            
            {/* Date Range Filter */}
            <div className="flex items-center gap-1.5 bg-white border border-slate-300 rounded px-2.5 py-1 flex-wrap sm:flex-nowrap">
              <input
                type="date"
                value={startDateFilter}
                onChange={(e) => setStartDateFilter(e.target.value)}
                placeholder="시작일"
                className="bg-transparent border-none text-sm text-slate-800 focus:outline-none w-32 text-slate-500 p-0 text-center"
              />
              <span className="text-slate-400 font-medium select-none">~</span>
              <input
                type="date"
                value={endDateFilter}
                onChange={(e) => setEndDateFilter(e.target.value)}
                placeholder="종료일"
                className="bg-transparent border-none text-sm text-slate-800 focus:outline-none w-32 text-slate-500 p-0 text-center"
              />
              {(startDateFilter || endDateFilter) && (
                <button
                  type="button"
                  onClick={() => {
                    setStartDateFilter('');
                    setEndDateFilter('');
                  }}
                  className="text-slate-400 hover:text-slate-600 p-0.5 rounded-full hover:bg-slate-100 transition-colors cursor-pointer"
                  title="기간 필터 초기화"
                >
                  <X className="h-4 w-4" />
                </button>
              )}
            </div>

            <div className="relative flex-1 sm:flex-none sm:w-64">
              <span className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-400">
                <Search className="h-4 w-4" />
              </span>
              <input
                type="text"
                placeholder="이름, 주문번호 등 검색"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="block w-full pl-9 pr-3 py-1.5 bg-white border border-slate-300 rounded text-sm text-slate-800 focus:outline-none focus:border-slate-500 transition-colors placeholder:text-slate-400"
              />
            </div>
          </div>
        </div>

        {/* Table itself */}
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm border-collapse min-w-[1000px]">
            <thead>
              <tr className="border-b-2 border-slate-200 text-slate-500 font-medium text-xs bg-white">
                <th className="py-3 px-4 w-12 text-center align-middle">
                  <input type="checkbox" className="rounded border-slate-300 accent-blue-600 w-4 h-4" />
                </th>
                <th className="py-3 px-4 font-medium min-w-[120px]">결제일시</th>
                <th className="py-3 px-4 font-medium">이름</th>
                <th className="py-3 px-4 font-medium">연락처</th>
                <th className="py-3 px-4 font-medium">이메일</th>
                <th className="py-3 px-4 font-medium w-1/4">품목·가격·수량</th>
                <th className="py-3 px-4 text-right font-medium">결제금액</th>
                <th className="py-3 px-4 font-medium">결제방식</th>
                <th className="py-3 px-4 text-center font-medium">문의 유형</th>
                <th className="py-3 px-4 text-center font-medium">담당자 이름</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              {paginatedSales.length > 0 ? (
                paginatedSales.map((sale) => {
                  const imweb = sale.imwebData;
                  
                  // fallback
                  const ordererName = imweb?.orderer?.name || sale.customerName;
                  const ordererPhone = imweb?.orderer?.phone || '-';
                  const ordererEmail = imweb?.orderer?.email || '-';
                  const items = imweb?.items || [];
                  const amount = imweb?.payment?.amount || sale.amount || 0;
                  const rawPaymentMethod = imweb?.payment?.method || '-';
                  const paymentMethod = rawPaymentMethod.replace(/\s*\(.*\)/, '');
                  
                  // Extract manager from forms or memo if not already explicitly assigned
                  let finalManager = sale.managerName;
                  if (!finalManager || finalManager === '배정 대기') {
                    const forms = imweb?.receiver?.forms || [];
                    const memo = imweb?.receiver?.memo || '';
                    
                    // 1. Try to find in forms
                    const managerForm = forms.find(f => f.label.includes('담당자') || f.label.includes('컨설턴트') || f.label.includes('코치') || f.label.includes('매니저'));
                    if (managerForm && managerForm.value) {
                       finalManager = managerForm.value;
                    } else if (memo) {
                       // 2. Try to find in memo
                       const memoMatch = memo.match(/(?:담당자|컨설턴트|코치|매니저)[\s:]*([^\s,]+)/);
                       if (memoMatch && memoMatch[1]) {
                          finalManager = memoMatch[1];
                       } else {
                          // 3. Set simply memo text if it's very short, as sometimes it just holds the name.
                          if (memo.length > 1 && memo.length < 10 && !memo.includes('부탁')) {
                             finalManager = memo.trim();
                          }
                       }
                    }
                  }

                  return (
                    <tr key={sale.id} className="bg-white hover:bg-slate-50/50 align-middle transition-colors">
                      <td className="py-4 px-4 text-center">
                        <input type="checkbox" className="rounded border-slate-300 accent-blue-600 w-4 h-4" />
                      </td>
                      <td className="py-4 px-4 text-slate-500 font-mono text-[12px] whitespace-nowrap">
                        {sale.date}
                      </td>
                      <td className="py-4 px-4 font-semibold text-slate-800 text-sm">
                        {ordererName}
                      </td>
                      <td className="py-4 px-4 font-mono text-slate-600 text-[13px]">
                        {ordererPhone}
                      </td>
                      <td className="py-4 px-4 text-slate-500 text-[13px]">
                        {ordererEmail}
                      </td>
                      <td className="py-4 px-4 text-[13px] text-slate-800 text-wrap leading-snug">
                        {items?.length > 0 ? (
                          <div className="flex flex-col space-y-3">
                            {items.map((item: any, idx: number) => {
                              const isShipping = item.status?.includes('배송') || item.status === '배송대기' || item.status === 'COMPLETE' || item.status === 'PAY_COMPLETE';
                              const badgeClasses = isShipping 
                                ? 'text-[#00a8ff] border-[#00a8ff]' 
                                : 'text-slate-500 border-slate-300';
                                
                              return (
                                <div key={idx} className="flex flex-col space-y-1">
                                  <div className="flex items-start space-x-2">
                                    <span className={`px-2 py-0.5 border rounded text-[11px] font-bold whitespace-nowrap shrink-0 ${badgeClasses}`}>
                                      {(item.status === 'COMPLETE' || item.status === 'PAY_COMPLETE') ? '구매 확정' : (item.status === 'DELIVERY_READY' ? '배송 대기' : (item.status || '배송대기'))}
                                    </span>
                                    <span className="font-bold text-slate-900 leading-snug text-[13px] flex-1 min-w-0 break-keep [overflow-wrap:anywhere]">
                                      {item.name || item.prod_name || '이름 없음'}
                                    </span>
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        ) : (
                          <span className="text-slate-400 font-normal">상품 정보 없음</span>
                        )}
                      </td>
                      <td className="py-4 px-4 text-right font-bold text-slate-900 text-sm tabular-nums">
                        {formatKrw(amount)}
                      </td>
                      <td className="py-4 px-4 text-slate-600 text-[13px]">
                        {paymentMethod}
                      </td>
                      <td className="py-4 px-4 text-center">
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            handleToggleInquiryType(sale.id, sale.inquiryType || 'corporate');
                          }}
                          className={`inline-flex items-center space-x-1.5 px-3 py-1 font-extrabold text-xs rounded-full border cursor-pointer transition-all ${
                            (sale.inquiryType || 'corporate').startsWith('corporate')
                              ? 'bg-blue-50/80 text-blue-700 border-blue-200 hover:bg-blue-100'
                              : 'bg-emerald-50/80 text-emerald-700 border-emerald-200 hover:bg-emerald-100'
                          }`}
                          title="클릭하여 문의 유형(회사문의/개인문의) 변경"
                        >
                          <span>{(INQUIRY_OPTIONS.find(o => o.value === (sale.inquiryType || 'corporate'))?.label) || '🏢 회사문의 (10%)'}</span>
                        </button>
                      </td>
                      <td className="py-4 px-4 text-center">
                        {editingSaleId === sale.id ? (
                          <div className="flex items-center justify-center space-x-1" onClick={(e) => e.stopPropagation()}>
                            <select
                              value={tempManagerName}
                              onChange={(e) => setTempManagerName(e.target.value)}
                              className="px-2 py-1 text-xs border border-slate-300 rounded focus:outline-none focus:ring-1 focus:ring-blue-500 w-28 text-center font-medium bg-white"
                              autoFocus
                            >
                              <option value="배정 대기">배정 대기</option>
                              {salesManagers.map(name => (
                                <option key={name} value={name}>{name}</option>
                              ))}
                              <option value="없음">없음</option>
                            </select>
                            <button
                              onClick={() => handleSaveManagerName(sale.id, tempManagerName)}
                              className="p-1 text-emerald-600 hover:text-emerald-700 hover:bg-emerald-50 rounded transition-colors cursor-pointer"
                              title="저장"
                            >
                              <Check className="h-3.5 w-3.5" />
                            </button>
                            <button
                              onClick={() => setEditingSaleId(null)}
                              className="p-1 text-rose-600 hover:text-rose-700 hover:bg-rose-50 rounded transition-colors cursor-pointer"
                              title="취소"
                            >
                              <X className="h-3.5 w-3.5" />
                            </button>
                          </div>
                        ) : (
                          <div 
                            onClick={(e) => {
                              e.stopPropagation();
                              if (props.user && props.user.role !== 'admin' && props.user.role !== 'manager') {
                                return; // Disabled for non-admin
                              }
                              setEditingSaleId(sale.id);
                              setTempManagerName(finalManager);
                            }}
                            className={`group inline-flex items-center space-x-1 px-2.5 py-1 ${
                              (props.user && props.user.role !== 'admin' && props.user.role !== 'manager')
                                ? 'bg-slate-50 text-slate-500 border-slate-200/50 cursor-default'
                                : 'bg-slate-100/80 hover:bg-white text-slate-600 hover:text-slate-900 border border-slate-200 cursor-pointer'
                            } text-[13px] font-medium rounded-full transition-all duration-75 border`}
                            title={(props.user && props.user.role !== 'admin' && props.user.role !== 'manager') ? undefined : "클릭하여 담당자 이름 수정"}
                          >
                            <span>{finalManager}</span>
                            {!(props.user && props.user.role !== 'admin' && props.user.role !== 'manager') && (
                              <span className="opacity-0 group-hover:opacity-100 text-slate-400 text-[10px] ml-1 duration-100 transition-opacity">✎</span>
                            )}
                          </div>
                        )}
                      </td>
                    </tr>
                  )
                })
              ) : (
                <tr>
                  <td colSpan={9} className="py-24 text-center text-slate-400">
                    <p className="font-semibold text-base mb-2">주문 내역이 존재하지 않습니다.</p>
                    <p className="text-sm">우측 상단의 동기화 버튼을 눌러보세요.</p>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="flex items-center justify-center py-4 border-t border-slate-200 bg-white space-x-1">
            <button
              onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
              disabled={currentPage === 1}
              className="px-3 py-1 text-sm font-medium text-slate-500 bg-white border border-slate-300 rounded-md hover:bg-slate-50 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              이전
            </button>
            <div className="flex items-center space-x-1 px-4">
              {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                // Show up to 5 surrounding pages
                let pageNum = currentPage;
                // simple logic to show around current page
                if (totalPages <= 5) pageNum = i + 1;
                else if (currentPage <= 3) pageNum = i + 1;
                else if (currentPage >= totalPages - 2) pageNum = totalPages - 4 + i;
                else pageNum = currentPage - 2 + i;
                
                return (
                  <button
                    key={pageNum}
                    onClick={() => setCurrentPage(pageNum)}
                    className={`min-w-[32px] px-2 py-1 text-sm font-medium rounded-md ${
                      currentPage === pageNum
                        ? 'bg-blue-600 text-white'
                        : 'text-slate-700 hover:bg-slate-100'
                    }`}
                  >
                    {pageNum}
                  </button>
                );
              })}
            </div>
            <button
              onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
              disabled={currentPage === totalPages}
              className="px-3 py-1 text-sm font-medium text-slate-500 bg-white border border-slate-300 rounded-md hover:bg-slate-50 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              다음
            </button>
          </div>
        )}
        
        {/* Table Footer Stats Summary */}
        <div className="bg-slate-50 border-t border-slate-100 px-6 py-4 flex flex-col sm:flex-row justify-between items-center text-xs text-slate-500 gap-4" id="table_summary_stats">
          <span>불러온 총 주문 건수: <strong className="text-slate-800 font-mono font-bold">{filteredSales.length}</strong>건</span>
          <div className="flex flex-wrap gap-4 justify-end font-mono">
            <span>총 결제금액: <strong className="text-emerald-600 font-bold text-sm tracking-tight font-black">{formatKrw(filteredSales.reduce((s, i) => s + (i.amount || 0), 0))}</strong></span>
          </div>
        </div>
      </div>
    </div>
  );
}
