/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useRef, useLayoutEffect } from 'react';
import { createPortal } from 'react-dom';
import { Search, Check, ChevronDown } from 'lucide-react';

export interface SearchableOption {
  value: string;
  label: string;
}

interface SearchableSelectProps {
  value: string;
  options: SearchableOption[];
  onChange: (value: string) => void;
  placeholder?: string;
  searchPlaceholder?: string;
  /** 트리거(버튼)에 적용할 클래스 — 너비/색상/정렬은 호출부에서 제어 */
  triggerClassName?: string;
  disabled?: boolean;
}

// 클릭 시 검색창이 열리는 콤보박스. 긴 목록(코치/영업담당)에서 빠르게 검색·선택할 수 있다.
// 표의 overflow 영역에 잘리지 않도록 포털 + fixed 위치로 렌더링한다.
export default function SearchableSelect({
  value,
  options,
  onChange,
  placeholder = '선택',
  searchPlaceholder = '검색...',
  triggerClassName = '',
  disabled = false,
}: SearchableSelectProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [coords, setCoords] = useState<{ top: number; left: number; width: number } | null>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const selected = options.find(o => o.value === value);
  const label = selected ? selected.label : (value || placeholder);

  const filtered = query.trim()
    ? options.filter(o => o.label.toLowerCase().includes(query.trim().toLowerCase()))
    : options;

  const updateCoords = () => {
    const el = triggerRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    setCoords({ top: r.bottom + 2, left: r.left, width: r.width });
  };

  const openMenu = () => {
    if (disabled) return;
    updateCoords();
    setQuery('');
    setOpen(true);
  };

  useLayoutEffect(() => {
    if (!open) return;
    updateCoords();
    const focusTimer = setTimeout(() => inputRef.current?.focus(), 0);

    const onScrollOrResize = () => updateCoords();
    // 캡처 단계에서 스크롤 감지(내부 스크롤 컨테이너 포함)
    window.addEventListener('scroll', onScrollOrResize, true);
    window.addEventListener('resize', onScrollOrResize);

    const onDocMouseDown = (e: MouseEvent) => {
      const t = e.target as Node;
      if (menuRef.current?.contains(t) || triggerRef.current?.contains(t)) return;
      setOpen(false);
    };
    document.addEventListener('mousedown', onDocMouseDown);

    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('keydown', onKey);

    return () => {
      clearTimeout(focusTimer);
      window.removeEventListener('scroll', onScrollOrResize, true);
      window.removeEventListener('resize', onScrollOrResize);
      document.removeEventListener('mousedown', onDocMouseDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  return (
    <>
      <button
        type="button"
        ref={triggerRef}
        disabled={disabled}
        onClick={() => (open ? setOpen(false) : openMenu())}
        className={`inline-flex items-center gap-1 ${triggerClassName}`}
      >
        <span className="truncate flex-1 min-w-0">{label}</span>
        <ChevronDown className="h-3 w-3 shrink-0 opacity-50" />
      </button>

      {open && coords && createPortal(
        <div
          ref={menuRef}
          style={{ position: 'fixed', top: coords.top, left: coords.left, minWidth: Math.max(coords.width, 190), zIndex: 9999 }}
          className="bg-white border border-slate-200 rounded-xl shadow-2xl overflow-hidden font-sans"
        >
          <div className="p-1.5 border-b border-slate-100 bg-white">
            <div className="relative">
              <Search className="absolute left-2 top-2 h-3.5 w-3.5 text-slate-400" />
              <input
                ref={inputRef}
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder={searchPlaceholder}
                className="w-full pl-7 pr-2 py-1.5 text-xs border border-slate-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-emerald-500 font-medium"
              />
            </div>
          </div>
          <div className="max-h-56 overflow-y-auto py-1">
            {filtered.length === 0 ? (
              <div className="px-3 py-3 text-xs text-slate-400 text-center">검색 결과가 없습니다</div>
            ) : (
              filtered.map(o => (
                <button
                  key={o.value + '::' + o.label}
                  type="button"
                  onClick={() => { onChange(o.value); setOpen(false); }}
                  className={`w-full text-left px-3 py-1.5 text-xs hover:bg-emerald-50 flex items-center justify-between gap-2 transition-colors ${
                    o.value === value ? 'bg-emerald-50/60 font-bold text-emerald-700' : 'text-slate-700'
                  }`}
                >
                  <span className="truncate">{o.label}</span>
                  {o.value === value && <Check className="h-3.5 w-3.5 text-emerald-600 shrink-0" />}
                </button>
              ))
            )}
          </div>
        </div>,
        document.body
      )}
    </>
  );
}
