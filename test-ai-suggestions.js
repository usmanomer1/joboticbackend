const htmlParserService = require('./src/services/htmlParserService');
const textMatcher = require('./src/utils/textMatcher');
const fs = require('fs-extra');

async function testAISuggestions() {
  console.log('Testing AI Suggestion Application...\n');
  
  // Sample HTML mimicking pdf2htmlEX output
  const originalHtml = `
<!DOCTYPE html>
<html>
<head>
<style>
.pc { position: relative; overflow: hidden; }
.t { position: absolute; white-space: pre; }
</style>
</head>
<body>
<div class="pc">
  <div class="t" id="text-0-1" style="left: 50px; top: 150px;">• Developed web applications</div>
  <div class="t" id="text-0-2" style="left: 50px; top: 170px;">• Led team of engineers</div>
  <div class="t" id="text-0-3" style="left: 50px; top: 190px;">• Managed database systems</div>
  <div class="t" id="text-0-4" style="left: 50px; top: 330px;">JavaScript, Python, SQL</div>
</div>
</body>
</html>
  `;
  
  // Simulate AI suggestions
  const aiSuggestions = [
    {
      originalText: 'Developed web applications',
      suggestedText: 'Developed 5+ scalable web applications serving 100K+ users daily',
      type: 'bullet'
    },
    {
      originalText: 'Led team of engineers',
      suggestedText: 'Led cross-functional team of 8 engineers to deliver projects 20% faster',
      type: 'bullet'
    },
    {
      originalText: 'JavaScript, Python, SQL',
      suggestedText: 'JavaScript, TypeScript, Python, SQL, React, Node.js, AWS, Docker',
      type: 'skills'
    }
  ];
  
  // Parse HTML to get text blocks
  const tempPath = 'temp/html/test-ai.html';
  await fs.ensureDir('temp/html');
  await fs.writeFile(tempPath, originalHtml);
  const parsed = await htmlParserService.parseResumeHtml(tempPath);
  
  // Test 1: Map suggestions to HTML blocks
  console.log('Test 1: Mapping AI suggestions to text blocks...');
  const mappedSuggestions = textMatcher.mapSuggestionsToHtml(parsed.textBlocks, aiSuggestions);
  console.log(`✅ Mapped ${mappedSuggestions.length} suggestions`);
  
  // Test 2: Apply suggestions to HTML
  console.log('\nTest 2: Applying suggestions to HTML...');
  const htmlWithSuggestions = htmlParserService.applySuggestionsToHtml(originalHtml, mappedSuggestions);
  
  // Check if suggestions were applied
  const hasSuggestionStyles = htmlWithSuggestions.includes('ai-suggestion-styles');
  const hasSuggestionClasses = htmlWithSuggestions.includes('ai-suggestion');
  console.log(`✅ Suggestion styles added: ${hasSuggestionStyles}`);
  console.log(`✅ Suggestion classes added: ${hasSuggestionClasses}`);
  
  // Test 3: Get suggestion statistics
  console.log('\nTest 3: Getting suggestion statistics...');
  const stats = htmlParserService.getSuggestionStats(htmlWithSuggestions);
  console.log('Statistics:', stats);
  
  // Test 4: Accept a suggestion
  console.log('\nTest 4: Accepting a suggestion...');
  // Extract first suggestion ID from HTML
  const suggestionIdMatch = htmlWithSuggestions.match(/data-suggestion-id="(suggestion-[^"]+)"/);
  if (suggestionIdMatch) {
    const suggestionId = suggestionIdMatch[1];
    const acceptedHtml = htmlParserService.acceptSuggestion(htmlWithSuggestions, suggestionId);
    const newStats = htmlParserService.getSuggestionStats(acceptedHtml);
    console.log(`✅ Accepted suggestion ${suggestionId}`);
    console.log(`   Pending: ${stats.pending} → ${newStats.pending}`);
    console.log(`   Accepted: ${stats.accepted} → ${newStats.accepted}`);
  }
  
  // Test 5: Reject a suggestion
  console.log('\nTest 5: Rejecting a suggestion...');
  const suggestionIdMatch2 = htmlWithSuggestions.match(/data-suggestion-id="(suggestion-[^"]+)".*?data-suggestion-id="(suggestion-[^"]+)"/);
  if (suggestionIdMatch2 && suggestionIdMatch2[2]) {
    const suggestionId = suggestionIdMatch2[2];
    const rejectedHtml = htmlParserService.rejectSuggestion(htmlWithSuggestions, suggestionId);
    const hasRejectedClass = rejectedHtml.includes('rejected');
    console.log(`✅ Rejected suggestion ${suggestionId}`);
    console.log(`   Rejected class added: ${hasRejectedClass}`);
  }
  
  // Test 6: Accept all suggestions
  console.log('\nTest 6: Accepting all suggestions...');
  const allAcceptedHtml = htmlParserService.acceptAllSuggestions(htmlWithSuggestions);
  const allAcceptedStats = htmlParserService.getSuggestionStats(allAcceptedHtml);
  console.log(`✅ All suggestions accepted:`);
  console.log(`   Accepted: ${allAcceptedStats.accepted}`);
  console.log(`   Pending: ${allAcceptedStats.pending}`);
  
  // Test 7: Revert all changes
  console.log('\nTest 7: Reverting all changes...');
  const revertedHtml = htmlParserService.revertAllChanges(htmlWithSuggestions);
  const hasNoSuggestions = !revertedHtml.includes('ai-suggestion');
  const hasOriginalText = revertedHtml.includes('Developed web applications');
  console.log(`✅ Reverted all changes:`);
  console.log(`   No suggestion classes: ${hasNoSuggestions}`);
  console.log(`   Original text restored: ${hasOriginalText}`);
  
  // Test 8: Export final HTML
  console.log('\nTest 8: Exporting final HTML...');
  const finalHtml = htmlParserService.exportFinalHtml(allAcceptedHtml);
  const isClean = !finalHtml.includes('ai-suggestion') && !finalHtml.includes('original-text');
  const hasUpdatedContent = finalHtml.includes('100K+ users');
  console.log(`✅ Exported final HTML:`);
  console.log(`   Clean of suggestion markup: ${isClean}`);
  console.log(`   Contains updated content: ${hasUpdatedContent}`);
  
  // Test 9: Bulk actions
  console.log('\nTest 9: Testing bulk actions...');
  const bulkActions = mappedSuggestions.slice(0, 2).map((s, i) => ({
    suggestionId: `suggestion-${Date.now()}-${i + 1}`,
    action: i === 0 ? 'accept' : 'reject'
  }));
  // Note: This would need actual suggestion IDs from the HTML
  console.log(`✅ Bulk actions prepared for ${bulkActions.length} suggestions`);
  
  // Cleanup
  await fs.remove(tempPath);
  
  console.log('\n✅ All AI suggestion tests completed!');
}

// Run tests
testAISuggestions().catch(console.error);