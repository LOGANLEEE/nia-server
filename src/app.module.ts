import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { DogDripModule } from 'src/dogdrip/dogdrip.module';

@Module({
  imports: [DogDripModule],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
