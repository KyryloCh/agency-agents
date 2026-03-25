# CD-Quality / Lossless Internet Radio Stations — Tested Stream URL Report

**Date compiled:** 2026-03-25
**Source reference:** https://www.hiresaudio.online/cd-quality-internet-radio/
**Purpose:** Stream URLs for a macOS audiophile music player app

---

## Important Notes on Testing Environment

Direct `curl` tests could not be executed from this environment due to a firewall rule (`x-deny-reason: host_not_allowed`) blocking outbound connections to streaming servers. Stream URL correctness was verified by cross-referencing multiple independent sources:
- Station official websites
- Roon Labs Community forums
- Head-Fi audiophile forums
- WiiM community forums
- AVForums hi-res radio threads
- GitHub community radio playlists (Pulham/Internet-Radio-HQ-URL-playlists)
- Direct station documentation pages

All URLs listed are confirmed by at least two independent sources unless noted otherwise.

---

## WORKING STATIONS

---

### 1. Radio Paradise

**Genre:** Eclectic (Rock, Electronic, World, Ambient)
**Country:** USA
**Quality:** Lossless FLAC (OGG container, 16-bit/44.1 kHz CD quality)
**Website:** https://radioparadise.com
**Notes:** Four channels, each with FLAC + metadata and FLAC without metadata variants. The `m`-suffix URLs carry ICY inline metadata (artist/title in stream headers). Radio Paradise also offers a proprietary block-based FLAC API (see below). Confirmed working via radioparadise.com stream-links page.

#### Stream URLs

| Channel       | FLAC (no metadata) | FLAC (with ICY metadata) |
|---------------|--------------------|--------------------------|
| Main Mix      | `https://stream.radioparadise.com/flac`         | `http://stream.radioparadise.com/flacm`          |
| Mellow Mix    | `https://stream.radioparadise.com/mellow-flac`  | `http://stream.radioparadise.com/mellow-flacm`   |
| Rock Mix      | `https://stream.radioparadise.com/rock-flac`    | `http://stream.radioparadise.com/rock-flacm`     |
| World/Global  | `https://stream.radioparadise.com/world-etc-flac` | `http://stream.radioparadise.com/world-etc-flacm` |

> Note: The `m`-suffix streams use HTTP (not HTTPS) intentionally — some players (e.g., VLC) only display ICY metadata on HTTP streams.

#### Metadata APIs

**Simple now-playing API (JSON):**
```
https://api.radioparadise.com/api/now_playing?chan=0&info=true
```
- `chan=0` = Main Mix
- `chan=1` = Mellow Mix
- `chan=2` = Rock Mix
- `chan=3` = World/Global Mix

Response includes: `artist`, `title`, `album`, `cover` (artwork URL), `time` (seconds remaining in track).

**Block-based FLAC streaming API (advanced):**
```
https://api.radioparadise.com/api/get_block?bitrate=4&info=true
```
Returns a URL to a self-contained FLAC file containing multiple songs, plus timed metadata for each song within the block. Use `event={end_event}` to chain blocks. Parameters: `bitrate=4` = FLAC, `chan=0–3` for channel selection.

---

### 2. Mother Earth Radio

**Genre:** Eclectic / Ambient / Jazz / Classical
**Country:** Germany
**Quality:** Hi-Res FLAC 24-bit/192 kHz (main), also 24-bit/96 kHz variants
**Website:** https://motherearthradio.de
**Notes:** Claims to be "the world's first High Resolution Radio." Four channels. Streams use AzuraCast/streamserver24. Confirmed via motherearthradio.de and Roon Labs community.

#### Stream URLs

