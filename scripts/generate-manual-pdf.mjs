import fs from 'node:fs';
import path from 'node:path';
import PDFDocument from 'pdfkit';

function createPdf() {
  const doc = new PDFDocument({
    size: 'A4',
    margin: 40,
    info: {
      Title: 'GST-Invoice User Manual',
      Author: 'GST-Invoice Team',
      Subject: 'Complete User & Operating Manual',
    }
  });

  const outPath = path.join('docs', 'USER_MANUAL.pdf');
  const stream = fs.createWriteStream(outPath);
  doc.pipe(stream);

  const pageWidth = doc.page.width - 80;

  // Title Page / Header
  doc.rect(0, 0, doc.page.width, 100).fill('#1a202c');
  doc.fillColor('#ffffff').fontSize(24).font('Helvetica-Bold')
     .text('GST-Invoice — User Manual', 40, 30);
  doc.fontSize(12).font('Helvetica')
     .text('Complete Visual Operating Guide for Catering & Hospitality Businesses', 40, 62);

  doc.moveDown(4);
  doc.fillColor('#1a202c');

  // Overview
  doc.fontSize(16).font('Helvetica-Bold').text('1. System Overview & Architecture');
  doc.moveDown(0.5);
  doc.fontSize(10).font('Helvetica').text(
    'GST-Invoice is a specialized GST accounting and invoicing application built for catering businesses. ' +
    'It handles sales invoicing, purchase recording, input tax credit (ITC) tracking, GSTR-1 and GSTR-3B return generation, ' +
    'and secure document storage.\n\n' +
    '• Integer Paise Arithmetic: Eliminates floating point errors by storing all currency in integer paise (₹1 = 100 paise).\n' +
    '• Server-Side Calculation: All tax computations and rounding are authoritatively verified by the server engine.\n' +
    '• Private S3 Storage: Invoices, vendor bills, and contract attachments are securely stored in private object storage.'
  );

  doc.moveDown(1.5);

  // Sign In
  doc.fontSize(16).font('Helvetica-Bold').text('2. Sign-In & User Roles');
  doc.moveDown(0.5);
  doc.fontSize(10).font('Helvetica').text(
    'Default Credentials for local development & administrative access:\n' +
    '• Email: login@genrecai.com\n' +
    '• Password: genrecai\n' +
    '• Roles: Owner (Full business management and configuration) and Accountant (Daily sales, purchases, and parties).'
  );

  doc.moveDown(0.5);
  const imgLogin = path.join('docs', 'screenshots', '01-login-screen.jpg');
  if (fs.existsSync(imgLogin)) {
    doc.image(imgLogin, { fit: [pageWidth, 200], align: 'center' });
    doc.moveDown(0.5);
    doc.fontSize(9).font('Helvetica-Oblique').text('Figure 1: Application Login Screen (/login)', { align: 'center' });
  }

  // Page 2: Dashboard & Settings
  doc.addPage();
  doc.fillColor('#1a202c');
  doc.fontSize(16).font('Helvetica-Bold').text('3. Dashboard & Period Tracking');
  doc.moveDown(0.5);
  doc.fontSize(10).font('Helvetica').text(
    'The Dashboard displays the active filing period (e.g. November 2026 / 2026-11), fiscal year, business trade name, ' +
    'and quick navigation across Sales, Purchases, Parties, and Settings.'
  );

  doc.moveDown(0.5);
  const imgDash = path.join('docs', 'screenshots', '02-dashboard-screen.jpg');
  if (fs.existsSync(imgDash)) {
    doc.image(imgDash, { fit: [pageWidth, 190], align: 'center' });
    doc.moveDown(0.5);
    doc.fontSize(9).font('Helvetica-Oblique').text('Figure 2: Main Dashboard (/)' , { align: 'center' });
  }

  doc.moveDown(1.5);
  doc.fontSize(16).font('Helvetica-Bold').text('4. Settings & Business Configuration');
  doc.moveDown(0.5);
  doc.fontSize(10).font('Helvetica').text(
    'Configure legal name, GSTIN, PAN, state code, filing frequency (Monthly/Quarterly), and tax rates in Settings (/settings).'
  );

  doc.moveDown(0.5);
  const imgBiz = path.join('docs', 'screenshots', '03-settings-business.jpg');
  if (fs.existsSync(imgBiz)) {
    doc.image(imgBiz, { fit: [pageWidth, 190], align: 'center' });
    doc.moveDown(0.5);
    doc.fontSize(9).font('Helvetica-Oblique').text('Figure 3: Business & GST Settings Tab', { align: 'center' });
  }

  // Page 3: Tax Rates & HSN
  doc.addPage();
  doc.fillColor('#1a202c');
  doc.fontSize(16).font('Helvetica-Bold').text('5. Tax Rates & HSN Master Data');
  doc.moveDown(0.5);
  doc.fontSize(10).font('Helvetica').text(
    'Tax rates are stored in basis points (500 bp = 5%, 1800 bp = 18%). Standard HSN/SAC codes for catering include 996331 ' +
    '(restaurant & outdoor catering without ITC) and 996332 (banquet and hotel catering).'
  );

  doc.moveDown(0.5);
  const imgRates = path.join('docs', 'screenshots', '04-settings-rates.jpg');
  if (fs.existsSync(imgRates)) {
    doc.image(imgRates, { fit: [pageWidth, 180], align: 'center' });
    doc.moveDown(0.5);
    doc.fontSize(9).font('Helvetica-Oblique').text('Figure 4: Tax Rates Configuration', { align: 'center' });
  }

  doc.moveDown(1);
  const imgHsn = path.join('docs', 'screenshots', '05-settings-hsn.jpg');
  if (fs.existsSync(imgHsn)) {
    doc.image(imgHsn, { fit: [pageWidth, 180], align: 'center' });
    doc.moveDown(0.5);
    doc.fontSize(9).font('Helvetica-Oblique').text('Figure 5: HSN / SAC Codes Master List', { align: 'center' });
  }

  // Page 4: Parties
  doc.addPage();
  doc.fillColor('#1a202c');
  doc.fontSize(16).font('Helvetica-Bold').text('6. Parties Management (Customers & Suppliers)');
  doc.moveDown(0.5);
  doc.fontSize(10).font('Helvetica').text(
    'Manage clients and vendors in Parties (/parties). When adding a party:\n' +
    '• Kind: Select Customer or Supplier.\n' +
    '• Name & GSTIN: Enter legal business name and 15-character GSTIN (or leave blank for unregistered retail consumers).\n' +
    '• State: Dictates whether supplies are intra-state (CGST+SGST) or inter-state (IGST).'
  );

  doc.moveDown(0.5);
  const imgParties = path.join('docs', 'screenshots', '06-parties-screen.jpg');
  if (fs.existsSync(imgParties)) {
    doc.image(imgParties, { fit: [pageWidth, 240], align: 'center' });
    doc.moveDown(0.5);
    doc.fontSize(9).font('Helvetica-Oblique').text('Figure 6: Parties Management Screen (/parties)', { align: 'center' });
  }

  // Page 5: Sales Invoicing
  doc.addPage();
  doc.fillColor('#1a202c');
  doc.fontSize(16).font('Helvetica-Bold').text('7. Sales Invoicing Workflow');
  doc.moveDown(0.5);
  doc.fontSize(10).font('Helvetica').text(
    'Create professional GST tax invoices with live server-calculated taxes:\n' +
    '1. Navigate to Sales (/sales) and click New invoice.\n' +
    '2. Select customer, enter line items (description, HSN, quantity, unit rate, and GST rate).\n' +
    '3. Live preview calculates Taxable value, CGST, SGST, IGST, and Round-Off.\n' +
    '4. Save invoice and download high-resolution PDF for printing and sharing.'
  );

  doc.moveDown(0.5);
  const imgSalesList = path.join('docs', 'screenshots', '07-sales-list.jpg');
  if (fs.existsSync(imgSalesList)) {
    doc.image(imgSalesList, { fit: [pageWidth, 180], align: 'center' });
    doc.moveDown(0.5);
    doc.fontSize(9).font('Helvetica-Oblique').text('Figure 7: Sales Invoices List (/sales)', { align: 'center' });
  }

  doc.moveDown(1);
  const imgSalesNew = path.join('docs', 'screenshots', '08-sales-new-invoice.jpg');
  if (fs.existsSync(imgSalesNew)) {
    doc.image(imgSalesNew, { fit: [pageWidth, 190], align: 'center' });
    doc.moveDown(0.5);
    doc.fontSize(9).font('Helvetica-Oblique').text('Figure 8: New Sales Invoice Form with Live Tax Computation', { align: 'center' });
  }

  // Page 6: Purchases & ITC
  doc.addPage();
  doc.fillColor('#1a202c');
  doc.fontSize(16).font('Helvetica-Bold').text('8. Purchases & Input Tax Credit (ITC)');
  doc.moveDown(0.5);
  doc.fontSize(10).font('Helvetica').text(
    'Record inward supplier bills and track eligible vs blocked ITC:\n' +
    '• Supplier Bill Number: Enter original bill reference.\n' +
    '• Category: Inputs, Input services, Capital goods, or Expense (Blocked ITC).\n' +
    '• ITC Period: Month in which the credit is claimed in GSTR-3B.'
  );

  doc.moveDown(0.5);
  const imgPurchList = path.join('docs', 'screenshots', '09-purchases-list.jpg');
  if (fs.existsSync(imgPurchList)) {
    doc.image(imgPurchList, { fit: [pageWidth, 180], align: 'center' });
    doc.moveDown(0.5);
    doc.fontSize(9).font('Helvetica-Oblique').text('Figure 9: Purchases List (/purchases)', { align: 'center' });
  }

  doc.moveDown(1);
  const imgPurchNew = path.join('docs', 'screenshots', '10-purchases-new-bill.jpg');
  if (fs.existsSync(imgPurchNew)) {
    doc.image(imgPurchNew, { fit: [pageWidth, 190], align: 'center' });
    doc.moveDown(0.5);
    doc.fontSize(9).font('Helvetica-Oblique').text('Figure 10: New Purchase Bill Form with ITC Classification', { align: 'center' });
  }

  // Page 7: Audit Log & Returns
  doc.addPage();
  doc.fillColor('#1a202c');
  doc.fontSize(16).font('Helvetica-Bold').text('9. Returns, Audit Trail & Document Storage');
  doc.moveDown(0.5);
  doc.fontSize(10).font('Helvetica').text(
    '• GST Returns: Automatic compilation into GSTR-1 (B2B, B2CL, B2CS, HSN) and GSTR-3B (Output tax liability and ITC net set-off).\n' +
    '• Document Attachments: Upload bill photos and PDF contracts (up to 10 MB) into secure private S3 storage.\n' +
    '• Audit Log: Complete audit log tracking every user action with before and after snapshots.'
  );

  doc.moveDown(0.5);
  const imgAudit = path.join('docs', 'screenshots', '11-audit-log.jpg');
  if (fs.existsSync(imgAudit)) {
    doc.image(imgAudit, { fit: [pageWidth, 230], align: 'center' });
    doc.moveDown(0.5);
    doc.fontSize(9).font('Helvetica-Oblique').text('Figure 11: Compliance Audit Log Viewer (/settings)', { align: 'center' });
  }

  doc.moveDown(2);
  doc.fontSize(11).font('Helvetica-Bold').text('Summary Checklist for Monthly Operations:');
  doc.fontSize(9).font('Helvetica').text(
    '1. Record all sales bills and ensure invoice numbers follow continuous sequence.\n' +
    '2. Enter all supplier purchase bills and verify ITC eligibility flag.\n' +
    '3. Compare monthly sales with GSTR-1 figures.\n' +
    '4. Verify eligible ITC in GSTR-3B.\n' +
    '5. File return, record ARN, and lock the period.'
  );

  doc.end();
  console.log(`PDF created successfully at: ${outPath}`);
}

createPdf();
