// index.mjs

const HN_TOP_STORIES_URL = 'https://hacker-news.firebaseio.com/v0/topstories.json';
const HN_ITEM_URL = id => `https://hacker-news.firebaseio.com/v0/item/${id}.json`;
const SLACK_WEBHOOK_URL = process.env.SLACK_WEBHOOK_URL;

// Keywords to detect AI-related posts
const KEYWORDS = [
  'ai',
  'artificial intelligence',
  'machine learning',
  'ml',
  'deep learning',
  'llm',
  'openai',
  'anthropic',
  'llama',
  'chatgpt',
  'gemini',
  'mistral',
  'gpt-',
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
  const ids = await fetchTopStoriesIds(80);
  const items = await Promise.all(ids.map(fetchItem));
  return items.filter(item => item?.title && isAiRelated(item.title, item.url)).slice(0, 5);
}

function toHnUrl(item) {
  return item.url || `https://news.ycombinator.com/item?id=${item.id}`;
}

function formatSlackText(stories) {
  const today = new Date().toLocaleDateString('en-IN', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });

  if (!stories.length)
    return `🤖 *Daily AI / Tech Brief — ${today}*\n\nNo AI-related stories found today.`;

  return `🤖 *Daily AI / Tech Brief — ${today}*\n\n${stories
    .map((s, i) => `*${i + 1}. <${toHnUrl(s)}|${s.title}>* (${s.score} points)`)
    .join('\n\n')}`;
}

async function postToSlack(text) {
  const res = await fetch(SLACK_WEBHOOK_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text }),
  });

  if (!res.ok) {
    console.log(await res.text());
  }
}

(async () => {
  const stories = await getAiStories();
  const text = formatSlackText(stories);
  await postToSlack(text);
})();
