import { me } from "companion";
import * as messaging from "messaging";
import * as util from "../common/utils";
import { inbox } from 'file-transfer';
import { outbox } from "file-transfer";
import * as cbor from 'cbor';

/**
 * Uses Fitbit Messaging API to determine if a generated ID is available for use
 */
messaging.peerSocket.addEventListener("message", (evt) => {
  if (evt.data.request === "checkId") {
    const patientId = evt.data.id;
    isIdAvailable(patientId).then(data => {
      if (data.message === 'true') {
        sendUpdateId(patientId);
      } else {
        sendRegenerateId();
      }
    });
  }
});

/**
 * Deletes all reminders associated with a prescriptionId. Used in the event that a prescription has been updated. 
 * @param {string} prescriptionId 
 */
function sendDeleteReminders(prescriptionId) {
  const data = {
    request: 'deleteReminders',
    prescriptionId: prescriptionId,
  }
  if (messaging.peerSocket.readyState === messaging.peerSocket.OPEN) {
    messaging.peerSocket.send(data);
  }
}

/**
 * Informs the device that the patientId in this message is available for use
 * @param {string} patientId 
 */
function sendUpdateId(patientId) {
  const data = {
    request: 'updateId',
    id: patientId,
  }
  if (messaging.peerSocket.readyState === messaging.peerSocket.OPEN) {
    messaging.peerSocket.send(data);
  }
}

/**
 * Informs the device that a new patientId must be generated
 * @param {string} patientId 
 */
function sendRegenerateId(patientId) {
  const data = {
    request: 'regenerateId',
  }
  if (messaging.peerSocket.readyState === messaging.peerSocket.OPEN) {
    messaging.peerSocket.send(data);
  }
}

/**
 * Checks the server if a patientId is available for use
 * @param {string} patientId 
 * @returns JSON response from server
 */
async function isIdAvailable(patientId) {
  const response = await fetch("https://www.healage.org/api/patients/check/" + patientId);
  if (!response.ok) {
    const message = `An error has occurred: ${response.status}`;
    throw new Error(message);
  }
  const message = await response.json();
  return message;
}

/**
 * Checks the server for a patient's prescriptions
 * @param {string} patientId 
 * @returns JSON array of prescription objects
 */
async function getPrescriptions(patientId) {
  const response = await fetch("https://www.healage.org/api/prescriptions/patient/" + patientId);
  if (!response.ok) {
    const message = `An error has occurred: ${response.status}`;
    throw new Error(message);
  }
  const message = await response.json();
  return message;
}

/**
 * Depending on the file name received from the device, this ensures that certain actions are taken since the File Transfer API guarantees messages be sent and received.
 */
async function processAllFiles() {
  let file;
  while ((file = await inbox.pop())) {
    let payload = await file.cbor();
    payload = JSON.parse(JSON.stringify(payload));
    if (file.name === 'prescriptions.cbor') {
      if (payload.length > 0) {
        const patientId = payload[0].patientId;
        const prescriptions = getPrescriptions(patientId);
        prescriptions.then(data => {
          for (let i = 0; i < payload.length; i++) {
            if (payload[i].hasOwnProperty('id')) {
              let serverPrescriptionIndex = findPrescription(data, payload[i].id);
              if (serverPrescriptionIndex != -1) {
                let serverPrescription = data[serverPrescriptionIndex];
                let devicePrescription = payload[i];
                if (isPrescriptionUpdated(devicePrescription, serverPrescription)) {
                  sendDeleteReminders(payload[i].id);
                }
              }
            }
          }
          const fileName = "prescriptions.cbor";
          outbox.enqueue(fileName, cbor.encode(data));
        })
      }
    } else if (file.name.includes('dayHistory')) {
      sendPostToServer(payload, 'user-activity');
      sendDeleteFile(file.name); // Must delete file on device to prevent reaching File System max storage
    } else if (file.name.includes('reminderStatus')) {
      sendPostToServer(payload, 'reminders');
      sendDeleteFile(file.name); // Must delete file on device to prevent reaching File System max storage
    }

  }
}

inbox.addEventListener("newfile", processAllFiles);

/**
 * Checks if a prescription on the server is newer than the prescription on the device to determine if the prescription has been updated
 * @param {object} devicePrescription 
 * @param {object} serverPrescription 
 * @returns 
 */
function isPrescriptionUpdated(devicePrescription, serverPrescription) {
  if (devicePrescription.hasOwnProperty('id') && devicePrescription.hasOwnProperty('updatedAt')) {
    return devicePrescription.updatedAt !== serverPrescription.updatedAt ? true : false;
  }
  return false;
}

/**
 * Finds the index of a prescription given its ID
 * @param {object} prescriptions 
 * @param {string} prescriptionId 
 * @returns 
 */
function findPrescription(prescriptions, prescriptionId) {
  for (let i = 0; i < prescriptions.length; i++) {
    if (prescriptions[i].id === prescriptionId) {
      return i;
    }
  }
  return -1;
}

/**
 * Sends a file transfer to the Fitbit device with the file that is to be deleted on the device
 * @param {string} deleteFileName File that is to be deleted
 */
function sendDeleteFile(deleteFileName) {
  const fileName = 'deleteFile' + new Date().getTime() + '.cbor';
  const data = {
    fileName: deleteFileName,
  }
  outbox.enqueue(fileName, cbor.encode(data));
}

/**
 * Sends HTTP POST to Healage server
 * @param {object} data 
 * @param {string} endpoint e.g. https://healage.org/api/ + endpoint
 */
function sendPostToServer(data, endpoint) {
  fetch('https://www.healage.org/api/' + endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(data),
  });
}