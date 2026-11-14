// API Clients
export * from './api/client.js';
export * from './api/authApi.js';
export * from './api/dashboardApi.js';
export * from './api/customerApi.js';
export * from './api/collectionApi.js';
export * from './api/rateApi.js';
export * from './api/billingApi.js';
export * from './api/paymentApi.js';
export * from './api/deviceApi.js';
export * from './api/reportsApi.js';
export * from './api/feedApi.js';
export * from './api/employeeApi.js';

// Contexts & State
export * from './context/AuthContext.js';
export * from './context/ToastContext.js';

// Components
export * from './components/Badge.js';
export * from './components/StatCard.js';
export * from './components/Modal.js';
export * from './components/Pagination.js';
export * from './components/SearchBar.js';
export * from './components/Sidebar.js';
export * from './components/Header.js';
export * from './components/DashboardLayout.js';

// Phase 14: Feed Management & POS
export * from './features/feed/types.js';
export * from './features/feed/ProductList.js';
export * from './features/feed/ProductFormModal.js';
export * from './features/feed/StockSummary.js';
export * from './features/feed/PurchaseReceiving.js';
export * from './features/feed/SupplierList.js';
export * from './features/feed/CustomerFeedSalePOS.js';
export * from './features/feed/InvoicePreviewModal.js';
export * from './features/feed/CustomerReturnModal.js';
export * from './features/feed/StockAdjustmentModal.js';
export * from './features/feed/InventoryHistory.js';
export * from './features/feed/FeedManagementModule.js';

// Phase 16: Employee Management, Attendance & Payroll
export * from './features/employees/types.js';
export * from './features/employees/EmployeeList.js';
export * from './features/employees/EmployeeRegistrationModal.js';
export * from './features/employees/EmployeeProfile.js';
export * from './features/employees/AttendanceManagement.js';
export * from './features/employees/LeaveManagement.js';
export * from './features/employees/SalaryManagement.js';
export * from './features/employees/PayrollDashboard.js';
export * from './features/employees/PayslipModal.js';
export * from './features/employees/PayrollReports.js';
export * from './features/employees/EmployeeManagementModule.js';

// Phase 17: Admin Web Dashboard & Modules
export * from './features/auth/LoginPage.js';
export * from './features/dashboard/OperationalDashboard.js';
export * from './features/customers/CustomerManagement.js';
export * from './features/collections/MilkCollectionModule.js';
export * from './features/rates/RateManagementModule.js';
export * from './features/accounting/AccountingBillingModule.js';
export * from './features/devices/DeviceSyncModule.js';
export * from './features/reports/ReportsAnalyticsModule.js';
export * from './features/settings/SettingsModule.js';
export * from './App.js';
