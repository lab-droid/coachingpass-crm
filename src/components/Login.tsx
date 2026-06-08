/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import { motion } from 'motion/react';
import { Server, ShieldCheck, AlertCircle } from 'lucide-react';
import { User } from '../types';
import { auth } from '../firebase';
import { signInWithPopup, GoogleAuthProvider } from 'firebase/auth';

interface LoginProps {
  onLoginSuccess: (user: User) => void;
}

export default function Login(props: LoginProps) {
  const [errorCode, setErrorCode] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const handleGoogleLogin = async () => {
    setErrorCode(null);
    setIsLoading(true);

    try {
      const provider = new GoogleAuthProvider();
      const result = await signInWithPopup(auth, provider);
      const user = result.user;
      
      const loggedInUser: User = {
        id: user.uid,
        email: user.email || '',
        name: user.displayName || user.email?.split('@')[0] || 'Unknown',
        role: 'admin', // Demo fallback. Real app should query role from Firestore
        avatarUrl: user.photoURL || undefined
      };
      
      localStorage.setItem('logged_in_user', JSON.stringify(loggedInUser));
      props.onLoginSuccess(loggedInUser);
    } catch (error: any) {
      console.error(error);
      setErrorCode(error.message || '로그인에 실패했습니다.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div id="login_container" className="min-h-screen bg-slate-50 flex flex-col justify-center py-12 sm:px-6 lg:px-8 font-sans">
      <motion.div 
        id="login_header_box" 
        className="sm:mx-auto sm:w-full sm:max-w-md"
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6 }}
      >
        <div id="login_brand_logo" className="flex items-center justify-center space-x-2">
          <div id="brand_icon_bg" className="h-12 w-12 rounded-xl bg-black border border-amber-500/30 flex items-center justify-center overflow-hidden shadow-lg shadow-amber-500/20 shrink-0">
            <img 
              src="/src/assets/images/coachingpass_logo_1780933492848.png" 
              className="h-full w-full object-cover" 
              alt="코칭패스 CRM" 
              referrerPolicy="no-referrer" 
            />
          </div>
          <span className="text-2xl font-black text-slate-900 tracking-tight">코칭패스 CRM</span>
        </div>
        <h2 className="mt-6 text-center text-3xl font-extrabold text-slate-800 tracking-tight">
          영업 성과 관리 시스템
        </h2>
        <p className="mt-2 text-center text-sm text-slate-500">
          실시간 매출 지표 및 수수료 정산의 효율적인 디지털 워크플로우
        </p>
      </motion.div>

      <motion.div 
        id="login_form_box" 
        className="mt-8 sm:mx-auto sm:w-full sm:max-w-md"
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.5, delay: 0.1 }}
      >
        <div className="bg-white py-8 px-4 shadow-xl shadow-slate-200/50 rounded-2xl border border-slate-200/60 sm:px-10 text-center">
            {errorCode && (
              <div id="login_error_banner" className="mb-6 bg-red-50 border-l-4 border-red-500 p-4 rounded-md flex items-start space-x-2 text-left">
                <AlertCircle className="h-5 w-5 text-red-500 shrink-0 mt-0.5" />
                <span className="text-sm text-red-800 font-medium">{errorCode}</span>
              </div>
            )}

            <button
              type="button"
              id="login_submit_btn"
              onClick={handleGoogleLogin}
              disabled={isLoading}
              className="w-full flex justify-center py-3 px-4 border border-transparent rounded-xl shadow-md text-sm font-semibold text-white bg-slate-800 hover:bg-slate-900 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-slate-500 duration-150 cursor-pointer disabled:opacity-75 items-center space-x-2"
            >
              {isLoading ? (
                <>
                  <svg className="animate-spin -ml-1 mr-3 h-5 w-5 text-white" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                  </svg>
                  <span>Google 인증 보안 로그인 중...</span>
                </>
              ) : (
                <>
                  <Server className="h-4 w-4 text-emerald-400" />
                  <span>Google 계정으로 보안 로그인</span>
                </>
              )}
            </button>
        </div>
      </motion.div>

      <div id="login_footer" className="mt-8 text-center text-xs text-slate-400">
        © 2026 코칭패스 CRM. All rights reserved.
        <br />
        <span className="font-mono mt-1 block">Google OAuth & Firebase Protected</span>
      </div>
    </div>
  );
}
