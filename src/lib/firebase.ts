import { initializeApp } from 'firebase/app';
import { getAuth, signInWithPopup, GoogleAuthProvider, signOut, type User } from 'firebase/auth';
import { 
  initializeFirestore,
  persistentLocalCache,
  persistentMultipleTabManager,
  doc, 
  getDocFromServer, 
  collection, 
  getDocs, 
  onSnapshot, 
  setDoc,
  serverTimestamp,
  type Firestore,
  type FirestoreError
} from 'firebase/firestore';
import firebaseConfig from '../../firebase-applet-config.json';
import { MOCK_USERS } from '../../constants';

// Initialize Firebase
const app = initializeApp(firebaseConfig);

// Initialize Services with Offline Persistence
// This helps handle [code=unavailable] errors by allowing the app to work with local cache
export const db = initializeFirestore(app, {
  localCache: persistentLocalCache({tabManager: persistentMultipleTabManager()})
}, firebaseConfig.firestoreDatabaseId);

export const auth = getAuth(app);

// Authentication Helpers
export const googleProvider = new GoogleAuthProvider();
export const signInWithGoogle = () => signInWithPopup(auth, googleProvider);
export const logoutUser = () => signOut(auth);

/**
 * Ensures a valid Firebase Auth session exists.
 * If no user is logged in, it returns null.
 */
export async function ensureAuth() {
  if (auth.currentUser) return auth.currentUser;
  return null;
}

// Firestore Error Handling
export enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

export interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId?: string | null;
    email?: string | null;
    emailVerified?: boolean | null;
    isAnonymous?: boolean | null;
    tenantId?: string | null;
    token?: string | null;
    providerInfo?: {
      providerId?: string | null;
      email?: string | null;
    }[];
  };
}

/**
 * Standardized error handler for Firestore operations.
 * Throws a JSON string containing detailed error context for debugging security rules.
 */
export function handleFirestoreError(error: unknown, operationType: OperationType, path: string | null): never {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
      isAnonymous: auth.currentUser?.isAnonymous,
      token: (auth.currentUser as any)?.accessToken?.substring(0, 20) + "...", // Partial token for debugging
      providerInfo: auth.currentUser?.providerData?.map(provider => ({
        providerId: provider.providerId,
        email: provider.email,
      })) || []
    },
    operationType,
    path
  };
  
  const errorMessage = JSON.stringify(errInfo);
  console.error('Firestore Error: ', errorMessage);
  throw new Error(errorMessage);
}

/**
 * Recursively cleans any undefined values, dates, or non-serializable objects
 * to ensure 100% compatibility with Firestore document writing.
 */
export function sanitizeFirestoreData<T>(data: T): T {
  if (data === undefined) {
    return null as any;
  }
  if (data === null || typeof data !== 'object') {
    return data;
  }
  if (data instanceof Date) {
    return data.toISOString() as any;
  }
  if (Array.isArray(data)) {
    return data
      .filter(item => item !== undefined)
      .map(item => sanitizeFirestoreData(item)) as any;
  }
  const cleaned: Record<string, any> = {};
  for (const [key, value] of Object.entries(data as Record<string, any>)) {
    if (value !== undefined) {
      cleaned[key] = sanitizeFirestoreData(value);
    }
  }
  return cleaned as T;
}

/**
 * Validates the connection to Firestore during app initialization.
 */
export async function testConnection() {
  try {
    // Attempt to read a non-existent document to trigger a server round-trip
    await getDocFromServer(doc(db, '_connection_test_', 'ping'));
    console.log("Firebase connection verified.");
  } catch (error) {
    const ferr = error as FirestoreError;
    if (ferr.message?.includes('the client is offline')) {
      console.error("Firebase connection failed: Client is offline. Please check your configuration.");
    } else if (ferr.code === 'permission-denied') {
      // This is expected if the path is restricted, but the connection itself works
      console.log("Firebase connection verified (Permission Denied is expected for restricted paths).");
    } else {
      console.error("Firebase connection test failed:", error);
    }
  }
}

/**
 * Seeds sample data to Firestore to make collections visible in the console.
 */
