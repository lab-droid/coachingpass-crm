/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { Sale, SystemSettings, User } from '../types';

export const INITIAL_USER: User = {
  id: 'usr_001',
  email: 'info@nextin.ai.kr',
  name: '홍길동',
  role: 'admin',
  avatarUrl: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?q=80&w=256&auto=format&fit=crop',
};

export const INITIAL_SETTINGS: SystemSettings = {
  defaultFeeRate: 15, // 기본 수수료율 15%
  targetMonthlySales: 500000000, // 월 목표 매출 5억원
  targetMonthlyProfit: 425000000, // 월 목표 영업이익 4억 2500만원
  companyName: '코칭패스 CRM',
};

export const MANAGERS = [
  '이지원 (수석 컨설턴트)',
  '김민준 (책임 분석가)',
  '박소희 (영업 팀장)',
  '최재혁 (파트너)',
];

export const INITIAL_SALES: Sale[] = [];
