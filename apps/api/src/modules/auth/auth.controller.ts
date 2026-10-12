import { Body, Controller, Get, Patch, Post, Req, Res } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Request, Response } from 'express';
import { Public } from '../../common/security';
import { AuthService } from './auth.service';
import { LoginDto, RefreshDto, RegisterDto, UpdateProfileDto } from './auth.dto';

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  private setRefreshCookie(response: Response, token: string) {
    response.cookie('refresh_token', token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      path: '/api/v1/auth',
      maxAge: Number(process.env.JWT_REFRESH_TTL_SECONDS ?? 2_592_000) * 1000,
    });
  }

  @Public()
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @Post('register')
  async register(@Body() dto: RegisterDto, @Res({ passthrough: true }) response: Response) {
    const tokens = await this.auth.register(dto);
    this.setRefreshCookie(response, tokens.refreshToken);
    return { accessToken: tokens.accessToken, expiresIn: tokens.expiresIn };
  }

  @Public()
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @Post('login')
  async login(@Body() dto: LoginDto, @Res({ passthrough: true }) response: Response) {
    const tokens = await this.auth.login(dto);
    this.setRefreshCookie(response, tokens.refreshToken);
    return { accessToken: tokens.accessToken, expiresIn: tokens.expiresIn };
  }

  @Public()
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  @Post('refresh')
  async refresh(@Body() dto: RefreshDto, @Req() request: Request, @Res({ passthrough: true }) response: Response) {
    const tokens = await this.auth.refresh(dto.refreshToken ?? request.cookies?.refresh_token);
    this.setRefreshCookie(response, tokens.refreshToken);
    return { accessToken: tokens.accessToken, expiresIn: tokens.expiresIn };
  }

  @Public()
  @Post('logout')
  async logout(@Body() dto: RefreshDto, @Req() request: Request, @Res({ passthrough: true }) response: Response) {
    try {
      await this.auth.logout(dto.refreshToken ?? request.cookies?.refresh_token);
    } finally {
      response.clearCookie('refresh_token', {
        path: '/api/v1/auth',
        sameSite: 'strict',
        secure: process.env.NODE_ENV === 'production',
        httpOnly: true,
      });
    }
    return { ok: true };
  }

  @ApiBearerAuth()
  @Get('me')
  me(@Req() request: Request & { user: { sub: string } }) {
    return this.auth.profile(request.user.sub);
  }

  @ApiBearerAuth()
  @Patch('me')
  update(@Req() request: Request & { user: { sub: string } }, @Body() dto: UpdateProfileDto) {
    return this.auth.updateProfile(request.user.sub, dto);
  }
}
