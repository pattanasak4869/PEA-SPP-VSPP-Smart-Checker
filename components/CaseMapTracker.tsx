import React, { useState, useEffect, useRef, useMemo } from 'react';
import { 
  Zap, Search, Globe, Filter, MapPin, 
  ChevronRight, Calendar, User, CheckCircle2, 
  Clock, FileText, ArrowRight, Building2, Radio,
  X, Phone, Navigation, ShieldCheck, History,
  Activity, Sparkles, Layers, RefreshCw, Maximize2, Minimize2,
  AlertCircle, ChevronDown, ExternalLink, Compass, Eye,
  Database, Check, AlertTriangle, ShieldAlert, Edit3, Send, Save, Locate
} from 'lucide-react';
import { safeParseLocalStorage, safeSetLocalStorage } from '../utils/localStorageUtils';
import { motion, AnimatePresence } from 'motion/react';
import { InspectionRequest, InspectionResult, PowerPlantItem, ViewState } from '../types';
import { db, OperationType, handleFirestoreError, seedSampleData } from '../src/lib/firebase';
import { parseFirebaseCoordinates, ParsedGpsLocation, THAI_PROVINCE_COORDINATES } from '../utils/geoUtils';
import { 
  collection, 
  query, 
  onSnapshot, 
  doc, 
  updateDoc, 
  setDoc,
  serverTimestamp,
  type Unsubscribe 
} from 'firebase/firestore';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';

export type CaseStatusCategory = 'ALL' | 'COMPLETED' | 'IN_PROGRESS' | 'PENDING' | 'HAS_HISTORY';
export type PointType = 'PLANT' | 'REQUEST';
export type LayerFilterType = 'ALL' | 'PLANTS' | 'REQUESTS';

export interface ComplaintItem {
  id: string;
  plantId?: string;
  plantName?: string;
  title: string;
  details?: string;
  severity?: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  status?: string;
  createdAt?: string;
}

export interface MapCasePoint {
  id: string;
  pointType: PointType; // 'PLANT' = หมุดโรงไฟฟ้า, 'REQUEST' = หมุดคำร้องขอตรวจสอบ
  plantId: string;
  plantName: string;
  plantType: string;
  requestCode?: string;
  requestStatus?: string;
  capacity: number;
  location: string;
  province: string;
  region?: string;
  lat: number;
  lng: number;
  isExactGps: boolean;
  gpsSource: string;
  category: 'COMPLETED' | 'IN_PROGRESS' | 'PENDING' | 'HAS_HISTORY';
  categoryLabel: string;
  activeRequestId?: string;
  activeInspectionId?: string;
  preferredDate?: string;
  vendorName?: string;
  inspectorName?: string;
  inspectorId?: string;
  lastInspectionDate?: string;
  historyCount: number;
  historyList: InspectionResult[];
  notes?: string;
  complaintsCount: number;
  complaintsList: ComplaintItem[];
  rawPlant?: PowerPlantItem;
  rawRequest?: InspectionRequest;
  rawInspection?: InspectionResult;
}

interface CaseMapTrackerProps {
  userProfile?: {
    employeeId?: string;
    name?: string;
    username?: string;
    role?: string;
    email?: string;
    phone?: string;
    peaOffice?: string;
    department?: string;
    region?: string;
  };
  onNavigate?: (view: ViewState) => void;
}