export async function seedSampleData() {
  try {
    // 0. Ensure we are signed in to Firebase (even anonymously) for security rules
    await ensureAuth();

    // 1. First, ensure the current user has a profile document as an ADMIN 
    // so they can perform other administrative tasks.
    if (auth.currentUser) {
      const authUser = auth.currentUser;
      const userRef = doc(db, 'users', authUser.uid);
      
      // Look for a matching mock user by email
      const matchingMock = MOCK_USERS.find(u => u.email.toLowerCase() === authUser.email?.toLowerCase());
      
      await setDoc(userRef, {
        employeeId: matchingMock?.employeeId || 'ADMIN-001',
        username: authUser.email?.split('@')[0] || 'admin',
        name: authUser.displayName || matchingMock?.name || 'Administrator',
        role: 'ADMIN',
        email: authUser.email,
        status: 'ACTIVE',
        linkTo: matchingMock?.employeeId || null,
        createdAt: serverTimestamp(),
        lastSeen: serverTimestamp()
      }, { merge: true });
      console.log("Admin linked profile created/updated.");
    }

    // 2. Seed MOCK_USERS to the users collection
    for (const mockUser of MOCK_USERS) {
      try {
        const userRef = doc(db, 'users', mockUser.employeeId);
        await setDoc(userRef, {
          ...mockUser,
          createdAt: serverTimestamp()
        }, { merge: true });
      } catch (err) {
        console.warn(`Failed to seed user ${mockUser.employeeId}:`, err);
      }
    }

    // 3. Seed multiple Power Plants across Thailand with exact GPS coordinates
    const samplePlants = [
      {
        id: 'sample-plant-01',
        name: 'โรงไฟฟ้าโซลาร์เซลล์ นครปฐม 1',
        type: 'Solar (โซลาร์เซลล์)',
        capacity: 5.5,
        connectionPoint: 'สฟ. นครชัยศรี 115 kV',
        userType: 'VSPP',
        region: 'ภาคกลาง',
        province: 'นครปฐม',
        location: 'อ.นครชัยศรี จ.นครปฐม',
        contactPerson: 'นายพิเชษฐ์ เกียรติสุข',
        contactPhone: '081-987-6543',
        gps: { lat: '13.8188', lng: '100.0431' },
      },
      {
        id: 'sample-plant-02',
        name: 'โรงไฟฟ้าพลังงานลม กาญจนบุรี',
        type: 'Wind (กังหันลม)',
        capacity: 12.0,
        connectionPoint: 'สฟ. ท่าม่วง 115 kV',
        userType: 'SPP',
        region: 'ภาคตะวันตก',
        province: 'กาญจนบุรี',
        location: 'อ.ท่าม่วง จ.กาญจนบุรี',
        contactPerson: 'วิศวกรประจำโรงไฟฟ้า กาญจนบุรี',
        contactPhone: '082-123-4567',
        gps: { lat: '14.0228', lng: '99.5328' },
      },
      {
        id: 'sample-plant-03',
        name: 'โรงไฟฟ้าชีวมวล สุพรรณบุรี กรีน',
        type: 'Biomass (ชีวมวล)',
        capacity: 8.5,
        connectionPoint: 'สฟ. อู่ทอง 22 kV',
        userType: 'VSPP',
        region: 'ภาคกลาง',
        province: 'สุพรรณบุรี',
        location: 'อ.อู่ทอง จ.สุพรรณบุรี',
        contactPerson: 'นายสิทธิชัย รุ่งโรจน์',
        contactPhone: '089-555-1234',
        gps: { lat: '14.4746', lng: '100.1174' },
      },
      {
        id: 'sample-plant-04',
        name: 'โรงไฟฟ้าโซลาร์ฟาร์ม ขอนแก่น คลีน',
        type: 'Solar (โซลาร์เซลล์)',
        capacity: 9.8,
        connectionPoint: 'สฟ. น้ำพอง 2 115 kV',
        userType: 'SPP',
        region: 'ภาคตะวันออกเฉียงเหนือ',
        province: 'ขอนแก่น',
        location: 'อ.น้ำพอง จ.ขอนแก่น',
        contactPerson: 'น.ส.วิไลลักษณ์ มั่นคง',
        contactPhone: '086-777-8899',
        gps: { lat: '16.4419', lng: '102.8360' },
      },
      {
        id: 'sample-plant-05',
        name: 'โรงไฟฟ้าพลังงานลม ห้วยบง วินด์ฟาร์ม',
        type: 'Wind (กังหันลม)',
        capacity: 45.0,
        connectionPoint: 'สฟ. ด่านขุนทด 115 kV',
        userType: 'SPP',
        region: 'ภาคตะวันออกเฉียงเหนือ',
        province: 'นครราชสีมา',
        location: 'ต.ห้วยบง อ.ด่านขุนทด จ.นครราชสีมา',
        contactPerson: 'หัวหน้างานฝ่ายวิศวกรรม โคราช',
        contactPhone: '044-998877',
        gps: { lat: '15.0880', lng: '101.4420' },
      },
      {
        id: 'sample-plant-06',
        name: 'โรงไฟฟ้าพลังงานแสงอาทิตย์ เชียงใหม่ กรีน',
        type: 'Solar (โซลาร์เซลล์)',
        capacity: 6.2,
        connectionPoint: 'สฟ. สันทราย 22 kV',
        userType: 'VSPP',
        region: 'ภาคเหนือ',
        province: 'เชียงใหม่',
        location: 'อ.สันทราย จ.เชียงใหม่',
        contactPerson: 'นายณรงค์ศักดิ์ สุริยะ',
        contactPhone: '083-444-2211',
        gps: { lat: '18.7883', lng: '98.9853' },
      },
      {
        id: 'sample-plant-07',
        name: 'โรงไฟฟ้าก๊าซชีวภาพ ชลบุรี คลีนพาวเวอร์',
        type: 'Biogas (ก๊าซชีวภาพ)',
        capacity: 7.0,
        connectionPoint: 'สฟ. พานทอง 115 kV',
        userType: 'SPP',
        region: 'ภาคตะวันออก',
        province: 'ชลบุรี',
        location: 'อ.พานทอง จ.ชลบุรี',
        contactPerson: 'นายวีระพล สุขสมบัติ',
        contactPhone: '038-112233',
        gps: { lat: '13.3611', lng: '100.9847' },
      },
      {
        id: 'sample-plant-08',
        name: 'โรงไฟฟ้าชีวมวล สงขลา ไบโอแมส',
        type: 'Biomass (ชีวมวล)',
        capacity: 9.9,
        connectionPoint: 'สฟ. จะนะ 115 kV',
        userType: 'SPP',
        region: 'ภาคใต้',
        province: 'สงขลา',
        location: 'อ.จะนะ จ.สงขลา',
        contactPerson: 'นายสมพร ชัยวัฒน์',
        contactPhone: '074-889900',
        gps: { lat: '7.0084', lng: '100.4767' },
      },
      {
        id: 'sample-plant-09',
        name: 'โรงไฟฟ้าพลังงานขยะ ระยอง เวสท์ ทู เอเนอร์ยี่',
        type: 'Waste (ขยะ)',
        capacity: 10.0,
        connectionPoint: 'สฟ. มาบตาพุด 115 kV',
        userType: 'SPP',
        region: 'ภาคตะวันออก',
        province: 'ระยอง',
        location: 'อ.เมือง จ.ระยอง',
        contactPerson: 'ผู้จัดการฝ่ายเทคนิค ระยอง',
        contactPhone: '038-990011',
        gps: { lat: '12.6814', lng: '101.2816' },
      }
    ];

    for (const plant of samplePlants) {
      try {
        const plantRef = doc(db, 'powerPlants', plant.id);
        await setDoc(plantRef, {
          ...plant,
          createdAt: serverTimestamp()
        }, { merge: true });
      } catch (err) {
        console.warn(`Failed to seed plant ${plant.id}:`, err);
      }
    }

    // 4. Seed Inspection Requests linked to Plants
    const sampleRequests = [
      {
        id: 'REQ-2026-001',
        plantId: 'sample-plant-01',
        plantName: 'โรงไฟฟ้าโซลาร์เซลล์ นครปฐม 1',
        vendorId: 'VENDOR-01',
        vendorName: 'นายเอกชัย ชัยชนะ',
        coordinatorName: 'นายพิเชษฐ์ เกียรติสุข',
        coordinatorPhone: '081-987-6543',
        office: 'กฟภ. นครปฐม',
        requestedDate: '2026-08-15',
        status: 'COMPLETED',
        inspectorId: 'INSP-001',
        inspectorName: 'นายวิชัย สุวรรณ (กฟภ.)',
        details: 'ตรวจสอบระบบเชื่อมต่อ Inverter และ Power Quality ประจำปี',
        createdAt: new Date(Date.now() - 8 * 86400000).toISOString()
      },
      {
        id: 'REQ-2026-002',
        plantId: 'sample-plant-02',
        plantName: 'โรงไฟฟ้าพลังงานลม กาญจนบุรี',
        vendorId: 'VENDOR-01',
        vendorName: 'นายเอกชัย ชัยชนะ',
        coordinatorName: 'วิศวกรประจำโรงไฟฟ้า กาญจนบุรี',
        coordinatorPhone: '082-123-4567',
        office: 'กฟภ. กาญจนบุรี',
        requestedDate: '2026-08-25',
        status: 'ACCEPTED',
        inspectorId: 'INSP-001',
        inspectorName: 'นายวิชัย สุวรรณ (กฟภ.)',
        details: 'ตรวจสอบระบบ Relay Protection และ Voltage Flicker ณ จุดเชื่อมต่อ',
        assignedAt: new Date(Date.now() - 1 * 86400000).toISOString(),
        createdAt: new Date(Date.now() - 2 * 86400000).toISOString()
      },
      {
        id: 'REQ-2026-003',
        plantId: 'sample-plant-03',
        plantName: 'โรงไฟฟ้าชีวมวล สุพรรณบุรี กรีน',
        vendorId: 'VENDOR-01',
        vendorName: 'นายเอกชัย ชัยชนะ',
        coordinatorName: 'นายสิทธิชัย รุ่งโรจน์',
        coordinatorPhone: '089-555-1234',
        office: 'กฟภ. สุพรรณบุรี',
        requestedDate: '2026-08-28',
        status: 'PENDING',
        details: 'ขอตรวจสอบระบบ Synchronizing Unit และการจ่ายกำลังไฟฟ้าร่วม',
        createdAt: new Date().toISOString()
      },
      {
        id: 'REQ-2026-004',
        plantId: 'sample-plant-04',
        plantName: 'โรงไฟฟ้าโซลาร์ฟาร์ม ขอนแก่น คลีน',
        vendorId: 'VENDOR-01',
        vendorName: 'นายเอกชัย ชัยชนะ',
        coordinatorName: 'น.ส.วิไลลักษณ์ มั่นคง',
        coordinatorPhone: '086-777-8899',
        office: 'กฟภ. ขอนแก่น',
        requestedDate: '2026-08-26',
        status: 'ACCEPTED',
        inspectorId: 'INSP-001',
        inspectorName: 'นายวิชัย สุวรรณ (กฟภ.)',
        details: 'ตรวจสอบ Harmonic Distortion และความพร้อมในการขยายกำลังผลิต',
        assignedAt: new Date(Date.now() - 2 * 86400000).toISOString(),
        createdAt: new Date(Date.now() - 3 * 86400000).toISOString()
      },
      {
        id: 'REQ-2026-005',
        plantId: 'sample-plant-05',
        plantName: 'โรงไฟฟ้าพลังงานลม ห้วยบง วินด์ฟาร์ม',
        vendorId: 'VENDOR-01',
        vendorName: 'นายเอกชัย ชัยชนะ',
        coordinatorName: 'หัวหน้างานฝ่ายวิศวกรรม โคราช',
        coordinatorPhone: '044-998877',
        office: 'กฟภ. นครราชสีมา',
        requestedDate: '2026-08-10',
        status: 'COMPLETED',
        inspectorId: 'INSP-001',
        inspectorName: 'นายวิชัย สุวรรณ (กฟภ.)',
        details: 'การตรวจสอบรับรองมาตรฐานผลกระทบต่อระบบจำหน่าย (Grid Code)',
        createdAt: new Date(Date.now() - 14 * 86400000).toISOString()
      },
      {
        id: 'REQ-2026-006',
        plantId: 'sample-plant-06',
        plantName: 'โรงไฟฟ้าพลังงานแสงอาทิตย์ เชียงใหม่ กรีน',
        vendorId: 'VENDOR-01',
        vendorName: 'นายเอกชัย ชัยชนะ',
        coordinatorName: 'นายณรงค์ศักดิ์ สุริยะ',
        coordinatorPhone: '083-444-2211',
        office: 'กฟภ. เชียงใหม่',
        requestedDate: '2026-08-30',
        status: 'PENDING',
        details: 'ขอตรวจสอบมาตรฐานการปลดโหลดอัตโนมัติ Anti-Islanding Protection',
        createdAt: new Date().toISOString()
      },
      {
        id: 'REQ-2026-007',
        plantId: 'sample-plant-07',
        plantName: 'โรงไฟฟ้าก๊าซชีวภาพ ชลบุรี คลีนพาวเวอร์',
        vendorId: 'VENDOR-01',
        vendorName: 'นายเอกชัย ชัยชนะ',
        coordinatorName: 'นายวีระพล สุขสมบัติ',
        coordinatorPhone: '038-112233',
        office: 'กฟภ. ชลบุรี',
        requestedDate: '2026-08-27',
        status: 'ACCEPTED',
        inspectorId: 'INSP-001',
        inspectorName: 'นายวิชัย สุวรรณ (กฟภ.)',
        details: 'ตรวจสอบการทำงานของ Generator และค่า Voltage Sag / Swell',
        assignedAt: new Date().toISOString(),
        createdAt: new Date(Date.now() - 1 * 86400000).toISOString()
      },
      {
        id: 'REQ-2026-008',
        plantId: 'sample-plant-08',
        plantName: 'โรงไฟฟ้าชีวมวล สงขลา ไบโอแมส',
        vendorId: 'VENDOR-01',
        vendorName: 'นายเอกชัย ชัยชนะ',
        coordinatorName: 'นายสมพร ชัยวัฒน์',
        coordinatorPhone: '074-889900',
        office: 'กฟภ. สงขลา',
        requestedDate: '2026-08-05',
        status: 'COMPLETED',
        inspectorId: 'INSP-001',
        inspectorName: 'นายวิชัย สุวรรณ (กฟภ.)',
        details: 'ตรวจสอบประเมินคุณภาพไฟฟ้าประจำรอบปี 2569',
        createdAt: new Date(Date.now() - 20 * 86400000).toISOString()
      }
    ];

    for (const req of sampleRequests) {
      try {
        const reqRef = doc(db, 'inspectionRequests', req.id);
        await setDoc(reqRef, {
          ...req,
          createdAt: req.createdAt || serverTimestamp()
        }, { merge: true });
      } catch (err) {
        console.warn(`Failed to seed request ${req.id}:`, err);
      }
    }

    // 5. Seed Completed Inspections
    const sampleInspections = [
      {
        id: 'INSP-2026-001',
        requestId: 'REQ-2026-001',
        plantId: 'sample-plant-01',
        plantName: 'โรงไฟฟ้าโซลาร์เซลล์ นครปฐม 1',
        inspectorId: 'INSP-001',
        inspectorName: 'นายวิชัย สุวรรณ (กฟภ.)',
        formId: 'FORM-STD-01',
        status: 'APPROVED',
        inspectionDate: '2026-08-15',
        submittedAt: '2026-08-15T14:30:00.000Z',
        approvedAt: '2026-08-16T09:00:00.000Z',
        approvalNote: 'ผ่านเกณฑ์มาตรฐานการเชื่อมต่อระบบโครงข่าย กฟภ. (Grid Code Pass)',
        formData: {
          voltage: '22.1 kV',
          frequency: '50.02 Hz',
          thd_v: '1.2%',
          thd_i: '2.8%',
          relay_status: 'NORMAL'
        },
        photos: [],
        createdAt: '2026-08-15T14:30:00.000Z'
      },
      {
        id: 'INSP-2026-005',
        requestId: 'REQ-2026-005',
        plantId: 'sample-plant-05',
        plantName: 'โรงไฟฟ้าพลังงานลม ห้วยบง วินด์ฟาร์ม',
        inspectorId: 'INSP-001',
        inspectorName: 'นายวิชัย สุวรรณ (กฟภ.)',
        formId: 'FORM-WIND-01',
        status: 'APPROVED',
        inspectionDate: '2026-08-10',
        submittedAt: '2026-08-10T16:00:00.000Z',
        approvedAt: '2026-08-11T10:00:00.000Z',
        approvalNote: 'ผ่านเกณฑ์มาตรฐานการตรวจสอบคุณภาพไฟฟ้าและความมั่นคงระบบ 115 kV',
        formData: {
          voltage: '115.4 kV',
          frequency: '50.01 Hz',
          thd_v: '0.9%',
          relay_status: 'NORMAL'
        },
        photos: [],
        createdAt: '2026-08-10T16:00:00.000Z'
      },
      {
        id: 'INSP-2026-008',
        requestId: 'REQ-2026-008',
        plantId: 'sample-plant-08',
        plantName: 'โรงไฟฟ้าชีวมวล สงขลา ไบโอแมส',
        inspectorId: 'INSP-001',
        inspectorName: 'นายวิชัย สุวรรณ (กฟภ.)',
        formId: 'FORM-BIO-01',
        status: 'APPROVED',
        inspectionDate: '2026-08-05',
        submittedAt: '2026-08-05T15:00:00.000Z',
        approvedAt: '2026-08-06T11:00:00.000Z',
        approvalNote: 'ผ่านเกณฑ์ตรวจสอบระบบซิงโครไนซ์และค่าตัวประกอบกำลัง (Power Factor)',
        formData: {
          voltage: '115.1 kV',
          frequency: '49.98 Hz',
          power_factor: '0.96',
          relay_status: 'NORMAL'
        },
        photos: [],
        createdAt: '2026-08-05T15:00:00.000Z'
      }
    ];

    for (const insp of sampleInspections) {
      try {
        const inspRef = doc(db, 'inspections', insp.id);
        await setDoc(inspRef, {
          ...insp,
          createdAt: insp.createdAt || serverTimestamp()
        }, { merge: true });
      } catch (err) {
        console.warn(`Failed to seed inspection ${insp.id}:`, err);
      }
    }

    // 6. Seed Sample Complaints
    const sampleComplaints = [
      {
        id: 'CMP-2026-001',
        plantId: 'sample-plant-07',
        plantName: 'โรงไฟฟ้าก๊าซชีวภาพ ชลบุรี คลีนพาวเวอร์',
        title: 'ตรวจพบแรงดันกระพริบ (Flicker) ช่วงเวลาสตาร์ทเครื่องกำเนิดไฟฟ้า',
        details: 'มีประชาชนและโรงงานข้างเคียงแจ้งปัญหาหลอดไฟกระพริบช่วงเวลา 08:30 น.',
        severity: 'HIGH',
        status: 'INVESTIGATING',
        createdAt: new Date(Date.now() - 3 * 86400000).toISOString()
      }
    ];

    for (const cmp of sampleComplaints) {
      try {
        const cmpRef = doc(db, 'complaints', cmp.id);
        await setDoc(cmpRef, {
          ...cmp,
          createdAt: cmp.createdAt || serverTimestamp()
        }, { merge: true });
      } catch (err) {
        console.warn(`Failed to seed complaint ${cmp.id}:`, err);
      }
    }

    // 7. Seed system config
    try {
      const configRef = doc(db, 'system_config', 'settings');
      await setDoc(configRef, {
        maintenanceMode: false,
        minAppVersion: '1.0.0',
        announcement: 'ระบบ PEA SPP Smart Tracker พร้อมใช้งานแล้ว',
        updatedAt: serverTimestamp()
      }, { merge: true });
    } catch (err) {
      console.warn("Failed to seed system config:", err);
    }

    console.log("Sample data seeded successfully.");
    return true;
  } catch (error) {
    console.error("Seed Sample Data Error:", error);
    handleFirestoreError(error, OperationType.CREATE, 'multiple-collections-seed');
    return false;
  }
}
