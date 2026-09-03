
import React, { useState, useEffect } from 'react';
import { 
  Zap, Plus, Search, Edit2, Trash2, MapPin, 
  Mail, Phone, User, Globe, ChevronLeft, ChevronRight,
  MoreVertical, X, Check, Building2, Battery, Radio,
  Navigation, Filter, Eye, ExternalLink, ShieldAlert, Lock,
  Upload, FileSpreadsheet, AlertCircle
} from 'lucide-react';
import { useLanguage } from '../contexts/LanguageContext';
import { motion, AnimatePresence } from 'motion/react';
import { safeParseLocalStorage, safeSetLocalStorage } from '../utils/localStorageUtils';
import { db } from '../src/lib/firebase';
import { collection, query, onSnapshot, doc, setDoc, deleteDoc } from 'firebase/firestore';
import { PaginationControls } from './PaginationControls';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';

// Fix Leaflet icon issue
delete (L.Icon.Default.prototype as any)._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon-2x.png',
  iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon.png',
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-shadow.png',
});

const MapPicker: React.FC<{
  initialPos: { lat: number; lng: number };
  onSelect: (lat: string, lng: string) => void;
}> = ({ initialPos, onSelect }) => {
  const mapContainerRef = React.useRef<HTMLDivElement>(null);
  const mapInstance = React.useRef<L.Map | null>(null);
  const markerInstance = React.useRef<L.Marker | null>(null);

  React.useEffect(() => {
    if (!mapContainerRef.current || mapInstance.current) return;

    // Ensure coordinates are valid numbers
    const lat = isNaN(initialPos.lat) ? 13.7563 : initialPos.lat;
    const lng = isNaN(initialPos.lng) ? 100.5018 : initialPos.lng;

    try {
      // Initialize map
      const map = L.map(mapContainerRef.current, {
        center: [lat, lng],
        zoom: 13,
        zoomAnimation: false // Disable animation to prevent _leaflet_pos error during quick removal
      });
      mapInstance.current = map;

      L.tileLayer('https://mt1.google.com/vt/lyrs=m&x={x}&y={y}&z={z}', {
        attribution: '&copy; Google Maps',
        maxZoom: 20,
        subdomains: ['mt0', 'mt1', 'mt2', 'mt3']
      }).addTo(map);

      // Initialize marker
      const marker = L.marker([lat, lng], { draggable: true }).addTo(map);
      markerInstance.current = marker;

      // Events
      marker.on('dragend', () => {
        const position = marker.getLatLng();
        onSelect(position.lat.toFixed(6), position.lng.toFixed(6));
      });

      map.on('click', (e) => {
        const { lat, lng } = e.latlng;
        marker.setLatLng([lat, lng]);
        onSelect(lat.toFixed(6), lng.toFixed(6));
      });

      // Handle container resize/opening (crucial for maps in modals)
      const timer = setTimeout(() => {
        if (mapInstance.current) {
          mapInstance.current.invalidateSize();
        }
      }, 500);

      return () => {
        clearTimeout(timer);
        if (mapInstance.current) {
          mapInstance.current.off();
          mapInstance.current.remove();
          mapInstance.current = null;
        }
        markerInstance.current = null;
      };
    } catch (error) {
      console.error('Leaflet initialization error:', error);
    }
  }, []);

  return <div ref={mapContainerRef} className="absolute inset-0 z-0 bg-slate-100 dark:bg-slate-800" />;
};

interface Coordinator {
  name: string;
  email: string;
  phone: string;
}

interface PowerPlant {
  id: string;
  name: string;
  type: string;
  capacity: number; // MW
  connectionPoint: string;
  userType: 'SPP' | 'VSPP';
  region: string;
  province: string;
  coordinators: Coordinator[];
  gps: {
    lat: string;
    lng: string;
  };
  createdAt: string;
}

const PLANT_TYPES = [
  'Solar (โซลาร์เซลล์)',
  'Wind (กังหันลม)',
  'Biomass (ชีวมวล)',
  'Biogas (ก๊าซชีวภาพ)',
  'Waste (ขยะ)',
  'Hydro (พลังงานน้ำ)',
  'Symmetry (พลังงานความร้อนร่วม)',
  'Other (อื่นๆ)'
];

const REGIONS = [
  { 
    name: 'ภาคเหนือ', 
    provinces: [
      'เชียงราย', 'เชียงใหม่', 'น่าน', 'พะเยา', 'แพร่', 'แม่ฮ่องสอน', 'ลำปาง', 'ลำพูน', 'อุตรดิตถ์'
    ] 
  },
  { 
    name: 'ภาคตะวันออกเฉียงเหนือ', 
    provinces: [
      'กาฬสินธุ์', 'ขอนแก่น', 'ชัยภูมิ', 'นครพนม', 'นครราชสีมา', 'บึงกาฬ', 'บุรีรัมย์', 
      'มหาสารคาม', 'มุกดาหาร', 'ยโสธร', 'ร้อยเอ็ด', 'เลย', 'ศรีสะเกษ', 'สกลนคร', 
      'สุรินทร์', 'หนองคาย', 'หนองบัวลำภู', 'อำนาจเจริญ', 'อุดรธานี', 'อุบลราชธานี'
    ] 
  },
  { 
    name: 'ภาคกลาง', 
    provinces: [
      'กรุงเทพมหานคร', 'กำแพงเพชร', 'ชัยนาท', 'นครนายก', 'นครปฐม', 'นครสวรรค์', 'นนทบุรี', 
      'ปทุมธานี', 'พระนครศรีอยุธยา', 'พิจิตร', 'พิษณุโลก', 'เพชรบูรณ์', 'ลพบุรี', 
      'สมุทรปราการ', 'สมุทรสงคราม', 'สมุทรสาคร', 'สระบุรี', 'สิงห์บุรี', 'สุโขทัย', 
      'สุพรรณบุรี', 'อ่างทอง', 'อุทัยธานี'
    ] 
  },
  { 
    name: 'ภาคตะวันออก', 
    provinces: [
      'จันทบุรี', 'ฉะเชิงเทรา', 'ชลบุรี', 'ตราด', 'ปราจีนบุรี', 'ระยอง', 'สระแก้ว'
    ] 
  },
  { 
    name: 'ภาคตะวันตก', 
    provinces: [
      'กาญจนบุรี', 'ตาก', 'ประจวบคีรีขันธ์', 'เพชรบุรี', 'ราชบุรี'
    ] 
  },
  { 
    name: 'ภาคใต้', 
    provinces: [
      'กระบี่', 'ชุมพร', 'ตรัง', 'นครศรีธรรมราช', 'นราธิวาส', 'ปัตตานี', 'พังงา', 
      'พัทลุง', 'ภูเก็ต', 'ยะลา', 'ระนอง', 'สงขลา', 'สตูล', 'สุราษฎร์ธานี'
    ] 
  }
];

