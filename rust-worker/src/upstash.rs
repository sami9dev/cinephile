use reqwest::Client;
use serde_json::Value;
use std::time::Duration;
use tracing::warn;

use crate::models::{MediaIdentificationResult, ScrapeAndIdentifyResponse};

#[derive(Clone)]
pub struct UpstashClient {
    client: Client,
    rest_url: Option<String>,
    rest_token: Option<String>,
}

impl UpstashClient {
    pub fn new(url: Option<String>, token: Option<String>) -> Self {
        let client = Client::builder()
            .timeout(Duration::from_millis(3000))
            .pool_max_idle_per_host(20)
            .pool_idle_timeout(Duration::from_secs(90))
            .build()
            .unwrap_or_default();

        Self {
            client,
            rest_url: url.map(|u| u.trim_end_matches('/').to_string()),
            rest_token: token,
        }
    }

    pub fn is_configured(&self) -> bool {
        self.rest_url.is_some() && self.rest_token.is_some()
    }

    /// Executes an Upstash REST command
    async fn exec_command(&self, args: Vec<String>) -> Option<Value> {
        let url = self.rest_url.as_ref()?;
        let token = self.rest_token.as_ref()?;

        match self
            .client
            .post(url)
            .bearer_auth(token)
            .json(&args)
            .send()
            .await
        {
            Ok(resp) => {
                if resp.status().is_success() {
                    match resp.json::<Value>().await {
                        Ok(val) => {
                            // Upstash returns {"result": ...}
                            return val.get("result").cloned().or(Some(val));
                        }
                        Err(e) => {
                            warn!("Failed to parse Upstash response JSON: {}", e);
                        }
                    }
                } else {
                    warn!("Upstash returned HTTP status {}", resp.status());
                }
            }
            Err(e) => {
                warn!("Upstash request failed: {}", e);
            }
        }
        None
    }

    /// Checks if Upstash is responsive
    pub async fn check_health(&self) -> bool {
        if !self.is_configured() {
            return false;
        }
        let res = self.exec_command(vec!["PING".to_string()]).await;
        match res {
            Some(Value::String(s)) => s.to_uppercase() == "PONG",
            _ => false,
        }
    }

    /// Attempts to acquire an idempotent deduplication lock with TTL.
    /// Returns true if lock was acquired, false if URL is already being processed.
    pub async fn acquire_dedup_lock(&self, lock_key: &str, ttl_secs: u64) -> bool {
        if !self.is_configured() {
            return true; // If Upstash not configured, allow local execution
        }

        let cmd = vec![
            "SET".to_string(),
            format!("cinefuel:dedup:{}", lock_key),
            "1".to_string(),
            "EX".to_string(),
            ttl_secs.to_string(),
            "NX".to_string(),
        ];

        match self.exec_command(cmd).await {
            Some(Value::String(s)) => s == "OK",
            _ => false,
        }
    }

    pub async fn release_dedup_lock(&self, lock_key: &str) {
        if !self.is_configured() {
            return;
        }
        let cmd = vec![
            "DEL".to_string(),
            format!("cinefuel:dedup:{}", lock_key),
        ];
        let _ = self.exec_command(cmd).await;
    }

    /// Checks Upstash cache for previously scraped and identified page releases BEFORE scraping.
    /// Returns cached results in sub-millisecond if available.
    pub async fn get_cached_scrape(&self, url_hash: &str) -> Option<ScrapeAndIdentifyResponse> {
        if !self.is_configured() {
            return None;
        }

        let cmd = vec![
            "GET".to_string(),
            format!("cinefuel:cache:scrape:{}", url_hash),
        ];

        let val = self.exec_command(cmd).await?;
        if let Value::String(json_str) = val {
            serde_json::from_str(&json_str).ok()
        } else {
            None
        }
    }

    /// Caches full scrape and identification response in Upstash Redis (default 86400s = 24h)
    pub async fn set_cached_scrape(
        &self,
        url_hash: &str,
        resp: &ScrapeAndIdentifyResponse,
        ttl_secs: u64,
    ) {
        if !self.is_configured() {
            return;
        }

        if let Ok(json_str) = serde_json::to_string(resp) {
            let cmd = vec![
                "SETEX".to_string(),
                format!("cinefuel:cache:scrape:{}", url_hash),
                ttl_secs.to_string(),
                json_str,
            ];
            let _ = self.exec_command(cmd).await;
        }
    }

    /// Checks Upstash cache for a resolved mediator -> HubCloud destination link
    pub async fn get_cached_resolved_link(&self, mediator_hash: &str) -> Option<String> {
        if !self.is_configured() {
            return None;
        }

        let cmd = vec![
            "GET".to_string(),
            format!("cinefuel:cache:link:{}", mediator_hash),
        ];

        match self.exec_command(cmd).await {
            Some(Value::String(s)) if !s.is_empty() => Some(s),
            _ => None,
        }
    }

