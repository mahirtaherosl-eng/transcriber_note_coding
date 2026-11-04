import type { Job } from "@/lib/transcript/schema";
import { listJobs, readJob, writeJob } from "@/lib/storage";

export async function createJob(job: Job): Promise<Job> {
  const stamped: Job = {
    ...job,
    createdAt: job.createdAt || new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
  await writeJob(stamped);
  return stamped;
}

export async function patchJob(id: string, patch: Partial<Job>): Promise<Job | null> {
  const job = await readJob(id);
  if (!job) return null;
  const next: Job = {
    ...job,
    ...patch,
    id: job.id,
    updatedAt: new Date().toISOString(),
  };
  await writeJob(next);
  return next;
}

export { readJob, listJobs };
