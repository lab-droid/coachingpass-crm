/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import { motion } from 'motion/react';
import { 
  TrendingUp, 
  Wallet, 
  Users, 
  Activity, 
  ArrowUpRight, 
  ArrowDownRight, 
  CheckCircle2, 
  Award, 
  Coins,
  Calendar,
  Filter,
  Search,
  Building,
  SlidersHorizontal,
  Briefcase,
  Layers,
  ArrowRight,
  TrendingDown,
  Target,
  Clock,
  HelpCircle
} from 'lucide-react';
import { 
  LineChart, 
  Line, 
  BarChart, 
  Bar, 
  PieChart, 
  Pie, 
  Cell, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  Legend, 
  ResponsiveContainer,
  ComposedChart,
  AreaChart,
  Area
} from 'recharts';
import { Sale, SystemSettings, User } from '../types';
import { SkeletonPage } from './Skeleton';

interface DashboardProps {
  sales: Sale[];
  settings: SystemSettings;
  user: User;
}

const COLORS = ['#F59E0B', '#10B981', '#3B82F6', '#8B5CF6', '#EC4899', '#64748B'];

export default function Dashboard(props: DashboardProps) {
  const [isLoading, setIsLoading] = useState(true);
  
  // Interactive Filters State
  const [datePeriod, setDatePeriod] = useState<'this_month' | '30_days' | '90_days' | 'all'>('this_month');
  const [inquiryFilter, setInquiryFilter] = useState<'all' | 'personal' | 'corporate'>('all');
  const [serviceFilter, setServiceFilter] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState('');
  
  // Chart Views State
  const [chartView, setChartView] = useState<'cumulative' | 'daily'>('cumulative');

  // Loading simulation to align with system skeleton experience
  useEffect(() => {
    const timer = setTimeout(() => {
      setIsLoading(false);
    }, 550);
    return () => clearTimeout(timer);
  }, []);

  // Format currency in KRW style
  const formatKrw = (value: number) => {
    return new Intl.NumberFormat('ko-KR', {
      style: 'currency',
      currency: 'KRW',
      maximumFractionDigits: 0,
    }).format(value);
  };

  // Classify services dynamically for metrics grouping
  const classifyService = (serviceName?: string) => {
    const norm = (serviceName || '').toLowerCase();
    if (norm.includes('비대면') || norm.includes('온라인') || norm.includes('online') || norm.includes('zoom')) {
      return '비대면/온라인';
    }
    if (norm.includes('대면') || norm.includes('오프라인') || norm.includes('face')) {
      return '대면 코칭';
    }
    if (norm.includes('대입') || norm.includes('입시') || norm.includes('자소서') || norm.includes('컨설팅') || norm.includes('학습')) {
      return '대입/입시 컨설팅';
    }
    if (norm.includes('통합') || norm.includes('종합') || norm.includes('패키지')) {
      return '통합 종합 패키지';
    }
    return '기타 전문 코칭';
  };

  // Standardize dates to compare
  const today = new Date();
  const currentYear = today.getFullYear();
  const currentMonth = today.getMonth(); // 0-indexed
  const daysInMonth = new Date(currentYear, currentMonth + 1, 0).getDate();
  const currentDay = today.getDate();
  const daysLeft = Math.max(1, daysInMonth - currentDay);

  const getFilteredSales = () => {
    return props.sales.filter((sale) => {
      // 1. Date filter
      const saleDate = new Date(sale.date);
      let matchesDate = true;
      
      if (datePeriod === 'this_month') {
        matchesDate = saleDate.getFullYear() === currentYear && saleDate.getMonth() === currentMonth;
      } else if (datePeriod === '30_days') {
        const thirtyDaysAgo = new Date();
        thirtyDaysAgo.setDate(today.getDate() - 30);
        matchesDate = saleDate >= thirtyDaysAgo && saleDate <= today;
      } else if (datePeriod === '90_days') {
        const ninetyDaysAgo = new Date();
        ninetyDaysAgo.setDate(today.getDate() - 90);
        matchesDate = saleDate >= ninetyDaysAgo && saleDate <= today;
      }

      // 2. Inquiry type filter
      let matchesInquiry = true;
      if (inquiryFilter !== 'all') {
        matchesInquiry = sale.inquiryType === inquiryFilter;
      }

      // 3. Service Category filter
      let matchesService = true;
      if (serviceFilter !== 'all') {
        matchesService = classifyService(sale.registeredService) === serviceFilter;
      }

      return matchesDate && matchesInquiry && matchesService;
    });
  };

  const filteredSales = getFilteredSales();

  // Basic Sales Calculations on Filtered Set
  const totalSalesCount = filteredSales.length;
  const filteredSalesSum = filteredSales.reduce((sum, s) => sum + s.amount, 0);
  const filteredProfitSum = filteredSales.reduce((sum, s) => sum + s.profit, 0);
  const filteredFeeSum = filteredSales.reduce((sum, s) => sum + s.fee, 0);
  const avgOrderValue = totalSalesCount > 0 ? Math.round(filteredSalesSum / totalSalesCount) : 0;
  const overallProfitRate = filteredSalesSum > 0 ? (filteredProfitSum / filteredSalesSum) * 100 : 0;

  // Monthly Target Calculations (based on props.settings.targetMonthlySales)
  const monthlyTarget = props.settings.targetMonthlySales;
  const targetProfitGoal = props.settings.targetMonthlyProfit;
  const achievementRate = (filteredSalesSum / monthlyTarget) * 100;
  const targetGap = Math.max(0, monthlyTarget - filteredSalesSum);
  const requiredDailySales = daysLeft > 0 ? Math.round(targetGap / daysLeft) : 0;

  // Group by Date for Chart Rendering
  const dateGroupedSales: { [date: string]: { sales: number; profit: number; count: number } } = {};
  filteredSales.forEach((sale) => {
    const d = sale.date;
    if (!dateGroupedSales[d]) {
      dateGroupedSales[d] = { sales: 0, profit: 0, count: 0 };
    }
    dateGroupedSales[d].sales += sale.amount;
    dateGroupedSales[d].profit += sale.profit;
    dateGroupedSales[d].count += 1;
  });

  // Calculate Cumulative Timeline Chart Data
  const sortedDates = Object.keys(dateGroupedSales).sort((a, b) => a.localeCompare(b));
  
  let cumulativeSalesSum = 0;
  let cumulativeProfitSum = 0;
  const chartTimelineData = sortedDates.map((date, idx) => {
    const dayData = dateGroupedSales[date];
    cumulativeSalesSum += dayData.sales;
    cumulativeProfitSum += dayData.profit;
    
    // Theoretical linear benchmark target curve to achieve props.settings.targetMonthlySales
    const targetBenchmark = monthlyTarget > 0 
      ? Math.round((monthlyTarget / (sortedDates.length || 30)) * (idx + 1)) 
      : 0;

    return {
      date: date.substring(5), // YYYY-MM-DD -> MM-DD
      fullDate: date,
      sales: dayData.sales,
      profit: dayData.profit,
      cumulativeSales: cumulativeSalesSum,
      cumulativeProfit: cumulativeProfitSum,
      targetBenchmark: targetBenchmark,
    };
  });

  // Group by Service for Category Breakdown Analytics
  const serviceBreakdown = filteredSales.reduce((acc: { [key: string]: { sales: number; count: number } }, sale) => {
    const cat = classifyService(sale.registeredService);
    if (!acc[cat]) {
      acc[cat] = { sales: 0, count: 0 };
    }
    acc[cat].sales += sale.amount;
    acc[cat].count += 1;
    return acc;
  }, {});

  const serviceAnalyticsList = Object.entries(serviceBreakdown).map(([name, stat]) => ({
    name,
    sales: stat.sales,
    count: stat.count,
    share: filteredSalesSum > 0 ? (stat.sales / filteredSalesSum) * 100 : 0
  })).sort((a, b) => b.sales - a.sales);

  // Group by Sales Manager for Rep Contribution Analysis
  const managerPerformanceMap = filteredSales.reduce((acc: { [key: string]: { sales: number; count: number; profit: number } }, sale) => {
    const rep = sale.managerName || '미지정 담당자';
    if (!acc[rep]) {
      acc[rep] = { sales: 0, count: 0, profit: 0 };
    }
    acc[rep].sales += sale.amount;
    acc[rep].profit += sale.profit;
    acc[rep].count += 1;
    return acc;
  }, {});

  const repPerformanceList = Object.entries(managerPerformanceMap).map(([name, stat]) => ({
    name,
    sales: stat.sales,
    count: stat.count,
    profit: stat.profit,
    share: filteredSalesSum > 0 ? (stat.sales / filteredSalesSum) * 100 : 0
  })).sort((a, b) => b.sales - a.sales);

  // Custom Tooltip for Recharts
  const CustomPerformanceTooltip = ({ active, payload, label }: any) => {
    if (active && payload && payload.length) {
      return (
        <div id="recharts_custom_tooltip" className="bg-slate-900 border border-slate-800 p-3.5 rounded-xl shadow-xl text-xs font-sans text-white">
          <p className="font-bold border-b border-slate-800 pb-1.5 mb-2 text-slate-350 flex items-center space-x-1.5">
            <Calendar className="h-3.5 w-3.5 text-amber-500" />
            <span>날짜: 2026-{label}</span>
          </p>
          {payload.map((entry: any, index: number) => (
            <div key={index} className="flex items-center space-x-4 justify-between my-1">
              <div className="flex items-center space-x-1.5">
                <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: entry.color }} />
                <span className="text-slate-400 font-medium">{entry.name}:</span>
              </div>
              <span className="font-mono font-black text-amber-500">
                {formatKrw(entry.value)}
              </span>
            </div>
          ))}
        </div>
      );
    }
    return null;
  };

  // Filter actual tables using searching
  const searchedSales = filteredSales.filter(sale => {
    const query = searchQuery.toLowerCase();
    return (
      sale.customerName?.toLowerCase().includes(query) ||
      sale.managerName?.toLowerCase().includes(query) ||
      sale.coachName?.toLowerCase().includes(query) ||
      classifyService(sale.registeredService).toLowerCase().includes(query) ||
      (sale.registeredService || '').toLowerCase().includes(query) ||
      sale.id.toLowerCase().includes(query)
    );
  });

  if (isLoading) {
    return <SkeletonPage />;
  }

  return (
    <motion.div 
      initial={{ opacity: 0, y: 15 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5 }}
      className="space-y-6 max-w-7xl mx-auto font-sans text-slate-800 pb-12"
      id="sales_dashboard_root"
    >
      {/* 1. Header with App Title & Real-time Info */}
      <div id="sales_header_block" className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 border-b border-slate-200 pb-5">
        <div>
          <h1 className="text-2xl font-black text-slate-950 tracking-tight flex items-center gap-x-2">
            <span>매출 지표 종합 관리 보드</span>
            <span className="inline-flex items-center text-[10px] font-bold px-2 py-0.5 rounded-md bg-amber-50 text-amber-700 border border-amber-200 shadow-xs">
              <Activity className="h-3 w-3 mr-1 animate-pulse text-amber-600" />
              실시간 영업 관리 모드
            </span>
          </h1>
          <p className="text-xs sm:text-sm text-slate-500 mt-1">
            코칭패스의 모든 원생 매출 계약 등록, 실시간 가속 달성률, 영업팀 개별 기여 및 상품군별 가치를 분석합니다.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2 text-xs font-mono">
          <div className="bg-slate-900 text-amber-400 px-3.5 py-1.5 rounded-lg border border-slate-800 shadow-xs flex items-center space-x-1.5">
            <Clock className="h-3.5 w-3.5 text-amber-500 animate-spin-slow" />
            <span>최근 갱신: {new Date().toLocaleTimeString()} (KST)</span>
          </div>
        </div>
      </div>

      {/* 2. Advanced Control Dashboard Filters Panel */}
      <div id="dashboard_filter_panel" className="bg-white rounded-2xl border border-slate-200 p-5 shadow-xs">
        <div className="flex items-center space-x-2 border-b border-slate-100 pb-3 mb-4">
          <SlidersHorizontal className="h-4 w-4 text-amber-500" />
          <h2 className="text-xs sm:text-sm font-black text-slate-900">다양한 관점 분석을 위한 동적 필터 시스템</h2>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 text-xs font-sans">
          {/* Period Selection */}
          <div className="space-y-1.5">
            <span className="block text-slate-500 font-bold flex items-center space-x-1">
              <Calendar className="h-3.5 w-3.5 text-slate-400" />
              <span>영업 계약 집계 기간</span>
            </span>
            <div className="grid grid-cols-4 gap-1 p-1 bg-slate-100 rounded-xl">
              <button 
                onClick={() => setDatePeriod('this_month')} 
                className={`py-1.5 rounded-lg text-[11px] font-bold transition-all ${datePeriod === 'this_month' ? 'bg-white text-slate-950 shadow-xs' : 'text-slate-500 hover:text-slate-950'}`}
              >
                이번 달
              </button>
              <button 
                onClick={() => setDatePeriod('30_days')} 
                className={`py-1.5 rounded-lg text-[11px] font-bold transition-all ${datePeriod === '30_days' ? 'bg-white text-slate-950 shadow-xs' : 'text-slate-500 hover:text-slate-950'}`}
              >
                최근30일
              </button>
              <button 
                onClick={() => setDatePeriod('90_days')} 
                className={`py-1.5 rounded-lg text-[11px] font-bold transition-all ${datePeriod === '90_days' ? 'bg-white text-slate-950 shadow-xs' : 'text-slate-500 hover:text-slate-950'}`}
              >
                최근90일
              </button>
              <button 
                onClick={() => setDatePeriod('all')} 
                className={`py-1.5 rounded-lg text-[11px] font-bold transition-all ${datePeriod === 'all' ? 'bg-white text-slate-950 shadow-xs' : 'text-slate-500 hover:text-slate-950'}`}
              >
                전체
              </button>
            </div>
          </div>

          {/* Inquiry Type */}
          <div className="space-y-1.5">
            <span className="block text-slate-500 font-bold flex items-center space-x-1">
              <Building className="h-3.5 w-3.5 text-slate-400" />
              <span>상담 유치 채널</span>
            </span>
            <div className="grid grid-cols-3 gap-1 p-1 bg-slate-100 rounded-xl">
              <button 
                onClick={() => setInquiryFilter('all')} 
                className={`py-1.5 rounded-lg text-[11px] font-bold transition-all ${inquiryFilter === 'all' ? 'bg-white text-slate-950 shadow-xs' : 'text-slate-500 hover:text-slate-950'}`}
              >
                전체 채널
              </button>
              <button 
                onClick={() => setInquiryFilter('personal')} 
                className={`py-1.5 rounded-lg text-[11px] font-bold transition-all ${inquiryFilter === 'personal' ? 'bg-white text-slate-950 shadow-xs' : 'text-slate-500 hover:text-slate-950'}`}
              >
                개인 문의
              </button>
              <button 
                onClick={() => setInquiryFilter('corporate')} 
                className={`py-1.5 rounded-lg text-[11px] font-bold transition-all ${inquiryFilter === 'corporate' ? 'bg-white text-slate-950 shadow-xs' : 'text-slate-500 hover:text-slate-950'}`}
              >
                기업/단체
              </button>
            </div>
          </div>

          {/* Service filter selector */}
          <div className="space-y-1.5">
            <span className="block text-slate-500 font-bold flex items-center space-x-1">
              <Layers className="h-3.5 w-3.5 text-slate-400" />
              <span>제공 세그먼트 상품</span>
            </span>
            <select
              value={serviceFilter}
              onChange={(e) => setServiceFilter(e.target.value)}
              className="w-full border border-slate-200 p-2.5 rounded-xl font-bold bg-slate-50 text-[11px] cursor-pointer hover:bg-slate-100 transition-colors"
            >
              <option value="all">전체 코칭패스 상품군</option>
              <option value="대면 코칭">대면 전문 코칭</option>
              <option value="비대면/온라인">비대면 및 온라인</option>
              <option value="대입/입시 컨설팅">대입/입시 가이드 컨설팅</option>
              <option value="통합 종합 패키지">종합 통합 패키지 케어</option>
              <option value="기타 전문 코칭">기타 정기 교육 전문가</option>
            </select>
          </div>
        </div>
      </div>

      {/* 3. KPI 4 Grid Widgets */}
      <div id="sales_kpi_grid" className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
        {/* KPI 1 : Gross Contract Revenue */}
        <div id="kpi_item_gross" className="bg-white rounded-2xl border border-slate-200 p-6 flex flex-col justify-between hover:border-amber-400 hover:shadow-lg transition-all duration-300 relative overflow-hidden group">
          <div className="absolute top-0 right-0 h-20 w-20 bg-amber-500/5 rounded-full blur-xl group-hover:bg-amber-500/10 transition-colors duration-300 pointer-events-none" />
          <div className="flex items-center justify-between">
            <span className="text-xs sm:text-sm font-bold text-slate-500">집계 기간 총 영업 계약 (Gross)</span>
            <div className="h-9 w-9 bg-amber-50 rounded-lg flex items-center justify-center text-amber-500 shadow-xs">
              <TrendingUp className="h-5 w-5" />
            </div>
          </div>
          <div className="mt-5">
            <h3 className="text-2xl font-black font-mono tracking-tight text-slate-950">
              {formatKrw(filteredSalesSum)}
            </h3>
            <div className="text-[11px] text-slate-500 mt-2 flex flex-wrap items-center gap-1.5">
              <span className="font-bold text-slate-705 bg-slate-100 px-1.5 py-0.5 rounded">
                건수: {totalSalesCount}건
              </span>
              <span>평균 수주 단가 </span>
              <span className="font-mono text-amber-600 font-bold">
                {formatKrw(avgOrderValue)}
              </span>
            </div>
          </div>
        </div>

        {/* KPI 2 : Target Achievement Concentric ring or progress indicator */}
        <div id="kpi_item_target_rate" className="bg-white rounded-2xl border border-slate-200 p-6 flex flex-col justify-between hover:border-emerald-400 hover:shadow-lg transition-all duration-300 relative overflow-hidden group">
          <div className="absolute top-0 right-0 h-20 w-20 bg-emerald-500/5 rounded-full blur-xl pointer-events-none" />
          <div className="flex items-center justify-between">
            <span className="text-xs sm:text-sm font-bold text-slate-500">당월 영업 매출 목표 달성률</span>
            <div className="h-9 w-9 bg-emerald-50 rounded-lg flex items-center justify-center text-emerald-600 shadow-xs">
              <Award className="h-5 w-5" />
            </div>
          </div>
          <div className="mt-5">
            <div className="flex items-end justify-between">
              <h3 className="text-2xl font-black font-mono tracking-tight text-slate-950">
                {achievementRate.toFixed(1)}%
              </h3>
              <span className="text-[10px] text-slate-400 font-bold mb-1">
                목표 {formatKrw(monthlyTarget)}
              </span>
            </div>
            
            {/* Rich progress status bar with custom states */}
            <div className="w-full bg-slate-100 h-2 rounded-full mt-3 overflow-hidden">
              <div 
                className={`h-full rounded-full transition-all duration-1000 ${achievementRate >= 100 ? 'bg-emerald-500' : achievementRate >= 70 ? 'bg-amber-500' : 'bg-amber-400/80'}`}
                style={{ width: `${Math.min(achievementRate, 100)}%` }}
              />
            </div>
          </div>
        </div>

        {/* KPI 3: Speed of Growth / Required Daily intake */}
        <div id="kpi_item_profitability" className="bg-white rounded-2xl border border-slate-200 p-6 flex flex-col justify-between hover:border-blue-400 hover:shadow-lg transition-all duration-300 relative overflow-hidden group">
          <div className="absolute top-0 right-0 h-20 w-20 bg-blue-500/5 rounded-full blur-xl pointer-events-none" />
          <div className="flex items-center justify-between">
            <span className="text-xs sm:text-sm font-bold text-slate-500">영업 본사 순수익 규모 (Net)</span>
            <div className="h-9 w-9 bg-blue-50 rounded-lg flex items-center justify-center text-blue-600 shadow-xs">
              <Wallet className="h-5 w-5" />
            </div>
          </div>
          <div className="mt-5">
            <h3 className="text-2xl font-black font-mono tracking-tight text-slate-950">
              {formatKrw(filteredProfitSum)}
            </h3>
            <div className="text-[11px] text-slate-500 mt-2 flex items-center justify-between">
              <span>평균 순수익률 :</span>
              <span className="font-black text-blue-600 font-mono">
                {overallProfitRate.toFixed(1)}%
              </span>
            </div>
          </div>
        </div>

        {/* KPI 4: Operations & Gap Metric */}
        <div id="kpi_item_gap" className="bg-white rounded-2xl border border-slate-200 p-6 flex flex-col justify-between hover:border-indigo-400 hover:shadow-lg transition-all duration-300 relative overflow-hidden group">
          <div className="absolute top-0 right-0 h-20 w-20 bg-indigo-500/5 rounded-full blur-xl pointer-events-none" />
          <div className="flex items-center justify-between">
            <span className="text-xs sm:text-sm font-bold text-slate-500">목표 달성 필요 영업 속도</span>
            <div className="h-9 w-9 bg-indigo-50 rounded-lg flex items-center justify-center text-indigo-600 shadow-xs">
              <Target className="h-5 w-5" />
            </div>
          </div>
          <div className="mt-5">
            {targetGap > 0 ? (
              <>
                <h3 className="text-2xl font-black font-mono tracking-tight text-rose-600">
                  {formatKrw(requiredDailySales)}
                  <span className="text-xs font-normal text-slate-500"> / 일</span>
                </h3>
                <p className="text-[10px] text-slate-400 mt-2 font-bold flex items-center space-x-1">
                  <span className="text-rose-500">★ 마감까지 {daysLeft}일 남음</span>
                  <span>(남은 목표 격차: {formatKrw(targetGap)})</span>
                </p>
              </>
            ) : (
              <>
                <h3 className="text-2xl font-black font-mono tracking-tight text-emerald-600 flex items-center">
                  <span>달성 완료!</span>
                </h3>
                <p className="text-[10px] text-emerald-600 mt-2 font-bold">
                  초과 목표 달성 중: +{formatKrw(Math.abs(monthlyTarget - filteredSalesSum))}
                </p>
              </>
            )}
          </div>
        </div>
      </div>

      {/* 4. Chart Visualization Bento Group */}
      <div id="chart_bento_group" className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        
        {/* Left: Comprehensive Trend Explorer (2 cols) */}
        <div id="chart_col_trend" className="lg:col-span-2 bg-white rounded-2xl border border-slate-200 p-6 flex flex-col justify-between shadow-xs">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
            <div>
              <h3 className="text-sm font-black text-slate-900">영업 매출 동적 트렌드 분석 차트</h3>
              <p className="text-xs text-slate-400 mt-0.5">선택한 필터 조건 및 일자별 매출 및 목표 benchmark 도달 속도 분석</p>
            </div>
            
            {/* View Segment switcher */}
            <div className="flex items-center space-x-1.5 p-1 bg-slate-100 rounded-xl text-[11px] self-start sm:self-auto font-semibold">
              <button
                onClick={() => setChartView('cumulative')}
                className={`px-3 py-1.5 rounded-lg transition-all ${chartView === 'cumulative' ? 'bg-white text-slate-950 shadow-xs' : 'text-slate-500 hover:text-slate-950'}`}
              >
                매출 누적 속도
              </button>
              <button
                onClick={() => setChartView('daily')}
                className={`px-3 py-1.5 rounded-lg transition-all ${chartView === 'daily' ? 'bg-white text-slate-950 shadow-xs' : 'text-slate-500 hover:text-slate-950'}`}
              >
                일별 거래 추이
              </button>
            </div>
          </div>

          <div className="h-80 w-full" id="responsive_chart_viewport">
            {chartTimelineData.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                {chartView === 'cumulative' ? (
                  <AreaChart data={chartTimelineData} margin={{ top: 10, right: 15, left: 10, bottom: 5 }}>
                    <defs>
                      <linearGradient id="colorSales" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#F59E0B" stopOpacity={0.25}/>
                        <stop offset="95%" stopColor="#F59E0B" stopOpacity={0}/>
                      </linearGradient>
                      <linearGradient id="colorProfit" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#3B82F6" stopOpacity={0.25}/>
                        <stop offset="95%" stopColor="#3B82F6" stopOpacity={0}/>
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                    <XAxis dataKey="date" stroke="#94a3b8" fontSize={11} tickLine={false} />
                    <YAxis stroke="#94a3b8" fontSize={10} tickLine={false} tickFormatter={(v) => `${(v / 1000000).toFixed(0)}백만`} />
                    <Tooltip content={<CustomPerformanceTooltip />} />
                    <Legend iconType="circle" wrapperStyle={{ fontSize: 11 }} />
                    <Area type="monotone" dataKey="cumulativeSales" name="누적 매출 (KRW)" stroke="#F59E0B" strokeWidth={3} fillOpacity={1} fill="url(#colorSales)" />
                    <Area type="monotone" dataKey="cumulativeProfit" name="누적 영업이익" stroke="#3B82F6" strokeWidth={2.5} fillOpacity={1} fill="url(#colorProfit)" />
                    {datePeriod === 'this_month' && (
                      <Line type="monotone" dataKey="targetBenchmark" name="권장 목표 누적선" stroke="#94a3b8" strokeWidth={1} strokeDasharray="5 5" dot={false} />
                    )}
                  </AreaChart>
                ) : (
                  <ComposedChart data={chartTimelineData} margin={{ top: 10, right: 15, left: 10, bottom: 5 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                    <XAxis dataKey="date" stroke="#94a3b8" fontSize={11} tickLine={false} />
                    <YAxis stroke="#94a3b8" fontSize={10} tickLine={false} tickFormatter={(v) => `${(v / 1000000).toFixed(0)}백만`} />
                    <Tooltip content={<CustomPerformanceTooltip />} />
                    <Legend iconType="circle" wrapperStyle={{ fontSize: 11 }} />
                    <Bar dataKey="sales" name="일일 매출액" fill="#F59E0B" radius={[4, 4, 0, 0]} barSize={24}>
                      {chartTimelineData.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill="#F59E0B" />
                      ))}
                    </Bar>
                    <Line type="monotone" dataKey="profit" name="일일 영업이익" stroke="#10B981" strokeWidth={3.5} dot={{ r: 3 }} />
                  </ComposedChart>
                )}
              </ResponsiveContainer>
            ) : (
              <div className="h-full flex flex-col items-center justify-center text-slate-400 space-y-2">
                <p className="text-xs font-bold text-slate-500">표시할 수 있는 영업 실적 범위가 부재합니다.</p>
                <p className="text-[11px] text-slate-400">데이터 필터를 변경하거나 계약을 새로 승인해주세요.</p>
              </div>
            )}
          </div>
        </div>

        {/* Right: Product/Service Shares Analyzers (1 col) */}
        <div id="chart_col_service" className="bg-white rounded-2xl border border-slate-200 p-6 flex flex-col justify-between shadow-xs">
          <div>
            <h3 className="text-sm font-black text-slate-900">제공 상품/코칭 방식별 가치액 비중</h3>
            <p className="text-xs text-slate-400 mt-0.5">상담 원생들이 계약 결제한 코칭 형태 및 패키지별 분산도</p>
          </div>

          <div className="h-44 my-4 relative" id="pie_service_container">
            {serviceAnalyticsList.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={serviceAnalyticsList}
                    cx="50%"
                    cy="50%"
                    innerRadius={48}
                    outerRadius={68}
                    paddingAngle={3}
                    dataKey="sales"
                    nameKey="name"
                  >
                    {serviceAnalyticsList.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip formatter={(v: any) => formatKrw(v)} />
                </PieChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-full flex items-center justify-center text-slate-400 text-xs font-bold">
                상품 비중 정보가 존재하지 않습니다.
              </div>
            )}
            <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
              <span className="text-lg font-black font-mono text-slate-900">{totalSalesCount}건</span>
              <span className="text-[9px] text-slate-400 font-bold uppercase tracking-wider">총 매출 건수</span>
            </div>
          </div>

          {/* Breakdown stat bar elements */}
          <div className="space-y-2.5 max-h-48 overflow-y-auto pr-1">
            {serviceAnalyticsList.map((item, index) => (
              <div key={item.name} className="text-xs font-sans">
                <div className="flex items-center justify-between font-bold text-slate-705 mb-1 text-[11px]">
                  <div className="flex items-center space-x-1.5">
                    <span className="w-2 h-2 rounded-full inline-block" style={{ backgroundColor: COLORS[index % COLORS.length] }} />
                    <span className="truncate max-w-[120px] text-slate-800">{item.name}</span>
                  </div>
                  <div className="space-x-1">
                    <span className="font-mono text-slate-400">({item.count}건)</span>
                    <span className="font-mono text-slate-950">{item.share.toFixed(1)}%</span>
                  </div>
                </div>
                <div className="w-full bg-slate-100 h-1.5 rounded-full overflow-hidden">
                  <div 
                    className="h-full rounded-full transition-all duration-300"
                    style={{ width: `${item.share}%`, backgroundColor: COLORS[index % COLORS.length] }}
                  />
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* 5. Managers Ranking Board & Contrib analysis Section */}
      <div id="rep_contrib_section" className="bg-white rounded-2xl border border-slate-200 p-6 shadow-xs">
        <div className="border-b border-slate-100 pb-3 mb-5">
          <h3 className="text-sm font-black text-slate-950 flex items-center gap-x-1.5">
            <Users className="h-4 w-4 text-amber-500" />
            <span>영업팀 파트너/담당 컨설턴트별 기여 분석 랭킹</span>
          </h3>
          <p className="text-xs text-slate-400 mt-0.5">상담 성사를 통해 원생을 유치한 담당 관리자들의 누적 실적 및 랭킹 보드입니다.</p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {repPerformanceList.slice(0, 3).map((rep, idx) => {
            const trophies = ['🏆 최고 기여', '🥈 우수 기여', '🥉 동메달 기여'];
            return (
              <div key={rep.name} className="border border-slate-100 rounded-xl p-5 bg-slate-50/50 hover:bg-slate-50 hover:border-amber-500/20 transition-all">
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center space-x-2">
                    <div className="h-7 w-7 rounded-full bg-amber-500/10 text-amber-600 flex items-center justify-center font-bold text-xs">
                      #{idx + 1}
                    </div>
                    <span className="font-black text-sm text-slate-950">{rep.name}</span>
                  </div>
                  <span className="text-[10px] font-bold bg-amber-100 text-amber-800 px-2 py-0.5 rounded-full">
                    {trophies[idx] || `${idx + 1}위`}
                  </span>
                </div>
                <div className="space-y-2 text-xs">
                  <div className="flex justify-between text-slate-500">
                    <span>유치 매출액 (Share)</span>
                    <strong className="font-mono text-slate-900 font-bold">{formatKrw(rep.sales)} ({rep.share.toFixed(1)}%)</strong>
                  </div>
                  <div className="flex justify-between text-slate-500">
                    <span>본사이익 기여도</span>
                    <strong className="font-mono text-indigo-600 font-bold">{formatKrw(rep.profit)}</strong>
                  </div>
                  <div className="flex justify-between text-slate-500">
                    <span>성사 거래수</span>
                    <strong className="font-mono text-slate-900 font-bold">{rep.count}건</strong>
                  </div>
                </div>
              </div>
            );
          })}
          {repPerformanceList.length === 0 && (
            <div className="col-span-full py-8 text-center text-slate-400 font-bold text-xs">
              영업 담당자 실적이 존재하지 않습니다.
            </div>
          )}
        </div>
      </div>

      {/* 6. Robust Searchable Revenue Registry Ledgers (Bottom Panel) */}
      <div id="bottom_search_ledger" className="bg-white rounded-2xl border border-slate-200 p-6 shadow-xs">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-100 pb-4 mb-4">
          <div>
            <h3 className="text-sm font-black text-slate-950">검색식 실시간 매출 원장 (Ledger)</h3>
            <p className="text-xs text-slate-400 mt-0.5">원생명, 코칭패스 담당자, 적용 서비스 등 키워드 필터가 가능한 송장 아카이브</p>
          </div>

          {/* Search Box */}
          <div className="relative w-full md:w-80">
            <span className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none">
              <Search className="h-4 w-4 text-slate-400" />
            </span>
            <input 
              type="text" 
              placeholder="전표번호, 수강생명, 담당자... 검색"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full text-xs pl-10 pr-4 py-2.5 rounded-xl border border-slate-200 focus:outline-hidden focus:ring-1 focus:ring-amber-500 hover:border-slate-300 font-bold bg-slate-50/50" 
            />
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="border-b border-slate-250 text-slate-400 font-bold uppercase tracking-wider bg-slate-100/50">
                <th className="py-3.5 px-4 rounded-l-xl">등록일자</th>
                <th className="py-3.5 px-4">송장 ID (전표)</th>
                <th className="py-3.5 px-4">수강 고객명</th>
                <th className="py-3.5 px-4">영업 유치 rep</th>
                <th className="py-3.5 px-4">지정 코치</th>
                <th className="py-3.5 px-3">코칭 상품 구분</th>
                <th className="py-3.5 px-4 text-right">매출액 (수익률)</th>
                <th className="py-3.5 px-4 text-right">본사 영업이익</th>
                <th className="py-3.5 px-4 text-center rounded-r-xl">정산승인</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 font-sans">
              {searchedSales.map((sale) => (
                <tr key={sale.id} className="hover:bg-slate-50/80 duration-75 text-slate-700">
                  <td className="py-3.5 px-4 font-mono text-slate-500 font-bold text-[11px]">{sale.date}</td>
                  <td className="py-3.5 px-4 font-mono text-emerald-700 font-bold tracking-tight">{sale.id}</td>
                  <td className="py-3.5 px-4 font-black text-slate-900 text-sm">{sale.customerName}</td>
                  <td className="py-3.5 px-4 text-slate-500 font-bold">{sale.managerName}</td>
                  <td className="py-3.5 px-4">
                    <span className="inline-flex items-center space-x-1 bg-slate-100 font-semibold text-slate-600 px-2 py-0.5 rounded-full text-[10px]">
                      <span>👤 {sale.coachName || '미지정'}</span>
                    </span>
                  </td>
                  <td className="py-3.5 px-3">
                    <span className="font-bold text-slate-650 truncate max-w-[130px] block">
                      {classifyService(sale.registeredService)}
                    </span>
                  </td>
                  <td className="py-3.5 px-4 text-right">
                    <div className="font-mono font-black text-slate-900">{formatKrw(sale.amount)}</div>
                    <div className="text-[10px] text-slate-350 font-bold">({100 - sale.feeRate}%)</div>
                  </td>
                  <td className="py-3.5 px-4 text-right font-mono text-indigo-600 font-black text-sm">
                    {formatKrw(sale.profit)}
                  </td>
                  <td className="py-3.5 px-4 text-center">
                    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-md text-[10px] font-black tracking-tight ${
                      sale.status === 'completed'
                        ? 'bg-emerald-50 text-emerald-700 border border-emerald-100'
                        : 'bg-amber-50 text-amber-700 border border-amber-100'
                    }`}>
                      {sale.status === 'completed' ? '정산완료' : '대기중'}
                    </span>
                  </td>
                </tr>
              ))}
              {searchedSales.length === 0 && (
                <tr>
                  <td colSpan={9} className="py-12 text-center text-slate-400 font-bold">
                    검색 조건에 매칭되는 계약 실적 데이터가 존재하지 않습니다.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </motion.div>
  );
}
