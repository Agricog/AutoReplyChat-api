import YTDlpWrap from 'yt-dlp-wrap';
import { AssemblyAI } from 'assemblyai';
import { YoutubeTranscript } from 'youtube-transcript';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const assemblyClient = new AssemblyAI({
  apiKey: process.env.ASSEMBLYAI_API_KEY
});

// Extract video ID
function extractVideoId(url) {
  const patterns = [
    /(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/)([^&\n?#]+)/,
    /^([a-zA-Z0-9_-]{11})$/
  ];

  for (const pattern of patterns) {
    const match = url.match(pattern);
    if (match) return match[1];
  }

  throw new Error('Invalid YouTube URL format');
}

// Try to get free captions first
async function tryGetCaptions(videoId) {
  try {
    console.log('[YouTube] Attempting to fetch free captions...');
    const transcript = await YoutubeTranscript.fetchTranscript(videoId);

    if (transcript && transcript.length > 0) {
      const fullText = transcript
        .map(segment => segment.text)
        .join(' ')
        .replace(/\s+/g, ' ')
        .trim();

      console.log(`[YouTube] ✓ Captions found: ${fullText.split(' ').length} words`);
      return {
        text: fullText,
        method: 'captions',
        wordCount: fullText.split(/\s+/).length
      };
    }
  } catch (error) {
    console.log('[YouTube] Captions not available, will download audio...');
  }
  return null;
}

// Download audio and transcribe with AssemblyAI
async function downloadAndTranscribe(videoId) {
  const tempDir = path.join(__dirname, '..', 'temp');
  if (!fs.existsSync(tempDir)) {
    fs.mkdirSync(tempDir, { recursive: true });
  }

  const audioPath = path.join(tempDir, `${videoId}.mp3`);
  const videoUrl = `https://www.youtube.com/watch?v=${videoId}`;

  try {
    console.log('[YouTube] Downloading audio with yt-dlp...');
    
    // Initialize yt-dlp wrapper with default binary path
    const ytDlpWrap = new YTDlpWrap.default();
    
    // Download audio only
    await ytDlpWrap.execPromise([
      videoUrl,
      '-x',  // Extract audio
      '--audio-format', 'mp3',
      '--audio-quality', '5',  // Lower quality = smaller file
      '-o', audioPath,
      '--no-playlist'
    ]);

    console.log('[YouTube] Audio downloaded, transcribing with AssemblyAI...');

    // Upload to AssemblyAI
    const uploadUrl = await assemblyClient.files.upload(audioPath);

    // Transcribe
    const transcript = await assemblyClient.transcripts.transcribe({
      audio: uploadUrl,
      speech_models: ['universal-2']
    });

    if (transcript.status === 'error') {
      throw new Error(transcript.error);
    }

    // Cleanup
    if (fs.existsSync(audioPath)) {
      fs.unlinkSync(audioPath);
    }

    console.log(`[YouTube] ✓ Transcription complete: ${transcript.words.length} words`);

    return {
      text: transcript.text,
      method: 'yt-dlp + assemblyai',
      wordCount: transcript.words.length,
      duration: transcript.audio_duration
    };

  } catch (error) {
    // Cleanup on error
    if (fs.existsSync(audioPath)) {
      fs.unlinkSync(audioPath);
    }
    throw error;
  }
}

// Main function
export async function getYoutubeTranscript(videoUrl) {
  try {
    const videoId = extractVideoId(videoUrl);
    console.log(`[YouTube] Processing video: ${videoId}`);

    // STEP 1: Try free captions first
    const captionResult = await tryGetCaptions(videoId);
    if (captionResult) {
      return { videoId, ...captionResult };
    }

    // STEP 2: Download and transcribe
    const transcribeResult = await downloadAndTranscribe(videoId);
    return { videoId, ...transcribeResult };

  } catch (error) {
    console.error('[YouTube] Error:', error.message);
    throw new Error(`Failed to extract transcript: ${error.message}`);
  }
}

export async function getVideoMetadata(videoId) {
  return {
    videoId,
    url: `https://www.youtube.com/watch?v=${videoId}`,
    thumbnail: `https://img.youtube.com/vi/${videoId}/maxresdefault.jpg`
  };
}
