import { inbox } from 'file-transfer';
import * as send from './send';
import * as patientsService from './patients';
import { PATIENT_ID_FILENAME, PRESCRIPTIONS_FILENAME } from '../common/config';

const processAllFiles = async () => {
  let file;
  while ((file = await inbox.pop())) {
    const payload = await file.cbor();
    if (file.name === PATIENT_ID_FILENAME) {
      send.patientId();
    } else if (file.name === PRESCRIPTIONS_FILENAME) {
      send.prescriptions(payload.patientId);
    } else if (file.name.includes('gaitSpeed')) {
      patientsService.post(payload, patientsService.routes.GAIT_SPEED);
      send.deleteFile(file.name);
    } else if (file.name.includes('dayHistory')) {
      patientsService.post(payload, patientsService.routes.USER_ACTIVITY);
      send.deleteFile(file.name);
    } else if (file.name.includes('reminderStatus')) {
      patientsService.post(payload, patientsService.routes.REMINDERS);
      send.deleteFile(file.name);
    }
  }
};
inbox.addEventListener('newfile', processAllFiles);
processAllFiles();
