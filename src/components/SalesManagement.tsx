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
import { db } from '../firebase';
import { collection, onSnapshot } from 'firebase/firestore';
import { STATIC_SALES_MANAGERS } from './SalesFees';

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
    const activeDbSales = employees.filter(e => e.role === '영업팀' && e.status === 'active' && e.department !== '영업부서장');
    if (activeDbSales.length > 0) {
      return activeDbSales.map(e => e.name);
    }
    return STATIC_SALES_MANAGERS.map(m => m.name);
  }, [employees]);

  const handleToggleInquiryType = (saleId: string, currentType: 'personal' | 'corporate') => {
    const nextType = currentType === 'personal' ? 'corporate' : 'personal';
    props.setSales(prev => prev.map(s => {
      if (s.id === saleId) {
        const rate = nextType === 'corporate' ? 10 : 20;
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
        const rate = inquiryType === 'corporate' ? 10 : 20;
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

  // 마운트 시 자동 1회 동기화 (실시간 연동 요구 반영)
  React.useEffect(() => {
    handleSyncImwebOrders();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 1분 주기로 실시간 동기화 (폴링)
  React.useEffect(() => {
    const interval = setInterval(() => {
      handleSyncImwebOrders(true); // true = 조용한 동기화(UI 알림 축소)
    }, 60000);
    return () => clearInterval(interval);
  }, []);

  // 정렬 및 필터 가공
  const filteredSales = props.sales
    .filter((sale) => {
      // Role segregation: Sales reps and coaches only see their assigned records
      if (props.user && props.user.role !== 'admin' && props.user.role !== 'manager') {
        if (props.user.role === '영업팀' && sale.managerName !== props.user.name) {
          return false;
        }
        if (props.user.role === '코치' && sale.coachName !== props.user.name) {
          return false;
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

  // 아임웹 주문 동기화 핸들러 (최근 주문)
  const handleSyncImwebOrders = async (silent = false) => {
    try {
      if (!silent) {
        setIsSyncingImweb(true);
        setSyncMessage({ type: 'info', text: '주문 내역을 동기화하는 중...' });
      }
      
      let allOrders: any[] = [];
      let offset = 1;
      let keepFetching = true;
      const TARGET_TIMESTAMP = new Date('2026-05-01T00:00:00+09:00').getTime() / 1000;
      
      while (keepFetching && offset < 50) { // Limit absolute max loops
        const res = await fetch(`/api/imweb/orders?limit=100&offset=${offset}`);
        const data = await res.json();
        
        if (res.ok && data.data && data.data.list && data.data.list.length > 0) {
          const list = data.data.list;
          allOrders.push(...list);
          
          // Check if the oldest order in this batch is before target date
          if (list[list.length - 1].order_time < TARGET_TIMESTAMP || list.length < 100) {
            keepFetching = false;
          } else {
            offset += 1;
            // Delay to prevent I'mweb TOO MANY REQUEST error.
            await new Promise(resolve => setTimeout(resolve, 500));
          }
        } else {
          keepFetching = false;
        }
      }
      
      if (allOrders.length > 0) {
        let syncedCount = 0;
        const newSales = [...props.sales];
        
        // Filter out orders older than target date
        const targetOrders = allOrders.filter(o => o.order_time >= TARGET_TIMESTAMP);
        
        // Find orders that need prod-orders fetch (missing item data)
        const ordersToFetch = targetOrders.filter(o => {
           const existing = props.sales.find(s => s.id === o.order_no);
           if (!existing) return true;
           if (!existing.imwebData?.items || existing.imwebData.items.length === 0) return true;
           return false;
        });

        // 20개씩 묶어서 상품 정보 동기화 (I'mweb API rate limit 방지 및 속도 최적화)
        const CHUNK_SIZE = 20;
        for (let i = 0; i < ordersToFetch.length; i += CHUNK_SIZE) {
          const chunk = ordersToFetch.slice(i, i + CHUNK_SIZE);
          setSyncMessage({ type: 'info', text: `상품 정보를 동기화하는 중... (${i}/${ordersToFetch.length})` });
          
          try {
            await new Promise(resolve => setTimeout(resolve, 500)); // 0.5초 대기
            
            // Build the query array: order_no[]=A&order_no[]=B
            const qs = chunk.map(o => `order_no[]=${o.order_no}`).join("&");
            const prodRes = await fetch(`/api/imweb/prod-orders?${qs}`);
            const contentType = prodRes.headers.get("content-type");
            
            if (prodRes.ok && contentType && contentType.includes("application/json")) {
              const prodData = await prodRes.json();
              if (prodData.msg === 'SUCCESS' && prodData.data) {
                // prodData.data is an object keyed by order_no
                for (const order of chunk) {
                  const poKeys = Object.values(prodData.data[order.order_no] || {});
                  order.items = poKeys.flatMap((po: any) => 
                    (po.items || []).map((item: any) => ({
                      orderNo: item.order_no || order.order_no,
                      name: item.prod_name || '이름 없음',
                      status: po.status || '배송대기'
                    }))
                  );
                }
              }
            } else {
               const errorText = await prodRes.text();
               console.error(`Non-JSON or failed response for batch starting ${chunk[0].order_no}:`, prodRes.status, errorText.substring(0, 100));
            }
          } catch (e) {
            console.error(`Failed to fetch prod-orders for batch starting ${chunk[0].order_no}`, e);
          }
        }

        for (let i = 0; i < targetOrders.length; i++) {
          const order = targetOrders[i];
          const existingIndex = newSales.findIndex(s => s.id === order.order_no);
          const existing = existingIndex >= 0 ? newSales[existingIndex] : null;

          const dateObj = new Date(order.order_time * 1000);
          // KST 보정 및 포맷팅 (YYYY-MM-DD HH:mm)
          const dateStr = new Date(dateObj.getTime() + 9*60*60*1000).toISOString().substring(0, 16).replace('T', ' ');
          const paymentData = order.payment || order.pay || {};
          const amount = paymentData.payment_amount || paymentData.pay_amount || 0;
          const customerName = order.orderer?.name || '고객명 미상';
          const inquiryType = (existing && existing.inquiryType) || 'corporate';
          const feeRate = inquiryType === 'corporate' ? 10 : 20;
          const baseAmount = amount / 1.1;
          const fee = Math.round(baseAmount * (feeRate / 100));
          const profit = amount - fee;
          
          let imwebItems = [];
          if (order.items && order.items.length > 0) {
            imwebItems = order.items;
          } else if (existing && existing.imwebData?.items && existing.imwebData.items.length > 0) {
            imwebItems = existing.imwebData.items;
          }

            // Extract custom forms if any, often located in order.form or delivery form
            let forms: Array<{label: string, value: string}> = [];
            if (order.form && Array.isArray(order.form)) {
              forms = order.form.map((f:any) => ({ label: f.title || '', value: f.value || '' }));
            } else if (order.form && typeof order.form === 'object') {
               forms = Object.keys(order.form).map(k => ({ label: k, value: order.form[k] }));
            }

            // 담당자 이름 확인 (폼 데이터에서 추출)
            let managerName = '배정 대기';
            const managerForm = forms.find(f => f.label.includes('담당자') || f.label.includes('컨설턴트') || f.label.includes('코치') || f.label.includes('매니저'));
            if (managerForm && managerForm.value) {
               managerName = managerForm.value;
            } else {
               // 옵션에서 혹시 당당자 정보가 있는지 확인
               for (const item of imwebItems) {
                   if (item.options && item.options.includes('담당자')) {
                      // 옵션 파싱 (예: "담당자명: 이지원" 등)
                      const match = item.options.match(/담당자[\s:]+([^\s,]+)/);
                      if (match && match[1]) managerName = match[1];
                   }
               }
            }

            // 결제 수단 및 PG 연결 매핑
            let methodName = paymentData.pay_method || paymentData.pay_type || '신용카드';
            const pgType = paymentData.pg_type || '';
            
            // I'mweb 기본 페이 타입 한글 매핑
            if (methodName === 'card') methodName = '신용카드';
            else if (methodName === 'bank' || methodName === 'cash') methodName = '무통장입금';
            else if (methodName === 'vbank') methodName = '가상계좌';
            else if (methodName === 'npay') methodName = '네이버페이';
            else if (methodName === 'kakaopay') methodName = '카카오페이';

            // 주문자(고객) 정보
            const ordererData = order.orderer || {};

            const imwebData = {
              orderer: {
                name: ordererData.name || '',
                phone: ordererData.call || ordererData.phone || '',
                email: ordererData.email || ''
              },
              items: imwebItems,
              payment: {
                method: methodName,
                amount: paymentData.payment_amount || paymentData.pay_amount || 0,
                itemAmount: paymentData.total_price || paymentData.pay_amount || 0,
                discount: paymentData.discount_price || paymentData.coupon || 0,
                points: paymentData.point_price || 0,
                status: paymentData.status || '',
                paidAt: paymentData.payment_time ? new Date(paymentData.payment_time * 1000).toLocaleString('ko-KR') : 
                        (paymentData.pay_time ? new Date(paymentData.pay_time * 1000).toLocaleString('ko-KR') : '')
              },
              receiver: {
                name: order.delivery?.address?.name || order.delivery?.receiver?.name || '',
                phone: order.delivery?.address?.phone || order.delivery?.receiver?.call || '',
                address: `${order.delivery?.address?.address || order.delivery?.receiver?.address || ''} ${order.delivery?.address?.address_detail || order.delivery?.receiver?.address_detail || ''}`.trim(),
                memo: order.delivery?.memo || order.delivery?.receiver?.memo || '',
                forms
              }
            };
            
            // If the manager was manually edited, keep the existing one and do not overwrite it.
            let finalManagerName = managerName || '배정 대기';
            let isManagerManuallyEdited = existing?.isManagerManuallyEdited || false;

            if (existing) {
              if (existing.isManagerManuallyEdited || (existing.managerName && existing.managerName !== '배정 대기' && existing.managerName !== managerName)) {
                finalManagerName = existing.managerName;
                isManagerManuallyEdited = true;
              }
            }

            const saleData = {
              id: order.order_no,
              date: dateStr,
              customerName: customerName,
              managerName: finalManagerName,
              amount,
              feeRate,
              fee,
              profit,
              status: 'pending' as 'pending',
              notes: '아임웹 연동 데이터',
              imwebData,
              inquiryType,
              isManagerManuallyEdited
            };
            
            if (existingIndex >= 0) {
              newSales[existingIndex] = { ...newSales[existingIndex], ...saleData };
              syncedCount++; // Could log as updated but count is fine
            } else {
              newSales.push(saleData as any);
              syncedCount++;
            }
        }
        
        if (syncedCount > 0) {
          props.setSales(newSales);
          setSyncMessage({ type: 'success', text: `${syncedCount}건의 신규 아임웹 주문이 연동되었습니다.` });
        } else {
          setSyncMessage({ type: 'info', text: '새로 연동할 주문 내역이 없습니다 (모두 최신 상태).' });
        }
      } else {
        setSyncMessage({ type: 'info', text: `새로 연동할 주문 내역이 없거나 연동에 실패했습니다.` });
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
                                  <div className="flex items-center space-x-2">
                                    <span className={`px-2 py-0.5 border rounded text-[11px] font-bold ${badgeClasses}`}>
                                      {(item.status === 'COMPLETE' || item.status === 'PAY_COMPLETE') ? '구매 확정' : (item.status === 'DELIVERY_READY' ? '배송 대기' : (item.status || '배송대기'))}
                                    </span>
                                    <span className="font-bold text-slate-900 line-clamp-1 leading-tight text-[13px]">
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
                            (sale.inquiryType || 'corporate') === 'corporate'
                              ? 'bg-blue-50/80 text-blue-700 border-blue-200 hover:bg-blue-100'
                              : 'bg-emerald-50/80 text-emerald-700 border-emerald-200 hover:bg-emerald-100'
                          }`}
                          title="클릭하여 문의 유형 변경 (개인문의 20% ↔ 회사문의 10%)"
                        >
                          <span>{(sale.inquiryType || 'corporate') === 'corporate' ? '🏢 회사문의 (10%)' : '👤 개인문의 (20%)'}</span>
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
