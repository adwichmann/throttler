"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.ThrottlerStorageService = void 0;
const common_1 = require("@nestjs/common");
let ThrottlerStorageService = class ThrottlerStorageService {
    constructor() {
        this._storage = {};
        this.timeoutIds = {};
    }
    get storage() {
        return this._storage;
    }
    getExpirationTime(key) {
        return Math.floor((this.storage[key].expiresAt - Date.now()) / 1000);
    }
    getBlockExpirationTime(key) {
        return Math.floor((this.storage[key].blockExpiresAt - Date.now()) / 1000);
    }
    setExpirationTime(key, ttlMilliseconds, throttlerName) {
        const timeoutId = setTimeout(() => {
            this.storage[key].totalHits[throttlerName]--;
            clearTimeout(timeoutId);
            this.timeoutIds[throttlerName] = this.timeoutIds[throttlerName].filter((id) => id !== timeoutId);
        }, ttlMilliseconds);
        this.timeoutIds[throttlerName].push(timeoutId);
    }
    clearExpirationTimes(throttlerName) {
        this.timeoutIds[throttlerName].forEach(clearTimeout);
        this.timeoutIds[throttlerName] = [];
    }
    resetBlockdRequest(key, throttlerName) {
        this.storage[key].isBlocked = false;
        this.storage[key].totalHits[throttlerName] = 0;
        this.clearExpirationTimes(throttlerName);
    }
    fireHitCount(key, throttlerName, ttl) {
        this.storage[key].totalHits[throttlerName]++;
        this.setExpirationTime(key, ttl, throttlerName);
    }
    async increment(key, ttl, limit, blockDuration, throttlerName) {
        const ttlMilliseconds = ttl;
        const blockDurationMilliseconds = blockDuration;
        if (!this.timeoutIds[throttlerName]) {
            this.timeoutIds[throttlerName] = [];
        }
        if (!this.storage[key]) {
            this.storage[key] = {
                totalHits: {
                    [throttlerName]: 0,
                },
                expiresAt: Date.now() + ttlMilliseconds,
                blockExpiresAt: 0,
                isBlocked: false,
            };
        }
        let timeToExpire = this.getExpirationTime(key);
        if (timeToExpire <= 0) {
            this.storage[key].expiresAt = Date.now() + ttlMilliseconds;
            timeToExpire = this.getExpirationTime(key);
        }
        if (!this.storage[key].isBlocked) {
            this.fireHitCount(key, throttlerName, ttlMilliseconds);
        }
        if (this.storage[key].totalHits[throttlerName] > limit && !this.storage[key].isBlocked) {
            this.storage[key].isBlocked = true;
            this.storage[key].blockExpiresAt = Date.now() + blockDurationMilliseconds;
        }
        const timeToBlockExpire = this.getBlockExpirationTime(key);
        if (timeToBlockExpire <= 0 && this.storage[key].isBlocked) {
            this.resetBlockdRequest(key, throttlerName);
            this.fireHitCount(key, throttlerName, ttlMilliseconds);
        }
        return {
            totalHits: this.storage[key].totalHits[throttlerName],
            timeToExpire,
            isBlocked: this.storage[key].isBlocked,
            timeToBlockExpire: timeToBlockExpire,
        };
    }
    onApplicationShutdown() {
        const throttleNames = Object.keys(this.timeoutIds);
        throttleNames.forEach((key) => {
            this.timeoutIds[key].forEach(clearTimeout);
        });
    }
};
exports.ThrottlerStorageService = ThrottlerStorageService;
exports.ThrottlerStorageService = ThrottlerStorageService = __decorate([
    (0, common_1.Injectable)()
], ThrottlerStorageService);
//# sourceMappingURL=throttler.service.js.map