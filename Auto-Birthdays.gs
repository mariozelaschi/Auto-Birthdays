/******************************
 * CONFIGURATION
 * Version: 1.3.0 (Customized)
 ******************************/
const CONFIG = {
  // Calendar to sync with. Default 'primary' is usually your main Google Calendar.
  calendarId: 'primary',

  // Title options
  useEmoji: true,                    // Add birthday emoji 🎂 to event titles
  showYearOrAge: true,               // true: (*YYYY) for recurring, false: (age)
  showAgeOnRecurring: false,         // true: (age) on each recurring instance instead of (*YYYY)
  
  // Event options
  eventColor: '2',                   // Custom event color ID ('1'-'11') or empty for default
  setTransparency: false,            // Set to true to show as Available (TRANSPARENT), false for Busy (OPAQUE)

  // Language options
  language: 'en',                    // Language code: 'en', 'it', 'fr', 'de', 'es'
  titleFormat: '',                   // Custom title format template, e.g. "{emoji}{name} ({ageOrYear})"

  // Recurrence options
  useRecurrence: true,               // true: create recurring events, false: create individual yearly events
  futureYears: 10,                   // Number of future years to generate recurring events for
  pastYears: 1,                      // Number of past years to generate recurring events for

  // Notification options
  useReminders: false,               // Enable popup reminders for events
  reminderMinutesBefore: 1440,       // Reminder time in minutes before event (1440 = 24 hours)
                                     // Common values: 0 = at event time, 60 = 1 hour before, 1440 = 1 day before, 10080 = 1 week before

  // Cleanup options
  firstRunCleanup: false,            // ⚠️ Set to true ONCE to delete legacy birthday events, then set back to false
  manualCleanup: false,              // ⚠️ Set to true ONCE to delete ALL events created by this script, then set back to false
  monthlyCleanup: true,              // Set to true to automatically clean up and recreate events on the 1st of every month
  cleanupOrphans: true,              // Automatically delete birthday events for contacts no longer in Google Contacts

  // Trigger options
  useTrigger: true,                  // Enable automatic execution via trigger
  triggerFrequency: 'daily',         // Trigger frequency: 'daily' or 'hourly'
  triggerHour: 4,                    // Hour of day to run daily trigger (0-23)

  // Script identification
  scriptKey: 'Auto-Birthdays',       // Key stored in event description to identify script-created events

  // Filter options
  useLabels: false,                  // Filter contacts by labels/groups
  contactLabels: [],                 // Array of contact label/group IDs to include (empty = all)
  useMonthFilter: false,             // Filter contacts by birth month
  filterMonths: []                   // Array of birth months to include (1-12, e.g. [1, 2, 3] for Q1)
};

/** Language configurations for event titles and descriptions */
const LANGUAGE_CONFIG = {
  en: {
    titleFormats: {
      'default': "{emoji}{name}'s Birthday ({ageOrYear})"
    },
    terms: {
      'age': 'age',
      'years': 'years',
      'year': 'year',
      'birthday': 'birthday',
      'happyBirthday': 'Happy Birthday'
    }
  },
  it: {
    titleFormats: {
      'default': '{emoji}Compleanno di {name} - {age} anni'
    },
    terms: {
      'age': 'età',
      'years': 'anni',
      'year': 'anno',
      'birthday': 'compleanno',
      'happyBirthday': 'Buon Compleanno'
    }
  },
  fr: {
    titleFormats: {
      'default': '{emoji}Anniversaire de {name} - {age} ans'
    },
    terms: {
      'age': 'âge',
      'years': 'ans',
      'year': 'an',
      'birthday': 'anniversaire',
      'happyBirthday': 'Joyeux Anniversaire'
    }
  },
  de: {
    titleFormats: {
      'default': '{emoji}Geburtstag von {name} - {age} Jahre'
    },
    terms: {
      'age': 'Alter',
      'years': 'Jahre',
      'year': 'Jahr',
      'birthday': 'Geburtstag',
      'happyBirthday': 'Alles Gute zum Geburtstag'
    }
  },
  es: {
    titleFormats: {
      'default': '{emoji}Cumpleaños de {name} - {age} años'
    },
    terms: {
      'age': 'edad',
      'years': 'años',
      'year': 'año',
      'birthday': 'cumpleaños',
      'happyBirthday': 'Feliz Cumpleaños'
    }
  }
};

