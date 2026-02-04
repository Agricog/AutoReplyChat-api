import { YoutubeTranscript } from 'youtube-transcript';
import ytdl from '@distube/ytdl-core';
import { OpenAI } from 'openai';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Initialize OpenAI client
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

// Extract video ID from various YouTube URL formats
function extractVideoId(url) {
  const patterns = [
    /(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/)([^&\n?#]+)/,
    /^([a-zA-Z0-9_-]{11})$/ // Direct video ID
  ];

  for (const pattern of patterns) {
    const match = url.match(pattern);
    if (match) return match[1];
  }

  throw new Error('Invalid YouTube URL format');
}

// Download audio from YouTube video
async function downloadAudio(videoId) {
  const videoUrl = `https://www.youtube.com/watch?v=${videoId}`;
  const audioPath = path.join(__dirname, '..', 'temp', `${videoId}.mp3`);
  
  // Create temp directory if it doesn't exist
  const tempDir = path.join(__dirname, '..', 'temp');
  if (!fs.existsSync(tempDir)) {
    fs.mkdirSync(tempDir, { recursive: true });
  }

  console.log(`[YouTube] Downloading audio for ${videoId}...`);

  return new Promise((resolve, reject) => {
    try {
      const stream = ytdl(videoUrl, {
        quality: 'lowestaudio',
        filter: 'audioonly'
      });

      const writeStream = fs.createWriteStream(audioPath);
      
      stream.pipe(writeStream);

      writeStream.on('finish', () => {
        console.log(`[YouTube] Audio downloaded: ${audioPath}`);
        resolve(audioPath);
      });

      writeStream.on('error', (error) => {
        console.error('[YouTube] Download error:', error);
        reject(error);
      });

      stream.on('error', (error) => {
        console.error('[YouTube] Stream error:', error);
        reject(error);
      });
    } catch (error) {
      reject(error);
    }
  });
}

// Transcribe audio using OpenAI Whisper
async function transcribeAudio(audioPath) {
  console.log(`[YouTube] Transcribing audio with Whisper...`);

  try {
    const transcription = await openai.audio.transcriptions.create({
      file: fs.createReadStream(audioPath),
      model: 'whisper-1'
    });

    console.log(`[YouTube] Transcription complete: ${transcription.text.split(' ').length} words`);
    
    return transcription.text;
  } catch (error) {
    console.error('[YouTube] Whisper API error:', error);
    throw new Error(`Whisper transcription failed: ${error.message}`);
  }
}

// Clean up temporary audio file
function cleanupAudio(audioPath) {
  try {
    if (fs.existsSync(audioPath)) {
      fs.unlinkSync(audioPath);
      console.log(`[YouTube] Cleaned up temp file: ${audioPath}`);
    }
  } catch (error) {
    console.error('[YouTube] Cleanup error:', error);
  }
}

// Fetch transcript using captions or Whisper fallback
export async function getYoutubeTranscript(videoUrl) {
  let audioPath = null;

  try {
    const videoId = extractVideoId(videoUrl);
    
    console.log(`[YouTube] Extracting content for video ID: ${videoId}`);

    // STEP 1: Try to get captions (free, instant)
    try {
      console.log('[YouTube] Attempting to fetch captions...');
      
      const transcript = await YoutubeTranscript.fetchTranscript(videoId);

      if (transcript && transcript.length > 0) {
        const fullText = transcript
          .map(segment => segment.text)
          .join(' ')
          .replace(/\s+/g, ' ')
          .trim();

        console.log(`[YouTube] ✓ Captions found: ${fullText.split(' ').length} words`);

        return {
          videoId,
          text: fullText,
          wordCount: fullText.split(/\s+/).length,
          method: 'captions',
          duration: transcript[transcript.length - 1]?.offset || 0
        };
      }
    } catch (captionError) {
      console.log('[YouTube] Captions not available:', captionError.message);
      console.log('[YouTube] Falling back to Whisper transcription...');
    }

    // STEP 2: Fallback to Whisper transcription
    if (!process.env.OPENAI_API_KEY) {
      throw new Error('This video has no captions and OPENAI_API_KEY is not configured for audio transcription');
    }

    // Download audio
    audioPath = await downloadAudio(videoId);

    // Transcribe with Whisper
    const transcription = await transcribeAudio(audioPath);

    // Clean up audio file
    cleanupAudio(audioPath);
    audioPath = null;

    return {
      videoId,
      text: transcription,
      wordCount: transcription.split(/\s+/).length,
      method: 'whisper',
      duration: null
    };

  } catch (error) {
    // Clean up audio file if it exists
    if (audioPath) {
      cleanupAudio(audioPath);
    }

    console.error('[YouTube] Error:', error.message);
    
    if (error.message.includes('Invalid YouTube URL')) {
      throw new Error('Invalid YouTube URL or video ID');
    } else if (error.message.includes('OPENAI_API_KEY')) {
      throw new Error('This video has no captions. Audio transcription is not configured.');
    } else {
      throw new Error(`Failed to extract transcript: ${error.message}`);
    }
  }
}

// Get video metadata from URL
export async function getVideoMetadata(videoId) {
  return {
    videoId,
    url: `https://www.youtube.com/watch?v=${videoId}`,
    thumbnail: `https://img.youtube.com/vi/${videoId}/maxresdefault.jpg`
  };
}
