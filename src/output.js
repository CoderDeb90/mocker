const fs = require("fs");
const path = require("path");
const { config } = require("./config");
const batchSize = 1;

function saveToCSV(filename, data) {
  return new Promise((resolve, reject) => {
    if (!data || data.length === 0) {
      console.error(`No data provided to write to ${filename}`);
      return reject(new Error("Data is empty."));
    }

    const headers = Object.keys(data[0]);
    const filteredHeaders = headers.filter((header) => !header.startsWith("_"));

    const stream = fs.createWriteStream(filename);

    stream.on('error', (err) => {
      console.error(`Error writing to CSV file ${filename}: ${err.message}`);
      reject(err);
    });

    stream.write(filteredHeaders.join(",") + "\n");

    // Write data rows incrementally in batches
    let batch = [];

    data.forEach((row, index) => {
      const rowData = filteredHeaders.map((header) => row[header] || "").join(",");
      batch.push(rowData)

      if (batch.length === batchSize || index === data.length - 1) {
        stream.write(batch.join("\n") + "\n");
        batch = [];
      }
    });

    stream.end(() => {
      resolve();
    });
  });
}

function writeFile(filename, data, opt) {
  return new Promise((resolve, reject) => {
    const dir = path.dirname(filename);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    const stream = fs.createWriteStream(filename, opt);

    stream.on('error', (err) => {
      console.error(`Error writing to file ${filename}: ${err.message}`);
      reject(err);
    });

    if (Array.isArray(data)) {
      // Write data rows incrementally in batches
      let batch = [];

      data.forEach((row, index) => {
        batch.push(row + '\n');

        if (batch.length === batchSize || index === data.length - 1) {
          stream.write(batch.join(''));
          batch = [];
        }
      });
    } else {
      stream.write(data);
    }

    stream.end(() => {
      resolve();
    });
  });
}

function deleteFile(filename) {
  try {
    // Check if file exists
    fs.accessSync(filename, fs.constants.F_OK);

    // If file exists, proceed with unlinking it
    fs.unlinkSync(filename);
  } catch (err) {
    if (err.code === 'ENOENT') {
      // File doesn't exist, ignore silently
      return;
    } else {
      console.error(`Error deleting file: ${err}`);
    }
  }
}

module.exports = { saveToCSV, writeFile, deleteFile };