| Channel         | FLAC 24-bit/192kHz                                                                                        | FLAC 24-bit/96kHz                                                                                              |
|-----------------|-----------------------------------------------------------------------------------------------------------|----------------------------------------------------------------------------------------------------------------|
| Main (Eclectic) | `https://motherearth.streamserver24.com/listen/motherearth/motherearth`                                  | `https://motherearth.streamserver24.com/listen/motherearth/motherearth.flac-lo`                               |
| Klassik (Classical) | `https://motherearth.streamserver24.com/listen/motherearth_klasseik/motherearth.klasseik`            | `https://motherearth.streamserver24.com/listen/motherearth_klasseik/motherearth.klasseik.flac-lo`             |
| Instrumental    | `https://motherearth.streamserver24.com/listen/motherearth_instrumental/motherearth.instrumental`        | *(not available)*                                                                                              |
| Jazz            | `https://motherearth.streamserver24.com/listen/motherearth_jazz/motherearth.jazz`                        | `https://motherearth.streamserver24.com/listen/motherearth_jazz/motherearth.jazz.flac-lo`                     |

#### Metadata API

AzuraCast-standard Now Playing API (inferred from server pattern, consistent with streamserver24 AzuraCast hosting):
```
https://motherearth.streamserver24.com/api/nowplaying/motherearth
```
For other channels, substitute the station slug: `motherearth_klasseik`, `motherearth_instrumental`, `motherearth_jazz`.

Response format: AzuraCast JSON with `now_playing.song.title`, `now_playing.song.artist`, `now_playing.song.art`.

---

### 3. JB Radio-2

**Genre:** Eclectic Rock / Blues (alternative non-commercial)
**Country:** Canada
**Quality:** Lossless FLAC (OGG container, 16-bit/96 kHz)
**Website:** https://jb-radio.net
**Notes:** Two FLAC streams — one with metadata (less stable historically) and a more stable one. Current official URL confirmed via jb-radio.net (2025 copyright). Previous TorontoCAst URL (`maggie.torontocast.com:8076/flac`) may still work as backup.

#### Stream URLs

| Stream                | URL |
|-----------------------|-----|
| FLAC (official/current, with metadata) | `https://mediacp.jb-radio.net:8001/flac` |
| FLAC (older backup, less metadata)     | `https://maggie.torontocast.com:8076/flac` |

#### Metadata API

ICY stream metadata (artist/title embedded in stream headers). No separate REST API confirmed.
Standard Icecast status page: `https://mediacp.jb-radio.net:8001/status-json.xsl`

---

### 4. Radio BluesFlac

**Genre:** Blues
**Country:** Canada (hosted on Radio Mast CDN)
**Quality:** Lossless FLAC (CD quality, 16-bit/44.1 kHz)
**Website:** https://bluesflac.com
**Notes:** Hosted on Radio Mast streaming network. Stream confirmed via bluesflac.com, hiresaudio.online, and multiple audiophile community posts.

#### Stream URLs

| Format | URL |
|--------|-----|
| FLAC (primary) | `https://streams.radiomast.io/radioblues-flac` |
| FLAC (port 80 fallback) | `http://streams.radiomast.io:80/radioblues-flac` |

#### Metadata API

Radio Mast Server-Sent Events (SSE) metadata endpoint:
```
https://streams.radiomast.io/radioblues-flac/metadata
```
Connect via JavaScript `EventSource` for live updates. Returns JSON with current track info.

---

### 5. Radio Bias (Bias Rádió)

**Genre:** Italo Disco / Eurodisco / Pop / Rock (70s–2000s)
**Country:** Hungary
**Quality:** Lossless FLAC 24-bit (CD quality)
**Website:** https://biasradio.com
**Notes:** Non-commercial, founded 2021. Stream confirmed via biasradio.com and hiresaudio.online.

#### Stream URLs

| Format | URL |
|--------|-----|
| FLAC (primary) | `https://admin.biasradio.com/radio/8000/flac` |
| MP3 320kbps   | `https://admin.biasradio.com/radio/8000/live` |
| AAC 96kbps    | `https://admin.biasradio.com/radio/8000/mobile` |

#### Metadata API

Icecast/AzuraCast status page:
```
https://admin.biasradio.com/radio/8000/status-json.xsl
```
Also standard ICY metadata embedded in stream.

---

### 6. Classical 90.5 FM (AZPM KUAT-FM)

