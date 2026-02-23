"use strict";
/**
 * Azure AD Token Validation Middleware
 * Validates Azure AD access tokens from Power Apps Custom Connector
 *
 * This middleware allows the backend to accept Azure AD tokens from Power Apps
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
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.hybridAuth = void 0;
const jsonwebtoken_1 = __importDefault(require("jsonwebtoken"));
const jwks_rsa_1 = __importDefault(require("jwks-rsa"));
// Azure AD Configuration
const TENANT_ID = process.env.AZURE_TENANT_ID || '18b56834-dfea-4931-bdf8-e5ebb0cb4e0f';
const CLIENT_ID = process.env.AZURE_CLIENT_ID || '82b50ec7-3e89-48aa-af74-4831e1c651cd';
// Create JWKS client for fetching Azure AD signing keys
const client = (0, jwks_rsa_1.default)({
    jwksUri: `https://login.microsoftonline.com/${TENANT_ID}/v2.0/.well-known/jwks`,
    cache: true,
    rateLimit: true,
});
/**
 * Get the signing key from JWKS endpoint
 */
const getSigningKey = (kid) => {
    return new Promise((resolve, reject) => {
        client.getSigningKey(kid, (err, key) => {
            if (err) {
                reject(err);
                return;
            }
            const signingKey = key?.getPublicKey();
            resolve(signingKey);
        });
    });
};
/**
 * Verify Azure AD token
 */
const verifyAzureAdToken = async (token) => {
    // First, decode the token to get the kid (key ID)
    const decoded = jsonwebtoken_1.default.decode(token, { complete: true });
    if (!decoded || !decoded.header.kid) {
        throw new Error('Invalid token format');
    }
    // Get the signing key
    const signingKey = await getSigningKey(decoded.header.kid);
    // Verify the token
    const verified = jsonwebtoken_1.default.verify(token, signingKey, {
        issuer: `https://login.microsoftonline.com/${TENANT_ID}/v2.0`,
        audience: CLIENT_ID,
        algorithms: ['RS256'],
    });
    return verified;
};
/**
 * Hybrid authentication middleware
 * Accepts both:
 * 1. Azure AD tokens (from Power Apps)
 * 2. Custom JWT tokens (from /auth/login endpoint)
 */
const hybridAuth = async (req, res, next) => {
    const authHeader = req.headers.authorization;
    // If no auth header, reject
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        res.status(401).json({ error: 'No token provided' });
        return;
    }
    const token = authHeader.split(' ')[1];
    try {
        // Try Azure AD token first
        const azureAdToken = await verifyAzureAdToken(token);
        // If successful, add user info to request
        req.user = {
            email: azureAdToken.email || azureAdToken.preferred_username,
            name: azureAdToken.name,
            roles: azureAdToken.roles || [],
            azureAdToken: true,
        };
        console.log('✅ Azure AD token validated successfully');
        next();
    }
    catch (azureAdError) {
        // Azure AD validation failed, try custom JWT
        console.log('Azure AD token validation failed, trying custom JWT...');
        try {
            const { jwtConfig } = await Promise.resolve().then(() => __importStar(require('../config/jwt')));
            const decoded = jsonwebtoken_1.default.verify(token, jwtConfig.secret);
            req.user = {
                ...decoded,
                customJwt: true,
            };
            console.log('✅ Custom JWT validated successfully');
            next();
        }
        catch (jwtError) {
            console.error('❌ Both Azure AD and custom JWT validation failed');
            res.status(401).json({ error: 'Invalid token' });
        }
    }
};
exports.hybridAuth = hybridAuth;
exports.default = exports.hybridAuth;
//# sourceMappingURL=azureAdAuth.js.map