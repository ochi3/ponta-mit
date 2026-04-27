export type ParsedYouTubeVideo = {
  videoId: string;
  startSeconds: number;
};

type YouTubePlayerStateMap = {
  UNSTARTED: -1;
  ENDED: 0;
  PLAYING: 1;
  PAUSED: 2;
  BUFFERING: 3;
  CUED: 5;
};

export type YouTubePlayer = {
  destroy(): void;
  getCurrentTime(): number;
  getPlayerState(): number;
  playVideo(): void;
  pauseVideo(): void;
  seekTo(seconds: number, allowSeekAhead: boolean): void;
  cueVideoById(options: { videoId: string; startSeconds?: number }): void;
};

export type YouTubeNamespace = {
  Player: new (
    element: HTMLElement,
    options: {
      videoId?: string;
      playerVars?: Record<string, number | string>;
      events?: {
        onReady?: () => void;
        onStateChange?: (event: { data: number }) => void;
      };
    }
  ) => YouTubePlayer;
  PlayerState: YouTubePlayerStateMap;
};

type WindowWithYouTube = Window & {
  YT?: YouTubeNamespace;
  onYouTubeIframeAPIReady?: () => void;
};

const YOUTUBE_IFRAME_API_URL = "https://www.youtube.com/iframe_api";

let youtubeApiPromise: Promise<YouTubeNamespace> | null = null;

function parseClockFragment(raw: string | null) {
  if (!raw) return 0;

  const value = raw.trim().toLowerCase();
  if (!value) return 0;

  if (/^\d+$/.test(value)) {
    return Number.parseInt(value, 10);
  }

  const match = value.match(
    /^(?:(\d+)h)?(?:(\d+)m)?(?:(\d+)s?)?$/
  );
  if (!match) {
    return 0;
  }

  const hours = Number.parseInt(match[1] ?? "0", 10);
  const minutes = Number.parseInt(match[2] ?? "0", 10);
  const seconds = Number.parseInt(match[3] ?? "0", 10);

  return hours * 3600 + minutes * 60 + seconds;
}

function extractVideoId(url: URL) {
  const hostname = url.hostname.replace(/^www\./, "").toLowerCase();

  if (hostname === "youtu.be") {
    return url.pathname.split("/").filter(Boolean)[0] ?? "";
  }

  if (hostname === "youtube.com" || hostname === "m.youtube.com") {
    if (url.pathname === "/watch") {
      return url.searchParams.get("v") ?? "";
    }

    const segments = url.pathname.split("/").filter(Boolean);
    if (segments[0] === "embed" || segments[0] === "shorts" || segments[0] === "live") {
      return segments[1] ?? "";
    }
  }

  if (hostname === "youtube-nocookie.com") {
    const segments = url.pathname.split("/").filter(Boolean);
    if (segments[0] === "embed") {
      return segments[1] ?? "";
    }
  }

  return "";
}

export function parseYouTubeUrl(input: string): ParsedYouTubeVideo | null {
  const trimmed = input.trim();
  if (!trimmed) {
    return null;
  }

  let normalized = trimmed;
  if (!/^https?:\/\//i.test(normalized)) {
    normalized = `https://${normalized}`;
  }

  try {
    const url = new URL(normalized);
    const videoId = extractVideoId(url);
    if (!videoId) {
      return null;
    }

    const startSeconds = Math.max(
      parseClockFragment(url.searchParams.get("t")),
      parseClockFragment(url.searchParams.get("start"))
    );

    return {
      videoId,
      startSeconds,
    };
  } catch {
    return null;
  }
}

export function formatClock(totalSeconds: number) {
  const safeTotal = Math.max(0, Math.floor(totalSeconds));
  const minutes = Math.floor(safeTotal / 60);
  const seconds = safeTotal % 60;
  return `${minutes}:${seconds.toString().padStart(2, "0")}`;
}

export function loadYouTubeIframeApi(): Promise<YouTubeNamespace> {
  if (typeof window === "undefined") {
    return Promise.reject(new Error("YouTube API is only available in the browser."));
  }

  const windowWithYouTube = window as WindowWithYouTube;
  if (windowWithYouTube.YT?.Player) {
    return Promise.resolve(windowWithYouTube.YT);
  }

  if (youtubeApiPromise) {
    return youtubeApiPromise;
  }

  youtubeApiPromise = new Promise<YouTubeNamespace>((resolve, reject) => {
    const existingScript = document.querySelector<HTMLScriptElement>(
      `script[src="${YOUTUBE_IFRAME_API_URL}"]`
    );
    const previousReady = windowWithYouTube.onYouTubeIframeAPIReady;
    const fail = (message: string) => {
      youtubeApiPromise = null;
      reject(new Error(message));
    };

    const finish = () => {
      const namespace = windowWithYouTube.YT;
      if (!namespace?.Player) {
        fail("YouTube API loaded, but the player was not initialized.");
        return;
      }
      resolve(namespace);
    };

    const timeoutId = window.setTimeout(() => {
      fail("Timed out while loading the YouTube iframe API.");
    }, 15000);

    windowWithYouTube.onYouTubeIframeAPIReady = () => {
      previousReady?.();
      window.clearTimeout(timeoutId);
      finish();
    };

    if (!existingScript) {
      const script = document.createElement("script");
      script.src = YOUTUBE_IFRAME_API_URL;
      script.async = true;
      script.onerror = () => {
        window.clearTimeout(timeoutId);
        fail("Failed to load the YouTube iframe API.");
      };
      document.head.appendChild(script);
    }
  });

  return youtubeApiPromise;
}
