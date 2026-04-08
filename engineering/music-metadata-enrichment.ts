// music-metadata-enrichment.ts — Artist & album bio enrichment for radio now-playing
//
// Source cascade (tried in order, first successful result wins):
//   1. TheAudioDB  — richest free data: multi-language bio, artist images, mood/genre, discography
//   2. Last.fm     — bio text sourced from their wiki, tags, similar artists, cover art
//   3. MusicBrainz + Wikipedia — fully open fallback; chains MBID → Wikipedia article title → REST summary
//   4. Cover Art Archive — album artwork via MusicBrainz release-group MBID (standalone or as part of chain)
//
// All sources are free. TheAudioDB and Last.fm require API keys (both offer free tiers).
// MusicBrainz, Wikipedia, and Cover Art Archive require no key.
//
// TheAudioDB free API key: sign up at https://www.theaudiodb.com/register.php
// Sandbox/test key (limited dataset): "123"
//
// Rate limits:
//   TheAudioDB  : 30 req/min (free), 100/min (premium $3/mo)
//   Last.fm     : ~5 req/sec (free, no hard published limit; be respectful)
//   MusicBrainz : 1 req/sec (required — enforce with the throttle helper below)
//   Wikipedia   : No hard limit; set a descriptive User-Agent
//   Cover Art   : No hard limit
//
// TheAudioDB endpoint map (base: https://www.theaudiodb.com/api/v1/json/{key}/)
//   search.php?s={artist}                      Search artist by name
//   artist.php?i={artistId}                    Lookup artist by AudioDB ID
//   artist-mb.php?i={mbid}                     Lookup artist by MusicBrainz ID
//   discography.php?s={artist}                 All albums for artist (by name)
//   searchalbum.php?s={artist}&a={album}       Search album by artist + title
//   album.php?i={artistId}                     All albums for artist (by AudioDB ID)
//   album.php?m={albumId}                      Lookup album by AudioDB album ID
//   album-mb.php?i={mbReleaseGroupId}          Lookup album by MusicBrainz release-group ID
//   searchtrack.php?s={artist}&t={track}       Search track by artist + title  ← key for radio
//   track.php?m={albumId}                      All tracks in an album
//   track.php?h={trackId}                      Lookup track by AudioDB track ID
//   mvid.php?i={artistId}                      Music videos for artist (Patreon key required)

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
  /** AudioDB internal album ID (used to fetch tracks via track.php?m={id}) */
  audioDbAlbumId?: string;
  /** MusicBrainz release-group MBID */
  mbid?: string;
  /** Source that provided this enrichment */
  source: 'theaudiodb' | 'lastfm' | 'coverartarchive' | 'musicbrainz' | 'none';
}

export interface EnrichedTrack {
  /** Track title */
  title: string;
  /** Artist name */
  artist: string;
  /** Album the track belongs to */
  album?: string;
  /** Track number within the album */
  trackNumber?: number;
  /** Track duration in seconds */
  durationMs?: number;
  /** Genre */
  genre?: string;
  /** Cover art from the track's album */
  coverArtUrl?: string;
  /** AudioDB album ID (use to fetch full album details) */
  audioDbAlbumId?: string;
  /** MusicBrainz track ID */
  mbid?: string;
  /** Source that provided this enrichment */
  source: 'theaudiodb' | 'none';
}

