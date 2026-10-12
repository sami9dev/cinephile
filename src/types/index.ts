export type MediaType = 'movie' | 'tv' | 'person';

export interface Genre {
  id: number;
  name: string;
}

export interface CastMember {
  id: number;
  name: string;
  character: string;
  profile_path: string | null;
  order?: number;
}

export interface CrewMember {
  id: number;
  name: string;
  job: string;
  department: string;
  profile_path: string | null;
}

export interface VideoItem {
  id: string;
  key: string;
  name: string;
  site: string;
  type: string;
  official?: boolean;
}

export interface WatchProviderInfo {
  provider_id: number;
  provider_name: string;
  logo_path: string;
  display_priority?: number;
}

export interface WatchProvidersData {
  link?: string;
  flatrate?: WatchProviderInfo[]; // Streaming subscription (e.g., Netflix, Prime, Hotstar)
  rent?: WatchProviderInfo[];
  buy?: WatchProviderInfo[];
  free?: WatchProviderInfo[];
  ads?: WatchProviderInfo[];
}

export interface MDBListRatingItem {
  source: string; // 'imdb' | 'tmdb' | 'trakt' | 'tomatoes' | 'tomatoes_audience' | 'metacritic' | 'letterboxd' | 'mal' | 'anilist'
  value: number; // Normalized (e.g., 8.4, 92%, etc.)
  score?: number; // 0 - 100
  votes?: number;
  url?: string;
}

export interface MDBListResponse {
  id?: number;
  title?: string;
  year?: number;
  type?: 'movie' | 'show';
  imdbid?: string;
  tmdbid?: number;
  traktid?: number;
  score?: number; // MDBList overall rating score (0 - 100)
  score_average?: number;
  ratings?: MDBListRatingItem[];
  certification?: string; // PG-13, R, TV-MA, U/A
  commonsense?: number;
  budget?: number;
  revenue?: number;
  runtime?: number;
}

export interface TitleDetails {
  id: number;
  title: string;
  original_title?: string;
  name?: string; // For TV
  original_name?: string;
  overview: string;
  poster_path: string | null;
  backdrop_path: string | null;
  release_date?: string;
  first_air_date?: string;
  vote_average: number;
  vote_count: number;
  genres: Genre[];
  genre_ids?: number[];
  media_type: 'movie' | 'tv';
  original_language?: string;
  origin_country?: string[];
  runtime?: number;
  episode_run_time?: number[];
  number_of_seasons?: number;
  number_of_episodes?: number;
  seasons?: Array<{
    id: number;
    name: string;
    season_number: number;
    episode_count: number;
    poster_path?: string | null;
    air_date?: string;
  }>;
  tagline?: string;
  status?: string;
  budget?: number;
  revenue?: number;
  external_ids?: {
    imdb_id?: string;
    tmdb_id?: number;
    tvdb_id?: number;
    mdblist_id?: number;
    trakt_id?: number;
    instagram_id?: string;
    twitter_id?: string;
  };
  imdb_rating?: number;
  imdb_votes?: string;
  mdblist_score?: number;
  mdblist_ratings?: MDBListRatingItem[];
  trakt_rating?: number;
  trakt_votes?: number;
  credits?: {
    cast: CastMember[];
    crew: CrewMember[];
  };
  videos?: {
    results: VideoItem[];
  };
  similar?: {
    results: TitleDetails[];
  };
  recommendations?: {
    results: TitleDetails[];
  };
  'watch/providers'?: {
    results: Record<string, WatchProvidersData>;
  };
  networks?: Array<{ id: number; name: string; logo_path?: string }>;
  production_companies?: Array<{ id: number; name: string; logo_path?: string }>;
  uploadMeta?: {
    is4k?: boolean;
    is1080p?: boolean;
    isDV?: boolean;
    isHDR?: boolean;
    isBluRay?: boolean;
    platform?: string;
    category?: string;
    size?: string;
    createdAt?: string;
    rawTitle?: string;
    statusText?: string;
  };
}

