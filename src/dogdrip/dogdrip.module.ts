// src/puppeteer/puppeteer.module.ts
import { Module } from '@nestjs/common';
import { DogDripService } from './dogdrip.service';
import { DogDripController } from 'src/dogdrip/dogdrip.controller.ts';

@Module({
  providers: [DogDripService],
  controllers: [DogDripController],
  exports: [DogDripService],
})
export class DogDripModule {}
