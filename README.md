# 🎉 Auto-Birthdays

An automated **Google Apps Script** that syncs birthday entries from **Google Contacts** to **Google Calendar** with full customization over event titles, colors, reminders, language localization, and cleanup routines.

---

## 🚀 Getting Started

This project uses **Google Apps Script** and the **Google People API**.

1. Open [Google Apps Script](https://script.google.com/) and click **New Project**.
2. Paste the contents of your customized script (`code.gs`) into the editor.
3. In the left sidebar under **Services**, click **+ Add a service**, search for **Google People API**, and add it.
4. Customize the `CONFIG` object at the top of the script according to your preferences.
5. Select and run `loopThroughContacts()` manually once to:
   - Grant necessary Calendar and Contacts permissions.
   - Sync contact birthdays into your designated calendar.
   - Install a recurring time-driven trigger automatically (if `useTrigger: true`).

> **⚠️ DATA-LOSS & SAFETY WARNING**  
> To keep your calendar clean, the script updates and removes outdated or orphaned birthday events.  
> **Recommended Best Practices:**
> 1. **Use a dedicated calendar:** Create a new Google Calendar (e.g., named *"Birthdays"*) and set `calendarId` to its calendar ID or primary email.
> 2. **Review Cleanup Flags:** Keep `manualCleanup` and `firstRunCleanup` set to `false` during normal operation. Only toggle them to `true` when explicitly performing a one-time wipe.
> 3. **Recovery:** If an event is deleted accidentally, it can be restored from **Google Calendar Trash/Bin** within 30 days.

---

## ⚙️ Configuration Reference

The `CONFIG` object at the top of the script gives you complete control over formatting, calendar visibility, notifications, and filters.

---

## 🎨 Event Color Options

Customize event appearance using standard Google Calendar color IDs:

| Color Code | Color Name | Hex Code | Visual Style |
| :---: | :---: | :---: | :---: |
| `'1'` | Lavender | `#a4bdfc` | Light Purple |
| `'2'` | Sage | `#7ae7bf` | Soft Mint Green |
| `'3'` | Grape | `#dbadff` | Purple |
| `'4'` | Flamingo | `#ff887c` | Pastel Pink |
| `'5'` | Banana | `#fbd75b` | Bright Yellow |
| `'6'` | Tangerine | `#ffb878` | Orange |
| `'7'` | Peacock | `#46d6db` | Cyan / Teal |
| `'8'` | Graphite | `#e1e1e1` | Charcoal Gray |
| `'9'` | Blueberry | `#5484ed` | Royal Blue |
| `'10'` | Basil | `#51b749` | Forest Green |
| `'11'` | Tomato | `#dc2127` | Vivid Red |
| `''` / `null` | Default | - | Inherits calendar color |

> **Tip:** If you change `eventColor` or `setTransparency` and want to update existing calendar entries immediately, set `manualCleanup: true`, run the script once to clear previous events, then change it back to `false` and run again.

---

## 🔔 Reminder Notifications

Control popup reminders for upcoming birthdays:

| Setting | Type | Description | Default |
| :--- | :--- | :--- | :--- |
| `useReminders` | `boolean` | Set to `true` to attach popup reminders to created events | `false` |
| `reminderMinutesBefore` | `number` | Minutes before midnight when reminder triggers | `1440` (24 hrs) |

**Common Lead-Time Values:**
- `0` – At midnight on event start
- `60` – 1 hour before (11:00 PM previous evening)
- `1440` – 1 day before (24 hours)
- `10080` – 1 week before (7 days)

---

## 🌍 Language & Localized Titles

The script built-in engines format titles and terms across multiple languages:

Supported Codes: `'en'` (English), `'it'` (Italian), `'fr'` (French), `'de'` (German), `'es'` (Spanish).

### Available Custom Placeholders

If you define a custom `titleFormat` template, you can use any of these placeholders:

| Placeholder | Meaning | Sample Output |
| :--- | :--- | :--- |
| `{emoji}` | Birthday emoji (`🎂 `) if enabled | `🎂 ` |
| `{name}` | Contact's full display name | `John Doe` |
| `{age}` | Calculated current age | `36` |
| `{ageOrYear}` | Year (`*1988`) or age (`36`) per settings | `36` or `*1988` |
| `{ageText}` | Age paired with localized unit | `36 years` / `36 anni` |
| `{birthYear}` | Year of birth | `1988` |
| `{birthday}` | Localized word for "birthday" | `birthday` / `compleanno` |
| `{years}` | Localized plural unit for "years" | `years` / `anni` |
| `{year}` | Localized singular unit for "year" | `year` / `anno` |

---

## 🏷️ Filters (Labels & Birth Months)

### Contact Label Filtering (`useLabels`)
Limit processing to specific contact labels (e.g., *Family*, *Close Friends*):
1. Open [Google Contacts](https://contacts.google.com/).
2. Select a label on the left sidebar.
3. Copy the label ID from the browser URL (`https://contacts.google.com/label/[LABEL_ID]`).
4. Set `useLabels: true` and add the string to `contactLabels: ['LABEL_ID']`.

### Month Filtering (`useMonthFilter`)
Process contacts by birth month (1–12) to reduce execution time on large address books:
```javascript
useMonthFilter: true,
filterMonths: [1, 2, 3] // Only process birthdays in Jan, Feb, Mar (Q1)
```

---

## 🧹 Cleanup Mechanisms

| Flag | Trigger / Frequency | Behavior |
| :--- | :--- | :--- |
| `firstRunCleanup` | One-time manual run | Scans and deletes legacy non-script birthday entries (e.g. matching *"John's Birthday"* patterns) |
| `manualCleanup` | One-time manual run | Wipes **all** events generated by this script across a 200-year window |
| `monthlyCleanup` | 1st day of every month | Automatically clears and regenerates all script events to ensure clean state and update ages |
| `cleanupOrphans` | Every execution | Removes script events for contacts who no longer exist in your Google Contacts |

---

## 🔑 Script Safety & Event Tracking

To prevent touching manual calendar entries or other events:
- Every event created embeds `[Auto-Birthdays]` (or your configured `scriptKey`) in its description field.
- Script routines verify this tag prior to updating, replacing, or deleting any entry.
- Manual calendar entries remain untouched.

---

## ⏰ Trigger Automation

When `useTrigger: true` is configured:
- The script automatically provisions a project time-driven trigger.
- If you update `triggerFrequency` (`'daily'` vs `'hourly'`) or `triggerHour`, the script detects the change, cleans up former triggers, and installs the updated schedule without manual configuration.