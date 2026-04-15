import axios from 'axios';

export interface NewsArticle {
  title: string;
  description: string;
  url: string;
  sourceName: string;
  author: string | null;
  imageUrl: string | null;
  publishedAt: Date;
}

export async function fetchCoinNews(coinSymbol: string, coinName: string, limit: number = 10): Promise<NewsArticle[]> {
  try {
    const response = await axios.get('https://newsdata.io/api/1/news', {
      params: {
        apikey: process.env.NEWSDATA_API_KEY,
        q: `${coinName} OR ${coinSymbol} cryptocurrency`,
        language: 'en',
        category: 'business,technology',
      },
      timeout: 10000,
    });
    
    if (response.data.results) {
      return response.data.results.slice(0, limit).map((article: any) => ({
        title: article.title || 'Untitled',
        description: article.description || article.title || '',
        url: article.link || '',
        sourceName: article.source_id || 'Unknown',
        author: article.creator?.[0] || null,
        imageUrl: article.image_url || null,
        publishedAt: new Date(article.pubDate || Date.now()),
      }));
    }
    
    return [];
  } catch (error) {
    console.error('Error fetching news from NewsData:', error);
    return fetchCoinNewsFallback(coinName, coinSymbol, limit);
  }
}

async function fetchCoinNewsFallback(coinName: string, coinSymbol: string, limit: number): Promise<NewsArticle[]> {
  try {
    const response = await axios.get(`https://api.coingecko.com/api/v3/coins/${coinName.toLowerCase()}/status_updates`, {
      timeout: 10000,
    });
    
    if (response.data.status_updates) {
      return response.data.status_updates.slice(0, limit).map((update: any) => ({
        title: update.project?.name || coinName,
        description: update.description || '',
        url: update.project?.links?.homepage?.[0] || '',
        sourceName: 'CoinGecko',
        author: update.user || null,
        imageUrl: update.project?.image?.small || null,
        publishedAt: new Date(update.created_at || Date.now()),
      }));
    }
    
    return [];
  } catch (error) {
    console.error('Error fetching fallback news:', error);
    return [];
  }
}

export async function searchCryptoNews(query: string, limit: number = 20): Promise<NewsArticle[]> {
  try {
    const response = await axios.get('https://newsdata.io/api/1/news', {
      params: {
        apikey: process.env.NEWSDATA_API_KEY,
        q: `${query} cryptocurrency bitcoin ethereum`,
        language: 'en',
        category: 'business,technology',
      },
      timeout: 10000,
    });
    
    if (response.data.results) {
      return response.data.results.slice(0, limit).map((article: any) => ({
        title: article.title || 'Untitled',
        description: article.description || article.title || '',
        url: article.link || '',
        sourceName: article.source_id || 'Unknown',
        author: article.creator?.[0] || null,
        imageUrl: article.image_url || null,
        publishedAt: new Date(article.pubDate || Date.now()),
      }));
    }
    
    return [];
  } catch (error) {
    console.error('Error searching crypto news:', error);
    return [];
  }
}
