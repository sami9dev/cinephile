use regex::Regex;
use reqwest::Client;
use serde_json::Value;
use sha2::{Digest, Sha256};
use std::time::Instant;
use tracing::info;

use crate::config::Config;
use crate::models::*;
use crate::upstash::UpstashClient;

pub struct MediaIdentifier {
    client: Client,
    config: Config,
    upstash: UpstashClient,
}

impl MediaIdentifier {
    pub fn new(config: Config, upstash: UpstashClient) -> Self {
        let client = Client::builder()
            .timeout(std::time::Duration::from_millis(config.request_timeout_ms))
            .pool_max_idle_per_host(20)
            .pool_idle_timeout(std::time::Duration::from_secs(90))
            .build()
            .unwrap_or_default();

        Self {
            client,
            config,
            upstash,
        }
    }

    /// Strips technical tokens, audio specs, codecs, and release groups from filename
    pub fn strip_filename_noise(text: &str) -> String {
        if text.trim().is_empty() {
            return String::new();
        }

        let mut cleaned = text.to_string();

        // 1. Remove leading prefixes like "Name : ", "1. ", "[Download]"
        let re_prefix = Regex::new(r"(?i)^[\s\r\n]*(?:\[?\d{1,3}[\]).:-]\s*)?(?:(?:Name|Title|Movie|Series|Show|Film|File|Release)\s*[-:=]+\s*)+").unwrap();
        cleaned = re_prefix.replace(&cleaned, " ").to_string();

        // 2. Remove standard website domain prefixes
        let re_domain = Regex::new(r"(?i)\b(?:www\.)?[a-z0-9_-]+\.(?:wtf|rip|mov|xyz|me|org|com|net|in|top|click|info|cc|to|so|pm|cx)\b").unwrap();
        cleaned = re_domain.replace_all(&cleaned, " ").to_string();

        // 3. Remove quality, codec, audio tags
        let noise_tags = [
            r"(?i)\b(?:2160p|1080p|720p|480p|360p|4k|uhd|fhd|hd|sd)\b",
            r"(?i)\b(?:web-?dl|webrip|bluray|bdrip|brrip|hdtv|hdrip|dvdrip|remux)\b",
            r"(?i)\b(?:x264|x265|hevc|h\.?264|h\.?265|avc|10bit|8bit|hdr10\+?|hdr|dv|dolby\s*vision)\b",
            r"(?i)\b(?:ddp\s*5\.1|ddp\s*7\.1|dd\s*5\.1|dd\s*2\.0|dd\+?|eac3|ac3|atmos|aac(?:\s*2\.0)?|dts-?hd|truehd|mp3)\b",
            r"(?i)\b(?:hindi|english|tamil|telugu|kannada|malayalam|bengali|marathi|dual\s*audio|multi\s*audio|sub|esub|subs?)\b",
            r"(?i)\b(?:amzn|nf|dsnp|hotstar|zee5|sonyliv|jio|apple\s*tv|max|hbo|ma|moviesanywhere)\b",
            r"(?i)\b(?:zip|rar|7z|mkv|mp4|avi|webm)\b",
            r"(?i)-[a-z0-9]+(?:movies|team|flix|rg|tgx|psa|galaxytv|cinefuel)?\b",
        ];

        for pattern in &noise_tags {
            if let Ok(re) = Regex::new(pattern) {
                cleaned = re.replace_all(&cleaned, " ").to_string();
            }
        }

        // 4. Remove brackets and punctuation
        let re_punct = Regex::new(r"[\(\)\[\]\{\}\-_.:|•+]").unwrap();
        cleaned = re_punct.replace_all(&cleaned, " ").to_string();

        // Collapse multiple spaces
        let re_space = Regex::new(r"\s+").unwrap();
        cleaned = re_space.replace_all(&cleaned, " ").trim().to_string();

        cleaned
    }

