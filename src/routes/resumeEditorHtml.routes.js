/**
 * Resume Editor HTML Routes
 * Uses pdf2htmlEX for perfect layout preservation
 */

const express = require('express');
const router = express.Router();
const multer = require('multer');
const { v4: uuidv4 } = require('uuid');
const path = require('path');
const fs = require('fs-extra');
const { validate } = require('../middleware/validators');
const { body } = require('express-validator');
const asyncHandler = require('../middleware/asyncHandler');
const { AppError } = require('../middleware/errorHandler');

// Import services
const pdfToHtmlService = require('../services/pdfToHtmlService');
const htmlParserService = require('../services/htmlParserService');
const pdfExportService = require('../services/pdfExportService');
const textMatcher = require('../utils/textMatcher');
const geminiClient = require('../utils/geminiClient');
const { createClient } = require('@supabase/supabase-js');

// Initialize Supabase
const supabase = process.env.SUPABASE_URL && process.env.SUPABASE_ANON_KEY
  ? createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY)
  : null;

// Configure multer for PDF uploads
const storage = multer.diskStorage({
  destination: async (req, file, cb) => {
    const uploadDir = 'temp/uploads';
    await fs.ensureDir(uploadDir);
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, `resume-${uniqueSuffix}${path.extname(file.originalname)}`);
  }
});

const upload = multer({
  storage: storage,
  limits: {
    fileSize: 10 * 1024 * 1024 // 10MB limit
  },
  fileFilter: (req, file, cb) => {
    console.log('=== MULTER FILE FILTER ===');
    console.log('File details:', {
      fieldname: file.fieldname,
      originalname: file.originalname,
      mimetype: file.mimetype,
      encoding: file.encoding
    });
    
    // Accept various PDF mimetypes AND text files for AI generation
    const pdfMimetypes = [
      'application/pdf',
      'application/x-pdf',
      'application/acrobat',
      'applications/vnd.pdf',
      'text/pdf',
      'text/x-pdf'
    ];
    
    const textMimetypes = [
      'text/plain',
      'application/text',
      'text/txt',
      'application/txt'
    ];
    
    const allAllowedMimetypes = [...pdfMimetypes, ...textMimetypes];
    
    // Check mimetype or file extension
    const ext = path.extname(file.originalname).toLowerCase();
    const isAllowedMimetype = allAllowedMimetypes.includes(file.mimetype);
    const isAllowedExtension = ['.pdf', '.txt'].includes(ext);
    
    if (isAllowedMimetype || isAllowedExtension) {
      console.log('File accepted:', file.originalname);
      cb(null, true);
    } else {
      console.error('File rejected:', {
        mimetype: file.mimetype,
        extension: ext,
        filename: file.originalname
      });
      cb(new AppError(`Only PDF or text files are allowed. Received: ${file.mimetype} (${ext})`, 400));
    }
  }
});

// Session storage (in production, use Redis or database)
const sessions = new Map();

// Validation schemas
const validators = {
  parseForEdit: [
    body('userId')
      .optional()
      .isString()
      .trim()
      .withMessage('User ID must be a string'),
    body('jobDescription')
      .optional()
      .isString()
      .trim()
      .withMessage('Job description must be a string')
  ],
  applySuggestion: [
    body('sessionId')
      .isString()
      .trim()
      .notEmpty()
      .withMessage('Session ID is required'),
    body('suggestionId')
      .isString()
      .trim()
      .notEmpty()
      .withMessage('Suggestion ID is required'),
    body('action')
      .isIn(['accept', 'reject'])
      .withMessage('Action must be accept or reject')
  ],
  exportPdf: [
    body('sessionId')
      .isString()
      .trim()
      .notEmpty()
      .withMessage('Session ID is required'),
    body('format')
      .optional()
      .isIn(['Letter', 'A4', 'Legal'])
      .withMessage('Invalid paper format'),
    body('includeMargins')
      .optional()
      .isBoolean()
      .withMessage('Include margins must be boolean')
  ]
};

/**
 * Generate AI suggestions for resume improvement
 */
