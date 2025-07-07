const pdfToHtmlService = require('./src/services/pdfToHtmlService');
const fs = require('fs-extra');
const path = require('path');

async function testPdfToHtml() {
  console.log('Testing PDF to HTML conversion service...\n');
  
  // Create a simple test PDF (you'll need to place a test PDF here)
  const testPdfPath = 'temp/uploads/test-resume.pdf';
  
  try {
    // Test 1: Validate PDF
    console.log('Test 1: Validating PDF...');
    const isValid = await pdfToHtmlService.validatePdf(testPdfPath);
    console.log(`PDF validation: ${isValid ? '✅ Valid' : '❌ Invalid'}`);
    
    if (!isValid) {
      console.log('\nPlease place a test PDF at:', testPdfPath);
      return;
    }
    
    // Test 2: Convert PDF to HTML
    console.log('\nTest 2: Converting PDF to HTML...');
    const htmlPath = await pdfToHtmlService.convert(testPdfPath);
    console.log(`✅ HTML generated at: ${htmlPath}`);
    
    // Test 3: Verify HTML exists
    console.log('\nTest 3: Verifying HTML file...');
    const htmlExists = await fs.pathExists(htmlPath);
    console.log(`HTML file exists: ${htmlExists ? '✅ Yes' : '❌ No'}`);
    
    // Test 4: Check HTML content
    if (htmlExists) {
      const htmlContent = await fs.readFile(htmlPath, 'utf8');
      console.log(`HTML size: ${(htmlContent.length / 1024).toFixed(2)} KB`);
      console.log(`Contains pdf2htmlEX markers: ${htmlContent.includes('pdf2htmlEX') ? '✅ Yes' : '❌ No'}`);
    }
    
    // Test 5: Test cleanup
    console.log('\nTest 5: Testing cleanup...');
    await pdfToHtmlService.cleanupSpecific(htmlPath);
    const stillExists = await fs.pathExists(path.dirname(htmlPath));
    console.log(`Cleanup successful: ${!stillExists ? '✅ Yes' : '❌ No'}`);
    
    // Test 6: Test error handling
    console.log('\nTest 6: Testing error handling...');
    try {
      await pdfToHtmlService.convert('non-existent.pdf');
      console.log('❌ Error handling failed - should have thrown');
    } catch (error) {
      console.log('✅ Error handling works:', error.message);
    }
    
    console.log('\n✅ All tests completed!');
    
  } catch (error) {
    console.error('\n❌ Test failed:', error.message);
  }
}

// Run tests
testPdfToHtml();