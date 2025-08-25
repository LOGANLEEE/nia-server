import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { DogDripModule } from 'src/dogdrip/dogdrip.module';
import { ConfigModule } from '@nestjs/config';
import { UsersService } from 'src/user.service';
import { PostsService } from 'src/post.service';
import { PrismaService } from 'src/prisma.service';

@Module({
  imports: [
    DogDripModule,
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: ['.env.local', '.env.dev', '.env'],
    }),
  ],
  controllers: [AppController],
  providers: [AppService, UsersService, PostsService, PrismaService],
})
export class AppModule {}
