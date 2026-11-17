import { useQuery } from '@tanstack/react-query';
import { apiClient } from '../../services/api-client';
import { locationService } from '../../services/location-service';
import { Dairy } from '../../types/dairy';

export interface AreaFilter {
  id: string;
  name: string;
  label: string;
  latitude?: number;
  longitude?: number;
}

export const PRESET_AREAS: AreaFilter[] = [
  { id: 'all', name: 'All Areas', label: '📍 All Areas' },
  {
    id: 'kolhapur',
    name: 'Kolhapur',
    label: '📍 Kolhapur (Gokul / Warna)',
    latitude: 16.6644,
    longitude: 74.2588,
  },
  {
    id: 'sangli',
    name: 'Sangli',
    label: '📍 Sangli (Miraj / Tasgaon)',
    latitude: 16.8456,
    longitude: 74.6478,
  },
  {
    id: 'pune',
    name: 'Pune',
    label: '📍 Pune (Manchar / Shivajinagar)',
    latitude: 18.5204,
    longitude: 73.8567,
  },
];

export function useDairyDiscovery(
  searchQuery?: string,
  selectedCoords?: { latitude?: number; longitude?: number } | null,
  options?: { enabled?: boolean }
) {
  return useQuery({
    queryKey: [
      'dairies',
      'nearby',
      searchQuery,
      selectedCoords?.latitude,
      selectedCoords?.longitude,
    ],
    enabled: options?.enabled !== false,
    queryFn: async (): Promise<Dairy[]> => {
      let currentLat: number | undefined;
      let currentLng: number | undefined;

      if (
        typeof selectedCoords?.latitude === 'number' &&
        typeof selectedCoords?.longitude === 'number'
      ) {
        currentLat = selectedCoords.latitude;
        currentLng = selectedCoords.longitude;
      } else if (selectedCoords === undefined) {
        const coords = await locationService.getCurrentLocation();
        currentLat = coords?.latitude;
        currentLng = coords?.longitude;
      }
      // When selectedCoords === null ("All Areas"), currentLat and currentLng remain undefined to fetch all directory dairies

      const params: any = {
        searchQuery: searchQuery || undefined,
        search: searchQuery || undefined,
      };

      if (currentLat !== undefined && currentLng !== undefined) {
        params.lat = currentLat;
        params.lng = currentLng;
        params.latitude = currentLat;
        params.longitude = currentLng;
        params.radiusKm = 5;
      }

      try {
        const response = await apiClient.get('/dairies/nearby', {
          params,
        });

        const rawList = Array.isArray(response.data)
          ? response.data
          : Array.isArray((response.data as any)?.data)
          ? (response.data as any).data
          : [];

        if (rawList && rawList.length > 0) {
          const cachedGps = locationService.getCachedLocation();
          const refLat = currentLat ?? cachedGps?.latitude;
          const refLng = currentLng ?? cachedGps?.longitude;

          const mapped: Dairy[] = rawList.map((item: any) => {
            const dLat =
              item.latitude !== undefined ? Number(item.latitude) : undefined;
            const dLng =
              item.longitude !== undefined ? Number(item.longitude) : undefined;
            let distanceKm: number | undefined =
              typeof item.distanceKm === 'number' ? item.distanceKm : undefined;

            if (
              distanceKm === undefined &&
              typeof dLat === 'number' &&
              typeof dLng === 'number' &&
              refLat !== undefined &&
              refLng !== undefined
            ) {
              distanceKm = locationService.calculateDistanceKm(
                refLat,
                refLng,
                dLat,
                dLng
              );
            }

            return {
              id: item.id || item.dairyId,
              name: item.name || item.dairyName,
              registrationNumber:
                item.registrationNumber || item.code || item.registration_number || '',
              village:
                item.village ||
                item.villageLocality ||
                item.city ||
                item.centerName ||
                'Local Area',
              district: item.district || '',
              state: item.state || 'Maharashtra',
              contactPhone:
                item.contactPhone ||
                item.businessPhone ||
                item.contact_phone ||
                '+91 98220 12345',
              associatedPerson:
                item.associatedPerson ||
                item.adminName ||
                item.primaryAdminName ||
                item.associated_person ||
                'Dairy Administrator',
              adminName:
                item.adminName ||
                item.associatedPerson ||
                item.primaryAdminName ||
                'Dairy Administrator',
              associatedPersonPhone:
                item.associatedPersonPhone ||
                item.primaryAdminMobile ||
                item.contactPhone ||
                item.businessPhone,
              centerId: item.centerId || item.center_id,
              centerCode: item.centerCode || item.center_code || 'C-01',
              centerName:
                item.centerName ||
                item.center_name ||
                `${item.name || item.dairyName} Main Center`,
              formattedAddress: item.formattedAddress || item.formatted_address,
              distanceKm,
              latitude: dLat,
              longitude: dLng,
              isActive: item.isActive !== false && item.discoveryStatus !== 'SUSPENDED' && item.discoveryStatus !== 'DISABLED',
            };
          });

          // Only approved / active and NOT suspended dairies
          const activeOnly = mapped.filter((d) => d.isActive);

          // Sort by distanceKm (nearest first)
          activeOnly.sort((a, b) => {
            if (a.distanceKm !== undefined && b.distanceKm !== undefined) {
              return a.distanceKm - b.distanceKm;
            }
            if (a.distanceKm !== undefined) return -1;
            if (b.distanceKm !== undefined) return 1;
            return 0;
          });

          if (searchQuery && searchQuery.trim()) {
            const q = searchQuery.toLowerCase().trim();
            return activeOnly.filter(
              (d) =>
                d.name?.toLowerCase().includes(q) ||
                d.village?.toLowerCase().includes(q) ||
                d.district?.toLowerCase().includes(q) ||
                d.associatedPerson?.toLowerCase().includes(q) ||
                d.adminName?.toLowerCase().includes(q) ||
                d.centerName?.toLowerCase().includes(q) ||
                d.registrationNumber?.toLowerCase().includes(q)
            );
          }

          return activeOnly;
        }

        return [];
      } catch (err) {
        // Return empty array when no dairies found or network error, UI handles empty state cleanly
        return [];
      }
    },
    staleTime: 60000,
  });
}
