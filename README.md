# Care@Sanrc

Build a responsive web application called "POC Rounding Portal" designed for nursing homes and assisted living facilities. The portal should work on tablets, smartphones, and desktop computers.

Objective

The purpose of this application is to ensure that CNAs and caregivers physically complete resident rounding at required intervals and to provide administrators with accurate, time-stamped reports.

User Roles

1. Administrator

The Administrator should be able to:

Log in securely.

Create and manage staff accounts.

Assign usernames and passwords.

Reset staff passwords.

Add, edit, or deactivate employees.

Create facilities, units, and floors.

Add resident rooms (e.g., Room 101, Room 102, Room 103).

Generate a unique QR code for each room automatically.

Download and print QR codes.

Assign rounding schedules.

Configure shift times.

Configure rounding frequency (default: every 2 hours).

Configure grace periods (default: 20 minutes).

View live rounding status.

View reports and analytics.

Export reports to PDF and Excel.

2. Staff (CNA/Caregiver)

Staff should be able to:

Log in securely.

View their assigned tasks.

View current shift tasks.

See which tasks are:

Pending

Completed

Overdue

Open a task.

Use the device camera to scan QR codes.

Receive immediate confirmation after successful completion.

Rounding Workflow

Example:

Shift starts at 10:00 PM.

The system automatically creates rounding tasks.

Example schedule:

11:00 PM
1:00 AM
3:00 AM
5:00 AM
7:00 AM

Each task becomes active only at its scheduled time.

Each task remains available for completion for 20 minutes.

Example:

11:00 PM round:

Opens at 11:00 PM.

Expires at 11:20 PM.

If completed:
Status = Completed.

If not completed:
Status = Overdue.

QR Code Requirements

Every room must have a unique QR code.

Examples:

Room 101 QR

Room 102 QR

Room 103 QR

QR codes should contain encrypted identifiers rather than plain room numbers.

When scanned:

The system should validate that:

The QR code matches the assigned room.

The task is currently active.

The staff member is authenticated.

The scan occurs within the allowed completion window.

If validation passes:

Display:

"Round Completed Successfully"

Capture:

Employee name

Employee ID

Room number

Date

Exact timestamp

Shift

Device used

Save the record permanently.

Anti-Cheating Rules

This is the most important requirement.

Staff must NOT be able to:

Scan all rooms at once.

Complete future tasks early.

Scan the same room repeatedly to satisfy future rounds.

Backdate rounds.

Edit timestamps.

Rules:

If Room 101 is scanned at 11:05 PM:

The 11:00 PM task becomes Completed.

The same QR code CANNOT satisfy:

1:00 AM round,

3:00 AM round,

or any future round.

The next valid scan for Room 101 can only occur when the next scheduled task opens.

Example:

11:00 PM round completed.

Next valid scan allowed:

1:00 AM–1:20 AM.

Any attempt before 1:00 AM should display:

"Next round is not due yet."

If attempted after 1:20 AM:

Display:

"This task window has expired."

Dashboard

Administrator Dashboard:

Display:

Total rounds due today.

Completed rounds.

Missed rounds.

Late rounds.

Compliance percentage.

Real-time floor status.

Rooms currently overdue.

Employee performance summaries.

Reporting

Generate reports by:

Employee.

Floor.

Unit.

Room.

Date range.

Shift.

Reports should include:

Employee Name
Employee ID
Room Number
Scheduled Time
Completion Time
Status
Late Minutes

Allow export to:

PDF

Excel (CSV/XLSX)

Notifications

Optional:

Send notifications for:

Upcoming rounds.

Missed rounds.

Overdue rounds.

Notifications may be:

In-app.

Push notifications.

Email.

Technical Requirements

Use:

Frontend:

React

TypeScript

Tailwind CSS

Backend:

Supabase

Authentication:

Supabase Auth

Database:
Tables for:

Users

Facilities

Floors

Rooms

QR Codes

Shifts

Tasks

Scan Logs

Reports

QR Scanner:
Use the device camera.

The application must be mobile-first because CNAs will primarily use tablets and smartphones.

User Experience

The interface should be extremely simple.

Staff workflow should be:

Login →
See active tasks →
Select task →
Scan QR code →
Receive "Completed" confirmation →
Return to dashboard.

The entire process should take less than 10 seconds.

Future Enhancements

Design the system so future versions can support:

NFC tags.

Fingerprint authentication.

Facial recognition.

Integration with nurse call systems.

Integration with electronic health records (EHR).

Multi-facility support.

SMS notifications.

The goal is to create a simple, reliable, anti-cheating rounding solution that ensures caregivers physically visit resident rooms while minimizing documentation burden and providing administrators with complete compliance reporting.

This project was built with [Lovable](https://lovable.dev).

**Live app**: https://caresanrc.lovable.app

## Build with Lovable

Continue developing this project in the [Lovable editor](https://lovable.dev/projects/3c3bc801-d7ad-4c44-a35f-62474f4093e3).

- **Ship faster**: describe what you want to build and Lovable handles the code.
- **Stay in sync**: every change made in Lovable is committed straight to this repository.
- **Full ownership**: this code is yours. Push to `main` on GitHub and your changes sync back into Lovable, ready for your next prompt.

## Development

Prefer working locally? You need Node.js and npm — [install with nvm](https://github.com/nvm-sh/nvm#installing-and-updating).

```sh
git clone <this-repository-url>
cd <repository-name>
npm i
npm run dev
```