export const parseCSV = (text: string) => {
  const lines = [];
  let row = [""];
  let inQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    const nextChar = text[i + 1];

    if (char === '"') {
      if (inQuotes && nextChar === '"') {
        row[row.length - 1] += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (char === ',' && !inQuotes) {
      row.push('');
    } else if ((char === '\r' || char === '\n') && !inQuotes) {
      if (char === '\r' && nextChar === '\n') {
        i++;
      }
      lines.push(row);
      row = [""];
    } else {
      row[row.length - 1] += char;
    }
  }
  if (row.length > 1 || row[0] !== '') {
    lines.push(row);
  }
  return lines;
};

export const PowerPlantManagement: React.FC<{ 
  isDangerZoneUnlocked: boolean;
  setIsDangerZoneUnlocked: (val: boolean) => void;
  setIsUnlockModalOpen: (val: boolean) => void;
  userProfile?: any;
}> = ({ isDangerZoneUnlocked, setIsDangerZoneUnlocked, setIsUnlockModalOpen, userProfile }) => {
  const { t } = useLanguage();
  const [plants, setPlants] = useState<PowerPlant[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [regionFilter, setRegionFilter] = useState('ALL');
  const [typeFilter, setTypeFilter] = useState('ALL');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingPlant, setEditingPlant] = useState<PowerPlant | null>(null);
  const [formData, setFormData] = useState<Partial<PowerPlant>>({
    type: PLANT_TYPES[0],
    region: REGIONS[0].name,
    userType: 'VSPP',
    coordinators: [{ name: '', email: '', phone: '' }],
    gps: { lat: '', lng: '' }
  });
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const [isMapModalOpen, setIsMapModalOpen] = useState(false);
  const [isViewModalOpen, setIsViewModalOpen] = useState(false);
  const [viewingPlant, setViewingPlant] = useState<PowerPlant | null>(null);
  const [plantToDelete, setPlantToDelete] = useState<PowerPlant | null>(null);
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);

  // Batch selection and deletion states
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [batchDeleteType, setBatchDeleteType] = useState<'SELECTED' | 'ALL' | null>(null);
  const [isBatchDeleteModalOpen, setIsBatchDeleteModalOpen] = useState(false);

  const currentUser = userProfile || safeParseLocalStorage<any>('user_profile', null);
  const isAdmin = currentUser?.role === 'ADMIN';

  // CSV Import States
  const [isCsvModalOpen, setIsCsvModalOpen] = useState(false);
  const [csvParsedItems, setCsvParsedItems] = useState<PowerPlant[]>([]);
  const [isUploadingCsv, setIsUploadingCsv] = useState(false);
  const [csvError, setCsvError] = useState<string | null>(null);

  useEffect(() => {
    // Real-time sync from Firestore
    const q = query(collection(db, 'powerPlants'));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const firestorePlants: PowerPlant[] = [];
      snapshot.forEach((doc) => {
        const data = doc.data();
        firestorePlants.push({
          ...data,
          id: doc.id,
          createdAt: data.createdAt?.toDate ? data.createdAt.toDate().toISOString() : data.createdAt
        } as PowerPlant);
      });
      
      setPlants(firestorePlants);
      safeSetLocalStorage('power_plants', firestorePlants, true);
    }, (error) => {
      console.error("Firestore Plants Sync Error:", error);
    });

    return () => unsubscribe();
  }, []);

  const showToast = (message: string, type: 'success' | 'error' = 'success') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 3000);
  };

  const downloadCSVTemplate = () => {
    const headers = 'name,type,capacity,connectionPoint,region,province,lat,lng,coordinator_name,coordinator_email,coordinator_phone';
    const exampleRow = 'โรงไฟฟ้าโซลาร์บางเลน,Solar (โซลาร์เซลล์),8.5,สฟ. บางเลน,ภาคกลาง,นครปฐม,14.0234,100.1823,สมชาย มั่นคง,somchai@email.com,081-234-5678';
    const csvContent = "\uFEFF" + headers + '\n' + exampleRow; // UTF-8 BOM for Thai support in Microsoft Excel
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute("href", url);
    link.setAttribute("download", "pea_powerplant_template.csv");
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleCsvUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setCsvError(null);
    setCsvParsedItems([]);

    const reader = new FileReader();
    reader.onload = (event) => {
      const text = event.target?.result as string;
      if (!text) {
        setCsvError('ไม่พบข้อมูลในไฟล์ หรือไฟล์ว่างเปล่า');
        return;
      }

      try {
        const lines = parseCSV(text);
        if (lines.length <= 1) {
          setCsvError('ไม่พบข้อมูลแถวในไฟล์ CSV กรุณาตรวจสอบรูปแบบไฟล์');
          return;
        }

        const headers = lines[0].map(h => h.trim().toLowerCase());
        
        const findIndex = (keys: string[]) => {
          return headers.findIndex(h => keys.some(k => h.includes(k) || k.includes(h)));
        };

        const idxName = findIndex(['name', 'ชื่อ']);
        const idxType = findIndex(['type', 'ประเภท']);
        const idxCapacity = findIndex(['capacity', 'กำลังผลิต', 'ขนาด']);
        const idxConn = findIndex(['connectionpoint', 'จุดเชื่อม', 'connection']);
        const idxRegion = findIndex(['region', 'ภูมิภาค']);
        const idxProvince = findIndex(['province', 'จังหวัด']);
        const idxLat = findIndex(['lat', 'latitude', 'พิกัดเหนือ', 'lat']);
        const idxLng = findIndex(['lng', 'longitude', 'พิกัดตะวันออก', 'lng']);
        const idxCoordName = findIndex(['coordinator_name', 'coordinatorname', 'ผู้ประสานงาน', 'ชื่อผู้ประสานงาน']);
        const idxCoordEmail = findIndex(['coordinator_email', 'coordinatoremail', 'อีเมล', 'email']);
        const idxCoordPhone = findIndex(['coordinator_phone', 'coordinatorphone', 'เบอร์โทร', 'โทรศัพท์', 'phone']);

        if (idxName === -1) {
          setCsvError('ไม่พบส่วนหัวคอลัมน์ "ชื่อโรงไฟฟ้า" หรือ "name" ในไฟล์ CSV (กรุณาดาวน์โหลดไฟล์ตัวอย่างด้านล่าง)');
          return;
        }

        const parsedPlants: PowerPlant[] = [];
        for (let i = 1; i < lines.length; i++) {
          const row = lines[i];
          if (row.length === 0 || (row.length === 1 && row[0] === '')) continue;

          const name = row[idxName]?.trim() || '';
          if (!name) continue; // Skip empty rows or header spacing offset

          const rawType = idxType !== -1 ? row[idxType]?.trim() || '' : '';
          let matchedType = PLANT_TYPES[0]; // Default
          for (const t of PLANT_TYPES) {
            if (t.toLowerCase().includes(rawType.toLowerCase()) || rawType.toLowerCase().includes(t.split(' ')[0].toLowerCase())) {
              matchedType = t;
              break;
            }
          }

          const rawCapacity = idxCapacity !== -1 ? row[idxCapacity]?.trim() || '0' : '0';
          const capacity = parseFloat(rawCapacity) || 0;

          const connectionPoint = idxConn !== -1 ? row[idxConn]?.trim() || '' : '';
          
          const rawRegion = idxRegion !== -1 ? row[idxRegion]?.trim() || '' : '';
          let matchedRegion = REGIONS[0].name;
          for (const reg of REGIONS) {
            if (reg.name.includes(rawRegion) || rawRegion.includes(reg.name)) {
              matchedRegion = reg.name;
              break;
            }
          }

          const province = idxProvince !== -1 ? row[idxProvince]?.trim() || '' : '';
          const lat = idxLat !== -1 ? row[idxLat]?.trim() || '' : '';
          const lng = idxLng !== -1 ? row[idxLng]?.trim() || '' : '';

          const coordName = idxCoordName !== -1 ? row[idxCoordName]?.trim() || '' : '';
          const coordEmail = idxCoordEmail !== -1 ? row[idxCoordEmail]?.trim() || '' : '';
          const coordPhone = idxCoordPhone !== -1 ? row[idxCoordPhone]?.trim() || '' : '';

          const coordinators = [{
            name: coordName,
            email: coordEmail,
            phone: coordPhone
          }];

          parsedPlants.push({
            id: `pp-${Date.now()}-${i}-${Math.floor(Math.random() * 1000)}`,
            name,
            type: matchedType,
            capacity,
            connectionPoint,
            userType: capacity > 10 ? 'SPP' : 'VSPP',
            region: matchedRegion,
            province,
            coordinators,
            gps: { lat, lng },
            createdAt: new Date().toISOString()
          });
        }

        if (parsedPlants.length === 0) {
          setCsvError('ไม่พบข้อมูลแถวที่ถูกต้องในไฟล์ CSV');
        } else {
          setCsvParsedItems(parsedPlants);
          setCsvError(null);
        }
      } catch (err) {
        console.error(err);
        setCsvError('เกิดข้อผิดพลาดในการประมวลผลไฟล์ CSV');
      }
    };
    reader.onerror = () => {
      setCsvError('เกิดข้อผิดพลาดในการอ่านไฟล์');
    };
    reader.readAsText(file);
  };

  const handleSaveCsvItems = async () => {
    if (csvParsedItems.length === 0) return;
    setIsUploadingCsv(true);

    try {
      const updatedPlants = [...csvParsedItems, ...plants];
      
      // Update local state and storage
      setPlants(updatedPlants);
      safeSetLocalStorage('power_plants', updatedPlants);

      // Save to Firestore asynchronously
      const promises = csvParsedItems.map(async (plant) => {
        const plantRef = doc(db, 'powerPlants', plant.id);
        await setDoc(plantRef, plant);
      });
      await Promise.all(promises);

      showToast(`นำเข้าข้อมูลโรงไฟฟ้าสำเร็จ ทั้งหมด ${csvParsedItems.length} รายการ`, 'success');
      setIsCsvModalOpen(false);
      setCsvParsedItems([]);
    } catch (error) {
      console.error(error);
      showToast('เกิดข้อผิดพลาดในการบันทึกข้อมูลโรงไฟฟ้าไปยัง Firebase', 'error');
    } finally {
      setIsUploadingCsv(false);
    }
  };

  const handleCapacityChange = (val: string) => {
    const cap = parseFloat(val) || 0;
    setFormData({
      ...formData,
      capacity: cap,
      userType: cap > 10 ? 'SPP' : 'VSPP'
    });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    const plantData: PowerPlant = {
      id: editingPlant?.id || `pp-${Date.now()}`,
      name: formData.name || '',
      type: formData.type || PLANT_TYPES[0],
      capacity: formData.capacity || 0,
      connectionPoint: formData.connectionPoint || '',
      userType: formData.userType || 'VSPP',
      region: formData.region || REGIONS[0].name,
      province: formData.province || '',
      coordinators: formData.coordinators || [{ name: '', email: '', phone: '' }],
      gps: formData.gps || { lat: '', lng: '' },
      createdAt: editingPlant?.createdAt || new Date().toISOString(),
    };

    let updatedPlants;
    if (editingPlant) {
      updatedPlants = plants.map(p => p.id === editingPlant.id ? plantData : p);
      showToast('แก้ไขข้อมูลโรงไฟฟ้าสำเร็จ');
    } else {
      updatedPlants = [plantData, ...plants];
      showToast('เพิ่มข้อมูลโรงไฟฟ้าใหม่สำเร็จ');
    }

    setPlants(updatedPlants);
    safeSetLocalStorage('power_plants', updatedPlants);

    // Sync to Firestore
    try {
      const plantRef = doc(db, 'powerPlants', plantData.id);
      await setDoc(plantRef, {
        ...plantData,
        // Ensure some fields match validation rules if necessary
        createdAt: plantData.createdAt || new Date().toISOString()
      }, { merge: true });
    } catch (error) {
      console.error("Firestore Plant Update Error:", error);
    }

    setIsModalOpen(false);
    setEditingPlant(null);
    setFormData({
      type: PLANT_TYPES[0],
      region: REGIONS[0].name,
      userType: 'VSPP',
      coordinators: [{ name: '', email: '', phone: '' }],
      gps: { lat: '', lng: '' }
    });
  };

  const handleDelete = async () => {
    if (!isAdmin) {
      showToast('เฉพาะผู้ดูแลระบบ (Admin) เท่านั้นที่มีสิทธิ์ลบข้อมูล', 'error');
      return;
    }
    if (plantToDelete) {
      const updatedPlants = plants.filter(p => p.id !== plantToDelete.id);
      setPlants(updatedPlants);
      safeSetLocalStorage('power_plants', updatedPlants);

      // Delete from Firestore
      try {
        const plantRef = doc(db, 'powerPlants', plantToDelete.id);
        await deleteDoc(plantRef);
      } catch (error) {
        console.error("Firestore Plant Delete Error:", error);
      }

      showToast('ลบข้อมูลโรงไฟฟ้าแล้ว', 'success');
      setIsDeleteModalOpen(false);
      setPlantToDelete(null);
      setSelectedIds(prev => prev.filter(id => id !== plantToDelete.id));
    }
  };

  const handleToggleSelectAll = () => {
    if (selectedIds.length === filteredPlants.length && filteredPlants.length > 0) {
      setSelectedIds([]);
    } else {
      setSelectedIds(filteredPlants.map(p => p.id));
    }
  };

  const handleToggleSelectOne = (id: string) => {
    setSelectedIds(prev => 
      prev.includes(id) ? prev.filter(item => item !== id) : [...prev, id]
    );
  };

  const handleOpenBatchDeleteModal = (type: 'SELECTED' | 'ALL') => {
    if (!isAdmin) {
      showToast('เฉพาะผู้ดูแลระบบ (Admin) เท่านั้นที่มีสิทธิ์ลบข้อมูล', 'error');
      return;
    }
    if (type === 'SELECTED' && selectedIds.length === 0) {
      showToast('กรุณาเลือกรายการที่ต้องการลบอย่างน้อย 1 รายการ', 'error');
      return;
    }
    if (type === 'ALL' && filteredPlants.length === 0) {
      showToast('ไม่พบรายการข้อมูลที่ต้องการลบ', 'error');
      return;
    }
    setBatchDeleteType(type);
    setIsBatchDeleteModalOpen(true);
  };

  const handleConfirmBatchDelete = async () => {
    if (!isAdmin) {
      showToast('เฉพาะผู้ดูแลระบบ (Admin) เท่านั้นที่มีสิทธิ์ลบข้อมูล', 'error');
      setIsBatchDeleteModalOpen(false);
      return;
    }

    let itemsToDelete: PowerPlant[] = [];
    if (batchDeleteType === 'SELECTED') {
      itemsToDelete = plants.filter(p => selectedIds.includes(p.id));
    } else if (batchDeleteType === 'ALL') {
      itemsToDelete = [...filteredPlants];
    }

    if (itemsToDelete.length === 0) {
      setIsBatchDeleteModalOpen(false);
      return;
    }

    const idsToRemove = new Set(itemsToDelete.map(p => p.id));
    const updatedPlants = plants.filter(p => !idsToRemove.has(p.id));

    setPlants(updatedPlants);
    safeSetLocalStorage('power_plants', updatedPlants);

    try {
      const deletePromises = itemsToDelete.map(plant => 
        deleteDoc(doc(db, 'powerPlants', plant.id))
      );
      await Promise.all(deletePromises);
    } catch (err) {
      console.error("Firestore batch delete error:", err);
    }

    showToast(`ลบข้อมูลเรียบร้อยแล้วจำนวน ${itemsToDelete.length} รายการ`, 'success');
    setSelectedIds(prev => prev.filter(id => !idsToRemove.has(id)));
    setIsBatchDeleteModalOpen(false);
    setBatchDeleteType(null);
  };

  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(10);

  const filteredPlants = plants.filter(p => {
    const matchesSearch = (p.name || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
                         (p.province || '').toLowerCase().includes(searchQuery.toLowerCase());
    const matchesRegion = regionFilter === 'ALL' || p.region === regionFilter;
    const matchesType = typeFilter === 'ALL' || p.type === typeFilter;
    return matchesSearch && matchesRegion && matchesType;
  });

  const paginatedPlants = filteredPlants.slice(
    (currentPage - 1) * itemsPerPage,
    currentPage * itemsPerPage
  );

  const totalCapacity = filteredPlants.reduce((sum, p) => sum + p.capacity, 0);

  const handleMapSelect = (lat: string, lng: string) => {
    setFormData(prev => ({
      ...prev,
      gps: { lat, lng }
    }));
    setIsMapModalOpen(false);
  };

  return (
    <div className="space-y-8 animate-fade-in pb-10 mt-10">
      {/* Header & Primary Actions */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex-1">
          <h2 className="text-3xl font-black text-slate-800 dark:text-white flex items-center gap-3">
            <Zap className="text-[#74045F] dark:text-[#C7911B]" size={32} />
            จัดการข้อมูลโรงไฟฟ้า
          </h2>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">บริหารจัดการข้อมูลพื้นฐาน พิกัดที่ตั้ง และรายละเอียดผู้ประสานงานของโรงไฟฟ้าในเครือข่าย</p>
        </div>

        <div className="flex flex-wrap items-center justify-start md:justify-end gap-3 lg:gap-4">
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2 px-6 py-3 bg-white dark:bg-[#030712] border border-slate-100 dark:border-white/5 rounded-2xl shadow-sm">
                <div className="flex flex-col">
                    <span className="text-[8px] font-black text-rose-500 uppercase tracking-[0.2em] leading-none mb-1 text-right">{t('admin.security_panel')}</span>
                    <span className="text-[10px] font-bold text-slate-600 dark:text-slate-400">{t('admin.danger_zone')}</span>
                </div>
                <button 
                    onClick={() => {
                        if (isDangerZoneUnlocked) setIsDangerZoneUnlocked(false);
                        else setIsUnlockModalOpen(true);
                    }}
                    className={`ml-2 w-12 h-6 rounded-full transition-all relative flex items-center px-1 ${isDangerZoneUnlocked ? 'bg-rose-500 shadow-lg shadow-rose-500/20' : 'bg-slate-200 dark:bg-white/10'}`}
                >
                    <motion.div 
                        animate={{ x: isDangerZoneUnlocked ? 24 : 0 }}
                        className={`w-4 h-4 rounded-full bg-white flex items-center justify-center shadow-sm ${isDangerZoneUnlocked ? 'text-rose-500' : 'text-slate-400'}`}
                    >
                        {isDangerZoneUnlocked ? <Lock size={10} /> : <ShieldAlert size={10} />}
                    </motion.div>
                </button>
            </div>

            <button 
              onClick={() => {
                setCsvParsedItems([]);
                setCsvError(null);
                setIsCsvModalOpen(true);
              }}
              className="bg-slate-50 hover:bg-slate-100 dark:bg-white/5 dark:hover:bg-white/10 text-slate-800 dark:text-white border border-slate-200 dark:border-white/10 font-bold py-3 px-6 rounded-2xl flex items-center justify-center gap-2 transition-all active:scale-95 group whitespace-nowrap"
            >
              <Upload size={18} className="group-hover:-translate-y-0.5 transition-transform" /> 
              นำเข้า CSV
            </button>

            <button 
              onClick={() => {
                setEditingPlant(null);
                setFormData({
                  type: PLANT_TYPES[0],
                  region: REGIONS[0].name,
                  userType: 'VSPP',
                  coordinators: [{ name: '', email: '', phone: '' }],
                  gps: { lat: '', lng: '' }
                });
                setIsModalOpen(true);
              }}
              className="bg-gradient-to-r from-[#74045F] to-[#C7911B] text-white font-bold py-3 px-6 rounded-2xl flex items-center justify-center gap-2 shadow-lg shadow-[#74045F]/20 dark:shadow-[#C7911B]/20 transition-all active:scale-95 group whitespace-nowrap"
            >
              <Plus size={18} className="group-hover:rotate-90 transition-transform" /> 
              เพิ่มโรงไฟฟ้าใหม่
            </button>
          </div>
        </div>
      </div>

      {/* Filter Bar */}
      <div className="bg-white dark:bg-[#030712] p-2 rounded-[2rem] border border-slate-100 dark:border-white/5 shadow-sm flex flex-col lg:flex-row gap-2">
        <div className="flex-1 relative">
          <div className="absolute inset-y-0 left-4 flex items-center text-slate-400">
            <Search size={18} />
          </div>
          <input 
            type="text" 
            placeholder={t('admin.search')}
            value={searchQuery}
            onChange={(e) => {
              setSearchQuery(e.target.value);
              setCurrentPage(1);
            }}
            className="w-full bg-slate-50 dark:bg-white/5 rounded-2xl pl-12 pr-4 py-3 text-sm font-medium focus:outline-none transition-all placeholder:text-slate-400"
          />
        </div>

        <div className="flex flex-col sm:flex-row gap-2">
          <div className="relative">
            <div className="absolute inset-y-0 left-4 flex items-center text-slate-400 pointer-events-none">
              <Globe size={16} />
            </div>
            <select 
              value={regionFilter}
              onChange={(e) => {
                setRegionFilter(e.target.value);
                setCurrentPage(1);
              }}
              className="pl-11 pr-8 py-3 bg-slate-50 dark:bg-white/5 rounded-2xl text-xs font-black uppercase tracking-widest appearance-none outline-none focus:ring-2 focus:ring-[#74045F]/20"
            >
              <option value="ALL">ทุกภูมิภาค</option>
              {REGIONS.map(r => <option key={r.name} value={r.name}>{r.name}</option>)}
            </select>
          </div>

          <div className="relative">
            <div className="absolute inset-y-0 left-4 flex items-center text-slate-400 pointer-events-none">
              <Filter size={16} />
            </div>
            <select 
              value={typeFilter}
              onChange={(e) => {
                setTypeFilter(e.target.value);
                setCurrentPage(1);
              }}
              className="pl-11 pr-8 py-3 bg-slate-50 dark:bg-white/5 rounded-2xl text-xs font-black uppercase tracking-widest appearance-none outline-none focus:ring-2 focus:ring-[#74045F]/20"
            >
              <option value="ALL">ทุกประเภทพลังงาน</option>
              {PLANT_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
            </select>
          </div>
        </div>
      </div>

      {/* Batch Selection & Deletion Control Bar */}
      {isDangerZoneUnlocked ? (
        <div className="bg-slate-50 dark:bg-white/5 p-4 rounded-2xl border border-slate-200/60 dark:border-white/10 flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={handleToggleSelectAll}
              className="flex items-center gap-2.5 px-3.5 py-2 bg-white dark:bg-slate-800 border border-slate-200 dark:border-white/10 rounded-xl text-xs font-bold text-slate-700 dark:text-slate-200 hover:border-[#74045F] transition-all shadow-sm"
            >
              <input 
                type="checkbox"
                checked={selectedIds.length > 0 && selectedIds.length === filteredPlants.length}
                onChange={() => {}}
                className="w-4 h-4 rounded text-[#74045F] accent-[#74045F] cursor-pointer"
              />
              <span>{selectedIds.length === filteredPlants.length && filteredPlants.length > 0 ? 'ยกเลิกการเลือกทั้งหมด' : 'เลือกทั้งหมด'}</span>
            </button>
            <span className="text-xs font-bold text-slate-500 dark:text-slate-400">
              เลือกอยู่ <span className="text-[#74045F] dark:text-[#C7911B] font-black">{selectedIds.length}</span> จาก <span className="font-bold">{filteredPlants.length}</span> รายการ
            </span>
          </div>

          <div className="flex items-center gap-2">
            {isAdmin ? (
              <>
                <button
                  type="button"
                  onClick={() => handleOpenBatchDeleteModal('SELECTED')}
                  disabled={selectedIds.length === 0}
                  className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-black uppercase tracking-wider transition-all shadow-sm ${
                    selectedIds.length > 0
                      ? 'bg-rose-500 text-white hover:bg-rose-600 shadow-rose-500/20 active:scale-95 cursor-pointer'
                      : 'bg-slate-200 dark:bg-slate-800 text-slate-400 cursor-not-allowed opacity-60'
                  }`}
                  title="ลบเฉพาะรายการที่เลือก"
                >
                  <Trash2 size={15} />
                  ลบเฉพาะที่เลือก ({selectedIds.length})
                </button>
                <button
                  type="button"
                  onClick={() => handleOpenBatchDeleteModal('ALL')}
                  disabled={filteredPlants.length === 0}
                  className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-black uppercase tracking-wider transition-all shadow-sm ${
                    filteredPlants.length > 0
                      ? 'bg-rose-700 text-white hover:bg-rose-800 shadow-rose-700/20 active:scale-95 cursor-pointer'
                      : 'bg-slate-200 dark:bg-slate-800 text-slate-400 cursor-not-allowed opacity-60'
                  }`}
                  title="ลบรายการทั้งหมดที่ตรงกับตัวกรอง"
                >
                  <Trash2 size={15} />
                  ลบทั้งหมด ({filteredPlants.length})
                </button>
              </>
            ) : (
              <div className="flex items-center gap-2 px-3.5 py-2 bg-amber-500/10 border border-amber-500/20 rounded-xl text-amber-600 dark:text-amber-400 text-xs font-bold">
                <Lock size={14} />
                <span>สิทธิ์การลบเฉพาะผู้ดูแลระบบ (Admin) เท่านั้น</span>
              </div>
            )}
          </div>
        </div>
      ) : (
        <div className="bg-amber-500/5 border border-amber-500/20 p-3.5 rounded-2xl flex flex-wrap items-center justify-between gap-3 text-xs text-amber-700 dark:text-amber-400">
          <div className="flex items-center gap-2.5 font-bold">
            <Lock size={16} className="text-amber-500 flex-shrink-0" />
            <span>ฟังก์ชันเลือกและลบข้อมูลแบบกลุ่ม (Batch Delete) ถูกจำกัดเฉพาะเมื่อปลดล็อก Danger Zone เท่านั้น</span>
          </div>
          <button
            type="button"
            onClick={() => setIsUnlockModalOpen(true)}
            className="px-3.5 py-1.5 bg-amber-500 text-white rounded-xl font-extrabold text-[11px] uppercase tracking-wider hover:bg-amber-600 transition-all shadow-sm flex items-center gap-1.5"
          >
            <Lock size={12} />
            ปลดล็อก Danger Zone
          </button>
        </div>
      )}

      {/* Grid List */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        <AnimatePresence mode="popLayout">
          {paginatedPlants.map((plant) => (
            <motion.div 
              key={plant.id}
              layout
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.9 }}
              className={`glass-panel group overflow-hidden bg-white dark:bg-white/5 border rounded-[2rem] hover:shadow-2xl hover:shadow-[#74045F]/5 dark:hover:shadow-none transition-all duration-300 flex flex-col ${
                selectedIds.includes(plant.id) 
                  ? 'border-[#74045F] dark:border-[#C7911B] ring-2 ring-[#74045F]/20 dark:ring-[#C7911B]/20 bg-[#74045F]/[0.02]' 
                  : 'border-slate-100 dark:border-white/5'
              }`}
            >
              {/* Card Header Area */}
              <div className="px-6 pt-6 flex justify-between items-start">
                <div className="flex items-center gap-3">
                  {isDangerZoneUnlocked && (
                    <input 
                      type="checkbox"
                      checked={selectedIds.includes(plant.id)}
                      onChange={(e) => {
                        e.stopPropagation();
                        handleToggleSelectOne(plant.id);
                      }}
                      className="w-5 h-5 rounded-md border-2 border-slate-300 dark:border-slate-600 text-[#74045F] accent-[#74045F] cursor-pointer"
                      title="เลือกรายการนี้"
                    />
                  )}
                  <div className={`p-3 rounded-2xl bg-white dark:bg-[#030712] shadow-sm border border-slate-100 dark:border-white/5 text-[#74045F] dark:text-[#C7911B]`}>
                    {plant.type.includes('Solar') ? <Zap size={24} /> : 
                     plant.type.includes('Wind') ? <Radio size={24} /> : 
                     <Battery size={24} />}
                  </div>
                </div>
                
                <div className="flex gap-1.5 opacity-0 group-hover:opacity-100 transition-opacity translate-y-1 group-hover:translate-y-0 duration-300">
                  <button 
                    onClick={(e) => { e.stopPropagation(); setViewingPlant(plant); setIsViewModalOpen(true); }}
                    className="w-10 h-10 rounded-xl bg-white dark:bg-slate-800 shadow-sm border border-slate-100 dark:border-white/10 flex items-center justify-center text-slate-400 hover:text-indigo-500 hover:border-indigo-500/30 transition-all"
                    title="ดูรายละเอียด"
                  >
                    <Eye size={16} />
                  </button>
                  <button 
                    onClick={(e) => { 
                      e.stopPropagation(); 
                      setEditingPlant(plant); 
                      setFormData({
                        ...plant,
                        coordinators: plant.coordinators || [(plant as any).coordinator || { name: '', email: '', phone: '' }]
                      }); 
                      setIsModalOpen(true); 
                    }}
                    className="w-10 h-10 rounded-xl bg-white dark:bg-slate-800 shadow-sm border border-slate-100 dark:border-white/10 flex items-center justify-center text-slate-400 hover:text-[#74045F] hover:border-[#74045F]/30 transition-all"
                  >
                    <Edit2 size={16} />
                  </button>
                  {isDangerZoneUnlocked && (
                    <button 
                      onClick={(e) => { e.stopPropagation(); setPlantToDelete(plant); setIsDeleteModalOpen(true); }}
                      className="w-10 h-10 rounded-xl bg-white dark:bg-slate-800 shadow-sm border border-slate-100 dark:border-white/10 flex items-center justify-center text-slate-400 hover:text-rose-500 hover:border-rose-500/30 transition-all"
                      title="ลบข้อมูล"
                    >
                      <Trash2 size={16} />
                    </button>
                  )}
                </div>
              </div>

              {/* Main Content */}
              <div className="px-6 py-6 flex-1 flex flex-col">
                <div className="mb-6">
                  <h3 className="text-xl font-black text-slate-800 dark:text-white tracking-tight leading-tight line-clamp-1 mb-2 group-hover:text-[#74045F] dark:group-hover:text-[#C7911B] transition-colors">
                    {plant.name}
                  </h3>
                  <div className="flex flex-wrap gap-2">
                    <span className="px-3 py-1 rounded-full bg-slate-100 dark:bg-white/5 text-[9px] font-black text-slate-500 dark:text-slate-400 uppercase tracking-widest">
                      {plant.type.split(' ')[0]}
                    </span>
                    <span className={`px-3 py-1 rounded-full text-[9px] font-black uppercase tracking-widest ${plant.userType === 'SPP' ? 'bg-indigo-500/10 text-indigo-500' : 'bg-emerald-500/10 text-emerald-500'}`}>
                      {plant.userType}
                    </span>
                    <span className="px-3 py-1 rounded-full bg-slate-100 dark:bg-white/5 text-[9px] font-black text-slate-500 dark:text-slate-400 uppercase tracking-widest">
                      {plant.region}
                    </span>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4 p-5 rounded-2xl bg-slate-50 dark:bg-white/5 border border-slate-100 dark:border-white/5 mb-6">
                  <div className="space-y-1">
                    <div className="text-[10px] font-black text-slate-400 uppercase tracking-widest">กำลังผลิต</div>
                    <div className="text-xl font-black text-slate-800 dark:text-white">
                      {plant.capacity} <span className="text-xs font-bold text-[#74045F] dark:text-[#C7911B]">MW</span>
                    </div>
                  </div>
                  <div className="space-y-1">
                    <div className="text-[10px] font-black text-slate-400 uppercase tracking-widest">พิกัด/จังหวัด</div>
                    <div className="text-[11px] font-black text-slate-600 dark:text-slate-300 uppercase truncate">
                      {plant.province}
                    </div>
                  </div>
                </div>

                <div className="space-y-3 mt-auto pt-4 border-t border-slate-100 dark:border-white/5">
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-full bg-slate-100 dark:bg-white/10 flex items-center justify-center text-slate-400">
                      <User size={14} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-[9px] font-black text-slate-400 uppercase tracking-widest">ผู้ประสานงาน</div>
                      <div className="text-xs font-bold text-slate-700 dark:text-slate-300 truncate">
                        {plant.coordinators?.[0]?.name || (plant as any).coordinator?.name || '-'}
                        {plant.coordinators && plant.coordinators.length > 1 && ` (+${plant.coordinators.length - 1})`}
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-full bg-slate-100 dark:bg-white/10 flex items-center justify-center text-slate-400">
                      <Navigation size={14} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-[9px] font-black text-slate-400 uppercase tracking-widest">พิกัด GPS</div>
                      <div className="text-xs font-bold text-[#74045F] dark:text-[#C7911B]">{plant.gps.lat}, {plant.gps.lng}</div>
                    </div>
                  </div>
                </div>
              </div>
              
              {/* Bottom Decoration */}
              <div className="h-1.5 w-full bg-gradient-to-r from-[#74045F] via-[#C7911B] to-[#74045F] opacity-0 group-hover:opacity-100 transition-opacity" />
            </motion.div>
          ))}
        </AnimatePresence>
      </div>

      <PaginationControls
        currentPage={currentPage}
        onPageChange={setCurrentPage}
        totalItems={filteredPlants.length}
        itemsPerPage={itemsPerPage}
        onItemsPerPageChange={setItemsPerPage}
        pageSizeOptions={[5, 10, 20, 50, 100]}
      />

      {/* Empty State */}
      {filteredPlants.length === 0 && (
        <div className="py-20 flex flex-col items-center justify-center text-center space-y-6">
           <div className="w-24 h-24 rounded-full bg-slate-50 dark:bg-white/5 flex items-center justify-center text-slate-300">
              <Zap size={48} />
           </div>
           <div>
              <h3 className="text-xl font-bold text-slate-800 dark:text-white">ไม่พบข้อมูลโรงไฟฟ้า</h3>
              <p className="text-slate-500">ลองใช้คำค้นหาอื่น หรือเพิ่มข้อมูลใหม่เข้าไปในระบบ</p>
           </div>
        </div>
      )}

      {/* Add/Edit Modal */}
      <AnimatePresence>
        {isModalOpen && (
          <div className="fixed inset-0 xl:left-72 xl:top-[65px] z-[200] flex items-center justify-center p-4 sm:p-6 md:p-10 transition-all duration-300">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setIsModalOpen(false)}
              className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm"
            />
            <motion.div 
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="glass-panel w-full max-w-3xl lg:max-w-4xl bg-white dark:bg-[#030712] rounded-[2rem] overflow-hidden shadow-2xl relative z-10 flex flex-col max-h-[68vh] sm:max-h-[72vh]"
            >
              <div className="p-5 border-b border-gray-200 dark:border-white/5 bg-white/80 dark:bg-black/20 flex items-center justify-between flex-shrink-0">
                <div className="flex items-center gap-4">
                  <div className="w-12 h-12 rounded-2xl bg-[#74045F]/10 dark:bg-[#C7911B]/10 flex items-center justify-center text-[#74045F] dark:text-[#C7911B]">
                    <Zap size={24} />
                  </div>
                  <div>
                    <h2 className="text-xl font-black text-slate-800 dark:text-white tracking-tight">{editingPlant ? 'แก้ไขโรงไฟฟ้า' : 'เพิ่มโรงไฟฟ้าใหม่'}</h2>
                    <p className="text-xs text-slate-500 uppercase tracking-widest font-bold mt-0.5 whitespace-nowrap overflow-hidden text-ellipsis max-w-[200px] sm:max-w-md">
                      {editingPlant ? editingPlant.name : 'กรอกรายละเอียดเพื่อบันทึกเข้าสู่ระบบ'}
                    </p>
                  </div>
                </div>
                <button 
                  onClick={() => setIsModalOpen(false)}
                  className="w-10 h-10 rounded-xl hover:bg-slate-100 dark:hover:bg-white/5 flex items-center justify-center text-slate-400 hover:text-slate-600 transition-all"
                >
                  <X size={20} />
                </button>
              </div>

              <form onSubmit={handleSubmit} className="flex-1 overflow-hidden flex flex-col">
                <div className="p-6 overflow-y-auto flex-1 custom-scrollbar space-y-5">
                  <div className="relative">
                    <div className="absolute left-4 top-4 bottom-0 w-0.5 bg-slate-100 dark:bg-white/5 hidden md:block" />
                    
                    {/* Basic Info */}
                    <section className="relative z-10 md:pl-12 space-y-3">
                      <div className="absolute left-0 top-0 w-8 h-8 rounded-full bg-[#74045F]/10 dark:bg-[#C7911B]/10 text-[#74045F] dark:text-[#C7911B] md:flex items-center justify-center font-black text-xs ring-4 ring-white dark:ring-[#030712] hidden">
                        1
                      </div>
                      <div>
                        <h3 className="text-sm font-black uppercase tracking-[0.2em] text-[#74045F] dark:text-[#C7911B]">ข้อมูลพื้นฐานโรงไฟฟ้า</h3>
                        <p className="text-xs text-slate-400 mt-1 font-medium">ระบุชื่อ ประเภท และขนาดกำลังผลิตติดตั้ง</p>
                      </div>

                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div className="space-y-1">
                           <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">ชื่อโรงไฟฟ้า <span className="text-rose-500">*</span></label>
                           <input 
                             required
                             type="text" 
                             value={formData.name || ''}
                             onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                             placeholder="ระบุชื่อโรงไฟฟ้า..."
                             className="w-full bg-slate-50 dark:bg-white/5 border border-slate-200 dark:border-white/10 focus:border-[#74045F]/50 dark:focus:border-[#C7911B]/50 rounded-2xl px-5 py-2.5 text-sm font-bold focus:outline-none transition-all shadow-sm"
                           />
                        </div>
                        <div className="space-y-1">
                           <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">ประเภทแหล่งพลังงาน</label>
                           <div className="relative">
                             <select 
                               value={formData.type}
                               onChange={(e) => setFormData({ ...formData, type: e.target.value })}
                               className="w-full bg-slate-50 dark:bg-white/5 border border-slate-200 dark:border-white/10 focus:border-[#74045F]/50 dark:focus:border-[#C7911B]/50 rounded-2xl px-5 py-2.5 text-sm font-bold focus:outline-none transition-all appearance-none shadow-sm"
                             >
                               {PLANT_TYPES.map(type => <option key={type} value={type}>{type}</option>)}
                             </select>
                             <div className="absolute right-5 top-1/2 -translate-y-1/2 pointer-events-none text-slate-400">
                                <Filter size={16} />
                             </div>
                           </div>
                        </div>
                        <div className="space-y-1">
                           <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">กำลังผลิตติดตั้ง (MW)</label>
                           <div className="relative">
                              <input 
                                required
                                type="number" 
                                step="0.01"
                                value={formData.capacity || ''}
                                onChange={(e) => handleCapacityChange(e.target.value)}
                                placeholder="0.00"
                                className="w-full bg-slate-50 dark:bg-white/5 border border-slate-200 dark:border-white/10 focus:border-[#74045F]/50 dark:focus:border-[#C7911B]/50 rounded-2xl px-5 py-2.5 text-sm font-bold focus:outline-none transition-all shadow-sm"
                              />
                              <div className="absolute right-5 top-1/2 -translate-y-1/2 text-[10px] font-black text-[#74045F] dark:text-[#C7911B] uppercase tracking-widest bg-white dark:bg-slate-800 px-2 py-1 rounded-md shadow-sm">MW</div>
                           </div>
                        </div>
                        <div className="space-y-1">
                           <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">ประเภทคู่สัญญา</label>
                           <div className="w-full bg-slate-100/50 dark:bg-white/[0.02] border border-slate-200 dark:border-white/10 rounded-2xl px-5 py-2.5 text-sm font-black text-[#74045F] dark:text-[#C7911B] flex items-center justify-between">
                              <span>{formData.userType}</span>
                              {formData.userType === 'SPP' ? <Building2 size={18} /> : <User size={18} />}
                           </div>
                        </div>
                      </div>
                    </section>

                    {/* Location Info */}
                    <section className="relative z-10 md:pl-12 space-y-3 mt-4">
                      <div className="absolute left-0 top-0 w-8 h-8 rounded-full bg-indigo-500/10 text-indigo-500 md:flex items-center justify-center font-black text-xs ring-4 ring-white dark:ring-[#030712] hidden">
                        2
                      </div>
                      <div className="flex items-center justify-between">
                        <div>
                          <h3 className="text-sm font-black uppercase tracking-[0.2em] text-indigo-500">ที่ตั้งและพิกัด</h3>
                          <p className="text-xs text-slate-400 mt-1 font-medium">ระบุจุดเชื่อมโยงจ่ายไฟ จังหวัด และพิกัดทางภูมิศาสตร์</p>
                        </div>
                        <button 
                          type="button"
                          onClick={() => setIsMapModalOpen(true)}
                          className="flex items-center gap-2 px-4 py-2 bg-indigo-500/10 text-indigo-500 rounded-xl text-[10px] font-black uppercase tracking-widest hover:bg-indigo-500/20 transition-all border border-indigo-500/20 shadow-sm"
                        >
                          <MapPin size={14} />
                          เลือกจากแผนที่
                        </button>
                      </div>

                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div className="space-y-1">
                           <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">จุดเชื่อมโยงวงจร (Connection Point)</label>
                           <input 
                             type="text" 
                             value={formData.connectionPoint || ''}
                             onChange={(e) => setFormData({ ...formData, connectionPoint: e.target.value })}
                             placeholder="เช่น สฟ. นครปฐม 1..."
                             className="w-full bg-slate-50 dark:bg-white/5 border border-slate-200 dark:border-white/10 focus:border-indigo-500/50 rounded-2xl px-5 py-2.5 text-sm font-bold focus:outline-none transition-all shadow-sm"
                           />
                        </div>
                        <div className="grid grid-cols-2 gap-4">
                           <div className="space-y-1">
                              <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">ภูมิภาค</label>
                              <select 
                                value={formData.region}
                                onChange={(e) => setFormData({ ...formData, region: e.target.value, province: REGIONS.find(r => r.name === e.target.value)?.provinces[0] || '' })}
                                className="w-full bg-slate-50 dark:bg-white/5 border border-slate-200 dark:border-white/10 focus:border-indigo-500/50 rounded-2xl px-5 py-2.5 text-sm font-bold focus:outline-none transition-all appearance-none shadow-sm"
                              >
                                {REGIONS.map(r => <option key={r.name} value={r.name}>{r.name}</option>)}
                              </select>
                           </div>
                           <div className="space-y-1">
                              <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">จังหวัด</label>
                              <select 
                                value={formData.province}
                                onChange={(e) => setFormData({ ...formData, province: e.target.value })}
                                className="w-full bg-slate-50 dark:bg-white/5 border border-slate-200 dark:border-white/10 focus:border-indigo-500/50 rounded-2xl px-5 py-2.5 text-sm font-bold focus:outline-none transition-all appearance-none shadow-sm"
                              >
                                <option value="">เลือกจังหวัด...</option>
                                {REGIONS.find(r => r.name === formData.region)?.provinces.map(p => <option key={p} value={p}>{p}</option>)}
                              </select>
                           </div>
                        </div>
                        <div className="space-y-1">
                           <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">พิกัด Lat/Lng</label>
                           <div className="grid grid-cols-2 gap-2">
                              <input 
                                type="text" 
                                value={formData.gps?.lat || ''}
                                onChange={(e) => setFormData({ ...formData, gps: { ...formData.gps!, lat: e.target.value } })}
                                placeholder="Latitude"
                                className="w-full bg-slate-50 dark:bg-white/5 border border-slate-200 dark:border-white/10 focus:border-indigo-500/50 rounded-2xl px-5 py-2.5 text-sm font-bold focus:outline-none transition-all shadow-sm"
                              />
                              <input 
                                type="text" 
                                value={formData.gps?.lng || ''}
                                onChange={(e) => setFormData({ ...formData, gps: { ...formData.gps!, lng: e.target.value } })}
                                placeholder="Longitude"
                                className="w-full bg-slate-50 dark:bg-white/5 border border-slate-200 dark:border-white/10 focus:border-indigo-500/50 rounded-2xl px-5 py-2.5 text-sm font-bold focus:outline-none transition-all shadow-sm"
                              />
                           </div>
                        </div>
                      </div>
                    </section>

                    {/* Coordinator Info */}
                    <section className="relative z-10 md:pl-12 space-y-3 mt-4">
                      <div className="absolute left-0 top-0 w-8 h-8 rounded-full bg-emerald-500/10 text-emerald-500 md:flex items-center justify-center font-black text-xs ring-4 ring-white dark:ring-[#030712] hidden">
                        3
                      </div>
                      <div className="flex items-center justify-between">
                        <div>
                          <h3 className="text-sm font-black uppercase tracking-[0.2em] text-emerald-500">ข้อมูลผู้ประสานงาน</h3>
                          <p className="text-xs text-slate-400 mt-1 font-medium">ระบุชื่อและช่องทางการติดต่อบุคคลที่รับผิดชอบ</p>
                        </div>
                        <button 
                          type="button"
                          onClick={() => {
                            const newCoordinators = [...(formData.coordinators || []), { name: '', email: '', phone: '' }];
                            setFormData({ ...formData, coordinators: newCoordinators });
                          }}
                          className="flex items-center gap-2 px-4 py-2 bg-emerald-500/10 text-emerald-500 rounded-xl text-[10px] font-black uppercase tracking-widest hover:bg-emerald-500/20 transition-all border border-emerald-500/20 shadow-sm"
                        >
                          <Plus size={14} />
                          เพิ่มผู้ประสานงาน
                        </button>
                      </div>

                      <div className="space-y-4">
                        {(formData.coordinators || [{ name: '', email: '', phone: '' }]).map((coord, idx) => (
                          <div key={idx} className="relative p-5 bg-slate-50/50 dark:bg-white/[0.02] border border-slate-100 dark:border-white/5 rounded-[1.5rem] group">
                            {idx > 0 && (
                              <button 
                                type="button"
                                onClick={() => {
                                  const newCoordinators = (formData.coordinators || []).filter((_, i) => i !== idx);
                                  setFormData({ ...formData, coordinators: newCoordinators });
                                }}
                                className="absolute -top-2 -right-2 w-8 h-8 rounded-full bg-white dark:bg-slate-800 border border-slate-200 dark:border-white/10 text-rose-500 flex items-center justify-center shadow-lg hover:scale-110 transition-transform z-10"
                              >
                                <X size={14} />
                              </button>
                            )}
                            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                              <div className="space-y-1">
                                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">ชื่อ-นามสกุล</label>
                                <div className="relative">
                                  <input 
                                    type="text" 
                                    value={coord.name}
                                    onChange={(e) => {
                                      const newCoords = [...(formData.coordinators || [])];
                                      newCoords[idx].name = e.target.value;
                                      setFormData({ ...formData, coordinators: newCoords });
                                    }}
                                    placeholder="ชื่อผู้ประสานงาน..."
                                    className="w-full bg-white dark:bg-[#030712] border border-slate-200 dark:border-white/10 focus:border-emerald-500/50 rounded-2xl px-10 py-2.5 text-sm font-bold focus:outline-none transition-all shadow-sm"
                                  />
                                  <User size={14} className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" />
                                </div>
                              </div>
                              <div className="space-y-1">
                                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">อีเมลติดต่อ</label>
                                <div className="relative">
                                  <input 
                                    type="email" 
                                    value={coord.email}
                                    onChange={(e) => {
                                      const newCoords = [...(formData.coordinators || [])];
                                      newCoords[idx].email = e.target.value;
                                      setFormData({ ...formData, coordinators: newCoords });
                                    }}
                                    placeholder="example@mail.com"
                                    className="w-full bg-white dark:bg-[#030712] border border-slate-200 dark:border-white/10 focus:border-emerald-500/50 rounded-2xl px-10 py-2.5 text-sm font-bold focus:outline-none transition-all shadow-sm"
                                  />
                                  <Mail size={14} className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" />
                                </div>
                              </div>
                              <div className="space-y-1">
                                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">เบอร์โทรศัพท์</label>
                                <div className="relative">
                                  <input 
                                    type="tel" 
                                    value={coord.phone}
                                    onChange={(e) => {
                                      const newCoords = [...(formData.coordinators || [])];
                                      newCoords[idx].phone = e.target.value;
                                      setFormData({ ...formData, coordinators: newCoords });
                                    }}
                                    placeholder="08X-XXXXXXX"
                                    className="w-full bg-white dark:bg-[#030712] border border-slate-200 dark:border-white/10 focus:border-emerald-500/50 rounded-2xl px-10 py-2.5 text-sm font-bold focus:outline-none transition-all shadow-sm"
                                  />
                                  <Phone size={14} className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" />
                                </div>
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    </section>
                  </div>
                </div>
 
                <div className="p-4 border-t border-gray-100 dark:border-white/5 bg-slate-50/50 dark:bg-white/[0.02] flex flex-col sm:flex-row gap-3 flex-shrink-0">
                  <button 
                    type="button"
                    onClick={() => setIsModalOpen(false)}
                    className="flex-1 bg-white dark:bg-white/5 border border-slate-200 dark:border-white/10 text-slate-500 dark:text-slate-400 font-bold py-2.5 rounded-2xl hover:bg-slate-100 dark:hover:bg-white/10 transition-all shadow-sm"
                  >
                    ยกเลิกขั้นตอน
                  </button>
                  <button 
                    type="submit"
                    className="flex-[2] bg-gradient-to-r from-[#74045F] to-[#C7911B] text-white font-black text-xs uppercase tracking-widest py-2.5 rounded-2xl shadow-xl shadow-[#74045F]/20 transition-all active:scale-95 flex items-center justify-center gap-3"
                  >
                    {editingPlant ? 'บันทึกการแก้ไขโรงไฟฟ้า' : 'ยืนยันการเพิ่มโรงไฟฟ้า'}
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* View Details Modal */}
      <AnimatePresence>
        {isViewModalOpen && viewingPlant && (
          <div className="fixed inset-0 xl:left-72 xl:top-[65px] z-[250] flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setIsViewModalOpen(false)}
              className="absolute inset-0 bg-slate-900/60 backdrop-blur-md"
            />
            <motion.div 
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="glass-panel w-full max-w-4xl bg-white dark:bg-[#030712] rounded-[2.5rem] overflow-hidden shadow-2xl relative z-10 flex flex-col max-h-[85vh]"
            >
              <div className="p-8 border-b border-gray-200 dark:border-white/5 bg-white/80 dark:bg-black/20 flex items-center justify-between flex-shrink-0">
                <div className="flex items-center gap-5">
                  <div className="w-14 h-14 rounded-2xl bg-[#74045F]/10 dark:bg-[#C7911B]/10 flex items-center justify-center text-[#74045F] dark:text-[#C7911B] ring-1 ring-[#74045F]/20">
                    <Zap size={28} />
                  </div>
                  <div>
                    <h2 className="text-2xl font-black text-slate-800 dark:text-white tracking-tight">{viewingPlant.name}</h2>
                    <div className="flex items-center gap-2 mt-1">
                      <span className="px-2.5 py-0.5 rounded-full bg-slate-100 dark:bg-white/5 text-[10px] font-black uppercase tracking-widest text-slate-400">ID: {viewingPlant.id.slice(0, 8)}</span>
                      <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase tracking-widest shadow-sm ${
                        viewingPlant.userType === 'SPP' ? 'bg-indigo-500 text-white' : 'bg-emerald-500 text-white'
                      }`}>
                        {viewingPlant.userType}
                      </span>
                    </div>
                  </div>
                </div>
                <button 
                  onClick={() => setIsViewModalOpen(false)}
                  className="w-12 h-12 rounded-2xl hover:bg-slate-100 dark:hover:bg-white/5 text-slate-400 transition-all flex items-center justify-center"
                >
                  <X size={24} />
                </button>
              </div>

              <div className="p-8 overflow-y-auto flex-1 custom-scrollbar space-y-10">
                {/* 1. Basic Information */}
                <div>
                  <div className="flex items-center gap-3 mb-6">
                    <div className="w-8 h-8 rounded-full bg-slate-100 dark:bg-white/10 flex items-center justify-center text-slate-400 font-black text-xs">1</div>
                    <h3 className="text-sm font-black uppercase tracking-[0.2em] text-[#74045F] dark:text-[#C7911B]">รายละเอียดโรงไฟฟ้า</h3>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-8 md:pl-11">
                    <div className="space-y-1">
                      <div className="text-[10px] font-black text-slate-400 uppercase tracking-widest">ประเภทแหล่งพลังงาน</div>
                      <div className="text-sm font-bold text-slate-700 dark:text-slate-200">{viewingPlant.type}</div>
                    </div>
                    <div className="space-y-1">
                      <div className="text-[10px] font-black text-slate-400 uppercase tracking-widest">กำลังผลิตติดตั้ง</div>
                      <div className="text-sm font-black text-[#74045F] dark:text-[#C7911B]">{viewingPlant.capacity.toLocaleString()} MW</div>
                    </div>
                    <div className="space-y-1">
                      <div className="text-[10px] font-black text-slate-400 uppercase tracking-widest">วันที่เริ่มสัญญาระบบ</div>
                      <div className="text-sm font-bold text-slate-700 dark:text-slate-200">{new Date(viewingPlant.createdAt).toLocaleDateString('th-TH', { year: 'numeric', month: 'long', day: 'numeric' })}</div>
                    </div>
                  </div>
                </div>

                {/* 2. Location Info */}
                <div className="pt-2 border-t border-slate-100 dark:border-white/5">
                  <div className="flex items-center gap-3 mb-6 mt-8">
                    <div className="w-8 h-8 rounded-full bg-slate-100 dark:bg-white/10 flex items-center justify-center text-slate-400 font-black text-xs">2</div>
                    <h3 className="text-sm font-black uppercase tracking-[0.2em] text-indigo-500">ที่ตั้งและพิกัดการเชื่อมโยง</h3>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-8 md:pl-11">
                    <div className="space-y-4">
                      <div className="space-y-1">
                        <div className="text-[10px] font-black text-slate-400 uppercase tracking-widest">จุดเชื่อมโยงวงจร (Connection Point)</div>
                        <div className="text-sm font-bold text-slate-700 dark:text-slate-200">{viewingPlant.connectionPoint}</div>
                      </div>
                      <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-1">
                          <div className="text-[10px] font-black text-slate-400 uppercase tracking-widest">ภูมิภาค</div>
                          <div className="text-sm font-bold text-slate-700 dark:text-slate-200">{viewingPlant.region}</div>
                        </div>
                        <div className="space-y-1">
                          <div className="text-[10px] font-black text-slate-400 uppercase tracking-widest">จังหวัด</div>
                          <div className="text-sm font-bold text-slate-700 dark:text-slate-200">{viewingPlant.province}</div>
                        </div>
                      </div>
                    </div>
                    <div className="space-y-4">
                      <div className="space-y-1">
                        <div className="text-[10px] font-black text-slate-400 uppercase tracking-widest">พิกัด Lat/Lng</div>
                        <div className="flex items-center gap-3">
                          <div className="text-sm font-mono font-bold text-indigo-500 bg-indigo-50 dark:bg-indigo-500/10 px-3 py-1.5 rounded-lg border border-indigo-500/10">
                            {viewingPlant.gps.lat}, {viewingPlant.gps.lng}
                          </div>
                          <a 
                            href={`https://www.google.com/maps?q=${viewingPlant.gps.lat},${viewingPlant.gps.lng}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="w-10 h-10 rounded-xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-white/10 flex items-center justify-center text-indigo-500 hover:bg-indigo-50 transition-all shadow-sm"
                          >
                            <ExternalLink size={18} />
                          </a>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>

                {/* 3. Coordinators List */}
                <div className="pt-2 border-t border-slate-100 dark:border-white/5">
                  <div className="flex items-center justify-between mb-6 mt-8">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-full bg-slate-100 dark:bg-white/10 flex items-center justify-center text-slate-400 font-black text-xs">3</div>
                      <h3 className="text-sm font-black uppercase tracking-[0.2em] text-emerald-500">ข้อมูลผู้ประสานงาน ({viewingPlant.coordinators?.length || 1})</h3>
                    </div>
                  </div>
                  <div className="space-y-4 md:pl-11">
                    {(viewingPlant.coordinators || [(viewingPlant as any).coordinator]).map((coord, idx) => (
                      <div key={idx} className="p-6 bg-slate-50 dark:bg-white/[0.02] border border-slate-100 dark:border-white/5 rounded-3xl flex flex-col md:flex-row gap-6 md:items-center">
                        <div className="w-12 h-12 rounded-2xl bg-white dark:bg-slate-800 shadow-sm border border-slate-100 dark:border-white/10 flex items-center justify-center text-emerald-500">
                          <User size={24} />
                        </div>
                        <div className="flex-1 space-y-1">
                          <div className="text-[10px] font-black text-slate-400 uppercase tracking-widest">ผู้ประสานงานท่านที่ {idx + 1}</div>
                          <div className="text-base font-black text-slate-800 dark:text-white">{coord?.name || '-'}</div>
                        </div>
                        <div className="flex flex-wrap gap-4 md:gap-8">
                          <div className="space-y-1">
                            <div className="text-[10px] font-black text-slate-400 uppercase tracking-widest">อีเมล</div>
                            <div className="flex items-center gap-2 text-slate-600 dark:text-slate-400 font-bold">
                              <Mail size={14} className="text-emerald-500" />
                              {coord?.email || '-'}
                            </div>
                          </div>
                          <div className="space-y-1">
                            <div className="text-[10px] font-black text-slate-400 uppercase tracking-widest">เบอร์โทรศัพท์</div>
                            <div className="flex items-center gap-2 text-slate-600 dark:text-slate-400 font-bold">
                              <Phone size={14} className="text-emerald-500" />
                              {coord?.phone || '-'}
                            </div>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              <div className="p-6 border-t border-slate-100 dark:border-white/5 bg-slate-50 dark:bg-black/20 flex justify-end">
                <button 
                  onClick={() => setIsViewModalOpen(false)}
                  className="bg-slate-800 dark:bg-white/10 text-white font-black px-12 py-3.5 rounded-2xl shadow-xl active:scale-95 transition-all text-xs uppercase tracking-widest"
                >
                  ปิดหน้าต่าง
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Map Picker Modal */}
      <AnimatePresence>
        {isMapModalOpen && (
          <div className="fixed inset-0 xl:left-72 xl:top-[65px] z-[300] flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setIsMapModalOpen(false)}
              className="absolute inset-0 bg-slate-900/60 backdrop-blur-md"
            />
            <motion.div 
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="glass-panel w-full max-w-4xl bg-white dark:bg-[#030712] rounded-[2rem] overflow-hidden shadow-2xl relative z-10 flex flex-col h-[80vh]"
            >
              <div className="p-6 border-b border-gray-200 dark:border-white/5 flex items-center justify-between flex-shrink-0">
                <div className="flex items-center gap-4">
                  <div className="w-12 h-12 rounded-2xl bg-indigo-500/10 text-indigo-500 flex items-center justify-center">
                    <MapPin size={24} />
                  </div>
                  <div>
                    <h2 className="text-xl font-black text-slate-800 dark:text-white tracking-tight">เลือกพิกัดจากแผนที่</h2>
                    <p className="text-xs text-slate-500 dark:text-slate-400 font-medium">คลิกบนแผนที่เพื่อเลือกจุดพิกัด Lat/Lng</p>
                  </div>
                </div>
                <button 
                  onClick={() => setIsMapModalOpen(false)}
                  className="w-10 h-10 rounded-xl hover:bg-slate-100 dark:hover:bg-white/5 text-slate-400 transition-all flex items-center justify-center"
                >
                  <X size={20} />
                </button>
              </div>

              <div className="flex-1 relative">
                <MapPicker 
                  initialPos={{ 
                    lat: parseFloat(formData.gps?.lat || '13.7563'), 
                    lng: parseFloat(formData.gps?.lng || '100.5018') 
                  }} 
                  onSelect={handleMapSelect} 
                />
              </div>

              <div className="p-4 bg-slate-50 dark:bg-black/20 border-t border-slate-100 dark:border-white/5 flex justify-between items-center px-8">
                <div className="flex gap-4">
                  <div className="space-y-1">
                    <div className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Latitude</div>
                    <div className="text-sm font-black text-indigo-500">{formData.gps?.lat || '-'}</div>
                  </div>
                  <div className="space-y-1">
                    <div className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Longitude</div>
                    <div className="text-sm font-black text-indigo-500">{formData.gps?.lng || '-'}</div>
                  </div>
                </div>
                <button 
                  onClick={() => setIsMapModalOpen(false)}
                  className="bg-indigo-500 text-white font-black text-xs uppercase tracking-widest px-8 py-3 rounded-xl shadow-lg shadow-indigo-500/20 active:scale-95 transition-all"
                >
                  ตกลง
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* CSV Import Modal */}
      <AnimatePresence>
        {isCsvModalOpen && (
          <div className="fixed inset-0 xl:left-72 xl:top-[65px] z-[220] flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => {
                if (!isUploadingCsv) setIsCsvModalOpen(false);
              }}
              className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm"
            />
            <motion.div 
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="glass-panel w-full max-w-4xl bg-white dark:bg-[#030712] rounded-[2rem] overflow-hidden shadow-2xl relative z-10 flex flex-col max-h-[85vh]"
            >
              <div className="p-5 border-b border-gray-200 dark:border-white/5 bg-white/80 dark:bg-black/20 flex items-center justify-between flex-shrink-0">
                <div className="flex items-center gap-4">
                  <div className="w-12 h-12 rounded-2xl bg-[#74045F]/10 dark:bg-[#C7911B]/10 flex items-center justify-center text-[#74045F] dark:text-[#C7911B]">
                    <FileSpreadsheet size={24} />
                  </div>
                  <div>
                    <h2 className="text-xl font-black text-slate-800 dark:text-white tracking-tight">นำเข้าข้อมูลโรงไฟฟ้าผ่าน CSV</h2>
                    <p className="text-xs text-slate-500 uppercase tracking-widest font-bold mt-0.5">
                      อัปโหลดข้อมูลโรงไฟฟ้าหลายรายการคู่ขนานพร้อมกัน
                    </p>
                  </div>
                </div>
                <button 
                  onClick={() => {
                    if (!isUploadingCsv) setIsCsvModalOpen(false);
                  }}
                  disabled={isUploadingCsv}
                  className="w-10 h-10 rounded-xl hover:bg-slate-100 dark:hover:bg-white/5 flex items-center justify-center text-slate-400 hover:text-slate-600 transition-all disabled:opacity-50"
                >
                  <X size={20} />
                </button>
              </div>

              <div className="p-6 md:p-8 overflow-y-auto flex-1 custom-scrollbar space-y-6">
                {/* Upload Section / Drag-Drop Zone */}
                {csvParsedItems.length === 0 ? (
                  <div className="space-y-4">
                    <div className="border-2 border-dashed border-slate-200 dark:border-white/10 rounded-3xl p-10 flex flex-col items-center justify-center text-center space-y-4 bg-slate-50/50 dark:bg-white/[0.01] hover:bg-slate-100/10 dark:hover:bg-white/[0.03] transition-all relative">
                      <input 
                        type="file" 
                        accept=".csv"
                        onChange={handleCsvUpload}
                        className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                      />
                      <div className="w-16 h-16 rounded-full bg-[#74045F]/10 dark:bg-[#C7911B]/10 text-[#74045F] dark:text-[#C7911B] flex items-center justify-center">
                        <Upload size={28} />
                      </div>
                      <div className="space-y-1">
                        <p className="text-sm font-bold text-slate-700 dark:text-white">เลือกไฟล์ CSV หรือลากไฟล์มาวางที่นี่</p>
                        <p className="text-xs text-slate-400">รองรับเฉพาะไฟล์ .csv สำหรับข้อมูลโรงไฟฟ้าเท่านั้น</p>
                      </div>
                    </div>

                    <div className="p-5 bg-[#74045F]/5 dark:bg-[#C7911B]/5 border border-[#74045F]/10 dark:border-[#C7911B]/10 rounded-2xl flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                      <div className="flex items-start gap-3">
                        <AlertCircle className="text-[#74045F] dark:text-[#C7911B] flex-shrink-0 mt-0.5" size={18} />
                        <div>
                          <p className="text-xs font-black text-[#74045F] dark:text-[#C7911B]">กรุณาใช้รูปแบบตารางคอลัมน์มาตรฐาน</p>
                          <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-1">คอลัมน์ระบุ ประกอบด้วย: name, type, capacity, connectionPoint, region, province, lat, lng, coordinator_name, coordinator_email, coordinator_phone</p>
                        </div>
                      </div>
                      <button
                        onClick={downloadCSVTemplate}
                        className="py-2.5 px-5 bg-white dark:bg-slate-800 hover:bg-slate-50 dark:hover:bg-slate-700 border border-slate-200 dark:border-white/10 rounded-xl text-xs font-bold text-[#74045F] dark:text-[#C7911B] shadow-sm flex items-center justify-center gap-2 flex-shrink-0 whitespace-nowrap transition-all"
                      >
                        <FileSpreadsheet size={14} />
                        ดาวน์โหลดไฟล์ตัวอย่าง
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="space-y-4">
                    <div className="flex items-center justify-between">
                      <p className="text-sm font-black text-slate-700 dark:text-white flex items-center gap-2">
                        <Check className="text-emerald-500" size={18} />
                        พบข้อมูลโรงไฟฟ้าที่สามารถนำเข้าได้ทั้งหมด {csvParsedItems.length} รายการ
                      </p>
                      <button
                        onClick={() => {
                          setCsvParsedItems([]);
                          setCsvError(null);
                        }}
                        className="text-xs font-bold text-rose-500 hover:underline"
                      >
                        เปลี่ยนไฟล์ใหม่
                      </button>
                    </div>

                    {/* Preview Table */}
                    <div className="border border-slate-100 dark:border-white/5 rounded-2xl overflow-hidden shadow-sm max-h-[40vh] overflow-y-auto custom-scrollbar">
                      <table className="w-full text-left border-collapse">
                        <thead>
                          <tr className="bg-slate-50 dark:bg-white/5 border-b border-slate-100 dark:border-white/5 text-[10px] uppercase font-black tracking-widest text-slate-400 justify-between items-center">
                            <th className="py-4 px-5">ชื่อโรงไฟฟ้า</th>
                            <th className="py-4 px-5">ประเภท</th>
                            <th className="py-4 px-5 text-right">กำลังผลิต (MW)</th>
                            <th className="py-4 px-5">จุดเชื่อมโยง / จังหวัด</th>
                            <th className="py-4 px-5">ผู้ประสานงาน</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100 dark:divide-white/5">
                          {csvParsedItems.map((item, idx) => (
                            <tr key={idx} className="text-xs font-bold text-slate-700 dark:text-slate-300 hover:bg-slate-50/50 dark:hover:bg-white/[0.01] transition-all">
                              <td className="py-4 px-5 text-slate-900 dark:text-white font-black truncate max-w-[200px]">{item.name}</td>
                              <td className="py-4 px-5 whitespace-nowrap">
                                <span className="px-2 py-0.5 rounded bg-slate-100 dark:bg-white/10 text-[9px] uppercase tracking-wider text-slate-500 dark:text-slate-400">
                                  {item.type.split(' ')[0]}
                                </span>
                              </td>
                              <td className="py-4 px-5 text-right font-mono font-bold text-slate-900 dark:text-white">{item.capacity.toFixed(2)} MW</td>
                              <td className="py-4 px-5 truncate max-w-[150px]">{item.connectionPoint || '-'} ({item.province || '-'})</td>
                              <td className="py-4 px-5 truncate max-w-[150px]">{item.coordinators?.[0]?.name || '-'}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}

                {csvError && (
                  <div className="p-4 bg-rose-50 dark:bg-rose-950/20 border border-rose-100 dark:border-rose-900/30 rounded-2xl flex items-start gap-3">
                    <AlertCircle className="text-rose-500 mt-0.5 flex-shrink-0" size={18} />
                    <div>
                      <p className="text-xs font-black text-rose-500">ตรวจพบข้อบกพร่องในไฟล์ที่อัปโหลด</p>
                      <p className="text-[11px] text-rose-600/85 dark:text-rose-400 mt-1">{csvError}</p>
                    </div>
                  </div>
                )}
              </div>

              <div className="p-6 bg-slate-50 dark:bg-black/20 border-t border-slate-100 dark:border-white/5 flex flex-col sm:flex-row sm:items-center justify-between px-8 gap-4 flex-shrink-0">
                <span className="text-[11px] text-slate-400 font-bold">
                  * ข้อมูลทั้งหมดจะถูกซิงก์โดยตรงไปยังฐานข้อมูลกลางและ Local Storage
                </span>
                <div className="flex gap-3 justify-end">
                  <button 
                    disabled={isUploadingCsv}
                    onClick={() => setIsCsvModalOpen(false)}
                    className="py-3 px-6 rounded-xl font-bold text-xs text-slate-500 hover:text-slate-700 bg-slate-100 hover:bg-slate-200 dark:bg-white/5 dark:hover:bg-white/10 dark:text-slate-300 transition-all disabled:opacity-50"
                  >
                    ยกเลิก
                  </button>
                  <button 
                    disabled={csvParsedItems.length === 0 || isUploadingCsv}
                    onClick={handleSaveCsvItems}
                    className="py-3 px-8 rounded-xl font-black text-xs uppercase tracking-widest text-white bg-gradient-to-r from-[#74045F] to-[#C7911B] shadow-xl hover:shadow-2xl active:scale-95 transition-all disabled:opacity-50 disabled:scale-100 flex items-center justify-center gap-2 min-w-[140px]"
                  >
                    {isUploadingCsv ? (
                      <>
                        <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                        กำลังบันทึก...
                      </>
                    ) : (
                      <>
                        <Check size={16} />
                        บันทึกเข้าระบบ
                      </>
                    )}
                  </button>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Batch Delete Confirmation Modal */}
      <AnimatePresence>
        {isBatchDeleteModalOpen && (
          <div className="fixed inset-0 xl:left-72 xl:top-[65px] z-[210] flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setIsBatchDeleteModalOpen(false)}
              className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm"
            />
            <motion.div 
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="relative w-full max-w-md bg-white dark:bg-[#030712] rounded-[3rem] shadow-2xl overflow-hidden p-10 z-10 text-center"
            >
              <div className="w-20 h-20 rounded-3xl bg-rose-500/10 text-rose-500 flex items-center justify-center mx-auto mb-6">
                <Trash2 size={40} />
              </div>
              <h2 className="text-xl font-black text-slate-800 dark:text-white tracking-tight mb-3">
                {batchDeleteType === 'SELECTED' ? 'ยืนยันการลบข้อมูลเฉพาะที่เลือก?' : 'ยืนยันการลบข้อมูลทั้งหมด?'}
              </h2>
              <p className="text-slate-500 dark:text-slate-400 mb-8 font-medium leading-relaxed text-sm">
                {batchDeleteType === 'SELECTED' ? (
                  <>คุณกำลังจะลบข้อมูลโรงไฟฟ้าที่เลือกจำนวน <span className="font-bold text-rose-500">{selectedIds.length}</span> รายการ ข้อมูลในระบบและ Firebase จะถูกลบถาวร</>
                ) : (
                  <>คุณกำลังจะลบข้อมูลโรงไฟฟ้าทั้งหมดตามตัวกรองจำนวน <span className="font-bold text-rose-500">{filteredPlants.length}</span> รายการ ข้อมูลในระบบและ Firebase จะถูกลบถาวร</>
                )}
              </p>
              <div className="flex gap-4">
                <button 
                  onClick={() => setIsBatchDeleteModalOpen(false)}
                  className="flex-1 py-4 rounded-2xl font-black text-xs uppercase tracking-widest text-slate-400 bg-slate-50 dark:bg-white/5 transition-all hover:bg-slate-100"
                >
                  ยกเลิก
                </button>
                <button 
                  onClick={handleConfirmBatchDelete}
                  className="flex-1 py-4 rounded-2xl font-black text-xs uppercase tracking-widest text-white bg-rose-500 shadow-xl shadow-rose-500/20 active:scale-95 transition-all hover:bg-rose-600"
                >
                  ยืนยันการลบ
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Delete Confirmation Modal */}
      <AnimatePresence>
        {isDeleteModalOpen && (
          <div className="fixed inset-0 xl:left-72 xl:top-[65px] z-[210] flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setIsDeleteModalOpen(false)}
              className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm"
            />
            <motion.div 
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="relative w-full max-w-md bg-white dark:bg-[#030712] rounded-[3rem] shadow-2xl overflow-hidden p-10 z-10 text-center"
            >
              <div className="w-20 h-20 rounded-3xl bg-rose-500/10 text-rose-500 flex items-center justify-center mx-auto mb-6">
                <Trash2 size={40} />
              </div>
              <h2 className="text-xl font-black text-slate-800 dark:text-white tracking-tight mb-4">ยืนยันการลบข้อมูล?</h2>
              <p className="text-slate-500 dark:text-slate-400 mb-10 font-medium">
                คุณกำลังจะลบข้อมูลของ <span className="font-bold text-slate-800 dark:text-white">"{plantToDelete?.name}"</span> 
                ออกจากระบบอย่างถาวร ขั้นตอนนี้ไม่สามารถเรียกคืนได้
              </p>
              <div className="flex gap-4">
                <button 
                  onClick={() => setIsDeleteModalOpen(false)}
                  className="flex-1 py-4 rounded-2xl font-black text-xs uppercase tracking-widest text-slate-400 bg-slate-50 dark:bg-white/5 transition-all"
                >
                  ย้อนกลับ
                </button>
                <button 
                  onClick={handleDelete}
                  className="flex-1 py-4 rounded-2xl font-black text-xs uppercase tracking-widest text-white bg-rose-500 shadow-xl shadow-rose-500/20 active:scale-95 transition-all"
                >
                  ยืนยันการลบ
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Toast Notification */}
      <AnimatePresence>
        {toast && (
          <motion.div 
            initial={{ opacity: 0, y: 40, x: '-50%' }}
            animate={{ opacity: 1, y: 0, x: '-50%' }}
            exit={{ opacity: 0, y: 40, x: '-50%' }}
            className={`fixed bottom-10 left-1/2 z-[100] px-8 py-4 rounded-2xl shadow-2xl flex items-center gap-4 ${
              toast.type === 'success' ? 'bg-[#74045F] text-white' : 'bg-rose-600 text-white'
            }`}
          >
            {toast.type === 'success' ? <Check size={20} /> : <X size={20} />}
            <span className="font-bold text-sm tracking-wide">{toast.message}</span>
          </motion.div>
        )}
      </AnimatePresence>

    </div>
  );
};
