// src/dogdrip/dogdrip.service.ts
import { Injectable, OnModuleDestroy, OnModuleInit, Logger } from '@nestjs/common';
import puppeteerExtra from 'puppeteer-extra';
import StealthPlugin = require('puppeteer-extra-plugin-stealth');
import * as puppeteer from 'puppeteer';
import AdblockerPlugin from 'puppeteer-extra-plugin-adblocker';
import { writeFileSync } from 'fs';
import { PrismaService } from 'src/prisma.service';
import { parseRelativeKoreanTime } from 'src/util/date';
import { log } from 'util';

// Configure puppeteer with plugins
puppeteerExtra.use(StealthPlugin());
puppeteerExtra.use(AdblockerPlugin({ blockTrackers: true }));

interface PostData {
  link: string;
  author: string;
  title: string;
  textContent: string;
  htmlContent?: string;
  disLike: number;
  likes: number;
  registeredAt: Date;
}

@Injectable()
export class DogDripService implements OnModuleDestroy, OnModuleInit {
  private readonly logger = new Logger(DogDripService.name);
  private browser: puppeteer.Browser;
  private readonly BASE_URL = 'https://www.dogdrip.net/dogdrip';
  private readonly MAX_RETRIES = 3;
  private readonly RETRY_DELAY = 2000; // 2 seconds

  constructor(private prisma: PrismaService) {}

  /**
   * Get or initialize the browser instance
   */
  async getBrowser(): Promise<puppeteer.Browser> {
    if (!this.browser) {
      this.browser = await puppeteerExtra.launch({
        headless: true, // change to false for debugging
        args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage', '--disable-accelerated-2d-canvas', '--disable-gpu'],
        defaultViewport: { width: 1366, height: 768 },
      });
    }
    return this.browser;
  }

  /**
   * Extract data from a single post page
   * @param page - Puppeteer page instance
   * @param url - URL of the post to extract
   * @param retryCount - Number of retries attempted
   */
  async extractPostData(page: puppeteer.Page, url: string, retryCount = 0): Promise<PostData | null> {
    try {
      // Navigate to the post page
      await page.goto(url, {
        waitUntil: 'networkidle2',
        timeout: 30000,
      });

      // Wait for the content to load
      await page.waitForSelector(
        '#main > div > div.eq.section.secontent.background-color-content > div > div:nth-child(3) > div:nth-child(1)',
        {
          visible: true,
          timeout: 10000,
        },
      );

      // Extract post data using page.evaluate
      const postData = await page.evaluate(() => {
        // Helper function to safely extract text content
        const getText = (selector: string): string => {
          const element = document.querySelector(selector);
          return element?.textContent?.trim() || '';
        };

        // Extract post details
        const title = getText(
          '#main > div > div > div > div:nth-child(3) > div:nth-child(1) > div > div.ed.article-head.margin-bottom-large > h4 > a',
        );
        const timeStamp = getText(
          '#main > div > div > div > div:nth-child(3) > div:nth-child(1) > div > div.ed.article-head.margin-bottom-large > div.ed.flex.flex-wrap.flex-left.flex-middle.title-toolbar > div.ed.flex.flex-wrap > span:nth-child(2) > span:nth-child(2)',
        );
        const author = getText(
          '#main > div > div > div > div:nth-child(3) > div:nth-child(1) > div > div.ed.article-head.margin-bottom-large > div.ed.flex.flex-wrap.flex-left.flex-middle.title-toolbar > div.ed.flex.flex-wrap > span:nth-child(1) > a',
        );
        const votedCount = getText('#document_voted_count');
        const disLike = getText('#document_blamed_count').replace('-', '');

        // Get content and remove vote elements
        const contentElement = document.querySelector(
          '#main > div > div > div > div:nth-child(3) > div:nth-child(1) > div > div.ed.clearfix.margin-vertical-large > div.rhymix_content.xe_content',
        );
        const addon = contentElement?.querySelector('.addon_addvote');
        if (addon) {
          addon.remove();
        }

        const textContent = contentElement?.textContent?.trim() || '';
        const htmlContent = contentElement?.innerHTML || '';

        return {
          title,
          timeStamp,
          author,
          votedCount,
          disLike,
          textContent,
          htmlContent,
        };
      });

      // Save the post data to the database
      const creation = await this.prisma.dogDrip.create({
        data: {
          link: url,
          author: postData.author || 'Unknown',
          title: postData.title || 'No Title',
          textContent: postData.textContent || '',
          htmlContent: postData.htmlContent || '',
          disLike: parseInt(postData.disLike || '0', 10),
          likes: parseInt(postData.votedCount || '0', 10),
          registeredAt: parseRelativeKoreanTime(postData.timeStamp || ''),
        },
      });

      this.logger.log(`Successfully extracted post: ${postData.title}`);
      return creation;
    } catch (error) {
      this.logger.error(`Error extracting post data from ${url}: ${error.message}`);

      // Retry logic
      if (retryCount < this.MAX_RETRIES) {
        this.logger.warn(`Retrying extraction for ${url} (Attempt ${retryCount + 1}/${this.MAX_RETRIES})`);
        await new Promise((resolve) => setTimeout(resolve, this.RETRY_DELAY));
        return this.extractPostData(page, url, retryCount + 1);
      }

      return null;
    }
  }

