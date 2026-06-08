/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';

export function SkeletonCard() {
  return (
    <div className="bg-white rounded-xl border border-slate-200 p-6 shadow-sm overflow-hidden relative">
      <div className="flex items-center justify-between mb-4">
        <div className="h-4 w-24 rounded animate-shimmer"></div>
        <div className="h-8 w-8 rounded-lg animate-shimmer"></div>
      </div>
      <div className="h-8 w-36 rounded mb-2 animate-shimmer"></div>
      <div className="h-4 w-48 rounded animate-shimmer"></div>
    </div>
  );
}

export function SkeletonTable() {
  return (
    <div className="bg-white rounded-xl border border-slate-200 p-6 shadow-sm w-full">
      <div className="flex items-center justify-between mb-6">
        <div className="h-6 w-48 rounded animate-shimmer"></div>
        <div className="flex space-x-2">
          <div className="h-9 w-32 rounded-lg animate-shimmer"></div>
          <div className="h-9 w-24 rounded-lg animate-shimmer"></div>
        </div>
      </div>
      <div className="space-y-4">
        {/* Table Header mock */}
        <div className="grid grid-cols-6 gap-4 pb-4 border-b border-slate-100">
          <div className="h-4 rounded animate-shimmer w-16"></div>
          <div className="h-4 rounded animate-shimmer w-24"></div>
          <div className="h-4 rounded animate-shimmer w-20"></div>
          <div className="h-4 rounded animate-shimmer w-24"></div>
          <div className="h-4 rounded animate-shimmer w-16"></div>
          <div className="h-4 rounded animate-shimmer w-20"></div>
        </div>
        {/* Table Rows mock */}
        {[1, 2, 3, 4, 5].map((i) => (
          <div key={i} className="grid grid-cols-6 gap-4 py-3 border-b border-slate-50 items-center">
            <div className="h-4 rounded animate-shimmer w-20"></div>
            <div className="h-4 rounded animate-shimmer w-32"></div>
            <div className="h-4 rounded animate-shimmer w-24"></div>
            <div className="h-4 rounded animate-shimmer w-28 font-mono"></div>
            <div className="h-6 rounded-full animate-shimmer w-16"></div>
            <div className="h-4 rounded animate-shimmer w-24"></div>
          </div>
        ))}
      </div>
    </div>
  );
}

export function SkeletonChart() {
  return (
    <div className="bg-white rounded-xl border border-slate-200 p-6 shadow-sm w-full">
      <div className="h-5 w-48 rounded mb-6 animate-shimmer"></div>
      <div className="h-64 w-full rounded-lg animate-shimmer"></div>
    </div>
  );
}

export function SkeletonPage() {
  return (
    <div className="space-y-6">
      {/* 4 Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <SkeletonCard />
        <SkeletonCard />
        <SkeletonCard />
        <SkeletonCard />
      </div>
      
      {/* 2 Charts Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2">
          <SkeletonChart />
        </div>
        <div>
          <SkeletonChart />
        </div>
      </div>

      {/* Table */}
      <SkeletonTable />
    </div>
  );
}
