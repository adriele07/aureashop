const ADMIN_ROLES = Object.freeze(['super_admin']);
const STORE_ROLES = Object.freeze(['store_owner', 'staff']);

function roleAllowed(user, allowedRoles) {
  return Boolean(user && Array.isArray(allowedRoles) && allowedRoles.includes(user.role));
}

function resolveLoginRole(existingRole, isAllowlisted) {
  if (isAllowlisted) return 'super_admin';
  return STORE_ROLES.includes(existingRole) ? existingRole : 'customer';
}

module.exports = { ADMIN_ROLES, STORE_ROLES, roleAllowed, resolveLoginRole };
