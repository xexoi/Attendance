export type UserRole = 'director' | 'teacher' | 'rep';

export interface UserProfile {
  uid: string;
  email: string;
  name: string;
  role: UserRole;
  sectionId?: string;
  assignedSections?: string[];
  assignedSubjects?: string[];
}

export interface Section {
  id: string;
  name: string;
}

export interface Subject {
  id: string;
  name: string;
}

export interface Schedule {
  id: string;
  sectionId: string;
  subjectId: string;
  teacherId: string;
  dayOfWeek: 'Monday' | 'Tuesday' | 'Wednesday' | 'Thursday' | 'Friday';
  startTime: string;
  endTime: string;
}

export type AttendanceStatus = 'present' | 'absent' | 'conflict';

export interface Attendance {
  id: string;
  scheduleId: string;
  date: string;
  teacherMark?: boolean;
  repMark?: boolean;
  status: AttendanceStatus;
  lastUpdatedBy?: string;
  timestamp?: number;
}

export interface AuditLog {
  id: string;
  action: string;
  userId: string;
  timestamp: number;
  details?: any;
}
