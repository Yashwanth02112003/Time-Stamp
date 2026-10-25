import { YoutubeTranscript } from 'youtube-transcript';
import { ParsedSegment } from './parser.js';

export interface YouTubeTranscriptResult {
  videoId: string;
  totalCues: number;
  segments: ParsedSegment[];
  transcriptText: string;
}

/**
 * Decode common HTML entities from subtitle text
 */
function decodeHtmlEntities(str: string): string {
  return str
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/&#x2F;/g, '/')
    .replace(/\n/g, ' ')
    .trim();
}

/**
 * Fetch official/auto-generated transcripts directly from YouTube
 * and group into coherent narrative blocks with precise start times.
 */
export async function fetchYouTubeTranscript(videoId: string): Promise<YouTubeTranscriptResult> {
  if (!videoId) {
    throw new Error('No YouTube Video ID provided');
  }

  let raw: any;
  try {
    raw = await YoutubeTranscript.fetchTranscript(videoId);
  } catch (err: any) {
    if (err.message && (err.message.includes('too many requests') || err.message.includes('captcha') || err.message.includes('IP'))) {
      throw new Error('YouTube is restricting automated caption fetching from this server IP. Please upload your Zoom / Masterclass transcript file (.vtt, .txt, .docx, .pdf) or paste the transcript text directly.');
    }
    throw err;
  }

  if (!raw || raw.length === 0) {
    throw new Error(`No transcript or closed captions found for YouTube video ${videoId}`);
  }

  const segments: ParsedSegment[] = [];
  let currentBlock = {
    startSeconds: Math.floor(raw[0].offset / 1000),
    text: '',
    endSeconds: Math.floor((raw[0].offset + raw[0].duration) / 1000)
  };

  let seq = 1;

  for (let i = 0; i < raw.length; i++) {
    const item = raw[i];
    const itemStartSec = Math.floor(item.offset / 1000);
    const itemEndSec = Math.floor((item.offset + item.duration) / 1000);
    const cleanText = decodeHtmlEntities(item.text);

    if (cleanText) {
      currentBlock.text += (currentBlock.text ? ' ' : '') + cleanText;
      currentBlock.endSeconds = itemEndSec;
    }

    const duration = itemStartSec - currentBlock.startSeconds;
    const endsWithSentence = /[.!?]$/.test(cleanText);

    // Group into logical blocks of 15-25 seconds or at punctuation boundaries
    if (duration >= 20 || (duration >= 10 && endsWithSentence) || i === raw.length - 1) {
      if (currentBlock.text.trim()) {
        segments.push({
          sequenceNumber: seq++,
          startSeconds: currentBlock.startSeconds,
          endSeconds: currentBlock.endSeconds,
          speakerReference: null,
          text: currentBlock.text.trim()
        });
      }

      if (i < raw.length - 1) {
        const next = raw[i + 1];
        currentBlock = {
          startSeconds: Math.floor(next.offset / 1000),
          text: '',
          endSeconds: Math.floor((next.offset + next.duration) / 1000)
        };
      }
    }
  }

  const transcriptText = segments
    .map(s => `[${s.startSeconds}s]: ${s.text}`)
    .join('\n');

  return {
    videoId,
    totalCues: raw.length,
    segments,
    transcriptText
  };
}
