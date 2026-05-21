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

    // 3. Seed multiple Power Plants
    const samplePlants = [
      {
        id: 'sample-plant-01',
        name: 'โรงไฟฟ้าโซลาร์เซลล์ นครปฐม 1',
        type: 'Solar',
        capacity: 5.5,
        connectionPoint: 'Substation Alpha',
        userType: 'VSPP',
        region: 'ภาคกลาง',
        province: 'นครปฐม',
        gps: { lat: '13.8188', lng: '100.0431' },
      },
      {
        id: 'sample-plant-02',
        name: 'โรงไฟฟ้าลม กาญจนบุรี',
        type: 'Wind',
        capacity: 12.0,
        connectionPoint: 'Substation Beta',
        userType: 'SPP',
        region: 'ภาคตะวันตก',
        province: 'กาญจนบุรี',
        gps: { lat: '14.0227', lng: '99.5328' },
      },
      {
        id: 'sample-plant-03',
        name: 'โรงไฟฟ้าชีวมวล สุพรรณบุรี',
        type: 'Biomass',
        capacity: 8.5,
        connectionPoint: 'Substation Gamma',
        userType: 'VSPP',
        region: 'ภาคกลาง',
        province: 'สุพรรณบุรี',
        gps: { lat: '14.4746', lng: '100.1174' },
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

    // 4. Seed system config
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
