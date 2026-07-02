/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import { motion } from 'motion/react';
import { Server, ShieldCheck, AlertCircle, Lock, Eye, EyeOff, ExternalLink, Smartphone, Hash, Mail, ArrowLeft } from 'lucide-react';
import { User, Employee } from '../types';
import { auth, db } from '../firebase';
import { signInWithPopup, GoogleAuthProvider } from 'firebase/auth';
import { collection, getDocs, setDoc, doc } from 'firebase/firestore';
import { generateTempPassword } from '../utils/password';
import logoUrl from '../assets/images/coachingpass_logo.png';

// 임직원 직무(role)를 앱 사용자 권한으로 매핑
const mapEmployeeRole = (role?: string): User['role'] => {
  if (role === '임원' || role === '관리자') return 'admin';
  if (role === '영업팀') return '영업팀';
  return '코치';
};

// 임직원 목록을 Firestore에서 로드(실패 시 로컬 캐시 사용)
async function loadEmployees(): Promise<Employee[]> {
  try {
    const snap = await getDocs(collection(db, 'employees'));
    const emps = snap.docs.map(d => d.data() as Employee);
    if (emps.length > 0) localStorage.setItem('cached_employees', JSON.stringify(emps));
    return emps;
  } catch {
    const cached = localStorage.getItem('cached_employees');
    if (cached) {
      try { return JSON.parse(cached) as Employee[]; } catch { /* ignore */ }
    }
    return [];
  }
}

interface LoginProps {
  onLoginSuccess: (user: User) => void;
}

// 카카오톡/네이버/인스타 등 '인앱 브라우저(웹뷰)' 감지.
// 구글은 이런 임베디드 브라우저에서의 OAuth 로그인을 차단한다(403 disallowed_useragent).
// 따라서 외부 브라우저(Chrome/Safari)로 열도록 유도해야 한다.
const detectInAppBrowser = (): string | null => {
  if (typeof navigator === 'undefined') return null;
  const ua = navigator.userAgent || '';
  if (/KAKAOTALK/i.test(ua)) return 'kakao';
  if (/NAVER\(inapp|inapp; ?naver/i.test(ua)) return 'naver';
  if (/Instagram/i.test(ua)) return 'instagram';
  if (/FBAN|FBAV|FB_IAB/i.test(ua)) return 'facebook';
  if (/Line\//i.test(ua)) return 'line';
  if (/DaumApps|DaumDevice/i.test(ua)) return 'daum';
  if (/\bBAND\b|; ?BAND/i.test(ua)) return 'band';
  // 안드로이드 일반 WebView (인앱 브라우저 공통)
  if (/Android.*; wv\)/i.test(ua) || /; wv\)/i.test(ua)) return 'webview';
  return null;
};

const isIOSDevice = (): boolean =>
  typeof navigator !== 'undefined' && /iPhone|iPad|iPod/i.test(navigator.userAgent || '');

// 가능하면 현재 페이지를 외부 기본 브라우저에서 강제로 다시 연다.
const openInExternalBrowser = () => {
  const url = window.location.href;
  const kind = detectInAppBrowser();

  if (kind === 'kakao') {
    // 카카오톡 인앱 브라우저: 외부 브라우저 열기 스킴
    window.location.href = 'kakaotalk://web/openExternal?url=' + encodeURIComponent(url);
    return;
  }
  if (kind === 'line') {
    // 라인: openExternalBrowser 파라미터
    const sep = url.includes('?') ? '&' : '?';
    window.location.href = url + sep + 'openExternalBrowser=1';
    return;
  }
  if (!isIOSDevice()) {
    // 안드로이드 일반: Chrome 인텐트로 외부 실행
    try {
      const u = new URL(url);
      window.location.href =
        'intent://' + u.host + u.pathname + u.search +
        '#Intent;scheme=https;package=com.android.chrome;end';
      return;
    } catch {
      /* fall through */
    }
  }
  // iOS 인앱 브라우저는 강제 전환이 불가 → 사용자 안내(우측 상단/하단 메뉴에서 'Safari로 열기')
};

