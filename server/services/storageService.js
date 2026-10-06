const path = require('path');
const fs = require('fs');
const { createClient } = require('@supabase/supabase-js');

// Ensure local upload dir exists for development
const localUploadDir = path.join(__dirname, '..', 'uploads');
if (!fs.existsSync(localUploadDir)) {
  fs.mkdirSync(localUploadDir, { recursive: true });
}

// Check Supabase Storage configuration
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY;
const storageBucket = process.env.SUPABASE_STORAGE_BUCKET || 'nandini-assets';

let supabaseClient = null;
if (supabaseUrl && supabaseKey) {
  try {
    supabaseClient = createClient(supabaseUrl, supabaseKey, {
      auth: { persistSession: false }
    });
  } catch (err) {
    console.warn('Supabase client initialization warning:', err.message);
  }
}

/**
 * Upload a file buffer either to Supabase Storage (Production) or Local Disk (Development)
 * @param {Object} file - Multer file object with buffer, originalname, mimetype
 * @param {String} prefix - Prefix category (e.g. 'logo', 'signature', 'upi-qr', 'product')
 * @returns {Promise<{ fileUrl: string, filename: string, isCloud: boolean }>}
 */
async function uploadFile(file, prefix = 'doc') {
  if (!file) throw new Error('No file provided for upload');

  const ext = path.extname(file.originalname).toLowerCase() || '.png';
  const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9);
  const filename = `${prefix}-${uniqueSuffix}${ext}`;

  // If Supabase is configured and we are in production or Supabase credentials exist
  if (supabaseClient && (process.env.NODE_ENV === 'production' || process.env.USE_SUPABASE_STORAGE === 'true')) {
    try {
      const fileBuffer = file.buffer || (file.path ? fs.readFileSync(file.path) : null);
      if (!fileBuffer) throw new Error('Unable to read file buffer for cloud storage upload');

      const filePath = `${prefix}/${filename}`;
      const { data, error } = await supabaseClient.storage
        .from(storageBucket)
        .upload(filePath, fileBuffer, {
          contentType: file.mimetype || 'image/png',
          upsert: true
        });

      if (error) {
        console.error('Supabase storage upload error:', error);
        throw new Error(`Cloud storage upload failed: ${error.message}`);
      }

      // Generate public URL
      const { data: publicUrlData } = supabaseClient.storage
        .from(storageBucket)
        .getPublicUrl(filePath);

      const publicUrl = publicUrlData?.publicUrl || `${supabaseUrl}/storage/v1/object/public/${storageBucket}/${filePath}`;

      return {
        fileUrl: publicUrl,
        filename: filename,
        isCloud: true
      };
    } catch (cloudErr) {
      console.warn('Falling back to local storage due to cloud upload notice:', cloudErr.message);
    }
  }

  // Fallback / Development: Save to local disk
  const targetPath = path.join(localUploadDir, filename);
  if (file.buffer) {
    fs.writeFileSync(targetPath, file.buffer);
  } else if (file.path && file.path !== targetPath) {
    fs.copyFileSync(file.path, targetPath);
  }

  return {
    fileUrl: `/uploads/${filename}`,
    filename: filename,
    isCloud: false
  };
}

module.exports = {
  uploadFile,
  localUploadDir
};
