import type { User, WorkerDocument, WorkerProfile, WorkHistory } from '../../generated/prisma/client.js';
import { toNationalPhone } from '../../lib/phone.js';
import { fileUrl, optionalFileUrl } from '../files/storage.js';
import { profileCompleteness } from './profile-completeness.js';

export type WorkerProfileRecord = WorkerProfile & {
  user: User;
  workHistory: WorkHistory[];
  documents: Pick<WorkerDocument, 'type'>[];
};

const dateOnly = (date: Date | null) => (date ? date.toISOString().slice(0, 10) : undefined);
const orUndefined = <T>(value: T | null) => value ?? undefined;

/** The worker profile as the apps see it (matches `WorkerProfile` in the dashboard types). */
export function toWorkerProfileDto(profile: WorkerProfileRecord) {
  return {
    userId: profile.userId,
    name: profile.user.name,
    phone: toNationalPhone(profile.user.phone) ?? '',
    email: orUndefined(profile.user.email),
    trade: orUndefined(profile.trade),
    experience: orUndefined(profile.experience),
    qualifications: profile.qualifications,
    licences: profile.licences,
    skills: profile.skills,
    languages: profile.languages,
    location:
      profile.city || profile.state ? { city: profile.city ?? '', state: profile.state ?? '' } : undefined,
    address: orUndefined(profile.address),
    pincode: orUndefined(profile.pincode),
    willingToRelocate: profile.willingToRelocate,
    expectedPay: orUndefined(profile.expectedPay),
    shiftPreference: orUndefined(profile.shiftPreference),
    availability: profile.availability,
    employmentType: orUndefined(profile.employmentType),
    about: orUndefined(profile.about),
    dob: dateOnly(profile.dob),
    gender: orUndefined(profile.gender),
    safetyTrainingHours: orUndefined(profile.safetyTrainingHours),
    photoUrl: optionalFileUrl(profile.photoKey, 24 * 60),
    workHistory: profile.workHistory.map((item) => ({
      company: item.company,
      role: item.role,
      from: String(item.fromYear),
      to: item.toYear ? String(item.toYear) : undefined,
    })),
    completeness: profileCompleteness(
      profile,
      profile.documents.map((doc) => doc.type),
    ),
  };
}

/** A worker's document as the apps see it (matches `WorkerDocument`). */
export function toWorkerDocumentDto(doc: WorkerDocument) {
  return {
    id: doc.id,
    ownerId: doc.workerId,
    name: doc.name,
    type: doc.type,
    sizeBytes: doc.sizeBytes,
    mimeType: doc.mimeType,
    uploadedAt: doc.createdAt.toISOString(),
    url: fileUrl(doc.storageKey),
    isDefaultResume: doc.isDefaultResume,
  };
}
