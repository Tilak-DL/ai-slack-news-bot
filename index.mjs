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

function isAiRelated(title = '', url = '') {
    const text = (title + ' ' + url).toLowerCase();

    return KEYWORDS.some(k => text.includes(k.toLowerCase()));
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
  const ids = await fetchTopStoriesIds(100); // Check more stories for better coverage
  const items = await Promise.all(ids.map(fetchItem));
  // Sort by score (highest first) to get the most relevant/trending stories
  const aiStories = items
    .filter(item => item?.title && isAiRelated(item.title, item.url))
    .sort((a, b) => (b.score || 0) - (a.score || 0));
  return aiStories.slice(0, 10); // Return top 10 AI stories
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

  // Fetch metadata for all stories in parallel
  const metadataPromises = stories.map(story => fetchMetadata(toHnUrl(story)));
  const metadataList = await Promise.all(metadataPromises);

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
    
    blocks.push({
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: text,
      },
    });
    
    // Add image if available
    if (metadata.image) {
      blocks.push({
        type: 'image',
        image_url: metadata.image,
        alt_text: story.title,
      });
    }
    
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
  const payload = {
    blocks,
    // Also include text for notifications/fallback
    text: `Daily AI Updates & New Tools`,
  };

  const res = await fetch(SLACK_WEBHOOK_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    console.log(await res.text());
  }
}

(async () => {
  const stories = await getAiStories();
  const blocks = await formatSlackBlocks(stories);
  await postToSlack(blocks);
})();
