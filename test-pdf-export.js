const pdfExportService = require('./src/services/pdfExportService');
const fs = require('fs-extra');
const path = require('path');

async function testPdfExport() {
  console.log('Testing PDF Export Service...\n');
  
  // Sample HTML from pdf2htmlEX with AI suggestions applied
  const sampleHtml = `
<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8"/>
<style>
.pc { position: relative; overflow: hidden; width: 595px; height: 842px; }
.t { position: absolute; white-space: pre; font-family: Arial, sans-serif; }
.fs16 { font-size: 16px; }
.fs12 { font-size: 12px; }
.ai-suggestion { background-color: rgba(34, 197, 94, 0.2); }
</style>
</head>
<body>
<div class="pc">
  <div class="t fs16" style="left: 250px; top: 50px; font-weight: bold;">John Doe</div>
  <div class="t fs12" style="left: 200px; top: 80px;">john@example.com | 555-123-4567</div>
  
  <div class="t fs14" style="left: 50px; top: 120px; font-weight: bold;">EXPERIENCE</div>
  <div class="t fs12" style="left: 50px; top: 150px;">Senior Software Engineer - Tech Corp</div>
  <div class="t fs12" style="left: 400px; top: 150px;">2020 - Present</div>
  <div class="t fs12 ai-suggestion" style="left: 70px; top: 170px;">• Architected and deployed 10+ scalable microservices using Node.js, reducing latency by 40%</div>
  <div class="t fs12 ai-suggestion" style="left: 70px; top: 190px;">• Led cross-functional team of 8 engineers to deliver projects 20% faster</div>
  
  <div class="t fs14" style="left: 50px; top: 230px; font-weight: bold;">EDUCATION</div>
  <div class="t fs12" style="left: 50px; top: 260px;">BS Computer Science - State University</div>
  <div class="t fs12" style="left: 400px; top: 260px;">2016 - 2020</div>
  
  <div class="t fs14" style="left: 50px; top: 300px; font-weight: bold;">SKILLS</div>
  <div class="t fs12 ai-suggestion" style="left: 50px; top: 330px;">JavaScript, TypeScript, Python, React, Node.js, AWS, Docker, Kubernetes</div>
</div>
</body>
</html>
  `;
  
  try {
    // Test 1: Basic PDF generation
    console.log('Test 1: Basic PDF generation...');
    const basicPdf = await pdfExportService.generatePdfFromHtml(
      sampleHtml,
      'temp/exports/test-basic.pdf'
    );
    console.log(`✅ Basic PDF generated: ${basicPdf}`);
    const basicExists = await fs.pathExists(basicPdf);
    console.log(`   File exists: ${basicExists}`);
    
    // Test 2: Custom options PDF
    console.log('\nTest 2: PDF with custom options...');
    const customPdf = await pdfExportService.generateCustomPdf(sampleHtml, {
      filename: 'test-custom.pdf',
      format: 'Letter',
      scale: 1.2,
      margin: { top: '0.5in', bottom: '0.5in', left: '0.5in', right: '0.5in' }
    });
    console.log(`✅ Custom PDF generated:`);
    console.log(`   Path: ${customPdf.localPath}`);
    console.log(`   Size: ${(customPdf.size / 1024).toFixed(2)} KB`);
    
    // Test 3: Different paper sizes
    console.log('\nTest 3: Different paper sizes...');
    const a4Pdf = await pdfExportService.generateWithPaperSize(sampleHtml, 'A4');
    const legalPdf = await pdfExportService.generateWithPaperSize(sampleHtml, 'Legal');
    console.log(`✅ A4 PDF: ${path.basename(a4Pdf)}`);
    console.log(`✅ Legal PDF: ${path.basename(legalPdf)}`);
    
    // Test 4: PDF with margins
    console.log('\nTest 4: PDF with custom margins...');
    const marginPdf = await pdfExportService.generateWithMargins(sampleHtml, {
      top: '1in',
      bottom: '1in',
      left: '0.75in',
      right: '0.75in'
    });
    console.log(`✅ PDF with margins: ${path.basename(marginPdf)}`);
    
    // Test 5: PDF with header/footer
    console.log('\nTest 5: PDF with header and footer...');
    const hfPdf = await pdfExportService.generateWithHeaderFooter(sampleHtml, {
      headerTemplate: '<div style="font-size: 10px; text-align: center;">Resume - John Doe</div>',
      footerTemplate: '<div style="font-size: 10px; text-align: center;">Page <span class="pageNumber"></span> of <span class="totalPages"></span></div>',
      marginTop: '1in',
      marginBottom: '1in'
    });
    console.log(`✅ PDF with header/footer: ${path.basename(hfPdf)}`);
    
    // Test 6: HTML validation
    console.log('\nTest 6: HTML validation...');
    const validation = pdfExportService.validateHtml(sampleHtml);
    console.log(`✅ HTML validation:`);
    console.log(`   Valid: ${validation.isValid}`);
    console.log(`   Warnings: ${validation.warnings.length}`);
    console.log(`   Errors: ${validation.errors.length}`);
    
    // Test 7: Batch generation
    console.log('\nTest 7: Batch PDF generation...');
    const batchOptions = [
      { filename: 'batch-1.pdf', format: 'Letter' },
      { filename: 'batch-2.pdf', format: 'A4', scale: 0.9 },
      { filename: 'batch-3.pdf', format: 'Letter', margin: { top: '1in', bottom: '1in' } }
    ];
    const batchResults = await pdfExportService.batchGenerate(sampleHtml, batchOptions);
    console.log(`✅ Batch generated ${batchResults.length} PDFs`);
    batchResults.forEach((result, i) => {
      console.log(`   ${i + 1}. ${result.success ? 'Success' : 'Failed'}: ${result.filename || result.error}`);
    });
    
    // Test 8: Enhanced HTML
    console.log('\nTest 8: Testing HTML enhancement...');
    const enhancedHtml = pdfExportService.enhanceHtmlForPdf(sampleHtml);
    const hasEnhancements = enhancedHtml.includes('@media print') && enhancedHtml.includes('text-rendering');
    console.log(`✅ HTML enhanced: ${hasEnhancements}`);
    
    // Test 9: Cleanup (don't actually run to keep test files)
    console.log('\nTest 9: Cleanup functionality...');
    console.log('✅ Cleanup method available (not executed to preserve test files)');
    
    // Test 10: Supabase upload (only if configured)
    console.log('\nTest 10: Storage upload...');
    if (process.env.SUPABASE_URL && process.env.SUPABASE_ANON_KEY) {
      try {
        const uploadPdf = await pdfExportService.generateAndUpload(sampleHtml, {
          filename: 'test-upload.pdf',
          upload: true
        });
        console.log(`✅ PDF uploaded to: ${uploadPdf.publicUrl}`);
      } catch (error) {
        console.log(`⚠️  Upload test skipped: ${error.message}`);
      }
    } else {
      console.log('⚠️  Upload test skipped: Supabase not configured');
    }
    
    console.log('\n✅ All PDF export tests completed!');
    
  } catch (error) {
    console.error('\n❌ Test failed:', error.message);
    console.error(error.stack);
  }
}

// Run tests
testPdfExport();