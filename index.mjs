// index.mjs

const HN_TOP_STORIES_URL = 'https://hacker-news.firebaseio.com/v0/topstories.json';
const HN_ITEM_URL = id => `https://hacker-news.firebaseio.com/v0/item/${id}.json`;
const SLACK_WEBHOOK_URL = process.env.SLACK_WEBHOOK_URL;

// Keywords to detect AI-related posts - focused on new tools, GPT updates, and latest AI developments
const KEYWORDS = [
    // Core AI terms (excluding ML/neural net research)
    'ai',
    'artificial intelligence',
    'generative ai',
    'gen ai',
    'llm',
    'large language model',
    
    // GPT & OpenAI updates
    'gpt-',
    'gpt-4',
    'gpt-3',
    'gpt-5',
    'o1',
    'o3',
    'chatgpt',
    'openai',
    'gpt store',
    'custom gpt',
    'gpts',
    
    // Major AI companies & models
    'anthropic',
    'claude',
    'mistral',
    'llama',
    'gemini',
    'google ai',
    'meta ai',
    'perplexity',
    
    // AI tools & platforms
    'ai tool',
    'ai app',
    'ai platform',
    'ai agent',
    'ai assistant',
    'ai copilot',
    'cursor',
    'github copilot',
    'midjourney',
    'dall-e',
    'stable diffusion',
    'sora',
    'runway',
    
    // Update & release keywords
    'new ai',
    'ai update',
    'ai release',
    'ai launch',
    'ai announcement',
    'ai news',
    
    // Advanced AI concepts (practical applications)
    'multimodal',
    'autonomous agent',
    'reasoning',
    'state of ai',
];

/**
 * Calculate AI relevance score for a story
 * Returns a score from 0-100, where higher = more AI-relevant
 */
function calculateAiRelevanceScore(title = '', url = '') {
    const text = (title + ' ' + url).toLowerCase();
    
    // Strong AI signals (high weight)
    const strongSignals = [
        'gpt-', 'chatgpt', 'openai', 'anthropic', 'claude',
        'llm', 'large language model', 'gemini', 'mistral', 'llama',
        'perplexity', 'midjourney', 'dall-e', 'sora', 'runway',
        'cursor', 'github copilot', 'ai copilot',
        'artificial intelligence', 'generative ai', 'gen ai',
        'ai tool', 'ai app', 'ai platform', 'ai agent', 'ai assistant'
    ];
    
    // Medium AI signals
    const mediumSignals = [
        'ai update', 'ai release', 'ai launch', 'ai announcement',
        'multimodal', 'autonomous agent', 'reasoning'
    ];
    
    // Weak AI signals (can have false positives)
    const weakSignals = ['ai', 'machine learning', 'ml', 'deep learning'];
    
    let score = 0;
    
    // Check strong signals (worth 30 points each)
    for (const signal of strongSignals) {
        if (text.includes(signal.toLowerCase())) {
            score += 30;
            // If we have a strong signal, we're confident it's AI-related
            if (score >= 30) return Math.min(100, score);
        }
    }
    
    // Check medium signals (worth 15 points each)
    for (const signal of mediumSignals) {
        if (text.includes(signal.toLowerCase())) {
            score += 15;
        }
    }
    
    // Check weak signals (worth 5 points each, but require word boundaries for "ai")
    for (const signal of weakSignals) {
        if (signal === 'ai') {
            // Use word boundary regex to avoid false positives like "said", "paid", etc.
            const aiRegex = /\bai\b/i;
            if (aiRegex.test(text)) {
                score += 5;
            }
        } else if (text.includes(signal.toLowerCase())) {
            score += 5;
        }
    }
    
    return Math.min(100, score);
}

/**
 * Check if story is AI-related (score threshold)
 */
function isAiRelated(title = '', url = '') {
    return calculateAiRelevanceScore(title, url) >= 10;
} 

async function fetchTopStoriesIds(limit = 80) {
  const res = await fetch(HN_TOP_STORIES_URL);
  const ids = await res.json();
  return ids.slice(0, limit);
}

async function fetchItem(id) {
  const res = await fetch(HN_ITEM_URL(id));
  return res.json();
}

async function getAiStories() {
  const ids = await fetchTopStoriesIds(100);
  const items = await Promise.all(ids.map(fetchItem));
  
  // Filter for recent stories only (last 24 hours for daily updates)
  const now = Math.floor(Date.now() / 1000);
  const twentyFourHoursAgo = now - (24 * 60 * 60);
  
  // Calculate relevance scores and filter
  const scoredStories = items
    .map(item => {
      if (!item?.title) return null;
      
      const relevanceScore = calculateAiRelevanceScore(item.title, item.url);
      const isRecent = !item.time || item.time >= twentyFourHoursAgo;
      
      return {
        ...item,
        relevanceScore,
        isRecent,
      };
    })
    .filter(item => {
      if (!item) return false;
      // Must have minimum relevance score
      if (item.relevanceScore < 10) return false;
      // Must be recent (within last 24 hours)
      if (!item.isRecent) return false;
      return true;
    })
    .sort((a, b) => {
      // Primary: Relevance score (higher = more AI-focused)
      const relevanceDiff = b.relevanceScore - a.relevanceScore;
      if (Math.abs(relevanceDiff) > 5) return relevanceDiff;
      
      // Secondary: HN score (trending stories)
      const scoreDiff = (b.score || 0) - (a.score || 0);
      if (scoreDiff !== 0) return scoreDiff;
      
      // Tertiary: Recency (newer stories first)
      return (b.time || 0) - (a.time || 0);
    });
  
  return scoredStories.slice(0, 5);
}

function toHnUrl(item) {
  return item.url || `https://news.ycombinator.com/item?id=${item.id}`;
}

