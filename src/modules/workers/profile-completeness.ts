import type { WorkerProfile } from '../../generated/prisma/client.js';

export interface MissingItem {
  key: string;
  label: string;
  /** Screen in the app where the worker can add it. */
  link: string;
}

export interface ProfileCompleteness {
  /** 0–100 */
  score: number;
  /** What is still missing, most important first (drives the "complete your profile" banner). */
  missing: MissingItem[];
}

/** Same checks and order as the apps. */
export function profileCompleteness(profile: WorkerProfile, documentTypes: string[]): ProfileCompleteness {
  const checks: (MissingItem & { done: boolean })[] = [
    {
      key: 'resume',
      label: 'Upload your resume',
      link: '/worker/profile?tab=documents',
      done: documentTypes.includes('resume'),
    },
    {
      key: 'trade',
      label: 'Add your trade and experience',
      link: '/worker/profile?edit=work',
      done: !!profile.trade && !!profile.experience,
    },
    { key: 'city', label: 'Add your city', link: '/worker/profile?edit=personal', done: !!profile.city },
    {
      key: 'skills',
      label: 'Add 2–3 skills',
      link: '/worker/profile?edit=work',
      done: profile.skills.length > 0,
    },
    {
      key: 'education',
      label: 'Add your education (ITI, 10th…)',
      link: '/worker/profile?edit=work',
      done: profile.qualifications.length > 0,
    },
    {
      key: 'pay',
      label: 'Add your expected pay',
      link: '/worker/profile?edit=preferences',
      done: !!profile.expectedPay,
    },
    {
      key: 'certificate',
      label: 'Upload a certificate or licence',
      link: '/worker/profile?tab=documents',
      done: documentTypes.some((type) => type !== 'resume' && type !== 'id_proof'),
    },
  ];

  const missing = checks.filter((check) => !check.done).map(({ key, label, link }) => ({ key, label, link }));
  return { score: Math.round(((checks.length - missing.length) / checks.length) * 100), missing };
}