/** Main function to process contacts and create/update birthday events */
function loopThroughContacts() {
  // Check and manage triggers
  if (CONFIG.useTrigger) {
    ensureTriggerExists();
  } else {
    removeTriggerIfExists();
  }

  // Fetch contacts
  const connections = getAllContacts();
  
  // Check reminder configuration
  if (CONFIG.useReminders && (typeof CONFIG.reminderMinutesBefore !== 'number' || CONFIG.reminderMinutesBefore < 0)) {
    Logger.log("⚠️ Invalid reminder configuration: reminderMinutesBefore must be a non-negative number.");
    return;
  }

  // Fetch target calendar
  const calendar = CalendarApp.getCalendarById(CONFIG.calendarId);
  if (!calendar) {
    Logger.log("⚠️ Calendar not found.");
    return;
  }

  // Check for legacy cleanup mode
  if (CONFIG.firstRunCleanup) {
    Logger.log("🧹 Running first-time cleanup of legacy birthday events...");
    cleanupLegacyBirthdayEvents(calendar);
    Logger.log("🎉 First-run cleanup completed!");
    Logger.log("⚠️ Remember to set firstRunCleanup back to false!");
    return;
  }

  // Check for manual cleanup mode
  if (CONFIG.manualCleanup) {
    Logger.log("🧹 Running manual cleanup of ALL script-created events...");
    cleanupAllScriptEvents(calendar);
    Logger.log("🎉 Manual cleanup completed!");
    Logger.log("⚠️ Remember to set manualCleanup back to false!");
    return;
  }

  // Check for monthly cleanup mode (runs on the 1st of the month)
  const today = new Date();
  const isFirstOfMonth = today.getDate() === 1;
  
  if (CONFIG.monthlyCleanup && isFirstOfMonth) {
    Logger.log("📅 It's the 1st of the month - running monthly cleanup...");
    cleanupOldBirthdayEvents(calendar, connections);
    Logger.log("🧹 Monthly cleanup completed! Now recreating events...");
  }

  Logger.log("📊 Starting birthday event processing...");

  // Calculate search window for existing events
  const currentYear = new Date().getFullYear();
  const startDate = new Date(currentYear - CONFIG.pastYears - 1, 0, 1);
  const endDate = new Date(currentYear + CONFIG.futureYears + 1, 11, 31);
  
  // Fetch existing calendar events within window
  const allEvents = calendar.getEvents(startDate, endDate);
  
  // Build fast lookup index
  const eventIndex = buildBirthdayIndex(allEvents);

  // Counters for logging
  let totalContacts = connections.length;
  let contactsWithBirthdays = 0;
  let processedContacts = 0;
  let eventsCreated = 0;
  let eventsUpdated = 0;
  let skippedByLabelFilter = 0;
  let skippedByMonthFilter = 0;
  let skippedInvalidBirthdays = 0;

  // Process each contact
  for (const person of connections) {
    // First check if contact has valid birthday data
    const birthdayData = person.birthdays?.find(b => b.date);
    if (!birthdayData) {
      continue;
    }

    // Check if label filtering is enabled and if this contact has the required labels
    if (CONFIG.useLabels && !hasRequiredLabel(person, CONFIG.contactLabels)) {
      skippedByLabelFilter++;
      continue;
    }

    // Check if month filtering is enabled and if this contact's birthday month matches
    if (CONFIG.useMonthFilter && CONFIG.filterMonths.length > 0) {
      const birthMonth = parseInt(birthdayData.date.month, 10);
      if (!CONFIG.filterMonths.includes(birthMonth)) {
        skippedByMonthFilter++;
        continue;
      }
    }

    // Process contact's birthday
    contactsWithBirthdays++;
    try {
      const result = updateOrCreateBirthDayEvent(person, birthdayData, calendar, allEvents, eventIndex);
      if (result === 'created') {
        processedContacts++;
        eventsCreated++;
      } else if (result === 'updated') {
        processedContacts++;
        eventsUpdated++;
      } else if (result === 'skipped_existing') {
        processedContacts++;
      } else if (result === 'skipped_invalid') {
        skippedInvalidBirthdays++;
      }
    } catch (error) {
      const contactName = getContactName(person);
      Logger.log(`❌ Error processing ${contactName}: ${error}`);
      skippedInvalidBirthdays++;
    }
  }

  // Print detailed summary report
  Logger.log("📊 PROCESSING SUMMARY REPORT:");
  Logger.log(`📞 Total contacts retrieved: ${totalContacts}`);
  Logger.log(`🎂 Contacts with birthday data: ${contactsWithBirthdays}`);
  Logger.log(`✅ Successfully processed contacts: ${processedContacts}`);
  Logger.log(`🆕 Events created: ${eventsCreated}`);
  Logger.log(`🔄 Events updated: ${eventsUpdated}`);
  
  const eventsAlreadyCorrect = processedContacts - eventsCreated - eventsUpdated;
  if (eventsAlreadyCorrect > 0) Logger.log(`✓ Events already up-to-date: ${eventsAlreadyCorrect}`);
  if (CONFIG.useLabels) Logger.log(`🏷️ Contacts skipped by label filter: ${skippedByLabelFilter}`);
  if (CONFIG.useMonthFilter) Logger.log(`📅 Contacts skipped by month filter: ${skippedByMonthFilter}`);
  if (skippedInvalidBirthdays > 0) Logger.log(`⚠️ Contacts with invalid birthday data: ${skippedInvalidBirthdays}`);
  
  const contactsWithoutBirthdays = totalContacts - contactsWithBirthdays - skippedByLabelFilter - skippedByMonthFilter;
  if (contactsWithoutBirthdays > 0) Logger.log(`📝 Contacts without birthday data: ${contactsWithoutBirthdays}`);
  
  if (CONFIG.useReminders) {
    const reminderText = CONFIG.reminderMinutesBefore === 0 ? "at event time" : `${CONFIG.reminderMinutesBefore} minutes before`;
    Logger.log(`⏰ Reminders enabled: ${reminderText}`);
  } else {
    Logger.log(`⏰ Reminders disabled`);
  }
  
  // Check for orphaned events if enabled
  if (CONFIG.cleanupOrphans) {
    const orphansDeleted = cleanupOrphanedEvents(calendar, allEvents, connections);
    if (orphansDeleted > 0) {
      Logger.log(`🧹 Orphaned events deleted: ${orphansDeleted}`);
    }
  }
  
  Logger.log("🎉 Processing completed successfully!");
}

