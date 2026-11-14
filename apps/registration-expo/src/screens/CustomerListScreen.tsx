import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  FlatList,
  ScrollView,
  StyleSheet,
  SafeAreaView,
  RefreshControl,
} from 'react-native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { RootStackParamList } from '../types/navigation';
import { useAuth } from '../auth/AuthContext';
import { customerApi } from '../api/customerApi';
import { CustomerDto } from '../types/models';
import { colors } from '../theme/colors';
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
      {/* Top App Bar */}
      <View style={styles.topBar}>
        <View style={styles.topBarContent}>
          <Text style={styles.topBarTitle}>DFarm Customers</Text>
          <Text style={styles.topBarSubtitle}>{officerSubtitle}</Text>
        </View>
        <View style={styles.topBarActions}>
          <TouchableOpacity
            style={styles.actionButton}
            onPress={handleRefresh}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            <Text style={styles.actionIcon}>🔄</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.actionButton}
            onPress={() => setShowLogoutDialog(true)}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            <Text style={styles.actionIcon}>🚪</Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* Search Input Bar */}
      <View style={styles.searchContainer}>
        <View style={styles.searchBar}>
          <Text style={styles.searchIcon}>🔍</Text>
          <TextInput
            style={styles.searchInput}
            value={searchQuery}
            onChangeText={handleSearchChange}
            placeholder="Search by name, mobile (+91), or farmer code..."
            placeholderTextColor={colors.outline}
            autoCapitalize="none"
          />
          {searchQuery.length > 0 ? (
            <TouchableOpacity
              onPress={() => handleSearchChange('')}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            >
              <Text style={styles.clearIcon}>✕</Text>
            </TouchableOpacity>
          ) : null}
        </View>
      </View>

      {/* Quick Filter Chips Row */}
      <View style={styles.filterWrapper}>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.filterScroll}
        >
          <TouchableOpacity
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
              All ({totalCount})
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[
              styles.filterChip,
              selectedCategoryFilter === 'COW' && styles.filterChipActive,
            ]}
            onPress={() => handleCategoryFilterToggle('COW')}
          >
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
            style={[
              styles.filterChip,
              selectedCategoryFilter === 'BUFFALO' && styles.filterChipActive,
            ]}
            onPress={() => handleCategoryFilterToggle('BUFFALO')}
          >
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
            style={[
              styles.filterChip,
              selectedStatusFilter === 'DRAFT' && styles.filterChipActive,
            ]}
            onPress={() => handleStatusFilterToggle('DRAFT')}
          >
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
            style={[
              styles.filterChip,
              selectedStatusFilter === 'ACTIVE' && styles.filterChipActive,
            ]}
            onPress={() => handleStatusFilterToggle('ACTIVE')}
          >
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
          <LoadingIndicator message="Loading customer database..." />
        ) : errorMessage && customers.length === 0 ? (
          <ErrorView message={errorMessage} onRetry={() => loadCustomers()} />
        ) : customers.length === 0 ? (
          <View style={styles.emptyContainer}>
            <Text style={styles.emptyEmoji}>🧑‍🌾</Text>
            <Text style={styles.emptyTitle}>No Customers Found</Text>
            <Text style={styles.emptySubtitle}>
              {searchQuery.trim().length > 0
                ? `No records match '${searchQuery}'`
                : 'No customers registered in this center yet.'}
            </Text>
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
            refreshControl={
              <RefreshControl
                refreshing={isRefreshing}
                onRefresh={handleRefresh}
                colors={[colors.primary]}
              />
            }
          />
        )}
      </View>

      {/* Extended Floating Action Button */}
      <TouchableOpacity
        style={styles.fab}
        activeOpacity={0.85}
        onPress={() => navigation.navigate('RegistrationWizard')}
      >
        <Text style={styles.fabIcon}>👤➕</Text>
        <Text style={styles.fabText}>New Customer</Text>
      </TouchableOpacity>

      {/* Logout Confirmation Dialog */}
      <ConfirmationDialog
        visible={showLogoutDialog}
        title="Officer Logout"
        message="Are you sure you want to end your session? You will need to sign in again to register farmers."
        confirmText="Log Out"
        confirmColor={colors.error}
        onConfirm={handleConfirmLogout}
        onDismiss={() => setShowLogoutDialog(false)}
      />
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: colors.surface,
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#ECEFF1',
  },
  topBarContent: {
    flex: 1,
    alignItems: 'center',
    marginLeft: 32, // Balance action buttons
  },
  topBarTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: colors.onSurface,
  },
  topBarSubtitle: {
    fontSize: 12,
    color: colors.onSurfaceVariant,
    marginTop: 2,
  },
  topBarActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  actionButton: {
    padding: 6,
  },
  actionIcon: {
    fontSize: 18,
  },
  searchContainer: {
    backgroundColor: colors.surface,
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.outlineVariant,
    borderRadius: 12,
    paddingHorizontal: 12,
    height: 48,
  },
  searchIcon: {
    fontSize: 16,
    marginRight: 8,
  },
  searchInput: {
    flex: 1,
    fontSize: 14,
    color: colors.onSurface,
  },
  clearIcon: {
    fontSize: 16,
    color: colors.outline,
    padding: 4,
  },
  filterWrapper: {
    backgroundColor: colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: '#ECEFF1',
    paddingVertical: 6,
  },
  filterScroll: {
    paddingHorizontal: 16,
    flexDirection: 'row',
    gap: 8,
  },
  filterChip: {
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: colors.outlineVariant,
    backgroundColor: colors.surface,
  },
  filterChipActive: {
    backgroundColor: colors.primaryContainer,
    borderColor: colors.primary,
  },
  filterChipText: {
    fontSize: 13,
    color: colors.onSurface,
    fontWeight: '500',
  },
  filterChipTextActive: {
    color: colors.onPrimaryContainer,
    fontWeight: '700',
  },
  content: {
    flex: 1,
  },
  listContainer: {
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 90,
  },
  emptyContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 32,
  },
  emptyEmoji: {
    fontSize: 52,
    marginBottom: 14,
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: colors.onSurface,
    marginBottom: 6,
  },
  emptySubtitle: {
    fontSize: 14,
    color: colors.onSurfaceVariant,
    textAlign: 'center',
  },
  fab: {
    position: 'absolute',
    bottom: 24,
    right: 20,
    backgroundColor: colors.primary,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 14,
    borderRadius: 28,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 6,
    elevation: 6,
  },
  fabIcon: {
    fontSize: 18,
    marginRight: 8,
    color: colors.onPrimary,
  },
  fabText: {
    fontSize: 15,
    fontWeight: '700',
    color: colors.onPrimary,
    letterSpacing: 0.3,
  },
});
