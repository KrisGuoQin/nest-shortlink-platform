import { Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt'
import * as argon2 from 'argon2';
import { UsersService } from '../users/users.service.js';
import { RegisterDto } from './dto/register.dto.js';
import { LoginDto } from './dto/login.dto.js';
import { JwtPayload } from './interface/jwt-payload.interface.js';

@Injectable()
export class AuthService {
    constructor(
        private readonly usersSServices: UsersService,
        private readonly jwtServices: JwtService
    ) {}

    async register(dto: RegisterDto) {
        const passwordHash = await argon2.hash(dto.password)

        return this.usersSServices.createForAuth({
            email: dto.email,
            name: dto.name,
            passwordHash,
        })
    }

    async login(dto: LoginDto) {
        const user = await this.usersSServices.findByEmailForAuth(dto.email)

        if(!user) {
            throw new UnauthorizedException('Invalid email or password')
        }

        const passwordMatched = await argon2.verify(user.passwordHash, dto.password)

        if(!passwordMatched) {
            throw new UnauthorizedException('Invalid email or password')
        }

        const payload: JwtPayload = {
            sub: user.id
        }

        const accessToken = await this.jwtServices.signAsync(payload)

        return {
            accessToken,
            tokenType: 'Bearer',
            expiresIn: 900
        }
    }

    async me(userId: string) {
        return await this.usersSServices.findOne(userId)
    }
}
