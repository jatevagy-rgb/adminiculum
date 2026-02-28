/**
 * Debug endpoint for diagnosing JWT token issues
 * DO NOT USE IN PRODUCTION - only for debugging
 */

import { Request, Response } from 'express';
import jwt from 'jsonwebtoken';

/**
 * GET /api/v1/debug/whoami
 * Debug endpoint - returns JWT claims without verification
 */
export const debugWhoami = async (req: Request, res: Response): Promise<void> => {
  const authHeader = req.headers.authorization;
  
  console.log('[DEBUG] Authorization header present:', !!authHeader);
  
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    res.status(401).json({ 
      error: 'No token provided',
      message: 'Authorization header missing or invalid format'
    });
    return;
  }
  
  const token = authHeader.split(' ')[1];
  
  try {
    // Decode without verification to see what's in the token
    const decoded = jwt.decode(token, { complete: true });
    
    if (!decoded) {
      res.status(401).json({ 
        error: 'Invalid token',
        message: 'Could not decode token'
      });
      return;
    }
    
    const header = decoded.header as any;
    const payload = decoded.payload as any;
    
    // Log the important claims
    console.log('[DEBUG] JWT Claims:', {
      aud: payload.aud,
      iss: payload.iss,
      appid: payload.appid || payload.azp,
      scp: payload.scp || payload.roles,
      tid: payload.tid,
      exp: payload.exp,
      sub: payload.sub,
      email: payload.email || payload.preferred_username
    });
    
    // Return the claims
    res.json({
      success: true,
      tokenType: payload.iss?.includes('microsoftonline') ? 'Azure AD' : 'Custom JWT',
      claims: {
        aud: payload.aud,
        iss: payload.iss,
        appid: payload.appid || payload.azp,
        scp: payload.scp || payload.roles,
        tid: payload.tid,
        exp: payload.exp,
        sub: payload.sub,
        email: payload.email || payload.preferred_username,
        name: payload.name
      },
      header: {
        alg: header.alg,
        typ: header.typ,
        kid: header.kid
      }
    });
    
  } catch (error: any) {
    console.error('[DEBUG] Error decoding token:', error.message);
    res.status(401).json({ 
      error: 'Token decode error',
      message: error.message 
    });
  }
};
