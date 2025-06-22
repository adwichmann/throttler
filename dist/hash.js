"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.md5 = md5;
const crypto = require("node:crypto");
function md5(text) {
    return crypto.createHash('md5').update(text).digest('hex');
}
//# sourceMappingURL=hash.js.map