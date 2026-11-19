import { SessionClosedError } from '../errors/index.js';
export class KioskShiftSession {
    props;
    constructor(props) {
        this.props = { ...props };
    }
    get id() {
        return this.props.id;
    }
    get sessionCode() {
        return this.props.sessionCode;
    }
    get organizationId() {
        return this.props.organizationId;
    }
    get centerId() {
        return this.props.centerId;
    }
    get businessDate() {
        return this.props.businessDate;
    }
    get shift() {
        return this.props.shift;
    }
    get status() {
        return this.props.status;
    }
    get isOpen() {
        return this.props.status === 'OPEN';
    }
    get openedAt() {
        return this.props.openedAt;
    }
    get closedAt() {
        return this.props.closedAt;
    }
    get totals() {
        return {
            totalLiters: this.props.totalLiters,
            cowLiters: this.props.cowLiters,
            buffaloLiters: this.props.buffaloLiters,
            transactionCount: this.props.transactionCount,
            totalAmount: this.props.totalAmount,
            averageFat: this.props.averageFat,
            averageSnf: this.props.averageSnf,
        };
    }
    get deviceIdentifier() {
        return this.props.deviceIdentifier;
    }
    get deviceName() {
        return this.props.deviceName;
    }
    get openingOperatorName() {
        return this.props.openingOperatorName;
    }
    recordTransaction(category, weightLiters, fat, snf, amount) {
        if (!this.isOpen) {
            throw new SessionClosedError(this.props.sessionCode);
        }
        const prevCount = this.props.transactionCount;
        const prevFatSum = this.props.averageFat * prevCount;
        const prevSnfSum = this.props.averageSnf * prevCount;
        const newCount = prevCount + 1;
        this.props.transactionCount = newCount;
        this.props.totalLiters = Math.round((this.props.totalLiters + weightLiters + Number.EPSILON) * 100) / 100;
        if (category === 'COW') {
            this.props.cowLiters = Math.round((this.props.cowLiters + weightLiters + Number.EPSILON) * 100) / 100;
        }
        else {
            this.props.buffaloLiters = Math.round((this.props.buffaloLiters + weightLiters + Number.EPSILON) * 100) / 100;
        }
        this.props.totalAmount = Math.round((this.props.totalAmount + amount + Number.EPSILON) * 100) / 100;
        this.props.averageFat = Math.round(((prevFatSum + fat) / newCount + Number.EPSILON) * 100) / 100;
        this.props.averageSnf = Math.round(((prevSnfSum + snf) / newCount + Number.EPSILON) * 100) / 100;
    }
    close(operatorId, operatorName) {
        if (!this.isOpen) {
            throw new SessionClosedError(this.props.sessionCode);
        }
        this.props.status = 'CLOSED';
        this.props.closedAt = new Date().toISOString();
        this.props.closingOperatorId = operatorId;
        this.props.closingOperatorName = operatorName;
    }
    toJSON() {
        return {
            id: this.props.id,
            sessionCode: this.props.sessionCode,
            organizationId: this.props.organizationId,
            dairyId: this.props.organizationId,
            centerId: this.props.centerId,
            date: this.props.businessDate,
            shift: this.props.shift,
            status: this.props.status,
            openedAt: this.props.openedAt,
            closedAt: this.props.closedAt,
            openingOperatorName: this.props.openingOperatorName,
            closingOperatorName: this.props.closingOperatorName,
            deviceId: this.props.deviceIdentifier,
            deviceName: this.props.deviceName,
            totals: this.totals,
        };
    }
}
//# sourceMappingURL=KioskShiftSession.js.map