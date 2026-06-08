/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

export interface CoachTariff {
  id: string;
  coachName: string;
  method: '통합' | '대면' | '비대면' | '대입';
  feeAmount?: number; // 수수료(원)
  feePercent?: number; // 수수료(%)
  realName?: string; // 본명
  notes?: string; // 비고
}

export const COACH_TARIFF_TABLE: CoachTariff[] = [
  { id: 'ct_001', coachName: '강경원', method: '통합', feeAmount: 60000 },
  { id: 'ct_002', coachName: '권규청', method: '통합', feeAmount: 60000 },
  { id: 'ct_003', coachName: '김경재', method: '대면', feeAmount: 60000, realName: '김민균' },
  { id: 'ct_004', coachName: '김경재', method: '비대면', feeAmount: 50000, realName: '김민균' },
  { id: 'ct_005', coachName: '김은아', method: '대면', feeAmount: 60000 },
  { id: 'ct_006', coachName: '김은아', method: '비대면', feeAmount: 50000 },
  { id: 'ct_007', coachName: '김정규', method: '통합', feeAmount: 60000, realName: '남동근' },
  { id: 'ct_008', coachName: '김치성', method: '대면', feeAmount: 65000 },
  { id: 'ct_009', coachName: '김치성', method: '비대면', feeAmount: 55000 },
  { id: 'ct_010', coachName: '김태성', method: '통합', feeAmount: 80000, notes: '프리미엄' },
  { id: 'ct_011', coachName: '김향기', method: '대면', feeAmount: 60000 },
  { id: 'ct_012', coachName: '김향기', method: '비대면', feeAmount: 50000 },
  { id: 'ct_013', coachName: '노영우', method: '대면', feeAmount: 60000 },
  { id: 'ct_014', coachName: '노영우', method: '비대면', feeAmount: 50000 },
  { id: 'ct_015', coachName: '문창준', method: '통합', feePercent: 40 },
  { id: 'ct_016', coachName: '박래옥', method: '통합', feeAmount: 50000 },
  { id: 'ct_017', coachName: '박승우', method: '통합', feeAmount: 50000, realName: '박종웅' },
  { id: 'ct_018', coachName: '성유진', method: '통합', feeAmount: 50000 },
  { id: 'ct_019', coachName: '성정인', method: '통합', feeAmount: 60000, realName: '성원호' },
  { id: 'ct_020', coachName: '송병민', method: '통합', feeAmount: 70000 },
  { id: 'ct_021', coachName: '신종훈', method: '통합', feeAmount: 50000, realName: '신의종' },
  { id: 'ct_022', coachName: '양희성', method: '대면', feeAmount: 60000 },
  { id: 'ct_023', coachName: '양희성', method: '대입', feeAmount: 70000 },
  { id: 'ct_024', coachName: '양희성', method: '비대면', feeAmount: 50000 },
  { id: 'ct_025', coachName: '유영식', method: '대면', feeAmount: 60000 },
  { id: 'ct_026', coachName: '유영식', method: '비대면', feeAmount: 50000 },
  { id: 'ct_027', coachName: '윤성수', method: '대면', feeAmount: 50000 },
  { id: 'ct_028', coachName: '윤성수', method: '비대면', feeAmount: 40000 },
  { id: 'ct_029', coachName: '윤호상', method: '대면', feeAmount: 75000 },
  { id: 'ct_030', coachName: '윤호상', method: '비대면', feeAmount: 60000 },
  { id: 'ct_031', coachName: '이동현', method: '대면', feeAmount: 60000 },
  { id: 'ct_032', coachName: '이동현', method: '비대면', feeAmount: 50000 },
  { id: 'ct_033', coachName: '이로운', method: '대면', feeAmount: 90000, realName: '정길창', notes: '프리미엄' },
  { id: 'ct_034', coachName: '이로운', method: '비대면', feeAmount: 70000, realName: '정길창', notes: '프리미엄' },
  { id: 'ct_035', coachName: '이윤호', method: '통합', feeAmount: 70000, realName: '이정호' },
  { id: 'ct_036', coachName: '이인준', method: '통합', feeAmount: 50000, realName: '이태인' },
  { id: 'ct_037', coachName: '이종현', method: '대면', feeAmount: 60000 },
  { id: 'ct_038', coachName: '이종현', method: '비대면', feeAmount: 50000 },
  { id: 'ct_039', coachName: '이철민', method: '대면', feeAmount: 70000, realName: '박철' },
  { id: 'ct_040', coachName: '이철민', method: '비대면', feeAmount: 60000, realName: '박철' },
  { id: 'ct_041', coachName: '이하준', method: '통합', feeAmount: 50000, realName: '이근하' },
  { id: 'ct_042', coachName: '임태성', method: '통합', feeAmount: 50000, realName: '임승태' },
  { id: 'ct_043', coachName: '정혜은', method: '대면', feeAmount: 60000, realName: '정혜영' },
  { id: 'ct_044', coachName: '정혜은', method: '비대면', feeAmount: 50000, realName: '정혜영' },
  { id: 'ct_045', coachName: '정휘성', method: '통합', feeAmount: 50000 },
  { id: 'ct_046', coachName: '조민근', method: '통합', feeAmount: 50000 },
  { id: 'ct_047', coachName: '최지혜', method: '대면', feeAmount: 60000 },
  { id: 'ct_048', coachName: '최지혜', method: '대입', feeAmount: 80000 },
  { id: 'ct_049', coachName: '최지혜', method: '비대면', feeAmount: 50000 },
  { id: 'ct_050', coachName: '김혜연', method: '대면', feeAmount: 60000, realName: '김덕임' },
  { id: 'ct_051', coachName: '김혜연', method: '비대면', feeAmount: 50000, realName: '김덕임' },
];