function matchesContactName(title, contactName) {
  if (!title || !contactName) return false;
  const escapedName = contactName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const regex = new RegExp(`\\b${escapedName}\\b`, 'i');
  return regex.test(title);
}

/** Generate localized title based on configured language and formatting options */
function generateLocalizedTitle(contactName, age, birthYear, showYear, isRecurring) {
  const langConfig = LANGUAGE_CONFIG[CONFIG.language] || LANGUAGE_CONFIG['en'];
  const formatTemplate = CONFIG.titleFormat || langConfig.titleFormats['default'];
  const usingCustomFormat = CONFIG.titleFormat && CONFIG.titleFormat.trim() !== '';
  
  // Determine emoji
  const emoji = (usingCustomFormat || CONFIG.useEmoji) ? '🎂 ' : '';
  let ageOrYear = '';
  let ageText = '';
  let effectiveAge = age;

  if (isRecurring && showYear) {
    effectiveAge = null;
  }
  
  // Determine age or year display
  if (birthYear) {
    if (showYear) {
      ageOrYear = `*${birthYear}`;
      ageText = `*${birthYear}`;
    } else if (effectiveAge !== null) {
      const yearWord = effectiveAge === 1 ? langConfig.terms.year : langConfig.terms.years;
      ageOrYear = effectiveAge.toString();
      ageText = `${effectiveAge} ${yearWord}`;
    }
  }
  
  // Perform template replacements
  let title = formatTemplate
    .replace(/{emoji}/g, emoji)
    .replace(/{name}/g, contactName)
    .replace(/{ageOrYear}/g, ageOrYear)
    .replace(/{age}/g, effectiveAge !== null ? effectiveAge.toString() : '')
    .replace(/{ageText}/g, ageText)
    .replace(/{birthYear}/g, birthYear ? birthYear.toString() : '')
    .replace(/{years}/g, effectiveAge === 1 ? langConfig.terms.year : (effectiveAge !== null ? langConfig.terms.years : ''))
    .replace(/{year}/g, effectiveAge === 1 ? langConfig.terms.year : '')
    .replace(/{birthday}/g, langConfig.terms.birthday);
  
  // Clean up trailing characters and extra spaces
  title = title
    .replace(/\s*\(\s*\)\s*/g, '')
    .replace(/\s*\(\s*\*\s*\)\s*/g, '')
    .replace(/\s*-\s*\*?\s*$/g, '')
    .replace(/\s*-\s*$/g, '')
    .replace(/\s+/g, ' ');
    
  return title.trim();
}