export interface AlbumSummary {
  /** AudioDB album ID */
  audioDbAlbumId: string;
  /** Album title */
  title: string;
  /** Release year */
  year?: number;
  /** Cover art thumbnail */
  coverArtUrl?: string;
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

/**
 * Search for a track by artist + title.
 * Endpoint: /searchtrack.php?s={artist}&t={track}
 *
 * This is the critical path for radio streams that give you artist + track title
 * but no album name. Returns the track's audioDbAlbumId which you can then pass
 * to fetchAlbumByIdFromAudioDb() to get cover art and album details.
 *
 * Key fields: strTrack, strAlbum, idAlbum, intDuration, intTrackNumber,
 *             strGenre, strMusicBrainzID, strAlbumStrMusicBrainzID
 */
async function fetchTrackFromAudioDb(
  artistName: string,
  trackTitle: string,
  config: EnrichmentConfig
): Promise<EnrichedTrack | null> {
  if (!config.theAudioDbApiKey) return null;

  const url =
    `https://www.theaudiodb.com/api/v1/json/${config.theAudioDbApiKey}/searchtrack.php` +
    `?s=${encodeURIComponent(artistName)}&t=${encodeURIComponent(trackTitle)}`;

  try {
    const res = await safeFetch(url, { headers: { 'User-Agent': config.userAgent } });
    if (!res.ok) return null;

    const json = await res.json();
    const track = json?.track?.[0];
    if (!track) return null;

    return {
      title: track.strTrack,
      artist: track.strArtist,
      album: track.strAlbum || undefined,
      trackNumber: track.intTrackNumber ? parseInt(track.intTrackNumber, 10) : undefined,
      durationMs: track.intDuration ? parseInt(track.intDuration, 10) : undefined,
      genre: track.strGenre || undefined,
      coverArtUrl: track.strTrackThumb || undefined,
      audioDbAlbumId: track.idAlbum || undefined,
      mbid: track.strMusicBrainzID || undefined,
      source: 'theaudiodb',
    };
  } catch {
    return null;
  }
}

/**
 * Lookup a specific album by its AudioDB album ID.
 * Endpoint: /album.php?m={albumId}
 *
 * Use after fetchTrackFromAudioDb() to get full album details from track.idAlbum.
 * Returns cover art, description, year, label — everything needed for the now-playing UI.
 */
async function fetchAlbumByIdFromAudioDb(
  albumId: string,
  config: EnrichmentConfig
): Promise<EnrichedAlbum | null> {
  if (!config.theAudioDbApiKey) return null;

  const url = `https://www.theaudiodb.com/api/v1/json/${config.theAudioDbApiKey}/album.php?m=${encodeURIComponent(albumId)}`;

  try {
    const res = await safeFetch(url, { headers: { 'User-Agent': config.userAgent } });
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
      audioDbAlbumId: album.idAlbum || undefined,
      mbid: album.strMusicBrainzID || undefined,
      source: 'theaudiodb',
    };
  } catch {
    return null;
  }
}

/**
 * Lookup an album by MusicBrainz release-group ID.
 * Endpoint: /album-mb.php?i={mbReleaseGroupId}
 *
 * Useful when the radio stream or MusicBrainz lookup provides a release-group MBID
 * and you want to get AudioDB's richer metadata (description, artwork) for that release.
 */
async function fetchAlbumByMbidFromAudioDb(
  mbReleaseGroupId: string,
  config: EnrichmentConfig
): Promise<EnrichedAlbum | null> {
  if (!config.theAudioDbApiKey) return null;

  const url = `https://www.theaudiodb.com/api/v1/json/${config.theAudioDbApiKey}/album-mb.php?i=${encodeURIComponent(mbReleaseGroupId)}`;

  try {
    const res = await safeFetch(url, { headers: { 'User-Agent': config.userAgent } });
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
      audioDbAlbumId: album.idAlbum || undefined,
      mbid: mbReleaseGroupId,
      source: 'theaudiodb',
    };
  } catch {
    return null;
  }
}

/**
 * Lookup an artist by MusicBrainz artist ID.
 * Endpoint: /artist-mb.php?i={mbid}
 *
 * Useful when the stream metadata or MusicBrainz lookup already gives you a MBID —
 * skips the name-search step and goes straight to the full artist record.
 */
