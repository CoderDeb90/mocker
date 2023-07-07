const { faker } = require("@faker-js/faker");
const moment = require("moment");
const { getRandomString, getVocabulary } = require("./vocabulary");
const { config } = require("./config");

function generateTicketsData(numTickets) {
  const tickets = [];

  for (let i = 1; i <= numTickets; i++) {
    const ticket = {
      TicketID: i,
      Assignee: faker.internet.userName(),
      Project: getRandomString("PROJECT"),
      Label: getRandomString("LABEL"),
      Component: getRandomString("COMPONENT"),
      Priority: getRandomString("PRIORITY"),
      StoryPoints: getRandomString("STORY_POINTS"),
      IssueType: getRandomString("ISSUE_TYPE"),
      Sprint: getRandomString("SPRINT"),
      Team: getRandomString("TEAM"),
      Resolution: getRandomString("RESOLUTION"),
      ImpactArea: getRandomString("IMPACT_AREA"),
      Type: getRandomString("TYPE"),
      Status: getRandomString("STATUS"),
      Incident: getRandomString("INCIDENT"),
      CustomerType: getRandomString("CUSTOMER_TYPE"),
      CustomerImpact: getRandomString("CUSTOMER_IMPACT"),
      CustomerEnvironment: getRandomString("CUSTOMER_ENVIRONMENT"),
      RequiredOnCall: getRandomString("REQUIRED_ON_CALL"),
      NeedsCustomerUpdate: getRandomString("NEEDS_CUSTOMER_UPDATE"),
      RequiresPostmortem: getRandomString("NEEDS_POSTMORTEM"),
    };

    tickets.push(ticket);
  }

  return tickets;
}

function generateTransitionsData(tickets) {
  const initialEvent = getVocabulary().initialEvent;
  const finalEvent = getVocabulary().finalEvent;
  const transitions = [];

  for (const ticket of tickets) {
    const numTransitions = faker.number.int({
      min: config.MIN_EVENTS,
      max: config.MAX_EVENTS,
    });

    const startDate = faker.date.past({ years: config.TIMEFRAME_IN_YEARS });
    let currentDate = moment(startDate);

    let nextEventDate = faker.date.recent();

    let event, previousEvent;

    for (let i = 0; i < numTransitions; i++) {
      if (i === 0) {
        event = initialEvent;
      } else if (i === numTransitions - 1) {
        event = finalEvent;
      } else {
        event = getRandomString(previousEvent);
      }

      previousEvent = event;

      const transition = {
        TicketID: ticket.TicketID,
        Status: event,
        UserId: faker.internet.userName(),
        Date: currentDate.format("YYYY-MM-DD HH:mm:ss.SSS"),
        Actor: getRandomString("ACTOR"),
      };

      transitions.push(transition);

      if (event === finalEvent) break;

      currentDate.add({
        days: faker.number.int({
          min: config.MIN_DAYS_BETWEEN_EVENTS,
          max: config.MAX_DAYS_BETWEEN_EVENTS,
        }),
        hours: faker.number.int({
          min: config.MIN_HOURS_BETWEEN_EVENTS,
          max: config.MAX_HOURS_BETWEEN_EVENTS,
        }),
        minutes: faker.number.int({
          min: config.MIN_MINUTES_BETWEEN_EVENTS,
          max: config.MAX_MINUTES_BETWEEN_EVENTS,
        }),
      });
    }
  }

  return transitions;
}

module.exports = { generateTicketsData, generateTransitionsData };