export interface PersonDetails {
  id: number;
  name: string;
  biography: string;
  birthday: string | null;
  place_of_birth: string | null;
  profile_path: string | null;
  known_for_department: string;
  popularity: number;
  combined_credits?: {
    cast: TitleDetails[];
    crew: TitleDetails[];
  };
  external_ids?: {
    imdb_id?: string;
    instagram_id?: string;
    twitter_id?: string;
  };
}

export interface CustomLink {
  id: string;
  title: string;
  url: string;
  category: 'Recent' | 'Streaming' | 'Subtitles' | 'Discussion' | 'Review' | 'Download' | 'Official' | 'Other' | 'ZipPack' | 'SingleEpisode';
  createdAt: string;
  seasonNumber?: number;
  episodeNumber?: number;
  episodeTitle?: string;
  quality?: string; // '4K HDR' | '1080p' | '720p' | '480p' | '2160p HEVC' | 'BluRay'
  audioLanguage?: string; // 'Hindi + English' | 'English' | 'Dual Audio'
  size?: string; // '1.2 GB' | '4.5 GB' | '18 GB Zip'
  linkType?: 'zip_pack' | 'single_episode' | 'general';
  serverName?: string; // 'HubCloud' | 'GDFlix' | 'Google Drive' | 'Mega'
  serverBadge?: string; // '⚡ Server 1: HubCloud'
  movieTitle?: string;
  originalLanguage?: string;
  originCountry?: string[];
  posterPath?: string | null;
  backdropPath?: string | null;
  releaseDate?: string;
  voteAverage?: number;
  container?: string;
  dynamicRange?: string;
  bitDepth?: string;
  codec?: string;
  resolution?: string;
  provider?: string;
  manualOverrides?: {
    container?: string;
    packType?: string;
    linkType?: 'zip_pack' | 'single_episode' | 'general';
    resolution?: string;
    dynamicRange?: string;
    bitDepth?: string;
    codec?: string;
    provider?: string;
    source?: string;
    audioLanguage?: string;
    size?: string;
    seasonNumber?: number;
    episodeNumber?: number;
  };
}

export interface WatchlistItem {
  id: number;
  mediaType: 'movie' | 'tv';
  title: string;
  poster_path: string | null;
  backdrop_path: string | null;
  release_date: string;
  vote_average: number;
  status: 'watchlist' | 'watched' | 'watching';
  isFavorite: boolean;
  personalRating?: number; // 1 - 10
  review?: string;
  watchedAt?: string;
  addedAt: string;
  genres?: string[];
  runtime?: number;
  customLinks: CustomLink[];
}

export interface CustomList {
  id: string;
  userId: string;
  title: string;
  description: string;
  isPublic: boolean;
  itemIds: number[];
  items: WatchlistItem[];
  createdAt: string;
  updatedAt: string;
}

export interface UserProfile {
  uid: string;
  firebaseUid?: string;
  email: string | null;
  displayName: string | null;
  name?: string | null;
  photoURL: string | null;
  provider?: string;
  status?: string;
  bio?: string;
  favoriteGenres?: string[];
  createdAt: string;
  lastLoginAt?: string;
  isGuest?: boolean;
}

export interface RegisteredUser {
  firebaseUid?: string;
  uid: string;
  name?: string;
  displayName: string;
  email: string;
  photoURL?: string | null;
  provider?: string;
  status?: string;
  createdAt: string;
  lastLoginAt?: string;
  updatedAt?: string;
  requestsCount?: number;
  reportsCount?: number;
  recentRequests?: string[];
  passwordHash?: string;
  passwordSalt?: string;
  bio?: string;
  favoriteGenres?: string[];
  notificationPreferences?: UserNotificationPreferences;
}

export interface UserNotificationPreferences {
  inAppRequests?: boolean;
  inAppReports?: boolean;
  telegramRequests?: boolean;
  telegramReports?: boolean;
}

export interface RecommendationItem {
  item: TitleDetails;
  reason: string;
  score: number;
  category: 'rated_match' | 'genre_affinity' | 'actor_director' | 'top_unwatched';
}

