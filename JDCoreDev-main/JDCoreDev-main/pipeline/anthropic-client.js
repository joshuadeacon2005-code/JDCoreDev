/**
 * Anthropic Claude API client
 * Used for outreach generation AND auditing (with web_search tool).
 * Perplexity handles discovery only (see claude-client.js).
 */

const ANTHROPIC_API_URL = 'https://api.anthropic.com/v1/messages';
const MODEL = 'claude-sonnet-4-5';

export async function callAnthropic(prompt, useWebSearch = false) {
  const body = {
    model: MODEL,
    max_tokens: 4096,
    messages: [{ role: 'user', content: prompt }],
  };

  if (useWebSearch) {
    body.tools = [{ type: 'web_search_20250305', name: 'web_search' }];
  }

  const response = await fetch(ANTHROPIC_API_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': process.env.ANTHROPIC_API_KEY,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const err = await response.text();
    throw new Error(`Anthropic API error ${response.status}: ${err}`);
  }

  const data = await response.json();

  // Collect all text blocks — web_search results interleave tool_result blocks,
  // we only want the final text output from Claude.
  const text = (data.content || [])
    .filter(block => block.type === 'text')
    .map(block => block.text)
    .join('');

  if (!text) throw new Error('Anthropic returned no text content');
  return text;
}
