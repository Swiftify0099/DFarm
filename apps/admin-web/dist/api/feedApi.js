import { apiClient } from './client.js';
export const feedApi = {
    // Categories
    getCategories: () => apiClient.get('/feed/categories'),
    createCategory: (data) => apiClient.post('/feed/categories', data),
    // Products
    getProducts: (params) => apiClient.get('/feed/products', params),
    createProduct: (data) => apiClient.post('/feed/products', data),
    updateProduct: (productId, data) => apiClient.patch(`/feed/products/${productId}`, data),
    // Suppliers
    getSuppliers: () => apiClient.get('/feed/suppliers'),
    createSupplier: (data) => apiClient.post('/feed/suppliers', data),
    // Purchases & Receiving
    createPurchase: (data) => apiClient.post('/feed/purchases', data),
    receivePurchase: (purchaseId, data) => apiClient.post(`/feed/purchases/${purchaseId}/receive`, data),
    // Inventory & Movements
    getInventory: (params) => apiClient.get('/inventory', params),
    getMovements: (params) => apiClient.get('/inventory/movements', params),
    transferStock: (data) => apiClient.post('/inventory/transfers', data),
    adjustStock: (data) => apiClient.post('/inventory/adjustments', data),
    getReports: (params) => apiClient.get('/inventory/reports', params),
    // Sales & Returns
    createSale: (data) => apiClient.post('/feed/sales', data),
    getSales: (params) => apiClient.get('/feed/sales', params),
    getSaleById: (saleId) => apiClient.get(`/feed/sales/${saleId}`),
    processReturn: (saleId, data) => apiClient.post(`/feed/sales/${saleId}/return`, data),
};
//# sourceMappingURL=feedApi.js.map