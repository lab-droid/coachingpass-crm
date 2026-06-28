/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import { motion } from 'motion/react';
import { Server, ShieldCheck, AlertCircle, Sparkles, Lock, Mail, Eye, EyeOff, ExternalLink, Smartphone } from 'lucide-react';
import { User, UserAccount } from '../types';
import { auth, db } from '../firebase';
import { signInWithPopup, GoogleAuthProvider } from 'firebase/auth';
import { collection, getDocs } from 'firebase/firestore';
import logoUrl from '../assets/images/coachingpass_logo.png';

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

  // Email/Password states
  const [emailId, setEmailId] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);

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
      setErrorCode("로그인 ID와 비밀번호를 모두 입력해주십시오.");
      return;
    }

    setErrorCode(null);
    setIsLoading(true);

    try {
      let matchedAccount: UserAccount | undefined = undefined;

      // Try fetching accounts from Firestore
      try {
        const querySnapshot = await getDocs(collection(db, 'user_accounts'));
        const cloudAccounts = querySnapshot.docs.map(doc => doc.data() as UserAccount);
        
        // Cache them in localStorage in case of quota hit in future
        if (cloudAccounts.length > 0) {
          localStorage.setItem('cached_user_accounts', JSON.stringify(cloudAccounts));
        }

        matchedAccount = cloudAccounts.find(
          acc => acc.email.toLowerCase() === emailId.trim().toLowerCase() && acc.password === password
        );
      } catch (firestoreError) {
        console.warn("Firestore user_accounts fetch failed (quota or offline), reading local fallback:", firestoreError);
        const cached = localStorage.getItem('cached_user_accounts');
        if (cached) {
          const cachedAccounts = JSON.parse(cached) as UserAccount[];
          matchedAccount = cachedAccounts.find(
            acc => acc.email.toLowerCase() === emailId.trim().toLowerCase() && acc.password === password
          );
        }
      }

      // Default mock users fallback if no accounts loaded/found
      if (!matchedAccount) {
        const allAccounts = [
          { email: 'sh.jung@coachingpass.com', password: 'password123', name: '정시훈', role: 'admin' as const, employeeId: 'emp_001' },
          { email: 'yr.huh@coachingpass.com', password: 'password123', name: '허예령', role: 'admin' as const, employeeId: 'emp_002' },
          { email: 'gm.oh@coachingpass.com', password: 'password123', name: '오근목', role: '영업팀' as const, employeeId: 'emp_003' },
          { email: 'hr.seo@coachingpass.com', password: 'password123', name: '서헤림', role: '영업팀' as const, employeeId: 'emp_004' },
          { email: 'coach_a@coachingpass.com', password: 'password123', name: '김코치', role: '코치' as const, employeeId: 'c_001' }
        ];
        const matched = allAccounts.find(
          a => a.email.toLowerCase() === emailId.trim().toLowerCase() && a.password === password
        );
        if (matched) {
          matchedAccount = {
            id: 'acc_mock_' + matched.employeeId,
            email: matched.email,
            password: matched.password,
            name: matched.name,
            role: matched.role,
            employeeId: matched.employeeId,
            status: 'active'
          };
        }
      }

      if (!matchedAccount) {
        setErrorCode("일치하는 로그인 계정 정보가 없거나 비밀번호가 틀립니다.");
        setIsLoading(false);
        return;
      }

      if (matchedAccount.status === 'inactive') {
        setErrorCode("해당 계정은 시스템 운영자에 의해 정지(비활성화)된 계정입니다.");
        setIsLoading(false);
        return;
      }

      // Success
      const loggedInUser: User = {
        id: matchedAccount.id,
        email: matchedAccount.email,
        name: matchedAccount.name,
        role: matchedAccount.role,
        employeeId: matchedAccount.employeeId
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

  return (
    <div id="login_container" className="min-h-screen bg-slate-50 flex flex-col justify-center py-12 px-4 sm:px-6 lg:px-8 font-sans">
      <motion.div 
        id="login_header_box" 
        className="sm:mx-auto sm:w-full sm:max-w-md text-center"
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6 }}
      >
        <div id="login_brand_logo" className="flex items-center justify-center">
          <div id="brand_icon_bg" className="h-14 w-14 rounded-xl bg-white border border-slate-200 flex items-center justify-center overflow-hidden shadow-lg shadow-slate-300/40 shrink-0">
            <img
              src={logoUrl}
              className="h-full w-full object-contain p-1.5"
              alt="코칭패스 CRM"
              referrerPolicy="no-referrer"
            />
          </div>
        </div>
        <h2 className="mt-5 text-3xl font-extrabold text-slate-800 tracking-tight">
          코칭패스 CRM
        </h2>
        <p className="mt-1.5 text-xs text-slate-400 font-semibold uppercase tracking-wider">
          Enterprise Security Access
        </p>
      </motion.div>

      <motion.div 
        id="login_form_box" 
        className="mt-6 sm:mx-auto sm:w-full sm:max-w-md"
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.5, delay: 0.1 }}
      >
        <div className="bg-white py-6 px-4 shadow-xl shadow-slate-200/60 rounded-2xl border border-slate-205 sm:px-10">
          {/* Dual Tab selectors */}
          <div className="grid grid-cols-2 gap-2 mb-6 p-1 bg-slate-100 rounded-xl">
            <button
              type="button"
              onClick={() => { setActiveLoginTab('credential'); setErrorCode(null); }}
              className={`py-2 px-3 text-xs font-bold rounded-lg transition-all cursor-pointer ${
                activeLoginTab === 'credential' 
                  ? 'bg-white text-slate-900 shadow-sm' 
                  : 'text-slate-500 hover:text-slate-800'
              }`}
            >
              임직원 / 파트너 포털
            </button>
            <button
              type="button"
              onClick={() => { setActiveLoginTab('google'); setErrorCode(null); }}
              className={`py-2 px-3 text-xs font-bold rounded-lg transition-all cursor-pointer ${
                activeLoginTab === 'google' 
                  ? 'bg-white text-slate-900 shadow-sm' 
                  : 'text-slate-500 hover:text-slate-800'
              }`}
            >
              총괄 운영진 (Google)
            </button>
          </div>

          {errorCode && (
            <div id="login_error_banner" className="mb-5 bg-red-50 border-l-4 border-red-500 p-3.5 rounded-lg flex items-start space-x-2 text-left">
              <AlertCircle className="h-4.5 w-4.5 text-red-500 shrink-0 mt-0.5" />
              <span className="text-[11px] text-red-800 font-semibold leading-relaxed">{errorCode}</span>
            </div>
          )}

          {activeLoginTab === 'credential' ? (
            <form onSubmit={handleCredentialLogin} className="space-y-4">
              {/* ID / Email */}
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1.5">로그인 이메일 (ID)</label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-400">
                    <Mail className="h-4 w-4" />
                  </div>
                  <input
                    type="email"
                    value={emailId}
                    onChange={(e) => setEmailId(e.target.value)}
                    className="w-full text-xs font-medium pl-10 pr-4 py-2.5 bg-slate-50/50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-slate-800/20 focus:border-slate-800/80 transition-all font-mono"
                    placeholder="name@coachingpass.com"
                    autoComplete="username"
                    required
                  />
                </div>
              </div>

              {/* Password */}
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="block text-xs font-bold text-slate-700">로그인 암호</label>
                  <span className="text-[10px] text-indigo-600 font-bold">암구 비밀번호</span>
                </div>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-400">
                    <Lock className="h-4 w-4" />
                  </div>
                  <input
                    type={showPassword ? 'text' : 'password'}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="w-full text-xs font-bold pl-10 pr-10 py-2.5 bg-slate-50/50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-slate-800/20 focus:border-slate-800/80 transition-all font-mono"
                    placeholder="암호를 입력하십시오"
                    autoComplete="current-password"
                    required
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute inset-y-0 right-0 pr-3 flex items-center text-slate-400 hover:text-slate-600 cursor-pointer"
                  >
                    {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
              </div>

              {/* Submit ID login */}
              <button
                type="submit"
                disabled={isLoading}
                className="w-full flex justify-center py-3 px-4 border border-transparent rounded-xl shadow-md text-xs font-bold text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-505 transition-colors duration-100 cursor-pointer disabled:opacity-75 items-center space-x-2 mt-2"
              >
                {isLoading ? (
                  <>
                    <svg className="animate-spin h-4 w-4 text-white" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                    </svg>
                    <span>임직원 보안 확인 중...</span>
                  </>
                ) : (
                  <>
                    <ShieldCheck className="h-4 w-4 text-indigo-300" />
                    <span>발급된 계정으로 통합 로그인</span>
                  </>
                )}
              </button>
            </form>
          ) : (
            <div className="space-y-4">
              {inAppBrowser && (
                <div className="mb-2 bg-amber-50 border border-amber-200 rounded-xl p-3.5 text-left">
                  <div className="flex items-start space-x-2">
                    <Smartphone className="h-4 w-4 text-amber-600 shrink-0 mt-0.5" />
                    <div className="space-y-2">
                      <p className="text-[11px] text-amber-900 font-bold leading-relaxed">
                        카카오톡·네이버 등 <span className="underline">인앱 브라우저</span>에서는 구글 보안정책상 로그인이 차단됩니다(403).
                      </p>
                      {isIOS ? (
                        <p className="text-[11px] text-amber-800 leading-relaxed">
                          화면 우측 상단(또는 하단)의 <b>···</b> / 공유 메뉴 → <b>“Safari로 열기”</b>를 눌러 기본 브라우저로 접속한 뒤 다시 로그인해 주세요.
                        </p>
                      ) : (
                        <button
                          type="button"
                          onClick={openInExternalBrowser}
                          className="inline-flex items-center space-x-1.5 px-3 py-2 rounded-lg bg-amber-500 hover:bg-amber-600 text-white text-[11px] font-bold transition-colors cursor-pointer"
                        >
                          <ExternalLink className="h-3.5 w-3.5" />
                          <span>기본 브라우저(Chrome)로 열기</span>
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              )}
              <p className="text-slate-500 text-[11px] leading-relaxed text-center mb-4">
                Google인증이 승인되어 등록된 운영진만 로그인이 허용됩니다. Google Workspace 계정을 터치하십시오.
              </p>
              <button
                type="button"
                id="login_submit_btn"
                onClick={handleGoogleLogin}
                disabled={isLoading}
                className="w-full flex justify-center py-3.5 px-4 border border-transparent rounded-xl shadow-md text-xs font-bold text-white bg-slate-800 hover:bg-slate-900 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-slate-500 duration-100 cursor-pointer disabled:opacity-75 items-center justify-center space-x-2"
              >
                {isLoading ? (
                  <>
                    <svg className="animate-spin h-4 w-4 text-white" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                    </svg>
                    <span>Google 인증 보안 로그인 중...</span>
                  </>
                ) : (
                  <>
                    <Server className="h-4 w-4 text-emerald-400" />
                    <span>Google 계정으로 보안 관리자 로그인</span>
                  </>
                )}
              </button>
            </div>
          )}
        </div>
      </motion.div>

      <div id="login_footer" className="mt-8 text-center text-xs text-slate-400 font-medium">
        © 2026 {activeLoginTab === 'google' ? 'Google Auth Protocol Protect' : 'Internal Pass Portal'}.
        <br />
        <span className="font-mono mt-1.5 block">Coaching Pass CRM Control Layer</span>
      </div>
    </div>
  );
}
