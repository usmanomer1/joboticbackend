import fetch from 'node-fetch';
import FormData from 'form-data';
import { createClient } from '@supabase/supabase-js';

export class BrowserbaseUploadService {
  private apiKey: string;
  private baseUrl = 'https://api.browserbase.com/v1';
  private supabase: any;

  constructor(apiKey: string, supabaseUrl?: string, supabaseKey?: string) {
    this.apiKey = apiKey;
    if (supabaseUrl && supabaseKey) {
      this.supabase = createClient(supabaseUrl, supabaseKey);
    }
  }

  /**
   * Upload a file to a Browserbase session
   */
  async uploadFileToSession(sessionId: string, fileBuffer: Buffer, fileName: string): Promise<string> {
    try {
      const formData = new FormData();
      formData.append('file', fileBuffer, {
        filename: fileName,
        contentType: 'application/pdf' // Adjust based on file type
      });

      const response = await fetch(`${this.baseUrl}/sessions/${sessionId}/uploads`, {
        method: 'POST',
        headers: {
          'X-BB-API-Key': this.apiKey,
          ...formData.getHeaders()
        },
        body: formData
      });

      if (!response.ok) {
        const error = await response.text();
        throw new Error(`Failed to upload file: ${error}`);
      }

      const result = await response.json();
      console.log('File uploaded successfully:', result);
      
      // Return the uploaded file path (typically the filename)
      return fileName;
    } catch (error) {
      console.error('Upload file error:', error);
      throw error;
    }
  }

  /**
   * Download resume from Supabase and upload to Browserbase session
   */
  async uploadResumeFromSupabase(sessionId: string, resumeUrl: string): Promise<string> {
    try {
      if (!this.supabase) {
        throw new Error('Supabase client not initialized');
      }

      // Extract bucket and path from Supabase URL
      const urlParts = new URL(resumeUrl);
      const pathParts = urlParts.pathname.split('/');
      const bucketIndex = pathParts.findIndex(part => part === 'object') + 2;
      const bucket = pathParts[bucketIndex];
      const filePath = pathParts.slice(bucketIndex + 1).join('/');
      
      console.log('Downloading resume from Supabase:', { bucket, filePath });

      // Download file from Supabase
      const { data, error } = await this.supabase.storage
        .from(bucket)
        .download(filePath);

      if (error) {
        throw new Error(`Failed to download resume from Supabase: ${error.message}`);
      }

      // Convert blob to buffer
      const arrayBuffer = await data.arrayBuffer();
      const buffer = Buffer.from(arrayBuffer);
      
      // Extract filename from path
      const fileName = filePath.split('/').pop() || 'resume.pdf';

      // Upload to Browserbase session
      return await this.uploadFileToSession(sessionId, buffer, fileName);
    } catch (error) {
      console.error('Upload resume from Supabase error:', error);
      throw error;
    }
  }

  /**
   * Upload resume from URL (generic)
   */
  async uploadResumeFromUrl(sessionId: string, resumeUrl: string): Promise<string> {
    try {
      console.log('Downloading resume from URL:', resumeUrl);

      // Download file from URL
      const response = await fetch(resumeUrl);
      if (!response.ok) {
        throw new Error(`Failed to download resume: ${response.statusText}`);
      }

      const buffer = await response.buffer();
      
      // Extract filename from URL or use default
      const urlParts = new URL(resumeUrl);
      const fileName = urlParts.pathname.split('/').pop() || 'resume.pdf';

      // Upload to Browserbase session
      return await this.uploadFileToSession(sessionId, buffer, fileName);
    } catch (error) {
      console.error('Upload resume from URL error:', error);
      throw error;
    }
  }
}