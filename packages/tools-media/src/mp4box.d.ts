declare module 'mp4box' {
  export interface MP4ArrayBuffer extends ArrayBuffer {
    fileStart: number;
  }
  export interface MP4Info {
    duration: number;
    timescale: number;
    tracks: Array<{
      id: number;
      type: string;
      codec?: string;
      movie_duration?: number;
      movie_timescale?: number;
      track_width?: number;
      track_height?: number;
      audio?: { sample_rate: number; channel_count: number };
    }>;
  }
  export interface MP4File {
    onReady?: (info: MP4Info) => void;
    onError?: (err: string) => void;
    onSamples?: (id: number, user: unknown, samples: unknown[]) => void;
    appendBuffer(data: MP4ArrayBuffer): number;
    flush(): void;
    start(): void;
    stop(): void;
    setExtractionOptions(id: number, user: unknown, opts?: { nbSamples?: number }): void;
  }
  export function createFile(): MP4File;
}
