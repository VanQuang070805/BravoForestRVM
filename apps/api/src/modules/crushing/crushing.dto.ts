import { ArrayMaxSize, ArrayMinSize, IsArray, IsString } from 'class-validator';
export class MarkCrushedDto { @IsArray() @ArrayMinSize(1) @ArrayMaxSize(100) @IsString({each:true}) itemIds!:string[]; }
