// src/puppeteer/puppeteer.service.ts
import { Injectable, OnModuleDestroy } from '@nestjs/common';
import puppeteerExtra from 'puppeteer-extra';
// import StealthPlugin from 'puppeteer-extra-plugin-stealth';
import StealthPlugin = require('puppeteer-extra-plugin-stealth');
import * as puppeteer from 'puppeteer';

puppeteerExtra.use(StealthPlugin());

@Injectable()
export class DogDripService implements OnModuleDestroy {
  private browser: puppeteer.Browser;

  async getBrowser(): Promise<puppeteer.Browser> {
    if (!this.browser) {
      this.browser = await puppeteerExtra.launch({
        headless: true, // change to false for debugging
        args: ['--no-sandbox', '--disable-setuid-sandbox'],
      });
    }
    return this.browser;
  }

  async scrapePage(url: string): Promise<string> {
    const browser = await this.getBrowser();
    const page = await browser.newPage();

    console.log(`🚀 >> PuppeteerService >> scrapePage >> url:`, url);
    await page.goto(url, { waitUntil: 'domcontentloaded' });

    // Example: get page title
    const title = await page.title();

    await page.close();
    return title;
  }

  async onModuleDestroy() {
    if (this.browser) {
      await this.browser.close();
    }
  }
}
