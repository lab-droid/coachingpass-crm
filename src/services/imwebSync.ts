/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { Sale } from '../types';

// Excel ROUNDDOWN equivalent helper
const roundDown = (value: number, digits: number): number => {
  const factor = Math.pow(10, digits);
  return Math.floor(value * factor) / factor;
};

/**
 * 아임웹 프록시 호출 헬퍼.
 * 아임웹 v2 API는 호출이 잦으면 HTTP 200 + {"code":-7,"msg":"TOO MANY REQUEST"}로
 * 응답한다. 이 경우 지수 백오프로 재시도한다. (성공 신호는 호출부에서 판별)
 */
export async function fetchImweb(url: string, maxRetries = 4): Promise<{ res: Response; data: any }> {
  let lastRes!: Response;
  let lastData: any = null;
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    lastRes = await fetch(url);
    lastData = await lastRes.json().catch(() => null);
    // 속도 제한이면 점점 길게 대기 후 재시도 (1.5s, 3s, 4.5s, 6s)
    if (lastData && lastData.code === -7 && attempt < maxRetries) {
      await new Promise(resolve => setTimeout(resolve, 1500 * (attempt + 1)));
      continue;
    }
    break;
  }
  return { res: lastRes, data: lastData };
}

export interface ImwebSyncResult {
  /** 동기화 후 병합된 전체 매출 배열. error가 있으면 currentSales 가 그대로 반환된다. */
  sales: Sale[];
  /** 신규/갱신된 주문 건수 */
  syncedCount: number;
  /** 동기화 실패 사유 (인증/권한/속도제한 등). 성공 시 undefined */
  error?: string;
}

/**
 * 아임웹 주문 내역을 가져와 기존 매출 데이터와 병합한다.
 * 컴포넌트/탭에 종속되지 않는 순수 함수로, App 레벨 자동 동기화와
 * 영업관리 화면의 수동 동기화 버튼이 공통으로 사용한다.
 *
 * @param currentSales 현재 매출 배열 (병합 기준)
 * @param onProgress   진행 상황 콜백 (UI 메시지용, 선택)
 */
export async function syncImwebOrders(
  currentSales: Sale[],
  onProgress?: (text: string) => void
): Promise<ImwebSyncResult> {
  let allOrders: any[] = [];
  let offset = 1;
  let keepFetching = true;
  const TARGET_TIMESTAMP = new Date('2026-05-01T00:00:00+09:00').getTime() / 1000;

  while (keepFetching && offset < 50) { // Limit absolute max loops
    const { res, data } = await fetchImweb(`/api/imweb/orders?limit=100&offset=${offset}`);

    // 주의: 아임웹 v2 API는 인증 실패 등 오류 상황에서도 HTTP 200을 반환하고
    // 본문에 {"msg":"...Error","code":-5} 형태로 결과를 담는다. 검증된 성공 신호는
    // data.data.list 배열의 존재이므로, 이를 기준으로 성공/실패를 판별한다.
    const list = Array.isArray(data?.data?.list) ? data.data.list : null;

    if (!list) {
      const reason = data?.error || data?.msg || `HTTP ${res?.status}`;
      return { sales: currentSales, syncedCount: 0, error: reason };
    }

    if (list.length > 0) {
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

  if (allOrders.length === 0) {
    return { sales: currentSales, syncedCount: 0 };
  }

  let syncedCount = 0;
  const newSales = [...currentSales];

  // Filter out orders older than target date
  const targetOrders = allOrders.filter(o => o.order_time >= TARGET_TIMESTAMP);

  // Find orders that need prod-orders fetch (missing item data)
  const ordersToFetch = targetOrders.filter(o => {
    const existing = currentSales.find(s => s.id === o.order_no);
    if (!existing) return true;
    if (!existing.imwebData?.items || existing.imwebData.items.length === 0) return true;
    return false;
  });

  // 20개씩 묶어서 상품 정보 동기화 (I'mweb API rate limit 방지 및 속도 최적화)
  const CHUNK_SIZE = 20;
  for (let i = 0; i < ordersToFetch.length; i += CHUNK_SIZE) {
    const chunk = ordersToFetch.slice(i, i + CHUNK_SIZE);
    onProgress?.(`상품 정보를 동기화하는 중... (${i}/${ordersToFetch.length})`);

    try {
      await new Promise(resolve => setTimeout(resolve, 500)); // 0.5초 대기

      // Build the query array: order_no[]=A&order_no[]=B
      const qs = chunk.map(o => `order_no[]=${o.order_no}`).join("&");
      const { res: prodRes, data: prodData } = await fetchImweb(`/api/imweb/prod-orders?${qs}`);

      if (prodData && prodData.msg === 'SUCCESS' && prodData.data) {
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
      } else {
        console.error(`prod-orders 응답 오류 (batch starting ${chunk[0].order_no}):`, prodRes?.status, prodData?.msg || prodData);
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
    const dateStr = new Date(dateObj.getTime() + 9 * 60 * 60 * 1000).toISOString().substring(0, 16).replace('T', ' ');
    const paymentData = order.payment || order.pay || {};
    const amount = paymentData.payment_amount || paymentData.pay_amount || 0;
    const customerName = order.orderer?.name || '고객명 미상';
    const inquiryType = (existing && existing.inquiryType) || 'corporate';
    const feeRate = inquiryType === 'corporate' ? 10 : 20;
    const baseAmount = amount / 1.1;
    const fee = Math.round(baseAmount * (feeRate / 100));
    const profit = amount - fee;

    let imwebItems: any[] = [];
    if (order.items && order.items.length > 0) {
      imwebItems = order.items;
    } else if (existing && existing.imwebData?.items && existing.imwebData.items.length > 0) {
      imwebItems = existing.imwebData.items;
    }

    // Extract custom forms if any, often located in order.form or delivery form
    let forms: Array<{ label: string, value: string }> = [];
    if (order.form && Array.isArray(order.form)) {
      forms = order.form.map((f: any) => ({ label: f.title || '', value: f.value || '' }));
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

    // 대시보드 상품군 분석을 위해 실제 구매 상품명을 registeredService 에 반영한다.
    // (수기로 지정한 값이 있으면 유지)
    const registeredService = existing?.registeredService || imwebItems[0]?.name || '';

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
      isManagerManuallyEdited,
      registeredService
    };

    if (existingIndex >= 0) {
      newSales[existingIndex] = { ...newSales[existingIndex], ...saleData };
      syncedCount++;
    } else {
      newSales.push(saleData as any);
      syncedCount++;
    }
  }

  return { sales: newSales, syncedCount };
}
