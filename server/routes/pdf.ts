import { Router, type Request } from 'express';
import { PDFService } from '../services/pdf.js';
import { z } from 'zod';
import { validateRequest } from '../middleware/validate.js';

const router = Router();

function getPublicBaseUrl(req: Request) {
  if (process.env.PUBLIC_BASE_URL) {
    return process.env.PUBLIC_BASE_URL.replace(/\/+$/, '');
  }

  const protocol = req.protocol;
  const host = req.get('host');
  return `${protocol}://${host}`;
}

const generatePDFSchema = z.object({
  markdown: z.string(),
  title: z.string().optional(),
  fontFamily: z.string().optional(),
});

router.post('/generate', validateRequest({ body: generatePDFSchema }), async (req, res) => {
  try {
    const { markdown, title, fontFamily } = req.body;

    console.log('[PDF Generation] Starting PDF generation for:', title);
    console.log('[PDF Generation] Markdown content length:', markdown.length);

    const shouldWatermark = true;

    const baseUrl = getPublicBaseUrl(req);
    
    const pdfBuffer = await PDFService.generatePDF(markdown, {
      watermark: shouldWatermark,
      title,
      baseUrl,
      fontFamily
    });

    console.log('[PDF Generation] PDF generated successfully, buffer size:', pdfBuffer.length);

    // Set appropriate headers for PDF download
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${title || 'document'}.pdf"`);
    
    res.send(pdfBuffer);
  } catch (error) {
    console.error('[PDF Generation] Error:', error);
    res.status(500).json({ error: 'Failed to generate PDF' });
  }
});

// Add a test endpoint to verify PDF generation
router.get('/test', async (req, res) => {
  try {
    console.log('[PDF Test] Starting test PDF generation');
    const testMarkdown = `# Test Document

This is a test document to verify PDF generation.

## Features
- Markdown support
- Code blocks
- Lists
- And more!

\`\`\`javascript
// Test code block
const test = "Hello, PDF!";
console.log(test);
\`\`\`

> This is a test quote to verify formatting.

1. Numbered list
2. With multiple items
3. To test formatting

* Bullet list
* With multiple items
* To test formatting

![Test Image](https://via.placeholder.com/150)

| Table | Test |
|-------|------|
| Cell 1| Cell 2|
| Cell 3| Cell 4|
`;

    const baseUrl = getPublicBaseUrl(req);
    
    const pdfBuffer = await PDFService.generatePDF(testMarkdown, {
      watermark: true,
      title: 'test-document',
      baseUrl
    });

    console.log('[PDF Test] PDF generated successfully, buffer size:', pdfBuffer.length);

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', 'attachment; filename="test-document.pdf"');
    res.send(pdfBuffer);
  } catch (error) {
    console.error('[PDF Test] Error:', error);
    res.status(500).json({ error: 'Failed to generate test PDF' });
  }
});

export default router;
