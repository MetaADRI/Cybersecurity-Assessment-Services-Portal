import type { FreeResult, FreeServiceKey, ServiceCatalogItem } from './free-services';
import type { ServiceRequestStatus } from './constants';

export interface ClientUser {
  id: string;
  name: string;
  email: string;
  company: string;
  phone: string;
  emailVerified: boolean;
  createdAt: string;
  lastLoginAt: string | null;
}

export interface ClientSessionInfo {
  user: ClientUser;
  csrfToken: string;
}

export interface ClientAuthMe {
  user: ClientUser | null;
  csrfToken: string | null;
}

export interface FreeRunSummary {
  id: string;
  serviceKey: FreeServiceKey;
  target: string | null;
  status: 'running' | 'completed' | 'failed';
  score: number | null;
  result: FreeResult | null;
  createdAt: string;
  hasReport: boolean;
}

export interface ClientReportSummary {
  id: string;
  serviceKey: FreeServiceKey | null;
  target: string | null;
  score: number | null;
  createdAt: string;
  downloadUrl: string;
}

export interface ClientServiceRequest {
  id: string;
  serviceKey: string;
  serviceName: string;
  message: string | null;
  contactPreference: 'email' | 'phone' | 'whatsapp';
  status: ServiceRequestStatus;
  assignedTo: string | null;
  assignedToName: string | null;
  staffNote: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface StaffServiceRequest extends ClientServiceRequest {
  clientId: string | null;
  clientName: string | null;
  clientEmail: string | null;
  clientCompany: string | null;
  visitorId: string | null;
  freeScore: number | null;
  freeTarget: string | null;
}

export interface ClientDashboardData {
  user: ClientUser;
  latestRun: FreeRunSummary | null;
  runs: FreeRunSummary[];
  reports: ClientReportSummary[];
  requests: ClientServiceRequest[];
  recommended: ServiceCatalogItem[];
  catalog: ServiceCatalogItem[];
}
