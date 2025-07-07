const htmlParserService = require('./src/services/htmlParserService');
const fs = require('fs-extra');

async function testHtmlParser() {
  console.log('Testing HTML Parser Service...\n');
  
  // Sample HTML that mimics pdf2htmlEX output
  const sampleHtml = `
<!DOCTYPE html>
<html>
<head>
<style>
.pc { position: relative; overflow: hidden; }
.t { position: absolute; white-space: pre; }
.fs16 { font-size: 16px; }
.fs12 { font-size: 12px; }
</style>
</head>
<body>
<div class="pc" style="width: 595px; height: 842px;">
  <div class="t fs16" style="left: 250px; top: 50px; font-weight: bold;">John Doe</div>
  <div class="t fs12" style="left: 200px; top: 80px;">john@example.com | 555-1234</div>
  
  <div class="t fs14" style="left: 50px; top: 120px; font-weight: bold;">EXPERIENCE</div>
  <div class="t fs12" style="left: 50px; top: 150px;">Software Engineer - Tech Corp</div>
  <div class="t fs12" style="left: 400px; top: 150px;">2020 - Present</div>
  <div class="t fs12" style="left: 70px; top: 170px;">• Developed scalable microservices</div>
  <div class="t fs12" style="left: 70px; top: 190px;">• Led team of 5 engineers</div>
  
  <div class="t fs14" style="left: 50px; top: 230px; font-weight: bold;">EDUCATION</div>
  <div class="t fs12" style="left: 50px; top: 260px;">BS Computer Science - University</div>
  <div class="t fs12" style="left: 400px; top: 260px;">2016 - 2020</div>
  
  <div class="t fs14" style="left: 50px; top: 300px; font-weight: bold;">SKILLS</div>
  <div class="t fs12" style="left: 50px; top: 330px;">JavaScript, Python, React, Node.js</div>
</div>
</body>
</html>
  `;
  
  // Create test HTML file
  const testHtmlPath = 'temp/html/test-resume.html';
  await fs.ensureDir('temp/html');
  await fs.writeFile(testHtmlPath, sampleHtml);
  
  try {
    // Test 1: Parse HTML
    console.log('Test 1: Parsing HTML structure...');
    const parsed = await htmlParserService.parseResumeHtml(testHtmlPath);
    
    console.log(`✅ Found ${parsed.textBlocks.length} text blocks`);
    console.log(`✅ Found ${parsed.metadata.totalPages} pages`);
    
    // Test 2: Check document structure
    console.log('\nTest 2: Document structure...');
    const structure = parsed.documentStructure;
    
    console.log(`Name: ${structure.name ? structure.name.text : 'Not found'}`);
    console.log(`Contact blocks: ${structure.contact.length}`);
    console.log(`Sections found: ${structure.sections.length}`);
    
    structure.sections.forEach(section => {
      console.log(`  - ${section.title} (${section.type}): ${section.items.length} items`);
    });
    
    // Test 3: Test text block positions
    console.log('\nTest 3: Text block positions...');
    const firstBlocks = parsed.textBlocks.slice(0, 3);
    firstBlocks.forEach(block => {
      console.log(`  "${block.text}" at (${block.position.left}, ${block.position.top})`);
    });
    
    // Test 4: Find blocks by text
    console.log('\nTest 4: Finding blocks by text...');
    const experienceBlocks = htmlParserService.findBlocksByText(parsed.textBlocks, 'experience');
    console.log(`✅ Found ${experienceBlocks.length} blocks containing "experience"`);
    
    // Test 5: Test HTML rebuild
    console.log('\nTest 5: Testing HTML rebuild...');
    const modifications = [
      {
        originalText: 'Developed scalable microservices',
        newText: 'Built and deployed cloud-native microservices'
      },
      {
        originalText: 'JavaScript, Python, React, Node.js',
        newText: 'JavaScript, TypeScript, Python, React, Node.js, AWS'
      }
    ];
    
    const modifiedHtml = htmlParserService.rebuildHtml(sampleHtml, modifications);
    const hasModifications = modifications.every(mod => 
      modifiedHtml.includes(mod.newText)
    );
    console.log(`✅ HTML rebuild: ${hasModifications ? 'Success' : 'Failed'}`);
    
    // Test 6: Test region search
    console.log('\nTest 6: Testing region search...');
    const leftColumnBlocks = htmlParserService.getBlocksInRegion(parsed.textBlocks, {
      left: 0,
      top: 0,
      right: 300,
      bottom: 842
    });
    console.log(`✅ Found ${leftColumnBlocks.length} blocks in left column`);
    
    console.log('\n✅ All tests completed successfully!');
    
  } catch (error) {
    console.error('\n❌ Test failed:', error.message);
    console.error(error.stack);
  } finally {
    // Cleanup
    await fs.remove(testHtmlPath);
  }
}

// Run tests
testHtmlParser();