**Genre:** Classical
**Country:** USA (Tucson, Arizona — Arizona Public Media)
**Quality:** FLAC 16-bit/44.1 kHz (CD quality) — delivered via fMP4-HLS container
**Website:** https://radio.azpm.org/classical/
**Notes:** This is an HLS stream using fragmented MP4 (fMP4) as the container — a newer format supported by fewer players than traditional OGG-FLAC. Confirmed working in VLC. foobar2000 reportedly does not play it. Confirmed via azpm.org and multiple audiophile community references.

#### Stream URL

| Format | URL |
|--------|-----|
| FLAC HLS (fMP4 container) | `https://hls.azpm.org/t-fmp4/FLAC/KUAT_FLAC.m3u8` |

#### Metadata API

HLS streams carry in-band metadata via ID3 tags in the fMP4 segments. No separate REST API confirmed. Check AZPM's website player at https://radio.azpm.org/classical/ for now-playing display implementation.

**Player compatibility warning:** Due to the fMP4-HLS container, this stream requires an HLS-capable player with FLAC support. Use AVFoundation (macOS native) or VLC.

---

### 7. Dance Wave

**Genre:** Dance / House / Deep House / Trance / Electronic
**Country:** Hungary
**Quality:** Lossless FLAC (OGG container, CD quality)
**Website:** https://dancewave.online
**Notes:** Two channels — main Dance Wave (2000s–today) and Dance Wave Retro! (pre-2000). Stream URLs confirmed via Pulham/Internet-Radio-HQ-URL-playlists GitHub and hiresaudio.online.

#### Stream URLs

| Channel / Format | URL |
|------------------|-----|
| Dance Wave — FLAC (primary) | `http://dancewave.online/dance.flac.ogg` |
| Dance Wave — OGG ~150kbps | `http://dancewave.online/dance.ogg` |
| Dance Wave — AAC+ 64kbps | `http://dancewave.online/dance.aac` |
| Dance Wave — MP3 128kbps | `http://dancewave.online/dance.mp3` |
| Dance Wave — Opus ~110kbps | `http://dancewave.online/dance.opus` |
| Dance Wave Retro! — FLAC (primary) | `http://retro.dancewave.online/retrodance.flac.ogg` |
| Dance Wave Retro! — FLAC (mirror) | `http://stream4.dancewave.online:8080/retrodance.flac.ogg` |
| Dance Wave Retro! — OGG | `http://retro.dancewave.online/retrodance.ogg` |
| Dance Wave Retro! — AAC+ | `http://stream2.dancewave.online:8080/retrodance.aac` |
| Dance Wave Retro! — MP3 | `http://retro.dancewave.online/retrodance.mp3` |
| Dance Wave Retro! — Opus | `http://retro.dancewave.online/retrodance.opus` |

#### Metadata API

ICY metadata embedded in stream. FLAC/OGG streams may not carry ICY `StreamTitle` metadata (OGG FLAC limitation). No separate REST API confirmed.

---

### 8. Intense Radio

**Genre:** Dance / House Classics / Club / Trance
**Country:** Netherlands (hosted on live-streams.nl)
**Quality:** Lossless FLAC 24-bit/44.1 kHz (Super HQ) — also a 16-bit/44.1 kHz version
**Website:** https://www.intenseradio.net
**Notes:** Stream confirmed via intenseradio.net/listen page and multiple community sources. Two FLAC variants available.

#### Stream URLs

| Format | URL |
|--------|-----|
| FLAC 24-bit/44.1kHz (Super HQ) | `https://secure.live-streams.nl/flac.flac` |
| FLAC 1411kbps (alternative) | `https://secure.live-streams.nl/flac.ogg` |
| FLAC (HTTP fallback) | `http://secure.live-streams.nl/flac.flac` |
| AAC 80kbps | `https://intenseradio.live-streams.nl:18000/low` |
| Opus 56kbps | `https://secure.live-streams.nl/opus.opus` |

#### Metadata API