async function generateAISuggestions(documentStructure, jobDescription = null) {
  const suggestions = [];
  
  try {
    // Process experience section
    const experienceSection = documentStructure.sections.find(s => s.type === 'experience');
    if (experienceSection) {
      for (const item of experienceSection.items) {
        if (item.type === 'bullet' && item.text) {
          const prompt = textMatcher.createBlockPrompt(
            { text: item.text, type: 'bullet' },
            jobDescription
          );
          
          const improved = await geminiClient.generateOptimizedContent(prompt);
          if (improved && improved !== item.text) {
            suggestions.push({
              originalText: item.text,
              suggestedText: improved,
              type: 'bullet',
              reason: 'Enhanced with metrics and impact'
            });
          }
        }
      }
    }
    
    // Process skills section
    const skillsSection = documentStructure.sections.find(s => s.type === 'skills');
    if (skillsSection) {
      for (const item of skillsSection.items) {
        if (item.text && item.text.includes(',')) {
          const prompt = textMatcher.createBlockPrompt(
            { text: item.text, type: 'skills' },
            jobDescription
          );
          
          const improved = await geminiClient.generateOptimizedContent(prompt);
          if (improved && improved !== item.text) {
            suggestions.push({
              originalText: item.text,
              suggestedText: improved,
              type: 'skills',
              reason: 'Updated with relevant technologies'
            });
          }
        }
      }
    }
  } catch (error) {
    console.error('AI suggestion generation error:', error);
  }
  
  return suggestions;
}

/**
 * Store session data
 */
async function storeSession(sessionData) {
  const sessionId = uuidv4();
  sessions.set(sessionId, {
    ...sessionData,
    createdAt: new Date(),
    lastUpdated: new Date()
  });
  
  // Clean up old sessions (older than 24 hours)
  const now = Date.now();
  for (const [id, session] of sessions.entries()) {
    if (now - session.createdAt.getTime() > 24 * 60 * 60 * 1000) {
      sessions.delete(id);
    }
  }
  
  return sessionId;
}

/**
 * @route   POST /api/resume-editor-html/parse-for-edit
 * @desc    Parse PDF resume using pdf2htmlEX and create editable version
 * @access  Private
 */
