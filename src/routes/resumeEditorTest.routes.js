/**
 * Resume Editor Test Routes
 * Development tools for testing and debugging
 */

const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const fs = require('fs-extra');
const { validate } = require('../middleware/validators');
const asyncHandler = require('../middleware/asyncHandler');
const { AppError } = require('../middleware/errorHandler');

// Import services
const pdfToHtmlService = require('../services/pdfToHtmlService');
const htmlParserService = require('../services/htmlParserService');
const pdfExportService = require('../services/pdfExportService');
const textMatcher = require('../utils/textMatcher');

// Configure multer for test uploads
const storage = multer.diskStorage({
  destination: async (req, file, cb) => {
    const uploadDir = 'temp/test-uploads';
    await fs.ensureDir(uploadDir);
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, `test-${uniqueSuffix}.pdf`);
  }
});

const upload = multer({
  storage: storage,
  limits: {
    fileSize: parseInt(process.env.MAX_FILE_SIZE || '10485760') // 10MB default
  },
  fileFilter: (req, file, cb) => {
    if (file.mimetype === 'application/pdf') {
      cb(null, true);
    } else {
      cb(new Error('Only PDF files are allowed'));
    }
  }
});

/**
 * @route   POST /api/resume-editor-test/test-conversion
 * @desc    Test PDF to HTML conversion pipeline
 * @access  Private (dev only)
 */
router.post('/test-conversion',
  upload.single('pdf'),
  asyncHandler(async (req, res) => {
    const pdfFile = req.file;
    const { includeHtml = true, includeStructure = true, includeSuggestions = false } = req.body;
    
    if (!pdfFile) {
      throw new AppError('PDF file is required', 400);
    }
    
    console.log('=== TEST CONVERSION START ===');
    console.log('PDF file:', pdfFile.filename);
    console.log('File size:', (pdfFile.size / 1024).toFixed(2), 'KB');
    console.log('Options:', { includeHtml, includeStructure, includeSuggestions });
    
    const result = {
      file: {
        name: pdfFile.filename,
        size: pdfFile.size,
        path: pdfFile.path
      },
      conversion: {},
      parsing: {},
      suggestions: {},
      timing: {},
      logs: []
    };
    
    const startTime = Date.now();
    
    try {
      // Step 1: Validate PDF
      console.log('\n--- Step 1: Validating PDF ---');
      const validationStart = Date.now();
      const isValid = await pdfToHtmlService.validatePdf(pdfFile.path);
      result.conversion.pdfValid = isValid;
      result.timing.validation = Date.now() - validationStart;
      result.logs.push(`PDF validation: ${isValid ? 'PASSED' : 'FAILED'} (${result.timing.validation}ms)`);
      
      if (!isValid) {
        throw new AppError('Invalid PDF file', 400);
      }
      
      // Step 2: Convert to HTML
      console.log('\n--- Step 2: Converting to HTML ---');
      const conversionStart = Date.now();
      let htmlPath;
      
      try {
        htmlPath = await pdfToHtmlService.convert(pdfFile.path);
        result.conversion.success = true;
        result.conversion.htmlPath = htmlPath;
        result.conversion.method = 'pdf2htmlEX';
      } catch (conversionError) {
        console.error('pdf2htmlEX failed:', conversionError.message);
        result.conversion.success = false;
        result.conversion.error = conversionError.message;
        result.conversion.method = 'failed';
        result.logs.push(`pdf2htmlEX error: ${conversionError.message}`);
        
        // Fallback could be implemented here
        throw new AppError('PDF conversion failed', 500);
      }
      
      result.timing.conversion = Date.now() - conversionStart;
      result.logs.push(`PDF to HTML conversion: SUCCESS (${result.timing.conversion}ms)`);
      
      // Step 3: Read HTML file info
      const htmlStats = await fs.stat(htmlPath);
      result.conversion.htmlSize = htmlStats.size;
      result.logs.push(`HTML file size: ${(htmlStats.size / 1024).toFixed(2)} KB`);
      
      // Step 4: Parse HTML
      console.log('\n--- Step 3: Parsing HTML ---');
      const parsingStart = Date.now();
      const parsed = await htmlParserService.parseResumeHtml(htmlPath);
      
      result.parsing.success = true;
      result.parsing.totalBlocks = parsed.textBlocks.length;
      result.parsing.totalPages = parsed.metadata.totalPages;
      result.parsing.sections = parsed.documentStructure.sections.map(s => ({
        type: s.type,
        title: s.title,
        itemCount: s.items.length
      }));
      
      result.timing.parsing = Date.now() - parsingStart;
      result.logs.push(`HTML parsing: SUCCESS (${result.timing.parsing}ms)`);
      result.logs.push(`Found ${parsed.textBlocks.length} text blocks across ${parsed.metadata.totalPages} pages`);
      
      // Include full structure if requested
      if (includeStructure) {
        result.documentStructure = parsed.documentStructure;
        result.textBlocks = parsed.textBlocks.slice(0, 10); // First 10 blocks as sample
      }
      
      // Include HTML if requested
      if (includeHtml) {
        const htmlContent = await fs.readFile(htmlPath, 'utf-8');
        result.htmlPreview = htmlContent.substring(0, 5000) + '...'; // First 5KB
      }
      
      // Step 5: Test text matching (optional)
      if (includeSuggestions && parsed.textBlocks.length > 0) {
        console.log('\n--- Step 4: Testing Text Matching ---');
        const matchingStart = Date.now();
        
        // Test matching on first bullet point found
        const bulletBlock = parsed.textBlocks.find(b => b.text.startsWith('•') || b.text.startsWith('-'));
        if (bulletBlock) {
          const testSuggestion = {
            originalText: bulletBlock.text,
            suggestedText: bulletBlock.text + ' (enhanced with metrics)',
            type: 'bullet'
          };
          
          const mapped = textMatcher.mapSuggestionsToHtml([bulletBlock], [testSuggestion]);
          result.suggestions.testMatch = {
            original: bulletBlock.text,
            matchScore: mapped[0]?.matchScore,
            confidence: mapped[0]?.confidence
          };
        }
        
        result.timing.matching = Date.now() - matchingStart;
        result.logs.push(`Text matching test: COMPLETED (${result.timing.matching}ms)`);
      }
      
      // Total timing
      result.timing.total = Date.now() - startTime;
      result.logs.push(`\nTotal processing time: ${result.timing.total}ms`);
      
      // Cleanup
      console.log('\n--- Cleanup ---');
      await fs.remove(pdfFile.path);
      await pdfToHtmlService.cleanupSpecific(htmlPath);
      result.logs.push('Cleanup: COMPLETED');
      
      res.json({
        success: true,
        data: result
      });
      
    } catch (error) {
      // Cleanup on error
      if (pdfFile) {
        await fs.remove(pdfFile.path).catch(console.error);
      }
      
      result.error = {
        message: error.message,
        stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
      };
      result.timing.total = Date.now() - startTime;
      
      console.error('Test conversion error:', error);
      
      res.status(error.statusCode || 500).json({
        success: false,
        data: result,
        error: error.message
      });
    }
  })
);