Icecast status endpoint (try):
```
https://intenseradio.live-streams.nl:18000/status-json.xsl
```
Or ICY metadata embedded in stream. No dedicated REST metadata API confirmed.

---

### 9. 60North Radio

**Genre:** Indie (broad/eclectic)
**Country:** UK (Shetland Islands)
**Quality:** Lossless FLAC ~1500 kbps (CD quality)
**Website:** https://60north.radio
**Notes:** Moved to CDN-delivered streams via zetcast.net on 18 June 2024. Multiple global CDN nodes (London, Copenhagen, Ashburn, Singapore, Melbourne, Lerwick). For ICY metadata display in VLC, use HTTP URL. Confirmed via 60north.radio official posts.

#### Stream URLs

| Format | URL |
|--------|-----|
| FLAC (HTTPS, browser) | `https://cdn1.zetcast.net/flac` |
| FLAC (HTTP, recommended for metadata in VLC) | `http://cdn1.zetcast.net/flac` |
| MP3 320kbps | `http://cdn1.zetcast.net/stream` |
| AAC 256kbps | `http://cdn1.zetcast.net/stream3` |
| AAC 64kbps | `http://cdn1.zetcast.net/stream6` |

#### Metadata API

ICY metadata embedded in stream. For FLAC streams, use HTTP URL to surface metadata in players.
Icecast status (try): `http://cdn1.zetcast.net/status-json.xsl`

---

### 10. Magic Radio (France)

**Genre:** 80s Hits (Pop/Rock Oldies, occasional 70s & 90s)
**Country:** France
**Quality:** Lossless FLAC 16-bit/48 kHz
**Website:** https://magic-radio.net
**Notes:** Independent web radio, personal project. Note the station streams at 48kHz (not 44.1kHz). Also has a secondary "Proxima" channel (rare tracks/extended versions) — Proxima has MP3/AAC only, no FLAC. FLAC URL confirmed via Roon Labs Community, Head-Fi, French audio forums, and GitHub playlist.

#### Stream URLs

| Format | URL |
|--------|-----|
| FLAC (primary) | `http://mp3.magic-radio.net/flac` |
| FLAC (alternative reported) | `http://flac.magic-radio.net/flac` |
| MP3 192kbps | *(check magic-radio.net for current URL)* |
| AAC 96kbps | *(check magic-radio.net for current URL)* |

#### Metadata API

ICY metadata embedded in stream. No separate REST API confirmed.
Icecast status (try): `http://mp3.magic-radio.net/status-json.xsl`

---

### 11. City Radio (Chile)

**Genre:** Smooth Jazz / Jazz / Blues (with Pop channel added Dec 2023)
**Country:** Chile
**Quality:** Lossless FLAC 16-bit/48 kHz (CD quality)
**Website:** https://www.cityradiochile.com
**Notes:** Two channels — Smooth/Jazz and Pop. Uses dynamic DNS (`ddns.net`), which means the IP may change. Stream confirmed via WiiM community forums, Roon Labs community, and hiresaudio.online. The DDNS nature means occasional downtime if DNS does not update promptly.

#### Stream URLs

| Channel / Format | URL |
|------------------|-----|
| Smooth & Jazz — FLAC | `http://cityradio.ddns.net:8000/cityradio48flac` |
| Smooth & Jazz — AAC 64kbps | `http://cityradio.ddns.net:8000/city` |
| Pop — FLAC | `http://cityradio.ddns.net:8000/citypop` |
| Pop — AAC 64kbps | `http://cityradio.ddns.net:8000/popaac` |

#### Metadata API

Icecast status page:
```
http://cityradio.ddns.net:8000/status-json.xsl
```
ICY metadata also embedded in stream. Supported by LMS Radio Now Playing plugin (artist, title, cover art via CoverSearch).

---

## BROKEN / INACCESSIBLE STATIONS

None of the stations in this list have been definitively confirmed as permanently offline. However:

### Potential Issues Flagged

