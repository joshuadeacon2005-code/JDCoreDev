import axios from 'axios';

const COINGECKO_BASE_URL = 'https://api.coingecko.com/api/v3';

export interface CoinPrice {
  coinId: string;
  priceUsd: number;
  priceHkd: number;
  marketCap: number;
  volume24h: number;
  percentChange1h: number;
  percentChange24h: number;
  percentChange7d: number;
}

export interface CoinSearchResult {
  id: string;
  symbol: string;
  name: string;
  thumb: string;
  large: string;
}

export interface CoinDetails {
  id: string;
  symbol: string;
  name: string;
  iconUrl: string;
  description: string;
}

export async function searchCoins(query: string): Promise<CoinSearchResult[]> {
  try {
    const response = await axios.get(`${COINGECKO_BASE_URL}/search`, {
      params: { query },
      timeout: 10000,
    });
    return response.data.coins.slice(0, 20).map((coin: any) => ({
      id: coin.id,
      symbol: coin.symbol.toUpperCase(),
      name: coin.name,
      thumb: coin.thumb,
      large: coin.large,
    }));
  } catch (error) {
    console.error('Error searching coins:', error);
    throw new Error('Failed to search coins');
  }
}

export async function getCoinPrices(coinIds: string[]): Promise<CoinPrice[]> {
  if (coinIds.length === 0) return [];
  
  try {
    const response = await axios.get(`${COINGECKO_BASE_URL}/simple/price`, {
      params: {
        ids: coinIds.join(','),
        vs_currencies: 'usd,hkd',
        include_market_cap: true,
        include_24hr_vol: true,
        include_24hr_change: true,
        include_1hr_change: true,
        include_7d_change: true,
      },
      timeout: 10000,
    });

    return Object.entries(response.data).map(([coinId, data]: [string, any]) => ({
      coinId,
      priceUsd: data.usd || 0,
      priceHkd: data.hkd || 0,
      marketCap: data.usd_market_cap || 0,
      volume24h: data.usd_24h_vol || 0,
      percentChange1h: data.usd_1h_change || 0,
      percentChange24h: data.usd_24h_change || 0,
      percentChange7d: data.usd_7d_change || 0,
    }));
  } catch (error) {
    console.error('Error fetching coin prices:', error);
    throw new Error('Failed to fetch coin prices');
  }
}

export async function getCoinDetails(coinId: string): Promise<CoinDetails> {
  try {
    const response = await axios.get(`${COINGECKO_BASE_URL}/coins/${coinId}`, {
      params: {
        localization: false,
        tickers: false,
        market_data: false,
        community_data: false,
        developer_data: false,
      },
      timeout: 10000,
    });
    
    return {
      id: response.data.id,
      symbol: response.data.symbol.toUpperCase(),
      name: response.data.name,
      iconUrl: response.data.image?.large || response.data.image?.small || '',
      description: response.data.description?.en || '',
    };
  } catch (error) {
    console.error('Error fetching coin details:', error);
    throw new Error('Failed to fetch coin details');
  }
}

export async function getCoinMarketChart(coinId: string, days: number = 7): Promise<{ timestamp: number; price: number }[]> {
  try {
    const response = await axios.get(`${COINGECKO_BASE_URL}/coins/${coinId}/market_chart`, {
      params: {
        vs_currency: 'usd',
        days,
      },
      timeout: 10000,
    });
    
    return response.data.prices.map(([timestamp, price]: [number, number]) => ({
      timestamp,
      price,
    }));
  } catch (error) {
    console.error('Error fetching market chart:', error);
    throw new Error('Failed to fetch market chart');
  }
}
