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

    for (const file of files) {
      try {
        const text = await extractTextFromFile(file.path, file.mimetype);

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

        results.push({ filename: file.originalname, success: true, chunksStored: result.chunksStored });
        cleanupFile(file.path);
      } catch (error) {
        console.error(`Error processing file ${file.originalname}:`, error);
        cleanupFile(file.path);
        results.push({ filename: file.originalname, success: false, error: error.message });
      }
    }

    const successCount = results.filter(r => r.success).length;
    res.json({ success: true, message: `${successCount} of ${files.length} file(s) uploaded successfully`, results });
  } catch (error) {
    console.error('Error uploading files:', error);
    if (req.files) req.files.forEach(file => cleanupFile(file.path));
    res.status(500).json({ error: 'Failed to upload files', details: error.message });
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

    res.json({ success: true, message: 'Content uploaded successfully', ...result });
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

    let validUrl;
    try { validUrl = new URL(url); } catch (e) { return res.status(400).json({ error: 'Invalid URL format' }); }

    console.log(`[Website Scrape] Customer ${customerId} | Bot ${botId} | Mode: ${fullSite ? 'FULL SITE' : 'SINGLE PAGE'} | URL: ${validUrl.href}`);

    const { scrapeWebpage, crawlWebsite } = await import('../services/webScraper.js');

    if (fullSite) {
      res.json({ success: true, message: 'Website crawl started! Pages will appear in your Documents tab as they are scraped. Refresh the page to see progress.' });

      (async () => {
        let pageCount = 0;
        let totalChunks = 0;
        try {
          await crawlWebsite(validUrl.href, 100, async (pageData) => {
            try {
              const result = await storeDocument({
                customerId: parseInt(customerId),
                botId: botId ? parseInt(botId) : null,
                title: pageData.title,
                contentType: 'website',
                sourceUrl: pageData.url,
                content: pageData.content,
                metadata: { scrapedAt: new Date().toISOString(), wordCount: pageData.wordCount, url: pageData.url, fullSiteCrawl: true }
              });
              pageCount++;
              totalChunks += result.chunksStored;
              console.log(`[Website Scrape] Stored page ${pageCount}: ${pageData.title} (${result.chunksStored} chunks)`);
            } catch (storeError) {
              console.error(`[Website Scrape] Failed to store page ${pageData.url}:`, storeError.message);
            }
          });
          console.log(`[Website Scrape] Background crawl complete! ${pageCount} pages, ${totalChunks} total chunks stored.`);
        } catch (error) {
          console.error('[Website Scrape] Background crawl error:', error);
        }
      })();
    } else {
      const pageData = await scrapeWebpage(validUrl.href);

      const result = await storeDocument({
        customerId: parseInt(customerId),
        botId: botId ? parseInt(botId) : null,
        title: pageData.title,
        contentType: 'website',
        sourceUrl: pageData.url,
        content: pageData.content,
        metadata: { scrapedAt: new Date().toISOString(), wordCount: pageData.wordCount, url: pageData.url }
      });

      res.json({ success: true, message: 'Single page scraped successfully', title: pageData.title, wordCount: pageData.wordCount, chunksStored: result.chunksStored });
    }
  } catch (error) {
    console.error('[Website Scrape] ERROR:', error);
    res.status(500).json({ error: 'Failed to scrape website', details: error.message });
  }
});

// POST /api/content/retrain - Retrain selected documents (re-scrape website pages)
router.post('/retrain', async (req, res) => {
  try {
    const { customerId, documentIds } = req.body;

    if (parseInt(customerId) !== req.customerId) {
      return res.status(403).json({ error: 'Unauthorized' });
    }

    if (!documentIds || !Array.isArray(documentIds) || documentIds.length === 0) {
      return res.status(400).json({ error: 'documentIds array is required' });
    }

    const docsResult = await query(
      'SELECT id, source_url, content_type, bot_id FROM documents WHERE id = ANY($1) AND customer_id = $2',
      [documentIds, customerId]
    );

    const websiteDocs = docsResult.rows.filter(d => d.content_type === 'website' && d.source_url);

    if (websiteDocs.length === 0) {
      return res.status(400).json({ error: 'No website documents found to retrain. Only scraped pages can be retrained.' });
    }

    res.json({
      success: true,
      message: `Retraining ${websiteDocs.length} page(s) in the background. Refresh the page in a moment to see updated content.`
    });

    // Background retrain
    (async () => {
      const { scrapeWebpage } = await import('../services/webScraper.js');
      let successCount = 0;

      for (const doc of websiteDocs) {
        try {
          console.log(`[Retrain] Re-scraping doc ${doc.id}: ${doc.source_url}`);
          const pageData = await scrapeWebpage(doc.source_url);

          // Delete old embeddings and document, then store fresh with new embeddings
          await query('DELETE FROM embeddings WHERE document_id = $1', [doc.id]);
          await query('DELETE FROM documents WHERE id = $1', [doc.id]);

          await storeDocument({
            customerId: parseInt(customerId),
            botId: doc.bot_id,
            title: pageData.title,
            contentType: 'website',
            sourceUrl: doc.source_url,
            content: pageData.content,
            metadata: {
              scrapedAt: new Date().toISOString(),
              wordCount: pageData.wordCount,
              url: pageData.url,
              retrained: true
            }
          });

          successCount++;
          console.log(`[Retrain] Doc ${doc.id} retrained successfully`);
          await new Promise(resolve => setTimeout(resolve, 500));
        } catch (error) {
          console.error(`[Retrain] Failed doc ${doc.id}:`, error.message);
        }
      }
      console.log(`[Retrain] Complete: ${successCount}/${websiteDocs.length} retrained`);
    })();
  } catch (error) {
    console.error('[Retrain] Error:', error);
    res.status(500).json({ error: 'Failed to start retrain' });
  }
});

