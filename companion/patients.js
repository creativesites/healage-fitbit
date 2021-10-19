import { SERVER_URL } from '../common/config';

export const LENGTH = 8;
export const POSSIBLE_CHARACTERS = '123456789ABCDEFGHIJKLMNPQRSTUVWXYZ';

/**
 * Enum for routes
 * @readonly
 * @enum {string}
 */
export const routes = {
  GAIT_SPEED: 'gait-speed',
  USER_ACTIVITY: 'user-activity',
  REMINDERS: 'reminders',
};

/**
 * @returns {Promise<string>} true or false
 */
export const generatePatientId = async () => {
  let patientId;
  let isValid = false;

  while (!isValid) {
    patientId = '';
    for (let i = 0; i < LENGTH; i++) {
      patientId += POSSIBLE_CHARACTERS.charAt(Math.floor(Math.random() * POSSIBLE_CHARACTERS.length));
    }
    const res = await fetch(`${SERVER_URL}/patients/check/${patientId}`);
    if (!res.ok) {
      throw new Error(`An error has occurred: ${res.status}`);
    }
    const { message } = await res.json();
    isValid = message === 'true';
  }

  return patientId;
};

/**
 * @param {Object} data
 * @param {string} route
 */
export const post = (data, route) => {
  fetch(`${SERVER_URL}/${route}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
};
