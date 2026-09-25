import { Role } from './types';

export const canControlPlayback = (role: Role): boolean => {
  return role === 'Host' || role === 'Moderator';
};

export const canAssignRole = (role: Role): boolean => {
  return role === 'Host';
};

export const canRemoveParticipant = (role: Role): boolean => {
  return role === 'Host';
};

export const canTransferHost = (role: Role): boolean => {
  return role === 'Host';
};

/** Participants (watch-only) ask Host/Moderators to approve changes. */
export const canRequestAction = (role: Role): boolean => {
  return role === 'Participant';
};

/** Anyone who can control playback can approve/reject Participant requests. */
export const canResolveRequest = (role: Role): boolean => {
  return canControlPlayback(role);
};