// POST /api/content/retrain-schedule - Save retrain schedule for a bot
router.post('/retrain-schedule', async (req, res) => {
  try {
    const { customerId, botId, frequency, time } = req.body;

    if (parseInt(customerId) !== req.customerId) {
      return res.status(403).json({ error: 'Unauthorized' });
    }

    const validFrequencies = ['none', 'daily', 'weekly', 'monthly'];
    if (!validFrequencies.includes(frequency)) {
      return res.status(400).json({ error: 'Invalid frequency. Use: none, daily, weekly, monthly' });
    }

    await query(
      'UPDATE bots SET retrain_frequency = $1, retrain_time = $2 WHERE id = $3 AND customer_id = $4',
      [frequency, time || '03:00', botId, customerId]
    );

    console.log(`[Retrain Schedule] Bot ${botId}: ${frequency} at ${time}`);
    res.json({ success: true, message: `Retrain schedule set to ${frequency}${frequency !== 'none' ? ' at ' + time : ''}` });
  } catch (error) {
    console.error('[Retrain Schedule] Error:', error);
    res.status(500).json({ error: 'Failed to save schedule' });
  }
});

// GET /api/content/retrain-schedule/:botId - Get retrain schedule for a bot
router.get('/retrain-schedule/:botId', async (req, res) => {
  try {
    const result = await query(
      'SELECT retrain_frequency, retrain_time, last_retrained_at FROM bots WHERE id = $1',
      [req.params.botId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Bot not found' });
    }

    res.json({
      success: true,
      frequency: result.rows[0].retrain_frequency || 'none',
      time: result.rows[0].retrain_time || '03:00',
      lastRetrained: result.rows[0].last_retrained_at
    });
  } catch (error) {
    console.error('[Retrain Schedule] Error:', error);
    res.status(500).json({ error: 'Failed to get schedule' });
  }
});

// POST /api/content/delete-bulk - Delete multiple documents
router.post('/delete-bulk', async (req, res) => {
  try {
    const { customerId, documentIds } = req.body;

    if (parseInt(customerId) !== req.customerId) {
      return res.status(403).json({ error: 'Unauthorized' });
    }

    if (!documentIds || !Array.isArray(documentIds) || documentIds.length === 0) {
      return res.status(400).json({ error: 'documentIds array is required' });
    }

    const docCheck = await query(
      'SELECT id FROM documents WHERE id = ANY($1) AND customer_id = $2',
      [documentIds, customerId]
    );

    if (docCheck.rows.length === 0) {
      return res.status(404).json({ error: 'No matching documents found' });
    }

    const validIds = docCheck.rows.map(r => r.id);

    await query('DELETE FROM embeddings WHERE document_id = ANY($1)', [validIds]);
    await query('DELETE FROM documents WHERE id = ANY($1)', [validIds]);

    console.log(`[Delete Bulk] Deleted ${validIds.length} documents for customer ${customerId}`);
    res.json({ success: true, message: `${validIds.length} document(s) deleted successfully` });
  } catch (error) {
    console.error('[Delete Bulk] Error:', error);
    res.status(500).json({ error: 'Failed to delete documents' });
  }
});

// POST /api/content/youtube - Extract YouTube video transcript
router.post('/youtube', async (req, res) => {
  try {
    const { customerId, botId, url } = req.body;

    if (!customerId || !url) {
      return res.status(400).json({ error: 'customerId and url are required' });
    }

    const { getYoutubeTranscript, getVideoMetadata } = await import('../services/youtubeTranscript.js');

    const transcriptData = await getYoutubeTranscript(url);
    const metadata = await getVideoMetadata(transcriptData.videoId);

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

    res.json({
      success: true,
      message: `YouTube transcript extracted via ${transcriptData.method}`,
      videoId: transcriptData.videoId,
      wordCount: transcriptData.wordCount,
      chunksStored: result.chunksStored,
      method: transcriptData.method
    });
  } catch (error) {
    console.error('[YouTube] Error:', error);
    res.status(500).json({ error: 'Failed to extract YouTube transcript', details: error.message });
  }
});

// GET /api/content/:customerId - List all documents for a customer
router.get('/:customerId', async (req, res) => {
  try {
    const { customerId } = req.params;

    const result = await query(
      `SELECT id, title, content_type, source_url, metadata, created_at
       FROM documents WHERE customer_id = $1 ORDER BY created_at DESC`,
      [customerId]
    );

    res.json({ success: true, documents: result.rows });
  } catch (error) {
    console.error('Error listing documents:', error);
    res.status(500).json({ error: 'Failed to list documents' });
  }
});

// DELETE /api/content/:documentId - Delete a single document
router.delete('/:documentId', async (req, res) => {
  try {
    const { documentId } = req.params;
    const { customerId } = req.body;

    if (parseInt(customerId) !== req.customerId) {
      return res.status(403).json({ error: 'Unauthorized' });
    }

    const docCheck = await query('SELECT id FROM documents WHERE id = $1 AND customer_id = $2', [documentId, customerId]);
    if (docCheck.rows.length === 0) return res.status(404).json({ error: 'Document not found' });

    await query('DELETE FROM embeddings WHERE document_id = $1', [documentId]);
    await query('DELETE FROM documents WHERE id = $1', [documentId]);

    res.json({ success: true, message: 'Document deleted successfully' });
  } catch (error) {
    console.error('Error deleting document:', error);
    res.status(500).json({ error: 'Failed to delete document' });
  }
});

export default router;
