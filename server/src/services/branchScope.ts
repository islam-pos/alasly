import type { AuthenticatedRequest } from '../middleware/auth';

export const branchWhere = (req: AuthenticatedRequest) =>
  req.authenticatedRole === 'admin'
    ? {}
    : { branchId: req.user?.branchId || '__NO_ASSIGNED_BRANCH__' };

export const resolveBranchId = (
  req: AuthenticatedRequest,
  requestedBranchId?: unknown,
): string | null => {
  if (req.authenticatedRole === 'admin') {
    return typeof requestedBranchId === 'string' && requestedBranchId
      ? requestedBranchId
      : null;
  }
  return req.user?.branchId || null;
};
