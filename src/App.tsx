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

const ConfirmationModal = ({ 
  isOpen, 
  onClose, 
  onConfirm, 
  title, 
  message,
  confirmLabel = "Delete",
  variant = "danger"
}: { 
  isOpen: boolean; 
  onClose: () => void; 
  onConfirm: () => void; 
  title: string; 
  message: string;
  confirmLabel?: string;
  variant?: "danger" | "primary";
}) => (
  <AnimatePresence>
    {isOpen && (
      <div className="fixed inset-0 bg-black/60 backdrop-blur-md z-[70] flex items-center justify-center p-6">
        <motion.div 
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale: 0.95 }}
          className="linear-card p-8 w-full max-w-sm space-y-6 text-center"
        >
          <div className="space-y-2">
            <h3 className="text-xl font-bold text-white">{title}</h3>
            <p className="text-slate-400 text-sm">{message}</p>
          </div>
          <div className="flex gap-3">
            <button 
              onClick={onClose}
              className="flex-1 px-4 py-2 rounded-xl bg-white/5 text-slate-400 hover:bg-white/10 transition-colors"
            >
              Cancel
            </button>
            <button 
              onClick={() => { onConfirm(); onClose(); }}
              className={cn(
                "flex-1 px-4 py-2 rounded-xl font-bold transition-colors",
                variant === "danger" ? "bg-red-500 text-white hover:bg-red-600" : "bg-indigo-600 text-white hover:bg-indigo-700"
              )}
            >
              {confirmLabel}
            </button>
          </div>
        </motion.div>
      </div>
    )}
  </AnimatePresence>
);

const QuickActionModal = ({ 
  isOpen, 
  onClose, 
  onMark, 
  title, 
  subtitle, 
  currentMark 
}: { 
  isOpen: boolean; 
  onClose: () => void; 
  onMark: (present: boolean) => void; 
  title: string; 
  subtitle: string; 
  currentMark?: boolean | null;
}) => (
  <AnimatePresence>
    {isOpen && (
      <div className="fixed inset-0 bg-black/60 backdrop-blur-md z-[60] flex items-center justify-center p-6">
        <motion.div 
          initial={{ opacity: 0, scale: 0.9, y: 20 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.9, y: 20 }}
          transition={{ type: "spring", damping: 25, stiffness: 300 }}
          className="linear-card p-8 w-full max-w-sm space-y-8 text-center relative overflow-hidden"
        >
          <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-indigo-600 to-indigo-400" />
          <button 
            onClick={onClose}
            className="absolute top-4 right-4 p-2 text-slate-500 hover:text-white transition-colors"
          >
            <X className="w-5 h-5" />
          </button>

          <div className="space-y-2">
            <div className="w-16 h-16 bg-indigo-600/10 rounded-2xl flex items-center justify-center mx-auto mb-4">
              <Clock className="w-8 h-8 text-indigo-500" />
            </div>
            <h3 className="text-2xl font-bold text-white tracking-tight">{title}</h3>
            <p className="text-slate-400 text-sm">{subtitle}</p>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <button 
              onClick={() => { onMark(true); onClose(); }}
              className={cn(
                "flex flex-col items-center gap-3 p-6 rounded-2xl border transition-all duration-300 group",
                currentMark === true 
                  ? "bg-emerald-500/10 border-emerald-500/50 text-emerald-400" 
                  : "bg-white/5 border-white/5 hover:border-emerald-500/30 text-slate-400 hover:text-emerald-400"
              )}
            >
              <div className={cn(
                "w-12 h-12 rounded-xl flex items-center justify-center transition-colors",
                currentMark === true ? "bg-emerald-500 text-white" : "bg-slate-800 group-hover:bg-emerald-500/20"
              )}>
                <Check className="w-6 h-6" />
              </div>
              <span className="font-bold text-sm uppercase tracking-wider">Present</span>
            </button>

            <button 
              onClick={() => { onMark(false); onClose(); }}
              className={cn(
                "flex flex-col items-center gap-3 p-6 rounded-2xl border transition-all duration-300 group",
                currentMark === false 
                  ? "bg-red-500/10 border-red-500/50 text-red-400" 
                  : "bg-white/5 border-white/5 hover:border-red-500/30 text-slate-400 hover:text-red-400"
              )}
            >
              <div className={cn(
                "w-12 h-12 rounded-xl flex items-center justify-center transition-colors",
                currentMark === false ? "bg-red-500 text-white" : "bg-slate-800 group-hover:bg-red-500/20"
              )}>
                <X className="w-6 h-6" />
              </div>
              <span className="font-bold text-sm uppercase tracking-wider">Absent</span>
            </button>
          </div>
        </motion.div>
      </div>
    )}
  </AnimatePresence>
);

const LiveStatusIndicator = ({ status }: { status?: AttendanceStatus }) => {
  if (!status) return <div className="w-2 h-2 rounded-full border border-slate-700" />;
  if (status === 'present') return <div className="w-2 h-2 rounded-full bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.5)]" />;
  if (status === 'absent') return <div className="w-2 h-2 rounded-full bg-slate-500" />;
  if (status === 'conflict') return <div className="w-2 h-2 rounded-full bg-red-500 animate-pulse-red shadow-[0_0_8px_rgba(239,68,68,0.5)]" />;
  return <div className="w-2 h-2 rounded-full border border-slate-700" />;
};

