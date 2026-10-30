use reqwest::Client;
use serde::{Deserialize, Serialize};
use serde_json::json;
use sha2::Digest;
use std::collections::HashSet;
use std::time::{Duration, Instant, SystemTime, UNIX_EPOCH};
use tracing::{info, warn};

use crate::config::Config;
use crate::link_resolver::{ResolveStatus, SafeLinkResolver};
use crate::upstash::{sanitize_url_for_logging, UpstashClient};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct LinkBatchJob {
    pub job_id: String,
    pub chat_id: Option<i64>,
    pub message_id: Option<i64>,
    pub bot_token: Option<String>,
    pub urls: Vec<String>,
    pub enqueued_at: u64, // ms timestamp
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct JobExecutionMetrics {
    pub job_id: String,
    pub status: String,
    pub queue_time_ms: u64,
    pub processing_time_ms: u64,
    pub total_urls: usize,
    pub completed_urls: usize,
    pub cache_hits: usize,
    pub cache_misses: usize,
    pub retries: usize,
    pub stop_reason: Option<String>,
}

pub struct QueueProcessor {
    config: Config,
    upstash: UpstashClient,
    link_resolver: SafeLinkResolver,
    http_client: Client,
}

impl QueueProcessor {
    pub fn new(config: Config, upstash: UpstashClient) -> Self {
        let http_client = Client::builder()
            .timeout(Duration::from_secs(10))
            .build()
            .unwrap_or_default();

        let link_resolver = SafeLinkResolver::new(config.request_timeout_ms);

        Self {
            config,
            upstash,
            link_resolver,
            http_client,
        }
    }

    /// Processes a single LinkBatchJob popped from Upstash Redis queue
    pub async fn process_link_job(&self, job: LinkBatchJob) -> JobExecutionMetrics {
        let now_ms = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap_or_default()
            .as_millis() as u64;

        let queue_time_ms = if now_ms > job.enqueued_at {
            now_ms - job.enqueued_at
        } else {
            0
        };

        let proc_start = Instant::now();
        let total_urls = job.urls.len();
        let mut completed_urls = 0;
        let mut cache_hits = 0;
        let mut cache_misses = 0;
        let mut retries = 0;
        let mut stop_reason = None;
        let job_status: String;

        info!(
            job_id = %job.job_id,
            queue_time_ms = queue_time_ms,
            total_urls = total_urls,
            "Starting link batch processing in cloud worker"
        );

        // Update initial status in Upstash
        let initial_meta = json!({
            "job_id": job.job_id,
            "status": "processing",
            "queue_time_ms": queue_time_ms,
            "total_urls": total_urls,
            "completed_urls": 0,
            "cache_hits": 0,
            "cache_misses": 0
        });
        self.upstash.set_job_meta(&job.job_id, &initial_meta, 86400).await;

        let mut resolved_pairs: Vec<(String, String)> = Vec::new();
        let mut challenged_pairs: Vec<(usize, String, String)> = Vec::new();
        let mut rate_limited_pairs: Vec<(usize, String)> = Vec::new();
        let mut challenged_hosts: HashSet<String> = HashSet::new();
        let mut rate_limited_hosts: HashSet<String> = HashSet::new();

        for (idx, raw_url) in job.urls.iter().enumerate() {
            let sanitized = sanitize_url_for_logging(raw_url);
            let mediator_hash = format!("{:x}", sha2::Sha256::digest(raw_url.as_bytes()));
            let host = url::Url::parse(raw_url)
                .ok()
                .and_then(|u| u.host_str().map(|s| s.to_lowercase()))
                .unwrap_or_default();

            // 1. PRIORITY 1: Check cache BEFORE resolving (for EVERY link in the batch)
            if let Some(dest) = self.upstash.get_cached_resolved_link(&mediator_hash).await {
                cache_hits += 1;
                completed_urls += 1;
                resolved_pairs.push((raw_url.clone(), dest));
                info!(
                    job_id = %job.job_id,
                    target = %sanitized,
                    "Cache hit for link in Upstash Redis"
                );
            } else if !host.is_empty() && challenged_hosts.contains(&host) {
                // Target host previously presented an access challenge in this batch;
                // do NOT hammer it with automated requests (respect challenge & backoff)
                warn!(
                    job_id = %job.job_id,
                    host = %host,
                    target = %sanitized,
                    "Target host is challenged; skipping automated request to avoid challenge bypass attempt"
                );
                challenged_pairs.push((idx + 1, sanitized.clone(), "Domain presents Turnstile/Cloudflare challenge (manual action required)".to_string()));
            } else if !host.is_empty() && rate_limited_hosts.contains(&host) {
                // Target host previously requested backoff (HTTP 429)
                warn!(
                    job_id = %job.job_id,
                    host = %host,
                    target = %sanitized,
                    "Target host is rate-limited (HTTP 429); skipping automated request to respect backoff"
                );
                rate_limited_pairs.push((idx + 1, sanitized.clone()));
            } else {
                cache_misses += 1;

                // Deduplication lock: avoid concurrent duplicates
                let lock_acquired = self.upstash.acquire_dedup_lock(&mediator_hash, 45).await;
                if !lock_acquired {
                    // Check if another concurrent worker resolved it
                    tokio::time::sleep(Duration::from_millis(500)).await;
                    if let Some(dest) = self.upstash.get_cached_resolved_link(&mediator_hash).await {
                        cache_hits += 1;
                        completed_urls += 1;
                        resolved_pairs.push((raw_url.clone(), dest));
                        continue;
                    }
                }

                // Resolve link safely
                let result = self.link_resolver.resolve_link(raw_url).await;
                self.upstash.release_dedup_lock(&mediator_hash).await;

                match result.status {
                    ResolveStatus::Success => {
                        if let Some(dest) = result.destination_url {
                            completed_urls += 1;
                            // Expiration-aware cache: 7 days TTL (604800s)
                            self.upstash.set_cached_resolved_link(&mediator_hash, &dest, 604800).await;
                            // Persist to Supabase as durable source of truth
                            self.persist_to_supabase(raw_url, &dest).await;
                            resolved_pairs.push((raw_url.clone(), dest));
                        }
                    }
                    ResolveStatus::ChallengeRequired => {
                        // MANDATORY: If source presents Turnstile or access challenge, STOP automated scraping on this host
                        warn!(
                            job_id = %job.job_id,
                            target = %sanitized,
                            "Turnstile / Access challenge presented. Pausing automated resolution for this target host."
                        );
                        if !host.is_empty() {
                            challenged_hosts.insert(host.clone());
                        }
                        challenged_pairs.push((idx + 1, sanitized.clone(), "Cloudflare Turnstile challenge".to_string()));
                    }
                    ResolveStatus::RateLimited => {
                        // MANDATORY: If HTTP 429 received, STOP automated scraping on this host to respect backoff
                        warn!(
                            job_id = %job.job_id,
                            target = %sanitized,
                            "Target service returned HTTP 429. Pausing automated resolution for this target host."
                        );
                        if !host.is_empty() {
                            rate_limited_hosts.insert(host.clone());
                        }
                        rate_limited_pairs.push((idx + 1, sanitized.clone()));
                    }
                    ResolveStatus::Failed => {
                        retries += 1;
                        warn!(
                            job_id = %job.job_id,
                            target = %sanitized,
                            error = %result.message,
                            "Failed to resolve link"
                        );
                    }
                    ResolveStatus::Cached => {}
                }
            }

            // Real-time progress update to Telegram as individual results finish
            if let (Some(chat_id), Some(msg_id)) = (job.chat_id, job.message_id) {
                if (idx + 1) % 2 == 0 || (idx + 1) == total_urls {
                    let progress_text = format!(
                        "⚡ <i>Resolving batch in cloud: <b>[{}/{} completed]</b> ({:.0}%)...</i>\n<b>Job ID:</b> <code>{}</code>",
                        completed_urls,
                        total_urls,
                        (completed_urls as f64 / total_urls as f64) * 100.0,
                        job.job_id
                    );
                    self.send_telegram_edit(chat_id, msg_id, &progress_text, job.bot_token.as_deref()).await;
                }
            }
        }

        // Determine final job status
        if !challenged_pairs.is_empty() {
            job_status = "challenge_required".to_string();
            stop_reason = Some("Access challenge (Turnstile / Cloudflare) presented. Action required: manual access needed for challenged links.".to_string());
        } else if !rate_limited_pairs.is_empty() {
            job_status = "rate_limited".to_string();
            stop_reason = Some("Service requested backoff (HTTP 429). Stopped automated requests to respect rate limits.".to_string());
        } else {
            job_status = "completed".to_string();
        }

        let processing_time_ms = proc_start.elapsed().as_millis() as u64;

        // Deliver comprehensive final report (including any already resolved links and challenge notices)
        if let (Some(chat_id), Some(msg_id)) = (job.chat_id, job.message_id) {
            let mut lines = Vec::new();

            if job_status == "completed" {
                lines.push(format!(
                    "🎯 <b>Job #{}: Resolved {}/{} Link(s) in {:.2}s</b>\n",
                    job.job_id,
                    completed_urls,
                    total_urls,
                    processing_time_ms as f64 / 1000.0
                ));
            } else if job_status == "challenge_required" {
                lines.push(format!(
                    "⚠️ <b>Job #{}: Resolution Paused (Action Required)</b>\n\nResolved <b>{}/{}</b> link(s). An access challenge (Cloudflare / Turnstile) was presented by the target.\n<b>Action Required:</b> Automated challenge solving is prohibited. Please verify the challenged link in your browser.\n",
                    job.job_id,
                    completed_urls,
                    total_urls
                ));
            } else if job_status == "rate_limited" {
                lines.push(format!(
                    "⏳ <b>Job #{}: Resolution Paused (Rate Limited)</b>\n\nResolved <b>{}/{}</b> link(s). Target service requested backoff (HTTP 429).\n",
                    job.job_id,
                    completed_urls,
                    total_urls
                ));
            }

            if !resolved_pairs.is_empty() {
                lines.push("🎯 <b>RESOLVED DESTINATIONS:</b>".to_string());
                for (link_idx, (_, dest)) in resolved_pairs.iter().enumerate() {
                    let label = if dest.contains("hubcloud") { "HubCloud" } else { "Destination" };
                    lines.push(format!("<b>#{}:</b> <a href=\"{}\">{} Link</a>\n<code>{}</code>\n", link_idx + 1, dest, label, dest));
                }
            }

            if !challenged_pairs.is_empty() {
                lines.push("⚠️ <b>CHALLENGED LINKS (ACTION REQUIRED):</b>".to_string());
                for (link_num, target_url, reason) in &challenged_pairs {
                    lines.push(format!("• <b>Link #{}:</b> <code>{}</code>\n  <i>{}</i>", link_num, target_url, reason));
                }
                lines.push("\n💡 <i>To cache a solved link: send <code>/cache &lt;mediator_link&gt; &lt;hubcloud_link&gt;</code></i>".to_string());
            }

            let final_text = lines.join("\n");
            self.send_telegram_edit(chat_id, msg_id, &final_text, job.bot_token.as_deref()).await;
        }

        let metrics = JobExecutionMetrics {
            job_id: job.job_id.clone(),
            status: job_status.clone(),
            queue_time_ms,
            processing_time_ms,
            total_urls,
            completed_urls,
            cache_hits,
            cache_misses,
            retries,
            stop_reason: stop_reason.clone(),
        };

        // Persist final job metrics in Upstash Redis
        if let Ok(meta_val) = serde_json::to_value(&metrics) {
            self.upstash.set_job_meta(&job.job_id, &meta_val, 86400).await;
        }

        info!(
            job_id = %job.job_id,
            status = %job_status,
            completed = completed_urls,
            total = total_urls,
            cache_hits = cache_hits,
            processing_time_ms = processing_time_ms,
            "Completed link job batch"
        );

        metrics
    }

    /// Persists resolved link to Supabase `links` table as durable source of truth
    pub async fn persist_to_supabase(&self, source_url: &str, destination_url: &str) {
        let (sb_url, sb_key) = match (&self.config.supabase_url, &self.config.supabase_service_role_key) {
            (Some(u), Some(k)) => (u, k),
            _ => return, // Supabase not configured
        };

        let endpoint = format!("{}/rest/v1/links", sb_url.trim_end_matches('/'));
        let link_id = format!("lnk_{:x}", sha2::Sha256::digest(format!("{}::{}", source_url, destination_url).as_bytes()));

        let row = json!({
            "id": link_id,
            "movie_id": "resolved_link",
            "title": "Cloud Resolved Mirror",
            "url": destination_url,
            "category": "Download",
            "server_name": "HubCloud",
            "link_type": "general",
            "updated_at": "now()"
        });

        let resp = self
            .http_client
            .post(&endpoint)
            .header("apikey", sb_key)
            .header("Authorization", format!("Bearer {}", sb_key))
            .header("Content-Type", "application/json")
            .header("Prefer", "resolution=merge-duplicates")
            .json(&vec![row])
            .send()
            .await;

        match resp {
            Ok(r) if r.status().is_success() => {
                info!("Durable record persisted to Supabase public.links table");
            }
            Ok(r) => {
                warn!("Supabase record sync returned status: {}", r.status());
            }
            Err(e) => {
                warn!("Supabase record sync network error: {}", e);
            }
        }
    }

    /// Sends editMessageText to Telegram Bot API
    async fn send_telegram_edit(&self, chat_id: i64, message_id: i64, text: &str, job_token: Option<&str>) {
        let bot_token = job_token
            .or(self.config.telegram_bot_token.as_deref());

        let token = match bot_token {
            Some(t) => t,
            None => return,
        };

        let endpoint = format!("https://api.telegram.org/bot{}/editMessageText", token);
        let payload = json!({
            "chat_id": chat_id,
            "message_id": message_id,
            "text": text,
            "parse_mode": "HTML",
            "disable_web_page_preview": true
        });

        let _ = self
            .http_client
            .post(&endpoint)
            .json(&payload)
            .send()
            .await;
    }
}