router.post('/parse-for-edit',
  upload.single('resume'),
  validate(validators.parseForEdit),
  asyncHandler(async (req, res) => {
    console.log('=== PARSE-FOR-EDIT REQUEST ===');
    console.log('Headers content-type:', req.headers['content-type']);
    console.log('Headers content-length:', req.headers['content-length']);
    console.log('Body fields:', Object.keys(req.body));
    console.log('File received:', req.file ? 'YES' : 'NO');
    
    if (req.file) {
      console.log('File details:', {
        fieldname: req.file.fieldname,
        originalname: req.file.originalname,
        mimetype: req.file.mimetype,
        size: req.file.size,
        path: req.file.path
      });
    }
    
    const { userId, jobDescription } = req.body;
    const pdfFile = req.file;
    
    if (!pdfFile) {
      console.error('NO FILE RECEIVED!');
      console.log('Debug info:', {
        bodyKeys: Object.keys(req.body),
        bodyValues: req.body,
        hasFile: !!req.file,
        hasFiles: !!req.files
      });
      
      return res.status(400).json({
        success: false,
        error: 'No file uploaded',
        details: {
          expectedFieldName: 'resume',
          receivedFields: Object.keys(req.body),
          contentType: req.headers['content-type'],
          contentLength: req.headers['content-length'],
          hint: 'Ensure you are using multipart/form-data with field name "resume"',
          debugEndpoint: '/api/resume-editor-html/parse-for-edit-debug'
        }
      });
    }
    
    console.log('Processing file:', pdfFile.originalname);
    console.log('User ID:', userId);
    console.log('Has job description:', !!jobDescription);
    
    try {
      let htmlPath;
      let conversionResult;
      
      // Check if it's a text file or PDF
      const isTextFile = pdfFile.mimetype.includes('text') || 
                        pdfFile.originalname.toLowerCase().endsWith('.txt');
      
      if (isTextFile) {
        console.log('Processing text file...');
        // For text files, create HTML directly
        const textContent = await fs.readFile(pdfFile.path, 'utf-8');
        const tempHtml = pdfToHtmlService.generateFallbackHtml({}, textContent);
        
        // Save HTML
        const outputName = path.basename(pdfFile.originalname, path.extname(pdfFile.originalname));
        const outputDir = path.join('temp/html', `${outputName}-text`);
        await fs.ensureDir(outputDir);
        htmlPath = path.join(outputDir, `${outputName}.html`);
        await fs.writeFile(htmlPath, tempHtml);
        
        conversionResult = {
          method: 'text-input',
          htmlPath: htmlPath,
          fallbackUsed: false
        };
      } else {
        // Convert PDF to HTML with fallback support
        console.log('Converting PDF to HTML...');
        conversionResult = await pdfToHtmlService.convertWithFallback(pdfFile.path);
        htmlPath = conversionResult.htmlPath;
        
        if (conversionResult.fallbackUsed) {
          console.log('Used fallback text extraction method');
        }
      }
      
      // Parse HTML structure
      console.log('Parsing HTML structure...');
      const parsed = await htmlParserService.parseResumeHtml(htmlPath);
      const { fullHtml, textBlocks, documentStructure } = parsed;
      
      console.log(`Parsed ${textBlocks.length} text blocks`);
      console.log(`Found ${documentStructure.sections.length} sections`);
      
      // Generate AI suggestions if job description provided
      let suggestions = [];
      let mappedSuggestions = [];
      
      if (jobDescription) {
        console.log('Generating AI suggestions...');
        suggestions = await generateAISuggestions(documentStructure, jobDescription);
        console.log(`Generated ${suggestions.length} suggestions`);
        
        // Map suggestions to HTML blocks
        mappedSuggestions = textMatcher.mapSuggestionsToHtml(textBlocks, suggestions);
        console.log(`Mapped ${mappedSuggestions.length} suggestions to HTML blocks`);
      }
      
      // Apply suggestions to HTML (preview mode)
      const htmlWithSuggestions = mappedSuggestions.length > 0
        ? htmlParserService.applySuggestionsToHtml(fullHtml, mappedSuggestions)
        : fullHtml;
      
      // Store session
      const sessionId = await storeSession({
        userId: userId || `temp_${uuidv4()}`,
        originalPdfPath: pdfFile.path,
        htmlPath,
        originalHtml: fullHtml,
        currentHtml: htmlWithSuggestions,
        textBlocks,
        suggestions: mappedSuggestions,
        documentStructure
      });
      
      console.log('Session created:', sessionId);
      
      // Clean up uploaded PDF after processing
      fs.remove(pdfFile.path).catch(console.error);
      
      res.json({
        success: true,
        data: {
          sessionId,
          htmlContent: htmlWithSuggestions,
          suggestions: mappedSuggestions,
          documentStructure,
          conversionMethod: conversionResult.method,
          stats: {
            totalBlocks: textBlocks.length,
            totalSuggestions: mappedSuggestions.length,
            sections: documentStructure.sections.map(s => ({
              type: s.type,
              itemCount: s.items.length
            }))
          }
        }
      });
      
    } catch (error) {
      // Clean up on error
      if (pdfFile) {
        fs.remove(pdfFile.path).catch(console.error);
      }
      console.error('Parse for edit error:', error);
      throw new AppError(`Failed to parse resume: ${error.message}`, 500);
    }
  })
);

/**
 * @route   POST /api/resume-editor-html/apply-suggestion
 * @desc    Accept or reject an individual suggestion
 * @access  Private
 */
router.post('/apply-suggestion',
  validate(validators.applySuggestion),
  asyncHandler(async (req, res) => {
    const { sessionId, suggestionId, action } = req.body;
    
    console.log('=== APPLY SUGGESTION REQUEST ===');
    console.log(`Session: ${sessionId}`);
    console.log(`Suggestion: ${suggestionId}`);
    console.log(`Action: ${action}`);
    
    // Get session
    const session = sessions.get(sessionId);
    if (!session) {
      throw new AppError('Session not found or expired', 404);
    }
    
    try {
      // Apply the suggestion action
      let updatedHtml;
      if (action === 'accept') {
        updatedHtml = htmlParserService.acceptSuggestion(session.currentHtml, suggestionId);
      } else {
        updatedHtml = htmlParserService.rejectSuggestion(session.currentHtml, suggestionId);
      }
      
      // Update session
      session.currentHtml = updatedHtml;
      session.lastUpdated = new Date();
      
      // Get updated statistics
      const stats = htmlParserService.getSuggestionStats(updatedHtml);
      
      res.json({
        success: true,
        data: {
          htmlContent: updatedHtml,
          stats
        }
      });
      
    } catch (error) {
      console.error('Apply suggestion error:', error);
      throw new AppError(`Failed to apply suggestion: ${error.message}`, 500);
    }
  })
);

