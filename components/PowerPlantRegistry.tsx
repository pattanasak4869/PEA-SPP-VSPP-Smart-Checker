
import React, { useState, useEffect, useRef } from 'react';
import { 
  Zap, Search, Globe, Filter, Eye, MapPin, 
  ChevronRight, Calendar, User, CheckCircle2, 
  XCircle, Clock, FileText, ArrowLeft, Building2, Battery, Radio,
  Plus, X, Mail, Phone, Navigation, Check, Download, ShieldCheck, Users, Printer
} from 'lucide-react';
import { InspectionReport } from './InspectionReport';
import ReactDOM from 'react-dom/client';
import { safeParseLocalStorage, safeSetLocalStorage } from '../utils/localStorageUtils';
import { motion, AnimatePresence } from 'motion/react';
import { InspectionResult } from '../types';
import { db } from '../src/lib/firebase';
import { collection, query, onSnapshot } from 'firebase/firestore';
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
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapInstance = useRef<L.Map | null>(null);
  const markerInstance = useRef<L.Marker | null>(null);

  useEffect(() => {
    if (!mapContainerRef.current || mapInstance.current) return;

    const lat = isNaN(initialPos.lat) ? 13.7563 : initialPos.lat;
    const lng = isNaN(initialPos.lng) ? 100.5018 : initialPos.lng;

    try {
      const map = L.map(mapContainerRef.current, {
        center: [lat, lng],
        zoom: 13,
        zoomAnimation: false
      });
      mapInstance.current = map;

      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '&copy; OpenStreetMap contributors'
      }).addTo(map);

      const marker = L.marker([lat, lng], { draggable: true }).addTo(map);
      markerInstance.current = marker;

      marker.on('dragend', () => {
        const position = marker.getLatLng();
        onSelect(position.lat.toFixed(6), position.lng.toFixed(6));
      });

      map.on('click', (e) => {
        const { lat, lng } = e.latlng;
        marker.setLatLng([lat, lng]);
        onSelect(lat.toFixed(6), lng.toFixed(6));
      });

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
  capacity: number;
  connectionPoint: string;
  userType: 'SPP' | 'VSPP';
  region: string;
  province: string;
  coordinators: Coordinator[];
  gps: {
    lat: string;
    lng: string;
  };
  office?: string; // The agency/unit the plant belongs to
  vendorId?: string; // ID of the vendor who created it
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
  { name: 'ภาคเหนือ', provinces: ['เชียงราย', 'เชียงใหม่', 'น่าน', 'พะเยา', 'แพร่', 'แม่ฮ่องสอน', 'ลำปาง', 'ลำพูน', 'อุตรดิตถ์'] },
  { name: 'ภาคตะวันออกเฉียงเหนือ', provinces: ['กาฬสินธุ์', 'ขอนแก่น', 'ชัยภูมิ', 'นครพนม', 'นครราชสีมา', 'บึงกาฬ', 'บุรีรัมย์', 'มหาสารคาม', 'มุกดาหาร', 'ยโสธร', 'ร้อยเอ็ด', 'เลย', 'ศรีสะเกษ', 'สกลนคร', 'สุรินทร์', 'หนองคาย', 'หนองบัวลำภู', 'อำนาจเจริญ', 'อุดรธานี', 'อุบลราชธานี'] },
  { name: 'ภาคกลาง', provinces: ['กรุงเทพมหานคร', 'กำแพงเพชร', 'ชัยนาท', 'นครนายก', 'นครปฐม', 'นครสวรรค์', 'นนทบุรี', 'ปทุมธานี', 'พระนครศรีอยุธยา', 'พิจิตร', 'พิษณุโลก', 'เพชรบูรณ์', 'ลพบุรี', 'สมุทรปราการ', 'สมุทรสงคราม', 'สมุทรสาคร', 'สระบุรี', 'สิงห์บุรี', 'สุโขทัย', 'สุพรรณบุรี', 'อ่างทอง', 'อุทัยธานี'] },
  { name: 'ภาคตะวันออก', provinces: ['จันทบุรี', 'ฉะเชิงเทรา', 'ชลบุรี', 'ตราด', 'ปราจีนบุรี', 'ระยอง', 'สระแก้ว'] },
  { name: 'ภาคตะวันตก', provinces: ['กาญจนบุรี', 'ตาก', 'ประจวบคีรีขันธ์', 'เพชรบุรี', 'ราชบุรี'] },
  { name: 'ภาคใต้', provinces: ['กระบี่', 'ชุมพร', 'ตรัง', 'นครศรีธรรมราช', 'นราธิวาส', 'ปัตตานี', 'พังงา', 'พัทลุง', 'ภูเก็ต', 'ยะลา', 'ระนอง', 'สงขลา', 'สตูล', 'สุราษฎร์ธานี'] }
];

