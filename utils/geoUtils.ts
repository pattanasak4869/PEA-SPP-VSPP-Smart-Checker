/**
 * Utilities for Thai Geographic Coordinates & Firebase GPS Synchronization
 */

export interface ParsedGpsLocation {
  lat: number;
  lng: number;
  isExactGps: boolean;
  source: 'FIREBASE_GPS' | 'PROVINCE_CENTROID' | 'REGION_CENTROID' | 'DEFAULT';
}

// Centroid coordinates for all 77 provinces of Thailand
export const THAI_PROVINCE_COORDINATES: Record<string, { lat: number; lng: number }> = {
  // ภาคกลาง
  'กรุงเทพมหานคร': { lat: 13.7563, lng: 100.5018 },
  'นนทบุรี': { lat: 13.8621, lng: 100.5144 },
  'ปทุมธานี': { lat: 14.0208, lng: 100.5250 },
  'สมุทรปราการ': { lat: 13.5991, lng: 100.5998 },
  'สมุทรสาคร': { lat: 13.5475, lng: 100.2744 },
  'สมุทรสงคราม': { lat: 13.4098, lng: 99.9998 },
  'นครปฐม': { lat: 13.8188, lng: 100.0431 },
  'พระนครศรีอยุธยา': { lat: 14.3532, lng: 100.5684 },
  'อ่างทอง': { lat: 14.5896, lng: 100.4550 },
  'สิงห์บุรี': { lat: 14.8860, lng: 100.4000 },
  'ชัยนาท': { lat: 15.1852, lng: 100.1252 },
  'ลพบุรี': { lat: 14.7995, lng: 100.6534 },
  'สระบุรี': { lat: 14.5289, lng: 100.9108 },
  'นครนายก': { lat: 14.2069, lng: 101.2131 },
  'สุพรรณบุรี': { lat: 14.4746, lng: 100.1174 },
  'นครสวรรค์': { lat: 15.6987, lng: 100.1199 },
  'อุทัยธานี': { lat: 15.3835, lng: 100.0247 },
  'กำแพงเพชร': { lat: 16.4828, lng: 99.5227 },
  'พิจิตร': { lat: 16.4418, lng: 100.3488 },
  'พิษณุโลก': { lat: 16.8211, lng: 100.2659 },
  'เพชรบูรณ์': { lat: 16.4190, lng: 101.1567 },
  'สุโขทัย': { lat: 17.0056, lng: 99.8264 },

  // ภาคเหนือ
  'เชียงใหม่': { lat: 18.7883, lng: 98.9853 },
  'เชียงราย': { lat: 19.9072, lng: 99.8325 },
  'ลำปาง': { lat: 18.2888, lng: 99.4928 },
  'ลำพูน': { lat: 18.5745, lng: 99.0087 },
  'แม่ฮ่องสอน': { lat: 19.3021, lng: 97.9654 },
  'น่าน': { lat: 18.7838, lng: 100.7782 },
  'พะเยา': { lat: 19.1664, lng: 99.9019 },
  'แพร่': { lat: 18.1446, lng: 100.1410 },
  'อุตรดิตถ์': { lat: 17.6201, lng: 100.0993 },

  // ภาคตะวันออกเฉียงเหนือ
  'นครราชสีมา': { lat: 14.9799, lng: 102.0978 },
  'ขอนแก่น': { lat: 16.4419, lng: 102.8360 },
  'อุดรธานี': { lat: 17.4138, lng: 102.7872 },
  'อุบลราชธานี': { lat: 15.2448, lng: 104.8473 },
  'บุรีรัมย์': { lat: 14.9930, lng: 103.1029 },
  'สุรินทร์': { lat: 14.8824, lng: 103.4936 },
  'ศรีสะเกษ': { lat: 15.1186, lng: 104.3220 },
  'ร้อยเอ็ด': { lat: 16.0538, lng: 103.6520 },
  'มหาสารคาม': { lat: 16.1851, lng: 103.3007 },
  'กาฬสินธุ์': { lat: 16.4322, lng: 103.5063 },
  'ชัยภูมิ': { lat: 15.8105, lng: 102.0315 },
  'เลย': { lat: 17.4860, lng: 101.7223 },
  'หนองคาย': { lat: 17.8783, lng: 102.7420 },
  'หนองบัวลำภู': { lat: 17.2036, lng: 102.4410 },
  'บึงกาฬ': { lat: 18.3609, lng: 103.6464 },
  'สกลนคร': { lat: 17.1664, lng: 104.1486 },
  'นครพนม': { lat: 17.4042, lng: 104.7788 },
  'มุกดาหาร': { lat: 16.5436, lng: 104.7235 },
  'ยโสธร': { lat: 15.7926, lng: 104.1451 },
  'อำนาจเจริญ': { lat: 15.8585, lng: 104.6258 },

  // ภาคตะวันออก
  'ชลบุรี': { lat: 13.3611, lng: 100.9847 },
  'ระยอง': { lat: 12.6814, lng: 101.2816 },
  'ฉะเชิงเทรา': { lat: 13.6904, lng: 101.0779 },
  'จันทบุรี': { lat: 12.6114, lng: 102.1038 },
  'ตราด': { lat: 12.2428, lng: 102.5175 },
  'ปราจีนบุรี': { lat: 14.0510, lng: 101.3716 },
  'สระแก้ว': { lat: 13.8140, lng: 102.0728 },

  // ภาคตะวันตก
  'กาญจนบุรี': { lat: 14.0228, lng: 99.5328 },
  'ตาก': { lat: 16.8837, lng: 99.1258 },
  'ราชบุรี': { lat: 13.5283, lng: 99.8134 },
  'เพชรบุรี': { lat: 13.1110, lng: 99.9398 },
  'ประจวบคีรีขันธ์': { lat: 11.8124, lng: 99.7972 },

  // ภาคใต้
  'สุราษฎร์ธานี': { lat: 9.1382, lng: 99.3215 },
  'นครศรีธรรมราช': { lat: 8.4304, lng: 99.9631 },
  'สงขลา': { lat: 7.1898, lng: 100.5954 },
  'ภูเก็ต': { lat: 7.8804, lng: 98.3923 },
  'กระบี่': { lat: 8.0863, lng: 98.9063 },
  'พังงา': { lat: 8.4509, lng: 98.5255 },
  'ชุมพร': { lat: 10.4930, lng: 99.1800 },
  'ระนอง': { lat: 9.9658, lng: 98.6348 },
  'ตรัง': { lat: 7.5563, lng: 99.6114 },
  'พัทลุง': { lat: 7.6167, lng: 100.0740 },
  'สตูล': { lat: 6.6238, lng: 100.0674 },
  'ปัตตานี': { lat: 6.8675, lng: 101.2501 },
  'ยะลา': { lat: 6.5411, lng: 101.2813 },
  'นราธิวาส': { lat: 6.4255, lng: 101.8253 }
};

