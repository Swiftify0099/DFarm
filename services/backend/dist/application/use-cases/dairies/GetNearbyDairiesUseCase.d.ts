export interface NearbyDairyResult {
    id: string;
    dairyId: string;
    name: string;
    dairyName: string;
    code: string;
    registrationNumber: string;
    village: string;
    district: string;
    state: string;
    contactPhone: string;
    associatedPerson: string;
    adminName: string;
    associatedPersonPhone: string;
    centerId: string | null;
    centerCode: string | null;
    centerName: string | null;
    latitude: number | null;
    longitude: number | null;
    formattedAddress: string | null;
    distanceKm: number | null;
    distanceMeters: number | null;
    distanceLabel: string | null;
    isActive: boolean;
    discoveryStatus: string;
    provisioningStatus?: string;
    isRegistrationEligible?: boolean;
    registrationBlockReason?: string;
    isOperational?: boolean;
}
export interface NearbyDairiesOutput {
    items: NearbyDairyResult[];
    searchRadiusMeters: number;
    totalFound: number;
}
export declare class GetNearbyDairiesUseCase {
    execute(lat?: number, lng?: number, searchQuery?: string, radiusKm?: number): Promise<NearbyDairyResult[]>;
}
//# sourceMappingURL=GetNearbyDairiesUseCase.d.ts.map