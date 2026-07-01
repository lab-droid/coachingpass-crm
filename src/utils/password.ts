/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

// 영문 대/소문자 + 숫자를 조합한 임시(초기) 비밀번호 생성.
// 혼동되기 쉬운 문자(0/O, 1/l/I)는 제외하고, 각 종류가 최소 1개 포함되도록 보장한다.
const UPPER = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
const LOWER = 'abcdefghijkmnpqrstuvwxyz';
const DIGITS = '23456789';

const randomInt = (max: number): number => {
  if (typeof crypto !== 'undefined' && crypto.getRandomValues) {
    const arr = new Uint32Array(1);
    crypto.getRandomValues(arr);
    return arr[0] % max;
  }
  return Math.floor(Math.random() * max);
};

const pick = (chars: string) => chars[randomInt(chars.length)];

export function generateTempPassword(length: number = 8): string {
  const all = UPPER + LOWER + DIGITS;
  const required = [pick(UPPER), pick(LOWER), pick(DIGITS)];
  const rest: string[] = [];
  for (let i = required.length; i < Math.max(length, 6); i++) {
    rest.push(pick(all));
  }
  const combined = [...required, ...rest];
  // Fisher–Yates 셔플로 위치 무작위화
  for (let i = combined.length - 1; i > 0; i--) {
    const j = randomInt(i + 1);
    [combined[i], combined[j]] = [combined[j], combined[i]];
  }
  return combined.join('');
}