const LoadingScreen = () => (
  <div className="fixed inset-0 bg-[#0a0a0c] flex items-center justify-center z-50">
    <div className="flex flex-col items-center gap-4">
      <div className="w-12 h-12 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin"></div>
      <p className="text-slate-400 font-medium animate-pulse">Initializing System...</p>
    </div>
  </div>
);

const LoginScreen = () => {
  const [error, setError] = useState<string | null>(null);

  const handleLogin = async () => {
    setError(null);
    try {
      const provider = new GoogleAuthProvider();
      await signInWithPopup(auth, provider);
    } catch (err: any) {
      console.error("Login failed:", err);
      if (err.code === 'auth/unauthorized-domain') {
        setError("This domain is not authorized for sign-in. Please add it to your Firebase Console's Authorized Domains.");
      } else if (err.code === 'auth/popup-blocked') {
        setError("Sign-in popup was blocked. Please allow popups for this site.");
      } else {
        setError(err.message || "An unexpected error occurred during sign-in.");
      }
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
        
        {error && (
          <div className="p-4 bg-red-500/10 border border-red-500/20 rounded-xl flex items-start gap-3 text-left">
            <AlertCircle className="w-5 h-5 text-red-400 shrink-0 mt-0.5" />
            <p className="text-sm text-red-400">{error}</p>
          </div>
        )}

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

  // Auth Listener
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (u) => {
      setUser(u);
      if (!u) {
        setProfile(null);
        setLoading(false);
      }
    });
    return () => unsubscribe();
  }, []);

  // Profile Listener
  useEffect(() => {
    if (!user) return;

    const unsubProfile = onSnapshot(doc(db, 'users', user.uid), async (snap) => {
      if (snap.exists()) {
        setProfile(snap.data() as UserProfile);
        setLoading(false);
      } else {
        // Check if there's a profile with this email but different UID (manual entry)
        try {
          const q = query(collection(db, 'users'), where('email', '==', user.email));
          const emailSnap = await getDocs(q);
          
          if (!emailSnap.empty) {
            const existingProfile = emailSnap.docs[0].data() as UserProfile;
            const oldDocId = emailSnap.docs[0].id;
            
            // Link the profile to the real UID
            const newProfile = { ...existingProfile, uid: user.uid };
            await setDoc(doc(db, 'users', user.uid), newProfile);
            
            // Delete the old doc if it's different
            if (oldDocId !== user.uid) {
              await deleteDoc(doc(db, 'users', oldDocId));
            }
            
            setProfile(newProfile);
            setLoading(false);
            return;
          }
        } catch (err) {
          console.error("Error linking profile:", err);
        }

        // Auto-create director profile for the owner email
        if (user.email === 'nahommamo888@gmail.com') {
          const newProfile: UserProfile = {
            uid: user.uid,
            email: user.email!,
            name: user.displayName || 'Director',
            role: 'director'
          };
          await setDoc(doc(db, 'users', user.uid), newProfile);
          setProfile(newProfile);
        } else {
          setProfile(null);
        }
        setLoading(false);
      }
    });

    return () => unsubProfile();
  }, [user]);

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
    // Auth is enabled. Listener handles state.
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
  if (!user) return <LoginScreen />;
  if (!profile) return (
    <div className="flex flex-col items-center justify-center min-h-screen text-white bg-[#0a0a0c] p-6 text-center">
      <div className="w-16 h-16 bg-amber-500/10 rounded-2xl flex items-center justify-center mb-6">
        <AlertCircle className="w-8 h-8 text-amber-500" />
      </div>
      <h2 className="text-2xl font-bold mb-2">Access Restricted</h2>
      <p className="text-slate-400 max-w-md">Your account is not yet registered in the system. Please contact the Director to assign your role.</p>
      <button 
        onClick={() => signOut(auth)}
        className="mt-8 linear-button px-8 py-3"
      >
        Sign Out
      </button>
    </div>
  );

  const handleLogout = async () => {
    await signOut(auth);
  };

  const switchRole = (role: UserRole) => {
    setProfile(prev => prev ? { ...prev, role } : null);
    setActiveTab('dashboard');
  };

  const navItems = [
    { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
    ...(profile.role === 'director' ? [
      { id: 'users', label: 'User Management', icon: Users },
      { id: 'schedules', label: 'Schedules', icon: Calendar },
      { id: 'reports', label: 'Reports', icon: FileText },
    ] : []),
    ...(profile.role === 'rep' ? [
      { id: 'manage-schedule', label: 'Manage Schedule', icon: Calendar },
    ] : []),
    ...(profile.role === 'teacher' ? [
      { id: 'manage-schedule', label: 'Manage Schedule', icon: Calendar },
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
              <div className="space-y-2">
                <p className="text-[10px] uppercase tracking-wider text-slate-500 font-bold px-2">Role Switcher (Debug)</p>
                <div className="flex flex-wrap gap-1 px-2">
                  {(['director', 'teacher', 'rep'] as UserRole[]).map(r => (
                    <button 
                      key={r}
                      onClick={() => switchRole(r)}
                      className={cn(
                        "text-[10px] px-2 py-1 rounded border transition-colors",
                        profile.role === r 
                          ? "bg-indigo-600 border-indigo-500 text-white" 
                          : "bg-white/5 border-white/10 text-slate-400 hover:bg-white/10"
                      )}
                    >
                      {r}
                    </button>
                  ))}
                </div>
              </div>
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
                <UserManagement users={users} sections={sections} subjects={subjects} logAction={logAction} />
              </motion.div>
            )}
            {activeTab === 'schedules' && profile.role === 'director' && (
              <motion.div 
                key="schedules"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
              >
                <ScheduleManagement 
                  schedules={schedules} 
                  sections={sections} 
                  subjects={subjects} 
                  teachers={users.filter(u => u.role === 'teacher')} 
                />
              </motion.div>
            )}
            {activeTab === 'manage-schedule' && profile.role === 'rep' && (
              <motion.div 
                key="manage-schedule-rep"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
              >
                <ScheduleManagement 
                  schedules={schedules} 
                  sections={sections} 
                  subjects={subjects} 
                  teachers={users.filter(u => u.role === 'teacher')} 
                  userRole="rep"
                  assignedSectionId={profile.sectionId}
                />
              </motion.div>
            )}
            {activeTab === 'manage-schedule' && profile.role === 'teacher' && (
              <motion.div 
                key="manage-schedule-teacher"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
              >
                <ScheduleManagement 
                  schedules={schedules} 
                  sections={sections} 
                  subjects={subjects} 
                  teachers={users.filter(u => u.role === 'teacher')} 
                  userRole="teacher"
                  assignedTeacherId={profile.uid}
                />
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
  const [view, setView] = useState<'overview' | 'verification' | 'student-schedules'>('overview');
  const [selectedSectionId, setSelectedSectionId] = useState<string>('');
  
  const conflicts = attendance.filter(a => {
    if (a.teacherMark === undefined || a.repMark === undefined) return false;
    return a.teacherMark !== a.repMark;
  });
  
  const today = format(new Date(), 'yyyy-MM-dd');
  const todayAttendance = attendance.filter(a => a.date === today);
  
  const stats = [
    { label: 'Total Users', value: users.length, icon: Users, color: 'text-blue-400' },
    { label: 'Active Schedules', value: schedules.length, icon: Calendar, color: 'text-indigo-400' },
    { label: 'Mismatches', value: conflicts.length, icon: AlertCircle, color: 'text-amber-400' },
    { label: 'Today Verified', value: todayAttendance.filter(a => a.status === 'present').length, icon: CheckCircle2, color: 'text-emerald-400' },
  ];

  return (
    <div className="space-y-8">
      <header className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div>
          <h2 className="text-3xl font-bold text-white tracking-tight">Director Control Center</h2>
          <p className="text-slate-500 mt-1">Master oversight and schedule orchestration.</p>
        </div>
        <div className="flex p-1 bg-white/5 rounded-xl border border-white/5 self-start overflow-x-auto no-scrollbar max-w-full">
          <button 
            onClick={() => setView('overview')}
            className={cn(
              "px-4 py-2 rounded-lg text-sm font-medium transition-all whitespace-nowrap",
              view === 'overview' ? "bg-indigo-600 text-white shadow-lg" : "text-slate-500 hover:text-slate-300"
            )}
          >
            Overview
          </button>
          <button 
            onClick={() => setView('student-schedules')}
            className={cn(
              "px-4 py-2 rounded-lg text-sm font-medium transition-all whitespace-nowrap",
              view === 'student-schedules' ? "bg-indigo-600 text-white shadow-lg" : "text-slate-500 hover:text-slate-300"
            )}
          >
            Student Schedules
          </button>
          <button 
            onClick={() => setView('verification')}
            className={cn(
              "px-4 py-2 rounded-lg text-sm font-medium transition-all whitespace-nowrap",
              view === 'verification' ? "bg-indigo-600 text-white shadow-lg" : "text-slate-500 hover:text-slate-300"
            )}
          >
            Verification Hub
          </button>
        </div>
      </header>

      {view === 'overview' && (
        <>
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
                <h3 className="text-lg font-semibold text-white">Recent Mismatches</h3>
                <AlertCircle className="w-5 h-5 text-amber-500" />
              </div>
              <div className="space-y-4">
                {conflicts.length === 0 ? (
                  <p className="text-slate-500 text-center py-8">No active mismatches detected.</p>
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
                          <div className="flex gap-2 mt-1">
                            <span className={cn("text-[10px] px-1.5 py-0.5 rounded bg-white/5", conflict.teacherMark ? "text-emerald-400" : "text-red-400")}>
                              Teacher: {conflict.teacherMark ? '✓' : '✗'}
                            </span>
                            <span className={cn("text-[10px] px-1.5 py-0.5 rounded bg-white/5", conflict.repMark ? "text-emerald-400" : "text-red-400")}>
                              Rep: {conflict.repMark ? '✓' : '✗'}
                            </span>
                          </div>
                        </div>
                        <button 
                          onClick={async () => {
                            await updateDoc(doc(db, 'attendance', conflict.id), { status: 'present', teacherMark: true, repMark: true });
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
        </>
      )}

      {view === 'student-schedules' && (
        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="space-y-6"
        >
          <div className="linear-card p-6 flex flex-col sm:flex-row items-center gap-4">
            <div className="flex-1">
              <h3 className="text-lg font-semibold text-white">Student Schedule Manager</h3>
              <p className="text-sm text-slate-500">Select a section to manage its weekly subject rotation.</p>
            </div>
            <select 
              value={selectedSectionId}
              onChange={(e) => setSelectedSectionId(e.target.value)}
              className="linear-input sm:w-64"
            >
              <option value="">Select Section</option>
              {sections.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </div>

          {selectedSectionId ? (
            <ScheduleManagement 
              schedules={schedules}
              sections={sections}
              subjects={subjects}
              teachers={users.filter(u => u.role === 'teacher')}
              userRole="director"
              assignedSectionId={selectedSectionId}
            />
          ) : (
            <div className="linear-card p-12 text-center">
              <Calendar className="w-12 h-12 text-slate-700 mx-auto mb-4" />
              <p className="text-slate-500">Please select a section to begin scheduling.</p>
            </div>
          )}
        </motion.div>
      )}

      {view === 'verification' && (
        <motion.div 
          initial={{ opacity: 0, x: 20 }}
          animate={{ opacity: 1, x: 0 }}
          className="linear-card overflow-hidden"
        >
          <div className="p-6 border-b border-white/5 bg-white/[0.02]">
            <h3 className="text-lg font-semibold text-white">Verification Hub</h3>
            <p className="text-sm text-slate-500">Cross-referencing Teacher and Representative inputs.</p>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="text-[10px] uppercase tracking-wider text-slate-500 font-bold border-b border-white/5">
                  <th className="px-6 py-4">Session Details</th>
                  <th className="px-6 py-4">Teacher Mark</th>
                  <th className="px-6 py-4">Rep Mark</th>
                  <th className="px-6 py-4">Status</th>
                  <th className="px-6 py-4">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {attendance.slice().reverse().map(att => {
                  const schedule = schedules.find(s => s.id === att.scheduleId);
                  const subject = subjects.find(s => s.id === schedule?.subjectId);
                  const section = sections.find(s => s.id === schedule?.sectionId);
                  const teacher = users.find(u => u.uid === schedule?.teacherId);
                  const isMismatch = att.teacherMark !== undefined && att.repMark !== undefined && att.teacherMark !== att.repMark;
                  
                  return (
                    <tr key={att.id} className={cn("hover:bg-white/[0.02] transition-colors group", isMismatch && "bg-amber-500/[0.02]")}>
                      <td className="px-6 py-4">
                        <p className="text-sm font-semibold text-white">{subject?.name}</p>
                        <p className="text-xs text-slate-500">{section?.name} • {teacher?.name}</p>
                        <p className="text-[10px] text-slate-600 mt-1 font-mono">{att.date}</p>
                      </td>
                      <td className="px-6 py-4">
                        {att.teacherMark === undefined ? (
                          <span className="text-xs text-slate-600 italic">Pending</span>
                        ) : (
                          <div className={cn(
                            "flex items-center gap-2 text-xs font-medium",
                            att.teacherMark ? "text-emerald-400" : "text-red-400"
                          )}>
                            {att.teacherMark ? <Check className="w-3 h-3" /> : <X className="w-3 h-3" />}
                            {att.teacherMark ? 'Present' : 'Absent'}
                          </div>
                        )}
                      </td>
                      <td className="px-6 py-4">
                        {att.repMark === undefined ? (
                          <span className="text-xs text-slate-600 italic">Pending</span>
                        ) : (
                          <div className={cn(
                            "flex items-center gap-2 text-xs font-medium",
                            att.repMark ? "text-emerald-400" : "text-red-400"
                          )}>
                            {att.repMark ? <Check className="w-3 h-3" /> : <X className="w-3 h-3" />}
                            {att.repMark ? 'Present' : 'Absent'}
                          </div>
                        )}
                      </td>
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-2">
                          <LiveStatusIndicator status={att.status} />
                          <span className={cn(
                            "status-badge",
                            att.status === 'present' ? "status-present" : att.status === 'absent' ? "status-absent" : "status-conflict"
                          )}>
                            {att.status}
                          </span>
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-2">
                          <button 
                            onClick={async () => await updateDoc(doc(db, 'attendance', att.id), { status: 'present', teacherMark: true, repMark: true })}
                            className={cn(
                              "p-1.5 rounded-lg transition-colors",
                              att.status === 'present' ? "bg-emerald-500 text-white" : "bg-emerald-500/10 text-emerald-500 hover:bg-emerald-500/20"
                            )}
                            title="Force Present"
                          >
                            <Check className="w-4 h-4" />
                          </button>
                          <button 
                            onClick={async () => await updateDoc(doc(db, 'attendance', att.id), { status: 'absent', teacherMark: false, repMark: false })}
                            className={cn(
                              "p-1.5 rounded-lg transition-colors",
                              att.status === 'absent' ? "bg-red-500 text-white" : "bg-red-500/10 text-red-500 hover:bg-red-500/20"
                            )}
                            title="Force Absent"
                          >
                            <X className="w-4 h-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </motion.div>
      )}
    </div>
  );
}

function TeacherDashboard({ profile, schedules, attendance, subjects, sections }: { profile: UserProfile, schedules: Schedule[], attendance: Attendance[], subjects: Subject[], sections: Section[] }) {
  const [selectedSlot, setSelectedSlot] = useState<{ scheduleId: string; title: string; subtitle: string; currentMark?: boolean | null } | null>(null);
  const mySchedules = schedules.filter(s => s.teacherId === profile.uid);
  const todayDate = format(new Date(), 'yyyy-MM-dd');
  const days = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'];

  const periods = [
    { id: 1, label: 'Period 1', time: '08:00 - 09:30' },
    { id: 2, label: 'Period 2', time: '09:45 - 11:15' },
    { id: 3, label: 'Period 3', time: '11:30 - 13:00' },
    { id: 4, label: 'Period 4', time: '14:00 - 15:30' },
  ];

  const handleMark = async (scheduleId: string, present: boolean) => {
    const id = `${scheduleId}_${todayDate}`;
    const attRef = doc(db, 'attendance', id);
    try {
      const snap = await getDoc(attRef);
      let status: AttendanceStatus = 'present';
      const existingData = snap.exists() ? snap.data() : {};
      const repMark = existingData.repMark;

      if (repMark !== undefined && repMark !== null) {
        if (present && repMark) status = 'present';
        else status = 'absent';
      } else {
        status = present ? 'present' : 'absent'; 
      }

      const updateData: any = {
        id,
        scheduleId,
        date: todayDate,
        teacherMark: present,
        status,
        lastUpdatedBy: profile.uid,
        timestamp: Date.now()
      };

      // Only include repMark if it exists to avoid overwriting with undefined
      if (repMark !== undefined) updateData.repMark = repMark;

      await setDoc(attRef, updateData, { merge: true });
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, `attendance/${id}`);
    }
  };

  return (
    <div className="space-y-8">
      <header>
        <h2 className="text-3xl font-bold text-white tracking-tight">Teacher Schedule</h2>
        <p className="text-slate-500 mt-1">{format(new Date(), 'EEEE, MMMM do')}</p>
      </header>

      <div className="overflow-x-auto no-scrollbar pb-4 -mx-4 px-4 md:mx-0 md:px-0">
        <div className="flex gap-6 min-w-max">
          {days.map(day => (
            <div key={day} className="w-72 space-y-4">
              <div className={cn(
                "flex items-center justify-between px-2",
                format(new Date(), 'EEEE') === day ? "text-indigo-400" : "text-slate-500"
              )}>
                <h3 className="text-sm font-bold uppercase tracking-widest">{day}</h3>
                {format(new Date(), 'EEEE') === day && <div className="w-1.5 h-1.5 rounded-full bg-indigo-500 shadow-[0_0_8px_rgba(99,102,241,0.5)]" />}
              </div>
              <div className="space-y-3">
                {periods.map((period, i) => {
                  const schedule = mySchedules.find(s => s.dayOfWeek === day && s.period === period.id);
                  const subject = subjects.find(s => s.id === schedule?.subjectId);
                  const section = sections.find(s => s.id === schedule?.sectionId);
                  const isToday = format(new Date(), 'EEEE') === day;
                  const att = schedule ? attendance.find(a => a.id === `${schedule.id}_${todayDate}`) : null;
                  
                  return (
                    <motion.div 
                      key={period.id}
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: i * 0.05 }}
                      onClick={() => isToday && schedule && setSelectedSlot({
                        scheduleId: schedule.id,
                        title: subject?.name || 'Session',
                        subtitle: `${section?.name} • ${period.time}`,
                        currentMark: att?.teacherMark
                      })}
                      className={cn(
                        "linear-card p-4 space-y-3 relative overflow-hidden",
                        schedule ? (isToday ? "cursor-pointer hover:border-indigo-500/30" : "opacity-60 grayscale-[0.5]") : "border-dashed border-white/5 bg-transparent opacity-40"
                      )}
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <span className="text-[10px] font-bold text-indigo-400 uppercase tracking-wider bg-indigo-400/10 px-1.5 py-0.5 rounded">P{period.id}</span>
                          {schedule && <LiveStatusIndicator status={isToday ? att?.status : undefined} />}
                          <p className="text-xs font-mono text-slate-500">{period.time}</p>
                        </div>
                        {isToday && schedule && att?.teacherMark !== undefined && (
                          <div className={cn(
                            "p-1 rounded-md",
                            att.teacherMark ? "bg-emerald-500/10 text-emerald-500" : "bg-red-500/10 text-red-500"
                          )}>
                            {att.teacherMark ? <Check className="w-3 h-3" /> : <X className="w-3 h-3" />}
                          </div>
                        )}
                      </div>
                      <div>
                        <p className={cn("text-sm font-semibold", schedule ? "text-white" : "text-slate-700 italic")}>
                          {schedule ? subject?.name : 'No Class'}
                        </p>
                        {schedule && <p className="text-xs text-slate-500 mt-0.5">{section?.name}</p>}
                      </div>
                      {schedule && isToday && !att?.teacherMark && att?.teacherMark !== false && (
                        <div className="absolute top-0 right-0 p-1">
                          <div className="w-1.5 h-1.5 rounded-full bg-indigo-500 animate-pulse" />
                        </div>
                      )}
                    </motion.div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      </div>

      <QuickActionModal 
        isOpen={!!selectedSlot}
        onClose={() => setSelectedSlot(null)}
        onMark={(present) => selectedSlot && handleMark(selectedSlot.scheduleId, present)}
        title={selectedSlot?.title || ''}
        subtitle={selectedSlot?.subtitle || ''}
        currentMark={selectedSlot?.currentMark}
      />
    </div>
  );
}

function RepDashboard({ profile, schedules, attendance, subjects, sections }: { profile: UserProfile, schedules: Schedule[], attendance: Attendance[], subjects: Subject[], sections: Section[] }) {
  const [selectedSlot, setSelectedSlot] = useState<{ scheduleId: string; title: string; subtitle: string; currentMark?: boolean | null } | null>(null);
  const mySectionSchedules = schedules.filter(s => s.sectionId === profile.sectionId);
  const todayDate = format(new Date(), 'yyyy-MM-dd');
  const days = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'];

  const periods = [
    { id: 1, label: 'Period 1', time: '08:00 - 09:30' },
    { id: 2, label: 'Period 2', time: '09:45 - 11:15' },
    { id: 3, label: 'Period 3', time: '11:30 - 13:00' },
    { id: 4, label: 'Period 4', time: '14:00 - 15:30' },
  ];

  const handleMark = async (scheduleId: string, present: boolean) => {
    const id = `${scheduleId}_${todayDate}`;
    const attRef = doc(db, 'attendance', id);
    try {
      const snap = await getDoc(attRef);
      let status: AttendanceStatus = 'present';
      const existingData = snap.exists() ? snap.data() : {};
      const teacherMark = existingData.teacherMark;

      if (teacherMark !== undefined && teacherMark !== null) {
        if (present && teacherMark) status = 'present';
        else status = 'absent';
      } else {
        status = present ? 'present' : 'absent';
      }

      const updateData: any = {
        id,
        scheduleId,
        date: todayDate,
        repMark: present,
        status,
        lastUpdatedBy: profile.uid,
        timestamp: Date.now()
      };

      if (teacherMark !== undefined) updateData.teacherMark = teacherMark;

      await setDoc(attRef, updateData, { merge: true });
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

      <div className="overflow-x-auto no-scrollbar pb-4 -mx-4 px-4 md:mx-0 md:px-0">
        <div className="flex gap-6 min-w-max">
          {days.map(day => (
            <div key={day} className="w-72 space-y-4">
              <div className={cn(
                "flex items-center justify-between px-2",
                format(new Date(), 'EEEE') === day ? "text-indigo-400" : "text-slate-500"
              )}>
                <h3 className="text-sm font-bold uppercase tracking-widest">{day}</h3>
                {format(new Date(), 'EEEE') === day && <div className="w-1.5 h-1.5 rounded-full bg-indigo-500 shadow-[0_0_8px_rgba(99,102,241,0.5)]" />}
              </div>
              <div className="space-y-3">
                {periods.map((period, i) => {
                  const schedule = mySectionSchedules.find(s => s.dayOfWeek === day && s.period === period.id);
                  const subject = subjects.find(s => s.id === schedule?.subjectId);
                  const isToday = format(new Date(), 'EEEE') === day;
                  const att = schedule ? attendance.find(a => a.id === `${schedule.id}_${todayDate}`) : null;
                  
                  return (
                    <motion.div 
                      key={period.id}
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: i * 0.05 }}
                      onClick={() => isToday && schedule && setSelectedSlot({
                        scheduleId: schedule.id,
                        title: subject?.name || 'Session',
                        subtitle: period.time,
                        currentMark: att?.repMark
                      })}
                      className={cn(
                        "linear-card p-4 space-y-3 relative overflow-hidden",
                        schedule ? (isToday ? "cursor-pointer hover:border-indigo-500/30" : "opacity-60 grayscale-[0.5]") : "border-dashed border-white/5 bg-transparent opacity-40"
                      )}
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <span className="text-[10px] font-bold text-indigo-400 uppercase tracking-wider bg-indigo-400/10 px-1.5 py-0.5 rounded">P{period.id}</span>
                          {schedule && <LiveStatusIndicator status={isToday ? att?.status : undefined} />}
                          <p className="text-xs font-mono text-slate-500">{period.time}</p>
                        </div>
                        {isToday && schedule && att?.repMark !== undefined && (
                          <div className={cn(
                            "p-1 rounded-md",
                            att.repMark ? "bg-emerald-500/10 text-emerald-500" : "bg-red-500/10 text-red-500"
                          )}>
                            {att.repMark ? <Check className="w-3 h-3" /> : <X className="w-3 h-3" />}
                          </div>
                        )}
                      </div>
                      <div>
                        <p className={cn("text-sm font-semibold", schedule ? "text-white" : "text-slate-700 italic")}>
                          {schedule ? subject?.name : 'No Class'}
                        </p>
                      </div>
                      {schedule && isToday && !att?.repMark && att?.repMark !== false && (
                        <div className="absolute top-0 right-0 p-1">
                          <div className="w-1.5 h-1.5 rounded-full bg-indigo-500 animate-pulse" />
                        </div>
                      )}
                    </motion.div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      </div>

      <QuickActionModal 
        isOpen={!!selectedSlot}
        onClose={() => setSelectedSlot(null)}
        onMark={(present) => selectedSlot && handleMark(selectedSlot.scheduleId, present)}
        title={selectedSlot?.title || ''}
        subtitle={selectedSlot?.subtitle || ''}
        currentMark={selectedSlot?.currentMark}
      />
    </div>
  );
}

// --- Management Components ---

function UserManagement({ users, sections, subjects, logAction }: { users: UserProfile[], sections: Section[], subjects: Subject[], logAction: (type: string, details: any) => Promise<void> }) {
  const [isAdding, setIsAdding] = useState(false);
  const [editingUser, setEditingUser] = useState<UserProfile | null>(null);
  const [formData, setFormData] = useState<Partial<UserProfile>>({ role: 'teacher' });
  const [searchQuery, setSearchQuery] = useState('');

  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);

  const filteredUsers = users.filter(u => 
    u.name.toLowerCase().includes(searchQuery.toLowerCase()) || 
    u.email.toLowerCase().includes(searchQuery.toLowerCase()) ||
    u.role.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.email || !formData.name || !formData.role) return;

    const uid = editingUser?.uid || Math.random().toString(36).substring(7);
    const userRef = doc(db, 'users', uid);
    
    try {
      const dataToSave = {
        ...formData,
        uid,
        // Ensure arrays are initialized for teachers
        assignedSections: formData.role === 'teacher' ? (formData.assignedSections || []) : [],
        assignedSubjects: formData.role === 'teacher' ? (formData.assignedSubjects || []) : [],
        // Ensure sectionId is present for reps
        sectionId: formData.role === 'rep' ? (formData.sectionId || '') : '',
      };

      await setDoc(userRef, dataToSave, { merge: true });
      await logAction(editingUser ? 'update_user' : 'create_user', { uid, role: formData.role });

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
                onClick={() => setConfirmDelete(user.uid)}
                className="p-2 text-slate-500 hover:text-red-400 hover:bg-red-400/5 rounded-lg transition-colors"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            </div>
          </div>
        ))}
      </div>

      <ConfirmationModal 
        isOpen={!!confirmDelete}
        onClose={() => setConfirmDelete(null)}
        onConfirm={async () => {
          if (confirmDelete) {
            await deleteDoc(doc(db, 'users', confirmDelete));
            await logAction('delete_user', { uid: confirmDelete });
          }
        }}
        title="Delete User"
        message="Are you sure you want to delete this user? This action cannot be undone."
      />

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
                {formData.role === 'teacher' && (
                  <div className="space-y-1">
                    <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Teaching Subject</label>
                    <select 
                      required
                      value={formData.teachingSubjectId || ''}
                      onChange={e => setFormData({ ...formData, teachingSubjectId: e.target.value })}
                      className="linear-input"
                    >
                      <option value="">Select Subject</option>
                      {subjects.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                    </select>
                  </div>
                )}
                {formData.role === 'rep' && (
                  <div className="space-y-1">
                    <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Assigned Section</label>
                    <select 
                      required
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

function ScheduleManagement({ schedules, sections, subjects, teachers, userRole, assignedSectionId, assignedTeacherId }: { schedules: Schedule[], sections: Section[], subjects: Subject[], teachers: UserProfile[], userRole?: UserRole, assignedSectionId?: string, assignedTeacherId?: string }) {
  const [isAdding, setIsAdding] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  const [formData, setFormData] = useState<Partial<Schedule>>({ 
    dayOfWeek: 'Monday',
    period: 1,
    sectionId: assignedSectionId || '',
    teacherId: assignedTeacherId || '',
    subjectId: userRole === 'teacher' ? (teachers.find(t => t.uid === assignedTeacherId)?.teachingSubjectId || '') : ''
  });

  const periods = [
    { id: 1, label: 'Period 1', time: '08:00 - 09:30' },
    { id: 2, label: 'Period 2', time: '09:45 - 11:15' },
    { id: 3, label: 'Period 3', time: '11:30 - 13:00' },
    { id: 4, label: 'Period 4', time: '14:00 - 15:30' },
  ];

  const handleTeacherChange = (teacherId: string) => {
    const teacher = teachers.find(t => t.uid === teacherId);
    if (teacher) {
      setFormData({ 
        ...formData, 
        teacherId, 
        subjectId: teacher.teachingSubjectId || '' 
      });
    } else {
      setFormData({ ...formData, teacherId, subjectId: '' });
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.sectionId || !formData.subjectId || !formData.teacherId || !formData.dayOfWeek || !formData.period) return;

    const periodInfo = periods.find(p => p.id === formData.period);
    const [startTime, endTime] = periodInfo!.time.split(' - ');

    const id = Math.random().toString(36).substring(7);
    await setDoc(doc(db, 'schedules', id), { 
      ...formData, 
      id,
      startTime,
      endTime
    });

    setIsAdding(false);
    setFormData({ 
      dayOfWeek: 'Monday', 
      period: 1,
      sectionId: assignedSectionId || '',
      teacherId: assignedTeacherId || '',
      subjectId: userRole === 'teacher' ? (teachers.find(t => t.uid === assignedTeacherId)?.teachingSubjectId || '') : ''
    });
  };

  const filteredSections = userRole === 'rep' && assignedSectionId 
    ? sections.filter(s => s.id === assignedSectionId)
    : sections;

  const filteredSchedules = schedules.filter(s => {
    if (userRole === 'rep') return s.sectionId === assignedSectionId;
    if (userRole === 'teacher') return s.teacherId === assignedTeacherId;
    if (userRole === 'director' && assignedSectionId) return s.sectionId === assignedSectionId;
    return true;
  });

  return (
    <div className="space-y-8">
      <header className="flex items-center justify-between">
        <div>
          <h2 className="text-3xl font-bold text-white tracking-tight">
            {userRole === 'rep' ? 'Section Schedule' : userRole === 'teacher' ? 'My Schedule' : userRole === 'director' ? 'Section Rotation' : 'Schedules'}
          </h2>
          <p className="text-slate-500 mt-1">
            {userRole === 'rep' ? 'Manage classes for your assigned section.' : userRole === 'teacher' ? 'Manage your assigned teaching slots.' : 'Configure weekly class sessions (4 slots per day).'}
          </p>
        </div>
        <button onClick={() => setIsAdding(true)} className="linear-button">
          <Plus className="w-4 h-4" />
          Add Slot
        </button>
      </header>

      <div className="overflow-x-auto no-scrollbar pb-4 -mx-4 px-4 md:mx-0 md:px-0">
        <div className="flex gap-6 min-w-max">
          {['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'].map(day => (
            <div key={day} className="w-72 space-y-4">
              <h3 className="text-sm font-bold text-slate-500 uppercase tracking-widest px-2">{day}</h3>
              <div className="space-y-3">
                {periods.map(period => {
                  const schedule = filteredSchedules.find(s => s.dayOfWeek === day && s.period === period.id);
                  const subject = subjects.find(sub => sub.id === schedule?.subjectId);
                  const section = sections.find(sec => sec.id === schedule?.sectionId);
                  const teacher = teachers.find(t => t.uid === schedule?.teacherId);

                  return (
                    <div key={period.id} className={cn(
                      "linear-card p-4 space-y-2 relative overflow-hidden",
                      !schedule && "border-dashed border-white/5 bg-transparent"
                    )}>
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <span className="text-[10px] font-bold text-indigo-400 uppercase tracking-wider bg-indigo-400/10 px-1.5 py-0.5 rounded">P{period.id}</span>
                          <p className={cn("font-semibold", schedule ? "text-white" : "text-slate-700 italic")}>
                            {schedule ? subject?.name : 'Empty Slot'}
                          </p>
                        </div>
                        {schedule && (
                          <button 
                            onClick={() => setConfirmDelete(schedule.id)}
                            className="text-slate-600 hover:text-red-400 transition-colors"
                          >
                            <Trash2 className="w-3 h-3" />
                          </button>
                        )}
                      </div>
                      {schedule ? (
                        <>
                          <p className="text-xs text-slate-500">{section?.name} • {teacher?.name}</p>
                          <div className="flex items-center gap-2 text-[10px] font-mono text-indigo-400 bg-indigo-400/5 w-fit px-2 py-0.5 rounded border border-indigo-400/10">
                            <Clock className="w-3 h-3" />
                            {period.time}
                          </div>
                        </>
                      ) : (
                        <p className="text-[10px] text-slate-800 font-mono">{period.time}</p>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      </div>

      <ConfirmationModal 
        isOpen={!!confirmDelete}
        onClose={() => setConfirmDelete(null)}
        onConfirm={async () => {
          if (confirmDelete) {
            await deleteDoc(doc(db, 'schedules', confirmDelete));
          }
        }}
        title="Delete Slot"
        message="Are you sure you want to remove this class slot from the schedule?"
      />

      <AnimatePresence>
        {isAdding && (
          <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-6">
            <motion.div 
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="linear-card p-8 w-full max-w-md space-y-6"
            >
              <h3 className="text-xl font-bold text-white">New Schedule Slot</h3>
              <form onSubmit={handleSubmit} className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1">
                    <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Section</label>
                    <select 
                      required
                      value={formData.sectionId || ''}
                      onChange={e => setFormData({ ...formData, sectionId: e.target.value })}
                      className="linear-input"
                      disabled={userRole === 'rep' || (userRole === 'director' && !!assignedSectionId)}
                    >
                      <option value="">Select</option>
                      {filteredSections.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                    </select>
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Period</label>
                    <select 
                      required
                      value={formData.period}
                      onChange={e => setFormData({ ...formData, period: parseInt(e.target.value) as any })}
                      className="linear-input"
                    >
                      {periods.map(p => <option key={p.id} value={p.id}>{p.label} ({p.time})</option>)}
                    </select>
                  </div>
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Teacher</label>
                  <select 
                    required
                    value={formData.teacherId || ''}
                    onChange={e => handleTeacherChange(e.target.value)}
                    className="linear-input"
                    disabled={userRole === 'teacher'}
                  >
                    <option value="">Select Teacher</option>
                    {teachers.map(t => <option key={t.uid} value={t.uid}>{t.name} ({subjects.find(s => s.id === t.teachingSubjectId)?.name || 'No Subject'})</option>)}
                  </select>
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Subject (Auto-filled)</label>
                  <input 
                    type="text" 
                    readOnly
                    value={subjects.find(s => s.id === formData.subjectId)?.name || 'Select a teacher first'}
                    className="linear-input bg-white/5 opacity-60" 
                  />
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
    try {
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

        if (y > 270) {
          doc.addPage();
          y = 20;
        }

        doc.text(`${section.name}: ${rate}% Attendance (${present}/${total} sessions)`, 20, y);
        y += 10;
      });

      doc.save(`attendance-report-${format(new Date(), 'yyyy-MM-dd')}.pdf`);
    } catch (error) {
      console.error("PDF Export failed:", error);
      alert("Failed to export PDF. Please ensure your browser allows downloads.");
    }
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
