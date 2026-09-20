import { ConflictException, Injectable, InternalServerErrorException, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import { CreateWorkspaceDto } from './dto/create-workspace.dto.js';
import { Prisma } from '../generated/prisma/client.js';
import { UpdateWorkspaceDto } from './dto/update-workspace.dto.js';
import { AddWorkspaceMemberDto } from './dto/add-workspace-member.dto.js';

@Injectable()
export class WorkspacesService {
    constructor(private readonly prismaService: PrismaService) { }

    /**
     * 创建workspace
     * @param userId 
     * @param dto 
     * @returns 
     */
    async create(userId: string, dto: CreateWorkspaceDto) {
        try {
            return this.prismaService.$transaction(async (tx) => {
                const ownerRole = await tx.role.findUnique({
                    where: {
                        code: 'OWNER'
                    },
                    select: {
                        id: true
                    }
                })
                if (!ownerRole) {
                    throw new InternalServerErrorException(
                        'OWNER role is not initialized',
                    );
                }
                // 创建workspace
                const workspace = await tx.workspace.create({
                    data: {
                        name: dto.name,
                        slug: dto.slug
                    }
                })
                // 根据userId创建member
                const member = await tx.workspaceMember.create({
                    data: {
                        userId,
                        workspaceId: workspace.id
                    }
                })
                // 给member绑定role
                await tx.workspaceMemberRole.create({
                    data: {
                        memberId: member.id,
                        roleId: ownerRole.id
                    }
                })

                return workspace
            })
        } catch (error) {
            if (
                error instanceof
                Prisma.PrismaClientKnownRequestError &&
                error.code === 'P2002'
            ) {
                throw new ConflictException(
                    'Workspace slug already exists',
                );
            }

            throw error;
        }
    }

    /**
     * 用户只查询自己加入的workspace
     * @param userId 
     */
    async findMime(userId: string) {
        const memberships = await this.prismaService.workspaceMember.findMany({
            where: {
                userId,
            },
            orderBy: {
                joinedAt: 'desc'
            },
            select: {
                id: true,
                joinedAt: true,
                workspace: {
                    select: {
                        id: true,
                        name: true,
                        slug: true,
                        createdAt: true,
                    }
                },
                roles: {
                    select: {
                        role: {
                            select: {
                                code: true
                            }
                        }
                    }
                }
            }
        })

        return memberships.map(membership => {
            return {
                membershipId: membership.id,
                workspace: membership.workspace,
                roles: membership.roles.map(item => item.role.code)
            }
        })
    }

    async findOne(workspaceId: string) {
        const workspace = await this.prismaService.workspace.findUnique({
            where: {
                id: workspaceId
            },
            select: {
                id: true,
                name: true,
                slug: true,
                createdAt: true,
                updatedAt: true,
            }
        })

        if (!workspace) {
            throw new NotFoundException(
                'Workspace not found',
            );
        }

        return workspace;
    }

    async update(workspaceId: string, dto: UpdateWorkspaceDto) {
        return this.prismaService.workspace.update({
            where: {
                id: workspaceId
            },
            data: dto
        })
    }

    async remove(workspaceId: string) {
        await this.prismaService.workspace.delete({
            where: {
                id: workspaceId
            }
        })
    }

    /**
     * 新成员自动获得Member角色
     * @param workspaceId 
     * @param dto 
     */
    async addMember(workspaceId: string, dto: AddWorkspaceMemberDto) {
        const [user, memberRole] = await Promise.all([
            this.prismaService.user.findUnique({
                where: {
                    email: dto.email
                },
                select: {
                    id: true,
                    email: true,
                    name: true,
                }
            }),
            this.prismaService.role.findUnique({
                where: {
                    code: 'MEMBER'
                },
                select: {
                    id: true
                }
            })
        ])

        if (!user) {
            throw new NotFoundException(
                'User not found',
            );
        }

        if (!memberRole) {
            throw new InternalServerErrorException(
                'MEMBER role is not initialized',
            );
        }

        try {
            return await this.prismaService.$transaction(async tx => {
                const membership = await tx.workspaceMember.create({
                    data: {
                        workspaceId,
                        userId: user.id
                    }
                })
                await tx.workspaceMemberRole.create({
                    data: {
                        memberId: membership.id,
                        roleId: memberRole.id
                    }
                })

                return {
                    id: membership.id,
                    user,
                }
            })
        } catch (error) {
            if (
                error instanceof
                Prisma.PrismaClientKnownRequestError &&
                error.code === 'P2002'
            ) {
                throw new ConflictException(
                    'User is already a workspace member',
                );
            }

            throw error;
        }
    }

    /**
     * 以workspace维度查询成员
     * @param workspaceId 
     * @returns 
     */
    async findMembers(workspaceId: string) {
        return await this.prismaService.workspaceMember.findMany({
            where: {
                workspaceId,
            },
            orderBy: {
                joinedAt: 'asc'
            },
            select: {
                id: true,
                joinedAt: true,
                user: {
                    select: {
                        id: true,
                        email: true,
                        name: true,
                    }
                },
                roles: {
                    select: {
                        role: {
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
     * 给成员分配角色
     * @param workspaceId 
     * @param memberId 
     * @param roleCode 
     * @returns 
     */
    async assignRole(
        workspaceId: string,
        memberId: string,
        roleCode: string,
    ) {
        const [member, role] = await Promise.all([
            this.prismaService.workspaceMember.findFirst({
                where: {
                    id: memberId,
                    workspaceId,
                },
                select: {
                    id: true
                }
            }),
            this.prismaService.role.findUnique({
                where: {
                    code: roleCode.toUpperCase()
                },
                select: {
                    id: true,
                    code: true
                }
            })
        ])

        if (!member) {
            throw new NotFoundException(
                'Workspace member not found',
            );
        }

        if (!role) {
            throw new NotFoundException(
                'Role not found',
            );
        }

        await this.prismaService.workspaceMemberRole.upsert({
            where: {
                memberId_roleId: {
                    memberId: memberId,
                    roleId: role.id
                },
            },
            create: {
                memberId: memberId,
                roleId: role.id
            },
            update: {}
        })

        return {
            memberId,
            role: role.code
        }
    }

    /**
     * 删除成员
     * @param workspaceId 
     * @param memberId 
     */
    async removeMember(
        workspaceId: string,
        memberId: string,
    ) {
        const result = await this.prismaService.workspaceMember.deleteMany({
            where: {
                id: memberId,
                workspaceId
            }
        })

        if (result.count !== 1) {
            throw new NotFoundException(
                'Workspace member not found',
            );
        }
    }
}