export const CaseMapTracker: React.FC<CaseMapTrackerProps> = ({ userProfile, onNavigate }) => {
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapInstance = useRef<L.Map | null>(null);
  const markersLayerRef = useRef<L.LayerGroup | null>(null);
  const hasFittedInitialBoundsRef = useRef(false);
  const lastFilterKeyRef = useRef('');
  const prevPointsSignatureRef = useRef('');

  const userRole = userProfile?.role?.toUpperCase();
  const isInspector = userRole === 'INSPECTOR';
  const isManager = userRole === 'MANAGER';
  const isAdmin = userRole === 'ADMIN';
  const isVendor = userRole === 'VENDER' || userRole === 'VENDOR';

  // Data States from Firestore
  const [plants, setPlants] = useState<PowerPlantItem[]>([]);
  const [requests, setRequests] = useState<InspectionRequest[]>([]);
  const [inspections, setInspections] = useState<InspectionResult[]>([]);
  const [complaints, setComplaints] = useState<ComplaintItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSyncing, setIsSyncing] = useState(false);
  const [lastSyncTime, setLastSyncTime] = useState<Date>(new Date());
  const [syncStatus, setSyncStatus] = useState<'connected' | 'syncing' | 'error'>('connected');

  // Filter & Search States
  const [selectedCategory, setSelectedCategory] = useState<CaseStatusCategory>('ALL');
  const [layerFilter, setLayerFilter] = useState<LayerFilterType>('ALL');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedType, setSelectedType] = useState<string>('ALL');
  const [selectedProvince, setSelectedProvince] = useState<string>('ALL');
  const [mapTileTheme, setMapTileTheme] = useState<'GOOGLE' | 'SATELLITE' | 'STREET' | 'DARK'>('GOOGLE');
  const [isFullscreen, setIsFullscreen] = useState(false);

  // Selected Detail Modal & Action States
  const [selectedCase, setSelectedCase] = useState<MapCasePoint | null>(null);
  const [userLocation, setUserLocation] = useState<{ lat: number; lng: number } | null>(null);
  const [userLocationMarker, setUserLocationMarker] = useState<L.Marker | null>(null);
  const [isActionLoading, setIsActionLoading] = useState(false);
  const [actionSuccessMsg, setActionSuccessMsg] = useState<string | null>(null);
  const [isSeeding, setIsSeeding] = useState(false);

  // Live GPS Coordinate Editing Modal State
  const [isEditingGps, setIsEditingGps] = useState(false);
  const [editLat, setEditLat] = useState('');
  const [editLng, setEditLng] = useState('');
  const [isSavingGps, setIsSavingGps] = useState(false);

  // Real-time Firestore Listeners with graceful fallback
  useEffect(() => {
    // 1. Initial local cache preview
    const localPlants = safeParseLocalStorage<PowerPlantItem[]>('power_plants', []);
    const localRequests = safeParseLocalStorage<InspectionRequest[]>('app_inspection_requests', []);
    const localInspections = safeParseLocalStorage<InspectionResult[]>('app_inspections', []);
    const localComplaints = safeParseLocalStorage<ComplaintItem[]>('app_complaints', []);

    if (localPlants.length > 0) setPlants(localPlants);
    if (localRequests.length > 0) setRequests(localRequests);
    if (localInspections.length > 0) setInspections(localInspections);
    if (localComplaints.length > 0) setComplaints(localComplaints);

    // 2. Setup Firestore real-time listeners
    let unsubPlants: Unsubscribe | undefined;
    let unsubRequests: Unsubscribe | undefined;
    let unsubInspections: Unsubscribe | undefined;
    let unsubComplaints: Unsubscribe | undefined;

    try {
      setIsSyncing(true);
      setSyncStatus('syncing');

      // Plants listener
      const qPlants = query(collection(db, 'powerPlants'));
      unsubPlants = onSnapshot(qPlants, (snapshot) => {
        const list: PowerPlantItem[] = [];
        snapshot.forEach((docSnap) => {
          list.push({ ...docSnap.data(), id: docSnap.id } as PowerPlantItem);
        });
        setPlants(list);
        setIsLoading(false);
        setIsSyncing(false);
        setSyncStatus('connected');
        setLastSyncTime(new Date());
      }, (err) => {
        console.warn('Firestore plants snapshot error:', err);
        setSyncStatus('error');
        setIsLoading(false);
        setIsSyncing(false);
      });

      // Requests listener
      const qRequests = query(collection(db, 'inspectionRequests'));
      unsubRequests = onSnapshot(qRequests, (snapshot) => {
        const list: InspectionRequest[] = [];
        snapshot.forEach((docSnap) => {
          list.push({ ...docSnap.data(), id: docSnap.id } as InspectionRequest);
        });
        if (list.length === 0) {
          const local = safeParseLocalStorage<InspectionRequest[]>('app_inspection_requests', []);
          if (local.length > 0) {
            setRequests(local);
            return;
          }
        }
        setRequests(list);
        setLastSyncTime(new Date());
      }, (err) => {
        console.warn('Firestore requests snapshot error:', err);
      });

      // Inspections listener
      const qInspections = query(collection(db, 'inspections'));
      unsubInspections = onSnapshot(qInspections, (snapshot) => {
        const list: InspectionResult[] = [];
        snapshot.forEach((docSnap) => {
          list.push({ ...docSnap.data(), id: docSnap.id } as InspectionResult);
        });
        if (list.length === 0) {
          const local = safeParseLocalStorage<InspectionResult[]>('app_inspections', []);
          if (local.length > 0) {
            setInspections(local);
            return;
          }
        }
        setInspections(list);
        setLastSyncTime(new Date());
      }, (err) => {
        console.warn('Firestore inspections snapshot error:', err);
      });

      // Complaints listener
      const qComplaints = query(collection(db, 'complaints'));
      unsubComplaints = onSnapshot(qComplaints, (snapshot) => {
        const list: ComplaintItem[] = [];
        snapshot.forEach((docSnap) => {
          list.push({ ...docSnap.data(), id: docSnap.id } as ComplaintItem);
        });
        setComplaints(list);
        setLastSyncTime(new Date());
      }, (err) => {
        console.warn('Firestore complaints snapshot error:', err);
      });

    } catch (e) {
      console.warn('Error setting up map listeners:', e);
      setSyncStatus('error');
      setIsLoading(false);
      setIsSyncing(false);
    }

    return () => {
      if (unsubPlants) unsubPlants();
      if (unsubRequests) unsubRequests();
      if (unsubInspections) unsubInspections();
      if (unsubComplaints) unsubComplaints();
    };
  }, []);

  // Compute Case Points & Coordinates faithfully from Firebase
  const casePoints = useMemo<MapCasePoint[]>(() => {
    const points: MapCasePoint[] = [];

    const userRole = userProfile?.role?.toUpperCase();
    const isInspector = userRole === 'INSPECTOR';
    const isManager = userRole === 'MANAGER';
    const isVendor = userRole === 'VENDER' || userRole === 'VENDOR';
    const isAdmin = userRole === 'ADMIN';

    // 1. Process Power Plants (pointType: 'PLANT')
    // Role visibility:
    // - INSPECTOR: โรงไฟฟ้าในพื้นที่รับผิดชอบ (หรือทั้งหมดหากไม่ได้ระบุจังหวัด)
    // - VENDOR: Only their own plants (created by vendor or matching their office/vendorId)
    // - MANAGER / ADMIN: All plants
    const userOffice = userProfile?.peaOffice || userProfile?.department;
    const userResponsibleProvince = userProfile?.region;

    const visiblePlants = plants.filter((plant) => {
      if (isInspector) {
        // Inspector tracks strictly actionable inspection request cases (2 cases)
        return false;
      }
      if (isAdmin || isManager || !userRole) {
        // Manager & Admin see all plants
        return true;
      }
      if (isVendor) {
        // Vendor sees strictly plants they created or belong to their specific office
        if (!userProfile) return false;

        const empId = userProfile.employeeId?.toString().trim().toLowerCase();
        const username = userProfile.username?.toString().trim().toLowerCase();
        const email = userProfile.email?.toString().trim().toLowerCase();
        const name = userProfile.name?.toString().trim().toLowerCase();
        const office = (userProfile.peaOffice || userProfile.department)?.toString().trim().toLowerCase();
        const phone = userProfile.phone?.toString().trim();

        // 1. Direct creator / owner identifiers
        const plantVendorId = (plant as any).vendorId?.toString().trim().toLowerCase();
        const plantCreatedBy = (plant as any).createdBy?.toString().trim().toLowerCase();
        const plantUserId = (plant as any).userId?.toString().trim().toLowerCase();

        if (plantVendorId && (plantVendorId === empId || plantVendorId === username || plantVendorId === email)) {
          return true;
        }
        if (plantCreatedBy && (plantCreatedBy === empId || plantCreatedBy === username || plantCreatedBy === email || (name && plantCreatedBy === name))) {
          return true;
        }
        if (plantUserId && (plantUserId === empId || plantUserId === username || plantUserId === email)) {
          return true;
        }

        // 2. Coordinators array match
        if (Array.isArray(plant.coordinators) && plant.coordinators.length > 0) {
          const hasCoordMatch = plant.coordinators.some((c: any) => {
            if (!c) return false;
            const cEmail = c.email?.toString().trim().toLowerCase();
            const cName = c.name?.toString().trim().toLowerCase();
            const cPhone = c.phone?.toString().trim();
            return (
              (cEmail && (cEmail === email || cEmail === username)) ||
              (cName && name && (cName === name || cName.includes(name) || name.includes(cName))) ||
              (cPhone && phone && cPhone === phone)
            );
          });
          if (hasCoordMatch) return true;
        }

        // 3. Contact person match
        if (plant.contactPerson && name) {
          const cp = plant.contactPerson.toString().trim().toLowerCase();
          if (cp.includes(name) || name.includes(cp)) return true;
        }

        // 4. Specific non-generic office match
        const plantOffice = (plant as any).office?.toString().trim().toLowerCase();
        if (plantOffice && office && plantOffice === office && plantOffice !== 'system' && plantOffice !== 'กฟภ.' && plantOffice !== 'pea') {
          return true;
        }

        // Strict fallback: do not display generic or unowned plants
        return false;
      }
      return true;
    });

    visiblePlants.forEach((plant) => {
      // Parse exact GPS from Firebase plant record
      const parsedGps: ParsedGpsLocation = parseFirebaseCoordinates(plant, plant.province, plant.region);

      // Associated records
      const plantRequests = requests.filter((r) => r.plantId === plant.id || (r.plantName && plant.name && r.plantName.trim().toLowerCase() === plant.name.trim().toLowerCase()));
      const plantInspections = inspections.filter((i) => i.plantId === plant.id || (i.plantName && plant.name && i.plantName.trim().toLowerCase() === plant.name.trim().toLowerCase()));
      const plantComplaints = complaints.filter((c) => c.plantId === plant.id || (c.plantName && plant.name && c.plantName.trim().toLowerCase() === plant.name.trim().toLowerCase()));

      // Active inspection (draft / submitted)
      const activeInsp = plantInspections.find((i) => i.status === 'DRAFT' || i.status === 'SUBMITTED');

      // Approved inspections
      const approvedInspections = plantInspections.filter((i) => i.status === 'APPROVED');
      const hasApprovedInspection = approvedInspections.length > 0;

      // Active request (latest pending, accepted, in progress, or awaiting approval)
      const activeReq = plantRequests.find((r) => 
        r.status === 'AWAITING_APPROVAL' || 
        r.status === 'ACCEPTED' || 
        (r.status as any) === 'IN_PROGRESS' || 
        (r.status === 'PENDING' && !hasApprovedInspection)
      ) || plantRequests[0];

      // Determine 4-Tier Category for Plant
      let category: 'COMPLETED' | 'IN_PROGRESS' | 'PENDING' | 'HAS_HISTORY' = 'PENDING';
      let categoryLabel = 'ยังไม่ได้ดำเนินการ';

      const isPlantReqAcceptedOrInProgress = activeReq && (
        activeReq.status === 'ACCEPTED' || 
        (activeReq.status as any) === 'IN_PROGRESS' || 
        activeReq.status === 'AWAITING_APPROVAL'
      );

      if (hasApprovedInspection && (!activeInsp || activeInsp.status !== 'SUBMITTED') && !isPlantReqAcceptedOrInProgress) {
        // เมื่อ Manager อนุมัติผลการตรวจสอบแล้ว -> แผนที่สถานะเคสตรวจสอบมีสถานะดำเนินการเสร็จแล้ว
        category = 'COMPLETED';
        categoryLabel = 'ดำเนินการเสร็จแล้ว';
      } else if (activeInsp?.status === 'SUBMITTED' || activeInsp?.status === 'DRAFT' || isPlantReqAcceptedOrInProgress) {
        category = 'IN_PROGRESS';
        categoryLabel = 'กำลังดำเนินการ';
      } else if (activeReq?.status === 'COMPLETED' || hasApprovedInspection) {
        category = 'COMPLETED';
        categoryLabel = 'ดำเนินการเสร็จแล้ว';
      } else {
        category = 'PENDING';
        categoryLabel = 'ยังไม่ได้ดำเนินการ';
      }

      const sortedInspections = [...plantInspections].sort((a, b) => {
        const timeA = new Date(a.inspectionDate || a.submittedAt || a.approvedAt || a.createdAt || 0).getTime();
        const timeB = new Date(b.inspectionDate || b.submittedAt || b.approvedAt || b.createdAt || 0).getTime();
        return timeB - timeA;
      });
      const lastInsp = sortedInspections[0];

      points.push({
        id: `plant-${plant.id}`,
        pointType: 'PLANT',
        plantId: plant.id,
        plantName: plant.name || 'โรงไฟฟ้าไม่ระบุชื่อ',
        plantType: plant.type || 'Solar (โซลาร์เซลล์)',
        capacity: plant.capacity || 0,
        location: plant.location || plant.province || 'ไม่ระบุที่อยู่',
        province: plant.province || 'ไม่ระบุจังหวัด',
        region: plant.region || 'กฟภ.',
        lat: parsedGps.lat,
        lng: parsedGps.lng,
        isExactGps: parsedGps.isExactGps,
        gpsSource: parsedGps.source,
        category,
        categoryLabel,
        activeRequestId: activeReq?.id,
        activeInspectionId: activeInsp?.id,
        preferredDate: activeReq?.requestedDate || (activeReq as any)?.preferredDate,
        vendorName: activeReq?.vendorName || plant.contactPerson || (plant.coordinators && plant.coordinators[0]?.name),
        inspectorName: activeReq?.inspectorName || activeInsp?.inspectorName || lastInsp?.inspectorName,
        inspectorId: activeReq?.inspectorId || activeInsp?.inspectorId || lastInsp?.inspectorId,
        lastInspectionDate: lastInsp?.inspectionDate || lastInsp?.submittedAt || lastInsp?.approvedAt || lastInsp?.createdAt,
        historyCount: plantInspections.length,
        historyList: sortedInspections,
        notes: activeReq?.details || activeReq?.notes || plant.notes,
        complaintsCount: plantComplaints.length,
        complaintsList: plantComplaints,
        rawPlant: plant,
        rawRequest: activeReq,
        rawInspection: activeInsp || lastInsp
      });
    });

    // 2. Process Inspection Requests (pointType: 'REQUEST')
    // Role visibility rule from user:
    // - หมุดพิกัดคำร้องขอตรวจจะแสดงเฉพาะสถานะ inspector และ manager เท่านั้น (รวม ADMIN ด้วย)
    const canSeeRequestPins = isInspector || isManager || isAdmin || !userRole;

    if (canSeeRequestPins) {
      // Align request pins with EquipmentInspection rules
      const visibleRequests = requests.filter((req) => {
        // Filter by inspector province / office if inspector
        if (isInspector && userResponsibleProvince) {
          const plant = plants.find((p) => p.id === req.plantId);
          if (plant && plant.province && plant.province !== userResponsibleProvince) {
            return false;
          }
        }
        return true;
      });

      // Map out all approved & active inspections across plants to ensure each is paired accurately
      const assignedInspectionIds = new Set<string>();

      visibleRequests.forEach((req, reqIndex) => {
        // Find matching plant for high precision coordinates & details
        const matchedPlant = plants.find(
          (p) => p.id === req.plantId || (req.plantName && p.name && p.name.trim().toLowerCase() === req.plantName.trim().toLowerCase())
        );

        let parsedGps: ParsedGpsLocation;
        if (matchedPlant) {
          const plantGps = parseFirebaseCoordinates(matchedPlant, matchedPlant.province, matchedPlant.region);
          // Small optical offset (+0.00045) to ensure request marker and plant marker sit side-by-side without completely overlapping
          parsedGps = {
            lat: plantGps.lat + 0.00045,
            lng: plantGps.lng + 0.00045,
            isExactGps: plantGps.isExactGps,
            source: plantGps.source
          };
        } else {
          const reqProvince = req.office || (req as any).province || '';
          parsedGps = parseFirebaseCoordinates(req, reqProvince, req.region);
        }

        // 1. Check inspections strictly linked to this specific request ID first
        const directInspections = inspections.filter((i) => 
          i.requestId === req.id || 
          (req as any).inspectionId === i.id || 
          (req as any).inspectionResultId === i.id
        );
        let directActiveInsp = directInspections.find((i) => i.status === 'DRAFT' || i.status === 'SUBMITTED');
        let directApprovedInsp = directInspections.find((i) => i.status === 'APPROVED');

        // 2. All plant-related inspections for history and unassigned pairing
        const plantInspections = inspections.filter((i) => 
          (req.plantId && i.plantId === req.plantId) || 
          (req.plantName && i.plantName && req.plantName.trim().toLowerCase() === i.plantName.trim().toLowerCase())
        );

        // If no direct approved inspection was linked by ID, but the plant has approved inspections:
        if (!directApprovedInsp) {
          const unassignedApproved = plantInspections.find(
            (i) => i.status === 'APPROVED' && !assignedInspectionIds.has(i.id) && (!i.requestId || i.requestId === req.id)
          );

          const isReqMarkedCompleted = 
            req.status?.toUpperCase() === 'COMPLETED' || 
            req.status?.toUpperCase() === 'APPROVED' || 
            req.status?.toUpperCase() === 'PASSED' || 
            req.status?.toUpperCase() === 'DONE';

          // If this request is marked completed OR if this is the first/completed request in the pair
          if (unassignedApproved && (isReqMarkedCompleted || reqIndex === 0 || visibleRequests.filter(r => r.plantId === req.plantId).length === 1)) {
            directApprovedInsp = unassignedApproved;
            assignedInspectionIds.add(unassignedApproved.id);
          }
        }

        const isReqCompleted = 
          req.status?.toUpperCase() === 'COMPLETED' || 
          req.status?.toUpperCase() === 'APPROVED' || 
          req.status?.toUpperCase() === 'PASSED' || 
          req.status?.toUpperCase() === 'DONE' ||
          !!directApprovedInsp;

        const isReqInProgress = 
          !isReqCompleted && (
            req.status?.toUpperCase() === 'ACCEPTED' || 
            req.status?.toUpperCase() === 'IN_PROGRESS' || 
            req.status?.toUpperCase() === 'AWAITING_APPROVAL' || 
            req.status?.toUpperCase() === 'SUBMITTED' || 
            directActiveInsp?.status === 'SUBMITTED' ||
            directActiveInsp?.status === 'DRAFT'
          );

        let category: 'COMPLETED' | 'IN_PROGRESS' | 'PENDING' | 'HAS_HISTORY' = 'PENDING';
        let categoryLabel = 'คำร้องรอดำเนินการ';

        if (isReqCompleted) {
          category = 'COMPLETED';
          categoryLabel = 'คำร้องตรวจเสร็จแล้ว';
        } else if (isReqInProgress) {
          category = 'IN_PROGRESS';
          categoryLabel = req.status === 'ACCEPTED' || (req.status as any) === 'IN_PROGRESS' ? 'คำร้องกำลังดำเนินการ' : 'คำร้องรออนุมัติผลตรวจ';
        } else {
          category = 'PENDING';
          categoryLabel = 'คำร้องรอดำเนินการ';
        }

        const effectiveRequestStatus = isReqCompleted
          ? 'COMPLETED' 
          : isReqInProgress ? (req.status === 'ACCEPTED' ? 'ACCEPTED' : 'AWAITING_APPROVAL') : (req.status || 'PENDING');

        const hasHistoryRecord = isReqCompleted;

        points.push({
          id: `req-${req.id}`,
          pointType: 'REQUEST',
          requestCode: req.id,
          requestStatus: effectiveRequestStatus,
          plantId: req.plantId || matchedPlant?.id || req.id,
          plantName: req.plantName || matchedPlant?.name || 'คำร้องขอตรวจสอบ กฟภ.',
          plantType: matchedPlant?.type || 'พลังงานหมุนเวียน (VSPP/SPP)',
          capacity: matchedPlant?.capacity || 0,
          location: req.office || matchedPlant?.location || 'สำนักงาน กฟภ.',
          province: matchedPlant?.province || req.office || 'ไม่ระบุจังหวัด',
          region: req.region || matchedPlant?.region || 'กฟภ.',
          lat: parsedGps.lat,
          lng: parsedGps.lng,
          isExactGps: parsedGps.isExactGps,
          gpsSource: parsedGps.source,
          category,
          categoryLabel,
          activeRequestId: req.id,
          activeInspectionId: directActiveInsp?.id,
          preferredDate: req.requestedDate || (req as any)?.preferredDate,
          vendorName: req.vendorName || matchedPlant?.contactPerson,
          inspectorName: req.inspectorName || directActiveInsp?.inspectorName,
          inspectorId: req.inspectorId || directActiveInsp?.inspectorId,
          historyCount: hasHistoryRecord ? 1 : 0,
          historyList: directInspections.length > 0 ? directInspections : plantInspections,
          notes: req.details || req.notes,
          complaintsCount: 0,
          complaintsList: [],
          rawPlant: matchedPlant,
          rawRequest: req,
          rawInspection: directActiveInsp
        });
      });
    }

    return points;
  }, [
    plants, 
    requests, 
    inspections, 
    complaints, 
    userRole, 
    userProfile?.peaOffice, 
    userProfile?.region, 
    userProfile?.employeeId, 
    userProfile?.username, 
    userProfile?.email, 
    userProfile?.name, 
    userProfile?.phone
  ]);

  // Filtered Points
  const filteredPoints = useMemo(() => {
    return casePoints.filter((point) => {
      // 0. Layer Filter (All vs Power Plants vs Inspection Requests)
      if (layerFilter === 'PLANTS') {
        if (point.pointType !== 'PLANT') return false;
      } else if (layerFilter === 'REQUESTS') {
        if (point.pointType !== 'REQUEST') return false;
      } else {
        // layerFilter === 'ALL'
        // If it's a plant and that plant already has requests shown as individual request points,
        // do not duplicate the plant marker to avoid duplicate pins & counts for the same site
        if (point.pointType === 'PLANT') {
          const hasMatchingRequest = requests.some((r) => 
            r.plantId === point.plantId || 
            (r.plantName && point.plantName && (
              r.plantName.trim().toLowerCase() === point.plantName.trim().toLowerCase() ||
              r.plantName.trim().toLowerCase().includes(point.plantName.trim().toLowerCase()) ||
              point.plantName.trim().toLowerCase().includes(r.plantName.trim().toLowerCase())
            ))
          );
          if (hasMatchingRequest) return false;
        }
      }

      // 1. Category Filter
      if (selectedCategory !== 'ALL') {
        if (selectedCategory === 'HAS_HISTORY') {
          if (point.historyCount === 0) return false;
        } else if (point.category !== selectedCategory) {
          return false;
        }
      }

      // 2. Type Filter
      if (selectedType !== 'ALL' && !point.plantType.toLowerCase().includes(selectedType.toLowerCase())) {
        return false;
      }

      // 3. Province Filter
      if (selectedProvince !== 'ALL' && !point.province.includes(selectedProvince) && !point.location.includes(selectedProvince)) {
        return false;
      }

      // 4. Search Filter
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const matchName = point.plantName.toLowerCase().includes(q);
        const matchId = point.plantId.toLowerCase().includes(q) || (point.activeRequestId && point.activeRequestId.toLowerCase().includes(q));
        const matchLoc = point.location.toLowerCase().includes(q) || point.province.toLowerCase().includes(q);
        const matchInspector = point.inspectorName && point.inspectorName.toLowerCase().includes(q);
        const matchVendor = point.vendorName && point.vendorName.toLowerCase().includes(q);
        if (!matchName && !matchId && !matchLoc && !matchInspector && !matchVendor) {
          return false;
        }
      }

      return true;
    });
  }, [casePoints, layerFilter, selectedCategory, selectedType, selectedProvince, searchQuery, requests]);

  // Statistics (Accurately computed based on current layer filter and active cases)
  const stats = useMemo(() => {
    // Base points for current layer
    const activeBase = layerFilter === 'ALL'
      ? casePoints.filter((p) => {
          if (p.pointType === 'REQUEST') return true;
          // If plant has matching request points, do not count the plant itself to avoid double counting cases
          const hasLinkedRequest = requests.some((r) => 
            r.plantId === p.plantId || 
            (r.plantName && p.plantName && (
              r.plantName.trim().toLowerCase() === p.plantName.trim().toLowerCase() ||
              r.plantName.trim().toLowerCase().includes(p.plantName.trim().toLowerCase()) ||
              p.plantName.trim().toLowerCase().includes(r.plantName.trim().toLowerCase())
            ))
          );
          return !hasLinkedRequest;
        })
      : layerFilter === 'PLANTS'
      ? casePoints.filter((p) => p.pointType === 'PLANT')
      : casePoints.filter((p) => p.pointType === 'REQUEST');

    const total = activeBase.length;
    const plantsCount = casePoints.filter((p) => p.pointType === 'PLANT').length;
    const requestsCount = casePoints.filter((p) => p.pointType === 'REQUEST').length;

    const completed = activeBase.filter((p) => p.category === 'COMPLETED').length;
    const inProgress = activeBase.filter((p) => p.category === 'IN_PROGRESS').length;
    const pending = activeBase.filter((p) => p.category === 'PENDING').length;
    const hasHistory = activeBase.filter((p) => p.historyCount > 0).length;

    return { total, plantsCount, requestsCount, completed, inProgress, pending, hasHistory };
  }, [casePoints, layerFilter, requests]);

  // Dropdown list options
  const uniqueTypes = useMemo(() => {
    const types = new Set<string>();
    casePoints.forEach((p) => { if (p.plantType) types.add(p.plantType); });
    return Array.from(types);
  }, [casePoints]);

  const uniqueProvinces = useMemo(() => {
    const provs = new Set<string>();
    casePoints.forEach((p) => { 
      if (p.province && p.province !== 'ไม่ระบุจังหวัด') {
        provs.add(p.province.replace(/^จ\.|จังหวัด/g, '').trim()); 
      }
    });
    return Array.from(provs).sort();
  }, [casePoints]);

  // Custom HTML/SVG DivIcon generator with distinct visual shapes & colors for Plant vs Request
  const createCustomMarkerIcon = (point: MapCasePoint, isSelected: boolean) => {
    const scale = isSelected ? 'scale-125 z-50 ring-4 ring-white dark:ring-slate-900' : 'hover:scale-110';
    
    // Check if point is an Inspection Request (หมุดคำร้องขอตรวจ)
    if (point.pointType === 'REQUEST') {
      let bgGradient = '';
      let glowShadow = '';
      let pulseHtml = '';
      let iconSvg = '';

      switch (point.category) {
        case 'COMPLETED': // 🟢 คำร้องตรวจเสร็จแล้ว
          bgGradient = 'from-teal-500 to-emerald-600';
          glowShadow = 'rgba(16, 185, 129, 0.55)';
          iconSvg = `<svg class="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"></path></svg>`;
          break;

        case 'IN_PROGRESS': // 🔵 คำร้องอยู่ระหว่างดำเนินการ (มี animation กระพริบ)
          bgGradient = 'from-indigo-600 via-blue-600 to-cyan-500';
          glowShadow = 'rgba(99, 102, 241, 0.65)';
          pulseHtml = `<span class="absolute -inset-1.5 rounded-2xl bg-indigo-400 opacity-75 animate-ping"></span>`;
          iconSvg = `<svg class="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4"></path></svg>`;
          break;

        case 'PENDING': // 🟠 คำร้องรอดำเนินการ (สีส้มเพลิง-ชมพูคอรัล โดดเด่นเฉพาะสำหรับคำร้อง)
        default:
          bgGradient = 'from-amber-500 via-orange-500 to-rose-500';
          glowShadow = 'rgba(249, 115, 22, 0.6)';
          iconSvg = `<svg class="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"></path></svg>`;
          break;
      }

      // Diamond / Rounded Squircle Document Pin Design for Inspection Request
      const html = `
        <div class="relative flex flex-col items-center justify-center cursor-pointer transition-transform duration-200 ${scale}" style="width: 44px; height: 44px;">
          ${pulseHtml}
          <!-- Top Badge Indicator: REQ -->
          <div class="absolute -top-1.5 px-1.5 py-0.2 bg-slate-900 text-[8px] font-black text-amber-300 rounded-full border border-white shadow-md z-10 uppercase tracking-tighter">
            REQ
          </div>
          <!-- Request Squircle Box -->
          <div class="w-8 h-8 rounded-xl bg-gradient-to-tr ${bgGradient} border-2 border-white shadow-xl flex items-center justify-center relative transform rotate-45" style="box-shadow: 0 4px 14px ${glowShadow};">
            <div class="transform -rotate-45">
              ${iconSvg}
            </div>
          </div>
          <!-- Bottom needle pointer -->
          <div class="w-2 h-2 -mt-1 rotate-45 bg-gradient-to-tr ${bgGradient} border-r border-b border-white shadow-sm"></div>
        </div>
      `;

      return L.divIcon({
        html,
        className: 'custom-leaflet-marker marker-request',
        iconSize: [44, 44],
        iconAnchor: [22, 40],
        popupAnchor: [0, -40]
      });
    }

    // Otherwise: Power Plant Marker (หมุดพิกัดโรงไฟฟ้า) - Classic Drop-Pin with Zap/Factory Icon
    let bgGradient = '';
    let glowShadow = '';
    let iconSvg = '';
    let pulseHtml = '';

    switch (point.category) {
      case 'COMPLETED': // 🟢 ดำเนินการเสร็จแล้ว
        bgGradient = 'from-emerald-500 to-teal-600';
        glowShadow = 'rgba(16, 185, 129, 0.45)';
        iconSvg = `<svg class="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M5 13l4 4L19 7"></path></svg>`;
        break;

      case 'IN_PROGRESS': // 🔵 อยู่ระหว่างดำเนินการ (มี animation กระพริบ)
        bgGradient = 'from-sky-500 to-blue-600';
        glowShadow = 'rgba(14, 165, 233, 0.55)';
        pulseHtml = `<span class="absolute -inset-1.5 rounded-full bg-sky-400 opacity-75 animate-ping"></span>`;
        iconSvg = `<svg class="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M13 10V3L4 14h7v7l9-11h-7z"></path></svg>`;
        break;

      case 'PENDING': // 🟡 ยังไม่ได้ดำเนินการ
        bgGradient = 'from-amber-400 to-orange-500';
        glowShadow = 'rgba(245, 158, 11, 0.45)';
        iconSvg = `<svg class="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10" stroke-width="2"></circle><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 6v6l4 2"></path></svg>`;
        break;

      case 'HAS_HISTORY': // 🟣 มีประวัติเคยตรวจสอบแล้ว
        bgGradient = 'from-purple-600 to-[#74045F]';
        glowShadow = 'rgba(116, 4, 95, 0.45)';
        iconSvg = `<svg class="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"></path></svg>`;
        break;

      default:
        bgGradient = 'from-slate-500 to-slate-700';
        glowShadow = 'rgba(100, 116, 139, 0.3)';
        iconSvg = `<svg class="w-4 h-4 text-white" fill="currentColor" viewBox="0 0 20 20"><path d="M10 2a8 8 0 100 16 8 8 0 000-16z"></path></svg>`;
    }

    const complaintBadge = point.complaintsCount > 0 ? `
      <span class="absolute -top-1 -right-1 w-3.5 h-3.5 bg-rose-600 rounded-full border border-white flex items-center justify-center text-[8px] text-white font-black shadow-sm animate-pulse">!</span>
    ` : '';

    const exactBadge = point.isExactGps ? `
      <span class="absolute -bottom-1 -right-1 w-2.5 h-2.5 bg-emerald-400 rounded-full border border-white shadow-sm" title="พิกัด GPS จริงจาก Firebase"></span>
    ` : '';

    const html = `
      <div class="relative flex items-center justify-center cursor-pointer transition-transform duration-200 ${scale}" style="width: 38px; height: 38px;">
        ${pulseHtml}
        <div class="w-8 h-8 rounded-full bg-gradient-to-tr ${bgGradient} border-2 border-white shadow-lg flex items-center justify-center relative" style="box-shadow: 0 4px 14px ${glowShadow};">
          ${iconSvg}
          ${complaintBadge}
          ${exactBadge}
        </div>
        <div class="absolute -bottom-1 w-2 h-2 rotate-45 bg-gradient-to-tr ${bgGradient} border-r border-b border-white"></div>
      </div>
    `;

    return L.divIcon({
      html,
      className: 'custom-leaflet-marker marker-plant',
      iconSize: [38, 38],
      iconAnchor: [19, 36],
      popupAnchor: [0, -36]
    });
  };

  // Initialize Map
  useEffect(() => {
    if (!mapContainerRef.current || mapInstance.current) return;

    try {
      const map = L.map(mapContainerRef.current, {
        center: [13.736717, 100.523186],
        zoom: 6,
        zoomControl: false,
        zoomAnimation: false
      });

      mapInstance.current = map;

      // Layer Group for markers
      const markersLayer = L.layerGroup().addTo(map);
      markersLayerRef.current = markersLayer;

      // Zoom Control Top-Right
      L.control.zoom({ position: 'topright' }).addTo(map);

      // Tile Layer Setup - Use Google Maps & ESRI without API key watermark issues
      const tileConfig = getTileConfig(mapTileTheme);
      const tileLayer = L.tileLayer(tileConfig.url, tileConfig.options).addTo(map);

      (map as any)._currentTileLayer = tileLayer;

      // ResizeObserver
      const timer = setTimeout(() => {
        if (mapInstance.current) {
          mapInstance.current.invalidateSize();
        }
      }, 250);

      const resizeObserver = new ResizeObserver(() => {
        if (mapInstance.current) {
          mapInstance.current.invalidateSize();
        }
      });

      resizeObserver.observe(mapContainerRef.current);

      return () => {
        clearTimeout(timer);
        resizeObserver.disconnect();
        if (mapInstance.current) {
          mapInstance.current.off();
          mapInstance.current.remove();
          mapInstance.current = null;
        }
      };
    } catch (e) {
      console.error('Leaflet Map Init Error:', e);
    }
  }, []);

  // Helper to get tile configuration
  const getTileConfig = (theme: 'GOOGLE' | 'SATELLITE' | 'STREET' | 'DARK') => {
    switch (theme) {
      case 'GOOGLE':
        return {
          url: 'https://mt1.google.com/vt/lyrs=m&x={x}&y={y}&z={z}',
          options: {
            attribution: '&copy; Google Maps',
            maxZoom: 20,
            subdomains: ['mt0', 'mt1', 'mt2', 'mt3']
          }
        };
      case 'SATELLITE':
        return {
          url: 'https://mt1.google.com/vt/lyrs=y&x={x}&y={y}&z={z}',
          options: {
            attribution: '&copy; Google Maps',
            maxZoom: 20,
            subdomains: ['mt0', 'mt1', 'mt2', 'mt3']
          }
        };
      case 'STREET':
        return {
          url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Street_Map/MapServer/tile/{z}/{y}/{x}',
          options: {
            attribution: '&copy; Esri &copy; OpenStreetMap contributors',
            maxZoom: 19
          }
        };
      case 'DARK':
        return {
          url: 'https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Dark_Gray_Base/MapServer/tile/{z}/{y}/{x}',
          options: {
            attribution: '&copy; Esri, DeLorme, NAVTEQ',
            maxZoom: 16
          }
        };
      default:
        return {
          url: 'https://mt1.google.com/vt/lyrs=m&x={x}&y={y}&z={z}',
          options: {
            attribution: '&copy; Google Maps',
            maxZoom: 20,
            subdomains: ['mt0', 'mt1', 'mt2', 'mt3']
          }
        };
    }
  };

  // Update Tile Layer when Theme changes
  useEffect(() => {
    if (!mapInstance.current) return;
    const map = mapInstance.current;

    if ((map as any)._currentTileLayer) {
      map.removeLayer((map as any)._currentTileLayer);
    }

    const tileConfig = getTileConfig(mapTileTheme);
    const newTileLayer = L.tileLayer(tileConfig.url, tileConfig.options).addTo(map);

    (map as any)._currentTileLayer = newTileLayer;
  }, [mapTileTheme]);

  // Update Markers on Filtered Points Change
  useEffect(() => {
    if (!mapInstance.current || !markersLayerRef.current) return;

    // Fast check: compare point IDs, coordinates, statuses, and selected state
    const pointsSignature = filteredPoints.map(p => `${p.id}:${p.lat.toFixed(5)}:${p.lng.toFixed(5)}:${p.category}:${selectedCase?.id === p.id}`).join('|');
    const pointsChanged = prevPointsSignatureRef.current !== pointsSignature;

    if (pointsChanged) {
      const layer = markersLayerRef.current;
      layer.clearLayers();

      const bounds = L.latLngBounds([]);

      filteredPoints.forEach((point) => {
        const isSelected = selectedCase?.id === point.id;
        const icon = createCustomMarkerIcon(point, isSelected);

        const marker = L.marker([point.lat, point.lng], { icon });

        // Add clean tooltip
        marker.bindTooltip(`
          <div class="px-2 py-1 text-xs">
            <strong class="text-slate-900 block">${point.plantName}</strong>
            <span class="text-slate-600 text-[10px]">${point.categoryLabel} (${point.province})</span>
          </div>
        `, { direction: 'top', offset: [0, -32] });

        marker.on('click', () => {
          setSelectedCase(point);
          setIsEditingGps(false);
          setEditLat(point.lat.toFixed(6));
          setEditLng(point.lng.toFixed(6));
          if (mapInstance.current) {
            mapInstance.current.flyTo([point.lat, point.lng], 12, { duration: 0.8 });
          }
        });

        marker.addTo(layer);
        bounds.extend([point.lat, point.lng]);
      });

      prevPointsSignatureRef.current = pointsSignature;

      // Auto-fit bounds ONLY on initial load or explicit user filter changes (never on background data ticks)
      const currentFilterKey = `${selectedProvince}_${selectedCategory}_${selectedType}_${layerFilter}`;
      const shouldFitBounds = !hasFittedInitialBoundsRef.current || lastFilterKeyRef.current !== currentFilterKey;

      if (filteredPoints.length > 0 && !selectedCase && mapInstance.current && shouldFitBounds) {
        try {
          mapInstance.current.fitBounds(bounds, { padding: [50, 50], maxZoom: 12 });
          hasFittedInitialBoundsRef.current = true;
          lastFilterKeyRef.current = currentFilterKey;
        } catch (e) {
          // Safe fallback
        }
      }
    }
  }, [filteredPoints, selectedCase, selectedProvince, selectedCategory, selectedType, layerFilter]);

  // Locate User GPS
  const handleLocateMe = () => {
    if (!navigator.geolocation) {
      alert('อุปกรณ์ของคุณไม่รองรับการดึงพิกัด Geolocation');
      return;
    }

    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const lat = pos.coords.latitude;
        const lng = pos.coords.longitude;
        setUserLocation({ lat, lng });

        if (mapInstance.current) {
          mapInstance.current.flyTo([lat, lng], 13, { duration: 1 });

          if (userLocationMarker) {
            userLocationMarker.setLatLng([lat, lng]);
          } else {
            const userIcon = L.divIcon({
              html: `
                <div class="relative flex items-center justify-center" style="width: 28px; height: 28px;">
                  <span class="absolute -inset-2 rounded-full bg-blue-500 opacity-60 animate-ping"></span>
                  <div class="w-5 h-5 rounded-full bg-blue-600 border-2 border-white shadow-md"></div>
                </div>
              `,
              className: 'user-location-marker',
              iconSize: [28, 28],
              iconAnchor: [14, 14]
            });
            const m = L.marker([lat, lng], { icon: userIcon }).addTo(mapInstance.current);
            setUserLocationMarker(m);
          }
        }
      },
      (err) => {
        console.warn('Geolocation error:', err);
        alert('ไม่สามารถระบุพิกัดตำแหน่งของคุณได้ กรุณาอนุญาตการเข้าถึงตำแหน่งในเบราว์เซอร์');
      },
      { enableHighAccuracy: true, timeout: 6000 }
    );
  };

  // Reset View to Thailand
  const handleResetView = () => {
    if (mapInstance.current) {
      mapInstance.current.flyTo([13.736717, 100.523186], 6, { duration: 0.8 });
    }
    setSelectedCase(null);
    setIsEditingGps(false);
  };

  // Calculate distance from user to plant (in KM)
  const getDistanceFromUser = (lat: number, lng: number) => {
    if (!userLocation) return null;
    const R = 6371;
    const dLat = (lat - userLocation.lat) * (Math.PI / 180);
    const dLng = (lng - userLocation.lng) * (Math.PI / 180);
    const a =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(userLocation.lat * (Math.PI / 180)) *
        Math.cos(lat * (Math.PI / 180)) *
        Math.sin(dLng / 2) *
        Math.sin(dLng / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return (R * c).toFixed(1);
  };

  // Save new GPS coordinates directly to Firebase Firestore
  const handleSaveGpsToFirebase = async () => {
    if (!selectedCase) return;

    const parsedLat = parseFloat(editLat);
    const parsedLng = parseFloat(editLng);

    if (isNaN(parsedLat) || isNaN(parsedLng) || parsedLat < 5 || parsedLat > 21 || parsedLng < 96 || parsedLng > 107) {
      alert('กรุณาระบุพิกัด ละติจูด (5 - 21) และ ลองจิจูด (96 - 107) ให้ถูกต้องตามขอบเขตประเทศไทย');
      return;
    }

    setIsSavingGps(true);
    try {
      // 1. Update plant in powerPlants collection
      if (selectedCase.plantId) {
        const plantRef = doc(db, 'powerPlants', selectedCase.plantId);
        await setDoc(plantRef, {
          gps: {
            lat: parsedLat.toFixed(6),
            lng: parsedLng.toFixed(6)
          },
          lat: parsedLat,
          lng: parsedLng,
          updatedAt: serverTimestamp()
        }, { merge: true });
      }

      // 2. Also update request if applicable
      if (selectedCase.activeRequestId) {
        const reqRef = doc(db, 'inspectionRequests', selectedCase.activeRequestId);
        await updateDoc(reqRef, {
          gps: {
            lat: parsedLat.toFixed(6),
            lng: parsedLng.toFixed(6)
          },
          updatedAt: serverTimestamp()
        }).catch(() => {});
      }

      // Update current selected case state
      setSelectedCase(prev => prev ? {
        ...prev,
        lat: parsedLat,
        lng: parsedLng,
        isExactGps: true,
        gpsSource: 'FIREBASE_GPS'
      } : null);

      setIsEditingGps(false);
      setActionSuccessMsg(`อัปเดตพิกัด GPS (${parsedLat.toFixed(5)}, ${parsedLng.toFixed(5)}) บน Firebase สำเร็จแล้ว!`);
      setTimeout(() => setActionSuccessMsg(null), 4000);

      // Re-center map
      if (mapInstance.current) {
        mapInstance.current.flyTo([parsedLat, parsedLng], 13, { duration: 0.8 });
      }
    } catch (err) {
      console.error('Error updating GPS in Firestore:', err);
      handleFirestoreError(err, OperationType.UPDATE, `powerPlants/${selectedCase.plantId}`);
    } finally {
      setIsSavingGps(false);
    }
  };

  // Firebase Quick Action: Accept Case directly on Firestore
  const handleAcceptCase = async (casePoint: MapCasePoint) => {
    try {
      setIsActionLoading(true);
      const inspectorId = userProfile?.employeeId || userProfile?.username || 'INSP-001';
      const inspectorName = userProfile?.name || 'ผู้ตรวจสอบ กฟภ.';
      const nowIso = new Date().toISOString();

      let targetReqId = casePoint.activeRequestId;

      if (!targetReqId) {
        // Create request on the fly if needed
        const reqId = `REQ-${Date.now().toString().slice(-6)}`;
        targetReqId = reqId;
        const reqRef = doc(db, 'inspectionRequests', reqId);
        const newReqData: InspectionRequest = {
          id: reqId,
          plantId: casePoint.plantId,
          plantName: casePoint.plantName,
          vendorId: casePoint.vendorName || 'VENDOR-01',
          vendorName: casePoint.vendorName || casePoint.plantName,
          inspectorId,
          inspectorName,
          status: 'ACCEPTED',
          requestedDate: nowIso.split('T')[0],
          assignedAt: nowIso,
          createdAt: nowIso,
          details: 'รับงานตรวจสอบผ่านระบบ Interactive Case Map'
        };
        await setDoc(reqRef, newReqData);

        // Update local requests state & storage immediately
        setRequests(prev => [newReqData, ...prev.filter(r => r.id !== reqId)]);
        const allReqs = safeParseLocalStorage<InspectionRequest[]>('app_inspection_requests', []);
        safeSetLocalStorage('app_inspection_requests', [newReqData, ...allReqs.filter(r => r.id !== reqId)], true);
      } else {
        const reqRef = doc(db, 'inspectionRequests', targetReqId);
        const updatePayload = {
          status: 'ACCEPTED' as const,
          inspectorId,
          inspectorName,
          assignedAt: nowIso
        };
        await updateDoc(reqRef, updatePayload).catch(async () => {
          await setDoc(reqRef, updatePayload, { merge: true });
        });

        // Update local requests state & storage immediately
        setRequests(prev => prev.map(r => r.id === targetReqId ? { ...r, ...updatePayload } : r));
        const allReqs = safeParseLocalStorage<InspectionRequest[]>('app_inspection_requests', []);
        safeSetLocalStorage('app_inspection_requests', allReqs.map(r => r.id === targetReqId ? { ...r, ...updatePayload } : r), true);
      }

      // Optimistically update selectedCase state to IN_PROGRESS
      setSelectedCase(prev => prev ? {
        ...prev,
        category: 'IN_PROGRESS',
        categoryLabel: prev.pointType === 'REQUEST' ? 'คำร้องกำลังดำเนินการ' : 'กำลังดำเนินการ',
        requestStatus: 'ACCEPTED',
        inspectorId,
        inspectorName,
        activeRequestId: targetReqId
      } : null);

      setActionSuccessMsg('รับงานตรวจเคสนี้สำเร็จ! สถานะเปลี่ยนเป็น "กำลังดำเนินการ" เรียบร้อยแล้ว');
      setTimeout(() => setActionSuccessMsg(null), 4000);
    } catch (err) {
      console.error("handleAcceptCase error:", err);
      handleFirestoreError(err, OperationType.UPDATE, `inspectionRequests/${casePoint.activeRequestId || 'new'}`);
    } finally {
      setIsActionLoading(false);
    }
  };

  // Seed sample data to Firebase with instant sync
  const handleSeedFirebaseData = async () => {
    setIsSeeding(true);
    try {
      const ok = await seedSampleData();
      if (ok) {
        setActionSuccessMsg('เพิ่มข้อมูลโรงไฟฟ้าและเคสตรวจสอบลง Firebase สำเร็จแล้ว!');
        setTimeout(() => setActionSuccessMsg(null), 5000);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setIsSeeding(false);
    }
  };

  return (
    <div className={`space-y-6 animate-fade-in ${isFullscreen ? 'fixed inset-0 z-[999] bg-white dark:bg-[#030712] p-4 overflow-y-auto' : ''}`}>
      
      {/* Header & Main Status Cards */}
      <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
        <div>
          <h2 className="text-2xl sm:text-3xl font-black text-slate-900 dark:text-white tracking-tight flex items-center gap-3">
            <span>แผนที่สถานะเคสตรวจสอบ</span>
          </h2>
          <div className="flex items-center gap-3 mt-1.5 flex-wrap">
            <span className="text-xs text-slate-500 font-medium">
              ซิงค์ตรงกับ Firebase Firestore
            </span>
            <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-indigo-50 dark:bg-indigo-500/10 border border-indigo-200 dark:border-indigo-500/20 text-[11px] font-bold text-indigo-700 dark:text-indigo-300">
              โรงไฟฟ้า {plants.length} แห่ง • คำร้อง {requests.length} เรื่อง • ผลตรวจ {inspections.length} เรื่อง
            </span>
          </div>
        </div>

        {/* Live Firebase Sync Badge & Controls */}
        <div className="flex items-center gap-2 flex-wrap">
          {/* Firestore Connection Indicator */}
          <div className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-50 dark:bg-white/5 border border-slate-200 dark:border-white/10 rounded-2xl text-[11px] font-bold">
            <span className={`w-2 h-2 rounded-full ${
              syncStatus === 'connected' ? 'bg-emerald-500 animate-pulse' : syncStatus === 'syncing' ? 'bg-amber-500 animate-spin' : 'bg-rose-500'
            }`}></span>
            <span className="text-slate-600 dark:text-slate-300">
              {syncStatus === 'connected' ? 'Firebase Firestore Live' : syncStatus === 'syncing' ? 'กำลังซิงค์...' : 'ออฟไลน์'}
            </span>
          </div>

          {/* Seed Sample Firebase Data Button */}
          {plants.length < 5 && (
            <button
              onClick={handleSeedFirebaseData}
              disabled={isSeeding}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-indigo-50 hover:bg-indigo-100 dark:bg-indigo-500/10 dark:hover:bg-indigo-500/20 text-indigo-600 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-500/30 rounded-2xl text-xs font-bold transition-all active:scale-95 disabled:opacity-50"
              title="สร้างข้อมูลโรงไฟฟ้าตัวอย่างใน Firestore"
            >
              <Database size={13} className={isSeeding ? "animate-spin" : ""} />
              <span>{isSeeding ? "กำลังบันทึก..." : "โหลดข้อมูลตัวอย่าง"}</span>
            </button>
          )}

          {/* Map Tile Switcher */}
          <div className="flex items-center p-1 bg-slate-100 dark:bg-white/5 border border-slate-200 dark:border-white/10 rounded-2xl">
            <button
              onClick={() => setMapTileTheme('GOOGLE')}
              className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all ${
                mapTileTheme === 'GOOGLE'
                  ? 'bg-white dark:bg-slate-800 text-slate-900 dark:text-white shadow-sm'
                  : 'text-slate-500 hover:text-slate-700 dark:hover:text-slate-300'
              }`}
            >
              แผนที่ถนน
            </button>
            <button
              onClick={() => setMapTileTheme('SATELLITE')}
              className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all ${
                mapTileTheme === 'SATELLITE'
                  ? 'bg-white dark:bg-slate-800 text-slate-900 dark:text-white shadow-sm'
                  : 'text-slate-500 hover:text-slate-700 dark:hover:text-slate-300'
              }`}
            >
              ดาวเทียม
            </button>
            <button
              onClick={() => setMapTileTheme('STREET')}
              className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all ${
                mapTileTheme === 'STREET'
                  ? 'bg-white dark:bg-slate-800 text-slate-900 dark:text-white shadow-sm'
                  : 'text-slate-500 hover:text-slate-700 dark:hover:text-slate-300'
              }`}
            >
              มาตรฐาน
            </button>
            <button
              onClick={() => setMapTileTheme('DARK')}
              className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all ${
                mapTileTheme === 'DARK'
                  ? 'bg-white dark:bg-slate-800 text-slate-900 dark:text-white shadow-sm'
                  : 'text-slate-500 hover:text-slate-700 dark:hover:text-slate-300'
              }`}
            >
              โหมดมืด
            </button>
          </div>

          <button
            onClick={handleLocateMe}
            className="flex items-center gap-1.5 px-3.5 py-2 bg-white dark:bg-white/5 border border-slate-200 dark:border-white/10 hover:border-blue-500 text-slate-700 dark:text-slate-200 rounded-2xl text-xs font-bold shadow-sm transition-all active:scale-95"
            title="ระบุตำแหน่งของฉัน"
          >
            <Compass size={14} className="text-blue-500" />
            <span>ตำแหน่งฉัน</span>
          </button>

          <button
            onClick={handleResetView}
            className="flex items-center gap-1.5 px-3.5 py-2 bg-white dark:bg-white/5 border border-slate-200 dark:border-white/10 hover:border-indigo-500 text-slate-700 dark:text-slate-200 rounded-2xl text-xs font-bold shadow-sm transition-all active:scale-95"
            title="รีเซ็ตมุมมองประเทศไทย"
          >
            <RefreshCw size={14} className={`text-indigo-500 ${isSyncing ? 'animate-spin' : ''}`} />
            <span>รีเซ็ต</span>
          </button>

          <button
            onClick={() => setIsFullscreen(!isFullscreen)}
            className="p-2 bg-white dark:bg-white/5 border border-slate-200 dark:border-white/10 text-slate-700 dark:text-slate-200 rounded-2xl text-xs font-bold shadow-sm transition-all active:scale-95"
            title={isFullscreen ? "ย่อหน้าต่าง" : "ขยายเต็มจอ"}
          >
            {isFullscreen ? <Minimize2 size={16} /> : <Maximize2 size={16} />}
          </button>
        </div>
      </div>

      {/* Success Notification Alert */}
      <AnimatePresence>
        {actionSuccessMsg && (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="p-4 rounded-2xl bg-emerald-50 dark:bg-emerald-500/10 border border-emerald-200 dark:border-emerald-500/20 text-emerald-800 dark:text-emerald-300 flex items-center justify-between shadow-sm"
          >
            <div className="flex items-center gap-2 text-xs font-bold">
              <CheckCircle2 size={16} className="text-emerald-600 dark:text-emerald-400 flex-shrink-0" />
              <span>{actionSuccessMsg}</span>
            </div>
            <button onClick={() => setActionSuccessMsg(null)} className="text-emerald-600 hover:text-emerald-800">
              <X size={14} />
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* 4-Tier Interactive Status Filter Buttons */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3 sm:gap-3.5 lg:gap-4 pb-2">
        {/* All Cases */}
        <button
          onClick={() => setSelectedCategory('ALL')}
          className={`p-4 sm:p-4.5 rounded-2xl border transition-all duration-200 text-left flex flex-col justify-between min-h-[96px] sm:min-h-[102px] group cursor-pointer active:scale-[0.98] ${
            selectedCategory === 'ALL'
              ? 'bg-slate-900 text-white dark:bg-white dark:text-slate-900 border-slate-900 dark:border-white shadow-md shadow-slate-900/10'
              : 'bg-white dark:bg-slate-900/80 border-slate-200/80 dark:border-white/10 text-slate-700 dark:text-slate-300 hover:border-slate-300 dark:hover:border-white/20 hover:shadow-sm'
          }`}
        >
          <div className="flex items-center justify-between w-full gap-2">
            <span className={`text-[11px] font-bold tracking-tight truncate ${selectedCategory === 'ALL' ? 'text-white/80 dark:text-slate-700' : 'text-slate-500 dark:text-slate-400'}`}>
              ทั้งหมด
            </span>
            <div className={`w-8 h-8 rounded-xl flex items-center justify-center shrink-0 transition-colors ${
              selectedCategory === 'ALL' ? 'bg-white/20 dark:bg-slate-900/15 text-white dark:text-slate-900' : 'bg-slate-100 dark:bg-white/10 text-slate-600 dark:text-slate-300'
            }`}>
              <Layers size={16} />
            </div>
          </div>
          <div className="flex items-baseline gap-1.5">
            <span className={`text-xl sm:text-2xl font-black tracking-tight leading-none ${selectedCategory === 'ALL' ? 'text-white dark:text-slate-900' : 'text-slate-900 dark:text-white'}`}>
              {stats.total}
            </span>
            <span className={`text-xs font-semibold ${selectedCategory === 'ALL' ? 'text-white/70 dark:text-slate-600' : 'text-slate-400 dark:text-slate-500'}`}>
              {isInspector || layerFilter === 'REQUESTS' ? 'เคส' : 'แห่ง'}
            </span>
          </div>
        </button>

        {/* 🟢 ดำเนินการเสร็จแล้ว */}
        <button
          onClick={() => setSelectedCategory('COMPLETED')}
          className={`p-4 sm:p-4.5 rounded-2xl border transition-all duration-200 text-left flex flex-col justify-between min-h-[96px] sm:min-h-[102px] group cursor-pointer active:scale-[0.98] ${
            selectedCategory === 'COMPLETED'
              ? 'bg-emerald-600 text-white border-emerald-600 shadow-md shadow-emerald-600/20'
              : 'bg-white dark:bg-slate-900/80 border-slate-200/80 dark:border-white/10 text-slate-700 dark:text-slate-300 hover:border-emerald-400/60 dark:hover:border-emerald-500/40 hover:shadow-sm'
          }`}
        >
          <div className="flex items-center justify-between w-full gap-2">
            <span className={`text-[11px] font-bold tracking-tight truncate ${selectedCategory === 'COMPLETED' ? 'text-white/80' : 'text-slate-500 dark:text-slate-400'}`}>
              ดำเนินการเสร็จแล้ว
            </span>
            <div className={`w-8 h-8 rounded-xl flex items-center justify-center shrink-0 transition-colors ${
              selectedCategory === 'COMPLETED' ? 'bg-white/20 text-white' : 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400'
            }`}>
              <CheckCircle2 size={16} />
            </div>
          </div>
          <div className="flex items-baseline gap-1.5">
            <span className={`text-xl sm:text-2xl font-black tracking-tight leading-none ${selectedCategory === 'COMPLETED' ? 'text-white' : 'text-emerald-600 dark:text-emerald-400'}`}>
              {stats.completed}
            </span>
            <span className={`text-xs font-semibold ${selectedCategory === 'COMPLETED' ? 'text-white/70' : 'text-slate-400 dark:text-slate-500'}`}>
              {isInspector || layerFilter === 'REQUESTS' ? 'เคส' : 'แห่ง'}
            </span>
          </div>
        </button>

        {/* 🔵 อยู่ระหว่างดำเนินการ */}
        <button
          onClick={() => setSelectedCategory('IN_PROGRESS')}
          className={`p-4 sm:p-4.5 rounded-2xl border transition-all duration-200 text-left flex flex-col justify-between min-h-[96px] sm:min-h-[102px] group cursor-pointer active:scale-[0.98] ${
            selectedCategory === 'IN_PROGRESS'
              ? 'bg-sky-600 text-white border-sky-600 shadow-md shadow-sky-600/20'
              : 'bg-white dark:bg-slate-900/80 border-slate-200/80 dark:border-white/10 text-slate-700 dark:text-slate-300 hover:border-sky-400/60 dark:hover:border-sky-500/40 hover:shadow-sm'
          }`}
        >
          <div className="flex items-center justify-between w-full gap-2">
            <div className="flex items-center gap-1.5 min-w-0">
              <span className={`text-[11px] font-bold tracking-tight truncate ${selectedCategory === 'IN_PROGRESS' ? 'text-white/80' : 'text-slate-500 dark:text-slate-400'}`}>
                กำลังดำเนินการ
              </span>
              <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${selectedCategory === 'IN_PROGRESS' ? 'bg-white animate-ping' : 'bg-sky-500 animate-pulse'}`}></span>
            </div>
            <div className={`w-8 h-8 rounded-xl flex items-center justify-center shrink-0 transition-colors ${
              selectedCategory === 'IN_PROGRESS' ? 'bg-white/20 text-white' : 'bg-sky-500/10 text-sky-600 dark:text-sky-400'
            }`}>
              <Activity size={16} />
            </div>
          </div>
          <div className="flex items-baseline gap-1.5">
            <span className={`text-xl sm:text-2xl font-black tracking-tight leading-none ${selectedCategory === 'IN_PROGRESS' ? 'text-white' : 'text-sky-600 dark:text-sky-400'}`}>
              {stats.inProgress}
            </span>
            <span className={`text-xs font-semibold ${selectedCategory === 'IN_PROGRESS' ? 'text-white/70' : 'text-slate-400 dark:text-slate-500'}`}>
              {isInspector || layerFilter === 'REQUESTS' ? 'เคส' : 'แห่ง'}
            </span>
          </div>
        </button>

        {/* 🟡 ยังไม่ได้ดำเนินการ */}
        <button
          onClick={() => setSelectedCategory('PENDING')}
          className={`p-4 sm:p-4.5 rounded-2xl border transition-all duration-200 text-left flex flex-col justify-between min-h-[96px] sm:min-h-[102px] group cursor-pointer active:scale-[0.98] ${
            selectedCategory === 'PENDING'
              ? 'bg-amber-500 text-white border-amber-500 shadow-md shadow-amber-500/20'
              : 'bg-white dark:bg-slate-900/80 border-slate-200/80 dark:border-white/10 text-slate-700 dark:text-slate-300 hover:border-amber-400/60 dark:hover:border-amber-500/40 hover:shadow-sm'
          }`}
        >
          <div className="flex items-center justify-between w-full gap-2">
            <span className={`text-[11px] font-bold tracking-tight truncate ${selectedCategory === 'PENDING' ? 'text-white/80' : 'text-slate-500 dark:text-slate-400'}`}>
              ยังไม่ได้ดำเนินการ
            </span>
            <div className={`w-8 h-8 rounded-xl flex items-center justify-center shrink-0 transition-colors ${
              selectedCategory === 'PENDING' ? 'bg-white/20 text-white' : 'bg-amber-500/10 text-amber-500'
            }`}>
              <Clock size={16} />
            </div>
          </div>
          <div className="flex items-baseline gap-1.5">
            <span className={`text-xl sm:text-2xl font-black tracking-tight leading-none ${selectedCategory === 'PENDING' ? 'text-white' : 'text-amber-500 dark:text-amber-400'}`}>
              {stats.pending}
            </span>
            <span className={`text-xs font-semibold ${selectedCategory === 'PENDING' ? 'text-white/70' : 'text-slate-400 dark:text-slate-500'}`}>
              {isInspector || layerFilter === 'REQUESTS' ? 'เคส' : 'แห่ง'}
            </span>
          </div>
        </button>

        {/* 🟣 มีประวัติเคยตรวจสอบแล้ว */}
        <button
          onClick={() => setSelectedCategory('HAS_HISTORY')}
          className={`p-4 sm:p-4.5 rounded-2xl border transition-all duration-200 text-left flex flex-col justify-between min-h-[96px] sm:min-h-[102px] group cursor-pointer active:scale-[0.98] col-span-2 sm:col-span-1 ${
            selectedCategory === 'HAS_HISTORY'
              ? 'bg-[#74045F] text-white border-[#74045F] shadow-md shadow-[#74045F]/20'
              : 'bg-white dark:bg-slate-900/80 border-slate-200/80 dark:border-white/10 text-slate-700 dark:text-slate-300 hover:border-[#74045F]/60 hover:shadow-sm'
          }`}
        >
          <div className="flex items-center justify-between w-full gap-2">
            <span className={`text-[11px] font-bold tracking-tight truncate ${selectedCategory === 'HAS_HISTORY' ? 'text-white/80' : 'text-slate-500 dark:text-slate-400'}`}>
              เคยตรวจสอบแล้ว
            </span>
            <div className={`w-8 h-8 rounded-xl flex items-center justify-center shrink-0 transition-colors ${
              selectedCategory === 'HAS_HISTORY' ? 'bg-white/20 text-white' : 'bg-purple-500/10 text-[#74045F] dark:text-purple-400'
            }`}>
              <History size={16} />
            </div>
          </div>
          <div className="flex items-baseline gap-1.5">
            <span className={`text-xl sm:text-2xl font-black tracking-tight leading-none ${selectedCategory === 'HAS_HISTORY' ? 'text-white' : 'text-[#74045F] dark:text-purple-400'}`}>
              {stats.hasHistory}
            </span>
            <span className={`text-xs font-semibold ${selectedCategory === 'HAS_HISTORY' ? 'text-white/70' : 'text-slate-400 dark:text-slate-500'}`}>
              {isInspector || layerFilter === 'REQUESTS' ? 'เคส' : 'แห่ง'}
            </span>
          </div>
        </button>
      </div>

      {/* Layer Selector & Search / Filter Bar */}
      <div className="space-y-3">
        {/* Layer Switcher: All vs Power Plants vs Inspection Requests */}
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div className="flex items-center p-1 bg-slate-100 dark:bg-white/5 border border-slate-200/80 dark:border-white/10 rounded-2xl">
            {stats.plantsCount > 0 && stats.requestsCount > 0 && (
              <button
                onClick={() => setLayerFilter('ALL')}
                className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                  layerFilter === 'ALL'
                    ? 'bg-white dark:bg-slate-800 text-indigo-600 dark:text-indigo-400 shadow-sm'
                    : 'text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'
                }`}
              >
                <Globe size={13} />
                <span>แสดงทั้งหมด ({stats.total})</span>
              </button>
            )}

            {stats.plantsCount > 0 && (
              <button
                onClick={() => setLayerFilter('PLANTS')}
                className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                  layerFilter === 'PLANTS' || stats.requestsCount === 0
                    ? 'bg-white dark:bg-slate-800 text-indigo-600 dark:text-indigo-400 shadow-sm'
                    : 'text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'
                }`}
              >
                <Zap size={13} className="text-amber-500" />
                <span>⚡ หมุดโรงไฟฟ้า ({stats.plantsCount})</span>
              </button>
            )}

            {stats.requestsCount > 0 && (
              <button
                onClick={() => setLayerFilter('REQUESTS')}
                className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                  layerFilter === 'REQUESTS' || stats.plantsCount === 0
                    ? 'bg-white dark:bg-slate-800 text-orange-600 dark:text-orange-400 shadow-sm'
                    : 'text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'
                }`}
              >
                <FileText size={13} className="text-orange-500" />
                <span>📋 หมุดคำร้องขอตรวจ ({stats.requestsCount})</span>
              </button>
            )}
          </div>

          <div className="text-xs text-slate-500 font-medium">
            กำลังแสดง <strong className="text-slate-800 dark:text-white font-bold">{filteredPoints.length}</strong> จุดบนแผนที่
          </div>
        </div>

        {/* Search and Secondary Filter Bar */}
        <div className="bg-slate-50 dark:bg-white/5 p-4 rounded-3xl border border-slate-200/70 dark:border-white/10 flex flex-col md:flex-row gap-3 items-center justify-between">
          {/* Search input */}
          <div className="relative w-full md:w-80">
            <Search size={16} className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="ค้นหาชื่อโรงไฟฟ้า, รหัสเคส, ผู้ตรวจ..."
              className="w-full pl-11 pr-4 py-2.5 bg-white dark:bg-slate-800 border border-slate-200 dark:border-white/10 rounded-2xl text-xs font-bold text-slate-800 dark:text-white placeholder:text-slate-400 focus:outline-none focus:border-indigo-500 transition-all shadow-sm"
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery('')}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
              >
                <X size={14} />
              </button>
            )}
          </div>

          {/* Dropdown Filters */}
          <div className="flex items-center gap-2 w-full md:w-auto overflow-x-auto pb-1 md:pb-0">
            {/* Type Filter */}
            <select
              value={selectedType}
              onChange={(e) => setSelectedType(e.target.value)}
              aria-label="ประเภทพลังงาน"
              className="px-3.5 py-2.5 bg-white dark:bg-slate-800 border border-slate-200 dark:border-white/10 rounded-2xl text-xs font-bold text-slate-700 dark:text-slate-200 focus:outline-none focus:border-indigo-500 shadow-sm cursor-pointer"
            >
              <option value="ALL">⚡ ทุกประเภทพลังงาน</option>
              {uniqueTypes.map((type) => (
                <option key={type} value={type}>
                  {type}
                </option>
              ))}
            </select>

            {/* Province Filter */}
            <select
              value={selectedProvince}
              onChange={(e) => setSelectedProvince(e.target.value)}
              aria-label="ทุกจังหวัด"
              className="px-3.5 py-2.5 bg-white dark:bg-slate-800 border border-slate-200 dark:border-white/10 rounded-2xl text-xs font-bold text-slate-700 dark:text-slate-200 focus:outline-none focus:border-indigo-500 shadow-sm cursor-pointer"
            >
              <option value="ALL">📍 ทุกจังหวัด</option>
              {uniqueProvinces.map((prov) => (
                <option key={prov} value={prov}>
                  {prov}
                </option>
              ))}
            </select>

            {/* Reset Filters button */}
            {(selectedCategory !== 'ALL' || layerFilter !== 'ALL' || selectedType !== 'ALL' || selectedProvince !== 'ALL' || searchQuery) && (
              <button
                onClick={() => {
                  setSelectedCategory('ALL');
                  setLayerFilter('ALL');
                  setSelectedType('ALL');
                  setSelectedProvince('ALL');
                  setSearchQuery('');
                }}
                className="px-3 py-2 text-rose-500 hover:bg-rose-500/10 rounded-xl text-xs font-bold transition-all whitespace-nowrap cursor-pointer"
              >
                ล้างตัวกรอง
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Map Display & Floating Details Panel Container */}
      <div className="relative w-full rounded-3xl overflow-hidden border border-slate-200 dark:border-white/10 shadow-xl bg-slate-100 dark:bg-slate-900" style={{ height: isFullscreen ? 'calc(100vh - 280px)' : '620px' }}>
        
        {/* The Leaflet Canvas Container */}
        <div ref={mapContainerRef} className="w-full h-full z-0" />

        {/* Legend Overlay at Bottom-Left */}
        <div className="absolute bottom-4 left-4 z-10 bg-white/95 dark:bg-slate-900/95 backdrop-blur-md p-3.5 rounded-2xl border border-slate-200 dark:border-white/10 shadow-xl text-[11px] max-w-[310px]">
          <div className="font-black text-slate-800 dark:text-white uppercase tracking-wider mb-2.5 flex items-center justify-between">
            <div className="flex items-center gap-1.5">
              <MapPin size={13} className="text-indigo-600 dark:text-indigo-400" />
              <span>คำอธิบายสัญลักษณ์หมุด (Legend)</span>
            </div>
          </div>

          <div className="space-y-2.5">
            {/* Plant Markers Section */}
            {stats.plantsCount > 0 && (
              <div className="p-2 rounded-xl bg-slate-50 dark:bg-white/5 border border-slate-100 dark:border-white/5 space-y-1.5">
                <div className="text-[10px] font-black text-slate-700 dark:text-slate-200 uppercase tracking-wider flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full bg-indigo-500"></span>
                  <span>⚡ หมุดโรงไฟฟ้า (Power Plants)</span>
                </div>
                <div className="grid grid-cols-2 gap-1 text-[10px] text-slate-600 dark:text-slate-300">
                  <div className="flex items-center gap-1.5">
                    <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 border border-white flex-shrink-0"></span>
                    <span>ตรวจเสร็จแล้ว</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <span className="w-2.5 h-2.5 rounded-full bg-sky-500 border border-white flex-shrink-0"></span>
                    <span>กำลังตรวจ</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <span className="w-2.5 h-2.5 rounded-full bg-amber-400 border border-white flex-shrink-0"></span>
                    <span>ยังไม่ตรวจ</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <span className="w-2.5 h-2.5 rounded-full bg-[#74045F] border border-white flex-shrink-0"></span>
                    <span>มีประวัติเดิม</span>
                  </div>
                </div>
              </div>
            )}

            {/* Request Markers Section */}
            {stats.requestsCount > 0 && (
              <div className="p-2 rounded-xl bg-orange-50/70 dark:bg-orange-950/20 border border-orange-200/60 dark:border-orange-500/20 space-y-1.5">
                <div className="text-[10px] font-black text-orange-900 dark:text-orange-300 uppercase tracking-wider flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-sm rotate-45 bg-orange-500"></span>
                  <span>📋 หมุดคำร้องขอตรวจสอบ (Requests)</span>
                </div>
                <div className="space-y-1 text-[10px] text-slate-600 dark:text-slate-300">
                  <div className="flex items-center gap-1.5">
                    <span className="w-2.5 h-2.5 rounded-sm rotate-45 bg-orange-500 border border-white flex-shrink-0"></span>
                    <span className="text-orange-800 dark:text-orange-300 font-medium">หมุดทรงสี่เหลี่ยมข้าวหลามตัด (REQ)</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <span className="w-2.5 h-2.5 rounded-sm rotate-45 bg-indigo-600 border border-white flex-shrink-0"></span>
                    <span className="text-indigo-800 dark:text-indigo-300 font-medium">คำร้องที่อยู่ระหว่างดำเนินการ</span>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Floating Case Detail Slide-over / Modal */}
        <AnimatePresence>
          {selectedCase && (
            <motion.div
              initial={{ opacity: 0, x: 40, scale: 0.96 }}
              animate={{ opacity: 1, x: 0, scale: 1 }}
              exit={{ opacity: 0, x: 40, scale: 0.96 }}
              transition={{ duration: 0.25, ease: [0.16, 1, 0.3, 1] }}
              className="absolute top-3 sm:top-4 right-3 sm:right-4 z-30 w-[calc(100%-1.5rem)] sm:w-[420px] max-w-[430px] bg-white/95 dark:bg-slate-900/95 backdrop-blur-2xl rounded-3xl border border-slate-200/90 dark:border-white/10 shadow-2xl shadow-slate-900/20 dark:shadow-black/60 overflow-hidden flex flex-col max-h-[calc(100%-1.5rem)] sm:max-h-[calc(100%-2rem)]"
            >
              {/* Modal Header */}
              <div className={`px-5 sm:px-6 py-4.5 sm:py-5 text-white flex items-center justify-between relative overflow-hidden shadow-sm ${
                selectedCase.pointType === 'REQUEST'
                  ? selectedCase.category === 'COMPLETED'
                    ? 'bg-gradient-to-r from-teal-600 via-emerald-600 to-emerald-700'
                    : selectedCase.category === 'IN_PROGRESS'
                    ? 'bg-gradient-to-r from-indigo-600 via-blue-600 to-sky-700'
                    : 'bg-gradient-to-r from-amber-500 via-orange-600 to-rose-600'
                  : selectedCase.category === 'COMPLETED'
                  ? 'bg-gradient-to-r from-emerald-600 via-teal-600 to-teal-700'
                  : selectedCase.category === 'IN_PROGRESS'
                  ? 'bg-gradient-to-r from-sky-600 via-blue-600 to-indigo-700'
                  : selectedCase.category === 'PENDING'
                  ? 'bg-gradient-to-r from-amber-500 via-amber-600 to-orange-600'
                  : 'bg-gradient-to-r from-purple-700 via-purple-800 to-[#74045F]'
              }`}>
                <div className="flex-1 pr-3 min-w-0 flex flex-col justify-center">
                  <div className="flex items-center gap-1.5 sm:gap-2 mb-1.5 flex-wrap">
                    <span className="px-2.5 py-0.5 rounded-full bg-white/20 text-white text-[10px] font-black uppercase tracking-wider backdrop-blur-md border border-white/15 shadow-sm">
                      {selectedCase.pointType === 'REQUEST' ? '📋 คำร้องขอตรวจ' : '⚡ โรงไฟฟ้า'}
                    </span>
                    <span className="px-2.5 py-0.5 rounded-full bg-black/25 text-white/95 text-[10px] font-bold backdrop-blur-md border border-white/10">
                      {selectedCase.categoryLabel}
                    </span>
                    <span className="text-[11px] text-white/85 font-semibold font-mono tracking-tight">
                      ID: {selectedCase.activeRequestId || selectedCase.plantId}
                    </span>
                  </div>
                  <h3 className="text-base sm:text-lg font-black tracking-tight leading-tight drop-shadow-sm text-white line-clamp-2">
                    {selectedCase.plantName}
                  </h3>
                </div>

                <button
                  onClick={() => {
                    setSelectedCase(null);
                    setIsEditingGps(false);
                  }}
                  className="p-2 bg-black/20 hover:bg-black/40 rounded-full text-white/90 hover:text-white transition-all flex-shrink-0 cursor-pointer active:scale-90 self-center"
                  title="ปิดหน้าต่าง"
                >
                  <X size={16} />
                </button>
              </div>

              {/* Modal Body */}
              <div className="px-5 py-4 overflow-y-auto space-y-3 text-xs scrollbar-thin scrollbar-thumb-slate-200 dark:scrollbar-thumb-white/10">
                {/* General Info Grid */}
                <div className="grid grid-cols-2 gap-2.5">
                  <div className="p-3 rounded-2xl bg-slate-50/90 dark:bg-white/[0.04] border border-slate-100 dark:border-white/5 flex flex-col justify-between">
                    <div className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider">ประเภทพลังงาน</div>
                    <div className="font-bold text-slate-800 dark:text-white mt-1 flex items-center gap-1.5 text-[13px]">
                      <div className="w-5 h-5 rounded-lg bg-amber-500/10 text-amber-500 flex items-center justify-center shrink-0">
                        <Zap size={12} />
                      </div>
                      <span className="truncate">{selectedCase.plantType || 'ไม่ระบุ'}</span>
                    </div>
                  </div>

                  <div className="p-3 rounded-2xl bg-slate-50/90 dark:bg-white/[0.04] border border-slate-100 dark:border-white/5 flex flex-col justify-between">
                    <div className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider">กำลังการผลิต</div>
                    <div className="font-bold text-slate-800 dark:text-white mt-1 text-[13px]">
                      {selectedCase.capacity || 0} <span className="text-xs font-semibold text-slate-500">MW</span>
                    </div>
                  </div>
                </div>

                {/* Location & Real GPS Info */}
                <div className="p-3.5 rounded-2xl bg-slate-50/90 dark:bg-white/[0.04] border border-slate-100 dark:border-white/5 space-y-2.5">
                  <div className="flex items-start gap-2.5">
                    <div className="w-7 h-7 rounded-xl bg-rose-500/10 text-rose-500 flex items-center justify-center shrink-0 mt-0.5">
                      <MapPin size={14} />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="font-bold text-slate-800 dark:text-white text-xs">{selectedCase.province}</div>
                      <div className="text-[11px] text-slate-500 dark:text-slate-400 leading-relaxed line-clamp-2 mt-0.5">
                        {selectedCase.location || 'ไม่มีข้อมูลสถานที่ระบุ'}
                      </div>
                    </div>
                  </div>

                  {/* GPS Source & Accuracy Tag */}
                  <div className="pt-2.5 border-t border-slate-200/60 dark:border-white/5 space-y-1.5">
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-1.5 min-w-0">
                        <span className={`w-2 h-2 rounded-full shrink-0 ${selectedCase.isExactGps ? 'bg-emerald-500' : 'bg-amber-400'}`}></span>
                        <span className="font-bold text-[11px] text-slate-700 dark:text-slate-300 truncate">
                          {selectedCase.isExactGps ? 'พิกัด GPS จริง' : 'พิกัดอิงศูนย์กลาง'}
                        </span>
                      </div>

                      {/* Edit GPS Button */}
                      <button
                        onClick={() => {
                          setIsEditingGps(!isEditingGps);
                          setEditLat(selectedCase.lat.toFixed(6));
                          setEditLng(selectedCase.lng.toFixed(6));
                        }}
                        className="text-[11px] font-bold text-indigo-600 dark:text-indigo-400 hover:text-indigo-700 dark:hover:text-indigo-300 flex items-center gap-1 cursor-pointer shrink-0"
                      >
                        <Edit3 size={11} />
                        <span>{isEditingGps ? 'ยกเลิก' : 'แก้ไขพิกัด'}</span>
                      </button>
                    </div>

                    <div className="flex items-center justify-between text-[10px] text-slate-400 dark:text-slate-500 font-mono">
                      <span>Lat: {selectedCase.lat.toFixed(5)}, Lng: {selectedCase.lng.toFixed(5)}</span>
                      {getDistanceFromUser(selectedCase.lat, selectedCase.lng) && (
                        <span className="font-sans font-bold text-indigo-600 dark:text-indigo-400">
                          ~{getDistanceFromUser(selectedCase.lat, selectedCase.lng)} กม.
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Inline GPS Editor on Firebase */}
                  {isEditingGps && (
                    <motion.div 
                      initial={{ opacity: 0, height: 0 }}
                      animate={{ opacity: 1, height: 'auto' }}
                      className="p-3 bg-white dark:bg-slate-800 rounded-xl border border-indigo-200 dark:border-indigo-500/30 space-y-2 mt-2 shadow-sm"
                    >
                      <div className="font-bold text-[11px] text-indigo-900 dark:text-indigo-300">
                        แก้ไขพิกัด GPS โรงไฟฟ้านี้ (บันทึกสู่ Firestore):
                      </div>
                      <div className="grid grid-cols-2 gap-2">
                        <div>
                          <label className="text-[10px] text-slate-500 block mb-0.5">ละติจูด (Lat)</label>
                          <input 
                            type="text" 
                            value={editLat}
                            onChange={(e) => setEditLat(e.target.value)}
                            placeholder="เช่น 13.818800"
                            className="w-full p-1.5 text-xs font-mono bg-slate-50 dark:bg-slate-900 border rounded-lg border-slate-200 dark:border-white/10"
                          />
                        </div>
                        <div>
                          <label className="text-[10px] text-slate-500 block mb-0.5">ลองจิจูด (Lng)</label>
                          <input 
                            type="text" 
                            value={editLng}
                            onChange={(e) => setEditLng(e.target.value)}
                            placeholder="เช่น 100.043100"
                            className="w-full p-1.5 text-xs font-mono bg-slate-50 dark:bg-slate-900 border rounded-lg border-slate-200 dark:border-white/10"
                          />
                        </div>
                      </div>

                      <button
                        onClick={handleSaveGpsToFirebase}
                        disabled={isSavingGps}
                        className="w-full py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg font-bold text-xs flex items-center justify-center gap-1.5 shadow-sm transition-all active:scale-95 disabled:opacity-50 cursor-pointer"
                      >
                        <Save size={13} />
                        <span>{isSavingGps ? 'กำลังบันทึกลง Firestore...' : 'บันทึกพิกัดใหม่ลง Firebase'}</span>
                      </button>
                    </motion.div>
                  )}
                </div>

                {/* Current Request Details (if any) */}
                {selectedCase.activeRequestId && (
                  <div className="p-3.5 rounded-2xl bg-indigo-50/60 dark:bg-indigo-500/10 border border-indigo-100 dark:border-indigo-500/20 space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="font-bold text-indigo-900 dark:text-indigo-300 text-[11px] uppercase tracking-wider">ข้อมูลคำร้องล่าสุด</span>
                      <span className="text-[10px] font-mono font-bold text-indigo-600 dark:text-indigo-400 bg-white/60 dark:bg-slate-800/60 px-2 py-0.5 rounded-md border border-indigo-200/50 dark:border-indigo-500/20">
                        {selectedCase.activeRequestId}
                      </span>
                    </div>

                    <div className="space-y-1.5 text-slate-600 dark:text-slate-300 text-[11px]">
                      {selectedCase.vendorName && (
                        <div className="flex items-center gap-2">
                          <Building2 size={13} className="text-slate-400 shrink-0" />
                          <span className="truncate">ผู้ประกอบการ: <strong className="text-slate-800 dark:text-white font-semibold">{selectedCase.vendorName}</strong></span>
                        </div>
                      )}
                      {selectedCase.inspectorName && (
                        <div className="flex items-center gap-2">
                          <User size={13} className="text-slate-400 shrink-0" />
                          <span className="truncate">ผู้รับผิดชอบตรวจ: <strong className="text-slate-800 dark:text-white font-semibold">{selectedCase.inspectorName}</strong></span>
                        </div>
                      )}
                      {selectedCase.preferredDate && (
                        <div className="flex items-center gap-2">
                          <Calendar size={13} className="text-slate-400 shrink-0" />
                          <span className="truncate">วันที่นัดหมาย: <strong className="text-slate-800 dark:text-white font-semibold">{selectedCase.preferredDate}</strong></span>
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {/* Complaints Alert (if any from Firebase) */}
                {selectedCase.complaintsCount > 0 && (
                  <div className="p-3.5 rounded-2xl bg-rose-50 dark:bg-rose-500/10 border border-rose-200 dark:border-rose-500/20 space-y-2">
                    <div className="flex items-center gap-2 text-rose-700 dark:text-rose-400 font-bold text-xs">
                      <AlertTriangle size={14} />
                      <span>พบข้อร้องเรียน / ปัญหา ({selectedCase.complaintsCount} รายการ)</span>
                    </div>
                    <div className="space-y-1.5">
                      {selectedCase.complaintsList.map((comp) => (
                        <div key={comp.id} className="text-[11px] text-slate-700 dark:text-slate-300 p-2.5 rounded-xl bg-white dark:bg-slate-800/80 border border-rose-100 dark:border-rose-500/10 shadow-sm">
                          <div className="font-bold text-rose-800 dark:text-rose-300">{comp.title}</div>
                          {comp.details && <div className="text-[10px] text-slate-500 dark:text-slate-400 mt-0.5 leading-relaxed">{comp.details}</div>}
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Historical Inspections Timeline */}
                {selectedCase.historyList && selectedCase.historyList.length > 0 && (
                  <div className="space-y-2 pt-1">
                    <div className="flex items-center justify-between text-[11px] font-bold text-slate-800 dark:text-white uppercase tracking-wider">
                      <span className="flex items-center gap-1.5">
                        <History size={13} className="text-purple-600 dark:text-purple-400" />
                        <span>ประวัติการตรวจในอดีต ({selectedCase.historyList.length} ครั้ง)</span>
                      </span>
                    </div>

                    <div className="space-y-1.5 max-h-32 overflow-y-auto pr-1">
                      {selectedCase.historyList.map((hist, idx) => (
                        <div key={hist.id || idx} className="p-2.5 rounded-xl bg-slate-50/90 dark:bg-white/[0.04] border border-slate-100 dark:border-white/5 flex items-center justify-between gap-2">
                          <div className="min-w-0">
                            <div className="font-bold text-slate-800 dark:text-white text-[11px] truncate">
                              {hist.inspectionDate || hist.submittedAt || hist.approvedAt || hist.createdAt || 'บันทึกการตรวจ'}
                            </div>
                            <div className="text-[10px] text-slate-400 truncate">
                              ผู้ตรวจ: {hist.inspectorName || 'ไม่ระบุ'}
                            </div>
                          </div>
                          <span className={`px-2 py-0.5 rounded-md text-[9px] font-black uppercase tracking-wider shrink-0 ${
                            hist.status === 'APPROVED' ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20' : 'bg-slate-200 dark:bg-white/10 text-slate-500'
                          }`}>
                            {hist.status}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              {/* Modal Footer Actions */}
              <div className="px-5 py-4 border-t border-slate-100 dark:border-white/10 bg-slate-50/80 dark:bg-slate-900/80 backdrop-blur-md space-y-2.5">
                {/* Accept Job Action directly on Firebase (for Inspector/Admin) */}
                {selectedCase.category === 'PENDING' && (userProfile?.role === 'INSPECTOR' || userProfile?.role === 'ADMIN' || !userProfile?.role) && (
                  <button
                    onClick={() => handleAcceptCase(selectedCase)}
                    disabled={isActionLoading}
                    className="w-full py-2.5 px-3 bg-amber-500 hover:bg-amber-600 text-white rounded-xl font-bold text-xs flex items-center justify-center gap-1.5 shadow-md shadow-amber-500/20 transition-all active:scale-95 disabled:opacity-50 cursor-pointer"
                  >
                    <Check size={14} />
                    <span>{isActionLoading ? 'กำลังบันทึกลง Firebase...' : 'รับงานตรวจเคสนี้ทันที (Accept Case)'}</span>
                  </button>
                )}

                {/* In Progress Status Banner */}
                {selectedCase.category === 'IN_PROGRESS' && (
                  <div className="p-2.5 rounded-xl bg-sky-50 dark:bg-sky-500/10 border border-sky-200 dark:border-sky-500/20 flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="w-2 h-2 rounded-full bg-sky-500 animate-ping shrink-0"></span>
                      <span className="text-xs font-bold text-sky-800 dark:text-sky-300 truncate">
                        สถานะ: กำลังดำเนินการ {selectedCase.inspectorName ? `(${selectedCase.inspectorName})` : ''}
                      </span>
                    </div>
                    {userProfile?.role === 'INSPECTOR' && onNavigate && (
                      <button
                        onClick={() => {
                          const transferPayload = {
                            plantId: selectedCase.plantId,
                            requestId: selectedCase.activeRequestId || selectedCase.requestCode,
                            rawPlant: selectedCase.rawPlant,
                            rawRequest: selectedCase.rawRequest
                          };
                          safeSetLocalStorage('pending_map_inspection_target', transferPayload);
                          onNavigate('EQUIPMENT_INSPECTION');
                        }}
                        className="px-2.5 py-1 bg-sky-600 hover:bg-sky-700 text-white rounded-lg text-[11px] font-bold shadow-sm transition-all active:scale-95 cursor-pointer shrink-0"
                      >
                        เริ่มเข้าตรวจ
                      </button>
                    )}
                  </div>
                )}

                <div className="flex items-center gap-2.5">
                  <a
                    href={`https://www.google.com/maps/dir/?api=1&destination=${selectedCase.lat},${selectedCase.lng}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex-1 py-2.5 px-3 bg-white dark:bg-slate-800 border border-slate-200/90 dark:border-white/10 hover:border-indigo-400 hover:text-indigo-600 dark:hover:text-indigo-300 text-slate-700 dark:text-slate-200 rounded-xl font-bold text-xs flex items-center justify-center gap-1.5 shadow-sm transition-all active:scale-95"
                  >
                    <Navigation size={14} className="text-indigo-500" />
                    <span>นำทาง (Maps)</span>
                  </a>

                  {onNavigate && (
                    <button
                      onClick={() => {
                        const isReq = selectedCase.pointType === 'REQUEST';
                        const isInsp = userProfile?.role === 'INSPECTOR';

                        if (isInsp) {
                          // Pass selected target into local storage for EquipmentInspection to automatically pick up
                          const transferPayload = {
                            plantId: selectedCase.plantId,
                            requestId: selectedCase.activeRequestId || selectedCase.requestCode,
                            rawPlant: selectedCase.rawPlant,
                            rawRequest: selectedCase.rawRequest
                          };
                          safeSetLocalStorage('pending_map_inspection_target', transferPayload);
                          onNavigate('EQUIPMENT_INSPECTION');
                        } else if (userProfile?.role === 'VENDER' || userProfile?.role === 'VENDOR') {
                          onNavigate('INSPECTION_REQUEST');
                        } else if (userProfile?.role === 'MANAGER' || userProfile?.role === 'EXECUTIVE') {
                          onNavigate('INSPECTION_APPROVAL');
                        } else {
                          const transferPayload = {
                            plantId: selectedCase.plantId,
                            requestId: selectedCase.activeRequestId || selectedCase.requestCode,
                            rawPlant: selectedCase.rawPlant,
                            rawRequest: selectedCase.rawRequest
                          };
                          safeSetLocalStorage('pending_map_inspection_target', transferPayload);
                          onNavigate('EQUIPMENT_INSPECTION');
                        }
                      }}
                      className="flex-1 py-2.5 px-3 bg-[#74045F] hover:bg-[#5d034c] text-white rounded-xl font-bold text-xs flex items-center justify-center gap-1.5 shadow-md shadow-[#74045F]/20 transition-all active:scale-95 cursor-pointer"
                    >
                      <span>{userProfile?.role === 'INSPECTOR' ? (selectedCase.pointType === 'REQUEST' ? 'สร้างแบบฟอร์มตรวจ' : 'ไปที่ฟอร์มตรวจ') : 'ไปที่งานตรวจ'}</span>
                      <ArrowRight size={14} />
                    </button>
                  )}
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
};
