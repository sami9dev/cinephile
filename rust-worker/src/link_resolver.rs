use reqwest::redirect::Policy;
use reqwest::Client;
use scraper::{Html, Selector};
use serde::{Deserialize, Serialize};
use std::time::{Duration, Instant};
use tracing::{info, warn};

use crate::upstash::sanitize_url_for_logging;

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "snake_case")]
pub enum ResolveStatus {
    Success,
    Cached,
    ChallengeRequired,
    RateLimited,
    Failed,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct LinkResolveResult {
    pub source_url: String,
    pub sanitized_url: String,
    pub destination_url: Option<String>,
    pub status: ResolveStatus,
    pub message: String,
    pub elapsed_ms: u64,
    pub from_cache: bool,
}

pub struct SafeLinkResolver {
    client: Client,
}

impl SafeLinkResolver {
    pub fn new(timeout_ms: u64) -> Self {
        let client = Client::builder()
            .timeout(Duration::from_millis(timeout_ms))
            .redirect(Policy::limited(10))
            .pool_idle_timeout(Duration::from_secs(30))
            .user_agent("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36")
            .build()
            .unwrap_or_default();

        Self { client }
    }

    /// Checks if a URL is already a destination (e.g. HubCloud)
    pub fn is_destination_url(url_str: &str) -> bool {
        let lower = url_str.to_lowercase();
        lower.contains("hubcloud")
            || lower.contains("drive.google.com")
            || lower.contains("mega.nz")
            || lower.contains("1fichier.com")
    }

    /// Checks if content contains access challenges (Turnstile, Cloudflare, etc.)
    pub fn detect_access_challenge(html: &str) -> bool {
        let lower = html.to_lowercase();
        lower.contains("cf-turnstile")
            || lower.contains("challenges.cloudflare.com")
            || lower.contains("cf-browser-verification")
            || lower.contains("id=\"challenge-form\"")
            || lower.contains("id=\"turnstile-wrapper\"")
            || (lower.contains("just a moment...") && lower.contains("enable javascript and cookies"))
    }

    /// Resolves a single mediator link safely without automated challenge bypass
    pub async fn resolve_link(&self, raw_url: &str) -> LinkResolveResult {
        let start = Instant::now();
        let sanitized = sanitize_url_for_logging(raw_url);

        // 1. If it is already a direct destination
        if Self::is_destination_url(raw_url) {
            return LinkResolveResult {
                source_url: raw_url.to_string(),
                sanitized_url: sanitized,
                destination_url: Some(raw_url.to_string()),
                status: ResolveStatus::Success,
                message: "Direct destination link recognized".to_string(),
                elapsed_ms: start.elapsed().as_millis() as u64,
                from_cache: false,
            };
        }

        // 2. Fetch the mediator page, safely inspecting status & challenges
        let resp = match self.client.get(raw_url).send().await {
            Ok(r) => r,
            Err(e) => {
                warn!(target_url = %sanitized, error = %e, "HTTP connection error during resolution");
                return LinkResolveResult {
                    source_url: raw_url.to_string(),
                    sanitized_url: sanitized,
                    destination_url: None,
                    status: ResolveStatus::Failed,
                    message: format!("Connection error: {}", e),
                    elapsed_ms: start.elapsed().as_millis() as u64,
                    from_cache: false,
                };
            }
        };

        // 3. HTTP 429 Rate Limit Check: STOP immediately and report backoff requested
        let status = resp.status();
        if status.as_u16() == 429 {
            warn!(target_url = %sanitized, "Target service returned HTTP 429 Too Many Requests");
            return LinkResolveResult {
                source_url: raw_url.to_string(),
                sanitized_url: sanitized,
                destination_url: None,
                status: ResolveStatus::RateLimited,
                message: "Target service requested backoff (HTTP 429). Job stopped to respect service limits.".to_string(),
                elapsed_ms: start.elapsed().as_millis() as u64,
                from_cache: false,
            };
        }

        // 4. Check if final redirected URL reached a HubCloud destination
        let final_url = resp.url().to_string();
        if Self::is_destination_url(&final_url) {
            info!(target_url = %sanitized, "Successfully resolved destination via HTTP redirects");
            return LinkResolveResult {
                source_url: raw_url.to_string(),
                sanitized_url: sanitized,
                destination_url: Some(final_url),
                status: ResolveStatus::Success,
                message: "Destination resolved via redirects".to_string(),
                elapsed_ms: start.elapsed().as_millis() as u64,
                from_cache: false,
            };
        }

        // 5. Read response body
        let body_text = match resp.text().await {
            Ok(t) => t,
            Err(e) => {
                return LinkResolveResult {
                    source_url: raw_url.to_string(),
                    sanitized_url: sanitized,
                    destination_url: None,
                    status: ResolveStatus::Failed,
                    message: format!("Failed reading response body: {}", e),
                    elapsed_ms: start.elapsed().as_millis() as u64,
                    from_cache: false,
                };
            }
        };

        // 6. Access Challenge Check: If Cloudflare Turnstile or challenge is presented, STOP and report
        if Self::detect_access_challenge(&body_text) {
            warn!(target_url = %sanitized, "Access challenge detected (Turnstile / Cloudflare). Stopping job.");
            return LinkResolveResult {
                source_url: raw_url.to_string(),
                sanitized_url: sanitized,
                destination_url: None,
                status: ResolveStatus::ChallengeRequired,
                message: "Action required: Target presented an access challenge (Turnstile / Cloudflare). Challenge automation is prohibited.".to_string(),
                elapsed_ms: start.elapsed().as_millis() as u64,
                from_cache: false,
            };
        }

        // 7. Parse HTML for direct HubCloud download links
        let document = Html::parse_document(&body_text);
        if let Ok(a_sel) = Selector::parse("a[href]") {
            for element in document.select(&a_sel) {
                if let Some(href) = element.value().attr("href") {
                    if Self::is_destination_url(href) {
                        info!(target_url = %sanitized, "Resolved destination from HTML link element");
                        return LinkResolveResult {
                            source_url: raw_url.to_string(),
                            sanitized_url: sanitized,
                            destination_url: Some(href.to_string()),
                            status: ResolveStatus::Success,
                            message: "Destination resolved from page HTML".to_string(),
                            elapsed_ms: start.elapsed().as_millis() as u64,
                            from_cache: false,
                        };
                    }
                }
            }
        }

        // 8. If neither redirects nor HTML links resolved
        LinkResolveResult {
            source_url: raw_url.to_string(),
            sanitized_url: sanitized,
            destination_url: None,
            status: ResolveStatus::Failed,
            message: "Destination link could not be located on target page".to_string(),
            elapsed_ms: start.elapsed().as_millis() as u64,
            from_cache: false,
        }
    }
}
