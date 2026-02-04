import express from 'express';
import { storeDocument } from '../services/rag.js';
import { query } from '../db/database.js';
import { upload, extractTextFromFile, cleanupFile } from '../services/fileUpload.js';

const router = express.Router();

// POST /api/content/upload - Upload file (PDF, Word, TXT)
router.post('/upload', upload.single('file'), async (req, res) => {
  try {
    const { customerId } = req.body;
    const file = req.file;

    if (!customerId || !file) {
      return res.status(400).json({ error: 'customerId and file are required' });
    }

    // Extract text from file
    const text = await extractTextFromFile(file.path, file.mimetype);

    // Store in database
    const result = await storeDocument({
      customerId: parseInt(customerId),
      title: file.originalname,
      contentType: file.mimetype.includes('pdf') ? 'pdf' : 
                   file.mimetype.includes('word') ? 'docx' : 'text',
      sourceUrl: file.originalname,
      content: text,
      metadata: {
        uploadedAt: new Date().toISOString(),
        filename: file.originalname,
        fileSize: file.size,
        mimetype: file.mimetype
      }
    });

    // Clean up uploaded file
    cleanupFile(file.path);

    res.json({
      success: true,
      message: 'File uploaded successfully',
      ...result
    });

  } catch (error) {
    console.error('Error uploading file:', error);
    
    // Clean up file on error
    if (req.file) {
      cleanupFile(req.file.path);
    }
    
    res.status(500).json({ 
      error: 'Failed to upload file',
      details: error.message 
    });
  }
});

// POST /api/content/text - Upload plain text content
router.post('/text', async (req, res) => {
  try {
    const { customerId, title, content } = req.body;

    if (!customerId || !content) {
      return res.status(400).json({ error: 'customerId and content are required' });
    }

    const result = await storeDocument({
      customerId,
      title: title || 'Text Document',
      contentType: 'text',
      sourceUrl: null,
      content,
      metadata: { uploadedAt: new Date().toISOString() }
    });

    res.json({
      success: true,
      message: 'Content uploaded successfully',
      ...result
    });

  } catch (error) {
    console.error('Error uploading text content:', error);
    res.status(500).json({ error: 'Failed to upload content' });
  }
});

// POST /api/content/website - Scrape and store website content
router.post('/website', async (req, res) => {
  try {
    const { customerId, url, fullSite = true } = req.body;

    if (!customerId || !url) {
      return res.status(400).json({ error: 'customerId and url are required' });
    }

    // Validate URL
    let validUrl;
    try {
      validUrl = new URL(url);
    } catch (e) {
      return res.status(400).json({ error: 'Invalid URL format' });
    }

    console.log(`[Website Scrape] Customer ${customerId} | Mode: ${fullSite ? 'FULL SITE' : 'SINGLE PAGE'} | URL: ${validUrl.href}`);

    // Import scraper
    const { scrapeWebpage, crawlWebsite } = await import('../services/webScraper.js');

    let totalChunks = 0;
    let pageCount = 0;

    if (fullSite) {
      console.log('[Website Scrape] Starting full website crawl...');
      
      // Crawl entire website (up to 20 pages)
      const pages = await crawlWebsite(validUrl.href, 20);
      
      console.log(`[Website Scrape] Crawl complete. ${pages.length} pages found.`);
      
      // Store each page as a separate document
      for (const pageData of pages) {
        const result = await storeDocument({
          customerId: parseInt(customerId),
          title: pageData.title,
          contentType: 'website',
          sourceUrl: pageData.url,
          content: pageData.content,
          metadata: {
            scrapedAt: new Date().toISOString(),
            wordCount: pageData.wordCount,
            url: pageData.url,
            fullSiteCrawl: true
          }
        });
        totalChunks += result.chunksStored;
        pageCount++;
        console.log(`[Website Scrape] Stored page ${pageCount}: ${pageData.title} (${result.chunksStored} chunks)`);
      }

      console.log(`[Website Scrape] Complete! ${pageCount} pages, ${totalChunks} total chunks stored.`);

      res.json({
        success: true,
        message: `Website crawled successfully! ${pageCount} pages scraped.`,
        pagesScraped: pageCount,
        totalChunks: totalChunks
      });

    } else {
      console.log('[Website Scrape] Scraping single page...');
      
      // Scrape single page only
      const pageData = await scrapeWebpage(validUrl.href);

      const result = await storeDocument({
        customerId: parseInt(customerId),
        title: pageData.title,
        contentType: 'website',
        sourceUrl: pageData.url,
        content: pageData.content,
        metadata: {
          scrapedAt: new Date().toISOString(),
          wordCount: pageData.wordCount,
          url: pageData.url
        }
      });

      console.log(`[Website Scrape] Single page stored: ${pageData.title} (${result.chunksStored} chunks)`);

      res.json({
        success: true,
        message: 'Single page scraped successfully',
        title: pageData.title,
        wordCount: pageData.wordCount,
        chunksStored: result.chunksStored
      });
    }

  } catch (error) {
    console.error('[Website Scrape] ERROR:', error);
    res.status(500).json({ 
      error: 'Failed to scrape website',
      details: error.message 
    });
  }
});

