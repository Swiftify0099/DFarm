import { BadRequestError } from '../../../shared/errors/app-error.js';
export class SbiCmpBankAdapter {
    formatIdentifier = 'SBI_CMP';
    async serialize(_batch) {
        // Audit Gate: Official SBI CMP requires authorized corporate client code, mandate code, and encryption keypair.
        // If unconfigured, this serializer strictly throws an informative error rather than generating a fake/speculative file.
        const corporateClientCode = process.env['SBI_CMP_CLIENT_CODE'];
        const corporateProductCode = process.env['SBI_CMP_PRODUCT_CODE'];
        if (!corporateClientCode || !corporateProductCode) {
            throw new BadRequestError('SBI Corporate Multi-Payment (CMP) export is blocked: Official SBI Corporate Banking credentials (Client Code, Product Code, Public Key) are not configured for this dairy cooperative. Official bank specification and credentials are required.', 'SBI_CMP_UNCONFIGURED_SPECIFICATION_REQUIRED');
        }
        // In a fully provisioned environment with validated bank specs, formatting would proceed here.
        throw new BadRequestError('SBI CMP host-to-host encrypted pipeline is currently awaiting official bank testing certificate.', 'SBI_CMP_PROVISIONING_PENDING');
    }
}
//# sourceMappingURL=SbiCmpBankAdapter.js.map