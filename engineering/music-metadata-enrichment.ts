// music-metadata-enrichment.ts — Artist & album bio enrichment for radio now-playing
//
// Source cascade (tried in order, first successful result wins):
//   1. TheAudioDB  — richest free data: multi-language bio, artist images, mood/genre, YouTube
//   2. Last.fm     — bio text sourced from their wiki, tags, similar artists, cover art
//   3. MusicBrainz + Wikipedia — fully open fallback; chains MBID → Wikipedia article title → REST summary
//   4. Cover Art Archive — album artwork via MusicBrainz release-group MBID (standalone or as part of chain)
//
// All sources are free. TheAudioDB and Last.fm require API keys (both offer free tiers).
// MusicBrainz, Wikipedia, and Cover Art Archive require no key.
//
// Rate limits:
//   TheAudioDB  : 30 req/min (free), 100/min (premium)
//   Last.fm     : ~5 req/sec (free, no hard published limit; be respectful)
//   MusicBrainz : 1 req/sec (required — enforce with the throttle helper below)
//   Wikipedia   : No hard limit; set a descriptive User-Agent
//   Cover Art   : No hard limit

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ArtistBio {
  /** Short bio paragraph suitable for a tooltip or collapsed view (~300 chars) */
  summary: string;
  /** Full biography text (may be several paragraphs) */
  full?: string;
  /** Language of the bio content, ISO 639-1 (e.g. "en") */
  language: string;
  /** Source that provided this bio */
  source: 'theaudiodb' | 'lastfm' | 'wikipedia' | 'musicbrainz';
}

export interface ArtistImages {
  /** Square thumbnail (~200px) */
  thumb?: string;
  /** Banner / wide header image */
  banner?: string;
  /** Artist logo (transparent background where available) */
  logo?: string;
  /** Full fan-art / background image */
  fanart?: string;
}

export interface EnrichedArtist {
  /** Artist name as returned by the source */
  name: string;
  /** Short bio / Wikipedia intro */
  bio?: ArtistBio;
  /** Artist images */
  images?: ArtistImages;
  /** Primary genre tags (e.g. ["Classic Rock", "Blues"]) */
  genres?: string[];
  /** Mood descriptors (TheAudioDB-specific, e.g. ["Happy", "Energetic"]) */
  moods?: string[];
  /** Country of origin (ISO 3166-1 alpha-2 or full name depending on source) */
  country?: string;
  /** Year the artist/band was formed */
  formedYear?: number;
  /** MusicBrainz artist ID (MBID) — useful for chaining further lookups */
  mbid?: string;
  /** Link to the artist's official website */
  officialUrl?: string;
  /** Source that provided this enrichment */
  source: 'theaudiodb' | 'lastfm' | 'musicbrainz+wikipedia' | 'none';
}

export interface EnrichedAlbum {
  /** Album title as returned by the source */
  title: string;
  /** Artist name */
  artist: string;
  /** Album release year */
  year?: number;
  /** Record label */
  label?: string;
  /** Album description / wiki text */
  description?: string;
  /** Cover art URL (highest quality available) */
  coverArtUrl?: string;
  /** MusicBrainz release-group MBID */
  mbid?: string;
  /** Source that provided this enrichment */
  source: 'theaudiodb' | 'lastfm' | 'coverartarchive' | 'musicbrainz' | 'none';
}

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

export interface EnrichmentConfig {
  /**
   * TheAudioDB API key.
   * Free tier: register at https://www.theaudiodb.com/register.php
   * Sandbox/test key (limited data): "2"
   */
  theAudioDbApiKey?: string;
  /**
   * Last.fm API key.
   * Free: https://www.last.fm/api/account/create
   */
  lastFmApiKey?: string;
  /**
   * User-Agent string sent with MusicBrainz and Wikipedia requests.
   * Required by MusicBrainz ToS: https://musicbrainz.org/doc/MusicBrainz_API/Rate_Limiting
   * Format: "AppName/1.0 (contact@example.com)"
   */
  userAgent: string;
  /**
   * Preferred biography language (ISO 639-1).
   * TheAudioDB supports: en, de, fr, cn, it, jp, ru, es, pt, se, nl, hu, no
   * Others fall back to English.
   */
  biographyLanguage?: string;
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/** Enforce MusicBrainz's 1 req/sec rate limit */
let _lastMbRequest = 0;
async function mbThrottle(): Promise<void> {
  const now = Date.now();
  const elapsed = now - _lastMbRequest;
  if (elapsed < 1100) {
    await new Promise<void>((resolve) => setTimeout(resolve, 1100 - elapsed));
  }
  _lastMbRequest = Date.now();
}

async function safeFetch(url: string, options?: RequestInit): Promise<Response> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8000);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } finally {
    clearTimeout(timeout);
  }
}

