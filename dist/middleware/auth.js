"use strict";
/**
 * Authentication Middleware
 * JWT verification and role-based access control
 * Supports both custom JWT and Azure AD tokens (hybrid auth for Power Apps)
 */
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.ROLE_NAMES = exports.canAssignTask = exports.canAccess = exports.ROLES = exports.requireRole = exports.authenticate = void 0;
const jsonwebtoken_1 = __importDefault(require("jsonwebtoken"));
const jwks_rsa_1 = __importDefault(require("jwks-rsa"));
const jwt_1 = require("../config/jwt");
// Azure AD configuration
const AZURE_AD_TENANT_ID = '18b56834-dfea-4931-bdf8-e5ebb0cb4e0f';
const azureClient = (0, jwks_rsa_1.default)({
    jwksUri: `https://login.microsoftonline.com/${AZURE_AD_TENANT_ID}/discovery/v2.0/keys`,
    cache: false, // Disable cache for debugging
    rateLimit: false,
});
function getAzureSigningKey(header, callback) {
    console.log('Looking for signing key with kid:', header.kid);
    azureClient.getSigningKey(header.kid, (err, key) => {
        if (err) {
            console.error('JWKS getSigningKey error:', err.message);
            console.error('Error details:', JSON.stringify(err));
            callback(err);
            return;
        }
        const signingKey = key?.getPublicKey();
        console.log('Found signing key:', signingKey ? 'YES' : 'NO');
        callback(null, signingKey);
    });
}
async function verifyAzureAdToken(token) {
    return new Promise((resolve, reject) => {
        jsonwebtoken_1.default.verify(token, getAzureSigningKey, {
            audience: [
                'api://82b50ec7-3e89-48aa-af74-4831e1c651cd',
                '82b50ec7-3e89-48aa-af74-4831e1c651cd'
            ], // Can be app ID or api://clientid
            issuer: [
                `https://login.microsoftonline.com/${AZURE_AD_TENANT_ID}/v2.0`,
                `https://sts.windows.net/${AZURE_AD_TENANT_ID}/`,
            ],
            algorithms: ['RS256'],
        }, (err, decoded) => {
            if (err) {
                reject(err);
                return;
            }
            // Transform Azure AD claims to our JwtPayload format
            const azureAdPayload = decoded;
            resolve({
                userId: azureAdPayload.oid || azureAdPayload.sub,
                email: azureAdPayload.email || azureAdPayload.preferred_username,
                role: azureAdPayload.role?.[0] || 'LAWYER', // Default role for Azure AD users
            });
        });
    });
}
/**
 * Verify JWT token and attach user to request
 * Supports both Azure AD tokens (for Power Apps) and custom JWT tokens
 */
const authenticate = async (req, res, next) => {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        res.status(401).json({ error: 'No token provided' });
        return;
    }
    const token = authHeader.split(' ')[1];
    // Try Azure AD token first (for Power Apps)
    try {
        console.log('Attempting Azure AD token validation...');
        // Decode token first to see what's in it
        const decoded = jsonwebtoken_1.default.decode(token, { complete: true });
        console.log('Token header:', JSON.stringify(decoded?.header));
        console.log('Token payload:', JSON.stringify(decoded?.payload));
        const azureUser = await verifyAzureAdToken(token);
        console.log('✅ Azure AD token validated successfully:', azureUser.email);
        req.user = azureUser;
        req.azureAdToken = true;
        next();
        return;
    }
    catch (azureError) {
        console.log('Azure AD token validation failed:', azureError.message);
        console.log('Error details:', JSON.stringify(azureError));
    }
    // Fall back to custom JWT
    console.log('Trying custom JWT validation with secret:', jwt_1.jwtConfig.secret ? 'SET' : 'NOT SET');
    try {
        const decoded = jsonwebtoken_1.default.verify(token, jwt_1.jwtConfig.secret);
        console.log('✅ Custom JWT validated successfully:', decoded.email);
        req.user = decoded;
        req.customJwt = true;
        next();
    }
    catch (error) {
        console.error('❌ Custom JWT validation failed:', error.message);
        res.status(401).json({ error: 'Invalid token' });
    }
};
exports.authenticate = authenticate;
/**
 * Check if user has required role
 */
const requireRole = (...allowedRoles) => {
    return (req, res, next) => {
        if (!req.user) {
            res.status(401).json({ error: 'Not authenticated' });
            return;
        }
        if (!allowedRoles.includes(req.user.role)) {
            res.status(403).json({ error: 'Insufficient permissions' });
            return;
        }
        next();
    };
};
exports.requireRole = requireRole;
/**
 * Role constants matching Prisma schema
 */
exports.ROLES = {
    LAWYER: 'LAWYER',
    COLLAB_LAWYER: 'COLLAB_LAWYER',
    TRAINEE: 'TRAINEE',
    LEGAL_ASSISTANT: 'LEGAL_ASSISTANT',
    ADMIN: 'ADMIN'
};
/**
 * Role hierarchy for authorization
 */
const ROLE_HIERARCHY = {
    LAWYER: 4,
    COLLAB_LAWYER: 3,
    TRAINEE: 2,
    LEGAL_ASSISTANT: 1,
    ADMIN: 5
};
/**
 * Check if user can access resource based on role hierarchy
 */
const canAccess = (userRole, requiredLevel) => {
    return ROLE_HIERARCHY[userRole] >= requiredLevel;
};
exports.canAccess = canAccess;
/**
 * Role-based task assignment rules
 * LAWYER → TRAINEE, LEGAL_ASSISTANT
 * COLLAB_LAWYER → TRAINEE, LEGAL_ASSISTANT
 * TRAINEE → LEGAL_ASSISTANT
 * LEGAL_ASSISTANT → cannot assign
 */
const canAssignTask = (assignorRole, assigneeRole) => {
    const superiorRoles = [exports.ROLES.LAWYER, exports.ROLES.COLLAB_LAWYER, exports.ROLES.TRAINEE];
    const subordinateRoles = [exports.ROLES.TRAINEE, exports.ROLES.LEGAL_ASSISTANT];
    if (!superiorRoles.includes(assignorRole)) {
        return false;
    }
    if ([exports.ROLES.LAWYER, exports.ROLES.COLLAB_LAWYER].includes(assignorRole)) {
        return subordinateRoles.includes(assigneeRole);
    }
    if (assignorRole === exports.ROLES.TRAINEE) {
        return assigneeRole === exports.ROLES.LEGAL_ASSISTANT;
    }
    return false;
};
exports.canAssignTask = canAssignTask;
/**
 * Get all role names for display
 */
exports.ROLE_NAMES = {
    LAWYER: 'Ügyvéd',
    COLLAB_LAWYER: 'Együttműködő ügyvéd',
    TRAINEE: 'Ügyvédjelölt',
    LEGAL_ASSISTANT: 'Jogi asszisztens',
    ADMIN: 'Adminisztrátor'
};
//# sourceMappingURL=auth.js.map