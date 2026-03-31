/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useMemo } from 'react';
import { 
  onAuthStateChanged, 
  signInWithPopup, 
  GoogleAuthProvider, 
  signOut,
  User as FirebaseUser
} from 'firebase/auth';
import { 
  collection, 
  doc, 
  getDoc, 
  setDoc, 
  onSnapshot, 
  query, 
  where, 
  orderBy,
  addDoc,
  updateDoc,
  deleteDoc,
  getDocs,
  Timestamp,
  serverTimestamp
} from 'firebase/firestore';
import { auth, db } from './firebase';
import { UserProfile, UserRole, Section, Subject, Schedule, Attendance, AttendanceStatus, AuditLog } from './types';
import { cn, formatTime, handleFirestoreError, OperationType } from './lib/utils';
import { LayoutDashboard, Users, Calendar, CheckCircle2, AlertCircle, LogOut, Plus, Trash2, Edit2, ChevronRight, Search, Filter, Download, User as UserIcon, Clock, BookOpen, Layers, Check, X, Menu, X as CloseIcon, Settings, History, TrendingUp, FileText } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { format, startOfWeek, endOfWeek, eachDayOfInterval, isSameDay, parseISO, isWeekend } from 'date-fns';
import { 
  LineChart, 
  Line, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  ResponsiveContainer,
  BarChart,
  Bar,
  Cell
} from 'recharts';
import jsPDF from 'jspdf';

// --- Components ---

const LoadingScreen = () => (
  <div className="fixed inset-0 bg-[#0a0a0c] flex items-center justify-center z-50">
    <div className="flex flex-col items-center gap-4">
      <div className="w-12 h-12 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin"></div>
      <p className="text-slate-400 font-medium animate-pulse">Initializing System...</p>
    </div>
  </div>
);

const LoginScreen = () => {
  const handleLogin = async () => {
    try {
      const provider = new GoogleAuthProvider();
      await signInWithPopup(auth, provider);
    } catch (error) {
      console.error("Login failed:", error);
    }
  };

  return (
    <div className="fixed inset-0 bg-[#0a0a0c] flex items-center justify-center p-6">
      <div className="max-w-md w-full space-y-8 text-center">
        <div className="space-y-2">
          <div className="w-16 h-16 bg-indigo-600/20 rounded-2xl flex items-center justify-center mx-auto mb-6">
            <CheckCircle2 className="w-8 h-8 text-indigo-500" />
          </div>
          <h1 className="text-4xl font-bold tracking-tight text-white">Attendance</h1>
          <p className="text-slate-400">High-end verification system for modern institutions.</p>
        </div>
        <button 
          onClick={handleLogin}
          className="w-full linear-button py-4 text-lg"
        >
          Sign in with Google
        </button>
        <p className="text-xs text-slate-500">Secure email-based authentication with RBAC.</p>
      </div>
    </div>
  );
};

// --- Main App ---

