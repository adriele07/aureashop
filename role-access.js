const ADMIN_ROLES = Object.freeze(['super_admin']);
const STORE_ROLES = Object.freeze(['store_owner', 'staff']);

function roleAllowed(user, allowedRoles) {
  return Boolean(user && Array.isArray(allowedRoles) && allowedRoles.includes(user.role));
}

module.exports = { ADMIN_ROLES, STORE_ROLES, roleAllowed };
