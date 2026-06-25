import { OefaScraper } from './scrapers/oefaScraper';
import { logger } from './utils/logger';

const SITE = process.argv[2] === 'dfsai' ? 'dfsai' : 'tfa';

async function main(): Promise<void> {
  logger.info('=== Magnar Scraper ===');
  logger.info(`Target: OEFA ${SITE === 'tfa' ? 'TFA' : 'DFSAI'}`);

  const scraper = new OefaScraper(SITE);

  await scraper.scrapeAll();
  scraper.saveDocuments();

  logger.info('=== Summary ===');
  logger.info(scraper.summary);
  logger.info('=== Scraper finished ===');
}

main().catch((error) => {
  logger.error('Fatal error', error instanceof Error ? error.message : String(error));
  process.exit(1);
});
