import { AssemblyAI } from 'assemblyai';

const client = new AssemblyAI({
  apiKey: process.env.ASSEMBLYAI_API_KEY
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

// Transcribe YouTube video using AssemblyAI
export async function getYoutubeTranscript(videoUrl) {
  try {
    const videoId = extractVideoId(videoUrl);
    const fullUrl = videoUrl.includes('youtube.com') ? videoUrl : `https://www.youtube.com/watch?v=${videoId}`;
    
    console.log(`[YouTube] Transcribing video: ${videoId}`);
    console.log(`[YouTube] This may take 30-90 seconds depending on video length...`);

    const transcript = await client.transcripts.transcribe({
      audio: fullUrl
    });

    if (transcript.status === 'error') {
      throw new Error(transcript.error);
    }

    console.log(`[YouTube] ✓ Transcription complete: ${transcript.words.length} words`);

    return {
      videoId,
      text: transcript.text,
      wordCount: transcript.words.length,
      method: 'assemblyai',
      duration: transcript.audio_duration
    };

  } catch (error) {
    console.error('[YouTube] Error:', error.message);
    throw new Error(`Failed to transcribe video: ${error.message}`);
  }
}

// Get video metadata
export async function getVideoMetadata(videoId) {
  return {
    videoId,
    url: `https://www.youtube.com/watch?v=${videoId}`,
    thumbnail: `https://img.youtube.com/vi/${videoId}/maxresdefault.jpg`
  };
}