    /// Parses raw candidate string or path into structured candidate tokens
    pub fn parse_media_candidate(input: &str, url: Option<&str>) -> ParsedCandidate {
        let raw_input = input.trim().to_string();
        let normalized_path = raw_input.replace('\\', "/");
        let segments: Vec<&str> = normalized_path.split('/').filter(|s| !s.trim().is_empty()).collect();

        let filename = segments.last().copied().unwrap_or(input.trim());
        let parent_folders: Vec<&str> = if segments.len() > 1 {
            segments[..segments.len() - 1].to_vec()
        } else {
            Vec::new()
        };

        // Folder Context
        let mut folder_season_number: Option<u32> = None;
        let mut series_folder: Option<String> = None;
        let mut is_specials_folder = false;

        let re_specials = Regex::new(r"(?i)(?:specials|season\s*0\b)").unwrap();
        let re_season_folder = Regex::new(r"(?i)\b(?:season|series)\s*0*(\d{1,3})\b").unwrap();
        let re_s_folder = Regex::new(r"(?i)\bS0*(\d{1,3})\b").unwrap();

        for (idx, seg) in parent_folders.iter().enumerate().rev() {
            if re_specials.is_match(seg) {
                folder_season_number = Some(0);
                is_specials_folder = true;
                if idx > 0 {
                    series_folder = Some(parent_folders[idx - 1].to_string());
                }
                break;
            }
            if let Some(caps) = re_season_folder.captures(seg).or_else(|| re_s_folder.captures(seg)) {
                if let Ok(s_num) = caps[1].parse::<u32>() {
                    folder_season_number = Some(s_num);
                    if idx > 0 {
                        series_folder = Some(parent_folders[idx - 1].to_string());
                    }
                    break;
                }
            }
        }

        let mut season_number: Option<u32> = folder_season_number;
        let mut episode_number: Option<u32> = None;
        let mut episode_number_end: Option<u32> = None;
        let mut is_multi_episode = false;
        let mut is_special = is_specials_folder;

        // 1. Check Multi-Episode Pattern: S01E02-E03, S01E02-03, S01E02_to_e03
        let re_multi = Regex::new(r"(?i)\bS0*(\d{1,3})[\s._-]*(?:EP|E)0*(\d{1,4})[\s._-]*(?:-|to|(?:EP|E))[\s._-]*0*(\d{1,4})\b").unwrap();
        if let Some(caps) = re_multi.captures(filename) {
            let s = caps[1].parse::<u32>().unwrap_or(1);
            let ep_start = caps[2].parse::<u32>().unwrap_or(1);
            let ep_end = caps[3].parse::<u32>().unwrap_or(ep_start);

            season_number = Some(s);
            episode_number = Some(ep_start);
            episode_number_end = Some(ep_end);
            is_multi_episode = ep_end > ep_start;
            if s == 0 {
                is_special = true;
            }
        }

        // 2. Standard S01E02 pattern (including Specials S00E01)
        if episode_number.is_none() {
            let re_standard = Regex::new(r"(?i)\bS0*(\d{1,3})[\s._-]*(?:EP|E|Episode)[\s._-]?0*(\d{1,4})\b").unwrap();
            if let Some(caps) = re_standard.captures(filename) {
                let s = caps[1].parse::<u32>().unwrap_or(1);
                let ep = caps[2].parse::<u32>().unwrap_or(1);
                season_number = Some(s);
                episode_number = Some(ep);
                if s == 0 {
                    is_special = true;
                }
            }
        }

        // 3. 01x02 or 1x02 format
        if episode_number.is_none() {
            let re_x = Regex::new(r"(?i)\b0*(\d{1,2})x0*(\d{1,3})\b").unwrap();
            if let Some(caps) = re_x.captures(filename) {
                let s = caps[1].parse::<u32>().unwrap_or(1);
                let ep = caps[2].parse::<u32>().unwrap_or(1);
                season_number = Some(s);
                episode_number = Some(ep);
                if s == 0 {
                    is_special = true;
                }
            }
        }

        // 4. "Season 1 Episode 2" word pattern
        if episode_number.is_none() {
            let re_word = Regex::new(r"(?i)\bSeason[\s._-]*0*(\d{1,3})[\s._-]+Episode[\s._-]*0*(\d{1,4})\b").unwrap();
            if let Some(caps) = re_word.captures(filename) {
                let s = caps[1].parse::<u32>().unwrap_or(1);
                let ep = caps[2].parse::<u32>().unwrap_or(1);
                season_number = Some(s);
                episode_number = Some(ep);
                if s == 0 {
                    is_special = true;
                }
            }
        }

        // 5. Standalone episode marker: "EP02" or "Episode 2"
        if episode_number.is_none() {
            let re_ep_only = Regex::new(r"(?i)\b(?:EP|Episode)[\s._-]*0*(\d{1,4})\b").unwrap();
            if let Some(caps) = re_ep_only.captures(filename) {
                if let Ok(ep) = caps[1].parse::<u32>() {
                    // Guardrail against 264, 265, 720, 1080
                    if ep < 400 && ![264, 265, 266].contains(&ep) {
                        episode_number = Some(ep);
                        if season_number.is_none() {
                            season_number = folder_season_number.or(Some(1));
                        }
                    }
                }
            }
        }

        // 6. In a season folder, check leading numbers: "03 - The Pollywog.mkv", "03.mkv"
        if episode_number.is_none() && folder_season_number.is_some() {
            let re_leading = Regex::new(r"(?i)^(?:(?:ep|episode)\s*)?0*([1-9]\d{0,2})\s*[-_. ]").unwrap();
            let re_leading_dot = Regex::new(r"(?i)^(?:(?:ep|episode)\s*)?0*([1-9]\d{0,2})\.(?:mkv|mp4|avi|webm)").unwrap();
            if let Some(caps) = re_leading.captures(filename).or_else(|| re_leading_dot.captures(filename)) {
                if let Ok(ep) = caps[1].parse::<u32>() {
                    if ep < 300 && ![264, 265, 266].contains(&ep) {
                        episode_number = Some(ep);
                    }
                }
            }
        }

        // Determine Pack vs Episode vs Movie
        let is_pack = Regex::new(r"(?i)\b(?:complete|season\s*pack|all\s*episodes|zip\s*pack)\b").unwrap().is_match(filename)
            || (folder_season_number.is_some() && filename.to_lowercase().ends_with(".zip"));

        // Precedence: If episode markers or series-folder context exist, classify as TV!
        let has_episode_marker = episode_number.is_some();
        let has_series_folder_context = folder_season_number.is_some() || is_specials_folder || series_folder.is_some();
        let is_tv = has_episode_marker || has_series_folder_context || is_pack;

        let media_type = if is_tv { "tv".to_string() } else { "movie".to_string() };
        let is_episode = is_tv && has_episode_marker;

        // Release Year Extraction: Parenthesized or bracketed (19xx|20xx) takes precedence over title digits
        let re_paren_year = Regex::new(r"[\(\[]\s*(19\d\d|20\d\d)\s*[\)\]]").unwrap();
        let re_raw_year = Regex::new(r"\b(19\d\d|20\d\d)\b").unwrap();

        let year: Option<u32> = re_paren_year
            .captures(filename)
            .or_else(|| re_raw_year.captures(filename))
            .and_then(|caps| caps[1].parse::<u32>().ok());

        let mut series_title: Option<String> = None;
        let mut movie_title: Option<String> = None;
        let mut embedded_episode_title: Option<String> = None;

        if is_tv {
            if let Some(ref s_fold) = series_folder {
                if s_fold.len() >= 2 && !Regex::new(r"(?i)^(?:season|episodes|tv|downloads)\b").unwrap().is_match(s_fold) {
                    let cleaned_folder = Self::strip_filename_noise(&re_raw_year.replace_all(s_fold, ""));
                    if cleaned_folder.len() >= 2 {
                        series_title = Some(cleaned_folder);
                    }
                }
            }

            if series_title.is_none() {
                let re_marker_prefix = Regex::new(r"(?i)^(.*?)(?:[\s._()\[\]\-]s0*\d{1,3}|[\s._()\[\]\-]season[\s._-]?\d{1,3}|[\s._()\[\]\-]e0*\d{1,4}|[\s._()\[\]\-]0*\d{1,2}x0*\d{1,3})").unwrap();
                if let Some(caps) = re_marker_prefix.captures(filename) {
                    let candidate = Self::strip_filename_noise(&re_raw_year.replace_all(&caps[1], ""));
                    if candidate.len() >= 2 {
                        series_title = Some(candidate);
                    }
                }
            }

            if series_title.is_none() {
                series_title = Some(Self::strip_filename_noise(&re_raw_year.replace_all(filename, "")));
            }

            // Extract embedded episode title: "S01E02 - The Weirdo [1080p]"
            let re_after_marker = Regex::new(r"(?i)(?:S0*\d{1,3}[\s._-]*(?:EP|E|Episode)[\s._-]?0*\d{1,4}|0*\d{1,2}x0*\d{1,3}|Season\s*0*\d{1,3}\s*Episode\s*0*\d{1,4})[\s._-]+(.*)").unwrap();
            if let Some(caps) = re_after_marker.captures(filename) {
                let raw_after = &caps[1];
                let re_stop = Regex::new(r"(?i)^(.*?)(?:\.(?:mkv|mp4|avi)|[\s._()\[\]\-](?:2160p|1080p|720p|480p|4k|web-?dl|bluray|hevc|x264|x265|ddp|hindi|english|amzn|nf|dsnp))").unwrap();
                let ep_part = re_stop.captures(raw_after).map(|c| c[1].to_string()).unwrap_or_else(|| raw_after.to_string());
                let clean_ep = ep_part.replace(['(', ')', '[', ']', '{', '}', '-', '_', '.', ':', '|'], " ");
                let re_space = Regex::new(r"\s+").unwrap();
                let clean_ep = re_space.replace_all(&clean_ep, " ").trim().to_string();
                if clean_ep.len() >= 2 && !Regex::new(r"(?i)^(?:mkv|mp4|part\s*\d+|cd\s*\d+)$").unwrap().is_match(&clean_ep) {
                    embedded_episode_title = Some(clean_ep);
                }
            }
        } else {
            // Movie Title
            if let Some(y) = year {
                let year_pattern = format!(r"(?i)^(.*?)(?:[\s._()\[\]\-]|\b){}\b", y);
                if let Ok(re_before_year) = Regex::new(&year_pattern) {
                    if let Some(caps) = re_before_year.captures(filename) {
                        let cleaned = Self::strip_filename_noise(&caps[1]);
                        if cleaned.len() >= 2 {
                            movie_title = Some(cleaned);
                        }
                    }
                }
            }
            if movie_title.is_none() {
                let cleaned = if let Some(y) = year {
                    Self::strip_filename_noise(&filename.replace(&y.to_string(), ""))
                } else {
                    Self::strip_filename_noise(filename)
                };
                movie_title = Some(cleaned);
            }
        }

        let normalized_query = if is_tv {
            series_title.clone().unwrap_or_else(|| Self::strip_filename_noise(filename))
        } else {
            movie_title.clone().unwrap_or_else(|| Self::strip_filename_noise(filename))
        };

        // Resolution and Codec detection
        let lower_fn = filename.to_lowercase();
        let resolution = if lower_fn.contains("2160p") || lower_fn.contains("4k") {
            Some("2160p".to_string())
        } else if lower_fn.contains("1080p") {
            Some("1080p".to_string())
        } else if lower_fn.contains("720p") {
            Some("720p".to_string())
        } else if lower_fn.contains("480p") {
            Some("480p".to_string())
        } else {
            None
        };

        let codec = if lower_fn.contains("x265") || lower_fn.contains("hevc") || lower_fn.contains("h.265") {
            Some("x265".to_string())
        } else if lower_fn.contains("x264") || lower_fn.contains("avc") || lower_fn.contains("h.264") {
            Some("x264".to_string())
        } else {
            None
        };

        let audio = if lower_fn.contains("atmos") {
            Some("Dolby Atmos".to_string())
        } else if lower_fn.contains("ddp5.1") || lower_fn.contains("ddp 5.1") || lower_fn.contains("5.1") {
            Some("Dolby Digital Plus 5.1".to_string())
        } else {
            None
        };

        ParsedCandidate {
            raw_input,
            source_path: if normalized_path != filename { Some(normalized_path) } else { None },
            url: url.map(|u| u.to_string()),
            media_type,
            is_episode,
            is_pack,
            is_special,
            is_multi_episode,
            series_title,
            movie_title,
            normalized_query,
            year,
            season_number,
            episode_number,
            episode_number_end,
            embedded_episode_title,
            resolution,
            codec,
            audio,
            series_folder,
            season_folder: folder_season_number.map(|s| format!("Season {}", s)),
        }
    }

