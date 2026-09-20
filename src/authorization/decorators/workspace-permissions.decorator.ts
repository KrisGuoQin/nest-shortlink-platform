import {
  SetMetadata,
} from '@nestjs/common';

export const
  WORKSPACE_PERMISSIONS_KEY =
    'workspace_required_permissions';

export const WorkspacePermissions = (
  ...permissions: string[]
) =>
  SetMetadata(
    WORKSPACE_PERMISSIONS_KEY,
    permissions,
  );