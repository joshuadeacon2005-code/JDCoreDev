/**
 * Anthropic Claude API client for the lead engine pipeline.
 *
 * Lead discovery uses web_search_20250305 which requires a full Anthropic API key
 * (sk-ant-...) with web search access. The Replit-managed integration key does not
 * support web search, so we prefer ANTHROPIC_API_KEY for this module, falling back
 * to the integration key for non-search calls if no direct key is set.
 *
 * Used for lead discovery (with web_search), audit, and outreach generation.
 */

import Anthropic from '@anthropic-ai/sdk';

// Use the direct Anthropic key — required for web_search_20250305 tool access.
const apiKey = process.env.ANTHROPIC_API_KEY || process.env.AI_INTEGRATIONS_ANTHROPIC_API_KEY;

const anthropic = new Anthropic({ apiKey });

const MODEL = 'claude-sonnet-4-5';

export async function callAnthropic(prompt, useWebSearch = false) {
  const params = {
    model: MODEL,
    max_tokens: 4096,
    messages: [{ role: 'user', content: prompt }],
  };

  if (useWebSearch) {
    params.tools = [{ type: 'web_search_20250305', name: 'web_search' }];
  }

  const data = await anthropic.messages.create(params);

  // Collect all text blocks — web_search results interleave tool_result blocks,
  // we only want the final text output from Claude.
  const text = (data.content || [])
    .filter(block => block.type === 'text')
    .map(block => block.text)
    .join('');

  if (!text) throw new Error('Anthropic returned no text content');
  return text;
}