export default function App() {
  const [user, setUser] = useState<FirebaseUser | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<string>('dashboard');
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);

  // Global Data State
  const [sections, setSections] = useState<Section[]>([]);
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [users, setUsers] = useState<UserProfile[]>([]);
  const [schedules, setSchedules] = useState<Schedule[]>([]);
  const [attendance, setAttendance] = useState<Attendance[]>([]);

  // Initialize Data
  useEffect(() => {
    const testConnection = async () => {
      try {
        const { getDocFromServer } = await import('firebase/firestore');
        await getDocFromServer(doc(db, 'test', 'connection'));
      } catch (error) {
        if (error instanceof Error && error.message.includes('the client is offline')) {
          console.error("Please check your Firebase configuration.");
        }
      }
    };
    testConnection();

    if (!profile || profile.role !== 'director') return;

    const initData = async () => {
      // Init Sections 1-8
      const sectionSnap = await getDocs(collection(db, 'sections'));
      if (sectionSnap.empty) {
        for (let i = 1; i <= 8; i++) {
          const id = `section-${i}`;
          await setDoc(doc(db, 'sections', id), { id, name: `Section ${i}` });
        }
      }

      // Init some Subjects
      const subjectSnap = await getDocs(collection(db, 'subjects'));
      if (subjectSnap.empty) {
        const defaultSubjects = ['Mathematics', 'Physics', 'Chemistry', 'Biology', 'History', 'English', 'Computer Science'];
        for (const name of defaultSubjects) {
          const id = name.toLowerCase().replace(/\s+/g, '-');
          await setDoc(doc(db, 'subjects', id), { id, name });
        }
      }
    };

    initData();
  }, [profile]);

  // Audit Logging Helper
  const logAction = async (action: string, details?: any) => {
    if (!user) return;
    const id = Math.random().toString(36).substring(7);
    await setDoc(doc(db, 'auditLogs', id), {
      id,
      action,
      userId: user.uid,
      timestamp: Date.now(),
      details
    });
  };

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      setUser(firebaseUser);
      if (firebaseUser) {
        // Fetch or create profile
        const profileRef = doc(db, 'users', firebaseUser.uid);
        const profileSnap = await getDoc(profileRef);
        
        if (profileSnap.exists()) {
          setProfile(profileSnap.data() as UserProfile);
        } else {
          // Default role for first user (if it's the admin email)
          const role: UserRole = firebaseUser.email === 'nahommamo888@gmail.com' ? 'director' : 'rep';
          const newProfile: UserProfile = {
            uid: firebaseUser.uid,
            email: firebaseUser.email || '',
            name: firebaseUser.displayName || 'New User',
            role: role,
          };
          await setDoc(profileRef, newProfile);
          setProfile(newProfile);
        }
      } else {
        setProfile(null);
      }
      setLoading(false);
    });

    return () => unsubscribe();
  }, []);

  // Real-time Data Sync
  useEffect(() => {
    if (!profile) return;

    const unsubSections = onSnapshot(collection(db, 'sections'), (snap) => {
      setSections(snap.docs.map(d => d.data() as Section));
    });
    const unsubSubjects = onSnapshot(collection(db, 'subjects'), (snap) => {
      setSubjects(snap.docs.map(d => d.data() as Subject));
    });
    const unsubUsers = onSnapshot(collection(db, 'users'), (snap) => {
      setUsers(snap.docs.map(d => d.data() as UserProfile));
    });
    const unsubSchedules = onSnapshot(collection(db, 'schedules'), (snap) => {
      setSchedules(snap.docs.map(d => d.data() as Schedule));
    });
    const unsubAttendance = onSnapshot(collection(db, 'attendance'), (snap) => {
      setAttendance(snap.docs.map(d => d.data() as Attendance));
    });

    return () => {
      unsubSections();
      unsubSubjects();
      unsubUsers();
      unsubSchedules();
      unsubAttendance();
    };
  }, [profile]);

  if (loading) return <LoadingScreen />;
  if (!user || !profile) return <LoginScreen />;

  const handleLogout = () => signOut(auth);

  const navItems = [
    { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
    ...(profile.role === 'director' ? [
      { id: 'users', label: 'User Management', icon: Users },
      { id: 'schedules', label: 'Schedules', icon: Calendar },
      { id: 'reports', label: 'Reports', icon: FileText },
    ] : []),
    ...(profile.role === 'teacher' ? [
      { id: 'profile', label: 'My Profile', icon: UserIcon },
    ] : []),
  ];

  return (
    <div className="min-h-screen bg-[#0a0a0c] text-slate-200 flex flex-col md:flex-row">
      {/* Mobile Header */}
      <div className="md:hidden flex items-center justify-between p-4 border-b border-white/5 bg-[#0a0a0c]/80 backdrop-blur-md sticky top-0 z-40">
        <div className="flex items-center gap-2">
          <CheckCircle2 className="w-6 h-6 text-indigo-500" />
          <span className="font-bold tracking-tight">Attendance</span>
        </div>
        <button onClick={() => setIsSidebarOpen(true)} className="p-2 text-slate-400">
          <Menu className="w-6 h-6" />
        </button>
      </div>

      {/* Sidebar */}
      <AnimatePresence>
        {(isSidebarOpen || window.innerWidth >= 768) && (
          <motion.aside 
            initial={{ x: -300 }}
            animate={{ x: 0 }}
            exit={{ x: -300 }}
            className={cn(
              "fixed md:relative inset-y-0 left-0 w-72 bg-[#0d0d0f] border-r border-white/5 z-50 flex flex-col",
              !isSidebarOpen && "hidden md:flex"
            )}
          >
            <div className="p-6 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 bg-indigo-600 rounded-lg flex items-center justify-center">
                  <CheckCircle2 className="w-5 h-5 text-white" />
                </div>
                <span className="font-bold text-xl tracking-tight text-white">Attendance</span>
              </div>
              <button onClick={() => setIsSidebarOpen(false)} className="md:hidden p-2 text-slate-500">
                <CloseIcon className="w-5 h-5" />
              </button>
            </div>

            <nav className="flex-1 px-4 space-y-1 mt-4">
              {navItems.map((item) => (
                <button
                  key={item.id}
                  onClick={() => {
                    setActiveTab(item.id);
                    setIsSidebarOpen(false);
                  }}
                  className={cn(
                    "w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-all duration-200 group",
                    activeTab === item.id 
                      ? "bg-indigo-600/10 text-indigo-400 border border-indigo-600/20" 
                      : "text-slate-500 hover:text-slate-200 hover:bg-white/5"
                  )}
                >
                  <item.icon className={cn("w-5 h-5", activeTab === item.id ? "text-indigo-400" : "text-slate-500 group-hover:text-slate-300")} />
                  <span className="font-medium">{item.label}</span>
                </button>
              ))}
            </nav>

            <div className="p-6 border-t border-white/5 space-y-4">
              <div className="flex items-center gap-3 px-2">
                <div className="w-10 h-10 rounded-full bg-slate-800 border border-white/10 flex items-center justify-center overflow-hidden">
                  {user.photoURL ? (
                    <img src={user.photoURL} alt={profile.name} referrerPolicy="no-referrer" />
                  ) : (
                    <UserIcon className="w-5 h-5 text-slate-400" />
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-white truncate">{profile.name}</p>
                  <p className="text-xs text-slate-500 truncate capitalize">{profile.role}</p>
                </div>
              </div>
              <button 
                onClick={handleLogout}
                className="w-full flex items-center gap-3 px-4 py-3 rounded-xl text-slate-500 hover:text-red-400 hover:bg-red-400/5 transition-all duration-200"
              >
                <LogOut className="w-5 h-5" />
                <span className="font-medium">Sign Out</span>
              </button>
            </div>
          </motion.aside>
        )}
      </AnimatePresence>

      {/* Main Content */}
      <main className="flex-1 overflow-y-auto p-4 md:p-8 lg:p-12">
        <div className="max-w-6xl mx-auto space-y-8">
          <AnimatePresence mode="wait">
            {activeTab === 'dashboard' && (
              <motion.div 
                key="dashboard"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
              >
                {profile.role === 'director' && <DirectorDashboard users={users} sections={sections} subjects={subjects} schedules={schedules} attendance={attendance} />}
                {profile.role === 'teacher' && <TeacherDashboard profile={profile} schedules={schedules} attendance={attendance} subjects={subjects} sections={sections} />}
                {profile.role === 'rep' && <RepDashboard profile={profile} schedules={schedules} attendance={attendance} subjects={subjects} sections={sections} />}
              </motion.div>
            )}
            {activeTab === 'users' && profile.role === 'director' && (
              <motion.div 
                key="users"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
              >
                <UserManagement users={users} sections={sections} subjects={subjects} />
              </motion.div>
            )}
            {activeTab === 'schedules' && profile.role === 'director' && (
              <motion.div 
                key="schedules"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
              >
                <ScheduleManagement schedules={schedules} sections={sections} subjects={subjects} teachers={users.filter(u => u.role === 'teacher')} />
              </motion.div>
            )}
            {activeTab === 'reports' && profile.role === 'director' && (
              <motion.div 
                key="reports"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
              >
                <ReportsView attendance={attendance} schedules={schedules} sections={sections} subjects={subjects} />
              </motion.div>
            )}
            {activeTab === 'profile' && profile.role === 'teacher' && (
              <motion.div 
                key="profile"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
              >
                <TeacherProfile profile={profile} schedules={schedules} attendance={attendance} subjects={subjects} sections={sections} />
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </main>
    </div>
  );
}

// --- Dashboard Views ---

function DirectorDashboard({ users, sections, subjects, schedules, attendance }: { users: UserProfile[], sections: Section[], subjects: Subject[], schedules: Schedule[], attendance: Attendance[] }) {
  const conflicts = attendance.filter(a => a.status === 'conflict');
  const today = format(new Date(), 'yyyy-MM-dd');
  const todayAttendance = attendance.filter(a => a.date === today);
  
  const stats = [
    { label: 'Total Users', value: users.length, icon: Users, color: 'text-blue-400' },
    { label: 'Active Schedules', value: schedules.length, icon: Calendar, color: 'text-indigo-400' },
    { label: 'Conflicts', value: conflicts.length, icon: AlertCircle, color: 'text-amber-400' },
    { label: 'Today Verified', value: todayAttendance.filter(a => a.status === 'present').length, icon: CheckCircle2, color: 'text-emerald-400' },
  ];

  return (
    <div className="space-y-8">
      <header>
        <h2 className="text-3xl font-bold text-white tracking-tight">Director Overview</h2>
        <p className="text-slate-500 mt-1">Real-time system monitoring and discrepancy tracking.</p>
      </header>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {stats.map((stat, i) => (
          <motion.div 
            key={stat.label}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.1 }}
            className="linear-card p-6"
          >
            <div className="flex items-center justify-between mb-4">
              <div className={cn("p-2 rounded-lg bg-white/5", stat.color)}>
                <stat.icon className="w-5 h-5" />
              </div>
            </div>
            <p className="text-slate-500 text-sm font-medium">{stat.label}</p>
            <p className="text-3xl font-bold text-white mt-1">{stat.value}</p>
          </motion.div>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        <div className="linear-card p-6">
          <div className="flex items-center justify-between mb-6">
            <h3 className="text-lg font-semibold text-white">Recent Conflicts</h3>
            <AlertCircle className="w-5 h-5 text-amber-500" />
          </div>
          <div className="space-y-4">
            {conflicts.length === 0 ? (
              <p className="text-slate-500 text-center py-8">No active conflicts detected.</p>
            ) : (
              conflicts.slice(0, 5).map(conflict => {
                const schedule = schedules.find(s => s.id === conflict.scheduleId);
                const section = sections.find(s => s?.id === schedule?.sectionId);
                const subject = subjects.find(s => s?.id === schedule?.subjectId);
                return (
                  <div key={conflict.id} className="flex items-center justify-between p-4 rounded-xl bg-white/5 border border-white/5">
                    <div>
                      <p className="text-white font-medium">{subject?.name || 'Unknown Subject'}</p>
                      <p className="text-xs text-slate-500">{section?.name} • {conflict.date}</p>
                    </div>
                    <button 
                      onClick={async () => {
                        await updateDoc(doc(db, 'attendance', conflict.id), { status: 'present' });
                      }}
                      className="text-xs font-semibold text-indigo-400 hover:text-indigo-300 px-3 py-1 rounded-lg bg-indigo-400/10"
                    >
                      Resolve
                    </button>
                  </div>
                );
              })
            )}
          </div>
        </div>

        <div className="linear-card p-6">
          <div className="flex items-center justify-between mb-6">
            <h3 className="text-lg font-semibold text-white">Attendance Trends</h3>
            <TrendingUp className="w-5 h-5 text-indigo-500" />
          </div>
          <div className="h-[240px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={attendance.slice(-7)}>
                <CartesianGrid strokeDasharray="3 3" stroke="#ffffff10" vertical={false} />
                <XAxis dataKey="date" stroke="#94a3b8" fontSize={12} tickLine={false} axisLine={false} />
                <YAxis stroke="#94a3b8" fontSize={12} tickLine={false} axisLine={false} />
                <Tooltip 
                  contentStyle={{ backgroundColor: '#1e293b', border: 'none', borderRadius: '8px', color: '#fff' }}
                  itemStyle={{ color: '#6366f1' }}
                />
                <Line type="monotone" dataKey="status" stroke="#6366f1" strokeWidth={2} dot={{ fill: '#6366f1' }} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>
    </div>
  );
}

function TeacherDashboard({ profile, schedules, attendance, subjects, sections }: { profile: UserProfile, schedules: Schedule[], attendance: Attendance[], subjects: Subject[], sections: Section[] }) {
  const mySchedules = schedules.filter(s => s.teacherId === profile.uid);
  const today = format(new Date(), 'EEEE');
  const todayDate = format(new Date(), 'yyyy-MM-dd');
  const todaySchedules = mySchedules.filter(s => s.dayOfWeek === today);

  const handleMark = async (scheduleId: string, present: boolean) => {
    const id = `${scheduleId}_${todayDate}`;
    const attRef = doc(db, 'attendance', id);
    try {
      const snap = await getDoc(attRef);
      
      let status: AttendanceStatus = 'present';
      const repMark = snap.exists() ? snap.data().repMark : undefined;

      if (repMark !== undefined) {
        if (present && repMark) status = 'present';
        else if (!present && !repMark) status = 'absent';
        else status = 'conflict';
      } else {
        status = 'present'; // Default until rep marks
      }

      await setDoc(attRef, {
        id,
        scheduleId,
        date: todayDate,
        teacherMark: present,
        repMark: repMark,
        status,
        lastUpdatedBy: profile.uid,
        timestamp: Date.now()
      }, { merge: true });
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, `attendance/${id}`);
    }
  };

  return (
    <div className="space-y-8">
      <header>
        <h2 className="text-3xl font-bold text-white tracking-tight">Daily Schedule</h2>
        <p className="text-slate-500 mt-1">{format(new Date(), 'EEEE, MMMM do')}</p>
      </header>

      <div className="grid grid-cols-1 gap-4">
        {todaySchedules.length === 0 ? (
          <div className="linear-card p-12 text-center">
            <Calendar className="w-12 h-12 text-slate-700 mx-auto mb-4" />
            <p className="text-slate-500">No classes scheduled for today.</p>
          </div>
        ) : (
          todaySchedules.map((schedule, i) => {
            const subject = subjects.find(s => s.id === schedule.subjectId);
            const section = sections.find(s => s.id === schedule.sectionId);
            const att = attendance.find(a => a.id === `${schedule.id}_${todayDate}`);
            
            return (
              <motion.div 
                key={schedule.id}
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: i * 0.1 }}
                className="linear-card p-6 flex flex-col sm:flex-row sm:items-center justify-between gap-6"
              >
                <div className="flex items-center gap-4">
                  <div className="w-12 h-12 bg-indigo-600/10 rounded-xl flex items-center justify-center text-indigo-400">
                    <BookOpen className="w-6 h-6" />
                  </div>
                  <div>
                    <h3 className="text-lg font-semibold text-white">{subject?.name}</h3>
                    <p className="text-sm text-slate-500">{section?.name} • {formatTime(schedule.startTime)} - {formatTime(schedule.endTime)}</p>
                  </div>
                </div>

                <div className="flex items-center gap-3">
                  <button 
                    onClick={() => handleMark(schedule.id, true)}
                    className={cn(
                      "flex-1 sm:flex-none linear-button bg-transparent border border-white/10 hover:bg-emerald-500/10 hover:border-emerald-500/50 hover:text-emerald-400",
                      att?.teacherMark === true && "bg-emerald-500/10 border-emerald-500/50 text-emerald-400"
                    )}
                  >
                    <Check className="w-4 h-4" />
                    Present
                  </button>
                  <button 
                    onClick={() => handleMark(schedule.id, false)}
                    className={cn(
                      "flex-1 sm:flex-none linear-button bg-transparent border border-white/10 hover:bg-red-500/10 hover:border-red-500/50 hover:text-red-400",
                      att?.teacherMark === false && "bg-red-500/10 border-red-500/50 text-red-400"
                    )}
                  >
                    <X className="w-4 h-4" />
                    Absent
                  </button>
                </div>
              </motion.div>
            );
          })
        )}
      </div>
    </div>
  );
}

function RepDashboard({ profile, schedules, attendance, subjects, sections }: { profile: UserProfile, schedules: Schedule[], attendance: Attendance[], subjects: Subject[], sections: Section[] }) {
  const mySectionSchedules = schedules.filter(s => s.sectionId === profile.sectionId);
  const today = format(new Date(), 'EEEE');
  const todayDate = format(new Date(), 'yyyy-MM-dd');
  const todaySchedules = mySectionSchedules.filter(s => s.dayOfWeek === today);

  const handleMark = async (scheduleId: string, present: boolean) => {
    const id = `${scheduleId}_${todayDate}`;
    const attRef = doc(db, 'attendance', id);
    try {
      const snap = await getDoc(attRef);
      
      let status: AttendanceStatus = 'present';
      const teacherMark = snap.exists() ? snap.data().teacherMark : undefined;

      if (teacherMark !== undefined) {
        if (present && teacherMark) status = 'present';
        else if (!present && !teacherMark) status = 'absent';
        else status = 'conflict';
      } else {
        status = 'present'; // Default until teacher marks
      }

      await setDoc(attRef, {
        id,
        scheduleId,
        date: todayDate,
        repMark: present,
        teacherMark: teacherMark,
        status,
        lastUpdatedBy: profile.uid,
        timestamp: Date.now()
      }, { merge: true });
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, `attendance/${id}`);
    }
  };

  return (
    <div className="space-y-8">
      <header>
        <h2 className="text-3xl font-bold text-white tracking-tight">Section Representative</h2>
        <p className="text-slate-500 mt-1">{sections.find(s => s.id === profile.sectionId)?.name} • {format(new Date(), 'EEEE, MMMM do')}</p>
      </header>

      <div className="grid grid-cols-1 gap-4">
        {todaySchedules.length === 0 ? (
          <div className="linear-card p-12 text-center">
            <Calendar className="w-12 h-12 text-slate-700 mx-auto mb-4" />
            <p className="text-slate-500">No classes scheduled for your section today.</p>
          </div>
        ) : (
          todaySchedules.map((schedule, i) => {
            const subject = subjects.find(s => s.id === schedule.subjectId);
            const att = attendance.find(a => a.id === `${schedule.id}_${todayDate}`);
            
            return (
              <motion.div 
                key={schedule.id}
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: i * 0.1 }}
                className="linear-card p-6 flex flex-col sm:flex-row sm:items-center justify-between gap-6"
              >
                <div className="flex items-center gap-4">
                  <div className="w-12 h-12 bg-indigo-600/10 rounded-xl flex items-center justify-center text-indigo-400">
                    <Layers className="w-6 h-6" />
                  </div>
                  <div>
                    <h3 className="text-lg font-semibold text-white">{subject?.name}</h3>
                    <p className="text-sm text-slate-500">{formatTime(schedule.startTime)} - {formatTime(schedule.endTime)}</p>
                  </div>
                </div>

                <div className="flex items-center gap-3">
                  <button 
                    onClick={() => handleMark(schedule.id, true)}
                    className={cn(
                      "flex-1 sm:flex-none linear-button bg-transparent border border-white/10 hover:bg-emerald-500/10 hover:border-emerald-500/50 hover:text-emerald-400",
                      att?.repMark === true && "bg-emerald-500/10 border-emerald-500/50 text-emerald-400"
                    )}
                  >
                    <Check className="w-4 h-4" />
                    Present
                  </button>
                  <button 
                    onClick={() => handleMark(schedule.id, false)}
                    className={cn(
                      "flex-1 sm:flex-none linear-button bg-transparent border border-white/10 hover:bg-red-500/10 hover:border-red-500/50 hover:text-red-400",
                      att?.repMark === false && "bg-red-500/10 border-red-500/50 text-red-400"
                    )}
                  >
                    <X className="w-4 h-4" />
                    Absent
                  </button>
                </div>
              </motion.div>
            );
          })
        )}
      </div>
    </div>
  );
}