  /**
   * Scrape a single page of posts
   * @param pageNumber - The page number to scrape
   * @returns Statistics about the processed posts
   */
  async scrapePage(pageNumber: number): Promise<{ postsProcessed: number; postsFailed: number; postTimes: number[] }> {
    const browser = await this.getBrowser();
    const page = await browser.newPage();
    
    // Initialize statistics
    const pageStats = {
      postsProcessed: 0,
      postsFailed: 0,
      postTimes: [] as number[],
    };

    try {
      // Set user agent to avoid detection
      await page.setUserAgent(
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
      );

      // Navigate to the page
      const url = `${this.BASE_URL}?page=${pageNumber}`;
      this.logger.log(`Navigating to page ${pageNumber}: ${url}`);

      await page.goto(url, {
        waitUntil: 'networkidle2',
        timeout: 30000,
      });

      // Wait for the post list to load
      await page.waitForSelector('#main > div > div > div > div.ed.board-list > ul > li', {
        visible: true,
        timeout: 10000,
      });

      // Get all post links on the page
      const postLinks = await page.evaluate(() => {
        const links: string[] = [];
        const postElements = document.querySelectorAll('#main > div > div > div > div.ed.board-list > ul > li > a');

        postElements.forEach((element) => {
          const href = element.getAttribute('href');
          if (href && !href.includes('javascript:')) {
            links.push(href);
          }
        });

        return links.filter((link) => link.includes('https://'));
      });

      this.logger.log(`Found ${postLinks.length} posts on page ${pageNumber}`);

      // Process each post link
      for (let i = 0; i < postLinks.length; i++) {
        const link = postLinks[i];
        if (!link) continue;

        const postTimerLabel = `post-${pageNumber}-${i+1}`;
        console.time(postTimerLabel);
        const postStartTime = Date.now();

        try {
          this.logger.log(`Processing post ${i + 1}/${postLinks.length} on page ${pageNumber}`);
          await this.extractPostData(page, link);

          const postEndTime = Date.now();
          const postDuration = (postEndTime - postStartTime) / 1000; // Convert to seconds
          console.timeEnd(postTimerLabel);
          this.logger.log(`Post ${i + 1}/${postLinks.length} processed in ${postDuration.toFixed(2)} seconds`);
          
          // Update statistics
          pageStats.postsProcessed++;
          pageStats.postTimes.push(postDuration);

          // Add a small delay between requests to avoid being blocked
          await new Promise((resolve) => setTimeout(resolve, Math.random() * 1000));
        } catch (error) {
          console.timeEnd(postTimerLabel);
          this.logger.error(`Error processing post ${link}: ${error.message}`);
          pageStats.postsFailed++;
          continue;
        }
      }
    } catch (error) {
      this.logger.error(`Error scraping page ${pageNumber}: ${error.message}`);
    } finally {
      await page.close();
    }
    
    // Calculate and log page statistics
    const avgPostTime = pageStats.postTimes.length > 0 
      ? pageStats.postTimes.reduce((sum, time) => sum + time, 0) / pageStats.postTimes.length 
      : 0;
      
    this.logger.log(`Page ${pageNumber} statistics:`);
    this.logger.log(`- Posts processed: ${pageStats.postsProcessed}`);
    this.logger.log(`- Posts failed: ${pageStats.postsFailed}`);
    this.logger.log(`- Average time per post: ${avgPostTime.toFixed(2)} seconds`);
    
    return pageStats;
  }

