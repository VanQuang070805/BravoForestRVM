import 'reflect-metadata';
import { DataSource } from 'typeorm';
export const AppDataSource=new DataSource({type:'mariadb',host:process.env.DB_HOST??'127.0.0.1',port:Number(process.env.DB_PORT??3306),username:process.env.DB_USER??'root',password:process.env.DB_PASSWORD??'',database:process.env.DB_NAME??'BravoForest',entities:[__dirname+'/**/*.entity{.ts,.js}'],synchronize:false,logging:false});
