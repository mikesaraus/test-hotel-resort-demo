# Camsair Resort PMS — roadmap

The mockup (this repo) is a clickable design with no backend: data is saved in the browser, logins are pretend
("Sign in as", PIN 1234) and payments, messages and reports are not really sent. It shows how the system works.
This file lists what the real build still needs.

## In the mockup today

| Area | What it covers |
|---|---|
| Front office | Front desk (arrivals, in house, departures, alerts), reservations, availability by room type, Messenger quote, group bookings with one bill or separate bills, room calendar, arrivals list to print |
| Guests | Guest list, profiles with stay history and spend, preferences and notes, duplicate detection and merge, message templates (confirmation, deposit reminder, before arrival, thank you) |
| Stays and money | Registration card with ID and privacy consent, room moves, date and rate changes, nightly room charges, void / move / refund with supervisor PIN, split payments, check-out only after payment, guest statement |
| Day pass | Counter sales of entrance, cottages and rentals (guest count checked against cottage size). Overnight guests get in free, pay regular cottage price unless a voucher or approved discount is used, green wristbands; cottages can be reserved ahead and linked to a room booking with senior / PWD rules, GCash / Maya references, change, wristbands; cottages and pavilion reserved in advance with deposit and food packages; deposit taken off on arrival |
| Cashier | Shifts, cash count, X / Z reading, receipt register in number order |
| Rooms | Property map and housekeeping board (occupied / vacant kept apart from dirty / clean / inspected), out of order, Undo for quick mistakes. Managers edit buildings, map layout, rooms, room types, cottages and entrance fees in Settings |
| Tasks | Guest requests and repairs with any status change, waiting-on-parts with an expected date, overdue flags, history and updates |
| Management | Night audit and business date, reports (business health, daily manager report, revenue, day tour, operations), settings, roles and permissions, audit log. Staff roster is built but switched off (Settings → Modules) |
| Add-ons | Restaurant & bar point of sale, activities & spa, guest app (switch on in Settings → Modules) |

## For the real build

### Should have
1. **Direct booking page** with GCash / Maya / card deposits through a payment gateway (PayMongo or Xendit). Biggest money lever: every booking moved off Agoda / Booking.com keeps about 15% more.
2. **Channel manager connection** (Agoda, Booking.com) so availability and rates stay in sync both ways. Brings back "close a night on booking sites" (stop-sell).
3. **Works offline** at the front desk and sales counters, and syncs when the internet is back.
4. **Accounting export** (QuickBooks, Xero or Excel).
5. **Company accounts (city ledger)**: companies that pay later by invoice, with unpaid amounts by age.
6. **Rate plans and packages**: room only vs with breakfast, weekend minimum stay, promo codes; senior / PWD discount on room bills.
7. **Automatic guest messages** by SMS / Messenger / email using the templates in the mockup.
8. **Stock** for the restaurant, bar and minibar.
9. **Lost and found** and **linen count** for housekeeping.
10. **Guest feedback** (1–5 rating after check-out) shown in Reports.

### Could have
11. **Price suggestions** from booking pace (e.g. "Saturday is filling up, raise the Deluxe rate?").
12. **Repeat-guest perks** (loyalty).
13. **Online check-in or a self check-in kiosk** that fills in the registration card before arrival.
14. **More than one property.**

### Needed for the real build in any case
- Real accounts and sign-in (own password and PIN, invite by email), sessions and lockout.
- A server and database with backups; the audit log stored where it can't be edited.
- Data Privacy Act: privacy notice, consent records, ID retention period, access logs, NPC registration if required.
- Printing to the receipt printer and key card encoder.
- Real report delivery (email / SMS) at the time set in Settings.
