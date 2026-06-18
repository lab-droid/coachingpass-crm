/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import { motion } from 'motion/react';
import { 
  BarChart, 
  Bar, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  Legend, 
  ResponsiveContainer,
  ComposedChart,
  Area,
  Line
} from 'recharts';
import { 
  Calendar, 
  Filter, 
  FileSpreadsheet, 
  FileDown, 
  TrendingUp, 
  Users, 
  Coins, 
  ArrowUpRight,
  Printer
} from 'lucide-react';
import { Sale, SystemSettings } from '../types';
import { MANAGERS } from '../data/mockData';

interface AnalyticsProps {
  sales: Sale[];
  settings: SystemSettings;
}

export default function Analytics(props: AnalyticsProps) {
  // 기본 필터 세팅 (최근 3개월 날짜)
  const [startDate, setStartDate] = useState('2026-04-01');
  const [endDate, setEndDate] = useState('2026-06-30');
  const [selectedManager, setSelectedManager] = useState('all');

  // Extract unique manager names from the actual sales records
  const uniqueManagerNamesInSales = React.useMemo(() => {
    const names = new Set<string>();
    props.sales.forEach(s => {
      if (s.managerName && s.managerName !== '배정 대기') {
        const cleanName = s.managerName.split(' ')[0];
        names.add(cleanName);
      }
    });
    return Array.from(names);
  }, [props.sales]);

  // 필터 통과한 매출 데이터 산출
  const filteredSales = props.sales.filter((sale) => {
    const saleDate = sale.date;
    const matchesDate = saleDate >= startDate && saleDate <= endDate;
    const matchesManager = selectedManager === 'all' || 
      (sale.managerName === selectedManager || sale.managerName?.startsWith(selectedManager));
    return matchesDate && matchesManager;
  });

  // 핵심 계량 수치
  const totalSales = filteredSales.reduce((sum, s) => sum + s.amount, 0);
  const totalProfit = filteredSales.reduce((sum, s) => sum + s.profit, 0);
  const totalFee = filteredSales.reduce((sum, s) => sum + s.fee, 0);
  const averageFeeRate = filteredSales.length > 0 
    ? filteredSales.reduce((sum, s) => sum + s.feeRate, 0) / filteredSales.length
    : 0;

  // 담당자별 매출 및 영업이익 요약 데이터 (차트용)
  const managerCompareData = uniqueManagerNamesInSales.map((cleanName) => {
    const managerSales = filteredSales.filter((s) => s.managerName === cleanName || s.managerName?.startsWith(cleanName));
    return {
      shortName: cleanName,
      fullName: cleanName,
      sales: managerSales.reduce((sum, s) => sum + s.amount, 0),
      profit: managerSales.reduce((sum, s) => sum + s.profit, 0),
      fee: managerSales.reduce((sum, s) => sum + s.fee, 0),
    };
  }).filter((d) => d.sales > 0); // 실적 있는 담당자만 노출

  // 월별 매출 추이
  const monthlyDataMap = filteredSales.reduce((acc: any, sale) => {
    const month = sale.date.substring(0, 7); // "2026-05"
    if (!acc[month]) {
      acc[month] = { month, sales: 0, profit: 0, fee: 0 };
    }
    acc[month].sales += sale.amount;
    acc[month].profit += sale.profit;
    acc[month].fee += sale.fee;
    return acc;
  }, {});

  const monthlyTrendData = Object.values(monthlyDataMap).sort((a: any, b: any) => a.month.localeCompare(b.month));

  const formatKrw = (value: number) => {
    return new Intl.NumberFormat('ko-KR', {
      style: 'currency',
      currency: 'KRW',
      maximumFractionDigits: 0,
    }).format(value);
  };

  // Recharts custom tooltip style
  const CustomTooltip = ({ active, payload, label }: any) => {
    if (active && payload && payload.length) {
      return (
        <div className="bg-slate-900 border border-slate-800 p-4 rounded-xl shadow-xl text-xs text-white">
          <p className="font-bold border-b border-slate-800 pb-1.5 mb-2 text-slate-300">{label}</p>
          {payload.map((entry: any, index: number) => (
            <div key={index} className="flex items-center space-x-4 justify-between my-1">
              <span className="text-slate-400 font-medium">{entry.name}:</span>
              <span className="font-mono font-bold text-emerald-400">
                {formatKrw(entry.value)}
              </span>
            </div>
          ))}
        </div>
      );
    }
    return null;
  };

  const handlePrint = () => {
    window.print();
  };

  return (
    <div className="space-y-6 max-w-7xl mx-auto font-sans text-slate-800 pb-10" id="analytics_report_wrapper">
      {/* Upper Header Area */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-200 pb-5">
        <div>
          <h1 className="text-2xl font-black text-slate-900 tracking-tight">심층 실적 분석 및 경영 보고서</h1>
          <p className="text-sm text-slate-500 mt-1">
            필터링된 기간과 세부 담당자 조건에 연동되어 실시간 매출 성장 추이와 파트너별 영업 효율성을 도출합니다.
          </p>
        </div>
        
        {/* Export / Print Actions */}
        <div className="flex items-center space-x-2 self-start md:self-auto">
          <button
            onClick={handlePrint}
            className="flex items-center justify-center space-x-1.5 bg-white border border-slate-200 text-slate-700 hover:bg-slate-50 font-semibold py-2.5 px-4 rounded-xl text-xs shadow-xs transition-colors duration-100 cursor-pointer"
          >
            <Printer className="h-4 w-4" />
            <span>보고서 인쇄</span>
          </button>
        </div>
      </div>

      {/* Date & Partner Selector Filter Card */}
      <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-xs" id="analytics_filter_card">
        <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-4 flex items-center space-x-1.5">
          <Filter className="h-4 w-4" />
          <span>기간 범위 및 대상 필터링 시스템</span>
        </h3>
        
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {/* Start Date */}
          <div>
            <label className="block text-xs font-bold text-slate-600 mb-1.5">시작 일자</label>
            <div className="relative rounded-md shadow-xs">
              <input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className="block w-full px-3 py-2 border border-slate-200 bg-slate-50 text-slate-800 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-colors"
              />
            </div>
          </div>

          {/* End Date */}
          <div>
            <label className="block text-xs font-bold text-slate-600 mb-1.5">종료 일자</label>
            <div className="relative rounded-md shadow-xs">
              <input
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                className="block w-full px-3 py-2 border border-slate-200 bg-slate-50 text-slate-800 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-colors"
              />
            </div>
          </div>

          {/* Manager Specific */}
          <div>
            <label className="block text-xs font-bold text-slate-600 mb-1.5">진행 컨설턴트 지정</label>
            <select
              value={selectedManager}
              onChange={(e) => setSelectedManager(e.target.value)}
              className="block w-full px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-lg text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-colors"
            >
              <option value="all">전체 파트너 종합</option>
              {uniqueManagerNamesInSales.map((m) => (
                <option key={m} value={m}>{m}</option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {/* Aggregated Filter Values Display cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6" id="analytics_data_grid">
        <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-xs">
          <span className="text-xs text-slate-400 font-semibold uppercase tracking-wider block">선택 기간 총 거래계약</span>
          <strong className="text-2xl font-black font-mono mt-1 block text-slate-950">{filteredSales.length}건</strong>
        </div>

        <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-xs">
          <span className="text-xs text-slate-400 font-semibold uppercase tracking-wider block">실시간 누적 총 매출</span>
          <strong className="text-2xl font-black font-mono mt-1 block text-slate-950">{formatKrw(totalSales)}</strong>
        </div>

        <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-xs">
          <span className="text-xs text-slate-400 font-semibold uppercase tracking-wider block">회수 실 영업이익</span>
          <strong className="text-2xl font-black font-mono mt-1 block text-emerald-600">{formatKrw(totalProfit)}</strong>
        </div>

        <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-xs">
          <span className="text-xs text-slate-400 font-semibold uppercase tracking-wider block">평균 수수료율</span>
          <strong className="text-2xl font-black font-mono mt-1 block text-slate-950">{averageFeeRate.toFixed(1)}%</strong>
        </div>
      </div>

      {/* Analytics chart and insights */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6" id="analytics_charts_group">
        {/* Chart 1: Month/period trend comparison (Composed area chart) */}
        <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-xs">
          <h3 className="text-sm font-bold text-slate-900 mb-4 tracking-tight">지정 기간 내 분기 영업 추이 분석</h3>
          <div className="h-72 w-full">
            {monthlyTrendData.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <ComposedChart data={monthlyTrendData}>
                  <defs>
                    <linearGradient id="salesGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#10B981" stopOpacity={0.2} />
                      <stop offset="95%" stopColor="#10B981" stopOpacity={0.01} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                  <XAxis dataKey="month" stroke="#94a3b8" fontSize={11} tickLine={false} />
                  <YAxis stroke="#94a3b8" fontSize={11} tickLine={false} tickFormatter={(v) => `${(v/1000000).toFixed(0)}백만`} />
                  <Tooltip content={<CustomTooltip />} />
                  <Legend verticalAlign="top" height={36} iconSize={10} fontSize={11} />
                  <Area type="monotone" dataKey="sales" name="총 매출" fill="url(#salesGrad)" stroke="#10B981" strokeWidth={2.5} />
                  <Bar dataKey="profit" name="순 영업이익" fill="#3B82F6" barSize={25} radius={[4, 4, 0, 0]} />
                </ComposedChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-full flex items-center justify-center text-slate-450 text-sm">
                지정이력 내의 분기 매출 거래가 발생하지 않았습니다.
              </div>
            )}
          </div>
        </div>

        {/* Chart 2: Partner performance comparison (Bar Chart) */}
        <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-xs">
          <h3 className="text-sm font-bold text-slate-900 mb-4 tracking-tight">파트너 성과 비교 매트릭스</h3>
          <div className="h-72 w-full">
            {managerCompareData.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={managerCompareData} margin={{ top: 5, right: 5, left: 5, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                  <XAxis dataKey="shortName" stroke="#94a3b8" fontSize={11} tickLine={false} />
                  <YAxis stroke="#94a3b8" fontSize={11} tickLine={false} tickFormatter={(v) => `${(v/1000000).toFixed(0)}백만`} />
                  <Tooltip content={<CustomTooltip />} />
                  <Legend verticalAlign="top" height={36} iconSize={10} fontSize={11} />
                  <Bar dataKey="sales" name="매출 기여액" fill="#10B981" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="profit" name="실제 본사이익" fill="#8B5CF6" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-full flex items-center justify-center text-slate-450 text-sm">
                지정 기간 내 파트너들의 매출 실적이 존재하지 않습니다.
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Strategic Report View for Print Optimization */}
      <div className="bg-white rounded-2xl border border-slate-200 p-8 shadow-xs space-y-4 shadow-slate-100" id="print_report_section">
        <div className="border-b-2 border-slate-900 pb-4">
          <div className="flex justify-between items-start">
            <div>
              <h2 className="text-xl font-bold text-slate-900">Coaching Pass 비즈니스 실적 주주 보고서</h2>
              <p className="text-xs text-slate-500 font-mono mt-0.5">Report Date: {new Date().toISOString().substring(0, 10)} | Confidential</p>
            </div>
            <span className="text-xs bg-slate-900 text-white font-semibold px-2.5 py-1 rounded">정석본부 확정본</span>
          </div>
        </div>

        <div className="text-xs text-slate-600 space-y-4 font-sans leading-relaxed">
          <p>
            본 보고서는 지정일 <strong>{startDate}</strong>부터 <strong>{endDate}</strong> 사이에 코칭패스 영업 관제 프로세스를 통하여 전합 계산 집계된 이익 성과 지표입니다. 
            해당 기간 집계된 총 영업 계약 가치는 <strong>{formatKrw(totalSales)}</strong>이며, 파트너 및 수석 컨설턴트 지출 수수료 <strong>{formatKrw(totalFee)}</strong>를 제외한 본사의 경영 영업 순이익은 <strong>{formatKrw(totalProfit)}</strong>으로 산출되었습니다.
          </p>
          <p>
            조정된 수수료율 범위는 평균 {averageFeeRate.toFixed(1)}%로 안정적 한도 내에서 수수료 계약이 제어되고 있습니다. 지속적인 신규 임원 코칭패스 패키지 수주와 수수료 상한 리더십 계약 확장을 통해 본사 이익 증대를 권유합니다.
          </p>
        </div>

        <div className="pt-6 grid grid-cols-2 gap-4 text-xs">
          <div className="border border-slate-100 p-3 rounded-lg text-center">
            <span className="text-slate-400 block pb-1">보고자 (총괄자)</span>
            <strong className="text-slate-900 font-bold block">홍길동 (Master Admin)</strong>
          </div>
          <div className="border border-slate-100 p-3 rounded-lg text-center">
            <span className="text-slate-400 block pb-1">소속 기관</span>
            <strong className="text-slate-950 block font-bold">{props.settings.companyName} CRM 정합센터</strong>
          </div>
        </div>
      </div>
    </div>
  );
}
