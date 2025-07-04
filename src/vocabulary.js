const fs = require("fs");
const { config } = require('./config');
const { faker } = require("@faker-js/faker");

const _vocabulary = {
  schema: {},
  data: {},
  randomStrings: {},
  finalEvents: {},
  cases: null,
  events: null
};

let items = {};

function processVocabulary() {
  items = parseVocabulary();

  if(config.DYNAMIC_ATTRS > 0) {
     includeDynamicAttributes(items);
  }

  for (const key in items) {
    if (key === "__schema__") {
      _vocabulary.schema = items["__schema__"];
      continue;
    }
    else if (key === "__final_events__")  {
      _vocabulary.finalEvents = items["__final_events__"];
      continue;
    }

    const transitions = items[key];
    const parsedTransitions = [];

    for (const nextEvent in transitions) {
      const weight = transitions[nextEvent];
      parsedTransitions.push({ string: nextEvent, weight: weight });
    }

    randomizeWithWeights(key, parsedTransitions);
  }

  parseSchema(items["__schema__"]);

  return _vocabulary;
}

function parseSchema(schema) {
  //Vocabulary data stored in a Lookup table
  if (schema.data) {
    for (const table of schema.data) {
      let id = 1;
      for (const column of table.columns) {
        //There can be at most a single column configured with is_lookup=true
        if (column.is_lookup) {
          _vocabulary.data[table.lookup_for] = {};
          
          const data = _vocabulary.randomStrings[table.lookup_for];
          if (!data) {
            throw new Error(
              `Missing key: "${table.lookup_for}". Please ensure that your configuration of attributes and events contains an entry for "${table.lookup_for}"`
            );
          }

          for (const item of data.values) {
            _vocabulary.data[table.lookup_for][item] = id++;
          }
        }
      }      
    }
  }
}

function randomizeWithWeights(key, stringsWithWeights) {
  const cumulativeWeights = [];
  const values = [];

  let cumulativeWeight = 0;
  for (const { string, weight } of stringsWithWeights) {
    cumulativeWeight += weight;
    cumulativeWeights.push(cumulativeWeight);
    values.push(string);
  }

  _vocabulary.randomStrings[key.toLowerCase()] = {
    weight: cumulativeWeights,
    values,
  };
}

function getRandomString(key, values=null) {
  if (!_vocabulary.randomStrings[key.toLowerCase()]) {
    throw new Error(
      `Missing key: "${key}". Please ensure that your configuration of attributes and events contains an entry for "${key}"`
    );
  }

  let randomStrings;
  if (values) {
    const item = items[key];

    const filteredValues = values.filter(value => item.hasOwnProperty(value));
    if (filteredValues.length === 0) {
      throw new Error(
        `None of the values in [${values.join(', ')}] are defined as valid next hops from "${key}".`
      );
    }
    const filteredWeights = filteredValues.map(value => item[value]);

    const cumulativeWeights = [];
    let total = 0;

    filteredWeights.forEach(weight => {
      total += weight;
      cumulativeWeights.push(total);
    });

    const normalizedCumulativeWeights = cumulativeWeights.map(cw => cw / total);

    randomStrings = {
      weight: normalizedCumulativeWeights,
      values: filteredValues
    }
  } else {
    randomStrings = _vocabulary.randomStrings[key.toLowerCase()];
  }

  const randomNum = Math.random();
  const index = randomStrings.weight.findIndex(
    (cp) => randomNum <= cp
  );

  if (index === -1) {
    return randomStrings.values[0];
  }

  return randomStrings.values[index];
}

function parseVocabulary() {
  try {
    return JSON.parse(fs.readFileSync("vocabulary.json", "utf8"));
  } catch (error) {
    console.error("Error parsing JSON file:", error);
    return null;
  }
}

function getVocabulary() {
  return _vocabulary;
}

function generateDynamicCaseAttrs(numOfAttrs, numOfUniqueValues){
  const dynamicDict = {};
  const str = "Dynamic_";
  for (let i = 1; i <= numOfAttrs; i++) {
    const uniqueWords = new Set();
    while (uniqueWords.size < numOfUniqueValues) {
      uniqueWords.add(faker.word.sample({ length: { min: 8, max: 15 }, strategy: "closest" }));
    }
    dynamicDict[`${str}${i}`] = Array.from(uniqueWords);
  }
  return dynamicDict;
}

function includeDynamicAttributes(items) {
  const dynamicCaseAttrs = generateDynamicCaseAttrs(config.DYNAMIC_ATTRS, config.UNIQUE_VALUES_FOR_DYNAMIC_ATTRS);

  Object.entries(dynamicCaseAttrs).forEach(([key, value]) => {
    // Add new columns into the schema
    const newColumn = {
      name: key.toLowerCase(),
      display_name: key.replace(/_/g,""),
      type: "text",
      nullable: true
    };
    items["__schema__"]["cases"]["columns"].push(newColumn);

    // Calculate weight for each value
    let weight = 1;
    if (value.length > 0) {
      weight = 1 / value.length;
    }

    // Create a dict with attr values as keys and weights as values
    const valuesWithWeight = {}
    for (let i = 0; i < value.length; i++) {
      valuesWithWeight[value[i]] = weight;
    }

    // Add the dynamic attribute and weighted values to vocabulary json object
    items[key] = valuesWithWeight
  })
}

module.exports = { processVocabulary, getRandomString, getVocabulary };
