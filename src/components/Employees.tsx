/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  Users, 
  UserPlus, 
  Search, 
  Filter, 
  Trash2, 
  Edit2, 
  Mail, 
  Phone, 
  Calendar, 
  Briefcase, 
  CheckCircle2, 
  XCircle, 
  DollarSign,
  TrendingUp,
  ChevronDown,
  X,
  Eye,
  EyeOff,
  KeyRound,
  RefreshCw,
  Copy
} from 'lucide-react';
import { Employee, User } from '../types';
import { db, handleFirestoreError, OperationType, isQuotaExceeded } from '../firebase';
import { collection, onSnapshot, setDoc, doc, deleteDoc } from 'firebase/firestore';
import { generateTempPassword } from '../utils/password';

// Initial internal mock staff in case empty
const RAW_DEFAULT_EMPLOYEES: Employee[] = [
  {
    id: 'emp_001',
    name: '정시훈',
    email: 'sh.jung@coachingpass.com',
    phone: '010-5000-0001',
    role: '임원',
    department: '대표이사',
    joinedDate: '2024-01-02',
    status: 'active',
    baseSalary: 6500000,
    salesTarget: 100000000
  },
  {
    id: 'emp_002',
    name: '허예령',
    email: 'yr.huh@coachingpass.com',
    phone: '010-5000-0002',
    role: '임원',
    department: '대표',
    joinedDate: '2024-01-05',
    status: 'active',
    baseSalary: 6000000,
    salesTarget: 90000000
  },
  {
    id: 'emp_003',
    name: '오근목',
    email: 'gm.oh@coachingpass.com',
    phone: '010-5000-0003',
    role: '영업팀',
    department: '컨설턴트',
    joinedDate: '2024-02-10',
    status: 'active',
    baseSalary: 4500000,
    salesTarget: 80000000
  },
  {
    id: 'emp_004',
    name: '서헤림',
    email: 'hr.seo@coachingpass.com',
    phone: '010-5000-0004',
    role: '영업팀',
    department: '컨설턴트',
    joinedDate: '2024-03-01',
    status: 'active',
    baseSalary: 4200000,
    salesTarget: 70000000
  },
  {
    id: 'emp_005',
    name: '윤진영',
    email: 'jy.yoon@coachingpass.com',
    phone: '010-5000-0005',
    role: '영업팀',
    department: '컨설턴트',
    joinedDate: '2024-03-15',
    status: 'active',
    baseSalary: 3500000,
    salesTarget: 50000000
  },
  {
    id: 'emp_006',
    name: '이지원',
    email: 'jw.lee@coachingpass.com',
    phone: '010-5000-0006',
    role: '영업팀',
    department: '컨설턴트',
    joinedDate: '2024-03-20',
    status: 'active',
    baseSalary: 3500000,
    salesTarget: 50000000
  },
  {
    id: 'emp_007',
    name: '박근민',
    email: 'gm.park@coachingpass.com',
    phone: '010-5000-0007',
    role: '영업팀',
    department: '컨설턴트',
    joinedDate: '2024-04-01',
    status: 'active',
    baseSalary: 3500000,
    salesTarget: 50000000
  },
  {
    id: 'emp_008',
    name: '김의진',
    email: 'uj.kim@coachingpass.com',
    phone: '010-5000-0008',
    role: '영업팀',
    department: '컨설턴트',
    joinedDate: '2024-04-10',
    status: 'active',
    baseSalary: 4200000,
    salesTarget: 70000000
  },
  {
    id: 'emp_009',
    name: '이공희',
    email: 'gh.lee@coachingpass.com',
    phone: '010-5000-0009',
    role: '영업팀',
    department: '컨설턴트',
    joinedDate: '2024-04-15',
    status: 'active',
    baseSalary: 4200000,
    salesTarget: 70000000
  },
  {
    id: 'emp_010',
    name: '이건희',
    email: 'kh.lee@coachingpass.com',
    phone: '010-5000-0010',
    role: '영업팀',
    department: '컨설턴트',
    joinedDate: '2024-05-01',
    status: 'active',
    baseSalary: 3500000,
    salesTarget: 50000000
  },
  {
    id: 'emp_011',
    name: '노세민',
    email: 'sm.noh@coachingpass.com',
    phone: '010-5000-0011',
    role: '영업팀',
    department: '컨설턴트',
    joinedDate: '2024-05-10',
    status: 'active',
    baseSalary: 3500000,
    salesTarget: 50000000
  },
  {
    id: 'emp_012',
    name: '신준우',
    email: 'jw.shin@coachingpass.com',
    phone: '010-5000-0012',
    role: '영업팀',
    department: '컨설턴트',
    joinedDate: '2024-05-15',
    status: 'active',
    baseSalary: 3500000,
    salesTarget: 50000000
  },
  {
    id: 'emp_013',
    name: '김다은',
    email: 'de.kim@coachingpass.com',
    phone: '010-5000-0013',
    role: '영업팀',
    department: '컨설턴트',
    joinedDate: '2024-06-01',
    status: 'active',
    baseSalary: 3500000,
    salesTarget: 50000000
  },
  {
    id: 'emp_014',
    name: '강경원',
    email: 'kw.kang@coachingpass.com',
    phone: '010-5000-0014',
    role: '코치',
    department: '코치',
    joinedDate: '2024-06-10',
    status: 'active',
    baseSalary: 4000000,
    salesTarget: 30000000
  },
  {
    id: 'emp_015',
    name: '권규청',
    email: 'gc.kwon@coachingpass.com',
    phone: '010-5000-0015',
    role: '코치',
    department: '코치',
    joinedDate: '2024-06-15',
    status: 'active',
    baseSalary: 4000000,
    salesTarget: 30000000
  },
  {
    id: 'emp_016',
    name: '김경재',
    email: 'gj.kim@coachingpass.com',
    phone: '010-5000-0016',
    role: '코치',
    department: '코치',
    joinedDate: '2024-06-20',
    status: 'active',
    baseSalary: 4000000,
    salesTarget: 30000000
  },
  {
    id: 'emp_017',
    name: '김은아',
    email: 'ea.kim@coachingpass.com',
    phone: '010-5000-0017',
    role: '코치',
    department: '코치',
    joinedDate: '2024-07-01',
    status: 'active',
    baseSalary: 4000000,
    salesTarget: 30000000
  },
  {
    id: 'emp_018',
    name: '김정규',
    email: 'jk.kim@coachingpass.com',
    phone: '010-5000-0018',
    role: '코치',
    department: '코치',
    joinedDate: '2024-07-10',
    status: 'active',
    baseSalary: 4000000,
    salesTarget: 30000000
  },
  {
    id: 'emp_019',
    name: '김치성',
    email: 'cs.kim@coachingpass.com',
    phone: '010-5000-0019',
    role: '코치',
    department: '코치',
    joinedDate: '2024-07-15',
    status: 'active',
    baseSalary: 4000000,
    salesTarget: 30000000
  },
  {
    id: 'emp_020',
    name: '김태성',
    email: 'ts.kim@coachingpass.com',
    phone: '010-5000-0020',
    role: '코치',
    department: '코치',
    joinedDate: '2024-08-01',
    status: 'active',
    baseSalary: 4000000,
    salesTarget: 30000000
  },
  {
    id: 'emp_021',
    name: '김항기',
    email: 'hg.kim@coachingpass.com',
    phone: '010-5000-0021',
    role: '코치',
    department: '코치',
    joinedDate: '2024-08-10',
    status: 'active',
    baseSalary: 4000000,
    salesTarget: 30000000
  },
  {
    id: 'emp_022',
    name: '노영우',
    email: 'yw.noh@coachingpass.com',
    phone: '010-5000-0022',
    role: '코치',
    department: '코치',
    joinedDate: '2024-08-15',
    status: 'active',
    baseSalary: 4000000,
    salesTarget: 30000000
  },
  {
    id: 'emp_023',
    name: '문창준',
    email: 'cj.moon@coachingpass.com',
    phone: '010-5000-0023',
    role: '코치',
    department: '코치',
    joinedDate: '2024-09-01',
    status: 'active',
    baseSalary: 4000000,
    salesTarget: 30000000
  },
  {
    id: 'emp_024',
    name: '박래옥',
    email: 'ro.park@coachingpass.com',
    phone: '010-5000-0024',
    role: '코치',
    department: '코치',
    joinedDate: '2024-09-10',
    status: 'active',
    baseSalary: 4000000,
    salesTarget: 30000000
  },
  {
    id: 'emp_025',
    name: '박승우',
    email: 'sw.park@coachingpass.com',
    phone: '010-5000-0025',
    role: '코치',
    department: '코치',
    joinedDate: '2024-09-15',
    status: 'active',
    baseSalary: 4000000,
    salesTarget: 30000000
  },
  {
    id: 'emp_026',
    name: '성유진',
    email: 'yj.sung@coachingpass.com',
    phone: '010-5000-0026',
    role: '코치',
    department: '코치',
    joinedDate: '2024-10-01',
    status: 'active',
    baseSalary: 4000000,
    salesTarget: 30000000
  },
  {
    id: 'emp_027',
    name: '성정인',
    email: 'ji.sung@coachingpass.com',
    phone: '010-5000-0027',
    role: '코치',
    department: '코치',
    joinedDate: '2024-10-10',
    status: 'active',
    baseSalary: 4000000,
    salesTarget: 30000000
  },
  {
    id: 'emp_028',
    name: '송병민',
    email: 'bm.song@coachingpass.com',
    phone: '010-5000-0028',
    role: '코치',
    department: '코치',
    joinedDate: '2024-10-15',
    status: 'active',
    baseSalary: 4000000,
    salesTarget: 30000000
  },
  {
    id: 'emp_029',
    name: '양희성',
    email: 'hs.yang@coachingpass.com',
    phone: '010-5000-0029',
    role: '코치',
    department: '코치',
    joinedDate: '2024-11-01',
    status: 'active',
    baseSalary: 4000000,
    salesTarget: 30000000
  },
  {
    id: 'emp_030',
    name: '유영식',
    email: 'ys.yoo@coachingpass.com',
    phone: '010-5000-0030',
    role: '코치',
    department: '코치',
    joinedDate: '2024-11-10',
    status: 'active',
    baseSalary: 4000000,
    salesTarget: 30000000
  },
  {
    id: 'emp_031',
    name: '윤호상',
    email: 'hs.yoon@coachingpass.com',
    phone: '010-5000-0031',
    role: '코치',
    department: '코치',
    joinedDate: '2024-11-15',
    status: 'active',
    baseSalary: 4000000,
    salesTarget: 30000000
  },
  {
    id: 'emp_032',
    name: '이동현',
    email: 'dh.lee@coachingpass.com',
    phone: '010-5000-0032',
    role: '코치',
    department: '코치',
    joinedDate: '2024-12-01',
    status: 'active',
    baseSalary: 4000000,
    salesTarget: 30000000
  },
  {
    id: 'emp_033',
    name: '이로운',
    email: 'rowan.lee@coachingpass.com',
    phone: '010-5000-0033',
    role: '코치',
    department: '코치',
    joinedDate: '2024-12-10',
    status: 'active',
    baseSalary: 4000000,
    salesTarget: 30000000
  },
  {
    id: 'emp_034',
    name: '이윤호',
    email: 'yh.lee@coachingpass.com',
    phone: '010-5000-0034',
    role: '코치',
    department: '코치',
    joinedDate: '2024-12-15',
    status: 'active',
    baseSalary: 4000000,
    salesTarget: 30000000
  },
  {
    id: 'emp_035',
    name: '이인준',
    email: 'ij.lee@coachingpass.com',
    phone: '010-5000-0035',
    role: '코치',
    department: '코치',
    joinedDate: '2025-01-01',
    status: 'active',
    baseSalary: 4000000,
    salesTarget: 30000000
  },
  {
    id: 'emp_036',
    name: '이종현',
    email: 'jh.lee.ch@coachingpass.com',
    phone: '010-5000-0036',
    role: '코치',
    department: '코치',
    joinedDate: '2025-01-10',
    status: 'active',
    baseSalary: 4000000,
    salesTarget: 30000000
  },
  {
    id: 'emp_037',
    name: '이철민',
    email: 'cm.lee@coachingpass.com',
    phone: '010-5000-0037',
    role: '코치',
    department: '코치',
    joinedDate: '2025-01-15',
    status: 'active',
    baseSalary: 4000000,
    salesTarget: 30000000
  },
  {
    id: 'emp_038',
    name: '이하준',
    email: 'hj.lee@coachingpass.com',
    phone: '010-5000-0038',
    role: '코치',
    department: '코치',
    joinedDate: '2025-02-01',
    status: 'active',
    baseSalary: 4000000,
    salesTarget: 30000000
  },
  {
    id: 'emp_039',
    name: '임태성',
    email: 'ts.lim@coachingpass.com',
    phone: '010-5000-0039',
    role: '코치',
    department: '코치',
    joinedDate: '2025-02-10',
    status: 'active',
    baseSalary: 4000000,
    salesTarget: 30000000
  },
  {
    id: 'emp_040',
    name: '정혜은',
    email: 'he.jung@coachingpass.com',
    phone: '010-5000-0040',
    role: '코치',
    department: '코치',
    joinedDate: '2025-02-15',
    status: 'active',
    baseSalary: 4000000,
    salesTarget: 30000000
  },
  {
    id: 'emp_041',
    name: '정휘성',
    email: 'ws.jung.coach@coachingpass.com',
    phone: '010-5000-0041',
    role: '코치',
    department: '코치',
    joinedDate: '2025-03-01',
    status: 'active',
    baseSalary: 4000000,
    salesTarget: 30000000
  },
  {
    id: 'emp_042',
    name: '조민근',
    email: 'mg.cho@coachingpass.com',
    phone: '010-5000-0042',
    role: '코치',
    department: '코치',
    joinedDate: '2025-03-10',
    status: 'active',
    baseSalary: 4000000,
    salesTarget: 30000000
  },
  {
    id: 'emp_043',
    name: '최지혜',
    email: 'jh.choi@coachingpass.com',
    phone: '010-5000-0043',
    role: '코치',
    department: '코치',
    joinedDate: '2025-03-15',
    status: 'active',
    baseSalary: 4000000,
    salesTarget: 30000000
  },
  {
    id: 'emp_044',
    name: '김혜연',
    email: 'hy.kim@coachingpass.com',
    phone: '010-5000-0044',
    role: '코치',
    department: '코치',
    joinedDate: '2025-04-01',
    status: 'active',
    baseSalary: 4000000,
    salesTarget: 30000000
  }
];

