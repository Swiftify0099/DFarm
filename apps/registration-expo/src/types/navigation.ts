/**
 * DFarm Registration App - Typed Navigation Route Parameters
 * Matching NavigationKeys.kt
 */

export type RootStackParamList = {
  Login: undefined;
  CustomerList: undefined;
  RegistrationWizard: undefined;
  CustomerDetail: { customerId: string };
  CustomerEdit: { customerId: string };
  FaceEnrollment: {
    customerId: string;
    customerName: string;
    farmerCode: string;
  };
  RfidAssignment: undefined;
  Main: undefined;
};
