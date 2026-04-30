const express = require('express');
const multer = require('multer');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const os = require('os');
const mime = require('mime-types');
const muhammara = require('muhammara');
const supabase = require('../lib/supabaseClient');
const shopRoutes = require('./shopRoutes');

const router = express.Router();
const storage = multer.memoryStorage();
const upload = multer({ storage });
const BUCKET = 'safeprint-files';
const JOB_TTL_MS = 10 * 60 * 1000;

function getUploadedFiles(req) {
  return Array.isArray(req.files) ? req.files : [];
}

function setPreviewHeaders(res, fileData) {
  const mimeType = fileData.mime_type || mime.lookup(fileData.original_name) || 'application/octet-stream';
  res.set({
    'Content-Type': mimeType,
    'Content-Disposition': `inline; filename="${fileData.original_name}"`,
    'Cache-Control': 'no-store, no-cache, must-revalidate, private',
  });
  return mimeType;
}

async function fetchJob(code) {
  const { data: job, error: jobError } = await supabase
    .from('print_jobs')
    .select('code, comment, expires_at, print_job_files(*)')
    .eq('code', code)
    .maybeSingle();

  if (jobError) throw jobError;
  if (!job) return null;

  const files = (job.print_job_files || []).sort((a, b) => a.file_index - b.file_index);
  return { ...job, files };
}

async function deleteJob(code, files = null) {
  const jobFiles = files || (await fetchJob(code))?.files || [];
  const paths = jobFiles.map((file) => file.storage_path).filter(Boolean);

  if (paths.length > 0) {
    const { error: removeError } = await supabase.storage.from(BUCKET).remove(paths);
    if (removeError) console.error('Supabase storage cleanup failed:', removeError);
  }

  const { error: deleteError } = await supabase.from('print_jobs').delete().eq('code', code);
  if (deleteError) console.error('Supabase job cleanup failed:', deleteError);
}

async function requireActiveJob(code) {
  const job = await fetchJob(code);
  if (!job) return null;

  if (new Date(job.expires_at).getTime() <= Date.now()) {
    await deleteJob(code, job.files);
    return null;
  }

  return job;
}

async function downloadStoredFile(fileData) {
  const { data, error } = await supabase.storage.from(BUCKET).download(fileData.storage_path);
  if (error) throw error;
  return Buffer.from(await data.arrayBuffer());
}

function aesDecrypt(buffer, fileData) {
  if (!fileData.encrypted) return buffer;
  const decipher = crypto.createDecipheriv(
    'aes-256-cbc',
    Buffer.from(fileData.aes_key, 'hex'),
    Buffer.from(fileData.aes_iv, 'hex')
  );
  return Buffer.concat([decipher.update(buffer), decipher.final()]);
}

function unlockPdfBuffer(buffer, password, code, index, prefix) {
  const tmpFile = path.join(os.tmpdir(), `${prefix}_${code}_${index}_${crypto.randomBytes(4).toString('hex')}.pdf`);
  const unlockedFile = path.join(os.tmpdir(), `${prefix}_open_${code}_${index}_${crypto.randomBytes(4).toString('hex')}.pdf`);

  fs.writeFileSync(tmpFile, buffer);
  try {
    muhammara.recrypt(tmpFile, unlockedFile, { password });
    return fs.readFileSync(unlockedFile);
  } finally {
    if (fs.existsSync(tmpFile)) fs.unlinkSync(tmpFile);
    if (fs.existsSync(unlockedFile)) fs.unlinkSync(unlockedFile);
  }
}

async function getDecryptedFileBuffer(code, fileData) {
  const storedBuffer = await downloadStoredFile(fileData);
  const decrypted = aesDecrypt(storedBuffer, fileData);
  const mimeType = fileData.mime_type || mime.lookup(fileData.original_name);

  if (fileData.pdf_password && mimeType === 'application/pdf') {
    return unlockPdfBuffer(decrypted, fileData.pdf_password, code, fileData.file_index, 'safeprint_prev');
  }

  return decrypted;
}

async function createJobCode() {
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const code = crypto.randomBytes(4).toString('hex');
    const expiresAt = new Date(Date.now() + JOB_TTL_MS).toISOString();
    const { error } = await supabase.from('print_jobs').insert({ code, expires_at: expiresAt });
    if (!error) return { code, expiresAt };
    if (error.code !== '23505') throw error;
  }
  throw new Error('Could not generate a unique print code');
}

