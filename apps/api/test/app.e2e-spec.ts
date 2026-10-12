
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import { AuthController } from '../src/modules/auth/auth.controller';
import { AuthService } from '../src/modules/auth/auth.service';

describe('Auth API (e2e)',()=>{let app:INestApplication;const tokens={accessToken:'access',refreshToken:'refresh',expiresIn:'15m'};const auth={register:jest.fn().mockResolvedValue(tokens),login:jest.fn().mockResolvedValue(tokens),refresh:jest.fn().mockResolvedValue(tokens),logout:jest.fn().mockResolvedValue(undefined),profile:jest.fn(),updateProfile:jest.fn()};beforeAll(async()=>{const module=await Test.createTestingModule({controllers:[AuthController],providers:[{provide:AuthService,useValue:auth}]}).compile();app=module.createNestApplication();app.use(cookieParser());app.useGlobalPipes(new ValidationPipe({whitelist:true,forbidNonWhitelisted:true,transform:true}));await app.init();});afterAll(()=>app.close());it('logs in and stores refresh token only in an HttpOnly cookie',async()=>{const res=await request(app.getHttpServer()).post('/auth/login').send({identifier:'test-only@example.invalid',password:'test-only-password'}).expect(201);expect(res.body).toEqual({accessToken:'access',expiresIn:'15m'});expect(res.headers['set-cookie'][0]).toMatch(/refresh_token=refresh;.*HttpOnly.*SameSite=Strict/);});it('rejects malformed registration before service execution',()=>request(app.getHttpServer()).post('/auth/register').send({fullName:'x',email:'bad',password:'short'}).expect(400));});