// --- Management Components ---

function UserManagement({ users, sections, subjects }: { users: UserProfile[], sections: Section[], subjects: Subject[] }) {
  const [isAdding, setIsAdding] = useState(false);
  const [editingUser, setEditingUser] = useState<UserProfile | null>(null);
  const [formData, setFormData] = useState<Partial<UserProfile>>({ role: 'teacher' });
  const [searchQuery, setSearchQuery] = useState('');

  const filteredUsers = users.filter(u => 
    u.name.toLowerCase().includes(searchQuery.toLowerCase()) || 
    u.email.toLowerCase().includes(searchQuery.toLowerCase()) ||
    u.role.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.email || !formData.name || !formData.role) return;

    const uid = editingUser?.uid || Math.random().toString(36).substring(7); // In real app, this would be from Auth
    const userRef = doc(db, 'users', uid);
    
    try {
      await setDoc(userRef, {
        ...formData,
        uid,
      }, { merge: true });

      setIsAdding(false);
      setEditingUser(null);
      setFormData({ role: 'teacher' });
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, `users/${uid}`);
    }
  };

  return (
    <div className="space-y-8">
      <header className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-3xl font-bold text-white tracking-tight">User Management</h2>
          <p className="text-slate-500 mt-1">Manage accounts and assign roles.</p>
        </div>
        <div className="flex items-center gap-3">
          <div className="relative">
            <Search className="w-4 h-4 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2" />
            <input 
              type="text" 
              placeholder="Search users..." 
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              className="linear-input pl-10 w-full sm:w-64"
            />
          </div>
          <button onClick={() => setIsAdding(true)} className="linear-button whitespace-nowrap">
            <Plus className="w-4 h-4" />
            Add User
          </button>
        </div>
      </header>

      <div className="grid grid-cols-1 gap-4">
        {filteredUsers.map((user) => (
          <div key={user.uid} className="linear-card p-6 flex items-center justify-between">
            <div className="flex items-center gap-4">
              <div className="w-10 h-10 rounded-full bg-slate-800 flex items-center justify-center text-slate-400">
                <UserIcon className="w-5 h-5" />
              </div>
              <div>
                <p className="text-white font-medium">{user.name}</p>
                <p className="text-xs text-slate-500">{user.email} • <span className="capitalize">{user.role}</span></p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <button 
                onClick={() => {
                  setEditingUser(user);
                  setFormData(user);
                  setIsAdding(true);
                }}
                className="p-2 text-slate-500 hover:text-indigo-400 hover:bg-indigo-400/5 rounded-lg transition-colors"
              >
                <Edit2 className="w-4 h-4" />
              </button>
              <button 
                onClick={async () => {
                  if (confirm('Are you sure?')) {
                    await deleteDoc(doc(db, 'users', user.uid));
                  }
                }}
                className="p-2 text-slate-500 hover:text-red-400 hover:bg-red-400/5 rounded-lg transition-colors"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            </div>
          </div>
        ))}
      </div>

      <AnimatePresence>
        {isAdding && (
          <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-6">
            <motion.div 
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="linear-card p-8 w-full max-w-md space-y-6"
            >
              <h3 className="text-xl font-bold text-white">{editingUser ? 'Edit User' : 'Add New User'}</h3>
              <form onSubmit={handleSubmit} className="space-y-4">
                <div className="space-y-1">
                  <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Full Name</label>
                  <input 
                    type="text" 
                    required
                    value={formData.name || ''}
                    onChange={e => setFormData({ ...formData, name: e.target.value })}
                    className="linear-input" 
                    placeholder="John Doe"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Email Address</label>
                  <input 
                    type="email" 
                    required
                    value={formData.email || ''}
                    onChange={e => setFormData({ ...formData, email: e.target.value })}
                    className="linear-input" 
                    placeholder="john@example.com"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Role</label>
                  <select 
                    value={formData.role}
                    onChange={e => setFormData({ ...formData, role: e.target.value as UserRole })}
                    className="linear-input"
                  >
                    <option value="director">Director</option>
                    <option value="teacher">Teacher</option>
                    <option value="rep">Representative</option>
                  </select>
                </div>
                {formData.role === 'rep' && (
                  <div className="space-y-1">
                    <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Assigned Section</label>
                    <select 
                      value={formData.sectionId || ''}
                      onChange={e => setFormData({ ...formData, sectionId: e.target.value })}
                      className="linear-input"
                    >
                      <option value="">Select Section</option>
                      {sections.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                    </select>
                  </div>
                )}
                <div className="flex items-center gap-3 pt-4">
                  <button type="button" onClick={() => setIsAdding(false)} className="flex-1 px-4 py-2 rounded-lg text-slate-400 hover:bg-white/5 transition-colors">Cancel</button>
                  <button type="submit" className="flex-1 linear-button">Save User</button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}

function ScheduleManagement({ schedules, sections, subjects, teachers }: { schedules: Schedule[], sections: Section[], subjects: Subject[], teachers: UserProfile[] }) {
  const [isAdding, setIsAdding] = useState(false);
  const [formData, setFormData] = useState<Partial<Schedule>>({ dayOfWeek: 'Monday' });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.sectionId || !formData.subjectId || !formData.teacherId || !formData.dayOfWeek || !formData.startTime || !formData.endTime) return;

    const id = Math.random().toString(36).substring(7);
    await setDoc(doc(db, 'schedules', id), { ...formData, id });

    setIsAdding(false);
    setFormData({ dayOfWeek: 'Monday' });
  };

  return (
    <div className="space-y-8">
      <header className="flex items-center justify-between">
        <div>
          <h2 className="text-3xl font-bold text-white tracking-tight">Schedules</h2>
          <p className="text-slate-500 mt-1">Configure weekly class sessions.</p>
        </div>
        <button onClick={() => setIsAdding(true)} className="linear-button">
          <Plus className="w-4 h-4" />
          Add Schedule
        </button>
      </header>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'].map(day => (
          <div key={day} className="space-y-4">
            <h3 className="text-sm font-bold text-slate-500 uppercase tracking-widest px-2">{day}</h3>
            <div className="space-y-3">
              {schedules.filter(s => s.dayOfWeek === day).map(schedule => {
                const subject = subjects.find(sub => sub.id === schedule.subjectId);
                const section = sections.find(sec => sec.id === schedule.sectionId);
                const teacher = teachers.find(t => t.uid === schedule.teacherId);
                return (
                  <div key={schedule.id} className="linear-card p-4 space-y-2">
                    <div className="flex items-center justify-between">
                      <p className="text-white font-semibold">{subject?.name}</p>
                      <button 
                        onClick={async () => await deleteDoc(doc(db, 'schedules', schedule.id))}
                        className="text-slate-600 hover:text-red-400 transition-colors"
                      >
                        <Trash2 className="w-3 h-3" />
                      </button>
                    </div>
                    <p className="text-xs text-slate-500">{section?.name} • {teacher?.name}</p>
                    <div className="flex items-center gap-2 text-[10px] font-mono text-indigo-400 bg-indigo-400/5 w-fit px-2 py-0.5 rounded border border-indigo-400/10">
                      <Clock className="w-3 h-3" />
                      {formatTime(schedule.startTime)} - {formatTime(schedule.endTime)}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </div>

      <AnimatePresence>
        {isAdding && (
          <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-6">
            <motion.div 
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="linear-card p-8 w-full max-w-md space-y-6"
            >
              <h3 className="text-xl font-bold text-white">New Schedule</h3>
              <form onSubmit={handleSubmit} className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1">
                    <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Section</label>
                    <select 
                      required
                      value={formData.sectionId || ''}
                      onChange={e => setFormData({ ...formData, sectionId: e.target.value })}
                      className="linear-input"
                    >
                      <option value="">Select</option>
                      {sections.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                    </select>
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Subject</label>
                    <select 
                      required
                      value={formData.subjectId || ''}
                      onChange={e => setFormData({ ...formData, subjectId: e.target.value })}
                      className="linear-input"
                    >
                      <option value="">Select</option>
                      {subjects.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                    </select>
                  </div>
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Teacher</label>
                  <select 
                    required
                    value={formData.teacherId || ''}
                    onChange={e => setFormData({ ...formData, teacherId: e.target.value })}
                    className="linear-input"
                  >
                    <option value="">Select Teacher</option>
                    {teachers.map(t => <option key={t.uid} value={t.uid}>{t.name}</option>)}
                  </select>
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Day</label>
                  <select 
                    required
                    value={formData.dayOfWeek}
                    onChange={e => setFormData({ ...formData, dayOfWeek: e.target.value as any })}
                    className="linear-input"
                  >
                    {['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'].map(d => <option key={d} value={d}>{d}</option>)}
                  </select>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1">
                    <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Start Time</label>
                    <input 
                      type="time" 
                      required
                      value={formData.startTime || ''}
                      onChange={e => setFormData({ ...formData, startTime: e.target.value })}
                      className="linear-input" 
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider">End Time</label>
                    <input 
                      type="time" 
                      required
                      value={formData.endTime || ''}
                      onChange={e => setFormData({ ...formData, endTime: e.target.value })}
                      className="linear-input" 
                    />
                  </div>
                </div>
                <div className="flex items-center gap-3 pt-4">
                  <button type="button" onClick={() => setIsAdding(false)} className="flex-1 px-4 py-2 rounded-lg text-slate-400 hover:bg-white/5 transition-colors">Cancel</button>
                  <button type="submit" className="flex-1 linear-button">Create</button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}

function ReportsView({ attendance, schedules, sections, subjects }: { attendance: Attendance[], schedules: Schedule[], sections: Section[], subjects: Subject[] }) {
  const exportPDF = () => {
    const doc = new jsPDF();
    doc.setFontSize(20);
    doc.text('Attendance Weekly Report', 20, 20);
    doc.setFontSize(12);
    doc.text(`Generated on: ${format(new Date(), 'PPpp')}`, 20, 30);

    let y = 45;
    sections.forEach(section => {
      const sectionAttendance = attendance.filter(a => {
        const s = schedules.find(sch => sch.id === a.scheduleId);
        return s?.sectionId === section.id;
      });
      const present = sectionAttendance.filter(a => a.status === 'present').length;
      const total = sectionAttendance.length;
      const rate = total > 0 ? ((present / total) * 100).toFixed(1) : '0';

      doc.text(`${section.name}: ${rate}% Attendance (${present}/${total} sessions)`, 20, y);
      y += 10;
    });

    doc.save(`attendance-report-${format(new Date(), 'yyyy-MM-dd')}.pdf`);
  };

  return (
    <div className="space-y-8">
      <header className="flex items-center justify-between">
        <div>
          <h2 className="text-3xl font-bold text-white tracking-tight">Reports & Analytics</h2>
          <p className="text-slate-500 mt-1">Compile and export attendance data.</p>
        </div>
        <button onClick={exportPDF} className="linear-button bg-white/5 hover:bg-white/10 text-white border border-white/10">
          <Download className="w-4 h-4" />
          Export PDF
        </button>
      </header>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        <div className="linear-card p-6">
          <h3 className="text-lg font-semibold text-white mb-6">Section Performance</h3>
          <div className="h-[300px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={sections.map(s => {
                const sectionAtt = attendance.filter(a => schedules.find(sch => sch.id === a.scheduleId)?.sectionId === s.id);
                const present = sectionAtt.filter(a => a.status === 'present').length;
                return { name: s.name, rate: sectionAtt.length > 0 ? (present / sectionAtt.length) * 100 : 0 };
              })}>
                <CartesianGrid strokeDasharray="3 3" stroke="#ffffff10" vertical={false} />
                <XAxis dataKey="name" stroke="#94a3b8" fontSize={12} tickLine={false} axisLine={false} />
                <YAxis stroke="#94a3b8" fontSize={12} tickLine={false} axisLine={false} />
                <Tooltip 
                  cursor={{ fill: '#ffffff05' }}
                  contentStyle={{ backgroundColor: '#1e293b', border: 'none', borderRadius: '8px', color: '#fff' }}
                />
                <Bar dataKey="rate" fill="#6366f1" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="linear-card p-6">
          <h3 className="text-lg font-semibold text-white mb-6">Weekly Summary</h3>
          <div className="space-y-4">
            {sections.map(section => {
              const sectionAtt = attendance.filter(a => schedules.find(sch => sch.id === a.scheduleId)?.sectionId === section.id);
              const present = sectionAtt.filter(a => a.status === 'present').length;
              const conflicts = sectionAtt.filter(a => a.status === 'conflict').length;
              const rate = sectionAtt.length > 0 ? (present / sectionAtt.length) * 100 : 0;

              return (
                <div key={section.id} className="p-4 rounded-xl bg-white/5 border border-white/5 flex items-center justify-between">
                  <div>
                    <p className="text-white font-medium">{section.name}</p>
                    <p className="text-xs text-slate-500">{conflicts} unresolved conflicts</p>
                  </div>
                  <div className="text-right">
                    <p className={cn("text-lg font-bold", rate > 80 ? "text-emerald-400" : rate > 50 ? "text-amber-400" : "text-red-400")}>
                      {rate.toFixed(1)}%
                    </p>
                    <p className="text-[10px] text-slate-500 uppercase tracking-wider">Attendance Rate</p>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}

function TeacherProfile({ profile, schedules, attendance, subjects, sections }: { profile: UserProfile, schedules: Schedule[], attendance: Attendance[], subjects: Subject[], sections: Section[] }) {
  const mySchedules = schedules.filter(s => s.teacherId === profile.uid);
  const myAttendance = attendance.filter(a => mySchedules.find(s => s.id === a.scheduleId));
  const presentCount = myAttendance.filter(a => a.status === 'present').length;
  const rate = myAttendance.length > 0 ? (presentCount / myAttendance.length) * 100 : 0;

  return (
    <div className="space-y-8">
      <header>
        <h2 className="text-3xl font-bold text-white tracking-tight">Teacher Profile</h2>
        <p className="text-slate-500 mt-1">Your assignments and performance metrics.</p>
      </header>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="linear-card p-6 md:col-span-1 flex flex-col items-center text-center space-y-4">
          <div className="w-24 h-24 rounded-full bg-indigo-600/20 flex items-center justify-center text-indigo-500 border-2 border-indigo-500/20">
            <UserIcon className="w-12 h-12" />
          </div>
          <div>
            <h3 className="text-xl font-bold text-white">{profile.name}</h3>
            <p className="text-slate-500">{profile.email}</p>
          </div>
          <div className="w-full pt-4 border-t border-white/5">
            <p className="text-xs text-slate-500 uppercase tracking-widest mb-2">Overall Performance</p>
            <p className="text-4xl font-bold text-indigo-400">{rate.toFixed(1)}%</p>
          </div>
        </div>

        <div className="md:col-span-2 space-y-6">
          <div className="linear-card p-6">
            <h3 className="text-lg font-semibold text-white mb-4">Assigned Subjects</h3>
            <div className="flex flex-wrap gap-2">
              {mySchedules.map(s => subjects.find(sub => sub.id === s.subjectId)?.name).filter((v, i, a) => a.indexOf(v) === i).map(name => (
                <span key={name} className="px-3 py-1 rounded-lg bg-indigo-400/10 text-indigo-400 text-sm font-medium border border-indigo-400/20">
                  {name}
                </span>
              ))}
            </div>
          </div>

          <div className="linear-card p-6">
            <h3 className="text-lg font-semibold text-white mb-4">Recent History</h3>
            <div className="space-y-3">
              {myAttendance.slice(-5).reverse().map(att => {
                const schedule = schedules.find(s => s.id === att.scheduleId);
                const subject = subjects.find(s => s.id === schedule?.subjectId);
                return (
                  <div key={att.id} className="flex items-center justify-between p-3 rounded-lg bg-white/5">
                    <div>
                      <p className="text-sm font-medium text-white">{subject?.name}</p>
                      <p className="text-xs text-slate-500">{att.date}</p>
                    </div>
                    <span className={cn(
                      "status-badge",
                      att.status === 'present' ? "status-present" : att.status === 'absent' ? "status-absent" : "status-conflict"
                    )}>
                      {att.status}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