/**
 * @route   GET /api/resume-editor-test/logs
 * @desc    Get recent conversion logs
 * @access  Private (dev only)
 */
router.get('/logs',
  asyncHandler(async (req, res) => {
    const { lines = 100 } = req.query;
    
    // In production, this would read from a log file
    // For now, return a message
    res.json({
      success: true,
      data: {
        message: 'Log retrieval not implemented. Check console output.',
        hint: 'Logs are currently output to console. Implement file logging for production.'
      }
    });
  })
);

/**
 * @route   POST /api/resume-editor-test/validate-html
 * @desc    Validate HTML structure
 * @access  Private (dev only)
 */
router.post('/validate-html',
  asyncHandler(async (req, res) => {
    const { html } = req.body;
    
    if (!html) {
      throw new AppError('HTML content is required', 400);
    }
    
    const validation = pdfExportService.validateHtml(html);
    
    res.json({
      success: true,
      data: validation
    });
  })
);

/**
 * @route   GET /api/resume-editor-test/system-info
 * @desc    Get system information for debugging
 * @access  Private (dev only)
 */
router.get('/system-info',
  asyncHandler(async (req, res) => {
    const { exec } = require('child_process');
    const util = require('util');
    const execPromise = util.promisify(exec);
    
    const info = {
      node: process.version,
      platform: process.platform,
      arch: process.arch,
      memory: {
        total: (process.memoryUsage().heapTotal / 1024 / 1024).toFixed(2) + ' MB',
        used: (process.memoryUsage().heapUsed / 1024 / 1024).toFixed(2) + ' MB'
      },
      env: {
        PDF2HTMLEX_PATH: process.env.PDF2HTMLEX_PATH || 'not set',
        TEMP_DIR: process.env.TEMP_DIR || './temp',
        MAX_FILE_SIZE: process.env.MAX_FILE_SIZE || '10485760',
        NODE_ENV: process.env.NODE_ENV
      },
      pdf2htmlex: {}
    };
    
    // Check if pdf2htmlEX is installed
    try {
      const { stdout } = await execPromise('pdf2htmlEX --version');
      info.pdf2htmlex.installed = true;
      info.pdf2htmlex.version = stdout.trim();
    } catch (error) {
      info.pdf2htmlex.installed = false;
      info.pdf2htmlex.error = 'pdf2htmlEX not found';
    }
    
    // Check Puppeteer
    try {
      const puppeteer = require('puppeteer');
      info.puppeteer = {
        installed: true,
        executablePath: process.env.PUPPETEER_EXECUTABLE_PATH || 'bundled'
      };
    } catch (error) {
      info.puppeteer = {
        installed: false,
        error: error.message
      };
    }
    
    res.json({
      success: true,
      data: info
    });
  })
);

module.exports = router;