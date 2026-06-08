/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

export interface User {
  id: string;
  email: string;
  name: string;
  role: 'admin' | 'manager';
  avatarUrl?: string;
}

export interface Sale {
  id: string;
  date: string; // YYYY-MM-DD
  customerName: string;
  managerName: string;
  amount: number; // 총 매출액 (KRW)
  feeRate: number; // 수수료율 (%, 예. 15)
  profit: number; // 영업이익 = 매출액 * (1 - feeRate/100)
  fee: number; // 수수료 = 매출액 * (feeRate/100)
  status: 'pending' | 'completed'; // 정산대기, 정산완료
  notes?: string;
  inquiryType?: 'personal' | 'corporate'; // 개인문의, 회사문의
  inquiryDate?: string;
  coachName?: string;
  registeredService?: string;
  coachingHours?: number;
  registrationDate?: string;

  // I'mweb details
  imwebData?: {
    orderer: { name: string; phone: string; email?: string };
    items: Array<{ name: string; options?: string; price: number; quantity: number; status: string; imageUrl?: string; orderNo?: string }>;
    payment: { method: string; amount: number; itemAmount: number; discount: number; points: number; status: string; paidAt: string };
    receiver: { name: string; phone: string; address: string; memo: string; forms?: Array<{label: string, value: string}> };
  };
}

export interface CommissionSummary {
  managerName: string;
  totalSales: number;
  totalProfit: number;
  totalFee: number;
  pendingFee: number;
  completedFee: number;
  salesCount: number;
}

export interface SystemSettings {
  defaultFeeRate: number;
  targetMonthlySales: number;
  targetMonthlyProfit: number;
  companyName: string;
}

export interface AnalyticsPeriod {
  startDate: string;
  endDate: string;
  manager: string;
}

export interface Employee {
  id: string;
  name: string;
  email: string;
  phone: string;
  role: '코치' | '영업팀' | '관리자' | '임원';
  department: string;
  joinedDate: string;
  status: 'active' | 'inactive';
  baseSalary?: number;
  salesTarget?: number;
  commissionRate?: number; // 수수료율 (%) for 영업팀
  coachingFee?: number;    // 수수료 (원) for 코치
}

export interface Coach {
  id: string;
  name: string;
  email: string;
  phone: string;
  specialty: string; // 전문 분야 (예: 진로, 학습, 코딩)
  tier: 'A' | 'B' | 'C'; // 수수료 지급 등급 (A: 20%, B: 15%, C: 10% 등)
  joinedDate: string;
  status: 'active' | 'inactive';
}

export interface CoachFeeItem {
  id: string;
  date: string;
  coachId: string;
  coachName: string;
  customerName: string;
  salesAmount: number;
  feeRate: number;
  calculatedFee: number;
  status: 'pending' | 'completed';
  payoutDate?: string;
  salesId?: string;
  coachingHours?: number;
}

export interface SalesFeeItem {
  id: string;
  date: string;
  managerId: string;
  managerName: string;
  customerName: string;
  salesAmount: number;
  commissionRate: number;
  calculatedFee: number;
  status: 'pending' | 'completed';
  payoutDate?: string;
  salesId?: string;
}