    /// End-to-end identification with timing, Upstash cache, and provider metadata resolution
    pub async fn identify_media_item(
        &self,
        request: &IdentifyRequest,
        job_id: &str,
    ) -> MediaIdentificationResult {
        let total_start = Instant::now();

        // 1. Stage: Candidate Parsing
        let parse_start = Instant::now();
        let parsed = Self::parse_media_candidate(&request.text, request.url.as_deref());
        let parse_elapsed = parse_start.elapsed();
        info!(
            job_id = %job_id,
            stage = "parse",
            elapsed_ms = parse_elapsed.as_millis(),
            query = %parsed.normalized_query,
            media_type = %parsed.media_type,
            "Parsed candidate tokens"
        );

        let effective_type = request.forced_type.as_deref().unwrap_or(&parsed.media_type);
        let effective_query = request.forced_title.as_deref().unwrap_or(&parsed.normalized_query);
        let effective_year = request.forced_year.or(parsed.year);

        // 2. Check Upstash Short-Lived Cache (instant <5ms return on hit)
        let cache_hash = format!(
            "{:x}",
            Sha256::digest(format!("{}:{}:{:?}:{:?}", effective_type, effective_query, effective_year, request.forced_tmdb_id).as_bytes())
        );

        if let Some(mut cached) = self.upstash.get_cached_identification(&cache_hash).await {
            let total_elapsed = total_start.elapsed();
            cached.timing_ms.total_ms = total_elapsed.as_millis() as u64;
            info!(job_id = %job_id, stage = "cache", elapsed_ms = total_elapsed.as_millis(), "Cache hit in Upstash");
            return cached;
        }

        // 3. Stage: TMDB Metadata Lookup
        let tmdb_start = Instant::now();
        let (matched_item, alternatives, is_ambiguous) = self
            .search_tmdb_provider(effective_query, effective_type, effective_year, request.forced_tmdb_id)
            .await;
        let tmdb_elapsed = tmdb_start.elapsed();

        info!(
            job_id = %job_id,
            stage = "metadata_lookup",
            elapsed_ms = tmdb_elapsed.as_millis(),
            matched = matched_item.is_some(),
            ambiguous = is_ambiguous,
            "Queried metadata provider"
        );

        let result_id = format!("mid_{}_{}", job_id, &cache_hash[..8]);

        // Handle Ambiguous
        if is_ambiguous {
            let total_elapsed = total_start.elapsed();
            return MediaIdentificationResult {
                id: result_id,
                raw_input: request.text.clone(),
                url: request.url.clone(),
                source_path: parsed.source_path.clone(),
                status: "ambiguous".to_string(),
                confidence: "medium".to_string(),
                reason: Some(format!(
                    "Ambiguous match: multiple {} found with title \"{}\". Specify the release year to resolve.",
                    if effective_type == "tv" { "TV series" } else { "movies" },
                    effective_query
                )),
                media_type: effective_type.to_string(),
                tmdb_id: None,
                title: effective_query.to_string(),
                year: effective_year,
                release_date: None,
                poster_path: None,
                backdrop_path: None,
                overview: None,
                episode_details: None,
                alternatives,
                user_corrected: None,
                timing_ms: TimingStats {
                    fetch_ms: None,
                    parse_ms: parse_elapsed.as_millis() as u64,
                    metadata_lookup_ms: Some(tmdb_elapsed.as_millis() as u64),
                    total_ms: total_elapsed.as_millis() as u64,
                },
                timestamp: chrono_now_string(),
            };
        }

        // Handle Unmatched
        let matched = match matched_item {
            Some(m) => m,
            None => {
                let total_elapsed = total_start.elapsed();
                return MediaIdentificationResult {
                    id: result_id,
                    raw_input: request.text.clone(),
                    url: request.url.clone(),
                    source_path: parsed.source_path.clone(),
                    status: "unmatched".to_string(),
                    confidence: "none".to_string(),
                    reason: Some(format!(
                        "No matching {} found on TMDB for query \"{}\"{}.",
                        if effective_type == "tv" { "TV series" } else { "feature film" },
                        effective_query,
                        effective_year.map(|y| format!(" ({})", y)).unwrap_or_default()
                    )),
                    media_type: effective_type.to_string(),
                    tmdb_id: None,
                    title: effective_query.to_string(),
                    year: effective_year,
                    release_date: None,
                    poster_path: None,
                    backdrop_path: None,
                    overview: None,
                    episode_details: None,
                    alternatives: Vec::new(),
                    user_corrected: None,
                    timing_ms: TimingStats {
                        fetch_ms: None,
                        parse_ms: parse_elapsed.as_millis() as u64,
                        metadata_lookup_ms: Some(tmdb_elapsed.as_millis() as u64),
                        total_ms: total_elapsed.as_millis() as u64,
                    },
                    timestamp: chrono_now_string(),
                };
            }
        };

        // Matched details extraction
        let tmdb_id = matched["id"].as_u64();
        let official_title = matched["title"]
            .as_str()
            .or_else(|| matched["name"].as_str())
            .unwrap_or(effective_query)
            .to_string();

        let release_date = matched["release_date"]
            .as_str()
            .or_else(|| matched["first_air_date"].as_str())
            .map(|s| s.to_string());

        let resolved_year = release_date
            .as_ref()
            .and_then(|d| d.get(..4))
            .and_then(|y| y.parse::<u32>().ok())
            .or(effective_year);

        let poster_path = matched["poster_path"].as_str().map(|s| s.to_string());
        let backdrop_path = matched["backdrop_path"].as_str().map(|s| s.to_string());
        let overview = matched["overview"].as_str().map(|s| s.to_string());

        // TV Episode exact season/episode resolution
        let mut episode_details: Option<EpisodeDetails> = None;
        if effective_type == "tv" && (parsed.is_episode || parsed.season_number.is_some()) {
            let s_num = parsed.season_number.unwrap_or(1);
            let ep_num = parsed.episode_number.unwrap_or(1);

            let (official_ep_name, ep_overview, still_path) = if let Some(show_id) = tmdb_id {
                self.fetch_tmdb_episode_details(show_id, s_num, ep_num).await
            } else {
                (None, None, None)
            };

            let ep_title = official_ep_name
                .clone()
                .or_else(|| parsed.embedded_episode_title.clone())
                .unwrap_or_else(|| format!("Episode {}", ep_num));

            episode_details = Some(EpisodeDetails {
                season_number: s_num,
                episode_number: ep_num,
                episode_number_end: parsed.episode_number_end,
                episode_title: ep_title,
                official_episode_title: official_ep_name,
                episode_overview: ep_overview,
                still_path,
                is_special: s_num == 0 || parsed.is_special,
                is_multi_episode: parsed.is_multi_episode,
            });
        }

        let total_elapsed = total_start.elapsed();
        let result = MediaIdentificationResult {
            id: result_id,
            raw_input: request.text.clone(),
            url: request.url.clone(),
            source_path: parsed.source_path.clone(),
            status: "matched".to_string(),
            confidence: if request.forced_tmdb_id.is_some() { "verified".to_string() } else { "high".to_string() },
            reason: None,
            media_type: effective_type.to_string(),
            tmdb_id,
            title: official_title,
            year: resolved_year,
            release_date,
            poster_path,
            backdrop_path,
            overview,
            episode_details,
            alternatives,
            user_corrected: Some(request.forced_tmdb_id.is_some() || request.forced_year.is_some()),
            timing_ms: TimingStats {
                fetch_ms: None,
                parse_ms: parse_elapsed.as_millis() as u64,
                metadata_lookup_ms: Some(tmdb_elapsed.as_millis() as u64),
                total_ms: total_elapsed.as_millis() as u64,
            },
            timestamp: chrono_now_string(),
        };

        // Cache result in Upstash Redis (1 hour TTL)
        self.upstash.set_cached_identification(&cache_hash, &result, 3600).await;

        result
    }

