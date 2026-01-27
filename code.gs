/******************************
 * CONFIGURATION
 * Version: 1.0
 ******************************/
const CONFIG = {
  calendarId: 'primary',            // 'primary' or your calendar ID

  // Title customization
  useEmoji: true,                    // Add 🎂 emoji to event titles
  showYearOrAge: true,               // Recurrence on: shows (*YYYY), off: shows (age)
  showAgeOnRecurring: false,         // If true, shows (age) on recurring events instead of (*YYYY)
  
  // Language and localization
  language: 'en',                    // Language code: 'en' (English), 'it' (Italian), 'fr' (French), 'de' (German), 'es' (Spanish)
  titleFormat: '',                   // Title format template (see LANGUAGE_CONFIG for placeholders), e.g. {emoji}{name} ({ageOrYear})

  // Recurrence
  useRecurrence: true,               // Create recurring yearly events
  futureYears: 10,                   // Recurring events end this many years in the future
  pastYears: 1,                      // Recurring events start this many years in the past

  // Reminder settings
  useReminders: false,               // Enable/disable reminders for birthday events
  reminderMinutesBefore: 1440,       // Popup reminder time (in minutes) - only used if useReminders is true
                                     // Common values: 0 = at event time, 60 = 1 hour before, 1440 = 1 day before, 10080 = 1 week before

  // Cleanup
  monthlyCleanup: true,              // Run full cleanup on the 1st of each month (deletes & recreates all events)
  cleanupOrphans: true,              // Automatically delete birthday events for contacts that no longer exist

  // Trigger options
  useTrigger: true,                  // Automatically run on a schedule
  triggerFrequency: 'daily',         // 'daily' or 'hourly'
  triggerHour: 4,                    // If 'daily', the hour of day to run (0–23)

  // Script identification
  scriptKey: 'Auto-Birthdays',       // Unique identifier for events created by this script; customize if desired

  // Contact label filtering (optional)
  useLabels: false,                  // Enable filtering contacts by labels
  contactLabels: [],                 // Array of contact label IDs to include (e.g. ['abc123'])

  // Month filtering (optional)
  useMonthFilter: false,             // Enable filtering contacts by birth month
  filterMonths: []                   // Array of months to include (1-12), e.g. [1, 2, 4] for Jan, Feb, Apr
};

/**
 * Language configuration for localized event titles and descriptions
 */
