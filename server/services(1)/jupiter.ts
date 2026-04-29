import axios from 'axios';

// Using DexScreener API - free and public, no auth required
const DEXSCREENER_API = 'https://api.dexscreener.com/latest/dex/tokens';

export interface JupiterTokenPrice {
  id: string;
  type: string;
  price: string;
}

export interface SolanaTokenInfo {
  address: string;
  symbol: string;
  name: string;
  decimals: number;
  logoURI?: string;
}

export interface DexScreenerPair {
  priceUsd: string;
  priceChange: {
    h24: number;
  };
  baseToken: {
    address: string;
    symbol: string;
    name: string;
  };
}

export async function getJupiterTokenPrices(tokenAddresses: string[]): Promise<Map<string, number>> {
  if (tokenAddresses.length === 0) return new Map();
  
  const prices = new Map<string, number>();
  
  // DexScreener requires individual token lookups
  for (const address of tokenAddresses) {
    try {
      const response = await axios.get(`${DEXSCREENER_API}/${address}`, {
        timeout: 10000,
      });
      
      if (response.data?.pairs && response.data.pairs.length > 0) {
        // Get the first pair's price (usually the most liquid)
        const pair = response.data.pairs[0] as DexScreenerPair;
        if (pair.priceUsd) {
          prices.set(address, parseFloat(pair.priceUsd));
        }
      }
    } catch (error) {
      console.error(`Error fetching DexScreener price for ${address}:`, error);
    }
  }
  
  return prices;
}

export async function getJupiterTokenInfo(tokenAddress: string): Promise<SolanaTokenInfo | null> {
  try {
    const response = await axios.get(`https://api.jup.ag/tokens/v1/token/${tokenAddress}`, {
      timeout: 10000,
    });
    
    if (response.data) {
      return {
        address: response.data.address,
        symbol: response.data.symbol,
        name: response.data.name,
        decimals: response.data.decimals,
        logoURI: response.data.logoURI,
      };
    }
    return null;
  } catch (error) {
    console.error('Error fetching Jupiter token info:', error);
    return null;
  }
}

export async function searchJupiterTokens(query: string): Promise<SolanaTokenInfo[]> {
  try {
    const response = await axios.get('https://api.jup.ag/tokens/v1/mints/tradable', {
      timeout: 15000,
    });
    
    if (!response.data || !Array.isArray(response.data)) {
      return [];
    }
    
    const lowerQuery = query.toLowerCase();
    const results = response.data
      .filter((token: any) => {
        const symbol = token.symbol?.toLowerCase() || '';
        const name = token.name?.toLowerCase() || '';
        const address = token.address?.toLowerCase() || '';
        return symbol.includes(lowerQuery) || name.includes(lowerQuery) || address === lowerQuery;
      })
      .slice(0, 20)
      .map((token: any) => ({
        address: token.address,
        symbol: token.symbol,
        name: token.name,
        decimals: token.decimals,
        logoURI: token.logoURI,
      }));
    
    return results;
  } catch (error) {
    console.error('Error searching Jupiter tokens:', error);
    return [];
  }
}

const HKD_USD_RATE = 7.8;

export async function getSolanaTokenPriceData(tokenAddress: string): Promise<{
  priceUsd: number;
  priceHkd: number;
  percentChange24h: number;
} | null> {
  try {
    const response = await axios.get(`${DEXSCREENER_API}/${tokenAddress}`, {
      timeout: 10000,
    });
    
    if (response.data?.pairs && response.data.pairs.length > 0) {
      const pair = response.data.pairs[0] as DexScreenerPair;
      if (pair.priceUsd) {
        const priceUsd = parseFloat(pair.priceUsd);
        return {
          priceUsd,
          priceHkd: priceUsd * HKD_USD_RATE,
          percentChange24h: pair.priceChange?.h24 || 0,
        };
      }
    }
    return null;
  } catch (error) {
    console.error('Error fetching Solana token price:', error);
    return null;
  }
}

export async function getSolanaTokenPricesWithChange(tokenAddresses: string[]): Promise<{
  coinId: string;
  priceUsd: number;
  priceHkd: number;
  marketCap: number;
  volume24h: number;
  percentChange1h: number;
  percentChange24h: number;
  percentChange7d: number;
}[]> {
  const results: {
    coinId: string;
    priceUsd: number;
    priceHkd: number;
    marketCap: number;
    volume24h: number;
    percentChange1h: number;
    percentChange24h: number;
    percentChange7d: number;
  }[] = [];

  for (const address of tokenAddresses) {
    try {
      const response = await axios.get(`${DEXSCREENER_API}/${address}`, {
        timeout: 10000,
      });
      
      if (response.data?.pairs && response.data.pairs.length > 0) {
        const pair = response.data.pairs[0];
        if (pair.priceUsd) {
          const priceUsd = parseFloat(pair.priceUsd);
          results.push({
            coinId: address,
            priceUsd,
            priceHkd: priceUsd * HKD_USD_RATE,
            marketCap: pair.fdv || 0,
            volume24h: pair.volume?.h24 || 0,
            percentChange1h: pair.priceChange?.h1 || 0,
            percentChange24h: pair.priceChange?.h24 || 0,
            percentChange7d: 0,
          });
        }
      }
    } catch (error) {
      console.error(`Error fetching DexScreener price for ${address}:`, error);
    }
  }
  
  return results;
}
