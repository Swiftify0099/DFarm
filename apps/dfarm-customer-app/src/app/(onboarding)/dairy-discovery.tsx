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
  DFARM_SHADOWS,
  ClayCard,
  ClayButton,
  ClayInput,
  ClayBadge,
  ClayHeader,
  ClayLoadingState,
  ClayEmptyState,
  DistanceBadge,
} from '../../design-system';
import {
  useDairyDiscovery,
  PRESET_AREAS,
  AreaFilter,
} from '../../features/dairy/useDairyDiscovery';
import { Dairy } from '../../types/dairy';
import { locationService } from '../../services/location-service';
import {
  LocationPinIcon,
  GpsPulseIcon,
  DairyCenterIcon,
} from '../../assets/vectors/LocationAssets';

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
  const selectedCoords =
    locationState.kind === 'ready'
      ? { latitude: locationState.latitude, longitude: locationState.longitude }
      : locationState.kind === 'manual'
      ? locationState.latitude !== undefined && locationState.longitude !== undefined
        ? { latitude: locationState.latitude, longitude: locationState.longitude }
        : null
      : locationState.kind === 'detecting'
      ? undefined
      : null;

  const {
    data: dairies,
    isLoading,
    refetch,
  } = useDairyDiscovery(searchQuery, selectedCoords, {
    enabled: locationState.kind !== 'detecting',
  });

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
    return () => {
      cancelled = true;
    };
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
      const coords = await locationService.getCurrentLocation(true);
      if (coords) {
        setActiveArea('gps');
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
    if (locationState.kind === 'detecting') return 'Detecting your GPS location...';
    if (locationState.kind === 'denied') return 'Location permission denied — showing all dairies';
    if (locationState.kind === 'unavailable') return 'GPS unavailable — showing all dairies';
    if (isRefreshingLocation) return 'Refreshing GPS location...';
    if (!dairies || dairies.length === 0) return 'No registered dairies found in this area';
    const areaLabel =
      locationState.kind === 'ready' || locationState.kind === 'manual'
        ? locationState.label
        : 'this area';
    return `${areaLabel}: ${dairies.length} registered ${dairies.length === 1 ? 'dairy' : 'dairies'}`;
  };

  const renderLocationBanner = () => {
    if (locationState.kind === 'denied' || locationState.kind === 'unavailable') {
      return (
        <View style={styles.permissionCard}>
          <View style={styles.permissionIconCol}>
            <LocationPinIcon size={24} color={DFARM_COLORS.primaryOrange} />
          </View>
          <View style={styles.permissionTextCol}>
            <Text style={styles.permissionTitle}>GPS Location Offline</Text>
            <Text style={styles.permissionSubtitle}>
              Enable device location or tap an area chip below to find your village dairy.
            </Text>
          </View>
          <ClayButton
            title="Enable GPS"
            variant="outline"
            size="sm"
            onPress={handleDetectGPS}
            style={styles.permissionBtn}
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

      {/* Search & Area Filter Bar */}
      <View style={styles.searchSection}>
        <ClayInput
          placeholder="Search by dairy, village, or in-charge..."
          value={searchQuery}
          onChangeText={setSearchQuery}
          containerStyle={styles.searchInput}
          leftElement={<LocationPinIcon size={18} color={DFARM_COLORS.secondaryText} />}
        />

        {/* Quick Area Filter Chips */}
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.areaChipsContainer}
        >
          <Pressable
            style={({ pressed }) => [
              styles.areaChip,
              activeArea === 'gps' && styles.areaChipActive,
              pressed && styles.pressed,
            ]}
            onPress={handleDetectGPS}
            disabled={isRefreshingLocation || locationState.kind === 'detecting'}
          >
            <GpsPulseIcon
              size={16}
              color={activeArea === 'gps' ? '#FFFFFF' : DFARM_COLORS.primaryOrange}
            />
            <Text
              style={[
                styles.areaChipText,
                activeArea === 'gps' && styles.areaChipTextActive,
              ]}
            >
              {isRefreshingLocation || locationState.kind === 'detecting'
                ? 'Detecting GPS...'
                : 'GPS Live'}
            </Text>
          </Pressable>

          {PRESET_AREAS.map((area) => {
            const isActive = activeArea === area.id;
            return (
              <Pressable
                key={area.id}
                style={({ pressed }) => [
                  styles.areaChip,
                  isActive && styles.areaChipActive,
                  pressed && styles.pressed,
                ]}
                onPress={() => handleSelectArea(area)}
              >
                <Text
                  style={[
                    styles.areaChipText,
                    isActive && styles.areaChipTextActive,
                  ]}
                >
                  {area.name}
                </Text>
              </Pressable>
            );
          })}
        </ScrollView>
      </View>

      {/* Area Status Banner */}
      <View style={styles.areaBanner}>
        <View style={styles.bannerDot} />
        <Text style={styles.areaBannerText}>{getAreaBannerText()}</Text>
      </View>

      {/* Dairy List */}
      {locationState.kind === 'detecting' ? (
        <ClayLoadingState message="Detecting your GPS location..." />
      ) : isLoading ? (
        <ClayLoadingState message="Searching nearby registered dairies..." />
      ) : !dairies || dairies.length === 0 ? (
        <ClayEmptyState
          title="No Dairies Found"
          description="No registered dairies found in this area. Try searching by name or expanding your location to All Areas."
          actionTitle="Search All Areas"
          onAction={() =>
            handleSelectArea({
              id: 'all',
              name: 'All Areas',
              label: '📍 All Areas',
            })
          }
        />
      ) : (
        <FlatList
          data={dairies}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.listContent}
          showsVerticalScrollIndicator={false}
          renderItem={({ item }) => {
            const isSelected = selectedDairy?.id === item.id;
            return (
              <Pressable
                onPress={() => handleSelectDairy(item)}
                style={({ pressed }) => pressed && styles.pressed}
              >
                <ClayCard
                  variant={isSelected ? 'highlight' : 'raised'}
                  active={isSelected}
                  style={styles.dairyCard}
                >
                  <View style={styles.dairyCardRow}>
                    <DairyCenterIcon size={40} />

                    <View style={styles.dairyInfoCol}>
                      <View style={styles.dairyCardHeader}>
                        <Text style={styles.dairyName} numberOfLines={1}>
                          {item.name}
                        </Text>
                        <DistanceBadge distanceKm={item.distanceKm} />
                      </View>

                      <Text style={styles.dairyVillage}>
                        📍 {item.village}
                        {item.district ? `, ${item.district}` : ''}
                      </Text>

                      {item.associatedPerson && (
                        <Text style={styles.dairyAdmin}>
                          👤 In-charge: {item.associatedPerson}
                        </Text>
                      )}
                    </View>
                  </View>

                  {isSelected && (
                    <View style={styles.selectedIndicator}>
                      <View style={styles.checkCircle}>
                        <Text style={styles.checkIcon}>✓</Text>
                      </View>
                      <Text style={styles.selectedText}>
                        Selected for Affiliation
                      </Text>
                    </View>
                  )}
                </ClayCard>
              </Pressable>
            );
          }}
        />
      )}

      {/* Sticky Proceed Container */}
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
  permissionCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: DFARM_COLORS.peach,
    borderWidth: 1.5,
    borderColor: '#FAD1BA',
    marginHorizontal: 16,
    marginTop: 10,
    borderRadius: DFARM_RADIUS.md,
    padding: 12,
    gap: 10,
  },
  permissionIconCol: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  permissionTextCol: {
    flex: 1,
  },
  permissionTitle: {
    ...DFARM_TYPOGRAPHY.bodyMd,
    fontWeight: '700',
    color: DFARM_COLORS.primaryText,
  },
  permissionSubtitle: {
    ...DFARM_TYPOGRAPHY.bodySm,
    color: DFARM_COLORS.secondaryText,
    marginTop: 2,
  },
  permissionBtn: {
    flexShrink: 0,
  },
  searchSection: {
    paddingHorizontal: 16,
    paddingTop: 12,
  },
  searchInput: {
    marginBottom: 8,
  },
  areaChipsContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 4,
  },
  areaChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: DFARM_RADIUS.pill,
    backgroundColor: DFARM_COLORS.surfaceWhite,
    borderWidth: 1.5,
    borderColor: DFARM_COLORS.border,
    ...DFARM_SHADOWS.claySecondaryButton,
  },
  areaChipActive: {
    backgroundColor: DFARM_COLORS.primaryOrange,
    borderColor: DFARM_COLORS.primaryOrange,
    ...DFARM_SHADOWS.clayButton,
  },
  areaChipText: {
    ...DFARM_TYPOGRAPHY.bodySm,
    color: DFARM_COLORS.primaryText,
    fontWeight: '600',
  },
  areaChipTextActive: {
    color: '#FFFFFF',
    fontWeight: '700',
  },
  areaBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    marginHorizontal: 16,
    marginTop: 10,
    marginBottom: 4,
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: DFARM_RADIUS.sm,
    backgroundColor: '#FFF9F5',
    borderWidth: 1,
    borderColor: DFARM_COLORS.border,
    gap: 8,
  },
  bannerDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: DFARM_COLORS.primaryOrange,
  },
  areaBannerText: {
    ...DFARM_TYPOGRAPHY.bodySm,
    color: DFARM_COLORS.primaryText,
    fontWeight: '600',
    flex: 1,
  },
  listContent: {
    padding: 16,
    gap: 12,
    paddingBottom: 24,
  },
  dairyCard: {
    padding: 16,
  },
  dairyCardRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  dairyInfoCol: {
    flex: 1,
  },
  dairyCardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 4,
  },
  dairyName: {
    ...DFARM_TYPOGRAPHY.bodyLg,
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
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 12,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: '#F7D6C1',
  },
  checkCircle: {
    width: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: DFARM_COLORS.primaryOrange,
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkIcon: {
    color: '#FFFFFF',
    fontSize: 11,
    fontWeight: '800',
  },
  selectedText: {
    ...DFARM_TYPOGRAPHY.bodySm,
    color: DFARM_COLORS.primaryOrange,
    fontWeight: '700',
  },
  proceedSection: {
    padding: 16,
    paddingBottom: 24,
    backgroundColor: DFARM_COLORS.primaryCream,
    borderTopWidth: 1,
    borderTopColor: DFARM_COLORS.border,
  },
  pressed: {
    opacity: 0.85,
  },
});
