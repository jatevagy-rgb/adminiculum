"use strict";
/**
 * Workgroups Module
 * Client workload tracking module
 */
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __exportStar = (this && this.__exportStar) || function(m, exports) {
    for (var p in m) if (p !== "default" && !Object.prototype.hasOwnProperty.call(exports, p)) __createBinding(exports, m, p);
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.formatPeriod = exports.isValidPeriodFormat = exports.workloadService = exports.workgroupService = exports.workgroupRoutes = void 0;
var routes_1 = require("./routes");
Object.defineProperty(exports, "workgroupRoutes", { enumerable: true, get: function () { return __importDefault(routes_1).default; } });
var services_1 = require("./services");
Object.defineProperty(exports, "workgroupService", { enumerable: true, get: function () { return services_1.workgroupService; } });
Object.defineProperty(exports, "workloadService", { enumerable: true, get: function () { return services_1.workloadService; } });
Object.defineProperty(exports, "isValidPeriodFormat", { enumerable: true, get: function () { return services_1.isValidPeriodFormat; } });
Object.defineProperty(exports, "formatPeriod", { enumerable: true, get: function () { return services_1.formatPeriod; } });
__exportStar(require("./types"), exports);
//# sourceMappingURL=index.js.map