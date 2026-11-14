/**
 * Navigation Types for DFarm Customer Mobile App
 */
import { CustomerPayoutItem } from '../api/payments.api';

export type AuthStackParamList = {
  Login: undefined;
  OtpVerification: {
    phone: string;
    displayPhone: string;
  };
};

export type MainTabParamList = {
  DashboardTab: undefined;
  MilkTab: undefined;
  LedgerTab: undefined;
  BillsTab: undefined;
  NotificationsTab: undefined;
  ProfileTab: undefined;
};

export type RootStackParamList = {
  Auth: undefined;
  Main: undefined;
  Dashboard: undefined;
  MilkHistory: undefined;
  CollectionDetail: {
    sessionId: string;
    receiptNumber?: string;
  };
  CustomerLedger: undefined;
  MonthlyBills: undefined;
  PdfViewer: {
    billId: string;
    billNumber: string;
  };
  FeedHistory: undefined;
  FeedSaleDetail: {
    saleId: string;
    invoiceNumber: string;
  };
  Payments: undefined;
  PaymentDetail: {
    payoutId: string;
    payoutItem?: CustomerPayoutItem;
  };
  Profile: undefined;
  EditProfile: undefined;
  Settings: undefined;
  Support: undefined;
  Notifications: undefined;
};
