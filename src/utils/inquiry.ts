/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

// DB유입(문의 유형)과 그에 따른 영업 수수료율 정의
export type InquiryType = 'corporate' | 'personal' | 'corporate_solution' | 'personal_solution';

export const INQUIRY_RATE: Record<InquiryType, number> = {
  corporate: 10,          // 회사문의
  personal: 20,           // 개인문의
  corporate_solution: 20, // 회사-솔루션
  personal_solution: 40,  // 개인-솔루션
};

export const INQUIRY_OPTIONS: { value: InquiryType; label: string; short: string }[] = [
  { value: 'corporate', label: '🏢 회사문의 (10%)', short: '회사문의(10%)' },
  { value: 'personal', label: '👤 개인문의 (20%)', short: '개인문의(20%)' },
  { value: 'corporate_solution', label: '🏢 회사-솔루션 (20%)', short: '회사-솔루션(20%)' },
  { value: 'personal_solution', label: '👤 개인-솔루션 (40%)', short: '개인-솔루션(40%)' },
];

// inquiryType → 수수료율(%) (알 수 없으면 회사문의 10% 기본)
export const getInquiryRate = (type?: string): number =>
  INQUIRY_RATE[(type as InquiryType)] ?? 10;

// 개인 계열(개인문의/개인-솔루션) 여부
export const isPersonalInquiry = (type?: string): boolean =>
  type === 'personal' || type === 'personal_solution';

export const getInquiryLabel = (type?: string): string =>
  INQUIRY_OPTIONS.find(o => o.value === type)?.short ?? '회사문의(10%)';
