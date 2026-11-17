import * as Location from 'expo-location';

export interface UserCoordinates {
  latitude: number;
  longitude: number;
  accuracy?: number | null;
}

class LocationService {
  private cachedLocation: UserCoordinates | null = null;
  private cacheTimestamp: number = 0;
  private pendingPromise: Promise<UserCoordinates | null> | null = null;
  private readonly CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes cache

  async requestPermission(): Promise<boolean> {
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      return status === 'granted';
    } catch {
      return false;
    }
  }

  getCachedLocation(): UserCoordinates | null {
    return this.cachedLocation;
  }

  async getCurrentLocation(forceRefresh = false): Promise<UserCoordinates | null> {
    const now = Date.now();
    if (!forceRefresh && this.cachedLocation && now - this.cacheTimestamp < this.CACHE_TTL_MS) {
      return this.cachedLocation;
    }

    if (this.pendingPromise) {
      return this.pendingPromise;
    }

    this.pendingPromise = (async () => {
      try {
        const hasPermission = await this.requestPermission();
        if (!hasPermission) {
          return null;
        }

        let location: Location.LocationObject | null = null;

        try {
          location = await Location.getCurrentPositionAsync({
            accuracy: Location.Accuracy.Balanced,
          });
        } catch {
          // If current position fails (e.g. indoors or timeout), fallback to last known
          location = await Location.getLastKnownPositionAsync();
        }

        if (location && location.coords) {
          this.cachedLocation = {
            latitude: location.coords.latitude,
            longitude: location.coords.longitude,
            accuracy: location.coords.accuracy,
          };
          this.cacheTimestamp = Date.now();
          return this.cachedLocation;
        }

        return this.cachedLocation || null;
      } catch {
        return this.cachedLocation || null;
      } finally {
        this.pendingPromise = null;
      }
    })();

    return this.pendingPromise;
  }

  calculateDistanceKm(
    lat1: number,
    lon1: number,
    lat2: number,
    lon2: number
  ): number {
    const R = 6371; // Earth's radius in km
    const dLat = ((lat2 - lat1) * Math.PI) / 180;
    const dLon = ((lon2 - lon1) * Math.PI) / 180;
    const a =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos((lat1 * Math.PI) / 180) *
        Math.cos((lat2 * Math.PI) / 180) *
        Math.sin(dLon / 2) *
        Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return parseFloat((R * c).toFixed(1));
  }
}

export const locationService = new LocationService();