export async function fetchArtistByMbidFromAudioDb(
  mbid: string,
  config: EnrichmentConfig
): Promise<EnrichedArtist | null> {
  if (!config.theAudioDbApiKey) return null;

  const url = `https://www.theaudiodb.com/api/v1/json/${config.theAudioDbApiKey}/artist-mb.php?i=${encodeURIComponent(mbid)}`;

  try {
    const res = await safeFetch(url, { headers: { 'User-Agent': config.userAgent } });
    if (!res.ok) return null;

    const json = await res.json();
    const artist = json?.artists?.[0];
    if (!artist) return null;

    const lang = (config.biographyLanguage ?? 'en').toUpperCase();
    const bioKey = `strBiography${lang === 'EN' ? 'EN' : lang}`;
    const bioFull: string | undefined = artist[bioKey] || artist.strBiographyEN || undefined;

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
      mbid,
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
 * Fetch an artist's full discography (list of albums).
 * Endpoint: /discography.php?s={artist}
 *
 * Returns a lightweight album list (id, title, year, cover art thumb) suitable
 * for rendering a discography panel alongside the now-playing track.
 */
export async function fetchDiscographyFromAudioDb(
  artistName: string,
  config: EnrichmentConfig
): Promise<AlbumSummary[]> {
  if (!config.theAudioDbApiKey) return [];

  const url =
    `https://www.theaudiodb.com/api/v1/json/${config.theAudioDbApiKey}/discography.php` +
    `?s=${encodeURIComponent(artistName)}`;

  try {
    const res = await safeFetch(url, { headers: { 'User-Agent': config.userAgent } });
    if (!res.ok) return [];

    const json = await res.json();
    const albums: unknown[] = json?.album ?? [];

    return albums.map((a: any) => ({
      audioDbAlbumId: a.idAlbum,
      title: a.strAlbum,
      year: a.intYearReleased ? parseInt(a.intYearReleased, 10) : undefined,
      coverArtUrl: a.strAlbumThumb || undefined,
    }));
  } catch {
    return [];
  }
}

/**
 * Fetch all tracks in an album.
 * Endpoint: /track.php?m={albumId}
 *
 * Use after resolving the album (via searchtrack or discography) to display
 * the full tracklist alongside the now-playing info.
 */
export async function fetchTracklistFromAudioDb(
  audioDbAlbumId: string,
  config: EnrichmentConfig
): Promise<EnrichedTrack[]> {
  if (!config.theAudioDbApiKey) return [];

  const url =
    `https://www.theaudiodb.com/api/v1/json/${config.theAudioDbApiKey}/track.php` +
    `?m=${encodeURIComponent(audioDbAlbumId)}`;

  try {
    const res = await safeFetch(url, { headers: { 'User-Agent': config.userAgent } });
    if (!res.ok) return [];

    const json = await res.json();
    const tracks: unknown[] = json?.track ?? [];

    return tracks.map((t: any) => ({
      title: t.strTrack,
      artist: t.strArtist,
      album: t.strAlbum || undefined,
      trackNumber: t.intTrackNumber ? parseInt(t.intTrackNumber, 10) : undefined,
      durationMs: t.intDuration ? parseInt(t.intDuration, 10) : undefined,
      genre: t.strGenre || undefined,
      audioDbAlbumId,
      mbid: t.strMusicBrainzID || undefined,
      source: 'theaudiodb' as const,
    }));
  } catch {
    return [];
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
 * Sources tried in order: TheAudioDB (by name) → Last.fm → Cover Art Archive (if MBID known)
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
  // 1. TheAudioDB — by artist + album name
  const audioDb = await fetchAlbumFromAudioDb(artistName, albumTitle, config);
  if (audioDb?.coverArtUrl || audioDb?.description) return audioDb;

  // 2. Last.fm
  const lastFm = await fetchAlbumFromLastFm(artistName, albumTitle, config);
  if (lastFm?.coverArtUrl || lastFm?.description) {
    // If Last.fm gave us a MusicBrainz release-group MBID, try Cover Art Archive
    // as a higher-quality cover art fallback
    if (lastFm.mbid && !lastFm.coverArtUrl) {
      const caaArt = await fetchCoverArt(lastFm.mbid, config);
      if (caaArt) lastFm.coverArtUrl = caaArt;
    }
    return lastFm;
  }

  return { title: albumTitle, artist: artistName, source: 'none' };
}

/**
 * Enrich a track by artist + track title.
 *
 * Radio streams typically give you artist + track title but not album name.
 * This resolves the track → album automatically:
 *   1. TheAudioDB searchtrack.php → gets track info + idAlbum
 *   2. TheAudioDB album.php?m={idAlbum} → gets cover art, description, year
 *
 * Returns both the track and its resolved album so the UI can show cover art
 * and album info without knowing the album title upfront.
 *
 * @example
 * const { track, album } = await enrichTrack('Massive Attack', 'Teardrop', config);
 * console.log(track.durationMs);
 * console.log(album?.coverArtUrl);
 */
export async function enrichTrack(
  artistName: string,
  trackTitle: string,
  config: EnrichmentConfig
): Promise<{ track: EnrichedTrack; album: EnrichedAlbum | null }> {
  const track = await fetchTrackFromAudioDb(artistName, trackTitle, config);

  if (!track) {
    return {
      track: { title: trackTitle, artist: artistName, source: 'none' },
      album: null,
    };
  }

  // If we got an album ID from the track, fetch full album details
  let album: EnrichedAlbum | null = null;
  if (track.audioDbAlbumId) {
    album = await fetchAlbumByIdFromAudioDb(track.audioDbAlbumId, config);
  } else if (track.album) {
    // Fall back to name-based album lookup
    album = await enrichAlbum(artistName, track.album, config);
  }

  return { track, album };
}

/**
 * Enrich now-playing data. Handles three cases:
 *
 *   1. artist + album title known → enrichArtist + enrichAlbum in parallel
 *   2. artist + track title known (no album) → enrichArtist + enrichTrack in parallel
 *      (enrichTrack auto-resolves the album via TheAudioDB's track→album chain)
 *   3. artist only → enrichArtist only
 *
 * @example
 * // From ICY stream metadata: "Massive Attack - Teardrop"
 * const result = await enrichNowPlaying({
 *   artist: 'Massive Attack',
 *   track: 'Teardrop',
 * }, config);
 * console.log(result.artist.bio?.summary);
 * console.log(result.album?.coverArtUrl);   // resolved via track lookup
 */
export async function enrichNowPlaying(
  nowPlaying: { artist: string; track?: string; album?: string },
  config: EnrichmentConfig
): Promise<{ artist: EnrichedArtist; track: EnrichedTrack | null; album: EnrichedAlbum | null }> {
  const { artist: artistName, track: trackTitle, album: albumTitle } = nowPlaying;

  if (albumTitle) {
    // Case 1: have album name — direct lookup
    const [artist, album] = await Promise.all([
      enrichArtist(artistName, config),
      enrichAlbum(artistName, albumTitle, config),
    ]);
    return { artist, track: null, album };
  }

  if (trackTitle) {
    // Case 2: have track title but no album — use track→album chain
    const [artist, { track, album }] = await Promise.all([
      enrichArtist(artistName, config),
      enrichTrack(artistName, trackTitle, config),
    ]);
    return { artist, track, album };
  }

  // Case 3: artist name only
  const artist = await enrichArtist(artistName, config);
  return { artist, track: null, album: null };
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
 * Default TTL: 1 hour (artist/album info changes rarely between tracks).
 *
 * @example
 * const client = createCachedEnrichmentClient({
 *   theAudioDbApiKey: '123',   // sandbox key; replace with your registered key
 *   lastFmApiKey: 'YOUR_KEY',
 *   userAgent: 'MyRadioApp/1.0 (dev@example.com)',
 * });
 *
 * // In your now-playing callback:
 * player.onNowPlaying = async (np) => {
 *   // Works whether you have album name or just track title
 *   const { artist, track, album } = await client.enrichNowPlaying({
 *     artist: np.artist,
 *     track: np.title,      // ← track title triggers auto album resolution
 *   });
 *   showBio(artist.bio?.summary);
 *   showCover(album?.coverArtUrl);
 *   showFanart(artist.images?.fanart);
 * };
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

    async enrichTrack(artist: string, track: string) {
      const key = `track:${artist.toLowerCase()}:${track.toLowerCase()}`;
      const cached = _cache.get(key) as CacheEntry<{ track: EnrichedTrack; album: EnrichedAlbum | null }> | undefined;
      if (cached && cached.expiresAt > Date.now()) return cached.value;
      const value = await enrichTrack(artist, track, config);
      (_cache as Map<string, CacheEntry<unknown>>).set(key, { value, expiresAt: Date.now() + ttlMs });
      return value;
    },

    async enrichNowPlaying(nowPlaying: { artist: string; track?: string; album?: string }) {
      return enrichNowPlaying(nowPlaying, config);
    },

    /** Fetch artist discography (list of albums). Not cached — call once per artist load. */
    async fetchDiscography(artist: string): Promise<AlbumSummary[]> {
      return fetchDiscographyFromAudioDb(artist, config);
    },

    /** Fetch full tracklist for an album by AudioDB album ID. */
    async fetchTracklist(audioDbAlbumId: string): Promise<EnrichedTrack[]> {
      return fetchTracklistFromAudioDb(audioDbAlbumId, config);
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
// Source reference — full endpoint map
// ---------------------------------------------------------------------------
//
// TheAudioDB  (base: https://www.theaudiodb.com/api/v1/json/{key}/)
//   Free API key:    register at https://www.theaudiodb.com/register.php
//   Sandbox key:     "123"  (limited dataset — good enough for testing)
//   Rate limits:     30 req/min free · 100/min premium ($3/mo Patreon)
//
//   search.php?s={artist}                    → artists[]  (bio, images, genre, formed year)
//   artist.php?i={audioDbArtistId}           → artists[]  (same shape, lookup by ID)
//   artist-mb.php?i={mbid}                   → artists[]  (lookup by MusicBrainz artist ID)
//   discography.php?s={artist}               → album[]    (id, title, year, thumb — lightweight)
//   searchalbum.php?s={artist}&a={album}     → album[]    (full: description, label, cover art)
//   album.php?i={audioDbArtistId}            → album[]    (all albums for an artist ID)
//   album.php?m={audioDbAlbumId}             → album[]    (full album by AudioDB album ID)
//   album-mb.php?i={mbReleaseGroupId}        → album[]    (full album by MusicBrainz RGID)
//   searchtrack.php?s={artist}&t={track}     → track[]    (track info + idAlbum ← key for radio)
//   track.php?m={audioDbAlbumId}             → track[]    (all tracks in an album)
//   track.php?h={audioDbTrackId}             → track[]    (single track by AudioDB ID)
//   mvid.php?i={audioDbArtistId}             → mvids[]    (music videos — Patreon key required)
//
// Last.fm
//   Free API key:   https://www.last.fm/api/account/create
//   Artist info:    GET https://ws.audioscrobbler.com/2.0/?method=artist.getInfo&artist={name}&api_key={key}&format=json&autocorrect=1
//   Album info:     GET https://ws.audioscrobbler.com/2.0/?method=album.getInfo&artist={a}&album={b}&api_key={key}&format=json&autocorrect=1
//   Bio note:       Returns HTML — run through stripHtml(). Sourced from Last.fm wiki (Wikipedia-derived).
//   Docs:           https://www.last.fm/api/show/artist.getInfo
//
// MusicBrainz  (no key — User-Agent header mandatory)
//   Artist search:  GET https://musicbrainz.org/ws/2/artist/?query={name}&fmt=json&limit=1
//   Artist detail:  GET https://musicbrainz.org/ws/2/artist/{mbid}?inc=url-rels&fmt=json
//   Rate limit:     1 req/sec hard limit — mbThrottle() enforces this automatically
//   Docs:           https://musicbrainz.org/doc/MusicBrainz_API
//
// Wikipedia REST API  (no key — set descriptive User-Agent)
//   Page summary:   GET https://en.wikipedia.org/api/rest_v1/page/summary/{article_title}
//   Returns:        { extract: "plain text bio", thumbnail: { source: "..." }, ... }
//   Get title from: MusicBrainz url-rels where type = "wikipedia" and resource contains "en.wikipedia.org"
//   Docs:           https://en.wikipedia.org/api/rest_v1/
//
// Cover Art Archive  (no key)
//   Release group:  GET https://coverartarchive.org/release-group/{mbReleaseGroupId}
//   Returns:        { images: [{ front: true, thumbnails: { "250", "500", "1200" }, image: "..." }] }
//   Docs:           https://musicbrainz.org/doc/Cover_Art_Archive/API
