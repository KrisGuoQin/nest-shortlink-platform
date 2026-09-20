import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Param, ParseUUIDPipe, Patch, Post, Query } from '@nestjs/common';
import { UsersService } from './users.service.js';
import { QueryUserDto } from './dto/query-user.dto.js';
import { UpdateUserDto } from './dto/update-user.dto.js';
import { Permissions } from '../authorization/decorators/permissions.decorator.js';

@Controller('users')
export class UsersController {
    constructor(private readonly service: UsersService) {}

    /**
     * 查询用户列表
     * @param query 
     * @returns 
     */
    @Get()
    @Permissions('user:read')
    async findAll(@Query() query: QueryUserDto) {
        return await this.service.findAll(query)
    }

    /**
     * 查询单个用户
     * @param id 
     * @returns 
     */
    @Get(':id')
    @Permissions('user:read')
    async findOne(
        @Param('id', ParseUUIDPipe) id: string,
    ) {
        return await this.service.findOne(id)
    }

    /**
     * 更新用户信息
     * @param id 
     * @param dto 
     * @returns 
     */
    @Patch(':id')
    @Permissions('user:update')
    async update(
        @Param('id', ParseUUIDPipe) id: string,
        @Body() dto: UpdateUserDto
    ) {
        return await this.service.update(id, dto)
    }

    /**
     * 
     * @param id 删除用户
     */
    @Delete(':id')
    @Permissions('user:delete')
    @HttpCode(HttpStatus.NO_CONTENT)
    async reomve(@Param('id', ParseUUIDPipe) id: string) {
        await this.service.remove(id)
    }
}