export interface MdblistConfig {
  apiKey: string;
  isConnected: boolean;
  username?: string;
  lastSyncedAt?: string;
}

export interface AppSettings {
  tmdbApiKey: string;
  omdbApiKey: string;
  mdblistApiKey: string;
  defaultRegion: string; // 'IN' default
  theme: 'dark' | 'midnight' | 'oled' | 'light';
  autoSyncMdblist: boolean;
}

export interface UserRequest {
  id: string;
  userId?: string;
  userName?: string;
  userEmail?: string;
  title: string;
  mediaType: 'movie' | 'tv';
  tmdbId?: number;
  posterPath?: string | null;
  releaseYear?: string;
  seasonNumber?: number;
  episodeNumber?: number;
  quality: string; // e.g. '4K HDR' | '1080p FHD' | '720p HD' | 'Any'
  audioLanguage: string; // e.g. 'Hindi + English' | 'Hindi Dubbed' | 'English' | 'Any'
  notes?: string;
  userContact?: string;
  status: 'pending' | 'in_progress' | 'fulfilled' | 'rejected';
  createdAt: string;
  fulfilledAt?: string;
  fulfilledLinkId?: string;
  fulfilledLinkUrl?: string;
  adminNote?: string;
  adminReplies?: Array<{
    sender: string;
    message: string;
    createdAt: string;
  }>;
}

export type DefectiveLinkIssueType =
  | 'dead_link'
  | 'paywall_loop'
  | 'audio_desync'
  | 'video_glitch'
  | 'wrong_episode'
  | 'slow_timeout'
  | 'other';

export interface DefectiveLinkReport {
  id: string;
  userId?: string;
  userName?: string;
  linkId?: string;
  movieId: number;
  mediaTitle: string;
  mediaType?: 'movie' | 'tv';
  posterPath?: string | null;
  linkTitle: string;
  reportedUrl: string;
  issueType: DefectiveLinkIssueType;
  issueLabel: string;
  quality?: string;
  server?: string;
  additionalNotes?: string;
  userEmail?: string;
  status: 'pending' | 'in_progress' | 'fixed' | 'dismissed';
  createdAt: string;
  resolvedAt?: string;
  replacementUrl?: string;
  adminNote?: string;
  adminReplies?: Array<{
    sender: string;
    message: string;
    createdAt: string;
  }>;
}

export type NotificationType =
  | 'REQUEST_FULFILLED'
  | 'REQUEST_IN_PROGRESS'
  | 'REQUEST_REJECTED'
  | 'DEFECTIVE_LINK_RESOLVED'
  | 'DEFECTIVE_LINK_IN_PROGRESS'
  | 'DEFECTIVE_LINK_DISMISSED'
  | 'ADMIN_REPLY';

export interface UserNotification {
  id: string;
  userId: string;
  firebaseUid: string;
  requestId?: string;
  reportId?: string;
  type: NotificationType;
  title: string;
  message: string;
  mediaTitle: string;
  movieId?: number | string;
  mediaType: 'movie' | 'tv';
  linkUrl: string;
  posterPath?: string | null;
  read: boolean;
  createdAt: string;
  readAt?: string | null;
  adminReply?: string;
  replacementUrl?: string;
}

export interface TelegramLink {
  id?: string;
  firebaseUid: string;
  telegramChatId: number;
  telegramUserId: number;
  telegramUsername?: string;
  status: 'active' | 'disconnected';
  requestNotifications: boolean;
  reportNotifications: boolean;
  linkedAt: string;
  updatedAt?: string;
}

export interface TelegramLinkingToken {
  token: string;
  firebaseUid: string;
  createdAt: string;
  expiresAt: string;
  used: boolean;
  usedAt?: string | null;
}

export interface NotificationDelivery {
  id?: string;
  notificationId: string;
  userId: string;
  channel: 'telegram' | 'in_app';
  telegramChatId?: number;
  type: NotificationType;
  status: 'sent' | 'failed';
  telegramMessageId?: number | null;
  sentAt: string;
  error?: string;
}