/** Generate localized description containing script metadata */
function generateLocalizedDescription(contactName) {
  const langConfig = LANGUAGE_CONFIG[CONFIG.language] || LANGUAGE_CONFIG['en'];
  return `🎂 ${langConfig.terms.happyBirthday} ${contactName}!\n\n[${CONFIG.scriptKey}]`;
}

/** Build a map index of existing events for fast lookup */
function buildBirthdayIndex(events) {
  const map = new Map();
  for (const ev of events) {
    if (!ev.isAllDayEvent()) continue;
    const d = ev.getStartTime();
    const key = `${ev.getTitle()}|${d.getMonth()}|${d.getDate()}|${d.getFullYear()}`;
    if (!map.has(key)) {
      map.set(key, []);
    }
    map.get(key).push(ev);
  }
  return map;
}

/** Check if a contact belongs to any of the required label groups */
function hasRequiredLabel(person, labelIds) {
  if (!labelIds || labelIds.length === 0) return true;
  if (!person.memberships || person.memberships.length === 0) return false;

  for (const membership of person.memberships) {
    if (membership.contactGroupMembership?.contactGroupId) {
      const contactGroupId = membership.contactGroupMembership.contactGroupId;
      for (const labelId of labelIds) {
        if (contactGroupId.includes(labelId)) return true;
      }
    }
  }
  return false;
}

/** Fetch all contacts from Google People API with pagination */
function getAllContacts() {
  const connections = [];
  let nextPageToken;
  
  do {
    // Define the base options without the pageToken
    const reqOpts = {
      personFields: 'names,birthdays,memberships',
      sortOrder: 'LAST_NAME_ASCENDING',
      pageSize: 100
    };
    
    // Safely append the pageToken only if it is defined
    if (nextPageToken) {
      reqOpts.pageToken = nextPageToken;
    }
    
    const response = People.People.Connections.list('people/me', reqOpts);
    connections.push(...(response.connections || []));
    nextPageToken = response.nextPageToken;
  } while (nextPageToken);

  return connections;
}

