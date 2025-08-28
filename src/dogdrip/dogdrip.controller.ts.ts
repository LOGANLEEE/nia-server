// src/puppeteer/puppeteer.controller.ts
import { Controller, Get, Query } from '@nestjs/common';
import { DogDripService } from './dogdrip.service';

@Controller('dogdrip')
export class DogDripController {
  constructor(private readonly puppeteerService: DogDripService) {}

  @Get()
  async scrape(@Query('url') url: string) {
    const title = await this.puppeteerService.scrapePage(1);
    return { url, title };
  }
}
