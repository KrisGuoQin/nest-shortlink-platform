import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import { CreateUserDto } from './dto/create-user.dto.js';
import { Prisma } from '../generated/prisma/client.js';
import { QueryUserDto } from './dto/query-user.dto.js';
import { UpdateUserDto } from './dto/update-user.dto.js';

@Injectable()
export class UsersService {
    constructor(private readonly prisma: PrismaService) {}

    async create(dto: CreateUserDto) {
        try {
            return await this.prisma.user.create({
                data: {
                    email: dto.email,
                    name: dto.name
                }
            })
        } catch (error) {
            if (
                error instanceof Prisma.PrismaClientKnownRequestError &&
                error.code === 'P2002'
            ) {
                throw new ConflictException('Email already exists')
            }

            throw error
        }
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
                }
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
            }
        })

        if (!user) {
            throw new NotFoundException('User not found')
        }

        return user
    }

    async update(id: string, dto: UpdateUserDto) {
        await this.findOne(id)

        try {
            return this.prisma.user.update({
                where: {
                    id
                },
                data: dto
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