// POST /api/content/youtube - Extract YouTube video transcript
router.post('/youtube', async (req, res) => {
  try {
    const { customerId, videoUrl } = req.body;

    if (!customerId || !videoUrl) {
      return res.status(400).json({ error: 'customerId and videoUrl are required' });
    }

    console.log(`[YouTube] Customer ${customerId} | URL: ${videoUrl}`);

    // Import YouTube transcript service
    const { getYoutubeTranscript, getVideoMetadata } = await import('../services/youtubeTranscript.js');

    // Extract transcript (tries captions first, then Whisper)
    const transcriptData = await getYoutubeTranscript(videoUrl);
    const metadata = await getVideoMetadata(transcriptData.videoId);

    console.log(`[YouTube] Transcript obtained via ${transcriptData.method}`);

    // Store transcript as document
    const result = await storeDocument({
      customerId: parseInt(customerId),
      title: `YouTube Video: ${transcriptData.videoId}`,
      contentType: 'youtube',
      sourceUrl: metadata.url,
      content: transcriptData.text,
      metadata: {
        extractedAt: new Date().toISOString(),
        videoId: transcriptData.videoId,
        wordCount: transcriptData.wordCount,
        duration: transcriptData.duration,
        thumbnail: metadata.thumbnail,
        extractionMethod: transcriptData.method
      }
    });

    console.log(`[YouTube] Transcript stored: ${transcriptData.wordCount} words, ${result.chunksStored} chunks`);

    res.json({
      success: true,
      message: `YouTube transcript extracted successfully via ${transcriptData.method}`,
      videoId: transcriptData.videoId,
      wordCount: transcriptData.wordCount,
      chunksStored: result.chunksStored,
      method: transcriptData.method
    });

  } catch (error) {
    console.error('[YouTube] Error:', error);
    res.status(500).json({ 
      error: 'Failed to extract YouTube transcript',
      details: error.message 
    });
  }
});

    console.log(`[YouTube] Transcript stored: ${transcriptData.wordCount} words, ${result.chunksStored} chunks`);

    res.json({
      success: true,
      message: 'YouTube transcript extracted successfully',
      videoId: transcriptData.videoId,
      wordCount: transcriptData.wordCount,
      chunksStored: result.chunksStored
    });

  } catch (error) {
    console.error('[YouTube] Error:', error);
    res.status(500).json({ 
      error: 'Failed to extract YouTube transcript',
      details: error.message 
    });
  }
});

// GET /api/content/:customerId - List all documents for a customer
router.get('/:customerId', async (req, res) => {
  try {
    const { customerId } = req.params;

    const result = await query(
      `SELECT id, title, content_type, source_url, metadata, created_at
       FROM documents
       WHERE customer_id = $1
       ORDER BY created_at DESC`,
      [customerId]
    );

    res.json({
      success: true,
      documents: result.rows
    });

  } catch (error) {
    console.error('Error listing documents:', error);
    res.status(500).json({ error: 'Failed to list documents' });
  }
});

// DELETE /api/content/:documentId - Delete a document
router.delete('/:documentId', async (req, res) => {
  try {
    const { documentId } = req.params;

    await query(
      `DELETE FROM documents WHERE id = $1`,
      [documentId]
    );

    res.json({
      success: true,
      message: 'Document deleted successfully'
    });

  } catch (error) {
    console.error('Error deleting document:', error);
    res.status(500).json({ error: 'Failed to delete document' });
  }
});

export default router;
