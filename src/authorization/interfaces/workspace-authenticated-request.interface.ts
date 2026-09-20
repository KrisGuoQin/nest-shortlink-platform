import { AuthenticatedRequest } from "../../auth/interface/authenticated-request.interface.js";

export interface WorkspaceAuthenticatedRequest
    extends AuthenticatedRequest {
    workspaceAccess: {
        workspaceId: string;

        memberId: string;

        roles: string[];

        permissionCodes: Set<string>;
    };
}