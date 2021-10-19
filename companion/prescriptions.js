import { SERVER_URL } from "../common/config";

/**
 * @param {string} patientId 
 * @returns {Promise<Object[]>} JSON array of prescription objects
 */
export const getAll = async (patientId) => {
  const response = await fetch(`${SERVER_URL}/prescriptions/patient/${patientId}`);
  if (!response.ok) {
    throw new Error(`An error has occurred: ${response.status}`);
  }
  return response.json();
}
