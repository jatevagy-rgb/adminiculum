/**
 * News Feed Service — Backend RSS/Atom Fetcher
 * Fetches external RSS feeds server-side to eliminate browser CORS dependency.
 * Normalizes results to a stable minimal payload.
 */

export interface NewsItem {
  title: string;
  source: string;
  date: string;
  url?: string;
  description?: string;
}

export interface NewsFeedResult {
  articles: NewsItem[];
  error?: string;
}

const FEEDS: Record<string, { url: string; label: string }> = {
  legal: { url: 'https://www.pitcast.pro/newsfeed/legal', label: 'pitcast.pro/legal' },
  ecofin: { url: 'https://www.pitcast.pro/newsfeed/ecofin', label: 'pitcast.pro/ecofin' },
};

const TIMEOUT_MS = 8000;
const MAX_ARTICLES = 8;
const NEWS_FEED_DEBUG = process.env.DEBUG_NEWS_FEED === 'true' || process.env.NODE_ENV !== 'production';

function detectPayloadKind(text: string, contentType: string): 'RSS/XML' | 'HTML page' | 'other structured content' {
  const ct = (contentType || '').toLowerCase();
  if (ct.includes('xml') || /^\s*<\?xml/i.test(text) || /<rss[\s>]|<feed[\s>]/i.test(text)) {
    return 'RSS/XML';
  }
  if (ct.includes('html') || /<html[\s>]/i.test(text)) {
    return 'HTML page';
  }
  return 'other structured content';
}

function decodeHtmlEntities(input: string): string {
  return input
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, ' ');
}

function parseRssXml(text: string, source: string): NewsItem[] {
  // Simple regex-based XML parsing (avoiding DOMParser dependency in Node)
  const items: NewsItem[] = [];
  
  // Match <item>...</item> or <entry>...</entry> blocks
  const itemRegex = /<(?:item|entry)>([\s\S]*?)<\/(?:item|entry)>/gi;
  let match: RegExpExecArray | null;
  let idx = 0;

  while ((match = itemRegex.exec(text)) !== null && idx < MAX_ARTICLES) {
    const block = match[1];
    
    // Extract title: <title> or <title: encoded> (may be CDATA)
    const titleMatch = block.match(/<title(?:[^>]*)>([\s\S]*?)<\/title>/i);
    const title = titleMatch
      ? titleMatch[1].replace(/<!\[CDATA\[|\]\]>/g, '').replace(/<[^>]+>/g, '').trim()
      : '';

    // Extract link
    let url = '';
    const linkMatch = block.match(/<link(?:[^>]*)>([\s\S]*?)<\/link>/i);
    const hrefMatch = block.match(/<link[^>]+href=["']([^"']+)["'][^>]*\/?>/i);
    if (hrefMatch) {
      url = hrefMatch[1].trim();
    } else if (linkMatch) {
      url = linkMatch[1].replace(/<!\[CDATA\[|\]\]>/g, '').replace(/<[^>]+>/g, '').trim();
    }

    // Extract description/summary/content
    const descMatch = block.match(/<(?:description|summary|content(?:[\w:]*)?)(?:[^>]*)>([\s\S]*?)<\/(?:description|summary|content(?:[\w:]*)?)>/i);
    let description = descMatch
      ? descMatch[1].replace(/<!\[CDATA\[|\]\]>/g, '').replace(/<[^>]+>/g, '').trim().substring(0, 160)
      : '';

    // Extract pubDate/published/date
    const dateMatch = block.match(/<(?:pubDate|published|date)(?:[^>]*)>([\s\S]*?)<\/(?:pubDate|published|date)>/i);
    let date = '';
    if (dateMatch) {
      const rawDate = dateMatch[1].replace(/<!\[CDATA\[|\]\]>/g, '').trim();
      try {
        date = new Date(rawDate).toLocaleDateString('hu-HU');
      } catch {
        date = rawDate;
      }
    }

    if (title) {
      items.push({ title, source, date, url, description });
      idx++;
    }
  }

  return items;
}

function collectPotentialNewsObjects(node: unknown, bucket: Array<Record<string, unknown>>): void {
  if (!node) return;

  if (Array.isArray(node)) {
    for (const item of node) {
      collectPotentialNewsObjects(item, bucket);
    }
    return;
  }

  if (typeof node !== 'object') return;

  const record = node as Record<string, unknown>;
  const title = record.title;
  const maybeLink = record.url || record.link || record.href || record.path;

  if (typeof title === 'string' && title.trim().length > 0 && typeof maybeLink === 'string' && maybeLink.trim().length > 0) {
    bucket.push(record);
  }

  for (const value of Object.values(record)) {
    collectPotentialNewsObjects(value, bucket);
  }
}

