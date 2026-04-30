const supabase = require('./supabaseClient');

const BUCKET = 'safeprint-files';

async function fetchJob(code) {
  const { data: job, error } = await supabase
    .from('print_jobs')
    .select('code, comment, expires_at, print_job_files(*)')
    .eq('code', code)
    .maybeSingle();

  if (error) throw error;
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

  return { deletedFiles: paths.length };
}

async function cleanupExpiredJobs() {
  const { data: expiredJobs, error } = await supabase
    .from('print_jobs')
    .select('code, print_job_files(storage_path)')
    .lte('expires_at', new Date().toISOString());

  if (error) throw error;

  let deletedJobs = 0;
  let deletedFiles = 0;

  for (const job of expiredJobs || []) {
    const files = (job.print_job_files || []).map((file) => ({ storage_path: file.storage_path }));
    const result = await deleteJob(job.code, files);
    deletedJobs += 1;
    deletedFiles += result.deletedFiles;
  }

  return { deletedJobs, deletedFiles };
}

module.exports = {
  BUCKET,
  cleanupExpiredJobs,
  deleteJob,
  fetchJob,
};
