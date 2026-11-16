import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  Pressable,
  ScrollView,
} from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import {
  DFARM_COLORS,
  DFARM_TYPOGRAPHY,
  DFARM_RADIUS,
  ClayCard,
  ClayButton,
  ClayInput,
  ClayBadge,
  ClayHeader,
  ClayLoadingState,
  ClayEmptyState,
} from '../../design-system';
import {
  useDairyDiscovery,
  PRESET_AREAS,
  AreaFilter,
} from '../../features/dairy/useDairyDiscovery';
import { Dairy } from '../../types/dairy';
import { locationService } from '../../services/location-service';

type LocationState =
  | { kind: 'detecting' }
  | { kind: 'denied' }
  | { kind: 'unavailable' }
  | { kind: 'ready'; latitude: number; longitude: number; label: string }
  | { kind: 'manual'; latitude?: number; longitude?: number; label: string };

export default function DairyDiscoveryScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ mobileNumber?: string }>();
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedDairy, setSelectedDairy] = useState<Dairy | null>(null);
  const [activeArea, setActiveArea] = useState<string>('gps');
  const [locationState, setLocationState] = useState<LocationState>({ kind: 'detecting' });

  // Derive selectedCoords from locationState for query dependency
  const selectedCoords = locationState.kind === 'ready' || locationState.kind === 'manual'
    ? { latitude: locationState.latitude, longitude: locationState.longitude }
    : locationState.kind === 'detecting'
    ? undefined  // undefined = will try GPS in hook
    : null;      // null = "All Areas" — fetch all without radius filter

  const {
    data: dairies,
    isLoading,
    refetch,
  } = useDairyDiscovery(searchQuery, selectedCoords);

  const [isRefreshingLocation, setIsRefreshingLocation] = useState(false);

  // Auto-detect GPS on mount
  useEffect(() => {
    let cancelled = false;
    async function detectLocation() {
      setLocationState({ kind: 'detecting' });
      try {
        const coords = await locationService.getCurrentLocation();
        if (cancelled) return;
        if (coords) {
          setActiveArea('gps');
          setLocationState({
            kind: 'ready',
            latitude: coords.latitude,
            longitude: coords.longitude,
            label: 'GPS Current Location',
          });
        } else {
          // GPS returned null — permission denied or unavailable
          setLocationState({ kind: 'denied' });
          setActiveArea('all');
        }
      } catch {
        if (!cancelled) {
          setLocationState({ kind: 'unavailable' });
          setActiveArea('all');
        }
      }
    }
    detectLocation();
    return () => { cancelled = true; };
  }, []);

  const handleSelectArea = (area: AreaFilter) => {
    setActiveArea(area.id);
    if (area.id === 'all') {
      setLocationState({ kind: 'manual', label: 'All Areas' });
    } else if (area.latitude !== undefined && area.longitude !== undefined) {
      setLocationState({
        kind: 'manual',
        latitude: area.latitude,
        longitude: area.longitude,
        label: area.name,
      });
    }
  };

  const handleDetectGPS = async () => {
    setIsRefreshingLocation(true);
    setLocationState({ kind: 'detecting' });
    try {
      const coords = await locationService.getCurrentLocation();
      if (coords) {
        setActiveArea('gps');
        // Setting locationState drives selectedCoords which is a queryKey dependency
        // TanStack Query will auto-refetch when queryKey changes — no manual refetch needed
        setLocationState({
          kind: 'ready',
          latitude: coords.latitude,
          longitude: coords.longitude,
          label: 'GPS Current Location',
        });
      } else {
        setLocationState({ kind: 'denied' });
        setActiveArea('all');
      }
    } catch {
      setLocationState({ kind: 'unavailable' });
      setActiveArea('all');
    } finally {
      setIsRefreshingLocation(false);
    }
  };

  const handleSelectDairy = (dairy: Dairy) => {
    setSelectedDairy(dairy);
  };

  const handleProceed = () => {
    if (!selectedDairy) return;
    router.push({
      pathname: '/(onboarding)/register',
      params: {
        dairyId: selectedDairy.id,
        dairyName: selectedDairy.name,
        village: selectedDairy.village,
        associatedPerson: selectedDairy.associatedPerson,
        mobileNumber: params.mobileNumber,
      },
    });
  };

  const getAreaBannerText = () => {
    if (locationState.kind === 'detecting') return '📡 Detecting your GPS location...';
    if (locationState.kind === 'denied') return '📍 Location permission denied — showing all dairies';
    if (locationState.kind === 'unavailable') return '📍 GPS unavailable — showing all dairies';
    if (isRefreshingLocation) return '🔄 Refreshing GPS location...';
    if (!dairies || dairies.length === 0) return '🔍 No registered dairies found in this area';
    const areaLabel =
      locationState.kind === 'ready' || locationState.kind === 'manual'
        ? locationState.label
        : 'this area';
    return `📍 ${areaLabel}: ${dairies.length} registered ${dairies.length === 1 ? 'dairy' : 'dairies'}`;
  };

  const renderLocationBanner = () => {
    if (locationState.kind === 'denied') {
      return (
        <View style={styles.permissionBanner}>
          <Text style={styles.permissionBannerText}>
            📍 Location permission is required for nearby dairy discovery.
          </Text>
          <ClayButton
            title="Enable GPS"
            variant="outline"
            size="sm"
            onPress={handleDetectGPS}
            style={styles.permissionButton}
          />
        </View>
      );
    }
    if (locationState.kind === 'unavailable') {
      return (
        <View style={styles.permissionBanner}>
          <Text style={styles.permissionBannerText}>
            ⚠️ GPS unavailable. Select an area below or tap Retry.
          </Text>
          <ClayButton
            title="Retry GPS"
            variant="outline"
            size="sm"
            onPress={handleDetectGPS}
            style={styles.permissionButton}
          />
        </View>
      );
    }
    return null;
  };

  return (
    <SafeAreaView style={styles.container}>
      <ClayHeader
        title="Select Your Dairy"
        subtitle="Connect to your local village collection center"
      />

      {renderLocationBanner()}

      <View style={styles.searchSection}>
        <ClayInput
          placeholder="Search by dairy, village, center, or in-charge..."
          value={searchQuery}
          onChangeText={setSearchQuery}
          containerStyle={styles.searchInput}
        />

        {/* Quick Area Filter Chips */}
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.areaChipsContainer}
        >
          <Pressable
            style={[
              styles.areaChip,
              activeArea === 'gps' && styles.areaChipActive,
            ]}
            onPress={handleDetectGPS}
            disabled={isRefreshingLocation || locationState.kind === 'detecting'}
          >
            <Text
              style={[
                styles.areaChipText,
                activeArea === 'gps' && styles.areaChipTextActive,
              ]}
            >
              {isRefreshingLocation || locationState.kind === 'detecting' ? '🔄 GPS...' : '📍 GPS Live'}
            </Text>
          </Pressable>

          {PRESET_AREAS.map((area) => {
            const isActive = activeArea === area.id;
            return (
              <Pressable
                key={area.id}
                style={[styles.areaChip, isActive && styles.areaChipActive]}
                onPress={() => handleSelectArea(area)}
              >
                <Text style={[styles.areaChipText, isActive && styles.areaChipTextActive]}>
                  {area.label}
                </Text>
              </Pressable>
            );
          })}
        </ScrollView>
      </View>

      {/* Area Banner */}
      <View style={styles.areaBanner}>
        <Text style={styles.areaBannerText}>{getAreaBannerText()}</Text>
      </View>

      {/* Dairy List */}
      {locationState.kind === 'detecting' ? (
        <ClayLoadingState message="Detecting your GPS location..." />
      ) : isLoading ? (
        <ClayLoadingState message="Searching nearby dairies..." />
      ) : !dairies || dairies.length === 0 ? (
        <ClayEmptyState
          title="No Dairies Found"
          description="No registered dairies found in this area. Try expanding your search area or search by name."
          actionTitle="Search All Areas"
          onAction={() => handleSelectArea({ id: 'all', name: 'All Areas', label: '📍 All Areas' })}
        />
      ) : (
        <FlatList
          data={dairies}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.listContent}
          renderItem={({ item }) => {
            const isSelected = selectedDairy?.id === item.id;
            return (
              <Pressable onPress={() => handleSelectDairy(item)}>
                <ClayCard
                  style={[styles.dairyCard, isSelected && styles.dairyCardSelected]}
                >
                  <View style={styles.dairyCardHeader}>
                    <Text style={styles.dairyName}>{item.name}</Text>
                    {item.distanceKm !== undefined && item.distanceKm !== null && (
                      <ClayBadge
                        label={
                          item.distanceKm < 1
                            ? `${Math.round(item.distanceKm * 1000)} m`
                            : `${item.distanceKm.toFixed(1)} km`
                        }
                        variant="orange"
                      />
                    )}
                  </View>
                  <Text style={styles.dairyVillage}>
                    📍 {item.village}{item.district ? `, ${item.district}` : ''}
                  </Text>
                  {item.associatedPerson && (
                    <Text style={styles.dairyAdmin}>👤 {item.associatedPerson}</Text>
                  )}
                  {isSelected && (
                    <View style={styles.selectedIndicator}>
                      <Text style={styles.selectedText}>✓ Selected</Text>
                    </View>
                  )}
                </ClayCard>
              </Pressable>
            );
          }}
        />
      )}

      {/* Proceed Button */}
      {selectedDairy && (
        <View style={styles.proceedSection}>
          <ClayButton
            title={`Continue with ${selectedDairy.name}`}
            onPress={handleProceed}
            variant="primary"
          />
        </View>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: DFARM_COLORS.primaryCream,
  },
  permissionBanner: {
    backgroundColor: '#FFF3CD',
    borderColor: '#FFC107',
    borderWidth: 1,
    marginHorizontal: 16,
    marginTop: 8,
    borderRadius: DFARM_RADIUS.md,
    padding: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  permissionBannerText: {
    ...DFARM_TYPOGRAPHY.bodySm,
    color: '#856404',
    flex: 1,
  },
  permissionButton: {
    flexShrink: 0,
  },
  searchSection: {
    paddingHorizontal: 16,
    paddingTop: 12,
    gap: 10,
  },
  searchInput: {
    marginBottom: 0,
  },
  areaChipsContainer: {
    paddingVertical: 4,
    gap: 8,
    paddingRight: 16,
  },
  areaChip: {
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 20,
    backgroundColor: DFARM_COLORS.surfaceInset,
    borderWidth: 1.5,
    borderColor: DFARM_COLORS.border,
  },
  areaChipActive: {
    backgroundColor: DFARM_COLORS.primaryOrange,
    borderColor: DFARM_COLORS.primaryOrange,
  },
  areaChipText: {
    ...DFARM_TYPOGRAPHY.bodySm,
    color: DFARM_COLORS.secondaryText,
    fontWeight: '600',
  },
  areaChipTextActive: {
    color: '#FFFFFF',
    fontWeight: '700',
  },
  areaBanner: {
    marginHorizontal: 16,
    marginTop: 10,
    marginBottom: 4,
    padding: 10,
    borderRadius: DFARM_RADIUS.sm,
    backgroundColor: '#F0FDF4',
    borderWidth: 1,
    borderColor: '#BBF7D0',
  },
  areaBannerText: {
    ...DFARM_TYPOGRAPHY.bodySm,
    color: '#166534',
    fontWeight: '600',
  },
  listContent: {
    padding: 16,
    gap: 10,
  },
  dairyCard: {
    padding: 14,
    marginBottom: 10,
    borderWidth: 1.5,
    borderColor: DFARM_COLORS.border,
  },
  dairyCardSelected: {
    borderColor: DFARM_COLORS.primaryOrange,
    backgroundColor: '#FFF9F5',
  },
  dairyCardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 4,
  },
  dairyName: {
    ...DFARM_TYPOGRAPHY.bodyMd,
    fontWeight: '700',
    color: DFARM_COLORS.primaryText,
    flex: 1,
    marginRight: 8,
  },
  dairyVillage: {
    ...DFARM_TYPOGRAPHY.bodySm,
    color: DFARM_COLORS.secondaryText,
    marginBottom: 2,
  },
  dairyAdmin: {
    ...DFARM_TYPOGRAPHY.bodySm,
    color: DFARM_COLORS.secondaryText,
  },
  selectedIndicator: {
    marginTop: 8,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: DFARM_COLORS.border,
  },
  selectedText: {
    ...DFARM_TYPOGRAPHY.bodySm,
    color: DFARM_COLORS.primaryOrange,
    fontWeight: '700',
  },
  proceedSection: {
    padding: 16,
    paddingBottom: 20,
  },
});
