import * as cbor from 'cbor';
import { outbox } from 'file-transfer';
import * as patientsService from './patients';
import * as prescriptionsService from './prescriptions';
import { PATIENT_ID_FILENAME, PRESCRIPTIONS_FILENAME } from '../common/config';

export const patientId = async () => {
  outbox.enqueue(PATIENT_ID_FILENAME, cbor.encode({
    patientId: await patientsService.generatePatientId(),
  }));
}

/**
 * @param {string} patientId 
 */
export const prescriptions = async (patientId) => {
  const allPrescriptions = await prescriptionsService.getAll(patientId);
  outbox.enqueue(PRESCRIPTIONS_FILENAME, cbor.encode({
    patientId,
    prescriptions: allPrescriptions,
  }));
}

/**
 * Sends a file transfer to the Fitbit device with the file
 * that is to be deleted on the device
 * @param {string} deleteFilename File that is to be deleted
 */
export const deleteFile = (deleteFilename) => {
  const filename = 'deleteFile' + new Date().getTime() + '.cbor';
  outbox.enqueue(filename, cbor.encode({ filename: deleteFilename }));
};
