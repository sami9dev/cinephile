#[cfg(test)]
mod tests {
    use cinefuel_rust_worker::identifier::MediaIdentifier;
    use cinefuel_rust_worker::security::validate_url;

    #[test]
    fn test_movies_identified_by_title_and_release_year() {
        let p1 = MediaIdentifier::parse_media_candidate("Inception.2010.1080p.BluRay.x264.mkv", None);
        assert_eq!(p1.media_type, "movie");
        assert_eq!(p1.movie_title.as_deref(), Some("Inception"));
        assert_eq!(p1.year, Some(2010));
        assert_eq!(p1.resolution.as_deref(), Some("1080p"));
        assert_eq!(p1.codec.as_deref(), Some("x264"));

        // Title with numbers vs release year: "2012 (2009)"
        let p2 = MediaIdentifier::parse_media_candidate("2012 (2009) 1080p WEB-DL.mkv", None);
        assert_eq!(p2.media_type, "movie");
        assert_eq!(p2.movie_title.as_deref(), Some("2012"));
        assert_eq!(p2.year, Some(2009));
    }

    #[test]
    fn test_tv_episodes_from_filenames_all_formats() {
        // Standard S01E02
        let p1 = MediaIdentifier::parse_media_candidate("Stranger.Things.S01E02.1080p.NF.WEB-DL.mkv", None);
        assert_eq!(p1.media_type, "tv");
        assert_eq!(p1.is_episode, true);
        assert_eq!(p1.season_number, Some(1));
        assert_eq!(p1.episode_number, Some(2));
        assert_eq!(p1.series_title.as_deref(), Some("Stranger Things"));

        // Multi-episode: S01E02-E03 / S01E02-03
        let p2 = MediaIdentifier::parse_media_candidate("Breaking.Bad.S01E02-E03.720p.mkv", None);
        assert_eq!(p2.media_type, "tv");
        assert_eq!(p2.is_episode, true);
        assert_eq!(p2.season_number, Some(1));
        assert_eq!(p2.episode_number, Some(2));
        assert_eq!(p2.episode_number_end, Some(3));
        assert_eq!(p2.is_multi_episode, true);

        // 1x02 and 01x02
        let p3 = MediaIdentifier::parse_media_candidate("The.Boys.01x02.Cherry.1080p.mkv", None);
        assert_eq!(p3.media_type, "tv");
        assert_eq!(p3.season_number, Some(1));
        assert_eq!(p3.episode_number, Some(2));

        // "Season 1 Episode 2"
        let p4 = MediaIdentifier::parse_media_candidate("Succession Season 1 Episode 2 1080p.mkv", None);
        assert_eq!(p4.media_type, "tv");
        assert_eq!(p4.season_number, Some(1));
        assert_eq!(p4.episode_number, Some(2));
    }

    #[test]
    fn test_specials_s00e01() {
        let p = MediaIdentifier::parse_media_candidate("Doctor.Who.S00E01.The.Christmas.Invasion.1080p.mkv", None);
        assert_eq!(p.media_type, "tv");
        assert_eq!(p.is_episode, true);
        assert_eq!(p.season_number, Some(0));
        assert_eq!(p.episode_number, Some(1));
        assert_eq!(p.is_special, true);
        assert_eq!(p.embedded_episode_title.as_deref(), Some("The Christmas Invasion"));
    }

    #[test]
    fn test_episodes_in_folders_without_season_directories() {
        let path = "Dark/Season 02/03 - An Endless Cycle.mkv";
        let p = MediaIdentifier::parse_media_candidate(path, None);
        assert_eq!(p.media_type, "tv");
        assert_eq!(p.season_number, Some(2));
        assert_eq!(p.episode_number, Some(3));
        assert_eq!(p.series_title.as_deref(), Some("Dark"));
    }

    #[test]
    fn test_single_episode_outside_season_folder() {
        let p = MediaIdentifier::parse_media_candidate("Sherlock.S03E01.The.Empty.Hearse.1080p.mkv", None);
        assert_eq!(p.media_type, "tv");
        assert_eq!(p.is_episode, true);
        assert_eq!(p.season_number, Some(3));
        assert_eq!(p.episode_number, Some(1));
        assert_eq!(p.embedded_episode_title.as_deref(), Some("The Empty Hearse"));
    }

    #[test]
    fn test_noise_stripping_and_number_guardrails() {
        let text = "Paatal.Lok.S01E01.720p.AMZN.WEB-DL.DDP5.1.H.264-XDMovies.mkv";
        let p = MediaIdentifier::parse_media_candidate(text, None);
        assert_eq!(p.media_type, "tv");
        assert_eq!(p.season_number, Some(1));
        assert_eq!(p.episode_number, Some(1));
        assert_ne!(p.episode_number, Some(264)); // Codec 264 must not be episode!
        assert_ne!(p.season_number, Some(5));    // 5.1 audio must not be season!

        let stripped = MediaIdentifier::strip_filename_noise("Nosferatu.2160p.MA.WEB-DL.DDP5.1.Atmos.H.265-XDMovies");
        assert_eq!(stripped, "Nosferatu");

        let cand = MediaIdentifier::parse_media_candidate("Nosferatu.2024.2160p.MA.WEB-DL.DDP5.1.Atmos.H.265-XDMovies", None);
        assert_eq!(cand.movie_title.as_deref(), Some("Nosferatu"));
        assert_eq!(cand.year, Some(2024));
    }

    #[test]
    fn test_ssrf_url_validation() {
        // Block localhost
        assert!(validate_url("http://localhost:8080/admin").is_err());
        assert!(validate_url("http://127.0.0.1/").is_err());
        assert!(validate_url("http://0.0.0.0/").is_err());

        // Block AWS/Render metadata IP
        assert!(validate_url("http://169.254.169.254/latest/meta-data").is_err());

        // Block private LAN IP
        assert!(validate_url("http://192.168.1.10/secret").is_err());
        assert!(validate_url("http://10.0.0.1/").is_err());
        assert!(validate_url("http://172.16.0.5/").is_err());

        // Block non-http schemes
        assert!(validate_url("file:///etc/passwd").is_err());
        assert!(validate_url("ftp://server/file").is_err());

        // Valid public URL allowed
        assert!(validate_url("https://huh.xdmovies.wtf/movies/runner-1080p").is_ok());
    }
}
