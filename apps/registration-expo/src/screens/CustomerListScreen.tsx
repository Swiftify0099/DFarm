import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  FlatList,
  ScrollView,
  StyleSheet,
  RefreshControl,
  Image,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { RootStackParamList } from '../types/navigation';
import { useAuth } from '../auth/AuthContext';
import { customerApi } from '../api/customerApi';
import { CustomerDto } from '../types/models';
import { colors } from '../theme/colors';
import { clayColors, clayRadius, clayStyles } from '../theme/claymorphism';
import { clayAssets } from '../theme/assets';
import { CustomerCard } from '../components/CustomerCard';
import { LoadingIndicator } from '../components/LoadingIndicator';
import { ErrorView } from '../components/ErrorView';
import { ConfirmationDialog } from '../components/ConfirmationDialog';

type Props = NativeStackScreenProps<RootStackParamList, 'CustomerList'>;

export const CustomerListScreen: React.FC<Props> = ({ navigation }) => {
  const { officer, activeCenterId, logout } = useAuth();

  const [customers, setCustomers] = useState<CustomerDto[]>([]);
  const [totalCount, setTotalCount] = useState<number>(0);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [isRefreshing, setIsRefreshing] = useState<boolean>(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const [searchQuery, setSearchQuery] = useState<string>('');
  const [selectedStatusFilter, setSelectedStatusFilter] = useState<string | null>(null);
  const [selectedCategoryFilter, setSelectedCategoryFilter] = useState<string | null>(null);

  const [showLogoutDialog, setShowLogoutDialog] = useState<boolean>(false);
  const [isSearchFocused, setIsSearchFocused] = useState<boolean>(false);
  const searchTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const loadCustomers = useCallback(
    async (query = searchQuery, status = selectedStatusFilter, category = selectedCategoryFilter) => {
      setErrorMessage(null);
      try {
        const response = await customerApi.listCustomers({
          page: 1,
          limit: 50,
          search: query.trim() || null,
          centerId: activeCenterId || null,
          status: status || null,
        });

        let items = response.items || [];
        if (category) {
          items = items.filter((c) => (c.permittedCategories || []).includes(category));
        }

        setCustomers(items);
        setTotalCount(response.total);
      } catch (err: any) {
        setErrorMessage(err.message || 'Failed to load customers');
      } finally {
        setIsLoading(false);
        setIsRefreshing(false);
      }
    },
    [searchQuery, selectedStatusFilter, selectedCategoryFilter, activeCenterId]
  );

  useEffect(() => {
    setIsLoading(true);
    loadCustomers();
  }, [loadCustomers]);

  const handleSearchChange = (text: string) => {
    setSearchQuery(text);
    if (searchTimeoutRef.current) clearTimeout(searchTimeoutRef.current);
    searchTimeoutRef.current = setTimeout(() => {
      loadCustomers(text, selectedStatusFilter, selectedCategoryFilter);
    }, 350);
  };

  const handleStatusFilterToggle = (status: string) => {
    const nextStatus = selectedStatusFilter === status ? null : status;
    setSelectedStatusFilter(nextStatus);
    loadCustomers(searchQuery, nextStatus, selectedCategoryFilter);
  };

  const handleCategoryFilterToggle = (category: string) => {
    const nextCategory = selectedCategoryFilter === category ? null : category;
    setSelectedCategoryFilter(nextCategory);
    loadCustomers(searchQuery, selectedStatusFilter, nextCategory);
  };

  const handleClearFilters = () => {
    setSelectedStatusFilter(null);
    setSelectedCategoryFilter(null);
    loadCustomers(searchQuery, null, null);
  };

  const handleRefresh = () => {
    setIsRefreshing(true);
    loadCustomers();
  };

  const handleConfirmLogout = async () => {
    setShowLogoutDialog(false);
    await logout();
    navigation.reset({
      index: 0,
      routes: [{ name: 'Login' }],
    });
  };

  const officerSubtitle = officer?.fullName
    ? `Officer: ${officer.fullName}`
    : 'Kolhapur Dairy Center';

  return (
    <SafeAreaView style={styles.container}>
      {/* 3D Clay Top Header Bar */}
      <View style={styles.topBar}>
        <View style={styles.brandIconWrap}>
          <Text style={styles.brandEmoji}>🥛</Text>
        </View>

        <View style={styles.topBarContent}>
          <Text style={styles.topBarTitle}>DFarm Customers</Text>
          <View style={styles.officerPill}>
            <View style={styles.officerActiveDot} />
            <Text style={styles.topBarSubtitle} numberOfLines={1}>
              {officerSubtitle}
            </Text>
          </View>
        </View>

        <View style={styles.topBarActions}>
          <TouchableOpacity
            style={styles.actionIconButton}
            activeOpacity={0.8}
            onPress={handleRefresh}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            <Text style={styles.actionIcon}>🔄</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.actionIconButton, styles.logoutIconButton]}
            activeOpacity={0.8}
            onPress={() => setShowLogoutDialog(true)}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            <Text style={styles.actionIcon}>🚪</Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* Recessed Clay Search Bar */}
      <View style={styles.searchSection}>
        <View
          style={[
            styles.searchBar,
            isSearchFocused && styles.searchBarFocused,
          ]}
        >
          <View style={styles.searchIconBadge}>
            <Text style={styles.searchIconText}>🔍</Text>
          </View>
          <TextInput
            style={styles.searchInput}
            value={searchQuery}
            onChangeText={handleSearchChange}
            placeholder="Search by farmer name, mobile (+91), or code..."
            placeholderTextColor={clayColors.textMuted}
            autoCapitalize="none"
            onFocus={() => setIsSearchFocused(true)}
            onBlur={() => setIsSearchFocused(false)}
          />
          {searchQuery.length > 0 ? (
            <TouchableOpacity
              style={styles.clearPill}
              onPress={() => handleSearchChange('')}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            >
              <Text style={styles.clearIcon}>✕</Text>
            </TouchableOpacity>
          ) : null}
        </View>
      </View>

      {/* Tactile Filter Chips Row */}
      <View style={styles.filterWrapper}>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.filterScroll}
        >
          <TouchableOpacity
            activeOpacity={0.8}
            style={[
              styles.filterChip,
              !selectedStatusFilter && !selectedCategoryFilter && styles.filterChipActive,
            ]}
            onPress={handleClearFilters}
          >
            <Text
              style={[
                styles.filterChipText,
                !selectedStatusFilter && !selectedCategoryFilter && styles.filterChipTextActive,
              ]}
            >
              All Records ({totalCount})
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            activeOpacity={0.8}
            style={[
              styles.filterChip,
              selectedCategoryFilter === 'COW' && styles.filterChipActive,
            ]}
            onPress={() => handleCategoryFilterToggle('COW')}
          >
            <Text style={styles.filterEmoji}>🐄</Text>
            <Text
              style={[
                styles.filterChipText,
                selectedCategoryFilter === 'COW' && styles.filterChipTextActive,
              ]}
            >
              Cow Milk
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            activeOpacity={0.8}
            style={[
              styles.filterChip,
              selectedCategoryFilter === 'BUFFALO' && styles.filterChipActive,
            ]}
            onPress={() => handleCategoryFilterToggle('BUFFALO')}
          >
            <Text style={styles.filterEmoji}>🐃</Text>
            <Text
              style={[
                styles.filterChipText,
                selectedCategoryFilter === 'BUFFALO' && styles.filterChipTextActive,
              ]}
            >
              Buffalo Milk
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            activeOpacity={0.8}
            style={[
              styles.filterChip,
              selectedStatusFilter === 'DRAFT' && styles.filterChipActive,
            ]}
            onPress={() => handleStatusFilterToggle('DRAFT')}
          >
            <Text style={styles.filterEmoji}>📝</Text>
            <Text
              style={[
                styles.filterChipText,
                selectedStatusFilter === 'DRAFT' && styles.filterChipTextActive,
              ]}
            >
              Draft
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            activeOpacity={0.8}
            style={[
              styles.filterChip,
              selectedStatusFilter === 'ACTIVE' && styles.filterChipActive,
            ]}
            onPress={() => handleStatusFilterToggle('ACTIVE')}
          >
            <Text style={styles.filterEmoji}>✓</Text>
            <Text
              style={[
                styles.filterChipText,
                selectedStatusFilter === 'ACTIVE' && styles.filterChipTextActive,
              ]}
            >
              Active
            </Text>
          </TouchableOpacity>
        </ScrollView>
      </View>

      {/* Content Area */}
      <View style={styles.content}>
        {isLoading && customers.length === 0 ? (
          <LoadingIndicator message="Accessing DFarm verified records..." />
        ) : errorMessage && customers.length === 0 ? (
          <ErrorView message={errorMessage} onRetry={() => loadCustomers()} />
        ) : customers.length === 0 ? (
          <View style={styles.emptyContainer}>
            <View style={styles.emptyCard}>
              <Image
                source={
                  searchQuery.trim().length > 0
                    ? clayAssets.noSearchResults
                    : clayAssets.customerEmptyState
                }
                style={styles.emptyIllustration}
                resizeMode="contain"
              />
              <Text style={styles.emptyTitle}>
                {searchQuery.trim().length > 0
                  ? 'No Matching Customers'
                  : 'No Farmers Registered'}
              </Text>
              <Text style={styles.emptySubtitle}>
                {searchQuery.trim().length > 0
                  ? `No customer records found matching '${searchQuery}'. Check mobile digits or spelling.`
                  : 'No customer records found for this collection center yet. Tap below to start KYC registration.'}
              </Text>

              {searchQuery.trim().length > 0 ? (
                <TouchableOpacity
                  style={styles.clearSearchBtn}
                  onPress={() => handleSearchChange('')}
                >
                  <Text style={styles.clearSearchBtnText}>Clear Search Query</Text>
                </TouchableOpacity>
              ) : null}
            </View>
          </View>
        ) : (
          <FlatList
            data={customers}
            keyExtractor={(item) => item.id}
            renderItem={({ item }) => (
              <CustomerCard
                customer={item}
                onPress={() => navigation.navigate('CustomerDetail', { customerId: item.id })}
              />
            )}
            contentContainerStyle={styles.listContainer}
            showsVerticalScrollIndicator={false}
            refreshControl={
              <RefreshControl
                refreshing={isRefreshing}
                onRefresh={handleRefresh}
                colors={[clayColors.primary]}
                tintColor={clayColors.primary}
              />
            }
          />
        )}
      </View>

      {/* 3D Tactile Floating Action Button (FAB) */}
      <TouchableOpacity
        style={styles.fab}
        activeOpacity={0.85}
        onPress={() => navigation.navigate('RegistrationWizard')}
      >
        <View style={styles.fabIconPill}>
          <Text style={styles.fabIcon}>👤➕</Text>
        </View>
        <Text style={styles.fabText}>New Farmer Registration</Text>
      </TouchableOpacity>

      {/* Logout Confirmation Dialog */}
      <ConfirmationDialog
        visible={showLogoutDialog}
        title="Officer Session Termination"
        message="Are you sure you want to log out from this center? Any uncommitted offline draft will remain saved in local storage."
        confirmText="Log Out Now"
        confirmColor={clayColors.error}
        onConfirm={handleConfirmLogout}
        onDismiss={() => setShowLogoutDialog(false)}
      />
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: clayColors.canvasBackground,
  },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: 2,
    borderBottomColor: '#DFE7ED',
    ...Platform.select({
      ios: {
        shadowColor: '#002E44',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.08,
        shadowRadius: 8,
      },
      android: {
        elevation: 3,
      },
      default: {},
    }),
  },
  brandIconWrap: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: '#E5F3FA',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 10,
    borderTopWidth: 1,
    borderTopColor: '#FFFFFF',
  },
  brandEmoji: {
    fontSize: 20,
  },
  topBarContent: {
    flex: 1,
  },
  topBarTitle: {
    fontSize: 17,
    fontWeight: '800',
    color: clayColors.primary,
  },
  officerPill: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 2,
  },
  officerActiveDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: clayColors.success,
    marginRight: 5,
  },
  topBarSubtitle: {
    fontSize: 12,
    color: clayColors.textSecondary,
    fontWeight: '500',
  },
  topBarActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  actionIconButton: {
    width: 38,
    height: 38,
    borderRadius: 12,
    backgroundColor: '#EDF4F8',
    alignItems: 'center',
    justifyContent: 'center',
    borderTopWidth: 1.5,
    borderLeftWidth: 1,
    borderRightWidth: 0.5,
    borderBottomWidth: 2,
    borderTopColor: '#FFFFFF',
    borderLeftColor: '#FFFFFF',
    borderRightColor: '#CDDCE6',
    borderBottomColor: '#BDCED8',
  },
  logoutIconButton: {
    backgroundColor: '#FDECEC',
    borderRightColor: '#F4C4C4',
    borderBottomColor: '#E6A8A8',
  },
  actionIcon: {
    fontSize: 16,
  },
  searchSection: {
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 6,
  },
  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderRadius: clayRadius.card,
    paddingHorizontal: 12,
    height: 52,
    borderTopWidth: 2,
    borderLeftWidth: 1,
    borderRightWidth: 1,
    borderBottomWidth: 3,
    borderTopColor: '#FFFFFF',
    borderLeftColor: 'rgba(255, 255, 255, 0.9)',
    borderRightColor: '#DFE7ED',
    borderBottomColor: '#CFD9E2',
    ...Platform.select({
      ios: {
        shadowColor: '#002E44',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.08,
        shadowRadius: 8,
      },
      android: {
        elevation: 2,
      },
      default: {},
    }),
  },
  searchBarFocused: {
    borderTopColor: clayColors.primary,
    borderLeftColor: clayColors.primary,
    borderRightColor: clayColors.primary,
    borderBottomColor: clayColors.primary,
    borderWidth: 1.5,
  },
  searchIconBadge: {
    width: 32,
    height: 32,
    borderRadius: 10,
    backgroundColor: '#EDF5FA',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 8,
  },
  searchIconText: {
    fontSize: 14,
  },
  searchInput: {
    flex: 1,
    fontSize: 14,
    color: clayColors.textPrimary,
    fontWeight: '500',
  },
  clearPill: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: '#E2ECF3',
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: 6,
  },
  clearIcon: {
    fontSize: 12,
    color: clayColors.textSecondary,
    fontWeight: 'bold',
  },
  filterWrapper: {
    paddingVertical: 8,
  },
  filterScroll: {
    paddingHorizontal: 16,
    flexDirection: 'row',
    gap: 8,
  },
  filterChip: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: clayRadius.pill,
    backgroundColor: '#FFFFFF',
    borderTopWidth: 1.5,
    borderLeftWidth: 1,
    borderRightWidth: 1,
    borderBottomWidth: 2.5,
    borderTopColor: '#FFFFFF',
    borderLeftColor: '#FFFFFF',
    borderRightColor: '#DFE7ED',
    borderBottomColor: '#CBD7E0',
  },
  filterChipActive: {
    backgroundColor: clayColors.primary,
    borderTopColor: 'rgba(255,255,255,0.4)',
    borderLeftColor: 'rgba(255,255,255,0.2)',
    borderRightColor: 'rgba(0,30,45,0.3)',
    borderBottomColor: 'rgba(0,20,35,0.5)',
  },
  filterEmoji: {
    fontSize: 13,
    marginRight: 6,
  },
  filterChipText: {
    fontSize: 13,
    color: clayColors.textSecondary,
    fontWeight: '600',
  },
  filterChipTextActive: {
    color: '#FFFFFF',
    fontWeight: '700',
  },
  content: {
    flex: 1,
  },
  listContainer: {
    paddingHorizontal: 16,
    paddingTop: 6,
    paddingBottom: 96,
  },
  emptyContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 20,
  },
  emptyCard: {
    width: '100%',
    backgroundColor: '#FFFFFF',
    borderRadius: clayRadius.card,
    padding: 24,
    alignItems: 'center',
    borderTopWidth: 2,
    borderLeftWidth: 1,
    borderRightWidth: 1,
    borderBottomWidth: 3.5,
    borderTopColor: '#FFFFFF',
    borderLeftColor: 'rgba(255,255,255,0.9)',
    borderRightColor: '#DFE7ED',
    borderBottomColor: '#CFD9E2',
    ...Platform.select({
      ios: {
        shadowColor: '#002E44',
        shadowOffset: { width: 0, height: 8 },
        shadowOpacity: 0.1,
        shadowRadius: 14,
      },
      android: {
        elevation: 4,
      },
      default: {},
    }),
  },
  emptyIllustration: {
    width: 140,
    height: 140,
    marginBottom: 16,
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: clayColors.textPrimary,
    marginBottom: 6,
    textAlign: 'center',
  },
  emptySubtitle: {
    fontSize: 13,
    color: clayColors.textSecondary,
    textAlign: 'center',
    lineHeight: 18,
    paddingHorizontal: 10,
  },
  clearSearchBtn: {
    marginTop: 16,
    backgroundColor: '#EDF4F9',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: clayRadius.md,
    borderTopWidth: 1,
    borderTopColor: '#FFFFFF',
  },
  clearSearchBtnText: {
    fontSize: 13,
    fontWeight: '700',
    color: clayColors.primary,
  },
  fab: {
    position: 'absolute',
    bottom: 22,
    right: 18,
    backgroundColor: clayColors.primary,
    flexDirection: 'row',
    alignItems: 'center',
    paddingLeft: 8,
    paddingRight: 20,
    paddingVertical: 8,
    borderRadius: clayRadius.pill,
    borderTopWidth: 2,
    borderLeftWidth: 1,
    borderRightWidth: 1,
    borderBottomWidth: 3.5,
    borderTopColor: 'rgba(255, 255, 255, 0.45)',
    borderLeftColor: 'rgba(255, 255, 255, 0.25)',
    borderRightColor: 'rgba(0, 30, 45, 0.25)',
    borderBottomColor: 'rgba(0, 20, 35, 0.5)',
    ...Platform.select({
      ios: {
        shadowColor: clayColors.primary,
        shadowOffset: { width: 0, height: 8 },
        shadowOpacity: 0.4,
        shadowRadius: 12,
      },
      android: {
        elevation: 8,
      },
      default: {},
    }),
  },
  fabIconPill: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(255, 255, 255, 0.22)',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 10,
  },
  fabIcon: {
    fontSize: 16,
  },
  fabText: {
    fontSize: 15,
    fontWeight: '700',
    color: '#FFFFFF',
    letterSpacing: 0.3,
  },
});