function parseNewsFromNextData(html: string, source: string): NewsItem[] {
  const scriptMatch = html.match(/<script[^>]*id=["']__NEXT_DATA__["'][^>]*>([\s\S]*?)<\/script>/i);
  if (!scriptMatch) return [];

  try {
    const parsed = JSON.parse(scriptMatch[1]);
    const candidates: Array<Record<string, unknown>> = [];
    collectPotentialNewsObjects(parsed, candidates);

    const mapped = candidates
      .map((entry) => {
        const title = String(entry.title || '').trim();
        const rawUrl = String(entry.url || entry.link || entry.href || '').trim();
        if (!title || !rawUrl) return null;

        const dateCandidate = entry.date || entry.publishedAt || entry.published || entry.createdAt;
        let date = '';
        if (typeof dateCandidate === 'string' && dateCandidate.trim().length > 0) {
          const parsedDate = new Date(dateCandidate);
          date = Number.isNaN(parsedDate.getTime()) ? dateCandidate.trim() : parsedDate.toLocaleDateString('hu-HU');
        }

        const description = typeof entry.description === 'string'
          ? decodeHtmlEntities(entry.description.replace(/<[^>]+>/g, '').trim()).slice(0, 160)
          : undefined;

        const url = /^https?:\/\//i.test(rawUrl) ? rawUrl : `https://www.pitcast.pro${rawUrl.startsWith('/') ? '' : '/'}${rawUrl}`;

        return {
          title: decodeHtmlEntities(title),
          source,
          date,
          url,
          description,
        } as NewsItem;
      })
      .filter((item): item is NewsItem => Boolean(item));

    const unique = new Map<string, NewsItem>();
    for (const item of mapped) {
      const key = `${item.title}::${item.url || ''}`;
      if (!unique.has(key)) {
        unique.set(key, item);
      }
      if (unique.size >= MAX_ARTICLES) break;
    }

    return Array.from(unique.values());
  } catch {
    return [];
  }
}

function parseNewsFromFlightScripts(html: string, source: string): NewsItem[] {
  const scripts = [...html.matchAll(/<script[^>]*>\s*self\.__next_f\.push\([\s\S]*?<\/script>/gi)]
    .map((m) => m[0]);
  if (scripts.length === 0) return [];

  const joined = scripts
    .join('\n')
    .replace(/\\u002F/g, '/')
    .replace(/\\u0026/g, '&')
    .replace(/\\\"/g, '"');

  const pairs = [...joined.matchAll(/"href"\s*:\s*"(https?:\/\/[^"\s]+)"[\s\S]{0,500}?"children"\s*:\s*"([^"\n]{8,220})"/gi)]
    .map((m) => ({
      url: m[1].trim(),
      title: decodeHtmlEntities(m[2].replace(/<[^>]+>/g, '').trim()),
    }))
    .filter((x) => x.url.length > 0 && x.title.length > 0)
    .filter((x) => /news|article|jurist|reuters|bloomberg|ft\.com|wsj|ecb|eu|court|legal|finance|tax|policy/i.test(`${x.url} ${x.title}`));

  const unique = new Map<string, NewsItem>();
  for (const p of pairs) {
    const key = `${p.title}::${p.url}`;
    if (!unique.has(key)) {
      unique.set(key, {
        title: p.title,
        source,
        date: '',
        url: p.url,
      });
    }
    if (unique.size >= MAX_ARTICLES) break;
  }

  return Array.from(unique.values());
}

export async function fetchNewsFeed(category: 'legal' | 'ecofin'): Promise<NewsFeedResult> {
  const feed = FEEDS[category];
  if (!feed) {
    return { articles: [], error: 'A hírfolyam jelenleg nem érhető el.' };
  }

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS);

    const response = await fetch(feed.url, {
      signal: controller.signal,
      headers: { 'User-Agent': 'Adminiculum/1.0' },
    });

    clearTimeout(timeout);

    const upstreamStatus = response.status;
    const upstreamContentType = response.headers.get('content-type') || '';

    if (NEWS_FEED_DEBUG) {
      console.info('[news-feed] upstream', {
        category,
        url: feed.url,
        status: upstreamStatus,
        contentType: upstreamContentType,
      });
    }

    if (!response.ok) {
      return { articles: [], error: 'A hírfolyam jelenleg nem érhető el.' };
    }

    const text = await response.text();
    const payloadKind = detectPayloadKind(text, upstreamContentType);
    let articles = parseRssXml(text, feed.label);
    const rssParsedCount = articles.length;
    let nextParsedCount = 0;

    if (articles.length === 0 && /<html[\s>]/i.test(text)) {
      articles = parseNewsFromNextData(text, feed.label);
      nextParsedCount = articles.length;

      if (articles.length === 0) {
        const flightArticles = parseNewsFromFlightScripts(text, feed.label);
        articles = flightArticles;
        if (NEWS_FEED_DEBUG) {
          console.info('[news-feed] parse-flight', {
            category,
            flightParsedCount: flightArticles.length,
          });
        }
      }
    }

    if (NEWS_FEED_DEBUG) {
      console.info('[news-feed] parse', {
        category,
        payloadKind,
        rssParsedCount,
        nextDataParsedCount: nextParsedCount,
        finalCount: articles.length,
      });
    }

    if (articles.length === 0) {
      return { articles: [], error: 'A hírfolyam jelenleg nem érhető el.' };
    }

    return { articles };
  } catch (err) {
    return { articles: [], error: 'A hírfolyam jelenleg nem érhető el.' };
  }
}