function getDomain(url) {
  if (!url) return 'news.ycombinator.com';
  try {
    const domain = new URL(url).hostname.replace('www.', '');
    return domain;
  } catch {
    return 'news.ycombinator.com';
  }
}

async function fetchMetadata(url) {
  if (!url || url.startsWith('https://news.ycombinator.com')) {
    return { image: null, description: null };
  }

  try {
    // Fetch with timeout
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 3000); // 3 second timeout
    
    const res = await fetch(url, {
      signal: controller.signal,
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; SlackBot/1.0)',
      },
    });
    
    clearTimeout(timeoutId);
    
    if (!res.ok) return { image: null, description: null };
    
    const html = await res.text();
    
    // Extract Open Graph image
    const ogImageMatch = html.match(/<meta\s+property=["']og:image["']\s+content=["']([^"']+)["']/i) ||
                         html.match(/<meta\s+name=["']twitter:image["']\s+content=["']([^"']+)["']/i);
    const image = ogImageMatch ? ogImageMatch[1] : null;
    
    // Extract Open Graph description
    const ogDescMatch = html.match(/<meta\s+property=["']og:description["']\s+content=["']([^"']+)["']/i) ||
                        html.match(/<meta\s+name=["']description["']\s+content=["']([^"']+)["']/i) ||
                        html.match(/<meta\s+name=["']twitter:description["']\s+content=["']([^"']+)["']/i);
    let description = ogDescMatch ? ogDescMatch[1] : null;
    
    // Clean up description (remove HTML entities, limit length)
    if (description) {
      description = description
        .replace(/&quot;/g, '"')
        .replace(/&amp;/g, '&')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&#39;/g, "'")
        .trim();
      
      // Limit to 200 characters
      if (description.length > 200) {
        description = description.substring(0, 197) + '...';
      }
    }
    
    return { image, description };
  } catch (error) {
    // Silently fail - return no metadata
    return { image: null, description: null };
  }
}

async function formatSlackBlocks(stories) {
  const today = new Date().toLocaleDateString('en-IN', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });

  const blocks = [
    {
      type: 'header',
      text: {
        type: 'plain_text',
        text: `🤖 Daily AI Updates & New Tools — ${today}`,
        emoji: true,
      },
    },
    {
      type: 'divider',
    },
  ];

  if (!stories.length) {
    blocks.push({
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: 'No AI-related stories found today.',
      },
    });
    return blocks;
  }

  // Fetch metadata for all stories in parallel with timeout
  const metadataPromises = stories.map(story => 
    Promise.race([
      fetchMetadata(toHnUrl(story)),
      new Promise(resolve => setTimeout(() => resolve({ image: null, description: null }), 5000))
    ])
  );
  
  let metadataList;
  try {
    metadataList = await Promise.all(metadataPromises);
  } catch (error) {
    console.error('Error fetching metadata, continuing without it:', error.message);
    metadataList = stories.map(() => ({ image: null, description: null }));
  }

  stories.forEach((story, index) => {
    const url = toHnUrl(story);
    const domain = getDomain(story.url);
    const metadata = metadataList[index];
    
    // Build text with title and domain
    let text = `*${index + 1}. ${story.title}*\n<${url}|${domain}>`;
    
    // Add description if available
    if (metadata.description) {
      text += `\n_${metadata.description}_`;
    }
    
    // Create section block
    const sectionBlock = {
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: text,
      },
    };
    
    // Add image as accessory if available (Slack webhooks support this better)
    if (metadata.image) {
      sectionBlock.accessory = {
        type: 'image',
        image_url: metadata.image,
        alt_text: story.title,
      };
    }
    
    blocks.push(sectionBlock);
    
    // Add divider between items (except after last one)
    if (index < stories.length - 1) {
      blocks.push({
        type: 'divider',
      });
    }
  });

  return blocks;
}

// Keep text format as fallback (not used, but kept for reference)
function formatSlackText(stories) {
  const today = new Date().toLocaleDateString('en-IN', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });

  if (!stories.length)
    return `🤖 *Daily AI Updates & New Tools — ${today}*\n\nNo AI-related stories found today.`;

  return `🤖 *Daily AI Updates & New Tools — ${today}*\n\n${stories
    .map((s, i) => {
      const url = toHnUrl(s);
      const domain = getDomain(s.url);
      return `*${i + 1}. <${url}|${s.title}>*\n<${url}|${domain}>`;
    })
    .join('\n\n')}`;
}

async function postToSlack(blocks) {
  if (!SLACK_WEBHOOK_URL) {
    console.error('SLACK_WEBHOOK_URL is not set');
    return;
  }

  const payload = {
    blocks,
    // Also include text for notifications/fallback
    text: `Daily AI Updates & New Tools`,
  };

  try {
    const res = await fetch(SLACK_WEBHOOK_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    if (!res.ok) {
      const errorText = await res.text();
      console.error('Slack API error:', res.status, errorText);
      console.error('Payload:', JSON.stringify(payload, null, 2));
    } else {
      console.log('Successfully posted to Slack');
    }
  } catch (error) {
    console.error('Error posting to Slack:', error.message);
    throw error;
  }
}

(async () => {
  try {
    console.log('Starting AI news bot...');
    const stories = await getAiStories();
    console.log(`Found ${stories.length} AI stories`);
    
    if (stories.length === 0) {
      console.log('No stories found, posting empty message');
    }
    
    const blocks = await formatSlackBlocks(stories);
    console.log(`Formatted ${blocks.length} blocks`);
    
    await postToSlack(blocks);
    console.log('Done!');
  } catch (error) {
    console.error('Fatal error:', error);
    process.exit(1);
  }
})();
