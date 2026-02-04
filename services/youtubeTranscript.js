import { YoutubeTranscript } from 'youtube-transcript';

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

// Fetch transcript from YouTube captions
export async function getYoutubeTranscript(videoUrl) {
  try {
    const videoId = extractVideoId(videoUrl);
    
    console.log(`[YouTube] Extracting captions for video ID: ${videoId}`);

    const transcript = await YoutubeTranscript.fetchTranscript(videoId);

    if (!transcript || transcript.length === 0) {
      throw new Error('No captions available for this video');
    }

    const fullText = transcript
      .map(segment => segment.text)
      .join(' ')
      .replace(/\s+/g, ' ')
      .trim();

    console.log(`[YouTube] ✓ Captions extracted: ${fullText.split(' ').length} words`);

    return {
      videoId,
      text: fullText,
      wordCount: fullText.split(/\s+/).length,
      method: 'captions',
      duration: transcript[transcript.length - 1]?.offset || 0
    };

  } catch (error) {
    console.error('[YouTube] Error:', error.message);
    
    if (error.message.includes('Transcript is disabled')) {
      throw new Error('This video does not have captions enabled. Please try a video with captions (most educational content, TED talks, news videos have them).');
    } else if (error.message.includes('Could not find')) {
      throw new Error('No captions available for this video. Please try a different video.');
    } else if (error.message.includes('Invalid')) {
      throw new Error('Invalid YouTube URL or video ID');
    } else {
      throw new Error(`Failed to extract captions: ${error.message}`);
    }
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