/** Create or update birthday event for a contact */
function updateOrCreateBirthDayEvent(person, birthdayRaw, calendar, allEvents, eventIndex) {
  const contactName = getContactName(person);
  const birthdayDate = birthdayRaw.date;

  if (!birthdayDate || typeof birthdayDate.day !== 'number' || typeof birthdayDate.month !== 'number') {
    Logger.log(`⚠️ Skipping ${contactName} due to invalid birthdayDate: ${JSON.stringify(birthdayRaw)}`);
    return 'skipped_invalid';
  }

  // Extract date components
  const currentYear = new Date().getFullYear();
  const startYear = currentYear - CONFIG.pastYears;
  const month = parseInt(birthdayDate.month, 10) - 1;
  const day = parseInt(birthdayDate.day, 10);

  // Create reference dates
  const birthdayStartDate = new Date(startYear, month, day);
  const birthdayDateThisYear = new Date(currentYear, month, day);

  if (isNaN(birthdayStartDate.getTime()) || isNaN(birthdayDateThisYear.getTime())) {
    Logger.log(`⚠️ Invalid date for ${contactName}: ${birthdayDate.month}-${birthdayDate.day}`);
    return 'skipped_invalid';
  }
  
  // Generate expected title and description
  const age = birthdayDate.year ? currentYear - birthdayDate.year : null;
  const showYear = CONFIG.useRecurrence && !CONFIG.showAgeOnRecurring;
  const usingIndividualEvents = CONFIG.useRecurrence && CONFIG.showAgeOnRecurring && birthdayDate.year;
  const expectedTitle = generateLocalizedTitle(contactName, age, birthdayDate.year, showYear, CONFIG.useRecurrence && !usingIndividualEvents);
  const expectedDescription = generateLocalizedDescription(contactName);

  // Quick lookup check for exact existing event
  const key = `${expectedTitle}|${month}|${day}|${currentYear}`;
  const existingEvents = eventIndex.get(key) || [];
  const existingQuick = existingEvents.find(ev => 
    ev.isAllDayEvent() &&
    isEventCreatedByScript(ev) &&
    (CONFIG.useRecurrence === (ev.isRecurringEvent && ev.isRecurringEvent())) &&
    (ev.getDescription() || '') === expectedDescription &&
    hasCorrectReminders(ev)
  );
  
  if (!usingIndividualEvents && existingQuick) {
    return 'skipped_existing';
  }

  // Find all related events for this contact on this date
  const relatedEvents = findBirthdayEvents(allEvents, contactName, month, day);
  const deletedSeriesIds = new Set();
  let correctEventExists = false;
  let eventsWereDeleted = false;

  // Clean up outdated or invalid events
  for (const event of relatedEvents) {
    const title = event.getTitle();
    let description = '';
    try { description = event.getDescription() || ''; } catch (e) {}
    
    let eventExpectedTitle = expectedTitle;
    if (usingIndividualEvents) {
      const eventYear = event.getStartTime().getFullYear();
      const eventAge = birthdayDate.year ? eventYear - birthdayDate.year : null;
      eventExpectedTitle = generateLocalizedTitle(contactName, eventAge, birthdayDate.year, false, false);
    }
    
    let eventIsRecurring = false;
    try {
      eventIsRecurring = event.isRecurringEvent && event.isRecurringEvent();
    } catch (e) {}

    const isTitleOutdated = title !== eventExpectedTitle;
    const isDescriptionOutdated = description !== expectedDescription;
    const isNotAllDay = !event.isAllDayEvent();
    const isRecurrenceMismatch = usingIndividualEvents ? eventIsRecurring : CONFIG.useRecurrence !== eventIsRecurring;
    const isNotFromScript = !isEventCreatedByScript(event);
    const hasIncorrectReminders = !hasCorrectReminders(event);
    const needsConversionToIndividual = usingIndividualEvents && eventIsRecurring;

    if (isTitleOutdated || isDescriptionOutdated || isNotAllDay || isRecurrenceMismatch || isNotFromScript || hasIncorrectReminders || needsConversionToIndividual) {
      eventsWereDeleted = true;
      try {
        if (eventIsRecurring) {
          try {
            const series = event.getEventSeries();
            if (series) {
              const seriesId = series.getId();
              if (!deletedSeriesIds.has(seriesId)) {
                deletedSeriesIds.add(seriesId);
                series.deleteEventSeries();
                Logger.log(`🗑️ Deleted outdated recurring series: ${title}`);
              }
            }
          } catch (e) {
            Logger.log(`❌ Error deleting recurring series: ${title} → ${e}`);
          }
        } else {
          event.deleteEvent();
          Logger.log(`🗑️ Deleted outdated event: ${title}`);
        }
      } catch (e) {
        Logger.log(`❌ Error deleting event: ${title} → ${e}`);
      }
    } else if (!usingIndividualEvents) {
      correctEventExists = true;
    }
  }

  if (correctEventExists && !usingIndividualEvents) {
    return 'skipped_existing';
  }

  // Check if all individual yearly events exist when using age on recurring
  if (usingIndividualEvents) {
    let allYearsExist = true;
    for (let year = startYear; year <= currentYear + CONFIG.futureYears; year++) {
      const yearAge = year - birthdayDate.year;
      const yearTitle = generateLocalizedTitle(contactName, yearAge, birthdayDate.year, false, false);
      const yearKey = `${yearTitle}|${month}|${day}|${year}`;
      const yearEvents = eventIndex.get(yearKey) || [];
      const yearEvent = yearEvents.find(ev => 
        isEventCreatedByScript(ev) && 
        (ev.getDescription() || '') === expectedDescription && 
        hasCorrectReminders(ev)
      );
      if (!yearEvent) {
        allYearsExist = false;
        break;
      }
    }
    if (allYearsExist) return 'skipped_existing';
  }

  // Create new events if necessary
  if (CONFIG.useRecurrence && CONFIG.showAgeOnRecurring && birthdayDate.year) {
    let createdCount = 0;
    for (let year = startYear; year <= currentYear + CONFIG.futureYears; year++) {
      const yearAge = year - birthdayDate.year;
      const yearBirthdayDate = new Date(year, month, day);
      const yearTitle = generateLocalizedTitle(contactName, yearAge, birthdayDate.year, false, false);
      
      const yearKey = `${yearTitle}|${month}|${day}|${year}`;
      const existingYearEvents = eventIndex.get(yearKey) || [];
      const existingYearEvent = existingYearEvents.find(ev => 
        isEventCreatedByScript(ev) && 
        (ev.getDescription() || '') === expectedDescription && 
        hasCorrectReminders(ev)
      );
      if (existingYearEvent) {
        continue;
      }
      
      const event = calendar.createAllDayEvent(yearTitle, yearBirthdayDate, { description: expectedDescription });
      event.removeAllReminders();
      if (CONFIG.useReminders) event.addPopupReminder(CONFIG.reminderMinutesBefore);
      if (CONFIG.setTransparency) event.setTransparency(CalendarApp.EventTransparency.TRANSPARENT);
      if (CONFIG.eventColor) event.setColor(CONFIG.eventColor);
      
      createdCount++;
      Logger.log(`🎁 Created individual event: ${yearTitle} [${yearBirthdayDate.toDateString()}]`);
    }
    if (createdCount === 0) return 'skipped_existing';
  } else if (CONFIG.useRecurrence) {
    const recurrence = CalendarApp.newRecurrence()
      .addYearlyRule()
      .until(new Date(currentYear + CONFIG.futureYears, 11, 31));

    const eventSeries = calendar.createAllDayEventSeries(expectedTitle, birthdayStartDate, recurrence, { description: expectedDescription });
    eventSeries.removeAllReminders();
    if (CONFIG.useReminders) eventSeries.addPopupReminder(CONFIG.reminderMinutesBefore);
    if (CONFIG.setTransparency) eventSeries.setTransparency(CalendarApp.EventTransparency.TRANSPARENT);
    if (CONFIG.eventColor) eventSeries.setColor(CONFIG.eventColor);
    
    Logger.log(`🎉 Created RECURRING event: ${expectedTitle} [starts ${birthdayStartDate.toDateString()}]`);
  } else {
    const event = calendar.createAllDayEvent(expectedTitle, birthdayDateThisYear, { description: expectedDescription });
    event.removeAllReminders();
    if (CONFIG.useReminders) event.addPopupReminder(CONFIG.reminderMinutesBefore);
    if (CONFIG.setTransparency) event.setTransparency(CalendarApp.EventTransparency.TRANSPARENT);
    if (CONFIG.eventColor) event.setColor(CONFIG.eventColor);
    
    Logger.log(`🎁 Created ONE-TIME event: ${expectedTitle} [${birthdayDateThisYear.toDateString()}]`);
  }
  
  return eventsWereDeleted ? 'updated' : 'created';
}