    /// Queries TMDB provider with exact scoring and disambiguation
    async fn search_tmdb_provider(
        &self,
        query: &str,
        media_type: &str,
        year: Option<u32>,
        forced_id: Option<u64>,
    ) -> (Option<Value>, Vec<MediaIdentificationAlternative>, bool) {
        if let Some(id) = forced_id {
            if let Some(detail) = self.fetch_tmdb_details_by_id(media_type, id).await {
                return (Some(detail), Vec::new(), false);
            }
        }

        if query.trim().len() < 2 || self.config.tmdb_api_key.is_empty() {
            return (None, Vec::new(), false);
        }

        let endpoint = if media_type == "tv" { "search/tv" } else { "search/movie" };
        let url = format!(
            "https://api.themoviedb.org/3/{}?api_key={}&query={}&include_adult=false",
            endpoint,
            self.config.tmdb_api_key,
            urlencoding::encode(query)
        );

        let resp = match self.client.get(&url).send().await {
            Ok(r) if r.status().is_success() => r,
            _ => return (None, Vec::new(), false),
        };

        let data = match resp.json::<Value>().await {
            Ok(d) => d,
            Err(_) => return (None, Vec::new(), false),
        };

        let results = match data["results"].as_array() {
            Some(arr) if !arr.is_empty() => arr,
            _ => return (None, Vec::new(), false),
        };

        let norm_q = query.to_lowercase().chars().filter(|c| c.is_alphanumeric()).collect::<String>();

        let mut scored: Vec<(Value, i32, Option<u32>, String)> = results
            .iter()
            .map(|item| {
                let title = item["title"]
                    .as_str()
                    .or_else(|| item["name"].as_str())
                    .unwrap_or("")
                    .to_string();
                let norm_title = title.to_lowercase().chars().filter(|c| c.is_alphanumeric()).collect::<String>();
                let rel_date = item["release_date"].as_str().or_else(|| item["first_air_date"].as_str()).unwrap_or("");
                let item_year = rel_date.get(..4).and_then(|y| y.parse::<u32>().ok());

                let mut score = 0;
                if norm_title == norm_q {
                    score += 50;
                } else if norm_title.starts_with(&norm_q) || norm_q.starts_with(&norm_title) {
                    score += 30;
                } else {
                    score += 10;
                }

                if let (Some(target_y), Some(y)) = (year, item_year) {
                    if target_y == y {
                        score += 40;
                    } else if (target_y as i32 - y as i32).abs() <= 1 {
                        score += 20;
                    } else {
                        score -= 15;
                    }
                }

                (item.clone(), score, item_year, title)
            })
            .collect();

        scored.sort_by(|a, b| b.1.cmp(&a.1));

        let best = &scored[0];
        let second_best = scored.get(1);

        // Ambiguous check: top 2 have close scores, same title, different years, and no target year provided
        let is_ambiguous = second_best.is_some()
            && year.is_none()
            && second_best.unwrap().1 >= best.1 - 5
            && best.3.to_lowercase() == second_best.unwrap().3.to_lowercase()
            && best.2 != second_best.unwrap().2;

        let alternatives: Vec<MediaIdentificationAlternative> = scored
            .iter()
            .take(5)
            .map(|(item, _, y, t)| MediaIdentificationAlternative {
                tmdb_id: item["id"].as_u64().unwrap_or(0),
                title: t.clone(),
                year: *y,
                media_type: media_type.to_string(),
                poster_path: item["poster_path"].as_str().map(|s| s.to_string()),
                overview: item["overview"].as_str().map(|s| s.to_string()),
            })
            .collect();

        if is_ambiguous {
            (None, alternatives, true)
        } else {
            (Some(best.0.clone()), alternatives, false)
        }
    }