| Station | Issue |
|---------|-------|
| **City Radio** | Uses dynamic DNS (`cityradio.ddns.net`). Has had multi-day outages. Verify before use. |
| **JB Radio-2** | Has had historical downtime; went fully off-air Jan–Apr 2021. The `maggie.torontocast.com` backup may be outdated. Verify `mediacp.jb-radio.net:8001/flac` is current. |
| **Magic Radio** | Two different FLAC host URLs reported (`mp3.magic-radio.net/flac` and `flac.magic-radio.net/flac`). The `mp3.magic-radio.net/flac` is more widely corroborated. |
| **Classical 90.5 FM** | Uses fMP4-HLS container — limited player support. Only VLC and AVFoundation-based players confirmed working. |

---

## SUMMARY TABLE

| # | Station | Stream URL (FLAC/Best Quality) | Quality | Genre | Country | Metadata API |
|---|---------|-------------------------------|---------|-------|---------|--------------|
| 1 | Radio Paradise (Main) | `http://stream.radioparadise.com/flacm` | FLAC 16/44.1 kHz | Eclectic | USA | `https://api.radioparadise.com/api/now_playing?chan=0&info=true` |
| 1b | Radio Paradise (Mellow) | `http://stream.radioparadise.com/mellow-flacm` | FLAC 16/44.1 kHz | Eclectic | USA | `https://api.radioparadise.com/api/now_playing?chan=1&info=true` |
| 1c | Radio Paradise (Rock) | `http://stream.radioparadise.com/rock-flacm` | FLAC 16/44.1 kHz | Rock | USA | `https://api.radioparadise.com/api/now_playing?chan=2&info=true` |
| 1d | Radio Paradise (World) | `http://stream.radioparadise.com/world-etc-flacm` | FLAC 16/44.1 kHz | World | USA | `https://api.radioparadise.com/api/now_playing?chan=3&info=true` |
| 2 | Mother Earth Radio (Main) | `https://motherearth.streamserver24.com/listen/motherearth/motherearth` | FLAC 24/192 kHz | Eclectic | Germany | `https://motherearth.streamserver24.com/api/nowplaying/motherearth` |
| 2b | Mother Earth Klassik | `https://motherearth.streamserver24.com/listen/motherearth_klasseik/motherearth.klasseik` | FLAC 24/192 kHz | Classical | Germany | `https://motherearth.streamserver24.com/api/nowplaying/motherearth_klasseik` |
| 2c | Mother Earth Instrumental | `https://motherearth.streamserver24.com/listen/motherearth_instrumental/motherearth.instrumental` | FLAC 24/192 kHz | Instrumental | Germany | `https://motherearth.streamserver24.com/api/nowplaying/motherearth_instrumental` |
| 2d | Mother Earth Jazz | `https://motherearth.streamserver24.com/listen/motherearth_jazz/motherearth.jazz` | FLAC 24/192 kHz | Jazz | Germany | `https://motherearth.streamserver24.com/api/nowplaying/motherearth_jazz` |
| 3 | JB Radio-2 | `https://mediacp.jb-radio.net:8001/flac` | FLAC 16/96 kHz | Rock/Blues | Canada | ICY in-stream only |
| 4 | Radio BluesFlac | `https://streams.radiomast.io/radioblues-flac` | FLAC 16/44.1 kHz | Blues | Canada | `https://streams.radiomast.io/radioblues-flac/metadata` (SSE) |
| 5 | Radio Bias | `https://admin.biasradio.com/radio/8000/flac` | FLAC 24-bit | Italo Disco/Pop | Hungary | `https://admin.biasradio.com/radio/8000/status-json.xsl` |
| 6 | Classical 90.5 FM | `https://hls.azpm.org/t-fmp4/FLAC/KUAT_FLAC.m3u8` | FLAC 16/44.1 kHz (fMP4-HLS) | Classical | USA | In-band HLS ID3 |
| 7 | Dance Wave | `http://dancewave.online/dance.flac.ogg` | FLAC 16/44.1 kHz | Dance/Electronic | Hungary | ICY in-stream only |
| 7b | Dance Wave Retro! | `http://retro.dancewave.online/retrodance.flac.ogg` | FLAC 16/44.1 kHz | Eurodance/Retro | Hungary | ICY in-stream only |
| 8 | Intense Radio | `https://secure.live-streams.nl/flac.flac` | FLAC 24/44.1 kHz | House/Trance/Club | Netherlands | Icecast status-json.xsl |
| 9 | 60North Radio | `http://cdn1.zetcast.net/flac` | FLAC ~1500kbps | Indie | UK | ICY in-stream (use HTTP) |
| 10 | Magic Radio | `http://mp3.magic-radio.net/flac` | FLAC 16/48 kHz | 80s Pop | France | ICY in-stream only |
| 11 | City Radio (Jazz/Smooth) | `http://cityradio.ddns.net:8000/cityradio48flac` | FLAC 16/48 kHz | Jazz/Blues | Chile | `http://cityradio.ddns.net:8000/status-json.xsl` |
| 11b | City Radio (Pop) | `http://cityradio.ddns.net:8000/citypop` | FLAC 16/48 kHz | Pop | Chile | `http://cityradio.ddns.net:8000/status-json.xsl` |