  /**
   * Crawl multiple pages
   * @param startPage - The page to start crawling from
   * @param endPage - The page to end crawling at
   */
  async crawlPages(startPage: number = 1, endPage: number = 5): Promise<void> {
    this.logger.log(`Starting crawl from page ${startPage} to ${endPage}`);
    
    const totalStartTime = Date.now();
    const crawlStats = {
      totalPages: 0,
      totalPosts: 0,
      failedPages: 0,
      failedPosts: 0,
      pageTimes: [] as number[],
    };
    
    console.time('total-crawl-time');

    for (let pageNumber = startPage; pageNumber <= endPage; pageNumber++) {
      const timerLabel = `page-${pageNumber}-crawl`;
      console.time(timerLabel);
      const startTime = Date.now();
      
      try {
        const pageStats = await this.scrapePage(pageNumber);
        const endTime = Date.now();
        const duration = (endTime - startTime) / 1000; // Convert to seconds
        
        console.timeEnd(timerLabel);
        this.logger.log(`Completed scraping page ${pageNumber} in ${duration.toFixed(2)} seconds`);
        
        // Update statistics
        crawlStats.totalPages++;
        crawlStats.totalPosts += pageStats?.postsProcessed || 0;
        crawlStats.failedPosts += pageStats?.postsFailed || 0;
        crawlStats.pageTimes.push(duration);
        
        // Add delay between pages to avoid being blocked
        if (pageNumber < endPage) {
          await new Promise((resolve) => setTimeout(resolve, Math.random() * 250));
        }
      } catch (error) {
        console.timeEnd(timerLabel);
        this.logger.error(`Error crawling page ${pageNumber}: ${error.message}`);
        crawlStats.failedPages++;
      }
    }
    
    // Calculate and log statistics
    const totalEndTime = Date.now();
    const totalDuration = (totalEndTime - totalStartTime) / 1000;
    console.timeEnd('total-crawl-time');
    
    const avgPageTime = crawlStats.pageTimes.length > 0 
      ? crawlStats.pageTimes.reduce((sum, time) => sum + time, 0) / crawlStats.pageTimes.length 
      : 0;
      
    this.logger.log('Crawling completed successfully');
    this.logger.log('-----------------------------------');
    this.logger.log('CRAWLING STATISTICS:');
    this.logger.log(`Total duration: ${totalDuration.toFixed(2)} seconds`);
    this.logger.log(`Pages processed: ${crawlStats.totalPages} (${crawlStats.failedPages} failed)`);
    this.logger.log(`Posts processed: ${crawlStats.totalPosts} (${crawlStats.failedPosts} failed)`);
    this.logger.log(`Average time per page: ${avgPageTime.toFixed(2)} seconds`);
    this.logger.log(`Average time per post: ${crawlStats.totalPosts > 0 ? (totalDuration / crawlStats.totalPosts).toFixed(2) : 0} seconds`);
    this.logger.log('-----------------------------------');
  }

  /**
   * Initialize the service and start crawling
   */
  async onModuleInit() {
    this.logger.log('DogDripService initialized - running initial scrape...');
    try {
      // Start crawling from page 1 to page 3 by default
      await this.crawlPages(1, 10000000);
    } catch (error) {
      this.logger.error(`Error during initial scrape: ${error.message}`);
    }
  }

  /**
   * Clean up resources when the module is destroyed
   */
  async onModuleDestroy() {
    if (this.browser) {
      this.logger.log('Closing browser instance');
      await this.browser.close();
    }
  }
}
