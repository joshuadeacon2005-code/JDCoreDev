import cron from 'node-cron';
import { db } from '../db';
import { trackedCoins, priceAlerts, priceHistory, cryptoNotificationSettings } from '@shared/schema';
import { eq, and } from 'drizzle-orm';
import { getCoinPrices } from './coingecko';
import { getSolanaTokenPricesWithChange } from './jupiter';
import { sendSMS, sendWhatsApp } from './twilio-crypto';

let isRunning = false;

export function startPriceMonitoring() {
  cron.schedule('*/5 * * * *', async () => {
    if (isRunning) {
      console.log('Price check already in progress, skipping...');
      return;
    }
    
    console.log('Running price check...');
    isRunning = true;
    
    try {
      await checkPrices();
    } catch (error) {
      console.error('Error in price monitoring:', error);
    } finally {
      isRunning = false;
    }
  });
  
  console.log('Price monitoring started - running every 5 minutes');
}

async function checkPrices() {
  try {
    const coins = await db.select()
      .from(trackedCoins)
      .where(eq(trackedCoins.isActive, true));
    
    if (coins.length === 0) {
      console.log('No active coins to track');
      return;
    }
    
    const coingeckoCoins = coins.filter(c => c.blockchain === "coingecko" || !c.blockchain);
    const solanaCoins = coins.filter(c => c.blockchain === "solana");
    
    const allPrices: { coinId: string; priceUsd: number; priceHkd: number; marketCap: number; volume24h: number; percentChange1h: number; percentChange24h: number; percentChange7d: number }[] = [];
    
    if (coingeckoCoins.length > 0) {
      const coingeckoIds = coingeckoCoins.map(c => c.coinId);
      const coingeckoPrices = await getCoinPrices(coingeckoIds);
      allPrices.push(...coingeckoPrices);
    }
    
    if (solanaCoins.length > 0) {
      const solanaAddresses = solanaCoins.map(c => c.coinId);
      const solanaPrices = await getSolanaTokenPricesWithChange(solanaAddresses);
      allPrices.push(...solanaPrices);
    }
    
    for (const price of allPrices) {
      await db.insert(priceHistory).values({
        coinId: price.coinId,
        priceUsd: price.priceUsd.toString(),
        priceHkd: price.priceHkd.toString(),
        marketCap: price.marketCap.toString(),
        volume24h: price.volume24h.toString(),
        percentChange1h: price.percentChange1h.toString(),
        percentChange24h: price.percentChange24h.toString(),
        percentChange7d: price.percentChange7d.toString(),
      });
    }
    
    console.log(`Recorded prices for ${allPrices.length} coins`);
    
    await checkAlerts(allPrices);
    
  } catch (error) {
    console.error('Error checking prices:', error);
  }
}

async function checkAlerts(prices: { coinId: string; priceUsd: number; percentChange24h: number }[]) {
  const activeAlerts = await db.select()
    .from(priceAlerts)
    .where(eq(priceAlerts.status, 'active'));
  
  for (const alert of activeAlerts) {
    const priceData = prices.find(p => p.coinId === alert.coinId);
    if (!priceData) continue;
    
    let shouldTrigger = false;
    const currentPrice = priceData.priceUsd;
    
    switch (alert.alertType) {
      case 'price_above':
        shouldTrigger = currentPrice > Number(alert.targetPrice);
        break;
      case 'price_below':
        shouldTrigger = currentPrice < Number(alert.targetPrice);
        break;
      case 'percent_increase':
        shouldTrigger = priceData.percentChange24h > Number(alert.percentChange);
        break;
      case 'percent_decrease':
        shouldTrigger = priceData.percentChange24h < -Number(alert.percentChange);
        break;
    }
    
    if (shouldTrigger && !alert.notificationSent) {
      await triggerAlert(alert, currentPrice, priceData);
    }
  }
}

async function triggerAlert(alert: any, currentPrice: number, priceData: any) {
  await db.update(priceAlerts)
    .set({
      status: 'triggered',
      triggeredAt: new Date(),
      triggerPrice: currentPrice.toString(),
      notificationSent: true,
      updatedAt: new Date(),
    })
    .where(eq(priceAlerts.id, alert.id));
  
  const coin = await db.select()
    .from(trackedCoins)
    .where(eq(trackedCoins.coinId, alert.coinId))
    .limit(1);
  
  if (!coin.length) return;
  
  const message = formatAlertMessage(alert, coin[0], currentPrice, priceData);
  
  const settings = await db.select()
    .from(cryptoNotificationSettings)
    .limit(1);
  
  const config = settings[0];
  if (!config) {
    console.log('No notification settings configured');
    return;
  }
  
  try {
    if (alert.notifySms && config.enableSms && config.recipientPhoneNumber) {
      await sendSMS(message, config.recipientPhoneNumber, config.quietHoursStart, config.quietHoursEnd);
    }
    if (alert.notifyWhatsapp && config.enableWhatsapp && config.recipientWhatsappNumber) {
      await sendWhatsApp(message, config.recipientWhatsappNumber, config.quietHoursStart, config.quietHoursEnd);
    }
    console.log(`Alert triggered for ${coin[0].symbol}: ${alert.alertType}`);
  } catch (error) {
    console.error('Error sending notification:', error);
  }
}

function formatAlertMessage(alert: any, coin: any, currentPrice: number, priceData: any): string {
  const symbol = coin.symbol;
  const name = coin.name;
  const change24h = priceData.percentChange24h.toFixed(2);
  
  let message = `🚨 ${name} (${symbol}) Alert!\n\n`;
  
  switch (alert.alertType) {
    case 'price_above':
      message += `Price is now $${currentPrice.toFixed(2)}, above your target of $${Number(alert.targetPrice).toFixed(2)}`;
      break;
    case 'price_below':
      message += `Price is now $${currentPrice.toFixed(2)}, below your target of $${Number(alert.targetPrice).toFixed(2)}`;
      break;
    case 'percent_increase':
      message += `Price increased ${change24h}% in the last 24h (target: ${alert.percentChange}%)`;
      break;
    case 'percent_decrease':
      message += `Price decreased ${change24h}% in the last 24h (target: ${alert.percentChange}%)`;
      break;
  }
  
  message += `\n\nCurrent Price: $${currentPrice.toFixed(2)} USD`;
  message += `\n24h Change: ${change24h}%`;
  
  if (alert.label) {
    message += `\n\nNote: ${alert.label}`;
  }
  
  return message;
}

export async function manualPriceCheck() {
  await checkPrices();
}