/**
 * @route   POST /api/resume-editor-html/apply-all
 * @desc    Accept or reject all suggestions
 * @access  Private
 */
router.post('/apply-all',
  body('sessionId').isString().notEmpty(),
  body('action').isIn(['accept', 'reject']),
  asyncHandler(async (req, res) => {
    const { sessionId, action } = req.body;
    
    const session = sessions.get(sessionId);
    if (!session) {
      throw new AppError('Session not found or expired', 404);
    }
    
    try {
      let updatedHtml;
      if (action === 'accept') {
        updatedHtml = htmlParserService.acceptAllSuggestions(session.currentHtml);
      } else {
        updatedHtml = htmlParserService.rejectAllSuggestions(session.currentHtml);
      }
      
      session.currentHtml = updatedHtml;
      session.lastUpdated = new Date();
      
      const stats = htmlParserService.getSuggestionStats(updatedHtml);
      
      res.json({
        success: true,
        data: {
          htmlContent: updatedHtml,
          stats
        }
      });
    } catch (error) {
      console.error('Apply all error:', error);
      throw new AppError(`Failed to apply all suggestions: ${error.message}`, 500);
    }
  })
);

/**
 * @route   POST /api/resume-editor-html/revert
 * @desc    Revert all changes and restore original
 * @access  Private
 */
router.post('/revert',
  body('sessionId').isString().notEmpty(),
  asyncHandler(async (req, res) => {
    const { sessionId } = req.body;
    
    const session = sessions.get(sessionId);
    if (!session) {
      throw new AppError('Session not found or expired', 404);
    }
    
    try {
      const revertedHtml = htmlParserService.revertAllChanges(session.currentHtml);
      session.currentHtml = revertedHtml;
      session.lastUpdated = new Date();
      
      res.json({
        success: true,
        data: {
          htmlContent: revertedHtml,
          message: 'All changes reverted successfully'
        }
      });
    } catch (error) {
      console.error('Revert error:', error);
      throw new AppError(`Failed to revert changes: ${error.message}`, 500);
    }
  })
);

/**
 * @route   POST /api/resume-editor-html/export-pdf
 * @desc    Generate final PDF from current HTML
 * @access  Private
 */
router.post('/export-pdf',
  validate(validators.exportPdf),
  asyncHandler(async (req, res) => {
    const { sessionId, format = 'Letter', includeMargins = false } = req.body;
    
    console.log('=== EXPORT PDF REQUEST ===');
    console.log(`Session: ${sessionId}`);
    console.log(`Format: ${format}`);
    console.log(`Include margins: ${includeMargins}`);
    
    const session = sessions.get(sessionId);
    if (!session) {
      throw new AppError('Session not found or expired', 404);
    }
    
    try {
      // Export final HTML (removes suggestion markup)
      const finalHtml = htmlParserService.exportFinalHtml(session.currentHtml);
      
      // Generate PDF with options
      const pdfOptions = {
        filename: `resume-${session.userId}-${Date.now()}.pdf`,
        format: format,
        margin: includeMargins 
          ? { top: '0.5in', bottom: '0.5in', left: '0.5in', right: '0.5in' }
          : { top: 0, bottom: 0, left: 0, right: 0 },
        upload: !!supabase // Upload if Supabase is configured
      };
      
      const pdfInfo = await pdfExportService.generateCustomPdf(finalHtml, pdfOptions);
      
      console.log('PDF generated:', {
        path: pdfInfo.localPath,
        size: pdfInfo.size,
        publicUrl: pdfInfo.publicUrl
      });
      
      // Store file info for download
      const fileId = uuidv4();
      session.exportedFiles = session.exportedFiles || {};
      session.exportedFiles[fileId] = {
        path: pdfInfo.localPath,
        filename: pdfInfo.filename,
        publicUrl: pdfInfo.publicUrl,
        createdAt: new Date()
      };
      
      res.json({
        success: true,
        data: {
          fileId,
          filename: pdfInfo.filename,
          size: pdfInfo.size,
          downloadUrl: pdfInfo.publicUrl || `/api/resume-editor-html/download/${fileId}`,
          publicUrl: pdfInfo.publicUrl
        }
      });
      
    } catch (error) {
      console.error('Export PDF error:', error);
      throw new AppError(`Failed to export PDF: ${error.message}`, 500);
    }
  })
);

