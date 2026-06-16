import { marked } from 'marked';
import puppeteer from 'puppeteer';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

interface PDFOptions {
  watermark?: boolean;
  title?: string;
  baseUrl?: string;
  fontFamily?: string;
}

function normalizeBaseUrl(value: string) {
  return value.replace(/\/+$/, '');
}

function defaultBaseUrl() {
  const port = process.env.PORT || '5001';
  return `http://localhost:${port}`;
}

export class PDFService {
  private static async generateHTML(markdown: string, options: PDFOptions): Promise<string> {
    try {
      console.log('[PDF Service] Generating HTML from markdown');
      const html = marked(markdown);
      console.log('[PDF Service] Markdown converted to HTML successfully');
      
      let watermarkHtml = '';
      if (options.watermark) {
        const baseUrl = normalizeBaseUrl(options.baseUrl || process.env.PUBLIC_BASE_URL || defaultBaseUrl());
        watermarkHtml = `
        <div style="
          position: fixed;
          bottom: 0;
          right: 50%;
          transform: translateX(50%);
          width: 100vw;
          height: 100vh;
          opacity: 1;
          z-index: 1000;
          pointer-events: none;
          display: flex;
          page-break-after: always;
        ">
          <img src="${baseUrl}/logo_b.svg" alt="Watermark" style="
            width: 300%;
            height: auto;
            opacity: 0.03;
            filter: drop-shadow(0 2px 8px rgba(0,0,0,0.08));
            user-select: none;
            pointer-events: none;
            display: block;
          " />
        </div>
      `;
      }
      console.log('[PDF Service] Watermark HTML generated:', !!watermarkHtml);

      return `
        <!DOCTYPE html>
        <html>
          <head>
            <meta charset="UTF-8">
            <title>${options.title || 'Document'}</title>
            <style>
              body {
                font-family: ${options.fontFamily || "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, 'Open Sans', 'Helvetica Neue', sans-serif"};
                line-height: 1.6;
                color: #333;
                position: relative;
                overflow: hidden;
                background: white;
              }
              .content-wrapper {
                max-width: 800px;
                margin: 0 auto;
                box-sizing: border-box;
              }
              pre {
                background-color: #f5f5f5;
                padding: 1rem;
                border-radius: 4px;
                overflow-x: auto;
              }
              code {
                font-family: 'SFMono-Regular', Consolas, 'Liberation Mono', Menlo, Courier, monospace;
              }
              img {
                max-width: 100%;
                height: auto;
              }
              @media print {
                body {
                  padding: 0;
                }
                pre {
                  white-space: pre-wrap;
                  page-break-inside: avoid;
                }
                h1, h2, h3, h4, h5, h6 {
                  page-break-after: avoid;
                }
                img {
                  page-break-inside: avoid;
                }
              }
            </style>
          </head>
          <body>
            ${watermarkHtml}
            <div class="content-wrapper">
              ${html}
            </div>
          </body>
        </html>
      `;
    } catch (error) {
      console.error('[PDF Service] Error generating HTML:', error);
      throw new Error('Failed to generate HTML from markdown');
    }
  }

  public static async generatePDF(markdown: string, options: PDFOptions = {}): Promise<Buffer> {
    console.log('[PDF Service] Starting PDF generation');
    let browser;
    try {
      browser = await puppeteer.launch({
        headless: true,
        args: ['--no-sandbox', '--disable-setuid-sandbox']
      });
      console.log('[PDF Service] Browser launched successfully');

      const page = await browser.newPage();
      console.log('[PDF Service] New page created');

      const html = await this.generateHTML(markdown, options);
      console.log('[PDF Service] HTML generated, length:', html.length);
      
      await page.setContent(html, {
        waitUntil: 'networkidle0'
      });
      console.log('[PDF Service] Content set on page');

      const pdfBuffer = await page.pdf({
        format: 'A4',
        margin: {
          top: '1in',
          bottom: '1in',
          left: '1in',
          right: '1in'
        },
        printBackground: true
      });
      console.log('[PDF Service] PDF generated, buffer size:', pdfBuffer.length);

      return Buffer.from(pdfBuffer);
    } catch (error) {
      console.error('[PDF Service] Error generating PDF:', error);
      throw new Error('Failed to generate PDF');
    } finally {
      if (browser) {
        console.log('[PDF Service] Closing browser');
        await browser.close();
      }
    }
  }
}