// 사번(CP0001~) 생성 헬퍼 — 대표이사(emp_001)가 목록 맨 앞이므로 CP0001이 됨
const formatEmployeeNumber = (seq: number) => 'CP' + String(seq).padStart(4, '0');

const DEFAULT_EMPLOYEES: Employee[] = RAW_DEFAULT_EMPLOYEES.map((emp, i) => {
  const employeeNumber = formatEmployeeNumber(i + 1); // 순서대로 사번 부여 (대표이사 = CP0001)
  const initialPassword = generateTempPassword(); // 초기(임시) 랜덤 비밀번호
  if (emp.role === '영업팀') {
    let rate = 10;
    if (emp.id === 'emp_003') rate = 15; // 오근목
    else if (['emp_004', 'emp_008', 'emp_009'].includes(emp.id)) rate = 12; // 서헤림, 김의진, 이공희
    return {
      ...emp,
      employeeNumber,
      initialPassword,
      commissionRate: rate
    };
  } else if (emp.role === '코치') {
    return {
      ...emp,
      employeeNumber,
      initialPassword,
      coachingFee: 150500 // ₩150,500 coaching fee
    };
  }
  return { ...emp, employeeNumber, initialPassword };
});

interface EmployeesProps {
  user?: User;
}

let employeesSeedAttempted = false;
let employeeBackfillAttempted = false;

