import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Param, ParseUUIDPipe, Patch, Post, Query } from '@nestjs/common';
import { UsersService } from './users.service.js';
import { QueryUserDto } from './dto/query-user.dto.js';
import { UpdateUserDto } from './dto/update-user.dto.js';

@Controller('users')
export class UsersController {
    constructor(private readonly service: UsersService) {}

    @Get()
    async findAll(@Query() query: QueryUserDto) {
        return await this.service.findAll(query)
    }

    @Get(':id')
    async findOne(
        @Param('id', ParseUUIDPipe) id: string,
    ) {
        return await this.service.findOne(id)
    }

    @Patch(':id')
    async update(
        @Param('id', ParseUUIDPipe) id: string,
        @Body() dto: UpdateUserDto
    ) {
        return await this.service.update(id, dto)
    }

    @Delete(':id')
    @HttpCode(HttpStatus.NO_CONTENT)
    async reomve(@Param('id', ParseUUIDPipe) id: string) {
        await this.service.remove(id)
    }
}