    async fn fetch_tmdb_details_by_id(&self, media_type: &str, id: u64) -> Option<Value> {
        if self.config.tmdb_api_key.is_empty() {
            return None;
        }
        let url = format!(
            "https://api.themoviedb.org/3/{}/{}?api_key={}",
            media_type, id, self.config.tmdb_api_key
        );
        match self.client.get(&url).send().await {
            Ok(r) if r.status().is_success() => r.json::<Value>().await.ok(),
            _ => None,
        }
    }

    async fn fetch_tmdb_episode_details(
        &self,
        show_id: u64,
        season: u32,
        episode: u32,
    ) -> (Option<String>, Option<String>, Option<String>) {
        if self.config.tmdb_api_key.is_empty() {
            return (None, None, None);
        }
        let url = format!(
            "https://api.themoviedb.org/3/tv/{}/season/{}?api_key={}",
            show_id, season, self.config.tmdb_api_key
        );

        match self.client.get(&url).send().await {
            Ok(r) if r.status().is_success() => {
                if let Ok(data) = r.json::<Value>().await {
                    if let Some(episodes) = data["episodes"].as_array() {
                        for ep in episodes {
                            if ep["episode_number"].as_u64() == Some(episode as u64) {
                                let name = ep["name"].as_str().map(|s| s.to_string());
                                let overview = ep["overview"].as_str().map(|s| s.to_string());
                                let still = ep["still_path"].as_str().map(|s| s.to_string());
                                return (name, overview, still);
                            }
                        }
                    }
                }
            }
            _ => {}
        }
        (None, None, None)
    }
}

fn chrono_now_string() -> String {
    format!("{:?}", std::time::SystemTime::now())
}
mod urlencoding {
    pub fn encode(s: &str) -> String {
        url::form_urlencoded::byte_serialize(s.as_bytes()).collect()
    }
}
