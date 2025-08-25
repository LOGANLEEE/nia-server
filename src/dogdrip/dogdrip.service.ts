// src/puppeteer/puppeteer.service.ts
import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import puppeteerExtra from 'puppeteer-extra';
// import StealthPlugin from 'puppeteer-extra-plugin-stealth';
import StealthPlugin = require('puppeteer-extra-plugin-stealth');
import * as puppeteer from 'puppeteer';
import AdblockerPlugin from 'puppeteer-extra-plugin-adblocker';
import { fstat, writeFile, writeFileSync } from 'fs';
import { PrismaService } from 'src/prisma.service';
import { parseRelativeKoreanTime } from 'src/util/date';
import { log } from 'console';

puppeteerExtra.use(StealthPlugin());
puppeteerExtra.use(AdblockerPlugin({ blockTrackers: true }));

@Injectable()
export class DogDripService implements OnModuleDestroy, OnModuleInit {
  constructor(private prisma: PrismaService) {}
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

  async innerPageExtractor(page: puppeteer.Page, url: string) {
    await page.goto(url, { waitUntil: 'domcontentloaded' });
    const content = await page.waitForResponse((response) => response.url().includes('dogdrip') && response.status() === 200);

    if (!content.ok()) {
      setTimeout(() => {
        this.innerPageExtractor(page, url);
      }, 1000);
    }

    const title = await page.evaluate(() => {
      return document
        .querySelector(
          '#main > div > div > div > div:nth-child(3) > div:nth-child(1) > div > div.ed.article-head.margin-bottom-large > h4 > a',
        )
        ?.textContent?.trim();
    });

    const timeStamp = await page.evaluate(() => {
      return document
        .querySelector(
          '#main > div > div > div > div:nth-child(3) > div:nth-child(1) > div > div.ed.article-head.margin-bottom-large > div.ed.flex.flex-wrap.flex-left.flex-middle.title-toolbar > div.ed.flex.flex-wrap > span:nth-child(2) > span:nth-child(2)',
        )
        ?.textContent?.trim()
        ?.replaceAll('\n', '');
    });

    const author = await page.evaluate(() => {
      return document
        .querySelector(
          '#main > div > div > div > div:nth-child(3) > div:nth-child(1) > div > div.ed.article-head.margin-bottom-large > div.ed.flex.flex-wrap.flex-left.flex-middle.title-toolbar > div.ed.flex.flex-wrap > span:nth-child(1) > a',
        )
        ?.textContent?.trim();
    });

    const votedCount = await page.evaluate(() => {
      return document.querySelector('#document_voted_count')?.textContent?.trim();
    });

    const disLike = await page.evaluate(() => {
      return document.querySelector('#document_blamed_count')?.textContent?.trim().replace('-', '');
    });

    const textContent = await page.evaluate(() => {
      const addon_addvote = document.querySelector('.addon_addvote');
      if (addon_addvote) {
        addon_addvote.remove();
      }

      return document
        .querySelector(
          '#main > div > div > div > div:nth-child(3) > div:nth-child(1) > div > div.ed.clearfix.margin-vertical-large > div.rhymix_content.xe_content',
        )
        ?.textContent?.trim();
    });

    const creation = await this.prisma.dogDrip.create({
      data: {
        link: url,
        author,
        title,
        textContent,
        disLike: parseInt(disLike ?? '0', 10),
        likes: parseInt(votedCount ?? '0', 10),
        registeredAt: parseRelativeKoreanTime(timeStamp ?? ''),
      },
    });
    console.log(`🚀 >> created:`, creation);

    // writeFileSync('./test.html', await page.content());

    // const okay = await page.waitForSelector(`#main > div > div > div`);

    return creation;
  }

  async scrapePage(url: string, pageNumber: number): Promise<string> {
    const browser = await this.getBrowser();
    const page = await browser.newPage();

    const {} = await page.goto(url, { waitUntil: 'domcontentloaded' });

    // const content = await page.waitForResponse((response) => response.url().includes('dogdrip') && response.status() === 200);
    // if (!ok()) {
    //   setTimeout(async () => {
    //     await this.scrapePage(url, pageNumber);
    //   }, 1000);
    // }

    const limit = 25; //25;

    const startCount = pageNumber === 1 ? 5 : 1;

    // crawling target contents page by page

    for (let i = startCount; i <= limit; i++) {
      try {
        const waiting = await page.waitForSelector(`#main > div > div > div > div.ed.board-list > ul > li:nth-child(${i}) > a`, {
          visible: true,
        });

        const href = await waiting.evaluate((el) => el.getAttribute('href'));

        if (href) {
          await this.innerPageExtractor(page, href);
          // await this.innerPageExtractor(page, 'https://www.dogdrip.net/653717493');
        }
        console.log(`🚀 `, 'pageNumber', pageNumber, 'post number: ', i);
      } catch (error) {
        console.error('타임 아웃인거 같은데 내가 잡았지롱.');
        continue;
      }
    }

    const title = await page.title();

    await page.close();
    return title;
  }

  async onModuleInit() {
    console.log('DogDripService initialized - running initial scrape...');
    try {
      // Default URL to scrape when the server starts
      const defaultUrl = 'https://www.dogdrip.net/dogdrip';
      let pageNumber = 1;

      for (let i = 1; i <= 2; i++) {
        const title = await this.scrapePage(`${defaultUrl}?page=${pageNumber}`, pageNumber);
        pageNumber++;
      }
    } catch (error) {
      console.error('Error during initial scrape:', error);
    }
  }

  async onModuleDestroy() {
    if (this.browser) {
      await this.browser.close();
    }
  }
}
