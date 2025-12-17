export interface User {
  id: string;
  email: string;
  name: string;
  cpf?: string;
  phone?: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface UserProfile {
  id: string;
  userId: string;
  birthdate?: Date;
  addressStreet?: string;
  addressNumber?: string;
  addressComplement?: string;
  addressNeighborhood?: string;
  addressCity?: string;
  addressState?: string;
  addressZipcode?: string;
}

export interface Simulation {
  id: string;
  userId: string;
  simulationType: string;
  requestedAmount: number;
  installments: number;
  interestRate: number;
  installmentValue: number;
  totalAmount: number;
  status: 'pending' | 'approved' | 'rejected' | 'completed';
  createdAt: Date;
  updatedAt: Date;
}

export interface MarginConsultation {
  id: string;
  userId: string;
  availableMargin: number;
  usedMargin: number;
  totalMargin: number;
  employer?: string;
  employmentType?: string;
  consultedAt: Date;
}

export interface Document {
  id: string;
  userId: string;
  simulationId?: string;
  documentType: string;
  fileName: string;
  fileUrl: string;
  fileSize?: number;
  status: 'pending' | 'approved' | 'rejected';
  uploadedAt: Date;
}

export interface Notification {
  id: string;
  userId: string;
  title: string;
  message: string;
  type: 'info' | 'success' | 'warning' | 'error';
  isRead: boolean;
  createdAt: Date;
}