/** Check if an event was created by this script */
function isEventCreatedByScript(event) {
  try {
    const description = event.getDescription();
    return description && description.includes(`[${CONFIG.scriptKey}]`);
  } catch (e) {
    return false;
  }
}

/** Check if event has expected reminder settings */
function hasCorrectReminders(event) {
  try {
    const reminders = event.getPopupReminders();
    if (!CONFIG.useReminders) {
      return reminders.length === 0;
    } else {
      return reminders.length === 1 && reminders[0] === CONFIG.reminderMinutesBefore;
    }
  } catch (e) {
    return false;
  }
}

/** Extract display name from contact object */
function getContactName(person) {
  if (person.names && person.names.length > 0) {
    return person.names[0].displayName || `${person.names[0].givenName} ${person.names[0].familyName}`.trim();
  }
  return "Unknown";
}

/** Find events matching contact name and birthday date */
function findBirthdayEvents(allEvents, contactName, month, day) {
  return allEvents.filter(ev => {
    const title = ev.getTitle();
    const d = ev.getStartTime();
    return ev.isAllDayEvent() && matchesContactName(title, contactName) && (d.getMonth() === month && d.getDate() === day);
  });
}

/** Clean up events for contacts that no longer exist in Google Contacts */
function cleanupOrphanedEvents(calendar, allEvents, allContacts) {
  const contactNames = new Set();
  for (const person of allContacts) {
    const name = getContactName(person);
    if (name && name !== "Unknown") contactNames.add(name);
  }

  const deletedSeriesIds = new Set();
  let orphansDeleted = 0;

  for (const event of allEvents) {
    if (!isEventCreatedByScript(event) || !event.isAllDayEvent()) continue;
    const title = event.getTitle();
    
    let hasMatchingContact = false;
    for (const name of contactNames) {
      if (matchesContactName(title, name)) {
        hasMatchingContact = true;
        break;
      }
    }

    if (!hasMatchingContact) {
      try {
        let isRecurring = false;
        try {
          isRecurring = event.isRecurringEvent && event.isRecurringEvent();
        } catch (e) {}

        if (isRecurring) {
          try {
            const series = event.getEventSeries();
            if (series) {
              const seriesId = series.getId();
              if (!deletedSeriesIds.has(seriesId)) {
                deletedSeriesIds.add(seriesId);
                series.deleteEventSeries();
                orphansDeleted++;
                Logger.log(`🧹 Deleted orphaned recurring series: ${title}`);
              }
            }
          } catch (e) {}
        } else {
          event.deleteEvent();
          orphansDeleted++;
          Logger.log(`🧹 Deleted orphaned event: ${title}`);
        }
      } catch (e) {
        Logger.log(`❌ Failed to delete orphaned event: ${title} - ${e}`);
      }
    }
  }
  return orphansDeleted;
}