// ---------------------------------------------------------------------------
// TheAudioDB
// ---------------------------------------------------------------------------

/**
 * Fetch artist info from TheAudioDB.
 * Docs: https://www.theaudiodb.com/api_guide.php
 *
 * Key fields returned:
 *   strBiographyEN/DE/FR/…  — bio in multiple languages
 *   strArtistThumb           — square artist thumbnail
 *   strArtistBanner          — wide banner image
 *   strArtistLogo            — artist logo
 *   strArtistFanart          — fan art / background image
 *   strGenre / strMood       — genre and mood descriptors
 *   strCountry               — country of origin
 *   intFormedYear            — year formed
 *   strWebsite               — official website
 */
async function fetchArtistFromAudioDb(
  artistName: string,
  config: EnrichmentConfig
): Promise<EnrichedArtist | null> {
  if (!config.theAudioDbApiKey) return null;

  const encoded = encodeURIComponent(artistName);
  const url = `https://www.theaudiodb.com/api/v1/json/${config.theAudioDbApiKey}/search.php?s=${encoded}`;

  try {
    const res = await safeFetch(url, {
      headers: { 'User-Agent': config.userAgent },
    });
    if (!res.ok) return null;

    const json = await res.json();
    const artist = json?.artists?.[0];
    if (!artist) return null;

    const lang = (config.biographyLanguage ?? 'en').toUpperCase();
    const bioKey = `strBiography${lang === 'EN' ? 'EN' : lang}`;
    const bioFull: string | undefined =
      artist[bioKey] || artist.strBiographyEN || undefined;

    return {
      name: artist.strArtist,
      bio: bioFull
        ? {
            summary: bioFull.slice(0, 300).trimEnd() + (bioFull.length > 300 ? '…' : ''),
            full: bioFull,
            language: lang.toLowerCase(),
            source: 'theaudiodb',
          }
        : undefined,
      images: {
        thumb: artist.strArtistThumb || undefined,
        banner: artist.strArtistBanner || undefined,
        logo: artist.strArtistLogo || undefined,
        fanart: artist.strArtistFanart || artist.strArtistFanart2 || undefined,
      },
      genres: [artist.strGenre, artist.strStyle].filter(Boolean),
      moods: artist.strMood ? [artist.strMood] : undefined,
      country: artist.strCountry || undefined,
      formedYear: artist.intFormedYear ? parseInt(artist.intFormedYear, 10) : undefined,
      mbid: artist.strMusicBrainzID || undefined,
      officialUrl: artist.strWebsite
        ? artist.strWebsite.startsWith('http')
          ? artist.strWebsite
          : `https://${artist.strWebsite}`
        : undefined,
      source: 'theaudiodb',
    };
  } catch {
    return null;
  }
}

/**
 * Fetch album info from TheAudioDB.
 * Endpoint: /searchalbum.php?s={artist}&a={album}
 *
 * Returns: strDescriptionEN, intYearReleased, strLabel, strAlbumThumb (cover art),
 *          strMusicBrainzID
 */
