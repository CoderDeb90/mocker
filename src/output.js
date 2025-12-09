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

function streamEventsToCSV(filename, vocabulary, onComplete) {
  const headers = vocabulary.schema.events.columns
    .filter(col => !col.name.startsWith("_"))
    .map(col => col.display_name);
  
  const stream = fs.createWriteStream(filename, { highWaterMark: 64 * 1024 });
  stream.setMaxListeners(0);
  stream.on('error', (err) => {
    console.error(`Error writing to CSV file ${filename}: ${err.message}`);
    throw err;
  });
  
  stream.write(headers.join(",") + "\n");
  
  let eventCount = 0;
  return {
    writeEvent: (event) => {
      const rowData = headers.map(h => event[h] || "").join(",");
      return new Promise((resolve) => {
        if (!stream.write(rowData + "\n")) {
          stream.once('drain', resolve);
        } else {
          resolve();
        }
      }).then(() => eventCount++);
    },
    close: () => {
      stream.end(() => {
        onComplete(eventCount);
      });
    }
  };
}

function streamEventsToSQL(filename, vocabulary, onComplete) {
  const stream = fs.createWriteStream(filename, { highWaterMark: 64 * 1024 });
  stream.setMaxListeners(0);
  stream.on('error', (err) => {
    console.error(`Error writing to SQL file ${filename}: ${err.message}`);
    throw err;
  });
  
  const tableName = vocabulary.schema.events.table_name;
  const columnsList = vocabulary.schema.events.columns
    .filter(col => !col.name.startsWith("_"))
    .map(col => col.name);
  
  let batch = [];
  let eventCount = 0;
  
  return {
    writeEvent: (event) => {
      batch.push(event);
      eventCount++;
      
      if (batch.length >= config.BATCH_SIZE_INSERT_SQL) {
        const valueSets = batch.map(obj => {
          const values = Object.entries(obj)
            .filter(([key]) => !key.startsWith("_"))
            .map(([key, value]) => {
              if (typeof value === "string") {
                value = value.replace("'", "''");
                return `'${value}'`;
              }
              return value;
            });
          return `(${values.join(", ")})`;
        });
        
        const sql = `INSERT INTO ${tableName} (${columnsList.join(", ")})\n VALUES ${valueSets.join(",\n ")};\n\n`;
        batch = [];
        return new Promise((resolve) => {
          if (!stream.write(sql)) {
            stream.once('drain', resolve);
          } else {
            resolve();
          }
        });
      }
      return Promise.resolve();
    },
    close: () => {
      if (batch.length > 0) {
        const valueSets = batch.map(obj => {
          const values = Object.entries(obj)
            .filter(([key]) => !key.startsWith("_"))
            .map(([key, value]) => {
              if (typeof value === "string") {
                value = value.replace("'", "''");
                return `'${value}'`;
              }
              return value;
            });
          return `(${values.join(", ")})`;
        });
        
        const sql = `INSERT INTO ${tableName} (${columnsList.join(", ")})\n VALUES ${valueSets.join(",\n ")};\n\n`;
        stream.write(sql);
      }
      
      stream.end(() => {
        onComplete(eventCount);
      });
    }
  };
}

function streamCasesToSQL(filename, schema, onComplete) {
  const stream = fs.createWriteStream(filename, { highWaterMark: 64 * 1024 });
  stream.setMaxListeners(0);
  stream.on('error', (err) => {
    console.error(`Error writing to SQL file ${filename}: ${err.message}`);
    throw err;
  });
  
  const tableName = schema.table_name;
  const columnsList = schema.columns.filter(col => !col.name.startsWith("_")).map(col => col.name);
  
  let batch = [];
  let caseCount = 0;
  
  return {
    writeCase: (caseObj) => {
      batch.push(caseObj);
      caseCount++;
      
      if (batch.length >= config.BATCH_SIZE_INSERT_SQL) {
        const valueSets = batch.map(obj => {
          const values = Object.entries(obj)
            .filter(([key]) => !key.startsWith("_"))
            .map(([key, value]) => typeof value === "string" ? `'${value.replace("'", "''")}'` : value);
          return `(${values.join(', ')})`;
        });
        batch = [];
        return new Promise((resolve) => {
          if (!stream.write(`INSERT INTO ${tableName} (${columnsList.join(', ')}) VALUES\n${valueSets.join(',\n')};\n\n`)) {
            stream.once('drain', resolve);
          } else {
            resolve();
          }
        });
      }
      return Promise.resolve();
    },
    close: () => {
      if (batch.length > 0) {
        const valueSets = batch.map(obj => {
          const values = Object.entries(obj)
            .filter(([key]) => !key.startsWith("_"))
            .map(([key, value]) => typeof value === "string" ? `'${value.replace("'", "''")}'` : value);
          return `(${values.join(', ')})`;
        });
        stream.write(`INSERT INTO ${tableName} (${columnsList.join(', ')}) VALUES\n${valueSets.join(',\n')};\n\n`);
      }
      stream.end(() => onComplete(caseCount));
    }
  };
}

function streamCasesToCSV(filename, schema, onComplete) {
  const headers = schema.columns.filter(col => !col.name.startsWith("_")).map(col => col.display_name);
  
  const stream = fs.createWriteStream(filename, { highWaterMark: 64 * 1024 });
  stream.setMaxListeners(0);
  
  stream.write(headers.join(",") + "\n");
  
  let caseCount = 0;
  return {
    writeCase: (caseObj) => {
      const rowData = headers.map(h => caseObj[h] || "").join(",");
      return new Promise((resolve) => {
        if (!stream.write(rowData + "\n")) {
          stream.once('drain', resolve);
        } else {
          resolve();
        }
      }).then(() => caseCount++);
    },
    close: () => {
      stream.end(() => onComplete(caseCount));
    }
  };
}

module.exports = { saveToCSV, writeFile, deleteFile, streamEventsToCSV, streamEventsToSQL, streamCasesToSQL, streamCasesToCSV };
