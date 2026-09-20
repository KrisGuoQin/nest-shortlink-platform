const CUSTOM_EPOCH = Date.UTC(2026, 0, 1);

const MACHINE_BITS = 10n;

const SEQUENCE_BITS = 12n;

const MAX_MACHINE_ID = (1n << MACHINE_BITS) - 1n;

const MAX_SEQUENCE = (1n << SEQUENCE_BITS) - 1n;

const MACHINE_SHIFT = SEQUENCE_BITS;

const TIMESTAMP_SHIFT = MACHINE_BITS + SEQUENCE_BITS;

export class SnowflakeGenerator {
    private lastTimestamp = -1;

    private sequence = 0n;

    constructor(private readonly machineId: number) {
        if (machineId < 0 || BigInt(machineId) > MAX_MACHINE_ID) {
            throw new Error(`machineId must be between 0 and ${MAX_MACHINE_ID}`);
        }
    }

    nextId(): bigint {
        let timestamp = Date.now();

        if (timestamp < this.lastTimestamp) {
            throw new Error('Clock moved backwards');
        }

        if (timestamp === this.lastTimestamp) {
            this.sequence = (this.sequence + 1n) & MAX_SEQUENCE;

            if (this.sequence === 0n) {
                timestamp = this.waitNextMillis(timestamp);
            }
        } else {
            this.sequence = 0n;
        }

        this.lastTimestamp = timestamp;

        const timestampPart = BigInt(timestamp - CUSTOM_EPOCH) << TIMESTAMP_SHIFT;

        const machinePart = BigInt(this.machineId) << MACHINE_SHIFT;

        return timestampPart | machinePart | this.sequence;
    }

    private waitNextMillis(current: number) {
        let timestamp = Date.now();

        while (timestamp <= current) {
            timestamp = Date.now();
        }

        return timestamp;
    }
}