async function fetchAlbumFromAudioDb(
  artistName: string,
  albumTitle: string,
  config: EnrichmentConfig
): Promise<EnrichedAlbum | null> {
  if (!config.theAudioDbApiKey) return null;

  const url =
    `https://www.theaudiodb.com/api/v1/json/${config.theAudioDbApiKey}/searchalbum.php` +
    `?s=${encodeURIComponent(artistName)}&a=${encodeURIComponent(albumTitle)}`;

  try {
    const res = await safeFetch(url, {
      headers: { 'User-Agent': config.userAgent },
    });
    if (!res.ok) return null;

    const json = await res.json();
    const album = json?.album?.[0];
    if (!album) return null;

    return {
      title: album.strAlbum,
      artist: album.strArtist,
      year: album.intYearReleased ? parseInt(album.intYearReleased, 10) : undefined,
      label: album.strLabel || undefined,
      description: album.strDescriptionEN || undefined,
      coverArtUrl: album.strAlbumThumb || undefined,
      mbid: album.strMusicBrainzID || undefined,
      source: 'theaudiodb',
    };
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Last.fm
// ---------------------------------------------------------------------------

/**
 * Fetch artist info from Last.fm.
 * Docs: https://www.last.fm/api/show/artist.getInfo
 *
 * Returns: bio.summary (HTML), bio.content (full HTML), tags, similar artists,
 *          stats.listeners, stats.playcount, image array (small/medium/large/extralarge)
 *
 * Note: bio text is HTML-formatted and sourced from Last.fm's own wiki,
 * which pulls from Wikipedia. Strip HTML before displaying.
 */
async function fetchArtistFromLastFm(
  artistName: string,
  config: EnrichmentConfig
): Promise<EnrichedArtist | null> {
  if (!config.lastFmApiKey) return null;

  const url =
    `https://ws.audioscrobbler.com/2.0/?method=artist.getInfo` +
    `&artist=${encodeURIComponent(artistName)}` +
    `&api_key=${config.lastFmApiKey}&format=json&autocorrect=1`;

  try {
    const res = await safeFetch(url, {
      headers: { 'User-Agent': config.userAgent },
    });
    if (!res.ok) return null;

    const json = await res.json();
    const artist = json?.artist;
    if (!artist) return null;

    const bioSummary: string | undefined = artist.bio?.summary
      ? stripHtml(artist.bio.summary)
      : undefined;
    const bioFull: string | undefined = artist.bio?.content
      ? stripHtml(artist.bio.content)
      : undefined;

    // Last.fm image array: [small, medium, large, extralarge, mega]
    const images: string[] = (artist.image ?? [])
      .map((img: { '#text': string }) => img['#text'])
      .filter(Boolean);

    const tags: string[] = (artist.tags?.tag ?? [])
      .slice(0, 5)
      .map((t: { name: string }) => t.name);

    return {
      name: artist.name,
      bio:
        bioSummary
          ? {
              summary: bioSummary.slice(0, 300).trimEnd() + (bioSummary.length > 300 ? '…' : ''),
              full: bioFull,
              language: 'en',
              source: 'lastfm',
            }
          : undefined,
      images: {
        thumb: images[2] || images[1] || images[0] || undefined, // large preferred
        fanart: images[4] || images[3] || undefined,             // mega/extralarge
      },
      genres: tags,
      mbid: artist.mbid || undefined,
      source: 'lastfm',
    };
  } catch {
    return null;
  }
}

/**
 * Fetch album info from Last.fm.
 * Docs: https://www.last.fm/api/show/album.getInfo
 *
 * Returns: wiki.summary, wiki.content, image array, tags, tracks
 */
async function fetchAlbumFromLastFm(
  artistName: string,
  albumTitle: string,
  config: EnrichmentConfig
): Promise<EnrichedAlbum | null> {
  if (!config.lastFmApiKey) return null;

  const url =
    `https://ws.audioscrobbler.com/2.0/?method=album.getInfo` +
    `&artist=${encodeURIComponent(artistName)}` +
    `&album=${encodeURIComponent(albumTitle)}` +
    `&api_key=${config.lastFmApiKey}&format=json&autocorrect=1`;

  try {
    const res = await safeFetch(url, {
      headers: { 'User-Agent': config.userAgent },
    });
    if (!res.ok) return null;

    const json = await res.json();
    const album = json?.album;
    if (!album) return null;

    // Pick the largest image
    const images: string[] = (album.image ?? [])
      .map((img: { '#text': string }) => img['#text'])
      .filter(Boolean);

    const description = album.wiki?.content
      ? stripHtml(album.wiki.content)
      : undefined;

    return {
      title: album.name,
      artist: album.artist,
      description,
      coverArtUrl: images[images.length - 1] || undefined, // last = largest
      mbid: album.mbid || undefined,
      source: 'lastfm',
    };
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// MusicBrainz + Wikipedia
// ---------------------------------------------------------------------------

/**
 * Search MusicBrainz for an artist by name.
 * Docs: https://musicbrainz.org/doc/MusicBrainz_API
 *
 * Returns the best-matching artist MBID and the Wikipedia article title
 * extracted from url-rels (relation type = "wikipedia").
 *
 * IMPORTANT: Obey the 1 req/sec rate limit or your IP will be throttled.
 */
async function fetchArtistFromMusicBrainz(
  artistName: string,
  config: EnrichmentConfig
): Promise<EnrichedArtist | null> {
  try {
    // Step 1: Search for artist by name
    await mbThrottle();
    const searchUrl =
      `https://musicbrainz.org/ws/2/artist/?query=${encodeURIComponent(artistName)}&fmt=json&limit=1`;

    const searchRes = await safeFetch(searchUrl, {
      headers: {
        'User-Agent': config.userAgent,
        Accept: 'application/json',
      },
    });
    if (!searchRes.ok) return null;

    const searchJson = await searchRes.json();
    const mbArtist = searchJson?.artists?.[0];
    if (!mbArtist) return null;

    const mbid: string = mbArtist.id;

    // Step 2: Fetch full artist record with URL relations to find Wikipedia link
    await mbThrottle();
    const detailUrl =
      `https://musicbrainz.org/ws/2/artist/${mbid}?inc=url-rels&fmt=json`;

    const detailRes = await safeFetch(detailUrl, {
      headers: {
        'User-Agent': config.userAgent,
        Accept: 'application/json',
      },
    });
    if (!detailRes.ok) return null;

    const detail = await detailRes.json();

    // Extract Wikipedia article title from relations
    const wpRel = (detail.relations ?? []).find(
      (r: { type: string; url?: { resource: string } }) =>
        r.type === 'wikipedia' && r.url?.resource?.includes('en.wikipedia.org')
    );
    const wpTitle: string | undefined = wpRel?.url?.resource
      ? decodeURIComponent(wpRel.url.resource.split('/wiki/')[1] ?? '')
      : undefined;

    // Step 3: Fetch Wikipedia summary if we have a title
    let bio: ArtistBio | undefined;
    if (wpTitle) {
      bio = await fetchWikipediaSummary(wpTitle, config);
    }

    return {
      name: detail.name ?? artistName,
      bio,
      country: detail.country || mbArtist.country || undefined,
      formedYear: detail['life-span']?.begin
        ? parseInt(detail['life-span'].begin.slice(0, 4), 10)
        : undefined,
      mbid,
      source: 'musicbrainz+wikipedia',
    };
  } catch {
    return null;
  }
}

/**
 * Fetch a short bio from Wikipedia's REST summary endpoint.
 * Docs: https://en.wikipedia.org/api/rest_v1/#/Page_content/get_page_summary__title_
 *
 * Returns a clean plain-text extract (intro paragraph).
 * No API key required. No rate limit published — be polite with User-Agent.
 */
async function fetchWikipediaSummary(
  articleTitle: string,
  config: EnrichmentConfig
): Promise<ArtistBio | undefined> {
  try {
    const url = `https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(articleTitle)}`;
    const res = await safeFetch(url, {
      headers: {
        'User-Agent': config.userAgent,
        Accept: 'application/json',
      },
    });
    if (!res.ok) return undefined;

    const json = await res.json();
    const extract: string | undefined = json?.extract;
    if (!extract) return undefined;

    return {
      summary: extract.slice(0, 300).trimEnd() + (extract.length > 300 ? '…' : ''),
      full: extract,
      language: 'en',
      source: 'wikipedia',
    };
  } catch {
    return undefined;
  }
}

// ---------------------------------------------------------------------------
// Cover Art Archive
// ---------------------------------------------------------------------------

/**
 * Fetch album cover art from the Cover Art Archive using a MusicBrainz release-group MBID.
 * Docs: https://musicbrainz.org/doc/Cover_Art_Archive/API
 *
 * No API key required.
 * Endpoint: https://coverartarchive.org/release-group/{mbid}
 * Returns images[0].thumbnails: { "250", "500", "1200" } and image (original)
 */
export async function fetchCoverArt(
  releasegroupMbid: string,
  config: Pick<EnrichmentConfig, 'userAgent'>
): Promise<string | null> {
  try {
    const url = `https://coverartarchive.org/release-group/${releasegroupMbid}`;
    const res = await safeFetch(url, {
      headers: { 'User-Agent': config.userAgent },
    });
    if (!res.ok) return null;

    const json = await res.json();
    const front = (json?.images ?? []).find(
      (img: { front: boolean; thumbnails: Record<string, string>; image: string }) =>
        img.front
    );
    if (!front) return null;

    // Return highest-quality thumbnail available (1200 > 500 > 250 > original)
    return (
      front.thumbnails?.['1200'] ||
      front.thumbnails?.['500'] ||
      front.thumbnails?.['250'] ||
      front.image ||
      null
    );
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Cascade enrichment — public API
// ---------------------------------------------------------------------------

/**
 * Enrich artist info using a cascade of sources.
 * Sources tried in order: TheAudioDB → Last.fm → MusicBrainz+Wikipedia
 * Returns the first successful result, or a "none" stub if all fail.
 *
 * @example
 * const info = await enrichArtist('Massive Attack', config);
 * console.log(info.bio?.summary);
 * console.log(info.images?.fanart);
 */
export async function enrichArtist(
  artistName: string,
  config: EnrichmentConfig
): Promise<EnrichedArtist> {
  // 1. TheAudioDB — richest free data
  const audioDb = await fetchArtistFromAudioDb(artistName, config);
  if (audioDb?.bio || audioDb?.images?.thumb) return audioDb;

  // 2. Last.fm — good bio coverage, tags
  const lastFm = await fetchArtistFromLastFm(artistName, config);
  if (lastFm?.bio || lastFm?.images?.thumb) return lastFm;

  // 3. MusicBrainz + Wikipedia — always free, no key required
  const mb = await fetchArtistFromMusicBrainz(artistName, config);
  if (mb) return mb;

  return { name: artistName, source: 'none' };
}

/**
 * Enrich album info using a cascade of sources.
 * Sources tried in order: TheAudioDB → Last.fm → Cover Art Archive (if MBID known)
 *
 * @example
 * const info = await enrichAlbum('Pink Floyd', 'The Dark Side of the Moon', config);
 * console.log(info.coverArtUrl);
 * console.log(info.description);
 */
export async function enrichAlbum(
  artistName: string,
  albumTitle: string,
  config: EnrichmentConfig
): Promise<EnrichedAlbum> {
  // 1. TheAudioDB
  const audioDb = await fetchAlbumFromAudioDb(artistName, albumTitle, config);
  if (audioDb?.coverArtUrl || audioDb?.description) return audioDb;

  // 2. Last.fm
  const lastFm = await fetchAlbumFromLastFm(artistName, albumTitle, config);
  if (lastFm?.coverArtUrl || lastFm?.description) return lastFm;

  return { title: albumTitle, artist: artistName, source: 'none' };
}

/**
 * Convenience: enrich both artist and album in parallel.
 * Use when you have both artist + album names from the now-playing metadata.
 */
export async function enrichNowPlaying(
  artistName: string,
  albumTitle: string | undefined,
  config: EnrichmentConfig
): Promise<{ artist: EnrichedArtist; album: EnrichedAlbum | null }> {
  const [artist, album] = await Promise.all([
    enrichArtist(artistName, config),
    albumTitle ? enrichAlbum(artistName, albumTitle, config) : Promise.resolve(null),
  ]);
  return { artist, album };
}

// ---------------------------------------------------------------------------
// Simple in-memory cache (keyed by "artist:album")
// ---------------------------------------------------------------------------

interface CacheEntry<T> {
  value: T;
  expiresAt: number;
}

const _cache = new Map<string, CacheEntry<EnrichedArtist | EnrichedAlbum>>();

/**
 * Cached version of enrichNowPlaying.
 * Default TTL: 1 hour (artists/albums rarely change mid-stream).
 *
 * @example
 * const client = createCachedEnrichmentClient(config, 3600_000);
 * const { artist, album } = await client.enrichNowPlaying('Radiohead', 'OK Computer');
 */
export function createCachedEnrichmentClient(
  config: EnrichmentConfig,
  ttlMs = 3_600_000
) {
  return {
    async enrichArtist(name: string): Promise<EnrichedArtist> {
      const key = `artist:${name.toLowerCase()}`;
      const cached = _cache.get(key);
      if (cached && cached.expiresAt > Date.now()) {
        return cached.value as EnrichedArtist;
      }
      const value = await enrichArtist(name, config);
      _cache.set(key, { value, expiresAt: Date.now() + ttlMs });
      return value;
    },

    async enrichAlbum(artist: string, album: string): Promise<EnrichedAlbum> {
      const key = `album:${artist.toLowerCase()}:${album.toLowerCase()}`;
      const cached = _cache.get(key);
      if (cached && cached.expiresAt > Date.now()) {
        return cached.value as EnrichedAlbum;
      }
      const value = await enrichAlbum(artist, album, config);
      _cache.set(key, { value, expiresAt: Date.now() + ttlMs });
      return value;
    },

    async enrichNowPlaying(artist: string, album?: string) {
      return enrichNowPlaying(artist, album, config);
    },

    /** Clear all cached entries */
    clearCache() {
      _cache.clear();
    },
  };
}

// ---------------------------------------------------------------------------
// Utility
// ---------------------------------------------------------------------------

/** Strip HTML tags from Last.fm bio content */
function stripHtml(html: string): string {
  return html
    .replace(/<a[^>]*href="[^"]*"[^>]*>([^<]*)<\/a>/g, '$1') // keep link text
    .replace(/<[^>]+>/g, '')                                    // strip all other tags
    .replace(/\n{3,}/g, '\n\n')                                 // collapse excess newlines
    .replace(/\s+\.\s*$/, '')                                   // remove trailing "Read more on Last.fm" artefact
    .trim();
}

// ---------------------------------------------------------------------------
// Source reference comments
// ---------------------------------------------------------------------------
//
// TheAudioDB
//   Free tier API key: register at https://www.theaudiodb.com/register.php
//   Sandbox key (limited dataset): "2"
//   Artist search:  GET https://www.theaudiodb.com/api/v1/json/{key}/search.php?s={artist}
//   Album search:   GET https://www.theaudiodb.com/api/v1/json/{key}/searchalbum.php?s={artist}&a={album}
//   Rate limits:    30 req/min (free) · 100/min (premium $3/mo) · 120/min (business)
//   Docs:           https://www.theaudiodb.com/api_guide.php
//
// Last.fm
//   Free API key:   https://www.last.fm/api/account/create
//   Artist info:    GET https://ws.audioscrobbler.com/2.0/?method=artist.getInfo&artist={name}&api_key={key}&format=json
//   Album info:     GET https://ws.audioscrobbler.com/2.0/?method=album.getInfo&artist={a}&album={b}&api_key={key}&format=json
//   Bio note:       Returns HTML; use stripHtml(). Bio sourced from Last.fm wiki (Wikipedia-derived).
//   Docs:           https://www.last.fm/api/show/artist.getInfo
//
// MusicBrainz
//   No key required. User-Agent header mandatory.
//   Artist search:  GET https://musicbrainz.org/ws/2/artist/?query={name}&fmt=json&limit=1
//   Artist detail:  GET https://musicbrainz.org/ws/2/artist/{mbid}?inc=url-rels&fmt=json
//   Rate limit:     1 req/sec — hard limit; throttled or banned if exceeded
//   Docs:           https://musicbrainz.org/doc/MusicBrainz_API
//
// Wikipedia REST API
//   No key required.
//   Page summary:   GET https://en.wikipedia.org/api/rest_v1/page/summary/{article_title}
//   Returns:        { extract: "...", thumbnail: { source: "..." }, ... }
//   Note:           Get article title from MusicBrainz url-rels (type = "wikipedia")
//   Docs:           https://en.wikipedia.org/api/rest_v1/
//
// Cover Art Archive
//   No key required.
//   Release group:  GET https://coverartarchive.org/release-group/{release-group-mbid}
//   Returns:        { images: [{ front: true, thumbnails: { "250", "500", "1200" }, image: "..." }] }
//   Docs:           https://musicbrainz.org/doc/Cover_Art_Archive/API
