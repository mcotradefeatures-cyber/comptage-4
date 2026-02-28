
export type TableData = number[][];

export interface HistoryEntry {
  id: string;
  date: string;
  time: string;
  title: string;
  pages: TableData[];
  total: number;
  countNumber?: string;
  clientName?: string;
  clientMobile?: string;
  transactionType?: 'achat' | 'vente';
  unitPrice?: number;
  companyName?: string;
  decimalHandling?: 'all' | 'none' | 'threshold';
}

export interface User {
  id: string;
  email: string;
  passwordHash: string;
  companyName?: string;
  role: 'admin' | 'user';
  accountType: 'personal' | 'team';
  createdAt: number;
  lastLogin?: number;
  subscriptionEnd?: number;
  mobile?: string;
  isBlacklisted?: boolean;
}

export interface AuthResponse {
  token: string;
  user: User;
}

export interface AppState {
  pages: TableData[];
  currentIndex: number;
  row: number;
  col: number;
  globalTotal: number;
  isNightMode: boolean;
  isLocked: boolean;
  inputValue: string;
}
