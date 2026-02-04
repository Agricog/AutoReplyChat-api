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

// Fetch and format YouTube transcript
export async function getYoutubeTranscript(videoUrl) {
  try {
    const videoId = extractVideoId(videoUrl);
    
    console.log(`[YouTube] Extracting transcript for video ID: ${videoId}`);

    // Fetch transcript
    const transcript = await YoutubeTranscript.fetchTranscript(videoId);

    if (!transcript || transcript.length === 0) {
      throw new Error('No transcript available for this video');
    }

    // Combine all transcript segments into readable text
    const fullText = transcript
      .map(segment => segment.text)
      .join(' ')
      .replace(/\s+/g, ' ') // Clean up multiple spaces
      .trim();

    console.log(`[YouTube] Transcript extracted: ${fullText.split(' ').length} words`);

    return {
      videoId,
      text: fullText,
      wordCount: fullText.split(/\s+/).length,
      duration: transcript[transcript.length - 1]?.offset || 0
    };

  } catch (error) {
    console.error('[YouTube] Error:', error.message);
    
    if (error.message.includes('Transcript is disabled')) {
      throw new Error('This video has transcripts disabled by the creator');
    } else if (error.message.includes('Could not find')) {
      throw new Error('No transcript available for this video');
    } else if (error.message.includes('Invalid')) {
      throw new Error('Invalid YouTube URL or video ID');
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
