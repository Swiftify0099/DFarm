import { IRateChartRepository } from '../../application/ports/index.js';
import { MilkCategory } from '../../domain/entities/Customer.js';
import { RateChart } from '../../domain/entities/RateChart.js';
export declare class PostgresRateChartRepository implements IRateChartRepository {
    private getDb;
    getActiveRateChart(centerId: string, organizationId: string, category: MilkCategory, businessDate: string): Promise<RateChart>;
}
//# sourceMappingURL=PostgresRateChartRepository.d.ts.map