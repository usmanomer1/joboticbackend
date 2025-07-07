const textMatcher = require('./src/utils/textMatcher');

async function testTextMatcher() {
  console.log('Testing Text Matcher Utilities...\n');
  
  // Sample text blocks (simulating HTML parser output)
  const textBlocks = [
    { id: 'text-0-1', text: 'John Doe', position: { left: 250, top: 50 }, fontSize: 16 },
    { id: 'text-0-2', text: 'john@example.com | 555-1234', position: { left: 200, top: 80 }, fontSize: 12 },
    { id: 'text-0-3', text: '• Developed scalable microservices using Node.js', position: { left: 70, top: 170 }, fontSize: 12 },
    { id: 'text-0-4', text: '• Led team of 5 engineers on critical project', position: { left: 70, top: 190 }, fontSize: 12 },
    { id: 'text-0-5', text: 'JavaScript, Python, React, Node.js, AWS', position: { left: 50, top: 330 }, fontSize: 12 }
  ];
  
  // Test 1: Text normalization
  console.log('Test 1: Text normalization...');
  const testTexts = [
    'Hello   World', // Extra spaces
    'Hello\nWorld', // Line break
    'Hello—World', // Em dash
    "Hello's World" // Smart quote
  ];
  
  testTexts.forEach(text => {
    console.log(`  "${text}" → "${textMatcher.normalizeText(text)}"`);
  });
  
  // Test 2: Similarity calculation
  console.log('\nTest 2: Similarity calculation...');
  const pairs = [
    ['Hello World', 'Hello World'], // Exact match
    ['Hello World', 'Hello  World'], // Extra space
    ['microservices', 'micro-services'], // Hyphen difference
    ['Led team of 5', 'Led team of 5 engineers'] // Partial match
  ];
  
  pairs.forEach(([str1, str2]) => {
    const similarity = textMatcher.calculateSimilarity(str1, str2);
    console.log(`  "${str1}" vs "${str2}": ${(similarity * 100).toFixed(1)}%`);
  });
  
  // Test 3: Find best match
  console.log('\nTest 3: Finding best match...');
  const searchTexts = [
    'Developed scalable microservices using Node.js', // Exact match
    'Led team of 5 engineers', // Partial match
    'JavaScript, Python, React' // Beginning of skills
  ];
  
  searchTexts.forEach(search => {
    const match = textMatcher.findBestMatch(textBlocks, search);
    if (match) {
      console.log(`  Search: "${search.substring(0, 30)}..."`);
      console.log(`  Found: "${match.text.substring(0, 30)}..." (${(match.matchScore * 100).toFixed(1)}%)`);
    }
  });
  
  // Test 4: AI suggestions mapping
  console.log('\nTest 4: AI suggestions mapping...');
  const aiSuggestions = [
    {
      originalText: 'Developed scalable microservices using Node.js',
      suggestedText: 'Architected and deployed 10+ scalable microservices using Node.js, reducing latency by 40%',
      type: 'bullet'
    },
    {
      originalText: 'JavaScript, Python, React, Node.js',
      suggestedText: 'JavaScript, TypeScript, Python, React, Node.js, AWS, Docker, Kubernetes',
      type: 'skills'
    }
  ];
  
  const mappedSuggestions = textMatcher.mapSuggestionsToHtml(textBlocks, aiSuggestions);
  console.log(`  Mapped ${mappedSuggestions.length} suggestions:`);
  mappedSuggestions.forEach(suggestion => {
    console.log(`    - Block ${suggestion.blockId}: ${suggestion.confidence} confidence`);
  });
  
  // Test 5: Validation
  console.log('\nTest 5: Suggestion validation...');
  const validations = [
    { original: 'Hello World', suggested: 'Hello Beautiful World' }, // Valid
    { original: 'Hello', suggested: 'Hello <b>World</b>' }, // Invalid - HTML
    { original: 'Short', suggested: 'This is a very very very long replacement text that might break layout' } // Warning - length
  ];
  
  validations.forEach(({ original, suggested }) => {
    const result = textMatcher.validateSuggestion(original, suggested);
    console.log(`  "${original}" → "${suggested}"`);
    console.log(`    Valid: ${result.isValid}, Warnings: ${result.warnings.length}, Errors: ${result.errors.length}`);
  });
  
  // Test 6: Block type identification
  console.log('\nTest 6: Block type identification...');
  const testBlocks = [
    '• Implemented feature X',
    'EXPERIENCE',
    'john@example.com',
    'JavaScript, Python, React',
    'January 2020 - Present',
    'Regular text description'
  ];
  
  testBlocks.forEach(text => {
    const type = textMatcher.identifyBlockType(text);
    console.log(`  "${text}" → Type: ${type}`);
  });
  
  // Test 7: AI prompt creation
  console.log('\nTest 7: AI prompt creation...');
  const sampleBlock = {
    text: '• Developed web application',
    type: 'bullet'
  };
  const prompt = textMatcher.createBlockPrompt(sampleBlock, 'Looking for senior developer with React experience');
  console.log('  Generated prompt:', prompt.substring(0, 100) + '...');
  
  // Test 8: Batch blocks for AI
  console.log('\nTest 8: Batching blocks for AI...');
  const blocksForBatching = textMatcher.prepareBlocksForAI(textBlocks);
  const batches = textMatcher.batchBlocksForAI(blocksForBatching, 2);
  console.log(`  Created ${batches.length} batches from ${blocksForBatching.length} blocks`);
  batches.forEach((batch, i) => {
    console.log(`    Batch ${i + 1}: ${batch.type} (${batch.blocks.length} blocks)`);
  });
  
  console.log('\n✅ All tests completed!');
}

// Run tests
testTextMatcher();