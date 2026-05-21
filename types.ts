
export type Language = 'TH' | 'EN' | 'CN';

export type ViewState = 
  | 'DASHBOARD' 
  | 'PROFILE' 
  | 'USER_MANAGEMENT' 
  | 'FORM_MANAGEMENT' 
  | 'LOGIN_MANAGEMENT' 
  | 'POWER_PLANT_MANAGEMENT' 
  | 'COMPLAINT_MANAGEMENT' 
  | 'INSPECTION_REQUEST' 
  | 'EQUIPMENT_INSPECTION' 
  | 'INSPECTION_APPROVAL' 
  | 'POWER_PLANT_REGISTRY' 
  | 'INSPECTION_MANAGEMENT' 
  | 'VERIFY_REPORT'
  | 'SEED_DATA';

export type NotificationType = 'INFO' | 'ALERT' | 'SUCCESS';

export interface AppNotification {
  id: string;
  type: NotificationType;
  title: string;
  message: string;
  details?: string;
}

export interface InspectionRequest {
  id: string;
  vendorId: string;
  vendorName: string;
  coordinatorName?: string;
  coordinatorPhone?: string;
  office?: string;
  plantId: string;
  plantName: string;
  details: string;
  requestedDate: string;
  formId?: string;
  status: 'PENDING' | 'ACCEPTED' | 'REJECTED' | 'AWAITING_APPROVAL' | 'COMPLETED';
  createdAt: string;
}

export interface InspectionResult {
  id: string;
  requestId?: string;
  office?: string;
  department?: string;
  region?: string;
  inspectorId: string;
  inspectorName: string;
  plantId: string;
  plantName: string;
  formId: string;
  formData: any;
  photos: string[];
  documents: { name: string, url: string }[];
  status: 'DRAFT' | 'SUBMITTED' | 'APPROVED' | 'REJECTED';
  inspectorSignature?: string;
  managerSignature?: string;
  managerId?: string;
  managerName?: string;
  approvalNote?: string;
  submittedAt?: string;
  approvedAt?: string;
  createdAt: string;
}
