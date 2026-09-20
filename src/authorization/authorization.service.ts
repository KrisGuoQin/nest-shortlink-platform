import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';

@Injectable()
export class AuthorizationService {
    constructor(private readonly prismaService: PrismaService) {}

    /**
     * 根据uid和wid获取权限
     * @param userId 
     * @param workspaceId 
     * @returns 
     */
    async getWorkspaceAccess(userId: string, workspaceId: string) {
        const membership = await this.prismaService.workspaceMember.findUnique({
            where: {
                workspaceId_userId: {
                    workspaceId,
                    userId,
                }
            },
            select: {
                id: true,
                roles: {
                    select: {
                        role: {
                            select: {
                                code: true,
                                permissions: {
                                    select: {
                                        permission: {
                                            select: {
                                                code: true
                                            }
                                        }
                                    }
                                }
                            }
                        }
                    }
                }
            }
        })

        if (!membership) {
            return null
        }

        const roles = membership.roles.map(item => item.role.code)
        const permissionCodes = new Set<string>()
        for (const memberRole of membership.roles) {
            for (const rolePermission of memberRole.role.permissions) {
                permissionCodes.add(rolePermission.permission.code)
            }
        }

        return {
            memberId: membership.id,
            roles,
            permissionCodes,
        }
    }

    async getAccess(userId: string) {
        // const assignments = await this.prismaService.userRole.findMany({
        //     where: {
        //         userId,
        //     },
        //     select: {
        //         role: {
        //             select: {
        //                 code: true,
        //                 name: true,
        //                 permissions: {
        //                     select: {
        //                         permission: {
        //                             select: {
        //                                 code: true,
        //                                 name: true
        //                             }
        //                         }
        //                     }
        //                 }
        //             }
        //         }
        //     }
        // })
        // const roles = assignments.map(assignment => ({
        //     code: assignment.role.code,
        //     name: assignment.role.name,
        // }))
        // const permissionMap = new Map<string, { code:string; name: string }>()
        // for (const assignment of assignments) {
        //     for (const rolePermission of assignment.role.permissions) {
        //         const permission = rolePermission.permission
        //         permissionMap.set(permission.code, permission)
        //     }
        // }

        // return {
        //     userId,
        //     roles,
        //     permissions: Array.from(permissionMap.values())
        // }
    }

    async getPermissionCodes(userId: string) {
        // const assignments = await this.prismaService.userRole.findMany({
        //     where: {
        //         userId,
        //     },
        //     select: {
        //         role: {
        //             select: {
        //                 permissions: {
        //                     select: {
        //                         permission: {
        //                             select: {
        //                                 code: true
        //                             }
        //                         }
        //                     }
        //                 }
        //             }
        //         }
        //     }
        // })

        // const permissions = new Set<string>()
        // for (const assignment of assignments) {
        //     for (const item of assignment.role.permissions) {
        //         permissions.add(item.permission.code)
        //     }
        // }

        // return permissions
        return new Set<string>();
    }

    async hasAllPermissions(userId: string, requiredPermissions: string[]) {
        const permissions = await this.getPermissionCodes(userId)
        return requiredPermissions.every(permission => permissions.has(permission))
    }

    /**
     * 返回角色表中的所有角色
     * @returns 
     */
    async listRoles() {
        return await this.prismaService.role.findMany({
            orderBy: {
                code: 'asc'
            },
            select: {
                id: true,
                code: true,
                name: true,
                permissions: {
                    select: {
                        permission: {
                            select: {
                                code: true,
                                name: true,
                            }
                        }
                    }
                }
            }
        })
    }

    /**
     * 给用户分配角色
     */
    async assignRole(userId: string, roleCode: string) {
        const [user, role] = await Promise.all([
            this.prismaService.user.findUnique({
                where: {
                    id: userId
                },
                select: { id: true }
            }),
            this.prismaService.role.findUnique({
                where: {
                    code: roleCode
                },
                select: {
                    id: true,
                    code: true,
                    name: true,
                }
            })
        ])

        if (!user) {
            throw new NotFoundException(
                'User not found',
            );
        }

        if (!role) {
            throw new NotFoundException(
                'Role not found',
            );
        }

        // await this.prismaService.userRole.upsert({
        //     where: {
        //         userId_roleId: {
        //             userId,
        //             roleId:  role.id
        //         },
        //     },
        //     create: {
        //         userId,
        //         roleId: role.id
        //     },
        //     update: {}
        // })

        return {
            userId,
            role: {
                code: role.code,
                name: role.name,
            }
        }
    }

    /**
     * 撤销用户角色
     * @param userId 
     * @param roleCode 
     */
    async revokeRole(userId: string, roleCode: string) {
        const role = await this.prismaService.role.findUnique({
            where: {
                code: roleCode
            },
            select: {
                id: true
            }
        })
        if (!role) {
            throw new NotFoundException(
                'Role not found',
            );
        }

        // await this.prismaService.userRole.deleteMany({
        //     where: {
        //         userId,
        //         roleId: role.id
        //     }
        // })
    }
}
