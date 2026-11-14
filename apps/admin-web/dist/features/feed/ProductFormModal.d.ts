import React from 'react';
import { FeedProduct, FeedCategory } from '@dfarm/shared-types';
interface ProductFormModalProps {
    product: FeedProduct | null;
    categories: FeedCategory[];
    onClose: () => void;
    onSuccess: () => void;
}
export declare const ProductFormModal: React.FC<ProductFormModalProps>;
export {};
//# sourceMappingURL=ProductFormModal.d.ts.map