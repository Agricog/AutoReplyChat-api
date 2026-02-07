import express from 'express';
import { storeDocument } from '../services/rag.js';
import { query } from '../db/database.js';
import { upload, extractTextFromFile, cleanupFile } from '../services/fileUpload.js';

const router = express.Router();

// POST /api/content/upload - Upload files (PDF, Word, TXT, CSV, Excel)
router.post('/upload', upload.array('files', 10), async (req, res) => {
  try {
    const { customerId, botId } = req.body;
    const files = req.files;

    if (!customerId || !files || files.length === 0) {
      return res.status(400).json({ error: 'customerId and at least one file are required' });
    }

    const results = [];
    
    // Process each file
    for (const file of files) {
      try {
        // Extract text from file
        const text = await extractTextFromFile(file.path, file.mimetype);

        // Store in database
        const result = await storeDocument({
          customerId: parseInt(customerId),
          botId: botId ? parseInt(botId) : null,
          title: file.originalname,
          contentType: file.mimetype.includes('pdf') ? 'pdf' : 
                       file.mimetype.includes('word') ? 'docx' :
                       file.mimetype.includes('csv') ? 'csv' :
                       file.mimetype.includes('spreadsheet') ? 'excel' : 'text',
          sourceUrl: file.originalname,
          content: text,
          metadata: {
            uploadedAt: new Date().toISOString(),
            filename: file.originalname,
            fileSize: file.size,
            mimetype: file.mimetype
          }
        });

        results.push({
          filename: file.originalname,
          success: true,
          chunksStored: result.chunksStored
        });

        // Clean up uploaded file
        cleanupFile(file.path);
      } catch (error) {
        console.error(`Error processing file ${file.originalname}:`, error);
        cleanupFile(file.path);
        results.push({
          filename: file.originalname,
          success: false,
          error: error.message
        });
      }
    }

    const successCount = results.filter(r => r.success).length;
    
    res.json({
      success: true,
      message: `${successCount} of ${files.length} file(s) uploaded successfully`,
      results
    });
  } catch (error) {
    console.error('Error uploading files:', error);
    
    // Clean up files on error
    if (req.files) {
      req.files.forEach(file => cleanupFile(file.path));
    }
    
    res.status(500).json({ 
      error: 'Failed to upload files',
      details: error.message 
    });
  }
});

// POST /api/content/text - Upload plain text content
router.post('/text', async (req, res) => {
  try {
    const { customerId, botId, title, content } = req.body;
    
    if (!customerId || !content) {
      return res.status(400).json({ error: 'customerId and content are required' });
    }

    const result = await storeDocument({
      customerId: parseInt(customerId),
      botId: botId ? parseInt(botId) : null,
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

// POST /api/content/scrape-website - Scrape and store website content
router.post('/scrape-website', async (req, res) => {
  try {
    const { customerId, botId, url, mode } = req.body;
    
    if (!customerId || !url) {
      return res.status(400).json({ error: 'customerId and url are required' });
    }

    const fullSite = mode === 'full';

    // Validate URL
    let validUrl;
    try {
      validUrl = new URL(url);
    } catch (e) {
      return res.status(400).json({ error: 'Invalid URL format' });
    }

    console.log(`[Website Scrape] Customer ${customerId} | Bot ${botId} | Mode: ${fullSite ? 'FULL SITE' : 'SINGLE PAGE'} | URL: ${validUrl.href}`);

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
          botId: botId ? parseInt(botId) : null,
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
        botId: botId ? parseInt(botId) : null,
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
    const { customerId, botId, url } = req.body;
    
    if (!customerId || !url) {
      return res.status(400).json({ error: 'customerId and url are required' });
    }

    console.log(`[YouTube] Customer ${customerId} | Bot ${botId} | URL: ${url}`);

    // Import YouTube transcript service
    const { getYoutubeTranscript, getVideoMetadata } = await import('../services/youtubeTranscript.js');

    // Extract transcript (tries captions first, then Whisper)
    const transcriptData = await getYoutubeTranscript(url);
    const metadata = await getVideoMetadata(transcriptData.videoId);

    console.log(`[YouTube] Transcript obtained via ${transcriptData.method}`);

    // Store transcript as document
    const result = await storeDocument({
      customerId: parseInt(customerId),
      botId: botId ? parseInt(botId) : null,
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
    
    // Delete embeddings first
    await query(
      `DELETE FROM embeddings WHERE document_id = $1`,
      [documentId]
    );
    
    // Then delete document
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
