import * as Location from 'expo-location';

export interface UserCoordinates {
  latitude: number;
  longitude: number;
  accuracy?: number | null;
}

class LocationService {
  private cachedLocation: UserCoordinates | null = null;
  private cacheTimestamp: number = 0;
  private readonly CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes cache

  async requestPermission(): Promise<boolean> {
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      return status === 'granted';
    } catch {
      return false;
    }
  }

  async getCurrentLocation(): Promise<UserCoordinates | null> {
    const now = Date.now();
    if (this.cachedLocation && now - this.cacheTimestamp < this.CACHE_TTL_MS) {
      return this.cachedLocation;
    }

    try {
      const hasPermission = await this.requestPermission();
      if (!hasPermission) {
        return null;
      }

      const location = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.Balanced,
      });

      this.cachedLocation = {
        latitude: location.coords.latitude,
        longitude: location.coords.longitude,
        accuracy: location.coords.accuracy,
      };
      this.cacheTimestamp = now;

      return this.cachedLocation;
    } catch {
      return null;
    }
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
