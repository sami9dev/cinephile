use reqwest::{Client, redirect::Policy};
use scraper::{Html, Selector};
use std::time::{Duration, Instant};
use tracing::{info, warn};

use crate::models::{ScrapedRelease, TimingStats};
use crate::security::{is_private_or_restricted_ip, validate_url};

pub struct ContentScraper {
    client: Client,
}

impl ContentScraper {
    pub fn new(timeout_ms: u64) -> Self {
        // Custom redirect policy validating that each hop is safe from SSRF
        let redirect_policy = Policy::custom(|attempt| {
            if attempt.previous().len() >= 5 {
                return attempt.stop();
            }
            let next_url = attempt.url();
            let host_str = match next_url.host_str() {
                Some(h) => h.to_lowercase(),
                None => return attempt.stop(),
            };

            // Block redirect to localhost / private IP
            if host_str == "localhost"
                || host_str.ends_with(".localhost")
                || host_str.ends_with(".local")
                || host_str.ends_with(".internal")
            {
                warn!("Blocked SSRF redirect to localhost/internal: {}", next_url);
                return attempt.stop();
            }

            if let Ok(ip) = host_str.parse() {
                if is_private_or_restricted_ip(&ip) {
                    warn!("Blocked SSRF redirect to private IP: {}", next_url);
                    return attempt.stop();
                }
            }

            attempt.follow()
        });

        let client = Client::builder()
            .timeout(Duration::from_millis(timeout_ms))
            .redirect(redirect_policy)
            .user_agent("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36")
            .pool_max_idle_per_host(10)
            .pool_idle_timeout(Duration::from_secs(90))
            .build()
            .unwrap_or_default();

        Self { client }
    }

    /// Fetches and parses a movie or series content page safely
    pub async fn fetch_and_parse(
        &self,
        raw_url: &str,
        job_id: &str,
    ) -> Result<(String, bool, Vec<ScrapedRelease>, TimingStats), String> {
        let total_start = Instant::now();

        // 1. SSRF URL Validation
        let validated_url = validate_url(raw_url)?;

        // 2. Stage: Fetch HTML
        let fetch_start = Instant::now();
        let resp = self
            .client
            .get(validated_url.as_str())
            .send()
            .await
            .map_err(|e| format!("HTTP request failed: {}", e))?;

        if !resp.status().is_success() {
            return Err(format!("Server returned HTTP status {}", resp.status()));
        }

        let body = resp
            .text()
            .await
            .map_err(|e| format!("Failed to read response body: {}", e))?;
        let fetch_elapsed = fetch_start.elapsed();

        info!(
            job_id = %job_id,
            stage = "fetch",
            elapsed_ms = fetch_elapsed.as_millis(),
            bytes = body.len(),
            "Fetched remote HTML page"
        );

        // 3. Stage: Parse HTML
        let parse_start = Instant::now();
        let document = Html::parse_document(&body);

        // Title Extraction
        let title_selector = Selector::parse("h1.entry-title, h1, title").unwrap();
        let raw_title = document
            .select(&title_selector)
            .next()
            .map(|el| el.text().collect::<Vec<_>>().join(" ").trim().to_string())
            .unwrap_or_else(|| "Content Title".to_string());

        let clean_title = raw_title
            .replace("Download", "")
            .replace("Free", "")
            .trim()
            .to_string();

        let is_movie = validated_url.path().contains("/movies/")
            || body.to_lowercase().contains("movie info")
            || (!validated_url.path().contains("/series/") && !body.to_lowercase().contains("season"));

        // Extract Download Buttons / Links
        let mut releases = Vec::new();
        let a_selector = Selector::parse("a[href]").unwrap();

        for element in document.select(&a_selector) {
            if let Some(href) = element.value().attr("href") {
                let text = element.text().collect::<Vec<_>>().join(" ");
                let class = element.value().attr("class").unwrap_or("");
                let href_lower = href.to_lowercase();
                let text_lower = text.to_lowercase();

                let is_download_button = href_lower.contains("link.xdmovies.")
                    || href_lower.contains("hubcloud")
                    || href_lower.contains("/download/")
                    || class.contains("download")
                    || text_lower.contains("download")
                    || text_lower.contains("720p")
                    || text_lower.contains("1080p")
                    || text_lower.contains("2160p")
                    || text_lower.contains("zip");

                if is_download_button && (href.starts_with("http://") || href.starts_with("https://")) {
                    let quality = detect_quality(&text);
                    let (season, episode, scope) = detect_season_episode(&text, is_movie);
                    let size_display = detect_size(&text);

                    let destination_url = if href_lower.contains("hubcloud") {
                        Some(href.to_string())
                    } else {
                        None
                    };

                    releases.push(ScrapedRelease {
                        title: if !text.trim().is_empty() && text.len() > 5 { text.trim().to_string() } else { clean_title.clone() },
                        mediator_url: href.to_string(),
                        destination_url,
                        quality,
                        scope,
                        season,
                        episode,
                        size_display,
                        identified: None,
                    });
                }
            }
        }

        let parse_elapsed = parse_start.elapsed();
        let total_elapsed = total_start.elapsed();

        info!(
            job_id = %job_id,
            stage = "parse",
            elapsed_ms = parse_elapsed.as_millis(),
            releases_count = releases.len(),
            "Parsed download releases"
        );

        let timing = TimingStats {
            fetch_ms: Some(fetch_elapsed.as_millis() as u64),
            parse_ms: parse_elapsed.as_millis() as u64,
            metadata_lookup_ms: None,
            total_ms: total_elapsed.as_millis() as u64,
        };

        Ok((clean_title, is_movie, releases, timing))
    }
}

fn detect_quality(text: &str) -> String {
    let lower = text.to_lowercase();
    if lower.contains("2160p") || lower.contains("4k") || lower.contains("uhd") {
        "2160p".to_string()
    } else if lower.contains("1080p") || lower.contains("fhd") {
        "1080p".to_string()
    } else if lower.contains("720p") || lower.contains("hd") {
        "720p".to_string()
    } else if lower.contains("480p") || lower.contains("sd") {
        "480p".to_string()
    } else {
        "1080p".to_string()
    }
}

fn detect_size(text: &str) -> Option<String> {
    let re = regex::Regex::new(r"(?i)\b(\d+(?:\.\d+)?\s*(?:GB|MB))\b").unwrap();
    re.captures(text).map(|caps| caps[1].to_string())
}

fn detect_season_episode(text: &str, is_movie: bool) -> (Option<u32>, Option<u32>, String) {
    if is_movie {
        return (None, None, "movie".to_string());
    }

    let lower = text.to_lowercase();

    // Check for zip/pack
    if lower.contains("zip") || lower.contains("pack") || lower.contains("complete") {
        let re_s = regex::Regex::new(r"(?i)\bS0*(\d{1,2})\b").unwrap();
        let season = re_s.captures(text).and_then(|c| c[1].parse::<u32>().ok()).or(Some(1));
        return (season, None, "pack".to_string());
    }

    // Check SxxExx
    let re_se = regex::Regex::new(r"(?i)\bS0*(\d{1,2})[\s._-]*(?:E|EP)0*(\d{1,3})\b").unwrap();
    if let Some(caps) = re_se.captures(text) {
        let s = caps[1].parse::<u32>().ok();
        let e = caps[2].parse::<u32>().ok();
        return (s, e, "episode".to_string());
    }

    (None, None, "episode".to_string())
}
