import { readCbor } from "./file-system";
import { PATIENT_ID_FILENAME } from '../common/config';

export const LENGTH = 8;
export const POSSIBLE_CHARACTERS = '123456789ABCDEFGHIJKLMNPQRSTUVWXYZ';

/**
 * @returns {string} patient id
 */
export const generatePatientId = () => {
  let patientId = '';
  for (let i = 0; i < LENGTH; i++) {
    patientId += POSSIBLE_CHARACTERS.charAt(Math.floor(Math.random() * POSSIBLE_CHARACTERS.length));
  }
  return patientId;
};

/**
 * @returns {string}
 */
export const readPatientId = () => {
  const patient = readCbor(PATIENT_ID_FILENAME);
  return Object.keys(patient).length !== 0 && patient.patientId.length === 8 ? patient.patientId : null;
};