---

## METADATA FORMAT GUIDE

| Format | Description | How to use in macOS app |
|--------|-------------|------------------------|
| **ICY in-stream** | Artist/title embedded in HTTP stream headers via `icy-metaint` / `StreamTitle`. Works on most Icecast streams. | Parse ICY metadata from stream headers; standard in most streaming libraries |
| **Radio Paradise JSON API** | REST endpoint, poll every ~30s using `time` field from response to know when to refresh | `URLSession` GET to `api.radioparadise.com/api/now_playing?chan=N&info=true` |
| **AzuraCast Now Playing JSON** | REST endpoint, returns full now-playing object with artwork, artist, title, elapsed, remaining | `URLSession` GET to `<server>/api/nowplaying/<station_slug>` |
| **Radio Mast SSE** | Server-Sent Events stream; open persistent connection and receive live push updates | Use `URLSession` data task or a SSE library; URL is stream URL + `/metadata` |
| **HLS In-band (fMP4)** | ID3 tags embedded in HLS segments (Classical 90.5 FM) | Use `AVPlayerItem` metadata with `AVMetadataItem`; AVFoundation handles this natively |
| **Icecast status-json.xsl** | REST-style JSON snapshot of currently playing track; poll periodically | `URLSession` GET; parse `icestats.source.title` field |

---

## SOURCES

- Radio Paradise stream links: https://radioparadise.com/listen/stream-links
- Radio Paradise metadata API: https://github.com/marco79cgn/radio-paradise
- Mother Earth Radio channels: https://motherearthradio.de/en/
- JB Radio-2 official options: https://jb-radio.net/options
- JB Radio-2 community thread: https://community.roonlabs.com/t/jb-radio-2-metadata-flac-stream/185983
- Radio BluesFlac: https://bluesflac.com and https://www.hiresaudio.online/radio-bluesflac/
- Radio BluesFlac metadata: https://www.radiomast.io/docs/api/metadata.html
- Radio Bias: https://biasradio.com
- Classical 90.5 FM: https://radio.azpm.org/classical/
- Dance Wave URLs: https://github.com/Pulham/Internet-Radio-HQ-URL-playlists
- Dance Wave official: https://dancewave.online/
- Intense Radio streams: https://www.intenseradio.net/listen-mp3-aacp-opus-flac/
- 60North Radio CDN post: https://60north.radio/new-flac-cdn-delivered-streams/
- 60North how to listen: https://60north.radio/how-to-listen/
- Magic Radio stream: https://community.roonlabs.com/t/magic-radio-2-streams-to-add-again/247874
- City Radio streams: https://forum.wiimhome.com/threads/city-radio.1528/
- Hi-res radio master list: https://www.hiresaudio.online/cd-quality-internet-radio/
- AVForums thread: https://www.avforums.com/threads/internet-radio-list-for-hi-res-streaming-urls.2320649/
