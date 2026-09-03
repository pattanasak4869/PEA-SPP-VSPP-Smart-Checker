
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
  | 'VERIFY_REPORT';

export type NotificationType = 'INFO' | 'ALERT' | 'SUCCESS';

export interface AppNotification {
  id: string;
  type: NotificationType;
  title: string;
  message: string;
  details?: string;
}

export interface PowerPlantCoordinator {
  name: string;
  email: string;
  phone: string;
}

export interface PowerPlantItem {
  id: string;
  name: string;
  type: string;
  capacity: number; // MW
  connectionPoint?: string;
  userType?: 'SPP' | 'VSPP';
  region?: string;
  province?: string;
  location?: string;
  office?: string;
  vendorId?: string;
  coordinators?: PowerPlantCoordinator[];
  contactPerson?: string;
  contactPhone?: string;
  gps?: {
    lat: string | number;
    lng: string | number;
  };
  notes?: string;
  createdAt?: string;
}

export interface InspectionRequest {
  id: string;
  vendorId: string;
  vendorName: string;
  coordinatorName?: string;
  coordinatorPhone?: string;
  office?: string;
  department?: string;
  region?: string;
  plantId: string;
  plantName: string;
  details?: string;
  notes?: string;
  requestedDate: string;
  preferredDate?: string;
  formId?: string;
  inspectorId?: string;
  inspectorName?: string;
  assignedAt?: string;
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
  documents: { name: string; url: string }[];
  status: 'DRAFT' | 'SUBMITTED' | 'APPROVED' | 'REJECTED';
  inspectorSignature?: string;
  managerSignature?: string;
  managerId?: string;
  managerName?: string;
  approvalNote?: string;
  inspectionDate?: string;
  submittedAt?: string;
  approvedAt?: string;
  createdAt: string;
}