export default function Employees({ user }: EmployeesProps) {
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [roleFilter, setRoleFilter] = useState<string>('all');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [deptFilter, setDeptFilter] = useState<string>('all');
  const [showPwMap, setShowPwMap] = useState<{ [id: string]: boolean }>({});

  // Create / Edit modal state
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [currentEmployee, setCurrentEmployee] = useState<Partial<Employee> | null>(null);
  const [isEditing, setIsEditing] = useState(false);
  const [successToast, setSuccessToast] = useState<string | null>(null);

  const isAdmin = user?.role === 'admin';

  // Load and sync employees from Firestore
  useEffect(() => {
    const cached = localStorage.getItem('cached_employees');
    if (cached) {
      try {
        setEmployees(JSON.parse(cached));
      } catch (e) {
        // ignore
      }
    }

    const unsubscribe = onSnapshot(collection(db, 'employees'), (snapshot) => {
      const dbEmployees = snapshot.docs.map(doc => doc.data() as Employee);
      const hasOldMock = dbEmployees.some(emp => emp.id === 'emp_001' && emp.name === '김상현');
      const hasStaleSeed = dbEmployees.some(emp =>
        (emp.role === '영업팀' && emp.commissionRate === undefined) ||
        (emp.role === '코치' && emp.coachingFee === undefined) ||
        (emp.role === '영업팀' && emp.department !== '컨설턴트')
      );

      // 사번/초기비밀번호 미부여 문서에 대해 해당 필드만 안전하게 백필 (기존 편집값 보존)
      if (!employeeBackfillAttempted && !isQuotaExceeded()) {
        const missing = dbEmployees.filter(emp =>
          !emp.initialPassword ||
          (!emp.employeeNumber && DEFAULT_EMPLOYEES.some(d => d.id === emp.id))
        );
        if (missing.length > 0) {
          employeeBackfillAttempted = true;
          missing.forEach(async (emp) => {
            const patch: Partial<Employee> = {};
            if (!emp.initialPassword) patch.initialPassword = generateTempPassword();
            if (!emp.employeeNumber) {
              const def = DEFAULT_EMPLOYEES.find(d => d.id === emp.id);
              if (def?.employeeNumber) patch.employeeNumber = def.employeeNumber;
            }
            if (Object.keys(patch).length > 0) {
              try {
                await setDoc(doc(db, 'employees', emp.id), patch, { merge: true });
              } catch (e) {
                console.error("Failed to backfill employee fields:", emp.id, e);
              }
            }
          });
        }
      }
      
      if (dbEmployees.length === 0 || hasOldMock || hasStaleSeed) {
        // Fallback, old mock, or stale schema detected: upgrade via merge set
        if (!employeesSeedAttempted && !isQuotaExceeded()) {
          employeesSeedAttempted = true;
          if (hasOldMock) {
            dbEmployees.forEach(async (emp) => {
              try {
                await deleteDoc(doc(db, 'employees', emp.id));
              } catch (e) {
                console.error("error deleting stale entry:", e);
              }
            });
          }
          DEFAULT_EMPLOYEES.forEach(async (emp) => {
            try {
              await setDoc(doc(db, 'employees', emp.id), emp, { merge: true });
            } catch (e) {
              console.error("error seeding/migrating employee doc:", e);
            }
          });
        }
        setEmployees(DEFAULT_EMPLOYEES);
        localStorage.setItem('cached_employees', JSON.stringify(DEFAULT_EMPLOYEES));
      } else {
        setEmployees(dbEmployees);
        localStorage.setItem('cached_employees', JSON.stringify(dbEmployees));
      }
    }, (error) => {
      console.error("Firestore employees load error, using fallback state:", error);
      if (!cached) {
        setEmployees(DEFAULT_EMPLOYEES);
      }
      handleFirestoreError(error, OperationType.GET, 'employees', false);
    });

    return () => unsubscribe();
  }, []);

  const showToast = (message: string) => {
    setSuccessToast(message);
    setTimeout(() => setSuccessToast(null), 3000);
  };

  const copyToClipboard = async (text: string, label: string) => {
    if (!text) return;
    try {
      await navigator.clipboard.writeText(text);
      showToast(`${label} 복사됨: ${text}`);
    } catch {
      showToast('클립보드 복사에 실패했습니다.');
    }
  };

  // Safe decimal conversions and formatting
  const formatKrw = (value?: number) => {
    if (!value) return '₩0';
    return new Intl.NumberFormat('ko-KR', {
      style: 'currency',
      currency: 'KRW',
      maximumFractionDigits: 0
    }).format(value);
  };

  // Group unique departments
  const departments = ['all', ...Array.from(new Set(employees.map(e => e.department)))];

  // Filters compilation
  const filteredEmployees = employees.filter(emp => {
    const matchesSearch = emp.name.toLowerCase().includes(searchTerm.toLowerCase()) || 
                          emp.email.toLowerCase().includes(searchTerm.toLowerCase()) ||
                          emp.phone.includes(searchTerm);
    const matchesRole = roleFilter === 'all' || emp.role === roleFilter;
    const matchesStatus = statusFilter === 'all' || emp.status === statusFilter;
    const matchesDept = deptFilter === 'all' || emp.department === deptFilter;

    return matchesSearch && matchesRole && matchesStatus && matchesDept;
  });

  // Calculate high-quality KPIs
  const totalCount = employees.length;
  const activeCount = employees.filter(e => e.status === 'active').length;
  const inactiveCount = employees.filter(e => e.status === 'inactive').length;

  // 다음 사번(CP####) 자동 채번 — 기존 최대 번호 + 1
  const nextEmployeeNumber = () => {
    const maxSeq = employees.reduce((max, e) => {
      const m = /^CP(\d+)$/.exec((e.employeeNumber || '').trim());
      return m ? Math.max(max, parseInt(m[1], 10)) : max;
    }, 0);
    return formatEmployeeNumber(maxSeq + 1);
  };

  // Save or Update Employee
  const handleSaveEmployee = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isAdmin) {
      alert('관리자 권한이 필요합니다.');
      return;
    }
    if (!currentEmployee?.name || !currentEmployee?.email || !currentEmployee?.role || !currentEmployee?.department) {
      alert('모든 필수 정보를 입력해주세요.');
      return;
    }

    try {
      const employeeId = isEditing && currentEmployee.id 
        ? currentEmployee.id 
        : `emp_${Date.now()}`;

      const savedEmployee: Employee = {
        id: employeeId,
        name: currentEmployee.name,
        employeeNumber: currentEmployee.employeeNumber || nextEmployeeNumber(),
        initialPassword: currentEmployee.initialPassword || generateTempPassword(),
        email: currentEmployee.email,
        phone: currentEmployee.phone || '',
        role: currentEmployee.role as any,
        department: currentEmployee.department,
        joinedDate: currentEmployee.joinedDate || new Date().toISOString().split('T')[0],
        status: (currentEmployee.status as any) || 'active',
        baseSalary: Number(currentEmployee.baseSalary) || 0,
        salesTarget: Number(currentEmployee.salesTarget) || 0,
        commissionRate: currentEmployee.role === '영업팀' ? (Number(currentEmployee.commissionRate) || 0) : undefined,
        coachingFee: currentEmployee.role === '코치' ? (Number(currentEmployee.coachingFee) || 0) : undefined
      };

      if (isQuotaExceeded()) {
        setEmployees(prev => {
          const next = isEditing 
            ? prev.map(emp => emp.id === employeeId ? savedEmployee : emp)
            : [...prev, savedEmployee];
          localStorage.setItem('cached_employees', JSON.stringify(next));
          return next;
        });
        setIsModalOpen(false);
        showToast(isEditing 
          ? `${savedEmployee.name} 임직원 정보가 수정되었습니다 (로컬 저장).` 
          : `신규 임직원 ${savedEmployee.name}님이 등록되었습니다 (로컬 저장).`
        );
        return;
      }

      await setDoc(doc(db, 'employees', employeeId), savedEmployee);
      setIsModalOpen(false);
      
      showToast(isEditing 
        ? `${savedEmployee.name} 임직원 정보가 수정되었습니다.` 
        : `신규 임직원 ${savedEmployee.name}님이 등록되었습니다.`
      );
    } catch (error) {
      console.error("Error saving employee to Firestore:", error);
      alert('저장 도중 발생한 오류: ' + error);
    }
  };

  const handleEditClick = (employee: Employee) => {
    setCurrentEmployee(employee);
    setIsEditing(true);
    setIsModalOpen(true);
  };

  const handleDeleteClick = async (employeeId: string, name: string) => {
    if (confirm(`${name} 님의 인적 데이터를 완전히 삭제하시겠습니까?`)) {
      try {
        if (isQuotaExceeded()) {
          setEmployees(prev => {
            const next = prev.filter(emp => emp.id !== employeeId);
            localStorage.setItem('cached_employees', JSON.stringify(next));
            return next;
          });
          showToast(`${name} 임직원의 인사 정보가 완전히 말소되었습니다 (로컬 저장).`);
          return;
        }

        await deleteDoc(doc(db, 'employees', employeeId));
        showToast(`${name} 임직원의 인사 정보가 완전히 말소되었습니다.`);
      } catch (error) {
        console.error("Error deleting employee:", error);
      }
    }
  };

  const handleCreateNewClick = () => {
    setCurrentEmployee({
      name: '',
      employeeNumber: nextEmployeeNumber(),
      initialPassword: generateTempPassword(),
      email: '',
      phone: '',
      role: '코치',
      department: '',
      joinedDate: new Date().toISOString().split('T')[0],
      status: 'active',
      baseSalary: 3000000,
      salesTarget: 50000000
    });
    setIsEditing(false);
    setIsModalOpen(true);
  };

  return (
    <div className="space-y-6 max-w-7xl mx-auto font-sans text-slate-800 pb-10 relative" id="employees_main_wrapper">
      <AnimatePresence>
        {successToast && (
          <motion.div 
            initial={{ opacity: 0, y: 50, scale: 0.9 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 50, scale: 0.9 }}
            className="fixed bottom-6 right-6 bg-slate-900 border border-slate-800 text-white px-5 py-3.5 rounded-2xl shadow-2xl flex items-center space-x-3 z-50 text-sm font-sans"
          >
            <CheckCircle2 className="h-5 w-5 text-emerald-400 shrink-0" />
            <span className="font-medium">{successToast}</span>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Title area */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-200 pb-5">
        <div>
          <h1 className="text-2xl font-black text-slate-900 tracking-tight">임직원 인사 정보 관리</h1>
          <p className="text-sm text-slate-500 mt-1">
            코칭 패스의 모든 임원, 관리자, 코치 및 영업 담당자의 인적 사항과 조직 부서를 체계적으로 기록합니다.
          </p>
        </div>
        {isAdmin && (
          <button
            onClick={handleCreateNewClick}
            className="flex items-center justify-center space-x-2 bg-emerald-500 hover:bg-emerald-600 active:bg-emerald-700 text-white font-bold py-2.5 px-4 rounded-xl text-sm transition-all shadow-lg shadow-emerald-500/10 cursor-pointer"
          >
            <UserPlus className="h-4.5 w-4.5" />
            <span>신규 임직원 등록</span>
          </button>
        )}
      </div>

      {/* KPI Stats Panel */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6" id="employee_kpis">
        <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-xs flex items-center space-x-4">
          <div className="h-11 w-11 rounded-xl bg-slate-50 text-slate-600 flex items-center justify-center shrink-0 border border-slate-100">
            <Users className="h-5 w-5" />
          </div>
          <div>
            <span className="text-xs font-semibold text-slate-400 block tracking-wider">전체 등록 임직원</span>
            <strong className="text-xl font-bold text-slate-800 block mt-0.5">{totalCount}명</strong>
          </div>
        </div>

        <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-xs flex items-center space-x-4">
          <div className="h-11 w-11 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center shrink-0 border border-emerald-100">
            <CheckCircle2 className="h-5 w-5" />
          </div>
          <div>
            <span className="text-xs font-semibold text-slate-400 block tracking-wider">재직 상태 (Active)</span>
            <strong className="text-xl font-bold text-emerald-650 block mt-0.5">{activeCount}명</strong>
          </div>
        </div>

        <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-xs flex items-center space-x-4">
          <div className="h-11 w-11 rounded-xl bg-rose-50 text-rose-600 flex items-center justify-center shrink-0 border border-rose-100">
            <XCircle className="h-5 w-5" />
          </div>
          <div>
            <span className="text-xs font-semibold text-slate-400 block tracking-wider">휴직 및 퇴사자</span>
            <strong className="text-xl font-bold text-rose-600 block mt-0.5">{inactiveCount}명</strong>
          </div>
        </div>

      </div>

      {/* Main Grid: Filters & Staff List */}
      <div className="bg-white border border-slate-200 shadow-xs rounded-2xl">
        <div className="p-4 border-b border-slate-100 flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
          <div className="flex items-center space-x-2">
            <Briefcase className="h-5 w-5 text-slate-400" />
            <h2 className="font-bold text-slate-800">조직 구성원 탐색</h2>
          </div>
          
          <div className="flex flex-wrap items-center gap-3 w-full md:w-auto">
            {/* Search Input */}
            <div className="relative flex-1 md:w-60 min-w-[180px]">
              <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
              <input
                type="text"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="이름, 이메일, 연락처 검색"
                className="w-full pl-9 pr-4 py-2 text-xs rounded-xl border border-slate-200 bg-slate-50 focus:bg-white focus:outline-hidden focus:ring-1 focus:ring-emerald-500 transition-all font-medium"
              />
            </div>

            {/* Role Filter */}
            <select
              value={roleFilter}
              onChange={(e) => setRoleFilter(e.target.value)}
              className="px-3 py-2 text-xs rounded-xl border border-slate-200 bg-slate-50 focus:bg-white font-medium focus:outline-hidden"
            >
              <option value="all">모든 직무</option>
              <option value="코치">코치</option>
              <option value="영업팀">영업팀 (컨설턴트)</option>
              <option value="관리자">관리자</option>
              <option value="임원">임직원 / 이관자</option>
            </select>

            {/* Department Filter */}
            <select
              value={deptFilter}
              onChange={(e) => setDeptFilter(e.target.value)}
              className="px-3 py-2 text-xs rounded-xl border border-slate-200 bg-slate-50 focus:bg-white font-medium focus:outline-hidden"
            >
              <option value="all">모든 소속 부서</option>
              {departments.filter(d => d !== 'all').map(dept => (
                <option key={dept} value={dept}>{dept}</option>
              ))}
            </select>

            {/* Status Filter */}
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="px-3 py-2 text-xs rounded-xl border border-slate-200 bg-slate-50 focus:bg-white font-medium focus:outline-hidden"
            >
              <option value="all">모든 상태</option>
              <option value="active">재직 중</option>
              <option value="inactive">퇴사/휴직</option>
            </select>
          </div>
        </div>

        {/* Employee Table */}
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-slate-50 text-slate-400 font-bold text-[11px] uppercase tracking-wider border-b border-slate-100">
                <th className="px-6 py-3.5">사번</th>
                <th className="px-6 py-3.5">성명</th>
                {isAdmin && <th className="px-6 py-3.5">초기 비밀번호 (관리자 전용)</th>}
                <th className="px-6 py-3.5">소속 부서 / 직무</th>
                <th className="px-6 py-3.5">연락처 / 이메일</th>
                <th className="px-6 py-3.5">입사일자</th>
                <th className="px-6 py-3.5">재직여부</th>
                <th className="px-6 py-3.5 text-right">조작</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-xs">
              {filteredEmployees.length > 0 ? (
                filteredEmployees.map((emp) => (
                  <tr key={emp.id} className="hover:bg-slate-50/50 transition-colors">
                    <td className="px-6 py-4.5 border-b border-slate-100">
                      <div className="flex items-center space-x-1.5">
                        <span className="font-mono font-bold text-slate-700 text-xs bg-slate-100 px-2 py-1 rounded-md">{emp.employeeNumber || '-'}</span>
                        {emp.employeeNumber && (
                          <button
                            type="button"
                            onClick={() => copyToClipboard(emp.employeeNumber!, '사번')}
                            className="p-1 hover:bg-slate-100 rounded text-slate-400 hover:text-slate-600 cursor-pointer transition-colors"
                            title="사번 복사"
                          >
                            <Copy className="h-3 w-3" />
                          </button>
                        )}
                      </div>
                    </td>
                    <td className="px-6 py-4.5 font-semibold text-slate-900 border-b border-slate-100">
                      <div className="flex items-center space-x-2.5">
                        <div className="h-8 w-8 rounded-full bg-emerald-500/10 text-emerald-700 flex items-center justify-center font-bold text-xs ring-1 ring-emerald-500/15">
                          {emp.name.charAt(0)}
                        </div>
                        <span>{emp.name}</span>
                      </div>
                    </td>
                    {isAdmin && (
                      <td className="px-6 py-4.5 border-b border-slate-100">
                        <div className="flex items-center space-x-2 font-mono font-bold text-slate-700">
                          <KeyRound className="h-3.5 w-3.5 text-indigo-400 shrink-0" />
                          <span className="text-xs">{showPwMap[emp.id] ? (emp.initialPassword || '-') : '••••••••'}</span>
                          <button
                            type="button"
                            onClick={() => setShowPwMap(prev => ({ ...prev, [emp.id]: !prev[emp.id] }))}
                            className="p-1 hover:bg-slate-100 rounded text-slate-400 hover:text-slate-600 cursor-pointer transition-colors"
                            title="초기 비밀번호 표시/숨김"
                          >
                            {showPwMap[emp.id] ? <EyeOff className="h-3 w-3" /> : <Eye className="h-3 w-3" />}
                          </button>
                          {emp.initialPassword && (
                            <button
                              type="button"
                              onClick={() => copyToClipboard(emp.initialPassword!, '초기 비밀번호')}
                              className="p-1 hover:bg-slate-100 rounded text-slate-400 hover:text-slate-600 cursor-pointer transition-colors"
                              title="초기 비밀번호 복사"
                            >
                              <Copy className="h-3 w-3" />
                            </button>
                          )}
                        </div>
                      </td>
                    )}
                    <td className="px-6 py-4.5 border-b border-slate-100">
                      <div>
                        <div className="font-semibold text-slate-800">{emp.department}</div>
                        <span className={`text-[10px] mt-0.5 inline-block px-2 py-0.5 font-bold rounded-md ${
                          emp.role === '코치' 
                            ? 'bg-blue-50 text-blue-600 border border-blue-100' 
                            : emp.role === '영업팀' 
                            ? 'bg-amber-50 text-amber-600 border border-amber-100'
                            : emp.role === '임원' 
                            ? 'bg-purple-50 text-purple-600 border border-purple-100'
                            : 'bg-slate-100 text-slate-600'
                        }`}>
                          {emp.role}
                        </span>
                      </div>
                    </td>
                    <td className="px-6 py-4.5 border-b border-slate-100 text-slate-600">
                      <div className="flex flex-col space-y-1">
                        <span className="flex items-center space-x-1.5">
                          <Mail className="h-3.5 w-3.5 text-slate-400 shrink-0" />
                          <span>{emp.email}</span>
                        </span>
                        <span className="flex items-center space-x-1.5 font-mono">
                          <Phone className="h-3.5 w-3.5 text-slate-400 shrink-0" />
                          <span>{emp.phone}</span>
                        </span>
                      </div>
                    </td>
                    <td className="px-6 py-4.5 border-b border-slate-100 font-mono text-slate-500">
                      <span className="flex items-center space-x-1">
                        <Calendar className="h-3.5 w-3.5 text-slate-350 shrink-0" />
                        <span>{emp.joinedDate}</span>
                      </span>
                    </td>
                    <td className="px-6 py-4.5 border-b border-slate-100 font-semibold">
                      <span className={`inline-flex items-center space-x-1 px-2.5 py-1 rounded-full text-[10px] uppercase tracking-wider ${
                        emp.status === 'active' 
                          ? 'bg-emerald-50 text-emerald-700 border border-emerald-100' 
                          : 'bg-rose-50 text-rose-700 border border-rose-100'
                      }`}>
                        <span className={`h-1.5 w-1.5 rounded-full ${emp.status === 'active' ? 'bg-emerald-500' : 'bg-rose-500'}`} />
                        <span>{emp.status === 'active' ? '재직 중' : '퇴직'}</span>
                      </span>
                    </td>
                    <td className="px-6 py-4.5 border-b border-slate-100 text-right">
                      <div className="flex items-center justify-end space-x-2">
                        <button
                          onClick={() => handleEditClick(emp)}
                          className="p-1.5 rounded-md hover:bg-slate-150 text-slate-500 hover:text-slate-800 transition-colors cursor-pointer"
                          title={isAdmin ? "정보 수정" : "상세 정보 조회"}
                        >
                          <Edit2 className="h-4 w-4" />
                        </button>
                        {isAdmin && (
                          <button
                            onClick={() => handleDeleteClick(emp.id, emp.name)}
                            className="p-1.5 rounded-md hover:bg-rose-50 text-rose-500 hover:text-rose-700 transition-colors cursor-pointer"
                            title="삭제"
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={isAdmin ? 8 : 7} className="py-20 text-center text-slate-400 font-sans">
                    <Users className="h-10 w-10 text-slate-200 mx-auto mb-3" />
                    인사 필터링 조건에 부합하는 임직원이 존재하지 않습니다.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Slide-over or Modal view for Add/Edit Employee */}
      <AnimatePresence>
        {isModalOpen && (
          <div className="fixed inset-0 min-h-screen z-50 flex items-center justify-center p-4">
            {/* Overlay background */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setIsModalOpen(false)}
              className="fixed inset-0 bg-slate-950/60 backdrop-blur-xs"
            />

            {/* Modal Body */}
            <motion.div
              initial={{ scale: 0.95, opacity: 0, y: 15 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.95, opacity: 0, y: 15 }}
              className="bg-white rounded-3xl border border-slate-200 shadow-2xl relative w-full max-w-lg z-10 overflow-hidden"
              id="employee_form_modal"
            >
              {/* Header */}
              <div className="bg-slate-950 px-6 py-5 flex items-center justify-between text-white border-b border-slate-900">
                <div className="flex items-center space-x-2.5">
                  <div className="h-8 w-8 rounded-lg bg-emerald-500 flex items-center justify-center">
                    <Users className="h-4 w-4 text-white" />
                  </div>
                  <div>
                    <h3 className="font-bold tracking-tight text-sm">
                      {isEditing ? (isAdmin ? '임직원 인적사항 편집' : '임직원 상세 정보 조회') : '신규 부사수/임직원 등록'}
                    </h3>
                    <p className="text-[10px] text-slate-400 mt-0.5">
                      {isAdmin ? '조직원의 인사 및 계정 세부 설정을 입력해주세요.' : '조직원의 인사 및 계정 상세 정보 (조회 전용)'}
                    </p>
                  </div>
                </div>
                <button
                  onClick={() => setIsModalOpen(false)}
                  className="p-1 rounded-lg hover:bg-slate-800 text-slate-400 hover:text-white transition-colors cursor-pointer"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>

              {/* Form Content */}
              <form onSubmit={handleSaveEmployee} className="p-6 space-y-4">
                {/* 사번 (자동 채번) */}
                <div className="bg-indigo-50/60 border border-indigo-100 rounded-xl px-3.5 py-2.5 flex items-center justify-between">
                  <div>
                    <span className="block text-indigo-700 font-bold text-[10px] uppercase">사번 (자동 부여)</span>
                    <span className="text-[10px] text-indigo-500/90 font-medium">임직원 식별용 사번입니다.</span>
                  </div>
                  <span className="font-mono font-black text-indigo-700 text-sm bg-white border border-indigo-200 px-3 py-1.5 rounded-lg">
                    {currentEmployee?.employeeNumber || '자동 부여'}
                  </span>
                </div>

                {/* 초기(임시) 비밀번호 - 관리자 전용 */}
                {isAdmin && (
                  <div className="bg-slate-50 border border-slate-200 rounded-xl px-3.5 py-2.5 flex items-center justify-between">
                    <div>
                      <span className="block text-slate-600 font-bold text-[10px] uppercase">초기 로그인 비밀번호 (임시)</span>
                      <span className="text-[10px] text-slate-400 font-medium">랜덤 영문+숫자. 임직원은 마이페이지에서 변경합니다.</span>
                    </div>
                    <div className="flex items-center space-x-2">
                      <span className="font-mono font-black text-slate-800 text-sm bg-white border border-slate-200 px-3 py-1.5 rounded-lg">
                        {currentEmployee?.initialPassword || '자동 생성'}
                      </span>
                      <button
                        type="button"
                        onClick={() => setCurrentEmployee({ ...currentEmployee, initialPassword: generateTempPassword() })}
                        className="p-1.5 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 text-slate-500 hover:text-slate-700 cursor-pointer"
                        title="초기 비밀번호 재발급"
                      >
                        <RefreshCw className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </div>
                )}

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-slate-550 font-bold text-[10px] uppercase mb-1">성명 <strong className="text-rose-500">*</strong></label>
                    <input
                      type="text"
                      required
                      disabled={!isAdmin}
                      value={currentEmployee?.name || ''}
                      onChange={(e) => setCurrentEmployee({ ...currentEmployee, name: e.target.value })}
                      placeholder="예. 박재홍"
                      className="w-full px-3.5 py-2.5 text-xs border border-slate-200 bg-slate-50 disabled:bg-slate-100 disabled:text-slate-500 rounded-xl focus:bg-white focus:outline-hidden focus:ring-1 focus:ring-emerald-500 transition-all font-semibold"
                    />
                  </div>
                  <div>
                    <label className="block text-slate-550 font-bold text-[10px] uppercase mb-1">소속 부서 <strong className="text-rose-500">*</strong></label>
                    <input
                      type="text"
                      required
                      disabled={!isAdmin}
                      value={currentEmployee?.department || ''}
                      onChange={(e) => setCurrentEmployee({ ...currentEmployee, department: e.target.value })}
                      placeholder="예. 청소년코칭2팀"
                      className="w-full px-3.5 py-2.5 text-xs border border-slate-200 bg-slate-50 disabled:bg-slate-100 disabled:text-slate-500 rounded-xl focus:bg-white focus:outline-hidden focus:ring-1 focus:ring-emerald-500 transition-all font-semibold"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-slate-550 font-bold text-[10px] uppercase mb-1">이메일 계정 <strong className="text-rose-500">*</strong></label>
                    <input
                      type="email"
                      required
                      disabled={!isAdmin}
                      value={currentEmployee?.email || ''}
                      onChange={(e) => setCurrentEmployee({ ...currentEmployee, email: e.target.value })}
                      placeholder="office@example.com"
                      className="w-full px-3.5 py-2.5 text-xs border border-slate-200 bg-slate-50 disabled:bg-slate-100 disabled:text-slate-500 rounded-xl focus:bg-white focus:outline-hidden focus:ring-1 focus:ring-emerald-500 transition-all font-semibold"
                    />
                  </div>
                  <div>
                    <label className="block text-slate-550 font-bold text-[10px] uppercase mb-1">휴대전화 번호</label>
                    <input
                      type="text"
                      disabled={!isAdmin}
                      value={currentEmployee?.phone || ''}
                      onChange={(e) => setCurrentEmployee({ ...currentEmployee, phone: e.target.value })}
                      placeholder="010-0000-0000"
                      className="w-full px-3.5 py-2.5 text-xs border border-slate-200 bg-slate-50 disabled:bg-slate-100 disabled:text-slate-500 rounded-xl focus:bg-white focus:outline-hidden focus:ring-1 focus:ring-emerald-500 transition-all font-mono font-medium"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-slate-550 font-bold text-[10px] uppercase mb-1">직무 권한 <strong className="text-rose-500">*</strong></label>
                    <select
                      value={currentEmployee?.role || '코치'}
                      disabled={!isAdmin}
                      onChange={(e) => setCurrentEmployee({ ...currentEmployee, role: e.target.value as any })}
                      className="w-full px-3.5 py-2.5 text-xs border border-slate-200 bg-slate-50 disabled:bg-slate-100 disabled:text-slate-500 rounded-xl focus:bg-white focus:outline-hidden font-semibold"
                    >
                      <option value="코치">코치</option>
                      <option value="영업팀">영업팀</option>
                      <option value="관리자">관리자</option>
                      <option value="임원">임원</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-slate-550 font-bold text-[10px] uppercase mb-1">재직 상태</label>
                    <select
                      value={currentEmployee?.status || 'active'}
                      disabled={!isAdmin}
                      onChange={(e) => setCurrentEmployee({ ...currentEmployee, status: e.target.value as any })}
                      className="w-full px-3.5 py-2.5 text-xs border border-slate-200 bg-slate-50 disabled:bg-slate-100 disabled:text-slate-500 rounded-xl focus:bg-white focus:outline-hidden font-semibold"
                    >
                      <option value="active">재직 중 (Active)</option>
                      <option value="inactive">휴직/퇴직 (Inactive)</option>
                    </select>
                  </div>
                </div>

                <div>
                  <label className="block text-slate-550 font-bold text-[10px] uppercase mb-1">입사일자</label>
                  <input
                    type="date"
                    disabled={!isAdmin}
                    value={currentEmployee?.joinedDate || ''}
                    onChange={(e) => setCurrentEmployee({ ...currentEmployee, joinedDate: e.target.value })}
                    className="w-full px-3.5 py-2.5 text-xs border border-slate-200 bg-slate-50 disabled:bg-slate-100 disabled:text-slate-500 rounded-xl focus:bg-white focus:outline-hidden focus:ring-1 focus:ring-emerald-500 transition-all font-medium font-mono"
                  />
                </div>

                {isAdmin ? (
                  <div className="pt-4 border-t border-slate-100 flex items-center justify-end space-x-2">
                    <button
                      type="button"
                      onClick={() => setIsModalOpen(false)}
                      className="py-2.5 px-4 rounded-xl text-xs font-bold text-slate-500 hover:text-slate-800 hover:bg-slate-100 transition-colors cursor-pointer"
                    >
                      작성 취소
                    </button>
                    <button
                      type="submit"
                      className="bg-emerald-500 hover:bg-emerald-600 active:bg-emerald-700 text-white font-bold py-2.5 px-5 rounded-xl text-xs transition-colors cursor-pointer"
                    >
                      인사 정보 저장
                    </button>
                  </div>
                ) : (
                  <div className="pt-4 border-t border-slate-100 flex items-center justify-end">
                    <button
                      type="button"
                      onClick={() => setIsModalOpen(false)}
                      className="bg-slate-800 hover:bg-slate-900 text-white font-bold py-2.5 px-6 rounded-xl text-xs transition-colors cursor-pointer"
                    >
                      닫기 (조회 완료)
                    </button>
                  </div>
                )}
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