    /// Stores a resolved HubCloud destination in Upstash Redis with a TTL (e.g. 7 days = 604800s)
    pub async fn set_cached_resolved_link(
        &self,
        mediator_hash: &str,
        dest_url: &str,
        ttl_secs: u64,
    ) {
        if !self.is_configured() {
            return;
        }

        let cmd = vec![
            "SETEX".to_string(),
            format!("cinefuel:cache:link:{}", mediator_hash),
            ttl_secs.to_string(),
            dest_url.to_string(),
        ];
        let _ = self.exec_command(cmd).await;
    }

    /// Retrieves cached identification result
    pub async fn get_cached_identification(&self, cache_key: &str) -> Option<MediaIdentificationResult> {
        if !self.is_configured() {
            return None;
        }

        let cmd = vec![
            "GET".to_string(),
            format!("cinefuel:cache:media:{}", cache_key),
        ];

        let val = self.exec_command(cmd).await?;
        if let Value::String(json_str) = val {
            serde_json::from_str(&json_str).ok()
        } else {
            None
        }
    }

    /// Caches identification result with TTL (default 1 hour = 3600s)
    pub async fn set_cached_identification(
        &self,
        cache_key: &str,
        result: &MediaIdentificationResult,
        ttl_secs: u64,
    ) {
        if !self.is_configured() {
            return;
        }

        if let Ok(json_str) = serde_json::to_string(result) {
            let cmd = vec![
                "SETEX".to_string(),
                format!("cinefuel:cache:media:{}", cache_key),
                ttl_secs.to_string(),
                json_str,
            ];
            let _ = self.exec_command(cmd).await;
        }
    }

    /// Enqueues a task payload into Upstash Redis queue using LPUSH
    pub async fn enqueue_job(&self, queue_name: &str, payload: &str) -> bool {
        if !self.is_configured() {
            return false;
        }
        let cmd = vec![
            "LPUSH".to_string(),
            format!("cinefuel:queue:{}", queue_name),
            payload.to_string(),
        ];
        self.exec_command(cmd).await.is_some()
    }

    /// Non-blocking pop from Upstash Redis queue using RPOP
    pub async fn dequeue_job(&self, queue_name: &str) -> Option<String> {
        if !self.is_configured() {
            return None;
        }
        let cmd = vec![
            "RPOP".to_string(),
            format!("cinefuel:queue:{}", queue_name),
        ];
        match self.exec_command(cmd).await {
            Some(Value::String(s)) => Some(s),
            _ => None,
        }
    }

    /// Returns queue depth using LLEN
    pub async fn get_queue_length(&self, queue_name: &str) -> usize {
        if !self.is_configured() {
            return 0;
        }
        let cmd = vec![
            "LLEN".to_string(),
            format!("cinefuel:queue:{}", queue_name),
        ];
        match self.exec_command(cmd).await {
            Some(Value::Number(n)) => n.as_u64().unwrap_or(0) as usize,
            _ => 0,
        }
    }

    /// Stores job processing metadata and metrics with TTL (default 24h = 86400s)
    pub async fn set_job_meta(&self, job_id: &str, meta: &Value, ttl_secs: u64) {
        if !self.is_configured() {
            return;
        }
        if let Ok(json_str) = serde_json::to_string(meta) {
            let cmd = vec![
                "SETEX".to_string(),
                format!("cinefuel:job:{}", job_id),
                ttl_secs.to_string(),
                json_str,
            ];
            let _ = self.exec_command(cmd).await;
        }
    }

    /// Retrieves job processing metadata
    pub async fn get_job_meta(&self, job_id: &str) -> Option<Value> {
        if !self.is_configured() {
            return None;
        }
        let cmd = vec![
            "GET".to_string(),
            format!("cinefuel:job:{}", job_id),
        ];
        let val = self.exec_command(cmd).await?;
        if let Value::String(json_str) = val {
            serde_json::from_str(&json_str).ok()
        } else {
            None
        }
    }
}

/// Sanitizes a URL for safe metrics and structured logging (masks sensitive query params / tokens)
pub fn sanitize_url_for_logging(raw_url: &str) -> String {
    if let Ok(parsed) = url::Url::parse(raw_url) {
        let domain = parsed.host_str().unwrap_or("unknown");
        let path = parsed.path();
        format!("{}://{}{}", parsed.scheme(), domain, path)
    } else if let Some(idx) = raw_url.find('?') {
        raw_url[..idx].to_string()
    } else {
        raw_url.to_string()
    }
}
