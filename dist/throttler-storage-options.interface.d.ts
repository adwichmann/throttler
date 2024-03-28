export interface ThrottlerStorageOptions {
    totalHits: Record<string, number>;
    expiresAt: number;
    isBlocked: boolean;
    blockExpiresAt: number;
}
export declare const ThrottlerStorageOptions: unique symbol;
