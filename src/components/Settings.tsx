/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  Settings as SettingsIcon, 
  User, 
  ShieldCheck, 
  Database, 
  Check, 
  AlertCircle,
  TrendingDown,
  Building2,
  Lock,
  RefreshCw,
  Link
} from 'lucide-react';
import { SystemSettings, User as UserType } from '../types';

interface SettingsProps {
  settings: SystemSettings;
  setSettings: React.Dispatch<React.SetStateAction<SystemSettings>>;
  user: UserType;
  setUser: React.Dispatch<React.SetStateAction<UserType>>;
}

export default function Settings(props: SettingsProps) {
  // 프로필 정보 상태
  const [userName, setUserName] = useState(props.user.name);
  const [userEmail, setUserEmail] = useState(props.user.email);
  const [password, setPassword] = useState('coachingpass2026');

  // 시스템 설정 정보 상태
  const [companyName, setCompanyName] = useState(props.settings.companyName);
  const [defaultFeeRate, setDefaultFeeRate] = useState(props.settings.defaultFeeRate);
  const [targetMonthlySales, setTargetMonthlySales] = useState(props.settings.targetMonthlySales);
  const [targetMonthlyProfit, setTargetMonthlyProfit] = useState(props.settings.targetMonthlyProfit);

  // 알림 상태
  const [saveSuccess, setSaveSuccess] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  
  // 아임웹 API 상태
  const [imwebStatus, setImwebStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle');
  const [imwebMessage, setImwebMessage] = useState<string>('');

  const checkImwebConnection = async () => {
    try {
      setImwebStatus('loading');
      setImwebMessage('아임웹 API 인증 확인 중...');
      const response = await fetch('/api/imweb/token');
      const data = await response.json();
      
      if (response.ok && data.access_token) {
        setImwebStatus('success');
        setImwebMessage('아임웹 인증에 성공했습니다.');
        showSuccess('아임웹 API 키 검증이 성공적으로 완료되었습니다.');
      } else {
        setImwebStatus('error');
        setImwebMessage(data.error || '인증에 실패했습니다.');
        setSaveError('아임웹 인증 실패: ' + (data.error || '알 수 없는 오류'));
      }
    } catch (err) {
      setImwebStatus('error');
      setImwebMessage('서버 통신 오류가 발생했습니다.');
      setSaveError('서버와 통신할 수 없습니다.');
    }
  };

  const handleSaveProfile = (e: React.FormEvent) => {
    e.preventDefault();
    setSaveError(null);
    setSaveSuccess(null);

    if (!userName.trim() || !userEmail.trim()) {
      setSaveError('프로필 이름 및 이메일을 성실하게 입력해 주십시오.');
      return;
    }

    const updatedUser: UserType = {
      ...props.user,
      name: userName,
      email: userEmail,
    };

    props.setUser(updatedUser);
    localStorage.setItem('logged_in_user', JSON.stringify(updatedUser));
    
    showSuccess('계정 프로필 정보가 동기화 서버 및 로컬 캐시에 즉즉 업로드되었습니다.');
  };

  const handleSaveSystemSettings = (e: React.FormEvent) => {
    e.preventDefault();
    setSaveError(null);
    setSaveSuccess(null);

    if (!companyName.trim()) {
      setSaveError('회사명은 비어둘 수 없습니다.');
      return;
    }
    if (defaultFeeRate < 0 || defaultFeeRate > 100) {
      setSaveError('기본 수수료 비율은 0% ~ 100% 사이여야 합니다.');
      return;
    }
    if (targetMonthlySales <= 0 || targetMonthlyProfit <= 0) {
      setSaveError('설정 가능한 목표 수치는 0원보다 커야 합니다.');
      return;
    }

    const updatedSettings: SystemSettings = {
      defaultFeeRate,
      targetMonthlySales,
      targetMonthlyProfit,
      companyName,
    };

    props.setSettings(updatedSettings);
    localStorage.setItem('system_settings', JSON.stringify(updatedSettings));

    showSuccess('시스템 비즈니스 설정이 정상 반영되었습니다. 대시보드 지표에 즉시 동기화 적용됩니다.');
  };

  const showSuccess = (msg: string) => {
    setSaveSuccess(msg);
    setTimeout(() => {
      setSaveSuccess(null);
    }, 3000);
  };

  const handleClearCache = () => {
    if (window.confirm('정말 시스템 데모 데이터를 공장 초기화하시겠습니까? 기록된 모든 계약 매출 장부가 소멸합니다.')) {
      localStorage.removeItem('sales_history');
      localStorage.removeItem('system_settings');
      localStorage.removeItem('logged_in_user');
      localStorage.removeItem('auth_token');
      window.location.reload();
    }
  };

  return (
    <div className="space-y-6 max-w-4xl mx-auto font-sans text-slate-800 pb-10" id="settings_main_wrapper">
      {/* Toast popup */}
      <AnimatePresence>
        {saveSuccess && (
          <motion.div 
            id="settings_success_toast"
            initial={{ opacity: 0, y: 50, scale: 0.9 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 50, scale: 0.9 }}
            className="fixed bottom-6 right-6 bg-slate-900 border border-slate-800 text-white px-5 py-3.5 rounded-2xl shadow-2xl flex items-center space-x-3 z-50 text-sm max-w-md font-sans"
          >
            <Check className="h-5 w-5 text-emerald-400 shrink-0" />
            <span className="font-medium">{saveSuccess}</span>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Pages upper text */}
      <div className="border-b border-slate-200 pb-5">
        <h1 className="text-2xl font-black text-slate-900 tracking-tight">시스템 환경 설정</h1>
        <p className="text-sm text-slate-500 mt-1">
          영업 성과 기준, 본사 수수료율 인상/안정화 정책, 사용자 개인 정보를 고도로 설정 및 저장합니다.
        </p>
      </div>

      {saveError && (
        <div className="bg-red-50 border-l-4 border-red-500 p-4 rounded-xl flex items-start space-x-2.5 text-sm text-red-800 font-medium">
          <AlertCircle className="h-5 w-5 text-red-500 shrink-0" />
          <span>{saveError}</span>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6" id="settings_grid">
        
        {/* Left Card: Account profile config */}
        <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-xs h-fit" id="profile_setting_card">
          <div className="flex items-center space-x-2.5 mb-5 border-b border-slate-100 pb-3">
            <User className="h-5 w-5 text-emerald-500" />
            <h3 className="font-bold text-slate-900 text-base">마스터 관리자 정보 설정</h3>
          </div>

          <form onSubmit={handleSaveProfile} className="space-y-4">
            <div>
              <label className="block text-xs font-bold text-slate-500 mb-1.5 font-sans">관리자 이메일</label>
              <input
                type="email"
                required
                value={userEmail}
                onChange={(e) => setUserEmail(e.target.value)}
                className="block w-full px-3 py-2 bg-slate-50 border border-slate-200 text-slate-800 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-colors font-mono"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-500 mb-1.5">관리자 이름</label>
              <input
                type="text"
                required
                value={userName}
                onChange={(e) => setUserName(e.target.value)}
                className="block w-full px-3 py-2 bg-slate-50 border border-slate-200 text-slate-800 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-colors"
                placeholder="홍길동"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-500 mb-1.5 flex items-center justify-between">
                <span>보안 비밀번호</span>
                <span className="text-[10px] font-mono text-slate-400">변경 문의는 사내 보안팀에 접수</span>
              </label>
              <div className="relative rounded-md shadow-xs">
                <input
                  type="password"
                  disabled
                  value={password}
                  className="block w-full px-3 py-2 bg-slate-100 border border-slate-200 text-slate-450 rounded-lg text-sm font-mono cursor-not-allowed"
                />
                <div className="absolute inset-y-0 right-0 pr-3 flex items-center pointer-events-none">
                  <Lock className="h-4 w-4 text-slate-400" />
                </div>
              </div>
            </div>

            <div className="pt-3 flex justify-end">
              <button
                type="submit"
                className="bg-slate-900 hover:bg-slate-800 text-white font-bold py-2.5 px-4.5 rounded-xl text-xs duration-100 cursor-pointer"
              >
                관리자 정보 업데이트
              </button>
            </div>
          </form>
        </div>

        {/* Right Card: Core Profit / Sales target rules */}
        <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-xs h-fit" id="business_setting_card">
          <div className="flex items-center space-x-2.5 mb-5 border-b border-slate-100 pb-3">
            <Building2 className="h-5 w-5 text-emerald-500" />
            <h3 className="font-bold text-slate-900 text-base">영업 및 본사 수수료 기준 설정</h3>
          </div>

          <form onSubmit={handleSaveSystemSettings} className="space-y-4">
            <div>
              <label className="block text-xs font-bold text-slate-500 mb-1.5">사내 법인 브랜드명</label>
              <input
                type="text"
                required
                value={companyName}
                onChange={(e) => setCompanyName(e.target.value)}
                className="block w-full px-3 py-2 bg-slate-50 border border-slate-200 text-slate-800 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-colors font-bold"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-500 mb-1.5">디폴트 본사 수수료율 (%)</label>
              <div className="relative rounded-md shadow-xs">
                <input
                  type="number"
                  required
                  min="0"
                  max="100"
                  value={defaultFeeRate}
                  onChange={(e) => setDefaultFeeRate(Number(e.target.value))}
                  className="block w-full pr-8 pl-3 py-2 bg-slate-50 border border-slate-200 text-slate-800 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-colors font-mono"
                />
                <div className="absolute inset-y-0 right-0 pr-3 flex items-center pointer-events-none text-slate-400 text-xs font-bold">
                  %
                </div>
              </div>
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-500 mb-1.5">월 매출 목표 실적 (KRW)</label>
              <div className="relative rounded-md shadow-xs">
                <input
                  type="number"
                  required
                  value={targetMonthlySales}
                  onChange={(e) => setTargetMonthlySales(Number(e.target.value))}
                  className="block w-full pr-8 pl-3 py-2 bg-slate-50 border border-slate-200 text-slate-800 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-colors font-mono"
                />
                <div className="absolute inset-y-0 right-0 pr-3 flex items-center pointer-events-none text-slate-400 text-xs font-bold">
                  원
                </div>
              </div>
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-500 mb-1.5">월 영업이익 목표 실적 (KRW)</label>
              <div className="relative rounded-md shadow-xs">
                <input
                  type="number"
                  required
                  value={targetMonthlyProfit}
                  onChange={(e) => setTargetMonthlyProfit(Number(e.target.value))}
                  className="block w-full pr-8 pl-3 py-2 bg-slate-50 border border-slate-200 text-slate-800 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-colors font-mono"
                />
                <div className="absolute inset-y-0 right-0 pr-3 flex items-center pointer-events-none text-slate-400 text-xs font-bold">
                  원
                </div>
              </div>
            </div>

            <div className="pt-3 flex justify-end">
              <button
                type="submit"
                className="bg-emerald-500 hover:bg-emerald-600 border border-transparent active:bg-emerald-755 text-white font-bold py-2.5 px-4.5 rounded-xl text-xs duration-100 cursor-pointer shadow-cs shadow-emerald-500/10"
              >
                영업 수수료 목표 저장
              </button>
            </div>
          </form>
        </div>
      </div>

      {/* I'mweb API Integration Card */}
      <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-xs" id="imweb_setting_card">
        <div className="flex items-center space-x-2.5 mb-5 border-b border-slate-100 pb-3">
          <Link className="h-5 w-5 text-blue-500" />
          <h3 className="font-bold text-slate-900 text-base">아임웹 (I'mweb) API 연동</h3>
        </div>
        <div className="flex flex-col md:flex-row gap-6 items-start">
          <div className="flex-1 space-y-3">
            <h4 className="font-bold text-slate-900 text-sm">REST API 인증 키 세팅</h4>
            <p className="text-xs text-slate-500 font-sans leading-relaxed">
              .env 서버 환경변수에 입력된 아임웹 API KEY 및 SECRET 값으로 
              접근 토큰(Access Token) 발급 가능 여부를 검증합니다. 
              올바르게 연동되어야 주문 데이터와 매출 정보 연동이 활성화됩니다.
            </p>
            {imwebStatus === 'success' && (
              <div className="inline-flex items-center px-3 py-1.5 rounded-lg bg-blue-50 border border-blue-100 text-blue-700 text-xs font-bold space-x-1.5 mt-2">
                <Check className="h-3.5 w-3.5" />
                <span>정상 연동됨</span>
              </div>
            )}
            {imwebStatus === 'error' && (
              <div className="inline-flex items-center px-3 py-1.5 rounded-lg bg-red-50 border border-red-100 text-red-700 text-xs font-bold space-x-1.5 mt-2">
                <AlertCircle className="h-3.5 w-3.5" />
                <span>{imwebMessage}</span>
              </div>
            )}
          </div>
          <div className="w-full md:w-auto shrink-0 pt-1 md:pt-0">
             <button
                onClick={checkImwebConnection}
                disabled={imwebStatus === 'loading'}
                className="w-full md:w-auto bg-slate-100 hover:bg-slate-200 border border-slate-200 text-slate-800 font-bold py-2.5 px-4.5 rounded-xl text-xs duration-100 cursor-pointer flex items-center justify-center space-x-2 disabled:opacity-50"
              >
                {imwebStatus === 'loading' ? (
                   <RefreshCw className="h-4 w-4 animate-spin text-slate-500" />
                ) : (
                   <ShieldCheck className="h-4 w-4 text-slate-600" />
                )}
                <span>연동 상태 테스트</span>
              </button>
          </div>
        </div>
      </div>

      {/* Developer and storage area */}
      <div className="bg-slate-50 border border-slate-200 rounded-2xl p-6" id="storage_reset_card">
        <div className="flex items-start space-x-3">
          <Database className="h-5 w-5 text-slate-650 shrink-0 mt-0.5" />
          <div className="space-y-3">
            <div>
              <h4 className="font-bold text-slate-900 text-sm">로컬 데이터 스토리지 초기화</h4>
              <p className="text-xs text-slate-500 mt-1">
                스토리지 상의 영업 역사와 임시 캐시 세션을 말소하고 데모 초기 데이터로 세션을 백업 복구합니다.
              </p>
            </div>
            <button
              onClick={handleClearCache}
              className="bg-red-50 hover:bg-red-100 border border-red-200 text-red-700 font-bold py-2 px-4 rounded-xl text-xs duration-100 cursor-pointer"
            >
              스토리지 전체 공장 초기화
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