const LANGUAGE_CONFIG = {
  en: {
    titleFormats: {
      'default': '{emoji}{name} ({ageOrYear})'
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


/**
 * Main function to create/update birthday events.
 * Also manages the optional time-based trigger.
 */
function loopThroughContacts() {
  if (CONFIG.useTrigger) {
    ensureTriggerExists();
  } else {
    removeTriggerIfExists();
  }

  const connections = getAllContacts();
  // Validate reminder configuration
  if (CONFIG.useReminders && (typeof CONFIG.reminderMinutesBefore !== 'number' || CONFIG.reminderMinutesBefore < 0)) {
    Logger.log("⚠️ Invalid reminder configuration: reminderMinutesBefore must be a non-negative number when useReminders is true.");
    return;
  }

  const calendar = CalendarApp.getCalendarById(CONFIG.calendarId);

  if (!calendar) {
    Logger.log("⚠️ Calendar not found.");
    return;
  }

  // Run monthly cleanup on the 1st of each month
  const today = new Date();
  const isFirstOfMonth = today.getDate() === 1;
  
  if (CONFIG.monthlyCleanup && isFirstOfMonth) {
    Logger.log("📅 It's the 1st of the month - running monthly cleanup...");
    cleanupOldBirthdayEvents(calendar, connections);
    Logger.log("🧹 Monthly cleanup completed! Now recreating events...");
  }

  Logger.log("📊 Starting birthday event processing...");

  const currentYear = new Date().getFullYear();
  const startDate = new Date(currentYear - CONFIG.pastYears - 1, 0, 1);
  const endDate = new Date(currentYear + CONFIG.futureYears + 1, 11, 31);
  const allEvents = calendar.getEvents(startDate, endDate);
  const eventIndex  = buildBirthdayIndex(allEvents);

  // Initialize counters for processing report
  let totalContacts = connections.length;
  let contactsWithBirthdays = 0;
  let processedContacts = 0;
  let eventsCreated = 0;
  let eventsUpdated = 0;
  let skippedByLabelFilter = 0;
  let skippedByMonthFilter = 0;
  let skippedInvalidBirthdays = 0;

  for (const person of connections) {
    // First check if contact has valid birthday data
    const birthdayData = person.birthdays?.find(b => b.date);
    if (!birthdayData) {
      continue; // No birthday data - will be counted as "without birthday" at the end
    }

    // Check if label filtering is enabled and if this contact has the required labels
    if (CONFIG.useLabels && !hasRequiredLabel(person, CONFIG.contactLabels)) {
      skippedByLabelFilter++;
      continue; // Skip this contact if it doesn't have the required labels
    }

    // Check if month filtering is enabled and if this contact's birthday month matches
    if (CONFIG.useMonthFilter && CONFIG.filterMonths.length > 0) {
      const birthMonth = birthdayData.date.month;
      if (!CONFIG.filterMonths.includes(birthMonth)) {
        skippedByMonthFilter++;
        continue; // Skip this contact if its birthday month doesn't match the filter
      }
    }

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
        // Event already exists and is correct - no action needed
      } else if (result === 'skipped_invalid') {
        skippedInvalidBirthdays++;
      }
    } catch (error) {
      const contactName = getContactName(person);
      Logger.log(`❌ Error processing ${contactName}: ${error}`);
      skippedInvalidBirthdays++;
    }
  }

  // Log processing summary report
  Logger.log("📊 PROCESSING SUMMARY REPORT:");
  Logger.log(`📞 Total contacts retrieved: ${totalContacts}`);
  Logger.log(`🎂 Contacts with birthday data: ${contactsWithBirthdays}`);
  Logger.log(`✅ Successfully processed contacts: ${processedContacts}`);
  Logger.log(`🆕 Events created: ${eventsCreated}`);
  Logger.log(`🔄 Events updated: ${eventsUpdated}`);
  
  const eventsAlreadyCorrect = processedContacts - eventsCreated - eventsUpdated;
  if (eventsAlreadyCorrect > 0) {
    Logger.log(`✓ Events already up-to-date: ${eventsAlreadyCorrect}`);
  }
  if (CONFIG.useLabels) {
    Logger.log(`🏷️ Contacts skipped by label filter: ${skippedByLabelFilter}`);
  }
  
  if (CONFIG.useMonthFilter) {
    Logger.log(`📅 Contacts skipped by month filter: ${skippedByMonthFilter}`);
  }
  
  if (skippedInvalidBirthdays > 0) {
    Logger.log(`⚠️ Contacts with invalid birthday data: ${skippedInvalidBirthdays}`);
  }
  
  const contactsWithoutBirthdays = totalContacts - contactsWithBirthdays - skippedByLabelFilter - skippedByMonthFilter;
  if (contactsWithoutBirthdays > 0) {
    Logger.log(`📝 Contacts without birthday data: ${contactsWithoutBirthdays}`);
  }
  
  // Show reminder configuration info
  if (CONFIG.useReminders) {
    const reminderText = CONFIG.reminderMinutesBefore === 0 ? "at event time" :
                        CONFIG.reminderMinutesBefore === 60 ? "1 hour before" :
                        CONFIG.reminderMinutesBefore === 1440 ? "1 day before" :
                        CONFIG.reminderMinutesBefore === 10080 ? "1 week before" :
                        `${CONFIG.reminderMinutesBefore} minutes before`;
    Logger.log(`⏰ Reminders enabled: ${reminderText}`);
  } else {
    Logger.log(`⏰ Reminders disabled`);
  }
  
  // Clean up orphaned events (from deleted contacts)
  if (CONFIG.cleanupOrphans) {
    const orphansDeleted = cleanupOrphanedEvents(calendar, allEvents, connections);
    if (orphansDeleted > 0) {
      Logger.log(`🧹 Orphaned events deleted: ${orphansDeleted}`);
    }
  }
  
  Logger.log("🎉 Processing completed successfully!");
}

/**
 * Language configuration for localized event titles and descriptions.
 * Supports: English (en), Italian (it), French (fr), German (de), Spanish (es)
 * 
 * For configuration examples and full documentation, see README.md
 */

/**
 * Generate a localized title for a birthday event
 * @param {string} contactName - The name of the person
 * @param {number|null} age - The age of the person (null if unknown)
 * @param {number|null} birthYear - The birth year (null if unknown)  
 * @param {boolean} showYear - Whether to show birth year instead of age
 * @param {boolean} isRecurring - Whether this is a recurring event
 * @returns {string} The formatted title
 */
function generateLocalizedTitle(contactName, age, birthYear, showYear, isRecurring) {
  const langConfig = LANGUAGE_CONFIG[CONFIG.language] || LANGUAGE_CONFIG['en'];
  
  // Use titleFormat if provided, otherwise fall back to language default
  const formatTemplate = CONFIG.titleFormat || langConfig.titleFormats['default'];
  
  // Build replacement values
  const emoji = CONFIG.useEmoji ? '🎂 ' : '';
  let ageOrYear = '';
  let ageText = '';
  
  if (birthYear && CONFIG.showYearOrAge) {
    if (showYear) {
      ageOrYear = `${birthYear}`;
      ageText = `${birthYear}`;
    } else if (age !== null) {
      const yearWord = age === 1 ? langConfig.terms.year : langConfig.terms.years;
      ageOrYear = age.toString();
      ageText = `${age} ${yearWord}`;
    }
  }
  
  // Replace placeholders in the format template
  let title = formatTemplate
    .replace(/{emoji}/g, emoji)
    .replace(/{name}/g, contactName)
    .replace(/{ageOrYear}/g, ageOrYear)
    .replace(/{age}/g, age ? age.toString() : '')
    .replace(/{ageText}/g, ageText)
    .replace(/{birthYear}/g, birthYear ? birthYear.toString() : '')
    .replace(/{years}/g, langConfig.terms.years)
    .replace(/{year}/g, langConfig.terms.year)
    .replace(/{birthday}/g, langConfig.terms.birthday);
  
  // Clean up empty age/year information - remove parentheses, dashes, etc. around empty values
  title = title
    .replace(/\s*\(\s*\)\s*/g, '')        // Remove empty parentheses like " () "
    .replace(/\s*\(\s*\*\s*\)\s*/g, '')   // Remove empty year parentheses like " (*) "
    .replace(/\s*-\s*\*?\s*$/g, '')       // Remove trailing " - " or " - *"
    .replace(/\s+/g, ' ');                // Clean up multiple spaces
    
  return title.trim();
}

/**
 * Generate a localized description for a birthday event
 * @param {string} contactName - The name of the person
 * @returns {string} The formatted description
 */
function generateLocalizedDescription(contactName) {
  const langConfig = LANGUAGE_CONFIG[CONFIG.language] || LANGUAGE_CONFIG['en'];
  const happyBirthdayText = langConfig.terms.happyBirthday;
  
  return `🎂 ${happyBirthdayText} ${contactName}!\n\n[${CONFIG.scriptKey}]`;
}

/**
 * Build a quick‑lookup map keying events by “title|month|day”.
 * Significantly reduces runtime from O(contacts × events) to O(contacts + events).
 * Returns arrays of events to handle duplicate keys (e.g., recurring event instances).
 */
function buildBirthdayIndex(events) {
  const map = new Map();
  for (const ev of events) {
    if (!ev.isAllDayEvent()) continue;
    const d   = ev.getStartTime();
    const key = `${ev.getTitle()}|${d.getMonth()}|${d.getDate()}`;
    if (!map.has(key)) {
      map.set(key, []);
    }
    map.get(key).push(ev);
  }
  return map;
}

/**
 * Check if a contact has any of the specified labels.
 * @param {object} person - The contact person object
 * @param {string[]} labelIds - Array of contact label IDs to check for (just the ID part, not the full resource name)
 * @returns {boolean} - True if contact has any of the specified labels
 */
function hasRequiredLabel(person, labelIds) {
  if (!labelIds || labelIds.length === 0) {
    return true; // No labels specified, so all contacts match
  }

  if (!person.memberships || person.memberships.length === 0) {
    return false; // Contact has no group memberships
  }

  // Check if any membership matches any of the specified label IDs
  for (const membership of person.memberships) {
    if (membership.contactGroupMembership && membership.contactGroupMembership.contactGroupId) {
      const contactGroupId = membership.contactGroupMembership.contactGroupId;
      
      // Check if this contactGroupId contains any of our target labels
      // contactGroupId format is typically "contactGroups/abc122"
      for (const labelId of labelIds) {
        if (contactGroupId.includes(labelId)) {
          return true;
        }
      }
    }
  }

  return false;
}

/**
 * Get all Google Contacts using pagination.
 */
function getAllContacts() {
  const connections = [];
  let nextPageToken;

  do {
    const reqOpts = {
      personFields: 'names,birthdays,memberships',
      sortOrder: 'LAST_NAME_ASCENDING',
      pageSize: 100,
      pageToken: nextPageToken
    };

    const response = People.People.Connections.list('people/me', reqOpts);
    connections.push(...(response.connections || []));
    nextPageToken = response.nextPageToken;
  } while (nextPageToken);

  return connections;
}

/**
 * Create or update a calendar event for a contact's birthday.
 * @returns {string} - Operation result: 'created', 'updated', 'skipped_existing', or 'skipped_invalid'
 */
function updateOrCreateBirthDayEvent(person, birthdayRaw, calendar, allEvents, eventIndex) {
  const contactName = getContactName(person);

  // Extract actual date from birthday object
  const birthdayDate = birthdayRaw.date;
  if (!birthdayDate || typeof birthdayDate.day !== 'number' || typeof birthdayDate.month !== 'number') {
    Logger.log(`⚠️ Skipping ${contactName} due to invalid birthdayDate: ${JSON.stringify(birthdayRaw)}`);
    return 'skipped_invalid';
  }

  const currentYear = new Date().getFullYear();
  const startYear = currentYear - CONFIG.pastYears;

  const month = parseInt(birthdayDate.month, 10) - 1;
  const day = parseInt(birthdayDate.day, 10);

  const birthdayStartDate = new Date(startYear, month, day);
  const birthdayDateThisYear = new Date(currentYear, month, day);

  if (isNaN(birthdayStartDate.getTime()) || isNaN(birthdayDateThisYear.getTime())) {
    Logger.log(`⚠️ Invalid date for ${contactName}: ${birthdayDate.month}-${birthdayDate.day}`);
    return 'skipped_invalid';
  }
  
  // Build expected title using localized function
  const age = birthdayDate.year ? currentYear - birthdayDate.year : null;
  const showYear = CONFIG.useRecurrence && !CONFIG.showAgeOnRecurring;
  const expectedTitle = generateLocalizedTitle(
    contactName,
    age,
    birthdayDate.year,
    showYear,
    CONFIG.useRecurrence
  );

  // Generate expected description using localized function
  const expectedDescription = generateLocalizedDescription(contactName);

  // FAST existence check
  const key = `${expectedTitle}|${month}|${day}`;
  const existingEvents = eventIndex.get(key) || [];
  const existingQuick = existingEvents[0]; // Get first matching event
  
  // For individual age events, we need to check differently
  const usingIndividualEvents = CONFIG.useRecurrence && CONFIG.showAgeOnRecurring && birthdayDate.year;
  
  if (!usingIndividualEvents && existingQuick &&
      existingQuick.isAllDayEvent() &&
      isEventCreatedByScript(existingQuick) &&
      (CONFIG.useRecurrence === (existingQuick.isRecurringEvent && existingQuick.isRecurringEvent())) &&
      (existingQuick.getDescription() || '') === expectedDescription &&
      hasCorrectReminders(existingQuick)) {
    return 'skipped_existing'; // Event already exists and is correct
  }

  // Find and update related events
  const relatedEvents = findBirthdayEvents(allEvents, contactName, month, day);
  const deletedSeriesIds = new Set();
  let correctEventExists = false;
  let eventsWereDeleted = false;

  for (const event of relatedEvents) {
    const title = event.getTitle();
    let description;
    try {
      description = event.getDescription() || '';
    } catch (e) {
      description = '';
    }
    
    // For individual age events, generate the expected title for the event's specific year
    let eventExpectedTitle = expectedTitle;
    if (usingIndividualEvents) {
      const eventYear = event.getStartTime().getFullYear();
      const eventAge = birthdayDate.year ? eventYear - birthdayDate.year : null;
      eventExpectedTitle = generateLocalizedTitle(
        contactName,
        eventAge,
        birthdayDate.year,
        false, // Always show age for individual events
        false  // Individual events are not recurring
      );
    }
    
    const isTitleOutdated = title !== eventExpectedTitle;
    const isDescriptionOutdated = description !== expectedDescription;
    const isNotAllDay = !event.isAllDayEvent();
    const isRecurrenceMismatch = CONFIG.useRecurrence !== (event.isRecurringEvent && event.isRecurringEvent());
    const isNotFromScript = !isEventCreatedByScript(event);
    const hasIncorrectReminders = !hasCorrectReminders(event);

    // When using individual events for age display, we need to delete any existing recurring events
    const needsConversionToIndividual = usingIndividualEvents && event.isRecurringEvent && event.isRecurringEvent();

    if (isTitleOutdated || isDescriptionOutdated || isNotAllDay || isRecurrenceMismatch || isNotFromScript || hasIncorrectReminders || needsConversionToIndividual) {
      eventsWereDeleted = true;
      try {
        if (event.isRecurringEvent && event.isRecurringEvent()) {
          const series = event.getEventSeries();
          const seriesId = series.getId();
          if (deletedSeriesIds.has(seriesId)) {
            continue;
          }
          deletedSeriesIds.add(seriesId);
          series.deleteEventSeries();
          Logger.log(`🗑️ Deleted outdated recurring series: ${title}`);
        } else {
          event.deleteEvent();
          Logger.log(`🗑️ Deleted outdated event: ${title}`);
        }
      } catch (e) {
        Logger.log(`❌ Error deleting event: ${title} → ${e}`);
      }
    } else {
      correctEventExists = true;
    }
  }

  if (correctEventExists) {
    return 'skipped_existing'; // Correct event already exists
  }

  // For individual age events, check if all years already exist
  if (usingIndividualEvents) {
    let allYearsExist = true;
    for (let year = startYear; year <= currentYear + CONFIG.futureYears; year++) {
      const yearAge = year - birthdayDate.year;
      
      // Generate title for this specific year using localized function
      const yearTitle = generateLocalizedTitle(
        contactName,
        yearAge,
        birthdayDate.year,
        false, // Always show age for individual events
        false  // Individual events are not recurring
      );
      
      const yearKey = `${yearTitle}|${month}|${day}`;
      const yearEvents = eventIndex.get(yearKey) || [];
      const yearEvent = yearEvents[0]; // Get first matching event
      if (!yearEvent || !isEventCreatedByScript(yearEvent) || (yearEvent.getDescription() || '') !== expectedDescription || !hasCorrectReminders(yearEvent)) {
        allYearsExist = false;
        break;
      }
    }
    
    if (allYearsExist) {
      return 'skipped_existing'; // All individual events already exist
    }
  }

  // Create events - individual yearly events if showing age on recurring, otherwise use recurrence
  if (CONFIG.useRecurrence && CONFIG.showAgeOnRecurring && birthdayDate.year) {
    // Create individual events for each year to show correct age
    for (let year = startYear; year <= currentYear + CONFIG.futureYears; year++) {
      const yearAge = year - birthdayDate.year;
      const yearBirthdayDate = new Date(year, month, day);
      
      // Build title with age for this specific year using localized function
      const yearTitle = generateLocalizedTitle(
        contactName,
        yearAge,
        birthdayDate.year,
        false, // Always show age for individual events
        false  // Individual events are not recurring
      );
      
      const event = calendar.createAllDayEvent(
        yearTitle,
        yearBirthdayDate,
        { description: expectedDescription }
      );
      event.removeAllReminders();
      if (CONFIG.useReminders) {
        event.addPopupReminder(CONFIG.reminderMinutesBefore);
      }
      Logger.log(`🎁 Created individual event: ${yearTitle} [${yearBirthdayDate.toDateString()}]`);
    }
  } else if (CONFIG.useRecurrence) {
    // Create standard recurring event
    const recurrence = CalendarApp.newRecurrence()
      .addYearlyRule()
      .until(new Date(currentYear + CONFIG.futureYears, 11, 31));

    const eventSeries = calendar.createAllDayEventSeries(
      expectedTitle,
      birthdayStartDate,
      recurrence,
      { description: expectedDescription }
    );
    eventSeries.removeAllReminders();
    if (CONFIG.useReminders) {
      eventSeries.addPopupReminder(CONFIG.reminderMinutesBefore);
    }
    Logger.log(`🎉 Created RECURRING event: ${expectedTitle} [starts ${birthdayStartDate.toDateString()}]`);
  } else {
    // Create single event for this year
    const event = calendar.createAllDayEvent(
      expectedTitle,
      birthdayDateThisYear,
      { description: expectedDescription }
    );
    event.removeAllReminders();
    if (CONFIG.useReminders) {
      event.addPopupReminder(CONFIG.reminderMinutesBefore);
    }
    Logger.log(`🎁 Created ONE-TIME event: ${expectedTitle} [${birthdayDateThisYear.toDateString()}]`);
  }
  
  return eventsWereDeleted ? 'updated' : 'created'; // Successfully processed the birthday event
}

/**
 * Check if an event was created by this script by looking for the script key in description.
 */
function isEventCreatedByScript(event) {
  try {
    const description = event.getDescription();
    return description && description.includes(`[${CONFIG.scriptKey}]`);
  } catch (e) {
    return false;
  }
}

/**
 * Check if an event has the correct reminder settings according to current configuration.
 * @param {CalendarEvent} event - The calendar event to check
 * @returns {boolean} - True if reminders match current CONFIG settings
 */
function hasCorrectReminders(event) {
  try {
    const reminders = event.getPopupReminders();
    
    if (!CONFIG.useReminders) {
      // If reminders are disabled, event should have no reminders
      return reminders.length === 0;
    } else {
      // If reminders are enabled, event should have exactly one reminder with correct timing
      return reminders.length === 1 && reminders[0] === CONFIG.reminderMinutesBefore;
    }
  } catch (e) {
    // If we can't get reminders info, assume it's incorrect to be safe
    return false;
  }
}

/**
 * Extract name from contact.
 */
function getContactName(person) {
  if (person.names && person.names.length > 0) {
    return person.names[0].displayName ||
      `${person.names[0].givenName} ${person.names[0].familyName}`.trim();
  }
  return "Unknown";
}

/**
 * Check if birthday event already exists.
 */
function findBirthdayEvents(allEvents, contactName, month, day) {
  return allEvents.filter(ev => {
    const title = ev.getTitle();
    const d     = ev.getStartTime();
    return ev.isAllDayEvent() &&
           (title.includes(contactName) && (d.getMonth() === month && d.getDate() === day));
  });
}

/**
 * Clean up orphaned birthday events - events created by this script
 * that no longer match any existing contact.
 * @param {Calendar} calendar - The calendar to clean
 * @param {CalendarEvent[]} allEvents - All events in the date range
 * @param {object[]} allContacts - All contacts from Google Contacts
 * @returns {number} - Number of orphaned events deleted
 */
function cleanupOrphanedEvents(calendar, allEvents, allContacts) {
  // Build a set of all contact names for fast lookup
  const contactNames = new Set();
  for (const person of allContacts) {
    const name = getContactName(person);
    if (name && name !== "Unknown") {
      contactNames.add(name);
    }
  }

  const deletedSeriesIds = new Set();
  let orphansDeleted = 0;

  for (const event of allEvents) {
    // Only check events created by this script
    if (!isEventCreatedByScript(event)) continue;
    if (!event.isAllDayEvent()) continue;

    const title = event.getTitle();
    
    // Check if any contact name is found in the event title
    let hasMatchingContact = false;
    for (const name of contactNames) {
      if (title.includes(name)) {
        hasMatchingContact = true;
        break;
      }
    }

    // If no matching contact found, this is an orphaned event
    if (!hasMatchingContact) {
      try {
        if (event.isRecurringEvent && event.isRecurringEvent()) {
          const series = event.getEventSeries();
          const seriesId = series.getId();
          if (!deletedSeriesIds.has(seriesId)) {
            deletedSeriesIds.add(seriesId);
            series.deleteEventSeries();
            orphansDeleted++;
            Logger.log(`🧹 Deleted orphaned recurring series: ${title}`);
          }
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

/**
 * Cleans birthdayEvents in the future and past 100 years
 */
function cleanupOldBirthdayEvents(calendar, allContacts) {
  const currentYear = new Date().getFullYear();
  const startYear = currentYear - 100;
  const endYear = currentYear + 100;

  const startDate = new Date(startYear, 0, 1);
  const endDate = new Date(endYear, 11, 31);
  const allEvents = calendar.getEvents(startDate, endDate);
  
  Logger.log(`🧹 Cleanup started between: ${startDate.toDateString()} - ${endDate.toDateString()}`);

  // Initialize cleanup counters
  let totalEventsScanned = allEvents.length;
  let candidateEventsFound = 0;
  let recurringSeriesDeleted = 0;
  let singleEventsDeleted = 0;
  let deleteFailures = 0;
  let retryAttempts = 0;
  let retrySuccesses = 0;

  // Collect valid contacts with birthday info
  const contactBirthdays = allContacts
    .filter(person => {
      // Apply label filtering if enabled
      if (CONFIG.useLabels && !hasRequiredLabel(person, CONFIG.contactLabels)) {
        return false;
      }
      return true;
    })
    .map(person => {
      if (!person.names || !person.birthdays) return null;
      const name = getContactName(person);
      const bday = person.birthdays.find(b => b.date);
      if (!bday) return null;

      return {
        name,
        day: bday.date.day,
        month: bday.date.month - 1,
      };
    })
    .filter(Boolean); // remove nulls

  const deletedSeriesIds = new Set();
  const eventsToDelete = [];

  // Phase 1: Scan events and mark candidates for deletion
  Logger.log(`🔍 Scanning ${allEvents.length} events to identify birthday events for cleanup...`);

  for (const event of allEvents) {
    const title = event.getTitle();
    const start = event.getStartTime();
    const isAllDay = event.isAllDayEvent();
    const startsWithCakeEmoji = title.trim().startsWith('🎂');
    const isFromScript = isEventCreatedByScript(event);

    for (const contact of contactBirthdays) {
      const isNameMatch = title.includes(contact.name);
      const isBirthdayDateMatch =
        start.getDate() === contact.day &&
        start.getMonth() === contact.month;

      const shouldDelete =
        isFromScript && // Only delete events created by this script
        ((startsWithCakeEmoji && isNameMatch) ||
         (isAllDay && isNameMatch && isBirthdayDateMatch));

      if (!shouldDelete) continue;

      candidateEventsFound++;

      // Check if it's a recurring event and already handled
      if (event.isRecurringEvent && event.isRecurringEvent()) {
        try {
          const series = event.getEventSeries();
          const seriesId = series.getId();
          if (deletedSeriesIds.has(seriesId)) {
            break;
          }
          deletedSeriesIds.add(seriesId);
          eventsToDelete.push({ event: series, isSeries: true });
          Logger.log(`📋 Marked recurring series for deletion: ${title}`);
          break;
        } catch (e) {
          retryAttempts++;
          Logger.log(`⚠️ Failed to resolve recurring series: ${title} — ${e}`);
          Logger.log(`⚠️ Waiting for rate limiter and safely retrying`);
          Utilities.sleep(5000);
          try {
            const series = event.getEventSeries();
            const seriesId = series.getId();
            if (deletedSeriesIds.has(seriesId)) {
              retrySuccesses++;
              Logger.log(`✅ Retry successful - series marked for deletion: ${title}`);
              break;
            }
            deletedSeriesIds.add(seriesId);
            eventsToDelete.push({ event: series, isSeries: true });
            retrySuccesses++;
            Logger.log(`✅ Retry successful - marked recurring series for deletion: ${title}`);
            break;
          } catch (e) {
            Logger.log(`⚠️ Second attempt failed — skipping entry: ${e}`);
          }
        }
      } else {
        eventsToDelete.push({ event, isSeries: false });
        Logger.log(`📋 Marked single event for deletion: ${title} on ${event.getStartTime().toDateString()}`);
        break;
      }
    }
  }

  // Phase 2: Execute deletions for all marked events
  Logger.log(`🗑️ Starting deletion of ${eventsToDelete.length} marked events (${deletedSeriesIds.size} recurring series, ${eventsToDelete.length - deletedSeriesIds.size} single events)`);
  
  for (const { event, isSeries } of eventsToDelete) {
    // Store event info before deletion to avoid accessing deleted event
    const eventTitle = event.getTitle();
    const eventDate = isSeries ? null : event.getStartTime();
    try {
      if (isSeries) {
        event.deleteEventSeries(); // Deletes the entire series
        recurringSeriesDeleted++;
        Logger.log(`🧹 Deleted recurring series → ${eventTitle}`);
      } else {
        event.deleteEvent();
        singleEventsDeleted++;
        Logger.log(`🧹 Deleted single event → ${eventTitle} on ${eventDate.toDateString()}`);
      }
    } catch (e) {
      deleteFailures++;
      Logger.log(`❌ Failed to delete event → ${eventTitle} | Reason: ${e}`);
    }
  }

  // Log comprehensive cleanup summary report
  Logger.log("🧹 CLEANUP SUMMARY REPORT:");
  Logger.log(`📅 Events scanned in date range: ${totalEventsScanned}`);
  Logger.log(`🎯 Birthday events found for cleanup: ${candidateEventsFound}`);
  Logger.log(`🔄 Recurring series deleted: ${recurringSeriesDeleted}`);
  Logger.log(`📅 Single events deleted: ${singleEventsDeleted}`);
  
  const totalSuccessfulDeletions = recurringSeriesDeleted + singleEventsDeleted;
  Logger.log(`✅ Total successful deletions: ${totalSuccessfulDeletions}`);
  
  if (deleteFailures > 0) {
    Logger.log(`❌ Failed deletions: ${deleteFailures}`);
  }
  
  if (retryAttempts > 0) {
    Logger.log(`🔄 Retry attempts made: ${retryAttempts}`);
    Logger.log(`✅ Successful retries: ${retrySuccesses}`);
  }
  
  Logger.log(`👥 Contacts with birthdays considered: ${contactBirthdays.length}`);
  Logger.log("🎉 Cleanup completed successfully!");
}

/**
 * Ensure a correct time-based trigger exists for loopThroughContacts.
 * Uses PropertiesService to track current trigger configuration and only
 * recreates the trigger when the configuration actually changes.
 */
function ensureTriggerExists() {
  const props = PropertiesService.getScriptProperties();
  const currentConfig = JSON.stringify({
    frequency: CONFIG.triggerFrequency,
    hour: CONFIG.triggerHour
  });
  const savedConfig = props.getProperty('triggerConfig');
  
  // Check if a trigger already exists
  const triggers = ScriptApp.getProjectTriggers();
  let existingTrigger = null;
  for (const trigger of triggers) {
    if (trigger.getHandlerFunction() === 'loopThroughContacts') {
      existingTrigger = trigger;
      break;
    }
  }
  
  // If trigger exists and config hasn't changed, do nothing
  if (existingTrigger && savedConfig === currentConfig) {
    Logger.log("✅ Trigger already exists with correct configuration");
    return;
  }
  
  // Config changed or no trigger exists - recreate
  if (existingTrigger) {
    ScriptApp.deleteTrigger(existingTrigger);
    Logger.log("🗑️ Removed trigger with outdated configuration");
  }
  
  const builder = ScriptApp.newTrigger('loopThroughContacts').timeBased();
  if (CONFIG.triggerFrequency === 'hourly') {
    builder.everyHours(1);
    Logger.log("✅ Created hourly trigger");
  } else {
    builder.everyDays(1).atHour(CONFIG.triggerHour);
    Logger.log(`✅ Created daily trigger at ${CONFIG.triggerHour}:00`);
  }
  builder.create();
  
  // Save the current configuration
  props.setProperty('triggerConfig', currentConfig);
}

/**
 * Remove time-based trigger if disabled in config.
 */
function removeTriggerIfExists() {
  const triggers = ScriptApp.getProjectTriggers();
  for (const trigger of triggers) {
    if (trigger.getHandlerFunction() === 'loopThroughContacts') {
      ScriptApp.deleteTrigger(trigger);
      Logger.log("🗑️ Removed existing trigger");
    }
  }
}