import { apiClient } from './client.js';

export interface RateChart {
  id: string;
  organizationId: string;
  name: string;
  code: string;
  milkCategory: 'COW' | 'BUFFALO';
  pricingFormula: string;
  minFat: number;
  maxFat: number;
  minSnf: number;
  maxSnf: number;
  fatStep: number;
  snfStep: number;
  status: string;
  activeVersionId?: string;
  createdAt: string;
}

export interface RateChartVersion {
  id: string;
  rateChartId: string;
  versionNumber: number;
  status: 'DRAFT' | 'SUBMITTED' | 'APPROVED' | 'PUBLISHED' | 'ARCHIVED';
  effectiveFrom: string;
  effectiveTo?: string | null;
  baseRatePerUnit: number;
  pricingModel: string;
  cellsCount?: number;
  createdBy: string;
  approvedBy?: string | null;
  publishedBy?: string | null;
  publishedAt?: string | null;
  createdAt: string;
  cells?: RateMatrixCell[];
}

export interface RateMatrixCell {
  fat: number;
  snf: number;
  ratePerUnit: number;
}

export const rateApi = {
  listCharts: (params?: { centerId?: string; milkCategory?: string }) =>
    apiClient.get<RateChart[]>('/rates', params),

  createChart: (data: any) =>
    apiClient.post<RateChart>('/rates', data),

  getChart: (rateChartId: string) =>
    apiClient.get<RateChart>(`/rates/${rateChartId}`),

  listVersions: (rateChartId: string) =>
    apiClient.get<RateChartVersion[]>(`/rates/${rateChartId}/versions`),

  createVersion: (rateChartId: string, data: any) =>
    apiClient.post<RateChartVersion>(`/rates/${rateChartId}/versions`, data),

  getVersion: (rateChartId: string, versionId: string) =>
    apiClient.get<RateChartVersion>(`/rates/${rateChartId}/versions/${versionId}`),

  updateMatrixCells: (rateChartId: string, versionId: string, cells: RateMatrixCell[]) =>
    apiClient.put<any>(`/rates/${rateChartId}/versions/${versionId}/matrix`, { cells }),

  previewCalculation: (rateChartId: string, versionId: string, data: { fat: number; snf: number; netWeight: number }) =>
    apiClient.post<any>(`/rates/${rateChartId}/versions/${versionId}/preview`, data),

  submitVersion: (rateChartId: string, versionId: string) =>
    apiClient.post<any>(`/rates/${rateChartId}/versions/${versionId}/submit`),

  approveVersion: (rateChartId: string, versionId: string) =>
    apiClient.post<any>(`/rates/${rateChartId}/versions/${versionId}/approve`),

  publishVersion: (rateChartId: string, versionId: string) =>
    apiClient.post<any>(`/rates/${rateChartId}/versions/${versionId}/publish`),

  calculate: (data: { centerId?: string; milkCategory: string; fat: number; snf: number; netWeight: number; businessDate?: string }) =>
    apiClient.post<any>('/rates/calculate', data),
};
