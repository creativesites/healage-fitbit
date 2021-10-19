import { me } from 'appbit';
import * as fs from 'fs';
import * as userActivity from 'user-activity';
import { outbox } from 'file-transfer';
import { PATIENT_ID_FILENAME, PRESCRIPTIONS_FILENAME } from '../common/config';
import { readPatientId } from './patientId';

export const generatePatientId = () => {
  fs.writeFileSync(PATIENT_ID_FILENAME, {}, 'cbor');
  outbox.enqueueFile(PATIENT_ID_FILENAME);
};

export const updatePrescriptions = () => {
  const patientId = readPatientId();
  if (!patientId) return;
  fs.writeFileSync(PRESCRIPTIONS_FILENAME, { patientId }, 'cbor');
  outbox.enqueueFile(PRESCRIPTIONS_FILENAME);
};

/**
 * @param {number} gaitSpeed
 */
export const gaitSpeed = (gaitSpeed) => {
  const gaitSpeedFilename = 'gaitSpeed' + new Date().getTime() + '.cbor';
  const patientId = readPatientId();
  fs.writeFileSync(gaitSpeedFilename, {
    patientId,
    gaitSpeed,
  }, 'cbor');
  outbox.enqueueFile(gaitSpeedFilename);
};

/**
 * @param {string} prescriptionId 
 * @param {string} reminderDate 
 * @param {string} reminderStatus 
 */
export const status = (prescriptionId, reminderDate, reminderStatus) => {
  const reminderStatusFilename = 'reminderStatus' + new Date().getTime() + '.cbor';
  fs.writeFileSync(reminderStatusFilename, {
    patientId: readPatientId(),
    prescriptionId,
    reminderDate,
    status: reminderStatus,
  }, 'cbor');
  outbox.enqueueFile(reminderStatusFilename);
};

export const dayHistory = () => {
  if (!me.permissions.granted("access_activity")) return;
  const dayRecords = userActivity.dayHistory.query({ limit: 1 }); // query for the data 1 day ago
  dayRecords.forEach((day) => {
    const yesterday = new Date((new Date().getTime() - (24 * 60 * 60 * 1000)));
    const dayHistoryFilename = 'dayHistory' + yesterday.toISOString().substring(0, 10) + '.cbor';
    const dayHistoryData = {
      ...day,
      patientId: readPatientId(PATIENT_ID_FILENAME),
      date: yesterday.toISOString(),
    };
    fs.writeFileSync(dayHistoryFilename, dayHistoryData, 'cbor');
    outbox.enqueueFile(dayHistoryFilename);
  });
};
