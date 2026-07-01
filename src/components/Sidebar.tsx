/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import { 
  Columns3, 
  TrendingUp, 
  DollarSign, 
  BarChart3, 
  Settings as SettingsIcon, 
  LogOut, 
  Menu, 
  X, 
  ShieldCheck, 
  UserCircle,
  Award,
  Percent,
  Users,
  Key
} from 'lucide-react';
import { User } from '../types';
import logoUrl from '../assets/images/coachingpass_logo.png';

interface SidebarProps {
  activeTab: string;
  setActiveTab: (tab: string) => void;
  user: User;
  onLogout: () => void;
  companyName: string;
}

export default function Sidebar(props: SidebarProps) {
  const [isOpenMobile, setIsOpenMobile] = useState(false);

  // Full menu list
  const fullMenuItems = [
    { id: 'dashboard', label: '종합 대시보드', icon: Columns3 },
    { id: 'sales', label: '매출 지표 관리', icon: TrendingUp },
    { id: 'settlement', label: '수수료 & 정산', icon: DollarSign },
    { id: 'coach_fees', label: '코치 수수료', icon: Award },
    { id: 'sales_fees', label: '영업 수수료', icon: Percent },
    { id: 'employees', label: '임직원', icon: Users },
    { id: 'analytics', label: '심층 요약 분석', icon: BarChart3 },
    { id: 'accounts', label: '계정 생성 및 관리', icon: Key },
    { id: 'mypage', label: '마이페이지', icon: UserCircle },
    { id: 'settings', label: '시스템 설정', icon: SettingsIcon },
  ];

  // Filter menu items by role (마이페이지는 모든 로그인 사용자에게 노출)
  const getMenuItems = () => {
    const role = props.user.role;
    if (role === 'admin' || role === 'manager') {
      return fullMenuItems;
    }
    if (role === '영업팀') {
      return fullMenuItems.filter(item =>
        item.id === 'dashboard' || item.id === 'sales' || item.id === 'sales_fees' || item.id === 'mypage'
      );
    }
    if (role === '코치') {
      return fullMenuItems.filter(item =>
        item.id === 'dashboard' || item.id === 'coach_fees' || item.id === 'mypage'
      );
    }
    // Default fallback
    return fullMenuItems;
  };

  const menuItems = getMenuItems();

  const handleTabChange = (tabId: string) => {
    props.setActiveTab(tabId);
    setIsOpenMobile(false);
  };

  return (
    <>
      {/* Mobile Header Bar */}
      <header className="lg:hidden bg-slate-950 text-white font-sans h-16 px-4 flex items-center justify-between border-b border-slate-800 shrink-0 w-full sticky top-0 z-50">
        <div className="flex items-center space-x-2">
          <div className="h-9 w-9 rounded-lg bg-white border border-slate-200 flex items-center justify-center overflow-hidden shadow-lg shrink-0">
            <img
              src={logoUrl}
              className="h-full w-full object-contain p-1"
              alt="코칭패스 CRM"
              referrerPolicy="no-referrer"
            />
          </div>
          <span className="font-extrabold text-base tracking-tight text-white">{props.companyName}</span>
        </div>
        <button 
          onClick={() => setIsOpenMobile(!isOpenMobile)}
          className="p-2 rounded-lg text-slate-300 hover:text-white hover:bg-slate-800 duration-100 cursor-pointer"
        >
          {isOpenMobile ? <X className="h-6 w-6" /> : <Menu className="h-6 w-6" />}
        </button>
      </header>

      {/* Mobile Drawer Overlay */}
      {isOpenMobile && (
        <div 
          className="fixed inset-0 bg-slate-950/60 backdrop-blur-xs z-40 lg:hidden"
          onClick={() => setIsOpenMobile(false)}
        />
      )}

      {/* Sidebar Container */}
      <aside className={`
        fixed inset-y-0 left-0 bg-slate-950 text-slate-300 font-sans w-72 h-screen z-50 flex flex-col border-r border-slate-900 shadow-xl transition-all duration-300 transform
        lg:static lg:translate-x-0
        ${isOpenMobile ? 'translate-x-0' : '-translate-x-full'}
      `}>
        {/* Brand/Header */}
        <div className="flex flex-col flex-1 min-h-0">
          <div className="h-20 shrink-0 flex items-center px-6 border-b border-slate-900 justify-between">
            <div className="flex items-center space-x-2.5">
              <div className="h-10 w-10 rounded-xl bg-white border border-slate-200 flex items-center justify-center overflow-hidden shadow-lg shadow-slate-300/10 shrink-0">
                <img
                  src={logoUrl}
                  className="h-full w-full object-contain p-1"
                  alt="코칭패스 CRM"
                  referrerPolicy="no-referrer"
                />
              </div>
              <div>
                <span className="font-black text-base text-white block tracking-tight">{props.companyName}</span>
                <span className="text-[10px] text-amber-500/90 font-mono font-bold tracking-wide">ENTERPRISE SYSTEM v1.2</span>
              </div>
            </div>
            {isOpenMobile && (
              <button 
                onClick={() => setIsOpenMobile(false)}
                className="lg:hidden p-1.5 rounded-lg text-slate-400 hover:text-white"
              >
                <X className="h-5 w-5" />
              </button>
            )}
          </div>

          {/* Navigation Links */}
          <nav className="p-4 space-y-1.5 mt-4 flex-1 overflow-y-auto min-h-0">
            {menuItems.map((item) => {
              const IconComponent = item.icon;
              const isActive = props.activeTab === item.id;
              return (
                <button
                  key={item.id}
                  id={`nav_btn_${item.id}`}
                  onClick={() => handleTabChange(item.id)}
                  className={`
                    w-full flex items-center space-x-3 px-4 py-3.5 rounded-xl text-sm font-medium transition-all duration-150 cursor-pointer
                    ${isActive 
                      ? 'bg-emerald-500 text-white shadow-lg shadow-emerald-500/15' 
                      : 'hover:bg-slate-900 hover:text-slate-100'
                    }
                  `}
                >
                  <IconComponent className={`h-5 w-5 ${isActive ? 'text-white' : 'text-slate-400'}`} />
                  <span>{item.label}</span>
                </button>
              );
            })}
          </nav>
        </div>

        {/* User Profile & Logout section at Footer */}
        <div className="p-4 shrink-0 border-t border-slate-900 bg-slate-950">
          <div className="flex items-center space-x-3 p-3 rounded-xl bg-slate-900 border border-slate-900/60 mb-3">
            {props.user.avatarUrl ? (
              <img 
                src={props.user.avatarUrl} 
                alt={props.user.name} 
                className="h-10 w-10 rounded-full border border-slate-700 object-cover"
                referrerPolicy="no-referrer"
              />
            ) : (
              <UserCircle className="h-10 w-10 text-slate-400 border border-slate-800 rounded-full" />
            )}
            <div className="truncate flex-1">
              <span className="text-sm font-bold text-white block truncate">{props.user.name}</span>
              <span className="text-xs text-slate-500 block truncate font-mono">{props.user.email}</span>
            </div>
            <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded capitalize ${
              props.user.role === 'admin' 
                ? 'bg-rose-500/15 text-rose-400 border border-rose-500/20' 
                : props.user.role === '영업팀'
                ? 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/20'
                : props.user.role === '코치'
                ? 'bg-indigo-500/15 text-indigo-400 border border-indigo-500/20'
                : 'bg-slate-700 text-slate-300'
            }`}>
              {props.user.role === 'admin' ? '총괄자' : props.user.role === '영업팀' ? '영업팀' : props.user.role === '코치' ? '코치단' : '담당자'}
            </span>
          </div>

          <button
            id="nav_logout_btn"
            onClick={props.onLogout}
            className="w-full flex items-center justify-center space-x-2 px-4 py-3 rounded-xl text-sm font-semibold text-slate-400 hover:text-white hover:bg-slate-900 transition-colors border border-slate-900 hover:border-slate-800 duration-100 cursor-pointer"
          >
            <LogOut className="h-4 w-4" />
            <span>시스템 로그아웃</span>
          </button>
        </div>
      </aside>
    </>
  );
}