/**
 * @route   GET /api/resume-editor-html/download/:fileId
 * @desc    Download exported PDF
 * @access  Private
 */
router.get('/download/:fileId',
  asyncHandler(async (req, res) => {
    const { fileId } = req.params;
    
    // Find file in any session
    let fileInfo = null;
    for (const [sessionId, session] of sessions.entries()) {
      if (session.exportedFiles && session.exportedFiles[fileId]) {
        fileInfo = session.exportedFiles[fileId];
        break;
      }
    }
    
    if (!fileInfo) {
      throw new AppError('File not found or expired', 404);
    }
    
    try {
      const fileBuffer = await fs.readFile(fileInfo.path);
      
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `attachment; filename="${fileInfo.filename}"`);
      res.send(fileBuffer);
      
    } catch (error) {
      console.error('Download error:', error);
      throw new AppError('Failed to download file', 500);
    }
  })
);

/**
 * @route   POST /api/resume-editor-html/parse-for-edit-debug
 * @desc    Debug endpoint that accepts any field name
 * @access  Private
 */
router.post('/parse-for-edit-debug',
  upload.any(), // Accept any field name
  asyncHandler(async (req, res) => {
    console.log('=== DEBUG ENDPOINT ===');
    console.log('Headers:', {
      'content-type': req.headers['content-type'],
      'content-length': req.headers['content-length']
    });
    console.log('Files received:', req.files?.length || 0);
    console.log('Body fields:', Object.keys(req.body));
    
    if (req.files && req.files.length > 0) {
      const file = req.files[0];
      console.log('First file details:', {
        fieldname: file.fieldname,
        originalname: file.originalname,
        mimetype: file.mimetype,
        size: file.size
      });
      
      res.json({
        success: true,
        message: 'Debug info collected',
        fileReceived: true,
        fileDetails: {
          fieldName: file.fieldname,
          expectedFieldName: 'resume',
          fileName: file.originalname,
          mimeType: file.mimetype,
          size: file.size
        },
        bodyFields: Object.keys(req.body),
        hint: file.fieldname !== 'resume' 
          ? `Use field name "resume" instead of "${file.fieldname}"` 
          : 'Field name is correct'
      });
    } else {
      res.json({
        success: false,
        message: 'No files received',
        headers: {
          'content-type': req.headers['content-type'],
          'content-length': req.headers['content-length']
        },
        bodyFields: Object.keys(req.body),
        bodyData: req.body,
        hint: 'Ensure you are sending a file with multipart/form-data'
      });
    }
  })
);

/**
 * @route   POST /api/resume-editor-html/parse-for-edit-flexible
 * @desc    Flexible endpoint that accepts common field names
 * @access  Private
 */
