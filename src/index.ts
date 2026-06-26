import { OefaScraper } from './scrapers/oefaScraper';
import { JurisprudenciaScraper } from './scrapers/jurisprudenciaScraper';
import { logger } from './utils/logger';

const TARGET = process.argv[2] || 'tfa';

async function main(): Promise<void> {
  if (TARGET === 'jurisprudencia') {
    logger.info('=== Magnar Scraper - Jurisprudencia PJ ===');
    const scraper = new JurisprudenciaScraper();
    await scraper.scrapeAll();
    return;
  }

  const site = TARGET === 'dfsai' ? 'dfsai' : 'tfa';
  logger.info(`=== Magnar Scraper - OEFA ${site.toUpperCase()} ===`);
  const scraper = new OefaScraper(site);
  await scraper.scrapeAll();
  scraper.saveDocuments();
  logger.info(scraper.summary);
  logger.info('=== Scraper finished ===');
}

main().catch((error) => {
  logger.error('Fatal error', error instanceof Error ? error.message : String(error));
  process.exit(1);
});
