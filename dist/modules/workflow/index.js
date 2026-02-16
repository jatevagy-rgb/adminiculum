"use strict";
/**
 * Workflow Module Index
 * Case Workflow Engine v1
 *
 * Exports:
 * - workflowService: Core workflow engine
 * - workflowTypes: TypeScript interfaces and constants
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
exports.WorkflowService = exports.workflowService = void 0;
var workflow_service_1 = require("./workflow.service");
Object.defineProperty(exports, "workflowService", { enumerable: true, get: function () { return __importDefault(workflow_service_1).default; } });
Object.defineProperty(exports, "WorkflowService", { enumerable: true, get: function () { return workflow_service_1.WorkflowService; } });
__exportStar(require("./workflow.types"), exports);
//# sourceMappingURL=index.js.map