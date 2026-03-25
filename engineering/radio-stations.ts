// radio-stations.ts — Curated lossless/hi-res internet radio station registry
// All streams are FLAC (lossless or hi-res). Verified March 2026.

export type MetadataFormat =
  | 'icy-instream'
  | 'rest-json-radioparadise'
  | 'rest-json-azuracast'
  | 'sse-radiomast'
  | 'hls-id3'
  | 'icecast-status-json';

export type StreamFormat = 'icecast-flac' | 'hls-fmp4-flac';

export interface StationChannel {
  /** Unique channel ID, e.g. "radio-paradise-main" */
  id: string;
  /** Display name for this channel */
  name: string;
  /** Primary FLAC stream URL */
  streamUrl: string;
  /** Fallback stream URL (older CDN, backup host, etc.) */
  streamUrlFallback?: string;
  /** Stream container/protocol type */
  format: StreamFormat;
  /** Human-readable quality string */
  quality: string;
  /** Bit depth (e.g. 16 or 24) */
  bitDepth: number;
  /** Sample rate in Hz (e.g. 44100, 48000, 96000, 192000) */
  sampleRate: number;
  /** How now-playing metadata is delivered */
  metadataFormat: MetadataFormat;
  /**
   * URL for out-of-band metadata.
   * - rest-json-*: poll this endpoint
   * - sse-radiomast: open as EventSource
   * - icecast-status-json: poll this endpoint, parse icestats.source.title
   * - icy-instream / hls-id3: metadata is in-band — no URL needed
   */
  metadataUrl?: string;
}

export interface Station {
  /** Unique station ID */
  id: string;
  /** Display name */
  name: string;
  genre: string[];
  country: string;
  website: string;
  channels: StationChannel[];
  /** Operational notes / caveats */
  notes?: string;
}

// ---------------------------------------------------------------------------
// Station registry
// ---------------------------------------------------------------------------

