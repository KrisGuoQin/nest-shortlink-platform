import { ForbiddenException } from "@nestjs/common";


export function assertCanManageShortLink(
    userId: string,
    roles: string[],
    createdById: string,
) {
    const privileged = roles.includes('OWNER') || roles.includes('ADMIN')
    if (privileged) {
        return
    }
    if (createdById === userId) {
        return
    }
    throw new ForbiddenException(
        'You can only manage links you created',
    );
}