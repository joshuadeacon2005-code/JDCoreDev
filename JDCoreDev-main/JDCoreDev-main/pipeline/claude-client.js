/**
 * Perplexity Sonar Pro API client
 * Used for Stage 1 (lead discovery) only.
 * Sonar Pro has real-time web search built in and is much more thorough
 * than the base sonar model for finding specific local businesses.
 *
 * Stage 2 (audit) uses Claude + web_search via anthropic-client.js
 * for more reliable website and Google Business Profile detection.
 */

const PERPLEXITY_API_URL = 'https://api.perplexity.ai/chat/completions';
const MODEL = 'sonar-pro';

export async function callClaude(prompt, useWebSearch = false) {
  const response = await fetch(PERPLEXITY_API_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${process.env.PERPLEXITY_API_KEY}`,
    },
    body: JSON.stringify({
      model: MODEL,
      messages: [{ role: 'user', content: prompt }],
      search_recency_filter: 'month',
    }),
  });

  if (!response.ok) {
    const err = await response.text();
    throw new Error(`Perplexity API error ${response.status}: ${err}`);
  }

  const data = await response.json();
  const text = data.choices?.[0]?.message?.content;

  if (!text) throw new Error('Perplexity returned no content');
  return text;
}