/** Perform deep cleanup of all birthday events across configured window */
function cleanupOldBirthdayEvents(calendar, allContacts) {
  const currentYear = new Date().getFullYear();
  const startDate = new Date(currentYear - CONFIG.pastYears - 1, 0, 1);
  const endDate = new Date(currentYear + CONFIG.futureYears + 1, 11, 31);
  const allEvents = calendar.getEvents(startDate, endDate);
  
  Logger.log(`🧹 Cleanup started between: ${startDate.toDateString()} - ${endDate.toDateString()}`);

  const contactBirthdays = allContacts
    .filter(person => !(CONFIG.useLabels && !hasRequiredLabel(person, CONFIG.contactLabels)))
    .map(person => {
      if (!person.names || !person.birthdays) return null;
      const name = getContactName(person);
      const bday = person.birthdays.find(b => b.date);
      if (!bday) return null;

      return { name, day: bday.date.day, month: bday.date.month - 1 };
    })
    .filter(Boolean);

  const deletedSeriesIds = new Set();
  const eventsToDelete = [];

  for (const event of allEvents) {
    const title = event.getTitle();
    const start = event.getStartTime();
    const isAllDay = event.isAllDayEvent();
    const startsWithCakeEmoji = title.trim().startsWith('🎂');
    const isFromScript = isEventCreatedByScript(event);

    for (const contact of contactBirthdays) {
      const isNameMatch = matchesContactName(title, contact.name);
      const isBirthdayDateMatch = start.getDate() === contact.day && start.getMonth() === contact.month;
      const shouldDelete = isFromScript && ((startsWithCakeEmoji && isNameMatch) || (isAllDay && isNameMatch && isBirthdayDateMatch));

      if (!shouldDelete) continue;

      let isRecurring = false;
      try {
        isRecurring = event.isRecurringEvent && event.isRecurringEvent();
      } catch (e) {}

      if (isRecurring) {
        try {
          const series = event.getEventSeries();
          if (series) {
            const seriesId = series.getId();
            if (deletedSeriesIds.has(seriesId)) break;
            deletedSeriesIds.add(seriesId);
            eventsToDelete.push({ event: series, isSeries: true });
            break;
          }
        } catch (e) {
          Utilities.sleep(5000);
          try {
            const series = event.getEventSeries();
            if (series) {
              const seriesId = series.getId();
              if (deletedSeriesIds.has(seriesId)) break;
              deletedSeriesIds.add(seriesId);
              eventsToDelete.push({ event: series, isSeries: true });
              break;
            }
          } catch (err) {}
        }
      } else {
        eventsToDelete.push({ event, isSeries: false });
        break;
      }
    }
  }

  for (const { event, isSeries } of eventsToDelete) {
    try {
      if (isSeries) {
        event.deleteEventSeries();
      } else {
        event.deleteEvent();
      }
    } catch (e) {}
  }
}