export const STATIONS: Station[] = [
  // 1. Radio Paradise --------------------------------------------------------
  {
    id: 'radio-paradise',
    name: 'Radio Paradise',
    genre: ['Eclectic', 'Rock', 'Electronic', 'World', 'Ambient'],
    country: 'US',
    website: 'https://radioparadise.com',
    notes:
      'ICY-metadata streams use HTTP intentionally; some players only surface ICY headers on HTTP. ' +
      'Also supports a block-based FLAC API (api.radioparadise.com/api/get_block?bitrate=4&info=true) ' +
      'that returns self-contained FLAC files with timed track metadata.',
    channels: [
      {
        id: 'radio-paradise-main',
        name: 'Radio Paradise — Main Mix',
        streamUrl: 'http://stream.radioparadise.com/flacm',
        streamUrlFallback: 'https://stream.radioparadise.com/flac',
        format: 'icecast-flac',
        quality: 'FLAC 16/44.1 kHz',
        bitDepth: 16,
        sampleRate: 44100,
        metadataFormat: 'rest-json-radioparadise',
        metadataUrl: 'https://api.radioparadise.com/api/now_playing?chan=0&info=true',
      },
      {
        id: 'radio-paradise-mellow',
        name: 'Radio Paradise — Mellow Mix',
        streamUrl: 'http://stream.radioparadise.com/mellow-flacm',
        streamUrlFallback: 'https://stream.radioparadise.com/mellow-flac',
        format: 'icecast-flac',
        quality: 'FLAC 16/44.1 kHz',
        bitDepth: 16,
        sampleRate: 44100,
        metadataFormat: 'rest-json-radioparadise',
        metadataUrl: 'https://api.radioparadise.com/api/now_playing?chan=1&info=true',
      },
      {
        id: 'radio-paradise-rock',
        name: 'Radio Paradise — Rock Mix',
        streamUrl: 'http://stream.radioparadise.com/rock-flacm',
        streamUrlFallback: 'https://stream.radioparadise.com/rock-flac',
        format: 'icecast-flac',
        quality: 'FLAC 16/44.1 kHz',
        bitDepth: 16,
        sampleRate: 44100,
        metadataFormat: 'rest-json-radioparadise',
        metadataUrl: 'https://api.radioparadise.com/api/now_playing?chan=2&info=true',
      },
      {
        id: 'radio-paradise-world',
        name: 'Radio Paradise — World/Global Mix',
        streamUrl: 'http://stream.radioparadise.com/world-etc-flacm',
        streamUrlFallback: 'https://stream.radioparadise.com/world-etc-flac',
        format: 'icecast-flac',
        quality: 'FLAC 16/44.1 kHz',
        bitDepth: 16,
        sampleRate: 44100,
        metadataFormat: 'rest-json-radioparadise',
        metadataUrl: 'https://api.radioparadise.com/api/now_playing?chan=3&info=true',
      },
    ],
  },

  // 2. Mother Earth Radio ----------------------------------------------------
  {
    id: 'mother-earth-radio',
    name: 'Mother Earth Radio',
    genre: ['Eclectic', 'Ambient', 'Jazz', 'Classical', 'Instrumental'],
    country: 'DE',
    website: 'https://motherearthradio.de',
    notes:
      'Claims to be the world\'s first High Resolution Radio. ' +
      'Runs AzuraCast on streamserver24. Note the typo in the Klassik slug ' +
      '(motherearth_klasseik) — that is how the server is configured. ' +
      'Lower-quality 24/96 kHz variants exist (append .flac-lo to the stream path) ' +
      'but the primary URLs deliver 24/192 kHz.',
    channels: [
      {
        id: 'mother-earth-main',
        name: 'Mother Earth Radio — Main (Eclectic)',
        streamUrl: 'https://motherearth.streamserver24.com/listen/motherearth/motherearth',
        format: 'icecast-flac',
        quality: 'FLAC 24/192 kHz',
        bitDepth: 24,
        sampleRate: 192000,
        metadataFormat: 'rest-json-azuracast',
        metadataUrl: 'https://motherearth.streamserver24.com/api/nowplaying/motherearth',
      },
      {
        id: 'mother-earth-klassik',
        name: 'Mother Earth Radio — Klassik (Classical)',
        // Slug intentionally misspelled — matches server configuration
        streamUrl: 'https://motherearth.streamserver24.com/listen/motherearth_klasseik/motherearth.klasseik',
        format: 'icecast-flac',
        quality: 'FLAC 24/192 kHz',
        bitDepth: 24,
        sampleRate: 192000,
        metadataFormat: 'rest-json-azuracast',
        metadataUrl: 'https://motherearth.streamserver24.com/api/nowplaying/motherearth_klasseik',
      },
      {
        id: 'mother-earth-instrumental',
        name: 'Mother Earth Radio — Instrumental',
        streamUrl: 'https://motherearth.streamserver24.com/listen/motherearth_instrumental/motherearth.instrumental',
        format: 'icecast-flac',
        quality: 'FLAC 24/192 kHz',
        bitDepth: 24,
        sampleRate: 192000,
        metadataFormat: 'rest-json-azuracast',
        metadataUrl: 'https://motherearth.streamserver24.com/api/nowplaying/motherearth_instrumental',
      },
      {
        id: 'mother-earth-jazz',
        name: 'Mother Earth Radio — Jazz',
        streamUrl: 'https://motherearth.streamserver24.com/listen/motherearth_jazz/motherearth.jazz',
        format: 'icecast-flac',
        quality: 'FLAC 24/192 kHz',
        bitDepth: 24,
        sampleRate: 192000,
        metadataFormat: 'rest-json-azuracast',
        metadataUrl: 'https://motherearth.streamserver24.com/api/nowplaying/motherearth_jazz',
      },
    ],
  },

  // 3. JB Radio-2 ------------------------------------------------------------
  {
    id: 'jb-radio-2',
    name: 'JB Radio-2',
    genre: ['Rock', 'Blues', 'Eclectic'],
    country: 'CA',
    website: 'https://jb-radio.net',
    notes:
      'Non-commercial Canadian station. Has had historical downtime (went off-air Jan–Apr 2021). ' +
      'The TorontoCAst URL (maggie.torontocast.com:8076/flac) may still serve as a backup ' +
      'but is not guaranteed current. No REST metadata API — use ICY in-stream only.',
    channels: [
      {
        id: 'jb-radio-2',
        name: 'JB Radio-2',
        streamUrl: 'https://mediacp.jb-radio.net:8001/flac',
        streamUrlFallback: 'https://maggie.torontocast.com:8076/flac',
        format: 'icecast-flac',
        quality: 'FLAC 16/96 kHz',
        bitDepth: 16,
        sampleRate: 96000,
        metadataFormat: 'icy-instream',
      },
    ],
  },

  // 4. Radio BluesFlac -------------------------------------------------------
  {
    id: 'radio-bluesflac',
    name: 'Radio BluesFlac',
    genre: ['Blues'],
    country: 'CA',
    website: 'https://bluesflac.com',
    notes:
      'Hosted on Radio Mast CDN. Metadata is delivered via Server-Sent Events (SSE) — ' +
      'connect with EventSource and receive live push updates. No polling needed.',
    channels: [
      {
        id: 'radio-bluesflac',
        name: 'Radio BluesFlac',
        streamUrl: 'https://streams.radiomast.io/radioblues-flac',
        streamUrlFallback: 'http://streams.radiomast.io:80/radioblues-flac',
        format: 'icecast-flac',
        quality: 'FLAC 16/44.1 kHz',
        bitDepth: 16,
        sampleRate: 44100,
        metadataFormat: 'sse-radiomast',
        metadataUrl: 'https://streams.radiomast.io/radioblues-flac/metadata',
      },
    ],
  },

  // 5. Radio Bias ------------------------------------------------------------
  {
    id: 'radio-bias',
    name: 'Radio Bias (Bias Rádió)',
    genre: ['Italo Disco', 'Eurodisco', 'Pop', 'Rock'],
    country: 'HU',
    website: 'https://biasradio.com',
    notes: 'Non-commercial, founded 2021. ICY metadata is also embedded in-stream alongside the status-json endpoint.',
    channels: [
      {
        id: 'radio-bias',
        name: 'Radio Bias',
        streamUrl: 'https://admin.biasradio.com/radio/8000/flac',
        format: 'icecast-flac',
        quality: 'FLAC 24-bit',
        bitDepth: 24,
        sampleRate: 44100,
        metadataFormat: 'icecast-status-json',
        metadataUrl: 'https://admin.biasradio.com/radio/8000/status-json.xsl',
      },
    ],
  },

  // 6. Classical 90.5 FM (AZPM KUAT-FM) -------------------------------------
  {
    id: 'classical-905',
    name: 'Classical 90.5 FM (KUAT)',
    genre: ['Classical'],
    country: 'US',
    website: 'https://radio.azpm.org/classical/',
    notes:
      'Arizona Public Media. Uses fMP4-HLS container — NOT standard OGG-FLAC. ' +
      'Confirmed working in VLC and AVFoundation (macOS). foobar2000 does NOT support it. ' +
      'Metadata is in-band HLS ID3 tags; AVFoundation surfaces these natively via AVPlayerItem metadata.',
    channels: [
      {
        id: 'classical-905',
        name: 'Classical 90.5 FM',
        streamUrl: 'https://hls.azpm.org/t-fmp4/FLAC/KUAT_FLAC.m3u8',
        format: 'hls-fmp4-flac',
        quality: 'FLAC 16/44.1 kHz (fMP4-HLS)',
        bitDepth: 16,
        sampleRate: 44100,
        metadataFormat: 'hls-id3',
      },
    ],
  },

  // 7. Dance Wave ------------------------------------------------------------
  {
    id: 'dance-wave',
    name: 'Dance Wave',
    genre: ['Dance', 'House', 'Deep House', 'Trance', 'Electronic', 'Eurodance'],
    country: 'HU',
    website: 'https://dancewave.online',
    notes:
      'OGG FLAC streams may not carry ICY StreamTitle metadata (OGG FLAC limitation). ' +
      'Retro! channel has a mirror at stream4.dancewave.online:8080 as backup.',
    channels: [
      {
        id: 'dance-wave-main',
        name: 'Dance Wave',
        streamUrl: 'http://dancewave.online/dance.flac.ogg',
        format: 'icecast-flac',
        quality: 'FLAC 16/44.1 kHz',
        bitDepth: 16,
        sampleRate: 44100,
        metadataFormat: 'icy-instream',
      },
      {
        id: 'dance-wave-retro',
        name: 'Dance Wave Retro!',
        streamUrl: 'http://retro.dancewave.online/retrodance.flac.ogg',
        streamUrlFallback: 'http://stream4.dancewave.online:8080/retrodance.flac.ogg',
        format: 'icecast-flac',
        quality: 'FLAC 16/44.1 kHz',
        bitDepth: 16,
        sampleRate: 44100,
        metadataFormat: 'icy-instream',
      },
    ],
  },

  // 8. Intense Radio ---------------------------------------------------------
  {
    id: 'intense-radio',
    name: 'Intense Radio',
    genre: ['House Classics', 'Dance', 'Club', 'Trance'],
    country: 'NL',
    website: 'https://www.intenseradio.net',
    notes: 'Hosted on live-streams.nl. Two FLAC variants; primary is 24-bit. Status-json may not be CORS-accessible from browsers — proxy if needed.',
    channels: [
      {
        id: 'intense-radio',
        name: 'Intense Radio',
        streamUrl: 'https://secure.live-streams.nl/flac.flac',
        streamUrlFallback: 'http://secure.live-streams.nl/flac.flac',
        format: 'icecast-flac',
        quality: 'FLAC 24/44.1 kHz',
        bitDepth: 24,
        sampleRate: 44100,
        metadataFormat: 'icecast-status-json',
        metadataUrl: 'https://intenseradio.live-streams.nl:18000/status-json.xsl',
      },
    ],
  },

  // 9. 60North Radio ---------------------------------------------------------
  {
    id: '60north-radio',
    name: '60North Radio',
    genre: ['Indie', 'Eclectic'],
    country: 'GB',
    website: 'https://60north.radio',
    notes:
      'Shetland Islands, UK. Moved to zetcast.net CDN in June 2024 with global nodes. ' +
      'Use the HTTP URL (not HTTPS) if your player needs ICY metadata surfaced ' +
      '(some players only display ICY headers from HTTP streams).',
    channels: [
      {
        id: '60north-radio',
        name: '60North Radio',
        streamUrl: 'http://cdn1.zetcast.net/flac',
        streamUrlFallback: 'https://cdn1.zetcast.net/flac',
        format: 'icecast-flac',
        quality: 'FLAC ~1500 kbps',
        bitDepth: 16,
        sampleRate: 44100,
        metadataFormat: 'icy-instream',
      },
    ],
  },

  // 10. Magic Radio ----------------------------------------------------------
  {
    id: 'magic-radio',
    name: 'Magic Radio',
    genre: ['80s Pop', 'Rock Oldies'],
    country: 'FR',
    website: 'https://magic-radio.net',
    notes:
      'Independent French web radio. Note 48 kHz sample rate (not 44.1 kHz). ' +
      'Two FLAC host domains reported; mp3.magic-radio.net/flac is more widely corroborated. ' +
      'Has a secondary "Proxima" channel (rare/extended versions) but it is MP3/AAC only.',
    channels: [
      {
        id: 'magic-radio',
        name: 'Magic Radio',
        streamUrl: 'http://mp3.magic-radio.net/flac',
        streamUrlFallback: 'http://flac.magic-radio.net/flac',
        format: 'icecast-flac',
        quality: 'FLAC 16/48 kHz',
        bitDepth: 16,
        sampleRate: 48000,
        metadataFormat: 'icy-instream',
      },
    ],
  },

  // 11. City Radio -----------------------------------------------------------
  {
    id: 'city-radio',
    name: 'City Radio',
    genre: ['Smooth Jazz', 'Jazz', 'Blues', 'Pop'],
    country: 'CL',
    website: 'https://www.cityradiochile.com',
    notes:
      'Uses dynamic DNS (cityradio.ddns.net) — the IP may change without warning, ' +
      'causing multi-day outages until DNS propagates. Implement a fallback to the ' +
      'website player and alert the user on connection failure.',
    channels: [
      {
        id: 'city-radio-jazz',
        name: 'City Radio — Smooth Jazz',
        streamUrl: 'http://cityradio.ddns.net:8000/cityradio48flac',
        format: 'icecast-flac',
        quality: 'FLAC 16/48 kHz',
        bitDepth: 16,
        sampleRate: 48000,
        metadataFormat: 'icecast-status-json',
        metadataUrl: 'http://cityradio.ddns.net:8000/status-json.xsl',
      },
      {
        id: 'city-radio-pop',
        name: 'City Radio — Pop',
        streamUrl: 'http://cityradio.ddns.net:8000/citypop',
        format: 'icecast-flac',
        quality: 'FLAC 16/48 kHz',
        bitDepth: 16,
        sampleRate: 48000,
        metadataFormat: 'icecast-status-json',
        metadataUrl: 'http://cityradio.ddns.net:8000/status-json.xsl',
      },
    ],
  },
];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Flat list of all channels across all stations (convenience for UI lists) */
export const ALL_CHANNELS: (StationChannel & { stationId: string; stationName: string })[] =
  STATIONS.flatMap((station) =>
    station.channels.map((ch) => ({
      ...ch,
      stationId: station.id,
      stationName: station.name,
    }))
  );

/** Look up a channel by its ID */
export function getChannelById(
  id: string
): (StationChannel & { stationId: string; stationName: string }) | undefined {
  return ALL_CHANNELS.find((ch) => ch.id === id);
}

/** Look up the parent station for a channel ID */
export function getStationForChannel(channelId: string): Station | undefined {
  return STATIONS.find((s) => s.channels.some((ch) => ch.id === channelId));
}