router.post('/upload', upload.any(), async (req, res) => {
  const files = getUploadedFiles(req);
  if (files.length === 0) {
    return res.status(400).json({ error: 'No files uploaded' });
  }

  let code = null;
  const uploadedPaths = [];

  try {
    let metadata = {};
    try {
      metadata = JSON.parse(req.body.metadata || '{}');
    } catch (e) {
      return res.status(400).json({ error: 'Invalid metadata format' });
    }

    const encryptionPrefs = metadata.encryptionPrefs || [];
    const comment = metadata.comment || '';
    const job = await createJobCode();
    code = job.code;

    const { error: updateError } = await supabase
      .from('print_jobs')
      .update({ comment })
      .eq('code', code);

    if (updateError) throw updateError;

    const fileRows = [];
    for (let i = 0; i < files.length; i += 1) {
      const file = files[i];
      const prefs = encryptionPrefs[i] || {};
      const shouldEncrypt = prefs.encrypt !== false;
      const pdfPassword = prefs.isPasswordProtected ? (prefs.password || null) : null;
      const ext = path.extname(file.originalname);
      const storagePath = `jobs/${code}/${i}-${crypto.randomBytes(8).toString('hex')}${ext}`;
      const mimeType = file.mimetype || mime.lookup(file.originalname) || 'application/octet-stream';

      let uploadBuffer = file.buffer;
      let aesKey = null;
      let aesIv = null;

      if (shouldEncrypt) {
        const key = crypto.randomBytes(32);
        const iv = crypto.randomBytes(16);
        const cipher = crypto.createCipheriv('aes-256-cbc', key, iv);
        uploadBuffer = Buffer.concat([cipher.update(file.buffer), cipher.final()]);
        aesKey = key.toString('hex');
        aesIv = iv.toString('hex');
      }

      const { error: uploadError } = await supabase.storage
        .from(BUCKET)
        .upload(storagePath, uploadBuffer, {
          contentType: mimeType,
          upsert: false,
        });

      if (uploadError) throw uploadError;
      uploadedPaths.push(storagePath);

      fileRows.push({
        code,
        file_index: i,
        original_name: file.originalname,
        storage_path: storagePath,
        mime_type: mimeType,
        encrypted: shouldEncrypt,
        aes_key: aesKey,
        aes_iv: aesIv,
        pdf_password: pdfPassword,
      });
    }

    const { error: filesError } = await supabase.from('print_job_files').insert(fileRows);
    if (filesError) throw filesError;

    res.json({ code });
  } catch (err) {
    console.error('Upload failed:', err);
    if (uploadedPaths.length > 0) {
      await supabase.storage.from(BUCKET).remove(uploadedPaths);
    }
    if (code) await deleteJob(code);
    res.status(500).json({ error: 'Upload failed. Please try again.' });
  }
});

router.get('/info/:code', async (req, res) => {
  try {
    const code = req.params.code.toLowerCase();
    const job = await requireActiveJob(code);

    if (!job) {
      return res.status(404).json({ error: 'Invalid code. Files may have expired or been printed already.' });
    }

    res.json({
      comment: job.comment || '',
      files: job.files.map((file) => ({
        index: file.file_index,
        name: file.original_name,
        encrypted: file.encrypted,
      })),
    });
  } catch (err) {
    console.error('Info lookup failed:', err);
    res.status(500).json({ error: 'Could not load file info' });
  }
});

router.get('/download/:code/:index', async (req, res) => {
  try {
    const code = req.params.code.toLowerCase();
    const index = parseInt(req.params.index, 10);
    const job = await requireActiveJob(code);

    if (!job) {
      return res.status(404).json({ error: 'Invalid code. Files may have expired or been printed already.' });
    }

    const fileData = job.files.find((file) => file.file_index === index);
    if (!fileData) {
      return res.status(400).json({ error: 'Invalid file index.' });
    }

    setPreviewHeaders(res, fileData);
    const fileBuffer = await getDecryptedFileBuffer(code, fileData);
    res.send(fileBuffer);
  } catch (err) {
    console.error('Download failed:', err);
    if (!res.headersSent) res.status(500).send('Error reading file.');
  }
});

router.get('/download/:code', async (req, res) => {
  const code = req.params.code.toLowerCase();
  res.redirect(`/api/files/download/${code}/0`);
});

router.post('/print/:code', async (req, res) => {
  try {
    const code = req.params.code.toLowerCase();
    const { shopId } = req.body || {};
    const job = await requireActiveJob(code);

    if (!job) return res.status(404).json({ error: 'Invalid code' });

    let checkoutData = null;
    if (shopId) {
      const shop = await shopRoutes.getShop(shopId);
      if (shop) {
        const baseRate = 2.0;
        let surgeMultiplier = 1.0;
        let surgeInfo = '';

        switch (shop.status) {
          case 'free':
            surgeMultiplier = 0.9;
            surgeInfo = '-10% Discount Applied';
            break;
          case 'moderate':
            surgeMultiplier = 1.0;
            surgeInfo = 'Base Demand Pricing';
            break;
          case 'busy':
            surgeMultiplier = 1.25;
            surgeInfo = '+25% Surge Pricing Active';
            break;
          default:
            surgeMultiplier = 1.0;
            surgeInfo = 'Base Rate Active';
            break;
        }

        const assumedPages = job.files.length * 4;
        const totalAmount = (assumedPages * baseRate * surgeMultiplier).toFixed(2);
        const upiId = shop.upiId || 'partner@upi';
        const upiLink = `upi://pay?pa=${upiId}&pn=${encodeURIComponent(shop.name)}&am=${totalAmount}&cu=INR`;

        checkoutData = {
          amount: totalAmount,
          upiLink,
          pages: assumedPages,
          surgeInfo,
        };
      }
    }

    const tmpFiles = [];
    for (const fileData of job.files) {
      const fileBuffer = await getDecryptedFileBuffer(code, fileData);
      const ext = path.extname(fileData.original_name) || '.pdf';
      const tmpFile = path.join(os.tmpdir(), `safeprint_${code}_${fileData.file_index}_${crypto.randomBytes(4).toString('hex')}${ext}`);
      fs.writeFileSync(tmpFile, fileBuffer);
      tmpFiles.push(tmpFile);
    }

    console.log('Mock triggering print API. Simulating hardware delay...');
    await new Promise((resolve) => setTimeout(resolve, 1500));

    for (const tmpFile of tmpFiles) {
      if (fs.existsSync(tmpFile)) fs.unlinkSync(tmpFile);
    }

    await deleteJob(code, job.files);
    console.log(`Mock demo completed for code: ${code}. Files and batch metadata deleted.`);

    return res.json({
      success: true,
      message: `${tmpFiles.length} document(s) simulated send to printer successfully.`,
      checkoutData,
    });
  } catch (err) {
    console.error('Fatal Catch 500 Trap:', err.message);
    return res.status(500).json({ error: `Server crash: ${err.message}` });
  }
});

module.exports = router;
