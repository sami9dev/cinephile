use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct IdentifyRequest {
    pub text: String,
    pub url: Option<String>,
    pub source_path: Option<String>,
    pub forced_year: Option<u32>,
    pub forced_type: Option<String>,
    pub forced_tmdb_id: Option<u64>,
    pub forced_title: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ParsedCandidate {
    pub raw_input: String,
    pub source_path: Option<String>,
    pub url: Option<String>,
    pub media_type: String, // "movie" or "tv"
    pub is_episode: bool,
    pub is_pack: bool,
    pub is_special: bool,
    pub is_multi_episode: bool,
    pub series_title: Option<String>,
    pub movie_title: Option<String>,
    pub normalized_query: String,
    pub year: Option<u32>,
    pub season_number: Option<u32>,
    pub episode_number: Option<u32>,
    pub episode_number_end: Option<u32>,
    pub embedded_episode_title: Option<String>,
    pub resolution: Option<String>,
    pub codec: Option<String>,
    pub audio: Option<String>,
    pub series_folder: Option<String>,
    pub season_folder: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct EpisodeDetails {
    pub season_number: u32,
    pub episode_number: u32,
    pub episode_number_end: Option<u32>,
    pub episode_title: String,
    pub official_episode_title: Option<String>,
    pub episode_overview: Option<String>,
    pub still_path: Option<String>,
    pub is_special: bool,
    pub is_multi_episode: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MediaIdentificationAlternative {
    pub tmdb_id: u64,
    pub title: String,
    pub year: Option<u32>,
    pub media_type: String,
    pub poster_path: Option<String>,
    pub overview: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TimingStats {
    pub fetch_ms: Option<u64>,
    pub parse_ms: u64,
    pub metadata_lookup_ms: Option<u64>,
    pub total_ms: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MediaIdentificationResult {
    pub id: String,
    pub raw_input: String,
    pub url: Option<String>,
    pub source_path: Option<String>,
    pub status: String,     // "matched" | "ambiguous" | "unmatched"
    pub confidence: String, // "verified" | "high" | "medium" | "none"
    pub reason: Option<String>,
    pub media_type: String, // "movie" | "tv"
    pub tmdb_id: Option<u64>,
    pub title: String,
    pub year: Option<u32>,
    pub release_date: Option<String>,
    pub poster_path: Option<String>,
    pub backdrop_path: Option<String>,
    pub overview: Option<String>,
    pub episode_details: Option<EpisodeDetails>,
    pub alternatives: Vec<MediaIdentificationAlternative>,
    pub user_corrected: Option<bool>,
    pub timing_ms: TimingStats,
    pub timestamp: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ScrapeAndIdentifyRequest {
    pub url: String,
    pub save_to_supabase: Option<bool>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ScrapedRelease {
    pub title: String,
    pub mediator_url: String,
    pub destination_url: Option<String>,
    pub quality: String,
    pub scope: String, // "movie" | "episode" | "pack"
    pub season: Option<u32>,
    pub episode: Option<u32>,
    pub size_display: Option<String>,
    pub identified: Option<MediaIdentificationResult>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ScrapeAndIdentifyResponse {
    pub success: bool,
    pub content_url: String,
    pub title: String,
    pub is_movie: bool,
    pub total: usize,
    pub releases: Vec<ScrapedRelease>,
    pub timing_ms: TimingStats,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct HealthResponse {
    pub status: &'static str,
    pub version: &'static str,
    pub uptime_secs: u64,
    pub active_workers: usize,
    pub cache_connected: bool,
}
