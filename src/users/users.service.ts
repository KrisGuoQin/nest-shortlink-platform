import { ConflictException, Injectable, InternalServerErrorException, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import { Prisma } from '../generated/prisma/client.js';
import { QueryUserDto } from './dto/query-user.dto.js';
import { UpdateUserDto } from './dto/update-user.dto.js';
import { publicUserSelect } from './users.select.js';


interface CreateUserInput {
    email: string;
    name?: string;
    passwordHash: string;
}

@Injectable()
export class UsersService {
    constructor(private readonly prisma: PrismaService) {}

    async createForAuth(input: CreateUserInput) {
        try {
            // 使用事务处理
            return await this.prisma.$transaction(async (tx) => {
                const memberRole = await tx.role.findUnique({
                    where: {
                        code: 'MEMBER'
                    },
                    select: {
                        id: true
                    }
                })

                if (!memberRole) {
                    throw new InternalServerErrorException('Default MEMBER role is not initialized')
                }

                const user = await tx.user.create({
                    data: input,
                    select: publicUserSelect
                })

                // 创建用户默认赋值member权限
                // await tx.userRole.create({
                //     data: {
                //         userId: user.id,
                //         roleId: memberRole.id
                //     }
                // })

                return user
            })
        } catch (error) {
            if (
                error instanceof Prisma.PrismaClientKnownRequestError &&
                error.code === 'P2002'
            ) {
                console.log('error', error)
                throw new ConflictException('Email already exists')
            }

            throw error
        }
    }

    async findByEmailForAuth(email: string) {
        return await this.prisma.user.findUnique({
            where: {
                email,
            },
            select: {
                id: true,
                email: true,
                passwordHash: true
            }
        })
    }

    async findAll(query: QueryUserDto) {
        const { page, pageSize } = query
        const skip = (page - 1)* pageSize
        const [users, total] = await Promise.all([
            this.prisma.user.findMany({
                skip,
                take: pageSize,
                orderBy: {
                    createdAt: 'desc'
                },
                select: publicUserSelect,
            }),
            this.prisma.user.count()
        ])

        return {
            data: users,
            pagination: {
                page,
                pageSize,
                total,
                totalPages: Math.ceil(total / pageSize)
            }
        }
    }

    async findOne(id: string) {
        const user = await this.prisma.user.findUnique({
            where: {
                id,
            },
            select: publicUserSelect,
        })

        if (!user) {
            throw new NotFoundException('User not found')
        }

        return user
    }

    async update(id: string, dto: UpdateUserDto) {
        await this.findOne(id)

        try {
            return await this.prisma.user.update({
                where: {
                    id
                },
                data: dto,
                select: publicUserSelect
            })
        } catch (error) {
            if (
                error instanceof Prisma.PrismaClientKnownRequestError &&
                error.code === 'P2002'
            ) {
                throw new ConflictException(
                'Email already exists',
                );
            }

            throw error;
        }
    }

    async remove(id: string) {
        await this.findOne(id)

        await this.prisma.user.delete({
            where: {
                id
            }
        })
    }
}
