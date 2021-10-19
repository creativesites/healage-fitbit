import * as fs from 'fs';

/**
 * @param {string} file 
 * @returns {any[]}
 */
export const readCborArray = (file) => (
  fs.existsSync(file) ? fs.readFileSync(file, 'cbor') : []
);

/**
 * @param {string} file 
 * @returns {Object}
 */
export const readCbor = (file) => (
  fs.existsSync(file) ? fs.readFileSync(file, 'cbor') : {}
);

/**
 * @param {string} file
 */
export const deleteFile = (file) => {
  if (!fs.existsSync(file)) return;
  fs.unlinkSync(file);
}