export default function Login(props: LoginProps) {
  const [activeLoginTab, setActiveLoginTab] = useState<'google' | 'credential'>('credential');
  const [errorCode, setErrorCode] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  // 인앱 브라우저(웹뷰) 여부 — 구글 OAuth 차단(403 disallowed_useragent) 회피용 안내에 사용
  const inAppBrowser = detectInAppBrowser();
  const isIOS = isIOSDevice();

  // 사번/비밀번호 states
  const [emailId, setEmailId] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);

  // 비밀번호 찾기(사번 → 등록 이메일로 임시비밀번호 발급) 상태
  const [showForgot, setShowForgot] = useState(false);
  const [forgotSabun, setForgotSabun] = useState('');
  const [forgotSending, setForgotSending] = useState(false);
  const [forgotMsg, setForgotMsg] = useState<string | null>(null);
  const [forgotErr, setForgotErr] = useState(false);

  const maskEmail = (em: string): string => {
    const [u, d] = (em || '').split('@');
    if (!d) return em;
    const masked = u.length <= 2 ? (u[0] || '') + '*' : u.slice(0, 2) + '*'.repeat(Math.max(1, u.length - 2));
    return `${masked}@${d}`;
  };

  const handleForgotPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setForgotMsg(null);
    setForgotErr(false);
    const sabun = forgotSabun.trim();
    if (!sabun) {
      setForgotErr(true);
      setForgotMsg('사번을 입력해 주세요.');
      return;
    }
    setForgotSending(true);
    try {
      const emps = await loadEmployees();
      const emp = emps.find(e => (e.employeeNumber || '').toUpperCase() === sabun.toUpperCase());
      if (!emp) {
        setForgotErr(true);
        setForgotMsg('해당 사번의 임직원을 찾을 수 없습니다.');
        setForgotSending(false);
        return;
      }
      if (emp.status === 'resigned' || emp.status === 'inactive') {
        setForgotErr(true);
        setForgotMsg('퇴사 처리된 계정입니다. 관리자에게 문의하세요.');
        setForgotSending(false);
        return;
      }
      if (!emp.email) {
        setForgotErr(true);
        setForgotMsg('등록된 이메일이 없습니다. 관리자에게 문의하세요.');
        setForgotSending(false);
        return;
      }

      const tempPw = generateTempPassword();

      // 1) 이메일 발송 먼저 시도 (성공해야 비밀번호를 교체 → 락아웃 방지)
      const res = await fetch('/api/send-temp-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: emp.email, name: emp.name, tempPassword: tempPw, employeeNumber: emp.employeeNumber })
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setForgotErr(true);
        if (data?.error === 'email_not_configured') {
          setForgotMsg('이메일 발송이 아직 설정되지 않았습니다. 관리자에게 문의하세요.');
        } else {
          setForgotMsg('임시비밀번호 이메일 발송에 실패했습니다. 잠시 후 다시 시도하거나 관리자에게 문의하세요.');
        }
        setForgotSending(false);
        return;
      }

      // 2) 발송 성공 시 임시비밀번호를 임직원 레코드에 반영
      await setDoc(doc(db, 'employees', emp.id), { initialPassword: tempPw }, { merge: true });
      const cached = localStorage.getItem('cached_employees');
      if (cached) {
        try {
          const arr = JSON.parse(cached);
          localStorage.setItem('cached_employees', JSON.stringify(arr.map((x: any) => x.id === emp.id ? { ...x, initialPassword: tempPw } : x)));
        } catch { /* ignore */ }
      }

      setForgotErr(false);
      setForgotMsg(`${maskEmail(emp.email)} 로 임시비밀번호를 발송했습니다. 메일함(스팸함 포함)을 확인해 주세요.`);
    } catch (err: any) {
      setForgotErr(true);
      setForgotMsg('처리 중 오류가 발생했습니다: ' + (err?.message || err));
    } finally {
      setForgotSending(false);
    }
  };

  const handleGoogleLogin = async () => {
    setErrorCode(null);

    // 인앱 브라우저에서는 구글이 OAuth를 차단하므로, 팝업을 시도하지 않고
    // 외부 브라우저로 열도록 유도한다. (안내 UI가 이미 노출되어 있음)
    if (inAppBrowser) {
      openInExternalBrowser();
      if (isIOS) {
        setErrorCode("카카오톡/네이버 등 인앱 브라우저에서는 구글 로그인이 차단됩니다. 우측 상단(또는 하단) 메뉴에서 'Safari로 열기'를 선택해 다시 접속해 주세요.");
      }
      return;
    }

    setIsLoading(true);

    try {
      const provider = new GoogleAuthProvider();
      const result = await signInWithPopup(auth, provider);
      const user = result.user;
      
      const loggedInUser: User = {
        id: user.uid,
        email: user.email || '',
        name: user.displayName || user.email?.split('@')[0] || 'Unknown',
        role: 'admin', // Google SSO defaults to Head admin
        avatarUrl: user.photoURL || undefined
      };

      localStorage.setItem('logged_in_user', JSON.stringify(loggedInUser));
      props.onLoginSuccess(loggedInUser);
    } catch (error: any) {
      console.error(error);
      const msg = String(error?.message || error || '');
      if (/disallowed_useragent|user-agent|popup|web-storage|operation-not-supported/i.test(msg)) {
        setErrorCode("이 브라우저에서는 구글 로그인이 제한됩니다. Chrome 또는 Safari 등 기본 브라우저에서 다시 시도해 주세요. (인앱 브라우저 사용 시 차단됨)");
      } else {
        setErrorCode(msg || '로그인에 실패했습니다.');
      }
    } finally {
      setIsLoading(false);
    }
  };

  const handleCredentialLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!emailId.trim() || !password.trim()) {
      setErrorCode("사번과 비밀번호를 모두 입력해주십시오.");
      return;
    }

    setErrorCode(null);
    setIsLoading(true);

    try {
      const input = emailId.trim();
      const isEmail = input.includes('@');
      const emps = await loadEmployees();

      // 사번(또는 이메일)으로 임직원 조회
      const emp = isEmail
        ? emps.find(e => (e.email || '').toLowerCase() === input.toLowerCase())
        : emps.find(e => (e.employeeNumber || '').toUpperCase() === input.toUpperCase());

      if (!emp) {
        setErrorCode("해당 사번의 임직원을 찾을 수 없습니다. 사번을 확인해 주세요.");
        setIsLoading(false);
        return;
      }
      if (emp.status === 'resigned' || emp.status === 'inactive') {
        setErrorCode("퇴사 처리된 계정으로 로그인이 차단되었습니다. 관리자에게 문의하세요.");
        setIsLoading(false);
        return;
      }
      // 사번 + (임시)비밀번호 검증
      if (!emp.initialPassword || emp.initialPassword !== password) {
        setErrorCode("비밀번호가 올바르지 않습니다. 관리자에게 임시 비밀번호를 확인하세요.");
        setIsLoading(false);
        return;
      }

      const loggedInUser: User = {
        id: emp.id,
        email: emp.email || '',
        name: emp.name,
        role: mapEmployeeRole(emp.role),
        employeeId: emp.id
      };
      localStorage.setItem('logged_in_user', JSON.stringify(loggedInUser));
      props.onLoginSuccess(loggedInUser);
    } catch (err: any) {
      console.error(err);
      setErrorCode("로그인 검증 오류: " + (err.message || String(err)));
    } finally {
      setIsLoading(false);
    }
  };

  const inputBase = "w-full text-sm font-medium bg-black/30 border border-white/10 rounded-xl text-white placeholder-slate-500 focus:outline-none focus:border-amber-400/70 focus:ring-2 focus:ring-amber-400/20 transition-all";

  return (
    <div id="login_container" className="relative min-h-screen min-h-[100dvh] overflow-hidden bg-gradient-to-b from-black via-slate-950 to-black flex flex-col justify-center py-10 px-5 sm:px-6 font-sans">
      {/* 골드 글로우 장식 */}
      <div className="pointer-events-none absolute -top-24 left-1/2 -translate-x-1/2 h-72 w-72 rounded-full bg-amber-500/20 blur-[100px]" />
      <div className="pointer-events-none absolute bottom-0 right-0 h-64 w-64 rounded-full bg-amber-400/10 blur-[90px]" />

      <motion.div
        id="login_header_box"
        className="relative mx-auto w-full max-w-md text-center"
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6 }}
      >
        <div className="flex items-center justify-center">
          <div className="h-16 w-16 rounded-2xl bg-white flex items-center justify-center overflow-hidden shadow-xl ring-2 ring-amber-400/40 shrink-0">
            <img
              src={logoUrl}
              className="h-full w-full object-contain p-2"
              alt="코칭패스 CRM"
              referrerPolicy="no-referrer"
            />
          </div>
        </div>
        <h2 className="mt-5 text-3xl font-black text-white tracking-tight">
          코칭패스 <span className="text-transparent bg-clip-text bg-gradient-to-r from-amber-200 to-amber-400">CRM</span>
        </h2>
        <p className="mt-2 text-[11px] text-amber-300/80 font-semibold uppercase tracking-[0.2em]">
          Enterprise Access
        </p>
      </motion.div>

      <motion.div
        id="login_form_box"
        className="relative mt-7 mx-auto w-full max-w-md"
        initial={{ opacity: 0, scale: 0.96 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.5, delay: 0.1 }}
      >
        <div className="bg-slate-900/70 backdrop-blur-xl py-7 px-5 sm:px-8 rounded-3xl border border-amber-400/15 shadow-2xl shadow-black/60">
          {/* Dual Tab selectors */}
          <div className="grid grid-cols-2 gap-1.5 mb-6 p-1 bg-black/40 border border-white/5 rounded-2xl">
            <button
              type="button"
              onClick={() => { setActiveLoginTab('credential'); setErrorCode(null); }}
              className={`py-2.5 px-3 text-xs font-bold rounded-xl transition-all cursor-pointer ${
                activeLoginTab === 'credential'
                  ? 'bg-gradient-to-r from-amber-300 to-amber-500 text-black shadow-md shadow-amber-500/20'
                  : 'text-slate-400 hover:text-amber-200'
              }`}
            >
              임직원
            </button>
            <button
              type="button"
              onClick={() => { setActiveLoginTab('google'); setErrorCode(null); }}
              className={`py-2.5 px-3 text-xs font-bold rounded-xl transition-all cursor-pointer ${
                activeLoginTab === 'google'
                  ? 'bg-gradient-to-r from-amber-300 to-amber-500 text-black shadow-md shadow-amber-500/20'
                  : 'text-slate-400 hover:text-amber-200'
              }`}
            >
              관리자
            </button>
          </div>

          {errorCode && (
            <div id="login_error_banner" className="mb-5 bg-rose-500/10 border border-rose-500/30 p-3.5 rounded-xl flex items-start space-x-2 text-left">
              <AlertCircle className="h-4.5 w-4.5 text-rose-400 shrink-0 mt-0.5" />
              <span className="text-[11px] text-rose-200 font-semibold leading-relaxed">{errorCode}</span>
            </div>
          )}

          {activeLoginTab === 'credential' ? (
            showForgot ? (
              /* 비밀번호 찾기 — 사번의 등록 이메일로 임시비밀번호 발급 */
              <form onSubmit={handleForgotPassword} className="space-y-4">
                <div>
                  <button
                    type="button"
                    onClick={() => { setShowForgot(false); setForgotMsg(null); }}
                    className="flex items-center space-x-1 text-[11px] font-bold text-slate-400 hover:text-amber-200 cursor-pointer mb-2"
                  >
                    <ArrowLeft className="h-3.5 w-3.5" />
                    <span>로그인으로 돌아가기</span>
                  </button>
                  <h3 className="text-sm font-black text-white">비밀번호 찾기</h3>
                  <p className="text-[11px] text-slate-400 mt-1 leading-relaxed">사번을 입력하면 등록된 이메일로 <span className="text-amber-300 font-bold">임시 비밀번호</span>를 발송합니다.</p>
                </div>

                {forgotMsg && (
                  <div className={`p-3.5 rounded-xl flex items-start space-x-2 text-left border ${forgotErr ? 'bg-rose-500/10 border-rose-500/30' : 'bg-emerald-500/10 border-emerald-500/30'}`}>
                    {forgotErr ? <AlertCircle className="h-4.5 w-4.5 text-rose-400 shrink-0 mt-0.5" /> : <ShieldCheck className="h-4.5 w-4.5 text-emerald-400 shrink-0 mt-0.5" />}
                    <span className={`text-[11px] font-semibold leading-relaxed ${forgotErr ? 'text-rose-200' : 'text-emerald-200'}`}>{forgotMsg}</span>
                  </div>
                )}

                <div>
                  <label className="block text-[11px] font-bold text-amber-200/90 mb-1.5 uppercase tracking-wider">사번</label>
                  <div className="relative">
                    <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-amber-400/60">
                      <Hash className="h-4 w-4" />
                    </div>
                    <input
                      type="text"
                      value={forgotSabun}
                      onChange={(e) => setForgotSabun(e.target.value)}
                      className={`${inputBase} pl-10 pr-4 py-3 font-mono`}
                      placeholder="CP0001"
                    />
                  </div>
                </div>

                <button
                  type="submit"
                  disabled={forgotSending}
                  className="w-full flex justify-center items-center space-x-2 py-3.5 px-4 rounded-xl shadow-lg shadow-amber-500/20 text-sm font-black text-black bg-gradient-to-r from-amber-300 to-amber-500 hover:from-amber-200 hover:to-amber-400 focus:outline-none transition-all cursor-pointer disabled:opacity-60 active:scale-[0.99]"
                >
                  {forgotSending ? (
                    <>
                      <svg className="animate-spin h-4 w-4 text-black" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                      </svg>
                      <span>발송 중...</span>
                    </>
                  ) : (
                    <>
                      <Mail className="h-4 w-4" />
                      <span>임시비밀번호 이메일 발송</span>
                    </>
                  )}
                </button>
              </form>
            ) : (
            <form onSubmit={handleCredentialLogin} className="space-y-4">
              {/* 사번 */}
              <div>
                <label className="block text-[11px] font-bold text-amber-200/90 mb-1.5 uppercase tracking-wider">사번</label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-amber-400/60">
                    <Hash className="h-4 w-4" />
                  </div>
                  <input
                    type="text"
                    value={emailId}
                    onChange={(e) => setEmailId(e.target.value)}
                    className={`${inputBase} pl-10 pr-4 py-3 font-mono`}
                    placeholder="CP0001"
                    autoComplete="username"
                    required
                  />
                </div>
              </div>

              {/* Password */}
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="block text-[11px] font-bold text-amber-200/90 uppercase tracking-wider">임시 비밀번호</label>
                  <button
                    type="button"
                    onClick={() => { setShowForgot(true); setForgotSabun(emailId); setForgotMsg(null); setErrorCode(null); }}
                    className="text-[10px] text-amber-300/90 font-bold hover:text-amber-200 cursor-pointer"
                  >
                    비밀번호를 잊으셨나요?
                  </button>
                </div>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-amber-400/60">
                    <Lock className="h-4 w-4" />
                  </div>
                  <input
                    type={showPassword ? 'text' : 'password'}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className={`${inputBase} pl-10 pr-10 py-3 font-mono`}
                    placeholder="암호를 입력하십시오"
                    autoComplete="current-password"
                    required
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute inset-y-0 right-0 pr-3 flex items-center text-slate-500 hover:text-amber-300 cursor-pointer"
                  >
                    {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
              </div>

              {/* Submit ID login */}
              <button
                type="submit"
                disabled={isLoading}
                className="w-full flex justify-center items-center space-x-2 py-3.5 px-4 rounded-xl shadow-lg shadow-amber-500/20 text-sm font-black text-black bg-gradient-to-r from-amber-300 to-amber-500 hover:from-amber-200 hover:to-amber-400 focus:outline-none transition-all duration-100 cursor-pointer disabled:opacity-60 mt-2 active:scale-[0.99]"
              >
                {isLoading ? (
                  <>
                    <svg className="animate-spin h-4 w-4 text-black" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                    </svg>
                    <span>보안 확인 중...</span>
                  </>
                ) : (
                  <>
                    <ShieldCheck className="h-4 w-4" />
                    <span>사번으로 로그인</span>
                  </>
                )}
              </button>
            </form>
            )
          ) : (
            <div className="space-y-4">
              {inAppBrowser && (
                <div className="mb-2 bg-amber-400/10 border border-amber-400/30 rounded-xl p-3.5 text-left">
                  <div className="flex items-start space-x-2">
                    <Smartphone className="h-4 w-4 text-amber-400 shrink-0 mt-0.5" />
                    <div className="space-y-2">
                      <p className="text-[11px] text-amber-100 font-bold leading-relaxed">
                        카카오톡·네이버 등 <span className="underline">인앱 브라우저</span>에서는 구글 보안정책상 로그인이 차단됩니다(403).
                      </p>
                      {isIOS ? (
                        <p className="text-[11px] text-amber-200/90 leading-relaxed">
                          화면 우측 상단(또는 하단)의 <b>···</b> / 공유 메뉴 → <b>“Safari로 열기”</b>를 눌러 기본 브라우저로 접속한 뒤 다시 로그인해 주세요.
                        </p>
                      ) : (
                        <button
                          type="button"
                          onClick={openInExternalBrowser}
                          className="inline-flex items-center space-x-1.5 px-3 py-2 rounded-lg bg-amber-500 hover:bg-amber-400 text-black text-[11px] font-bold transition-colors cursor-pointer"
                        >
                          <ExternalLink className="h-3.5 w-3.5" />
                          <span>기본 브라우저(Chrome)로 열기</span>
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              )}
              <p className="text-slate-400 text-[11px] leading-relaxed text-center mb-4">
                구글 인증이 승인된 등록 관리자만 로그인할 수 있습니다. Google 계정으로 계속하세요.
              </p>
              <button
                type="button"
                id="login_submit_btn"
                onClick={handleGoogleLogin}
                disabled={isLoading}
                className="w-full flex justify-center items-center space-x-2 py-3.5 px-4 rounded-xl shadow-lg text-sm font-bold text-slate-900 bg-white hover:bg-amber-50 border border-white/20 focus:outline-none duration-100 cursor-pointer disabled:opacity-60 active:scale-[0.99]"
              >
                {isLoading ? (
                  <>
                    <svg className="animate-spin h-4 w-4 text-slate-900" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                    </svg>
                    <span>구글 인증 중...</span>
                  </>
                ) : (
                  <>
                    <Server className="h-4 w-4 text-amber-500" />
                    <span>Google 계정으로 관리자 로그인</span>
                  </>
                )}
              </button>
            </div>
          )}
        </div>
      </motion.div>

      <div id="login_footer" className="relative mt-8 text-center text-[11px] text-slate-500 font-medium">
        © 2026 코칭패스 <span className="text-amber-400/70">CRM</span>
        <span className="font-mono mt-1.5 block text-slate-600">Coaching Pass Control Layer</span>
      </div>
    </div>
  );
}
