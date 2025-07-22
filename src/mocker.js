const { loadAndSetUserConfigurations, config } = require('./config');
const { processVocabulary, limitVocabularyActivities } = require('./vocabulary');
const { generateCases, generateEvents } = require('./data');
const { saveToCSV, writeFile, deleteFile } = require('./output');
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
  const events = generateEvents(cases);

  if (config.SHOW_PROGRESS) {
    process.stdout.write('Writing data to file...');
  }

  if (config.OUTPUT_FORMAT === 'csv') {
    await saveToCSV(`out/${fileNameForCases()}.csv`, cases);
    await saveToCSV(`out/${fileNameForEvents(events.length)}.csv`, events);
  } else if (config.OUTPUT_FORMAT === 'sql') {
    await saveToSql(vocabulary, cases, events);
  } else {
    throw new Error(
      `Invalid format: "${config.OUTPUT_FORMAT}". To see a list of valid formats, please rerun with the -help option`
    );
  }
  if (config.SHOW_PROGRESS) {
    console.log(' \x1b[32mCompleted\x1b[0m');
  }
}

async function saveToSql(vocabulary, cases, events) {
  deleteFile(`out/${fileNameForCombined()}.sql`);
  let combinedFile = '';

  const schema = generateSchemaSql(vocabulary.schema);
  await writeFile('out/schema.sql', schema);
  appendToCombinedSqlFile(schema + '\n\n');

  //"Lookup data"
  if (vocabulary.data) {
    for (const table in vocabulary.data) {
      const data = [];
      for (const [name, id] of Object.entries(vocabulary.data[table])) {
        data.push({
          id,
          name,
        });
      }

      const sqlInsertsData = generateSqlInsert(data, vocabulary.schema.data.find(e => e.lookup_for == table));
      await writeFile(`out/${fileNameForData(table)}.sql`, sqlInsertsData);
      appendToCombinedSqlFile(sqlInsertsData + '\n\n');
    }
  }

  const sqlInsertsCases = generateSqlInsert(cases, vocabulary.schema.cases);
  await writeFile(`out/${fileNameForCases()}.sql`, sqlInsertsCases);
  appendToCombinedSqlFile(sqlInsertsCases);
  appendToCombinedSqlFile('\n');

  const sqlInsertsEvents = generateSqlInsert(events, vocabulary.schema.events);
  await writeFile(`out/${fileNameForEvents(events.length)}.sql`, sqlInsertsEvents);
  appendToCombinedSqlFile(sqlInsertsEvents);
  appendToCombinedSqlFile('\n');
}

async function appendToCombinedSqlFile(data) {
  await writeFile(`out/${fileNameForCombined()}.sql`, data, { flags: 'a'});
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