// Regional default centroids
export const REGION_CENTROIDS: Record<string, { lat: number; lng: number }> = {
  'ภาคกลาง': { lat: 14.1500, lng: 100.5000 },
  'ภาคเหนือ': { lat: 18.5000, lng: 99.2000 },
  'ภาคตะวันออกเฉียงเหนือ': { lat: 15.9000, lng: 102.8000 },
  'ภาคอีสาน': { lat: 15.9000, lng: 102.8000 },
  'ภาคตะวันออก': { lat: 13.2000, lng: 101.5000 },
  'ภาคตะวันตก': { lat: 14.0000, lng: 99.5000 },
  'ภาคใต้': { lat: 8.5000, lng: 99.5000 }
};

/**
 * Validates whether latitude and longitude are within plausible Thailand boundary
 */
export function isValidThailandCoordinate(lat: number, lng: number): boolean {
  if (isNaN(lat) || isNaN(lng)) return false;
  if (lat === 0 && lng === 0) return false;
  // Thailand bounding box approx: Lat 5.0 to 21.0, Lng 96.5 to 106.5
  return lat >= 5.0 && lat <= 21.0 && lng >= 96.5 && lng <= 106.5;
}

/**
 * Helper to safely extract numeric coordinate from various field types
 */
function toCoordinateNumber(val: any): number {
  if (typeof val === 'number') return val;
  if (typeof val === 'string') {
    const clean = val.trim().replace(/,/g, '');
    const num = parseFloat(clean);
    return isNaN(num) ? 0 : num;
  }
  return 0;
}

/**
 * Helper to extract coordinates from string (e.g. "13.8188, 100.0431" or Google Maps URL)
 */
function extractCoordsFromString(str: string): { lat: number; lng: number } | null {
  if (!str || typeof str !== 'string') return null;

  // Check for google maps @lat,lng pattern
  const atMatch = str.match(/@([0-9]+\.[0-9]+),([0-9]+\.[0-9]+)/);
  if (atMatch) {
    const lat = parseFloat(atMatch[1]);
    const lng = parseFloat(atMatch[2]);
    if (isValidThailandCoordinate(lat, lng)) return { lat, lng };
  }

  // Check for q=lat,lng or ll=lat,lng
  const qMatch = str.match(/[?&](?:q|ll|query)=([0-9]+\.[0-9]+),([0-9]+\.[0-9]+)/);
  if (qMatch) {
    const lat = parseFloat(qMatch[1]);
    const lng = parseFloat(qMatch[2]);
    if (isValidThailandCoordinate(lat, lng)) return { lat, lng };
  }

  // Check for generic "13.8188, 100.0431" or "13.8188 100.0431"
  const rawMatch = str.match(/([0-9]{1,2}\.[0-9]+)[,\s]+([0-9]{2,3}\.[0-9]+)/);
  if (rawMatch) {
    const lat = parseFloat(rawMatch[1]);
    const lng = parseFloat(rawMatch[2]);
    if (isValidThailandCoordinate(lat, lng)) return { lat, lng };
    // Try reversed order in case it was lng, lat
    if (isValidThailandCoordinate(lng, lat)) return { lat: lng, lng: lat };
  }

  return null;
}

