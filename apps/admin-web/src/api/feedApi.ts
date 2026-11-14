import {
  FeedCategory,
  FeedProduct,
  FeedSupplier,
  CenterProductInventory,
  FeedPurchase,
  FeedSale,
  StockMovement,
} from '@dfarm/shared-types';
import { apiClient } from './client.js';

export const feedApi = {
  // Categories
  getCategories: () => apiClient.get<FeedCategory[]>('/feed/categories'),
  createCategory: (data: { code: string; name: string; description?: string | null }) =>
    apiClient.post<FeedCategory>('/feed/categories', data),

  // Products
  getProducts: (params?: { categoryId?: string; status?: string; search?: string }) =>
    apiClient.get<FeedProduct[]>('/feed/products', params),
  createProduct: (data: any) =>
    apiClient.post<FeedProduct>('/feed/products', data),
  updateProduct: (productId: string, data: any) =>
    apiClient.patch<FeedProduct>(`/feed/products/${productId}`, data),

  // Suppliers
  getSuppliers: () => apiClient.get<FeedSupplier[]>('/feed/suppliers'),
  createSupplier: (data: any) =>
    apiClient.post<FeedSupplier>('/feed/suppliers', data),

  // Purchases & Receiving
  createPurchase: (data: any) =>
    apiClient.post<FeedPurchase>('/feed/purchases', data),
  receivePurchase: (purchaseId: string, data: { idempotencyKey: string; notes?: string }) =>
    apiClient.post<any>(`/feed/purchases/${purchaseId}/receive`, data),

  // Inventory & Movements
  getInventory: (params?: { centerId?: string; productId?: string }) =>
    apiClient.get<CenterProductInventory[]>('/inventory', params),
  getMovements: (params?: { centerId?: string; productId?: string; movementType?: string; limit?: number }) =>
    apiClient.get<StockMovement[]>('/inventory/movements', params),
  transferStock: (data: any) =>
    apiClient.post<any>('/inventory/transfers', data),
  adjustStock: (data: any) =>
    apiClient.post<any>('/inventory/adjustments', data),
  getReports: (params?: { type?: string; centerId?: string; startDate?: string; endDate?: string }) =>
    apiClient.get<any>('/inventory/reports', params),

  // Sales & Returns
  createSale: (data: any) =>
    apiClient.post<any>('/feed/sales', data),
  getSales: (params?: { centerId?: string; customerId?: string; status?: string; limit?: number }) =>
    apiClient.get<FeedSale[]>('/feed/sales', params),
  getSaleById: (saleId: string) =>
    apiClient.get<FeedSale>(`/feed/sales/${saleId}`),
  processReturn: (saleId: string, data: any) =>
    apiClient.post<any>(`/feed/sales/${saleId}/return`, data),
};