router.post('/parse-for-edit-flexible',
  upload.any(),
  validate(validators.parseForEdit),
  asyncHandler(async (req, res) => {
    console.log('=== FLEXIBLE PARSE ENDPOINT ===');
    
    // Try to find file from common field names
    let pdfFile = null;
    const commonFieldNames = ['resume', 'file', 'pdf', 'document', 'upload', 'resumeFile', 'resume_file'];
    
    if (req.files && req.files.length > 0) {
      // Take the first file regardless of field name
      pdfFile = req.files[0];
      console.log(`File received with field name: ${pdfFile.fieldname}`);
    } else if (req.file) {
      pdfFile = req.file;
    }
    
    if (!pdfFile) {
      return res.status(400).json({
        success: false,
        error: 'No file uploaded',
        details: {
          acceptedFieldNames: commonFieldNames,
          hint: 'Upload a file using one of the accepted field names'
        }
      });
    }
    
    // Process the file using the same logic as parse-for-edit
    const { userId, jobDescription } = req.body;
    
    console.log('Processing file:', {
      fieldName: pdfFile.fieldname,
      filename: pdfFile.originalname,
      mimetype: pdfFile.mimetype,
      size: pdfFile.size
    });
    
    try {
      let htmlPath;
      let conversionResult;
      
      // Check if it's a text file or PDF
      if (pdfFile.mimetype.includes('text') || pdfFile.originalname.toLowerCase().endsWith('.txt')) {
        console.log('Processing text file...');
        const textContent = await fs.readFile(pdfFile.path, 'utf-8');
        const tempHtml = pdfToHtmlService.generateFallbackHtml({}, textContent);
        
        const outputName = path.basename(pdfFile.originalname, path.extname(pdfFile.originalname));
        const outputDir = path.join('temp/html', `${outputName}-text`);
        await fs.ensureDir(outputDir);
        htmlPath = path.join(outputDir, `${outputName}.html`);
        await fs.writeFile(htmlPath, tempHtml);
        
        conversionResult = {
          method: 'text-input',
          htmlPath: htmlPath,
          fallbackUsed: false
        };
      } else {
        console.log('Converting PDF to HTML...');
        conversionResult = await pdfToHtmlService.convertWithFallback(pdfFile.path);
        htmlPath = conversionResult.htmlPath;
      }
      
      // Parse HTML structure
      const parsed = await htmlParserService.parseResumeHtml(htmlPath);
      const { fullHtml, textBlocks, documentStructure } = parsed;
      
      // Generate AI suggestions if job description provided
      let suggestions = [];
      let mappedSuggestions = [];
      
      if (jobDescription) {
        suggestions = await generateAISuggestions(documentStructure, jobDescription);
        mappedSuggestions = textMatcher.mapSuggestionsToHtml(textBlocks, suggestions);
      }
      
      const htmlWithSuggestions = mappedSuggestions.length > 0
        ? htmlParserService.applySuggestionsToHtml(fullHtml, mappedSuggestions)
        : fullHtml;
      
      const sessionId = await storeSession({
        userId: userId || `temp_${uuidv4()}`,
        originalPdfPath: pdfFile.path,
        htmlPath,
        originalHtml: fullHtml,
        currentHtml: htmlWithSuggestions,
        textBlocks,
        suggestions: mappedSuggestions,
        documentStructure
      });
      
      // Clean up uploaded file
      fs.remove(pdfFile.path).catch(console.error);
      
      res.json({
        success: true,
        data: {
          sessionId,
          htmlContent: htmlWithSuggestions,
          suggestions: mappedSuggestions,
          documentStructure,
          conversionMethod: conversionResult.method,
          uploadInfo: {
            fieldNameUsed: pdfFile.fieldname,
            recommendedFieldName: 'resume',
            message: 'File processed successfully. For consistency, please use field name "resume" in future requests.'
          },
          stats: {
            totalBlocks: textBlocks.length,
            totalSuggestions: mappedSuggestions.length,
            sections: documentStructure.sections.map(s => ({
              type: s.type,
              itemCount: s.items.length
            }))
          }
        }
      });
      
    } catch (error) {
      if (pdfFile) {
        fs.remove(pdfFile.path).catch(console.error);
      }
      console.error('Parse error:', error);
      throw new AppError(`Failed to parse resume: ${error.message}`, 500);
    }
  })
);

/**
 * @route   GET /api/resume-editor-html/preview/:sessionId
 * @desc    Get current HTML preview
 * @access  Private
 */
router.get('/preview/:sessionId',
  asyncHandler(async (req, res) => {
    const { sessionId } = req.params;
    
    const session = sessions.get(sessionId);
    if (!session) {
      throw new AppError('Session not found or expired', 404);
    }
    
    res.json({
      success: true,
      data: {
        htmlContent: session.currentHtml,
        stats: htmlParserService.getSuggestionStats(session.currentHtml),
        documentStructure: session.documentStructure
      }
    });
  })
);

/**
 * @route   POST /api/resume-editor-html/cleanup
 * @desc    Clean up old files
 * @access  Private (admin only in production)
 */
router.post('/cleanup',
  asyncHandler(async (req, res) => {
    try {
      // Clean up old HTML files
      await pdfToHtmlService.cleanup();
      
      // Clean up old PDFs
      await pdfExportService.cleanup();
      
      // Clean up old sessions
      const now = Date.now();
      let cleaned = 0;
      for (const [id, session] of sessions.entries()) {
        if (now - session.createdAt.getTime() > 24 * 60 * 60 * 1000) {
          sessions.delete(id);
          cleaned++;
        }
      }
      
      res.json({
        success: true,
        data: {
          message: 'Cleanup completed',
          sessionsRemoved: cleaned
        }
      });
      
    } catch (error) {
      console.error('Cleanup error:', error);
      throw new AppError('Cleanup failed', 500);
    }
  })
);

module.exports = router;