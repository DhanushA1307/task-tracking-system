const puppeteer = require('puppeteer');
const path = require('path');

(async () => {
  const htmlPath = path.resolve(__dirname, '..', 'SYSTEM_ARCHITECTURE.html');
  const pdfPath  = path.resolve(__dirname, '..', 'SYSTEM_ARCHITECTURE.pdf');

  console.log('Launching browser...');
  const browser = await puppeteer.launch({
    headless: 'new',
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--font-render-hinting=none'
    ]
  });

  const page = await browser.newPage();
  await page.setViewport({ width: 1200, height: 900 });

  console.log('Loading HTML file...');
  await page.goto(`file:///${htmlPath.replace(/\\/g, '/')}`, {
    waitUntil: 'networkidle0',
    timeout: 60000
  });

  // Give diagrams time to fully render
  await new Promise(r => setTimeout(r, 2000));

  console.log('Generating PDF...');
  await page.pdf({
    path: pdfPath,
    format: 'A4',
    printBackground: true,
    margin: { top: '15mm', right: '12mm', bottom: '15mm', left: '12mm' },
    displayHeaderFooter: true,
    headerTemplate: `
      <div style="font-size:9px;color:#718096;width:100%;text-align:center;padding:5px 0;font-family:sans-serif;">
        System Architecture &amp; End-to-End Flow Analysis – Task Tracking System
      </div>`,
    footerTemplate: `
      <div style="font-size:9px;color:#718096;width:100%;text-align:center;padding:5px 0;font-family:sans-serif;">
        Page <span class="pageNumber"></span> of <span class="totalPages"></span> &nbsp;|&nbsp; Ingage Technologies &nbsp;|&nbsp; Confidential
      </div>`
  });

  await browser.close();
  console.log('PDF generated successfully at: ' + pdfPath);
})();
