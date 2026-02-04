import express from 'express';
import { storeDocument } from '../services/rag.js';
import { query } from '../db/database.js';

const router = express.Router();

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
    const { customerId, url } = req.body;

    if (!customerId || !url) {
      return res.status(400).json({ error: 'customerId and url are required' });
    }

    // TODO: Implement web scraping (use Cheerio or Playwright)
    // For now, return placeholder
    res.json({
      success: false,
      message: 'Website scraping not yet implemented',
      note: 'Coming in next iteration'
    });

  } catch (error) {
    console.error('Error scraping website:', error);
    res.status(500).json({ error: 'Failed to scrape website' });
  }
});

// POST /api/content/youtube - Extract YouTube video transcript
router.post('/youtube', async (req, res) => {
  try {
    const { customerId, videoUrl } = req.body;

    if (!customerId || !videoUrl) {
      return res.status(400).json({ error: 'customerId and videoUrl are required' });
    }

    // TODO: Implement YouTube transcript extraction
    // For now, return placeholder
    res.json({
      success: false,
      message: 'YouTube transcript extraction not yet implemented',
      note: 'Coming in next iteration'
    });

  } catch (error) {
    console.error('Error extracting YouTube transcript:', error);
    res.status(500).json({ error: 'Failed to extract transcript' });
  }
});

// POST /api/content/pdf - Upload PDF content
router.post('/pdf', async (req, res) => {
  try {
    const { customerId, title, content } = req.body;

    if (!customerId || !content) {
      return res.status(400).json({ error: 'customerId and content are required' });
    }

    // Content should be pre-extracted text from PDF (done client-side or via separate service)
    const result = await storeDocument({
      customerId,
      title: title || 'PDF Document',
      contentType: 'pdf',
      sourceUrl: null,
      content,
      metadata: { uploadedAt: new Date().toISOString() }
    });

    res.json({
      success: true,
      message: 'PDF content uploaded successfully',
      ...result
    });

  } catch (error) {
    console.error('Error uploading PDF content:', error);
    res.status(500).json({ error: 'Failed to upload PDF' });
  }
});

// POST /api/content/qa - Upload Q&A pairs
router.post('/qa', async (req, res) => {
  try {
    const { customerId, title, qaList } = req.body;

    if (!customerId || !qaList || !Array.isArray(qaList)) {
      return res.status(400).json({ error: 'customerId and qaList (array) are required' });
    }

    // Format Q&A pairs into text
    const content = qaList.map(qa => 
      `Q: ${qa.question}\nA: ${qa.answer}`
    ).join('\n\n');

    const result = await storeDocument({
      customerId,
      title: title || 'Q&A Document',
      contentType: 'qa',
      sourceUrl: null,
      content,
      metadata: { 
        uploadedAt: new Date().toISOString(),
        qaCount: qaList.length
      }
    });

    res.json({
      success: true,
      message: 'Q&A content uploaded successfully',
      ...result
    });

  } catch (error) {
    console.error('Error uploading Q&A content:', error);
    res.status(500).json({ error: 'Failed to upload Q&A' });
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
