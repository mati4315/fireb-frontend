export const normalizeRole = (role: unknown): string => {
  return typeof role === 'string' ? role.trim().toLowerCase() : '';
};

export const normalizeEmail = (email: unknown): string => {
  return typeof email === 'string' ? email.trim().toLowerCase() : '';
};

export const normalizeUid = (uid: unknown): string => {
  return typeof uid === 'string' ? uid.trim() : '';
};

const SUPER_ADMIN_EMAILS = new Set(['matias4315@gmail.com']);
const SUPER_ADMIN_UIDS = new Set(['Z4f5ogXDQaNhEY4iBf9jgkPnQMP2']);

const normalizeRoleAlias = (role: unknown): string => {
  return normalizeRole(role).replace(/[\s_-]+/g, '');
};

export const isSuperAdminEmail = (email: unknown): boolean => {
  return SUPER_ADMIN_EMAILS.has(normalizeEmail(email));
};

export const isSuperAdminUid = (uid: unknown): boolean => {
  return SUPER_ADMIN_UIDS.has(normalizeUid(uid));
};

export const isStaffRole = (role: unknown): boolean => {
  const normalized = normalizeRoleAlias(role);
  return normalized === 'admin' ||
    normalized === 'administrador' ||
    normalized === 'colaborador' ||
    normalized === 'superadmin';
};

export const isStaffClaim = (claims: unknown): boolean => {
  if (!claims || typeof claims !== 'object') return false;
  const parsedClaims = claims as Record<string, unknown>;
  return parsedClaims.admin === true ||
    parsedClaims.superAdmin === true ||
    parsedClaims.super_admin === true;
};

export const isStaffUser = (
  role: unknown,
  email: unknown,
  uid?: unknown,
  claims?: unknown
): boolean => {
  return isSuperAdminEmail(email) ||
    isSuperAdminUid(uid) ||
    isStaffClaim(claims) ||
    isStaffRole(role);
};
