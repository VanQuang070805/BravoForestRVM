import { Body, Controller, Get, Patch, Post, Req, Res } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Request, Response } from 'express';
import { Public, Roles } from '../../common/security';
import { AuthService, type AuthAudience } from './auth.service';
import { ChangePasswordDto, EmailOtpDto, LoginDto, PasswordResetDto, PasswordResetVerifyDto, RefreshDto, RegisterDto, RegisterVerifyDto, UpdateProfileDto } from './auth.dto';

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  private cookieName(audience: AuthAudience) {
    return audience === 'admin' ? 'bf_admin_refresh_token' : 'bf_customer_refresh_token';
  }

  private cookieOptions() {
    return {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      path: '/api/v1/auth',
    } as const;
  }

  private setRefreshCookie(response: Response, token: string, audience: AuthAudience) {
    const maxAge = Number(process.env.JWT_REFRESH_TTL_SECONDS ?? 2_592_000) * 1000;
    response.cookie(this.cookieName(audience), token, {
      ...this.cookieOptions(),
      // Customer sessions end when the browser session closes. Admin sessions
      // keep the configured refresh lifetime so this change stays customer-only.
      ...(audience === 'admin' ? { maxAge } : {}),
    });
    response.clearCookie('refresh_token', this.cookieOptions());
  }

  private clearRefreshCookie(response: Response, audience: AuthAudience) {
    response.clearCookie(this.cookieName(audience), this.cookieOptions());
    response.clearCookie('refresh_token', this.cookieOptions());
  }

  private async loginFor(dto: LoginDto, response: Response, audience: AuthAudience) {
    const tokens = await this.auth.login(dto, audience);
    this.setRefreshCookie(response, tokens.refreshToken, audience);
    return { accessToken: tokens.accessToken, expiresIn: tokens.expiresIn };
  }

  private async refreshFor(dto: RefreshDto, request: Request, response: Response, audience: AuthAudience) {
    const token = dto.refreshToken ?? request.cookies?.[this.cookieName(audience)];
    const tokens = await this.auth.refresh(token, audience);
    this.setRefreshCookie(response, tokens.refreshToken, audience);
    return { accessToken: tokens.accessToken, expiresIn: tokens.expiresIn };
  }

  private async logoutFor(dto: RefreshDto, request: Request, response: Response, audience: AuthAudience) {
    const token = dto.refreshToken ?? request.cookies?.[this.cookieName(audience)];
    try {
      await this.auth.logout(token, audience);
    } finally {
      this.clearRefreshCookie(response, audience);
    }
    return { ok: true };
  }

  @Public()
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @Post('register')
  register(@Body() dto: RegisterDto) {
    return this.auth.register(dto);
  }

  @Public()
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @Post('register/verify')
  async verifyRegistration(@Body() dto: RegisterVerifyDto, @Res({ passthrough: true }) response: Response) {
    const tokens = await this.auth.verifyRegistration(dto.email, dto.code);
    this.setRefreshCookie(response, tokens.refreshToken, 'customer');
    return { accessToken: tokens.accessToken, expiresIn: tokens.expiresIn };
  }

  @Public()
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @Post('password-reset/request')
  requestPasswordReset(@Body() dto: EmailOtpDto) {
    return this.auth.requestPasswordReset(dto.email);
  }

  @Public()
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @Post('password-reset/verify')
  verifyPasswordReset(@Body() dto: PasswordResetVerifyDto) {
    return this.auth.verifyPasswordReset(dto.email, dto.code);
  }

  @Public()
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @Post('password-reset/confirm')
  resetPassword(@Body() dto: PasswordResetDto) {
    return this.auth.resetPassword(dto.email, dto.code, dto.newPassword);
  }

  @Public()
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @Post('login')
  login(@Body() dto: LoginDto, @Res({ passthrough: true }) response: Response) {
    return this.loginFor(dto, response, 'customer');
  }

  @Public()
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @Post('customer/login')
  customerLogin(@Body() dto: LoginDto, @Res({ passthrough: true }) response: Response) {
    return this.loginFor(dto, response, 'customer');
  }

  @Public()
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @Post('admin/login')
  adminLogin(@Body() dto: LoginDto, @Res({ passthrough: true }) response: Response) {
    return this.loginFor(dto, response, 'admin');
  }

  @Public()
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  @Post('refresh')
  refresh(@Body() dto: RefreshDto, @Req() request: Request, @Res({ passthrough: true }) response: Response) {
    return this.refreshFor(dto, request, response, 'customer');
  }

  @Public()
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  @Post('customer/refresh')
  customerRefresh(@Body() dto: RefreshDto, @Req() request: Request, @Res({ passthrough: true }) response: Response) {
    return this.refreshFor(dto, request, response, 'customer');
  }

  @Public()
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  @Post('admin/refresh')
  adminRefresh(@Body() dto: RefreshDto, @Req() request: Request, @Res({ passthrough: true }) response: Response) {
    return this.refreshFor(dto, request, response, 'admin');
  }

  @Public()
  @Post('logout')
  logout(@Body() dto: RefreshDto, @Req() request: Request, @Res({ passthrough: true }) response: Response) {
    return this.logoutFor(dto, request, response, 'customer');
  }

  @Public()
  @Post('customer/logout')
  customerLogout(@Body() dto: RefreshDto, @Req() request: Request, @Res({ passthrough: true }) response: Response) {
    return this.logoutFor(dto, request, response, 'customer');
  }

  @Public()
  @Post('admin/logout')
  adminLogout(@Body() dto: RefreshDto, @Req() request: Request, @Res({ passthrough: true }) response: Response) {
    return this.logoutFor(dto, request, response, 'admin');
  }

  @ApiBearerAuth()
  @Roles('CUSTOMER')
  @Get('me')
  me(@Req() request: Request & { user: { sub: string } }) {
    return this.auth.profile(request.user.sub);
  }

  @ApiBearerAuth()
  @Roles('ADMIN', 'TECHNICIAN')
  @Get('admin/me')
  adminMe(@Req() request: Request & { user: { sub: string } }) {
    return this.auth.profile(request.user.sub);
  }

  @ApiBearerAuth()
  @Roles('CUSTOMER')
  @Patch('me')
  update(@Req() request: Request & { user: { sub: string } }, @Body() dto: UpdateProfileDto) {
    return this.auth.updateProfile(request.user.sub, dto);
  }

  @ApiBearerAuth()
  @Patch('password')
  changePassword(@Req() request: Request & { user: { sub: string } }, @Body() dto: ChangePasswordDto) {
    return this.auth.changePassword(request.user.sub, dto);
  }
}
