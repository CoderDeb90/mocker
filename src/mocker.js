const { loadAndSetUserConfigurations, config } = require('./config');
const { processVocabulary, limitVocabularyActivities, getVocabulary } = require('./vocabulary');
const { generateCases, generateEvents } = require('./data');
const { saveToCSV, writeFile, deleteFile, streamEventsToCSV, streamEventsToSQL, streamCasesToSQL, streamCasesToCSV } = require('./output');
const { generateSchemaSql, generateSqlInsert } = require('./sql_generator');
const util = require('./util');
const pluralize = require('pluralize');

async function main() {
  loadAndSetUserConfigurations();

  let vocabulary = processVocabulary();
  // Apply activity limiting without modifying original file
  if (config.MAX_ACTIVITIES < 200) {
    vocabulary = limitVocabularyActivities(vocabulary, config.MAX_ACTIVITIES);
  }

  const cases = generateCases(config.NUMBER_OF_CASES);
  
  if (config.SHOW_PROGRESS) {
    process.stdout.write('Writing data to file...');
  }

  if (config.OUTPUT_FORMAT === 'csv') {
    await new Promise(async (resolve) => {
      const caseWriter = streamCasesToCSV(`out/${fileNameForCases()}.csv`, vocabulary.schema.cases, () => resolve());
      for (const caseObj of cases) {
        await caseWriter.writeCase(caseObj);
      }
      caseWriter.close();
    });
    
    // Stream events for large datasets
    await new Promise(async (resolve) => {
      const eventWriter = streamEventsToCSV(`out/${fileNameForEvents('streaming')}.csv`, vocabulary, (eventCount) => {
        // Rename file with actual count after completion
        const fs = require('fs');
        fs.renameSync(`out/${fileNameForEvents('streaming')}.csv`, `out/${fileNameForEvents(eventCount)}.csv`);
        resolve();
      });
      await generateEvents(cases, eventWriter);
      eventWriter.close();
    });
  } else if (config.OUTPUT_FORMAT === 'sql') {
    await saveToSqlStreaming(vocabulary, cases);
  } else {
    throw new Error(
      `Invalid format: "${config.OUTPUT_FORMAT}". To see a list of valid formats, please rerun with the -help option`
    );
  }
  if (config.SHOW_PROGRESS) {
    console.log(' \x1b[32mCompleted\x1b[0m');
  }
}

async function saveToSqlStreaming(vocabulary, cases) {
  deleteFile(`out/${fileNameForCombined()}.sql`);

  const schema = generateSchemaSql(vocabulary.schema);
  await writeFile('out/schema.sql', schema);
  await appendToCombinedSqlFile(schema + '\n\n');

  //"Lookup data"
  if (vocabulary.data) {
    for (const table in vocabulary.data) {
      const data = [];
      for (const [name, id] of Object.entries(vocabulary.data[table])) {
        data.push({ id, name });
      }

      const sqlInsertsData = generateSqlInsert(data, vocabulary.schema.data.find(e => e.lookup_for == table));
      await writeFile(`out/${fileNameForData(table)}.sql`, sqlInsertsData.join('\n'));
      await appendToCombinedSqlFile(sqlInsertsData.join('\n') + '\n\n');
    }
  }

  // Stream cases for SQL
  await new Promise(async (resolve) => {
    const caseWriter = streamCasesToSQL(`out/${fileNameForCases()}.sql`, vocabulary.schema.cases, async (caseCount) => {
      await streamAppendToCombinedSqlFile(`out/${fileNameForCases()}.sql`);
      resolve();
    });
    for (const caseObj of cases) {
      await caseWriter.writeCase(caseObj);
    }
    caseWriter.close();
  });

  // Stream events for SQL
  await new Promise(async (resolve) => {
    const eventWriter = streamEventsToSQL(`out/${fileNameForEvents('streaming')}.sql`, vocabulary, (eventCount) => {
      const fs = require('fs');
      fs.renameSync(`out/${fileNameForEvents('streaming')}.sql`, `out/${fileNameForEvents(eventCount)}.sql`);
      
      // Append to combined file
      streamAppendToCombinedSqlFile(`out/${fileNameForEvents(eventCount)}.sql`).then(resolve);
    });
    await generateEvents(cases, eventWriter);
    eventWriter.close();
  });
}

async function appendToCombinedSqlFile(data) {
  await writeFile(`out/${fileNameForCombined()}.sql`, data, { flags: 'a'});
}

async function streamAppendToCombinedSqlFile(sourceFile) {
  const fs = require('fs');
  return new Promise((resolve, reject) => {
    const readStream = fs.createReadStream(sourceFile);
    const writeStream = fs.createWriteStream(`out/${fileNameForCombined()}.sql`, { flags: 'a' });
    readStream.pipe(writeStream);
    writeStream.on('finish', () => {
      fs.appendFileSync(`out/${fileNameForCombined()}.sql`, '\n');
      resolve();
    });
    writeStream.on('error', reject);
    readStream.on('error', reject);
  });
}

function fileNameForCombined() {
  const prefix = pluralize.plural(config.FILE_NAME_PREFIX);
  const count = config.INCLUDE_RECORD_COUNT_IN_FILE_NAME ? `-${util.formatNumber(config.NUMBER_OF_CASES)}` : '';
  return `${prefix}${count}-all`
}

function fileNameForCases() {
  const prefix = pluralize.plural(config.FILE_NAME_PREFIX);
  return `${prefix}-${util.formatNumber(config.NUMBER_OF_CASES)}`
}

function fileNameForEvents(numOfEvents) {
  const prefix = pluralize.singular(config.FILE_NAME_PREFIX);
  return `${prefix}Events-${util.formatNumber(numOfEvents)}`
}

function fileNameForData(name) {
  const prefix = pluralize.plural(name);
  return `${prefix}`
}

main().catch((error) => console.error(error));