/**
 * Extracts and validates GPS coordinates from any Firebase object structure
 */
export function parseFirebaseCoordinates(
  entity: any,
  fallbackProvince?: string,
  fallbackRegion?: string
): ParsedGpsLocation {
  if (!entity) {
    return { lat: 13.7563, lng: 100.5018, isExactGps: false, source: 'DEFAULT' };
  }

  let lat = 0;
  let lng = 0;

  // 1. Direct gps object (gps: { lat, lng } or gps: { latitude, longitude } or GeoPoint)
  if (entity.gps) {
    if (typeof entity.gps === 'object') {
      lat = toCoordinateNumber(entity.gps.lat ?? entity.gps.latitude ?? entity.gps._latitude ?? entity.gps.Latitude);
      lng = toCoordinateNumber(entity.gps.lng ?? entity.gps.longitude ?? entity.gps._longitude ?? entity.gps.Longitude);
    } else if (typeof entity.gps === 'string') {
      const extracted = extractCoordsFromString(entity.gps);
      if (extracted) {
        lat = extracted.lat;
        lng = extracted.lng;
      }
    }
  }

  // 2. Direct coordinates object (coordinates: { lat, lng } or coordinates: { latitude, longitude })
  if (!isValidThailandCoordinate(lat, lng) && entity.coordinates) {
    if (typeof entity.coordinates === 'object') {
      lat = toCoordinateNumber(entity.coordinates.lat ?? entity.coordinates.latitude ?? entity.coordinates._latitude);
      lng = toCoordinateNumber(entity.coordinates.lng ?? entity.coordinates.longitude ?? entity.coordinates._longitude);
    } else if (typeof entity.coordinates === 'string') {
      const extracted = extractCoordsFromString(entity.coordinates);
      if (extracted) {
        lat = extracted.lat;
        lng = extracted.lng;
      }
    }
  }

  // 3. Root level fields (lat, lng, latitude, longitude, _latitude, _longitude)
  if (!isValidThailandCoordinate(lat, lng)) {
    lat = toCoordinateNumber(entity.lat ?? entity.latitude ?? entity._latitude ?? entity.Latitude);
    lng = toCoordinateNumber(entity.lng ?? entity.longitude ?? entity._longitude ?? entity.Longitude);
  }

  // 4. Map URLs or location fields containing coordinate numbers
  if (!isValidThailandCoordinate(lat, lng)) {
    const stringFields = [
      entity.location, 
      entity.mapUrl, 
      entity.googleMapsUrl, 
      entity.mapsUrl, 
      entity.link, 
      entity.connectionPoint,
      entity.address
    ];

    for (const field of stringFields) {
      if (typeof field === 'string') {
        const extracted = extractCoordsFromString(field);
        if (extracted) {
          lat = extracted.lat;
          lng = extracted.lng;
          break;
        }
      }
    }
  }

  // If valid exact GPS found from Firebase record:
  if (isValidThailandCoordinate(lat, lng)) {
    return {
      lat,
      lng,
      isExactGps: true,
      source: 'FIREBASE_GPS'
    };
  }

  // 5. Province Lookup Fallback - check province, location, address, or plant name
  const provinceCandidates = [
    entity.province, 
    fallbackProvince, 
    entity.location, 
    entity.address, 
    entity.name
  ].filter(Boolean);

  for (const cand of provinceCandidates) {
    if (typeof cand !== 'string') continue;
    const cleanCand = cand.replace(/^จ\.|จังหวัด/g, '').trim();
    for (const [key, coords] of Object.entries(THAI_PROVINCE_COORDINATES)) {
      if (cleanCand.includes(key) || key.includes(cleanCand)) {
        return {
          lat: coords.lat,
          lng: coords.lng,
          isExactGps: false,
          source: 'PROVINCE_CENTROID'
        };
      }
    }
  }

  // 6. Region Lookup Fallback
  const regionCandidates = [
    entity.region, 
    fallbackRegion
  ].filter(Boolean);

  for (const cand of regionCandidates) {
    if (typeof cand !== 'string') continue;
    for (const [key, coords] of Object.entries(REGION_CENTROIDS)) {
      if (cand.includes(key) || key.includes(cand)) {
        return {
          lat: coords.lat,
          lng: coords.lng,
          isExactGps: false,
          source: 'REGION_CENTROID'
        };
      }
    }
  }

  // 7. Default Thailand Center (Bangkok / PEA HQ)
  return {
    lat: 13.7563,
    lng: 100.5018,
    isExactGps: false,
    source: 'DEFAULT'
  };
}