export const PowerPlantRegistry: React.FC<{ userProfile?: any }> = ({ userProfile }) => {
  const [plants, setPlants] = useState<PowerPlant[]>([]);
  const [inspections, setInspections] = useState<InspectionResult[]>([]);
  const [requests, setRequests] = useState<any[]>([]);
  const [forms, setForms] = useState<any[]>([]);
  
  const [searchQuery, setSearchQuery] = useState('');
  const [regionFilter, setRegionFilter] = useState('ALL');
  
  const [selectedPlant, setSelectedPlant] = useState<any | null>(null);
  const [plantInspections, setPlantInspections] = useState<InspectionResult[]>([]);
  const [selectedInspectionDetail, setSelectedInspectionDetail] = useState<InspectionResult | null>(null);
  const [associatedRequestDetail, setAssociatedRequestDetail] = useState<any | null>(null);
  const [previewImage, setPreviewImage] = useState<string | null>(null);
  const [previewDocument, setPreviewDocument] = useState<{ name: string, url: string, blobUrl?: string } | null>(null);

  const handlePrintReport = (inspection: any) => {
    if (!inspection || !selectedPlant) return;
    
    const printWindow = window.open('', '_blank');
    if (!printWindow) return;

    const printContainer = printWindow.document.createElement('div');
    printWindow.document.body.appendChild(printContainer);

    const styles = document.querySelectorAll('style, link[rel="stylesheet"]');
    styles.forEach(style => {
      printWindow.document.head.appendChild(style.cloneNode(true));
    });

    printWindow.document.title = `PQ_Report_${inspection.id}`;

    const form = forms.find(f => f.id === inspection.formId);

    const root = ReactDOM.createRoot(printContainer);
    root.render(
      <InspectionReport 
        inspection={inspection} 
        plant={selectedPlant} 
        request={associatedRequestDetail}
        form={form}
      />
    );

    setTimeout(() => {
      printWindow.print();
    }, 1000);
  };

    useEffect(() => {
    if (selectedInspectionDetail?.requestId) {
      const req = requests.find(r => r.id === selectedInspectionDetail.requestId);
      setAssociatedRequestDetail(req || null);
    } else {
      setAssociatedRequestDetail(null);
    }
  }, [selectedInspectionDetail, requests]);

  const handleOpenDocument = (doc: { name: string, url: string }) => {
        if (doc.url.startsWith('data:application/pdf')) {
            try {
                const parts = doc.url.split(',');
                const mimeType = 'application/pdf';
                const byteCharacters = atob(parts[1]);
                const byteNumbers = new Array(byteCharacters.length);
                for (let i = 0; i < byteCharacters.length; i++) {
                    byteNumbers[i] = byteCharacters.charCodeAt(i);
                }
                const byteArray = new Uint8Array(byteNumbers);
                const blob = new Blob([byteArray], { type: mimeType });
                const blobUrl = URL.createObjectURL(blob);
                setPreviewDocument({ ...doc, url: blobUrl, blobUrl });
            } catch (e) {
                console.error('PDF processing error:', e);
                setPreviewDocument(doc);
            }
        } else if (doc.url.startsWith('data:image/')) {
            setPreviewDocument(doc);
        } else if (doc.url.startsWith('data:')) {
            // General data URL handling
            try {
                const parts = doc.url.split(',');
                const mimeType = parts[0].split(':')[1].split(';')[0];
                const byteCharacters = atob(parts[1]);
                const byteNumbers = new Array(byteCharacters.length);
                for (let i = 0; i < byteCharacters.length; i++) {
                    byteNumbers[i] = byteCharacters.charCodeAt(i);
                }
                const byteArray = new Uint8Array(byteNumbers);
                const blob = new Blob([byteArray], { type: mimeType });
                const blobUrl = URL.createObjectURL(blob);
                setPreviewDocument({ ...doc, url: blobUrl, blobUrl });
            } catch (e) {
                setPreviewDocument(doc);
            }
        } else {
            setPreviewDocument(doc);
        }
    };
  
  // Add Plant Modal State (Vendor Only)
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isMapModalOpen, setIsMapModalOpen] = useState(false);
  const [formData, setFormData] = useState<Partial<PowerPlant>>({
    type: PLANT_TYPES[0],
    region: REGIONS[0].name,
    userType: 'VSPP',
    coordinators: [{ 
      name: userProfile?.name || '', 
      email: userProfile?.email || userProfile?.username || '', 
      phone: userProfile?.phone || '' 
    }],
    gps: { lat: '', lng: '' }
  });

  useEffect(() => {
    if (userProfile && !formData.name) {
      setFormData(prev => ({
        ...prev,
        coordinators: [{ 
          name: userProfile.name || '', 
          email: userProfile.email || userProfile.username || '', 
          phone: userProfile.phone || '' 
        }]
      }));
    }
  }, [userProfile]);
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);

  const showToast = (message: string, type: 'success' | 'error' = 'success') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 3000);
  };

  const handleCapacityChange = (val: string) => {
    const cap = parseFloat(val) || 0;
    setFormData(prev => ({
      ...prev,
      capacity: cap,
      userType: cap > 10 ? 'SPP' : 'VSPP'
    }));
  };

  const handleMapSelect = (lat: string, lng: string) => {
    setFormData(prev => ({
      ...prev,
      gps: { lat, lng }
    }));
    setIsMapModalOpen(false);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    
    const plantData: PowerPlant = {
      id: `pp-${Date.now()}`,
      name: formData.name || '',
      type: formData.type || PLANT_TYPES[0],
      capacity: formData.capacity || 0,
      connectionPoint: formData.connectionPoint || '',
      userType: formData.userType || 'VSPP',
      region: formData.region || REGIONS[0].name,
      province: formData.province || '',
      coordinators: formData.coordinators || [{ name: '', email: '', phone: '' }],
      gps: formData.gps || { lat: '', lng: '' },
      office: userProfile?.peaOffice || userProfile?.department || 'SYSTEM',
      vendorId: userProfile?.employeeId || userProfile?.username || 'SYSTEM',
      createdAt: new Date().toISOString(),
    };

    const updatedPlants = [plantData, ...plants];
    setPlants(updatedPlants);
    safeSetLocalStorage('power_plants', updatedPlants);
    
    showToast('เพิ่มข้อมูลโรงไฟฟ้าใหม่สำเร็จ');
    setIsModalOpen(false);
    setFormData({
      type: PLANT_TYPES[0],
      region: REGIONS[0].name,
      userType: 'VSPP',
      coordinators: [{ 
        name: userProfile?.name || '', 
        email: userProfile?.email || userProfile?.username || '', 
        phone: userProfile?.phone || '' 
      }],
      gps: { lat: '', lng: '' }
    });
  };

  useEffect(() => {
    // Real-time direct sync from Firestore collections
    const qPlants = query(collection(db, 'powerPlants'));
    const qInspections = query(collection(db, 'inspections'));
    const qRequests = query(collection(db, 'inspectionRequests'));
    const qForms = query(collection(db, 'inspectionForms'));

    const unsubPlants = onSnapshot(qPlants, (snapshot) => {
      const list: PowerPlant[] = [];
      snapshot.forEach((doc) => {
        const data = doc.data();
        list.push({
          ...data,
          id: doc.id,
          createdAt: data.createdAt?.toDate ? data.createdAt.toDate().toISOString() : data.createdAt
        } as PowerPlant);
      });
      setPlants(list);
      safeSetLocalStorage('power_plants', list, true);
    }, (error) => {
      console.warn("Firestore Plants Sync Error in Registry:", error);
    });

    const unsubInspections = onSnapshot(qInspections, (snapshot) => {
      const list: InspectionResult[] = [];
      snapshot.forEach((doc) => {
        const data = doc.data();
        list.push({
          ...data,
          id: doc.id,
          createdAt: data.createdAt?.toDate ? data.createdAt.toDate().toISOString() : data.createdAt
        } as InspectionResult);
      });
      setInspections(list);
      safeSetLocalStorage('app_inspections', list, true);
    }, (error) => {
      console.warn("Firestore Inspections Sync Error in Registry:", error);
    });

    const unsubRequests = onSnapshot(qRequests, (snapshot) => {
      const list: any[] = [];
      snapshot.forEach((doc) => {
        const data = doc.data();
        list.push({
          ...data,
          id: doc.id,
          createdAt: data.createdAt?.toDate ? data.createdAt.toDate().toISOString() : data.createdAt
        });
      });
      setRequests(list);
      safeSetLocalStorage('app_inspection_requests', list, true);
    }, (error) => {
      console.warn("Firestore Requests Sync Error in Registry:", error);
    });

    const unsubForms = onSnapshot(qForms, (snapshot) => {
      const list: any[] = [];
      snapshot.forEach((doc) => {
        const data = doc.data();
        list.push({
          ...data,
          id: doc.id,
          createdAt: data.createdAt?.toDate ? data.createdAt.toDate().toISOString() : data.createdAt
        });
      });
      setForms(list);
      safeSetLocalStorage('app_inspection_forms', list, true);
    }, (error) => {
      console.warn("Firestore Forms Sync Error in Registry:", error);
    });

    return () => {
      unsubPlants();
      unsubInspections();
      unsubRequests();
      unsubForms();
    };
  }, []);

  const handleViewDetails = (plant: any) => {
    setSelectedPlant(plant);
    const history = inspections.filter(ins => ins.plantId === plant.id && (ins.status === 'APPROVED' || ins.status === 'REJECTED' || ins.status === 'SUBMITTED'));
    setPlantInspections(history.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()));
  };

  const filteredPlants = plants.filter(p => {
    // Admin sees everything
    const isAdmin = userProfile?.role === 'ADMIN';
    if (isAdmin) {
      const matchesSearch = (p.name || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
                            (p.province || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
                            (p.id || '').toLowerCase().includes(searchQuery.toLowerCase());
      const matchesRegion = regionFilter === 'ALL' || p.region === regionFilter;
      return matchesSearch && matchesRegion;
    }

    // Manager and Inspector filtered by their responsible area (province)
    const isManager = userProfile?.role === 'MANAGER';
    const isInspector = userProfile?.role === 'INSPECTOR';
    const userResponsibleProvince = userProfile?.region; // Stores province name

    if ((isManager || isInspector) && userResponsibleProvince) {
      if (p.province !== userResponsibleProvince) {
        return false;
      }
    }

    // Filter logic based on user role and organization (office/unit)
    const isVendor = userProfile?.role === 'VENDER';
    const userOffice = userProfile?.peaOffice || userProfile?.department;
    
    if (isVendor) {
      // Vendors see plants that match their agency/unit (office) 
      // OR plants they created directly
      const userOffice = userProfile?.peaOffice || userProfile?.department;
      
      const matchesOffice = p.office && userOffice && p.office === userOffice;
      const isOwner = p.vendorId === userProfile?.employeeId || p.vendorId === userProfile?.username;
      
      // If the plant belongs to an office, it must be the user's office
      if (p.office && p.office !== userOffice) {
        return false;
      }
      
      // If the plant doesn't have an office but has a vendorId, check ownership
      if (!p.office && p.vendorId && !isOwner) {
        return false;
      }

      // If it belongs to the office or user owns it, it's visible. 
      // Also allow legacy plants with no office/vendorId for demo purposes if needed, 
      // but usually we want strict filtering. 
      // Based on user request: "ให้แสดงข้อมูลโรงไฟฟ้าที่มีหน่วยงานตรงกับผู้ใช้งาน"
      if (!matchesOffice && !isOwner) {
          // Check if it's a legacy plant (no office and no vendorId)
          if (p.office || p.vendorId) return false;
      }
    }

    const matchesSearch = (p.name || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
                          (p.province || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
                          (p.id || '').toLowerCase().includes(searchQuery.toLowerCase());
    const matchesRegion = regionFilter === 'ALL' || p.region === regionFilter;
    return matchesSearch && matchesRegion;
  });

  const ListView = () => (
    <div className="space-y-8 animate-fade-in">
       {/* Filter Bar */}
       <div className="bg-white dark:bg-[#030712] p-2 rounded-[2rem] border border-slate-100 dark:border-white/5 shadow-sm flex flex-col lg:flex-row gap-2">
          <div className="flex-1 relative">
             <div className="absolute inset-y-0 left-4 flex items-center text-slate-400">
                <Search size={18} />
             </div>
             <input 
                type="text" 
                placeholder="ค้นหาชื่อโรงไฟฟ้า, ID หรือ จังหวัด..." 
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full bg-slate-50 dark:bg-white/5 rounded-2xl pl-12 pr-4 py-3 text-sm font-medium focus:outline-none transition-all placeholder:text-slate-400"
             />
          </div>

          <div className="flex gap-2">
             <div className="relative">
                <select 
                   value={regionFilter}
                   onChange={(e) => setRegionFilter(e.target.value)}
                   className="pl-6 pr-8 py-3 bg-slate-50 dark:bg-white/5 rounded-2xl text-xs font-black uppercase tracking-widest appearance-none outline-none focus:ring-2 focus:ring-[#74045F]/20"
                >
                   <option value="ALL">ทุกภูมิภาค</option>
                   <option value="ภาคเหนือ">ภาคเหนือ</option>
                   <option value="ภาคกลาง">ภาคกลาง</option>
                   <option value="ภาคตะวันออกเฉียงเหนือ">ภาคอีสาน</option>
                   <option value="ภาคภาคตะวันออก">ภาคตะวันออก</option>
                   <option value="ภาคตะวันตก">ภาคตะวันตก</option>
                   <option value="ภาคใต้">ภาคใต้</option>
                </select>
             </div>
          </div>
       </div>

       {/* Grid List */}
       {filteredPlants.length > 0 ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
             {filteredPlants.map((plant) => (
                <div 
                   key={plant.id}
                   onClick={() => handleViewDetails(plant)}
                   className="glass-panel group overflow-hidden bg-white dark:bg-white/5 border border-slate-100 dark:border-white/5 rounded-[2rem] hover:shadow-2xl transition-all duration-300 flex flex-col cursor-pointer"
                >
                   <div className="px-6 py-6 flex-1 flex flex-col">
                      <div className="flex justify-between items-start mb-4">
                         <div className={`p-3 rounded-2xl bg-white dark:bg-[#030712] shadow-sm border border-slate-100 dark:border-white/5 text-[#74045F] dark:text-[#C7911B]`}>
                            {plant.type.includes('Solar') ? <Zap size={20} /> : <Battery size={20} />}
                         </div>
                         <span className={`px-3 py-1 rounded-full text-[8px] font-black uppercase tracking-[0.2em] ${plant.userType === 'SPP' ? 'bg-indigo-500/10 text-indigo-500' : 'bg-emerald-500/10 text-emerald-500'}`}>
                            {plant.userType}
                         </span>
                      </div>
                      
                      <h3 className="text-xl font-black text-slate-800 dark:text-white tracking-tight leading-tight line-clamp-1 mb-2 group-hover:text-[#74045F] transition-colors italic">
                         {plant.name}
                      </h3>
                      <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-4 italic">{plant.province} • {plant.region}</p>
   
                      <div className="grid grid-cols-2 gap-3 p-4 bg-slate-50 dark:bg-white/5 rounded-2xl border border-slate-100 mb-6">
                         <div className="space-y-0.5">
                            <div className="text-[8px] font-black text-slate-400 uppercase tracking-widest">กำลังผลิต</div>
                            <div className="text-sm font-black text-slate-800 dark:text-white italic">{plant.capacity} MW</div>
                         </div>
                         <div className="space-y-0.5 text-right">
                            <div className="text-[8px] font-black text-slate-400 uppercase tracking-widest text-right">สถานะล่าสุด</div>
                            <div className="text-xs font-black text-emerald-500 italic uppercase">Active</div>
                         </div>
                      </div>
   
                      <button className="mt-auto w-full flex items-center justify-center gap-2 py-3 bg-[#74045F]/5 text-[#74045F] dark:text-[#C7911B] dark:bg-white/5 rounded-xl text-[10px] font-black uppercase tracking-widest group-hover:bg-[#74045F] group-hover:text-white transition-all italic">
                         ตรวจสอบประวัติย้อนหลัง <ChevronRight size={14} />
                      </button>
                   </div>
                </div>
             ))}
          </div>
       ) : (
          <div className="glass-panel py-24 text-center rounded-[3rem] border border-dashed border-slate-200 dark:border-white/10 opacity-70">
             <div className="w-20 h-20 bg-slate-50 dark:bg-white/5 rounded-[2rem] flex items-center justify-center mx-auto mb-6 text-slate-300">
                <Globe size={40} />
             </div>
             <h3 className="text-lg font-black text-slate-800 dark:text-white italic uppercase tracking-tight mb-2">ไม่พบข้อมูลโรงไฟฟ้า</h3>
             <p className="text-xs text-slate-400 font-bold uppercase tracking-widest px-10 max-w-md mx-auto leading-loose">
                {userProfile?.role === 'VENDER' 
                  ? 'คุณยังไม่มีโรงไฟฟ้าในสังกัดหน่วยงาน กรุณาเพิ่มข้อมูลโรงไฟฟ้าใหม่เข้าสู่ระบบ' 
                  : 'ไม่พบข้อมูลโรงไฟฟ้าที่ตรงตามเงื่อนไขการค้นหา'}
             </p>
          </div>
       )}
    </div>
  );

  const DetailView = () => (
    <div className="space-y-8 animate-slide-in-right">
       <button 
          onClick={() => setSelectedPlant(null)}
          className="flex items-center gap-2 text-xs font-bold text-slate-400 hover:text-slate-800 dark:hover:text-white transition-colors"
       >
          <ArrowLeft size={16} /> กลับไปหน้าทะเบียน
       </button>

       <div className="grid lg:grid-cols-3 gap-8 pb-20">
          <div className="lg:col-span-2 space-y-8">
             <div className="glass-panel p-10 rounded-[3rem] border border-slate-100 dark:border-white/5 bg-white dark:bg-[#030712] shadow-2xl">
                <div className="flex justify-between items-start border-b border-slate-100 dark:border-white/10 pb-8 mb-8">
                   <div className="flex items-center gap-6">
                      <div className="w-20 h-20 rounded-[2rem] bg-slate-50 dark:bg-white/5 flex items-center justify-center text-[#74045F] dark:text-[#C7911B] border border-slate-100">
                         <Building2 size={40} />
                      </div>
                      <div>
                         <h2 className="text-4xl font-black text-slate-800 dark:text-white italic tracking-tight mb-2">{selectedPlant.name}</h2>
                         <div className="flex items-center gap-3">
                            <span className="px-3 py-1 bg-slate-100 dark:bg-white/10 text-slate-500 text-[10px] font-black rounded-full uppercase tracking-widest italic">{selectedPlant.id}</span>
                            <span className="text-sm font-bold text-slate-400 italic">{selectedPlant.province}</span>
                         </div>
                      </div>
                   </div>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-4 gap-6">
                   <div className="space-y-1">
                      <div className="text-[10px] font-black text-slate-400 uppercase tracking-widest italic">Type</div>
                      <p className="text-sm font-black text-slate-700 dark:text-white italic">{selectedPlant.type}</p>
                   </div>
                   <div className="space-y-1">
                      <div className="text-[10px] font-black text-slate-400 uppercase tracking-widest italic">Capacity</div>
                      <p className="text-sm font-black text-[#74045F] dark:text-[#C7911B] italic">{selectedPlant.capacity} MW</p>
                   </div>
                   <div className="space-y-1">
                      <div className="text-[10px] font-black text-slate-400 uppercase tracking-widest italic">Source</div>
                      <p className="text-sm font-black text-slate-700 dark:text-white italic">{selectedPlant.userType}</p>
                   </div>
                   <div className="space-y-1">
                      <div className="text-[10px] font-black text-slate-400 uppercase tracking-widest italic">Region</div>
                      <p className="text-sm font-black text-slate-700 dark:text-white italic">{selectedPlant.region}</p>
                   </div>
                </div>
             </div>

             <div className="space-y-6">
                <h3 className="text-xs font-black text-slate-800 dark:text-white uppercase tracking-[0.2em] italic mb-2 flex items-center gap-3 px-4">
                   <Clock className="text-[#C7911B]" size={20} />
                   ประวัติผลการตรวจสอบอุปกรณ์ (Approved History)
                </h3>
                
                {plantInspections.length > 0 ? (
                   <div className="space-y-4">
                      {plantInspections.map(ins => (
                         <div key={ins.id} className="glass-panel p-6 rounded-[2rem] border border-slate-100 dark:border-white/5 bg-white dark:bg-[#030712] hover:translate-x-2 transition-all group">
                            <div className="flex justify-between items-start mb-4">
                               <div className="flex items-center gap-3">
                                  <div className={`w-10 h-10 rounded-xl flex items-center justify-center text-white ${ins.status === 'APPROVED' ? 'bg-emerald-500' : ins.status === 'SUBMITTED' ? 'bg-amber-500' : 'bg-rose-500'}`}>
                                     {ins.status === 'APPROVED' ? <CheckCircle2 size={24} /> : ins.status === 'SUBMITTED' ? <Clock size={24} /> : <XCircle size={24} />}
                                  </div>
                                  <div>
                                     <h4 className="text-sm font-black italic text-slate-800 dark:text-white uppercase tracking-tight">
                                        ผลการตรวจ: {ins.status === 'APPROVED' ? 'ผ่านหลักเกณฑ์' : ins.status === 'SUBMITTED' ? 'รอการตรวจอนุมัติ' : 'ไม่ผ่านหลักเกณฑ์'}
                                     </h4>
                                     <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest">{ins.id}</p>
                                  </div>
                               </div>
                               <div className="text-right">
                                  <div className="text-[10px] font-black text-slate-800 dark:text-white italic">{new Date(ins.createdAt).toLocaleDateString('th-TH')}</div>
                                  <div className="text-[8px] font-bold text-slate-400 uppercase tracking-tighter">Date Inspected</div>
                               </div>
                            </div>
                            
                            <div className="grid grid-cols-2 gap-4 mb-4">
                               <div className="p-3 bg-slate-50 dark:bg-white/5 rounded-xl">
                                  <p className="text-[8px] font-black text-slate-400 uppercase tracking-widest mb-1 italic">Inspector</p>
                                  <p className="text-[10px] font-black text-slate-700 dark:text-white italic">{ins.inspectorName}</p>
                                </div>
                               <div className="p-3 bg-slate-50 dark:bg-white/5 rounded-xl text-right">
                                  <p className="text-[8px] font-black text-slate-400 uppercase tracking-widest mb-1 italic">Approved By</p>
                                  <p className="text-[10px] font-black text-slate-700 dark:text-white italic">{ins.managerName || '-'}</p>
                               </div>
                            </div>

                            {ins.approvalNote && (
                               <div className="p-4 bg-emerald-500/5 dark:bg-white/5 border-l-4 border-emerald-500 rounded-r-xl mb-4">
                                  <p className="text-[10px] font-bold text-emerald-600 dark:text-emerald-400 italic">" {ins.approvalNote} "</p>
                               </div>
                            )}

                            <div className="flex justify-between items-center mt-6">
                               <div className="flex gap-2">
                                  {ins.photos.slice(0, 3).map((p, i) => (
                                     <div 
                                       key={i} 
                                       onClick={() => setPreviewImage(p)}
                                       className="w-12 h-12 rounded-lg overflow-hidden border border-slate-100 cursor-zoom-in"
                                     >
                                        <img src={p} className="w-full h-full object-cover" />
                                     </div>
                                  ))}
                                  {ins.photos.length > 3 && (
                                     <div className="w-12 h-12 rounded-lg bg-slate-100 flex items-center justify-center text-[10px] font-black text-slate-400">
                                        +{ins.photos.length - 3}
                                     </div>
                                  )}
                               </div>
                               <button 
                                 onClick={() => setSelectedInspectionDetail(ins)}
                                 className="px-4 py-2 bg-indigo-50 dark:bg-white/5 text-indigo-600 dark:text-indigo-400 rounded-xl text-[10px] font-black uppercase tracking-widest hover:bg-indigo-500 hover:text-white transition-all flex items-center gap-2"
                               >
                                 <Eye size={14} /> ดูรายละเอียดเต็ม
                               </button>
                            </div>
                         </div>
                      ))}
                   </div>
                ) : (
                   <div className="glass-panel py-20 text-center rounded-[3rem] border border-dashed border-slate-200 opacity-50">
                      <Clock size={40} className="mx-auto mb-4 text-slate-300" />
                      <p className="text-[10px] font-black uppercase tracking-widest italic">ยังไม่พบประวัติการตรวจสอบย้อนหลังที่ได้รับอนุมัติแล้ว</p>
                   </div>
                )}
             </div>
          </div>

          <div className="space-y-8">
             <div className="glass-panel p-8 rounded-[3rem] border border-slate-100 dark:border-white/5 bg-white dark:bg-[#030712] shadow-2xl sticky top-24">
                <h3 className="text-xs font-black text-slate-800 dark:text-white uppercase tracking-widest italic mb-6">Location Overview</h3>
                <div className="aspect-square bg-slate-100 dark:bg-white/5 rounded-[2rem] overflow-hidden relative border border-slate-200">
                   <div className="absolute inset-0 flex items-center justify-center text-slate-300 flex-col gap-4">
                      <MapPin size={48} className="animate-bounce" />
                      <div className="text-center">
                         <p className="text-[10px] font-black uppercase tracking-widest">{selectedPlant.gps.lat}</p>
                         <p className="text-[10px] font-black uppercase tracking-widest">{selectedPlant.gps.lng}</p>
                      </div>
                   </div>
                </div>
                
                <div className="mt-8 space-y-4">
                   {selectedPlant.coordinators?.map((c: any, i: number) => (
                      <div key={i} className="flex items-center gap-4 p-4 bg-slate-50 dark:bg-white/5 rounded-2xl border border-slate-100">
                         <div className="w-10 h-10 rounded-xl bg-[#74045F]/10 text-[#74045F] flex items-center justify-center">
                            <User size={20} />
                         </div>
                         <div>
                            <p className="text-[10px] font-black italic text-slate-800 dark:text-white">{c.name}</p>
                            <p className="text-[8px] font-bold text-slate-400 uppercase tracking-widest">{c.phone}</p>
                         </div>
                      </div>
                   ))}
                </div>
             </div>
          </div>
       </div>
    </div>
  );

  return (
    <div className="space-y-6 pb-20 animate-fade-in font-sans">
       <div className="flex justify-between items-center bg-white dark:bg-[#030712] p-8 rounded-[2.5rem] border border-slate-100 dark:border-white/5 shadow-xl shadow-slate-200/20 dark:shadow-none">
        <div>
          <h2 className="text-2xl font-black text-slate-800 dark:text-white italic flex items-center gap-3">
            <Globe className="text-indigo-500" size={32} />
            ทะเบียนโรงไฟฟ้า (Plant Registry)
          </h2>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-1 italic">Centralized Power Plant History & Status Information</p>
        </div>
        <div className="flex flex-col items-end gap-3">
           {userProfile?.role === 'VENDER' && (
             <button 
               onClick={() => setIsModalOpen(true)}
               className="bg-gradient-to-r from-[#74045F] to-[#C7911B] text-white font-bold py-2.5 px-6 rounded-2xl flex items-center justify-center gap-2 shadow-lg shadow-[#74045F]/20 transition-all active:scale-95 group whitespace-nowrap text-xs uppercase tracking-widest"
             >
               <Plus size={16} className="group-hover:rotate-90 transition-transform" /> 
               เพิ่มโรงไฟฟ้าใหม่
             </button>
           )}
           <div className="flex flex-col items-end">
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Public Access Control</span>
              <div className="flex items-center gap-2">
                 <div className="w-2 h-2 bg-emerald-500 rounded-full"></div>
                 <span className="text-xs font-black text-emerald-500 italic">Database Ready</span>
              </div>
           </div>
        </div>
      </div>

      <AnimatePresence mode="wait">
         {selectedPlant ? <DetailView key="detail" /> : <ListView key="list" />}
      </AnimatePresence>

      {/* Add New Plant Modal (Vendor Only) */}
      <AnimatePresence>
        {isModalOpen && userProfile?.role === 'VENDER' && (
          <div className="fixed inset-0 xl:left-72 xl:top-[65px] z-[200] flex items-center justify-center p-4 transition-all duration-300">
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
              className="glass-panel w-full max-w-3xl lg:max-w-4xl bg-white dark:bg-[#030712] rounded-[2rem] overflow-hidden shadow-2xl relative z-10 flex flex-col max-h-[85vh]"
            >
              <div className="p-5 border-b border-gray-200 dark:border-white/5 bg-white/80 dark:bg-black/20 flex items-center justify-between flex-shrink-0">
                <div className="flex items-center gap-4">
                  <div className="w-12 h-12 rounded-2xl bg-[#74045F]/10 dark:bg-[#C7911B]/10 flex items-center justify-center text-[#74045F] dark:text-[#C7911B]">
                    <Zap size={24} />
                  </div>
                  <div>
                    <h2 className="text-xl font-black text-slate-800 dark:text-white tracking-tight">เพิ่มโรงไฟฟ้าใหม่</h2>
                    <p className="text-xs text-slate-500 uppercase tracking-widest font-bold mt-0.5">กรอกรายละเอียดเพื่อบันทึกเข้าสู่ระบบ</p>
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
                    
                    <section className="relative z-10 md:pl-12 space-y-3">
                      <div className="absolute left-0 top-0 w-8 h-8 rounded-full bg-[#74045F]/10 dark:bg-[#C7911B]/10 text-[#74045F] dark:text-[#C7911B] md:flex items-center justify-center font-black text-xs ring-4 ring-white dark:ring-[#030712] hidden">1</div>
                      <div>
                        <h3 className="text-sm font-black uppercase tracking-[0.2em] text-[#74045F] dark:text-[#C7911B]">ข้อมูลพื้นฐานโรงไฟฟ้า</h3>
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

                    <section className="relative z-10 md:pl-12 space-y-3 mt-4">
                      <div className="absolute left-0 top-0 w-8 h-8 rounded-full bg-indigo-500/10 text-indigo-500 md:flex items-center justify-center font-black text-xs ring-4 ring-white dark:ring-[#030712] hidden">2</div>
                      <div className="flex items-center justify-between">
                        <div>
                          <h3 className="text-sm font-black uppercase tracking-[0.2em] text-indigo-500">ที่ตั้งและพิกัด</h3>
                        </div>
                        <button 
                          type="button"
                          onClick={() => setIsMapModalOpen(true)}
                          className="flex items-center gap-2 px-4 py-2 bg-indigo-500/10 text-indigo-500 rounded-xl text-[10px] font-black uppercase tracking-widest hover:bg-indigo-500/20 transition-all border border-indigo-500/20 shadow-sm"
                        >
                          <MapPin size={14} /> เลือกจากแผนที่
                        </button>
                      </div>

                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div className="space-y-1">
                           <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">จุดเชื่อมโยงวงจร</label>
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

                    <section className="relative z-10 md:pl-12 space-y-3 mt-4">
                      <div className="absolute left-0 top-0 w-8 h-8 rounded-full bg-emerald-500/10 text-emerald-500 md:flex items-center justify-center font-black text-xs ring-4 ring-white dark:ring-[#030712] hidden">3</div>
                      <div className="flex items-center justify-between">
                        <div>
                          <h3 className="text-sm font-black uppercase tracking-[0.2em] text-emerald-500">ข้อมูลผู้ประสานงาน</h3>
                        </div>
                        <button 
                          type="button"
                          onClick={() => {
                            const newCoordinators = [...(formData.coordinators || []), { name: '', email: '', phone: '' }];
                            setFormData({ ...formData, coordinators: newCoordinators });
                          }}
                          className="flex items-center gap-2 px-4 py-2 bg-emerald-500/10 text-emerald-500 rounded-xl text-[10px] font-black uppercase tracking-widest hover:bg-emerald-500/20 transition-all border border-emerald-500/20 shadow-sm"
                        >
                          <Plus size={14} /> เพิ่มผู้ประสานงาน
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
                    ยืนยันการเพิ่มโรงไฟฟ้า
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Inspection Detail Modal */}
      <AnimatePresence>
        {selectedInspectionDetail && (
          <div className="fixed inset-0 xl:left-72 xl:top-[65px] z-[250] flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setSelectedInspectionDetail(null)}
              className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm"
            />
            <motion.div 
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="glass-panel w-full max-w-4xl bg-white dark:bg-[#030712] rounded-[2rem] overflow-hidden shadow-2xl relative z-10 flex flex-col max-h-[85vh]"
            >
              <div className="p-6 border-b border-gray-200 dark:border-white/5 bg-white/80 dark:bg-black/20 flex items-center justify-between flex-shrink-0">
                <div className="flex items-center gap-4">
                  <div className={`w-12 h-12 rounded-2xl flex items-center justify-center text-white ${selectedInspectionDetail.status === 'APPROVED' ? 'bg-emerald-500' : selectedInspectionDetail.status === 'SUBMITTED' ? 'bg-amber-500' : 'bg-rose-500'}`}>
                    {selectedInspectionDetail.status === 'APPROVED' ? <CheckCircle2 size={24} /> : selectedInspectionDetail.status === 'SUBMITTED' ? <Clock size={24} /> : <XCircle size={24} />}
                  </div>
                  <div>
                    <h2 className="text-xl font-black text-slate-800 dark:text-white tracking-tight italic">
                      รายละเอียดผลการตรวจสอบ: {selectedInspectionDetail.status === 'APPROVED' ? 'ผ่านหลักเกณฑ์' : selectedInspectionDetail.status === 'SUBMITTED' ? 'รอการตรวจอนุมัติ' : 'ไม่ผ่านหลักเกณฑ์'}
                    </h2>
                    <p className="text-[10px] text-slate-500 uppercase tracking-widest font-bold mt-0.5">ID: {selectedInspectionDetail.id} • {new Date(selectedInspectionDetail.createdAt).toLocaleString('th-TH')}</p>
                  </div>
                </div>
                <button 
                  onClick={() => setSelectedInspectionDetail(null)}
                  className="w-10 h-10 rounded-xl hover:bg-slate-100 dark:hover:bg-white/5 transition-all text-slate-400 flex items-center justify-center"
                >
                  <X size={20} />
                </button>
              </div>

              <div className="flex-1 overflow-y-auto p-8 space-y-8 custom-scrollbar">
              <div className="flex justify-end pr-4">
                 <button 
                   onClick={() => handlePrintReport(selectedInspectionDetail)}
                   className="px-6 py-2.5 rounded-2xl bg-[#74045F] dark:bg-[#C7911B] text-white font-black text-[10px] uppercase tracking-widest flex items-center gap-2 shadow-lg shadow-[#74045F]/20 dark:shadow-[#C7911B]/20 transition-all hover:scale-105 active:scale-95"
                 >
                   <Printer size={14} /> พิมพ์รายงานผลการตรวจสอบ
                 </button>
              </div>
                {/* Plant Info Summary */}
                <div className="p-6 bg-slate-50 dark:bg-white/5 rounded-[2rem] border border-slate-100 dark:border-white/5 grid grid-cols-2 md:grid-cols-4 gap-6">
                   <div>
                      <p className="text-[8px] font-black text-slate-400 uppercase tracking-widest mb-1 italic">Plant Name</p>
                      <p className="text-xs font-black text-slate-800 dark:text-white italic">{selectedPlant.name}</p>
                   </div>
                   <div>
                      <p className="text-[8px] font-black text-slate-400 uppercase tracking-widest mb-1 italic">Type</p>
                      <p className="text-xs font-black text-slate-800 dark:text-white italic">{selectedPlant.type}</p>
                   </div>
                   <div>
                      <p className="text-[8px] font-black text-slate-400 uppercase tracking-widest mb-1 italic">Capacity</p>
                      <p className="text-xs font-black text-slate-800 dark:text-white italic">{selectedPlant.capacity} MW</p>
                   </div>
                   <div>
                      <p className="text-[8px] font-black text-slate-400 uppercase tracking-widest mb-1 italic">Region</p>
                      <p className="text-xs font-black text-slate-800 dark:text-white italic">{selectedPlant.province}, {selectedPlant.region}</p>
                   </div>
                </div>

                {associatedRequestDetail && (
                   <div className="p-8 rounded-[2rem] bg-[#74045F]/5 dark:bg-[#C7911B]/5 border border-[#74045F]/10 dark:border-[#C7911B]/10 space-y-6">
                      <div className="flex items-center gap-3">
                         <Users size={20} className="text-[#74045F] dark:text-[#C7911B]" />
                         <h3 className="text-xs font-black text-slate-800 dark:text-white uppercase tracking-widest italic">Vendor Request & Coordinator</h3>
                      </div>

                      <div className="grid md:grid-cols-2 gap-8">
                         <div className="space-y-4">
                            <div>
                               <p className="text-[8px] font-black text-slate-400 uppercase tracking-widest mb-1 italic">Vendor Company</p>
                               <p className="text-xs font-black text-[#74045F] dark:text-[#C7911B] italic uppercase tracking-tight">{associatedRequestDetail.vendorName}</p>
                               <p className="text-[8px] font-bold text-slate-500 mt-0.5">ID: {associatedRequestDetail.vendorId}</p>
                            </div>
                            
                            <div>
                               <p className="text-[8px] font-black text-slate-400 uppercase tracking-widest mb-1 italic">Request Details</p>
                               <p className="text-[10px] font-medium text-slate-600 dark:text-slate-300 italic leading-relaxed">{associatedRequestDetail.details || 'ไม่มีรายละเอียดเพิ่มเติม'}</p>
                            </div>
                         </div>

                         <div className="space-y-4">
                            <div className="p-4 rounded-2xl bg-white dark:bg-[#030712] border border-slate-100 dark:border-white/5">
                               <p className="text-[8px] font-black text-slate-400 uppercase tracking-widest mb-2 italic">On-site Coordinator</p>
                               <div className="space-y-1">
                                  <p className="text-xs font-black text-slate-800 dark:text-white italic">{associatedRequestDetail.coordinatorName || 'ไม่ระบุชื่อ'}</p>
                                  <div className="flex items-center gap-2 text-[10px] font-bold text-emerald-600">
                                     <Zap size={10} />
                                     {associatedRequestDetail.coordinatorPhone || 'ไม่ระบุเบอร์โทรศัพท์'}
                                  </div>
                               </div>
                            </div>
                         </div>
                      </div>
                   </div>
                )}

                {/* Form Data */}
                <div className="space-y-4">
                  <h3 className="text-xs font-black text-slate-400 uppercase tracking-widest italic flex items-center gap-2">
                    <FileText size={14} /> ข้อมูลการตรวจสอบ (Form Data)
                  </h3>
                  <div className="grid sm:grid-cols-2 gap-4">
                    {(() => {
                      const form = forms.find(f => f.id === selectedInspectionDetail.formId);
                      return Object.entries(selectedInspectionDetail.formData || {}).map(([key, value]: [string, any]) => {
                        let field = form?.fields?.find((f: any) => f.id === key);
                        if (!field && form?.sections) {
                          for (const section of form.sections) {
                            field = section.fields?.find((f: any) => f.id === key);
                            if (field) break;
                          }
                        }
                        const label = field?.label || key;
                        return (
                          <div key={key} className="p-4 bg-slate-50 dark:bg-white/5 rounded-2xl border border-slate-100 dark:border-white/5">
                            <p className="text-[8px] font-black text-slate-400 uppercase tracking-widest mb-1 italic">{label}</p>
                            <p className="text-sm font-black text-slate-700 dark:text-white italic">{String(value) || '-'}</p>
                          </div>
                        );
                      });
                    })()}
                  </div>
                </div>

                {/* Evidence */}
                <div className="grid md:grid-cols-2 gap-8 pt-4 border-t border-slate-100 dark:border-white/5">
                  <div className="space-y-4">
                    <h3 className="text-xs font-black text-slate-400 uppercase tracking-widest italic flex items-center gap-2">
                      <Zap size={14} /> รูปภาพประกอบ ({selectedInspectionDetail.photos.length})
                    </h3>
                    <div className="grid grid-cols-3 gap-3">
                      {selectedInspectionDetail.photos.map((p, i) => (
                        <div 
                          key={i} 
                          onClick={() => setPreviewImage(p)}
                          className="aspect-square rounded-xl overflow-hidden border border-slate-100 dark:border-white/10 cursor-zoom-in group relative"
                        >
                          <img src={p} className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-500" />
                          <div className="absolute inset-0 bg-black/20 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                            <Eye className="text-white" size={20} />
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>

                  <div className="space-y-4">
                    <h3 className="text-xs font-black text-slate-400 uppercase tracking-widest italic flex items-center gap-2">
                      <FileText size={14} /> เอกสารแนบ ({selectedInspectionDetail.documents.length})
                    </h3>
                    <div className="space-y-3">
                      {selectedInspectionDetail.documents.map((doc, i) => (
                        <div 
                          key={i} 
                          className="flex items-center justify-between p-4 bg-slate-50 dark:bg-white/5 rounded-2xl border border-slate-100 dark:border-white/5 group hover:border-indigo-500 transition-all"
                        >
                          <div className="flex items-center gap-3">
                            <div className="w-10 h-10 bg-indigo-500/10 text-indigo-500 rounded-xl flex items-center justify-center">
                              <FileText size={20} />
                            </div>
                            <div className="overflow-hidden">
                              <p className="text-[10px] font-black text-slate-800 dark:text-white truncate max-w-[150px] italic">{doc.name}</p>
                              <p className="text-[8px] font-bold text-slate-400 uppercase">Document File</p>
                            </div>
                          </div>
                          <button 
                            onClick={() => handleOpenDocument(doc)}
                            className="p-3 bg-indigo-500 text-white rounded-xl shadow-lg shadow-indigo-500/20 active:scale-90 transition-all"
                          >
                            <Eye size={14} />
                          </button>
                        </div>
                      ))}
                      {selectedInspectionDetail.documents.length === 0 && (
                        <p className="text-[10px] text-slate-400 font-bold italic py-4 text-center">ไม่มีเอกสารแนบ</p>
                      )}
                    </div>
                  </div>
                </div>

                {/* Signatures */}
                <div className="pt-8 border-t border-slate-100 dark:border-white/5">
                  <h3 className="text-xs font-black text-slate-400 uppercase tracking-widest italic mb-6 flex items-center gap-2">
                    <User size={14} /> ผู้ลงนามรับรอง (Signatures)
                  </h3>
                  <div className="grid sm:grid-cols-2 gap-8">
                    {/* Inspector Signature */}
                    <div className="flex flex-col items-center">
                      <div className="w-full h-32 bg-slate-50 dark:bg-white/5 rounded-2xl border border-slate-100 dark:border-white/5 flex items-center justify-center p-4">
                        {selectedInspectionDetail.inspectorSignature ? (
                          <img src={selectedInspectionDetail.inspectorSignature} className="max-w-full max-h-full object-contain" />
                        ) : (
                          <p className="text-[10px] text-slate-300 font-bold italic">ไม่พบข้อมูลลายมือชื่อ</p>
                        )}
                      </div>
                      <p className="mt-2 text-sm font-black text-slate-700 dark:text-white italic">({selectedInspectionDetail.inspectorName})</p>
                      <p className="text-[8px] font-black text-slate-400 uppercase tracking-widest">ผู้ตรวจสอบ (Inspector)</p>
                    </div>

                    {/* Manager Signature */}
                    <div className="flex flex-col items-center">
                      <div className="w-full h-32 bg-slate-50 dark:bg-white/5 rounded-2xl border border-slate-100 dark:border-white/5 flex items-center justify-center p-4">
                        {selectedInspectionDetail.managerSignature ? (
                          <img src={selectedInspectionDetail.managerSignature} className="max-w-full max-h-full object-contain" />
                        ) : (
                          <p className="text-[10px] text-slate-300 font-bold italic">ยังไม่ได้ลงนามอนุมัติ</p>
                        )}
                      </div>
                      <p className="mt-2 text-sm font-black text-slate-700 dark:text-white italic">({selectedInspectionDetail.managerName || '...................................' })</p>
                      <p className="text-[8px] font-black text-slate-400 uppercase tracking-widest">ผู้อนุมัติ (Manager)</p>
                    </div>
                  </div>
                </div>

                {/* Approval Note */}
                {(selectedInspectionDetail.approvalNote || selectedInspectionDetail.managerName) && (
                  <div className="pt-8 border-t border-slate-100 dark:border-white/5">
                    <div className="p-6 bg-[#74045F]/5 dark:bg-[#C7911B]/5 rounded-[2rem] border border-[#74045F]/10 dark:border-[#C7911B]/10 relative overflow-hidden">
                      <div className="relative z-10">
                        <div className="flex items-center gap-2 mb-4">
                           <ShieldCheck className="text-[#74045F] dark:text-[#C7911B]" size={16} />
                           <h4 className="text-[10px] font-black text-[#74045F] dark:text-[#C7911B] uppercase tracking-widest italic">ความเห็นจากการพิจารณาอนุมัติ</h4>
                        </div>
                        <p className="text-sm font-black text-slate-700 dark:text-white mb-6 italic leading-relaxed">
                          "{selectedInspectionDetail.approvalNote || 'ไม่มีหมายเหตุเพิ่มเติม'}"
                        </p>
                        <div className="flex justify-between items-end border-t border-[#74045F]/10 pt-4">
                          <div>
                            <p className="text-[8px] font-black text-slate-400 uppercase tracking-widest mb-1 italic">Approved By</p>
                            <p className="text-[10px] font-black text-[#74045F] dark:text-[#C7911B] italic">{selectedInspectionDetail.managerName || 'System Admin'}</p>
                          </div>
                          <div className="text-right">
                            <p className="text-[10px] font-black text-slate-400 italic">{new Date(selectedInspectionDetail.approvedAt || selectedInspectionDetail.createdAt).toLocaleString('th-TH')}</p>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Media Previews */}
      <AnimatePresence>
        {previewImage && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setPreviewImage(null)}
            className="fixed inset-0 z-[9999] bg-black/90 backdrop-blur-xl flex items-center justify-center p-4 sm:p-10"
          >
            <motion.button
              initial={{ opacity: 0, scale: 0.8 }}
              animate={{ opacity: 1, scale: 1 }}
              className="absolute top-6 right-6 p-4 bg-white/10 hover:bg-white/20 rounded-2xl text-white backdrop-blur-md transition-all border border-white/10"
              onClick={() => setPreviewImage(null)}
            >
              <X size={24} />
            </motion.button>
            <motion.div
              initial={{ opacity: 0, scale: 0.9, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9, y: 20 }}
              className="max-w-full max-h-full rounded-[2.5rem] overflow-hidden shadow-2xl border border-white/10"
              onClick={(e) => e.stopPropagation()}
            >
              <img 
                src={previewImage} 
                alt="Full Preview" 
                className="max-w-full max-h-[85vh] object-contain"
              />
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {previewDocument && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[9999] bg-black/80 backdrop-blur-md flex items-center justify-center p-4"
          >
            <div className="bg-white dark:bg-slate-900 w-full max-w-5xl h-[90vh] rounded-[2.5rem] overflow-hidden flex flex-col shadow-2xl border border-slate-200 dark:border-white/10">
              <div className="p-6 border-b border-slate-100 dark:border-white/5 flex items-center justify-between bg-slate-50 dark:bg-white/5">
                <div className="flex items-center gap-4">
                  <div className="w-10 h-10 bg-[#74045F]/10 text-[#74045F] dark:bg-[#C7911B]/10 dark:text-[#C7911B] rounded-2xl flex items-center justify-center">
                    <FileText size={20} />
                  </div>
                  <div>
                    <h3 className="text-sm font-black text-slate-800 dark:text-white truncate max-w-[200px] sm:max-w-md italic">{previewDocument.name}</h3>
                    <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Document Viewer</p>
                  </div>
                </div>
                <div className="flex gap-2">
                  <button 
                    onClick={() => {
                      const link = document.createElement('a');
                      link.href = previewDocument.blobUrl || previewDocument.url;
                      link.download = previewDocument.name;
                      document.body.appendChild(link);
                      link.click();
                      document.body.removeChild(link);
                    }}
                    className="p-3 bg-white dark:bg-white/10 text-slate-600 dark:text-white rounded-xl hover:bg-slate-100 transition-all border border-slate-200 dark:border-white/10 flex items-center gap-2 text-[10px] font-black uppercase tracking-widest"
                  >
                    <Download size={14} /> Download
                  </button>
                  <button 
                    onClick={() => {
                      const link = document.createElement('a');
                      link.href = previewDocument.blobUrl || previewDocument.url;
                      link.download = previewDocument.name;
                      document.body.appendChild(link);
                      link.click();
                      document.body.removeChild(link);
                    }}
                    className="p-3 bg-indigo-500 text-white rounded-xl hover:bg-indigo-600 transition-all shadow-lg flex items-center gap-2 text-[10px] font-black uppercase tracking-widest"
                  >
                    <Download size={14} /> Download File
                  </button>
                  <button 
                    onClick={() => {
                      if (previewDocument.blobUrl) URL.revokeObjectURL(previewDocument.blobUrl);
                      setPreviewDocument(null);
                    }}
                    className="p-3 bg-rose-500 text-white rounded-xl hover:bg-rose-600 transition-all shadow-lg active:scale-95"
                  >
                    <X size={20} />
                  </button>
                </div>
              </div>
              <div className="flex-1 bg-slate-100 dark:bg-slate-950 relative flex items-center justify-center overflow-auto">
                {previewDocument.url.includes('image/') || previewDocument.name.match(/\.(jpg|jpeg|png|gif|webp)$/i) ? (
                   <img 
                    src={previewDocument.blobUrl || previewDocument.url} 
                    alt="Document Content"
                    className="max-w-full max-h-full object-contain"
                   />
                ) : (
                  <iframe 
                    src={previewDocument.blobUrl || previewDocument.url} 
                    title="PDF Viewer"
                    className="w-full h-full border-none"
                  />
                )}
                <div className="absolute top-2 right-2 flex items-center justify-center pointer-events-none opacity-0 group-hover:opacity-100 transition-opacity">
                   <p className="bg-black/50 text-white px-4 py-2 rounded-full text-[8px] font-black uppercase tracking-widest">Document Viewer</p>
                </div>
              </div>
            </div>
          </motion.div>
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
                  className="bg-indigo-500 text-white font-black text-xs uppercase tracking-widest px-8 py-3 rounded-xl shadow-lg active:scale-95 transition-all"
                >
                  ตกลง
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
            className={`fixed bottom-10 left-1/2 z-[500] px-8 py-4 rounded-2xl shadow-2xl flex items-center gap-4 ${
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
