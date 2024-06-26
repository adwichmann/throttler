"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
var __param = (this && this.__param) || function (paramIndex, decorator) {
    return function (target, key) { decorator(target, key, paramIndex); }
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.ThrottlerGuard = void 0;
const common_1 = require("@nestjs/common");
const core_1 = require("@nestjs/core");
const hash_1 = require("./hash");
const throttler_storage_interface_1 = require("./throttler-storage.interface");
const throttler_constants_1 = require("./throttler.constants");
const throttler_decorator_1 = require("./throttler.decorator");
const throttler_exception_1 = require("./throttler.exception");
let ThrottlerGuard = class ThrottlerGuard {
    constructor(options, storageService, reflector) {
        this.options = options;
        this.storageService = storageService;
        this.reflector = reflector;
        this.headerPrefix = 'X-RateLimit';
        this.errorMessage = throttler_exception_1.throttlerMessage;
    }
    async onModuleInit() {
        var _a, _b;
        var _c, _d;
        this.throttlers = (Array.isArray(this.options) ? this.options : this.options.throttlers)
            .sort((first, second) => {
            if (typeof first.ttl === 'function') {
                return 1;
            }
            if (typeof second.ttl === 'function') {
                return 0;
            }
            return first.ttl - second.ttl;
        })
            .map((opt) => { var _a; return (Object.assign(Object.assign({}, opt), { name: (_a = opt.name) !== null && _a !== void 0 ? _a : 'default' })); });
        if (Array.isArray(this.options)) {
            this.commonOptions = {};
        }
        else {
            this.commonOptions = {
                skipIf: this.options.skipIf,
                ignoreUserAgents: this.options.ignoreUserAgents,
                getTracker: this.options.getTracker,
                generateKey: this.options.generateKey,
            };
        }
        (_a = (_c = this.commonOptions).getTracker) !== null && _a !== void 0 ? _a : (_c.getTracker = this.getTracker.bind(this));
        (_b = (_d = this.commonOptions).generateKey) !== null && _b !== void 0 ? _b : (_d.generateKey = this.generateKey.bind(this));
    }
    async canActivate(context) {
        const handler = context.getHandler();
        const classRef = context.getClass();
        if (await this.shouldSkip(context)) {
            return true;
        }
        const continues = [];
        for (const namedThrottler of this.throttlers) {
            const skip = this.reflector.getAllAndOverride(throttler_constants_1.THROTTLER_SKIP + namedThrottler.name, [
                handler,
                classRef,
            ]);
            const skipIf = namedThrottler.skipIf || this.commonOptions.skipIf;
            if (skip || (skipIf === null || skipIf === void 0 ? void 0 : skipIf(context))) {
                continues.push(true);
                continue;
            }
            const routeOrClassLimit = this.reflector.getAllAndOverride(throttler_constants_1.THROTTLER_LIMIT + namedThrottler.name, [handler, classRef]);
            const routeOrClassTtl = this.reflector.getAllAndOverride(throttler_constants_1.THROTTLER_TTL + namedThrottler.name, [handler, classRef]);
            const routeOrClassBlockDuration = this.reflector.getAllAndOverride(throttler_constants_1.THROTTLER_BLOCK_DURATION + namedThrottler.name, [handler, classRef]);
            const routeOrClassGetTracker = this.reflector.getAllAndOverride(throttler_constants_1.THROTTLER_TRACKER + namedThrottler.name, [handler, classRef]);
            const routeOrClassGetKeyGenerator = this.reflector.getAllAndOverride(throttler_constants_1.THROTTLER_KEY_GENERATOR + namedThrottler.name, [handler, classRef]);
            const limit = await this.resolveValue(context, routeOrClassLimit || namedThrottler.limit);
            const ttl = await this.resolveValue(context, routeOrClassTtl || namedThrottler.ttl);
            const blockDuration = await this.resolveValue(context, routeOrClassBlockDuration || namedThrottler.blockDuration || ttl);
            const getTracker = routeOrClassGetTracker || namedThrottler.getTracker || this.commonOptions.getTracker;
            const generateKey = routeOrClassGetKeyGenerator || namedThrottler.generateKey || this.commonOptions.generateKey;
            continues.push(await this.handleRequest({
                context,
                limit,
                ttl,
                throttler: namedThrottler,
                blockDuration,
                getTracker,
                generateKey,
            }));
        }
        return continues.every((cont) => cont);
    }
    async shouldSkip(_context) {
        return false;
    }
    async handleRequest(requestProps) {
        var _a;
        const { context, limit, ttl, throttler, blockDuration, getTracker, generateKey } = requestProps;
        const { req, res } = this.getRequestResponse(context);
        const ignoreUserAgents = (_a = throttler.ignoreUserAgents) !== null && _a !== void 0 ? _a : this.commonOptions.ignoreUserAgents;
        if (Array.isArray(ignoreUserAgents)) {
            for (const pattern of ignoreUserAgents) {
                if (pattern.test(req.headers['user-agent'])) {
                    return true;
                }
            }
        }
        const tracker = await getTracker(req);
        const key = generateKey(context, tracker, throttler.name);
        const { totalHits, timeToExpire, isBlocked, timeToBlockExpire } = await this.storageService.increment(key, ttl, limit, blockDuration, throttler.name);
        const getThrottlerSuffix = (name) => (name === 'default' ? '' : `-${name}`);
        if (isBlocked) {
            res.header(`Retry-After${getThrottlerSuffix(throttler.name)}`, timeToBlockExpire);
            await this.throwThrottlingException(context, {
                limit,
                ttl,
                key,
                tracker,
                totalHits,
                timeToExpire,
                isBlocked,
                timeToBlockExpire,
            });
        }
        res.header(`${this.headerPrefix}-Limit${getThrottlerSuffix(throttler.name)}`, limit);
        res.header(`${this.headerPrefix}-Remaining${getThrottlerSuffix(throttler.name)}`, Math.max(0, limit - totalHits));
        res.header(`${this.headerPrefix}-Reset${getThrottlerSuffix(throttler.name)}`, timeToExpire);
        return true;
    }
    async getTracker(req) {
        return req.ip;
    }
    getRequestResponse(context) {
        const http = context.switchToHttp();
        return { req: http.getRequest(), res: http.getResponse() };
    }
    generateKey(context, suffix, name) {
        const prefix = `${context.getClass().name}-${context.getHandler().name}-${name}`;
        return (0, hash_1.md5)(`${prefix}-${suffix}`);
    }
    async throwThrottlingException(context, throttlerLimitDetail) {
        throw new throttler_exception_1.ThrottlerException(await this.getErrorMessage(context, throttlerLimitDetail));
    }
    async getErrorMessage(_context, _throttlerLimitDetail) {
        if (!Array.isArray(this.options)) {
            return this.options.errorMessage || this.errorMessage;
        }
        return this.errorMessage;
    }
    async resolveValue(context, resolvableValue) {
        return typeof resolvableValue === 'function' ? resolvableValue(context) : resolvableValue;
    }
};
exports.ThrottlerGuard = ThrottlerGuard;
exports.ThrottlerGuard = ThrottlerGuard = __decorate([
    (0, common_1.Injectable)(),
    __param(0, (0, throttler_decorator_1.InjectThrottlerOptions)()),
    __param(1, (0, throttler_decorator_1.InjectThrottlerStorage)()),
    __metadata("design:paramtypes", [Object, Object, core_1.Reflector])
], ThrottlerGuard);
//# sourceMappingURL=throttler.guard.js.map