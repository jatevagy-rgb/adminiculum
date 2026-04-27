export const jwtConfig = {
  // JWT secrets MUST be provided in production — no insecure defaults.
  // These values should be sourced from Azure Key Vault at deployment time.
  secret: process.env.JWT_SECRET || '',
  refreshSecret: process.env.JWT_REFRESH_SECRET || '',
  expiresIn: process.env.JWT_EXPIRES_IN || '1h',
  refreshExpiresIn: process.env.JWT_REFRESH_EXPIRES_IN || '7d',
};