/** Ensure time-driven trigger is set up according to configuration */
function ensureTriggerExists() {
  const triggers = ScriptApp.getProjectTriggers();
  const properties = PropertiesService.getScriptProperties();
  let existingTrigger = null;
  
  for (const trigger of triggers) {
    if (trigger.getHandlerFunction() === 'loopThroughContacts') {
      existingTrigger = trigger;
      break;
    }
  }
  
  if (existingTrigger) {
    const storedFrequency = properties.getProperty('triggerFrequency');
    const storedHour = properties.getProperty('triggerHour');
    const frequencyMatches = storedFrequency === CONFIG.triggerFrequency;
    const hourMatches = CONFIG.triggerFrequency === 'hourly' || storedHour === String(CONFIG.triggerHour);
    
    if (frequencyMatches && hourMatches) return;
    
    ScriptApp.deleteTrigger(existingTrigger);
  }

  const builder = ScriptApp.newTrigger('loopThroughContacts').timeBased();
  if (CONFIG.triggerFrequency === 'hourly') {
    builder.everyHours(1);
  } else {
    builder.everyDays(1).atHour(CONFIG.triggerHour);
  }

  builder.create();
  properties.setProperty('triggerFrequency', CONFIG.triggerFrequency);
  properties.setProperty('triggerHour', String(CONFIG.triggerHour));
}

/** Remove all project triggers for loopThroughContacts */
function removeTriggerIfExists() {
  const triggers = ScriptApp.getProjectTriggers();
  const properties = PropertiesService.getScriptProperties();
  
  for (const trigger of triggers) {
    if (trigger.getHandlerFunction() === 'loopThroughContacts') {
      ScriptApp.deleteTrigger(trigger);
    }
  }
  
  properties.deleteProperty('triggerFrequency');
  properties.deleteProperty('triggerHour');
}

/** Clean up legacy non-script birthday events matching common patterns */
function cleanupLegacyBirthdayEvents(calendar) {
  const currentYear = new Date().getFullYear();
  const startDate = new Date(currentYear - CONFIG.pastYears - 1, 0, 1);
  const endDate = new Date(currentYear + CONFIG.futureYears + 1, 11, 31);
  const allEvents = calendar.getEvents(startDate, endDate);
  
  const birthdayPatterns = [
    /'s birthday/i, /'s bday/i, /birthday of /i, /^birthday -/i, /^birthday:/i,
    /compleanno di /i, /anniversaire de /i, /geburtstag von /i, /cumpleaños de /i
  ];
  
  const deletedSeriesIds = new Set();
  for (const event of allEvents) {
    if (isEventCreatedByScript(event)) continue;
    const title = event.getTitle();
    if (!birthdayPatterns.some(pattern => pattern.test(title))) continue;
    
    try {
      let isRecurring = false;
      try {
        isRecurring = event.isRecurringEvent && event.isRecurringEvent();
      } catch (e) {}

      if (isRecurring) {
        const series = event.getEventSeries();
        if (series) {
          const seriesId = series.getId();
          if (!deletedSeriesIds.has(seriesId)) {
            deletedSeriesIds.add(seriesId);
            series.deleteEventSeries();
          }
        }
      } else {
        event.deleteEvent();
      }
    } catch (e) {}
  }
}

/** Delete all events created by this script */
function cleanupAllScriptEvents(calendar) {
  const currentYear = new Date().getFullYear();
  const startDate = new Date(currentYear - CONFIG.pastYears - 1, 0, 1);
  const endDate = new Date(currentYear + CONFIG.futureYears + 1, 11, 31);
  const allEvents = calendar.getEvents(startDate, endDate);
  const deletedSeriesIds = new Set();
  
  for (const event of allEvents) {
    if (!isEventCreatedByScript(event)) continue;
    try {
      let isRecurring = false;
      try {
        isRecurring = event.isRecurringEvent && event.isRecurringEvent();
      } catch (e) {}

      if (isRecurring) {
        const series = event.getEventSeries();
        if (series) {
          const seriesId = series.getId();
          if (!deletedSeriesIds.has(seriesId)) {
            deletedSeriesIds.add(seriesId);
            series.deleteEventSeries();
          }
        }
      } else {
        event.deleteEvent();
      }
    } catch (e) {}
  }
}